import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { computeBboxAround } from '@repo/utils';
import { server } from '~/test/msw';
import { SmartPickSection } from './SmartPickSection';

// 홈 슬롯머신 픽의 "내 주변" 게이트 — 이 컴포넌트에서 위치가 관여하는 건
// 오직 후보 풀 쿼리의 bbox 다. 여기서 지키는 계약:
//   ① 좌표를 얻기 전(미지원/차단 포함)에는 절대 전체 풀로 굴리지 않는다
//     (poolReady 가드 — 버튼 잠김 + 상태별 안내 문구)
//   ② 좌표를 얻으면 반경 1.5km bbox 가 실제 쿼리 파라미터로 나간다
// 슬롯 연출/뽑기 자체는 여기서 다루지 않는다(연출은 transitionend 의존).

const PUBLIC_LIST_URL = '/api/v1/restaurants/public';

const listItem = (placeId: string, name: string) => ({
  placeId,
  name,
  category: '한식',
  thumbnailUrl: null,
  latitude: 37.5,
  longitude: 127.0,
  avgSatisfactionScore: null,
});

// jsdom 에는 geolocation/permissions 가 없다 — 테스트별로 심고 끝나면 걷는다.
const stubNavigator = (key: 'geolocation' | 'permissions', value: unknown) => {
  Object.defineProperty(window.navigator, key, { value, configurable: true });
};

const renderSection = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SmartPickSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const nearMeChip = () => screen.getByRole('button', { name: '📍 내 주변' });
const rollButton = () => screen.getByRole('button', { name: /골라줘|다시 뽑기/ });

describe('SmartPickSection — 내 주변 게이트', () => {
  afterEach(() => {
    stubNavigator('geolocation', undefined);
    stubNavigator('permissions', undefined);
  });

  it('위치를 못 쓰는 환경 — 안내가 뜨고, 풀이 있어도 굴리기 버튼이 잠긴다', async () => {
    server.use(
      http.get(PUBLIC_LIST_URL, () =>
        HttpResponse.json({ items: [listItem('1', '서울집')] }),
      ),
    );
    renderSection();

    // 전국 풀이 이미 로드된 상태에서도, (버튼은 로딩 중에도 존재하므로
    // findBy 존재 확인이 아니라 enabled 전이를 기다린다)
    await waitFor(() => expect(rollButton()).toBeEnabled());

    fireEvent.click(nearMeChip());

    // 좌표가 없으면 낡은/전체 풀로 굴리지 않는다 — poolReady 가드.
    expect(await screen.findByText('이 환경에서는 위치를 사용할 수 없어요.')).toBeInTheDocument();
    expect(rollButton()).toBeDisabled();
  });

  it('권한 차단 — 사이트 설정 안내가 뜨고 위치 요청 자체를 건너뛴다', async () => {
    const getCurrentPosition = vi.fn();
    stubNavigator('geolocation', { getCurrentPosition });
    stubNavigator('permissions', {
      query: async () => ({
        state: 'denied',
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    server.use(http.get(PUBLIC_LIST_URL, () => HttpResponse.json({ items: [] })));
    renderSection();

    fireEvent.click(nearMeChip());

    expect(await screen.findByText(/위치 권한이 차단되어 있어요/)).toBeInTheDocument();
    // denied 확정이면 getCurrentPosition 호출 자체를 스킵(무의미 재요청 방지).
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('허용 — 좌표 기준 1.5km bbox 가 쿼리로 나가고 굴리기가 풀린다', async () => {
    const coords = { lat: 37.5, lng: 127.0 };
    stubNavigator('geolocation', {
      getCurrentPosition: (ok: (pos: unknown) => void) =>
        ok({ coords: { latitude: coords.lat, longitude: coords.lng } }),
    });
    const bboxes: Array<string | null> = [];
    server.use(
      http.get(PUBLIC_LIST_URL, ({ request }) => {
        const bbox = new URL(request.url).searchParams.get('bbox');
        bboxes.push(bbox);
        return HttpResponse.json({
          items: bbox ? [listItem('2', '주변집')] : [listItem('1', '서울집')],
        });
      }),
    );
    renderSection();

    fireEvent.click(nearMeChip());

    // PublicRestaurantsMap 과 동일한 소수점 5자리 포맷의 bbox 여야 한다.
    const b = computeBboxAround(coords, 1.5);
    const expected = [b.minLng, b.minLat, b.maxLng, b.maxLat]
      .map((n) => n.toFixed(5))
      .join(',');
    await vi.waitFor(() => expect(bboxes).toContain(expected));
    await waitFor(() => expect(rollButton()).toBeEnabled());
  });

  it('토글 해제 — 안내 문구가 사라지고 전국 풀로 되돌아간다', async () => {
    server.use(
      http.get(PUBLIC_LIST_URL, () =>
        HttpResponse.json({ items: [listItem('1', '서울집')] }),
      ),
    );
    renderSection();

    fireEvent.click(nearMeChip());
    expect(await screen.findByText('이 환경에서는 위치를 사용할 수 없어요.')).toBeInTheDocument();

    fireEvent.click(nearMeChip());

    expect(screen.queryByText('이 환경에서는 위치를 사용할 수 없어요.')).not.toBeInTheDocument();
    await waitFor(() => expect(rollButton()).toBeEnabled());
  });
});
