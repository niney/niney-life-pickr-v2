import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Plus, Trash2, Pencil, Users } from 'lucide-react';
import { useAuthStore, useSajuProfiles } from '@repo/shared';
import { SAJU_PROFILES_MAX, SajuProfileInput, type SajuProfileType } from '@repo/api-contract';
import { SajuBirthForm } from '~/components/saju/SajuBirthForm';
import '~/components/saju/saju.css';
import '~/components/saju/saju-next.css';

export function SajuProfilesPage() {
  const principal = useAuthStore((s) => s.user?.id ?? 'guest');
  return <Profiles key={principal} />;
}
function Profiles() {
  const profiles = useSajuProfiles();
  const [editing, setEditing] = useState<SajuProfileType | null | undefined>();
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const edit = (value: SajuProfileType | null) => {
    setEditing(value);
    setName(value?.name ?? '');
    setMessage('');
  };
  return (
    <div className="saju-page">
      <div className="saju-shell">
        <header className="saju-nav">
          <Link to="/saju" className="saju-brand">
            <span>命</span>사주
          </Link>
          <div className="saju-next-nav">
            <Link to="/saju/pair">우리의 궁합</Link>
            <Link to="/me/saju">보관함</Link>
          </div>
        </header>
        <main className="saju-profiles-main">
          <span className="saju-eyebrow">PEOPLE IN YOUR UNIVERSE</span>
          <h1>
            기억해 두고 싶은
            <br />
            <em>우리의 시작</em>
          </h1>
          <p className="saju-next-lead">
            한 번 담아 둔 출생정보로, 나의 흐름과 우리의 관계를 편하게 만나보세요.
          </p>
          <p className="saju-field-hint">
            {profiles.principal === 'guest'
              ? '이 브라우저에 보관돼요. 로그인하면 계정의 프로필을 따로 보여드려요.'
              : '내 계정에 보관돼요.'}{' '}
            최대 {SAJU_PROFILES_MAX}명 · {profiles.profiles.length}명 보관 중
          </p>
          {profiles.isLoading && <p role="status">프로필을 불러오고 있어요…</p>}
          {profiles.isError && (
            <div className="saju-error" role="alert">
              프로필을 불러오지 못했어요.{' '}
              <button onClick={() => void profiles.refetch()}>다시 시도</button>
            </div>
          )}
          {editing !== undefined ? (
            <section className="saju-profile-editor" aria-label="프로필 편집">
              <div className="saju-profile-editor-top">
                <label htmlFor="profile-editor-name">
                  별명
                  <input
                    id="profile-editor-name"
                    autoFocus
                    maxLength={24}
                    placeholder="예: 나, 소중한 친구"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <button
                  className="saju-text-button"
                  disabled={busy}
                  onClick={() => setEditing(undefined)}
                >
                  편집 닫기
                </button>
              </div>
              <SajuBirthForm
                key={editing?.id ?? 'new'}
                mode="profile"
                heading={editing ? '시작의 정보를 다듬어요' : '새로운 시작을 담아요'}
                initial={editing ? { birth: editing.birth, kind: 'natal', note: '' } : undefined}
                disabled={busy}
                submitLabel={busy ? '보관 중…' : '프로필 저장'}
                onSubmit={async (input) => {
                  const parsed = SajuProfileInput.safeParse({ name, birth: input.birth });
                  if (!parsed.success) {
                    setMessage(parsed.error.issues[0]?.message ?? '입력을 확인해 주세요.');
                    return;
                  }
                  setBusy(true);
                  setMessage('');
                  try {
                    await profiles.save(parsed.data, editing ?? undefined);
                    setEditing(undefined);
                    setMessage('프로필을 보관했어요.');
                  } catch (e) {
                    setMessage(e instanceof Error ? e.message : '저장하지 못했어요.');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </section>
          ) : (
            <button
              className="saju-primary saju-profile-add"
              disabled={
                profiles.profiles.length >= SAJU_PROFILES_MAX ||
                profiles.isLoading ||
                profiles.isError
              }
              onClick={() => edit(null)}
            >
              <Plus size={18} />새 프로필 담기
            </button>
          )}
          {message && (
            <p className="saju-action-message" role="status">
              {message}
            </p>
          )}
          <div className="saju-profile-grid">
            {profiles.profiles.map((p, i) => (
              <article key={p.id} className="saju-profile-card">
                <div className="saju-profile-card-top">
                  <span className="saju-profile-seal">{p.name.slice(0, 1)}</span>
                  <span className="saju-eyebrow">PERSON {String(i + 1).padStart(2, '0')}</span>
                </div>
                <h2>{p.name}</h2>
                <p>
                  {p.birth.calendar === 'lunar' ? '음력' : '양력'} {p.birth.date}
                  {p.birth.leapMonth ? ' · 윤달' : ''}
                </p>
                <p className="saju-field-hint">
                  {p.birth.timeAccuracy === 'exact'
                    ? p.birth.time
                    : p.birth.timeAccuracy === 'range'
                      ? '대략의 시간으로 보기'
                      : '출생시간 모름'}
                </p>
                <div className="saju-profile-quick">
                  {(['natal', 'daily', 'annual'] as const).map((kind, n) => (
                    <Link key={kind} to={`/saju?profile=${encodeURIComponent(p.id)}&kind=${kind}`}>
                      {['나의 사주', '오늘', '올해'][n]}
                      <ArrowUpRight size={13} />
                    </Link>
                  ))}
                </div>
                <Link
                  className="saju-profile-pair"
                  to={`/saju/pair?first=${encodeURIComponent(p.id)}`}
                >
                  <Users size={15} />이 사람과 궁합 보기
                </Link>
                <div className="saju-profile-edit-actions">
                  <button onClick={() => edit(p)} aria-label={`${p.name} 수정`}>
                    <Pencil size={14} />
                    수정
                  </button>
                  <button onClick={() => setDeleting(p.id)} aria-label={`${p.name} 삭제`}>
                    <Trash2 size={14} />
                    삭제
                  </button>
                </div>
                {deleting === p.id && (
                  <div className="saju-profile-delete">
                    <p>
                      이 프로필을 삭제할까요? 별도로 보관한 풀이와 공유는 각 보관함에서 관리해요.
                    </p>
                    <button
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await profiles.remove(p.id);
                          setDeleting(null);
                          if (editing?.id === p.id) setEditing(undefined);
                        } catch {
                          setMessage('삭제하지 못했어요. 다시 시도해 주세요.');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      삭제할게요
                    </button>
                    <button disabled={busy} onClick={() => setDeleting(null)}>
                      취소
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
          {!profiles.isLoading &&
            !profiles.isError &&
            profiles.profiles.length === 0 &&
            editing === undefined && (
              <p className="saju-empty">
                첫 프로필을 담아 보세요. 보관한 사주에서도 프로필을 만들 수 있어요.
              </p>
            )}
        </main>
      </div>
    </div>
  );
}
