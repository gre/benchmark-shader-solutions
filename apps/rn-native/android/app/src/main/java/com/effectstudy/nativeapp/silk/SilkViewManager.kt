package com.effectstudy.nativeapp.silk

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.events.Event
import com.facebook.react.viewmanagers.SilkViewManagerDelegate
import com.facebook.react.viewmanagers.SilkViewManagerInterface

/** Fabric view manager of <SilkView>, using the codegen'd delegate/interface. */
@ReactModule(name = SilkViewManager.NAME)
class SilkViewManager : SimpleViewManager<SilkView>(), SilkViewManagerInterface<SilkView> {
  private val delegate = SilkViewManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<SilkView> = delegate

  override fun getName() = NAME

  override fun createViewInstance(context: ThemedReactContext): SilkView {
    val view = SilkView(context)
    view.onFirstFrame = { ms ->
      dispatch(context, view, "topFirstFrame", Arguments.createMap().apply { putDouble("ms", ms) })
    }
    view.onFrameStats = { fps, avg, p95 ->
      dispatch(
          context,
          view,
          "topFrameStats",
          Arguments.createMap().apply {
            putDouble("fps", fps)
            putDouble("avgMs", avg)
            putDouble("p95Ms", p95)
          })
    }
    return view
  }

  override fun setPaused(view: SilkView, value: Boolean) {
    view.paused = value
  }

  override fun setFrozenTime(view: SilkView, value: Double) {
    view.frozenTime = value
  }

  override fun setSpeed(view: SilkView, value: Float) {
    view.speed = value.toDouble()
  }

  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> =
      mapOf(
          "topFirstFrame" to mapOf("registrationName" to "onFirstFrame"),
          "topFrameStats" to mapOf("registrationName" to "onFrameStats"),
      )

  private fun dispatch(context: ThemedReactContext, view: SilkView, name: String, data: WritableMap) {
    val surfaceId = UIManagerHelper.getSurfaceId(context)
    UIManagerHelper.getEventDispatcherForReactTag(context, view.id)
        ?.dispatchEvent(SilkEvent(surfaceId, view.id, name, data))
  }

  private class SilkEvent(surfaceId: Int, viewId: Int, private val name: String, private val data: WritableMap) :
      Event<SilkEvent>(surfaceId, viewId) {
    override fun getEventName() = name
    override fun canCoalesce() = false
    override fun getEventData(): WritableMap = data
  }

  companion object {
    const val NAME = "SilkView"
  }
}

/** Registered manually in MainApplication (app-local component, no autolinking). */
class SilkPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = emptyList()

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
      listOf(SilkViewManager())
}
