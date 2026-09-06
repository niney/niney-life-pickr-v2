---
topic: saju-g
last_compiled: 2026-09-07
sources_count: 35
status: active
aliases: [사주, 사주(G), saju-g, 명식, 만세력, 오행, 일간, 십성, 절기, 음력, 윤달, 궁합, 출생 프로필, kimi-k3, saju-g-reading, SajuGPage, SajuGPairPage]
---

# saju-g — 사주(G), 나의 오행 지도

2026-09-06 신설. 사용자가 Kimi 고려와 나머지 추천안 진행을 승인했다. 개인 사주·올해·오늘, 후속 승인한 출생 프로필·두 사람의 궁합을 웹에 제공한다. 앱·대운은 후속 범위다. 전체 위키 재컴파일과 별개로 이번 변경의 소스를 직접 읽어 반영한 토픽이다.

추가 명칭 변경: 공개 이름은 `사주(G)`, 웹은 `/saju-g`·`/me/saju-g`, API는 `/api/v1/saju-g`다. `Routes.SajuG.sharePage`가 `/saju-g/s/:token`을 반환하며 생성 응답·OG가 함께 사용한다. 내부 모듈·타입·함수·CSS·캐시·DB·로컬 저장소·AI purpose도 새 식별자로 전환하고 기존 값을 이전한다.

## 흐름 [coverage: high — 5 sources]

`SajuGBirthForm → useSajuGReading → POST chart → 명식 먼저 표시 → POST readings → AI/기본 풀이`. 입력 수정·언마운트·계정 전환 시 이전 응답을 반영하지 않는다. 공개 라우트 `/saju-g`, 보관함 `/me/saju-g`, 공유 `/saju-g/s/:token`이다. 3D는 lazy R3F 천문대이며 모션 줄이기·WebGL 미지원 시 SVG/정적 화면으로 대체한다. 장식 전체에 pointer-events를 막아 작은 화면의 버튼을 가로채지 않는다.

## 계산 관례 [coverage: high — 6 sources]

`calculateSajuG`가 한국 음양력 변환과 실제 출생 순간을 정규화한다. 한국 음력은 `korean-lunar-calendar`, 절기는 `lunar-typescript`, 법정시 입력은 Temporal Asia/Seoul을 쓴다. 연주·월주는 실제 절입 순간, 일주·시주는 당시 **표준시(DST 제외)** 기준이다. 기본은 자정 일주 전환이며 23시 시주도 그날 일간을 사용한다. 선택으로 23시 전환을 지원한다. 지역 태양시 보정은 없다.

1900년부터 현재까지 대한민국 출생을 지원한다. 없는 윤달·날짜·미래일·DST 누락 시각은 거절한다. 중복 시각은 전/후 선택을 요구한다. 시간 모름·범위·절입 분 경계는 가능한 기둥을 비교하고 달라지는 기둥을 비운다. 시각 모름을 정오로 치환하지 않는다. 오행 구성은 **확정된 표면 글자 개수**다. 일간 미확정이면 일간 관계도 보류한다. 지장간을 표시하지만 개수만으로 용신이나 강약을 만들지 않는다.

KASI 2023·2026년 월력요항의 음력 월초/일진 25건·절입 24건과 IANA 표준시 변경 4건을 고정 fixture로 대조한다. 53개 통과, 절입의 분 단위 공표값과 최대 28초 차이. 음력 월건을 사주의 절기 월주로 오인해 비교하지 않는다. 계산 관례의 재현성 검증이며 미래 예측 검증은 아니다.

## AI·한도 [coverage: high — 5 sources]

`OLLAMA_SAJU_G_MODEL=kimi-k3`, purpose `saju-g`, quota feature `saju-g-reading`. 기존 키 상속·AdapterCache·공통 SQLite 한도를 사용한다. API에는 구조화 명식이 먼저 있고 LLM은 그 근거 ID·기간 관계와 질문으로 해석한다. 원본 생년월일·정확한 시각·계정은 모델에 보내지 않는다. 원본 질문은 지시가 아닌 데이터로 취급한다.

프롬프트 v3는 모델에 오행 개수 대신 상징 의미를 전달하고 개수→성격 강약·능력 결핍 연결을 금지한다. Zod 형식, 섹션 순서, 근거 ID, 허용 한글/한자 간지·일간, 점수·확률, 긴 질문 원문 재인용, 문단 통째 중복, 올해/오늘 주제의 기간 근거를 검사한다. 같은 모델에서 최대 1회 재시도, 전체 60초 후 기본 풀이를 제공한다. 같은 소유자의 동시 요청은 합류하며 캐시는 입력·기간·계산/프롬프트 버전·모델을 포함한다. 성공한 AI만 캐시하므로 기본 풀이 뒤 즉시 재시도할 수 있다.

최신 v3 합성 사례: K3 12/12 첫 호출 통과·중앙 12.574초. 이전 v2 비교: K3 10/10·10.62초, DeepSeek V4 Pro 10/10·6.73초. 이는 출력 검사 통과율이며 모든 해석의 타당성을 증명하지 않는다. 상세 수치는 [모델 평가](../../apps/friendly/research/saju-g/README.md) 참고.

## 보관·공유 [coverage: high — 5 sources]

기본 조회는 메모리만 사용한다. 회원 보관은 소유자 영수증으로 `SajuGReading.snapshotJson`에 명식·풀이·출생 입력을 저장하며 `(userId, requestKey)`가 유일하다. 기본 풀이를 저장해도 추후 AI 생성을 막지 않는다. 게스트 기기 보관은 principal별 localStorage 최근 20개이며 자동 저장하지 않는다.

회원 저장 시 같은 입력의 캐시·영수증에 저장 ID를 반영한다. 삭제하면 연결된 캐시·영수증도 무효화해 이전 탭의 영수증으로 삭제 결과를 되살리거나 공유하지 못하게 한다. 공유·회원 보관 화면은 공통 설정과 별도로 탭 복귀 시 재조회하며 오류 응답에 이전 상세 카드를 숨긴다.

공유는 `SajuGShare.publicJson`의 허용 필드만 공개한다. 생년월일·시간·원본 명식·질문·AI 자유문장은 공개하지 않는다. 게스트의 오래된 로컬 결과도 출생 입력을 서버에서 다시 계산해 공유할 수 있다. 보기 토큰과 취소 자격증명은 별개이며 후자는 생성 브라우저의 저장소에 남는다. 회원 저장 결과에 연결한 공유는 결과 삭제 시 cascade한다. 독립 공유는 각각 취소한다.

새 공유 ID는 타로와 같은 7바이트 CSPRNG/base64url 10자다. `SajuGShareToken`이 새 10자·기존 32자를 API와 OG에서 동일하게 검증한다. 취소 키·영수증은 32자를 유지한다. DB 저장의 P2002 충돌에 대해 총 5회까지 저장을 시도해 조회 후 저장 사이의 경쟁도 처리한다. 소진 시 공유 생성 라우트가 명시적인 503을 반환한다(공통 오류 처리기는 5xx를 500으로 정규화하므로 제어된 응답을 직접 보낸다). 기존 링크나 DB 행을 갱신하는 migration은 없다.

PNG는 1080×1440, 공개 이미지의 CORP는 cross-origin이며 no-store다. 이미지 캐시를 읽기 전에 DB 행 존재를 확인한다. OG는 공통 web-index helper를 사용하고 취소 후 404·일반 문구를 반환한다. nginx `/saju-g/s/` 프록시가 필요하다.

## 검증·운영 [coverage: medium — 4 sources]

후속 프로필·궁합 검토와 검증은 [추가 구현 기록](../../docs/REVIEW-saju-g-profiles-pair.md)을 따른다. 사주/AI/한도/타로 175개, 웹 107개, shared 68개, utils 246개가 통과했다. 아래 수치는 최초 개인 사주 검토 당시 기록이다.

`useSchemaDatabase`는 현재 Prisma 스키마에서 빈 임시 DB를 만들어 실제 데이터를 복사하거나 운영 DB를 건드리지 않는다. 사주 계산·저장·접근 통제·공유 취소·PNG, 웹의 날짜 입력·먼저 표시·취소·명시적 저장·캐시 무효화를 테스트한다. 사주/AI/한도 124개, 타로 32개, 웹 전체 103개가 통과했다. 타로의 구형 DB fixture도 빈 현재 스키마 DB 방식으로 변경했다. 브라우저 검수는 1440px·390px·Lite/모션 줄이기에서 실시했다.

리베이스 전 G 단독 구현의 `20260906090000_add_saju`는 당시 임시 DB에서 검증했다. 현재 G 생성 migration은 `20260906170000_add_saju_g`다. 이 작업에서 운영 마이그레이션·배포는 실행하지 않았다. 지원 범위와 후속 항목은 [구현 명세](../../docs/PLAN-saju-g.md)를 참고한다.

같은 날 실제 서버를 추가 검증했다. 기본 DB의 사주·한도 테이블 누락을 확인하고 `.tmp/saju-g-runtime/local.db` 복사본에 미적용 마이그레이션 10개를 적용했다. 실제 서버 3000 + 웹 5173에서 v2 Kimi K3 HTTP 요청 8건이 모두 AI 응답으로 완료되었다(약 8.46~15.88초). v3에서도 실제 K3 응답 1건(14.729초)으로 회원 보관·공유·PNG 다운로드·삭제에 따른 공유 취소를 재확인했다. 원본 DB와 `.env`는 변경하지 않았으며 복사본의 외부 자동 작업은 비활성화했다. [최종 검토 기록](../../docs/REVIEW-saju-g.md)을 참고한다.

## 출생 프로필 [coverage: high — 5 sources]

`/me/saju-g/profiles`에서 별명·출생 입력을 최대 20명까지 관리한다. 회원은 `SajuGProfile`의 소유자 API, 게스트는 `lp:saju-g-profiles:v1:guest` 기기 저장소다. 로그인 시 게스트 입력을 자동 업로드하지 않는다. 저장 전에 명식 엔진으로 윤달·미래일·DST를 검증한다. 서버 트랜잭션과 클라이언트 직렬 큐/Web Locks, 양쪽 `revision` 검사로 수정 충돌을 감지한다. 저장 실패를 숨기거나 오래된 프로필을 밀어내지 않는다.

현재 결과·보관함에서 프로필 생성, 프로필의 나의 사주·오늘·올해 및 궁합 바로가기를 지원한다. 링크는 프로필 ID만 전달한다. 캐시된 프로필의 자동 읽기는 취소 가능한 microtask에서 시작해 StrictMode cleanup 후 로딩이 남는 문제를 방지한다. 계정별 Query 키, 탭 복귀 재조회, 게스트 storage 이벤트로 외부 변경을 반영한다. 프로필 삭제와 별도로 저장한 풀이·독립 공유 삭제는 분리되어 있다.

초기 G 단독 구현의 프로필 migration은 리베이스 과정에서 `20260906170000_add_saju_g`로 통합했다. 현재는 C 테이블과 분리된 G 테이블을 직접 생성하며 운영 적용은 별도다.

## 두 사람의 궁합 [coverage: high — 7 sources]

`/saju-g/pair`는 프로필 2명 또는 직접 입력, 관계 4종과 선택 질문을 받는다. `pair/chart → 결정적 관계 먼저 표시 → pair/readings` 순서다. `calculateSajuGPair`는 각자의 기존 명식을 재사용해 일간 오행의 같음/양방향 상생/양방향 상극과 상호 십성을 계산한다. 미확정 일간이 하나라도 있으면 관계와 상호 십성을 보류한다. 지지 합충·용신·대운과 궁합 점수는 계산하지 않는다.

궁합 프롬프트 v2는 모델에 상징·관계·상호 십성·범위만 제공하며 개별 기둥과 개수·원본 출생정보·별명을 제외한다. v1에서 미확정 일간을 연주·월주로 대체한 설명이 나와 입력 근거를 좁혔다. 기존 `saju-g` 모델과 `saju-g-reading` 한도를 공유한다. 60초/최대 두 호출, 소유자별 동시 합류, 성공 AI만 24시간/200건 캐시다. v2 실제 K3 9/9 첫 호출 검사 통과·중앙 10.875초. 상징에 기댄 일반화·문장 일부 반복·오탈자는 남는다.

두 오행 지도를 SVG 궤도와 빛으로 연결하고 오행별 강조·모션 줄이기를 지원한다. 입력/계정/프로필 변경은 이전 응답을 무효화한다. 궁합 해석은 자동 보관하지 않는다. 공유는 기존 토큰·취소·PNG·OG 흐름을 재사용하고 `PublicSajuGShare.pair`에 두 번째 상징·개수·관계 코드를 담는다. 생년월일·별명·질문·선택 관계 유형·AI 자유문장은 공개하지 않는다. 첫 번째 사람은 기존 루트 필드이므로 개인 공유와 호환된다.

## 전체 식별자 전환 [coverage: high — 6 sources]

현재 이름은 `SajuG*` / `sajuG*` / `SAJU_G_*`, 폴더·CSS·캐시·AI purpose는 `saju-g`, 사용량 feature는 `saju-g-reading`, DB는 `saju_g_*`다. `20260906170000_add_saju_g`가 G 테이블을 독립 생성한다. 원격 사주(C)의 saju_* 테이블·saju 모델 용도·saju-reading 카운터를 G로 옮기지 않는다. C의 공개 migration은 유지하고, 충돌하던 미배포 G migration 3개만 독립 생성 방식으로 정리했다. G 생성이 실패하면 전체를 롤백한다.

기기 프로필·풀이·공유 취소 자격도 첫 접근 때 새 저장소로 이전한다. 새 값의 쓰기/확인 후 원본 키를 정리하며, 실패 시 원본을 보존하고 변경 작업을 중단한다. Query 캐시도 새 이름을 사용한다. G는 `OLLAMA_SAJU_G_MODEL`, C는 `OLLAMA_SAJU_MODEL`을 독립 사용하며 상호 fallback은 없다. [전환 문서](../../docs/MIGRATION-saju-g.md)에 범위와 절차를 기록했다.

새 migration 2개·저장소 이전 10개를 포함해 API/사주/AI/한도/타로 177개, 웹 107개, shared 78개, utils 246개가 통과했다. 실행용 복사본의 공유 3개와 카운터 22개를 이전 전후 대조했고 현재 Prisma 스키마와 차이가 없다.

## 사주(C) 통합 [coverage: high — 6 sources]

2026-09-07 리베이스: 원격 C 구현은 /saju-c 및 /api/v1/saju-c, 로컬 G는 /saju-g 및 /api/v1/saju-g로 함께 제공한다. 양쪽 모듈·배럴 export·Prisma 모델·메뉴·AI 용도·한도 및 nginx 공유 경로를 모두 연결했다. C 프로필 키 saju-profiles-v1과 G의 이전 프로필 키도 서로 다르다. C 세부 구현은 [사주(C) 명세](../../docs/PLAN-saju.md), 독립 DB 생성은 [통합 이전 문서](../../docs/MIGRATION-saju-g.md)를 참고한다.

통합 타입 검사 6개 작업, API 202개·웹 116개·shared 81개·utils 307개가 통과했다. 전체 migration을 빈 DB에 적용해 현재 Prisma 스키마와 일치함을 확인했다. 아래 소스 목록은 G 기능 기준이며 전체 위키 재컴파일은 아니다.

## Sources [coverage: high — 35 sources]

- [입력·응답 계약](../../packages/api-contract/src/schemas/saju-g.ts)
- [경로 계약](../../packages/api-contract/src/routes.ts)
- [상징·관계 표](../../packages/utils/src/saju-g.ts)
- [계산 엔진](../../apps/friendly/src/modules/saju-g/saju-g.engine.ts)
- [프롬프트·검증](../../apps/friendly/src/modules/saju-g/saju-g.prompts.ts)
- [서비스](../../apps/friendly/src/modules/saju-g/saju-g.service.ts)
- [라우트](../../apps/friendly/src/modules/saju-g/saju-g.route.ts)
- [PNG](../../apps/friendly/src/modules/saju-g/saju-g-share-card.ts)
- [OG](../../apps/friendly/src/modules/saju-g/saju-g-preview.ts)
- [공통 훅](../../packages/shared/src/hooks/useSajuG.ts)
- [보관 스토어](../../packages/shared/src/stores/sajuGHistoryStore.ts)
- [사주 페이지](../../apps/web/src/routes/SajuGPage.tsx)
- [웹 컴포넌트](../../apps/web/src/components/saju-g/)
- [명식 테스트](../../apps/friendly/src/modules/saju-g/saju-g.engine.test.ts)
- [외부 자료 대조 테스트](../../apps/friendly/src/modules/saju-g/saju-g.reference.test.ts)
- [KASI 고정 자료](../../apps/friendly/src/modules/saju-g/__fixtures__/kasi-calendar.json)
- [서비스 테스트](../../apps/friendly/src/modules/saju-g/saju-g.test.ts)
- [웹 테스트](../../apps/web/src/routes/SajuGPage.test.tsx)
- [임시 DB](../../apps/friendly/src/test-utils/schema-db.ts)
- [프로필 서비스](../../apps/friendly/src/modules/saju-g/saju-g-profile.service.ts)
- [궁합 계산](../../apps/friendly/src/modules/saju-g/saju-g-pair.engine.ts)
- [궁합 프롬프트](../../apps/friendly/src/modules/saju-g/saju-g-pair.prompts.ts)
- [궁합 서비스](../../apps/friendly/src/modules/saju-g/saju-g-pair.service.ts)
- [프로필 훅](../../packages/shared/src/hooks/useSajuGProfiles.ts)
- [프로필 저장소](../../packages/shared/src/stores/sajuGProfileStore.ts)
- [궁합 훅](../../packages/shared/src/hooks/useSajuGPair.ts)
- [프로필 화면](../../apps/web/src/routes/SajuGProfilesPage.tsx)
- [궁합 화면](../../apps/web/src/routes/SajuGPairPage.tsx)
- [프로필·궁합 API 테스트](../../apps/friendly/src/modules/saju-g/saju-g-pair.test.ts)
- [프로필·궁합 웹 테스트](../../apps/web/src/routes/SajuGNext.test.tsx)
- [프로필 저장소 테스트](../../packages/shared/src/stores/sajuGProfileStore.test.ts)
- [이름 전환 migration](../../apps/friendly/prisma/migrations/20260906170000_add_saju_g/migration.sql)
- [DB 이전 검증](../../apps/friendly/src/modules/saju-g/saju-g-migration.test.ts)
- [이전 기기 키 정의](../../packages/shared/src/stores/sajuGStorageMigration.ts)
- [기기 저장소 이전 검증](../../packages/shared/src/stores/sajuGStorageMigration.test.ts)
