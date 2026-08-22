import { useMealPhotoUrl } from '@repo/shared';
import { cn } from '~/lib/utils';

// 식단 사진 — 서버가 JWT 를 요구해 <img src={url}> 로 직접 못 부른다. useMealPhotoUrl 이
// blob 을 받아 웹에서는 objectURL 로 바꿔 주고, 언마운트 시 해제까지 한다.
export const MealPhotoImg = ({
  token,
  variant = 'thumb',
  className,
  alt = '식단 사진',
}: {
  token: string;
  variant?: 'full' | 'thumb';
  className?: string;
  alt?: string;
}) => {
  const { url, error } = useMealPhotoUrl(token, { variant });
  if (error) {
    return (
      <div className={cn('flex items-center justify-center rounded-md bg-muted text-xs text-muted-foreground', className)}>
        !
      </div>
    );
  }
  if (!url) {
    return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
  }
  return <img src={url} alt={alt} className={cn('rounded-md object-cover', className)} />;
};
