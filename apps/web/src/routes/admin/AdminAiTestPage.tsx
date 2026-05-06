import { useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { ApiError, useCompleteAi, useCompleteBatchAi, useProviderModels } from '@repo/shared';
import type {
  AiCompleteBatchInputType,
  AiCompleteBatchResultItemType,
  AiCompleteResultType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';

type Mode = 'single' | 'batch' | 'multi-model' | 'multi-sample';

interface BatchResultEntry {
  result: AiCompleteBatchResultItemType;
  label: string;
}

interface SingleResultEntry {
  result: AiCompleteResultType;
}

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'single', label: '단건', hint: '한 번 실행' },
  { id: 'batch', label: 'Batch', hint: '서로 다른 prompt N개를 동시 실행' },
  { id: 'multi-model', label: '모델 비교', hint: '같은 prompt를 여러 모델에 동시 실행' },
  { id: 'multi-sample', label: '샘플 N개', hint: '같은 prompt × 같은 모델 × N회' },
];

const MODELS_DATALIST_ID = 'ai-test-models';

export const AdminAiTestPage = () => {
  const [mode, setMode] = useState<Mode>('single');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [singlePrompt, setSinglePrompt] = useState('');
  const [singleModel, setSingleModel] = useState<string>('');
  const [batchPrompts, setBatchPrompts] = useState<string[]>(['', '']);
  const [batchModel, setBatchModel] = useState<string>('');
  const [multiModelPrompt, setMultiModelPrompt] = useState('');
  const [multiModelChoices, setMultiModelChoices] = useState<string[]>([]);
  const [samplePrompt, setSamplePrompt] = useState('');
  const [sampleModel, setSampleModel] = useState<string>('');
  const [sampleN, setSampleN] = useState(3);
  // Temperature is opt-in — when disabled the field is not sent at all and
  // the provider's own default applies. Toggling on commits the slider value.
  const [useTemperature, setUseTemperature] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const effectiveTemperature = useTemperature ? temperature : undefined;

  // Best-effort fetch — empty list when key missing or call fails.
  const modelsQuery = useProviderModels('ollama-cloud');
  const allModelOptions = useMemo(
    () => modelsQuery.data?.models ?? [],
    [modelsQuery.data],
  );

  const [singleResult, setSingleResult] = useState<SingleResultEntry | null>(null);
  const [batchResults, setBatchResults] = useState<BatchResultEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [batchTotalMs, setBatchTotalMs] = useState<number | null>(null);

  const completeAi = useCompleteAi();
  const completeBatch = useCompleteBatchAi();
  const isPending = completeAi.isPending || completeBatch.isPending;

  const reset = () => {
    setSingleResult(null);
    setBatchResults([]);
    setBatchTotalMs(null);
    setError(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    reset();

    try {
      if (mode === 'single') {
        if (!singlePrompt.trim()) {
          setError('prompt를 입력해 주세요.');
          return;
        }
        if (!singleModel.trim()) {
          setError('모델을 선택해 주세요.');
          return;
        }
        const r = await completeAi.mutateAsync({
          prompt: singlePrompt,
          model: singleModel,
          systemPrompt: systemPrompt || undefined,
          temperature: effectiveTemperature,
        });
        setSingleResult({ result: r });
        return;
      }

      const items = buildBatchItems({
        mode,
        batchPrompts,
        batchModel,
        multiModelPrompt,
        multiModelChoices,
        samplePrompt,
        sampleModel,
        sampleN,
        systemPrompt,
        temperature: effectiveTemperature,
      });
      if (items.length === 0) {
        setError('실행할 항목이 없습니다.');
        return;
      }
      if (items.length > 10) {
        setError(`항목이 ${items.length}개입니다. 최대 10개까지 가능합니다.`);
        return;
      }

      const startedAt = performance.now();
      const out = await completeBatch.mutateAsync({ items: items.map((i) => i.payload) });
      setBatchTotalMs(Math.round(performance.now() - startedAt));
      const labels = new Map(items.map((i) => [i.payload.clientId!, i.label]));
      setBatchResults(
        out.results.map((r) => ({
          result: r,
          label: r.clientId ? labels.get(r.clientId) ?? r.clientId : '?',
        })),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '실패');
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI 테스트</h1>
          <p className="text-sm text-muted-foreground">단건/병렬 모드로 LLM 응답을 비교합니다.</p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>입력</CardTitle>
            <CardDescription>모드를 선택하고 prompt를 작성하세요.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-2">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  title={m.hint}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    mode === m.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:bg-accent'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <Field label="System prompt (선택)">
                <textarea
                  className="min-h-[60px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="너는 친절한 한국어 도우미야."
                />
              </Field>

              {mode === 'single' && (
                <>
                  <Field label="Prompt">
                    <textarea
                      className="min-h-[120px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={singlePrompt}
                      onChange={(e) => setSinglePrompt(e.target.value)}
                      placeholder="한 줄로 자기소개해줘."
                    />
                  </Field>
                  <Field label="모델">
                    <ModelInput value={singleModel} onChange={setSingleModel} />
                  </Field>
                </>
              )}

              {mode === 'batch' && (
                <>
                  <Field label={`Prompt ${batchPrompts.length}개 (최대 10)`}>
                    <div className="space-y-2">
                      {batchPrompts.map((p, idx) => (
                        <div key={idx} className="flex gap-2">
                          <Input
                            value={p}
                            placeholder={`prompt ${idx + 1}`}
                            onChange={(e) => {
                              const next = [...batchPrompts];
                              next[idx] = e.target.value;
                              setBatchPrompts(next);
                            }}
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={batchPrompts.length <= 1}
                            onClick={() => setBatchPrompts((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={batchPrompts.length >= 10}
                        onClick={() => setBatchPrompts((prev) => [...prev, ''])}
                      >
                        <Plus />
                        prompt 추가
                      </Button>
                    </div>
                  </Field>
                  <Field label="모델">
                    <ModelInput value={batchModel} onChange={setBatchModel} />
                  </Field>
                </>
              )}

              {mode === 'multi-model' && (
                <>
                  <Field label="Prompt">
                    <textarea
                      className="min-h-[100px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={multiModelPrompt}
                      onChange={(e) => setMultiModelPrompt(e.target.value)}
                    />
                  </Field>
                  <Field
                    label={`모델 (체크 = 동시 실행) · ${multiModelChoices.length}개 선택됨`}
                  >
                    <div className="grid grid-cols-2 gap-1.5">
                      {allModelOptions.map((m) => {
                        const checked = multiModelChoices.includes(m);
                        return (
                          <label key={m} className="flex items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setMultiModelChoices((prev) =>
                                  e.target.checked ? [...prev, m] : prev.filter((x) => x !== m),
                                )
                              }
                            />
                            <span className="truncate" title={m}>
                              {m}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </Field>
                </>
              )}

              {mode === 'multi-sample' && (
                <>
                  <Field label="Prompt">
                    <textarea
                      className="min-h-[100px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={samplePrompt}
                      onChange={(e) => setSamplePrompt(e.target.value)}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="모델">
                      <ModelInput value={sampleModel} onChange={setSampleModel} />
                    </Field>
                    <Field label={`샘플 수 (1~10)`}>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={sampleN}
                        onChange={(e) => setSampleN(Math.max(1, Math.min(10, Number(e.target.value))))}
                      />
                    </Field>
                  </div>
                </>
              )}

              <datalist id={MODELS_DATALIST_ID}>
                {allModelOptions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>

              <Field
                label={
                  useTemperature
                    ? `Temperature: ${temperature.toFixed(2)}`
                    : 'Temperature (provider 기본값 사용)'
                }
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={useTemperature}
                    onChange={(e) => setUseTemperature(e.target.checked)}
                    aria-label="Temperature 설정"
                  />
                  <input
                    type="range"
                    className="flex-1 disabled:opacity-50"
                    min={0}
                    max={2}
                    step={0.05}
                    value={temperature}
                    disabled={!useTemperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                  />
                </div>
              </Field>

              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? <Loader2 className="animate-spin" /> : <Play />}
                실행
              </Button>
              {error && (
                <p className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="size-4" /> {error}
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {singleResult && <SingleResultCard entry={singleResult} />}
          {batchResults.length > 0 && (
            <BatchResultsHeader totalMs={batchTotalMs} count={batchResults.length} />
          )}
          {batchResults.map((entry, idx) => (
            <BatchResultCard key={idx} entry={entry} />
          ))}
          {!singleResult && batchResults.length === 0 && !error && !isPending && (
            <Card>
              <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                실행 결과가 여기에 표시됩니다.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
    <span>{label}</span>
    {children}
  </label>
);

const ModelInput = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) => (
  <Input
    type="text"
    list={MODELS_DATALIST_ID}
    placeholder="gpt-oss:20b ..."
    value={value}
    onChange={(e) => onChange(e.target.value)}
  />
);

interface BuildBatchArgs {
  mode: Mode;
  batchPrompts: string[];
  batchModel: string;
  multiModelPrompt: string;
  multiModelChoices: string[];
  samplePrompt: string;
  sampleModel: string;
  sampleN: number;
  systemPrompt: string;
  temperature: number | undefined;
}

interface BatchPlanItem {
  payload: AiCompleteBatchInputType['items'][number];
  label: string;
}

const buildBatchItems = (a: BuildBatchArgs): BatchPlanItem[] => {
  const sys = a.systemPrompt || undefined;
  const temp = a.temperature;
  if (a.mode === 'batch') {
    return a.batchPrompts
      .map((p, idx) => ({ p: p.trim(), idx }))
      .filter((x) => x.p.length > 0)
      .map((x) => ({
        payload: {
          prompt: x.p,
          model: a.batchModel,
          systemPrompt: sys,
          temperature: temp,
          clientId: `batch-${x.idx}`,
        },
        label: `#${x.idx + 1} (${a.batchModel})`,
      }));
  }
  if (a.mode === 'multi-model') {
    if (!a.multiModelPrompt.trim()) return [];
    return a.multiModelChoices.map((m) => ({
      payload: {
        prompt: a.multiModelPrompt,
        model: m,
        systemPrompt: sys,
        temperature: temp,
        clientId: `model-${m}`,
      },
      label: `모델: ${m}`,
    }));
  }
  if (a.mode === 'multi-sample') {
    if (!a.samplePrompt.trim()) return [];
    return Array.from({ length: a.sampleN }, (_, idx) => ({
      payload: {
        prompt: a.samplePrompt,
        model: a.sampleModel,
        systemPrompt: sys,
        temperature: temp,
        clientId: `sample-${idx}`,
      },
      label: `샘플 #${idx + 1}`,
    }));
  }
  return [];
};

const SingleResultCard = ({ entry }: { entry: SingleResultEntry }) => {
  const r = entry.result;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">결과</CardTitle>
      </CardHeader>
      <CardContent>
        {r.ok ? (
          <ResultBody
            text={r.text}
            meta={`${r.model} · ${r.durationMs}ms · 토큰 ${r.tokens.promptTokens ?? '?'}→${r.tokens.completionTokens ?? '?'}`}
          />
        ) : (
          <ErrorBody error={r.error} message={r.message} />
        )}
      </CardContent>
    </Card>
  );
};

const BatchResultsHeader = ({
  totalMs,
  count,
}: {
  totalMs: number | null;
  count: number;
}) => (
  <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
    <span>{count}개 결과</span>
    {totalMs !== null && <span>전체 {totalMs}ms (병렬 합산 시간이 아닌 실제 경과)</span>}
  </div>
);

const BatchResultCard = ({ entry }: { entry: BatchResultEntry }) => {
  const r = entry.result;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          {r.ok ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : (
            <AlertCircle className="size-4 text-destructive" />
          )}
          {entry.label}
          {r.ok && <Badge variant="secondary">{r.durationMs}ms</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {r.ok ? (
          <ResultBody
            text={r.text}
            meta={`${r.model} · 토큰 ${r.tokens.promptTokens ?? '?'}→${r.tokens.completionTokens ?? '?'}`}
          />
        ) : (
          <ErrorBody error={r.error} message={r.message} />
        )}
      </CardContent>
    </Card>
  );
};

const ResultBody = ({ text, meta }: { text: string; meta: string }) => (
  <div>
    <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/30 p-3 text-sm">{text}</pre>
    <p className="mt-2 text-xs text-muted-foreground">{meta}</p>
  </div>
);

const ErrorBody = ({ error, message }: { error: string; message: string }) => (
  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
    <strong>{error}</strong> — {message}
  </div>
);
