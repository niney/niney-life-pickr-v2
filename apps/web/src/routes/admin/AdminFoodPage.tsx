import { useState, type FormEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertTriangle,
  ChartBar,
  Clock,
  Database,
  Loader2,
  Pencil,
  PlayCircle,
  Plus,
  Power,
  Search,
  Soup,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  useCreateFoodItem,
  useFoodAdminList,
  useMenuLexicon,
  useMenuLexiconCreate,
  useMenuLexiconDelete,
  useFoodAdminStats,
  useFoodMergeConflicts,
  useFoodRecognitionQuality,
  useFoodImportConfig,
  useFoodImportPreview,
  useFoodImportRunEvents,
  useFoodImportRuns,
  useRunFoodImportNow,
  useResolveFoodMergeConflict,
  useUpdateFoodImportConfig,
  useUpdateFoodItem,
  type FoodAdminListInput,
} from '@repo/shared';
import {
  FoodAllergenStatus,
  FoodImportSource,
  MENU_LEXICON_KINDS_WITH_TARGET,
  MenuLexiconKind,
  type MenuLexiconKindType,
  MealAllergen,
  MEAL_ALLERGEN_LABEL,
  type FoodAdminCreateInputType,
  type FoodAdminUpdateInputType,
  type FoodAllergenStatusType,
  type FoodCuisineType,
  type FoodDishTypeType,
  type FoodImportConfigType,
  type FoodImportPhaseType,
  type FoodImportRunStatusType,
  type FoodImportSourceType,
  type FoodImportTriggerType,
  type FoodItemType,
  type FoodMainIngredientType,
  type FoodMergeConflictFieldType,
  type FoodMergeConflictItemType,
  type FoodObservedValueType,
  type FoodSourceType,
  type MealAllergenType,
} from '@repo/api-contract';
import {
  FOOD_CUISINES,
  FOOD_CUISINE_LABEL,
  FOOD_DISH_TYPES,
  FOOD_DISH_TYPE_LABEL,
  FOOD_MAIN_INGREDIENTS,
  FOOD_MAIN_INGREDIENT_LABEL,
  FOOD_SOURCES,
  FOOD_SOURCE_LABEL,
} from '@repo/utils';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Pager } from '~/components/ui/pager';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { useDebounced } from '~/lib/useDebounced';
import { cn } from '~/lib/utils';

// ── 공통 상수/헬퍼 ───────────────────────────────────────────────────────────

// 적재는 공공 데이터 갱신 주기가 길어(월 단위) 월 1회가 기본. 새벽 시각으로 LLM 분류
// 호출이 사용자 트래픽과 겹치지 않게 한다.
const DEFAULT_CRON = '0 4 1 * *';
const DEFAULT_TIMEZONE = 'Asia/Seoul';
const PRESETS: { label: string; cron: string }[] = [
  { label: '매월 1일 04:00', cron: DEFAULT_CRON },
  { label: '매주 월 04:00', cron: '0 4 * * 1' },
  { label: '매일 04:00', cron: '0 4 * * *' },
];

// 어드민 잡이 도는 소스(hansik-800 은 CLI 전용이라 없음) — api-contract enum 이 진실.
const IMPORT_SOURCES = FoodImportSource.options;
type ExternalSource = keyof FoodImportConfigType['apiConfigured'];
const EXTERNAL_SOURCES: readonly ExternalSource[] = [
  'mfds-nutrition',
  'mfds-recipe',
  'mafra-recipe',
];
const isExternalSource = (s: FoodImportSourceType): s is ExternalSource =>
  (EXTERNAL_SOURCES as readonly string[]).includes(s);

const SELECT_CLS =
  'flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base shadow-xs transition-colors sm:text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50';

const ALLERGEN_STATUS_LABEL: Record<FoodAllergenStatusType, string> = {
  unknown: '미확인',
  inferred: '재료 기반 추정',
  verified: '운영자 검수',
};

const formatDate = (iso: string | null): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const STATUS_CHIP: Record<FoodImportRunStatusType, { label: string; cls: string }> = {
  running: { label: '진행 중', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  done: { label: '완료', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  failed: { label: '실패', cls: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  skipped: { label: '건너뜀', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  interrupted: { label: '중단', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
};

const StatusChip = ({ status }: { status: FoodImportRunStatusType }) => {
  const m = STATUS_CHIP[status];
  return (
    <span className={cn('inline-block rounded px-2 py-0.5 text-xs font-medium', m.cls)}>
      {m.label}
    </span>
  );
};

const PHASE_LABEL: Record<FoodImportPhaseType, string> = {
  fetching: '수집',
  normalizing: '정규화',
  upserting: '반영',
  classifying: '분류',
  done: '완료',
};

const TRIGGER_LABEL: Record<FoodImportTriggerType, string> = { cron: '자동', manual: '수동' };

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// "김치찌게, 묵은지찌개" → ['김치찌게','묵은지찌개'] — 공백 정리 + 중복 제거, 빈 조각 버림.
const splitAliases = (raw: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const v = part.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
};

// 409(이름 충돌)는 사용자가 고칠 수 있는 상황이라 메시지를 고정해 안내한다.
const errorMessage = (e: unknown, fallback: string): string => {
  if (e instanceof ApiError) {
    if (e.statusCode === 409) return '이미 있는 음식명';
    return e.message || fallback;
  }
  return fallback;
};

const conflictErrorMessage = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message || fallback : fallback;

// ── 페이지 ───────────────────────────────────────────────────────────────────

export const AdminFoodPage = () => (
  <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
    <header className="flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Soup className="size-5" />
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">음식 카탈로그</h1>
        <p className="text-sm text-muted-foreground">
          식단 추천·자동완성이 읽는 마스터 데이터. 공공 데이터 적재 잡과 수기 편집을 관리합니다.
        </p>
      </div>
    </header>

    <ImportJobSection />
    <StatsSection />
    <MergeConflictSection />
    <RecognitionQualitySection />
    <MenuLexiconSection />
    <CatalogSection />
  </div>
);

// ── 메뉴 칼로리 판정 엔진 어휘 ───────────────────────────────────────────────

const LEXICON_KIND_LABEL: Record<MenuLexiconKindType, { label: string; hint: string }> = {
  alias: { label: '별칭', hint: '메뉴판 표기 → 카탈로그 음식명 (예: 불족 → 족발)' },
  modifier: { label: '수식어', hint: '떼어도 같은 음식인 앞말 (예: 숙성, 통영)' },
  size: { label: '양 수식어', hint: '양이 달라지는 앞말 — 1인분 표시를 막는다 (예: 미니, 점보)' },
  synonym: { label: '동의어', hint: '표기 동의어, 양방향 (예: 계란 ↔ 달걀)' },
  set: { label: '세트어', hint: '여러 음식이 섞였다는 표식 (예: 한상)' },
  option: { label: '선택어', hint: '슬래시 양쪽에 오면 세트가 아닌 맛·온도 선택 (예: 냉, 온)' },
  suffix_block: { label: '접미 제외', hint: '접미 매칭에서 뺄 범주어 (예: 면, 탕)' },
  raw_suffix: { label: '조리 접미', hint: '떼어서 원재료를 찾는 접미 (예: 타다끼)' },
  quantifier: { label: '수량어', hint: '한판·반판 류 — 부위를 찾으면 100g당' },
  portion: { label: '1인분 기준 중량', hint: '종류별 1인분 기준 중량(g) — "1인분(150g 기준)" 문구에 쓴다. 말=dishType(noodle·stew…)·raw_meat·raw_seafood, 짝=그램 (예: raw_meat → 180)' },
};

const MenuLexiconSection = () => {
  const [kind, setKind] = useState<MenuLexiconKindType>('alias');
  const [term, setTerm] = useState('');
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const list = useMenuLexicon();
  const create = useMenuLexiconCreate();
  const remove = useMenuLexiconDelete();
  const needsTarget = MENU_LEXICON_KINDS_WITH_TARGET.includes(kind);
  const items = list.data?.items ?? [];

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({
        kind,
        term: term.trim(),
        target: needsTarget ? target.trim() : undefined,
        note: note.trim() || undefined,
      });
      setTerm('');
      setTarget('');
      setNote('');
    } catch (err) {
      setError(errorMessage(err, '추가하지 못했습니다'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">메뉴 칼로리 판정 어휘</CardTitle>
        <p className="text-xs text-muted-foreground">
          맛집 메뉴명을 카탈로그 음식에 맞추는 말. 값(칼로리)은 카탈로그에만 있고 여기엔 이름 규칙만 있다.
          저장하면 10분 안에 판정에 반영된다. 코드 기본 어휘
          {list.data ? ` ${Object.values(list.data.defaults).reduce((a, b) => a + b, 0)}건` : ''} 위에 얹는다.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[10rem_1fr_1fr_1fr_auto]">
          <select className={SELECT_CLS} value={kind} onChange={(e) => setKind(e.target.value as MenuLexiconKindType)}>
            {MenuLexiconKind.options.map((k) => (
              <option key={k} value={k}>
                {LEXICON_KIND_LABEL[k].label}
              </option>
            ))}
          </select>
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="말 (예: 불족)" required />
          <Input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={needsTarget ? (kind === 'alias' ? '카탈로그 음식명 (예: 족발)' : kind === 'portion' ? '그램 (예: 180)' : '짝 (예: 달걀)') : '—'}
            disabled={!needsTarget}
            required={needsTarget}
          />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모(선택)" />
          <Button type="submit" size="sm" disabled={create.isPending}>
            추가
          </Button>
        </form>
        <p className="text-[11px] text-muted-foreground">{LEXICON_KIND_LABEL[kind].hint}</p>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {list.isLoading ? (
          <p className="text-xs text-muted-foreground">불러오는 중…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground">추가한 어휘가 없습니다.</p>
        ) : (
          <ul className="divide-y text-sm">
            {items.map((it) => (
              <li key={it.id} className="flex items-center gap-2 py-1.5">
                <span className="w-20 shrink-0 text-xs text-muted-foreground">{LEXICON_KIND_LABEL[it.kind].label}</span>
                <span className="font-medium">{it.term}</span>
                {it.target && <span className="text-muted-foreground">→ {it.target}</span>}
                {it.note && <span className="truncate text-xs text-muted-foreground">· {it.note}</span>}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 px-2 text-xs"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(it.id)}
                >
                  삭제
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

// ── 적재 잡 ──────────────────────────────────────────────────────────────────

interface ImportDraft {
  cronExpr?: string;
  timezone?: string;
  sources?: FoodImportSourceType[];
  classify?: boolean;
}

const ImportJobSection = () => {
  const config = useFoodImportConfig();
  const update = useUpdateFoodImportConfig();
  const runNow = useRunFoodImportNow();
  const runs = useFoodImportRuns();

  // 드래프트는 "저장값 위에 덮는 변경분"만 들고 있다 — config 가 다시 와도(활성 토글 등)
  // 사용자가 고친 값은 남고, 저장이 끝나면 비워서 서버값을 그대로 비춘다. 동기화 effect 없음.
  const [draft, setDraft] = useState<ImportDraft>({});
  const [customMode, setCustomMode] = useState(false);
  // 지금 실행 시 저장값 대신 현재 선택(소스·분류)을 이번 회차만 쓸지.
  const [overrideRun, setOverrideRun] = useState(false);

  const cfg = config.data;
  const draftCron = draft.cronExpr ?? cfg?.cronExpr ?? DEFAULT_CRON;
  const timezone = draft.timezone ?? cfg?.timezone ?? DEFAULT_TIMEZONE;
  const sources = draft.sources ?? cfg?.sources ?? [...IMPORT_SOURCES];
  const classify = draft.classify ?? cfg?.classify ?? true;
  const patchDraft = (patch: ImportDraft): void => setDraft((prev) => ({ ...prev, ...patch }));

  const preview = useFoodImportPreview(draftCron, timezone, true);
  const inflightRunId = runs.data?.inflightRunId ?? null;
  const { progress } = useFoodImportRunEvents(!!inflightRunId);

  const enabled = cfg?.enabled ?? false;
  const cronValid = preview.data?.valid ?? true;
  const isPreset = PRESETS.some((p) => p.cron === draftCron);
  const showCustomInput = customMode || !isPreset;
  const isRunning = !!inflightRunId || progress !== null;
  const dirty =
    !!cfg &&
    (draftCron !== cfg.cronExpr ||
      timezone !== cfg.timezone ||
      classify !== cfg.classify ||
      !sameSet(sources, cfg.sources));
  const canSave =
    dirty && cronValid && sources.length > 0 && timezone.trim().length > 0 && !update.isPending;
  const missingKeySources = IMPORT_SOURCES.filter(
    (s) => isExternalSource(s) && cfg?.apiConfigured[s] === false,
  );

  const selectPreset = (cron: string): void => {
    patchDraft({ cronExpr: cron });
    setCustomMode(false);
  };

  // 체크 순서와 무관하게 enum 순서를 유지한다(저장값 비교·표시 안정).
  const toggleSource = (s: FoodImportSourceType): void => {
    const next = sources.includes(s)
      ? sources.filter((x) => x !== s)
      : IMPORT_SOURCES.filter((x) => x === s || sources.includes(x));
    patchDraft({ sources: next });
  };

  // 활성 토글은 저장된 값 기준(드래프트 미반영) — schedule/random-crawl 과 동일.
  const toggleEnabled = (): void => {
    if (!cfg) return;
    update.mutate(
      {
        enabled: !enabled,
        cronExpr: cfg.cronExpr,
        timezone: cfg.timezone,
        sources: cfg.sources.length > 0 ? cfg.sources : [...IMPORT_SOURCES],
        classify: cfg.classify,
      },
      { onError: (e) => toast.error(errorMessage(e, '설정 변경에 실패했어요')) },
    );
  };

  const save = (): void => {
    if (!canSave) return;
    update.mutate(
      { enabled, cronExpr: draftCron.trim(), timezone: timezone.trim(), sources, classify },
      {
        onSuccess: () => {
          setDraft({});
          toast.success('적재 잡 설정을 저장했어요');
        },
        onError: (e) => toast.error(errorMessage(e, '설정 저장에 실패했어요')),
      },
    );
  };

  const handleRunNow = (): void => {
    runNow.mutate(overrideRun ? { sources, classify } : undefined, {
      onSuccess: (run) => {
        if (run.status === 'skipped') {
          toast.warning('이미 진행 중인 적재가 있어 이번 실행은 건너뛰었어요');
        } else {
          toast.success(`적재를 시작했어요 · ${STATUS_CHIP[run.status].label}`);
        }
      },
      onError: (e) => toast.error(errorMessage(e, '적재 실행에 실패했어요')),
    });
  };

  const pct = progress
    ? progress.total === null
      ? 100
      : progress.total === 0
        ? 0
        : Math.min(100, Math.round((progress.processed / progress.total) * 100))
    : 0;

  return (
    <Card>
      <CardHeader className="flex-col items-stretch gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4" />
            적재 잡
          </CardTitle>
          <CardDescription>
            설정한 시각마다 공공 데이터(식약처·농식품)와 외식 메뉴 어휘를 받아 카탈로그에
            반영합니다. 분류를 켜 두면 적재 뒤 미분류 행을 LLM 으로 2축(조리형태×주재료) 분류까지
            합니다.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={enabled ? 'green' : 'outline'}
            size="sm"
            onClick={toggleEnabled}
            disabled={update.isPending || !cfg}
          >
            <Power className="size-4" />
            {enabled ? '활성' : '비활성'}
          </Button>
          <Button
            variant="teal"
            size="sm"
            onClick={handleRunNow}
            disabled={
              runNow.isPending || isRunning || !cfg || (overrideRun && sources.length === 0)
            }
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
              aria-label="cron 식"
              value={draftCron}
              onChange={(e) => patchDraft({ cronExpr: e.target.value })}
              placeholder="예: 0 4 1 * *  (분 시 일 월 요일)"
              className="font-mono"
            />
          )}
        </div>

        {/* 타임존 */}
        <div className="space-y-1 sm:max-w-xs">
          <div className="text-xs font-medium text-muted-foreground">타임존</div>
          <Input
            aria-label="타임존"
            value={timezone}
            onChange={(e) => patchDraft({ timezone: e.target.value })}
            placeholder={DEFAULT_TIMEZONE}
          />
        </div>

        {/* 소스 */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">소스</div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {IMPORT_SOURCES.map((s) => {
              const keyMissing = isExternalSource(s) && cfg?.apiConfigured[s] === false;
              return (
                <label key={s} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`${FOOD_SOURCE_LABEL[s]} 소스`}
                    checked={sources.includes(s)}
                    onChange={() => toggleSource(s)}
                  />
                  {FOOD_SOURCE_LABEL[s]}
                  {keyMissing && (
                    <Badge variant="amber" className="gap-1">
                      <AlertTriangle className="size-3" />키 미설정
                    </Badge>
                  )}
                </label>
              );
            })}
          </div>
          {missingKeySources.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              키가 설정되지 않은 소스는 실행 시 건너뜁니다(다른 소스는 계속 진행).
            </p>
          )}
        </div>

        {/* 분류 + 실행 옵션 */}
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              aria-label="적재 후 LLM 2축 분류"
              checked={classify}
              onChange={(e) => patchDraft({ classify: e.target.checked })}
            />
            적재 후 LLM 2축 분류
            <span className="text-xs text-muted-foreground">(미분류 행만 대상)</span>
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              aria-label="이번 회차만 현재 선택으로 실행"
              checked={overrideRun}
              onChange={(e) => setOverrideRun(e.target.checked)}
            />
            지금 실행은 저장값 대신 위에서 고른 소스·분류로
            <span className="text-xs text-muted-foreground">(이번 회차만, 저장 안 함)</span>
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {cfg?.lastRunAt ? (
              <span className="flex items-center gap-1.5">
                마지막 실행 {formatDate(cfg.lastRunAt)}
                {cfg.lastStatus && <StatusChip status={cfg.lastStatus} />}
              </span>
            ) : (
              <span>아직 실행된 적 없음</span>
            )}
            {cfg?.enabled && cfg.nextRunAt && <span>다음 실행 {formatDate(cfg.nextRunAt)}</span>}
          </div>
          <Button variant="amber" size="sm" onClick={save} disabled={!canSave}>
            설정 저장
          </Button>
        </div>

        {/* live 진행 */}
        {progress && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <Clock className="size-4" />
                {PHASE_LABEL[progress.phase]}
                {progress.source ? ` · ${FOOD_SOURCE_LABEL[progress.source]}` : ''}
              </span>
              <span className="text-xs text-muted-foreground">
                {progress.total !== null ? (
                  <>
                    {progress.processed} / {progress.total}
                  </>
                ) : (
                  <>{progress.processed}</>
                )}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full bg-primary transition-all',
                  progress.total === null && 'animate-pulse',
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            {progress.message && (
              <div className="truncate text-xs text-muted-foreground">{progress.message}</div>
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
                    <TableHead>상태</TableHead>
                    <TableHead>소스</TableHead>
                    <TableHead>수집 → 신규 / 갱신 / 건너뜀</TableHead>
                    <TableHead className="text-right">분류</TableHead>
                    <TableHead>오류</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.data.items.slice(0, 10).map((r) => (
                    <TableRow key={r.runId}>
                      <TableCell className="font-mono text-xs">{formatDate(r.startedAt)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {TRIGGER_LABEL[r.trigger]}
                      </TableCell>
                      <TableCell>
                        <StatusChip status={r.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.sources.length > 0
                          ? r.sources.map((s) => FOOD_SOURCE_LABEL[s]).join(', ')
                          : '-'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.stats.length === 0 ? (
                          <span className="text-muted-foreground">-</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {r.stats.map((st) => (
                              <li key={st.source} className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">
                                  {FOOD_SOURCE_LABEL[st.source]}
                                </span>
                                <span className="font-mono tabular-nums">
                                  {st.fetched} → {st.inserted} / {st.updated} / {st.skipped}
                                </span>
                                {st.error && (
                                  <span className="text-red-600 dark:text-red-400" title={st.error}>
                                    오류
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {r.classifiedCount}
                      </TableCell>
                      <TableCell
                        className="max-w-[12rem] truncate text-xs text-red-600 dark:text-red-400"
                        title={r.error ?? undefined}
                      >
                        {r.error ?? <span className="text-muted-foreground">-</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ── 통계 ─────────────────────────────────────────────────────────────────────

const StatsSection = () => {
  const stats = useFoodAdminStats();
  const s = stats.data;
  const classifiedPct = s && s.total > 0 ? Math.round((s.classified / s.total) * 100) : 0;
  const bySource: BarRow[] = [...(s?.bySource ?? [])]
    .sort((a, b) => b.count - a.count)
    .map((r) => ({ key: r.source, label: FOOD_SOURCE_LABEL[r.source], count: r.count }));
  const byDishType: BarRow[] = [...(s?.byDishType ?? [])]
    .sort((a, b) => b.count - a.count)
    .map((r) => ({
      key: r.dishType ?? 'none',
      label: r.dishType ? FOOD_DISH_TYPE_LABEL[r.dishType] : '미분류',
      count: r.count,
      muted: r.dishType === null,
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ChartBar className="size-4" />
          통계
        </CardTitle>
        <CardDescription>
          카탈로그 규모와 분류 진척. 분류 완료는 조리형태·주재료·요리 계통이 모두 채워진 행입니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {stats.isError ? (
          <p className="text-sm text-red-600 dark:text-red-400">통계를 불러오지 못했어요</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatTile label="전체" value={s?.total} />
              <StatTile label="활성" value={s?.active} />
              <StatTile
                label="분류 완료"
                value={s?.classified}
                hint={s ? `${classifiedPct}%` : undefined}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatTile label="소스 관측" value={s?.sourceObservationCount} />
              <StatTile label="검토 대기" value={s?.openMergeConflictCount} />
              <StatTile label="영양 직접값" value={s?.nutritionDirectCount} />
              <StatTile label="영양 추정값" value={s?.nutritionEstimatedCount} />
              <StatTile label="영양 없음" value={s?.nutritionMissingCount} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <StatTile label="알레르기 미확인" value={s?.allergenUnknownCount} />
              <StatTile label="재료 기반 추정" value={s?.allergenInferredCount} />
              <StatTile label="운영자 검수" value={s?.allergenVerifiedCount} />
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <BarList title="출처별" rows={bySource} />
              <BarList title="조리형태별" rows={byDishType} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

const StatTile = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | undefined;
  hint?: string;
}) => (
  <div className="rounded-md border p-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="mt-1 flex items-baseline gap-1.5">
      <span className="text-2xl font-semibold tabular-nums">{value ?? '-'}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  </div>
);

interface BarRow {
  key: string;
  label: string;
  count: number;
  muted?: boolean;
}

// 차트 라이브러리 없이 가로 막대 — 최대값 대비 비율. 0 은 빈 트랙, 아주 작은 값은 최소 2%.
const BarList = ({ title, rows }: { title: string; rows: BarRow[] }) => {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">데이터 없음</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-2 text-xs">
              <span
                className={cn('w-28 shrink-0 truncate', r.muted && 'text-muted-foreground')}
                title={r.label}
              >
                {r.label}
              </span>
              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full', r.muted ? 'bg-amber-500/70' : 'bg-primary')}
                  style={{
                    width: `${r.count === 0 || max === 0 ? 0 : Math.max(2, Math.round((r.count / max) * 100))}%`,
                  }}
                />
              </div>
              <span className="w-12 shrink-0 text-right font-mono tabular-nums">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ── 소스 병합 충돌 ────────────────────────────────────────────────────────────────

const CONFLICT_FIELD_LABEL: Record<FoodMergeConflictFieldType, string> = {
  repName: '대표식품명',
  dishType: '조리형태',
  mainIngredient: '주재료',
  cuisine: '요리 계통',
  ingredients: '재료 목록',
  servingG: '1인분 중량',
  kcal: '칼로리',
  carbG: '탄수화물',
  proteinG: '단백질',
  fatG: '지방',
  sodiumMg: '나트륨',
  sugarG: '당류',
  sourceCategory: '원본 분류',
};

const formatConflictValue = (
  field: FoodMergeConflictFieldType,
  value: FoodObservedValueType,
): string => {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'number') {
    const unit =
      field === 'servingG' ? 'g' : field === 'sodiumMg' ? 'mg' : field.endsWith('G') ? 'g' : '';
    return `${value.toLocaleString('ko-KR')}${unit}`;
  }
  if (field === 'dishType' && value in FOOD_DISH_TYPE_LABEL) {
    return FOOD_DISH_TYPE_LABEL[value as FoodDishTypeType];
  }
  if (field === 'mainIngredient' && value in FOOD_MAIN_INGREDIENT_LABEL) {
    return FOOD_MAIN_INGREDIENT_LABEL[value as FoodMainIngredientType];
  }
  if (field === 'cuisine' && value in FOOD_CUISINE_LABEL) {
    return FOOD_CUISINE_LABEL[value as FoodCuisineType];
  }
  return value;
};

const MergeConflictSection = () => {
  const conflicts = useFoodMergeConflicts({ status: 'open', limit: 20 });
  const resolve = useResolveFoodMergeConflict();
  const items = conflicts.data?.items ?? [];

  const act = (
    conflict: FoodMergeConflictItemType,
    action: 'keep_existing' | 'accept_incoming' | 'dismiss',
  ): void => {
    resolve.mutate(
      { id: conflict.id, action },
      {
        onSuccess: () => {
          toast.success(
            action === 'accept_incoming'
              ? '새 소스 값을 반영했어요'
              : action === 'keep_existing'
                ? '기존 값 유지로 기록했어요'
                : '검토 항목을 닫았어요',
          );
        },
        onError: (error) => toast.error(conflictErrorMessage(error, '충돌 처리에 실패했어요')),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="size-4" />
          소스 병합 검토
          {conflicts.data && <Badge variant="amber">{conflicts.data.total}</Badge>}
        </CardTitle>
        <CardDescription>
          적재 소스가 기존 대표값과 다른 값을 보낸 항목입니다. 선택해도 모든 원본 관측은 출처별로
          남습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {conflicts.isPending ? (
          <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
        ) : conflicts.isError ? (
          <p className="text-sm text-red-600 dark:text-red-400">충돌 목록을 불러오지 못했어요</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">검토할 열린 충돌이 없어요.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {items.map((conflict) => {
              const sourceNames = [
                ...new Set(
                  conflict.observations.map((observation) => FOOD_SOURCE_LABEL[observation.source]),
                ),
              ];
              return (
                <li key={conflict.id} className="space-y-3 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{conflict.foodItem.name}</span>
                    <Badge variant="outline">{CONFLICT_FIELD_LABEL[conflict.field]}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {FOOD_SOURCE_LABEL[conflict.source]}
                      {conflict.sourceId ? ` · ${conflict.sourceId}` : ''}
                    </span>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div className="rounded bg-muted/50 p-2">
                      <div className="text-xs text-muted-foreground">기존 대표값</div>
                      <div className="mt-1 break-words">
                        {formatConflictValue(conflict.field, conflict.existingValue)}
                      </div>
                    </div>
                    <div className="rounded bg-amber-500/10 p-2">
                      <div className="text-xs text-muted-foreground">새 소스 값</div>
                      <div className="mt-1 break-words">
                        {formatConflictValue(conflict.field, conflict.incomingValue)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      관측 출처 {sourceNames.length > 0 ? sourceNames.join(', ') : '-'}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resolve.isPending}
                        onClick={() => act(conflict, 'keep_existing')}
                      >
                        기존 값 유지
                      </Button>
                      <Button
                        size="sm"
                        variant="amber"
                        disabled={resolve.isPending}
                        onClick={() => act(conflict, 'accept_incoming')}
                      >
                        새 값 반영
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={resolve.isPending}
                        onClick={() => act(conflict, 'dismiss')}
                      >
                        닫기
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

// ── 인식 품질 / 카탈로그 ─────────────────────────────────────────────────────────

const RecognitionQualitySection = () => {
  const [days, setDays] = useState(30);
  const [modelInput, setModelInput] = useState('');
  const model = useDebounced(modelInput.trim(), 300);
  const [versionInput, setVersionInput] = useState('');
  const [confidenceBucket, setConfidenceBucket] = useState<'' | 'low' | 'medium' | 'high'>('');
  const parsedVersion = Number(versionInput);
  const quality = useFoodRecognitionQuality({
    days,
    ...(model ? { model } : {}),
    ...(versionInput && Number.isInteger(parsedVersion) && parsedVersion > 0
      ? { version: parsedVersion }
      : {}),
    ...(confidenceBucket ? { confidenceBucket } : {}),
  });
  const q = quality.data;
  const validEntries = q ? q.recognitionEntryCount - q.invalidRecognitionCount : undefined;
  const correctionPct = q ? Math.round(q.correctionRate * 100) : undefined;

  return (
    <Card>
      <CardHeader className="flex-col items-stretch gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ChartBar className="size-4" />
            사진 인식 교정 품질
          </CardTitle>
          <CardDescription>
            확정 저장된 작은 표본의 방향성 지표입니다. 음식명은 민감할 수 있어 서로 다른 사용자 2명
            이상이 기여한 집계만 보입니다.
          </CardDescription>
        </div>
        <select
          aria-label="인식 품질 기간"
          className={cn(SELECT_CLS, 'w-auto shrink-0')}
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          <option value={7}>최근 7일</option>
          <option value={30}>최근 30일</option>
          <option value={90}>최근 90일</option>
        </select>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            모델
            <Input
              aria-label="인식 모델 필터"
              value={modelInput}
              onChange={(event) => setModelInput(event.target.value)}
              placeholder="예: gemma4:31b"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            프롬프트 버전
            <Input
              aria-label="인식 프롬프트 버전 필터"
              type="number"
              min={1}
              max={10_000}
              value={versionInput}
              onChange={(event) => setVersionInput(event.target.value)}
              placeholder="전체"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            원본 신뢰도
            <select
              aria-label="인식 신뢰도 필터"
              className={SELECT_CLS}
              value={confidenceBucket}
              onChange={(event) =>
                setConfidenceBucket(event.target.value as typeof confidenceBucket)
              }
            >
              <option value="">전체</option>
              <option value="low">낮음 (&lt; 0.40)</option>
              <option value="medium">보통 (0.40–0.74)</option>
              <option value="high">높음 (≥ 0.75)</option>
            </select>
          </label>
        </div>
        {quality.isError ? (
          <p className="text-sm text-red-600 dark:text-red-400">인식 품질을 불러오지 못했어요</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              유효 표본 {validEntries ?? '-'}건
              {q && q.invalidRecognitionCount > 0
                ? ` · 손상된 스냅샷 ${q.invalidRecognitionCount}건 제외`
                : ''}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <StatTile label="인식 기록" value={q?.recognitionEntryCount} />
              <StatTile label="그대로 확정" value={q?.confirmedCount} />
              <StatTile
                label="교정"
                value={q?.correctedCount}
                hint={correctionPct === undefined ? undefined : `${correctionPct}%`}
              />
              <StatTile label="삭제" value={q?.deletedCount} />
              <StatTile label="수동 추가" value={q?.manuallyAddedCount} />
              <StatTile label="foodId 없음" value={q?.unmatchedFinalItemCount} />
              <StatTile label="원본 음식" value={q?.originalDishCount} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-md border p-3">
                <p className="text-xs font-medium text-muted-foreground">모델 · 프롬프트 버전</p>
                {q && q.byModelVersion.length > 0 ? (
                  <ul className="mt-2 space-y-2 text-xs">
                    {q.byModelVersion.map((item) => (
                      <li
                        key={`${item.model ?? 'unknown'}:${item.version ?? 'unknown'}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0 truncate">
                          {item.model ?? '모델 미상'} · v{item.version ?? '?'}
                        </span>
                        <span className="shrink-0 font-mono tabular-nums">
                          {item.recognitionEntryCount}건 · 교정{' '}
                          {Math.round(item.correctionRate * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">조건에 맞는 모델 표본 없음</p>
                )}
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs font-medium text-muted-foreground">원본 신뢰도별 교정률</p>
                <ul className="mt-2 space-y-2 text-xs">
                  {q?.byConfidence.map((item) => (
                    <li key={item.bucket} className="flex items-center justify-between gap-3">
                      <span>
                        {item.bucket === 'low'
                          ? '낮음'
                          : item.bucket === 'medium'
                            ? '보통'
                            : '높음'}
                      </span>
                      <span className="font-mono tabular-nums">
                        {item.originalDishCount}개 · {Math.round(item.correctionRate * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border p-3">
                <p className="text-xs font-medium text-muted-foreground">자주 고친 인식</p>
                {q && q.topCorrections.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {q.topCorrections.map((item) => (
                      <li
                        key={`${item.originalName}\u0000${item.finalName}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0 truncate">
                          {item.originalName} → {item.finalName}
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums">
                          {item.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    2명 이상이 공통으로 한 교정 없음
                  </p>
                )}
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs font-medium text-muted-foreground">foodId 미매칭 최종 음식</p>
                {q && q.topUnmatched.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {q.topUnmatched.map((item) => (
                      <li key={item.name} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate">{item.name}</span>
                        <span className="shrink-0 font-mono text-xs tabular-nums">
                          {item.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    2명 이상에서 반복된 미매칭 없음
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

type SortKey = NonNullable<FoodAdminListInput['sort']>;
const SORT_LABEL: Record<SortKey, string> = {
  popularity: '인기도순',
  name: '이름순',
  updatedAt: '최근 수정순',
};
const SORT_KEYS = Object.keys(SORT_LABEL) as SortKey[];
const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 50;
const COLS = 9;

const CatalogSection = () => {
  const [searchInput, setSearchInput] = useState('');
  // 입력은 즉시, 요청은 300ms 안정 후 — 글자마다 fetch 가 나가지 않게.
  const q = useDebounced(searchInput, 300);
  const [dishType, setDishType] = useState<FoodDishTypeType | ''>('');
  const [mainIngredient, setMainIngredient] = useState<FoodMainIngredientType | ''>('');
  const [cuisine, setCuisine] = useState<FoodCuisineType | ''>('');
  const [source, setSource] = useState<FoodSourceType | ''>('');
  const [allergenStatus, setAllergenStatus] = useState<FoodAllergenStatusType | ''>('');
  const [active, setActive] = useState<'' | '1' | '0'>('');
  const [unclassified, setUnclassified] = useState(false);
  const [sort, setSort] = useState<SortKey>('popularity');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [editingId, setEditingId] = useState<string | null>(null);

  const list = useFoodAdminList({
    q: q.trim() || undefined,
    dishType: dishType || undefined,
    mainIngredient: mainIngredient || undefined,
    cuisine: cuisine || undefined,
    source: source || undefined,
    allergenStatus: allergenStatus || undefined,
    active: active === '' ? undefined : active === '1',
    unclassified: unclassified ? true : undefined,
    sort,
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  // 조건을 바꾸면 1페이지로 — 페이지를 유지하면 줄어든 결과 밖을 가리킬 수 있다.
  const withReset =
    <T,>(set: (v: T) => void) =>
    (v: T): void => {
      set(v);
      setPage(1);
    };

  return (
    <Card>
      <CardHeader className="flex-col items-stretch gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Soup className="size-4" />
            카탈로그
          </CardTitle>
          <CardDescription>
            적재된 음식을 검색·필터하고 이름·별칭·분류를 바로 고칩니다. 분류를 비우면 다음 적재의
            LLM 분류 대상이 됩니다.
          </CardDescription>
        </div>
        <CreateDialog />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 검색 + 필터 */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-5">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="음식 검색"
              className="pl-8"
              placeholder="음식명·별칭 검색"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <TaxonomySelect
            aria-label="조리형태 필터"
            value={dishType}
            options={FOOD_DISH_TYPES}
            labels={FOOD_DISH_TYPE_LABEL}
            emptyLabel="조리형태 전체"
            onChange={withReset(setDishType)}
          />
          <TaxonomySelect
            aria-label="주재료 필터"
            value={mainIngredient}
            options={FOOD_MAIN_INGREDIENTS}
            labels={FOOD_MAIN_INGREDIENT_LABEL}
            emptyLabel="주재료 전체"
            onChange={withReset(setMainIngredient)}
          />
          <TaxonomySelect
            aria-label="요리 계통 필터"
            value={cuisine}
            options={FOOD_CUISINES}
            labels={FOOD_CUISINE_LABEL}
            emptyLabel="요리 계통 전체"
            onChange={withReset(setCuisine)}
          />
          <TaxonomySelect
            aria-label="출처 필터"
            value={source}
            options={FOOD_SOURCES}
            labels={FOOD_SOURCE_LABEL}
            emptyLabel="출처 전체"
            onChange={withReset(setSource)}
          />
          <TaxonomySelect
            aria-label="알레르기 근거 필터"
            value={allergenStatus}
            options={FoodAllergenStatus.options}
            labels={ALLERGEN_STATUS_LABEL}
            emptyLabel="알레르기 근거 전체"
            onChange={withReset(setAllergenStatus)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <select
            aria-label="활성 필터"
            className={cn(SELECT_CLS, 'h-8 w-auto')}
            value={active}
            onChange={(e) => {
              setActive(e.target.value as '' | '1' | '0');
              setPage(1);
            }}
          >
            <option value="">활성 전체</option>
            <option value="1">활성</option>
            <option value="0">비활성</option>
          </select>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              aria-label="미분류만"
              checked={unclassified}
              onChange={(e) => {
                setUnclassified(e.target.checked);
                setPage(1);
              }}
            />
            미분류만
          </label>
          <select
            aria-label="정렬"
            className={cn(SELECT_CLS, 'ml-auto h-8 w-auto')}
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKey);
              setPage(1);
            }}
          >
            {SORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
        </div>

        {/* 표 */}
        <div
          className={cn(
            'overflow-hidden rounded-md border transition-opacity',
            list.isFetching && 'opacity-70',
          )}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>별칭</TableHead>
                <TableHead>분류</TableHead>
                <TableHead>알레르기</TableHead>
                <TableHead>출처</TableHead>
                <TableHead className="text-right">인기도</TableHead>
                <TableHead>활성</TableHead>
                <TableHead>수정</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isPending ? (
                <TableRow>
                  <TableCell colSpan={COLS} className="py-8 text-center">
                    <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : list.isError ? (
                <TableRow>
                  <TableCell
                    colSpan={COLS}
                    className="py-8 text-center text-sm text-red-600 dark:text-red-400"
                  >
                    목록을 불러오지 못했어요
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={COLS}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    조건에 맞는 음식이 없어요
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) =>
                  editingId === item.id ? (
                    <EditRow
                      key={item.id}
                      item={item}
                      colSpan={COLS}
                      onDone={() => setEditingId(null)}
                    />
                  ) : (
                    <ItemRow key={item.id} item={item} onEdit={() => setEditingId(item.id)} />
                  ),
                )
              )}
            </TableBody>
          </Table>
        </div>
        <Pager
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
        />
      </CardContent>
    </Card>
  );
};

const ItemRow = ({ item, onEdit }: { item: FoodItemType; onEdit: () => void }) => {
  const partiallyClassified = !item.dishType || !item.mainIngredient || !item.cuisine;
  return (
    <TableRow className={cn(!item.active && 'opacity-60')}>
      <TableCell>
        <div className="font-medium">{item.name}</div>
        {item.repName && <div className="text-xs text-muted-foreground">{item.repName}</div>}
      </TableCell>
      <TableCell
        className="max-w-[14rem] truncate text-xs text-muted-foreground"
        title={item.aliases.join(', ')}
      >
        {item.aliases.length > 0 ? item.aliases.join(', ') : '-'}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {item.dishType && <Badge variant="blue">{FOOD_DISH_TYPE_LABEL[item.dishType]}</Badge>}
          {item.mainIngredient && (
            <Badge variant="green">{FOOD_MAIN_INGREDIENT_LABEL[item.mainIngredient]}</Badge>
          )}
          {item.cuisine && <Badge variant="violet">{FOOD_CUISINE_LABEL[item.cuisine]}</Badge>}
          {partiallyClassified && <Badge variant="amber">미분류</Badge>}
        </div>
      </TableCell>
      <TableCell
        className="max-w-[15rem] text-xs"
        title={item.allergenEvidence.join('\n') || '알레르기 근거 없음'}
      >
        <div className="flex flex-wrap gap-1">
          <Badge
            variant={
              item.allergenStatus === 'verified'
                ? 'green'
                : item.allergenStatus === 'inferred'
                  ? 'amber'
                  : 'secondary'
            }
          >
            {ALLERGEN_STATUS_LABEL[item.allergenStatus]}
          </Badge>
          {item.allergens.slice(0, 2).map((allergen) => (
            <Badge key={allergen} variant="red">
              {MEAL_ALLERGEN_LABEL[allergen]}
            </Badge>
          ))}
          {item.allergens.length > 2 && <Badge variant="red">+{item.allergens.length - 2}</Badge>}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {FOOD_SOURCE_LABEL[item.source]}
      </TableCell>
      <TableCell className="text-right font-mono text-xs tabular-nums">{item.popularity}</TableCell>
      <TableCell className="text-xs">
        {item.active ? '활성' : <span className="text-muted-foreground">비활성</span>}
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {formatDate(item.updatedAt)}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`${item.name} 편집`}>
          <Pencil className="size-3.5" />
          편집
        </Button>
      </TableCell>
    </TableRow>
  );
};

// ── 편집/등록 폼 ─────────────────────────────────────────────────────────────

interface FoodForm {
  name: string;
  repName: string;
  aliases: string;
  ingredients: string;
  dishType: FoodDishTypeType | '';
  mainIngredient: FoodMainIngredientType | '';
  cuisine: FoodCuisineType | '';
  allergens: MealAllergenType[];
  allergenStatus: FoodAllergenStatusType;
  active: boolean;
}

const EMPTY_FORM: FoodForm = {
  name: '',
  repName: '',
  aliases: '',
  ingredients: '',
  dishType: '',
  mainIngredient: '',
  cuisine: '',
  allergens: [],
  allergenStatus: 'inferred',
  active: true,
};

const formFromItem = (item: FoodItemType): FoodForm => ({
  name: item.name,
  repName: item.repName ?? '',
  aliases: item.aliases.join(', '),
  ingredients: item.ingredients?.join(', ') ?? '',
  dishType: item.dishType ?? '',
  mainIngredient: item.mainIngredient ?? '',
  cuisine: item.cuisine ?? '',
  allergens: item.allergens,
  allergenStatus: item.allergenStatus,
  active: item.active,
});

// 편집 저장은 바뀐 필드만 보낸다 — 분류 비우기는 null(서버가 "재분류 대상"으로 해석).
const diffForm = (item: FoodItemType, form: FoodForm): FoodAdminUpdateInputType => {
  const input: FoodAdminUpdateInputType = {};
  const name = form.name.trim();
  if (name !== item.name) input.name = name;
  const repName = form.repName.trim() || null;
  if (repName !== item.repName) input.repName = repName;
  const aliases = splitAliases(form.aliases);
  if (!sameList(aliases, item.aliases)) input.aliases = aliases;
  const ingredients = splitAliases(form.ingredients);
  if (!sameList(ingredients, item.ingredients ?? [])) {
    input.ingredients = ingredients.length > 0 ? ingredients : null;
  }
  const dishType = form.dishType || null;
  if (dishType !== item.dishType) input.dishType = dishType;
  const mainIngredient = form.mainIngredient || null;
  if (mainIngredient !== item.mainIngredient) input.mainIngredient = mainIngredient;
  const cuisine = form.cuisine || null;
  if (cuisine !== item.cuisine) input.cuisine = cuisine;
  if (!sameSet(form.allergens, item.allergens)) input.allergens = form.allergens;
  if (form.allergenStatus !== item.allergenStatus) input.allergenStatus = form.allergenStatus;
  if (form.active !== item.active) input.active = form.active;
  return input;
};

// 등록은 채운 값만 — 비운 분류는 보내지 않는다(null 과 같은 뜻).
const createInputFromForm = (form: FoodForm): FoodAdminCreateInputType => {
  const input: FoodAdminCreateInputType = { name: form.name.trim(), active: form.active };
  const repName = form.repName.trim();
  if (repName) input.repName = repName;
  const aliases = splitAliases(form.aliases);
  if (aliases.length > 0) input.aliases = aliases;
  const ingredients = splitAliases(form.ingredients);
  if (ingredients.length > 0) input.ingredients = ingredients;
  if (form.dishType) input.dishType = form.dishType;
  if (form.mainIngredient) input.mainIngredient = form.mainIngredient;
  if (form.cuisine) input.cuisine = form.cuisine;
  input.allergenStatus = form.allergenStatus;
  if (form.allergenStatus === 'verified') input.allergens = form.allergens;
  return input;
};

const Field = ({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) => (
  <div className={cn('space-y-1', className)}>
    <div className="text-xs font-medium text-muted-foreground">{label}</div>
    {children}
  </div>
);

const TaxonomySelect = <T extends string>({
  value,
  options,
  labels,
  emptyLabel,
  onChange,
  className,
  'aria-label': ariaLabel,
}: {
  value: T | '';
  options: readonly T[];
  labels: Record<T, string>;
  emptyLabel: string;
  onChange: (v: T | '') => void;
  className?: string;
  'aria-label'?: string;
}) => (
  <select
    aria-label={ariaLabel}
    className={cn(SELECT_CLS, className)}
    value={value}
    onChange={(e) => onChange(e.target.value as T | '')}
  >
    <option value="">{emptyLabel}</option>
    {options.map((o) => (
      <option key={o} value={o}>
        {labels[o]}
      </option>
    ))}
  </select>
);

const FoodFormFields = ({
  form,
  onChange,
}: {
  form: FoodForm;
  onChange: (patch: Partial<FoodForm>) => void;
}) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <Field label="음식명">
      <Input
        aria-label="음식명"
        value={form.name}
        onChange={(e) => onChange({ name: e.target.value })}
        maxLength={60}
      />
    </Field>
    <Field label="대표식품명">
      <Input
        aria-label="대표식품명"
        value={form.repName}
        onChange={(e) => onChange({ repName: e.target.value })}
        maxLength={60}
        placeholder="없으면 비움"
      />
    </Field>
    <Field label="별칭 (쉼표 구분)" className="sm:col-span-2">
      <Input
        aria-label="별칭"
        value={form.aliases}
        onChange={(e) => onChange({ aliases: e.target.value })}
        placeholder="예: 김치찌게, 묵은지찌개"
      />
    </Field>
    <Field label="공개 재료 (쉼표 구분)" className="sm:col-span-2">
      <Input
        aria-label="공개 재료"
        value={form.ingredients}
        onChange={(e) =>
          onChange({
            ingredients: e.target.value,
            // 재료가 달라지면 과거 운영자 검수도 더는 같은 근거가 아니므로 다시 추정한다.
            ...(form.allergenStatus === 'verified' ? { allergenStatus: 'inferred' } : {}),
          })
        }
        placeholder="예: 돼지고기, 두부, 저염간장"
      />
    </Field>
    <Field label="조리형태">
      <TaxonomySelect
        aria-label="조리형태"
        value={form.dishType}
        options={FOOD_DISH_TYPES}
        labels={FOOD_DISH_TYPE_LABEL}
        emptyLabel="—(미분류)"
        onChange={(v) => onChange({ dishType: v })}
      />
    </Field>
    <Field label="주재료">
      <TaxonomySelect
        aria-label="주재료"
        value={form.mainIngredient}
        options={FOOD_MAIN_INGREDIENTS}
        labels={FOOD_MAIN_INGREDIENT_LABEL}
        emptyLabel="—(미분류)"
        onChange={(v) => onChange({ mainIngredient: v })}
      />
    </Field>
    <Field label="요리 계통">
      <TaxonomySelect
        aria-label="요리 계통"
        value={form.cuisine}
        options={FOOD_CUISINES}
        labels={FOOD_CUISINE_LABEL}
        emptyLabel="—(미분류)"
        onChange={(v) => onChange({ cuisine: v })}
      />
    </Field>
    <Field label="알레르기 근거 상태">
      <TaxonomySelect
        aria-label="알레르기 근거 상태"
        value={form.allergenStatus}
        options={FoodAllergenStatus.options}
        labels={ALLERGEN_STATUS_LABEL}
        emptyLabel="미확인"
        onChange={(value) => onChange({ allergenStatus: value || 'unknown' })}
      />
    </Field>
    <Field label="표시 대상 알레르겐" className="sm:col-span-2">
      <div className="grid grid-cols-2 gap-1.5 rounded-md border p-3 sm:grid-cols-4">
        {MealAllergen.options.map((allergen) => (
          <label key={allergen} className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={form.allergens.includes(allergen)}
              onChange={() =>
                onChange({
                  allergens: form.allergens.includes(allergen)
                    ? form.allergens.filter((value) => value !== allergen)
                    : [...form.allergens, allergen],
                  allergenStatus: 'verified',
                })
              }
            />
            {MEAL_ALLERGEN_LABEL[allergen]}
          </label>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        체크를 바꾸면 운영자 검수로 저장됩니다. 재료 기반 추정과 검수 모두 교차접촉·미표기 재료의
        안전을 보장하지 않습니다.
      </p>
    </Field>
    <label className="flex items-center gap-1.5 text-sm sm:col-span-2">
      <input
        type="checkbox"
        aria-label="활성"
        checked={form.active}
        onChange={(e) => onChange({ active: e.target.checked })}
      />
      활성 (추천·자동완성에 노출)
    </label>
  </div>
);

const EditRow = ({
  item,
  colSpan,
  onDone,
}: {
  item: FoodItemType;
  colSpan: number;
  onDone: () => void;
}) => {
  const update = useUpdateFoodItem();
  const [form, setForm] = useState<FoodForm>(() => formFromItem(item));
  const patch = (p: Partial<FoodForm>): void => setForm((f) => ({ ...f, ...p }));
  const name = form.name.trim();

  const save = (): void => {
    if (!name) return;
    const input = diffForm(item, form);
    if (Object.keys(input).length === 0) {
      onDone();
      return;
    }
    update.mutate(
      { id: item.id, input },
      {
        onSuccess: () => {
          toast.success('저장했어요');
          onDone();
        },
        onError: (e) => toast.error(errorMessage(e, '저장에 실패했어요')),
      },
    );
  };

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={colSpan}>
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">
            편집 · {item.name}{' '}
            <span className="font-normal">({FOOD_SOURCE_LABEL[item.source]})</span>
          </div>
          <FoodFormFields form={form} onChange={patch} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onDone} disabled={update.isPending}>
              취소
            </Button>
            <Button variant="amber" size="sm" onClick={save} disabled={!name || update.isPending}>
              {update.isPending && <Loader2 className="size-4 animate-spin" />}
              저장
            </Button>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
};

const CreateDialog = () => {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="teal" size="sm">
          <Plus className="size-4" />
          수기 등록
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-5 shadow-lg outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold">음식 수기 등록</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                출처는 ‘수기’로 저장됩니다. 같은 이름이 이미 있으면 등록되지 않아요.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="닫기"
                className="h-8 w-8 shrink-0 p-0"
              >
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>
          {/* 폼은 열릴 때 마운트·닫힐 때 언마운트 — 입력값이 다음 열기에 남지 않는다. */}
          <CreateForm onDone={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

const CreateForm = ({ onDone }: { onDone: () => void }) => {
  const create = useCreateFoodItem();
  const [form, setForm] = useState<FoodForm>(EMPTY_FORM);
  const patch = (p: Partial<FoodForm>): void => setForm((f) => ({ ...f, ...p }));
  const name = form.name.trim();

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!name) return;
    create.mutate(createInputFromForm(form), {
      onSuccess: (item) => {
        toast.success(`등록했어요 · ${item.name}`);
        onDone();
      },
      onError: (err) => toast.error(errorMessage(err, '등록에 실패했어요')),
    });
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <FoodFormFields form={form} onChange={patch} />
      <div className="flex justify-end gap-2">
        <Dialog.Close asChild>
          <Button type="button" variant="ghost" size="sm" disabled={create.isPending}>
            취소
          </Button>
        </Dialog.Close>
        <Button type="submit" size="sm" disabled={!name || create.isPending}>
          {create.isPending && <Loader2 className="size-4 animate-spin" />}
          등록
        </Button>
      </div>
    </form>
  );
};
