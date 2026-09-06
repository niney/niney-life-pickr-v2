import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Download, History, Share2 } from 'lucide-react';
import {
  sajuApi,
  storeDeviceSaju,
  useAuthStore,
  useSajuReading,
  useSajuProfiles,
} from '@repo/shared';
import type { CreateSajuReadingInputType, SajuKindType } from '@repo/api-contract';
import { SAJU_KIND_LABEL, type SajuElementId } from '@repo/utils';
import { SajuBirthForm } from '~/components/saju/SajuBirthForm';
import { SajuVisual } from '~/components/saju/SajuVisual';
import { SajuReportView } from '~/components/saju/SajuReportView';
import { SajuShareDialog } from '~/components/saju/SajuShareDialog';
import { SajuSaveProfileDialog } from '~/components/saju/SajuSaveProfileDialog';
import '~/components/saju/saju.css';
import '~/components/saju/saju-next.css';

export function SajuPage() {
  const principal = useAuthStore((s) => s.user?.id ?? 'guest');
  return <SajuExperience key={principal} principal={principal} />;
}
function SajuExperience({ principal }: { principal: string }) {
  const reading = useSajuReading();
  const startReading = reading.start;
  const profiles = useSajuProfiles();
  const [params] = useSearchParams();
  const profileId = params.get('profile');
  const requestedKind = params.get('kind');
  const openedProfile = useRef('');
  const [profileSave, setProfileSave] = useState(false);
  const [formKey, setFormKey] = useState('manual');
  const queryClient = useQueryClient();
  const [input, setInput] = useState<CreateSajuReadingInputType | undefined>();
  const [selected, setSelected] = useState<SajuElementId | null>(null);
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
  const start = (value: CreateSajuReadingInputType) => {
    setInput(value);
    setSelected(null);
    setMessage('');
    void reading.start(value);
  };
  const kind = (value: SajuKindType) => {
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
      const value: CreateSajuReadingInputType = {
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
        storeDeviceSaju(principal, reading.result);
        setMessage('이 기기에 보관했어요. 보관함에서 삭제할 수 있어요.');
      } else if (reading.result.receipt) {
        const result = await sajuApi.save(reading.result.receipt);
        reading.setResult(result);
        void queryClient.invalidateQueries({ queryKey: ['saju', 'mine', principal] });
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
    <div className="saju-page">
      <div className="saju-shell">
        <header className="saju-nav">
          <Link to="/saju" onClick={() => reading.reset()} className="saju-brand">
            <span>命</span>사주 <small>나의 오행 지도</small>
          </Link>
          <div className="saju-next-nav">
            <Link to="/saju/pair">우리의 궁합</Link>
            <Link to="/me/saju/profiles">프로필</Link>
            <Link to="/me/saju" className="saju-history-link">
              <History size={15} />
              보관함
            </Link>
          </div>
        </header>
        {!active ? (
          <>
            <div className="saju-landing">
              <section className="saju-intro">
                <span className="saju-eyebrow">THE ART OF UNDERSTANDING YOU</span>
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
                <SajuVisual chart={null} active={null} revealing={false} />
                <div className="saju-intro-caption">
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
                  <p className="saju-error" role="alert">
                    {reading.error}
                  </p>
                )}
                {profiles.profiles.length > 0 && (
                  <label className="saju-profile-picker">
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
                    <p className="saju-error" role="alert">
                      프로필을 찾을 수 없어요. 로그인 상태를 확인하거나 직접 입력해 주세요.
                    </p>
                  )}
                <SajuBirthForm key={formKey} initial={input} onSubmit={start} />
              </div>
            </div>
            <div className="saju-features">
              <div>
                <span>01</span>
                <h3>나의 사주</h3>
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
          <div ref={reportTop} className="saju-result-wrap">
            <button className="saju-text-button" onClick={() => reading.reset()}>
              <ArrowLeft size={15} />
              태어난 정보 수정
            </button>
            <div className="saju-result-hero">
              <div>
                <span className="saju-eyebrow">YOUR OWN CONSTELLATION OF ELEMENTS</span>
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
                  <div className="saju-kind-tabs" aria-label="풀이 종류">
                    {(['natal', 'annual', 'daily'] as const).map((k) => (
                      <button
                        type="button"
                        key={k}
                        aria-pressed={input?.kind === k}
                        onClick={() => kind(k)}
                      >
                        {SAJU_KIND_LABEL[k]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <SajuVisual chart={reading.chart} active={selected} revealing={revealing} />
                {revealing && (
                  <button className="saju-skip" onClick={() => setFinishedChart(chartKey)}>
                    연출 건너뛰기
                  </button>
                )}
              </div>
            </div>
            {reading.chart && (
              <SajuReportView
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
              <div className="saju-error" role="alert">
                {reading.error}
                <button onClick={() => input && start(input)}>다시 시도</button>
              </div>
            )}
            {reading.result && (
              <>
                {reading.result.source === 'basic' && (
                  <div className="saju-basic-notice">
                    <BookOpen size={17} />
                    <p>
                      {reading.result.fallbackReason === 'quota'
                        ? '오늘 AI 이용량을 모두 사용해 명식의 기본 풀이를 보여드려요.'
                        : '지금은 명식의 기본 풀이를 보여드려요. AI 해석은 잠시 후 다시 시도할 수 있어요.'}
                    </p>
                    <button onClick={() => input && start(input)}>다시 시도</button>
                  </div>
                )}
                <div className="saju-result-actions">
                  <button className="saju-secondary" onClick={() => setProfileSave(true)}>
                    출생 프로필로 저장
                  </button>
                  <button className="saju-primary" onClick={() => setShare(true)}>
                    <Share2 size={17} />
                    나의 오행 지도 공유
                  </button>
                  <button
                    className="saju-secondary"
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
                <p className="saju-field-hint saju-save-hint">
                  {principal === 'guest'
                    ? '기기에 보관하면 이 브라우저에 출생정보와 결과가 저장돼요.'
                    : '보관을 누르면 계정에 출생정보와 결과가 저장돼요.'}{' '}
                  보관함에서 언제든 삭제할 수 있어요.
                </p>
                {message && (
                  <p className="saju-action-message" role="status">
                    {message}
                  </p>
                )}
                {share && (
                  <SajuShareDialog result={reading.result} onClose={() => setShare(false)} />
                )}
                {profileSave && (
                  <SajuSaveProfileDialog
                    birth={reading.result.birth}
                    onClose={() => setProfileSave(false)}
                  />
                )}
              </>
            )}
          </div>
        )}
        <footer className="saju-footer">
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
