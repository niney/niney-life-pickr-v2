# 앱 운영 빌드 가이드

Metro(8081) 없이 동작하는 운영 빌드를 만드는 방법.
JS 번들이 앱에 인라인 임베드되므로 실행 시 개발 서버가 필요 없다.

## 1. 환경변수 파일 규칙

Expo는 모드별로 자동 로드되는 파일명이 정해져 있다.

| 파일명 | 자동 로드 | 비고 |
|---|---|---|
| `.env` | 모든 모드 | 공통 |
| `.env.local` | 모든 모드 | git ignored, dev에서 주로 사용 |
| `.env.development` | development | `expo start` |
| `.env.production` | production | `run:* --release` / `expo export` / EAS production |
| `.env.prod` 등 임의명 | ❌ | dotenv-cli로 명시 주입 필요 |

운영 빌드는 production 모드로 떨어지므로 운영용 변수는 **`.env.production`** 으로 둬야 자동 로드된다.

```
apps/mobile/.env.production
EXPO_PUBLIC_API_URL=https://ninelife.kr
```

`EXPO_PUBLIC_*` 접두사 값만 클라이언트 번들에 인라인 박힘. 빌드 시점에 굳기 때문에 런타임 변경 불가.

임의 파일명을 유지하려면 dotenv-cli로 강제 주입.

```bash
pnpm dlx dotenv-cli -e .env.prod -- pnpm expo run:ios --configuration Release
```

## 2. 로컬 Release 빌드 — 시뮬레이터 / 에뮬레이터

가장 빠른 검증 경로. 네이티브 프로젝트를 Release 컨피그로 빌드하고 자동 설치한다.

```bash
cd apps/mobile

# iOS 시뮬레이터
pnpm expo run:ios --configuration Release

# Android 에뮬레이터
pnpm expo run:android --variant release
```

`.env.production`이 있으면 별도 변수 지정 불필요.

## 3. 로컬 Release 빌드 — 실기기

### Android 실기기

USB 디버깅만 켜져 있으면 명령어 한 줄.

```bash
adb devices                                          # 연결 확인
cd apps/mobile
pnpm expo run:android --variant release --device
```

- 단말이 1개면 `--device` 생략 가능
- 빌드된 APK가 자동 설치됨, 아이콘 눌러 실행

### iOS 실기기

최초 1회 Xcode에서 서명 설정이 필요.

```bash
# 1) 최초 1회: Xcode에서 Team 선택
open apps/mobile/ios/mobile.xcworkspace
#    → Target > Signing & Capabilities > Team
#    무료 Apple ID도 가능 (7일 만료) / 유료 $99/년 (1년 유효)

# 2) CLI로 Release 빌드 + 설치
cd apps/mobile
pnpm expo run:ios --configuration Release --device
```

설치 후 첫 실행 시 폰에서 **설정 → 일반 → VPN 및 기기 관리** 에서 개발자 프로파일 "신뢰" 필요.

## 4. EAS Build — 배포용 정식 빌드

`eas.json`에 `preview` / `production` 프로파일이 정의되어 있다.

```bash
cd apps/mobile

# 사내/지인 배포용 (ad-hoc / APK)
eas build --profile preview --platform android      # APK 파일
eas build --profile preview --platform ios          # ad-hoc ipa

# 스토어 배포용
eas build --profile production --platform all
```

빌드 완료 시 EAS가 다운로드 링크 + QR을 제공.

### EAS 환경변수 등록

`.env.production`을 로컬에만 두면 EAS 서버에서 못 읽음. EAS env로 등록한다.

```bash
eas env:create --environment production \
  --name EXPO_PUBLIC_API_URL \
  --value https://ninelife.kr
```

`eas env:list --environment production` 으로 확인.

## 5. 번들만 추출 (`expo export`)

네이티브 프로젝트에 미리 번들을 박아 Xcode/Android Studio에서 직접 Archive 할 때만 사용.

```bash
pnpm --filter mobile build
# → apps/mobile/dist/ 에 _expo/static/... 번들 + 에셋
```

일반적으로는 2~4번이 더 편하다.

## 선택 가이드

| 목적 | 추천 |
|---|---|
| 운영 변수로 빠르게 동작 확인 | 2번 (시뮬레이터/에뮬레이터 Release) |
| 실기기에서 QA | 3번 |
| 외부에 .apk/.ipa 전달, TestFlight, 스토어 제출 | 4번 (EAS) |
| Xcode/Android Studio에서 수동 Archive | 5번 |

## 트러블슈팅

- **빌드 후에도 옛 API URL이 박혀 있음** → `EXPO_PUBLIC_*`은 빌드 시점에 굳음. 환경변수 바꾼 뒤 재빌드 필요.
  - 캐시 의심되면 `pnpm --filter mobile clean` 후 재시도.
- **Android Release 설치 실패 (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`)** → 기존 dev 빌드가 깔려 있어 서명이 다른 경우. `adb uninstall <packageName>` 후 재설치.
- **iOS 실기기에서 "신뢰할 수 없는 개발자"** → 설정 → 일반 → VPN 및 기기 관리에서 프로파일 신뢰.
- **`.env.production` 적용 안 됨** → 파일명 오타 확인 (`.env.prod` ❌). 빌드 명령 앞에 변수를 직접 명시해 확인.
