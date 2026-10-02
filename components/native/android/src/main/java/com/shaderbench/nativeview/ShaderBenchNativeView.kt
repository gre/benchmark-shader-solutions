package com.shaderbench.nativeview

import android.content.Context
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RuntimeShader
import android.graphics.SurfaceTexture
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.view.Choreographer
import android.view.Surface
import android.view.TextureView
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * <ShaderBenchNativeView> on Android (adapted from apps/rn-native SilkView,
 * made generic): a TextureView rendered on its own "ShaderBench" render
 * thread (Looper + Choreographer) by drawing one rect with a Paint whose
 * shader is an AGSL RuntimeShader (API 33+) loaded from
 * assets/shader-bench/<shader>.agsl. Zero JS per frame.
 *
 * - Uniforms by name: resolution (buffer px), phase (fract(t / periods[i]),
 *   double), params (float4[4] = MAX_PARAMS floats, src/registry.ts layout).
 * - Clock: elapsed += dt * speed (double). speed 0: frozen, redraws only on
 *   prop or size changes.
 * - Pixel-ratio cap 2: buffer = view px * min(1, 2 / density), upscaled by
 *   the compositor.
 * - API < 33, unknown shader or AGSL compile error: solid #1b1a33.
 */
class ShaderBenchNativeView(context: Context) : TextureView(context), TextureView.SurfaceTextureListener {

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
  private var renderer: Renderer? = null

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
    val t = HandlerThread("ShaderBench").also { it.start() }
    thread = t
    val r = Renderer(Surface(st), bw, bh)
    renderer = r
    Handler(t.looper).post { r.start() }
  }

  override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, width: Int, height: Int) {
    val (bw, bh) = bufferSize(width, height)
    st.setDefaultBufferSize(bw, bh) // TextureView resets it to the view size
    renderer?.resize(bw, bh)
    needsDraw = true
  }

  override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
    val r = renderer
    val t = thread
    renderer = null
    thread = null
    if (r != null && t != null) {
      Handler(t.looper).post { r.stop() }
      t.quitSafely()
      t.join(500)
    }
    return true
  }

  override fun onSurfaceTextureUpdated(st: SurfaceTexture) = Unit

  /** Everything below runs on the "ShaderBench" render thread. */
  private inner class Renderer(
      private val surface: Surface,
      @Volatile private var width: Int,
      @Volatile private var height: Int,
  ) : Choreographer.FrameCallback {
    private val paint = Paint()
    private var loadedName: String? = null
    private var runtimeShader: Any? = null // RuntimeShader (API 33+)
    private var running = false
    private var elapsed = 0.0
    private var lastNanos = 0L

    fun start() {
      running = true
      Choreographer.getInstance().postFrameCallback(this)
    }

    fun stop() {
      running = false
      Choreographer.getInstance().removeFrameCallback(this)
      surface.release()
    }

    fun resize(w: Int, h: Int) {
      width = w
      height = h
    }

    override fun doFrame(frameTimeNanos: Long) {
      if (!running) return
      Choreographer.getInstance().postFrameCallback(this)
      val now = System.nanoTime()
      if (lastNanos != 0L) elapsed += (now - lastNanos) / 1e9 * speed
      lastNanos = now
      ensureShader()
      if ((speed == 0.0 || runtimeShader == null) && !needsDraw) return
      needsDraw = false
      draw()
    }

    private fun ensureShader() {
      val name = shader
      if (name == loadedName) return
      loadedName = name
      runtimeShader = if (name.isNotEmpty() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) load(name) else null
      if (runtimeShader != null) {
        paint.shader = runtimeShader as RuntimeShader
      } else {
        paint.shader = null
        paint.color = FALLBACK_COLOR
      }
      needsDraw = true
    }

    private fun load(name: String): Any? {
      return try {
        val src = context.assets.open("shader-bench/$name.agsl").bufferedReader().use { it.readText() }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) RuntimeShader(src) else null
      } catch (e: Exception) {
        // missing asset (IOException) or AGSL compile error (IllegalArgumentException)
        Log.e(TAG, "cannot load shader \"$name\": ${e.message}")
        null
      }
    }

    private fun draw() {
      val w = width
      val h = height
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        (runtimeShader as RuntimeShader?)?.let { s ->
          val p = periods
          s.setFloatUniform("resolution", w.toFloat(), h.toFloat())
          s.setFloatUniform(
              "phase", fract(elapsed / p[0]), fract(elapsed / p[1]), fract(elapsed / p[2]), fract(elapsed / p[3]))
          s.setFloatUniform("params", params)
        }
      }
      val canvas = try {
        surface.lockHardwareCanvas()
      } catch (e: Exception) {
        Log.w(TAG, "lockHardwareCanvas failed", e)
        return
      }
      try {
        canvas.drawRect(0f, 0f, w.toFloat(), h.toFloat(), paint)
      } finally {
        surface.unlockCanvasAndPost(canvas)
      }
    }
  }

  companion object {
    private const val TAG = "ShaderBenchNative"
    private const val MAX_PIXEL_RATIO = 2f
    const val PARAM_FLOATS = 16 // MAX_PARAMS = PARAM_VEC4S * 4
    private val FALLBACK_COLOR = Color.rgb(0x1b, 0x1a, 0x33)

    private fun fract(x: Double): Float = (x - floor(x)).toFloat()
  }
}
