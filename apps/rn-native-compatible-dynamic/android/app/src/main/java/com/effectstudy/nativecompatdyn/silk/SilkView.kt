package com.effectstudy.nativecompatdyn.silk

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
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.Choreographer
import android.view.TextureView
import android.view.View
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * <SilkView> on Android with OpenGL ES 2.0 (Android 7.1+ / API 25): a
 * TextureView rendered by a dedicated "SilkGL" thread (own Looper +
 * Choreographer) that owns an EGL14 ES 2.0 context and a window surface on
 * the view's SurfaceTexture; one fullscreen triangle with the GLSL ES 1.00
 * fragment shader received in the `source` prop (= shaders/silk.glsl, a JS
 * string from src/shaders/silk.android.ts), compiled at runtime; a new
 * source rebuilds the program. Zero JS per frame.
 * Same props / events / clock as rn-native's AGSL SilkView, so the two apps
 * differ only by the Android renderer (AGSL RuntimeShader vs GLES).
 *
 * - TextureView (not GLSurfaceView): composes like a normal view (opacity of
 *   the stacked stress instances, transforms, z-order), same composition path
 *   as rn-native.
 * - Pixel-ratio cap 2: buffer = view px * min(1, 2 / density) (Pixel 3a:
 *   density 2.75 -> ~0.727x), upscaled by the compositor. `resolution` =
 *   buffer px.
 * - Precision: highp if the GPU supports it in fragment shaders
 *   (glGetShaderPrecisionFormat), else the source is switched to mediump.
 * - Clock: elapsed seconds accumulated in double (dt * speed while not
 *   paused) or `frozenTime` when >= 0; phases = fract(t / {41,59,23,53}).
 * - Lifecycle: rendering stops while the window is hidden; a lost EGL
 *   context / bad surface is recreated on the next frame.
 * - Events: onFirstFrame (ms since view creation, after the first
 *   eglSwapBuffers) and onFrameStats {fps, avgMs, p95Ms} every ~1 s.
 */
class SilkView(context: Context) : TextureView(context), TextureView.SurfaceTextureListener {

  // Props (written on the UI thread, read on the render thread).
  @Volatile var paused = false
    set(v) { field = v; needsDraw = true }
  @Volatile var frozenTime = -1.0
    set(v) { field = v; needsDraw = true }
  @Volatile var speed = 1.0
    set(v) { field = v; needsDraw = true }
  @Volatile var source = ""
    set(v) { field = v; needsDraw = true }

  /** Called on the main thread. */
  var onFirstFrame: ((ms: Double) -> Unit)? = null
  /** Called on the main thread with (fps, avgMs, p95Ms). */
  var onFrameStats: ((Double, Double, Double) -> Unit)? = null

  @Volatile private var needsDraw = true
  private val createdAt = SystemClock.elapsedRealtimeNanos()
  private val mainHandler = Handler(Looper.getMainLooper())

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
    val t = HandlerThread("SilkGL").also { it.start() }
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
      // Release EGL on the render thread and wait for it, so the
      // SurfaceTexture is not used after TextureView releases it.
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

  /** Everything below runs on the "SilkGL" thread. */
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
    private var programSource: String? = null // source the program was built from
    private var uRes = -1
    private var uPhase = -1

    private var running = false
    private var active = false
    private var elapsed = 0.0
    private var lastNanos = 0L
    private var firstFrameSent = false
    private val frameTimes = ArrayList<Long>(256)
    private var statsStart = 0L

    fun start(isActive: Boolean) {
      running = true
      setActive(isActive)
    }

    fun setActive(a: Boolean) {
      if (!running || a == active) return
      active = a
      val ch = Choreographer.getInstance()
      if (a) {
        lastNanos = 0L // the hidden time does not advance the clock
        frameTimes.clear()
        statsStart = 0L
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
      if (display != EGL14.EGL_NO_DISPLAY) EGL14.eglReleaseThread() // no eglTerminate: display is process-wide
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
      if (lastNanos != 0L && !paused) elapsed += (now - lastNanos) / 1e9 * speed
      lastNanos = now
      if (!ensureGl()) return
      val src = source
      if (src != programSource) buildProgram(src)

      val animating = program != 0 && !paused && frozenTime < 0
      if (!animating) {
        frameTimes.clear()
        statsStart = 0L
        if (!needsDraw) return
      }
      needsDraw = false
      if (!draw()) return
      if (!firstFrameSent) {
        firstFrameSent = true
        val ms = (SystemClock.elapsedRealtimeNanos() - createdAt) / 1e6
        mainHandler.post { onFirstFrame?.invoke(ms) }
      }
      if (animating) recordFrame(now)
    }

    // ---- EGL ---------------------------------------------------------------

    private fun ensureGl(): Boolean {
      if (display == EGL14.EGL_NO_DISPLAY) {
        val d = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
        val v = IntArray(2)
        if (d == EGL14.EGL_NO_DISPLAY || !EGL14.eglInitialize(d, v, 0, v, 1)) return fail("eglInitialize")
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
        if (!EGL14.eglChooseConfig(display, attrs, 0, configs, 0, 1, n, 0) || n[0] < 1) return fail("eglChooseConfig")
        config = configs[0]
        val c = EGL14.eglCreateContext(display, config, EGL14.EGL_NO_CONTEXT, intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE), 0)
        if (c == null || c == EGL14.EGL_NO_CONTEXT) return fail("eglCreateContext")
        eglContext = c
        program = 0 // GL objects belong to the (new) context
        programSource = null
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

    private fun releaseGl() {
      if (display == EGL14.EGL_NO_DISPLAY) return
      program = 0
      programSource = null
      destroySurface()
      if (eglContext != EGL14.EGL_NO_CONTEXT) {
        EGL14.eglDestroyContext(display, eglContext) // frees the program with it
        eglContext = EGL14.EGL_NO_CONTEXT
      }
    }

    // ---- GL ----------------------------------------------------------------

    private fun buildProgram(source: String) {
      if (program != 0) GLES20.glDeleteProgram(program)
      program = 0
      programSource = source
      needsDraw = true
      if (source.isEmpty()) return
      val t0 = SystemClock.elapsedRealtimeNanos()
      val range = IntArray(2)
      val precision = IntArray(1)
      GLES20.glGetShaderPrecisionFormat(GLES20.GL_FRAGMENT_SHADER, GLES20.GL_HIGH_FLOAT, range, 0, precision, 0)
      val highp = !(range[0] == 0 && range[1] == 0 && precision[0] == 0)
      if (!highp) Log.w(TAG, "no highp float in fragment shaders on this GPU: using mediump")
      val fs = if (highp) source else source.replace("precision highp float", "precision mediump float")
      val v = compile(GLES20.GL_VERTEX_SHADER, VS)
      val f = compile(GLES20.GL_FRAGMENT_SHADER, fs)
      if (v == 0 || f == 0) {
        if (v != 0) GLES20.glDeleteShader(v)
        if (f != 0) GLES20.glDeleteShader(f)
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
        Log.e(TAG, "link error: ${GLES20.glGetProgramInfoLog(p)}")
        GLES20.glDeleteProgram(p)
        return
      }
      program = p
      uRes = GLES20.glGetUniformLocation(p, "resolution")
      uPhase = GLES20.glGetUniformLocation(p, "phase")
      GLES20.glUseProgram(p)
      GLES20.glEnableVertexAttribArray(0)
      GLES20.glVertexAttribPointer(0, 2, GLES20.GL_FLOAT, false, 0, TRIANGLE)
      GLES20.glDisable(GLES20.GL_DITHER)
      Log.i(TAG, "[effect] shader setup ${String.format(java.util.Locale.US, "%.1f", (SystemClock.elapsedRealtimeNanos() - t0) / 1e6)} ms (glCompileShader + glLinkProgram)")
      Log.i(TAG, "GLES program ready (${if (highp) "highp" else "mediump"}): ${GLES20.glGetString(GLES20.GL_RENDERER)}")
    }

    private fun compile(type: Int, src: String): Int {
      val s = GLES20.glCreateShader(type)
      GLES20.glShaderSource(s, src)
      GLES20.glCompileShader(s)
      val ok = IntArray(1)
      GLES20.glGetShaderiv(s, GLES20.GL_COMPILE_STATUS, ok, 0)
      if (ok[0] == 0) {
        Log.e(TAG, "GLSL compile error: ${GLES20.glGetShaderInfoLog(s)}")
        GLES20.glDeleteShader(s)
        return 0
      }
      return s
    }

    /** Returns true when a frame was presented. */
    private fun draw(): Boolean {
      val w = width
      val h = height
      GLES20.glViewport(0, 0, w, h)
      if (program != 0) {
        val t = if (frozenTime >= 0) frozenTime else elapsed
        GLES20.glUniform2f(uRes, w.toFloat(), h.toFloat())
        GLES20.glUniform4f(uPhase, fract(t / 41.0), fract(t / 59.0), fract(t / 23.0), fract(t / 53.0))
        GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 3)
      } else {
        GLES20.glClearColor(0x1b / 255f, 0x1a / 255f, 0x33 / 255f, 1f) // fallback #1b1a33
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
      }
      if (EGL14.eglSwapBuffers(display, eglSurface)) return true
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
      return false
    }

    private fun recordFrame(now: Long) {
      if (statsStart == 0L) statsStart = now
      frameTimes.add(now)
      if (now - statsStart < STATS_INTERVAL_NS || frameTimes.size < 3) return
      val n = frameTimes.size - 1
      val deltas = DoubleArray(n) { (frameTimes[it + 1] - frameTimes[it]) / 1e6 }
      val span = (frameTimes[n] - frameTimes[0]) / 1e6
      deltas.sort()
      val p95 = deltas[min(n - 1, max(0, ceil(0.95 * n).toInt() - 1))]
      val fps = n * 1000.0 / span
      val avg = span / n
      frameTimes.clear()
      frameTimes.add(now)
      statsStart = now
      mainHandler.post { onFrameStats?.invoke(fps, avg, p95) }
    }
  }

  companion object {
    private const val TAG = "SilkView"
    private const val MAX_PIXEL_RATIO = 2f
    private const val STATS_INTERVAL_NS = 1_000_000_000L
    private const val VS = "attribute vec2 pos; void main(){ gl_Position = vec4(pos, 0.0, 1.0); }"
    private val TRIANGLE = ByteBuffer.allocateDirect(6 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply {
      put(floatArrayOf(-1f, -1f, 3f, -1f, -1f, 3f))
      position(0)
    }

    private fun fract(x: Double): Float = (x - floor(x)).toFloat()
  }
}
