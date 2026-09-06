import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Download, History, Share2 } from 'lucide-react';
import {
  sajuGApi,
  storeDeviceSajuG,
  useAuthStore,
  useSajuGReading,
  useSajuGProfiles,
} from '@repo/shared';
import type { CreateSajuGReadingInputType, SajuGKindType } from '@repo/api-contract';
import { SAJU_G_KIND_LABEL, type SajuGElementId } from '@repo/utils';
import { SajuGBirthForm } from '~/components/saju-g/SajuGBirthForm';
import { SajuGVisual } from '~/components/saju-g/SajuGVisual';
import { SajuGReportView } from '~/components/saju-g/SajuGReportView';
import { SajuGShareDialog } from '~/components/saju-g/SajuGShareDialog';
import { SajuGSaveProfileDialog } from '~/components/saju-g/SajuGSaveProfileDialog';
import '~/components/saju-g/saju-g.css';
import '~/components/saju-g/saju-g-next.css';

export function SajuGPage() {
  const principal = useAuthStore((s) => s.user?.id ?? 'guest');
  return <SajuGExperience key={principal} principal={principal} />;
}
function SajuGExperience({ principal }: { principal: string }) {
  const reading = useSajuGReading();
  const startReading = reading.start;
  const profiles = useSajuGProfiles();
  const [params] = useSearchParams();
  const profileId = params.get('profile');
  const requestedKind = params.get('kind');
  const openedProfile = useRef('');
  const [profileSave, setProfileSave] = useState(false);
  const [formKey, setFormKey] = useState('manual');
  const queryClient = useQueryClient();
  const [input, setInput] = useState<CreateSajuGReadingInputType | undefined>();
  const [selected, setSelected] = useState<SajuGElementId | null>(null);
  const [finishedChart, setFinishedChart] = useState('');
  const [share, setShare] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const reportTop = useRef<HTMLDivElement>(null);
  const chartKey = reading.chart
    ? JSON.stringify([
        reading.chart.solarDate,
        reading.chart.timeLabel,
        reading.chart.dayBoundary,
        reading.chart.period,
      ])
    : '';
  const revealing = !!chartKey && finishedChart !== chartKey;
  useEffect(() => {
    if (!chartKey) return;
    reportTop.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
    const timer = window.setTimeout(() => setFinishedChart(chartKey), 4800);
    return () => clearTimeout(timer);
  }, [chartKey]);
  const start = (value: CreateSajuGReadingInputType) => {
    setInput(value);
    setSelected(null);
    setMessage('');
    void reading.start(value);
  };
  const kind = (value: SajuGKindType) => {
    if (input) start({ ...input, kind: value });
  };
  useEffect(() => {
    if (!profileId) {
      openedProfile.current = '';
      return;
    }
    const profile = profiles.profiles.find((p) => p.id === profileId);
    const request = `${profileId}:${requestedKind}`;
    if (!profile || openedProfile.current === request) return;
    // 캐시된 프로필로 진입해도 StrictMode의 첫 cleanup이 실제 요청을 취소하지 않도록 한다.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      openedProfile.current = request;
      setFormKey(profile.id);
      const value: CreateSajuGReadingInputType = {
        birth: profile.birth,
        kind: requestedKind === 'daily' || requestedKind === 'annual' ? requestedKind : 'natal',
        note: '',
      };
      setInput(value);
      void startReading(value);
    });
    return () => {
      cancelled = true;
    };
  }, [profileId, requestedKind, profiles.profiles, startReading]);
  const save = async () => {
    if (!reading.result) return;
    setSaving(true);
    setMessage('');
    try {
      if (principal === 'guest') {
        storeDeviceSajuG(principal, reading.result);
        setMessage('이 기기에 보관했어요. 보관함에서 삭제할 수 있어요.');
      } else if (reading.result.receipt) {
        const result = await sajuGApi.save(reading.result.receipt);
        reading.setResult(result);
        void queryClient.invalidateQueries({ queryKey: ['saju-g', 'mine', principal] });
        setMessage('내 계정에 보관했어요.');
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '저장 공간을 확인해 주세요.');
    } finally {
      setSaving(false);
    }
  };
  const active = !!reading.chart || reading.pending;
  return (
    <div className="saju-g-page">
      <div className="saju-g-shell">
        <header className="saju-g-nav">
          <Link to="/saju-g" onClick={() => reading.reset()} className="saju-g-brand">
            <span>命</span>사주(G) <small>나의 오행 지도</small>
          </Link>
          <div className="saju-g-next-nav">
            <Link to="/saju-g/pair">우리의 궁합</Link>
            <Link to="/me/saju-g/profiles">프로필</Link>
            <Link to="/me/saju-g" className="saju-g-history-link">
              <History size={15} />
              보관함
            </Link>
          </div>
        </header>
        {!active ? (
          <>
            <div className="saju-g-landing">
              <section className="saju-g-intro">
                <span className="saju-g-eyebrow">THE ART OF UNDERSTANDING YOU</span>
                <h1>
                  나를 알아가는
                  <br />
                  <em>또 하나의 지도</em>
                </h1>
                <p>
                  태어난 순간에 담긴 나만의 결.
                  <br />
                  오행의 빛과 네 기둥으로 천천히 읽어 보세요.
                </p>
                <SajuGVisual chart={null} active={null} revealing={false} />
                <div className="saju-g-intro-caption">
                  <span>四柱</span>
                  <span>
                    시간이 만든 네 기둥
                    <br />
                    나를 비추는 다섯 가지 기운
                  </span>
                </div>
              </section>
              <div>
                {reading.error && (
                  <p className="saju-g-error" role="alert">
                    {reading.error}
                  </p>
                )}
                {profiles.profiles.length > 0 && (
                  <label className="saju-g-profile-picker">
                    기억해 둔 사람
                    <select
                      aria-label="출생 프로필 선택"
                      value={formKey}
                      onChange={(e) => {
                        const p = profiles.profiles.find((v) => v.id === e.target.value);
                        setFormKey(e.target.value);
                        setInput(p ? { birth: p.birth, kind: 'natal', note: '' } : undefined);
                      }}
                    >
                      <option value="manual">직접 입력하기</option>
                      {profiles.profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {profileId &&
                  !profiles.isLoading &&
                  !profiles.profiles.some((p) => p.id === profileId) && (
                    <p className="saju-g-error" role="alert">
                      프로필을 찾을 수 없어요. 로그인 상태를 확인하거나 직접 입력해 주세요.
                    </p>
                  )}
                <SajuGBirthForm key={formKey} initial={input} onSubmit={start} />
              </div>
            </div>
            <div className="saju-g-features">
              <div>
                <span>01</span>
                <h3>나의 사주(G)</h3>
                <p>강점과 관계, 나답게 일하는 방식</p>
              </div>
              <div>
                <span>02</span>
                <h3>올해의 흐름</h3>
                <p>계절을 지나며 살펴볼 열두 달의 이야기</p>
              </div>
              <div>
                <span>03</span>
                <h3>오늘의 흐름</h3>
                <p>하루를 시작하는 작은 관점과 실천</p>
              </div>
            </div>
          </>
        ) : (
          <div ref={reportTop} className="saju-g-result-wrap">
            <button className="saju-g-text-button" onClick={() => reading.reset()}>
              <ArrowLeft size={15} />
              태어난 정보 수정
            </button>
            <div className="saju-g-result-hero">
              <div>
                <span className="saju-g-eyebrow">YOUR OWN CONSTELLATION OF ELEMENTS</span>
                <h1>
                  {reading.chart?.dayMaster
                    ? '당신을 닮은'
                    : reading.chart
                      ? '아직 열려 있는'
                      : '당신의 시작을'}
                  <br />
                  <em>
                    {reading.chart?.dayMaster?.symbol ??
                      (reading.chart ? '나만의 이야기' : '펼치고 있어요')}
                  </em>
                </h1>
                <p>
                  {reading.chart?.dayMaster?.description ??
                    '각 기둥과 절기의 경계를 살펴보고 있어요.'}
                </p>
                {reading.chart && (
                  <div className="saju-g-kind-tabs" aria-label="풀이 종류">
                    {(['natal', 'annual', 'daily'] as const).map((k) => (
                      <button
                        type="button"
                        key={k}
                        aria-pressed={input?.kind === k}
                        onClick={() => kind(k)}
                      >
                        {SAJU_G_KIND_LABEL[k]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <SajuGVisual chart={reading.chart} active={selected} revealing={revealing} />
                {revealing && (
                  <button className="saju-g-skip" onClick={() => setFinishedChart(chartKey)}>
                    연출 건너뛰기
                  </button>
                )}
              </div>
            </div>
            {reading.chart && (
              <SajuGReportView
                chart={reading.chart}
                result={reading.result}
                pending={reading.pending}
                selected={selected}
                onSelect={(element) =>
                  setSelected((previous) => (previous === element ? null : element))
                }
              />
            )}
            {reading.error && (
              <div className="saju-g-error" role="alert">
                {reading.error}
                <button onClick={() => input && start(input)}>다시 시도</button>
              </div>
            )}
            {reading.result && (
              <>
                {reading.result.source === 'basic' && (
                  <div className="saju-g-basic-notice">
                    <BookOpen size={17} />
                    <p>
                      {reading.result.fallbackReason === 'quota'
                        ? '오늘 AI 이용량을 모두 사용해 명식의 기본 풀이를 보여드려요.'
                        : '지금은 명식의 기본 풀이를 보여드려요. AI 해석은 잠시 후 다시 시도할 수 있어요.'}
                    </p>
                    <button onClick={() => input && start(input)}>다시 시도</button>
                  </div>
                )}
                <div className="saju-g-result-actions">
                  <button className="saju-g-secondary" onClick={() => setProfileSave(true)}>
                    출생 프로필로 저장
                  </button>
                  <button className="saju-g-primary" onClick={() => setShare(true)}>
                    <Share2 size={17} />
                    나의 오행 지도 공유
                  </button>
                  <button
                    className="saju-g-secondary"
                    onClick={save}
                    disabled={saving || !!reading.result.readingId}
                  >
                    <Download size={16} />
                    {reading.result.readingId
                      ? '계정에 보관됨'
                      : principal === 'guest'
                        ? '이 기기에 보관'
                        : '내 계정에 보관'}
                  </button>
                </div>
                <p className="saju-g-field-hint saju-g-save-hint">
                  {principal === 'guest'
                    ? '기기에 보관하면 이 브라우저에 출생정보와 결과가 저장돼요.'
                    : '보관을 누르면 계정에 출생정보와 결과가 저장돼요.'}{' '}
                  보관함에서 언제든 삭제할 수 있어요.
                </p>
                {message && (
                  <p className="saju-g-action-message" role="status">
                    {message}
                  </p>
                )}
                {share && (
                  <SajuGShareDialog result={reading.result} onClose={() => setShare(false)} />
                )}
                {profileSave && (
                  <SajuGSaveProfileDialog
                    birth={reading.result.birth}
                    onClose={() => setProfileSave(false)}
                  />
                )}
              </>
            )}
          </div>
        )}
        <footer className="saju-g-footer">
          <span>
            命 <strong>LIFE PICKR</strong>
          </span>
          <p>
            전통의 상징을 통해 나를 돌아보는 시간이에요.
            <br />
            당신의 내일은 당신의 선택으로 채워져요.
          </p>
        </footer>
      </div>
    </div>
  );
}
