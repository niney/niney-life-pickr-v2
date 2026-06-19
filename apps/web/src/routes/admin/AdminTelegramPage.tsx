import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  CheckCircle2,
  Loader2,
  PlugZap,
  Save,
  Search,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  ApiError,
  useDeleteTelegramConfig,
  useResolveTelegramChatId,
  useTelegramConfig,
  useTestTelegram,
  useUpdateTelegramConfig,
} from '@repo/shared';
import type {
  TelegramConfigType,
  UpdateTelegramConfigInputType,
} from '@repo/api-contract';
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

const SOURCE_LABEL: Record<TelegramConfigType['source'], string> = {
  db: 'DB 저장됨',
  env: '.env 사용 중',
  none: '미설정',
};

const buildUpdateInput = (
  botToken: string,
  chatId: string,
  config: TelegramConfigType,
): UpdateTelegramConfigInputType => {
  const out: UpdateTelegramConfigInputType = {};
  if (botToken.trim().length > 0) out.botToken = botToken.trim();
  const cur = config.chatId ?? '';
  const next = chatId.trim();
  if (next !== cur) out.chatId = next.length > 0 ? next : null;
  return out;
};

export const AdminTelegramPage = () => {
  const config = useTelegramConfig();
  const update = useUpdateTelegramConfig();
  const remove = useDeleteTelegramConfig();
  const test = useTestTelegram();
  const resolve = useResolveTelegramChatId();

  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  // config 로드/변경 시 chatId 입력 동기화 (토큰은 항상 빈칸 — 입력 시에만 변경).
  useEffect(() => {
    if (config.data) setChatId(config.data.chatId ?? '');
  }, [config.data?.chatId, config.data?.updatedAt]);

  const cfg = config.data;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveError(null);
    setSaveOk(false);
    if (!cfg) return;
    const input = buildUpdateInput(botToken, chatId, cfg);
    if (Object.keys(input).length === 0) {
      setSaveError('변경 사항이 없습니다.');
      return;
    }
    try {
      await update.mutateAsync(input);
      setBotToken('');
      setSaveOk(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : '저장 실패');
    }
  };

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        맛집 자동 발굴이 후보를 보내고 사용자가 버튼으로 고른 가게를 크롤하는 데 쓰는
        텔레그램 봇 설정입니다. 저장하면 서버 재시작 없이 즉시 적용됩니다. DB에 저장된
        값이 우선이며, 비워두면 <code>.env</code>의 <code>TELEGRAM_*</code> 값으로
        동작합니다.
      </p>

      {config.isLoading && (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      )}
      {config.isError && (
        <p className="text-sm text-destructive">
          설정을 불러오지 못했습니다: {(config.error as Error).message}
        </p>
      )}

      {cfg && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Send className="size-4" />
                  텔레그램 봇
                  <Badge variant={cfg.configured ? 'default' : 'secondary'}>
                    {cfg.configured ? '전송 가능' : '미완성'}
                  </Badge>
                  <Badge variant="secondary">{SOURCE_LABEL[cfg.source]}</Badge>
                </CardTitle>
                <CardDescription>
                  토큰 {cfg.tokenMasked ?? '없음'} · chat id {cfg.chatId ?? '없음'} ·{' '}
                  {cfg.updatedAt
                    ? `수정 ${new Date(cfg.updatedAt).toLocaleString('ko-KR')}`
                    : 'DB 미저장(env)'}
                </CardDescription>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => test.mutate()}
                  disabled={test.isPending || !cfg.configured}
                  title={cfg.configured ? '저장된 설정으로 테스트' : '토큰/chat id 를 먼저 저장하세요'}
                >
                  {test.isPending ? <Loader2 className="animate-spin" /> : <PlugZap />}
                  연결 테스트
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        'DB에 저장된 텔레그램 설정을 삭제합니다.\n(.env에 값이 있으면 그 값으로 fallback)\n\n계속하시겠습니까?',
                      )
                    ) {
                      return;
                    }
                    setSaveError(null);
                    try {
                      await remove.mutateAsync();
                      setBotToken('');
                    } catch (err) {
                      setSaveError(err instanceof ApiError ? err.message : '삭제 실패');
                    }
                  }}
                  disabled={remove.isPending || cfg.source !== 'db'}
                  title={cfg.source === 'db' ? 'DB 설정을 삭제합니다' : '삭제할 DB 설정이 없습니다 (env-backed)'}
                >
                  {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  DB 설정 삭제
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              <Field label="봇 토큰 (입력 시에만 변경)">
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="@BotFather 토큰 (예: 8012345678:AAH…)"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                />
              </Field>
              <Field label="Chat ID">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="예: 5225552967 (개인) / -100… (그룹)"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => resolve.mutate()}
                    disabled={resolve.isPending}
                    title="봇에게 메시지를 보낸 뒤 누르면 chat id 를 찾아줍니다"
                  >
                    {resolve.isPending ? <Loader2 className="animate-spin" /> : <Search />}
                    찾기
                  </Button>
                </div>
              </Field>

              <div className="sm:col-span-2 flex items-center gap-3">
                <Button type="submit" disabled={update.isPending}>
                  {update.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                  저장
                </Button>
                {saveOk && (
                  <span className="flex items-center gap-1 text-sm text-emerald-600">
                    <CheckCircle2 className="size-4" /> 저장됨 — 즉시 적용
                  </span>
                )}
                {saveError && (
                  <span className="flex items-center gap-1 text-sm text-destructive">
                    <XCircle className="size-4" /> {saveError}
                  </span>
                )}
              </div>
            </form>

            {/* chat_id 자동 찾기 결과 */}
            {resolve.isPending && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                지금 텔레그램에서 봇에게 아무 메시지나 보내세요. 최대 25초간 기다립니다…
              </div>
            )}
            {resolve.data && !resolve.isPending && (
              <div className="mt-4 rounded-md border p-3 text-sm">
                {resolve.data.candidates.length === 0 ? (
                  <span className="text-muted-foreground">
                    받은 메시지가 없습니다. 봇에게 먼저 메시지를 보낸 뒤 다시 [찾기]를
                    누르세요. (@userinfobot 으로도 본인 id 확인 가능)
                  </span>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      발견된 chat — 클릭하면 입력칸에 채워집니다.
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {resolve.data.candidates.map((c) => (
                        <button
                          key={c.chatId}
                          type="button"
                          onClick={() => setChatId(c.chatId)}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
                        >
                          <span className="font-mono">{c.chatId}</span>
                          {c.name ? ` · ${c.name}` : ''} · {c.type}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 연결 테스트 결과 */}
            {test.data && (
              <div
                className={`mt-4 rounded-md border p-3 text-sm ${
                  test.data.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                    : 'border-destructive/30 bg-destructive/5 text-destructive'
                }`}
              >
                {test.data.ok ? (
                  <span>
                    ✅ 정상 — 봇 @{test.data.botUsername} → {test.data.chatLabel ?? 'chat'} 로
                    테스트 메시지를 보냈습니다. 텔레그램을 확인하세요.
                  </span>
                ) : (
                  <span>
                    ⚠️ 실패{test.data.botOk ? ' (봇 OK' : ' (봇 실패'}
                    {test.data.botOk && (test.data.chatOk ? ', chat OK)' : ', chat 실패)')}
                    {test.data.error ? ` — ${test.data.error}` : ''}
                  </span>
                )}
              </div>
            )}
            {test.isError && (
              <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                테스트 호출 실패: {(test.error as Error).message}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
    <span>{label}</span>
    {children}
  </label>
);
