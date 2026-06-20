import type { RegionStatsResultType } from '@repo/api-contract';

// 지역 통계(getRegionStats)를 텔레그램 메시지로 렌더하는 순수 함수들.
// 텍스트 막대 + 시도 드릴다운 버튼. 부수효과·텔레그램 호출 없음(테스트 용이).
//
// 콜백 data 규약:
//  - 시도 드릴다운 : `rs:<시도명>`  (예: "rs:서울특별시")
//  - 전체로 복귀   : `rs:*`
// 시도명은 콜론을 포함하지 않고 짧아(≤ ~15바이트) 64바이트 한도 안전.

export interface TelegramStatsRender {
  text: string;
  buttons: { text: string; callbackData: string }[][];
}

const BAR_WIDTH = 12;
const ROW_BUTTONS = 3;
// 방어적 상한 — 현실 데이터(시도 ≤17, 시군구 ≤31)는 못 넘지만 폭주 방지.
const MAX_LINES = 40;
// 시도 뷰에서 "발굴할 구" 버튼 상한(키보드가 너무 길어지지 않게).
const DISCOVER_BTN_MAX = 8;

// /stats · /통계 · /지역 (또는 슬래시 없는 '통계').
export function isStatsCommand(text: string): boolean {
  const first = text.trim().split(/\s+/)[0] ?? '';
  const cmd = first.split('@')[0]!.toLowerCase();
  return cmd === '/stats' || cmd === '/통계' || cmd === '/지역' || cmd === '통계';
}

// 전체 시도 랭킹 + 시도 버튼.
export function buildRegionStatsOverview(
  stats: RegionStatsResultType,
): TelegramStatsRender {
  if (stats.sidos.length === 0) {
    return {
      text: '🗺️ <b>맛집 지역 통계</b>\n\n등록된 가게가 없습니다.',
      buttons: [],
    };
  }
  const rows = stats.sidos.slice(0, MAX_LINES);
  const max = rows[0]!.count; // count 내림차순 정렬됨.
  const nameW = Math.max(...rows.map((s) => visualWidth(s.sido)));
  const lines = rows.map(
    (s) =>
      `${escapeHtml(padEndVisual(s.sido, nameW))}  ${String(s.count).padStart(3)}  ${bar(s.count, max)}`,
  );
  const text =
    `🗺️ <b>맛집 지역 통계</b> — 총 ${stats.total}곳\n` +
    `(분류 ${stats.total} · 미분류 ${stats.unclassified})\n\n` +
    `<pre>\n${lines.join('\n')}\n</pre>\n` +
    '🔎 시/군/구는 버튼으로 ↓';
  const btns = stats.sidos.map((s) => ({
    text: `${shortSido(s.sido)} ${s.count}`,
    callbackData: `rs:${s.sido}`,
  }));
  return { text, buttons: chunk(btns, ROW_BUTTONS) };
}

// 한 시도의 시군구 분해 + "발굴할 구" 버튼 + "전체" 복귀 버튼.
// 발굴 버튼은 disc:<시도>:<시군구>(고정)·disc:<시도>(랜덤 구) 콜백을 낸다.
export function buildRegionStatsSido(
  stats: RegionStatsResultType,
  sido: string,
): TelegramStatsRender {
  const entry = stats.sidos.find((s) => s.sido === sido);
  if (!entry) return buildRegionStatsOverview(stats); // 캐시 갱신으로 사라짐 → 폴백.

  const sidoDiscover = { text: `🔍 ${shortSido(sido)} 전체(랜덤 구)`, callbackData: `disc:${sido}` };
  const back = { text: '⬅️ 전체', callbackData: 'rs:*' };

  if (entry.sigungus.length === 0) {
    return {
      text: `🗺️ <b>${escapeHtml(sido)}</b> — ${entry.count}곳\n\n세부 시/군/구 정보가 없습니다.`,
      buttons: [[sidoDiscover], [back]],
    };
  }
  const rows = entry.sigungus.slice(0, MAX_LINES);
  const max = rows[0]!.count;
  const nameW = Math.max(...rows.map((s) => visualWidth(s.sigungu)));
  const lines = rows.map(
    (s) =>
      `${escapeHtml(padEndVisual(s.sigungu, nameW))}  ${String(s.count).padStart(3)}  ${bar(s.count, max)}`,
  );
  const more =
    entry.sigungus.length > rows.length
      ? `\n외 ${entry.sigungus.length - rows.length}곳`
      : '';
  const text =
    `🗺️ <b>${escapeHtml(sido)}</b> — ${entry.count}곳\n\n` +
    `<pre>\n${lines.join('\n')}\n</pre>${more}\n` +
    '🔍 발굴할 구를 고르세요 ↓';
  const discBtns = rows.slice(0, DISCOVER_BTN_MAX).map((s) => ({
    text: `🔍 ${s.sigungu}`,
    callbackData: `disc:${sido}:${s.sigungu}`,
  }));
  return { text, buttons: [...chunk(discBtns, 2), [sidoDiscover], [back]] };
}

// ── 내부 헬퍼 ───────────────────────────────────────────────────────────

function bar(count: number, max: number): string {
  if (max <= 0) return '';
  const n = Math.max(1, Math.round((count / max) * BAR_WIDTH));
  return '█'.repeat(n);
}

// 버튼 라벨용 시도 약칭 — "서울특별시"→"서울", "경기도"→"경기".
function shortSido(name: string): string {
  return name
    .replace(/특별자치도$/, '')
    .replace(/특별자치시$/, '')
    .replace(/특별시$/, '')
    .replace(/광역시$/, '')
    .replace(/도$/, '');
}

// 모노스페이스(<pre>) 열 정렬 — CJK 글자는 2칸 폭으로 계산해 패딩.
function visualWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    const wide =
      (c >= 0x1100 && c <= 0x115f) || // Hangul Jamo
      (c >= 0x2e80 && c <= 0xa4cf) || // CJK 부수~한자
      (c >= 0xac00 && c <= 0xd7a3) || // Hangul 음절
      (c >= 0xf900 && c <= 0xfaff) || // CJK 호환
      (c >= 0xff00 && c <= 0xff60); // 전각
    w += wide ? 2 : 1;
  }
  return w;
}

function padEndVisual(s: string, target: number): string {
  const pad = target - visualWidth(s);
  return pad > 0 ? s + ' '.repeat(pad) : s;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
