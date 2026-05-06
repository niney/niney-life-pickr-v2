import { useEffect, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  PlugZap,
  Save,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  ApiError,
  useDeleteProvider,
  useProviderModels,
  useProviders,
  useTestProvider,
  useUpdateProvider,
} from '@repo/shared';
import type {
  LlmProviderConfigType,
  LlmProviderIdType,
  TestLlmProviderResultType,
  UpdateLlmProviderInputType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';

interface FormState {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  enabled: boolean;
  maxConcurrent: number;
}

const toFormState = (p: LlmProviderConfigType): FormState => ({
  apiKey: '',
  baseUrl: p.baseUrl ?? '',
  defaultModel: p.defaultModel ?? '',
  enabled: p.enabled,
  maxConcurrent: p.maxConcurrent,
});

const buildUpdateInput = (form: FormState, original: LlmProviderConfigType): UpdateLlmProviderInputType => {
  const out: UpdateLlmProviderInputType = {};
  if (form.apiKey.length > 0) out.apiKey = form.apiKey;
  if (form.baseUrl !== (original.baseUrl ?? '')) {
    out.baseUrl = form.baseUrl.length > 0 ? form.baseUrl : null;
  }
  if (form.defaultModel !== (original.defaultModel ?? '')) {
    out.defaultModel = form.defaultModel.length > 0 ? form.defaultModel : null;
  }
  if (form.enabled !== original.enabled) out.enabled = form.enabled;
  if (form.maxConcurrent !== original.maxConcurrent) out.maxConcurrent = form.maxConcurrent;
  return out;
};

export const AdminAiKeysPage = () => {
  const providers = useProviders();
  const updateProvider = useUpdateProvider();
  const deleteProvider = useDeleteProvider();
  const testProvider = useTestProvider();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <KeyRound className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI 키</h1>
          <p className="text-sm text-muted-foreground">LLM 제공자별 API 키와 동시성 설정을 관리합니다.</p>
        </div>
      </header>

      {providers.isLoading && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
      {providers.isError && (
        <p className="text-sm text-destructive">
          목록을 불러오지 못했습니다: {(providers.error as Error).message}
        </p>
      )}

      <div className="space-y-4">
        {providers.data?.providers.map((p) => (
          <ProviderCard
            key={p.provider}
            provider={p}
            onSave={(input) =>
              updateProvider.mutateAsync({ id: p.provider as LlmProviderIdType, input })
            }
            isSaving={updateProvider.isPending}
            onTest={(model) =>
              testProvider.mutateAsync({ id: p.provider as LlmProviderIdType, model })
            }
            isTesting={testProvider.isPending}
            onDelete={() => deleteProvider.mutateAsync(p.provider as LlmProviderIdType)}
            isDeleting={deleteProvider.isPending}
          />
        ))}
      </div>
    </div>
  );
};

interface ProviderCardProps {
  provider: LlmProviderConfigType;
  onSave: (input: UpdateLlmProviderInputType) => Promise<unknown>;
  isSaving: boolean;
  onTest: (model?: string) => Promise<TestLlmProviderResultType>;
  isTesting: boolean;
  onDelete: () => Promise<unknown>;
  isDeleting: boolean;
}

const ProviderCard = ({
  provider,
  onSave,
  isSaving,
  onTest,
  isTesting,
  onDelete,
  isDeleting,
}: ProviderCardProps) => {
  const [form, setForm] = useState<FormState>(() => toFormState(provider));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<TestLlmProviderResultType | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const models = useProviderModels(provider.provider as LlmProviderIdType, provider.hasApiKey);
  const modelOptions = models.data?.models ?? [];
  const datalistId = `models-${provider.provider}`;

  // Reset form when the underlying provider changes (e.g., after save reload).
  useEffect(() => {
    setForm(toFormState(provider));
  }, [provider]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveError(null);
    setSaveOk(false);
    const input = buildUpdateInput(form, provider);
    if (Object.keys(input).length === 0) {
      setSaveError('변경 사항이 없습니다.');
      return;
    }
    try {
      await onSave(input);
      setForm((prev) => ({ ...prev, apiKey: '' }));
      setSaveOk(true);
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : '저장 실패');
    }
  };

  const handleTest = async () => {
    setTestError(null);
    setTestResult(null);
    try {
      // Use the form's defaultModel — the user's current edit, even if not
      // saved yet — so they can verify a model id before committing.
      const model = form.defaultModel.trim() || undefined;
      const r = await onTest(model);
      setTestResult(r);
    } catch (e) {
      setTestError(e instanceof ApiError ? e.message : '테스트 실패');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              {provider.provider}
              <Badge variant={provider.hasApiKey ? 'default' : 'secondary'}>
                {provider.hasApiKey ? '키 설정됨' : '키 없음'}
              </Badge>
              {!provider.enabled && <Badge variant="secondary">비활성</Badge>}
            </CardTitle>
            <CardDescription>
              {provider.apiKeyMasked ?? '설정된 키가 없습니다.'} ·{' '}
              {provider.updatedAt
                ? `수정 ${new Date(provider.updatedAt).toLocaleString('ko-KR')}`
                : '환경변수 기본값'}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={handleTest} disabled={isTesting}>
              {isTesting ? <Loader2 className="animate-spin" /> : <PlugZap />}
              연결 테스트
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (
                  !window.confirm(
                    '이 provider의 DB 설정을 삭제합니다. (.env에 키가 있다면 그 값으로 fallback)\n\n계속하시겠습니까?',
                  )
                ) {
                  return;
                }
                try {
                  await onDelete();
                } catch (e) {
                  setSaveError(e instanceof ApiError ? e.message : '삭제 실패');
                }
              }}
              disabled={isDeleting || !provider.updatedAt}
              title={
                provider.updatedAt
                  ? 'DB의 provider 설정을 삭제합니다'
                  : '삭제할 DB 설정이 없습니다 (env-backed)'
              }
            >
              {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              키 삭제
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <Field label="API 키 (입력 시에만 변경)">
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="sk-..."
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            />
          </Field>
          <Field label="Base URL">
            <Input
              type="url"
              placeholder="https://ollama.com"
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            />
          </Field>
          <Field
            label={`기본 모델 (선택)${
              modelOptions.length > 0 ? ` · ${modelOptions.length}개 사용 가능` : ''
            }`}
          >
            <Input
              type="text"
              placeholder="gpt-oss:20b"
              list={datalistId}
              value={form.defaultModel}
              onChange={(e) => setForm({ ...form, defaultModel: e.target.value })}
            />
            <datalist id={datalistId}>
              {modelOptions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <Field label="동시 요청 한도">
            <Input
              type="number"
              min={1}
              max={100}
              value={form.maxConcurrent}
              onChange={(e) => setForm({ ...form, maxConcurrent: Number(e.target.value) })}
            />
          </Field>
          <Field label="활성화">
            <label className="flex h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              />
              <span>{form.enabled ? '활성' : '비활성'}</span>
            </label>
          </Field>

          <div className="sm:col-span-2 flex items-center gap-3">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
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

        {(testResult || testError) && (
          <div
            className={`mt-4 rounded-md border p-3 text-sm ${
              testResult?.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-destructive/30 bg-destructive/5 text-destructive'
            }`}
          >
            {testError && <span>{testError}</span>}
            {testResult?.ok && (
              <div>
                <div className="font-medium">연결 OK · {testResult.model} · {testResult.durationMs}ms</div>
                <div className="mt-1 text-xs opacity-80">샘플: {testResult.sample}</div>
              </div>
            )}
            {testResult && !testResult.ok && (
              <span>
                <strong>{testResult.error}</strong> — {testResult.message}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
    <span>{label}</span>
    {children}
  </label>
);
