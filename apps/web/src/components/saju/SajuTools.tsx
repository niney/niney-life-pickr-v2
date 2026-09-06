import { useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import type { SajuBirthInputType, SajuDatePurposeType, SajuMatchResultType } from '@repo/api-contract';
import { useSajuDailyQuery, useSajuDatePickQuery, useSajuFoodQuery, useSajuMatchQuery, useSajuProfileStore } from '@repo/shared';
import { SAJU_DATE_PURPOSE_LABEL, SAJU_DATE_PURPOSES, SAJU_DAY_TAG_LABEL, SAJU_TEN_GOD_META, SAJU_WUXING_META, TAROT_MENU_CUISINE_LABEL, TAROT_MENU_DISH_LABEL, type TarotMenuCuisine, type TarotMenuDishType } from '@repo/utils';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { SAJU_SOURCE_LABEL, WUXING_COLOR, WUXING_TEXT_COLOR } from './sajuTheme';

// "선택" 도구 4종 — 오늘의 운세 · 오행 음식 · 택일 · 궁합. 풀이 패널 탭에서 열리며, 열리는 순간 query 로 부른다
// (같은 입력은 캐시). 계산값(점수·후보·별점)은 서버가 utils 로 결정적으로 만들고 문장만 LLM/정적.

const field = 'rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-[#f3e9c6] focus:border-[#d9b65b] focus:outline-none';

const Stars = ({ n }: { n: number }) => (
  <span className="inline-flex gap-0.5" aria-label={`별 ${n}개`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <Star key={i} className={cn('size-3.5', i <= n ? 'fill-[#d9b65b] text-[#d9b65b]' : 'text-white/20')} />
    ))}
  </span>
);

const SourceBadge = ({ source }: { source: 'llm' | 'static' }) => (
  <span className={cn('rounded-full border px-1.5 py-px text-[10px]', source === 'llm' ? 'border-[#d9b65b]/60 text-[#d9b65b]' : 'border-white/20 text-[#e9e2d2]/60')}>
    {SAJU_SOURCE_LABEL[source]}
  </span>
);

const Loading = ({ text }: { text: string }) => (
  <div className="flex items-center gap-2 py-6 text-xs text-[#e9e2d2]/60">
    <Loader2 className="size-4 animate-spin text-[#d9b65b]" /> {text}
  </div>
);
const Failed = ({ onRetry }: { onRetry: () => void }) => (
  <div className="rounded-lg border border-[#ffb4a2]/40 p-2 text-xs text-[#ffb4a2]">
    불러오지 못했어요.
    <Button type="button" size="sm" variant="ghost" onClick={onRetry} className="ml-2 h-7 text-[#f3e9c6]">
      다시 시도
    </Button>
  </div>
);

// ── 오늘의 운세 ─────────────────────────────────────────────────────────────

export const SajuDailyBox = ({ birth }: { birth: SajuBirthInputType }) => {
  const q = useSajuDailyQuery({ birth });
  if (q.isPending) return <Loading text="오늘의 일진을 읽는 중…" />;
  if (q.isError || !q.data) return <Failed onRetry={() => void q.refetch()} />;
  const d = q.data;
  return (
    <div className="flex flex-col gap-3" data-testid="saju-daily">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] text-[#d9b65b]">{d.dayKey} · {d.day.ko}({d.day.hanja})일</div>
          <div className="font-serif-kr text-base font-bold text-[#f3e9c6]">{d.headline}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Stars n={d.day.stars} />
          <SourceBadge source={d.source} />
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {d.day.tags.slice(0, 4).map((t) => (
          <span key={t} className="rounded-full border border-white/15 px-2 py-px text-[10px] text-[#e9e2d2]/70">
            {SAJU_DAY_TAG_LABEL[t]}
          </span>
        ))}
        <span className="rounded-full border border-white/15 px-2 py-px text-[10px] text-[#e9e2d2]/70">{SAJU_TEN_GOD_META[d.day.stemTenGod].ko}의 날</span>
      </div>
      <p className="text-sm leading-relaxed text-[#e9e2d2]/85">{d.body}</p>
      <p className="rounded-lg border border-[#d9b65b]/30 p-2 text-xs text-[#e9e2d2]/85">{d.advice}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#e9e2d2]/70">
        <span>
          기운 <span style={{ color: WUXING_TEXT_COLOR[d.lucky.element] }}>{SAJU_WUXING_META[d.lucky.element].ko}</span>
        </span>
        <span>색 {d.lucky.colors.join('·')}</span>
        <span>방향 {d.lucky.directions.join('·')}</span>
        <span>숫자 {d.lucky.numbers.join('·')}</span>
      </div>
    </div>
  );
};

// ── 오행 음식 ───────────────────────────────────────────────────────────────

export const SajuFoodBox = ({ birth }: { birth: SajuBirthInputType }) => {
  const [today, setToday] = useState(true);
  const q = useSajuFoodQuery({ birth, today });
  return (
    <div className="flex flex-col gap-3" data-testid="saju-food">
      <label className="flex items-center gap-2 text-xs text-[#e9e2d2]/70">
        <input type="checkbox" checked={today} onChange={(e) => setToday(e.target.checked)} className="accent-[#d9b65b]" />
        오늘 일진 기운도 반영
      </label>
      {q.isPending && <Loading text="오행에 맞는 메뉴를 고르는 중…" />}
      {(q.isError || (!q.isPending && !q.data)) && <Failed onRetry={() => void q.refetch()} />}
      {q.data && (
        <>
          <div className="flex items-center justify-between text-[11px] text-[#e9e2d2]/70">
            <span>{q.data.profile}</span>
            <SourceBadge source={q.data.source} />
          </div>
          <ol className="flex flex-col gap-2">
            {q.data.picks.map((p, i) => (
              <li key={p.menuId} className={cn('rounded-xl border p-3', i === 0 ? 'border-[#d9b65b]/60 bg-[#d9b65b]/10' : 'border-white/10')}>
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] text-[#d9b65b]">{i === 0 ? '추천' : '대안'}</span>
                  <span className="font-serif-kr text-base font-bold text-[#f3e9c6]">{p.name}</span>
                  <span className="text-[10px] text-[#e9e2d2]/50">
                    {TAROT_MENU_CUISINE_LABEL[p.cuisine as TarotMenuCuisine]}·{TAROT_MENU_DISH_LABEL[p.dishType as TarotMenuDishType]}
                    {p.kcal !== null && ` · 약 ${p.kcal}kcal`}
                  </span>
                  <span className="ml-auto flex gap-1">
                    {p.elements.map((e) => (
                      <span key={e} className="size-2.5 rounded-full" style={{ background: WUXING_COLOR[e] }} title={SAJU_WUXING_META[e].ko} />
                    ))}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[#e9e2d2]/80">{p.reason}</p>
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-[#e9e2d2]/50">{q.data.avoidText}</p>
        </>
      )}
    </div>
  );
};

// ── 택일 ────────────────────────────────────────────────────────────────────

const STAR_BG: Record<number, string> = { 5: 'bg-[#d9b65b] text-[#1a1408]', 4: 'bg-[#d9b65b]/55 text-[#1a1408]', 3: 'bg-white/10 text-[#e9e2d2]/80', 2: 'bg-white/5 text-[#e9e2d2]/45', 1: 'bg-black/30 text-[#e9e2d2]/30' };

export const SajuDatePickBox = ({ birth }: { birth: SajuBirthInputType }) => {
  const [purpose, setPurpose] = useState<SajuDatePurposeType>('general');
  const [days, setDays] = useState<30 | 60>(30);
  const q = useSajuDatePickQuery({ birth, purpose, days });
  return (
    <div className="flex flex-col gap-3" data-testid="saju-date-pick">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="용도">
        {SAJU_DATE_PURPOSES.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={purpose === p}
            onClick={() => setPurpose(p)}
            className={cn('rounded-full border px-3 py-1 text-xs transition', purpose === p ? 'border-[#d9b65b] bg-[#d9b65b]/15 text-[#f3e9c6]' : 'border-white/15 text-[#e9e2d2]/70 hover:border-white/40')}
          >
            {SAJU_DATE_PURPOSE_LABEL[p]}
          </button>
        ))}
        <button type="button" onClick={() => setDays(days === 30 ? 60 : 30)} className="ml-auto rounded-full border border-white/15 px-3 py-1 text-xs text-[#e9e2d2]/70 hover:border-white/40">
          {days}일
        </button>
      </div>
      {q.isPending && <Loading text="좋은 날을 고르는 중…" />}
      {(q.isError || (!q.isPending && !q.data)) && <Failed onRetry={() => void q.refetch()} />}
      {q.data && (
        <>
          <ol className="flex flex-col gap-2">
            {q.data.top.map((d, i) => (
              <li key={d.date} className={cn('rounded-xl border p-3', i === 0 ? 'border-[#d9b65b]/60 bg-[#d9b65b]/10' : 'border-white/10')}>
                <div className="flex items-center gap-2">
                  <span className="font-serif-kr text-base font-bold text-[#f3e9c6]">
                    {d.date.slice(5).replace('-', '/')} <span className="text-xs text-[#e9e2d2]/60">({['일', '월', '화', '수', '목', '금', '토'][d.weekday]})</span>
                  </span>
                  <span className="text-[11px] text-[#e9e2d2]/60">{d.ko}일</span>
                  <span className="ml-auto">
                    <Stars n={d.purposeStars} />
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[#e9e2d2]/80">{d.reason}</p>
              </li>
            ))}
          </ol>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px]" aria-label="날짜별 점수">
            {['일', '월', '화', '수', '목', '금', '토'].map((w) => (
              <div key={w} className="text-[#e9e2d2]/40">{w}</div>
            ))}
            {Array.from({ length: q.data.days[0]?.weekday ?? 0 }, (_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {q.data.days.map((d) => (
              <div key={d.date} title={`${d.date} ${d.ko} ${d.purposeScore}점`} className={cn('rounded py-1', STAR_BG[d.purposeStars])}>
                {Number(d.date.slice(8))}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#e9e2d2]/50">
            <span>{q.data.from}부터 {days}일 · 진할수록 좋은 날</span>
            <SourceBadge source={q.data.source} />
          </div>
        </>
      )}
    </div>
  );
};

// ── 궁합 ────────────────────────────────────────────────────────────────────

const ScoreRing = ({ score }: { score: number }) => {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 80 80" className="size-20 shrink-0" role="img" aria-label={`궁합 ${score}점`}>
      <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
      <circle cx="40" cy="40" r={r} fill="none" stroke="#d9b65b" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(c * score) / 100} ${c}`} transform="rotate(-90 40 40)" />
      <text x="40" y="45" textAnchor="middle" fontSize="18" fontWeight="700" fill="#f3e9c6">
        {score}
      </text>
    </svg>
  );
};

const MatchResult = ({ m }: { m: SajuMatchResultType }) => (
  <div className="flex flex-col gap-3" data-testid="saju-match-result">
    <div className="flex items-center gap-3">
      <ScoreRing score={m.score} />
      <div className="min-w-0">
        <div className="font-serif-kr text-lg font-bold text-[#f3e9c6]">{m.gradeKo}</div>
        <div className="text-xs text-[#e9e2d2]/70">
          {m.a.label} {m.a.dayMaster.ko}{m.a.dayMaster.hanja}·{m.a.zodiac.animal}띠 × {m.b.label} {m.b.dayMaster.ko}{m.b.dayMaster.hanja}·{m.b.zodiac.animal}띠
        </div>
        <SourceBadge source={m.source} />
      </div>
    </div>
    <ul className="flex flex-col gap-1.5">
      {m.breakdown.map((b) => (
        <li key={b.key} className="text-[11px]">
          <div className="flex justify-between text-[#e9e2d2]/75">
            <span>{b.label}</span>
            <span>
              {b.score}/{b.max}
            </span>
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-white/10">
            <div className="h-full rounded bg-[#d9b65b]" style={{ width: `${(b.score / b.max) * 100}%` }} />
          </div>
          <div className="mt-0.5 text-[10px] text-[#e9e2d2]/50">{b.note}</div>
        </li>
      ))}
    </ul>
    <p className="text-sm leading-relaxed text-[#e9e2d2]/85">{m.summary}</p>
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div className="rounded-lg border border-[#d9b65b]/30 p-2">
        <div className="mb-1 text-[10px] text-[#d9b65b]">잘 맞는 점</div>
        <ul className="flex flex-col gap-0.5 text-[#e9e2d2]/80">{m.strengths.map((x) => <li key={x}>· {x}</li>)}</ul>
      </div>
      <div className="rounded-lg border border-[#ffb4a2]/30 p-2">
        <div className="mb-1 text-[10px] text-[#ffb4a2]">부딪힐 수 있는 점</div>
        <ul className="flex flex-col gap-0.5 text-[#e9e2d2]/80">{m.cautions.map((x) => <li key={x}>· {x}</li>)}</ul>
      </div>
    </div>
    <p className="rounded-lg border border-white/10 p-2 text-xs text-[#e9e2d2]/85">{m.advice}</p>
  </div>
);

export const SajuMatchBox = ({ birth }: { birth: SajuBirthInputType }) => {
  const profiles = useSajuProfileStore((s) => s.profiles);
  // 기본값은 내 사주와 겹치지 않게(같은 해 1월 1일, 반대 성별, 시간 모름).
  const [other, setOther] = useState<SajuBirthInputType>({ ...birth, month: 1, day: 1, leapMonth: false, gender: birth.gender === 'M' ? 'F' : 'M', hour: null, minute: null });
  const [label, setLabel] = useState('상대');
  const [submitted, setSubmitted] = useState<{ b: SajuBirthInputType; label: string } | null>(null);
  const q = useSajuMatchQuery(submitted ? { a: birth, b: submitted.b, labels: { a: '나', b: submitted.label } } : null);
  return (
    <div className="flex flex-col gap-3" data-testid="saju-match">
      {profiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {profiles.map((p) => (
            <button key={p.id} type="button" onClick={() => { setOther(p.birth); setLabel(p.label); }} className="rounded-full border border-white/15 px-3 py-1 text-xs text-[#e9e2d2]/70 hover:border-white/40">
              {p.label}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
        <input aria-label="상대 년" type="number" inputMode="numeric" value={other.year} onChange={(e) => setOther({ ...other, year: Number(e.target.value) })} className={field} />
        <select aria-label="상대 월" value={other.month} onChange={(e) => setOther({ ...other, month: Number(e.target.value), leapMonth: false })} className={field}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}월</option>)}
        </select>
        <select aria-label="상대 일" value={other.day} onChange={(e) => setOther({ ...other, day: Number(e.target.value) })} className={field}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}일</option>)}
        </select>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto_1fr] items-center gap-2">
        <select aria-label="상대 시" value={other.hour === null ? '' : other.hour} onChange={(e) => setOther({ ...other, hour: e.target.value === '' ? null : Number(e.target.value), minute: e.target.value === '' ? null : 0 })} className={field}>
          <option value="">시 모름</option>
          {Array.from({ length: 24 }, (_, i) => i).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}시</option>)}
        </select>
        <div className="flex gap-1" role="radiogroup" aria-label="상대 성별">
          {(['M', 'F'] as const).map((g) => (
            <button key={g} type="button" role="radio" aria-checked={other.gender === g} onClick={() => setOther({ ...other, gender: g })} className={cn('rounded-lg border px-2.5 py-1.5 text-xs', other.gender === g ? 'border-[#d9b65b] bg-[#d9b65b]/10 text-[#f3e9c6]' : 'border-white/10 text-[#e9e2d2]/60')}>
              {g === 'M' ? '남' : '여'}
            </button>
          ))}
        </div>
        <select aria-label="상대 달력" value={other.calendar} onChange={(e) => setOther({ ...other, calendar: e.target.value as 'solar' | 'lunar', leapMonth: false })} className={field}>
          <option value="solar">양력</option>
          <option value="lunar">음력</option>
        </select>
        <input aria-label="상대 호칭" value={label} maxLength={20} onChange={(e) => setLabel(e.target.value)} className={field} placeholder="호칭" />
      </div>
      <Button type="button" onClick={() => setSubmitted({ b: other, label: label.trim() || '상대' })} className="h-10 bg-[#b8322a] text-[#f7eddc] hover:bg-[#cc3d33]">
        궁합 보기
      </Button>
      {submitted && q.isPending && <Loading text="두 사주를 맞춰 보는 중…" />}
      {submitted && q.isError && <Failed onRetry={() => void q.refetch()} />}
      {q.data && <MatchResult m={q.data} />}
      <p className="text-[10px] text-[#e9e2d2]/45">상대의 생년월일은 서버에 저장하지 않아요.</p>
    </div>
  );
};
