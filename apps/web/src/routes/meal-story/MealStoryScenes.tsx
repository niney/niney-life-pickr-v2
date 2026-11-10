import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { MealStorySceneType, MealStoryType } from '@repo/api-contract';
import { useAuthStore } from '@repo/shared';
import { cn } from '~/lib/utils';
import { MEAL_PATH, MEAL_STORY_PATH } from '../meal/mealPaths';
import { AmountText, EquivalentText, FigureValue } from './MealStoryFigure';
import { RecordRecipeButton, ShareStoryButton } from './mealStoryActions';

// 장면 틀 8종 — 표지 · 큰 숫자 · 막대 비교 · 목록 · 재료 · 만드는 법 · 영양정보 · 마무리. 글·숫자는 서버가 준 그대로
// 그린다(숫자는 서버 계산). 떠오르는 차례는 --i(.msp-rise), 막대·숫자는 mealStory.css 의 애니메이션.

type Scene<T extends MealStorySceneType['type']> = Extract<MealStorySceneType, { type: T }>;
const order = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties;

const Cover = ({ scene }: { scene: Scene<'cover'> }) => (
  <div className={cn('mss mss-cover', scene.image && 'has-photo')}>
    {scene.image ? (
      <div className="mss-photo">
        <img src={scene.image} alt="" />
      </div>
    ) : null}
    <div className="mss-cover-body">
      <p className="mss-kicker msp-rise">{scene.kicker}</p>
      <div className="mss-rule" aria-hidden />
      <h2 className="mss-cover-title msp-rise" style={order(1)}>
        {scene.title}
      </h2>
      {scene.subtitle ? (
        <p className="mss-cover-sub msp-rise" style={order(2)}>
          {scene.subtitle}
        </p>
      ) : null}
    </div>
  </div>
);

const Stat = ({ scene }: { scene: Scene<'stat'> }) => (
  <div className="mss mss-stat">
    <h2 className="mss-title msp-rise">{scene.title}</h2>
    <ul className="mss-figures">
      {scene.figures.map((f, i) => (
        <li key={i} className="mss-figure msp-rise" style={order(i + 1)}>
          <p className="mss-figure-label">{f.label}</p>
          <FigureValue figure={f.figure} size="xl" />
          {/* 다른 단위로 본 값(나트륨 → 소금) — 서버가 환산했다. 내 기록은 FigureValue 안에서. */}
          {f.figure.equivalent && f.figure.equivalent.value !== null && !f.figure.my ? (
            <p className="mss-figure-eq">
              <EquivalentText label={f.figure.equivalent.label} value={f.figure.equivalent.value} unit={f.figure.equivalent.unit} />
            </p>
          ) : null}
          {f.figure.basis && !f.figure.my && f.figure.basis !== f.label ? (
            <p className="mss-figure-basis">{f.figure.basis}</p>
          ) : null}
          {f.figure.detail ? <p className="mss-figure-detail">{f.figure.detail}</p> : null}
        </li>
      ))}
    </ul>
    {scene.note ? (
      <p className="mss-note msp-rise" style={order(scene.figures.length + 1)}>
        {scene.note}
      </p>
    ) : null}
  </div>
);

const Bars = ({ scene }: { scene: Scene<'bars'> }) => {
  const max = Math.max(1, ...scene.bars.map((b) => b.figure.value ?? 0));
  // 값마다 서버가 단 덧말(예: 식이섬유는 표시한 제품 몇 개의 중앙값) — 같은 것은 한 번만, 막대 목록 아래에 작게.
  const footnotes = [...new Set(scene.bars.map((b) => b.figure.detail).filter((d): d is string => !!d))];
  return (
    <div className="mss mss-bars">
      <h2 className="mss-title msp-rise">{scene.title}</h2>
      <ul className="mss-barlist">
        {scene.bars.map((b, i) => (
          <li key={i} className={cn('mss-bar msp-rise', b.highlight && 'is-highlight')} style={order(i + 1)}>
            <div className="mss-bar-head">
              <span className="mss-bar-label">{b.label}</span>
              <FigureValue figure={b.figure} size="md" />
            </div>
            <div className="mss-bar-track" aria-hidden>
              <span
                className="mss-bar-fill"
                style={{ width: `${((b.figure.value ?? 0) / max) * 100}%`, '--i': i } as CSSProperties}
              />
            </div>
            {b.aside ? (
              <p className="mss-bar-aside">
                {b.aside.label} <AmountText figure={b.aside.figure} />
              </p>
            ) : null}
            {scene.fraction?.bar === i ? <p className="mss-bar-frac">약 {scene.fraction.denominator}분의 1</p> : null}
          </li>
        ))}
      </ul>
      {footnotes.length > 0 ? (
        <ul className="mss-bar-foot msp-rise" style={order(scene.bars.length + 1)}>
          {footnotes.map((d) => (
            <li key={d}>※ {d}</li>
          ))}
        </ul>
      ) : null}
      {scene.note ? (
        <p className="mss-note msp-rise" style={order(scene.bars.length + 1)}>
          {scene.note}
        </p>
      ) : null}
    </div>
  );
};

const List = ({ scene }: { scene: Scene<'list'> }) => (
  <div className="mss mss-list-scene">
    <h2 className="mss-title msp-rise">{scene.title}</h2>
    <ol className="mss-list">
      {scene.items.map((it, i) => (
        <li key={i} className="mss-list-item msp-rise" style={order(i + 1)}>
          <span className="mss-list-num" aria-hidden>
            {String(i + 1).padStart(2, '0')}
          </span>
          <div>
            <p className="mss-list-title">{it.title}</p>
            {it.text ? <p className="mss-list-text">{it.text}</p> : null}
          </div>
        </li>
      ))}
    </ol>
    {scene.note ? (
      <p className="mss-note msp-rise" style={order(scene.items.length + 1)}>
        {scene.note}
      </p>
    ) : null}
  </div>
);

const Ingredients = ({ scene }: { scene: Scene<'ingredients'> }) => (
  <div className="mss mss-ingredients">
    <h2 className="mss-title msp-rise">{scene.title}</h2>
    <p className="mss-sub msp-rise" style={order(1)}>
      {scene.servings}인분
    </p>
    <ul className="mss-rows">
      {scene.items.map((it, i) => (
        <li key={i} className="mss-row msp-rise" style={order(i + 2)}>
          <span className="mss-row-main">
            <span className="mss-row-label">{it.label}</span>
            {it.note ? <span className="mss-row-note"> · {it.note}</span> : null}
          </span>
          <span className="mss-row-amt">{it.grams.toLocaleString('ko-KR')}g</span>
        </li>
      ))}
    </ul>
  </div>
);

const Step = ({ scene }: { scene: Scene<'step'> }) => (
  <div className="mss mss-step">
    {scene.image ? (
      <div className="mss-step-photo">
        <img src={scene.image} alt={`만드는 법 ${scene.number}단계 사진`} />
      </div>
    ) : (
      <p className="mss-step-big msp-rise" aria-hidden>
        {scene.number}
      </p>
    )}
    <p className="mss-step-count msp-rise" style={order(1)}>
      만드는 법 {scene.number} / {scene.total}
    </p>
    <p className="mss-step-text msp-rise" style={order(2)}>
      {scene.text}
    </p>
    {scene.tip ? (
      <p className="mss-tip msp-rise" style={order(3)}>
        <strong>팁</strong>
        {scene.tip}
      </p>
    ) : null}
  </div>
);

const Nutrition = ({ scene }: { scene: Scene<'nutrition'> }) => {
  const partial = scene.rows.some((r) => r.figure.detail);
  return (
    <div className="mss mss-nutrition">
      <div className="mss-label msp-rise">
        <h2 className="mss-label-title">{scene.title}</h2>
        <p className="mss-label-sub">{scene.servings}인분 기준</p>
        <ul>
          {scene.rows.map((r, i) => (
            <li key={r.key} className="mss-label-row msp-rise" style={order(i + 1)}>
              <span>{r.label}</span>
              <FigureValue figure={r.figure} size="sm" />
            </li>
          ))}
        </ul>
      </div>
      {partial ? <p className="mss-note">일부 재료는 값을 몰라 빼고 셌어요.</p> : null}
      {scene.cautions.map((c, i) => (
        <p key={i} className="mss-caution msp-rise" style={order(scene.rows.length + 1)}>
          {c}
        </p>
      ))}
      {scene.note ? (
        <p className="mss-note msp-rise" style={order(scene.rows.length + 2)}>
          {scene.note}
        </p>
      ) : null}
    </div>
  );
};

const Outro = ({ scene, story }: { scene: Scene<'outro'>; story: MealStoryType }) => {
  const token = useAuthStore((s) => s.token);
  return (
    <div className="mss mss-outro">
      <h2 className="mss-outro-title msp-rise">{scene.title}</h2>
      {scene.text ? (
        <p className="mss-outro-text msp-rise" style={order(1)}>
          {scene.text}
        </p>
      ) : null}
      <div className="mss-actions msp-rise" style={order(2)}>
        {scene.actions.includes('record') ? <RecordRecipeButton story={story} /> : null}
        {scene.actions.includes('recipe') && story.recipe ? (
          <Link to={MEAL_STORY_PATH.recipe(story.slug)} className="mss-btn">
            레시피 전체 보기
          </Link>
        ) : null}
        {scene.actions.includes('stats') && token ? (
          <Link to={MEAL_PATH.stats} className="mss-btn">
            통계에서 보기
          </Link>
        ) : null}
        {scene.actions.includes('share') ? <ShareStoryButton story={story} /> : null}
      </div>
      <details className="mss-sources">
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

export const MealStorySceneView = ({ scene, story }: { scene: MealStorySceneType; story: MealStoryType }) => {
  switch (scene.type) {
    case 'cover':
      return <Cover scene={scene} />;
    case 'stat':
      return <Stat scene={scene} />;
    case 'bars':
      return <Bars scene={scene} />;
    case 'list':
      return <List scene={scene} />;
    case 'ingredients':
      return <Ingredients scene={scene} />;
    case 'step':
      return <Step scene={scene} />;
    case 'nutrition':
      return <Nutrition scene={scene} />;
    case 'outro':
      return <Outro scene={scene} story={story} />;
  }
};
