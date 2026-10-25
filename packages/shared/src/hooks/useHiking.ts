import { useQuery } from '@tanstack/react-query';
import { hikingApi } from '../api/hiking.api.js';

// 등산 훅 — 적재본(GPX·산림청)은 배포 때만 바뀌고 서버도 1시간 공개 캐시를 단다. 한 번 받으면 세션 동안 다시 받을
// 이유가 거의 없어 길게(1시간) 둔다. 산·코스를 넘겨 보다 되돌아오면 캐시로 바로 뜬다.

const STALE_MS = 60 * 60_000;

export const useHikingMountains = () =>
  useQuery({ queryKey: ['hiking', 'mountains'], queryFn: () => hikingApi.mountains(), staleTime: STALE_MS });

// id 가 없으면 비활성.
export const useHikingMountain = (id: string | null) =>
  useQuery({
    queryKey: ['hiking', 'mountain', id],
    queryFn: () => hikingApi.mountain(id!),
    enabled: id !== null,
    staleTime: STALE_MS,
  });

export const useHikingCourse = (id: string | null) =>
  useQuery({
    queryKey: ['hiking', 'course', id],
    queryFn: () => hikingApi.course(id!),
    enabled: id !== null,
    staleTime: STALE_MS,
  });

// 오늘의 조건 — 서버가 단기예보 발표·산불 3시간·대기 매시로 캐시해 두므로 10분이면 충분하다. 날짜·출발 시각은 받은 3일치를
// 화면이 접는다(@repo/utils hikingConditions) — 바꿔도 다시 받지 않는다.
const CONDITIONS_STALE_MS = 10 * 60_000;

export const useHikingConditions = (courseId: string | null) =>
  useQuery({
    queryKey: ['hiking', 'conditions', courseId],
    queryFn: () => hikingApi.conditions(courseId!),
    enabled: courseId !== null,
    staleTime: CONDITIONS_STALE_MS,
  });
