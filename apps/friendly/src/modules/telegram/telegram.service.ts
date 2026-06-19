import type { FastifyBaseLogger } from 'fastify';

// 텔레그램 봇 — long-polling(getUpdates) 수신 + sendMessage 송신.
// 단일 Fastify 인스턴스(CLAUDE.md no-Redis) 안에서 폴러 1개만 돈다(webhook 대신
// long-polling 을 골라 공개 HTTPS URL 노출 불필요). 봇 토큰/chat id 미설정이면
// 비활성(no-op) — 자동 발굴 회차는 후보를 못 보내 skip 된다.
//
// 이 서비스는 기능 중립적이다. 콜백(인라인 버튼 클릭)과 텍스트 커맨드를 받으면
// 등록된 핸들러로 넘길 뿐, random-crawl 을 직접 import 하지 않는다(순환 의존
// 회피). random-crawl 서비스가 onCallback/onMessage 로 핸들러를 건다. 텍스트
// 메시지는 설정된 chat 에서 온 것만(권한) + 60초 이내(staleness) 통과시킨다.

// 인라인 버튼 클릭 1건 — 핸들러가 받는 정규화 페이로드.
export interface TelegramCallback {
  callbackQueryId: string;
  chatId: string;
  messageId: number;
  // 버튼의 callback_data — 예: "rc:<runId>:3", "rc:<runId>:skip".
  data: string;
}

export type TelegramCallbackHandler = (cb: TelegramCallback) => Promise<void>;

// 사용자가 봇에 보낸 텍스트 메시지 1건 — 핸들러가 받는 정규화 페이로드.
// 권한(설정된 chat 인지)·staleness 는 서비스가 이미 걸러서 넘긴다.
export interface TelegramMessage {
  chatId: string;
  text: string;
}

export type TelegramMessageHandler = (m: TelegramMessage) => Promise<void>;

// 후보 1건을 버튼으로 — text 는 카드 한 줄, callbackData 는 64바이트 이내.
export interface TelegramButton {
  text: string;
  callbackData: string;
}

export interface SendCandidatesInput {
  text: string;
  // 각 행(row)당 버튼 배열 — 2차원이라 줄바꿈 제어 가능.
  buttons: TelegramButton[][];
}

const API_BASE = 'https://api.telegram.org';

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    date?: number; // unix seconds — 재시작 후 재전송된 옛 메시지 걸러내기용.
    text?: string;
    chat: { id: number; type?: string; first_name?: string; title?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
}

interface TgMessage {
  message_id: number;
  chat: { id: number };
}

export interface TelegramServiceOptions {
  botToken: string;
  // 후보를 보낼 기본 대상 chat id. 콜백은 메시지 단위로 매칭하므로 수신엔
  // 불필요하지만 송신엔 필요.
  chatId: string;
  logger?: FastifyBaseLogger;
}

export class TelegramService {
  private botToken: string;
  private chatId: string;
  private readonly logger?: FastifyBaseLogger;

  private handler: TelegramCallbackHandler | null = null;
  private msgHandler: TelegramMessageHandler | null = null;
  private polling = false;
  private offset = 0;
  private pollAbort: AbortController | null = null;
  // 폴링 세대 — reconfigure 로 폴러를 갈아끼울 때 옛 루프가 살아남지 않게 한다.
  private pollGen = 0;

  constructor(opts: TelegramServiceOptions) {
    this.botToken = opts.botToken.trim();
    this.chatId = opts.chatId.trim();
    this.logger = opts.logger;
  }

  // 토큰+chat id 가 모두 있어야 동작. UI 가 경고를 노출하는 근거.
  isConfigured(): boolean {
    return this.botToken.length > 0 && this.chatId.length > 0;
  }

  onCallback(handler: TelegramCallbackHandler): void {
    this.handler = handler;
  }

  // 텍스트 커맨드 핸들러 등록 — random-crawl 이 /discover 를 받기 위해 건다.
  onMessage(handler: TelegramMessageHandler): void {
    this.msgHandler = handler;
  }

  // ── 송신 ───────────────────────────────────────────────────────────

  // 후보 메시지 전송 → { chatId, messageId }. 실패/미설정이면 null.
  async sendCandidates(
    input: SendCandidatesInput,
  ): Promise<{ chatId: string; messageId: number } | null> {
    if (!this.isConfigured()) return null;
    const reply_markup = {
      inline_keyboard: input.buttons.map((row) =>
        row.map((b) => ({ text: b.text, callback_data: b.callbackData })),
      ),
    };
    const msg = await this.call<TgMessage>('sendMessage', {
      chat_id: this.chatId,
      text: input.text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup,
    });
    if (!msg) return null;
    return { chatId: String(msg.chat.id), messageId: msg.message_id };
  }

  // 평문 메시지 송신(버튼 없음) — 커맨드 응답/안내용. 미설정·실패는 no-op.
  async notify(text: string): Promise<void> {
    if (!this.isConfigured()) return;
    await this.call('sendMessage', {
      chat_id: this.chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  }

  // 콜백 응답(버튼 로딩 스피너 종료 + 토스트). 실패해도 흐름엔 영향 없음.
  async answerCallback(callbackQueryId: string, text?: string): Promise<void> {
    if (!this.isConfigured()) return;
    await this.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    });
  }

  // 선택/만료 후 메시지 본문을 갱신해 버튼을 치우고 결과를 보여준다.
  async editMessageText(
    chatId: string,
    messageId: number,
    text: string,
  ): Promise<void> {
    if (!this.isConfigured()) return;
    await this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  }

  // ── 설정 검증 / chat_id 탐색 (어드민 설정 화면용) ──────────────────

  // getMe — 토큰 유효성 확인.
  async verifyBot(): Promise<{ ok: boolean; username: string | null; error: string | null }> {
    if (!this.botToken) return { ok: false, username: null, error: '토큰이 없습니다.' };
    try {
      const res = await fetch(`${API_BASE}/bot${this.botToken}/getMe`);
      const json = (await res.json()) as TgResponse<{ username?: string }>;
      if (!json.ok) return { ok: false, username: null, error: json.description ?? 'getMe 실패' };
      return { ok: true, username: json.result?.username ?? null, error: null };
    } catch (e) {
      return { ok: false, username: null, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // getChat — chatId 도달 가능 여부 확인.
  async verifyChat(): Promise<{ ok: boolean; label: string | null; error: string | null }> {
    if (!this.botToken || !this.chatId) {
      return { ok: false, label: null, error: 'chat id 가 없습니다.' };
    }
    try {
      const res = await fetch(
        `${API_BASE}/bot${this.botToken}/getChat?chat_id=${encodeURIComponent(this.chatId)}`,
      );
      const json = (await res.json()) as TgResponse<{
        first_name?: string;
        last_name?: string;
        title?: string;
      }>;
      if (!json.ok) return { ok: false, label: null, error: json.description ?? 'getChat 실패' };
      const r = json.result ?? {};
      const label =
        r.title ?? ([r.first_name, r.last_name].filter(Boolean).join(' ') || null);
      return { ok: true, label, error: null };
    } catch (e) {
      return { ok: false, label: null, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // 실제 테스트 메시지 전송.
  async sendTestMessage(text: string): Promise<{ ok: boolean; error: string | null }> {
    if (!this.isConfigured()) return { ok: false, error: '토큰/chat id 미설정' };
    const msg = await this.call<TgMessage>('sendMessage', {
      chat_id: this.chatId,
      text,
      disable_web_page_preview: true,
    });
    return msg ? { ok: true, error: null } : { ok: false, error: '전송 실패' };
  }

  // chat_id 자동 탐색 — 폴러를 잠시 멈추고 message 롱폴(timeoutSec)로, 그 사이
  // 사용자가 봇에 보낸 메시지에서 chat 정보를 추린다. offset 을 커밋하지 않아
  // 콜백 폴러의 진행에는 영향이 없다.
  async resolveChatId(
    timeoutSec = 25,
  ): Promise<{ chatId: string; name: string; type: string }[]> {
    if (!this.botToken) return [];
    const wasPolling = this.polling;
    this.stopPolling();
    await sleep(300); // 진행 중이던 롱폴이 취소되도록 잠깐 양보.
    try {
      const url = `${API_BASE}/bot${this.botToken}/getUpdates?timeout=${timeoutSec}&allowed_updates=${encodeURIComponent('["message","callback_query"]')}`;
      const res = await fetch(url);
      const json = (await res.json()) as TgResponse<TgUpdate[]>;
      const out = new Map<number, { chatId: string; name: string; type: string }>();
      for (const u of json.result ?? []) {
        const m = u.message;
        if (m?.chat) {
          out.set(m.chat.id, {
            chatId: String(m.chat.id),
            name: m.chat.first_name ?? m.chat.title ?? '',
            type: m.chat.type ?? 'private',
          });
        }
      }
      return [...out.values()];
    } catch {
      return [];
    } finally {
      if (wasPolling) this.startPolling();
    }
  }

  // ── 수신(long-polling) ─────────────────────────────────────────────

  startPolling(): void {
    if (!this.isConfigured() || this.polling) return;
    this.polling = true;
    this.pollGen += 1;
    const gen = this.pollGen;
    this.logger?.info('[telegram] long-polling 시작');
    void this.loop(gen);
  }

  stopPolling(): void {
    this.polling = false;
    this.pollAbort?.abort();
  }

  // 토큰/chatId 교체 — 어드민이 설정을 저장하면 호출. 폴링 중이면 옛 폴러를
  // 멈추고 새 토큰으로 다시 시작한다(콜백 핸들러는 유지). 서버 재시작 불필요.
  reconfigure(botToken: string, chatId: string): void {
    const wasPolling = this.polling;
    this.stopPolling();
    this.botToken = botToken.trim();
    this.chatId = chatId.trim();
    if (wasPolling) this.startPolling();
  }

  private async loop(gen: number): Promise<void> {
    while (this.polling && gen === this.pollGen) {
      const abort = new AbortController();
      this.pollAbort = abort;
      try {
        const updates = await this.getUpdates(this.offset, 30, abort.signal);
        for (const u of updates) {
          this.offset = u.update_id + 1;
          const cq = u.callback_query;
          if (cq?.message && typeof cq.data === 'string') {
            await this.dispatch({
              callbackQueryId: cq.id,
              chatId: String(cq.message.chat.id),
              messageId: cq.message.message_id,
              data: cq.data,
            });
            continue;
          }
          // 텍스트 커맨드(/discover 등). 권한: 설정된 chat 에서 온 것만.
          // staleness: 재시작 후 텔레그램이 재전송하는 옛 메시지가 새 회차를
          // 트리거하지 않도록 60초 넘은 건 무시(콜백은 awaiting 복구용이라 제외).
          const msg = u.message;
          if (msg && typeof msg.text === 'string' && msg.text.length > 0) {
            if (String(msg.chat.id) !== this.chatId) continue;
            if (msg.date != null && Date.now() / 1000 - msg.date > 60) continue;
            await this.dispatchMessage({ chatId: String(msg.chat.id), text: msg.text });
          }
        }
      } catch (e) {
        // stop/reconfigure 로 인한 취소거나 세대가 교체됐으면 즉시 종료.
        if (abort.signal.aborted || !this.polling || gen !== this.pollGen) break;
        this.logger?.warn(
          { err: e instanceof Error ? e.message : String(e) },
          '[telegram] getUpdates 실패 — 2초 후 재시도',
        );
        await sleep(2000);
      }
    }
  }

  private async dispatch(cb: TelegramCallback): Promise<void> {
    try {
      await this.handler?.(cb);
    } catch (e) {
      this.logger?.error(
        { err: e instanceof Error ? e.message : String(e) },
        '[telegram] 콜백 핸들러 오류',
      );
    }
  }

  private async dispatchMessage(m: TelegramMessage): Promise<void> {
    try {
      await this.msgHandler?.(m);
    } catch (e) {
      this.logger?.error(
        { err: e instanceof Error ? e.message : String(e) },
        '[telegram] 메시지 핸들러 오류',
      );
    }
  }

  private async getUpdates(
    offset: number,
    timeoutSec: number,
    signal: AbortSignal,
  ): Promise<TgUpdate[]> {
    const url = `${API_BASE}/bot${this.botToken}/getUpdates?offset=${offset}&timeout=${timeoutSec}&allowed_updates=${encodeURIComponent('["message","callback_query"]')}`;
    // fetch 자체 타임아웃은 롱폴 timeout 보다 넉넉히.
    const res = await fetch(url, { signal });
    const json = (await res.json()) as TgResponse<TgUpdate[]>;
    if (!json.ok) throw new Error(json.description ?? 'getUpdates not ok');
    return json.result ?? [];
  }

  // 공용 POST 호출 — 실패는 로그만 남기고 null. 송신 실패가 회차를 죽이지 않게.
  private async call<T>(
    method: string,
    body: Record<string, unknown>,
  ): Promise<T | null> {
    try {
      const res = await fetch(`${API_BASE}/bot${this.botToken}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as TgResponse<T>;
      if (!json.ok) {
        this.logger?.warn(
          { method, description: json.description },
          '[telegram] API 응답 실패',
        );
        return null;
      }
      return json.result ?? null;
    } catch (e) {
      this.logger?.warn(
        { method, err: e instanceof Error ? e.message : String(e) },
        '[telegram] API 호출 오류',
      );
      return null;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });
}
