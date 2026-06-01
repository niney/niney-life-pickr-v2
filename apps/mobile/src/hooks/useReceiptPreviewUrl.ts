import { useEffect, useState } from 'react';
import { settlementExtractionApi } from '@repo/shared';

// 영수증 preview 라우트는 JWT 가 필요해 <Image src> 로 직접 호출하면 401 이 난다.
// fetch 로 blob 을 받아 FileReader 로 base64 data URL 로 변환해 표시한다.
// (RN 의 Image 는 웹의 objectURL 을 못 받으므로 data URL 을 쓴다 — 웹 훅과의
//  유일한 차이.) 외부 시스템(blob→reader) 동기화라 useEffect 가 맞다.
//
// previewUrl 은 `.../preview/<token>` 형태라 마지막 segment 가 토큰이다.
// 반환된 dataUrl 은 Lightbox(images=[dataUrl]) 로 그대로 확대해 볼 수 있다.
export function useReceiptPreviewUrl(previewUrl: string) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setError(null);
    const token = previewUrl.split('/').pop() ?? '';
    (async () => {
      try {
        const blob = await settlementExtractionApi.previewBlob(token);
        const reader = new FileReader();
        reader.onloadend = () => {
          if (cancelled) return;
          if (typeof reader.result === 'string') setDataUrl(reader.result);
          else setError('미리보기 변환 실패');
        };
        reader.onerror = () => {
          if (!cancelled) setError('미리보기 변환 실패');
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '미리보기 실패');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewUrl]);

  return { dataUrl, error };
}
