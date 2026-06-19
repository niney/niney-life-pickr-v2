import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type {
  TelegramChatIdResultType,
  TelegramConfigType,
  TelegramTestResultType,
  UpdateTelegramConfigInputType,
} from '@repo/api-contract';
import { maskApiKey } from '../ai/ai.config.service.js';
import type { TelegramService } from '../telegram/telegram.service.js';

// 텔레그램 봇 설정 관리 — MapSettingsService 와 같은 "DB 우선 + env fallback"
// 패턴. 단일 행(key 고정). 저장하면 공유 TelegramService 인스턴스를 즉시
// reconfigure 해서 서버 재시작 없이 폴러가 새 토큰으로 갈아탄다.
const KEY = 'telegram';

export interface TelegramConfigDeps {
  // .env fallback 값 (DB 행이 없을 때 사용).
  envBotToken: string;
  envChatId: string;
  logger?: FastifyBaseLogger;
}

export class TelegramConfigService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly telegram: TelegramService,
    private readonly deps: TelegramConfigDeps,
  ) {}

  // 유효 설정 = DB 행 있으면 DB 값, 없으면 env. 토큰 출처로 source 판정.
  private async effective(): Promise<{
    token: string;
    chatId: string;
    source: 'db' | 'env' | 'none';
    updatedAt: Date | null;
  }> {
    const row = await this.prisma.telegramConfig.findUnique({ where: { key: KEY } });
    const dbToken = row?.botToken?.trim() ?? '';
    const dbChat = row?.chatId?.trim() ?? '';
    const hasDb = dbToken.length > 0 || dbChat.length > 0;
    const token = dbToken || this.deps.envBotToken.trim();
    const chatId = dbChat || this.deps.envChatId.trim();
    const source: 'db' | 'env' | 'none' = hasDb ? 'db' : token ? 'env' : 'none';
    return { token, chatId, source, updatedAt: row?.updatedAt ?? null };
  }

  async getConfig(): Promise<TelegramConfigType> {
    const e = await this.effective();
    return {
      hasToken: e.token.length > 0,
      tokenMasked: e.token ? maskApiKey(e.token) : null,
      chatId: e.chatId || null,
      source: e.source,
      configured: e.token.length > 0 && e.chatId.length > 0,
      updatedAt: e.updatedAt?.toISOString() ?? null,
    };
  }

  // 빈/누락 botToken = 기존 보존, 문자열 = 교체. chatId 는 문자열=설정,
  // null=비움, undefined=보존. 저장 후 봇에 즉시 반영.
  async update(
    input: UpdateTelegramConfigInputType,
    actorId: string | null,
  ): Promise<TelegramConfigType> {
    const token = input.botToken?.trim();
    const updateData: Record<string, unknown> = { updatedById: actorId };
    if (token) updateData.botToken = token;
    if (input.chatId !== undefined) updateData.chatId = input.chatId ?? '';

    await this.prisma.telegramConfig.upsert({
      where: { key: KEY },
      create: {
        key: KEY,
        botToken: token ?? '',
        chatId: input.chatId ?? '',
        updatedById: actorId,
      },
      update: updateData,
    });
    await this.applyToBot();
    return this.getConfig();
  }

  // DB 행 삭제 → env fallback 으로 복귀.
  async clear(): Promise<void> {
    await this.prisma.telegramConfig.deleteMany({ where: { key: KEY } });
    await this.applyToBot();
  }

  // 유효 설정을 공유 봇 인스턴스에 반영(폴링 중이면 재시작).
  private async applyToBot(): Promise<void> {
    const e = await this.effective();
    this.telegram.reconfigure(e.token, e.chatId);
  }

  // 부팅 1회 — DB 설정을 봇에 적용. 이 시점엔 아직 startPolling 전이라
  // reconfigure 가 폴러를 켜지는 않는다(random-crawl bootstrap 이 켠다).
  async bootstrap(): Promise<void> {
    await this.applyToBot();
    const cfg = await this.getConfig();
    this.deps.logger?.info(
      { source: cfg.source, configured: cfg.configured },
      '[telegram] config bootstrap',
    );
  }

  // 저장된 유효 설정으로 getMe → getChat → 테스트 메시지 전송.
  async test(): Promise<TelegramTestResultType> {
    const bot = await this.telegram.verifyBot();
    if (!bot.ok) {
      return {
        ok: false,
        botOk: false,
        botUsername: null,
        chatOk: false,
        chatLabel: null,
        messageSent: false,
        error: bot.error,
      };
    }
    const chat = await this.telegram.verifyChat();
    if (!chat.ok) {
      return {
        ok: false,
        botOk: true,
        botUsername: bot.username,
        chatOk: false,
        chatLabel: null,
        messageSent: false,
        error: chat.error,
      };
    }
    const sent = await this.telegram.sendTestMessage(
      '✅ 맛집 자동 발굴 연결 테스트 — 이 메시지가 보이면 봇 전송 경로가 정상입니다.',
    );
    return {
      ok: sent.ok,
      botOk: true,
      botUsername: bot.username,
      chatOk: true,
      chatLabel: chat.label,
      messageSent: sent.ok,
      error: sent.ok ? null : sent.error,
    };
  }

  async resolveChatId(): Promise<TelegramChatIdResultType> {
    const candidates = await this.telegram.resolveChatId();
    return { candidates };
  }
}
