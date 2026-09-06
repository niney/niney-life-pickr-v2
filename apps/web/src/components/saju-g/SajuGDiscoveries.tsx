import { useId, useState, type CSSProperties } from 'react';
import { ArrowUpRight, BookOpen, ChevronDown, MessageCircle, Sparkles } from 'lucide-react';
import type { SajuGChartType, SajuGReadingResultType } from '@repo/api-contract';
import {
  SAJU_G_ELEMENT_META,
  SAJU_G_SCENES,
  basicSajuGLifeScenes,
  sajuGDayStory,
  sajuGGodCards,
  type SajuGElementId,
} from '@repo/utils';
import { SajuGSymbol } from './SajuGVisual';
import './saju-g-discoveries.css';

function Evidence({ chart, ids }: { chart: SajuGChartType; ids: string[] }) {
  return (
    <details className="saju-g-evidence">
      <summary>
        이 이야기의 바탕 <ChevronDown size={12} />
      </summary>
      {ids.map((id) => {
        const fact = chart.facts.find((f) => f.id === id);
        return fact ? (
          <p key={id}>
            <strong>{fact.label}</strong> {fact.description}
          </p>
        ) : null;
      })}
    </details>
  );
}

export function SajuGDayStoryCard({
  chart,
  onHighlight,
}: {
  chart: SajuGChartType;
  onHighlight: (element: SajuGElementId) => void;
}) {
  const story = sajuGDayStory(chart);
  const id = useId();
  return (
    <section className="saju-g-discovery-section" aria-labelledby={id}>
      <div className="saju-g-section-heading">
        <div>
          <span className="saju-g-eyebrow">A SCENE OF YOUR OWN</span>
          <h2 id={id}>내 일주 이야기</h2>
        </div>
        <span className="saju-g-soft-label">두 글자, 하나의 장면</span>
      </div>
      {story ? (
        <details
          key={story.ganZhi}
          className="saju-g-story-card"
          style={
            {
              '--story-color': SAJU_G_ELEMENT_META[story.stemElement].color,
              '--land-color': SAJU_G_ELEMENT_META[story.branchElement].color,
            } as CSSProperties
          }
          onToggle={(event) => {
            if (event.currentTarget.open) onHighlight(story.stemElement);
          }}
        >
          <summary>
            <div className="saju-g-story-art" aria-hidden="true">
              <span className="saju-g-story-orbit" />
              <SajuGSymbol element={story.stemElement} />
              <span className="saju-g-story-seal">{story.ganZhi}</span>
            </div>
            <div className="saju-g-story-cover">
              <span className="saju-g-eyebrow">
                {story.name} · {story.ganZhi}
              </span>
              <h3>{story.title}</h3>
              <p>나를 나타내는 상징과 그 곁의 풍경을 만나보세요.</p>
              <span className="saju-g-story-toggle">
                <BookOpen size={15} />
                <span className="saju-g-story-open-label">이야기 펼치기</span>
                <span className="saju-g-story-close-label">이야기 접기</span>
                <ChevronDown size={16} />
              </span>
            </div>
          </summary>
          <div className="saju-g-story-content">
            <p>{story.text}</p>
            <div className="saju-g-story-elements">
              <span>
                윗글자 · {story.symbol} · {SAJU_G_ELEMENT_META[story.stemElement].name}
              </span>
              <span>아랫글자 · {SAJU_G_ELEMENT_META[story.branchElement].meaning}</span>
            </div>
            <blockquote>{story.invitation}</blockquote>
            <p className="saju-g-field-hint">
              일주의 두 글자에서 만든 상징 이야기예요. 실제 성격이나 삶을 정해 놓은 뜻은 아니에요.
            </p>
            <Evidence chart={chart} ids={story.evidenceIds} />
          </div>
        </details>
      ) : (
        <div className="saju-g-discovery-empty">
          <Sparkles size={20} />
          <h3>아직 하나로 정하지 않은 이야기</h3>
          <p>
            입력한 시간 범위에서 일주가 달라져 대표 카드를 고르지 않았어요. 위의 확정된 기둥을
            살펴보거나, 시간을 알게 되면 다시 펼쳐보세요.
          </p>
        </div>
      )}
    </section>
  );
}

export function SajuGLifeManual({
  chart,
  result,
  pending,
}: {
  chart: SajuGChartType;
  result: SajuGReadingResultType | null;
  pending: boolean;
}) {
  const [selected, setSelected] = useState<(typeof SAJU_G_SCENES)[number]['id']>('meeting');
  const id = useId();
  const scenes = result?.report.lifeScenes ?? basicSajuGLifeScenes(chart);
  const scene =
    scenes.find((item) => item.id === selected) ??
    basicSajuGLifeScenes(chart).find((item) => item.id === selected)!;
  const topic = SAJU_G_SCENES.find((item) => item.id === selected)!;
  const isAi = result?.source === 'ai' && !!result.report.lifeScenes;
  return (
    <section className="saju-g-discovery-section" aria-labelledby={`${id}-title`}>
      <div className="saju-g-section-heading">
        <div>
          <span className="saju-g-eyebrow">IN EVERYDAY MOMENTS</span>
          <h2 id={`${id}-title`}>나의 생활 사용설명서</h2>
        </div>
      </div>
      <p className="saju-g-field-hint">
        지금의 나와 닮은 장면을 골라, 내 방식과 비교하며 읽어보세요.
      </p>
      <div className="saju-g-scene-picker" role="group" aria-label="생활 장면 선택">
        {SAJU_G_SCENES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected === item.id}
            aria-controls={`${id}-scene`}
            onClick={() => setSelected(item.id)}
          >
            <span>{item.glyph}</span>
            <strong>{item.title}</strong>
            <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        ))}
      </div>
      <article
        id={`${id}-scene`}
        className="saju-g-scene-content"
        aria-labelledby={`${id}-scene-title`}
      >
        <div className="saju-g-scene-label">
          <span>{topic.caption}</span>
          <span>
            {isAi
              ? 'AI가 풀어주는 장면'
              : pending
                ? '기본 안내 · AI가 읽는 중'
                : '상징으로 돌아보는 장면'}
          </span>
        </div>
        <h3 id={`${id}-scene-title`}>{topic.title}</h3>
        <p>{scene.text}</p>
        <div className="saju-g-scene-action">
          <Sparkles size={17} aria-hidden="true" />
          <div>
            <strong>이렇게 해볼까요</strong>
            <p>{scene.action}</p>
          </div>
        </div>
        <blockquote>
          <MessageCircle size={17} aria-hidden="true" />
          {scene.question}
        </blockquote>
        <Evidence key={selected} chart={chart} ids={scene.evidenceIds} />
      </article>
    </section>
  );
}

export function SajuGGodStoryCards({ chart }: { chart: SajuGChartType }) {
  const cards = sajuGGodCards(chart);
  const id = useId();
  return (
    <section className="saju-g-discovery-section" aria-labelledby={id}>
      <div className="saju-g-section-heading">
        <div>
          <span className="saju-g-eyebrow">THE LANGUAGE BETWEEN</span>
          <h2 id={id}>내 명식 속 십성 이야기</h2>
        </div>
        <span className="saju-g-soft-label">
          {cards.length ? `${cards.length}가지 관계` : '관계 미확정'}
        </span>
      </div>
      <p className="saju-g-field-hint">
        십성은 나를 나타내는 일간과 다른 글자의 관계를 부르는 이름이에요. 카드를 열면 쉬운 뜻과 내
        명식 속 위치가 보여요.
      </p>
      {cards.length ? (
        <>
          <div className="saju-g-god-grid">
            {cards.map((card, index) => (
              <details className="saju-g-god-card" key={card.name}>
                <summary>
                  <span className="saju-g-god-number">{String(index + 1).padStart(2, '0')}</span>
                  <span>
                    <strong>{card.keyword}</strong>
                    <small>{card.name}</small>
                  </span>
                  <ChevronDown size={16} />
                </summary>
                <div className="saju-g-god-body">
                  <p>{card.text}</p>
                  <div className="saju-g-god-positions" aria-label={`${card.name}의 위치`}>
                    {card.positions.map((position) => (
                      <span key={position}>{position}</span>
                    ))}
                  </div>
                  <blockquote>{card.question}</blockquote>
                </div>
              </details>
            ))}
          </div>
          <p className="saju-g-field-hint saju-g-god-note">
            지장간은 아랫글자 안에 담긴 천간을 뜻해요. 같은 십성이 여러 곳에 있어도 성격의 강도를
            뜻하지 않으며, 보이지 않는 십성도 능력의 부족을 뜻하지 않아요.
          </p>
        </>
      ) : (
        <div className="saju-g-discovery-empty">
          <p>
            일간과 글자의 관계가 확정되면 카드를 보여드려요. 미확정 글자에서 십성을 추측하지
            않았어요.
          </p>
        </div>
      )}
    </section>
  );
}
