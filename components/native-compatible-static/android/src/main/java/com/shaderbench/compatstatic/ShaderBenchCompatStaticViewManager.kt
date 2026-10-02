package com.shaderbench.compatstatic

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.viewmanagers.ShaderBenchCompatStaticViewManagerDelegate
import com.facebook.react.viewmanagers.ShaderBenchCompatStaticViewManagerInterface

/** Fabric view manager of <ShaderBenchCompatStaticView> (codegen'd delegate/interface). */
@ReactModule(name = ShaderBenchCompatStaticViewManager.NAME)
class ShaderBenchCompatStaticViewManager :
    SimpleViewManager<ShaderBenchCompatStaticView>(), ShaderBenchCompatStaticViewManagerInterface<ShaderBenchCompatStaticView> {
  private val delegate = ShaderBenchCompatStaticViewManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<ShaderBenchCompatStaticView> = delegate

  override fun getName() = NAME

  override fun createViewInstance(context: ThemedReactContext) = ShaderBenchCompatStaticView(context)

  override fun setShader(view: ShaderBenchCompatStaticView, value: String?) {
    view.shader = value ?: ""
  }

  override fun setParams(view: ShaderBenchCompatStaticView, value: ReadableArray?) {
    val out = FloatArray(ShaderBenchCompatStaticView.PARAM_FLOATS)
    if (value != null) for (i in 0 until minOf(value.size(), out.size)) out[i] = value.getDouble(i).toFloat()
    view.params = out
  }

  override fun setPeriods(view: ShaderBenchCompatStaticView, value: ReadableArray?) {
    val out = DoubleArray(4) { 1.0 }
    if (value != null) for (i in 0 until minOf(value.size(), 4)) out[i] = value.getDouble(i).takeIf { it > 0 } ?: 1.0
    view.periods = out
  }

  override fun setSpeed(view: ShaderBenchCompatStaticView, value: Double) {
    view.speed = value
  }

  companion object {
    const val NAME = "ShaderBenchCompatStaticView"
  }
}

/** Autolinked by the React Native CLI (found in android/). */
class ShaderBenchCompatStaticPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = emptyList()

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
      listOf(ShaderBenchCompatStaticViewManager())
}
