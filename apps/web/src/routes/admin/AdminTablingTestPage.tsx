import { useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Beaker,
  CheckCircle2,
  Clock,
  Code2,
  Crosshair,
  Database,
  ExternalLink,
  Loader2,
  MapPin,
  Phone,
  Search,
  Star,
  Store,
  Utensils,
} from 'lucide-react';
import {
  useSaveTablingShop,
  useTablingDiscover,
  useTablingRegistered,
  useTablingSearch,
  useTablingShop,
} from '@repo/shared';
import type {
  SaveTablingShopResultType,
  TablingSearchResultType,
  TablingSearchSortType,
  TablingShopDataType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Input } from '~/components/ui/input';

// 가게 발견 3경로: ① 키워드 검색(POST /v1/search/restaurants/map — 웹·앱 검색창이
// 쓰는 무인증 Elasticsearch), ② idx 직접 입력, ③ 사이트맵 전수 발견. 무인증
// REST(mobile-v2-api)라 상세 조회는 빠르다. 근거: docs/research/
// tabling-crawl-feasibility.md.

// 입력에서 idx 추출 — 숫자 또는 tabling.co.kr/restaurant/<idx> URL.
const parseIdx = (raw: string): number | null => {
  const s = raw.trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/restaurant\/(\d+)/);
  if (m && m[1]) return Number(m[1]);
  return null;
};

const RATING_LABEL: Record<string, string> = {
  TASTE: '맛',
  ATMOSPHERE: '분위기',
  SERVICE: '서비스',
  CLEAN: '청결',
};

const DOW_LABEL = ['', '월', '화', '수', '목', '금', '토', '일'];

const formatRating = (v: number | null): string =>
  v === null || v === 0 ? '—' : v.toFixed(1);

const formatPrice = (p: number | null): string =>
  p === null ? '' : `${p.toLocaleString()}원`;

const SaveResultCard = ({ result }: { result: SaveTablingShopResultType }) => (
  <Card className="border-emerald-400/40 bg-emerald-50/40">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base text-emerald-700">
        <CheckCircle2 className="size-4" />
        저장 완료
      </CardTitle>
    </CardHeader>
    <CardContent className="flex flex-wrap gap-2 text-xs">
      <Badge variant="outline" className="font-normal">
        리뷰 페이지 {result.fetchedPages}
      </Badge>
      <Badge variant="outline" className="font-normal">
        신규 리뷰 {result.newReviewCount} / 보고 {result.totalReviewsReported}
      </Badge>
      <Badge variant="outline" className="font-normal">
        AI 큐 {result.queuedForAnalysis}
      </Badge>
      {result.autoMatched ? (
        <Badge className="bg-emerald-600 font-normal hover:bg-emerald-600">
          자동 머지됨 → {result.matchedCanonicalId?.slice(0, 8)}…
        </Badge>
      ) : (
        <Badge variant="secondary" className="font-normal">
          자동매칭 없음 (신규 canonical)
        </Badge>
      )}
      <Badge variant="outline" className="font-normal text-muted-foreground">
        {result.elapsedMs} ms
      </Badge>
    </CardContent>
  </Card>
);

const SEARCH_SORTS: { value: TablingSearchSortType; label: string }[] = [
  { value: 'RECOMMEND', label: '추천순' },
  { value: 'RATING', label: '평점순' },
];

// 키워드 검색 결과 한 줄. 클릭하면 해당 idx 로 상세 조회가 떨어진다.
const SearchResultRow = ({
  item,
  registered,
  onLoad,
}: {
  item: TablingSearchResultType;
  registered: boolean;
  onLoad: (idx: number) => void;
}) => (
  <button
    type="button"
    onClick={() => onLoad(item.idx)}
    className="flex w-full items-start gap-3 rounded-md border bg-background p-2.5 text-left transition-colors hover:bg-accent"
  >
    {item.thumbnailUrl ? (
      <img
        src={item.thumbnailUrl}
        alt=""
        className="size-16 shrink-0 rounded-md object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    ) : (
      <div className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Store className="size-5" />
      </div>
    )}
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <span className="truncate font-medium">{item.name}</span>
        {item.isNew && (
          <Badge className="bg-sky-600 px-1.5 py-0 text-[10px] font-normal hover:bg-sky-600">
            NEW
          </Badge>
        )}
        {registered && (
          <Badge
            variant="outline"
            className="gap-0.5 border-emerald-400/40 px-1.5 py-0 text-[10px] font-normal text-emerald-700"
          >
            <CheckCircle2 className="size-2.5" />
            등록됨
          </Badge>
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        {item.category && <span>{item.category}</span>}
        {item.summaryAddress && (
          <span className="inline-flex items-center gap-0.5">
            <MapPin className="size-3" />
            {item.summaryAddress}
          </span>
        )}
        <span className="inline-flex items-center gap-0.5">
          <Star className="size-3 fill-amber-400 text-amber-400" />
          {formatRating(item.rating)}
          {item.reviewCount != null && item.reviewCount > 0 && (
            <span className="ml-0.5">({item.reviewCount.toLocaleString()})</span>
          )}
        </span>
      </div>
      {item.recommendedMenus.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {item.recommendedMenus.slice(0, 3).map((m, i) => (
            <Badge
              key={`${m.name}-${i}`}
              variant="secondary"
              className="px-1.5 py-0 text-[10px] font-normal"
            >
              {m.name}
              {m.price != null ? ` ${formatPrice(m.price)}` : ''}
            </Badge>
          ))}
        </div>
      )}
    </div>
    <span className="shrink-0 self-center font-mono text-[11px] text-muted-foreground/70">
      idx {item.idx}
    </span>
  </button>
);

const DetailCard = ({
  data,
  onSave,
  saving,
}: {
  data: TablingShopDataType;
  onSave: () => void;
  saving: boolean;
}) => (
  <Card className="overflow-hidden">
    {data.images.length > 0 && (
      <div className="flex gap-1.5 overflow-x-auto bg-muted/40 p-2">
        {data.images.slice(0, 8).map((url, i) => (
          <img
            key={`${url}-${i}`}
            src={url}
            alt=""
            className="size-24 shrink-0 rounded-md object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ))}
      </div>
    )}
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            {data.name}
            {data.statusLabel && (
              <Badge
                variant="outline"
                className={`font-normal ${
                  data.statusLabel.includes('영업')
                    ? 'border-emerald-400/40 text-emerald-700'
                    : ''
                }`}
              >
                {data.statusLabel}
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {data.category && (
              <Badge variant="secondary" className="font-normal">
                {data.category}
              </Badge>
            )}
            <span className="inline-flex items-center gap-1 text-sm">
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              <span className="font-medium">{formatRating(data.rating)}</span>
            </span>
            {data.reviewTotalCount != null && (
              <span className="text-xs">리뷰 {data.reviewTotalCount.toLocaleString()}</span>
            )}
            {data.favoriteCount != null && (
              <span className="text-xs">찜 {data.favoriteCount.toLocaleString()}</span>
            )}
          </CardDescription>
        </div>
        <a
          href={data.rawSourceUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          title="테이블링에서 열기"
        >
          <ExternalLink className="size-4" />
        </a>
      </div>
    </CardHeader>
    <CardContent className="space-y-4 text-sm">
      {/* 위치 · 연락처 · 좌표(머지키) */}
      <div className="space-y-1.5 text-muted-foreground">
        {(data.roadAddress ?? data.address) && (
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            <span>
              {data.roadAddress ?? data.address}
              {data.addressDetail ? ` ${data.addressDetail}` : ''}
            </span>
          </div>
        )}
        {data.phone && (
          <div className="flex items-center gap-2">
            <Phone className="size-4 shrink-0" />
            <span>{data.phone}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Crosshair className="size-4 shrink-0" />
          <span className="font-mono text-xs">
            {data.lat ?? '—'}, {data.lng ?? '—'}
            {(data.lat === null || data.lng === null) && (
              <span className="ml-1 text-destructive">좌표 없음 — 자동매칭 불가</span>
            )}
          </span>
        </div>
      </div>

      {/* 항목 평점 */}
      {data.ratings.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.ratings.map((r) => (
            <Badge key={r.category} variant="outline" className="font-normal">
              {RATING_LABEL[r.category] ?? r.category} {r.points.toFixed(1)}
            </Badge>
          ))}
        </div>
      )}

      {/* 영업시간 */}
      {data.businessDays.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="size-3.5" /> 영업시간
          </div>
          <div className="grid grid-cols-1 gap-0.5 text-xs text-muted-foreground sm:grid-cols-2">
            {data.businessDays.map((d) => {
              const t = d.openTimeList[0];
              return (
                <div key={d.dayOfWeek} className="flex gap-2">
                  <span className="w-4 font-medium">{DOW_LABEL[d.dayOfWeek] ?? d.dayOfWeek}</span>
                  <span>
                    {d.dayStatus === 'DAY_OFF' || !t
                      ? '휴무'
                      : `${t.startTime ?? '?'} - ${t.endTime ?? '?'}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 메뉴 */}
      {data.menuCategories.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Utensils className="size-3.5" /> 메뉴
          </div>
          <div className="space-y-2">
            {data.menuCategories.slice(0, 4).map((cat) => (
              <div key={cat.categoryName}>
                <div className="text-xs font-medium">{cat.categoryName}</div>
                <ul className="mt-0.5 space-y-0.5">
                  {cat.menus.slice(0, 6).map((m, i) => (
                    <li
                      key={`${m.name}-${i}`}
                      className="flex justify-between gap-2 text-xs text-muted-foreground"
                    >
                      <span className="truncate">
                        {m.isMain && <span className="mr-1 text-primary">★</span>}
                        {m.name}
                      </span>
                      <span className="shrink-0 tabular-nums">{formatPrice(m.price)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 리뷰 첫 페이지 */}
      {data.reviewsFirstPage.list.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            리뷰 (첫 {data.reviewsFirstPage.list.length}건 / 총{' '}
            {data.reviewsFirstPage.totalCount.toLocaleString()})
          </div>
          <div className="space-y-2">
            {data.reviewsFirstPage.list.slice(0, 4).map((rv) => (
              <div key={rv.idx} className="rounded-md border bg-muted/20 p-2 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="font-medium text-foreground">{rv.nickname ?? '익명'}</span>
                  {rv.rating != null && (
                    <span className="inline-flex items-center gap-0.5">
                      <Star className="size-3 fill-amber-400 text-amber-400" />
                      {rv.rating}
                    </span>
                  )}
                  {rv.reviewDate && <span>{rv.reviewDate}</span>}
                </div>
                {rv.contents && (
                  <p className="mt-1 line-clamp-2 text-muted-foreground">{rv.contents}</p>
                )}
                {rv.menuOrders.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {rv.menuOrders.slice(0, 4).map((mo, i) => (
                      <Badge key={`${mo}-${i}`} variant="outline" className="text-[10px] font-normal">
                        {mo}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <span className="font-mono text-[11px] text-muted-foreground/80">idx {data.idx}</span>
        <Button onClick={onSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
          DB에 저장
        </Button>
      </div>
    </CardContent>
  </Card>
);

export const AdminTablingTestPage = () => {
  const [input, setInput] = useState('');
  const [idx, setIdx] = useState<number | null>(null);
  const [saveResult, setSaveResult] = useState<SaveTablingShopResultType | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSort, setSearchSort] = useState<TablingSearchSortType>('RECOMMEND');

  const shop = useTablingShop(idx);
  const save = useSaveTablingShop();
  const discover = useTablingDiscover('shop', 1, showDiscover);
  const search = useTablingSearch({ q: searchQuery, sort: searchSort });

  // 검색 결과 idx 들의 등록 여부 — '등록됨' 배지용.
  const searchIdxs = useMemo(
    () => search.data?.items.map((i) => i.idx) ?? [],
    [search.data],
  );
  const registered = useTablingRegistered(searchIdxs);
  const registeredSet = useMemo(
    () => new Set(registered.data?.items.map((i) => i.idx) ?? []),
    [registered.data],
  );

  const parsed = useMemo(() => parseIdx(input), [input]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (parsed === null) return;
    setSaveResult(null);
    setIdx(parsed);
  };

  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
  };

  const loadIdx = (n: number) => {
    setInput(String(n));
    setSaveResult(null);
    setIdx(n);
  };

  const handleSave = () => {
    if (idx === null) return;
    save.mutate(idx, { onSuccess: (r) => setSaveResult(r) });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Beaker className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">테이블링 크롤링 테스트</h1>
          <p className="text-sm text-muted-foreground">
            테이블링 무인증 REST(<code>mobile-v2-api.tabling.co.kr</code>) 응답을 그대로
            보여줍니다. 키워드 검색, idx 직접 입력, 사이트맵 발견으로 가게를 찾습니다.
          </p>
        </div>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="size-4" />
            키워드 검색
          </CardTitle>
          <CardDescription>
            가게명·메뉴·지역 등으로 입점 매장을 검색합니다. 카드를 누르면 해당 가게
            상세가 아래에 조회됩니다. (<code>POST /v1/search/restaurants/map</code>)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="예: 강남 파스타, 우진해장국, 성수 카페"
                className="pl-9"
              />
            </div>
            <select
              value={searchSort}
              onChange={(e) => setSearchSort(e.target.value as TablingSearchSortType)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="정렬"
            >
              {SEARCH_SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={!searchInput.trim() || search.isFetching}>
              {search.isFetching ? <Loader2 className="animate-spin" /> : <Search />}
              검색
            </Button>
          </form>

          {search.isError && (
            <p className="text-xs text-destructive">
              {(search.error as Error | null)?.message ?? '검색 실패'}
            </p>
          )}

          {search.data && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {search.data.items.length}건 표시
                {search.data.total > 0 && ` / 매칭 약 ${search.data.total.toLocaleString()}건`}
                {search.data.nextCursor && ' · 더 있음'}
              </p>
              {search.data.items.length === 0 ? (
                <div className="rounded-md border border-dashed bg-muted/30 p-4 text-center text-xs text-muted-foreground">
                  결과 없음 — 다른 키워드를 시도해 보세요.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {search.data.items.map((item) => (
                    <SearchResultRow
                      key={item.idx}
                      item={item}
                      registered={registeredSet.has(item.idx)}
                      onLoad={loadIdx}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>가게 조회</CardTitle>
          <CardDescription>
            가게 idx(예: <code>27</code>) 또는 테이블링 URL(
            <code>tabling.co.kr/restaurant/27</code>)을 입력하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Store className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="27 또는 https://www.tabling.co.kr/restaurant/27"
                className="pl-9"
                autoFocus
              />
            </div>
            <Button type="submit" disabled={parsed === null || shop.isFetching}>
              {shop.isFetching ? <Loader2 className="animate-spin" /> : <Search />}
              조회
            </Button>
          </form>
          {input.trim() && parsed === null && (
            <p className="text-xs text-destructive">
              숫자 idx 또는 /restaurant/&lt;idx&gt; URL 을 입력해 주세요.
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setShowDiscover((v) => !v)}
          >
            <Search className="size-3.5" />
            {showDiscover ? '사이트맵 발견 접기' : '사이트맵으로 가게 발견 (partner)'}
          </Button>
          {showDiscover && (
            <div className="rounded-md border border-dashed bg-muted/30 p-3">
              {discover.isLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> 사이트맵 로딩 중…
                </div>
              ) : discover.data ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    partner 매장 {discover.data.total.toLocaleString()}개 — 일부를 눌러 조회:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {discover.data.ids.slice(0, 40).map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => loadIdx(Number(id))}
                        className="rounded-md border bg-background px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">발견 결과 없음</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {shop.isError && (
        <Card className="mb-6 border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" />
              조회 실패
            </CardTitle>
            <CardDescription>
              {(shop.error as Error | null)?.message ?? '알 수 없는 오류'}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {save.isError && (
        <Card className="mb-6 border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" />
              저장 실패
            </CardTitle>
            <CardDescription>
              {(save.error as Error | null)?.message ?? '알 수 없는 오류'}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {saveResult && (
        <div className="mb-6">
          <SaveResultCard result={saveResult} />
        </div>
      )}

      {shop.data && (
        <div className="space-y-6">
          <DetailCard data={shop.data} onSave={handleSave} saving={save.isPending} />

          <Card>
            <button type="button" onClick={() => setShowRaw((v) => !v)} className="w-full text-left">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Code2 className="size-4" />
                    원본 응답 JSON
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {showRaw ? '접기' : '펼치기'}
                  </span>
                </div>
              </CardHeader>
            </button>
            {showRaw && (
              <CardContent>
                <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">
                  {JSON.stringify(shop.data, null, 2)}
                </pre>
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {!shop.data && !shop.isFetching && (
        <Card className="border-dashed">
          <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            idx 를 입력하고 조회를 눌러 시작하세요.
          </CardContent>
        </Card>
      )}
    </div>
  );
};
