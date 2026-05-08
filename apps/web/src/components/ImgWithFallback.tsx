import { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';

// Naver image CDN (ldb-phinf.pstatic.net 등) 이 Referer 헤더를 검사해
// `*.naver.com` origin 이 아니면 403 으로 거절한다. 각 <img> 에 no-referrer
// 정책을 박으면 Referer 자체가 안 실려 통과한다. 그래도 어쩌다 403 되는
// 케이스는 onError 로 placeholder 로 전환.
const IMG_REFERRER_POLICY = 'no-referrer' as const;

interface Props {
  src: string;
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}

export const ImgWithFallback = ({
  src,
  alt,
  className,
  loading = 'lazy',
}: Props) => {
  const [failed, setFailed] = useState(false);
  // src 가 바뀌면 실패 상태 리셋 — 캐러셀처럼 같은 컴포넌트가 다른 이미지를
  // 연속으로 그리는 케이스에서 한 번 실패한 뒤 다음 이미지가 안 보이는 걸 방지.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center bg-muted text-muted-foreground ${
          className ?? ''
        }`}
        aria-label="이미지를 불러올 수 없습니다"
      >
        <ImageIcon className="size-5 opacity-40" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt ?? ''}
      loading={loading}
      referrerPolicy={IMG_REFERRER_POLICY}
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
