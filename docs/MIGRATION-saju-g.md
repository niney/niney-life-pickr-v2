# 사주(G) 전체 식별자 전환

2026-09-07. 사주(G)의 전체 이름 전환과 원격 사주(C) 구현을 통합했다. 두 기능의 경로·데이터·설정은 독립적으로 유지한다.

| 영역 | 현재 이름 |
| --- | --- |
| 웹·공유·보관함 | `/saju-g`, `/saju-g/pair`, `/saju-g/s/:token`, `/me/saju-g` |
| API / Swagger | `/api/v1/saju-g`, `Routes.SajuG`, `saju-g` 태그 |
| 타입·컴포넌트·훅 | `SajuG*`, `useSajuG*` |
| 함수·클라이언트·Prisma 속성 | `calculateSajuG*`, `sajuGApi`, `sajuGReading` 등 |
| 상수·CSS | `SAJU_G_*`, `saju-g-*` |
| 모듈·공유 스키마·유틸 | `modules/saju-g/`, `schemas/saju-g.ts`, `utils/src/saju-g.ts` |
| 브라우저 키 | `lp:saju-g-profiles:v1:guest`, `lp:saju-g:v1:<principal>`, `lp:saju-g-share:<token>` |
| Query 캐시 | `['saju-g', ...]` |
| DB | `saju_g_profiles`, `saju_g_readings`, `saju_g_shares` |
| AI 용도·기본 모델 변수 | `saju-g`, `OLLAMA_SAJU_G_MODEL` |
| 사용량 설정·카운터 | `saju-g-reading` |
| 평가·문서·위키 | `research/saju-g/`, `probe:saju-g-reading`, `probe:saju-g-pair`, `topics/saju-g.md` |

## 사주(C)와 DB·설정 분리

원격 사주(C)는 기존 saju_profiles·saju_readings 테이블과 saju AI 용도, saju-reading 사용량 키를 사용한다. 사주(G)는 saju_g_profiles·saju_g_readings·saju_g_shares, saju-g 용도와 saju-g-reading 키를 사용한다. C 데이터를 G로 복사하거나 C의 모델·한도를 G로 바꾸지 않는다.

G의 최종 migration은 `20260906170000_add_saju_g`다. 원격 C의 기존 migration 다음에 G 테이블·외래 키·인덱스를 독립 생성한다. C와 G에서 같은 프로필/풀이 ID를 사용해도 충돌하지 않으며 G 풀이 삭제는 G 공유에만 연쇄된다. 이미 존재하는 G 테이블과 충돌하면 부분 생성 없이 트랜잭션 전체가 롤백된다.

리베이스 전 로컬에만 있던 G migration 3개는 C가 사용하는 테이블명과 겹쳤으므로 하나의 독립 생성 migration으로 정리했다. 원격에 이미 공개된 C migration은 수정하지 않았다. 이전 로컬 G 개발 복사본은 백업한 뒤 G 데이터를 보존하면서 C 스키마와 새 migration 이력에 맞췄다. 운영 DB에는 이 개발용 이력 정리 절차를 적용하지 않는다.

## 기기 저장소와 환경변수

기기 프로필은 첫 조회 때 이전 키의 값을 검증해 새 키와 병합한다. 같은 ID는 높은 수정 버전을 유지한다. 쓰기와 다시 읽기 확인 후 이전 키를 지우며, 쓰기/정리가 실패하면 원본을 보존하고 수정·삭제를 중단해 다음 조회에서 삭제한 데이터가 되살아나지 않게 한다. 직렬 큐와 Web Locks를 적용한다. 20명 초과나 손상된 입력은 양쪽 값을 보존한 채 오류를 표시한다.

기기 풀이도 계정별로 옮긴다. 같은 생성 시각의 결과는 새 키의 값을 우선한다. 이전 시에는 합친 원본을 모두 보관하고 화면에서는 기존 최근 20개 정책을 사용한다. 저장소 쓰기가 막혀도 읽을 수 있는 기존 결과는 보여주며, 수정·삭제는 이전이 완료되어야 진행한다. 공유 취소 자격증명도 첫 사용 시 옮기고 값 자체는 그대로 유지한다.

이전 키 문자열은 `sajuGStorageMigration.ts`에 모았다. 신규 데이터의 쓰기·일반 조회·캐시는 새 식별자를 사용한다. 환경변수는 G의 `OLLAMA_SAJU_G_MODEL`과 C의 `OLLAMA_SAJU_MODEL`을 별도로 사용한다. 두 기능 사이에 모델 fallback을 두지 않는다. C의 기기 프로필 키는 saju-profiles-v1로, G가 읽는 이전 기기 키와도 다르다.

## 적용과 검증

대상 DB를 백업한 뒤, 대상 DATABASE_URL을 명시한 환경에서 `pnpm --filter friendly exec prisma migrate deploy`를 실행한다. 이어 `pnpm --filter friendly exec prisma generate`와 웹/API 빌드를 적용한다. G 모델은 OLLAMA_SAJU_G_MODEL로 설정한다. 공개 경로는 /saju-c와 /saju-g이며 nginx 설정 원본에도 두 공유 OG 경로가 있다.

리베이스 통합 검증: 전체 타입 검사 6개 작업 통과. C/G/타로/AI/한도 API 테스트 202개, 웹 116개, shared 81개, utils 307개가 통과했다. 빈 DB에서 모든 migration을 순서대로 실행한 결과가 현재 C/G 통합 Prisma 스키마와 일치한다. 새 migration 테스트는 C 데이터·공유·양쪽 설정·카운터 보존과 G 삭제 범위, 충돌 시 롤백을 확인한다.

기존 G 기기 프로필·풀이·취소 자격 이전 로직 및 10자리 공유 ID/기존 32자리 ID 호환은 유지한다. 이전 이름은 G 기기 데이터의 인계용 키에만 사용한다. C 구현 내부에 남은 Saju 이름은 별도 기능의 현재 식별자다.

로컬 검증용 DB는 .tmp/saju-g-runtime/local.db이고 리베이스 전 백업은 .tmp/saju-g-runtime/pre-rebase.db다. API 실행은 `bash .tmp/saju-g-runtime/start-api.sh`를 사용한다. 원본 운영 DB와 실제 환경 파일은 변경하지 않았다.

이번 개발 복사본은 이미 G 테이블을 가지고 있어, pre-rebase.db 백업 후 미배포 G 이력 3개만 새 이력으로 맞추고 G migration을 applied 처리한 뒤 C migration을 적용했다. G 공유 3개·사용량 카운터 24개와 기존 설정의 내용이 바뀌지 않았음을 해시로 확인했다. 이 이력 정리는 작업 전용 복사본에만 수행했으며 원격/운영 DB에는 수행하지 않았다. 타입 검사와 테스트에 이어 변경 코드 ESLint 및 웹/API 빌드도 통과했다.
