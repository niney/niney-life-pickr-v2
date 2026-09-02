import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RotateCcw, Share2, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import type {
  TarotChoicesType,
  TarotDrawnCardType,
  TarotReadingResultType,
  TarotSpreadIdType,
  TarotTopicType,
} from '@repo/api-contract';
import type { TarotHistoryEntry } from '@repo/shared';
import {
  getTarotCard,
  getTarotSetupError,
  getTarotSpread,
  tarotCardKeywords,
  tarotCardMeaning,
  tarotOrientationLabel,
  tarotRemainingPicks,
  tarotRequiredPicks,
  TAROT_AVAILABLE_SPREADS,
  TAROT_CHOICE_MAX_LENGTH,
  TAROT_QUESTION_MAX_LENGTH,
  TAROT_TOPIC_LABEL,
  TAROT_TOPICS,
  type TarotFlowEvent,
  type TarotFlowState,
  type TarotResultStatus,
} from '@repo/utils';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { TarotCardImage } from './TarotCardImage';
import { TarotShareSheet, type TarotShareBase } from './TarotShareSheet';
import type { TarotRenderMode } from './tarotQuality';
import { TAROT_DISCLAIMER, TAROT_SOURCE_LABEL } from './tarotTheme';
import { useTypewriter } from './useTypewriter';

// DOM 오버레이 — 질문·스프레드 설정, 뽑기 HUD, 리빌 HUD, 해석 패널. 3D 무대(또는 Lite 무대) 위에
// 겹치며, 컨테이너는 pointer-events-none 이라 카드 클릭이 무대로 간다. 패널만 이벤트를 받는다.

export interface TarotOverlayProps {
  state: TarotFlowState<TarotReadingResultType>;
  mode: TarotRenderMode;
  send: (event: TarotFlowEvent<TarotReadingResultType>) => void;
  onStart: () => void;
  onAutoPick: () => void;
  onRetry: () => void;
  onReset: () => void;
  history: TarotHistoryEntry[];
  review: TarotHistoryEntry | null;
  onReview: (entry: TarotHistoryEntry | null) => void;
  onRemoveHistory: (id: string) => void;
  isMember: boolean;
  // 회원이 오늘 이미 뽑은 오늘의 카드 id — 있으면 daily 스프레드는 다시 뽑지 않고 기록으로 안내
  // (서버가 하루 1장으로 잠가 새로 뽑아도 저장된 카드가 돌아온다).
  todayDailyId: string | null;
  panelSide: 'right' | 'bottom';
}

const glass = 'rounded-2xl border border-white/10 bg-[#0b1030]/85 text-[#ece6d6] shadow-2xl backdrop-blur-md';

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      'rounded-full border px-3 py-1 text-xs transition',
      active
        ? 'border-[#d9b65b] bg-[#d9b65b]/15 text-[#f3e9c6]'
        : 'border-white/15 text-[#ece6d6]/70 hover:border-white/40 hover:text-[#ece6d6]',
    )}
  >
    {children}
  </button>
);

const SetupPanel = ({
  state,
  send,
  onStart,
  history,
  onReview,
  onRemoveHistory,
  isMember,
  todayDailyId,
}: Pick<
  TarotOverlayProps,
  'state' | 'send' | 'onStart' | 'history' | 'onReview' | 'onRemoveHistory' | 'isMember' | 'todayDailyId'
>) => {
  const error = getTarotSetupError(state);
  const spread = getTarotSpread(state.spreadId);
  const dailyLocked = isMember && state.spreadId === 'daily' && !!todayDailyId;
  return (
    <section
      className={cn(
        glass,
        'pointer-events-auto absolute inset-x-3 bottom-3 top-16 flex max-h-[calc(100%-4.5rem)] flex-col overflow-y-auto p-4 sm:inset-x-auto sm:left-1/2 sm:top-20 sm:w-[26rem] sm:-translate-x-1/2 lg:left-auto lg:right-8 lg:translate-x-0',
      )}
      aria-label="타로 설정"
    >
      <h2 className="font-serif-kr text-lg font-bold text-[#f3e9c6]">무엇이 궁금한가요?</h2>
      <p className="mt-1 text-xs text-[#ece6d6]/60">스프레드와 주제를 고르고, 원하면 질문을 적어 주세요.</p>

      <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="스프레드">
        {TAROT_AVAILABLE_SPREADS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={state.spreadId === s.id}
            onClick={() => send({ type: 'set_spread', spreadId: s.id })}
            className={cn(
              'rounded-xl border p-3 text-left transition',
              state.spreadId === s.id
                ? 'border-[#d9b65b] bg-[#d9b65b]/10'
                : 'border-white/10 hover:border-white/30',
            )}
          >
            <div className="text-sm font-semibold text-[#f3e9c6]">{s.nameKo}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-[#ece6d6]/60">
              {s.positions.length}장 · {s.description}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5" aria-label="주제">
        {TAROT_TOPICS.map((t) => (
          <Chip key={t} active={state.topic === t} onClick={() => send({ type: 'set_topic', topic: t })}>
            {TAROT_TOPIC_LABEL[t]}
          </Chip>
        ))}
      </div>

      {state.spreadId === 'choice' && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(['A', 'B'] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1 text-xs text-[#ece6d6]/70">
              {k}
              <input
                value={k === 'A' ? state.choiceA : state.choiceB}
                maxLength={TAROT_CHOICE_MAX_LENGTH}
                placeholder={k === 'A' ? '예: 치킨' : '예: 피자'}
                onChange={(e) =>
                  send({
                    type: 'set_choices',
                    a: k === 'A' ? e.target.value : state.choiceA,
                    b: k === 'B' ? e.target.value : state.choiceB,
                  })
                }
                className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-[#f3e9c6] placeholder:text-[#ece6d6]/30 focus:border-[#d9b65b] focus:outline-none"
              />
            </label>
          ))}
        </div>
      )}

      <label className="mt-4 flex flex-col gap-1 text-xs text-[#ece6d6]/70">
        질문
        <textarea
          aria-label="질문"
          value={state.question}
          maxLength={TAROT_QUESTION_MAX_LENGTH}
          rows={2}
          placeholder={spread?.id === 'daily' ? '오늘의 카드는 질문 없이도 괜찮아요' : '적지 않아도 돼요. 적으면 해석이 질문에 맞춰져요.'}
          onChange={(e) => send({ type: 'set_question', question: e.target.value })}
          className="resize-none rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-[#f3e9c6] placeholder:text-[#ece6d6]/30 focus:border-[#d9b65b] focus:outline-none"
        />
        <span className="self-end text-[10px] text-[#ece6d6]/40">
          {state.question.length}/{TAROT_QUESTION_MAX_LENGTH}
        </span>
      </label>

      <label className="mt-1 flex items-center gap-2 text-xs text-[#ece6d6]/70">
        <input
          type="checkbox"
          checked={state.reversedEnabled}
          onChange={(e) => send({ type: 'set_reversed', enabled: e.target.checked })}
          className="accent-[#d9b65b]"
        />
        역방향 카드 사용
      </label>

      <Button
        type="button"
        onClick={onStart}
        disabled={!!error || dailyLocked}
        className="mt-4 h-11 w-full bg-[#d9b65b] text-[#1a1408] hover:bg-[#e6c86f] disabled:opacity-40"
      >
        <Wand2 className="size-4" /> 카드 섞기
      </Button>
      {error === 'choice_required' && (
        <p className="mt-1 text-center text-[11px] text-[#ffb4a2]">A 와 B 선택지를 모두 적어 주세요.</p>
      )}
      {dailyLocked && (
        <p className="mt-1 text-center text-[11px] text-[#ece6d6]/70">
          오늘의 카드는 이미 뽑았어요.{' '}
          <Link to={`/me/tarot/${todayDailyId}`} className="text-[#d9b65b] underline-offset-2 hover:underline">
            오늘 카드 보기
          </Link>
        </p>
      )}
      <p className="mt-3 text-center text-[11px] text-[#ece6d6]/45">{TAROT_DISCLAIMER}</p>
      {isMember && (
        <p className="mt-2 text-center text-[11px] text-[#ece6d6]/55">
          리딩은 자동 저장돼요 ·{' '}
          <Link to="/me/tarot" className="text-[#d9b65b] underline-offset-2 hover:underline">
            내 타로 기록
          </Link>
        </p>
      )}

      {!isMember && history.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="mb-2 text-xs font-semibold text-[#ece6d6]/70">최근 리딩 (이 기기)</div>
          <ul className="flex flex-col gap-1">
            {history.slice(0, 5).map((h) => {
              const s = getTarotSpread(h.result.spreadId);
              return (
                <li key={h.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onReview(h)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white/5"
                  >
                    <span className="shrink-0 text-[#d9b65b]">{h.result.keyword}</span>
                    <span className="truncate text-[#ece6d6]/70">
                      {s?.nameKo} · {h.result.question || TAROT_TOPIC_LABEL[h.result.topic]}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] text-[#ece6d6]/40">
                      {new Date(h.createdAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="기록 삭제"
                    onClick={() => onRemoveHistory(h.id)}
                    className="rounded p-1 text-[#ece6d6]/40 hover:text-[#ffb4a2]"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
};

const Hud = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div
    className={cn(
      glass,
      'pointer-events-auto absolute left-1/2 top-3 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 px-3 py-2 text-xs sm:text-sm',
      className,
    )}
  >
    {children}
  </div>
);

const TypedText = ({ text, animate, className }: { text: string; animate: boolean; className?: string }) => {
  const shown = useTypewriter(text, animate);
  const done = shown.length >= text.length;
  return (
    <p className={className}>
      {shown}
      {!done && <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-[#d9b65b]">&nbsp;</span>}
    </p>
  );
};

interface ReadingPanelProps {
  spreadId: TarotSpreadIdType;
  topic: TarotTopicType;
  question: string;
  choices: TarotChoicesType | null;
  drawn: readonly TarotDrawnCardType[];
  revealed: number;
  result: TarotReadingResultType | null;
  resultStatus: TarotResultStatus;
  animate: boolean;
  side: 'right' | 'bottom';
  // 공유 근거 — 회원은 readingId, 게스트는 리딩 입력. null 이면 공유 버튼 없음(결과 미도착 등).
  shareBase: TarotShareBase | null;
  onRetry: () => void;
  onReset: () => void;
  onClose?: () => void;
}

const ReadingPanel = ({
  spreadId,
  topic,
  question,
  choices,
  drawn,
  revealed,
  result,
  resultStatus,
  animate,
  side,
  shareBase,
  onRetry,
  onReset,
  onClose,
}: ReadingPanelProps) => {
  const spread = getTarotSpread(spreadId);
  const shown = drawn.slice(0, revealed);
  const allRevealed = revealed >= drawn.length && drawn.length > 0;
  const ready = resultStatus === 'ready' && !!result;
  const [collapsed, setCollapsed] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  return (
    <section
      aria-label="해석"
      className={cn(
        glass,
        'pointer-events-auto absolute flex flex-col overflow-hidden',
        side === 'right'
          ? 'bottom-4 right-4 top-16 w-[26rem] max-w-[calc(100%-2rem)]'
          : cn('inset-x-0 bottom-0 rounded-b-none', collapsed ? 'max-h-14' : 'max-h-[58dvh]'),
      )}
    >
      <header className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-[#ece6d6]/60">
            <span>{spread?.nameKo}</span>
            <span>·</span>
            <span>{TAROT_TOPIC_LABEL[topic]}</span>
            {ready && (
              <span
                className={cn(
                  'rounded-full border px-1.5 py-px text-[10px]',
                  result.source === 'llm' ? 'border-[#d9b65b]/60 text-[#d9b65b]' : 'border-white/20 text-[#ece6d6]/60',
                )}
              >
                {TAROT_SOURCE_LABEL[result.source]}
              </span>
            )}
          </div>
          {question && <div className="truncate text-sm text-[#f3e9c6]">“{question}”</div>}
          {choices && (
            <div className="truncate text-xs text-[#ece6d6]/70">
              A {choices.a} · B {choices.b}
            </div>
          )}
        </div>
        {side === 'bottom' && (
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-[#ece6d6]/60 hover:text-[#ece6d6]"
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? '펼치기' : '접기'}
          </button>
        )}
        {onClose && (
          <button type="button" aria-label="닫기" onClick={onClose} className="rounded p-1 text-[#ece6d6]/60 hover:text-[#ece6d6]">
            <X className="size-4" />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <ol className="flex flex-col gap-4">
          {shown.map((drawnCard, i) => {
            const r = ready ? result.cards[i] : undefined;
            // 서버가 다른 카드를 돌려줄 수 있다(회원 오늘의 카드 잠금) — 결과가 오면 결과의 카드가 진실.
            const d = r ? { cardId: r.cardId, position: r.position, reversed: r.reversed } : drawnCard;
            const card = getTarotCard(d.cardId);
            if (!card) return null;
            const text = r?.text ?? tarotCardMeaning(card, d.reversed);
            const keywords = r?.keywords ?? tarotCardKeywords(card, d.reversed);
            const isLast = i === shown.length - 1;
            return (
              <li key={d.cardId} className="flex gap-3" data-testid="tarot-reading-card">
                <TarotCardImage cardId={d.cardId} reversed={d.reversed} className="w-16 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-[#d9b65b]">{spread?.positions[i]?.label}</div>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-serif-kr text-base font-bold text-[#f3e9c6]">{card.nameKo}</span>
                    <span className="text-[11px] text-[#ece6d6]/50">{card.nameEn}</span>
                    <span
                      className={cn(
                        'rounded-full border px-1.5 text-[10px]',
                        d.reversed ? 'border-[#ffb4a2]/50 text-[#ffb4a2]' : 'border-white/20 text-[#ece6d6]/60',
                      )}
                    >
                      {tarotOrientationLabel(d.reversed)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {keywords.map((k) => (
                      <span key={k} className="rounded bg-white/5 px-1.5 py-px text-[10px] text-[#ece6d6]/70">
                        {k}
                      </span>
                    ))}
                  </div>
                  {isLast && ready ? (
                    <TypedText text={text} animate={animate} className="mt-1.5 text-sm leading-relaxed text-[#ece6d6]/90" />
                  ) : (
                    <p className="mt-1.5 text-sm leading-relaxed text-[#ece6d6]/90">{text}</p>
                  )}
                  {!ready && resultStatus === 'pending' && (
                    <p className="mt-1 text-[11px] text-[#ece6d6]/40">카드 기본 의미예요. AI 해석이 오면 바뀝니다.</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {allRevealed && (
          <div className="mt-5 border-t border-white/10 pt-4">
            {resultStatus === 'pending' && (
              <div className="flex items-center gap-2 text-sm text-[#ece6d6]/70">
                <Loader2 className="size-4 animate-spin text-[#d9b65b]" /> 카드를 읽는 중…
              </div>
            )}
            {resultStatus === 'failed' && (
              <div className="flex flex-col gap-2 text-sm">
                <p className="text-[#ffb4a2]">AI 해석을 불러오지 못했어요. 위 카드 기본 의미를 참고하거나 다시 시도해 주세요.</p>
                <Button type="button" variant="outline" size="sm" onClick={onRetry} className="w-fit border-white/20 bg-transparent text-[#ece6d6] hover:bg-white/10">
                  <RotateCcw className="size-3.5" /> 다시 시도
                </Button>
              </div>
            )}
            {ready && (
              <div className="flex flex-col gap-3">
                <div>
                  <div className="text-[11px] text-[#d9b65b]">종합</div>
                  <TypedText text={result.summary} animate={animate} className="mt-1 text-sm leading-relaxed text-[#f3e9c6]" />
                </div>
                <div>
                  <div className="text-[11px] text-[#d9b65b]">조언</div>
                  <p className="mt-1 text-sm leading-relaxed text-[#ece6d6]/90">{result.advice}</p>
                </div>
                {result.choice && choices && (
                  <div className="rounded-xl border border-[#d9b65b]/40 bg-[#d9b65b]/10 p-3 text-sm">
                    <div className="text-[11px] text-[#d9b65b]">카드의 선택</div>
                    <div className="mt-0.5 font-semibold text-[#f3e9c6]">
                      {result.choice.recommended === 'either'
                        ? '어느 쪽이든'
                        : `${result.choice.recommended} · ${result.choice.recommended === 'A' ? choices.a : choices.b}`}
                      <span className="ml-2 text-[11px] font-normal text-[#ece6d6]/60">
                        확신 {result.choice.confidence === 'high' ? '높음' : result.choice.confidence === 'mid' ? '보통' : '낮음'}
                      </span>
                    </div>
                    <p className="mt-1 text-[#ece6d6]/90">{result.choice.reason}</p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-[#d9b65b]" />
                  <span className="font-serif-kr text-base font-bold text-[#f3e9c6]">{result.keyword}</span>
                </div>
                {result.quota.remainingToday !== null && (
                  <p className="text-[11px] text-[#ece6d6]/40">
                    오늘 AI 해석 {result.quota.remainingToday}회 남음 · 로그인하면 제한이 없어요.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-white/10 px-4 py-2.5">
        <Button type="button" size="sm" onClick={onReset} className="bg-[#d9b65b] text-[#1a1408] hover:bg-[#e6c86f]">
          <RotateCcw className="size-3.5" /> 다시 뽑기
        </Button>
        {ready && shareBase && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShareOpen(true)}
            className="border-white/20 bg-transparent text-[#ece6d6] hover:bg-white/10"
          >
            <Share2 className="size-3.5" /> 공유
          </Button>
        )}
        <span className="ml-auto hidden text-[10px] text-[#ece6d6]/35 sm:inline">{TAROT_DISCLAIMER}</span>
      </footer>
      {shareBase && (
        <TarotShareSheet open={shareOpen} onClose={() => setShareOpen(false)} base={shareBase} hasQuestion={!!question} />
      )}
    </section>
  );
};

// 지금 상태에서 공유 근거 — 회원 저장분은 readingId, 게스트는 입력 그대로.
const shareBaseOf = (
  state: TarotFlowState<TarotReadingResultType>,
  drawn: readonly TarotDrawnCardType[],
): TarotShareBase | null => {
  if (state.resultStatus !== 'ready' || !state.result) return null;
  if (state.result.readingId) return { readingId: state.result.readingId };
  return {
    reading: {
      spreadId: state.spreadId,
      topic: state.topic,
      question: state.question,
      choices: state.spreadId === 'choice' ? { a: state.choiceA.trim(), b: state.choiceB.trim() } : null,
      cards: drawn.map((d) => ({ cardId: d.cardId, position: d.position, reversed: d.reversed })),
    },
  };
};

export const TarotOverlay = ({
  state,
  mode,
  send,
  onStart,
  onAutoPick,
  onRetry,
  onReset,
  history,
  review,
  onReview,
  onRemoveHistory,
  isMember,
  todayDailyId,
  panelSide,
}: TarotOverlayProps) => {
  const total = tarotRequiredPicks(state);
  const remaining = tarotRemainingPicks(state);
  const animate = mode === '3d';
  const showReading = !review && (state.phase === 'reading' || (state.phase === 'revealing' && state.revealed > 0));

  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="pointer-events-auto absolute left-4 top-3 flex items-center gap-2">
        <h1 className="font-serif-kr text-xl font-bold text-[#f3e9c6] drop-shadow">타로</h1>
        {mode === 'lite' && (
          <span className="rounded-full border border-white/15 px-2 py-px text-[10px] text-[#ece6d6]/60">간단 모드</span>
        )}
      </div>

      {state.phase === 'setup' && !review && (
        <SetupPanel
          state={state}
          send={send}
          onStart={onStart}
          history={history}
          onReview={onReview}
          onRemoveHistory={onRemoveHistory}
          isMember={isMember}
          todayDailyId={todayDailyId}
        />
      )}

      {state.phase === 'shuffling' && (
        <Hud>
          <Loader2 className="size-4 animate-spin text-[#d9b65b]" />
          카드를 섞는 중… 질문을 마음속으로 떠올려 보세요.
        </Hud>
      )}

      {state.phase === 'picking' && (
        <Hud>
          <span>
            카드 {total}장을 골라 주세요 <span className="text-[#ece6d6]/50">· 남은 {remaining}장</span>
          </span>
          <Button type="button" size="sm" variant="outline" onClick={onAutoPick} className="border-white/20 bg-transparent text-[#ece6d6] hover:bg-white/10">
            자동으로 뽑기
          </Button>
          <button type="button" onClick={onReset} className="text-[#ece6d6]/50 hover:text-[#ece6d6]" aria-label="처음으로">
            <X className="size-4" />
          </button>
        </Hud>
      )}

      {state.phase === 'placing' && (
        <Hud>
          <Sparkles className="size-4 text-[#d9b65b]" /> 카드가 자리를 찾는 중…
        </Hud>
      )}

      {state.phase === 'revealing' && (
        <Hud>
          <span>
            {mode === 'lite' ? '카드를 탭해서 뒤집어 보세요' : '카드를 뒤집는 중…'}{' '}
            <span className="text-[#ece6d6]/50">
              {state.revealed}/{state.drawn.length}
            </span>
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => send({ type: 'reveal_all' })} className="border-white/20 bg-transparent text-[#ece6d6] hover:bg-white/10">
            모두 뒤집기
          </Button>
        </Hud>
      )}

      {showReading && (
        <ReadingPanel
          spreadId={state.spreadId}
          topic={state.topic}
          question={state.question}
          choices={state.spreadId === 'choice' ? { a: state.choiceA, b: state.choiceB } : null}
          drawn={state.drawn}
          revealed={state.revealed}
          result={state.result}
          resultStatus={state.resultStatus}
          animate={animate}
          side={panelSide}
          shareBase={shareBaseOf(state, state.drawn)}
          onRetry={onRetry}
          onReset={onReset}
        />
      )}

      {review && (
        <ReadingPanel
          spreadId={review.result.spreadId}
          topic={review.result.topic}
          question={review.result.question}
          choices={review.result.choices}
          drawn={review.cards}
          revealed={review.cards.length}
          result={review.result}
          resultStatus="ready"
          animate={false}
          side={panelSide}
          shareBase={{
            reading: {
              spreadId: review.result.spreadId,
              topic: review.result.topic,
              question: review.result.question,
              choices: review.result.choices,
              cards: review.cards.map((d) => ({ cardId: d.cardId, position: d.position, reversed: d.reversed })),
            },
          }}
          onRetry={() => {}}
          onReset={() => onReview(null)}
          onClose={() => onReview(null)}
        />
      )}
    </div>
  );
};
