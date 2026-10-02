package com.effectstudy.nativeapp.silk

import android.content.Context
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RuntimeShader
import android.graphics.SurfaceTexture
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.Choreographer
import android.view.Surface
import android.view.TextureView
import com.effectstudy.nativeapp.R
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * <SilkView> on Android: a TextureView whose buffer is rendered on a
 * dedicated render thread ("SilkRender", own Looper + Choreographer), by
 * drawing one full-buffer rect with a Paint whose shader is an AGSL
 * RuntimeShader (res/raw/silk.agsl, API 33+). Zero JS per frame.
 *
 * - Pixel-ratio cap 2: the TextureView buffer is view px * min(1, 2 / density)
 *   (Pixel 3a: density 2.75 -> buffer ~0.727x the view px), upscaled
 *   bilinearly by the compositor — the same "render at <= 2x" rule as iOS.
 *   `resolution` = buffer px (the canvas the shader runs on).
 * - Clock: elapsed seconds accumulated in double (dt * speed while not
 *   paused) or `frozenTime` when >= 0; phases = fract(t / {41,59,23,53}).
 * - API < 33 (no RuntimeShader): solid #1b1a33 fallback.
 */
class SilkView(context: Context) : TextureView(context), TextureView.SurfaceTextureListener {

  // Props (written on the UI thread, read on the render thread).
  @Volatile var paused = false
    set(v) { field = v; needsDraw = true }
  @Volatile var frozenTime = -1.0
    set(v) { field = v; needsDraw = true }
  @Volatile var speed = 1.0
    set(v) { field = v; needsDraw = true }

  /** Called on the main thread. */
  var onFirstFrame: ((ms: Double) -> Unit)? = null
  /** Called on the main thread with (fps, avgMs, p95Ms). */
  var onFrameStats: ((Double, Double, Double) -> Unit)? = null

  @Volatile private var needsDraw = true
  private val createdAt = SystemClock.elapsedRealtimeNanos()
  private val mainHandler = Handler(Looper.getMainLooper())

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
    val t = HandlerThread("SilkRender").also { it.start() }
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
      // Stop and release on the render thread, wait for it so the surface is
      // not used after the SurfaceTexture is released.
      Handler(t.looper).post { r.stop() }
      t.quitSafely()
      t.join(500)
    }
    return true
  }

  override fun onSurfaceTextureUpdated(st: SurfaceTexture) = Unit

  /** Everything below runs on the "SilkRender" thread. */
  private inner class Renderer(
      private val surface: Surface,
      @Volatile private var width: Int,
      @Volatile private var height: Int,
  ) : Choreographer.FrameCallback {
    private val paint = Paint()
    private val shader: RuntimeShader? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) createShader() else null
    private var running = false
    private var elapsed = 0.0
    private var lastNanos = 0L
    private var firstFrameSent = false
    private val frameTimes = ArrayList<Long>(256)
    private var statsStart = 0L

    fun start() {
      running = true
      if (shader != null) paint.shader = shader else paint.color = FALLBACK_COLOR
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
      if (lastNanos != 0L && !paused) elapsed += (now - lastNanos) / 1e9 * speed
      lastNanos = now

      val animating = shader != null && !paused && frozenTime < 0
      if (!animating) {
        frameTimes.clear()
        statsStart = 0L
        if (!needsDraw) return
      }
      needsDraw = false
      draw()
      if (!firstFrameSent) {
        firstFrameSent = true
        val ms = (SystemClock.elapsedRealtimeNanos() - createdAt) / 1e6
        mainHandler.post { onFirstFrame?.invoke(ms) }
      }
      if (animating) recordFrame(now)
    }

    private fun draw() {
      val w = width
      val h = height
      shader?.let { s ->
        val t = if (frozenTime >= 0) frozenTime else elapsed
        s.setFloatUniform("resolution", w.toFloat(), h.toFloat())
        s.setFloatUniform(
            "phase", fract(t / 41.0), fract(t / 59.0), fract(t / 23.0), fract(t / 53.0))
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

  private fun createShader(): RuntimeShader? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return null
    val src = resources.openRawResource(R.raw.silk).bufferedReader().use { it.readText() }
    return try {
      RuntimeShader(src) // AGSL compile errors surface here, at runtime
    } catch (e: IllegalArgumentException) {
      Log.e(TAG, "AGSL compile error: ${e.message}")
      null
    }
  }

  companion object {
    private const val TAG = "SilkView"
    private const val MAX_PIXEL_RATIO = 2f
    private const val STATS_INTERVAL_NS = 1_000_000_000L
    private val FALLBACK_COLOR = Color.rgb(0x1b, 0x1a, 0x33)

    private fun fract(x: Double): Float {
      val f = x - Math.floor(x)
      return f.toFloat()
    }
  }
}
