import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { CreateSajuReadingInputType, SajuReadingResultType, SajuSectionsType, SajuThemesType } from '@repo/api-contract';
import { useAuthStore, useSajuProfileStore } from '@repo/shared';
import { computeSajuChart } from '@repo/utils';
import { detectTarotRender } from '~/components/tarot/tarotQuality';
import { server } from '~/test/msw';
import { SajuPage } from './SajuPage';

// 사주 페이지 — jsdom 은 WebGL2 가 없어 Lite 모드(연출 건너뜀). 입력 → 원국(클라이언트 계산) → 풀이 요청(게스트 키)
// → 패널 그룹·서브 탭·섹션 표시, 검증 오류, 요청 실패 폴백, 테마 job, 입구 궁합 모드를 본다. 3D 무대는 검증하지 않는다.

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/saju-c']}>
        <Routes>
          <Route element={<Outlet context={{ setSubBar: () => {}, headerHeight: 56 }} />}>
            <Route path="/saju-c" element={<SajuPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const fakeResult = (input: CreateSajuReadingInputType): SajuReadingResultType => {
  const chart = computeSajuChart(input.birth, { asOf: new Date('2026-09-06T03:00:00Z') });
  const base = { status: 'ready' as const, source: 'llm' as const, model: 'fake' };
  const sections: SajuSectionsType = {
    personality: { ...base, headline: '곧게 선 무쇠', body: '성격 본문입니다.', strengths: ['결단', '의리', '실행'], cautions: ['직설', '고집'] },
    year: { ...base, body: '올해 본문입니다.', months: [{ month: 3, note: '시작하기 좋아요' }] },
    cycle: { ...base, body: '흐름 본문입니다.', current: '현재 대운입니다.', next: '다음 대운입니다.' },
    advice: { ...base, body: '조언 본문입니다.', keyword: '결단', lucky: { element: 'wood', colors: ['초록'], directions: ['동쪽'], numbers: [3, 8], foods: ['나물'] } },
  };
  return {
    readingId: null,
    jobId: null,
    chart: chart as unknown as SajuReadingResultType['chart'],
    sections,
    themes: null,
    source: 'llm',
    model: 'fake',
    createdAt: new Date().toISOString(),
    quota: { remainingToday: 9 },
  };
};

const fakeThemes = (_input: CreateSajuReadingInputType, status: 'pending' | 'static' | 'ready') => {
  const base = status === 'ready' ? { status: 'ready' as const, source: 'llm' as const, model: 'fake' } : { status, source: 'static' as const, model: null };
  const themes: SajuThemesType = {
    love: { ...base, headline: status === 'ready' ? '천천히 깊어지는 인연' : '인연 정적', body: status === 'ready' ? '인연 본문입니다.' : '인연 정적 본문.', style: '연애 스타일.', timing: '인연의 해.', tips: ['a', 'b', 'c'] },
    wealth: { ...base, headline: status === 'ready' ? '쌓이는 곳간' : '재물 정적', body: '재물 본문입니다.', style: '돈 스타일.', timing: '재물의 해.', tips: ['a', 'b', 'c'] },
    career: { ...base, headline: status === 'ready' ? '판을 여는 사람' : '직업 정적', body: '직업 본문입니다.', jobs: ['회계·재무', '금융·은행'], timing: '직업의 해.', tips: ['a', 'b', 'c'] },
  };
  return { readingId: null, jobId: null, themes, source: status === 'ready' ? 'llm' : 'static', model: status === 'ready' ? 'fake' : null, createdAt: new Date().toISOString(), quota: { remainingToday: 8 } };
};

beforeEach(() => {
  window.localStorage.clear();
  useAuthStore.setState({ token: null, user: null, isGuest: false });
  useSajuProfileStore.setState({ profiles: [], primaryId: null });
});

describe('SajuPage (Lite)', () => {
  it('jsdom 은 lite 로 판정한다', () => {
    expect(detectTarotRender('').mode).toBe('lite');
  });

  it('입력 → 사주 세우기 → 원국 표 + 풀이 요청(게스트 키) → 섹션 탭, 기기 프로필 저장', async () => {
    let received: CreateSajuReadingInputType | null = null;
    let guestKey: string | null = null;
    server.use(
      http.post('/api/v1/saju-c/readings', async ({ request }) => {
        received = (await request.json()) as CreateSajuReadingInputType;
        guestKey = request.headers.get('x-guest-key');
        return HttpResponse.json(fakeResult(received));
      }),
    );
    renderPage();
    fireEvent.change(screen.getByLabelText('년'), { target: { value: '1990' } });
    fireEvent.change(screen.getByLabelText('월'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('일'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('시'), { target: { value: '14' } });
    fireEvent.change(screen.getByLabelText('분'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('radio', { name: '남' }));
    fireEvent.click(screen.getByRole('button', { name: /사주 세우기/ }));

    // 원국은 클라이언트가 즉시 계산 — 경오 신사 경진 계미.
    await waitFor(() => expect(screen.getAllByTestId('saju-chart').length).toBeGreaterThan(0));
    expect(screen.getAllByText('庚').length).toBeGreaterThan(0);
    expect(screen.getByText('庚午 辛巳 庚辰 癸未')).toBeInTheDocument();

    await waitFor(() => expect(received).not.toBeNull());
    expect(received!.birth).toMatchObject({ year: 1990, month: 5, day: 15, hour: 14, minute: 30, gender: 'M', calendar: 'solar' });
    expect(guestKey).toMatch(/^[A-Za-z0-9_-]{8,}$/);

    fireEvent.click(screen.getByRole('button', { name: '성격' }));
    await waitFor(() => expect(screen.getByText('곧게 선 무쇠')).toBeInTheDocument());
    expect(screen.getByText('성격 본문입니다.')).toBeInTheDocument();
    // 조언은 오행 서브로 흡수 — 키워드·행운 표가 오행 탭에.
    fireEvent.click(screen.getByRole('button', { name: '오행' }));
    expect(screen.getByText('“결단”')).toBeInTheDocument();
    expect(screen.getByText('조언 본문입니다.')).toBeInTheDocument();
    expect(screen.getByText('AI 풀이')).toBeInTheDocument();

    // 기기 프로필 저장(기본 체크).
    expect(useSajuProfileStore.getState().profiles[0]).toMatchObject({ label: '나', birth: { year: 1990, month: 5, day: 15 } });
  });

  it('지원 범위 밖 연도는 오류 문구', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('년'), { target: { value: '1850' } });
    fireEvent.click(screen.getByRole('button', { name: /사주 세우기/ }));
    await waitFor(() => expect(screen.getByText(/1900~2050/)).toBeInTheDocument());
    expect(screen.queryByTestId('saju-chart')).toBeNull();
  });

  it('요청 실패면 원국은 보이고 다시 시도 안내', async () => {
    server.use(http.post('/api/v1/saju-c/readings', () => HttpResponse.json({ statusCode: 500, error: 'x', message: 'boom' }, { status: 500 })));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /사주 세우기/ }));
    await waitFor(() => expect(screen.getAllByTestId('saju-chart').length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByText(/풀이 요청이 실패했어요/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeInTheDocument();
  });
  it('도구 탭(흐름·테마 그룹) — 오늘·택일·음식을 열면 각 API 를 부르고, 궁합은 입구 모드로 본다', async () => {
    const birth = { year: 1990, month: 5, day: 15, hour: 14, minute: 30, gender: 'M', calendar: 'solar', leapMonth: false, options: { solarTimeCorrection: true, lateRatHour: false } } as const;
    const calls: string[] = [];
    server.use(
      http.post('/api/v1/saju-c/readings', async ({ request }) => HttpResponse.json(fakeResult((await request.json()) as CreateSajuReadingInputType))),
      http.post('/api/v1/saju-c/daily', () => {
        calls.push('daily');
        return HttpResponse.json({
          dayKey: '2026-09-06',
          day: { date: '2026-09-06', lunar: null, weekday: 0, ko: '계미', hanja: '癸未', element: 'water', stemTenGod: 'sanggwan', twelveStage: '묘', score: 72, stars: 4, tags: ['cheoneul'] },
          dayMaster: { index: 6, ko: '경', hanja: '庚', element: 'metal', yang: true, symbol: '바위' },
          headline: '오늘의 한 줄 요약',
          body: '오늘 본문입니다.',
          advice: '오늘 조언입니다.',
          lucky: { element: 'wood', colors: ['초록'], directions: ['동쪽'], numbers: [3], foods: ['나물'] },
          source: 'llm',
          model: 'fake',
          quota: { remainingToday: 8 },
        });
      }),
      http.post('/api/v1/saju-c/themes', async ({ request }) => {
        calls.push('themes');
        return HttpResponse.json(fakeThemes((await request.json()) as CreateSajuReadingInputType, 'static'));
      }),
      http.post('/api/v1/saju-c/food', () => {
        calls.push('food');
        return HttpResponse.json({
          picks: [
            { menuId: 'bibimbap', name: '비빔밥', cuisine: 'korean', dishType: 'rice', kcal: 550, elements: ['wood', 'earth'], reason: '나물의 목 기운.' },
            { menuId: 'soba', name: '메밀소바', cuisine: 'japanese', dishType: 'noodle', kcal: null, elements: ['wood'], reason: '메밀의 목 기운.' },
            { menuId: 'salad-bowl', name: '샐러드 볼', cuisine: 'western', dishType: 'salad', kcal: null, elements: ['wood'], reason: '푸른 채소.' },
          ],
          primary: 'wood', secondary: 'water', avoid: ['metal'], dayElement: 'water', profile: '목 기운을 채우는 신맛 쪽', avoidText: '금 기운은 조금만', source: 'static', model: null, quota: { remainingToday: 8 },
        });
      }),
      http.post('/api/v1/saju-c/date-pick', async ({ request }) => {
        const body = (await request.json()) as { purpose: string; days: number };
        calls.push('date:' + body.purpose + ':' + body.days);
        const day = (i: number) => ({ date: '2026-09-' + String(6 + i).padStart(2, '0'), lunar: null, weekday: i % 7, ko: '계미', hanja: '癸未', element: 'water', stemTenGod: 'jeongjae', twelveStage: '묘', score: 60, stars: 3, tags: [], purposeScore: 60 + i, purposeStars: i > 5 ? 5 : 3 });
        const days = Array.from({ length: body.days }, (_, i) => day(i));
        return HttpResponse.json({ purpose: body.purpose, from: '2026-09-06', days, top: [{ ...day(9), reason: '손 없는 날이에요.' }, { ...day(8), reason: '두 번째.' }, { ...day(7), reason: '세 번째.' }], source: 'static', model: null, quota: { remainingToday: 8 } });
      }),
      http.post('/api/v1/saju-c/match', async ({ request }) => {
        const body = (await request.json()) as { labels: { b: string } };
        calls.push('match:' + body.labels.b);
        return HttpResponse.json({
          score: 78, grade: 'good', gradeKo: '잘 맞는 사이',
          breakdown: [{ key: 'dayMaster', label: '일간', score: 18, max: 25, note: '상생.' }],
          relations: [], mutual: { aToB: 'jeonggwan', bToA: 'jeongjae' },
          a: { label: '나', dayMaster: { index: 6, ko: '경', hanja: '庚', element: 'metal', yang: true, symbol: '바위' }, zodiac: { index: 6, ko: '오', hanja: '午', element: 'fire', yang: true, animal: '말', hidden: [2, 5, 3], hourStart: 11, season: 'summer' }, signature: '경오 신사 경진 계미' },
          b: { label: '그 사람', dayMaster: { index: 1, ko: '을', hanja: '乙', element: 'wood', yang: false, symbol: '풀' }, zodiac: { index: 8, ko: '신', hanja: '申', element: 'metal', yang: true, animal: '원숭이', hidden: [4, 8, 6], hourStart: 15, season: 'autumn' }, signature: '임신 신해 을묘 --' },
          summary: '궁합 요약입니다.', strengths: ['a', 'b', 'c'], cautions: ['d', 'e'], advice: '궁합 조언입니다.', source: 'llm', model: 'fake', quota: { remainingToday: 8 },
        });
      }),
    );
    void birth;
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /사주 세우기/ }));
    await waitFor(() => expect(screen.getAllByTestId('saju-chart').length).toBeGreaterThan(0));

    // 흐름 그룹 → 오늘·택일.
    fireEvent.click(screen.getByRole('tab', { name: '흐름' }));
    fireEvent.click(screen.getByRole('button', { name: '오늘' }));
    await waitFor(() => expect(screen.getByText('오늘의 한 줄 요약')).toBeInTheDocument());
    expect(screen.getByText('오늘 본문입니다.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '택일' }));
    await waitFor(() => expect(screen.getByText('손 없는 날이에요.')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('radio', { name: '이사' }));
    await waitFor(() => expect(calls).toContain('date:move:30'));

    // 테마 그룹 → 첫 서브(인연)가 열리며 테마 job 요청, 음식은 같은 그룹.
    fireEvent.click(screen.getByRole('tab', { name: '테마' }));
    await waitFor(() => expect(calls).toContain('themes'));
    fireEvent.click(screen.getByRole('button', { name: '음식' }));
    await waitFor(() => expect(screen.getByText('비빔밥')).toBeInTheDocument());
    expect(screen.getByText(/약 550kcal/)).toBeInTheDocument();
    expect(calls.filter((c) => c === 'daily')).toHaveLength(1);
    expect(calls.filter((c) => c === 'themes')).toHaveLength(1);

    // 궁합은 입구 모드 — 다시 입력 → "우리 궁합" → 상대 입력 → 결과 패널.
    fireEvent.click(screen.getByRole('button', { name: '다시 입력' }));
    fireEvent.click(screen.getByRole('radio', { name: '우리 궁합' }));
    fireEvent.change(screen.getByLabelText('상대 호칭'), { target: { value: '그 사람' } });
    fireEvent.change(screen.getByLabelText('상대 년'), { target: { value: '1992' } });
    fireEvent.click(screen.getByRole('button', { name: '궁합 보기' }));
    await waitFor(() => expect(screen.getByTestId('saju-pair-panel')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('saju-match-result')).toBeInTheDocument());
    expect(screen.getByText('잘 맞는 사이')).toBeInTheDocument();
    expect(screen.getByText('궁합 요약입니다.')).toBeInTheDocument();
    expect(calls).toContain('match:그 사람');
  });

  it('테마 탭 — 인연·재물·직업은 계산 카드가 즉시 보이고 LLM 문장은 job 으로 도착한다', async () => {
    let themesBody: { readingId?: string } | null = null;
    server.use(
      http.post('/api/v1/saju-c/readings', async ({ request }) => HttpResponse.json(fakeResult((await request.json()) as CreateSajuReadingInputType))),
      http.post('/api/v1/saju-c/themes', async ({ request }) => {
        const input = (await request.json()) as CreateSajuReadingInputType & { readingId?: string };
        themesBody = input;
        const t = fakeThemes(input, 'pending');
        return HttpResponse.json({ ...t, jobId: 'tjob1234567' });
      }),
      http.get('/api/v1/saju-c/themes/jobs/tjob1234567', ({ request }) => {
        const url = new URL(request.url);
        const after = Number(url.searchParams.get('after') ?? '0');
        const t = fakeThemes({ birth: { year: 1990, month: 1, day: 1, hour: null, minute: null, gender: 'M', calendar: 'solar', leapMonth: false, options: { solarTimeCorrection: true, lateRatHour: false } } }, 'ready');
        return HttpResponse.json({ jobId: 'tjob1234567', version: after + 1, themes: t.themes, done: true, readingId: null, source: 'llm' });
      }),
    );
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /사주 세우기/ }));
    await waitFor(() => expect(screen.getAllByTestId('saju-chart').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('tab', { name: '테마' }));
    // 계산 카드(배우자성·배우자 자리)는 즉시.
    expect(screen.getByTestId('saju-theme-love')).toBeInTheDocument();
    expect(screen.getByLabelText('배우자성')).toBeInTheDocument();
    expect(screen.getByLabelText('배우자 자리')).toBeInTheDocument();
    await waitFor(() => expect(themesBody).not.toBeNull());
    // job 도착 → LLM 헤드라인.
    await waitFor(() => expect(screen.getByText('천천히 깊어지는 인연')).toBeInTheDocument());
    expect(screen.getByText('인연 본문입니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /이 사람과 궁합 보기/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '재물' }));
    expect(screen.getByTestId('saju-theme-wealth')).toBeInTheDocument();
    expect(screen.getByLabelText('재물 스타일')).toBeInTheDocument();
    expect(screen.getByText('쌓이는 곳간')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '직업' }));
    expect(screen.getByTestId('saju-theme-career')).toBeInTheDocument();
    expect(screen.getByText('회계·재무')).toBeInTheDocument();
    expect(screen.getByText('판을 여는 사람')).toBeInTheDocument();
    // "이 사람과 궁합 보기" → 입구 궁합 모드.
    fireEvent.click(screen.getByRole('button', { name: '인연' }));
    fireEvent.click(screen.getByRole('button', { name: /이 사람과 궁합 보기/ }));
    expect(screen.getByRole('radio', { name: '우리 궁합' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('상대 년')).toBeInTheDocument();
  });
  it('회원: 서버 프로필 칩이 뜨고 "이 계정에 저장" 이면 프로필 생성 API 를 부른다', async () => {
    useAuthStore.setState({ token: 'tok', user: { id: 'u1', email: 'u@x.com', role: 'USER' } as never, isGuest: false });
    let created: unknown = null;
    server.use(
      http.get('/api/v1/saju-c/me/profiles', () =>
        HttpResponse.json({ items: [{ id: 'p1', label: '엄마', isPrimary: true, birth: { calendar: 'solar', year: 1965, month: 3, day: 3, leapMonth: false, hour: null, minute: null, gender: 'F', options: { solarTimeCorrection: true, lateRatHour: false } }, createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z' }] }),
      ),
      http.post('/api/v1/saju-c/me/profiles', async ({ request }) => {
        created = await request.json();
        return HttpResponse.json({ id: 'p2', ...(created as object), createdAt: '', updatedAt: '' });
      }),
      http.post('/api/v1/saju-c/readings', async ({ request }) => HttpResponse.json(fakeResult((await request.json()) as CreateSajuReadingInputType))),
    );
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /엄마/ })).toBeInTheDocument());
    expect(screen.getByLabelText('이 계정에 저장')).toBeChecked();
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '나' } });
    fireEvent.click(screen.getByRole('button', { name: /사주 세우기/ }));
    await waitFor(() => expect(created).not.toBeNull());
    expect(created).toMatchObject({ label: '나', isPrimary: false, birth: { year: 1990, month: 1, day: 1 } });
    // 저장된 프로필을 고르면 저장 체크가 사라진다(중복 생성 방지).
  });

  it('회원: 프로필 칩을 고르면 입력이 채워지고 저장 체크가 숨는다', async () => {
    useAuthStore.setState({ token: 'tok', user: { id: 'u1', email: 'u@x.com', role: 'USER' } as never, isGuest: false });
    server.use(
      http.get('/api/v1/saju-c/me/profiles', () =>
        HttpResponse.json({ items: [{ id: 'p1', label: '엄마', isPrimary: true, birth: { calendar: 'solar', year: 1965, month: 3, day: 3, leapMonth: false, hour: null, minute: null, gender: 'F', options: { solarTimeCorrection: true, lateRatHour: false } }, createdAt: '', updatedAt: '' }] }),
      ),
    );
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /엄마/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /엄마/ }));
    expect(screen.getByLabelText('년')).toHaveValue(1965);
    expect(screen.queryByLabelText('이 계정에 저장')).toBeNull();
  });
});
