import { useEffect, useState } from 'react';
import { settlementExtractionApi } from '@repo/shared';

// 영수증 preview 라우트는 JWT 가 필요해 <img src> 로 직접 호출하면 401 이 난다.
// fetch 로 blob 을 받아 objectURL 로 변환해 표시한다. 외부 시스템(브라우저 URL
// 캐시) 동기화라 useEffect 가 맞다 — unmount/주소 변경 시 revoke 까지 한 묶음.
//
// previewUrl 은 `.../preview/<token>` 형태라 마지막 segment 가 토큰이다.
// 반환된 objectUrl 은 Lightbox(images=[objectUrl]) 로 그대로 확대해 볼 수 있다.
export function useReceiptPreviewUrl(previewUrl: string) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setObjectUrl(null);
    setError(null);
    const token = previewUrl.split('/').pop() ?? '';
    (async () => {
      try {
        const blob = await settlementExtractionApi.previewBlob(token);
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '미리보기 실패');
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [previewUrl]);

  return { objectUrl, error };
}
