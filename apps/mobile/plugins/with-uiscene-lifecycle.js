// UIScene 생명주기 도입 — Xcode 27(iOS 27 SDK)로 빌드한 앱은 UIScene 생명주기를 쓰지 않으면 iOS 27 에서
// 실행 즉시 막힌다("UIScene life cycle is required for apps built with this SDK"). iOS 26 이하에서는
// 경고만 남기지만, iOS 27 런타임은 새 SDK 로 링크된 앱을 띄우지 않는다.
//
// Expo 템플릿은 SDK 58 에서야 SceneDelegate(ExpoAppSceneDelegate)로 바뀌었다. SDK 54 에는 그 기반 클래스가
// 없으므로 이 플러그인이 같은 구조를 직접 만든다.
//  1) Info.plist 에 UIApplicationSceneManifest(단일 장면 → SceneDelegate)를 넣는다.
//  2) AppDelegate 에서 창 생성·React Native 시작 블록을 걷어낸다. RN 팩토리 생성은 그대로 둔다.
//  3) SceneDelegate.swift 를 써서 앱 타깃에 넣는다. 장면에서 창을 만들어 RN 을 시작하고, 콜드 스타트
//     URL·유니버설 링크를 launchOptions 로 되살리며, URL·사용자 활동·생명주기 이벤트를 AppDelegate
//     (Expo 구독자 포함)로 다시 넘긴다. SDK 58 의 ExpoAppSceneDelegate + SceneEventForwarder 를 옮겨 왔다.
//
// ios/ 는 gitignore·prebuild 재생성이라 prebuild 때마다 이 플러그인이 다시 적용한다. 세 단계 모두 멱등이다.
// Expo SDK 58 이상으로 올리면 템플릿이 같은 일을 하므로 이 플러그인을 지운다(겹치면 RN 이 두 번 뜬다).

const { IOSConfig, withAppDelegate, withInfoPlist } = require('@expo/config-plugins');

const MARKER = '@uiscene-lifecycle';

// ── 1. Info.plist ────────────────────────────────────────────────────────────

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
      },
    ],
  },
};

const withSceneManifest = (config) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return cfg;
  });

// ── 2. AppDelegate ───────────────────────────────────────────────────────────

// SDK 54 템플릿의 창 생성 + RN 시작 블록. 이게 남아 있으면 장면 없는 창이 생기고, SceneDelegate 와 합쳐
// RN 이 두 번 뜬다 — 못 찾으면 prebuild 를 실패시킨다.
const LEGACY_WINDOW_BLOCK =
  /\n[ \t]*#if os\(iOS\) \|\| os\(tvOS\)\n[ \t]*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n[ \t]*factory\.startReactNative\([\s\S]*?\)\n[ \t]*#endif\n/;

const SCENE_NOTE = `
    // ${MARKER} — 창 생성과 React Native 시작은 SceneDelegate 가 한다(iOS 27 SDK 는 UIScene 생명주기
    // 필수). 여기서는 팩토리만 만든다. plugins/with-uiscene-lifecycle.js
`;

function patchAppDelegate(contents) {
  if (contents.includes(MARKER)) return contents;
  if (!LEGACY_WINDOW_BLOCK.test(contents)) {
    throw new Error(
      'with-uiscene-lifecycle: AppDelegate.swift 에서 창 생성·startReactNative 블록을 찾지 못했다. ' +
        '템플릿이 바뀌었으면(예: Expo SDK 58 이상) 이 플러그인을 지우거나 패턴을 고칠 것.',
    );
  }
  return contents.replace(LEGACY_WINDOW_BLOCK, SCENE_NOTE);
}

const withSceneAppDelegate = (config) =>
  withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('with-uiscene-lifecycle: Swift AppDelegate 만 지원한다.');
    }
    cfg.modResults.contents = patchAppDelegate(cfg.modResults.contents);
    return cfg;
  });

// ── 3. SceneDelegate.swift ───────────────────────────────────────────────────

const SCENE_DELEGATE_SWIFT = `// 생성물 — apps/mobile/plugins/with-uiscene-lifecycle.js 가 prebuild 마다 다시 쓴다. 손으로 고치지 말 것.
//
// UIScene 생명주기(iOS 27 SDK 필수). Expo SDK 58 의 ExpoAppSceneDelegate + SceneEventForwarder 를 SDK 54 로
// 옮겼다. AppDelegate 는 didFinishLaunching 에서 RN 팩토리만 만들고, 창과 RN 시작은 여기서 한다.
// 장면 생명주기에서는 UIKit 이 AppDelegate 의 URL·사용자 활동·생명주기 메서드를 부르지 않으므로, 이벤트를
// AppDelegate 로 되넘겨 Expo 구독자(expo-linking·expo-router 등)와 AppDelegate 오버라이드가 그대로 돌게 한다.

import Expo
import React
import UIKit

@objc(SceneDelegate)
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var appDelegate: AppDelegate? {
    UIApplication.shared.delegate as? AppDelegate
  }

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else {
      return
    }
    guard let appDelegate, let factory = appDelegate.reactNativeFactory else {
      fatalError("SceneDelegate: AppDelegate 가 didFinishLaunching 에서 React Native 팩토리를 만들지 않았다.")
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    // UIApplication.shared.delegate?.window 를 읽는 코드가 계속 동작하도록 AppDelegate 에도 둔다.
    appDelegate.window = window

    // 콜드 스타트 URL·유니버설 링크는 launchOptions 가 아니라 connectionOptions 로 온다. RN 의
    // Linking.getInitialURL() 은 launchOptions 에서만 읽으므로 여기서 되살려 넘긴다. 아래에서 되넘기는
    // url 이벤트는 JS 가 준비되기 전에 발생해 아무도 받지 못한다.
    let browsingWebActivity = connectionOptions.userActivities.first {
      $0.activityType == NSUserActivityTypeBrowsingWeb
    }
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: Self.launchOptions(
        url: connectionOptions.urlContexts.first?.url,
        userActivity: browsingWebActivity
      )
    )

    connectionOptions.urlContexts.forEach {
      open(url: $0.url, options: Self.openURLOptions(from: $0.options))
    }
    connectionOptions.userActivities.forEach { continueUserActivity($0) }
    // 빠른 동작(홈 화면 3D 터치)으로 콜드 스타트하면 windowScene(_:performActionFor:) 대신 여기로 온다.
    if let shortcutItem = connectionOptions.shortcutItem {
      appDelegate.application(UIApplication.shared, performActionFor: shortcutItem) { _ in }
    }
  }

  func sceneDidDisconnect(_ scene: UIScene) {
    window = nil
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    appDelegate?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    appDelegate?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    appDelegate?.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    appDelegate?.applicationDidEnterBackground(UIApplication.shared)
  }

  // 실행 중 딥링크 — RN 은 장면 생명주기에서 AppDelegate URL API 를 받지 못하므로 장면 API 로만 들어온다.
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    URLContexts.forEach {
      open(url: $0.url, options: Self.openURLOptions(from: $0.options))
    }
  }

  func scene(_ scene: UIScene, willContinueUserActivityWithType userActivityType: String) {
    _ = appDelegate?.application(UIApplication.shared, willContinueUserActivityWithType: userActivityType)
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    continueUserActivity(userActivity)
  }

  func scene(
    _ scene: UIScene,
    didFailToContinueUserActivityWithType userActivityType: String,
    error: Error
  ) {
    appDelegate?.application(
      UIApplication.shared,
      didFailToContinueUserActivityWithType: userActivityType,
      error: error
    )
  }

  func scene(_ scene: UIScene, didUpdate userActivity: NSUserActivity) {
    appDelegate?.application(UIApplication.shared, didUpdate: userActivity)
  }

  func windowScene(
    _ windowScene: UIWindowScene,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    guard let appDelegate else {
      completionHandler(false)
      return
    }
    appDelegate.application(
      UIApplication.shared,
      performActionFor: shortcutItem,
      completionHandler: completionHandler
    )
  }

  // MARK: - AppDelegate 로 되넘기기

  // AppDelegate 의 URL 오버라이드는 Expo 구독자를 거친 뒤 RCTLinkingManager 도 직접 부른다. 이미 알렸으면
  // 다시 알리지 않는다 — JS 의 url 이벤트가 두 번 가지 않게.
  private func open(url: URL, options: [UIApplication.OpenURLOptionsKey: Any]) {
    let application = UIApplication.shared
    notifyLinkingManagerUnlessAlreadyNotified(of: url) {
      _ = appDelegate?.application(application, open: url, options: options)
    } notify: {
      RCTLinkingManager.application(application, open: url, options: options)
    }
  }

  // RCTLinkingManager 는 브라우징 웹 활동만 알리므로, 다른 활동 종류는 중복을 걸러 낼 게 없다.
  private func continueUserActivity(_ userActivity: NSUserActivity) {
    let application = UIApplication.shared
    notifyLinkingManagerUnlessAlreadyNotified(of: userActivity.webpageURL) {
      _ = appDelegate?.application(application, continue: userActivity, restorationHandler: { _ in })
    } notify: {
      RCTLinkingManager.application(application, continue: userActivity, restorationHandler: { _ in })
    }
  }

  // body 를 실행하고, 그 사이 RCTLinkingManager 가 url 을 알리지 않았을 때만 notify 를 부른다.
  // url 이 없으면 notify 를 항상 부른다.
  private func notifyLinkingManagerUnlessAlreadyNotified(
    of url: URL?,
    during body: () -> Void,
    notify: () -> Void
  ) {
    guard let url else {
      body()
      notify()
      return
    }
    let observer = LinkingManagerObserver(url: url)
    body()
    if !observer.wasNotified {
      notify()
    }
  }

  // MARK: - launchOptions

  // RN 의 getInitialURL 이 읽는 키 이름 그대로 만든다. UIApplication.LaunchOptionsKey 의 .url 등 접근자는
  // iOS 26 에서 장면 API 로 대체되며 deprecated 됐다. 콜드 스타트 링크가 없으면 nil.
  private static func launchOptions(
    url: URL?,
    userActivity: NSUserActivity?
  ) -> [UIApplication.LaunchOptionsKey: Any]? {
    var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let url {
      launchOptions[UIApplication.LaunchOptionsKey(rawValue: "UIApplicationLaunchOptionsURLKey")] = url
    }
    if let userActivity {
      let key = UIApplication.LaunchOptionsKey(rawValue: "UIApplicationLaunchOptionsUserActivityDictionaryKey")
      launchOptions[key] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": userActivity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": userActivity,
      ]
    }
    return launchOptions.isEmpty ? nil : launchOptions
  }

  private static func openURLOptions(
    from sceneOptions: UIScene.OpenURLOptions
  ) -> [UIApplication.OpenURLOptionsKey: Any] {
    var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    if let sourceApplication = sceneOptions.sourceApplication {
      options[.sourceApplication] = sourceApplication
    }
    if let annotation = sceneOptions.annotation {
      options[.annotation] = annotation
    }
    options[.openInPlace] = sceneOptions.openInPlace
    return options
  }
}

// RCTLinkingManager 가 링크마다 올리는 알림. 이름은 RN 내부 상수(RCTLinkingManager.mm)이고 expo-router 도
// 같은 문자열을 쓴다. RN 이 이름을 바꾸면 url 이벤트가 두 번 갈 수 있지만 링크를 잃지는 않는다.
private final class LinkingManagerObserver: NSObject {
  private let expectedURL: String
  private(set) var wasNotified = false

  init(url: URL) {
    expectedURL = url.absoluteString
    super.init()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(linkingManagerDidOpenURL(_:)),
      name: Notification.Name("RCTOpenURLNotification"),
      object: nil
    )
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  @objc
  private func linkingManagerDidOpenURL(_ notification: Notification) {
    wasNotified = wasNotified || notification.userInfo?["url"] as? String == expectedURL
  }
}
`;

const withSceneDelegateFile = (config) =>
  IOSConfig.XcodeProjectFile.withBuildSourceFile(config, {
    filePath: 'SceneDelegate.swift',
    contents: SCENE_DELEGATE_SWIFT,
    overwrite: true,
  });

module.exports = function withUISceneLifecycle(config) {
  config = withSceneManifest(config);
  config = withSceneAppDelegate(config);
  config = withSceneDelegateFile(config);
  return config;
};

// 테스트용 — 순수 문자열 변환.
module.exports.patchAppDelegate = patchAppDelegate;
module.exports.MARKER = MARKER;
