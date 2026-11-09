import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { preload } from 'react-dom';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import type { MealStoryType } from '@repo/api-contract';
import { useMealStory } from '@repo/shared';
import { MEAL_STORY_PATH } from '../meal/mealPaths';
import { MealStorySceneView } from './MealStoryScenes';

// 스토리 재생기 — 장면은 손으로 넘긴다(오른쪽 누르기·왼쪽으로 밀기·→ 키 = 다음, 왼쪽 30% 누르기·오른쪽으로 밀기·← 키 = 이전,
// Esc = 닫기). 장면 안의 움직임만 저절로 돈다. 지금 장면은 주소 ?s=N(1부터) — 바꿀 때 기록을 쌓지 않아 뒤로 가기는 스토리를
// 떠난다. 레시피 전체 보기에서 돌아와도 같은 장면이다.

const SWIPE_PX = 48;
const TAP_PX = 10;
const PREV_ZONE = 0.3;

const isInteractive = (target: EventTarget | null): boolean =>
  target instanceof Element && !!target.closest('a, button, summary, input, select, textarea, label');

// 처음 그릴 때 한 번 — 키보드(←·→)를 바로 받게. 함수가 늘 같아 다시 그려도 다시 부르지 않는다.
const focusOnMount = (el: HTMLElement | null): void => {
  el?.focus({ preventScroll: true });
};

const sceneImage = (scene: MealStoryType['scenes'][number] | undefined): string | null =>
  scene && (scene.type === 'cover' || scene.type === 'step') ? scene.image : null;

const Player = ({ story }: { story: MealStoryType }) => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const start = useRef<{ x: number; y: number } | null>(null);
  const total = story.scenes.length;
  const raw = Number.parseInt(params.get('s') ?? '1', 10);
  const index = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), total) - 1 : 0;
  const scene = story.scenes[index]!;

  // 다음 장면 사진을 미리 받는다(React 가 head 에 한 번만 건다).
  const nextImage = sceneImage(story.scenes[index + 1]);
  if (nextImage) preload(nextImage, { as: 'image' });

  const go = (i: number) => {
    if (i < 0 || i >= total || i === index) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('s', String(i + 1));
        return next;
      },
      { replace: true },
    );
  };
  const close = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate(MEAL_STORY_PATH.list);
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
    else if (e.key === 'Escape') close();
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
            <Link to={MEAL_STORY_PATH.list}>건강식단</Link>
            {story.status === 'draft' ? <span className="msp-draft">초안</span> : null}
            <span className="msp-count" aria-live="polite">
              {index + 1} / {total}
            </span>
            <button type="button" className="msp-icon" onClick={close} aria-label="닫기">
              <X className="size-5" aria-hidden />
            </button>
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
    </div>
  );
};

export const MealStoryPlayer = () => {
  const { slug } = useParams();
  const story = useMealStory(slug);
  if (story.data) return <Player story={story.data} />;
  return (
    <div className="msp">
      <div className="msp-card">
        <div className="msp-status">
          {story.isLoading ? (
            <Loader2 className="size-5 animate-spin" aria-label="불러오는 중" />
          ) : (
            <div className="space-y-3">
              <p className="font-bold">이야기를 찾지 못했어요.</p>
              <Link to={MEAL_STORY_PATH.list} className="underline underline-offset-4">
                건강식단 목록으로
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
