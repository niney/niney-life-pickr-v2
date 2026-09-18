import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ExternalLink, FileSearch, Loader2, RefreshCw, Search } from 'lucide-react';
import {
  useTourAdminStatus,
  useTourBizCheck,
  useTourMatchRun,
  useTourSeedDiscover,
  useTourSeedRegister,
  useTourSeeds,
} from '@repo/shared';
import type { TourSeedCandidateType, TourSeedItemType, TourSeedStatusFilterType } from '@repo/api-contract';
import { TOUR_DATASETS, TOUR_DATASET_KEYS, type TourDatasetKey } from '@repo/utils';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Pager } from '~/components/ui/pager';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { TourEvidencePanel } from '~/components/admin/tour/TourEvidencePanel';
import { cn } from '~/lib/utils';

// 어드민 "여행로그 시드" — AI 허브 여행로그(71780 제주·도서 + 71779 서부권 + 71778 동부권, 2023)에서 여행자가 실제로 많이 간 식당 중
// 아직 맛집 DB 에 없는 곳을 네이버 검색으로 등록하는 콘솔. 상단은 데이터셋별 적재·매칭·폐업 조회 상태와 실행 버튼, 아래는 장소
// 단위 집계 표(개별 방문 행은 없다 — docs/PLAN-tour-log.md). 등록은 기존 크롤 잡이라 진행은 크롤 테스트 페이지 링크로 본다.

const PAGE_SIZE = 50;
// 시드 콘솔 지역 필터 — 적재된 데이터셋 단위(전체/제주·도서/서부권/동부권, utils TOUR_DATASETS 순서). 세밀한 시도 필터는 공개 화면(/travel)에서.
type SeedRegion = 'all' | TourDatasetKey;
const REGION_OPTIONS: Array<{ value: SeedRegion; label: string }> = [
  { value: 'all', label: '전체' },
  ...TOUR_DATASET_KEYS.map((k) => ({ value: k, label: TOUR_DATASETS[k].label })),
];
const STATUS_OPTIONS: Array<{ value: TourSeedStatusFilterType; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'unmatched', label: '미매칭' },
  { value: 'matched', label: '매칭됨' },
  { value: 'closed', label: '폐업·휴업' },
];

const won = (v: number | null): string => (v === null ? '–' : `${Math.round(v).toLocaleString('ko-KR')}원`);

export const AdminTourPage = () => {
  const [region, setRegion] = useState<SeedRegion>('all');
  const [minTravelers, setMinTravelers] = useState(5);
  const [status, setStatus] = useState<TourSeedStatusFilterType>('unmatched');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [maxCalls, setMaxCalls] = useState(10);
  // 펼친 행(후보 찾기 또는 원본 근거)과 등록 결과(잡 ID) — 이벤트 핸들러에서만 바뀐다.
  const [open, setOpen] = useState<{ placeId: string; mode: 'discover' | 'evidence' } | null>(null);
  const openPlaceId = open?.placeId ?? null;
  const [registered, setRegistered] = useState<Record<string, { jobId: string; name: string }>>({});

  const statusQ = useTourAdminStatus();
  const seedsQ = useTourSeeds({ region, minTravelers, status, q: q || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const discover = useTourSeedDiscover();
  const register = useTourSeedRegister();
  const matchRun = useTourMatchRun();
  const bizCheck = useTourBizCheck();

  const st = statusQ.data;
  const seeds = seedsQ.data;

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setQ(qInput.trim());
    setPage(1);
  };

  const onDiscover = (placeId: string) => {
    setOpen({ placeId, mode: 'discover' });
    discover.mutate(placeId);
  };
  const onEvidence = (placeId: string) => setOpen({ placeId, mode: 'evidence' });

  const onRegister = (item: TourSeedItemType, cand: TourSeedCandidateType) => {
    register.mutate(
      { placeId: item.placeId, rawSourceUrl: cand.rawSourceUrl },
      {
        onSuccess: (res) => {
          const start = res.start;
          if (!start.ok) return;
          const jobId = start.jobId;
          setRegistered((prev) => ({ ...prev, [item.placeId]: { jobId, name: cand.name } }));
        },
      },
    );
  };

  return (
    <div className="container mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <CardTitle>여행로그 시드</CardTitle>
          <CardDescription>
            AI 허브 「국내 여행로그 데이터」(제주·도서 71780 + 서부권 71779, 2023) 에서 여행자가 실제로 많이 간 식당을 골라 등록합니다. 표는 장소
            단위 집계뿐이고 개별 여행·방문 기록은 없습니다. 3년 전 표본이라 폐업 확인(국세청) 후 크롤하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {statusQ.isLoading && <p className="text-sm text-muted-foreground">상태 불러오는 중…</p>}
          {statusQ.isError && <p className="text-sm text-destructive">{(statusQ.error as Error).message}</p>}
          {st && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="적재"
                value={st.loaded ? `${st.places.toLocaleString('ko-KR')}곳` : '없음'}
                sub={st.loaded ? st.datasets.map((d) => `${d.label} ${d.loaded ? `${d.places.toLocaleString('ko-KR')}` : '없음'}`).join(' · ') : 'pnpm --filter friendly load:tour'}
                title={st.loaded ? st.datasets.map((d) => `${d.label}: ${d.sourceFile ?? '-'} · 기준 ${d.baseDate ?? '-'}`).join('\n') : undefined}
                tone={st.loaded ? 'ok' : 'warn'}
              />
              <Stat
                label="맛집 매칭"
                value={`${st.match.matched.toLocaleString('ko-KR')} / ${st.match.candidates.toLocaleString('ko-KR')}`}
                sub={`보류 ${st.match.missing} · 대상 = 좌표 있는 등록 맛집`}
                title="매칭 수 / 대상 수. 대상 = 좌표와 식당 행이 있는 canonical 맛집. 보류 = 재적재로 장소가 사라진 매칭"
                tone={st.match.matched > 0 ? 'ok' : 'muted'}
              />
              <Stat
                label="폐업 조회"
                value={`${st.biz.checked.toLocaleString('ko-KR')}곳`}
                sub={`영업 ${st.biz.open} · 휴업 ${st.biz.suspended} · 폐업 ${st.biz.closed} · 미등록 ${st.biz.unknown}${st.biz.lastCheckedAt ? ` · ${st.biz.lastCheckedAt.slice(0, 10)}` : ''}`}
                tone={st.biz.keyConfigured ? (st.biz.checked > 0 ? 'ok' : 'muted') : 'warn'}
              />
              <Stat
                label="식당류 시드"
                value={`${st.seeds.unmatchedT5.toLocaleString('ko-KR')}곳 미매칭`}
                sub={`5명↑ ${st.seeds.t5.toLocaleString('ko-KR')} · 3명↑ ${st.seeds.t3.toLocaleString('ko-KR')} · 전체 ${st.seeds.restaurants.toLocaleString('ko-KR')}`}
                title="적재된 전체 데이터셋의 식당류(식당·상업·상점) 장소 기준"
                tone="muted"
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={matchRun.isPending} onClick={() => matchRun.mutate()}>
              {matchRun.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              매칭 다시 실행
            </Button>
            {matchRun.data && (
              <span className="text-xs text-muted-foreground">
                검토 {matchRun.data.scanned} · 신규 {matchRun.data.created} · 유지 {matchRun.data.kept} · 옮김 {matchRun.data.rematched} · 보류 {matchRun.data.newlyMissing} · 미매칭 {matchRun.data.unmatched} ({(matchRun.data.durationMs / 1000).toFixed(1)}s)
              </span>
            )}
            <span className="mx-1 hidden h-4 border-l sm:inline-block" />
            <label className="flex items-center gap-1 text-xs text-muted-foreground" htmlFor="tour-max-calls">
              호출 상한
              <Input id="tour-max-calls" type="number" min={1} max={50} value={maxCalls} onChange={(e) => setMaxCalls(Number(e.target.value) || 1)} className="h-8 w-16" />
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={bizCheck.isPending || !st?.biz.keyConfigured}
              title={st && !st.biz.keyConfigured ? 'DATA_GO_KR_API_KEY 가 없습니다' : '국세청 사업자 상태조회(15081808) — 100건/콜'}
              onClick={() => bizCheck.mutate({ maxCalls, region, minTravelers: 3 })}
            >
              {bizCheck.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
              폐업 조회 실행
            </Button>
            {bizCheck.data && (
              <span className={cn('text-xs', bizCheck.data.stopped === 'done' || bizCheck.data.stopped === 'maxCalls' ? 'text-muted-foreground' : 'text-destructive')}>
                대상 {bizCheck.data.candidates} · 조회 필요 {bizCheck.data.pending} · 호출 {bizCheck.data.calls} · 갱신 {bizCheck.data.checked} (영업 {bizCheck.data.byStatus.open} · 휴업 {bizCheck.data.byStatus.suspended} · 폐업 {bizCheck.data.byStatus.closed} · 미등록 {bizCheck.data.byStatus.unknown})
                {bizCheck.data.stopped !== 'done' && ` · 중단: ${bizCheck.data.stopped}${bizCheck.data.error ? ` — ${bizCheck.data.error}` : ''}`}
              </span>
            )}
            {(matchRun.isError || bizCheck.isError) && (
              <span className="text-xs text-destructive">{((matchRun.error ?? bizCheck.error) as Error).message}</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-[11px] text-muted-foreground">지역</span>
            <div className="-ml-2 flex rounded-md border p-0.5 text-xs">
              {REGION_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={cn('rounded px-2 py-1', region === r.value ? 'bg-muted font-semibold' : 'text-muted-foreground')}
                  onClick={() => {
                    setRegion(r.value);
                    setPage(1);
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground">상태</span>
            <div className="-ml-2 flex rounded-md border p-0.5 text-xs">
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={cn('rounded px-2 py-1', status === o.value ? 'bg-muted font-semibold' : 'text-muted-foreground')}
                  onClick={() => {
                    setStatus(o.value);
                    setPage(1);
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1 text-xs text-muted-foreground" htmlFor="tour-min-travelers">
              여행자
              <Input
                id="tour-min-travelers"
                type="number"
                min={1}
                max={1000}
                value={minTravelers}
                onChange={(e) => {
                  setMinTravelers(Math.max(1, Number(e.target.value) || 1));
                  setPage(1);
                }}
                className="h-8 w-16"
              />
              명 이상
            </label>
            <form onSubmit={onSearch} className="flex items-center gap-1">
              <Input id="tour-seed-q" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="가게 이름" className="h-8 w-40" />
              <Button type="submit" size="sm" variant="outline">
                검색
              </Button>
            </form>
            <span className="ml-auto text-xs text-muted-foreground">{seeds ? `${seeds.total.toLocaleString('ko-KR')}곳` : ''}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {seedsQ.isError && <p className="text-sm text-destructive">{(seedsQ.error as Error).message}</p>}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 whitespace-nowrap">#</TableHead>
                  <TableHead className="min-w-[180px] whitespace-nowrap">가게</TableHead>
                  <TableHead className="whitespace-nowrap">주소</TableHead>
                  <TableHead className="w-16 whitespace-nowrap text-right" title="서로 다른 여행(여행자) 수">여행자</TableHead>
                  <TableHead className="w-16 whitespace-nowrap text-right">방문</TableHead>
                  <TableHead className="w-16 whitespace-nowrap text-right" title="보정 만족도(베이즈, 평가 3건 미만은 –)">만족</TableHead>
                  <TableHead className="w-24 whitespace-nowrap text-right" title="1인당 지출 중앙값">1인 지출</TableHead>
                  <TableHead className="whitespace-nowrap">상태</TableHead>
                  <TableHead className="w-36" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {seeds?.items.map((it, i) => {
                  const rank = (page - 1) * PAGE_SIZE + i + 1;
                  const isOpen = openPlaceId === it.placeId;
                  const reg = registered[it.placeId];
                  return (
                    <SeedRows
                      key={it.placeId}
                      item={it}
                      rank={rank}
                      isOpen={isOpen}
                      mode={isOpen ? open!.mode : null}
                      discover={isOpen && open!.mode === 'discover' ? discover : null}
                      registerPending={register.isPending && register.variables?.placeId === it.placeId}
                      registerError={register.isError && register.variables?.placeId === it.placeId ? (register.error as Error).message : null}
                      registeredJob={reg ?? null}
                      onDiscover={() => onDiscover(it.placeId)}
                      onEvidence={() => onEvidence(it.placeId)}
                      onClose={() => setOpen(null)}
                      onRegister={(cand) => onRegister(it, cand)}
                    />
                  );
                })}
                {seeds && seeds.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                      {st && !st.loaded ? '여행로그가 적재되지 않았습니다.' : '조건에 맞는 장소가 없습니다.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <Pager total={seeds?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} pageSizeOptions={[PAGE_SIZE]} />
          <p className="text-[11px] text-muted-foreground">
            출처: 「국내 여행로그 데이터(제주도 및 도서지역)」 AI 허브(aihub.or.kr) · 과학기술정보통신부·한국지능정보사회진흥원 인공지능 학습용 데이터 구축사업 결과물(2023). 2023년 4~9월 패널 표본 집계.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

const Stat = ({ label, value, sub, title, tone }: { label: string; value: string; sub: string; title?: string; tone: 'ok' | 'warn' | 'muted' }) => (
  <div className="min-w-0 rounded-md border p-3" title={title ?? sub}>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={cn('mt-0.5 truncate text-lg font-semibold tabular-nums', tone === 'warn' && 'text-amber-600 dark:text-amber-400', tone === 'ok' && 'text-foreground')}>{value}</div>
    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</div>
  </div>
);

const SeedRows = ({
  item,
  rank,
  isOpen,
  mode,
  discover,
  registerPending,
  registerError,
  registeredJob,
  onDiscover,
  onEvidence,
  onClose,
  onRegister,
}: {
  item: TourSeedItemType;
  rank: number;
  isOpen: boolean;
  mode: 'discover' | 'evidence' | null;
  discover: ReturnType<typeof useTourSeedDiscover> | null;
  registerPending: boolean;
  registerError: string | null;
  registeredJob: { jobId: string; name: string } | null;
  onDiscover: () => void;
  onEvidence: () => void;
  onClose: () => void;
  onRegister: (cand: TourSeedCandidateType) => void;
}) => {
  const closed = item.biz && (item.biz.bStt === '폐업자' || item.biz.bStt === '휴업자');
  const result = discover?.data && discover.data.tourPlaceId === item.placeId ? discover.data : null;
  return (
    <>
      <TableRow className={cn(isOpen && 'bg-muted/40')}>
        <TableCell className="text-xs text-muted-foreground">{rank}</TableCell>
        <TableCell>
          <div className="font-medium">{item.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {item.typeShort}
            {item.poiId ? ' · POI' : ''}
          </div>
        </TableCell>
        <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground" title={item.roadAddr ?? ''}>
          {item.roadAddr?.replace('제주특별자치도 ', '') ?? '–'}
        </TableCell>
        <TableCell className="whitespace-nowrap text-right tabular-nums">{item.nTravelers}</TableCell>
        <TableCell className="whitespace-nowrap text-right tabular-nums">{item.nVisits}</TableCell>
        <TableCell className="whitespace-nowrap text-right tabular-nums">{item.bayesScore !== null ? item.bayesScore.toFixed(2) : '–'}</TableCell>
        <TableCell className="whitespace-nowrap text-right tabular-nums">{won(item.spendPpMedian)}</TableCell>
        <TableCell className="whitespace-nowrap">
          <div className="flex flex-wrap gap-1">
            {item.match ? (
              item.match.naverPlaceId ? (
                <Link to={`/admin/restaurants/${item.match.naverPlaceId}`} className="inline-flex">
                  <Badge variant="secondary" title={`${item.match.restaurantName ?? ''} · ${item.match.distM}m · 상호 ${Math.round(item.match.nameScore * 100)}%`}>
                    <CheckCircle2 className="mr-1 size-3" />
                    {item.match.status === 'missing' ? '매칭 보류' : '매칭됨'}
                  </Badge>
                </Link>
              ) : (
                <Badge variant="secondary">{item.match.status === 'missing' ? '매칭 보류' : '매칭됨'}</Badge>
              )
            ) : (
              <Badge variant="outline">미매칭</Badge>
            )}
            {item.biz && (
              <Badge variant={closed ? 'destructive' : 'outline'} title={`사업자번호 ${item.biz.brno} · 조회 ${item.biz.checkedAt.slice(0, 10)}${item.biz.endDt ? ` · 폐업일 ${item.biz.endDt}` : ''}`}>
                {closed && <AlertTriangle className="mr-1 size-3" />}
                {item.biz.bStt === 'unknown' ? '국세청 미등록' : item.biz.bStt}
              </Badge>
            )}
            {registeredJob && (
              <Link to={`/admin/crawl-test/${registeredJob.jobId}`} className="inline-flex">
                <Badge variant="secondary" title={registeredJob.name}>
                  등록 잡 <ExternalLink className="ml-1 size-3" />
                </Badge>
              </Link>
            )}
          </div>
        </TableCell>
        <TableCell>
          {isOpen ? (
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              닫기
            </Button>
          ) : (
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="outline" disabled={item.match !== null} onClick={onDiscover} title="네이버 검색으로 등록 후보 찾기">
                <Search className="size-3.5" />
                검색
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onEvidence} title="원본 근거(방문·주문·영수증·사진·여행) — allowlist 계정만">
                <FileSearch className="size-3.5" />
                근거
              </Button>
            </div>
          )}
        </TableCell>
      </TableRow>
      {isOpen && mode === 'evidence' && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={9} className="p-3">
            <TourEvidencePanel tourPlaceId={item.placeId} />
          </TableCell>
        </TableRow>
      )}
      {isOpen && mode === 'discover' && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={9} className="p-3">
            {discover?.isPending && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> 네이버 검색 중…
              </p>
            )}
            {discover?.isError && <p className="text-sm text-destructive">{(discover.error as Error).message}</p>}
            {result && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  검색어 "{result.query}" · 후보 {result.candidates.length}개 · 수락 규칙: 100m 안 상호 유사도 50% 이상, 완전일치는 300m
                </p>
                {result.candidates.length === 0 && <p className="text-sm text-muted-foreground">후보가 없습니다. 이름이 다르거나 폐업했을 수 있습니다.</p>}
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {result.candidates.map((c) => (
                    <li key={c.placeId} className={cn('flex items-start justify-between gap-2 rounded-md border p-2', c.accepted && 'border-teal-600/50 bg-teal-600/5')}>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{c.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {c.category ?? ''} {c.roadAddress ?? c.address ?? ''}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {c.distM !== null ? `${c.distM}m` : '거리 –'} · 상호 {Math.round(c.nameScore * 100)}%{c.reviewCount !== null ? ` · 리뷰 ${c.reviewCount}` : ''}
                          {c.accepted && <span className="ml-1 font-semibold text-teal-700 dark:text-teal-300">수락</span>}
                        </div>
                      </div>
                      <div className="flex flex-none flex-col items-end gap-1">
                        {c.registered ? (
                          <Badge variant="secondary">등록됨</Badge>
                        ) : (
                          <Button type="button" size="sm" variant={c.accepted ? 'default' : 'outline'} disabled={registerPending || registeredJob !== null} onClick={() => onRegister(c)}>
                            {registerPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                            등록
                          </Button>
                        )}
                        <a href={c.rawSourceUrl} target="_blank" rel="noreferrer" className="text-[11px] text-muted-foreground underline">
                          네이버
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
                {registerError && <p className="text-sm text-destructive">{registerError}</p>}
                {registeredJob && (
                  <p className="text-xs text-muted-foreground">
                    "{registeredJob.name}" 크롤 잡을 시작했습니다. 끝나면 매칭이 자동으로 다시 돕니다 —{' '}
                    <Link to={`/admin/crawl-test/${registeredJob.jobId}`} className="underline">
                      진행 보기
                    </Link>
                  </p>
                )}
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
};
