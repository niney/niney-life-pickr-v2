// 텔레그램 봇 연결 진단 프로브.
//
// telegram-config.service.ts 와 동일하게 "DB 우선 + env fallback" 규칙으로
// 유효 토큰/chatId 를 계산한 뒤, getMe → getUpdates(롱폴) → (옵션) sendMessage
// 순서로 실제 호출해 어디서 막히는지 확인한다.
//
// 실행: pnpm --filter friendly probe:telegram          (조회 + getMe + getUpdates)
//       pnpm --filter friendly probe:telegram -- --send (마지막에 테스트 메시지 전송까지)

import { PrismaClient } from '@prisma/client';

const API_BASE = 'https://api.telegram.org';
const SHOULD_SEND = process.argv.includes('--send');

const maskToken = (key: string): string => {
  if (!key) return '(없음)';
  const at = key.indexOf(':');
  if (at < 0) return `${key.slice(0, 4)}***`;
  return `${key.slice(0, at)}:${key.slice(at + 1, at + 5)}***`;
};

const errInfo = (e: unknown): { message: string; cause: unknown } => {
  if (e instanceof Error) {
    return { message: e.message, cause: (e as { cause?: unknown }).cause };
  }
  return { message: String(e), cause: undefined };
};

const timed = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
  const start = performance.now();
  try {
    const result = await fn();
    console.log(`   ✅ ${label} 성공 (${Math.round(performance.now() - start)}ms)`);
    return result;
  } catch (e) {
    const info = errInfo(e);
    console.error(`   ❌ ${label} 실패 (${Math.round(performance.now() - start)}ms): ${info.message}`);
    if (info.cause) console.error(`      cause: ${JSON.stringify(info.cause)}`);
    return null;
  }
};

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  console.log('\n=== 텔레그램 연결 진단 ===\n');

  // ── ① 유효 설정 계산 (DB 우선 + env fallback, telegram-config.service.ts 와 동일 규칙) ──
  console.log('① 유효 설정 확인');
  const envToken = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  const envChatId = (process.env.TELEGRAM_CHAT_ID ?? '').trim();
  const row = await prisma.telegramConfig.findUnique({ where: { key: 'telegram' } });
  const dbToken = row?.botToken?.trim() ?? '';
  const dbChatId = row?.chatId?.trim() ?? '';
  const hasDb = dbToken.length > 0 || dbChatId.length > 0;

  const token = dbToken || envToken;
  const chatId = dbChatId || envChatId;
  const source = hasDb ? 'db' : token ? 'env' : 'none';

  console.log(`   .env  TELEGRAM_BOT_TOKEN = ${maskToken(envToken)}`);
  console.log(`   .env  TELEGRAM_CHAT_ID   = ${envChatId || '(없음)'}`);
  console.log(`   DB    botToken           = ${dbToken ? maskToken(dbToken) : '(행 없음/빈값)'}`);
  console.log(`   DB    chatId             = ${dbChatId || '(행 없음/빈값)'}`);
  console.log(`   → 유효 소스: ${source} / 유효 토큰: ${maskToken(token)} / 유효 chatId: ${chatId || '(없음)'}`);
  if (source === 'db') {
    console.log(
      '   ⚠ DB 행이 존재해 .env 값은 무시됩니다 — .env 만 바꿔도 반영 안 됨(어드민에서 재저장/초기화 필요)',
    );
  }

  if (!token) {
    console.error('\n토큰이 없습니다 (.env / DB 모두 비어있음). 진단을 중단합니다.');
    process.exitCode = 1;
    return;
  }

  // ── ② getMe ──────────────────────────────────────────────────────────────
  console.log('\n② getMe (봇 유효성)');
  const me = await timed('getMe', async () => {
    const res = await fetch(`${API_BASE}/bot${token}/getMe`);
    const json = (await res.json()) as { ok: boolean; result?: { username?: string }; description?: string };
    if (!json.ok) throw new Error(json.description ?? 'getMe not ok');
    return json.result;
  });
  if (me?.username) console.log(`   봇: @${me.username}`);

  // ── ③ getUpdates (실제 운영 코드와 동일하게 30초 롱폴) ─────────────────────
  console.log('\n③ getUpdates (30초 롱폴 — 운영 코드와 동일 파라미터)');
  await timed('getUpdates', async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35_000);
    try {
      const res = await fetch(
        `${API_BASE}/bot${token}/getUpdates?timeout=30&allowed_updates=${encodeURIComponent(
          '["message","callback_query"]',
        )}`,
        { signal: controller.signal },
      );
      const json = (await res.json()) as { ok: boolean; result?: unknown[]; description?: string };
      if (!json.ok) throw new Error(json.description ?? 'getUpdates not ok');
      console.log(`      pending updates: ${json.result?.length ?? 0}`);
      return json.result;
    } finally {
      clearTimeout(timer);
    }
  });

  // ── ④ sendMessage (옵션 — --send 플래그가 있을 때만) ────────────────────
  console.log('\n④ sendMessage');
  if (!SHOULD_SEND) {
    console.log('   생략 (--send 플래그 없음). 실제 전송까지 확인하려면:');
    console.log('   pnpm --filter friendly probe:telegram -- --send');
  } else if (!chatId) {
    console.log('   생략 (유효 chatId 없음)');
  } else {
    await timed('sendMessage', async () => {
      const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '[probe:telegram] 진단 스크립트 테스트 메시지',
        }),
      });
      const json = (await res.json()) as { ok: boolean; description?: string };
      if (!json.ok) throw new Error(json.description ?? 'sendMessage not ok');
    });
  }

  console.log('');
};

main()
  .catch((e) => {
    console.error(errInfo(e).message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
