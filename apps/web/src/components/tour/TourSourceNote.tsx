import { TOUR_SOURCE_NOTE } from '@repo/utils';
import { cn } from '~/lib/utils';

// 여행로그 출처 표기 — AI 허브 이용정책(NIA 사업결과·데이터명·aihub.or.kr 필수)을 집계를 쓰는 모든 섹션 하단에 그대로.
// 서버가 sourceNote 를 함께 내려주면 그 문구를 우선한다(문구 개정 시 배포 없이 반영).

export const TourSourceNote = ({ note, className }: { note?: string | null; className?: string }) => (
  <p className={cn('text-[11px] leading-relaxed text-muted-foreground', className)}>{note ?? TOUR_SOURCE_NOTE}</p>
);
