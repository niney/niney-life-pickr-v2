---
concept: 캐시 상한은 개수가 아니라 바이트 — 엔트리 크기가 흔들리면 개수 상한은 메모리 상한이 아니다
last_compiled: 2026-10-10
topics_connected: [friendly, air-quality, weather, review-search, crawl, tarot, saju-c, saju-g, settlement, housing, life-map, parking, map, tour, canonical]
status: active
---

# 캐시 상한은 개수가 아니라 바이트 — 엔트리 크기가 흔들리면 개수 상한은 메모리 상한이 아니다

## Pattern

Redis 금지(CLAUDE.md) 아래에서 캐시는 전부 프로세스 안의 `lru-cache` 나 `Map` 이다. 2026-10-05 이전엔 이 캐시들 대부분이 `max: N`(개수) 상한이거나 아예 상한이 없었고, 상한 값은 "엔트리 하나가 작다" 는 암묵적 가정 위에 있었다. 그런데 같은 캐시 안에서도 엔트리 크기는 수백 배 흔들린다 — 대기 측정소 시계열은 시간 24점(~18KB)일 때와 3개월 원본 2,200행(~1.5MB)일 때가 같은 1칸이고, 공유 PNG 는 og(수십 KB)와 story(1.3MB)가, 지도 셀 응답은 동네 화면과 z22 전국 화면(14MB)이, 리뷰 질문 코퍼스는 리뷰 30건 가게와 3천 건 가게가 같은 1칸이다. 운영은 pm2 `max_memory_restart` 1,500MiB 로 3주에 90회 강제 재시작됐고([docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md) 운영 증거), 감사는 "무인증 요청 1~3개로 600MB 를 넘는 경로가 여럿" 이라고 적었다(X-3). 개수 상한은 **엔트리 크기가 묶여 있을 때만** 메모리 상한이다.

성능 감사 2차의 처방은 세 갈래로 수렴했다. (1) 크기가 흔들리는 캐시는 `maxSize + sizeCalculation(+ttl)` 바이트 상한으로. (2) 크기를 묶을 수 있으면 **원본이 아니라 서빙 형태를 저장**해 개수 상한이 사실상 바이트 상한이 되게. (3) 같은 키의 동시 미스는 in-flight 합류로 한 번만 계산 — 바이트 상한만 있으면 동시 미스 10개가 각자 원본을 들고 피크를 만든다.

## Instances

- **2026-10-05** in [tarot](../topics/tarot.md) / [saju-c](../topics/saju-c.md) / [saju-g](../topics/saju-g.md) / [settlement](../topics/settlement.md) (`lib/share-render.ts` `SharePngCache`, `78cbb457`): 공유 PNG 캐시 5종을 `maxSize`(PNG 바이트) + TTL + 같은 키 렌더 합류로 — 개수 상한 시절 story PNG 100장이면 130MB 상주(F-3·X-4), 이제 다섯 캐시 합계 32MB 안팎. 타로 카드 텍스처도 같은 방식(`tarot-card-texture.ts` 6MB).
- **2026-10-05** in [air-quality](../topics/air-quality.md) (`air-quality.service.ts`, `fd957320`): **서빙 형태 저장** — 측정소 시계열 캐시에 업스트림 원본(3MONTH ≈2,200행 ≈1.2~1.5MB) 대신 화면이 쓰는 형태(시간 24점 또는 일평균 ≤92점, ≈18KB 이하)만 둔다. 개수 상한 300 이 그대로 ≈5MB 상한이 된다(E-3).
- **2026-10-05** in [weather](../topics/weather.md) (`weather.service.ts`, `fd957320`): 상한 없던 `Map` 을 `WEATHER_CACHE_MAX_BYTES` 32MB 바이트 LRU 로 — 엔트리 바이트는 넣을 때 한 번 잰다. 9,000격자 힙 +238 → +24MB(E-4).
- **2026-10-05** in [review-search](../topics/review-search.md) / [crawl](../topics/crawl.md) (`review-search.service.ts`, `ab7dad28`): 질문 코퍼스(리뷰 + BM25 인덱스) 캐시 `max: 16` → `CORPUS_CACHE_MAX_BYTES` 48MB + 미사용 30분 만료, 개수는 작은 가게가 많을 때만 닿는 백스톱. 반대로 크롤 결과 캐시는 가게당 0.2~0.35MB 로 크기가 묶여 있어 **개수 상한 + `ttlAutopurge`** 로 충분하다고 판단(예전 `Map` 은 만료돼도 지우지 않아 무한 상주) — 바이트 상한이 늘 정답은 아니라는 반례.
- **2026-10-05** in [housing](../topics/housing.md) / [life-map](../topics/life-map.md) / [parking](../topics/parking.md) / [map](../topics/map.md) (`lib/map-cells.ts` `CELL_CACHE_MAX_UNITS`, `5655abbc`): 지도 셀 결과 캐시 4곳(집값·일상지도·주차장·충전소)이 같은 크기 함수(`cellResultSize` = 응답의 셀 개수)로 합계 10만 셀 상한을 쓴다(바이트 대신 크기에 비례하는 단위) — 동시에 캐시에 들어갈 응답 자체를 셀 수 상한(6,000)으로 묶어 엔트리 크기도 묶었다([amplification-caps](amplification-caps.md)).
- **2026-10-05** in [friendly](../topics/friendly.md) (`media/thumbnail-cache.ts`·`panorama-cache.ts`, `622bfca2`): 디스크 캐시에도 같은 질문 — 썸네일 디스크 2GB 상한 정리 + `w·q` 를 22개 버킷으로 스냅(캐시 버스팅 차단) + 같은 키 합류 + 서로 다른 미스 동시 4(대기 128 초과 503). tmp→rename 원자 쓰기로 동시 미스가 반쯤 쓴 JPEG 를 덮던 경합도 함께.
- **2026-10-05** in [canonical](../topics/canonical.md) / [tour](../topics/tour.md) (`restaurant-public-base.ts`·`tour-aggregate-cache.ts`, `12bc6ac5`·`78ea38a5`): 바이트 상한의 반대편 — 키 공간 자체를 접는다. 공개 랭킹 캐시 키에 `minMentions`(0~1000)가 그대로 들어가 4,004키가 상주하던 것을 GROUP BY 결과 + 가게 메타 **단일 키**로 두고 필터는 메모리에서(B-5). 여행 인사이트도 적재 데이터 버전 키 위에 in-flight + 콜드 계산 동시 2.

## What This Means

1. **상한을 고를 때 "엔트리 하나가 얼마인가" 를 먼저 묻는다** — 답이 "입력에 따라 다르다" 면 개수 상한은 상한이 아니다. 바이트로 재거나(`sizeCalculation`), 저장 형태를 바꿔 크기를 묶거나, 키 공간을 접는다. 크롤 결과처럼 크기가 이미 묶여 있으면 개수 + 만료로 충분하다.
2. **캐시는 메모리 문제와 동시성 문제를 같이 가진다** — 바이트 상한은 "남아 있는 것" 만 묶는다. 같은 키 동시 미스가 각자 원본을 들고 있으면 피크는 캐시 밖에서 생긴다. 이번 라운드의 바이트 상한 캐시는 거의 전부 in-flight 합류와 짝을 이뤘다(`SharePngCache.get`, 썸네일 키별 합류, `TourAggregateCache`, 공개 맛집 베이스). [in-memory-singleton-gates](in-memory-singleton-gates.md) 의 게이트가 캐시 안으로 들어온 모양이다.
3. **네이티브 메모리는 바이트 상한 밖에 있다** — resvg 픽스맵·sharp 버퍼는 V8 이 모르는 메모리라 PNG 캐시를 32MB 로 묶어도 렌더 중 피크(story 8MB, 정산표 최대 16MB)와 GC 전 잔존이 남는다. 그래서 렌더 동시 1(동시 2 는 100렌더 뒤 RSS +230MB 실측)과 운영 할당자 시험(`MALLOC_ARENA_MAX=2`)이 따로 필요했다.
4. **운영 증거와 재는 법** — 이 패턴은 리뷰로는 잘 안 보인다. "상한 있음" 은 코드에 보이지만 "그 상한이 메모리로 얼마인가" 는 엔트리 크기 분포를 재야 안다. 감사가 동시 부하 RSS 피크·GC 후 잔존을 함께 잰 이유이고, 배포 뒤 판단 근거로 `plugins/mem-telemetry.ts`(10분마다 rss·heap·ext·ab 로그)를 둔 이유다.

## Sources

- [friendly](../topics/friendly.md)
- [air-quality](../topics/air-quality.md)
- [weather](../topics/weather.md)
- [review-search](../topics/review-search.md)
- [crawl](../topics/crawl.md)
- [tarot](../topics/tarot.md)
- [saju-c](../topics/saju-c.md)
- [saju-g](../topics/saju-g.md)
- [settlement](../topics/settlement.md)
- [housing](../topics/housing.md)
- [life-map](../topics/life-map.md)
- [parking](../topics/parking.md)
- [map](../topics/map.md)
- [tour](../topics/tour.md)
- [canonical](../topics/canonical.md)
- [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md)
- [apps/friendly/src/lib/share-render.ts](../../apps/friendly/src/lib/share-render.ts)
- [apps/friendly/src/lib/map-cells.ts](../../apps/friendly/src/lib/map-cells.ts)
- [in-memory-singleton-gates](in-memory-singleton-gates.md)
- [amplification-caps](amplification-caps.md)
