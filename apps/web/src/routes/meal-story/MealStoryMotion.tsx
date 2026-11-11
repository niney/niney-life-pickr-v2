import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { Player, type CallbackListener, type EventTypes, type PlayerRef } from '@remotion/player';
import { AlignLeft, ArrowLeft, ChevronLeft, ChevronRight, Loader2, Pause, Play, RotateCcw } from 'lucide-react';
import type { MealStoryType } from '@repo/api-contract';
import { useAuthStore } from '@repo/shared';
import { useMediaQuery } from '~/lib/useMediaQuery';
import { useThemeStore } from '~/stores/theme';
import { MEAL_PATH, MEAL_STORY_PATH } from '../meal/mealPaths';
import { MealStoryAside } from './MealStoryAside';
import { RecordRecipeButton, ShareStoryButton } from './mealStoryActions';
import { useStoryFontsReady } from './mealStoryFont';
import { toMotionMine, useStoryMyStats } from './mealStoryMine';
import { PREV_ZONE, STORY_ASIDE_QUERY, SWIPE_PX, TAP_PX, focusOnMount, isInteractive, useLeaveStory, useStoryParams } from './mealStoryNav';
import { StoryVideo, type StoryVideoProps } from './motion/StoryVideo';
import { paperPalette } from './motion/paper/palette';
import { FPS, H, W } from './motion/theme';
import { buildTimeline, chapterAt, chapterProgress, chapterSeekFrame, type Timeline } from './motion/timeline';

// 영상으로 보기(2026-11-09) — 스토리 한 편을 영상 한 편으로 이어 재생한다(@remotion/player, 장면 그림은 motion/). 진행 막대 칸 =
// 장면, 누르기·밀기·←→ 는 장면 건너뛰기, 길게 누르면 멈춤, 마무리 장면에서 진짜 단추(기록·레시피·공유)를 영상 위에 얹는다.
// 주소 ?s= 는 재생 중에 따라가지 않는다(넘길 때마다 주소를 바꾸면 화면 전체가 다시 그려진다) — 글로 보기로 바꿀 때·레시피로
// 갈 때·로그인하러 갈 때만 지금 장면을 적는다. 이 파일은 나눠 받는다(재생기가 무겁다 — MealStoryPlayer 의 lazy).
// 휴대폰(좁은 화면)은 아래 단추 줄이 없다 — 실제 휴대폰 브라우저는 화면이 낮아 영상이 높이에 맞춰 줄어드는데, 그 줄만큼
// 영상이 커진다. 넘기기는 누르기·밀기, 멈춤은 길게 누르기와 위 막대의 재생 단추.
// 영상 안의 글·굴러가는 숫자는 읽기 프로그램에 숨긴다(숫자 띠 0~9 가 통째로 읽힌다) — 읽을 글은 '글로 보기'.

const HOLD_MS = 220;
const FRAME_EVENTS: readonly EventTypes[] = ['frameupdate', 'seeked'];
const PLAY_EVENTS: readonly EventTypes[] = ['play', 'pause', 'ended'];

/** 재생기 값 하나를 React 로 — 재생기(바깥 시스템)의 이벤트를 구독하고, 값이 바뀐 때만 다시 그린다. */
const usePlayerValue = <T,>(player: PlayerRef | null, events: readonly EventTypes[], read: (p: PlayerRef) => T, fallback: T): T => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!player) return () => {};
      const listener: CallbackListener<EventTypes> = () => onChange();
      for (const name of events) player.addEventListener(name, listener);
      return () => {
        for (const name of events) player.removeEventListener(name, listener);
      };
    },
    [player, events],
  );
  return useSyncExternalStore(subscribe, () => (player ? read(player) : fallback));
};

/** 진행 막대 — 장면마다 한 칸, 지금 장면 칸이 재생에 맞춰 찬다(매 프레임 다시 그리는 건 이 막대뿐). */
const MotionProgress = ({ player, timeline, initialFrame }: { player: PlayerRef | null; timeline: Timeline; initialFrame: number }) => {
  const frame = usePlayerValue(player, FRAME_EVENTS, (p) => p.getCurrentFrame(), initialFrame);
  return (
    <div className="msp-progress" aria-hidden>
      {timeline.chapters.map((c) => (
        <span key={c.index} className="msp-seg">
          <i style={{ transform: `scaleX(${chapterProgress(timeline, c.index, frame)})` }} />
        </span>
      ))}
    </div>
  );
};

/** 재생·멈춤 단추 — 끝까지 봤으면 '다시 보기'. 넓은 화면은 아래 단추 줄 가운데, 휴대폰은 위 막대(className 으로 모양만 바꾼다). */
const PlayToggle = ({ player, timeline, className = 'msm-play' }: { player: PlayerRef | null; timeline: Timeline; className?: string }) => {
  const playing = usePlayerValue(player, PLAY_EVENTS, (p) => p.isPlaying(), true);
  const atEnd = usePlayerValue(player, FRAME_EVENTS, (p) => p.getCurrentFrame() >= timeline.total - 1, false);
  if (!playing && atEnd) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => {
          player?.seekTo(0);
          player?.play();
        }}
        aria-label="처음부터 다시 보기"
      >
        <RotateCcw className="size-5" aria-hidden />
      </button>
    );
  }
  return (
    <button type="button" className={className} onClick={() => player?.toggle()} aria-label={playing ? '멈춤' : '재생'}>
      {playing ? <Pause className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}
    </button>
  );
};

/** 마무리 장면 위의 진짜 단추 — 원고 actions 대로. 로그인·레시피로 떠날 때 돌아올 장면(마무리)을 주소에 적는다. */
const EndCard = ({ story, onLeave }: { story: MealStoryType; onLeave: () => void }) => {
  const token = useAuthStore((s) => s.token);
  const outro = story.scenes[story.scenes.length - 1];
  if (outro?.type !== 'outro') return null;
  const here = `${MEAL_STORY_PATH.story(story.slug)}?s=${story.scenes.length}`;
  return (
    <div className="msm-end">
      {outro.actions.includes('record') ? <RecordRecipeButton story={story} returnTo={here} /> : null}
      {outro.actions.includes('recipe') && story.recipe ? (
        <Link to={MEAL_STORY_PATH.recipe(story.slug)} className="mss-btn" onClick={onLeave}>
          레시피 전체 보기
        </Link>
      ) : null}
      {outro.actions.includes('stats') && token ? (
        <Link to={MEAL_PATH.stats} className="mss-btn" onClick={onLeave}>
          통계에서 보기
        </Link>
      ) : null}
      {outro.actions.includes('share') ? <ShareStoryButton story={story} /> : null}
      <details className="msm-sources">
        <summary>출처{story.reviewedAt ? ` · 검수 ${story.reviewedAt}` : ' · 검수 전 초안'}</summary>
        <ul>
          {story.sources.map((s) => (
            <li key={s.id}>{s.label}</li>
          ))}
        </ul>
      </details>
    </div>
  );
};

const MealStoryMotion = ({ story, index, inShell = false }: { story: MealStoryType; index: number; inShell?: boolean }) => {
  const { leave, label: backLabel } = useLeaveStory();
  const { update } = useStoryParams();
  const { token, stats, previous } = useStoryMyStats();
  const dark = useThemeStore((s) => s.mode) === 'dark';
  const timeline = useMemo(() => buildTimeline(story), [story]);
  const total = timeline.chapters.length;
  const [initialFrame] = useState(() => chapterSeekFrame(timeline, index));
  const [player, setPlayer] = useState<PlayerRef | null>(null);
  const press = useRef<{ x: number; y: number; timer: number; held: boolean; wasPlaying: boolean } | null>(null);

  // 영상 입력 — 바뀔 때만 새 객체(재생기가 장면을 다시 그리는 기준). 로그인했는데 아직 받는 중이면 mine null(장면이 말을 아낀다).
  // 직전 2주(변화 한 줄)는 늦게 와도 된다 — 오면 그때 쪽지가 하나 더 붙는다.
  const statsData = stats.data;
  const previousData = previous.data;
  const inputProps = useMemo<StoryVideoProps>(
    () => ({ story, mine: token && statsData ? toMotionMine(statsData, previousData) : null, loggedIn: !!token, dark }),
    [story, token, statsData, previousData, dark],
  );
  const chapter = usePlayerValue(player, FRAME_EVENTS, (p) => chapterAt(timeline, p.getCurrentFrame()), chapterAt(timeline, initialFrame));
  const paper = paperPalette(story.topic?.nutrient ?? null, dark).bg;
  // 글꼴 조각을 다 받은 뒤(또는 잠깐 기다린 뒤) 재생기를 붙인다 — 도는 중에 제목 글꼴이 바뀌지 않게.
  const fontsReady = useStoryFontsReady(story);
  const narrow = useMediaQuery('(max-width: 39.99rem)', false);
  const aside = useMediaQuery(STORY_ASIDE_QUERY, false) && inShell;

  // 다른 탭·앱으로 가면 멈추고 돌아오면 이어 튼다 — 재생기는 숨은 탭에서도 타이머로 계속 돌아, 돌아오면 끝나 있었다.
  // 문서의 보임 상태(바깥 시스템)를 따라가는 일이라 effect.
  useEffect(() => {
    if (!player) return;
    let resume = false;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        resume = player.isPlaying();
        if (resume) player.pause();
      } else if (resume) {
        resume = false;
        player.play();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [player]);

  const go = (i: number) => {
    if (!player || i < 0 || i >= total) return;
    // 재생 중이면 seekTo 가 잠깐 멈췄다가 스스로 다시 튼다(Remotion). 여기서 또 play() 하면 그 '다시 틀기'가 쓰이지 않고
    // 남았다가 영상이 끝나 멈출 때 실행돼 처음부터 다시 돈다 — 멈춰 있을 때만 튼다.
    const resume = !player.isPlaying();
    player.seekTo(chapterSeekFrame(timeline, i));
    if (resume) player.play();
  };
  const toText = () => update({ index: chapter, view: 'text' });

  const release = () => {
    const p = press.current;
    press.current = null;
    if (!p) return null;
    window.clearTimeout(p.timer);
    if (p.held && p.wasPlaying) player?.play();
    return p;
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!player || e.button > 0) return;
    const p = { x: e.clientX, y: e.clientY, timer: 0, held: false, wasPlaying: player.isPlaying() };
    // 길게 누르면 멈춘다(떼면 다시) — 글을 천천히 읽게.
    p.timer = window.setTimeout(() => {
      p.held = true;
      if (p.wasPlaying) player.pause();
    }, HOLD_MS);
    press.current = p;
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const p = release();
    if (!p || p.held) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      go(dx < 0 ? chapter + 1 : chapter - 1);
      return;
    }
    if (Math.abs(dx) < TAP_PX && Math.abs(dy) < TAP_PX) {
      const box = e.currentTarget.getBoundingClientRect();
      go(e.clientX - box.left < box.width * PREV_ZONE ? chapter - 1 : chapter + 1);
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') go(chapter + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(chapter - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(total - 1);
    else if (e.key === 'Escape') leave();
    else if ((e.key === ' ' || e.key === 'k') && !isInteractive(e.target)) player?.toggle();
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={focusOnMount}
      className="msp msm"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      role="region"
      aria-roledescription="스토리"
      aria-label={story.title}
    >
      <div className="msp-card">
        <div className="msp-top">
          <MotionProgress player={player} timeline={timeline} initialFrame={initialFrame} />
          <div className="msp-bar">
            <button type="button" className="msp-back" onClick={leave}>
              <ArrowLeft className="size-5" aria-hidden />
              {backLabel}
            </button>
            {story.status === 'draft' ? <span className="msp-draft">초안</span> : null}
            {/* 영상은 스스로 넘어가므로 장면 번호를 소리 내어 알리지 않는다(글로 보기는 알린다). */}
            <span className="msp-count">
              {chapter + 1} / {total}
            </span>
            {narrow ? <PlayToggle player={player} timeline={timeline} className="msp-icon msm-bar-play" /> : null}
            <button type="button" className="msm-view" onClick={toText}>
              <AlignLeft className="size-4" aria-hidden />
              글로 보기
            </button>
          </div>
        </div>
        <div className="msm-stage" style={{ backgroundColor: paper }}>
          <div className="msm-frame">
            {fontsReady ? (
              <div className="msm-video" aria-hidden>
                <Player
                  ref={setPlayer}
                  component={StoryVideo}
                  inputProps={inputProps}
                  durationInFrames={timeline.total}
                  compositionWidth={W}
                  compositionHeight={H}
                  fps={FPS}
                  initialFrame={initialFrame}
                  autoPlay
                  controls={false}
                  clickToPlay={false}
                  doubleClickToFullscreen={false}
                  spaceKeyToPlayOrPause={false}
                  moveToBeginningWhenEnded={false}
                  // 소리 없는 영상 — 음소거로 시작해야 재생이 오디오 시작 허락(브라우저 자동 재생 정책)을 기다리지 않는다.
                  // 허락 없이 열면(공유 링크로 바로) '재생 중'인데 첫 프레임에 멈춰 있었다.
                  initiallyMuted
                  numberOfSharedAudioTags={0}
                  browserMediaControlsBehavior={{ mode: 'do-nothing' }}
                  acknowledgeRemotionLicense
                  errorFallback={() => <p className="msm-error">영상을 그리지 못했어요. 위 ‘글로 보기’로 읽어 주세요.</p>}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            ) : (
              <div className="msm-wait">
                <Loader2 className="size-5 animate-spin" aria-label="불러오는 중" />
              </div>
            )}
            <p className="sr-only">영상으로 보는 중이에요. 장면 글을 읽으려면 ‘글로 보기’를 눌러 주세요.</p>
            <div
              className="msm-tap"
              aria-hidden
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={release}
              onPointerLeave={release}
              onContextMenu={(e) => e.preventDefault()}
            />
            {chapter === total - 1 ? <EndCard story={story} onLeave={() => update({ index: total - 1 })} /> : null}
            {narrow && chapter === 0 && total > 1 ? (
              <p className="msm-hint" aria-hidden>
                누르면 다음 · 길게 누르면 멈춤
              </p>
            ) : null}
          </div>
        </div>
        {narrow ? null : (
          <div className="msp-nav">
            <button type="button" onClick={() => go(chapter - 1)} aria-disabled={chapter === 0} aria-label="이전 장면">
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <PlayToggle player={player} timeline={timeline} />
            <button type="button" onClick={() => go(chapter + 1)} aria-disabled={chapter === total - 1} aria-label="다음 장면">
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
        )}
      </div>
      {/* 옆 칸 — 지금 장면은 재생을 따라가고, 누르면 그 장면으로 건너뛴다. 레시피로 떠날 때는 돌아올 장면을 주소에 적는다. */}
      {aside ? <MealStoryAside story={story} current={chapter} onPick={go} onLeave={() => update({ index: chapter })} /> : null}
    </div>
  );
};

export default MealStoryMotion;
