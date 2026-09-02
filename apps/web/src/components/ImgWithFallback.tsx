import { useState } from 'react';
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
  // 고정 크기 썸네일이면 넘겨서 로드 전 자리(레이아웃 시프트 방지)를 잡는다.
  width?: number;
  height?: number;
}

export const ImgWithFallback = ({
  src,
  alt,
  className,
  loading = 'lazy',
  width,
  height,
}: Props) => {
  const [failed, setFailed] = useState(false);
  // src 가 바뀌면 실패 상태를 렌더 중 리셋(useEffect 대신 파생) — 이중 렌더/1프레임
  // stale placeholder 없이, 캐러셀처럼 같은 컴포넌트가 다른 이미지를 연속으로 그릴 때
  // 이전 실패가 다음 이미지를 가리지 않게 한다.
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setFailed(false);
  }

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
      // 디코딩을 메인 스레드 밖으로 — 큰 원본이 뷰포트에 들어올 때 스크롤 프레임을 잡아먹지 않게.
      decoding="async"
      width={width}
      height={height}
      referrerPolicy={IMG_REFERRER_POLICY}
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
