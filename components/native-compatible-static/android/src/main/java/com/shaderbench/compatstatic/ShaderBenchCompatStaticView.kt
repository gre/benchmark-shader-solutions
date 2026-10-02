package com.shaderbench.compatstatic

import android.content.Context
import android.graphics.SurfaceTexture
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLSurface
import android.opengl.GLES20
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.view.Choreographer
import android.view.TextureView
import android.view.View
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * <ShaderBenchCompatStaticView> on Android: OpenGL ES 2.0, Android 7.1+ (API 25).
 *
 * A TextureView rendered by its own "SBStaticGL" thread (Looper +
 * Choreographer) that owns an EGL14 context (ES 2.0) and a window surface on
 * the view's SurfaceTexture. One fullscreen triangle with the GLSL ES 1.00
 * fragment shader loaded from the asset shader-bench-compat-static/<shader>.glsl
 * (packaged by android/build.gradle from the web's source; read once per
 * process and shader name). Zero JS per frame.
 *
 * - Why TextureView (not GLSurfaceView / SurfaceView): it composes like any
 *   view (opacity, transforms, clipping, z-order between several instances
 *   stacked in RN), and it is what @shader-bench/native's AGSL view uses, so
 *   both are compared on the same composition path.
 * - Uniforms: resolution (buffer px), phase (fract(t / periods[i]) in double,
 *   cast to float), params (vec4[4] = MAX_PARAMS floats, src/registry.ts).
 * - Precision: `precision highp float` is kept when the GPU supports highp in
 *   fragment shaders (glGetShaderPrecisionFormat; GLES 2.0 makes it
 *   optional), else it is rewritten to mediump with a logcat warning.
 * - Clock: elapsed += dt * speed (double). speed 0: frozen, redraws only on
 *   prop / size / surface changes.
 * - Pixel-ratio cap 2: buffer = view px * min(1, 2 / density), upscaled by
 *   the compositor.
 * - Lifecycle: rendering stops while the window is not visible (app in
 *   background) and resumes after; a lost EGL context (EGL_CONTEXT_LOST) or a
 *   bad surface is recreated on the next frame. A `shader` change rebuilds
 *   the program.
 * - Missing asset or a compile / link error: solid #1b1a33 + logcat error.
 */
class ShaderBenchCompatStaticView(context: Context) : TextureView(context), TextureView.SurfaceTextureListener {

  // Props (written on the UI thread, read on the render thread).
  @Volatile var shader: String = ""
    set(v) { field = v; needsDraw = true }
  @Volatile var periods: DoubleArray = doubleArrayOf(1.0, 1.0, 1.0, 1.0)
    set(v) { field = v; needsDraw = true }
  @Volatile var params: FloatArray = FloatArray(PARAM_FLOATS)
    set(v) { field = v; needsDraw = true }
  @Volatile var speed = 1.0
    set(v) { field = v; needsDraw = true }

  @Volatile private var needsDraw = true
  private var thread: HandlerThread? = null
  private var handler: Handler? = null
  private var renderer: Renderer? = null
  private var windowVisible = true

  init {
    isOpaque = true
    surfaceTextureListener = this
  }

  private fun bufferSize(w: Int, h: Int): Pair<Int, Int> {
    val density = resources.displayMetrics.density
    val scale = min(1f, MAX_PIXEL_RATIO / density)
    return Pair(max(1, (w * scale).roundToInt()), max(1, (h * scale).roundToInt()))
  }

  override fun onSurfaceTextureAvailable(st: SurfaceTexture, width: Int, height: Int) {
    val (bw, bh) = bufferSize(width, height)
    st.setDefaultBufferSize(bw, bh)
    val t = HandlerThread("SBStaticGL").also { it.start() }
    val h = Handler(t.looper)
    thread = t
    handler = h
    val r = Renderer(st, bw, bh)
    renderer = r
    val active = windowVisible
    h.post { r.start(active) }
  }

  override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, width: Int, height: Int) {
    val (bw, bh) = bufferSize(width, height)
    st.setDefaultBufferSize(bw, bh) // TextureView resets it to the view size
    val r = renderer ?: return
    handler?.post { r.resize(bw, bh) }
  }

  override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
    val r = renderer
    val t = thread
    val h = handler
    renderer = null
    thread = null
    handler = null
    if (r != null && t != null && h != null) {
      // Release EGL on the render thread and wait, so the SurfaceTexture is
      // not used after TextureView releases it.
      h.post { r.stop() }
      t.quitSafely()
      t.join(500)
    }
    return true
  }

  override fun onSurfaceTextureUpdated(st: SurfaceTexture) = Unit

  override fun onWindowVisibilityChanged(visibility: Int) {
    super.onWindowVisibilityChanged(visibility)
    windowVisible = visibility == View.VISIBLE
    val r = renderer ?: return
    val active = windowVisible
    handler?.post { r.setActive(active) }
  }

  /** Everything below runs on the "SBStaticGL" render thread. */
  private inner class Renderer(
      private val surfaceTexture: SurfaceTexture,
      private var width: Int,
      private var height: Int,
  ) : Choreographer.FrameCallback {
    private var display: EGLDisplay = EGL14.EGL_NO_DISPLAY
    private var config: EGLConfig? = null
    private var eglContext: EGLContext = EGL14.EGL_NO_CONTEXT
    private var eglSurface: EGLSurface = EGL14.EGL_NO_SURFACE

    private var program = 0
    private var programShader: String? = null // shader name the program was built from (null = none yet)
    private var uRes = -1
    private var uPhase = -1
    private var uParams = -1
    private var highp = true

    private var running = false
    private var active = false
    private var elapsed = 0.0
    private var lastNanos = 0L

    fun start(isActive: Boolean) {
      running = true
      setActive(isActive)
    }

    fun setActive(a: Boolean) {
      if (!running || a == active) return
      active = a
      val ch = Choreographer.getInstance()
      if (a) {
        lastNanos = 0L // don't count the paused time
        needsDraw = true
        ch.postFrameCallback(this)
      } else {
        ch.removeFrameCallback(this)
      }
    }

    fun stop() {
      running = false
      Choreographer.getInstance().removeFrameCallback(this)
      releaseGl()
      if (display != EGL14.EGL_NO_DISPLAY) EGL14.eglReleaseThread()
      // Not eglTerminate: the display is process-wide (other instances).
    }

    fun resize(w: Int, h: Int) {
      width = w
      height = h
      destroySurface() // recreated at the new buffer size on the next frame
      needsDraw = true
    }

    override fun doFrame(frameTimeNanos: Long) {
      if (!running || !active) return
      Choreographer.getInstance().postFrameCallback(this)
      val now = System.nanoTime()
      if (lastNanos != 0L) elapsed += (now - lastNanos) / 1e9 * speed
      lastNanos = now
      if (!ensureGl()) return
      val name = shader
      if (name != programShader) buildProgram(name)
      if ((speed == 0.0 || program == 0) && !needsDraw) return
      needsDraw = false
      draw()
    }

    // ---- EGL ---------------------------------------------------------------

    /** Display, context and window surface ready and current. */
    private fun ensureGl(): Boolean {
      if (display == EGL14.EGL_NO_DISPLAY) {
        val d = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
        val v = IntArray(2)
        if (d == EGL14.EGL_NO_DISPLAY || !EGL14.eglInitialize(d, v, 0, v, 1)) {
          return fail("eglInitialize")
        }
        display = d
      }
      if (eglContext == EGL14.EGL_NO_CONTEXT) {
        val attrs = intArrayOf(
            EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8, EGL14.EGL_ALPHA_SIZE, 8,
            EGL14.EGL_DEPTH_SIZE, 0, EGL14.EGL_STENCIL_SIZE, 0,
            EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
            EGL14.EGL_SURFACE_TYPE, EGL14.EGL_WINDOW_BIT,
            EGL14.EGL_NONE)
        val configs = arrayOfNulls<EGLConfig>(1)
        val n = IntArray(1)
        if (!EGL14.eglChooseConfig(display, attrs, 0, configs, 0, 1, n, 0) || n[0] < 1) {
          return fail("eglChooseConfig")
        }
        config = configs[0]
        val ctxAttrs = intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE)
        val c = EGL14.eglCreateContext(display, config, EGL14.EGL_NO_CONTEXT, ctxAttrs, 0)
        if (c == null || c == EGL14.EGL_NO_CONTEXT) return fail("eglCreateContext")
        eglContext = c
        programShader = null // GL objects belong to the (new) context
        program = 0
        needsDraw = true
      }
      if (eglSurface == EGL14.EGL_NO_SURFACE) {
        val s = EGL14.eglCreateWindowSurface(display, config, surfaceTexture, intArrayOf(EGL14.EGL_NONE), 0)
        if (s == null || s == EGL14.EGL_NO_SURFACE) return fail("eglCreateWindowSurface")
        eglSurface = s
        needsDraw = true
      }
      if (!EGL14.eglMakeCurrent(display, eglSurface, eglSurface, eglContext)) {
        if (EGL14.eglGetError() == EGL14.EGL_CONTEXT_LOST) {
          Log.w(TAG, "EGL context lost (makeCurrent): recreating")
          releaseGl()
        } else {
          destroySurface()
        }
        return false
      }
      return true
    }

    private fun fail(what: String): Boolean {
      Log.e(TAG, "$what failed: 0x${Integer.toHexString(EGL14.eglGetError())}")
      return false
    }

    private fun destroySurface() {
      if (eglSurface != EGL14.EGL_NO_SURFACE) {
        EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
        EGL14.eglDestroySurface(display, eglSurface)
        eglSurface = EGL14.EGL_NO_SURFACE
      }
    }

    /** Destroys surface + context (GL objects go with the context). */
    private fun releaseGl() {
      if (display == EGL14.EGL_NO_DISPLAY) return
      if (program != 0 && eglContext != EGL14.EGL_NO_CONTEXT && eglSurface != EGL14.EGL_NO_SURFACE &&
          EGL14.eglMakeCurrent(display, eglSurface, eglSurface, eglContext)) {
        GLES20.glDeleteProgram(program)
      }
      program = 0
      programShader = null
      destroySurface()
      if (eglContext != EGL14.EGL_NO_CONTEXT) {
        EGL14.eglDestroyContext(display, eglContext)
        eglContext = EGL14.EGL_NO_CONTEXT
      }
    }

    // ---- GL ----------------------------------------------------------------

    private fun buildProgram(name: String) {
      if (program != 0) GLES20.glDeleteProgram(program)
      program = 0
      programShader = name
      needsDraw = true
      if (name.isEmpty()) return
      val src = loadSource(name) ?: return
      highp = hasFragmentHighp()
      val fs = if (highp) src else src.replace(HIGHP, "precision mediump float")
      if (!highp) Log.w(TAG, "no highp float in fragment shaders on this GPU: using mediump")
      val v = compile(GLES20.GL_VERTEX_SHADER, VS) ?: return
      val f = compile(GLES20.GL_FRAGMENT_SHADER, fs)
      if (f == null) {
        GLES20.glDeleteShader(v)
        return
      }
      val p = GLES20.glCreateProgram()
      GLES20.glAttachShader(p, v)
      GLES20.glAttachShader(p, f)
      GLES20.glBindAttribLocation(p, 0, "pos")
      GLES20.glLinkProgram(p)
      GLES20.glDeleteShader(v)
      GLES20.glDeleteShader(f)
      val ok = IntArray(1)
      GLES20.glGetProgramiv(p, GLES20.GL_LINK_STATUS, ok, 0)
      if (ok[0] == 0) {
        Log.e(TAG, "shader \"$shader\": link error: ${GLES20.glGetProgramInfoLog(p)}")
        GLES20.glDeleteProgram(p)
        return
      }
      program = p
      uRes = GLES20.glGetUniformLocation(p, "resolution")
      uPhase = GLES20.glGetUniformLocation(p, "phase")
      uParams = GLES20.glGetUniformLocation(p, "params")
      // Fullscreen triangle, client-side array (attribute 0), no VBO to manage.
      GLES20.glUseProgram(p)
      GLES20.glEnableVertexAttribArray(0)
      GLES20.glVertexAttribPointer(0, 2, GLES20.GL_FLOAT, false, 0, TRIANGLE)
      GLES20.glDisable(GLES20.GL_DITHER)
    }

    /** GLSL of a shader name, read once per process from the APK assets. */
    private fun loadSource(name: String): String? {
      SOURCES[name]?.let { return it }
      return try {
        context.assets.open("$ASSET_DIR/$name.glsl").bufferedReader().use { it.readText() }.also { SOURCES[name] = it }
      } catch (e: java.io.IOException) {
        Log.e(TAG, "shader \"$name\": asset $ASSET_DIR/$name.glsl not found (Android rebuild needed after adding a shader)")
        null
      }
    }

    private fun hasFragmentHighp(): Boolean {
      val range = IntArray(2)
      val precision = IntArray(1)
      GLES20.glGetShaderPrecisionFormat(GLES20.GL_FRAGMENT_SHADER, GLES20.GL_HIGH_FLOAT, range, 0, precision, 0)
      return !(range[0] == 0 && range[1] == 0 && precision[0] == 0)
    }

    private fun compile(type: Int, src: String): Int? {
      val s = GLES20.glCreateShader(type)
      GLES20.glShaderSource(s, src)
      GLES20.glCompileShader(s)
      val ok = IntArray(1)
      GLES20.glGetShaderiv(s, GLES20.GL_COMPILE_STATUS, ok, 0)
      if (ok[0] == 0) {
        Log.e(TAG, "shader \"$shader\": compile error: ${GLES20.glGetShaderInfoLog(s)}")
        GLES20.glDeleteShader(s)
        return null
      }
      return s
    }

    private fun draw() {
      val w = width
      val h = height
      GLES20.glViewport(0, 0, w, h)
      if (program != 0) {
        val p = periods
        GLES20.glUniform2f(uRes, w.toFloat(), h.toFloat())
        GLES20.glUniform4f(uPhase, fract(elapsed / p[0]), fract(elapsed / p[1]), fract(elapsed / p[2]), fract(elapsed / p[3]))
        if (uParams >= 0) GLES20.glUniform4fv(uParams, PARAM_FLOATS / 4, params, 0)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 3)
      } else {
        GLES20.glClearColor(0x1b / 255f, 0x1a / 255f, 0x33 / 255f, 1f) // fallback #1b1a33
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
      }
      if (!EGL14.eglSwapBuffers(display, eglSurface)) {
        when (val err = EGL14.eglGetError()) {
          EGL14.EGL_CONTEXT_LOST -> {
            Log.w(TAG, "EGL context lost: recreating")
            releaseGl()
          }
          else -> {
            Log.w(TAG, "eglSwapBuffers failed: 0x${Integer.toHexString(err)}, recreating the surface")
            destroySurface()
          }
        }
        needsDraw = true
      }
    }
  }

  companion object {
    private const val TAG = "ShaderBenchCompatStatic"
    private const val ASSET_DIR = "shader-bench-compat-static"
    private val SOURCES = ConcurrentHashMap<String, String>()
    private const val MAX_PIXEL_RATIO = 2f
    const val PARAM_FLOATS = 16 // MAX_PARAMS = PARAM_VEC4S * 4
    private const val HIGHP = "precision highp float"
    private const val VS = "attribute vec2 pos; void main(){ gl_Position = vec4(pos, 0.0, 1.0); }"
    private val TRIANGLE = ByteBuffer.allocateDirect(6 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply {
      put(floatArrayOf(-1f, -1f, 3f, -1f, -1f, 3f))
      position(0)
    }

    private fun fract(x: Double): Float = (x - floor(x)).toFloat()
  }
}
