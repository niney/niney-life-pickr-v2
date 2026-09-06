# 사주 계산·해석·코드 검토

2026-09-06. 개인 사주·올해·오늘, Kimi 해석, 웹 연출, 보관·공유 구현을 검토했다. 계산 자료 대조와 실제 Cloud/브라우저 검증을 수행했고, 발견한 재시도·캐시·화면 갱신 문제를 수정했다. 운영 배포는 이번 범위에 포함하지 않았다.

## 계산 자료 대조

| 대조 대상 | 사례 | 결과 |
| --- | ---: | --- |
| 2023·2026년 음력 월초와 해당 일진 | 25 | 모두 일치 |
| 두 해의 절입 시각, 각 12개 | 24 | 공표된 분 단위 시각과 차이 60초 이내, 최대 28초 |
| 1908·1912·1954·1961년 서울 표준시 변경 직전/직후 | 4 | UTC 오프셋 모두 일치 |

자료는 [KASI 2023년 월력요항](https://astro.kasi.re.kr/kor/life/post/calendarData?search_year=2023&bbs_uniq_id=calendarData), [KASI 2026년 월력요항](https://astro.kasi.re.kr/kor/life/post/calendarData?search_year=2026&bbs_uniq_id=calendarData), [IANA Asia/Seoul](https://data.iana.org/time-zones/tzdb/asia)이다. 외부 자료를 [고정 fixture](../apps/friendly/src/modules/saju/__fixtures__/kasi-calendar.json)와 [53개 테스트](../apps/friendly/src/modules/saju/saju.reference.test.ts)로 남겼다. 월력요항의 음력 월건은 사주의 절기 월주와 기준이 달라 비교 대상에서 제외했다.

28초는 분 단위 공표값과의 차이로, 천문 계산의 절대 오차를 뜻하지 않는다. 기존 엔진 17개 테스트는 윤달, 입춘 분 경계, 시간 모름, 자정/23시 관례, 1988년 DST의 중복·누락 시각 등을 검증한다. 이번 검토에서는 계산식 변경이 필요하지 않았다. 계산 관례의 일관성 검증이며 운세의 미래 예측력을 검증한 것은 아니다.

## 발견한 문제와 수정

1. **해석의 반복과 근거 부족**: v2 본문에서 요약 문단 반복과 오행 개수에 기댄 성향 해석을 확인했다. v3는 모델에 개수 대신 상징 의미를 전달하고 문단 통째 중복을 거절한다. 올해/오늘 주제는 기간 근거를 요구하고, 허용 한글/한자 간지와 명시적 일간 표현을 검사한다.
2. **AI 즉시 재시도 지연**: 기본 풀이가 15초 캐시에 남아 바로 재시도해도 AI를 호출하지 않았다. 성공한 AI만 캐시하도록 바꾸었다. 동시 요청 합류와 사용량 한도는 계속 적용한다.
3. **저장·삭제 뒤 메모리 불일치**: 저장 ID가 이전 영수증·캐시에 전파되지 않았다. 저장 시 동일 요청의 메모리 결과를 갱신하고 삭제 시 연결된 캐시·영수증을 제거한다. 이전 탭의 영수증을 재사용해 삭제한 결과를 보관·공유하는 상황을 회귀 테스트로 막았다.
4. **다른 창에서 취소한 결과가 화면에 잔존**: React Query는 재조회 오류 시 이전 데이터를 보존했고 앱 공통 설정은 탭 복귀 재조회를 꺼 두었다. 사주 공유·회원 보관은 탭 복귀 시 재조회하고, 오류 응답이면 기존 상세 카드를 숨긴다. 실제 HTTP 공유 취소 뒤 브라우저의 visibility 전환으로 카드가 사라지는 것을 확인했다.
5. **타로 회귀 테스트 DB의 테이블 누락**: 기존 fixture가 오래된 개발 DB를 복사해 22개 테스트가 실패했다. 사주와 함께 현재 Prisma 스키마로 빈 임시 DB를 만드는 helper를 사용하도록 바꾼 뒤 타로 32개가 모두 통과했다. 타로 서비스 동작은 수정하지 않았다.

패키지 잠금 파일의 관련 없는 Expo peer 변경도 제외했다. 추가 의존성은 한국 음력 변환·절기·Temporal 계산에 필요한 패키지와 그 의존성으로 한정했다.

## 실제 Kimi 평가

프롬프트 v3, `kimi-k3`, 합성 사례 12개가 모두 첫 호출에 출력 검증을 통과했다. 중앙값 12.574초, 최저 8.348초, 최고 17.885초였다. 시간 불확실성·음력 윤달·올해/오늘·질문을 통한 지시문 삽입을 포함한다. 각 응답과 계산 근거를 읽어 확인했으며 버전별 원본은 [모델 평가 기록](../apps/friendly/research/saju/README.md)에 보존했다.

이번 표본에서는 오행 개수 나열, 문단 전체 반복, 미확정 일간의 명시적 단정을 발견하지 못했다. 표현 일부의 반복, 사소한 문법 오류, 전통 상징에 기댄 일반화는 남아 있다. 12/12는 출력 계약·근거 검사 통과율이며 자연어 품질의 만점이나 미래 예측의 정확도가 아니다.

## 실행한 검증

| 명령/절차 | 확인 결과 |
| --- | --- |
| `pnpm typecheck` | 6개 작업 통과, 앱 포함 |
| `pnpm --filter friendly typecheck`, `pnpm --filter web typecheck` | 후속 수정 후 통과 |
| `pnpm --filter friendly test -- src/modules/saju src/modules/ai/ai.config.service.test.ts src/modules/usage-quota/usage-quota.test.ts` | 124개 통과 |
| `pnpm --filter friendly test -- src/modules/tarot` | 32개 통과 |
| `pnpm --filter web test` | 19개 파일, 103개 통과 |
| `pnpm --filter web test -- src/routes/SajuPage.test.tsx` | 마지막 탭 복귀 변경 후 5개 통과 |
| `pnpm --filter @repo/utils test`, `pnpm --filter @repo/shared test` | 구현 단계의 246개·65개 통과 기록 재사용 |
| `pnpm --filter friendly build`, `pnpm --filter web build` | 프로덕션 빌드 통과 |
| 변경 파일 ESLint, `git diff --check` | 통과 |
| `pnpm install --frozen-lockfile --ignore-scripts --lockfile-only` | 통과 |
| HEAD 스키마의 임시 DB에 신규 migration 적용 후 `prisma migrate diff --exit-code` | 차이 없음 |

ESLint는 friendly와 web의 저장소 설정을 사용했다. shared에는 개별 설정 파일이 없어 최초 패키지 내 실행은 설정 탐색 오류로 종료되었고, 이후 공통 `packages/config/eslint/react.js`를 명시해 API·훅·스토어 검사를 통과했다. 마지막 훅/화면 변경도 웹 설정으로 검사했다.

실제 서버는 운영 DB를 일관되게 복사한 `.tmp/saju-runtime/local.db`에 미적용 migration 10개를 적용하고 실행했다. 자동 크롤링·Telegram·요약 재시작·군집 재계산을 비활성화했으며 원본 DB와 `.env`는 변경하지 않았다. 회원 검증에는 개발용 합성 계정을 사용했다.

- v2 당시 실제 K3 HTTP 8건, 1440px·390px의 개인/올해/오늘·기기 보관·PNG·공유 취소와 Lite/모션 줄이기를 확인했다.
- v3 실제 K3 응답 1건은 14.729초였다. 가입 → 계정 보관 → 새로고침/상세 → PNG 다운로드 → 삭제까지 다시 통과했다. 비로그인 상세는 401, 삭제 후 연결된 공유 JSON·PNG는 404, 공개 응답은 출생정보·개인 풀이를 제외했고 OG 생성과 페이지 JS 오류 없음도 확인했다.
- 실제 API로 공유를 취소한 후 열린 페이지의 탭 복귀 이벤트를 발생시켜 404 재조회와 기존 카드 숨김을 확인했다. 로컬 기록은 `.tmp/saju-runtime/revocation-verification.json`이며 개발 DB와 함께 Git에서 제외한다.

지원 범위는 대한민국 출생·1900년 이후이며 지역 태양시, 해외 출생, 대운, 앱 UI는 후속 범위다. 같은 날 추가 승인으로 [출생 프로필·궁합](REVIEW-saju-profiles-pair.md)을 구현했다. 위 수치는 개인 사주 검토 시점의 기록이며 추가 검증은 후속 문서에 남긴다. 운영 반영에는 migration 상태 확인과 nginx 공유 경로 설정이 필요하다. 상세는 [구현 명세](PLAN-saju.md)와 [배포 문서](deploy-friendly.md)를 따른다.
