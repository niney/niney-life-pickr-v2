import {
  Routes,
  type MenuBoardEvalResponseType,
  type MenuBoardReadResultType,
  type MenuBoardSamplesResponseType,
} from '@repo/api-contract';
import { apiFetch, getApiConfig } from './client.js';

// 메뉴판 읽기(어드민 테스트) — 사진 한 장 → 비전 LLM 메뉴 목록, 수집 샘플, 회귀 평가 리포트.
export const menuBoardApi = {
  // file 필드 이름은 서버의 req.file() 과 약속 — 웹 Blob/File 만(어드민 웹 전용).
  read: (file: Blob, filename = 'menu.jpg'): Promise<MenuBoardReadResultType> => {
    const form = new FormData();
    form.append('file', file, filename);
    return apiFetch<MenuBoardReadResultType>(Routes.MenuBoard.read, { method: 'POST', body: form });
  },

  samples: (): Promise<MenuBoardSamplesResponseType> =>
    apiFetch<MenuBoardSamplesResponseType>(Routes.MenuBoard.samples),

  // 샘플 사진 원본 — 어드민 인증이 필요해 <img src> 로 바로 못 쓴다. Blob 으로 받아 화면이 object URL 로 띄우고
  // 같은 Blob 을 read 에 그대로 올린다.
  sampleImage: async (key: string): Promise<Blob> => {
    const cfg = getApiConfig();
    const token = await cfg.getToken?.();
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(`${cfg.baseUrl}${Routes.MenuBoard.sampleImage(key)}`, { headers });
    if (!res.ok) throw new Error(`샘플 사진 요청 실패 (${res.status})`);
    return res.blob();
  },

  evalReport: (): Promise<MenuBoardEvalResponseType> =>
    apiFetch<MenuBoardEvalResponseType>(Routes.MenuBoard.evalReport),
};
