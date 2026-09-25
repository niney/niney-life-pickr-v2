# 앱 iOS 빌드 문제 해결

## 증상 — 디버그 전용 심볼이 통째로 없다

Xcode(또는 `expo run:ios`)에서 링크가 이렇게 깨진다.

```
Undefined symbol: facebook::react::Sealable::Sealable()
Undefined symbol: facebook::react::ShadowNode::getDebugName() const
Undefined symbol: vtable for facebook::react::DebugStringConvertible
Undefined symbol: facebook::hermes::inspector_modern::chrome::enableDebugging(...)
```

빠진 심볼이 전부 **`getDebug*` · `DebugStringConvertible` · `Sealable` · hermes inspector** 라는 게
단서다. 이것들은 RN 이 `NDEBUG` 가 없을 때(=Debug)만 컴파일하는 코드다. 즉 **React 쪽은 Release 로,
우리 코드(ExpoModulesCore 등)는 Debug 로** 컴파일된 불일치다.

## 원인 — prebuilt React Native 아티팩트가 Release 로 깔린다

이 앱은 RN 을 소스에서 빌드하지 않고 **미리 빌드된 바이너리**를 쓴다(`ios/Podfile`).

```ruby
ENV['RCT_USE_RN_DEP'] ||= '1'
ENV['RCT_USE_PREBUILT_RNCORE'] ||= '1'
```

`pod install` 은 Debug/Release 타르볼을 **둘 다** 내려받고(`ios/Pods/ReactNativeCore-artifacts/`),
빌드 시 `React-Core-prebuilt.podspec` 의 스크립트 단계가 설정에 맞는 쪽으로 교체한다. 그런데 그
교체 스크립트에 이런 가정이 있다.

```js
// Assumption: if there is no stored last build, we assume that it was build for debug.
if (!fileExists && configuration === 'Debug') return false;  // 교체 안 함
```

`pod install` 직후에는 상태 파일(`React-Core-prebuilt/.last_build_configuration`)이 없는데 **실제로
깔린 건 Release** 다. 그래서 스크립트가 "이미 Debug 겠지" 하고 교체를 건너뛰고, Debug 빌드가
Release 바이너리를 링크하다 실패한다. **네이티브 의존성을 추가해 `pod install` 을 돌릴 때마다 재발한다.**

## 해결 — 상태 파일을 Release 로 적고 교체를 강제한다

```bash
cd apps/mobile/ios/Pods
printf 'Release' > React-Core-prebuilt/.last_build_configuration
node ../../../../node_modules/react-native/scripts/replace-rncore-version.js \
  -c Debug -r "$(node -p "require('react-native/package.json').version")" -p "$PWD"
```

확인 — 0 이 아니어야 한다.

```bash
nm -gU React-Core-prebuilt/React.xcframework/ios-arm64_x86_64-simulator/React.framework/React \
  | grep -c DebugStringConvertible
```

그 뒤 평소대로 빌드하면 통과한다(실측 2026-08-23: Xcode 26.6 / RN 0.81.5 / New Arch).

## 증상 — Xcode 27 로 빌드하면 iOS 27 에서 실행 즉시 종료

```
Application failed to launch: UIScene life cycle is required for apps built with this SDK.
```

iOS 27 SDK(Xcode 27)로 링크된 앱은 **UIScene 생명주기**를 써야 iOS 27 에서 뜬다. 차단은 iOS 27 런타임만
하고, iOS 26 이하는 경고만 남긴다(같은 빌드가 iOS 26.5 시뮬레이터에서는 뜬다, 실측 2026-09-25). 배포 대상
버전과는 무관하다. Expo SDK 54 템플릿은 AppDelegate 가 창을 직접 만드는 옛 방식이고, Expo 템플릿은
SDK 58 에서야 SceneDelegate 로 바뀌었다.

## 해결 — `plugins/with-uiscene-lifecycle.js`

prebuild 때마다 세 가지를 적용한다(멱등).

- Info.plist 에 `UIApplicationSceneManifest`(단일 장면 → `SceneDelegate`).
- AppDelegate 의 창 생성·`startReactNative` 블록 제거. RN 팩토리 생성은 그대로.
- `ios/LifePickr/SceneDelegate.swift` 생성·앱 타깃 등록. 장면에서 창을 만들어 RN 을 시작하고, 콜드 스타트
  URL·유니버설 링크를 launchOptions 로 되살린다(RN `Linking.getInitialURL()` 은 launchOptions 만 읽는다).
  URL·사용자 활동·생명주기 이벤트는 AppDelegate 로 되넘겨 Expo 구독자(expo-linking·expo-router)가 그대로
  돌고, AppDelegate 가 이미 RCTLinkingManager 를 불렀으면 다시 알리지 않는다(url 이벤트 중복 방지).
  Expo SDK 58 의 `ExpoAppSceneDelegate` + `SceneEventForwarder` 를 옮긴 것이다.

기존 `ios/` 에 반영할 때는 pod install 이 필요 없으니 위의 prebuilt RN 문제를 피해 이렇게 돌린다.

```bash
cd apps/mobile && npx expo prebuild --platform ios --no-install
```

Expo SDK 58 이상으로 올리면 템플릿이 같은 일을 하므로 이 플러그인을 지운다. 남겨 두면 AppDelegate 패턴을
못 찾아 prebuild 가 실패한다 — RN 이 두 번 뜨는 것을 막는 의도된 안전장치다.

## 증상 — Xcode 27 에서 `pnpm dev:ios`(expo run:ios)가 빌드 전에 멈춘다

```
CommandError: Can't determine id of Simulator app; the Simulator is most likely not installed on this machine.
```

Xcode 27 은 Simulator.app 을 **DeviceHub.app**(`com.apple.dt.Devices`)으로 바꾸고 위치도
`Contents/Developer/Applications` → `Contents/Applications` 로 옮겼다. Expo CLI 54 는 "Simulator" 라는 이름·번들 ID
만 찾기 때문에 실행 조건 검사에서 실패한다. Xcode 에서 직접 실행하면 이 검사를 거치지 않아 된다.
Expo 는 `@expo/cli` 57.0.27(2026-09-24)에서 고쳤고 54.x 에는 백포트하지 않았다.

## 해결 — `patches/@expo__cli@54.0.24.patch`

57.0.27 의 수정 세 곳을 설치된 54.0.24 에 옮긴 pnpm 패치다(루트 `package.json` 의 `pnpm.patchedDependencies`).

- 실행 조건 검사: "Simulator" 가 없으면 "DeviceHub" 를 찾고 `com.apple.dt.Devices` 를 허용한다.
- 시뮬레이터 앱 확인·실행: DeviceHub 프로세스도 세고, `open -a Simulator` 가 실패하면
  `devices://device/open?id=<UDID>` 로 해당 기기를 연다.
- 창 앞으로 가져오기: Simulator 가 없으면 DeviceHub 를 활성화한다.

`pnpm install` 이 자동으로 적용한다. `expo` 를 올려 `@expo/cli` 버전이 바뀌면 pnpm 이 패치 대상 버전을 못
찾았다고 경고하니, 그때 새 버전에 수정이 들어 있는지 보고 패치를 지우거나 다시 만든다(SDK 57 이상은 불필요).

iOS 27 시뮬레이터에서는 CLI 가 앱을 dev-client URL(`…://expo-development-client/?url=…`)로 여는 순간
"'Life Pickr'에서 열겠습니까?" 확인창이 뜬다. iOS 27 이 외부에서 여는 사용자 지정 스킴마다 묻는 것이라
Expo 57 CLI 도 같다. **열기**를 누르면 앱이 뜨고, expo-router 는 이 URL 을 첫 화면으로 처리한다.
iOS 26 이하 시뮬레이터는 확인창 없이 바로 열린다.

## 증상 — Xcode 27 에서 Pod 배포 대상이 오류로 막힌다

```
error: The iOS Simulator deployment target 'IPHONEOS_DEPLOYMENT_TARGET' is set to 9.0, but the range of supported
deployment target versions is 15.0 to 27.0.x. (in target 'SDWebImage-SDWebImage' from project 'Pods')
```

Xcode 26 까지는 경고였던 것이 Xcode 27 에선 오류다. 오래된 podspec(SDWebImage 9.0, RNCAsyncStorage 리소스 번들 13.4 등)이
그대로 걸린다. Xcode 에서 손으로 올려도 `pod install` 이 `Pods.xcodeproj` 를 다시 만들면 되돌아간다.

## 해결 — `plugins/with-pod-deployment-target.js`

Podfile `post_install` 에 앱 배포 대상(`platform :ios`, 기본 15.1)보다 낮은 Pod 타깃만 그 값으로 끌어올리는 블록
(`# @pod-deployment-target-fix`)을 넣는다. prebuild 가 Podfile 을 재생성해도 다시 들어간다. 반영:

```bash
cd apps/mobile && npx expo prebuild --platform ios --no-install
cd ios && LANG=en_US.UTF-8 pod install   # 그 뒤 위 "prebuilt RN" 확인
```

## 곁다리로 겪는 것들

- **CocoaPods 가 UTF-8 로케일을 요구한다.** `LANG` 이 비어 있으면 `pod install` 이
  `Unicode Normalization not appropriate for ASCII-8BIT` 로 죽는다 → `LANG=en_US.UTF-8` 를 주고 실행.
- **`ENABLE_DEBUG_DYLIB=NO` 로 우회하지 말 것.** SwiftUICore 에러는 사라지지만 New Architecture
  링크가 깨져 더 나빠진다.
- **`xcodebuild ... OTHER_LDFLAGS=...` 로 CLI 에서 덮어쓰지 말 것.** pod 가 넣어 준 `-l"React-*"`
  플래그가 통째로 사라진다. 굳이 넣으려면 `Pods/Target Support Files/...xcconfig` 에 **덧붙인다**.
- 네이티브 모듈이 새로 추가된 커밋을 받으면 **JS 만 리로드해선 안 되고 재빌드**해야 한다. 안 그러면
  `Cannot find native module 'XXX'` 로 그 화면이 죽는다.
