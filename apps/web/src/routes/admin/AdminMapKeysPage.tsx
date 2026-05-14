import { useEffect, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Loader2,
  PlugZap,
  Save,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  ApiError,
  useDeleteMapProvider,
  useMapProviders,
  useUpdateMapProvider,
} from '@repo/shared';
import type {
  MapProviderConfigType,
  MapProviderIdType,
  UpdateMapProviderInputType,
} from '@repo/api-contract';
import { probeVworldKey } from '@repo/utils';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';

interface FormState {
  apiKey: string;
  domains: string;
}

const toFormState = (p: MapProviderConfigType): FormState => ({
  apiKey: '',
  domains: p.domains ?? '',
});

const buildUpdateInput = (
  form: FormState,
  original: MapProviderConfigType,
): UpdateMapProviderInputType => {
  const out: UpdateMapProviderInputType = {};
  if (form.apiKey.length > 0) out.apiKey = form.apiKey;
  if (form.domains !== (original.domains ?? '')) {
    out.domains = form.domains.length > 0 ? form.domains : null;
  }
  return out;
};

export const AdminMapKeysPage = () => {
  const providers = useMapProviders();
  const updateProvider = useUpdateMapProvider();
  const deleteProvider = useDeleteMapProvider();

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        지도 타일 서비스 키를 등록합니다. vworld WMTS 를 OpenLayers 로 직접
        호출하므로 도메인 화이트리스트 검증 없이 어떤 origin 에서도 동작합니다.
      </p>

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
              updateProvider.mutateAsync({ id: p.provider as MapProviderIdType, input })
            }
            isSaving={updateProvider.isPending}
            onDelete={() => deleteProvider.mutateAsync(p.provider as MapProviderIdType)}
            isDeleting={deleteProvider.isPending}
          />
        ))}
      </div>
    </div>
  );
};

interface ProviderCardProps {
  provider: MapProviderConfigType;
  onSave: (input: UpdateMapProviderInputType) => Promise<unknown>;
  isSaving: boolean;
  onDelete: () => Promise<unknown>;
  isDeleting: boolean;
}

interface TestResult {
  ok: boolean;
  message: string;
}

const ProviderCard = ({
  provider,
  onSave,
  isSaving,
  onDelete,
  isDeleting,
}: ProviderCardProps) => {
  const [form, setForm] = useState<FormState>(() => toFormState(provider));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

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

  // 연결 테스트 — 입력 폼에 키가 있으면 그 값으로, 없으면 입력 후 저장하라
  // 안내. WMTS 타일 한 장을 fetch 해서 image/* 응답이 오면 OK.
  const handleTest = async () => {
    setTestResult(null);
    setTesting(true);
    try {
      const key = form.apiKey.trim();
      if (!key) {
        setTestResult({
          ok: false,
          message: '입력 폼에 키를 넣고 테스트하거나, 저장한 뒤 식당 상세에서 지도를 확인해 주세요.',
        });
        return;
      }
      const ok = await probeVworldKey(key);
      setTestResult(
        ok
          ? { ok: true, message: '타일 응답 OK — 키가 유효합니다.' }
          : {
              ok: false,
              message: '타일 응답이 이미지가 아닙니다. 키가 거부됐거나 네트워크가 차단됐을 가능성.',
            },
      );
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : '연결 테스트 실패',
      });
    } finally {
      setTesting(false);
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
            </CardTitle>
            <CardDescription>
              {provider.apiKeyMasked ?? '설정된 키가 없습니다.'} ·{' '}
              {provider.updatedAt
                ? `수정 ${new Date(provider.updatedAt).toLocaleString('ko-KR')}`
                : '등록되지 않음'}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>
              {testing ? <Loader2 className="animate-spin" /> : <PlugZap />}
              연결 테스트
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (
                  !window.confirm(
                    '이 provider의 키를 삭제합니다. 식당 상세 페이지의 지도가 동작하지 않게 됩니다.\n\n계속하시겠습니까?',
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
              title={provider.updatedAt ? '키를 삭제합니다' : '삭제할 키가 없습니다'}
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
              placeholder="vworld JavaScript API 키"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            />
          </Field>
          <Field label="허용 도메인 메모 (콤마 구분)">
            <Input
              type="text"
              placeholder="localhost:5173, life-pickr.com"
              value={form.domains}
              onChange={(e) => setForm({ ...form, domains: e.target.value })}
            />
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

        {testResult && (
          <div
            className={`mt-4 rounded-md border p-3 text-sm ${
              testResult.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-destructive/30 bg-destructive/5 text-destructive'
            }`}
          >
            {testResult.message}
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
