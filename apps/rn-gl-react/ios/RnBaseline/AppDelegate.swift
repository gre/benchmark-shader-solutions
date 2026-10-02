import UIKit
internal import Expo
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

// iOS 27 SDK: apps MUST adopt the UIScene life cycle, otherwise UIKit traps
// at launch (__UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption).
// The RN 0.87.1 template is still window-based, so: the AppDelegate only
// creates the React Native factory, and SceneDelegate (below, declared in
// Info.plist UIApplicationSceneManifest) owns the window and starts RN.
@main
class AppDelegate: ExpoAppDelegate {
  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Benchmark instrumentation: in Release, React Native logs console.log only to
    // os_log. Mirror the "[effect] ..." lines to stderr too, so that
    // `xcrun devicectl device process launch --console` can read the first-frame
    // time on a physical device (metrics/perf-ios-device-startup.py).
    RCTAddLogFunction { _, _, _, _, message in
      if let m = message, m.hasPrefix("[effect]") { fputs(m + "\n", stderr) }
    }
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
  }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    factory.startReactNative(
      withModuleName: "RnBaseline",
      in: window,
      launchOptions: nil
    )
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    // Metro runs on a non-default port (one per app of the study, 8081 is
    // avoided). The port comes from the RCT_METRO_PORT *build setting*
    // (project.pbxproj), exposed through Info.plist key RCTMetroPort. The
    // RCT_METRO_PORT preprocessor macro can't be used: RN 0.87 links a
    // prebuilt React core (RCT_USE_PREBUILT_RNCORE=1 by default), compiled
    // with the default 8081.
    let port = Bundle.main.object(forInfoDictionaryKey: "RCTMetroPort") as? String ?? "8081"
    let settings = RCTBundleURLProvider.sharedSettings()
    settings.jsLocation = "localhost:\(port)"
    return settings.jsBundleURL(forBundleRoot: "index")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
