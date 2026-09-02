import { useState, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, Loader2, Save, XCircle } from 'lucide-react';
import type { UsageQuotaFeatureType, UsageQuotaOverviewItemType, UsageQuotaSettingType } from '@repo/api-contract';
import { ApiError, useUpdateUsageQuota, useUsageQuotaOverview } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';

// 설정 > 사용량 한도 — 로그인 없이 쓰는 비용성 기능(타로 LLM 해석 등)의 게스트 기기·IP·전역 일일
// 한도와 그날 사용량. 값은 friendly usage-quota 서비스가 30초 캐시 뒤 즉시 반영(저장 시 무효화).
// 회원은 기기·IP 일일 한도를 건너뛰고 전역 예산만 소비한다(게스트는 예산의 cutoff % 에서 컷).

const FEATURE_META: Record<UsageQuotaFeatureType, { label: string; desc: string }> = {
  'tarot-reading': {
    label: '타로 해석',
    desc: '타로 리딩의 Ollama Cloud 호출. 같은 카드·질문 조합은 캐시라 한도를 소비하지 않는다.',
  },
};

const FIELDS: Array<{ key: keyof FormState; label: string; hint: string; min: number; max?: number }> = [
  { key: 'guestPerDay', label: '게스트 기기 일일', hint: 'X-Guest-Key 기준. 0 = 제한 없음', min: 0 },
  { key: 'ipPerDay', label: 'IP 일일', hint: '게스트만. CGNAT 고려 넉넉히. 0 = 제한 없음', min: 0 },
  { key: 'ipPerMinute', label: 'IP 분당', hint: '회원 포함 버스트 방어', min: 1 },
  { key: 'globalPerDay', label: '전역 일일 예산', hint: '회원 포함 LLM 호출 상한. 0 = 제한 없음', min: 0 },
  { key: 'guestCutoffPct', label: '게스트 컷 %', hint: '전역 예산의 이 % 부터 게스트는 정적 해석', min: 0, max: 100 },
];

interface FormState {
  guestPerDay: string;
  ipPerDay: string;
  ipPerMinute: string;
  globalPerDay: string;
  guestCutoffPct: string;
}

const toForm = (s: UsageQuotaSettingType): FormState => ({
  guestPerDay: String(s.guestPerDay),
  ipPerDay: String(s.ipPerDay),
  ipPerMinute: String(s.ipPerMinute),
  globalPerDay: String(s.globalPerDay),
  guestCutoffPct: String(s.guestCutoffPct),
});

const todayKst = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

export const AdminQuotasPage = () => {
  const [date, setDate] = useState(todayKst());
  const overview = useUsageQuotaOverview(date === todayKst() ? undefined : date);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          로그인 없이 쓰는 기능의 익명 한도입니다. 회원은 기기·IP 일일 한도를 건너뛰고 전역 예산만
          소비합니다. 저장은 30초 안에 반영됩니다.
        </p>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          사용량 날짜
          <Input type="date" value={date} max={todayKst()} onChange={(e) => setDate(e.target.value)} className="h-8 w-40" />
        </label>
      </div>

      {overview.isLoading && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
      {overview.isError && (
        <p className="text-sm text-destructive">한도를 불러오지 못했습니다: {(overview.error as Error).message}</p>
      )}
      <div className="grid gap-4">
        {overview.data?.items.map((item) => (
          <QuotaCard key={item.setting.feature} item={item} />
        ))}
      </div>
    </div>
  );
};

const QuotaCard = ({ item }: { item: UsageQuotaOverviewItemType }) => {
  const { setting, usage } = item;
  const meta = FEATURE_META[setting.feature];
  const update = useUpdateUsageQuota();
  const [form, setForm] = useState<FormState>(() => toForm(setting));
  const [enabled, setEnabled] = useState(setting.enabled);
  // 저장 후 서버 값이 바뀌면 폼을 그 값으로(렌더 중 파생 — 편집 중인 폼을 덮지 않도록 updatedAt 기준).
  const [synced, setSynced] = useState(setting.updatedAt);
  if (synced !== setting.updatedAt) {
    setSynced(setting.updatedAt);
    setForm(toForm(setting));
    setEnabled(setting.enabled);
  }
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveError(null);
    setSaveOk(false);
    const parsed: Partial<Record<keyof FormState, number>> = {};
    for (const f of FIELDS) {
      const n = Number(form[f.key]);
      if (!Number.isInteger(n) || n < f.min || (f.max !== undefined && n > f.max)) {
        setSaveError(`${f.label}은(는) ${f.min}${f.max !== undefined ? `~${f.max}` : ' 이상'}의 정수여야 합니다.`);
        return;
      }
      parsed[f.key] = n;
    }
    try {
      await update.mutateAsync({ feature: setting.feature, input: { enabled, ...parsed } });
      setSaveOk(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : '저장 실패');
    }
  };

  const budget = setting.globalPerDay > 0 ? setting.globalPerDay : null;
  const pct = budget ? Math.min(100, Math.round((usage.global / budget) * 100)) : null;
  const cutoff = budget ? Math.floor((budget * setting.guestCutoffPct) / 100) : null;

  return (
    <Card data-testid={`quota-${setting.feature}`}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">{meta.label}</CardTitle>
          <span className="text-xs text-muted-foreground">
            {setting.updatedAt ? `저장 ${new Date(setting.updatedAt).toLocaleString('ko-KR')}` : '코드 기본값'}
          </span>
        </div>
        <CardDescription>{meta.desc}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[1fr_minmax(0,18rem)]">
        {/* noValidate — 브라우저 기본 말풍선 대신 아래 한국어 검증 메시지로 통일. */}
        <form onSubmit={handleSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            LLM 호출 허용 (끄면 전원 정적 해석)
          </label>
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              <Input
                type="number"
                min={f.min}
                max={f.max}
                value={form[f.key]}
                aria-label={f.label}
                onChange={(e) => {
                  setForm((s) => ({ ...s, [f.key]: e.target.value }));
                  setSaveOk(false);
                }}
              />
            </Field>
          ))}
          <div className="sm:col-span-2 flex items-center gap-3">
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              저장
            </Button>
            {saveOk && (
              <span className="flex items-center gap-1 text-sm text-emerald-600">
                <CheckCircle2 className="size-4" /> 저장됨
              </span>
            )}
            {saveError && (
              <span className="flex items-center gap-1 text-sm text-destructive">
                <XCircle className="size-4" /> {saveError}
              </span>
            )}
          </div>
        </form>

        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <div className="mb-2 text-xs font-medium text-muted-foreground">{usage.date} 사용량</div>
          <div className="flex items-baseline justify-between">
            <span>전역 LLM 호출</span>
            <span className="font-semibold tabular-nums">
              {usage.global}
              {budget ? ` / ${budget}` : ''}
            </span>
          </div>
          {pct !== null && (
            <div className="mt-1.5 h-2 overflow-hidden rounded bg-muted">
              <div
                className={pct >= 100 ? 'h-full bg-destructive' : cutoff !== null && usage.global >= cutoff ? 'h-full bg-amber-500' : 'h-full bg-primary'}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
          {cutoff !== null && (
            <div className="mt-1 text-[11px] text-muted-foreground">게스트 컷 {cutoff}회부터 정적 해석</div>
          )}
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="게스트" value={usage.guestTotal} />
            <Stat label="IP" value={usage.ipTotal} />
            <Stat label="회원" value={usage.userTotal} />
          </dl>
          <TopList title="상위 게스트 키" items={usage.topGuests} />
          <TopList title="상위 IP" items={usage.topIps} />
        </div>
      </CardContent>
    </Card>
  );
};

const Field = ({ label, hint, children }: { label: string; hint: string; children: ReactNode }) => (
  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
    <span>{label}</span>
    {children}
    <span className="text-[11px] font-normal">{hint}</span>
  </label>
);

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded bg-background p-2">
    <dt className="text-[11px] text-muted-foreground">{label}</dt>
    <dd className="font-semibold tabular-nums">{value}</dd>
  </div>
);

const TopList = ({ title, items }: { title: string; items: Array<{ key: string; count: number }> }) => {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">{title}</div>
      <ul className="flex flex-col gap-0.5 text-xs">
        {items.map((it) => (
          <li key={it.key} className="flex justify-between gap-2">
            <span className="truncate font-mono">{it.key}</span>
            <span className="shrink-0 tabular-nums">{it.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
