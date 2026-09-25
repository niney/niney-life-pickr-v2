import { SAJU_PROFILE_LABEL_MAX_LENGTH, SajuBirthInput, type SajuBirthInputType } from '@repo/api-contract';
import { SAJU_LOCAL_PROFILE_MAX } from './stores/sajuProfileStore.js';

// 앱 WebView 임베드 브리지 — 웹(apps/web)이 앱(apps/mobile) WebView 안에서 열릴 때의 계약.
//
// 앱 → 웹: 페이지 로드 전에 `window.__LP_EMBED__` 를 주입한다(injectedJavaScriptBeforeContentLoaded).
//   웹은 부팅 시 이 값을 읽어 세션 토큰·게스트 키를 자기 스토어에 넣는다 — 앱에서 로그인한 회원은
//   WebView 안에서도 회원이고, 게스트 키는 앱이 보관한 값을 써서 기기 한도·오늘의 카드 잠금이 앱과
//   WebView 사이에 일치한다. URL 에 토큰을 싣지 않는다(로그·리퍼러 노출).
// 웹 → 앱: `window.ReactNativeWebView.postMessage(JSON)` — 공유 시트·외부 링크처럼 WebView 가 못
//   하는 일을 앱에 맡긴다. 앱은 type 으로 분기하고 모르는 type 은 무시한다.

export interface LpEmbedInit {
  token: string | null;
  guestKey: string | null;
  // 앱 화면 모드 — 웹 테마를 맞출 때 쓴다(없으면 웹 기본).
  theme?: 'light' | 'dark';
}

// 사주(C) 게스트 프로필 한 명 — shared `SajuLocalProfile` 과 같은 모양(브리지는 스토어 모듈에 묶이지 않게 따로 둔다).
export interface LpEmbedSajuProfile {
  id: string;
  label: string;
  birth: SajuBirthInputType;
  createdAt: number;
}

export type LpEmbedMessage =
  // OS 공유 시트(링크). WebView 는 navigator.share 가 없거나 제한적이다.
  | { type: 'share'; url: string; title?: string }
  // 외부 브라우저로 열기(이미지 저장 등 WebView 가 다운로드를 못 하는 경우).
  | { type: 'open'; url: string }
  // 웹 문서 제목 — 앱 헤더 타이틀 동기화용(선택).
  | { type: 'title'; title: string }
  // 사주(C) 게스트 프로필 스토어 미러(웹 → 앱, 전체 교체). 앱 홈 "오늘의 운세" 카드·알림이 같은 프로필로
  // 기기에서 계산한다. 회원은 서버 프로필을 쓰므로 게스트 로컬 스토어만 흐른다(stores/sajuProfileMirror).
  | { type: 'saju-profiles'; profiles: LpEmbedSajuProfile[]; primaryId: string | null };

declare global {
  interface Window {
    __LP_EMBED__?: LpEmbedInit;
    ReactNativeWebView?: { postMessage: (data: string) => void };
  }
}

// 웹에서: 앱 WebView 안인지.
export const isLpEmbedded = (): boolean =>
  typeof window !== 'undefined' && (!!window.__LP_EMBED__ || !!window.ReactNativeWebView);

// 웹에서: 주입값 읽기(없으면 null).
export const readLpEmbedInit = (): LpEmbedInit | null =>
  typeof window !== 'undefined' && window.__LP_EMBED__ ? window.__LP_EMBED__ : null;

// 웹에서: 앱으로 메시지. 앱 밖이면 false(호출자가 브라우저 대안을 쓴다).
export const postLpEmbedMessage = (msg: LpEmbedMessage): boolean => {
  if (typeof window === 'undefined' || !window.ReactNativeWebView) return false;
  try {
    window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    return true;
  } catch {
    return false;
  }
};

// 앱에서: 주입 스크립트. 값은 JSON 으로 직렬화해 문자열 주입 시 인젝션이 없게 한다.
export const buildLpEmbedInjection = (init: LpEmbedInit): string =>
  `window.__LP_EMBED__ = ${JSON.stringify(init)}; true;`;

// 앱에서: WebView 메시지 파싱. 계약 밖이면 null.
export const parseLpEmbedMessage = (raw: string): LpEmbedMessage | null => {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.type === 'share' && typeof o.url === 'string') {
    return { type: 'share', url: o.url, ...(typeof o.title === 'string' ? { title: o.title } : {}) };
  }
  if (o.type === 'open' && typeof o.url === 'string') return { type: 'open', url: o.url };
  if (o.type === 'title' && typeof o.title === 'string') return { type: 'title', title: o.title };
  if (o.type === 'saju-profiles') return parseSajuProfilesMessage(o);
  return null;
};

// 프로필 한 명 검증 — 생년월일시는 계약 스키마(SajuBirthInput)로 파싱해 기본값까지 채운다.
const parseSajuProfile = (v: unknown): LpEmbedSajuProfile | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id.length === 0 || o.id.length > 64) return null;
  if (typeof o.label !== 'string') return null;
  const label = o.label.trim();
  if (label.length === 0 || label.length > SAJU_PROFILE_LABEL_MAX_LENGTH) return null;
  const birth = SajuBirthInput.safeParse(o.birth);
  if (!birth.success) return null;
  const createdAt = typeof o.createdAt === 'number' && Number.isFinite(o.createdAt) ? o.createdAt : 0;
  return { id: o.id, label, birth: birth.data, createdAt };
};

// 한 명이라도 계약 밖이면 메시지 전체를 버린다 — 일부만 반영하면 앱 스토어가 "교체" 되면서 프로필이 사라진다.
const parseSajuProfilesMessage = (o: Record<string, unknown>): LpEmbedMessage | null => {
  if (!Array.isArray(o.profiles) || o.profiles.length > SAJU_LOCAL_PROFILE_MAX) return null;
  const profiles: LpEmbedSajuProfile[] = [];
  for (const item of o.profiles) {
    const p = parseSajuProfile(item);
    if (!p) return null;
    profiles.push(p);
  }
  const primaryId =
    typeof o.primaryId === 'string' && profiles.some((p) => p.id === o.primaryId) ? o.primaryId : null;
  return { type: 'saju-profiles', profiles, primaryId };
};
