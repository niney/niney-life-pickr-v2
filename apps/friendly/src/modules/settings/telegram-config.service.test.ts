import { describe, expect, it, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { TelegramConfigService } from './telegram-config.service.js';
import type { TelegramService } from '../telegram/telegram.service.js';

// TelegramConfigService 단위 테스트 — prisma/telegram 을 인메모리 가짜로 주입.
// 핵심: "DB 우선 + env fallback", 마스킹, set/clear, 저장 시 reconfigure 호출.

interface Row {
  id: string;
  key: string;
  botToken: string;
  chatId: string;
  updatedById: string | null;
  updatedAt: Date;
}

const makeDeps = (env: { token: string; chatId: string }) => {
  let row: Row | null = null;
  const reconfigured: Array<[string, string]> = [];

  const prisma = {
    telegramConfig: {
      findUnique: async () => row,
      upsert: async ({
        create,
        update,
      }: {
        create: Partial<Row>;
        update: Partial<Row>;
      }) => {
        if (row) row = { ...row, ...update, updatedAt: new Date() };
        else
          row = {
            id: '1',
            key: 'telegram',
            botToken: '',
            chatId: '',
            updatedById: null,
            ...create,
            updatedAt: new Date(),
          } as Row;
        return row;
      },
      deleteMany: async () => {
        row = null;
        return { count: 1 };
      },
    },
  } as unknown as PrismaClient;

  const telegram = {
    reconfigure: (t: string, c: string) => reconfigured.push([t, c]),
  } as unknown as TelegramService;

  const service = new TelegramConfigService(prisma, telegram, {
    envBotToken: env.token,
    envChatId: env.chatId,
  });
  return { service, reconfigured, getRow: () => row };
};

const ENV_TOKEN = '8012345678:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

describe('TelegramConfigService', () => {
  it('DB 행 없음 + env 있음 → source=env, 토큰 마스킹', async () => {
    const { service } = makeDeps({ token: ENV_TOKEN, chatId: '123' });
    const cfg = await service.getConfig();
    expect(cfg.source).toBe('env');
    expect(cfg.hasToken).toBe(true);
    expect(cfg.configured).toBe(true);
    expect(cfg.chatId).toBe('123');
    expect(cfg.tokenMasked).not.toBeNull();
    // 평문 토큰이 그대로 노출되면 안 된다.
    expect(cfg.tokenMasked).not.toBe(ENV_TOKEN);
  });

  it('DB 행 없음 + env 없음 → source=none', async () => {
    const { service } = makeDeps({ token: '', chatId: '' });
    const cfg = await service.getConfig();
    expect(cfg.source).toBe('none');
    expect(cfg.hasToken).toBe(false);
    expect(cfg.configured).toBe(false);
  });

  it('update 로 토큰/chatId 저장 → source=db, reconfigure 호출', async () => {
    const { service, reconfigured } = makeDeps({ token: ENV_TOKEN, chatId: '123' });
    const cfg = await service.update({ botToken: '999:DBTOKENvalue', chatId: '555' }, 'admin');
    expect(cfg.source).toBe('db');
    expect(cfg.chatId).toBe('555');
    expect(cfg.updatedAt).not.toBeNull();
    expect(reconfigured.at(-1)).toEqual(['999:DBTOKENvalue', '555']);
  });

  it('botToken 생략 시 기존 토큰 보존(빈 값으로 안 덮음)', async () => {
    const { service } = makeDeps({ token: ENV_TOKEN, chatId: '' });
    await service.update({ botToken: '999:DBTOKENvalue', chatId: '555' }, 'admin');
    const cfg = await service.update({ chatId: '777' }, 'admin');
    expect(cfg.chatId).toBe('777');
    expect(cfg.source).toBe('db');
    expect(cfg.hasToken).toBe(true); // 토큰 유지
  });

  it('clear → DB 행 삭제, env fallback 복귀 + reconfigure(env)', async () => {
    const { service, reconfigured } = makeDeps({ token: ENV_TOKEN, chatId: '123' });
    await service.update({ botToken: '999:DBTOKENvalue', chatId: '555' }, 'admin');
    await service.clear();
    const cfg = await service.getConfig();
    expect(cfg.source).toBe('env');
    expect(cfg.chatId).toBe('123');
    expect(reconfigured.at(-1)).toEqual([ENV_TOKEN, '123']);
  });
});
