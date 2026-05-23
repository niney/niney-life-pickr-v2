import type {
  ExtractReceiptInputType,
  ExtractReceiptResultType,
  UploadReceiptResultType,
} from '@repo/api-contract';
import { apiFetch, getApiConfig } from './client.js';

const PREFIX = '/api/v1/settlement-extraction';

export const settlementExtractionApi = {
  // 영수증 이미지 업로드. file 필드 이름은 서버의 req.file() 과 약속되어
  // 있다 — 다른 이름을 쓰면 첫 번째 파일이 잡히지 않을 수 있어 'file' 고정.
  upload: async (file: Blob): Promise<UploadReceiptResultType> => {
    const form = new FormData();
    form.append('file', file);
    return apiFetch<UploadReceiptResultType>(`${PREFIX}/upload`, {
      method: 'POST',
      body: form,
    });
  },

  extract: (input: ExtractReceiptInputType): Promise<ExtractReceiptResultType> =>
    apiFetch<ExtractReceiptResultType>(`${PREFIX}/extract`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // 미리보기 URL — 응답 본문이 binary 라 apiFetch 로 받지 않고 직접 src 로
  // 사용한다. 서버는 인증된 사용자만 허용하므로 <img> 태그에서 곧장 호출하면
  // 쿠키/헤더 없이는 401. 클라이언트는 Authorization 헤더가 필요한 경우
  // fetch 로 받아 blob URL 로 바꾸거나 토큰 쿼리 파라미터 패턴이 필요할 수
  // 있다. 우선은 같은 origin 의 fetch 헬퍼를 제공.
  previewBlob: async (token: string): Promise<Blob> => {
    const cfg = getApiConfig();
    const auth = await cfg.getToken?.();
    const headers = new Headers();
    if (auth) headers.set('Authorization', `Bearer ${auth}`);
    const res = await fetch(`${cfg.baseUrl}${PREFIX}/preview/${token}`, { headers });
    if (!res.ok) {
      throw new Error(`미리보기 요청 실패 (${res.status})`);
    }
    return res.blob();
  },
};
