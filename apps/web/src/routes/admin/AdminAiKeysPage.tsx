import { useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Image as ImageIcon,
  KeyRound,
  List,
  Loader2,
  MessageSquare,
  PlugZap,
  RefreshCw,
  Save,
  ScrollText,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  ApiError,
  useDeleteProvider,
  usePreviewModels,
  useProviderModels,
  useProviders,
  useTestProvider,
  useUpdateProvider,
} from '@repo/shared';
import type {
  LlmProviderConfigType,
  LlmProviderPurposeType,
  TestLlmProviderResultType,
  UpdateLlmProviderInputType,
} from '@repo/api-contract';
import { recommendModelForPurpose } from '@repo/utils';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { ModelPickerPopup } from '~/components/restaurant/detail/ModelPickerPopup';

// 계정(키)은 chat 용도 row 에 둔다 — image·log-analysis 는 키 없이 이 키를
// 상속한다. 따라서 위쪽 "AI 계정" 카드가 chat row 의 키/URL/동시성을 편집하고,
// 아래쪽 "용도별 모델" 섹션이 각 용도의 모델만 고른다.
const ACCOUNT_PURPOSE: LlmProviderPurposeType = 'chat';

const PURPOSE_ORDER: LlmProviderPurposeType[] = ['chat', 'image', 'log-analysis'];

interface PurposeMeta {
  icon: typeof MessageSquare;
  label: string;
  desc: string;
  placeholder: string;
}

const PURPOSE_META: Record<LlmProviderPurposeType, PurposeMeta> = {
  chat: {
    icon: MessageSquare,
    label: '텍스트',
    desc: '리뷰 요약·메뉴 그룹핑 등 텍스트 추론',
    placeholder: 'gpt-oss:20b',
  },
  image: {
    icon: ImageIcon,
    label: '이미지',
    desc: '영수증 추출 등 이미지(vision) 입력',
    placeholder: 'llama3.2-vision',
  },
  'log-analysis': {
    icon: ScrollText,
    label: '로그 분석',
    desc: '실패한 작업의 원인 분석·보고서',
    placeholder: 'gpt-oss:120b',
  },
};

export const AdminAiKeysPage = () => {
  const providers = useProviders();
  const updateProvider = useUpdateProvider();
  const deleteProvider = useDeleteProvider();
  const testProvider = useTestProvider();
  const previewModels = usePreviewModels();

  const list = providers.data?.providers ?? [];
  const account = list.find((p) => p.purpose === ACCOUNT_PURPOSE) ?? null;
  const purposeRows = PURPOSE_ORDER.map((purpose) => list.find((p) => p.purpose === purpose)).filter(
    (p): p is LlmProviderConfigType => Boolean(p),
  );

  // 저장된 계정 키로 카탈로그를 한 번 받아 모든 용도가 공유한다 (chat 기준 —
  // 키는 전 용도 공통). "모델 불러오기"로 입력 중인 키를 검증하면 그 결과가
  // 우선한다.
  const autoModels = useProviderModels(
    { id: 'ollama-cloud', purpose: ACCOUNT_PURPOSE },
    account?.hasApiKey ?? false,
  );
  const [previewedCatalog, setPreviewedCatalog] = useState<string[] | null>(null);
  // 안정 참조 — 모델 선택 팝업의 useMemo 의존성으로 흘러간다.
  const catalog = useMemo(
    () => previewedCatalog ?? autoModels.data?.models ?? [],
    [previewedCatalog, autoModels.data?.models],
  );

  // 입력 키가 있으면 그 키로 검증(preview), 없으면 저장된 키 카탈로그를 갱신.
  const loadModels = async (
    apiKey: string,
    baseUrl: string,
  ): Promise<{ ok: true; count: number } | { ok: false; message: string }> => {
    if (apiKey.trim()) {
      const r = await previewModels.mutateAsync({
        key: { id: 'ollama-cloud', purpose: ACCOUNT_PURPOSE },
        input: { apiKey: apiKey.trim(), baseUrl: baseUrl.trim() || undefined },
      });
      if (r.ok) {
        setPreviewedCatalog(r.models);
        return { ok: true, count: r.models.length };
      }
      return { ok: false, message: r.message };
    }
    setPreviewedCatalog(null);
    const res = await autoModels.refetch();
    return { ok: true, count: res.data?.models.length ?? 0 };
  };

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        키는 <strong>한 번만</strong> 입력하면 됩니다. 위 <strong>AI 계정</strong>에 키를 넣으면
        텍스트·이미지·로그 분석 용도가 모두 그 키를 공유하고, 아래에서는 용도별 <strong>모델</strong>만
        고르면 됩니다.
      </p>

      {providers.isLoading && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
      {providers.isError && (
        <p className="text-sm text-destructive">
          목록을 불러오지 못했습니다: {(providers.error as Error).message}
        </p>
      )}

      {account && (
        <AccountCard
          key={`account:${account.updatedAt ?? 'env'}:${account.apiKeyMasked ?? ''}`}
          account={account}
          catalogCount={catalog.length}
          onSave={(input) =>
            updateProvider.mutateAsync({ key: { id: 'ollama-cloud', purpose: ACCOUNT_PURPOSE }, input })
          }
          isSaving={updateProvider.isPending}
          onTest={(model) =>
            testProvider.mutateAsync({ key: { id: 'ollama-cloud', purpose: ACCOUNT_PURPOSE }, model })
          }
          isTesting={testProvider.isPending}
          onDelete={() =>
            deleteProvider.mutateAsync({ id: 'ollama-cloud', purpose: ACCOUNT_PURPOSE })
          }
          isDeleting={deleteProvider.isPending}
          onLoadModels={loadModels}
          isLoadingModels={previewModels.isPending || autoModels.isFetching}
        />
      )}

      {purposeRows.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-1 text-sm font-medium">용도별 모델</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            각 용도에 쓸 모델을 고릅니다. 키는 위 계정에서 상속됩니다. 비워 두면{' '}
            <code>.env</code>의 <code>OLLAMA_*_MODEL</code> 기본값을 쓰고, 그마저 없으면 해당 용도는
            건너뜁니다.
          </p>
          <div className="space-y-3">
            {purposeRows.map((p) => (
              <PurposeModelRow
                key={`${p.purpose}:${p.defaultModel ?? ''}:${p.enabled ? 1 : 0}:${p.updatedAt ?? ''}`}
                provider={p}
                catalog={catalog}
                onSave={(input) =>
                  updateProvider.mutateAsync({ key: { id: 'ollama-cloud', purpose: p.purpose }, input })
                }
                isSaving={updateProvider.isPending}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// --- AI 계정 카드 ---------------------------------------------------------

interface AccountFormState {
  apiKey: string;
  baseUrl: string;
  maxConcurrent: number;
}

interface AccountCardProps {
  account: LlmProviderConfigType;
  catalogCount: number;
  onSave: (input: UpdateLlmProviderInputType) => Promise<unknown>;
  isSaving: boolean;
  onTest: (model?: string) => Promise<TestLlmProviderResultType>;
  isTesting: boolean;
  onDelete: () => Promise<unknown>;
  isDeleting: boolean;
  onLoadModels: (
    apiKey: string,
    baseUrl: string,
  ) => Promise<{ ok: true; count: number } | { ok: false; message: string }>;
  isLoadingModels: boolean;
}

const AccountCard = ({
  account,
  catalogCount,
  onSave,
  isSaving,
  onTest,
  isTesting,
  onDelete,
  isDeleting,
  onLoadModels,
  isLoadingModels,
}: AccountCardProps) => {
  const [form, setForm] = useState<AccountFormState>({
    apiKey: '',
    baseUrl: account.baseUrl ?? '',
    maxConcurrent: account.maxConcurrent,
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [loadMsg, setLoadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testResult, setTestResult] = useState<TestLlmProviderResultType | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const buildInput = (): UpdateLlmProviderInputType => {
    const out: UpdateLlmProviderInputType = {};
    if (form.apiKey.length > 0) out.apiKey = form.apiKey;
    if (form.baseUrl !== (account.baseUrl ?? '')) {
      out.baseUrl = form.baseUrl.length > 0 ? form.baseUrl : null;
    }
    if (form.maxConcurrent !== account.maxConcurrent) out.maxConcurrent = form.maxConcurrent;
    return out;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveError(null);
    setSaveOk(false);
    const input = buildInput();
    if (Object.keys(input).length === 0) {
      setSaveError('변경 사항이 없습니다.');
      return;
    }
    try {
      await onSave(input);
      setSaveOk(true);
      // 저장 성공 시 account.updatedAt 이 바뀌어 key 가 갱신되고 카드가
      // 재마운트되므로 폼은 자동으로 초기화된다 (apiKey 비워짐).
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : '저장 실패');
    }
  };

  const handleLoad = async () => {
    setLoadMsg(null);
    try {
      const r = await onLoadModels(form.apiKey, form.baseUrl);
      setLoadMsg(
        r.ok ? { ok: true, text: `모델 ${r.count}개를 불러왔습니다.` } : { ok: false, text: r.message },
      );
    } catch (err) {
      setLoadMsg({ ok: false, text: err instanceof ApiError ? err.message : '불러오기 실패' });
    }
  };

  const handleTest = async () => {
    setTestError(null);
    setTestResult(null);
    try {
      const model = account.defaultModel?.trim() || undefined;
      const r = await onTest(model);
      setTestResult(r);
    } catch (err) {
      setTestError(err instanceof ApiError ? err.message : '테스트 실패');
    }
  };

  const canLoad = form.apiKey.trim().length > 0 || account.hasApiKey;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg">
              <KeyRound className="size-5 shrink-0" />
              <span>AI 계정</span>
              <Badge variant="outline" className="whitespace-nowrap">
                {account.provider}
              </Badge>
              <Badge
                variant={account.hasApiKey ? 'default' : 'secondary'}
                className="whitespace-nowrap"
              >
                {account.hasApiKey ? '키 설정됨' : '키 없음'}
              </Badge>
              {account.keySource === 'env' && (
                <Badge variant="secondary" className="whitespace-nowrap">
                  .env 사용 중
                </Badge>
              )}
              {account.keySource === 'own' && (
                <Badge variant="secondary" className="whitespace-nowrap">
                  DB 저장됨
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1 break-words">
              이 키를 모든 용도가 공유합니다.{' · '}
              {account.apiKeyMasked ?? '설정된 키가 없습니다.'}
              {' · '}
              {account.updatedAt
                ? `수정 ${new Date(account.updatedAt).toLocaleString('ko-KR')}`
                : '환경변수 기본값'}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 sm:shrink-0 sm:flex-nowrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={handleTest}
              disabled={isTesting || !account.hasApiKey}
              title={account.hasApiKey ? '저장된 키로 연결을 확인합니다' : '키를 먼저 저장하세요'}
            >
              {isTesting ? <Loader2 className="animate-spin" /> : <PlugZap />}
              연결 테스트
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={async () => {
                if (
                  !window.confirm(
                    '계정 키(DB 설정)를 삭제합니다. (.env에 키가 있다면 그 값으로 fallback)\n\n계속하시겠습니까?',
                  )
                ) {
                  return;
                }
                try {
                  await onDelete();
                } catch (err) {
                  setSaveError(err instanceof ApiError ? err.message : '삭제 실패');
                }
              }}
              disabled={isDeleting || !account.updatedAt}
              title={
                account.updatedAt ? '계정 키 DB 설정을 삭제합니다' : '삭제할 DB 설정이 없습니다 (env-backed)'
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
            <div className="flex gap-2">
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="sk-..."
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleLoad}
                disabled={!canLoad || isLoadingModels}
                title={
                  form.apiKey.trim()
                    ? '입력한 키로 모델 목록을 확인합니다 (저장 안 함)'
                    : '저장된 키로 모델 목록을 새로 받아옵니다'
                }
                className="shrink-0"
              >
                {isLoadingModels ? (
                  <Loader2 className="animate-spin" />
                ) : form.apiKey.trim() ? (
                  <Sparkles />
                ) : (
                  <RefreshCw />
                )}
                <span className="hidden sm:inline">모델 불러오기</span>
              </Button>
            </div>
          </Field>
          <Field label="Base URL">
            <Input
              type="url"
              placeholder="https://ollama.com"
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            />
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
          <div className="flex items-end">
            <p className="text-xs text-muted-foreground">
              {catalogCount > 0
                ? `카탈로그 모델 ${catalogCount}개 · 아래 용도에서 선택`
                : '키 저장 후 “모델 불러오기”로 카탈로그를 받으세요.'}
            </p>
          </div>

          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
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
            {loadMsg && (
              <span
                className={`flex items-center gap-1 text-sm ${
                  loadMsg.ok ? 'text-emerald-600' : 'text-destructive'
                }`}
              >
                {loadMsg.ok ? <Sparkles className="size-4" /> : <XCircle className="size-4" />}
                {loadMsg.text}
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
                <div className="font-medium">
                  연결 OK · {testResult.model} · {testResult.durationMs}ms
                </div>
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

// --- 용도별 모델 행 -------------------------------------------------------

interface PurposeModelRowProps {
  provider: LlmProviderConfigType;
  catalog: string[];
  onSave: (input: UpdateLlmProviderInputType) => Promise<unknown>;
  isSaving: boolean;
}

const PurposeModelRow = ({ provider, catalog, onSave, isSaving }: PurposeModelRowProps) => {
  const purpose = provider.purpose;
  const meta = PURPOSE_META[purpose];
  const Icon = meta.icon;
  const savedModel = provider.defaultModel ?? '';
  const recommended = recommendModelForPurpose(purpose, catalog);

  // draft=null 이면 미편집 → 저장값(없으면 추천)을 표시한다. 추천은 카탈로그가
  // 늦게 와도 렌더 중 다시 계산되므로 useEffect 없이 자동 반영된다.
  const [draft, setDraft] = useState<string | null>(null);
  const [enabledDraft, setEnabledDraft] = useState<boolean | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const shownModel = draft ?? (savedModel || recommended || '');
  const shownEnabled = enabledDraft ?? provider.enabled;
  // 저장값이 없는데 추천으로 채워진 상태 — 사용자가 저장해야 확정된다.
  const isRecommendation = draft === null && !savedModel && Boolean(recommended);

  const modelDirty = shownModel !== savedModel;
  const enabledDirty = shownEnabled !== provider.enabled;
  const dirty = modelDirty || enabledDirty;

  const datalistId = `models-${purpose}`;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveError(null);
    setSaveOk(false);
    const input: UpdateLlmProviderInputType = {};
    if (modelDirty) input.defaultModel = shownModel.trim() ? shownModel.trim() : null;
    if (enabledDirty) input.enabled = shownEnabled;
    if (Object.keys(input).length === 0) return;
    try {
      await onSave(input);
      setSaveOk(true);
      // 저장 후 provider 가 갱신되며 key 가 바뀌어 행이 재마운트 → draft 리셋.
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : '저장 실패');
    }
  };

  return (
    <Card className={shownEnabled ? '' : 'opacity-70'}>
      <CardContent className="py-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-2 sm:w-44 sm:shrink-0">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                {meta.label}
                <KeySourceBadge keySource={provider.keySource} />
              </div>
              <div className="truncate text-xs text-muted-foreground">{meta.desc}</div>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder={meta.placeholder}
                list={datalistId}
                value={shownModel}
                onChange={(e) => setDraft(e.target.value)}
                className={`flex-1 ${isRecommendation ? 'border-primary/50' : ''}`}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setPickerOpen(true)}
                disabled={catalog.length === 0}
                title={catalog.length > 0 ? '목록에서 모델 선택' : '먼저 모델을 불러오세요'}
              >
                <List />
                <span className="hidden sm:inline">선택</span>
              </Button>
            </div>
            <datalist id={datalistId}>
              {catalog.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            {isRecommendation && (
              <p className="mt-1 text-[11px] text-primary">추천값 — 저장하면 적용됩니다</p>
            )}
            {provider.defaultModelSource === 'env' && !modelDirty && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                <code>.env</code> 기본 모델 — 저장하면 DB 값으로 고정됩니다.
              </p>
            )}
            {provider.keySource === 'none' && (
              <p className="mt-1 text-[11px] text-amber-600">
                위 AI 계정에 키를 먼저 입력해야 이 용도가 동작합니다.
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs sm:shrink-0">
            <input
              type="checkbox"
              className="size-4"
              checked={shownEnabled}
              onChange={(e) => setEnabledDraft(e.target.checked)}
            />
            <span>{shownEnabled ? '활성' : '비활성'}</span>
          </label>

          <div className="flex items-center gap-2 sm:shrink-0">
            <Button type="submit" size="sm" disabled={isSaving || !dirty}>
              {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
              저장
            </Button>
            {saveOk && <CheckCircle2 className="size-4 text-emerald-600" />}
            {saveError && (
              <span className="text-xs text-destructive">
                <XCircle className="inline size-3.5 align-text-bottom" /> {saveError}
              </span>
            )}
          </div>
        </form>

        <ModelPickerPopup
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={(m) => setDraft(m)}
          currentModel={shownModel || null}
          models={catalog}
          title={`${meta.label} 모델 선택`}
          description={`${meta.desc}에 쓸 모델을 고릅니다. 계열별로 묶여 있습니다.`}
          emptyHint={<>위 “AI 계정”에서 키를 저장한 뒤 “모델 불러오기”를 누르세요.</>}
        />
      </CardContent>
    </Card>
  );
};

const KeySourceBadge = ({ keySource }: { keySource: LlmProviderConfigType['keySource'] }) => {
  if (keySource === 'own') {
    return (
      <Badge variant="outline" className="text-[10px]">
        전용 키
      </Badge>
    );
  }
  if (keySource === 'inherited') {
    return (
      <Badge variant="secondary" className="text-[10px]">
        계정 키
      </Badge>
    );
  }
  if (keySource === 'none') {
    return (
      <Badge variant="secondary" className="text-[10px] text-amber-600">
        키 없음
      </Badge>
    );
  }
  // 'env' — chat 계정 자신이 환경변수 키로 동작.
  return null;
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
    <span>{label}</span>
    {children}
  </label>
);
