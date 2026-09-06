import { useState, type CSSProperties } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import type { SajuGChartType, SajuGReadingResultType } from '@repo/api-contract';
import { SAJU_G_ELEMENT_META, SAJU_GOD_MEANING, type SajuGElementId } from '@repo/utils';

export function SajuGReportView({
  chart,
  result,
  pending = false,
  selected: controlledSelected,
  onSelect,
}: {
  chart: SajuGChartType;
  result: SajuGReadingResultType | null;
  pending?: boolean;
  selected?: SajuGElementId | null;
  onSelect?: (element: SajuGElementId) => void;
}) {
  const [openMonth, setOpenMonth] = useState<number | null>(null);
  const [localSelected, setLocalSelected] = useState<SajuGElementId | null>(null);
  const selected = controlledSelected === undefined ? localSelected : controlledSelected;
  const select = (element: SajuGElementId) =>
    onSelect
      ? onSelect(element)
      : setLocalSelected((previous) => (previous === element ? null : element));
  const total = 8 - chart.unknownCharacters;
  return (
    <div className="saju-g-report">
      <section className="saju-g-pillars-section" aria-labelledby="saju-g-pillars-title">
        <div className="saju-g-section-heading">
          <div>
            <span className="saju-g-eyebrow">FOUR PILLARS</span>
            <h2 id="saju-g-pillars-title">당신을 이루는 네 기둥</h2>
          </div>
          <span className="saju-g-soft-label">{chart.timeLabel}</span>
        </div>
        <div className="saju-g-pillars">
          {chart.pillars.map((pillar, i) => (
            <div
              className={`saju-g-pillar ${pillar.key === 'day' ? 'is-day' : ''}`}
              key={pillar.key}
              style={{ '--reveal-delay': `${i * 140}ms` } as CSSProperties}
            >
              <span className="saju-g-pillar-label">
                {pillar.label}
                {pillar.key === 'day' && <small>나</small>}
              </span>
              <strong
                style={{
                  color: pillar.stemElement
                    ? SAJU_G_ELEMENT_META[pillar.stemElement].color
                    : undefined,
                  opacity: !selected || !pillar.ganZhi || selected === pillar.stemElement ? 1 : 0.3,
                  textShadow:
                    selected === pillar.stemElement && selected
                      ? '0 0 24px currentColor'
                      : undefined,
                }}
              >
                {pillar.ganZhi?.[0] ?? '—'}
              </strong>
              <strong
                style={{
                  color: pillar.branchElement
                    ? SAJU_G_ELEMENT_META[pillar.branchElement].color
                    : undefined,
                  opacity:
                    !selected || !pillar.ganZhi || selected === pillar.branchElement ? 1 : 0.3,
                  textShadow:
                    selected === pillar.branchElement && selected
                      ? '0 0 24px currentColor'
                      : undefined,
                }}
              >
                {pillar.ganZhi?.[1] ?? '—'}
              </strong>
              <span className="saju-g-pillar-reading">{pillar.pronunciation ?? '열려 있어요'}</span>
              <span className="saju-g-pillar-god">
                {pillar.key === 'day'
                  ? '나를 나타내는 일간'
                  : (pillar.tenGod ?? '시간에 따라 달라져요')}
              </span>
            </div>
          ))}
        </div>
        {chart.unknownCharacters > 0 && (
          <p className="saju-g-field-hint">
            빈 기둥은 입력한 시간 범위에 따라 달라져요. 하나로 단정하지 않고 가능성을 남겨 두었어요.
          </p>
        )}
      </section>
      <section className="saju-g-elements-section" aria-labelledby="saju-g-elements-title">
        <div className="saju-g-section-heading">
          <div>
            <span className="saju-g-eyebrow">FIVE ELEMENTS</span>
            <h2 id="saju-g-elements-title">다섯 가지 기운의 구성</h2>
          </div>
          <span className="saju-g-soft-label">확인된 {total}글자 기준</span>
        </div>
        <div className="saju-g-element-track" aria-hidden="true">
          {chart.elements
            .filter((e) => e.count > 0)
            .map((e) => (
              <div
                key={e.element}
                style={{
                  flex: e.count,
                  backgroundColor: SAJU_G_ELEMENT_META[e.element].color,
                  opacity: !selected || selected === e.element ? 1 : 0.4,
                }}
              />
            ))}
        </div>
        <div className="saju-g-element-buttons">
          {chart.elements.map((e) => (
            <button
              key={e.element}
              type="button"
              onClick={() => select(e.element)}
              aria-pressed={selected === e.element}
              style={{ '--element-color': SAJU_G_ELEMENT_META[e.element].color } as CSSProperties}
            >
              <span className="saju-g-element-name">
                {SAJU_G_ELEMENT_META[e.element].hanja}
                <span>{SAJU_G_ELEMENT_META[e.element].name}</span>
              </span>
              <strong>
                {e.count}
                <small>개</small>
              </strong>
              <span>{SAJU_G_ELEMENT_META[e.element].meaning}</span>
            </button>
          ))}
        </div>
        <p className="saju-g-field-hint">
          표면에 나타난 글자의 개수예요. 성격의 점수나 좋고 나쁨을 뜻하지 않아요.
        </p>
      </section>
      <section className="saju-g-interpretation" aria-live="polite" aria-busy={pending}>
        {result ? (
          <>
            <div className="saju-g-reading-intro">
              <span className="saju-g-eyebrow">
                {result.source === 'ai' ? 'YOUR READING' : 'THE MEANING OF YOUR CHART'}
              </span>
              <h2>{result.report.headline}</h2>
              <p>{result.report.summary}</p>
              <span className="saju-g-source">
                <Sparkles size={13} />
                {result.source === 'ai' ? 'AI가 풀어 드리는 이야기' : '명식의 기본 풀이'}
              </span>
            </div>
            <div className="saju-g-chapters">
              {result.report.sections.map((section, i) => (
                <article key={section.id} className="saju-g-chapter">
                  <span className="saju-g-chapter-number">0{i + 1}</span>
                  <div>
                    <h3>{section.title}</h3>
                    <p>{section.text}</p>
                    <details className="saju-g-evidence">
                      <summary>
                        이 해석의 바탕 <ChevronDown size={12} />
                      </summary>
                      {section.evidenceIds.map((id) => {
                        const fact = chart.facts.find((f) => f.id === id);
                        return fact ? (
                          <p key={id}>
                            <strong>{fact.label}</strong> {fact.description}
                          </p>
                        ) : null;
                      })}
                    </details>
                  </div>
                </article>
              ))}
            </div>
            <div className="saju-g-practice">
              <span className="saju-g-eyebrow">A SMALL STEP</span>
              <h3>오늘, 작은 실천 하나</h3>
              <p>{result.report.practice}</p>
              <div className="saju-g-reflection">{result.report.reflection}</div>
            </div>
          </>
        ) : pending ? (
          <div className="saju-g-waiting">
            <span className="saju-g-loader" />
            <h3>당신의 이야기를 읽고 있어요</h3>
            <p>
              위의 명식과 오행을 먼저 살펴보세요.
              <br />
              여러 기둥의 관계를 차근차근 풀고 있어요.
            </p>
          </div>
        ) : null}
      </section>
      {chart.period.months.length > 0 && (
        <section className="saju-g-months">
          <div className="saju-g-section-heading">
            <div>
              <span className="saju-g-eyebrow">THROUGH THE SEASONS</span>
              <h2>열두 달을 지나는 마음</h2>
            </div>
          </div>
          <p className="saju-g-field-hint">
            달을 누르면 절기 시작과 일간의 관계를 볼 수 있어요. 각 구간은 다음 절기까지 이어져요.
          </p>
          <div className="saju-g-month-grid">
            {chart.period.months.map((month) => (
              <button
                key={month.month}
                aria-expanded={openMonth === month.month}
                onClick={() => setOpenMonth(openMonth === month.month ? null : month.month)}
              >
                <span>
                  {String(month.month).padStart(2, '0')}
                  <small>월</small>
                </span>
                <strong>{month.term}</strong>
                <small>{month.relation ?? '관계 미확정'}</small>
                {openMonth === month.month && (
                  <p>
                    {month.start.slice(5, 10).replace('-', '/')} {month.start.slice(11, 16)}부터
                    <br />
                    {month.description}
                  </p>
                )}
              </button>
            ))}
          </div>
        </section>
      )}
      <details className="saju-g-calculation">
        <summary>
          내 명식과 계산 기준 자세히 보기 <ChevronDown size={15} />
        </summary>
        <div className="saju-g-calculation-inner">
          <p>
            양력 {chart.solarDate} · 음력 {chart.lunarDate}
          </p>
          {chart.standardTime && (
            <p>계산에 사용한 표준시: {chart.standardTime.replace('T', ' ')}</p>
          )}
          {chart.notices.map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
          <p>
            일간은 일주 윗글자로, 사주에서 나를 나타내는 중심이에요. 십성은 이 일간과 다른 글자의
            관계를 부르는 말이에요.
          </p>
          {chart.pillars.map((pillar) => (
            <div key={pillar.key} className="saju-g-detail-pillar">
              <strong>
                {pillar.label} · {pillar.ganZhi ?? '미확정'}
              </strong>
              <span>
                {pillar.tenGod ? `${pillar.tenGod}: ${SAJU_GOD_MEANING[pillar.tenGod]}` : ''}
              </span>
              {pillar.hiddenStems.length > 0 && (
                <span>
                  지장간:{' '}
                  {pillar.hiddenStems
                    .map((s) => `${s.ko}(${s.hanja})${s.tenGod ? ` ${s.tenGod}` : ''}`)
                    .join(' · ')}
                </span>
              )}
              {!pillar.ganZhi && <span>가능한 기둥: {pillar.candidates.join(' · ')}</span>}
            </div>
          ))}
          <p>
            계산 v{chart.calculationVersion}
            {result?.source === 'ai' &&
              ` · 해석 ${result.model} · 프롬프트 v${result.promptVersion}`}
          </p>
        </div>
      </details>
    </div>
  );
}
