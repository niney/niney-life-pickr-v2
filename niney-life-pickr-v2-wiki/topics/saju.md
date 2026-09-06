---
topic: saju
last_compiled: 2026-09-06
sources_count: 19
status: active
aliases: [사주, 명식, 만세력, 오행, 일간, 십성, 절기, 음력, 윤달, kimi-k3, saju-reading, SajuPage]
---

# saju — 나의 오행 지도

2026-09-06 신설. 사용자가 Kimi 고려와 나머지 추천안 진행을 승인했다. 개인 사주·올해·오늘을 웹에 제공하며 앱·궁합·대운은 후속 범위다. 전체 위키 재컴파일과 별개로 이번 변경의 소스를 직접 읽어 반영한 토픽이다.

## 흐름 [coverage: high — 5 sources]

`SajuBirthForm → useSajuReading → POST chart → 명식 먼저 표시 → POST readings → AI/기본 풀이`. 입력 수정·언마운트·계정 전환 시 이전 응답을 반영하지 않는다. 공개 라우트 `/saju`, 보관함 `/me/saju`, 공유 `/saju/s/:token`이다. 3D는 lazy R3F 천문대이며 모션 줄이기·WebGL 미지원 시 SVG/정적 화면으로 대체한다. 장식 전체에 pointer-events를 막아 작은 화면의 버튼을 가로채지 않는다.

## 계산 관례 [coverage: high — 6 sources]

`calculateSaju`가 한국 음양력 변환과 실제 출생 순간을 정규화한다. 한국 음력은 `korean-lunar-calendar`, 절기는 `lunar-typescript`, 법정시 입력은 Temporal Asia/Seoul을 쓴다. 연주·월주는 실제 절입 순간, 일주·시주는 당시 **표준시(DST 제외)** 기준이다. 기본은 자정 일주 전환이며 23시 시주도 그날 일간을 사용한다. 선택으로 23시 전환을 지원한다. 지역 태양시 보정은 없다.

1900년부터 현재까지 대한민국 출생을 지원한다. 없는 윤달·날짜·미래일·DST 누락 시각은 거절한다. 중복 시각은 전/후 선택을 요구한다. 시간 모름·범위·절입 분 경계는 가능한 기둥을 비교하고 달라지는 기둥을 비운다. 시각 모름을 정오로 치환하지 않는다. 오행 구성은 **확정된 표면 글자 개수**다. 일간 미확정이면 일간 관계도 보류한다. 지장간을 표시하지만 개수만으로 용신이나 강약을 만들지 않는다.

KASI 2023·2026년 월력요항의 음력 월초/일진 25건·절입 24건과 IANA 표준시 변경 4건을 고정 fixture로 대조한다. 53개 통과, 절입의 분 단위 공표값과 최대 28초 차이. 음력 월건을 사주의 절기 월주로 오인해 비교하지 않는다. 계산 관례의 재현성 검증이며 미래 예측 검증은 아니다.

## AI·한도 [coverage: high — 5 sources]

`OLLAMA_SAJU_MODEL=kimi-k3`, purpose `saju`, quota feature `saju-reading`. 기존 키 상속·AdapterCache·공통 SQLite 한도를 사용한다. API에는 구조화 명식이 먼저 있고 LLM은 그 근거 ID·기간 관계와 질문으로 해석한다. 원본 생년월일·정확한 시각·계정은 모델에 보내지 않는다. 원본 질문은 지시가 아닌 데이터로 취급한다.

프롬프트 v3는 모델에 오행 개수 대신 상징 의미를 전달하고 개수→성격 강약·능력 결핍 연결을 금지한다. Zod 형식, 섹션 순서, 근거 ID, 허용 한글/한자 간지·일간, 점수·확률, 긴 질문 원문 재인용, 문단 통째 중복, 올해/오늘 주제의 기간 근거를 검사한다. 같은 모델에서 최대 1회 재시도, 전체 60초 후 기본 풀이를 제공한다. 같은 소유자의 동시 요청은 합류하며 캐시는 입력·기간·계산/프롬프트 버전·모델을 포함한다. 성공한 AI만 캐시하므로 기본 풀이 뒤 즉시 재시도할 수 있다.

최신 v3 합성 사례: K3 12/12 첫 호출 통과·중앙 12.574초. 이전 v2 비교: K3 10/10·10.62초, DeepSeek V4 Pro 10/10·6.73초. 이는 출력 검사 통과율이며 모든 해석의 타당성을 증명하지 않는다. 상세 수치는 [모델 평가](../../apps/friendly/research/saju/README.md) 참고.

## 보관·공유 [coverage: high — 5 sources]

기본 조회는 메모리만 사용한다. 회원 보관은 소유자 영수증으로 `SajuReading.snapshotJson`에 명식·풀이·출생 입력을 저장하며 `(userId, requestKey)`가 유일하다. 기본 풀이를 저장해도 추후 AI 생성을 막지 않는다. 게스트 기기 보관은 principal별 localStorage 최근 20개이며 자동 저장하지 않는다.

회원 저장 시 같은 입력의 캐시·영수증에 저장 ID를 반영한다. 삭제하면 연결된 캐시·영수증도 무효화해 이전 탭의 영수증으로 삭제 결과를 되살리거나 공유하지 못하게 한다. 공유·회원 보관 화면은 공통 설정과 별도로 탭 복귀 시 재조회하며 오류 응답에 이전 상세 카드를 숨긴다.

공유는 `SajuShare.publicJson`의 허용 필드만 공개한다. 생년월일·시간·원본 명식·질문·AI 자유문장은 공개하지 않는다. 게스트의 오래된 로컬 결과도 출생 입력을 서버에서 다시 계산해 공유할 수 있다. 보기 토큰과 취소 자격증명은 별개이며 후자는 생성 브라우저의 저장소에 남는다. 회원 저장 결과에 연결한 공유는 결과 삭제 시 cascade한다. 독립 공유는 각각 취소한다.

PNG는 1080×1440, 공개 이미지의 CORP는 cross-origin이며 no-store다. 이미지 캐시를 읽기 전에 DB 행 존재를 확인한다. OG는 공통 web-index helper를 사용하고 취소 후 404·일반 문구를 반환한다. nginx `/saju/s/` 프록시가 필요하다.

## 검증·운영 [coverage: medium — 4 sources]

`useSchemaDatabase`는 현재 Prisma 스키마에서 빈 임시 DB를 만들어 실제 데이터를 복사하거나 운영 DB를 건드리지 않는다. 사주 계산·저장·접근 통제·공유 취소·PNG, 웹의 날짜 입력·먼저 표시·취소·명시적 저장·캐시 무효화를 테스트한다. 사주/AI/한도 124개, 타로 32개, 웹 전체 103개가 통과했다. 타로의 구형 DB fixture도 빈 현재 스키마 DB 방식으로 변경했다. 브라우저 검수는 1440px·390px·Lite/모션 줄이기에서 실시했다.

마이그레이션 `20260906090000_add_saju`는 임시 DB에서 기존 HEAD 스키마에 적용 후 현재 스키마와 동일함을 확인했다. 이 작업에서 운영 마이그레이션·배포는 실행하지 않았다. 지원 범위와 후속 항목은 [구현 명세](../../docs/PLAN-saju.md)를 참고한다.

같은 날 실제 서버를 추가 검증했다. 기본 DB의 사주·한도 테이블 누락을 확인하고 `.tmp/saju-runtime/local.db` 복사본에 미적용 마이그레이션 10개를 적용했다. 실제 서버 3000 + 웹 5173에서 v2 Kimi K3 HTTP 요청 8건이 모두 AI 응답으로 완료되었다(약 8.46~15.88초). v3에서도 실제 K3 응답 1건(14.729초)으로 회원 보관·공유·PNG 다운로드·삭제에 따른 공유 취소를 재확인했다. 원본 DB와 `.env`는 변경하지 않았으며 복사본의 외부 자동 작업은 비활성화했다. [최종 검토 기록](../../docs/REVIEW-saju.md)을 참고한다.

## Sources [coverage: high — 19 sources]

- [입력·응답 계약](../../packages/api-contract/src/schemas/saju.ts)
- [경로 계약](../../packages/api-contract/src/routes.ts)
- [상징·관계 표](../../packages/utils/src/saju.ts)
- [계산 엔진](../../apps/friendly/src/modules/saju/saju.engine.ts)
- [프롬프트·검증](../../apps/friendly/src/modules/saju/saju.prompts.ts)
- [서비스](../../apps/friendly/src/modules/saju/saju.service.ts)
- [라우트](../../apps/friendly/src/modules/saju/saju.route.ts)
- [PNG](../../apps/friendly/src/modules/saju/saju-share-card.ts)
- [OG](../../apps/friendly/src/modules/saju/saju-preview.ts)
- [공통 훅](../../packages/shared/src/hooks/useSaju.ts)
- [보관 스토어](../../packages/shared/src/stores/sajuHistoryStore.ts)
- [사주 페이지](../../apps/web/src/routes/SajuPage.tsx)
- [웹 컴포넌트](../../apps/web/src/components/saju/)
- [명식 테스트](../../apps/friendly/src/modules/saju/saju.engine.test.ts)
- [외부 자료 대조 테스트](../../apps/friendly/src/modules/saju/saju.reference.test.ts)
- [KASI 고정 자료](../../apps/friendly/src/modules/saju/__fixtures__/kasi-calendar.json)
- [서비스 테스트](../../apps/friendly/src/modules/saju/saju.test.ts)
- [웹 테스트](../../apps/web/src/routes/SajuPage.test.tsx)
- [임시 DB](../../apps/friendly/src/test-utils/schema-db.ts)
