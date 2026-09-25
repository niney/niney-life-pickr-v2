# Life Pickr API 엔드포인트 색인

> **자동 생성 — 직접 수정하지 말 것.** `pnpm --filter friendly export:openapi` 로 다시 만든다.
> 인증·CORS·에러·한도 설명은 [README.md](README.md), 스키마 전체는 [openapi.json](openapi.json).

- 기준 URL: `https://ninelife.kr` (경로에 `/api/v1` 포함)
- 엔드포인트 193개 — 공개 84 · 선택 인증 15 · 로그인 94. 어드민(`/api/v1/admin/**`)은 제외.
- 인증: `공개` = 토큰 불필요, `선택` = 토큰 없이도 되고 있으면 회원으로 처리(한도·자동 저장 등), `로그인` = `Authorization: Bearer <token>` 필수.
- 한도: 라우트별 IP당 요청 수. 빈 칸은 전역 백스톱(IP당 분당 1000). `설정값` = 어드민 설정(usage-quota)에서 결정.
- 입력: 쿼리 파라미터(`*` 필수), `header` = 요청 헤더, `body` = JSON 본문. 경로 파라미터는 경로에 `:name` 형태로 표시.

## air-location

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/air/location` | 로그인 |  |  | 내 대기 위치 조회 — 사용자당 1개, 없으면 location null |
| PUT | `/api/v1/air/location` | 로그인 |  | body | 내 대기 위치 저장 — 덮어쓰기, 저장 후 상태 반환 |
| DELETE | `/api/v1/air/location` | 로그인 |  |  | 내 대기 위치 삭제 — 멱등 |

## air-quality

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/air/bad-stations` | 공개 | 60/분 |  | 통합대기환경지수 나쁨 이상 측정소 목록 — 에어코리아 프록시, 10분 캐시 |
| GET | `/api/v1/air/forecast` | 공개 | 60/분 | `date` | 대기질 예보통보(PM10·PM2.5·O3) — 에어코리아 프록시, 20분 캐시 |
| GET | `/api/v1/air/forecast/weekly` | 공개 | 60/분 | `date` | 초미세먼지 주간예보(권역별 등급) — 에어코리아 프록시, 60분 캐시 |
| GET | `/api/v1/air/sido/:sidoName` | 공개 | 60/분 |  | 시도별 실시간 대기오염 측정값 — 에어코리아 프록시, 10분 캐시 |
| GET | `/api/v1/air/stations` | 공개 | 60/분 |  | 전국 대기 측정소 목록(좌표·주소·측정항목) — 에어코리아 측정소정보, 24시간 캐시 |
| GET | `/api/v1/air/stations/nearby` | 공개 | 60/분 | `lat`*, `lng`*, `radius`, `limit` | 좌표 기준 가까운 대기 측정소와 현재 측정값 — 거리순 |
| GET | `/api/v1/air/stations/search` | 공개 | 60/분 | `q`* | 대기 측정소 이름·주소 검색 — 캐시 목록 로컬 검색, 상위 30건 |
| GET | `/api/v1/air/stations/:stationName/history` | 공개 | 60/분 | `term` | 측정소별 대기오염 시계열(24시간·1개월·3개월) — 에어코리아 프록시, 10분 캐시 |

## auth

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| POST | `/api/v1/auth/login` | 공개 | 20/분 | body | 이메일·비밀번호 로그인 — JWT 와 사용자 정보 반환 |
| POST | `/api/v1/auth/logout` | 로그인 |  |  | 로그아웃 — 이 사용자에게 발급된 모든 JWT 즉시 무효화(전 기기) |
| GET | `/api/v1/auth/me` | 로그인 |  |  | 현재 로그인 사용자 정보 조회 |
| POST | `/api/v1/auth/register` | 공개 | 40/시간 | body | 이메일 회원가입 — JWT 와 사용자 정보 반환(중복 이메일 409) |

## bus

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/bus/routes/:busRouteId/detail` | 공개 |  |  | 버스 노선 상세(경로 형상·경유 정류소·기본정보) — 서울시 버스 API, DB 30일 캐시 |
| GET | `/api/v1/bus/routes/:busRouteId/positions` | 공개 | 60/분 | `startOrd`, `endOrd` | 노선 실시간 버스 위치 — 서울시 버스 API 프록시, 15초 캐시 |
| GET | `/api/v1/bus/stations/nearby` | 공개 |  | `lat`*, `lng`*, `radius` | 좌표 기준 주변 버스 정류장 — 로컬 정류소 마스터, 거리순 |
| GET | `/api/v1/bus/stations/search` | 공개 |  | `q`*, `force` | 서울 버스 정류장 이름 검색 — 서울시 버스 API, 키워드별 DB 30일 캐시 |
| GET | `/api/v1/bus/stations/:arsId/arrivals` | 공개 | 60/분 |  | 정류소 실시간 버스 도착정보 — 서울시 버스 API 프록시, 15초 캐시 |

## bus-favorite

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/bus/favorites` | 로그인 |  |  | 버스 즐겨찾기 전체 목록(정류장·정류장×노선) — 등록순 |
| PUT | `/api/v1/bus/favorites/routes/:stId/:busRouteId` | 로그인 |  | body | 즐겨찾기 노선(정류장×노선) 추가·갱신 — 종류별 최대 100개, 변경 후 전체 목록 반환 |
| DELETE | `/api/v1/bus/favorites/routes/:stId/:busRouteId` | 로그인 |  |  | 즐겨찾기 노선(정류장×노선) 삭제 — 멱등, 변경 후 전체 목록 반환 |
| PUT | `/api/v1/bus/favorites/stations/:stId` | 로그인 |  | body | 즐겨찾기 정류장 추가·갱신 — 종류별 최대 100개, 변경 후 전체 목록 반환 |
| DELETE | `/api/v1/bus/favorites/stations/:stId` | 로그인 |  |  | 즐겨찾기 정류장 삭제 — 멱등, 변경 후 전체 목록 반환 |
| POST | `/api/v1/bus/favorites/sync` | 로그인 |  | body | 게스트 즐겨찾기 병합(sync) — 서버에 없는 항목만 추가, 전체 목록 반환 |

## food

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/food/search` | 로그인 | 120/분 | `q`*, `limit` | 음식 카탈로그 자동완성 — 이름·별칭 검색, 일치도·인기순, 최대 20건 |
| GET | `/api/v1/food/:id/restaurants` | 로그인 | 60/분 | `lat`, `lng`, `radiusM`, `limit` | 이 음식을 파는 식당 역검색 — 수집 메뉴·리뷰 언급 근거, 좌표 주면 반경 내만 |

## health

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/health` | 공개 |  |  | 서버 상태 확인 — status·uptime·timestamp |

## housing

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/housing/complexes/:id` | 공개 |  |  | 단지 상세(유형·면적별 거래 통계·공시가격·생활 인프라·침수 흔적) — 로컬 DB |
| GET | `/api/v1/housing/complexes/:id/trades` | 공개 | 240/분 | `dealType`, `band`, `limit`, `offset`, `includeCanceled` | 단지 실거래 목록(최신 계약일 순, 페이지네이션) — 로컬 DB |
| GET | `/api/v1/housing/nearby` | 공개 | 240/분 | `lat`*, `lng`*, `radius`, `limit`, `dealType`, `band` | 좌표 기준 주변 아파트 단지와 최근 거래가 — 로컬 실거래가 DB, 거리순 |
| GET | `/api/v1/housing/points` | 공개 | 240/분 | `bbox`*, `zoom`*, `dealType`, `band` | 지도 영역 안 아파트 단지 가격 배지 또는 집계 셀 — 로컬 실거래가 DB |
| GET | `/api/v1/housing/search` | 공개 | 120/분 | `q`*, `limit` | 아파트 단지명 검색(이전·별칭 이름 포함) — 로컬 DB, 세대수 큰 순 |
| GET | `/api/v1/housing/status` | 공개 |  |  | 집값 데이터 적재 현황(단지·유형별 거래 건수·기간·적재 시각) — 로컬 DB |

## life-map

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/life-map/crime` | 공개 |  |  | 시군구별 범죄 발생률(인구 10만 명당)과 5등급 경계 — 경찰청 통계 기반 정적 데이터 |
| GET | `/api/v1/life-map/nearby` | 공개 | 240/분 | `layer`*, `lat`*, `lng`*, `radius`, `limit`, `purpose`, `category`, `kind`, `open24`, `disabled`, `kids`, `diaper`, `bell` | 좌표 기준 주변 CCTV·화장실·병의원·생활편의 — 로컬 DB, 거리순 |
| GET | `/api/v1/life-map/points` | 공개 | 240/분 | `layer`*, `bbox`*, `zoom`*, `purpose`, `category`, `kind`, `open24`, `disabled`, `kids`, `diaper`, `bell` | 지도 영역 안 CCTV·화장실·병의원·생활편의 지점 또는 집계 셀 — 로컬 DB |
| GET | `/api/v1/life-map/search` | 공개 | 60/분 | `q`*, `limit` | 지역 이동용 주소·장소 검색 — VWorld 검색 API 프록시, 10분 캐시 |
| GET | `/api/v1/life-map/status` | 공개 |  |  | 일상지도 레이어별 적재 현황(건수·기준일·적재 시각) — 로컬 DB |
| GET | `/api/v1/life-map/:layer/:id` | 공개 |  |  | 일상지도 항목 상세(레이어·id) — 로컬 DB, 없으면 404 |

## meal

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/meals` | 로그인 |  | `from`, `to`, `slot`, `mealType`, `source`, `q`, `cursor`, `limit`, `withPhotos` | 내 식단 기록 목록 — 기간·끼니·유형·검색어 필터, 최신순 커서 페이지네이션 |
| POST | `/api/v1/meals` | 로그인 |  | body | 식단 기록 생성 — 음식 항목 1~20개·사진 토큰 최대 5장, 영양값은 서버가 채움 |
| GET | `/api/v1/meals/calendar` | 로그인 |  | `month`* | 월별 식단 달력 요약 — 날짜별 끼니 수·끼니 종류·사진 유무 |
| DELETE | `/api/v1/meals/data` | 로그인 |  | body | 내 식단 데이터 전체 삭제 — 기록·사진·추천·선호 설정, 확인 문구 필수 |
| GET | `/api/v1/meals/data/backup` | 로그인 | 10/시간 |  | 사진 포함 식단 백업 아카이브 생성 — JSON+base64, IP당 시간당 10회 |
| POST | `/api/v1/meals/data/backup/restore` | 로그인 | 10/시간 | body | 식단 백업 아카이브 복원 — 기존 기록에 추가, 같은 archiveId 재요청은 멱등 |
| GET | `/api/v1/meals/data/export` | 로그인 |  |  | 내 식단 데이터 JSON 내보내기 — 기록·선호·추천 이력, 사진 바이너리 제외 |
| GET | `/api/v1/meals/data/photos/retention` | 로그인 |  | `before` | 사진 정리 대상 미리보기 — before 이전 기록 사진·미연결 업로드 수와 용량 |
| DELETE | `/api/v1/meals/data/photos/retention` | 로그인 |  | body | 오래된 식단 사진 일괄 삭제 — 텍스트 기록은 유지, 확인 문구 필수 |
| GET | `/api/v1/meals/items/recent` | 로그인 |  | `name`* | 음식명으로 지난번 섭취 조회 — 마지막 날짜·양·분류·그때 사진 토큰 |
| POST | `/api/v1/meals/photos` | 로그인 | 30/분 |  | 식단 사진 업로드 — multipart 파일 1개(최대 5MB), 사진 토큰 발급 |
| GET | `/api/v1/meals/photos/:token` | 로그인 |  |  | 식단 사진 원본(image/jpeg) — 본인 사진만, JWT 필요 |
| DELETE | `/api/v1/meals/photos/:token` | 로그인 |  |  | 기록에 연결되지 않은 업로드 사진 삭제 — 연결된 사진은 409 |
| POST | `/api/v1/meals/photos/:token/copy` | 로그인 | 30/분 |  | 지난 식단 사진을 새 사진 토큰으로 복제 — 원본과 독립된 파일 |
| GET | `/api/v1/meals/photos/:token/thumb` | 로그인 |  |  | 식단 사진 썸네일(image/jpeg, 긴 변 최대 320px) — 본인 사진만, JWT 필요 |
| GET | `/api/v1/meals/preference` | 로그인 |  |  | 식단 선호 설정 조회 — 추천 가중치·제외·알레르기·선호 음식, 미저장 시 기본값 |
| PUT | `/api/v1/meals/preference` | 로그인 |  | body | 식단 선호 설정 저장 — 보낸 필드만 갱신 |
| POST | `/api/v1/meals/recognize` | 로그인 | 10/분 | body | 식단 사진 음식 인식 — 비전 LLM 1콜, 사용자별 일일 한도, 식단 기록은 만들지 않음 |
| GET | `/api/v1/meals/recommendations` | 로그인 |  | `limit` | 내 다음 끼니 추천 이력 — 최신순, limit 기본 20·최대 50 |
| POST | `/api/v1/meals/recommendations` | 로그인 | 10/분 | body | 다음 끼니 추천 생성 — 텍스트 LLM 1콜, 캐시 히트는 일일 한도 미차감 |
| GET | `/api/v1/meals/recommendations/context` | 로그인 |  |  | 추천 화면 초기 데이터 — 기록 수·최근 먹은 음식·선호 설정·직전 추천 |
| POST | `/api/v1/meals/recommendations/:id/events` | 로그인 |  | body | 추천 반응 이벤트 기록 — 노출·후보 선택·평가·식당 열기·닫기(logged 는 거부) |
| POST | `/api/v1/meals/recommendations/:id/feedback` | 로그인 |  | body | 추천 피드백 반영 — 고른 음식·세트 평가(±1)·이 추천으로 만든 식단 기록 연결 |
| GET | `/api/v1/meals/stats` | 로그인 |  | `from`*, `to`* | 기간 식단 통계 — 분류별 분포·자주 먹은 음식·연속 기록·영양 평균·인사이트 |
| GET | `/api/v1/meals/time-presets` | 로그인 |  |  | 끼니별 평소 식사 시각 프리셋 — 최근 90일 기록 중앙값, 3건 미만이면 기본값 |
| GET | `/api/v1/meals/:id` | 로그인 |  |  | 식단 기록 단건 조회 — 사진 인식 원본 스냅샷 포함 |
| PATCH | `/api/v1/meals/:id` | 로그인 |  | body | 식단 기록 수정 — items·photoTokens 는 보내면 전량 교체 |
| DELETE | `/api/v1/meals/:id` | 로그인 |  |  | 식단 기록 삭제 — 연결된 사진 파일도 함께 삭제 |

## media

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/media/panorama/:placeId` | 공개 |  |  | 네이버 플레이스 파노라마 썸네일(JPEG) — 크롤 시 저장한 사본, 없으면 404 |
| GET | `/api/v1/media/thumbnail` | 공개 |  | `url`*, `w`, `q` | 외부 이미지 썸네일 JPEG 리사이즈 프록시 — 허용 호스트만, 디스크 캐시 |

## parking

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/parking/airports` | 공개 | 240/분 |  | 공항 주차장 실시간 — 한국공항공사 13개 공항 + 인천공항, 5분 폴링 |
| GET | `/api/v1/parking/ev/nearby` | 공개 | 240/분 | `lat`*, `lng`*, `radius`, `limit`, `fastOnly`, `freeParkingOnly`, `availableOnly`, `openOnly` | 좌표 기준 주변 전기차 충전소 — 거리순, 사용 가능·충전 중 대수 포함 |
| GET | `/api/v1/parking/ev/points` | 공개 | 240/분 | `bbox`*, `zoom`*, `fastOnly`, `freeParkingOnly`, `availableOnly`, `openOnly` | 지도 영역 안 전기차 충전소 지점 또는 집계 셀 — 로컬 DB(충전기 상태는 10분 폴러 반영) |
| GET | `/api/v1/parking/ev/:id` | 공개 | 240/분 |  | 전기차 충전소 상세 — 충전기별 타입·용량·상태, 없으면 404 |
| GET | `/api/v1/parking/lots/nearby` | 공개 | 240/분 | `lat`*, `lng`*, `radius`, `limit`, `publicOnly`, `freeOnly`, `liveOnly` | 좌표 기준 주변 주차장 — 거리순, 요금·운영시간·실시간 포함 |
| GET | `/api/v1/parking/lots/points` | 공개 | 240/분 | `bbox`*, `zoom`*, `publicOnly`, `freeOnly`, `liveOnly` | 지도 영역 안 주차장 지점 또는 집계 셀 — 로컬 DB + 실시간 단계 |
| GET | `/api/v1/parking/lots/:id` | 공개 | 240/분 |  | 주차장 상세 — 요금·운영시간·실시간·오늘 요일의 평소 혼잡도(이력), 없으면 404 |
| GET | `/api/v1/parking/status` | 공개 |  |  | 주차 적재·실시간 폴링 상태(주차장·충전소 건수, 마지막 폴링 시각) |
| GET | `/api/v1/restaurants/public/:placeId/parking-reviews` | 공개 | 240/분 |  | 맛집 리뷰의 주차 평가 — 분석된 리뷰의 "주차" 관점 긍·부정·중립 건수와 주차 팁(가는 법 탭) |

## picks

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/picks` | 로그인 |  |  | 내 픽(고민 선택지 묶음) 전체 목록 — 최신순 |
| POST | `/api/v1/picks` | 로그인 |  | body | 픽 생성 — 제목·선택지 2~20개·카테고리 |
| GET | `/api/v1/picks/:id` | 로그인 |  |  | 내 픽 단건 조회 |
| PATCH | `/api/v1/picks/:id` | 로그인 |  | body | 픽 수정 — 보낸 필드만 갱신(options 는 통째 교체) |
| DELETE | `/api/v1/picks/:id` | 로그인 |  |  | 픽 삭제 |
| POST | `/api/v1/picks/:id/random` | 로그인 |  |  | 픽 선택지 중 하나 무작위 추첨 — 결과는 추첨 이력으로 저장 |

## public

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/restaurants/public` | 공개 |  | `q`, `category`, `bbox`, `sort`, `limit`, `offset` | 공개 맛집 목록 — 검색어·카테고리·지도 bbox 필터, 좌표·대표 사진·AI 통계 포함 |
| POST | `/api/v1/restaurants/public/smart-pick` | 공개 | 60/분 | body | 맛집 가중 랜덤 픽("오늘 뭐 먹지?") — AI 분석·여행자 점수 가중, 후보 없으면 picked null |
| GET | `/api/v1/restaurants/public/:placeId` | 공개 |  |  | 공개 맛집 상세 — 네이버·다이닝코드·테이블링 병합 정보 + 리뷰 첫 10건 |
| GET | `/api/v1/restaurants/public/:placeId/category-tree` | 공개 |  |  | 맛집 언급 메뉴의 카테고리 트리 — 전역 메뉴 분류 전이면 빈 배열 |
| GET | `/api/v1/restaurants/public/:placeId/insights` | 공개 |  |  | 맛집 AI 리뷰 분석 집계 — 감성 분포·만족도·많이 언급된 메뉴·팁·키워드 |
| GET | `/api/v1/restaurants/public/:placeId/menu-nutrition` | 공개 |  |  | 맛집 메뉴 칼로리 추정 — 식약처 식품영양성분 DB 매칭, 애매한 메뉴는 제외 |
| GET | `/api/v1/restaurants/public/:placeId/reviews` | 공개 |  | `offset`, `limit`, `sentiment`, `sort`, `tip`, `menu` | 공개 맛집 방문자 리뷰 페이지 — 감성·팁·메뉴 필터, 최신/평점 정렬 |
| GET | `/api/v1/restaurants/ranking` | 공개 |  | `sort`, `excludeNeutral`, `minMentions`, `limit`, `offset` | 공개 맛집 랭킹 — AI 분석 리뷰의 긍정·부정 비율순, 최소 언급 수 컷오프 |
| GET | `/api/v1/restaurants/:placeId/clusters` | 공개 |  |  | 맛집 리뷰 주제별 군집 조회 — 사전 계산된 결과만, 없으면 ready=false |
| POST | `/api/v1/restaurants/:placeId/qa` | 공개 | 15/분 | body | 맛집 리뷰 기반 질문 답변(RAG) — 근거 리뷰 인용, 매 요청 LLM 최대 3콜, 분당 15회 |
| GET | `/api/v1/restaurants/:placeId/qa/ready` | 공개 |  |  | 맛집 리뷰 Q&A 준비 여부 — 검색 가능(임베딩 완료) 리뷰 수, LLM 호출 없음 |
| GET | `/api/v1/settings/map/public` | 공개 |  |  | 지도 타일(VWorld WMTS) 공개 설정·API 키 조회 — 키 미등록이면 404 |

## restaurant-favorite

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/restaurants/favorites` | 로그인 |  |  | 내 맛집 즐겨찾기 전체 목록 — 등록순 |
| POST | `/api/v1/restaurants/favorites/sync` | 로그인 |  | body | 게스트 맛집 즐겨찾기 병합(sync) — 서버에 없는 항목만 추가, 상한 초과분 무시 |
| PUT | `/api/v1/restaurants/favorites/:placeId` | 로그인 |  | body | 맛집 즐겨찾기 추가·스냅샷 갱신 — 최대 100개(초과 400), 변경 후 전체 목록 반환 |
| DELETE | `/api/v1/restaurants/favorites/:placeId` | 로그인 |  |  | 맛집 즐겨찾기 삭제 — 멱등, 변경 후 전체 목록 반환 |

## saju

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| POST | `/api/v1/saju-c/ask` | 선택 | 설정값/분 | body | 사주에 묻기 — 주제·시기 질문에 사주 근거 답변(LLM 1콜, 한도 1회), 회원 자동 저장 |
| POST | `/api/v1/saju-c/daily` | 선택 | 설정값/분 | body | 사주 오늘의 운세(오늘 ±7일) — LLM 1콜·한도 1회, 회원의 오늘 운세는 하루 1회 고정 |
| POST | `/api/v1/saju-c/date-pick` | 선택 | 설정값/분 | body | 사주 택일 — 목적별 날짜 점수(최대 60일)와 상위 날 이유, LLM 1콜·한도 1회 |
| POST | `/api/v1/saju-c/food` | 선택 | 설정값/분 | body | 사주 오행 음식 추천 — 원국·오늘 일진 기반 메뉴와 이유·칼로리, LLM 1콜·한도 1회 |
| POST | `/api/v1/saju-c/match` | 선택 | 설정값/분 | body | 사주 궁합 — 두 사람 점수·항목별 분석 + LLM 풀이 1콜, 한도 1회 |
| GET | `/api/v1/saju-c/me/profiles` | 로그인 |  |  | 내 사주(C) 프로필 목록 — 대표(primary) 먼저 |
| POST | `/api/v1/saju-c/me/profiles` | 로그인 |  | body | 사주(C) 프로필 추가 — 최대 10명, 같은 생년월일시·성별이면 기존 프로필 갱신 |
| PUT | `/api/v1/saju-c/me/profiles/:id` | 로그인 |  | body | 사주(C) 프로필 수정 |
| DELETE | `/api/v1/saju-c/me/profiles/:id` | 로그인 |  |  | 사주(C) 프로필 삭제 — 대표였으면 가장 오래된 프로필이 대표, 204 |
| GET | `/api/v1/saju-c/me/readings` | 로그인 |  | `cursor`, `limit`, `kind` | 내 사주(C) 기록 목록 — 전체 풀이(full)·사주에 묻기(question), 최신순 커서 페이지네이션 |
| GET | `/api/v1/saju-c/me/readings/:id` | 로그인 |  |  | 내 사주(C) 전체 풀이 기록 상세 조회 |
| DELETE | `/api/v1/saju-c/me/readings/:id` | 로그인 |  |  | 내 사주(C) 기록 삭제 — 204 |
| POST | `/api/v1/saju-c/readings` | 선택 | 설정값/분 | body | 사주(C) 전체 풀이 생성 — 정적 본문 즉시 + LLM 4섹션 병렬 비동기 잡(jobId), 한도 1회 |
| GET | `/api/v1/saju-c/readings/jobs/:jobId` | 공개 | 120/분 | `after`, `wait` | 사주(C) 풀이 잡 long-poll — after 이후 버전이 생기거나 wait(최대 25초) 만료 시 응답 |
| POST | `/api/v1/saju-c/shares` | 선택 | 10/분 | body | 사주(C) 공유 링크 발급 — 회원은 readingId, 게스트는 생년월일 재전송(LLM·한도 소비 없음) |
| GET | `/api/v1/saju-c/shares/:token` | 공개 | 120/분 |  | 공유된 사주(C) 풀이 조회 — 생년월일시는 공유 시 포함을 고른 경우만 |
| POST | `/api/v1/saju-c/themes` | 선택 | 설정값/분 | body | 사주(C) 테마 풀이(인연·재물·직업) 생성 — LLM 3개 병렬 비동기 잡(jobId), 한도 1회 |
| GET | `/api/v1/saju-c/themes/jobs/:jobId` | 공개 | 120/분 | `after`, `wait` | 사주(C) 테마 잡 long-poll — after 이후 버전이 생기거나 wait 만료 시 응답, 잡 없으면 410 |

## saju-g

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| POST | `/api/v1/saju-g/chart` | 공개 | 30/분 | body | 사주(G) 명식 계산 — 네 기둥·오행 분포·기간(원국/올해/오늘) 흐름, LLM 없음, 분당 30회 |
| GET | `/api/v1/saju-g/me/profiles` | 로그인 |  |  | 내 사주(G) 프로필 목록 — 등록순, 최대 20명 |
| POST | `/api/v1/saju-g/me/profiles` | 로그인 |  | body | 사주(G) 프로필 추가 — 최대 20명, 존재하지 않는 날짜·미래일 등은 400 |
| PUT | `/api/v1/saju-g/me/profiles/:id` | 로그인 |  | body | 사주(G) 프로필 수정 — revision 낙관적 잠금(다른 창에서 먼저 수정했으면 409) |
| DELETE | `/api/v1/saju-g/me/profiles/:id` | 로그인 |  |  | 사주(G) 프로필 삭제 — 204 |
| GET | `/api/v1/saju-g/me/readings` | 로그인 |  | `limit`, `cursor` | 내 사주(G) 보관 기록 목록 — 최신순 커서 페이지네이션 |
| POST | `/api/v1/saju-g/me/readings` | 로그인 |  | body | 사주(G) 풀이 보관 — 풀이 응답의 receipt 로 내 기록에 저장(같은 요청은 덮어씀) |
| GET | `/api/v1/saju-g/me/readings/:id` | 로그인 |  |  | 내 사주(G) 보관 기록 상세 조회 |
| DELETE | `/api/v1/saju-g/me/readings/:id` | 로그인 |  |  | 내 사주(G) 보관 기록 삭제 — 204 |
| POST | `/api/v1/saju-g/pair/chart` | 공개 | 30/분 | body | 사주(G) 두 사람 명식·일간 오행 관계 계산 — LLM 없음, 분당 30회 |
| POST | `/api/v1/saju-g/pair/readings` | 선택 | 설정값/분 | body | 사주(G) 두 사람 관계 풀이 생성 — LLM 1콜, 선택 인증, 한도 초과·실패 시 기본 풀이 |
| POST | `/api/v1/saju-g/readings` | 선택 | 설정값/분 | body | 사주(G) 풀이 생성(원국·올해·오늘) — LLM 1콜, 선택 인증, 한도 초과·실패 시 기본 풀이 |
| POST | `/api/v1/saju-g/shares` | 선택 | 10/분 | body | 사주(G) 공유 링크 발급 — receipt·readingId·birth·pair 중 하나, 취소용 revokeToken 반환 |
| GET | `/api/v1/saju-g/shares/:token` | 공개 | 120/분 |  | 공유된 사주(G) 요약 조회 — 원본 날짜·명식·AI 문장 미포함 |
| DELETE | `/api/v1/saju-g/shares/:token` | 공개 | 10/분 | body | 사주(G) 공유 취소 — 발급 때 받은 revokeToken 필요, 204 |
| GET | `/api/v1/saju-g/shares/:token/image.png` | 공개 | 120/분 |  | 사주(G) 공유 카드 PNG 이미지 |

## sea

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/sea/forecast` | 공개 | 60/분 | `activity`* | 활동별 생활해양예보지수(지점 × 7일) — 국립해양조사원 API 프록시, 1시간 캐시 |
| GET | `/api/v1/sea/tide` | 공개 | 60/분 | `lat`*, `lng`*, `date`* | 좌표에서 가장 가까운 조석 예보지점의 하루 만조·간조(물때) — 국립해양조사원, 12시간 캐시 |

## settlement

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| POST | `/api/v1/settlement-extraction/extract` | 로그인 |  | body | 영수증 항목 추출 — 비전 LLM 1콜, 식당 메뉴를 힌트로 품목·금액·분류 반환 |
| GET | `/api/v1/settlement-extraction/preview/:token` | 로그인 |  |  | 업로드한 영수증 사진 미리보기(image/jpeg) — JWT 필요 |
| POST | `/api/v1/settlement-extraction/upload` | 로그인 |  |  | 영수증 사진 업로드 — multipart 파일 1개(최대 5MB), imageToken 발급 |
| GET | `/api/v1/settlements` | 로그인 |  | `placeId`, `offset`, `limit` | 내 정산 목록 — 1차 식당 placeId 필터, offset 페이지네이션, 최신순 |
| POST | `/api/v1/settlements` | 로그인 |  | body | 정산 생성 — 차수·참여자·항목으로 1인당 분담액 계산 후 저장 |
| GET | `/api/v1/settlements/:id` | 로그인 |  |  | 내 정산 상세 — 차수·항목·참여자별 분담액, 영수증 미리보기 URL 포함 |
| PUT | `/api/v1/settlements/:id` | 로그인 |  | body | 정산 전체 교체 수정 — 차수·참여자·항목을 통째로 다시 저장하고 분담액 재계산 |
| DELETE | `/api/v1/settlements/:id` | 로그인 |  |  | 정산 삭제 |
| POST | `/api/v1/settlements/:id/share` | 로그인 |  | body | 정산 공유 링크 발급·연장 — 같은 토큰 유지, 만료 1d·7d(기본)·30d |
| DELETE | `/api/v1/settlements/:id/share` | 로그인 |  |  | 정산 공유 링크 회수 — 멱등, 다시 발급하면 새 토큰 |
| GET | `/api/v1/share/settlements/:token` | 공개 | 120/분 |  | 공유 링크로 정산 조회(인증 불필요) — 소유자·영수증 사진 제외, 만료 410 |

## settlement-contact

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/me/contacts` | 로그인 |  | `q`, `take` | 내 정산 단골 참여자 목록 — 이름·닉네임 부분일치 검색, 최근 사용순 |
| PATCH | `/api/v1/me/contacts/:id` | 로그인 |  | body | 단골 이름·닉네임 수정 — 같은 이름·닉네임 단골이 있으면 409 |
| DELETE | `/api/v1/me/contacts/:id` | 로그인 |  |  | 단골 삭제 — 과거 정산의 참여자 기록은 유지 |

## settlement-draft

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/settlement-drafts` | 로그인 |  |  | 내 정산 임시저장 목록 — 최근 수정순 |
| PUT | `/api/v1/settlement-drafts` | 로그인 |  | body | 정산 임시저장 upsert — 사용자·placeId 당 1개, 사용자당 최대 50개 |
| DELETE | `/api/v1/settlement-drafts/:id` | 로그인 |  |  | 정산 임시저장 삭제 |

## subway

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/subway/lines/:lineId/detail` | 공개 |  |  | 노선 상세(구간별 정차역 순서·노선 형상) — 로컬 DB |
| GET | `/api/v1/subway/lines/:lineId/positions` | 공개 | 60/분 |  | 노선 실시간 열차 위치 — 서울시 실시간 지하철 API 프록시, 15초 캐시 |
| GET | `/api/v1/subway/path` | 공개 |  | `from`*, `to`* | 두 역 간 지하철 경로 탐색 — 로컬 노선 그래프 최단경로 |
| GET | `/api/v1/subway/stations/nearby` | 공개 |  | `lat`*, `lng`*, `radius` | 좌표 기준 주변 전철역 — 로컬 역사마스터, 거리순 최대 30그룹 |
| GET | `/api/v1/subway/stations/search` | 공개 |  | `q`* | 수도권 전철역 이름 검색 — 로컬 역사마스터, 역명 그룹 최대 30개 |
| GET | `/api/v1/subway/stations/:stationId/arrivals` | 공개 | 60/분 |  | 역 실시간 열차 도착정보 — 서울시 실시간 지하철 API 프록시, 15초 캐시 |
| GET | `/api/v1/subway/stations/:stationId/congestion` | 공개 |  | `dayType` | 역 시간대별 혼잡도(1~8호선 30분 단위 통계) — 로컬 적재 |
| GET | `/api/v1/subway/stations/:stationId/timetable` | 공개 | 60/분 | `dayType` | 역 열차 시간표(1~9호선, 상·하행) — 서울 열린데이터광장, DB 30일 캐시 |

## subway-favorite

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/subway/favorites` | 로그인 |  |  | 지하철 즐겨찾기 전체 목록(역·역×호선) — 등록순 |
| PUT | `/api/v1/subway/favorites/lines/:stationId/:lineId` | 로그인 |  | body | 즐겨찾기 호선(역×호선) 추가·갱신 — 종류별 최대 100개, 변경 후 전체 목록 반환 |
| DELETE | `/api/v1/subway/favorites/lines/:stationId/:lineId` | 로그인 |  |  | 즐겨찾기 호선(역×호선) 삭제 — 멱등, 변경 후 전체 목록 반환 |
| PUT | `/api/v1/subway/favorites/stations/:stationId` | 로그인 |  | body | 즐겨찾기 역 추가·갱신 — 종류별 최대 100개, 변경 후 전체 목록 반환 |
| DELETE | `/api/v1/subway/favorites/stations/:stationId` | 로그인 |  |  | 즐겨찾기 역 삭제 — 멱등, 변경 후 전체 목록 반환 |
| POST | `/api/v1/subway/favorites/sync` | 로그인 |  | body | 게스트 즐겨찾기 병합(sync) — 서버에 없는 항목만 추가, 전체 목록 반환 |

## tarot

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/tarot/cards/:cardId/texture.jpg` | 공개 |  |  | 타로 카드 앞면 텍스처 JPEG(384px) — 앱 3D 무대용 |
| GET | `/api/v1/tarot/me/readings` | 로그인 |  | `cursor`, `limit` | 내 타로 기록 목록 — 최신순 커서 페이지네이션 |
| GET | `/api/v1/tarot/me/readings/:id` | 로그인 |  |  | 내 타로 기록 상세 조회 |
| DELETE | `/api/v1/tarot/me/readings/:id` | 로그인 |  |  | 내 타로 기록 삭제 — 성공 시 204 |
| POST | `/api/v1/tarot/readings` | 선택 | 설정값/분 | body | 타로 리딩 생성 — LLM 해석, 선택 인증(회원 자동 저장), 한도 초과 시 정적 해석 |
| POST | `/api/v1/tarot/shares` | 선택 | 10/분 | body | 타로 공유 링크 발급 — 회원은 readingId, 게스트는 리딩 입력 재전송(서버가 본문 확보) |
| GET | `/api/v1/tarot/shares/:token` | 공개 | 120/분 |  | 공유된 타로 리딩 조회 — 질문은 공유 시 포함을 고른 경우만 |

## tour

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/restaurants/public/:placeId/tour-stats` | 공개 | 120/분 |  | 맛집 여행자 방문 통계("여행자" 탭) — 집계만, 여행로그 매칭 없는 식당은 404 |
| GET | `/api/v1/tour/public/density` | 공개 | 120/분 | `kind`, `bbox` | 여행자 방문 밀도 격자(0.02°) — 여행 5건 미만 칸 제외, bbox 선택 |
| GET | `/api/v1/tour/public/insights` | 공개 | 120/분 | `region`, `ageGrp`, `gender`, `accompany`, `month`, `nights` | 여행 인사이트 집계 — 지역·연령·성별·동반·월·박수 필터, 여행 20건 미만이면 insufficient |
| GET | `/api/v1/tour/public/lodging` | 공개 | 120/분 | `region`, `ageGrp`, `gender`, `accompany`, `month`, `nights` | 여행 숙소 유형별 통계 — 결제액·1박 추정·예약률·만족도, 지역·연령 등 필터 |
| POST | `/api/v1/tour/public/plan` | 공개 | 120/분 | body | 비슷한 여행자 기반 코스 추천 — 조건 부족 시 월→성별→박수→연령 순 완화 |
| GET | `/api/v1/tour/public/regions` | 공개 | 120/분 | `region`, `ageGrp`, `gender`, `accompany`, `month`, `nights` | 여행 지역 비교 — 시군구(제주는 제주시·서귀포·부속섬) 집단·읍면동 상위 통계 |

## vote

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/share/votes/:token` | 선택 | 120/분 |  | 공유 링크로 투표 조회(인증 불필요) — 후보별 득표·투표자 이름, 만료 410 |
| PUT | `/api/v1/share/votes/:token/ballot` | 선택 | 30/분 | body | 공유 링크로 투표 제출(인증 불필요) — voterKey 의 찬성 후보 목록 전체 교체 |
| GET | `/api/v1/votes` | 로그인 |  |  | 내가 만든 투표 목록 — 최근 20개, 공유 토큰 포함(링크 복구용) |
| POST | `/api/v1/votes` | 로그인 |  | body | 그룹 투표 생성 — 식당 후보 2~8곳, 7일 유효 공유 토큰 즉시 발급 |
| POST | `/api/v1/votes/:id/close` | 로그인 |  |  | 투표 마감·승자 확정(방장만) — 동점이면 smart-pick 가중 랜덤, 멱등 |

## weather

| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |
|---|---|---|---|---|---|
| GET | `/api/v1/weather/aws` | 공개 | 60/분 | `lat`*, `lng`*, `radius`, `limit` | 좌표 기준 가까운 AWS 관측소의 매분 관측값 — 기상청 API허브, 2분 캐시 |
| GET | `/api/v1/weather/forecast` | 공개 | 60/분 | `nx`*, `ny`* | 단기예보(격자, 시간별·일별) — 기상청 단기예보 API 프록시, 다음 발표까지 캐시 |
| GET | `/api/v1/weather/mid` | 공개 | 60/분 | `land`*, `ta`*, `stn` | 중기예보(육상 날씨·기온·전망 문구) — 기상청 중기예보 API 프록시, 다음 발표까지 캐시 |
| GET | `/api/v1/weather/mid/sea` | 공개 | 60/분 | `regId`* | 중기해상예보(해역별 날씨·파고) — 기상청 중기예보 API 프록시, 다음 발표까지 캐시 |
| GET | `/api/v1/weather/nowcast` | 공개 | 60/분 | `nx`*, `ny`* | 초단기실황 + 초단기예보(격자) — 기상청 단기예보 API 프록시, 다음 발표까지 캐시 |
| GET | `/api/v1/weather/versions` | 공개 | 60/분 |  | 현재 발표 슬롯의 예보 버전(초단기실황·초단기예보·단기예보) — 기상청 API 프록시 |
