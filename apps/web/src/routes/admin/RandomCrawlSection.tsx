import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Clock, Loader2, MapPin, PlayCircle, Power, Send, Shuffle } from 'lucide-react';
import {
  useRandomCrawlConfig,
  useRandomCrawlPreview,
  useRandomCrawlRunEvents,
  useRandomCrawlRuns,
  useRegionDongs,
  useRegionTree,
  useRunRandomCrawlNow,
  useUpdateRandomCrawlConfig,
} from '@repo/shared';
import type {
  RandomCrawlRegionType,
  RandomCrawlRunStatusType,
} from '@repo/api-contract';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { cn } from '~/lib/utils';

// 하루 한 번 시간대 프리셋 — 자동 발굴은 보통 1일 1회라 일별 시각 위주.
const PRESETS: { label: string; cron: string }[] = [
  { label: '매일 오전 9시', cron: '0 9 * * *' },
  { label: '매일 정오', cron: '0 12 * * *' },
  { label: '매일 오후 7시', cron: '0 19 * * *' },
  { label: '매일 새벽 3시', cron: '0 3 * * *' },
];

const SELECT_CLS =
  'flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base shadow-xs transition-colors sm:text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50';

const formatDate = (iso: string | null): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const STATUS_CHIP: Record<RandomCrawlRunStatusType, { label: string; cls: string }> = {
  running: { label: '진행 중', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  awaiting_selection: {
    label: '선택 대기',
    cls: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  },
  crawling: { label: '크롤 중', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  done: { label: '완료', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  skipped: { label: '건너뜀', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  failed: { label: '실패', cls: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  interrupted: { label: '중단', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
};

const StatusChip = ({ status }: { status: RandomCrawlRunStatusType }) => {
  const m = STATUS_CHIP[status];
  return (
    <span className={cn('inline-block rounded px-2 py-0.5 text-xs font-medium', m.cls)}>
      {m.label}
    </span>
  );
};

const PHASE_LABEL: Record<string, string> = {
  selecting_region: '지역 선정 중',
  searching: '검색 중',
  awaiting_selection: '텔레그램 선택 대기',
  crawling: '크롤 중',
  done: '마무리',
};

// 부모가 랜덤/미선택이면 자식 고정은 불가능 — 위에서 아래로 cascade 를 강제한다.
const normalizeRegion = (r: RandomCrawlRegionType): RandomCrawlRegionType => {
  let { sido, sigungu, dong } = r;
  let { sidoRandom, sigunguRandom, dongRandom } = r;
  const dongEnabled = r.dongEnabled;
  if (sidoRandom) {
    sido = null;
    sigunguRandom = true;
  }
  if (sigunguRandom) sigungu = null;
  if (!dongEnabled) {
    dongRandom = false;
    dong = null;
  } else if (sigunguRandom || !sigungu) {
    // 동 고정은 시군구 고정이 전제.
    dongRandom = true;
    dong = null;
  }
  if (dongRandom) dong = null;
  return { sidoRandom, sido, sigunguRandom, sigungu, dongEnabled, dongRandom, dong };
};

export const RandomCrawlSection = () => {
  const config = useRandomCrawlConfig();
  const update = useUpdateRandomCrawlConfig();
  const runNow = useRunRandomCrawlNow();
  const runs = useRandomCrawlRuns();
  const tree = useRegionTree();

  const [draftCron, setDraftCron] = useState('0 12 * * *');
  const [timezone, setTimezone] = useState('Asia/Seoul');
  const [customMode, setCustomMode] = useState(false);
  const [region, setRegion] = useState<RandomCrawlRegionType>({
    sidoRandom: true,
    sido: null,
    sigunguRandom: true,
    sigungu: null,
    dongEnabled: false,
    dongRandom: false,
    dong: null,
  });
  const [keyword, setKeyword] = useState('맛집');
  const [candidateCount, setCandidateCount] = useState(5);
  const [timeoutMin, setTimeoutMin] = useState(30);
  const [timeoutAction, setTimeoutAction] = useState<'skip' | 'random'>('skip');

  // config 로드 시 draft 동기화.
  useEffect(() => {
    if (!config.data) return;
    setDraftCron(config.data.cronExpr);
    setTimezone(config.data.timezone);
    setCustomMode(!PRESETS.some((p) => p.cron === config.data!.cronExpr));
    setRegion(config.data.region);
    setKeyword(config.data.keyword);
    setCandidateCount(config.data.candidateCount);
    setTimeoutMin(config.data.responseTimeoutMin);
    setTimeoutAction(config.data.timeoutAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.data?.updatedAt]);

  const preview = useRandomCrawlPreview(draftCron, timezone, true);
  const dongs = useRegionDongs(region.sido, region.sigungu);
  const inflightRunId = runs.data?.inflightRunId ?? null;
  const { progress } = useRandomCrawlRunEvents(!!inflightRunId);

  const enabled = config.data?.enabled ?? false;
  const telegramOk = config.data?.telegramConfigured ?? false;
  const cronValid = preview.data?.valid ?? true;
  const isPreset = PRESETS.some((p) => p.cron === draftCron);
  const showCustomInput = customMode || !isPreset;
  const isRunning = !!inflightRunId || progress !== null;

  const sidos = useMemo(() => (tree.data ?? []).map((t) => t.sido), [tree.data]);
  const sigungus = useMemo(
    () => tree.data?.find((t) => t.sido === region.sido)?.sigungus ?? [],
    [tree.data, region.sido],
  );

  const dirty = useMemo(() => {
    if (!config.data) return false;
    return (
      draftCron !== config.data.cronExpr ||
      timezone !== config.data.timezone ||
      keyword !== config.data.keyword ||
      candidateCount !== config.data.candidateCount ||
      timeoutMin !== config.data.responseTimeoutMin ||
      timeoutAction !== config.data.timeoutAction ||
      JSON.stringify(region) !== JSON.stringify(config.data.region)
    );
  }, [config.data, draftCron, timezone, keyword, candidateCount, timeoutMin, timeoutAction, region]);

  const patchRegion = (patch: Partial<RandomCrawlRegionType>): void =>
    setRegion((prev) => normalizeRegion({ ...prev, ...patch }));

  const selectPreset = (cron: string): void => {
    setDraftCron(cron);
    setCustomMode(false);
  };

  const toggleEnabled = (): void => {
    if (!config.data) return;
    update.mutate({ ...buildInput(), enabled: !enabled, ...savedCronTz(config.data) });
  };

  // 활성 토글은 저장된 cron/tz 기준(드래프트 미반영) — schedule 섹션과 동일.
  const savedCronTz = (c: NonNullable<typeof config.data>) => ({
    cronExpr: c.cronExpr,
    timezone: c.timezone,
  });

  const buildInput = () => ({
    enabled,
    cronExpr: draftCron,
    timezone,
    region,
    keyword,
    candidateCount,
    responseTimeoutMin: timeoutMin,
    timeoutAction,
  });

  const save = (): void => {
    if (!cronValid) return;
    update.mutate(buildInput());
  };

  const sigunguFixable = !region.sidoRandom && !!region.sido;
  const dongFixable = sigunguFixable && !region.sigunguRandom && !!region.sigungu;

  return (
    <Card>
      <CardHeader className="flex-col items-stretch gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="size-4" />
            맛집 자동 발굴
          </CardTitle>
          <CardDescription>
            설정한 시각마다 지역을 (랜덤/고정) 골라 검색하고, 후보를 텔레그램으로 보냅니다.
            버튼으로 가게를 고르면 그 가게만 크롤합니다. 응답이 없으면 그 회차는 건너뜁니다.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={enabled ? 'green' : 'outline'}
            size="sm"
            onClick={toggleEnabled}
            disabled={update.isPending || !config.data}
          >
            <Power className="size-4" />
            {enabled ? '활성' : '비활성'}
          </Button>
          <Button
            variant="teal"
            size="sm"
            onClick={() => runNow.mutate()}
            disabled={runNow.isPending || isRunning}
          >
            {runNow.isPending || isRunning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PlayCircle className="size-4" />
            )}
            지금 실행
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!telegramOk && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
            <Send className="mt-0.5 size-4 shrink-0" />
            <span>
              텔레그램 봇이 설정되지 않았습니다. <code>TELEGRAM_BOT_TOKEN</code>·
              <code>TELEGRAM_CHAT_ID</code> 환경변수를 설정해야 후보를 보낼 수 있습니다. 미설정
              상태에서는 회차가 자동으로 건너뜀 처리됩니다.
            </span>
          </div>
        )}

        {/* 실행 주기 */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">실행 시각</div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.cron}
                variant={!showCustomInput && draftCron === p.cron ? 'blue' : 'outline'}
                size="sm"
                onClick={() => selectPreset(p.cron)}
              >
                {p.label}
              </Button>
            ))}
            <Button
              variant={showCustomInput ? 'blue' : 'outline'}
              size="sm"
              onClick={() => setCustomMode(true)}
            >
              커스텀
            </Button>
          </div>
          {showCustomInput && (
            <Input
              value={draftCron}
              onChange={(e) => setDraftCron(e.target.value)}
              placeholder="예: 0 12 * * *  (분 시 일 월 요일)"
              className="font-mono"
            />
          )}
        </div>

        {/* 지역 — 시 / 구 / 동 각각 고정 또는 랜덤 */}
        <div className="space-y-3 rounded-md border p-3">
          <div className="text-xs font-medium text-muted-foreground">지역 선택</div>

          {/* 시/도 */}
          <RegionRow
            label="시/도"
            random={region.sidoRandom}
            onToggleRandom={() => patchRegion({ sidoRandom: !region.sidoRandom })}
          >
            <select
              className={SELECT_CLS}
              value={region.sido ?? ''}
              disabled={region.sidoRandom}
              onChange={(e) =>
                patchRegion({ sido: e.target.value || null, sigungu: null, dong: null })
              }
            >
              <option value="">선택…</option>
              {sidos.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </RegionRow>

          {/* 시/군/구 */}
          <RegionRow
            label="시/군/구"
            random={region.sigunguRandom}
            disabledRandom={region.sidoRandom}
            onToggleRandom={() => patchRegion({ sigunguRandom: !region.sigunguRandom })}
          >
            <select
              className={SELECT_CLS}
              value={region.sigungu ?? ''}
              disabled={!sigunguFixable || region.sigunguRandom}
              onChange={(e) => patchRegion({ sigungu: e.target.value || null, dong: null })}
            >
              <option value="">선택…</option>
              {sigungus.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </RegionRow>

          {/* 동 — 사용 여부 + 고정/랜덤 */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={region.dongEnabled}
                onChange={(e) => patchRegion({ dongEnabled: e.target.checked })}
              />
              동(읍면동)까지 좁히기
            </label>
            <span className="text-xs text-muted-foreground">
              (동 이름을 검색어에 결합 — 좌표는 시군구 중심)
            </span>
          </div>
          {region.dongEnabled && (
            <RegionRow
              label="동"
              random={region.dongRandom}
              disabledRandom={!dongFixable}
              onToggleRandom={() => patchRegion({ dongRandom: !region.dongRandom })}
            >
              <select
                className={SELECT_CLS}
                value={region.dong ?? ''}
                disabled={!dongFixable || region.dongRandom}
                onChange={(e) => patchRegion({ dong: e.target.value || null })}
              >
                <option value="">선택…</option>
                {(dongs.data?.dongs ?? []).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </RegionRow>
          )}
        </div>

        {/* 검색어 / 후보 수 / 타임아웃 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">검색 키워드</span>
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="맛집" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">후보 수 (1–10)</span>
            <Input
              type="number"
              min={1}
              max={10}
              value={candidateCount}
              onChange={(e) =>
                setCandidateCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))
              }
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">응답 대기(분)</span>
            <Input
              type="number"
              min={5}
              max={1440}
              value={timeoutMin}
              onChange={(e) =>
                setTimeoutMin(Math.min(1440, Math.max(5, Number(e.target.value) || 5)))
              }
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">응답 없을 때</span>
            <select
              className={SELECT_CLS}
              value={timeoutAction}
              onChange={(e) => setTimeoutAction(e.target.value as 'skip' | 'random')}
            >
              <option value="skip">건너뛰기</option>
              <option value="random">랜덤 자동 크롤</option>
            </select>
          </label>
        </div>

        {/* cron 미리보기 */}
        <div className="rounded-md border p-3 text-sm">
          {!cronValid ? (
            <p className="text-red-600 dark:text-red-400">
              잘못된 cron 식입니다{preview.data?.error ? `: ${preview.data.error}` : ''}
            </p>
          ) : preview.data && preview.data.nextRuns.length > 0 ? (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">다음 실행 예정 (적용 후)</div>
              <ul className="space-y-0.5">
                {preview.data.nextRuns.slice(0, 3).map((r) => (
                  <li key={r} className="font-mono text-xs text-muted-foreground">
                    {formatDate(r)}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-muted-foreground">미리보기를 불러오는 중…</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {config.data?.lastRunAt ? (
              <>
                <span>마지막 실행 {formatDate(config.data.lastRunAt)}</span>
                {config.data.lastStatus && <StatusChip status={config.data.lastStatus} />}
              </>
            ) : (
              <span>아직 실행된 적 없음</span>
            )}
          </div>
          <Button
            variant="amber"
            size="sm"
            onClick={save}
            disabled={!dirty || !cronValid || update.isPending}
          >
            저장
          </Button>
        </div>

        {/* live 진행 */}
        {progress && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <Clock className="size-4" />
                {PHASE_LABEL[progress.phase] ?? progress.phase}
              </span>
              {progress.regionLabel && (
                <span className="text-xs text-muted-foreground">{progress.regionLabel}</span>
              )}
            </div>
            {progress.candidates.length > 0 && (
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {progress.candidates.map((c) => (
                  <li key={c.placeId} className={cn(c.selected && 'font-semibold text-foreground')}>
                    {c.selected ? '✅ ' : '• '}
                    {c.name}
                    {c.category ? ` · ${c.category}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* 실행 이력 */}
        {runs.data && runs.data.items.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">최근 실행 이력</div>
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>시각</TableHead>
                    <TableHead>트리거</TableHead>
                    <TableHead>지역</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>선택</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.data.items.slice(0, 8).map((r) => {
                    const picked = r.candidates.find((c) => c.selected);
                    return (
                      <TableRow key={r.runId}>
                        <TableCell className="font-mono text-xs">
                          {formatDate(r.startedAt)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.trigger === 'cron'
                            ? '자동'
                            : r.trigger === 'telegram'
                              ? '텔레그램'
                              : '수동'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.regionLabel ?? '-'}
                        </TableCell>
                        <TableCell>
                          <StatusChip status={r.status} />
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate text-xs text-muted-foreground">
                          {picked?.name ?? '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// 지역 한 줄 — 라벨 + 랜덤 토글 + 셀렉트(children).
const RegionRow = ({
  label,
  random,
  disabledRandom,
  onToggleRandom,
  children,
}: {
  label: string;
  random: boolean;
  disabledRandom?: boolean;
  onToggleRandom: () => void;
  children: ReactNode;
}) => (
  <div className="flex items-center gap-2">
    <span className="w-16 shrink-0 text-sm text-muted-foreground">{label}</span>
    <Button
      type="button"
      variant={random ? 'violet' : 'outline'}
      size="sm"
      className="shrink-0"
      disabled={disabledRandom}
      onClick={onToggleRandom}
    >
      <Shuffle className="size-3.5" />
      랜덤
    </Button>
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);
