import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  Save,
  Search,
  Star,
  XCircle,
} from 'lucide-react';
import {
  useSaveTablingShop,
  useTablingRegistered,
  useTablingSearch,
} from '@repo/shared';
import type {
  SaveTablingShopResultType,
  TablingRegisteredEntryType,
  TablingSearchResultType,
  TablingSearchSortType,
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

// 테이블링 정식 크롤링 페이지. 테스트 페이지(/admin/tabling-test)와 검색은
// 동일하지만 운영 흐름에 맞춰 카드별 저장 + 자동매칭 결과 표시를 더했다.
// 저장은 saveTablingShop 이 리뷰 전체 페이지를 동기 수집하므로 서버 부하를
// 고려해 한 번에 1건 직렬 — 일괄 저장(SSE 잡)은 다이닝코드와 동일 인프라가
// 필요해 후속 작업으로 미룬다.
//
// 검색은 search_after 커서라 이전/다음 대신 누적 + "더 보기". 누적은 더 보기
// 클릭 핸들러에서 직전 페이지를 스냅샷으로 쌓는다 (useEffect 불필요).

const SORT_OPTIONS: Array<{ value: TablingSearchSortType; label: string }> = [
  { value: 'RECOMMEND', label: '추천 (기본)' },
  { value: 'RATING', label: '평점순' },
];

const PAGE_SIZE = 20;

const FLAG_LABELS: Array<{
  key: keyof TablingSearchResultType['flags'];
  label: string;
}> = [
  { key: 'useReservation', label: '예약' },
  { key: 'useWaiting', label: '웨이팅' },
  { key: 'useRemoteWaiting', label: '원격 웨이팅' },
  { key: 'useTakeOut', label: '포장' },
  { key: 'useOnSiteOrder', label: '현장주문' },
];

const Stars = ({ rating }: { rating: number | null }) => {
  if (rating === null || rating === 0) {
    return <span className="text-xs text-muted-foreground">평점 없음</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Star className="size-3.5 fill-amber-400 text-amber-400" />
      <span className="font-medium">{rating.toFixed(1)}</span>
    </span>
  );
};

const formatWon = (n: number): string => `${n.toLocaleString()}원`;

interface ResultCardProps {
  item: TablingSearchResultType;
  registered: TablingRegisteredEntryType | null;
  saveResult: SaveTablingShopResultType | null;
  saveError: string | null;
  saving: boolean;
  // 다른 카드가 저장 중이면 전체 저장 버튼 잠금 — 직렬 1건 정책.
  anySaving: boolean;
  onSave: (idx: number) => void;
}

const ResultCard = ({
  item,
  registered,
  saveResult,
  saveError,
  saving,
  anySaving,
  onSave,
}: ResultCardProps) => {
  const isRegistered = !!registered || !!saveResult;
  const activeFlags = FLAG_LABELS.filter((f) => item.flags[f.key]);
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <div className="flex gap-4 p-4 sm:gap-5 sm:p-5">
        <div className="size-24 shrink-0 overflow-hidden rounded-md bg-muted sm:size-28">
          {item.thumbnailUrl ? (
            <img
              src={item.thumbnailUrl}
              alt=""
              className="size-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
              No Image
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold leading-tight">
                {item.name}
                {item.isNew && (
                  <Badge variant="outline" className="ml-1.5 border-primary/50 text-[10px] text-primary">
                    NEW
                  </Badge>
                )}
              </h3>
            </div>
            <a
              href={item.rawSourceUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              title="테이블링에서 열기"
            >
              <ExternalLink className="size-4" />
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {item.category && (
              <Badge variant="secondary" className="font-normal">
                {item.category}
              </Badge>
            )}
            {item.summaryAddress && (
              <span className="truncate">{item.summaryAddress}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Stars rating={item.rating} />
            {item.reviewCount !== null && item.reviewCount > 0 && (
              <span>리뷰 {item.reviewCount.toLocaleString()}</span>
            )}
            {item.waitingCount !== null && item.waitingCount > 0 && (
              <Badge variant="outline" className="font-normal">
                웨이팅 {item.waitingCount}팀
              </Badge>
            )}
            {item.distance && (
              <Badge variant="outline" className="font-normal">
                {item.distance}
              </Badge>
            )}
          </div>
          {activeFlags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {activeFlags.map((f) => (
                <Badge
                  key={f.key}
                  variant="outline"
                  className="bg-[var(--tonal-blue-bg)] text-[10px] font-normal text-[var(--tonal-blue-fg)]"
                >
                  {f.label}
                </Badge>
              ))}
            </div>
          )}
          {item.recommendedMenus.length > 0 && (
            <div className="truncate text-xs text-muted-foreground">
              {item.recommendedMenus
                .slice(0, 3)
                .map((m) => (m.price !== null ? `${m.name} ${formatWon(m.price)}` : m.name))
                .join(' · ')}
            </div>
          )}
          {item.excerpt && (
            <blockquote className="line-clamp-2 border-l-2 border-muted pl-2 text-xs italic text-muted-foreground">
              {item.excerpt}
            </blockquote>
          )}
          {/* 저장 결과 — 자동매칭이 머지 테스트의 핵심 신호라 카드에 바로 노출. */}
          {saveResult && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {saveResult.autoMatched ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-400/40 text-emerald-700"
                >
                  <Link2 className="size-3" />
                  기존 가게에 자동 병합됨
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 border-amber-400/50 text-amber-700">
                  <AlertCircle className="size-3" />
                  자동매칭 안 됨 —{' '}
                  <Link to="/admin/restaurants" className="underline underline-offset-2">
                    맛집 페이지 제안 큐
                  </Link>{' '}
                  확인
                </Badge>
              )}
              <span className="text-muted-foreground">
                리뷰 {saveResult.newReviewCount}건 수집
              </span>
            </div>
          )}
          {saveError && (
            <div className="flex items-center gap-1 text-xs text-destructive">
              <XCircle className="size-3" />
              저장 실패: {saveError}
            </div>
          )}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {isRegistered && (
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-400/40 text-emerald-700"
                >
                  <CheckCircle2 className="size-3" />
                  등록됨
                </Badge>
              )}
            </div>
            {!isRegistered && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 gap-1 px-2 text-xs"
                disabled={anySaving}
                onClick={() => onSave(item.idx)}
                title="DB 저장 + 리뷰 수집 + 좌표 자동매칭"
              >
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                {saving ? '저장 중 (리뷰 수집)' : '저장'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

export const AdminTablingPage = () => {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TablingSearchSortType>('RECOMMEND');
  // 커서 누적 — prevItems 는 "더 보기" 시점에 직전 페이지를 쌓은 스냅샷.
  const [prevItems, setPrevItems] = useState<TablingSearchResultType[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  const search = useTablingSearch({
    q: query,
    cursor,
    pageSize: PAGE_SIZE,
    sort,
  });
  const isLoading = search.isFetching;
  const items = useMemo(
    () => [...prevItems, ...(search.data?.items ?? [])],
    [prevItems, search.data],
  );

  const allIdxs = useMemo(() => items.map((it) => it.idx), [items]);
  const registered = useTablingRegistered(allIdxs);
  const registeredMap = useMemo(() => {
    const m = new Map<number, TablingRegisteredEntryType>();
    for (const e of registered.data?.items ?? []) m.set(e.idx, e);
    return m;
  }, [registered.data]);

  // 저장은 한 번에 1건 직렬. 결과/에러는 idx 별로 보관해 카드에 잔존 표시.
  const save = useSaveTablingShop();
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [saveResults, setSaveResults] = useState<
    Map<number, SaveTablingShopResultType>
  >(new Map());
  const [saveErrors, setSaveErrors] = useState<Map<number, string>>(new Map());

  const handleSave = (idx: number) => {
    if (savingIdx !== null) return;
    setSavingIdx(idx);
    setSaveErrors((prev) => {
      const next = new Map(prev);
      next.delete(idx);
      return next;
    });
    save.mutate(idx, {
      onSuccess: (result) => {
        setSaveResults((prev) => new Map(prev).set(idx, result));
      },
      onError: (err) => {
        setSaveErrors((prev) =>
          new Map(prev).set(idx, err instanceof Error ? err.message : '알 수 없는 오류'),
        );
      },
      onSettled: () => setSavingIdx(null),
    });
  };

  const resetPaging = () => {
    setPrevItems([]);
    setCursor(null);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    resetPaging();
    setQuery(trimmed);
  };

  const handleMore = () => {
    const data = search.data;
    if (!data?.nextCursor) return;
    setPrevItems((prev) => [...prev, ...data.items]);
    setCursor(data.nextCursor);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <CalendarClock className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">테이블링 크롤링</h1>
          <p className="text-sm text-muted-foreground">
            키워드로 가게를 찾아 DB 에 등록합니다. 저장 시 리뷰 전체를 수집하고
            좌표 기준으로 기존 네이버/다이닝코드 가게에 자동 병합됩니다.
          </p>
        </div>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>검색 조건</CardTitle>
          <CardDescription>
            이름·지역·메뉴 키워드 검색 (테이블링 입점 가게만). 결과는 추천/평점
            정렬을 지원합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="예: 강남 스시, 성수 베이커리, 런던베이글"
                  className="pl-9"
                  disabled={isLoading}
                  autoFocus
                />
              </div>
              <Button type="submit" disabled={!input.trim() || isLoading}>
                {isLoading ? <Loader2 className="animate-spin" /> : <Search />}
                검색
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">정렬</span>
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value as TablingSearchSortType);
                    resetPaging();
                  }}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </form>
        </CardContent>
      </Card>

      {search.isError && (
        <Card className="mb-6 border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" />
              검색 실패
            </CardTitle>
            <CardDescription>
              {(search.error as Error | null)?.message ?? '알 수 없는 오류'}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {search.data && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary" className="font-normal">
            총 {search.data.total.toLocaleString()}건
          </Badge>
          <Badge variant="outline" className="font-normal">
            불러옴 {items.length}건
          </Badge>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {items.map((it) => (
            <ResultCard
              key={it.idx}
              item={it}
              registered={registeredMap.get(it.idx) ?? null}
              saveResult={saveResults.get(it.idx) ?? null}
              saveError={saveErrors.get(it.idx) ?? null}
              saving={savingIdx === it.idx}
              anySaving={savingIdx !== null}
              onSave={handleSave}
            />
          ))}
        </div>
      )}

      {search.data && items.length === 0 && !isLoading && (
        <Card>
          <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            결과 없음
          </CardContent>
        </Card>
      )}

      {search.data?.nextCursor && (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" size="sm" onClick={handleMore} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
            더 보기
          </Button>
        </div>
      )}

      {!query && (
        <Card className="border-dashed">
          <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            검색어를 입력하고 검색을 눌러 시작하세요.
          </CardContent>
        </Card>
      )}
    </div>
  );
};
