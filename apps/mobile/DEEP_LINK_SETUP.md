# Deep Link 설정 가이드

정산 공유 링크(`https://nlpp.easypcb.co.kr/share/settlements/<token>`) 가 외부
브라우저·메시지 앱에서 클릭될 때 앱이 직접 열도록 설정.

코드 변경은 다음 세 곳에서 끝났다 — 운영에서 동작시키려면 **값 채워 넣기 +
재빌드** 만 남아 있다.

| 파일 | 역할 |
|---|---|
| `apps/mobile/app.config.ts` | `ios.associatedDomains` / `android.intentFilters` 정의 |
| `apps/friendly/src/modules/well-known/well-known.route.ts` | `/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json` 동적 응답 |
| `apps/friendly/src/config/env.ts` | TEAM_ID / SHA256 등 식별자 env |

---

## 1. iOS Universal Links

### 1-1. Apple Developer Team ID 확인

[developer.apple.com/account](https://developer.apple.com/account) 우측 상단 또는
Membership 페이지의 **Team ID** (10자, 예: `ABCDE12345`).

### 1-2. friendly 서버 env 채우기

```
APP_TEAM_ID=ABCDE12345
APP_BUNDLE_ID=com.niney.lifepickr
```

서버 재시작 후 확인:

```bash
curl -i https://nlpp.easypcb.co.kr/.well-known/apple-app-site-association
# 200 + JSON 이어야 함. 404 면 env 비어 있음.
```

iOS 는 `Content-Type: application/json` 받으면 OK. 별도 mime 트릭 불필요.

### 1-3. Xcode 프로젝트에 Associated Domains capability

`app.config.ts` 의 `ios.associatedDomains` 가 자동으로 capability 를 넣어주지만,
Apple Developer Portal 의 **App ID configuration** 에서 Associated Domains 가
체크돼 있는지 확인. 안 돼 있으면 Xcode 의 Signing & Capabilities 탭에서 추가.

### 1-4. 재빌드

```bash
cd apps/mobile
npx expo prebuild --clean    # ios/ android/ 새로 생성
npx expo run:ios             # 또는 EAS build
```

### 1-5. 검증

설치된 단말에서 메시지 앱 등에 링크 붙여넣고 → 길게 눌러 "Life Pickr 에서 열기"
메뉴가 뜨면 OK. iOS 가 검증 캐시를 갱신하는 데 몇 분 걸릴 수 있다.

[branch.io 검증 도구](https://branch.io/resources/aasa-validator/) 또는 Apple
공식 [App Search API Validation Tool](https://search.developer.apple.com/appsearch-validation-tool/)
로 AASA 응답을 빠르게 확인 가능.

---

## 2. Android App Links

### 2-1. 서명 키 SHA-256 추출

#### EAS Build 사용 시

```bash
cd apps/mobile
eas credentials                    # 메뉴에서 Android → Keystore: Manage everything
# → "Show all credentials" 선택 → SHA256 Fingerprint 행 복사
```

#### 로컬 keystore 사용 시

```bash
keytool -list -v -keystore <your.keystore> -alias <your-alias> \
  | grep -i 'SHA256:'
# 결과 예: SHA256: AA:BB:CC:...:FF
```

디버그 빌드도 검증되게 하려면 디버그 keystore 의 fingerprint 도 같이 넣기:

```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey \
  -storepass android -keypass android | grep -i 'SHA256:'
```

### 2-2. friendly 서버 env 채우기

```
ANDROID_APP_PACKAGE=com.niney.lifepickr
ANDROID_SHA256_FINGERPRINTS=AA:BB:CC:DD:...:FF,11:22:33:...:99
```

쉼표 구분으로 여러 개 가능 (릴리스 + 디버그).

서버 재시작 후 확인:

```bash
curl -i https://nlpp.easypcb.co.kr/.well-known/assetlinks.json
```

### 2-3. 재빌드 + 자동 검증 트리거

```bash
cd apps/mobile
npx expo prebuild --clean
npx expo run:android
```

설치 직후 OS 가 백그라운드에서 `/.well-known/assetlinks.json` 을 자동 검증.
검증 결과 확인:

```bash
adb shell pm get-app-links com.niney.lifepickr
# Domain verification state: verified
```

`verified` 가 아니면 fingerprint 가 안 맞거나 서버 응답 문제. 강제 재검증:

```bash
adb shell pm verify-app-links --re-verify com.niney.lifepickr
```

### 2-4. 검증

```bash
adb shell am start -W -a android.intent.action.VIEW \
  -d "https://nlpp.easypcb.co.kr/share/settlements/test-token"
```

앱이 직접 열려야 OK. "어떤 앱으로 열까요?" 다이얼로그가 뜨면 검증 실패.

---

## 3. 호스트 변경 (dev / staging)

`EXPO_PUBLIC_WEB_HOST=staging.example.com` 으로 두면 `app.config.ts` 가 이 값을
읽어 associatedDomains/intentFilters 를 다르게 박는다. 모바일 prebuild + 새
빌드가 필요하다 (네이티브 config 라 hot reload 불가).

friendly 서버는 호스트와 무관하게 `.well-known` 라우트를 그대로 응답하므로
DNS 만 잡혀 있으면 OK.

---

## 4. 동작 흐름 요약

```
사용자가 카톡으로 받은 https://nlpp.easypcb.co.kr/share/settlements/xxx 를 탭
  │
  ├─ 앱 설치 안 됨 → 모바일 Safari/Chrome 이 SharedSettlementPage 웹 SPA 로 진입
  │
  └─ 앱 설치 됨, App Links / Universal Links 검증 통과
       → 시스템이 의도(intent)를 앱으로 라우팅
       → expo-router 가 path /share/settlements/[token] 매칭
       → apps/mobile/app/share/settlements/[token].tsx 마운트
       → useSharedSettlement(token) 호출 → 결과 표시
```

검증이 실패한 미설치 / 사용자가 명시적으로 "브라우저로 열기" 선택 케이스 모두
같은 URL 로 웹이 폴백하므로 사용자 경험은 깨지지 않는다.

---

## 5. 트러블슈팅

| 증상 | 원인 / 대처 |
|---|---|
| iOS 가 항상 Safari 로만 열림 | (1) AASA 응답 200/JSON 인지 확인. (2) 단말 재시작 또는 앱 재설치. iOS 가 검증 결과를 24h 캐시한다. (3) iOS 14+ 는 디바이스 단위로 캐시 → `Settings > Developer > Universal Links > Diagnostics` 로 검증 상태 확인. |
| Android 가 "어떤 앱?" 다이얼로그를 띄움 | `pm get-app-links` 로 `Domain verification state` 확인. `verified` 아니면 fingerprint 불일치 — `eas credentials` 로 다시 확인 후 env 갱신. |
| .well-known 404 | env 비어 있거나 친절 서버에 변경 적용 안 됨. 컨테이너/PM2 재시작 필요. |
| Caddy/Nginx 가 .well-known 가로챔 | 리버스 프록시가 정적 처리하지 않게 friendly 로 패스해야 함. `proxy_pass` 또는 `reverse_proxy` 설정 확인. |
