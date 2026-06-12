import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, Save, XCircle } from 'lucide-react';
import { ApiError, useLogConfig, useUpdateLogConfig } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';

export const AdminLogSettingsPage = () => {
  const config = useLogConfig();
  const updateConfig = useUpdateLogConfig();

  // 입력 중간값(빈 문자열 등)을 허용하기 위해 문자열로 들고, 제출 시 검증한다.
  const [retentionDays, setRetentionDays] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  // 저장 후 invalidate 로 다시 받아온 서버 값과 폼을 동기화.
  useEffect(() => {
    if (config.data) setRetentionDays(String(config.data.retentionDays));
  }, [config.data]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveError(null);
    setSaveOk(false);
    const days = Number(retentionDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setSaveError('보존 기간은 1~365 사이의 정수여야 합니다.');
      return;
    }
    try {
      await updateConfig.mutateAsync({ retentionDays: days });
      setSaveOk(true);
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : '저장 실패');
    }
  };

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        작업 로그의 보존 기간을 관리합니다. 기간이 지난 실행 이력과 스텝 로그는 매일 04시에
        자동으로 정리됩니다.
      </p>

      {config.isLoading && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
      {config.isError && (
        <p className="text-sm text-destructive">
          설정을 불러오지 못했습니다: {(config.error as Error).message}
        </p>
      )}

      {config.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">로그 보존 기간</CardTitle>
            <CardDescription>
              실패 분석 보고서가 있는 실행은 보존 기간과 무관하게 유지됩니다 (스텝 로그만 정리).
              진행 중인 실행도 정리 대상에서 제외됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              <Field label="보존 기간 (일 · 1~365)">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={retentionDays}
                  onChange={(e) => {
                    setRetentionDays(e.target.value);
                    setSaveOk(false);
                  }}
                />
              </Field>

              <div className="sm:col-span-2 flex items-center gap-3">
                <Button type="submit" disabled={updateConfig.isPending}>
                  {updateConfig.isPending ? <Loader2 className="animate-spin" /> : <Save />}
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
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
    <span>{label}</span>
    {children}
  </label>
);
