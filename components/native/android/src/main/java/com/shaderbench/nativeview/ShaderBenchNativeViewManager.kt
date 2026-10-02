package com.shaderbench.nativeview

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.viewmanagers.ShaderBenchNativeViewManagerDelegate
import com.facebook.react.viewmanagers.ShaderBenchNativeViewManagerInterface

/** Fabric view manager of <ShaderBenchNativeView> (codegen'd delegate/interface). */
@ReactModule(name = ShaderBenchNativeViewManager.NAME)
class ShaderBenchNativeViewManager :
    SimpleViewManager<ShaderBenchNativeView>(), ShaderBenchNativeViewManagerInterface<ShaderBenchNativeView> {
  private val delegate = ShaderBenchNativeViewManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<ShaderBenchNativeView> = delegate

  override fun getName() = NAME

  override fun createViewInstance(context: ThemedReactContext) = ShaderBenchNativeView(context)

  override fun setShader(view: ShaderBenchNativeView, value: String?) {
    view.shader = value ?: ""
  }

  override fun setParams(view: ShaderBenchNativeView, value: ReadableArray?) {
    val out = FloatArray(ShaderBenchNativeView.PARAM_FLOATS)
    if (value != null) for (i in 0 until minOf(value.size(), out.size)) out[i] = value.getDouble(i).toFloat()
    view.params = out
  }

  override fun setPeriods(view: ShaderBenchNativeView, value: ReadableArray?) {
    val out = DoubleArray(4) { 1.0 }
    if (value != null) for (i in 0 until minOf(value.size(), 4)) out[i] = value.getDouble(i).takeIf { it > 0 } ?: 1.0
    view.periods = out
  }

  override fun setSpeed(view: ShaderBenchNativeView, value: Double) {
    view.speed = value
  }

  companion object {
    const val NAME = "ShaderBenchNativeView"
  }
}

/** Autolinked by the React Native CLI (found in android/). */
class ShaderBenchNativePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = emptyList()

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
      listOf(ShaderBenchNativeViewManager())
}
