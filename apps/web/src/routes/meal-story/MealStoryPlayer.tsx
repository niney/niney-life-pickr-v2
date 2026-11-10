import { Suspense, lazy, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { preload } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Clapperboard, Loader2 } from 'lucide-react';
import type { MealStoryType } from '@repo/api-contract';
import { useMealStory } from '@repo/shared';
import { useMediaQuery } from '~/lib/useMediaQuery';
import { MEAL_STORY_PATH } from '../meal/mealPaths';
import { MealStoryAside } from './MealStoryAside';
import { MealStorySceneView } from './MealStoryScenes';
import { startStoryFonts } from './mealStoryFont';
import {
  PREV_ZONE,
  STORY_ASIDE_QUERY,
  SWIPE_PX,
  TAP_PX,
  focusOnMount,
  isInteractive,
  sceneIndexFrom,
  useLeaveStory,
  useStoryParams,
} from './mealStoryNav';

// 스토리 재생기 — 두 가지 보기. 영상으로 보기(기본, MealStoryMotion — 장면이 이어 재생되는 모션 그래픽)와 글로 보기(이 파일 —
// 장면을 손으로 넘기고 장면 안의 움직임만 CSS 로 돈다). '동작 줄이기'를 켰거나 영상을 돌릴 수 없는 환경이면 글로 본다.
// 글로 보기: 오른쪽 누르기·왼쪽으로 밀기·→ 키 = 다음, 왼쪽 30% 누르기·오른쪽으로 밀기·← 키 = 이전, Esc = 닫기. 지금 장면은
// 주소 ?s=N(1부터) — 바꿀 때 기록을 쌓지 않아 뒤로 가기는 스토리를 떠난다. 레시피 전체 보기에서 돌아와도 같은 장면이다.
// 나가는 단추는 왼쪽 위 '← 뒤로' 하나(useLeaveStory — 식단 상세·입력 화면과 같다). 로그인했으면 식단 셸 안에 뜬다 — 넓은 화면은
// 사이드 메뉴 옆 본문 자리에, 휴대폰은 화면 가득(mealStory.css .meal-story-inshell).

// 영상 재생기는 무거워 나눠 받는다. 스토리 응답을 기다리는 동안 미리 받기 시작한다(같은 import 는 한 번만 받는다) —
// 응답 뒤에야 받기 시작하면 첫 화면이 그만큼 늦는다.
const loadMotion = () => import('./MealStoryMotion');
const MealStoryMotion = lazy(loadMotion);

// 영상 재생기(@remotion/player)는 ResizeObserver 로 크기를 잰다 — 없는 환경(테스트 jsdom·아주 낡은 브라우저)은 글로 본다.
const canPlayMotion = (): boolean => typeof window !== 'undefined' && typeof window.ResizeObserver === 'function';

const sceneImage = (scene: MealStoryType['scenes'][number] | undefined): string | null =>
  scene && (scene.type === 'cover' || scene.type === 'step') ? scene.image : null;

const TextPlayer = ({
  story,
  index,
  motionAvailable,
  inShell,
}: {
  story: MealStoryType;
  index: number;
  motionAvailable: boolean;
  inShell: boolean;
}) => {
  const { update } = useStoryParams();
  const { leave, label: backLabel } = useLeaveStory();
  const aside = useMediaQuery(STORY_ASIDE_QUERY, false) && inShell;
  const start = useRef<{ x: number; y: number } | null>(null);
  const total = story.scenes.length;
  const scene = story.scenes[index]!;

  // 다음 장면 사진을 미리 받는다(React 가 head 에 한 번만 건다).
  const nextImage = sceneImage(story.scenes[index + 1]);
  if (nextImage) preload(nextImage, { as: 'image' });

  const go = (i: number) => {
    if (i < 0 || i >= total || i === index) return;
    update({ index: i });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    start.current = isInteractive(e.target) ? null : { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    start.current = null;
    if (!s || isInteractive(e.target)) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      go(dx < 0 ? index + 1 : index - 1);
      return;
    }
    if (Math.abs(dx) < TAP_PX && Math.abs(dy) < TAP_PX) {
      const box = e.currentTarget.getBoundingClientRect();
      go(e.clientX - box.left < box.width * PREV_ZONE ? index - 1 : index + 1);
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') go(index + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(index - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(total - 1);
    else if (e.key === 'Escape') leave();
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={focusOnMount}
      className="msp"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      role="region"
      aria-roledescription="스토리"
      aria-label={story.title}
    >
      <div className="msp-card">
        <div className="msp-top">
          <div className="msp-progress" aria-hidden>
            {story.scenes.map((_, i) => (
              <span key={i} className="msp-seg" data-state={i < index ? 'done' : i === index ? 'active' : undefined}>
                <i key={i === index ? `on-${index}` : 'off'} />
              </span>
            ))}
          </div>
          <div className="msp-bar">
            <button type="button" className="msp-back" onClick={leave}>
              <ArrowLeft className="size-5" aria-hidden />
              {backLabel}
            </button>
            {story.status === 'draft' ? <span className="msp-draft">초안</span> : null}
            <span className="msp-count" aria-live="polite">
              {index + 1} / {total}
            </span>
            {motionAvailable ? (
              <button type="button" className="msm-view" onClick={() => update({ index, view: 'motion' })}>
                <Clapperboard className="size-4" aria-hidden />
                영상으로 보기
              </button>
            ) : null}
          </div>
        </div>
        <div
          className="msp-stage"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            start.current = null;
          }}
        >
          <section key={index} className="msp-scene" aria-label={`${index + 1}번째 장면`}>
            <MealStorySceneView scene={scene} story={story} />
          </section>
        </div>
        {/* 끝에서도 단추를 끄지 않고 aria-disabled 만 — 꺼진 단추는 포커스를 잃어 ←·→ 키가 더는 재생기에 닿지 않는다. */}
        <div className="msp-nav">
          <button type="button" onClick={() => go(index - 1)} aria-disabled={index === 0} aria-label="이전 장면">
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <span className="msp-nav-hint">{index === 0 ? '누르거나 밀어서 넘겨요' : null}</span>
          <button type="button" onClick={() => go(index + 1)} aria-disabled={index === total - 1} aria-label="다음 장면">
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
      </div>
      {aside ? <MealStoryAside story={story} current={index} onPick={go} /> : null}
    </div>
  );
};

const StatusCard = ({ children }: { children: ReactNode }) => (
  <div className="msp">
    <div className="msp-card">
      <div className="msp-status">{children}</div>
    </div>
  </div>
);

const Spinner = () => <Loader2 className="size-5 animate-spin" aria-label="불러오는 중" />;

/** inShell — 식단 셸 안(로그인)에서 띄웠다: 넓은 화면이면 옆 칸을 둔다. */
export const MealStoryPlayer = ({ inShell = false }: { inShell?: boolean }) => {
  const { slug } = useParams();
  const story = useMealStory(slug);
  const { params } = useStoryParams();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)', false);
  const motionAvailable = canPlayMotion();
  const view = params.get('view');
  const motion = motionAvailable && (view === 'motion' || (view !== 'text' && !reduced));
  // 받다가 실패하면 lazy 쪽이 알아서 다시 알린다 — 여기서는 조용히.
  if (motion) void loadMotion().catch(() => undefined);
  if (story.data) {
    const index = sceneIndexFrom(params.get('s'), story.data.scenes.length);
    if (motion) {
      // 영상에 나올 글자의 글꼴 조각도 재생기 코드와 함께 받기 시작한다(준비되면 MealStoryMotion 이 재생기를 붙인다).
      startStoryFonts(story.data);
      return (
        <Suspense
          fallback={
            <StatusCard>
              <Spinner />
            </StatusCard>
          }
        >
          <MealStoryMotion story={story.data} index={index} inShell={inShell} />
        </Suspense>
      );
    }
    return <TextPlayer story={story.data} index={index} motionAvailable={motionAvailable} inShell={inShell} />;
  }
  return (
    <StatusCard>
      {story.isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          <p className="font-bold">이야기를 찾지 못했어요.</p>
          <Link to={MEAL_STORY_PATH.list} className="underline underline-offset-4">
            건강식단 목록으로
          </Link>
        </div>
      )}
    </StatusCard>
  );
};
