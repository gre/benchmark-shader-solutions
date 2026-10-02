package com.shaderbench.compatdynamic

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.events.Event
import com.facebook.react.viewmanagers.ShaderBenchCompatDynamicViewManagerDelegate
import com.facebook.react.viewmanagers.ShaderBenchCompatDynamicViewManagerInterface

/** Fabric view manager of <ShaderBenchCompatDynamicView> (codegen'd delegate/interface). */
@ReactModule(name = ShaderBenchCompatDynamicViewManager.NAME)
class ShaderBenchCompatDynamicViewManager :
    SimpleViewManager<ShaderBenchCompatDynamicView>(), ShaderBenchCompatDynamicViewManagerInterface<ShaderBenchCompatDynamicView> {
  private val delegate = ShaderBenchCompatDynamicViewManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<ShaderBenchCompatDynamicView> = delegate

  override fun getName() = NAME

  override fun createViewInstance(context: ThemedReactContext): ShaderBenchCompatDynamicView {
    val view = ShaderBenchCompatDynamicView(context)
    view.onShaderError = { message ->
      val data = Arguments.createMap().apply { putString("message", message) }
      UIManagerHelper.getEventDispatcherForReactTag(context, view.id)
          ?.dispatchEvent(ShaderErrorEvent(UIManagerHelper.getSurfaceId(context), view.id, data))
    }
    return view
  }

  override fun setShader(view: ShaderBenchCompatDynamicView, value: String?) {
    view.shader = value ?: ""
  }

  override fun setSource(view: ShaderBenchCompatDynamicView, value: String?) {
    view.source = value ?: ""
  }

  override fun setParams(view: ShaderBenchCompatDynamicView, value: ReadableArray?) {
    val out = FloatArray(ShaderBenchCompatDynamicView.PARAM_FLOATS)
    if (value != null) for (i in 0 until minOf(value.size(), out.size)) out[i] = value.getDouble(i).toFloat()
    view.params = out
  }

  override fun setPeriods(view: ShaderBenchCompatDynamicView, value: ReadableArray?) {
    val out = DoubleArray(4) { 1.0 }
    if (value != null) for (i in 0 until minOf(value.size(), 4)) out[i] = value.getDouble(i).takeIf { it > 0 } ?: 1.0
    view.periods = out
  }

  override fun setSpeed(view: ShaderBenchCompatDynamicView, value: Double) {
    view.speed = value
  }

  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> =
      mapOf(ShaderErrorEvent.NAME to mapOf("registrationName" to "onShaderError"))

  private class ShaderErrorEvent(surfaceId: Int, viewId: Int, private val data: WritableMap) :
      Event<ShaderErrorEvent>(surfaceId, viewId) {
    override fun getEventName() = NAME
    override fun canCoalesce() = false
    override fun getEventData(): WritableMap = data

    companion object {
      const val NAME = "topShaderError"
    }
  }

  companion object {
    const val NAME = "ShaderBenchCompatDynamicView"
  }
}

/** Autolinked by the React Native CLI (found in android/). */
class ShaderBenchCompatDynamicPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = emptyList()

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
      listOf(ShaderBenchCompatDynamicViewManager())
}
