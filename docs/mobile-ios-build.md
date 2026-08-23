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

## 곁다리로 겪는 것들

- **CocoaPods 가 UTF-8 로케일을 요구한다.** `LANG` 이 비어 있으면 `pod install` 이
  `Unicode Normalization not appropriate for ASCII-8BIT` 로 죽는다 → `LANG=en_US.UTF-8` 를 주고 실행.
- **`ENABLE_DEBUG_DYLIB=NO` 로 우회하지 말 것.** SwiftUICore 에러는 사라지지만 New Architecture
  링크가 깨져 더 나빠진다.
- **`xcodebuild ... OTHER_LDFLAGS=...` 로 CLI 에서 덮어쓰지 말 것.** pod 가 넣어 준 `-l"React-*"`
  플래그가 통째로 사라진다. 굳이 넣으려면 `Pods/Target Support Files/...xcconfig` 에 **덧붙인다**.
- 네이티브 모듈이 새로 추가된 커밋을 받으면 **JS 만 리로드해선 안 되고 재빌드**해야 한다. 안 그러면
  `Cannot find native module 'XXX'` 로 그 화면이 죽는다.
