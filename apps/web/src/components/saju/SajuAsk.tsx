import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MessageCircleQuestion, Sparkles } from 'lucide-react';
import type { SajuAskResultType, SajuAskTopicType, SajuAskWhenType, SajuBirthInputType, SajuProfileType } from '@repo/api-contract';
import { SAJU_ASK_QUESTION_MAX_LENGTH } from '@repo/api-contract';
import { useAuthStore, useSajuAsk, useSajuProfileStore, useSajuProfiles } from '@repo/shared';
import { SAJU_ASK_TOPIC_META, SAJU_ASK_TOPICS, sajuAskBlockedReason, sajuAskOf, type SajuAskWindow, type SajuChart } from '@repo/utils';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { SAJU_SOURCE_LABEL } from './sajuTheme';

// 사주에 묻기(9차) — "만약에 이랬다면". 주제 칩(9) + 시점 + 자유 텍스트(선택) + 상대(결혼·고백, 선택).
// 계산(시점 점수·판정·대안·근거)은 utils 로 즉시 그리고, "물어보기" 를 누르면 서버가 같은 계산 위에 LLM 답을 얹는다.
// 답할 수 없는 주제(건강·법률·사행성)는 클라이언트에서 먼저 막고 서버도 막는다. "타로로도 보기" 는 질문·주제를 타로 페이지에 넘긴다.

const field =
  'w-full min-w-0 rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-[#f3e9c6] placeholder:text-[#e9e2d2]/30 focus:border-[#d9b65b] focus:outline-none' +
  ' scheme-dark [&>option]:bg-[#16130f] [&>option]:text-[#f3e9c6]';
const chip = (active: boolean) =>
  cn('rounded-full border px-3 py-1 text-xs transition', active ? 'border-[#d9b65b] bg-[#d9b65b]/15 text-[#f3e9c6]' : 'border-white/15 text-[#e9e2d2]/70 hover:border-white/40');

const VERDICT_STYLE = { good: 'border-[#d9b65b]/60 text-[#d9b65b]', ok: 'border-white/25 text-[#e9e2d2]/80', careful: 'border-[#ffb4a2]/50 text-[#ffb4a2]' } as const;

const Stars = ({ n }: { n: number }) => (
  <span className="text-[#d9b65b]" aria-label={`별 ${n}개`}>
    {'★'.repeat(n)}
    <span className="text-[#e9e2d2]/20">{'★'.repeat(5 - n)}</span>
  </span>
);

const WindowRow = ({ w, current }: { w: SajuAskWindow; current?: boolean }) => (
  <li className={cn('rounded-lg border px-2 py-1 text-[11px]', current ? 'border-[#d9b65b]/60 bg-[#d9b65b]/10' : 'border-white/10')}>
    <div className="flex items-center gap-2">
      <span className="font-serif-kr text-[#f3e9c6]">{w.label}</span>
      <span className="text-[#e9e2d2]/60">{w.score}점</span>
      <Stars n={w.stars} />
    </div>
    <div className="text-[#e9e2d2]/60">{w.reasons.join(' · ')}</div>
  </li>
);

const todayIso = (): string => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
type WhenKind = SajuAskWhenType['kind'];
const WHEN_LABEL: Record<WhenKind, string> = { 'this-month': '이번 달', 'this-year': '올해', year: '연도', date: '날짜' };

export const SajuAskBox = ({ birth, chart }: { birth: SajuBirthInputType; chart: SajuChart }) => {
  const isMember = useAuthStore((s) => !!s.token);
  const localProfiles = useSajuProfileStore((s) => s.profiles);
  const serverProfiles = useSajuProfiles();
  const profiles: Array<{ id: string; label: string; birth: SajuBirthInputType }> = isMember
    ? (serverProfiles.data?.items ?? []).map((p: SajuProfileType) => ({ id: p.id, label: p.label, birth: p.birth }))
    : localProfiles.map((p) => ({ id: p.id, label: p.label, birth: p.birth }));

  const [topic, setTopic] = useState<SajuAskTopicType>('job-change');
  const [whenKind, setWhenKind] = useState<WhenKind>('this-year');
  const [year, setYear] = useState(chart.asOf.year + 1);
  const [date, setDate] = useState(todayIso);
  const [question, setQuestion] = useState('');
  const [partner, setPartner] = useState<{ id: string; label: string; birth: SajuBirthInputType } | null>(null);
  const ask = useSajuAsk();

  const meta = SAJU_ASK_TOPIC_META[topic];
  const needsPartner = topic === 'marriage' || topic === 'confess';
  const validYear = Number.isInteger(year) && year >= chart.asOf.year && year <= 2050;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const when: SajuAskWhenType =
    whenKind === 'year' ? { kind: 'year', year: validYear ? year : chart.asOf.year } : whenKind === 'date' ? { kind: 'date', date: validDate ? date : todayIso() } : { kind: whenKind };
  // 계산은 렌더 중 즉시 — 서버 답과 같은 함수.
  const facts = sajuAskOf(chart, { topic, when });
  const blocked = sajuAskBlockedReason(question);
  const result: SajuAskResultType | null = ask.data ?? null;
  const tarotQ = question.trim() || `${meta.ko} — ${facts.whenKo}에 하면 어떨까`;
  const tarotHref = `/tarot?q=${encodeURIComponent(tarotQ)}&topic=${meta.tarotTopic}`;

  const submit = () => {
    if (blocked) return;
    ask.mutate({ birth, topic, when, question: question.trim(), ...(needsPartner && partner ? { partner: partner.birth, partnerLabel: partner.label } : {}) });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="saju-ask">
      <div className="flex items-center gap-2">
        <MessageCircleQuestion className="size-4 text-[#d9b65b]" />
        <div className="font-serif-kr text-base font-bold text-[#f3e9c6]">만약에 이랬다면 — 사주에 묻기</div>
      </div>
      <p className="text-[11px] text-[#e9e2d2]/55">주제와 시점을 고르면 내 사주에 대 본 점수와 근거가 바로 나와요. 상황을 적고 물어보면 AI 가 그 위에 답을 써요.</p>

      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="주제">
        {SAJU_ASK_TOPICS.map((t) => (
          <button key={t} type="button" role="radio" aria-checked={topic === t} onClick={() => { setTopic(t); ask.reset(); }} className={chip(topic === t)} title={SAJU_ASK_TOPIC_META[t].hint}>
            {SAJU_ASK_TOPIC_META[t].ko}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="시점">
        {(Object.keys(WHEN_LABEL) as WhenKind[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={whenKind === k} onClick={() => { setWhenKind(k); ask.reset(); }} className={chip(whenKind === k)}>
            {WHEN_LABEL[k]}
          </button>
        ))}
        {whenKind === 'year' && (
          <input aria-label="연도" type="number" inputMode="numeric" min={chart.asOf.year} max={2050} value={year} onChange={(e) => { setYear(Number(e.target.value)); ask.reset(); }} className={cn(field, 'w-24')} />
        )}
        {whenKind === 'date' && <input aria-label="날짜" type="date" value={date} onChange={(e) => { setDate(e.target.value); ask.reset(); }} className={cn(field, 'w-40')} />}
      </div>

      {needsPartner && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#e9e2d2]/60" aria-label="상대">
          <span>상대(선택)</span>
          <button type="button" onClick={() => { setPartner(null); ask.reset(); }} className={chip(partner === null)}>
            없이
          </button>
          {profiles.map((p) => (
            <button key={p.id} type="button" onClick={() => { setPartner(p); ask.reset(); }} className={chip(partner?.id === p.id)}>
              {p.label}
            </button>
          ))}
          {profiles.length === 0 && <span className="text-[#e9e2d2]/40">저장된 사주가 있으면 궁합 점수를 근거에 더해요</span>}
        </div>
      )}

      <textarea
        aria-label="질문"
        value={question}
        maxLength={SAJU_ASK_QUESTION_MAX_LENGTH}
        rows={2}
        placeholder={`예) ${meta.hint} — 지금 상황을 한두 줄로`}
        onChange={(e) => { setQuestion(e.target.value); ask.reset(); }}
        className={cn(field, 'resize-none')}
      />
      {blocked && <p className="text-[11px] text-[#ffb4a2]">{blocked} 주제는 사주로 답하지 않아요. 몸·법·돈의 확률은 전문가와 상의하는 게 맞아요.</p>}

      {/* 계산 근거 — 즉시 */}
      <div className="rounded-lg border border-[#d9b65b]/30 p-2 text-xs" aria-label="계산 근거">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-full border px-2 py-px text-[11px]', VERDICT_STYLE[facts.verdict])}>{facts.verdictKo}</span>
          <span className="text-[#e9e2d2]/70">
            {meta.ko} · {facts.whenKo}
          </span>
        </div>
        <ul className="mt-1.5 flex flex-col gap-1">
          <WindowRow w={facts.window} current />
        </ul>
        {facts.alternatives.length > 0 && (
          <>
            <div className="mt-1.5 text-[10px] text-[#d9b65b]">더 좋은 시점</div>
            <ul className="mt-0.5 flex flex-col gap-1">
              {facts.alternatives.map((a) => (
                <WindowRow key={a.label} w={a} />
              ))}
            </ul>
          </>
        )}
        <ul className="mt-1.5 flex flex-col gap-0.5 text-[11px] text-[#e9e2d2]/65">
          {facts.basis.map((b) => (
            <li key={b}>· {b}</li>
          ))}
          <li>· {facts.luckNote}</li>
        </ul>
      </div>

      <Button type="button" onClick={submit} disabled={!!blocked || ask.isPending} className="h-10 bg-[#b8322a] text-[#f7eddc] hover:bg-[#cc3d33]">
        {ask.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} 물어보기
      </Button>
      {ask.isError && <p className="text-xs text-[#ffb4a2]">답을 불러오지 못했어요. 다시 시도해 주세요.</p>}

      {result && (
        <div className="flex flex-col gap-2" data-testid="saju-ask-result">
          <div className="flex items-center gap-2 text-[11px] text-[#e9e2d2]/60">
            <span className={cn('rounded-full border px-2 py-px', VERDICT_STYLE[result.verdict])}>{result.verdictKo}</span>
            <span className={cn('rounded-full border px-1.5 py-px text-[10px]', result.source === 'llm' ? 'border-[#d9b65b]/60 text-[#d9b65b]' : 'border-white/20 text-[#e9e2d2]/60')}>{SAJU_SOURCE_LABEL[result.source]}</span>
            {result.match && (
              <span>
                {result.match.label}와의 궁합 {result.match.score}점 · {result.match.gradeKo}
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed text-[#e9e2d2]/85">{result.answer}</p>
          {result.conditions.length > 0 && (
            <ul className="rounded-lg border border-[#d9b65b]/30 p-2 text-xs text-[#e9e2d2]/80">
              {result.conditions.map((c) => (
                <li key={c}>· {c}</li>
              ))}
            </ul>
          )}
          {result.timingNote && <p className="text-xs text-[#e9e2d2]/70">{result.timingNote}</p>}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-[#e9e2d2]/55">
        <span>같은 질문을 카드로도 볼 수 있어요.</span>
        <Link to={tarotHref} className="text-[#d9b65b] underline-offset-2 hover:underline">
          타로로도 보기 →
        </Link>
      </div>
    </div>
  );
};
