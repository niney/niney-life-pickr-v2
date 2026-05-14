import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Beaker,
  ChevronRight,
  Code2,
  ExternalLink,
  Loader2,
  Search,
  Star,
} from 'lucide-react';
import { useCatchtableSearch } from '@repo/shared';
import type { CatchtableSearchResultType } from '@repo/api-contract';
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

// 캐치테이블 자체 검색 API 로 어떤 결과가 돌아오는지 검증하는 어드민 페이지.
// 네이버 크롤링 테스트와 달리 SSE 잡 없이 동기 검색 — 검색→카드 list 한 번에.
// 페이지네이션은 offset 토큰 한 단계만 — "더 보기" 누르면 다음 페이지로 갈아탐
// (누적 X). 운영 도구가 아니라 검증 도구라 단순한 흐름이 우선.

const SERVICE_LABEL: Record<string, string> = {
  DINING: '다이닝',
  WAITING: '웨이팅',
  PICKUP: '픽업',
};

const OPERATION_LABEL: Record<string, string> = {
  OPEN: '영업 중',
  CLOSE: '영업 종료',
  DAY_OFF: '휴무',
  BREAK_TIME: '브레이크 타임',
};

const formatScore = (score: number | null): string => {
  if (score === null || score === 0) return '—';
  return score.toFixed(1);
};

const Stars = ({ score }: { score: number | null }) => {
  if (score === null || score === 0) {
    return <span className="text-xs text-muted-foreground">평점 없음</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Star className="size-3.5 fill-amber-400 text-amber-400" />
      <span className="font-medium">{formatScore(score)}</span>
    </span>
  );
};

const ResultCard = ({ item }: { item: CatchtableSearchResultType }) => (
  <Card className="overflow-hidden transition-shadow hover:shadow-md">
    <div className="flex gap-4 p-4 sm:gap-5 sm:p-5">
      <div className="size-24 shrink-0 overflow-hidden rounded-md bg-muted sm:size-28">
        {item.imageUrl ? (
          // 캐치테이블 ugc CDN — 핫링크 금지 referer 미적용. 안전하게 no-referrer.
          <img
            src={item.imageUrl}
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
          <h3 className="truncate text-base font-semibold leading-tight">{item.shopName}</h3>
          <a
            href={item.rawSourceUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            title="캐치테이블에서 열기"
          >
            <ExternalLink className="size-4" />
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {item.foodKind && <Badge variant="secondary" className="font-normal">{item.foodKind}</Badge>}
          {item.landName && <span className="truncate">{item.landName}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <Stars score={item.avgScore} />
          {item.reviewCount > 0 && <span>리뷰 {item.reviewCount.toLocaleString()}</span>}
          {item.mainService && SERVICE_LABEL[item.mainService] && (
            <Badge variant="outline" className="font-normal">
              {SERVICE_LABEL[item.mainService]}
            </Badge>
          )}
          {item.operationStatus && OPERATION_LABEL[item.operationStatus] && (
            <Badge variant="outline" className="font-normal">
              {OPERATION_LABEL[item.operationStatus]}
            </Badge>
          )}
        </div>
        {item.badges.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.badges.slice(0, 5).map((b, i) => (
              <Badge key={`${b}-${i}`} variant="outline" className="text-[10px] font-normal">
                {b}
              </Badge>
            ))}
          </div>
        )}
        <div className="mt-auto pt-1 text-[11px] text-muted-foreground/80">
          <span className="font-mono">{item.shopRef}</span>
        </div>
      </div>
    </div>
  </Card>
);

const Pager = ({
  hasMore,
  hasPrev,
  loading,
  onNext,
  onReset,
}: {
  hasMore: boolean;
  hasPrev: boolean;
  loading: boolean;
  onNext: () => void;
  onReset: () => void;
}) => {
  if (!hasMore && !hasPrev) return null;
  return (
    <div className="flex justify-center gap-2 pt-2">
      {hasPrev && (
        <Button variant="outline" size="sm" onClick={onReset} disabled={loading}>
          처음으로
        </Button>
      )}
      {hasMore && (
        <Button variant="outline" size="sm" onClick={onNext} disabled={loading}>
          다음 페이지
          <ChevronRight className="ml-1 size-4" />
        </Button>
      )}
    </div>
  );
};

export const AdminCatchtableTestPage = () => {
  // input vs query 분리 — input 은 폼 상태, query 는 submit 시점에만 갱신.
  // (네이버 discover 페이지와 다른 점 — 거기는 디바운스 자동 검색, 여기는 명시
  // submit. 검증 도구라 의도된 검색만 발사하도록.)
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState<string | null>(null);
  const [contractedOnly, setContractedOnly] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  const search = useCatchtableSearch({
    q: query,
    offset,
    contractedOnly,
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    // 새 쿼리는 항상 첫 페이지부터.
    setOffset(null);
    setQuery(trimmed);
  };

  const handleToggleContracted = () => {
    setContractedOnly((prev) => !prev);
    // 필터 바뀌면 다시 첫 페이지부터.
    setOffset(null);
  };

  const data = search.data;
  const isLoading = search.isFetching;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Beaker className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">캐치테이블 크롤링 테스트</h1>
          <p className="text-sm text-muted-foreground">
            검색어를 넣으면 캐치테이블 자체 검색 API 응답을 그대로 보여줍니다. 등록 파이프라인에 연결되기 전 데이터 품질을 검증하는 도구.
          </p>
        </div>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>검색어</CardTitle>
          <CardDescription>
            식당명·지역명·카테고리 모두 가능. 첫 검색은 브라우저 워밍업으로 10~15초 걸릴 수 있습니다.
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
                  placeholder="예: 노티드, 런던베이글뮤지엄, 강남역"
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
            <div className="flex flex-wrap gap-2">
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition ${
                  contractedOnly
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-input hover:bg-muted/50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={contractedOnly}
                  onChange={handleToggleContracted}
                  className="sr-only"
                />
                <span className="font-medium">가맹점만</span>
                <span className="text-xs text-muted-foreground">
                  {contractedOnly ? '캐치테이블 예약 가능 가게만' : '비가맹점 포함 전체'}
                </span>
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

      {data && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary" className="font-normal">
            총 {data.totalShopCount.toLocaleString()}건
          </Badge>
          <Badge variant="outline" className="font-normal">
            이 페이지 {data.items.length}건
          </Badge>
          <Badge variant="outline" className="font-normal">
            {data.elapsedMs} ms
          </Badge>
          <Badge variant="outline" className="font-normal">
            source: {data.source}
          </Badge>
          {data.fallback && (
            <Badge variant="destructive" className="font-normal">
              fallback — 키워드 매칭 실패
            </Badge>
          )}
        </div>
      )}
      {data?.fallback && (
        <p className="mb-4 text-xs text-muted-foreground">
          검색어가 캐치테이블 DB와 매칭되지 않아 추천 결과로 떨어졌습니다. 다른 키워드를 시도하거나 식당명 일부만 입력해 보세요.
        </p>
      )}

      {data && data.items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.items.map((it) => (
            <ResultCard key={`${it.shopRef}-${it.urlPathAlias ?? ''}`} item={it} />
          ))}
        </div>
      )}

      {data && data.items.length === 0 && !isLoading && (
        <Card>
          <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            결과 없음
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="mt-6">
          <Pager
            hasMore={data.hasMore}
            hasPrev={offset !== null}
            loading={isLoading}
            onNext={() => data.nextOffset && setOffset(data.nextOffset)}
            onReset={() => setOffset(null)}
          />
        </div>
      )}

      {data && (
        <Card className="mt-6">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="w-full text-left"
          >
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
                {JSON.stringify(data, null, 2)}
              </pre>
            </CardContent>
          )}
        </Card>
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
