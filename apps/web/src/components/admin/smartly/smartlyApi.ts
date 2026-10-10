import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// smartly(apps/smartly, Python) 체험 서버 호출 — 어드민 '메뉴판 AI' 테스트 페이지 전용.
// friendly 가 아니라서 @repo/shared 의 apiFetch 를 쓰지 않는다(어드민 JWT 를 보내지 않고, 이 서버의 오류로
// 로그아웃되지 않게). Vite 개발 프록시(/smartly-api → 127.0.0.1:8700)로만 닿고 운영에는 없다.

const BASE = '/smartly-api';

export type SmartlyLang = 'en' | 'ja' | 'zh-CN' | 'zh-TW';
export const SMARTLY_LANGS: { id: SmartlyLang; label: string }[] = [
  { id: 'en', label: '영어' },
  { id: 'ja', label: '일본어' },
  { id: 'zh-CN', label: '중국어 간체' },
  { id: 'zh-TW', label: '중국어 번체' },
];

export type TranslateMode = 'auto' | 'model' | 'compare';
export type TranslationSource = 'dictionary' | 'model' | 'none';

export interface SmartlyHealth {
  device: string;
  deviceName: string | null; // GPU 이름(cuda 일 때)
  ocr: { available: boolean; loaded: boolean };
  dictionary: { available: boolean; loaded: boolean; size: number | null };
  translationModels: { file: string; langs: SmartlyLang[]; available: boolean; loaded: boolean }[];
  ocrSamples: boolean;
  translationSamples: Record<SmartlyLang, boolean>;
}

export interface OcrResult {
  name: string;
  text: string;
  confidence: number;
  width: number;
  height: number;
}

export interface OcrEvalItem {
  id: number;
  gt: string;
  text: string;
  confidence: number;
  cer: number;
}

export interface OcrEvaluation {
  total: number;
  count: number;
  seed: number;
  meanCer: number | null;
  exactRate: number | null;
  seconds: number;
  items: OcrEvalItem[];
}

export interface TranslateCandidate {
  text: string;
  raw: string;
  score: number;
}

export interface TranslateLangResult {
  lang: SmartlyLang;
  text: string | null;
  source: TranslationSource;
  dictionary: string | null;
  candidates: TranslateCandidate[];
}

export interface TranslateResponse {
  input: string;
  dictionaryKo: string | null;
  results: TranslateLangResult[];
}

export interface TranslateInput {
  text: string;
  langs: SmartlyLang[];
  mode: TranslateMode;
  beamSize: number;
  nBest: number;
  replaceUnk: boolean;
}

export interface TranslationEvalItem {
  ko: string;
  reference: string;
  text: string | null;
  source: TranslationSource;
  bleu: number;
}

export interface TranslationEvaluation {
  total: number;
  lang: SmartlyLang;
  count: number;
  seed: number;
  meanBleu: number | null;
  dictionaryRate: number | null;
  dictionaryBleu: number | null;
  modelBleu: number | null;
  seconds: number;
  items: TranslationEvalItem[];
}

export interface DictionarySearchResult {
  total: number;
  items: { ko: string; translations: Partial<Record<SmartlyLang, string>> }[];
}

export class SmartlyError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'SmartlyError';
  }
}

// FastAPI 오류 본문은 { detail: string } 또는 검증 실패 시 { detail: [{ msg }] }.
const errorMessage = async (res: Response): Promise<string> => {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail
        .map((d) => (d as { msg?: string }).msg ?? '')
        .filter(Boolean)
        .join(', ');
    }
  } catch {
    // 본문 없음(프록시 연결 실패 등)
  }
  return res.status >= 500 && res.status !== 503
    ? 'smartly 서버에 연결할 수 없습니다'
    : res.statusText || `HTTP ${res.status}`;
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new SmartlyError('smartly 서버에 연결할 수 없습니다', null);
  }
  if (!res.ok) throw new SmartlyError(await errorMessage(res), res.status);
  return (await res.json()) as T;
};

const postJson = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const smartlyApi = {
  health: () => request<SmartlyHealth>('/health'),
  ocr: (files: { blob: Blob; name: string }[]) => {
    const form = new FormData();
    for (const f of files) form.append('files', f.blob, f.name);
    return request<{ results: OcrResult[] }>('/ocr', { method: 'POST', body: form });
  },
  evaluateOcr: (input: { count: number; seed: number }) =>
    postJson<OcrEvaluation>('/evaluate/ocr', input),
  translate: (input: TranslateInput) => postJson<TranslateResponse>('/translate', input),
  evaluateTranslation: (input: { lang: SmartlyLang; count: number; seed: number }) =>
    postJson<TranslationEvaluation>('/evaluate/translate', input),
  searchDictionary: (q: string, limit = 50) =>
    request<DictionarySearchResult>(
      `/dictionary/search?${new URLSearchParams({ q, limit: String(limit) }).toString()}`,
    ),
};

export const ocrSampleImageUrl = (id: number) => `${BASE}/ocr/samples/${id}/image`;

const healthKey = ['smartly', 'health'] as const;

export const useSmartlyHealth = () =>
  useQuery({ queryKey: healthKey, queryFn: smartlyApi.health, retry: false });

// 모델은 처음 쓰는 요청에서 올라가므로, 요청이 끝나면 상태(적재 여부)를 다시 읽는다.
const useRefreshHealthOnSettled = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: healthKey });
};

export const useSmartlyOcr = () => {
  const onSettled = useRefreshHealthOnSettled();
  return useMutation({ mutationFn: smartlyApi.ocr, onSettled });
};

export const useEvaluateOcr = () => {
  const onSettled = useRefreshHealthOnSettled();
  return useMutation({ mutationFn: smartlyApi.evaluateOcr, onSettled });
};

export const useSmartlyTranslate = () => {
  const onSettled = useRefreshHealthOnSettled();
  return useMutation({ mutationFn: smartlyApi.translate, onSettled });
};

export const useEvaluateTranslation = () => {
  const onSettled = useRefreshHealthOnSettled();
  return useMutation({ mutationFn: smartlyApi.evaluateTranslation, onSettled });
};

export const useDictionarySearch = (q: string) =>
  useQuery({
    queryKey: ['smartly', 'dictionary', q],
    queryFn: () => smartlyApi.searchDictionary(q),
    enabled: q.trim().length > 0,
    retry: false,
  });
