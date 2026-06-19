import { z } from 'zod';

// 텔레그램 봇 설정 — 어드민 "설정 > 텔레그램". LlmProviderConfig/MapProviderConfig
// 와 같은 패턴: DB 행이 있으면 DB 값이 이기고, 없으면 .env(TELEGRAM_*) 로
// fallback. 토큰은 절대 평문으로 내려주지 않고 마스킹한다.

// 설정 조회 응답 (GET). source 로 현재 유효값의 출처를 알려준다.
//   db   : DB 에 저장된 값 사용
//   env  : DB 행 없음 → .env 값 사용
//   none : 둘 다 없음 (봇 비활성)
export const TelegramConfig = z.object({
  hasToken: z.boolean(),
  // 마스킹된 토큰 — 예: "8012…Ab3". 없으면 null.
  tokenMasked: z.string().nullable(),
  // chat id 는 비밀이 아니라 평문 그대로.
  chatId: z.string().nullable(),
  source: z.enum(['db', 'env', 'none']),
  // 토큰+chatId 가 모두 있어 실제로 전송 가능한 상태인지.
  configured: z.boolean(),
  updatedAt: z.string().nullable(),
});
export type TelegramConfigType = z.infer<typeof TelegramConfig>;

// 설정 변경 (PUT). MapProvider 규약과 동일: undefined/빈 botToken = 기존 보존,
// 문자열 = 교체. chatId 는 문자열=설정, null=비움, undefined=보존.
export const UpdateTelegramConfigInput = z.object({
  botToken: z.string().optional(),
  chatId: z.string().nullable().optional(),
});
export type UpdateTelegramConfigInputType = z.infer<typeof UpdateTelegramConfigInput>;

// 연결 테스트 결과 (POST test). 현재 저장된 유효 설정으로 getMe → getChat →
// 테스트 메시지 전송을 시도한 결과.
export const TelegramTestResult = z.object({
  ok: z.boolean(),
  botOk: z.boolean(),
  botUsername: z.string().nullable(),
  chatOk: z.boolean(),
  chatLabel: z.string().nullable(),
  messageSent: z.boolean(),
  error: z.string().nullable(),
});
export type TelegramTestResultType = z.infer<typeof TelegramTestResult>;

// chat_id 자동 찾기 (POST resolve-chat-id). 폴러를 잠시 멈추고 message 롱폴로
// 사용자가 그 사이 봇에 보낸 메시지에서 chat 정보를 추려 돌려준다.
export const TelegramChatIdCandidate = z.object({
  chatId: z.string(),
  name: z.string(),
  type: z.string(),
});
export type TelegramChatIdCandidateType = z.infer<typeof TelegramChatIdCandidate>;

export const TelegramChatIdResult = z.object({
  candidates: z.array(TelegramChatIdCandidate),
});
export type TelegramChatIdResultType = z.infer<typeof TelegramChatIdResult>;
