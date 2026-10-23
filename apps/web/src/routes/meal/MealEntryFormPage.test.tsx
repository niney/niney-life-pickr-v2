import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { MealRecommendationType } from '@repo/api-contract';
import {
  setMealDraftPrincipal,
  startMealDraftFromRecommendation,
  useAuthStore,
  useMealDraftStore,
} from '@repo/shared';
import { exifJpeg } from '~/test/fixtures/exifJpeg';
import { server } from '~/test/msw';
import { MealEditPage, MealNewPage } from './MealEntryFormPage';

// 식단 입력(웹) — 새 기록과 수정. 저장 payload(출처·추천 연결·사진·인식 원본), 사진 넣기(고르기·끌어다 놓기·
// 붙여넣기 → 올리기 → 인식, 촬영 시각 반영)와 draft 복원 대기·이어 쓰기 규칙을 고정한다.

const USER = {
  id: 'u1',
  email: 'u@x.com',
  role: 'USER',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as const;

const ME_URL = '/api/v1/auth/me';
const ENTRIES_URL = '/api/v1/meals';
const PRESETS_URL = '/api/v1/meals/time-presets';
const FOOD_SEARCH_URL = '/api/v1/food/search';
const FREQUENT_URL = '/api/v1/meals/items/frequent';
const PHOTOS_URL = '/api/v1/meals/photos';
const RECOGNIZE_URL = '/api/v1/meals/recognize';

const recognizeResult = {
  dishes: [
    {
      recognitionDishId: 'd1',
      name: '된장찌개',
      candidates: [
        { name: '된장찌개', confidence: 0.6 },
        { name: '청국장', confidence: 0.3 },
      ],
      confidence: 0.6,
      isMain: true,
      portion: 'normal',
      isDrink: false,
      photoIndex: 0,
      foodId: 'f-doenjang',
      matchedName: '된장찌개',
      dishType: 'stew',
      mainIngredient: null,
      cuisine: 'korean',
      selectedCandidateRank: 0,
      catalogMatchedBy: 'food_id',
      catalogMatchScore: 1,
    },
    {
      recognitionDishId: 'd2',
      name: '공기밥',
      candidates: [],
      confidence: 0.9,
      isMain: false,
      portion: null,
      isDrink: false,
      photoIndex: 0,
      foodId: null,
      matchedName: null,
      dishType: null,
      mainIngredient: null,
      cuisine: null,
    },
  ],
  model: 'vision-test',
  promptVersion: 3,
  warning: null,
};

// 사진 올리기(장마다 tok-1, tok-2 …)·썸네일·인식 핸들러. 올린 요청 수와 인식 요청 본문을 돌려준다.
const photoHandlers = (opts: { recognize?: () => Response | Promise<Response> } = {}) => {
  const state = { uploads: 0, recognizeBodies: [] as Array<Record<string, unknown>> };
  server.use(
    http.post(PHOTOS_URL, () => {
      state.uploads += 1;
      return HttpResponse.json({
        token: `tok-${state.uploads}`,
        previewUrl: '',
        thumbUrl: '',
        width: 10,
        height: 10,
        byteSize: 100,
      });
    }),
    http.get('/api/v1/meals/photos/:token/thumb', () =>
      HttpResponse.arrayBuffer(new ArrayBuffer(8), { headers: { 'Content-Type': 'image/jpeg' } }),
    ),
    http.post(RECOGNIZE_URL, async ({ request }) => {
      state.recognizeBodies.push((await request.json()) as Record<string, unknown>);
      return opts.recognize ? opts.recognize() : HttpResponse.json(recognizeResult);
    }),
  );
  return state;
};

const photoFile = (name = 'lunch.jpg', content: BlobPart = 'jpeg') =>
  new File([content], name, { type: 'image/jpeg' });

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

const quickItem = (over: Partial<Record<string, unknown>> = {}) => ({
  name: '공기밥',
  foodId: 'f-rice',
  dishType: 'rice',
  mainIngredient: 'grain',
  cuisine: 'korean',
  isMain: false,
  portion: null,
  servings: null,
  portionSource: null,
  count: 0,
  lastEatenDate: null,
  from: 'default',
  ...over,
});

const savedEntry = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'e1',
  eatenAt: '2026-09-27T03:30:00.000Z',
  eatenDate: '2026-09-27',
  slot: 'lunch',
  mealType: 'dining_out',
  placeId: 'place-1',
  placeName: '숯토리',
  memo: '팀 점심',
  source: 'photo',
  originRecommendationId: null,
  items: [
    {
      id: 'i1',
      name: '김치찌개',
      foodId: 'f1',
      dishType: 'stew',
      mainIngredient: 'pork',
      cuisine: 'korean',
      portion: 'normal',
      servings: null,
      portionSource: 'vision_ordinal',
      isMain: true,
      confidence: 0.8,
      recognitionDishId: 'dish-1',
      selectedCandidateRank: 0,
      catalogMatchedBy: 'food_id',
      catalogMatchScore: 1,
      source: 'recognized',
      sortOrder: 0,
      kcal: 300,
      proteinG: 20,
      sodiumMg: 1500,
      nutritionFrom: null,
      nutritionBasis: 'direct',
    },
  ],
  photos: [{ token: 'a'.repeat(8), width: 40, height: 30, byteSize: 100, sortOrder: 0 }],
  recognition: null,
  photoPurgedAt: null,
  createdAt: '2026-09-27T03:40:00.000Z',
  updatedAt: '2026-09-27T03:40:00.000Z',
  ...over,
});

// 상세 자리 — 어느 기록으로 갔는지 보이게 id 를 찍는다.
const DetailProbe = () => <p>상세 화면 {useParams().id}</p>;

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/me/meals" element={<p>목록 화면</p>} />
          <Route path="/me/meals/new" element={<MealNewPage />} />
          <Route path="/me/meals/:id" element={<DetailProbe />} />
          <Route path="/me/meals/:id/edit" element={<MealEditPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('MealEntryFormPage', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    useAuthStore.setState({ token: 't', user: { ...USER }, isGuest: false });
    await setMealDraftPrincipal('u1');
    useMealDraftStore.getState().clear();
    server.use(
      http.get(ME_URL, () => HttpResponse.json(USER)),
      http.get(PRESETS_URL, () =>
        HttpResponse.json({
          presets: [{ slot: 'breakfast', time: '08:10', fromRecords: true, sampleCount: 5 }],
        }),
      ),
      http.get(FREQUENT_URL, () => HttpResponse.json({ items: [] })),
    );
  });

  it('새 기록 — 카탈로그에서 고른 음식·시각·식사 방식을 사진 없이 manual 출처로 저장한다', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.get(FOOD_SEARCH_URL, () =>
        HttpResponse.json({
          items: [
            {
              id: 'f1',
              name: '김치찌개',
              repName: null,
              dishType: 'stew',
              mainIngredient: 'pork',
              cuisine: 'korean',
              popularity: 10,
            },
          ],
        }),
      ),
      http.post(ENTRIES_URL, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(savedEntry({ id: 'new-1', source: 'manual', photos: [] }), {
          status: 201,
        });
      }),
    );
    renderAt('/me/meals/new');

    const save = await screen.findByRole('button', { name: '저장' });
    // 이름이 빈 첫 줄만 있으면 저장할 수 없다.
    expect(save).toBeDisabled();

    const name = screen.getByLabelText('음식 이름');
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: '김치' } });
    fireEvent.click(await screen.findByRole('option', { name: /김치찌개/ }));
    expect(name).toHaveValue('김치찌개');

    fireEvent.change(screen.getByLabelText('먹은 날짜'), { target: { value: '2026-09-20' } });
    fireEvent.change(screen.getByLabelText('먹은 시각'), { target: { value: '19:40' } });
    fireEvent.click(screen.getByRole('button', { name: '저녁' }));
    fireEvent.click(screen.getByRole('button', { name: '집밥' }));
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '  혼밥  ' } });
    fireEvent.click(save);

    await waitFor(() => expect(body).not.toBeNull());
    const sent = body as unknown as {
      eatenAt: string;
      eatenDate: string;
      slot: string;
      mealType: string;
      memo: string;
      source: string;
      originRecommendationId: string | null;
      photoTokens: string[];
      items: Array<Record<string, unknown>>;
    };
    expect(sent.eatenDate).toBe('2026-09-20');
    expect(new Date(sent.eatenAt).getHours()).toBe(19);
    expect(new Date(sent.eatenAt).getMinutes()).toBe(40);
    expect(sent.slot).toBe('dinner');
    expect(sent.mealType).toBe('home');
    expect(sent.memo).toBe('혼밥');
    expect(sent.source).toBe('manual');
    expect(sent.originRecommendationId).toBeNull();
    expect(sent.photoTokens).toEqual([]);
    expect(sent.items).toEqual([
      expect.objectContaining({
        name: '김치찌개',
        foodId: 'f1',
        dishType: 'stew',
        source: 'catalog',
        catalogMatchedBy: 'food_id',
      }),
    ]);
    // 새 기록은 방금 만든 기록의 상세로 가고 draft 는 비운다.
    expect(await screen.findByText('상세 화면 new-1')).toBeInTheDocument();
    expect(useMealDraftStore.getState().eatenDate).toBe('');
  });

  // 회귀: 키 입력마다 자동완성 요청이 나갔다("김치찌개" 하나에 여섯 번, 절반은 한글 조합 중간 상태).
  it('자동완성 — 타이핑이 멈춘 뒤 한 번만 묻고, 조합 중인 끝 낱자모는 떼고 묻는다', async () => {
    const asked: (string | null)[] = [];
    server.use(
      http.get(FOOD_SEARCH_URL, ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('q'));
        return HttpResponse.json({
          items: [
            {
              id: 'f1',
              name: '김치찌개',
              repName: null,
              dishType: 'stew',
              mainIngredient: 'pork',
              cuisine: 'korean',
              popularity: 10,
            },
          ],
        });
      }),
    );
    renderAt('/me/meals/new');

    const name = await screen.findByLabelText('음식 이름');
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: '김ㅊ' } });
    fireEvent.change(name, { target: { value: '김치' } });
    fireEvent.change(name, { target: { value: '김치ㅉ' } });
    expect(await screen.findByRole('option', { name: /김치찌개/ })).toBeInTheDocument();
    // 중간 입력('김ㅊ', '김치')으로는 묻지 않고, 마지막 입력('김치ㅉ')은 끝 낱자모를 뗀 '김치'로 한 번만.
    expect(asked).toEqual(['김치']);

    fireEvent.change(name, { target: { value: '김치찌' } });
    await waitFor(() => expect(asked).toEqual(['김치', '김치찌']));

    // 입력을 지우면 디바운스를 기다리지 않고 목록이 바로 닫힌다.
    fireEvent.change(name, { target: { value: '' } });
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('빠른 추가 — 고른 끼니로 자주 먹는 음식을 받아, 누르면 빈 첫 줄을 채우고 다시 누르면 뺀다', async () => {
    const slots: (string | null)[] = [];
    let body: { items: Array<Record<string, unknown>> } | null = null;
    server.use(
      http.get(FREQUENT_URL, ({ request }) => {
        slots.push(new URL(request.url).searchParams.get('slot'));
        return HttpResponse.json({
          items: [
            quickItem({ name: '제육볶음', foodId: 'f-jeyuk', dishType: 'stir_fry', isMain: true, count: 3, from: 'history', portion: 'large' }),
            quickItem(),
          ],
        });
      }),
      http.post(ENTRIES_URL, async ({ request }) => {
        body = (await request.json()) as { items: Array<Record<string, unknown>> };
        return HttpResponse.json(savedEntry({ id: 'new-2', source: 'manual', photos: [] }), { status: 201 });
      }),
    );
    renderAt('/me/meals/new');

    const rice = await screen.findByRole('button', { name: '공기밥' });
    expect(slots[0]).toBe(useMealDraftStore.getState().slot);
    fireEvent.click(rice);
    // 빈 첫 줄 자리에 들어가 줄이 하나뿐이다.
    expect(screen.getAllByLabelText('음식 이름')).toHaveLength(1);
    expect(screen.getByLabelText('음식 이름')).toHaveValue('공기밥');
    expect(rice).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '제육볶음' }));
    expect(screen.getAllByLabelText('음식 이름')).toHaveLength(2);
    // 다시 누르면 뺀다.
    fireEvent.click(screen.getByRole('button', { name: '제육볶음' }));
    expect(screen.getAllByLabelText('음식 이름')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '제육볶음' }));

    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body!.items).toEqual([
      expect.objectContaining({ name: '공기밥', foodId: 'f-rice', isMain: false, source: 'catalog' }),
      expect.objectContaining({ name: '제육볶음', foodId: 'f-jeyuk', isMain: true, portion: 'large' }),
    ]);
  });

  it('평소 시각 칩은 시각과 끼니를 함께 정하고 날짜는 두고, 음식 추가로 줄을 늘린다', async () => {
    renderAt('/me/meals/new');
    fireEvent.change(await screen.findByLabelText('먹은 날짜'), { target: { value: '2026-09-21' } });
    fireEvent.click(screen.getByRole('button', { name: '아침 08:10' }));
    const s = useMealDraftStore.getState();
    expect(s.slot).toBe('breakfast');
    expect(s.eatenDate).toBe('2026-09-21');
    expect(new Date(s.eatenAt).getHours()).toBe(8);

    fireEvent.click(screen.getByRole('button', { name: /음식 추가/ }));
    expect(screen.getAllByLabelText('음식 이름')).toHaveLength(2);
  });

  it('추천에서 넘어온 draft 는 추천 출처와 원본 id 로 저장하고, 서버 거절은 화면에 남긴다', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post(ENTRIES_URL, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(
          { statusCode: 400, error: 'Bad Request', message: '추천 후보와 일치하는 주 음식이 없습니다.' },
          { status: 400 },
        );
      }),
    );
    startMealDraftFromRecommendation(
      {
        id: 'r1',
        targetDate: '2026-09-29',
        targetSlot: 'dinner',
        items: [
          { name: '연어초밥', foodId: 'f2', dishType: 'raw_fish', mainIngredient: 'fish', cuisine: 'japanese' },
        ],
      } as unknown as MealRecommendationType,
      '연어초밥',
      'delivery',
    );
    renderAt('/me/meals/new');

    expect(await screen.findByDisplayValue('연어초밥')).toBeInTheDocument();
    expect(screen.getByText(/추천에서 고른 메뉴예요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('추천 후보와 일치하는 주 음식이 없습니다.');
    expect(bodies[0]).toMatchObject({
      source: 'recommendation',
      originRecommendationId: 'r1',
      slot: 'dinner',
      mealType: 'delivery',
    });
    // 실패하면 입력은 그대로 남아 고쳐서 다시 저장할 수 있다.
    expect(useMealDraftStore.getState().originRecommendationId).toBe('r1');
  });

  it('탭에 쓰다 만 새 기록이 있으면 새로 열지 않고 이어 쓴다', async () => {
    useMealDraftStore.getState().start({
      eatenAt: '2026-09-28T10:00:00.000Z',
      eatenDate: '2026-09-28',
      slot: 'dinner',
      memo: '쓰던 메모',
    });
    renderAt('/me/meals/new');
    expect(await screen.findByLabelText('메모')).toHaveValue('쓰던 메모');
    expect(useMealDraftStore.getState().eatenDate).toBe('2026-09-28');
  });

  it('draft 복원 전에는 입력 화면을 열지 않고, /me 로 계정이 확정되면 연다', async () => {
    await setMealDraftPrincipal(null);
    useAuthStore.setState({ token: 't', user: null, isGuest: false });
    renderAt('/me/meals/new');
    expect(screen.getByText(/불러오는 중/)).toBeInTheDocument();
    expect(screen.queryByLabelText('음식 이름')).not.toBeInTheDocument();

    expect(await screen.findByLabelText('음식 이름')).toBeInTheDocument();
    expect(useMealDraftStore.getState().eatenDate).not.toBe('');
  });

  it('수정 — 주소로 바로 열면 서버 기록으로 채우고, 기존 사진을 그대로 담은 PATCH 뒤 상세로 간다', async () => {
    let patch: Record<string, unknown> | null = null;
    server.use(
      http.get(`${ENTRIES_URL}/e1`, () => HttpResponse.json(savedEntry())),
      http.get('/api/v1/meals/photos/:token/thumb', () =>
        HttpResponse.arrayBuffer(new ArrayBuffer(8), { headers: { 'Content-Type': 'image/jpeg' } }),
      ),
      http.patch(`${ENTRIES_URL}/e1`, async ({ request }) => {
        patch = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(savedEntry({ memo: '팀 점심 · 수정' }));
      }),
    );
    renderAt('/me/meals/e1/edit');

    expect(await screen.findByDisplayValue('김치찌개')).toBeInTheDocument();
    expect(screen.getByText('숯토리')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사진 빼기' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '팀 점심 · 수정' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(patch).not.toBeNull());
    // 서버는 받은 사진 목록으로 갈아끼운다 — 손대지 않은 사진도 빠짐없이 보내야 남는다.
    expect(patch).toMatchObject({ photoTokens: ['a'.repeat(8)] });
    expect(patch).not.toHaveProperty('source');
    expect(patch).not.toHaveProperty('recognition');
    expect(patch).toMatchObject({ memo: '팀 점심 · 수정', placeId: 'place-1' });
    // 인식 계보는 수정 저장에서도 빠지지 않는다.
    expect((patch as unknown as { items: unknown[] }).items[0]).toMatchObject({
      recognitionDishId: 'dish-1',
      source: 'recognized',
    });
    expect(await screen.findByText('상세 화면 e1')).toBeInTheDocument();
  });

  it('수정 — 취소하면 draft 를 버리고 상세로 돌아간다', async () => {
    server.use(
      http.get(`${ENTRIES_URL}/e1`, () => HttpResponse.json(savedEntry({ photos: [] }))),
    );
    renderAt('/me/meals/e1/edit');
    fireEvent.click(await screen.findByRole('button', { name: '취소' }));
    expect(await screen.findByText('상세 화면 e1')).toBeInTheDocument();
    expect(useMealDraftStore.getState().entryId).toBeNull();
  });

  it('사진을 고르면 올리고 인식해 음식 줄을 채우고, 사진·인식 원본과 함께 photo 출처로 저장한다', async () => {
    const photos = photoHandlers();
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(ENTRIES_URL, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(savedEntry({ id: 'new-3' }), { status: 201 });
      }),
    );
    renderAt('/me/meals/new');
    await screen.findByLabelText('음식 이름');

    fireEvent.change(fileInput(), { target: { files: [photoFile()] } });

    expect(await screen.findByDisplayValue('된장찌개')).toBeInTheDocument();
    expect(screen.getByDisplayValue('공기밥')).toBeInTheDocument();
    // 새 기록의 빈 첫 줄은 인식이 채운 뒤 치운다.
    expect(screen.getAllByLabelText('음식 이름')).toHaveLength(2);
    expect(screen.getByText('2개 음식을 찾았어요. 확인해 주세요.')).toBeInTheDocument();
    expect(photos.recognizeBodies).toEqual([
      expect.objectContaining({ photoTokens: ['tok-1'], slot: useMealDraftStore.getState().slot }),
    ]);

    // 다른 후보를 누르면 이름을 바꾸고 몇 번째 후보인지 남긴다(카탈로그 매칭은 푼다).
    fireEvent.click(screen.getByRole('button', { name: '청국장' }));
    expect(screen.getByDisplayValue('청국장')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({
      source: 'photo',
      photoTokens: ['tok-1'],
      recognition: { model: 'vision-test', version: 3, dishes: [{ name: '된장찌개' }, { name: '공기밥' }] },
    });
    expect((body as unknown as { items: unknown[] }).items).toEqual([
      expect.objectContaining({
        name: '청국장',
        foodId: null,
        source: 'recognized',
        recognitionDishId: 'd1',
        selectedCandidateRank: 1,
        catalogMatchedBy: 'none',
      }),
      expect.objectContaining({ name: '공기밥', recognitionDishId: 'd2', isMain: false }),
    ]);
    expect(await screen.findByText('상세 화면 new-3')).toBeInTheDocument();
  });

  it('사진의 촬영 시각(EXIF)으로 먹은 날짜·시각·끼니를 맞추고 알려 준다', async () => {
    photoHandlers();
    renderAt('/me/meals/new');
    await screen.findByLabelText('음식 이름');

    fireEvent.change(fileInput(), {
      target: { files: [photoFile('dinner.jpg', exifJpeg({ original: '2026:09:20 19:05:00' }))] },
    });

    expect(await screen.findByText('사진 찍은 시각(9월 20일 19:05)으로 먹은 시각을 맞췄어요.')).toBeInTheDocument();
    expect(screen.getByLabelText('먹은 날짜')).toHaveValue('2026-09-20');
    expect(screen.getByLabelText('먹은 시각')).toHaveValue('19:05');
    expect(useMealDraftStore.getState().slot).toBe('dinner');
    await screen.findByDisplayValue('된장찌개');
  });

  it('복사한 사진을 붙여넣거나 사진 칸에 끌어다 놓아도 올린다 — 글자 붙여넣기는 건드리지 않는다', async () => {
    const photos = photoHandlers();
    renderAt('/me/meals/new');
    await screen.findByLabelText('음식 이름');

    fireEvent.paste(document, { clipboardData: { files: [] } });
    expect(photos.uploads).toBe(0);

    fireEvent.paste(document, { clipboardData: { files: [photoFile('pasted.png')] } });
    await screen.findByDisplayValue('된장찌개');
    expect(photos.uploads).toBe(1);

    const dropTarget = screen.getByText('사진 추가');
    fireEvent.dragOver(dropTarget, { dataTransfer: { types: ['Files'], files: [] } });
    fireEvent.drop(dropTarget, { dataTransfer: { types: ['Files'], files: [photoFile('dropped.jpg')] } });
    await waitFor(() => expect(photos.recognizeBodies).toHaveLength(2));
    // 다시 인식은 넣은 사진 전체로 — 이전 자동 인식 항목만 바꾸니 같은 음식이 두 번 생기지 않는다.
    expect(photos.recognizeBodies[1]).toMatchObject({ photoTokens: ['tok-1', 'tok-2'] });
    await waitFor(() => expect(screen.getAllByLabelText('음식 이름')).toHaveLength(2));
    expect(useMealDraftStore.getState().photos.map((p) => p.token)).toEqual(['tok-1', 'tok-2']);
  });

  it('사진이 아닌 파일은 올리지 않고, 인식이 실패해도 사진은 남아 직접 적어 저장할 수 있다', async () => {
    const photos = photoHandlers({
      recognize: () =>
        HttpResponse.json(
          { statusCode: 429, error: 'Too Many Requests', message: '오늘 사진 인식 한도(30회)를 모두 썼습니다.' },
          { status: 429 },
        ),
    });
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(ENTRIES_URL, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(savedEntry({ id: 'new-4' }), { status: 201 });
      }),
    );
    renderAt('/me/meals/new');
    const name = await screen.findByLabelText('음식 이름');

    fireEvent.change(fileInput(), { target: { files: [new File(['%PDF'], 'menu.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText('사진 파일만 넣을 수 있어요.')).toBeInTheDocument();
    expect(photos.uploads).toBe(0);

    fireEvent.change(fileInput(), { target: { files: [photoFile()] } });
    expect(
      await screen.findByText('오늘 사진 인식 한도(30회)를 모두 썼습니다. 직접 입력해 주세요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('사진 파일만 넣을 수 있어요.')).not.toBeInTheDocument();

    fireEvent.change(name, { target: { value: '비빔밥' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({ source: 'photo', photoTokens: ['tok-1'], recognition: null });
  });

  it('올리는 동안은 저장을 막고, 그사이 취소하면 방금 올린 사진을 지운다', async () => {
    let releaseUpload: (() => void) | null = null;
    const deleted: string[] = [];
    server.use(
      http.post(PHOTOS_URL, async () => {
        await new Promise<void>((resolve) => {
          releaseUpload = resolve;
        });
        return HttpResponse.json({ token: 'tok-late', previewUrl: '', thumbUrl: '', width: 1, height: 1, byteSize: 1 });
      }),
      http.delete(`${PHOTOS_URL}/:token`, ({ params }) => {
        deleted.push(String(params.token));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    useMealDraftStore.getState().start({
      eatenAt: '2026-09-28T10:00:00.000Z',
      eatenDate: '2026-09-28',
      slot: 'dinner',
    });
    useMealDraftStore.getState().addItem({
      name: '김밥',
      foodId: null,
      dishType: null,
      mainIngredient: null,
      cuisine: null,
      portion: null,
      isMain: true,
      confidence: null,
      source: 'manual',
      candidates: [],
    });
    renderAt('/me/meals/new');
    const save = await screen.findByRole('button', { name: '저장' });
    expect(save).toBeEnabled();

    fireEvent.change(fileInput(), { target: { files: [photoFile()] } });
    expect(await screen.findByText(/사진 올리는 중… 0\/1/)).toBeInTheDocument();
    expect(save).toBeDisabled();
    await waitFor(() => expect(releaseUpload).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(await screen.findByText('목록 화면')).toBeInTheDocument();
    releaseUpload!();
    await waitFor(() => expect(deleted).toEqual(['tok-late']));
    expect(useMealDraftStore.getState().photos).toEqual([]);
  });

  it('사진 칸 — 사진을 누르면 크게 보고, 모서리 X 는 크게 보지 않고 사진만 뺀다', async () => {
    photoHandlers();
    server.use(
      http.get(`${ENTRIES_URL}/e1`, () => HttpResponse.json(savedEntry())),
      http.get(`${PHOTOS_URL}/:token`, () =>
        HttpResponse.arrayBuffer(new ArrayBuffer(16), { headers: { 'Content-Type': 'image/jpeg' } }),
      ),
    );
    renderAt('/me/meals/e1/edit');

    fireEvent.click(await screen.findByRole('button', { name: '사진 1 크게 보기' }));
    const dialog = await screen.findByRole('dialog', { name: '사진 보기' });
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '사진 빼기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '사진 1 크게 보기' })).not.toBeInTheDocument();
    expect(useMealDraftStore.getState().photos).toEqual([]);
  });

  it('수정 — 기존 사진을 빼고 새 사진을 넣으면 그 목록으로 PATCH 하고, 손본 기존 음식은 인식이 바꾸지 않는다', async () => {
    photoHandlers();
    let patch: Record<string, unknown> | null = null;
    server.use(
      http.get(`${ENTRIES_URL}/e1`, () => HttpResponse.json(savedEntry())),
      http.patch(`${ENTRIES_URL}/e1`, async ({ request }) => {
        patch = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(savedEntry());
      }),
    );
    renderAt('/me/meals/e1/edit');
    expect(await screen.findByDisplayValue('김치찌개')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '사진 빼기' }));
    fireEvent.change(fileInput(), { target: { files: [photoFile()] } });
    expect(await screen.findByDisplayValue('된장찌개')).toBeInTheDocument();
    expect(screen.getByDisplayValue('김치찌개')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(patch).not.toBeNull());
    expect(patch).toMatchObject({ photoTokens: ['tok-1'] });
    expect((patch as unknown as { items: Array<{ name: string }> }).items.map((i) => i.name)).toEqual([
      '김치찌개',
      '된장찌개',
      '공기밥',
    ]);
  });
});
