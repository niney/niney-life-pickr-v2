import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Share2, Sparkles, X } from 'lucide-react';
import {
  CreateSajuGPairInput,
  type CreateSajuGPairInputType,
  type SajuGBirthType,
  type SajuGRelationshipType,
} from '@repo/api-contract';
import { useAuthStore, useSajuGProfiles, useSajuGPairReading } from '@repo/shared';
import { SAJU_G_RELATIONSHIP_LABEL } from '@repo/utils';
import { SajuGBirthForm } from '~/components/saju-g/SajuGBirthForm';
import { SajuGPairVisual } from '~/components/saju-g/SajuGPairVisual';
import { SajuGShareDialog } from '~/components/saju-g/SajuGShareDialog';
import '~/components/saju-g/saju-g.css';
import '~/components/saju-g/saju-g-next.css';

export function SajuGPairPage() {
  const principal = useAuthStore((s) => s.user?.id ?? 'guest');
  return <Pair key={principal} />;
}
function BirthDialog({
  side,
  initial,
  onChoose,
  onClose,
}: {
  side: number;
  initial: SajuGBirthType | null;
  onChoose: (birth: SajuGBirthType) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="saju-g-share-dialog saju-g-person-dialog"
      onCancel={onClose}
      aria-label={`${side + 1}번째 사람 출생정보`}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="saju-g-dialog-body">
        <button className="saju-g-dialog-close" aria-label="입력 창 닫기" onClick={onClose}>
          <X size={20} />
        </button>
        <SajuGBirthForm
          mode="pair"
          heading={`${side + 1}번째 사람의 시작`}
          initial={initial ? { birth: initial, kind: 'natal', note: '' } : undefined}
          submitLabel="이 정보로 선택"
          onSubmit={(input) => {
            onChoose(input.birth);
            onClose();
          }}
        />
      </div>
    </dialog>
  );
}
function Pair() {
  const profiles = useSajuGProfiles();
  const reading = useSajuGPairReading();
  const resetReading = reading.reset;
  const [params] = useSearchParams();
  const firstParam = params.get('first');
  const loaded = useRef('');
  const [selected, setSelected] = useState(['', '']);
  const [manual, setManual] = useState<[SajuGBirthType | null, SajuGBirthType | null]>([
    null,
    null,
  ]);
  const [editing, setEditing] = useState<number | null>(null);
  const [relationship, setRelationship] = useState<SajuGRelationshipType>('partner');
  const [note, setNote] = useState('');
  const [input, setInput] = useState<CreateSajuGPairInputType | null>(null);
  const [message, setMessage] = useState('');
  const [shareKey, setShareKey] = useState<string | null>(null);
  const resultTop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (
      firstParam &&
      loaded.current !== firstParam &&
      profiles.profiles.some((p) => p.id === firstParam)
    ) {
      loaded.current = firstParam;
      setSelected((v) => [firstParam, v[1]!]);
    }
  }, [firstParam, profiles.profiles]);
  const people = selected.map((id, i) => {
    const profile = profiles.profiles.find((p) => p.id === id);
    return {
      name: profile?.name ?? (i ? '두 번째 사람' : '첫 번째 사람'),
      birth: id ? (profile?.birth ?? null) : manual[i]!,
      revision: profile?.revision,
    };
  });
  const selectionKey = JSON.stringify([
    selected,
    people.map((p) => [p.birth, p.revision]),
    relationship,
  ]);
  useEffect(() => {
    resetReading();
  }, [selectionKey, resetReading]);
  const start = () => {
    const parsed = CreateSajuGPairInput.safeParse({
      first: people[0]!.birth,
      second: people[1]!.birth,
      relationship,
      note,
    });
    if (!parsed.success) {
      setMessage('두 사람의 출생정보를 선택해 주세요.');
      return;
    }
    setMessage('');
    setShareKey(null);
    setInput(parsed.data);
    void reading.start(parsed.data);
  };
  useEffect(() => {
    if (reading.chart) resultTop.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, [reading.chart]);
  const active = reading.pending || !!reading.chart;
  const publicPerson = (side: 'first' | 'second') => {
    const chart = reading.chart![side];
    return {
      element: chart.dayMaster?.element ?? null,
      symbol: chart.dayMaster?.symbol ?? '가능성',
      elements: chart.elements,
      unknownCharacters: chart.unknownCharacters,
    };
  };
  return (
    <div className="saju-g-page">
      <div className="saju-g-shell">
        <header className="saju-g-nav">
          <Link to="/saju-g" className="saju-g-brand">
            <span>命</span>사주(G)
          </Link>
          <div className="saju-g-next-nav">
            <Link to="/me/saju-g/profiles">프로필 관리</Link>
            <Link to="/saju-g">나의 사주(G)</Link>
          </div>
        </header>
        {!active ? (
          <main className="saju-g-pair-landing">
            <span className="saju-g-eyebrow">TWO WORLDS, ONE CONVERSATION</span>
            <h1>
              서로 다른 두 우주가
              <br />
              <em>마주하는 순간</em>
            </h1>
            <p className="saju-g-next-lead">
              닮은 결은 가까이, 다른 결은 다정하게.
              <br />
              우리의 관계를 비추는 오행 지도를 펼쳐 보세요.
            </p>
            <SajuGPairVisual />
            <section className="saju-g-pair-input" aria-label="궁합 입력">
              <div className="saju-g-pair-people">
                {people.map((person, i) => (
                  <article key={i} className="saju-g-pair-person">
                    <span className="saju-g-eyebrow">{i ? 'THE OTHER WORLD' : 'ONE WORLD'}</span>
                    <h2>{person.name}</h2>
                    <label className="saju-g-field-label" htmlFor={`pair-person-${i}`}>
                      {i + 1}번째 사람 선택
                    </label>
                    <select
                      id={`pair-person-${i}`}
                      value={selected[i]}
                      onChange={(e) =>
                        setSelected((v) => v.map((id, j) => (j === i ? e.target.value : id)))
                      }
                    >
                      <option value="">직접 입력하기</option>
                      {profiles.profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {person.birth ? (
                      <p className="saju-g-field-hint">
                        {person.birth.calendar === 'lunar' ? '음력' : '양력'} {person.birth.date}
                        {person.birth.leapMonth ? ' · 윤달' : ''} ·{' '}
                        {person.birth.timeAccuracy === 'exact'
                          ? person.birth.time
                          : '시간 일부 또는 모름'}
                      </p>
                    ) : (
                      <p className="saju-g-field-hint">아직 출생정보를 선택하지 않았어요.</p>
                    )}
                    {!selected[i] && (
                      <button className="saju-g-secondary" onClick={() => setEditing(i)}>
                        {manual[i] ? '출생정보 수정' : '출생정보 입력'}
                        <ArrowRight size={15} />
                      </button>
                    )}
                  </article>
                ))}
              </div>
              {profiles.isError && (
                <p className="saju-g-error">
                  프로필을 불러오지 못했어요.{' '}
                  <button onClick={() => void profiles.refetch()}>다시 불러오기</button>
                </p>
              )}
              <fieldset className="saju-g-relationship">
                <legend>어떤 사이인가요?</legend>
                <div>
                  {(Object.keys(SAJU_G_RELATIONSHIP_LABEL) as SajuGRelationshipType[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={relationship === r}
                      onClick={() => setRelationship(r)}
                    >
                      {SAJU_G_RELATIONSHIP_LABEL[r]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="saju-g-field-label" htmlFor="pair-note">
                함께 궁금한 이야기 <small>선택</small>
              </label>
              <textarea
                id="pair-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                rows={2}
                placeholder="예: 서로 연락하는 속도가 달라요. 어떻게 이야기하면 좋을까요?"
              />
              {(message || reading.error) && (
                <p className="saju-g-error" role="alert">
                  {message || reading.error}
                </p>
              )}
              <button
                className="saju-g-primary saju-g-pair-submit"
                disabled={!people[0]!.birth || !people[1]!.birth}
                onClick={start}
              >
                <Sparkles size={18} />
                우리의 오행 지도 펼치기
              </button>
              <p className="saju-g-consent">
                선택한 관계와 명식의 근거·관심사를 AI에 전달해요. 프로필의 별명과 원본 출생정보는
                전달하지 않아요. 입력은 자동 보관하지 않아요.
              </p>
            </section>
            {editing !== null && (
              <BirthDialog
                side={editing}
                initial={manual[editing]!}
                onClose={() => setEditing(null)}
                onChoose={(birth) =>
                  setManual((v) => (editing === 0 ? [birth, v[1]] : [v[0], birth]))
                }
              />
            )}
          </main>
        ) : (
          <main className="saju-g-pair-result" ref={resultTop}>
            <button className="saju-g-text-button" onClick={reading.reset}>
              <ArrowLeft size={15} />두 사람 다시 선택
            </button>
            <div className="saju-g-pair-result-heading">
              <span className="saju-g-eyebrow">
                OUR CONSTELLATION · {SAJU_G_RELATIONSHIP_LABEL[relationship]}
              </span>
              <h1>{reading.chart?.title ?? '두 사람의 시작을 펼치고 있어요'}</h1>
              <p>
                {people[0]!.name} <span>✦</span> {people[1]!.name}
              </p>
            </div>
            <SajuGPairVisual
              first={reading.chart ? publicPerson('first') : undefined}
              second={reading.chart ? publicPerson('second') : undefined}
            />
            {reading.chart && (
              <div className="saju-g-pair-basis">
                <span>두 일간의 관계</span>
                <p>{reading.chart.description}</p>
              </div>
            )}
            {reading.pending && (
              <div role="status" className="saju-g-pair-loading">
                <span className="saju-g-pair-loading-star">✦</span>
                <h2>우리의 이야기를 읽고 있어요</h2>
                <p>닮은 부분과 다른 속도, 함께 나눌 대화를 차분히 살펴보고 있어요.</p>
              </div>
            )}
            {reading.error && (
              <div role="alert" className="saju-g-error">
                {reading.error}
                <button onClick={() => input && void reading.start(input)}>다시 시도</button>
              </div>
            )}
            {reading.result && (
              <>
                {reading.result.source === 'basic' && (
                  <div className="saju-g-basic-notice">
                    <p>
                      {reading.result.fallbackReason === 'quota'
                        ? '오늘 AI 이용량을 모두 사용해 기본 관계 풀이를 보여드려요.'
                        : '지금은 계산 근거의 기본 풀이를 보여드려요.'}
                    </p>
                    <button onClick={() => input && void reading.start(input)}>
                      AI 해석 다시 시도
                    </button>
                  </div>
                )}
                <section className="saju-g-pair-story">
                  <span className="saju-g-eyebrow">A STORY BETWEEN US</span>
                  <h2>{reading.result.report.headline}</h2>
                  <p>{reading.result.report.summary}</p>
                </section>
                <div className="saju-g-pair-chapters">
                  {reading.result.report.sections.map((s, i) => (
                    <article key={s.id}>
                      <span className="saju-g-chapter-number">0{i + 1}</span>
                      <h2>{s.title}</h2>
                      <p>{s.text}</p>
                      <details>
                        <summary>이 이야기의 근거</summary>
                        {s.evidenceIds.map((id) => (
                          <p key={id}>
                            {reading.chart?.facts.find((f) => f.id === id)?.description}
                          </p>
                        ))}
                      </details>
                    </article>
                  ))}
                </div>
                <div className="saju-g-pair-practice">
                  <span>오늘, 우리 둘이</span>
                  <h2>{reading.result.report.reflection}</h2>
                  <p>{reading.result.report.practice}</p>
                </div>
                <div className="saju-g-result-actions">
                  <button className="saju-g-primary" onClick={() => setShareKey(selectionKey)}>
                    <Share2 size={17} />
                    우리의 오행 지도 공유
                  </button>
                  <Link to="/me/saju-g/profiles" className="saju-g-secondary">
                    프로필 관리
                  </Link>
                </div>
                {shareKey === selectionKey && input && (
                  <SajuGShareDialog
                    pair={{ first: input.first, second: input.second }}
                    onClose={() => setShareKey(null)}
                  />
                )}
              </>
            )}
            {reading.chart && (
              <details className="saju-g-pair-notices">
                <summary>계산 기준과 확인할 부분</summary>
                {reading.chart.notices.map((n, i) => (
                  <p key={i}>{n}</p>
                ))}
                <p>
                  일간 오행과 상호 십성의 상징을 살펴보는 궁합이에요. 오행 개수는 확인된 글자의
                  구성만 뜻해요.
                </p>
              </details>
            )}
          </main>
        )}
        <footer className="saju-g-footer">
          <span>
            命 <strong>LIFE PICKR</strong>
          </span>
          <p>
            서로를 알아가는 또 하나의 지도.
            <br />
            우리의 이야기는 함께 만들어 가요.
          </p>
        </footer>
      </div>
    </div>
  );
}
