import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { SajuGProfileInput, type SajuGBirthType } from '@repo/api-contract';
import { useSajuGProfiles } from '@repo/shared';

export function SajuGSaveProfileDialog({
  birth,
  onClose,
}: {
  birth: SajuGBirthType;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const profiles = useSajuGProfiles();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="saju-g-share-dialog"
      aria-labelledby="saju-g-profile-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <form
        className="saju-g-dialog-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setMessage('');
          const parsed = SajuGProfileInput.safeParse({ name, birth });
          if (!parsed.success) {
            setMessage(parsed.error.issues[0]?.message ?? '별명을 확인해 주세요.');
            return;
          }
          setBusy(true);
          try {
            await profiles.save(parsed.data);
            onClose();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : '저장하지 못했어요.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <button
          type="button"
          className="saju-g-dialog-close"
          onClick={onClose}
          aria-label="프로필 창 닫기"
        >
          <X size={20} />
        </button>
        <span className="saju-g-eyebrow">REMEMBER YOUR BEGINNING</span>
        <h2 id="saju-g-profile-title">출생 프로필로 기억하기</h2>
        <p>
          {birth.calendar === 'lunar' ? '음력' : '양력'} {birth.date}
          {birth.leapMonth ? ' · 윤달' : ''} ·{' '}
          {birth.timeAccuracy === 'exact'
            ? birth.time
            : birth.timeAccuracy === 'range'
              ? '대략의 시간'
              : '시간 모름'}
        </p>
        <label className="saju-g-field-label" htmlFor="saju-g-profile-name">
          별명
        </label>
        <input
          id="saju-g-profile-name"
          autoFocus
          maxLength={24}
          required
          placeholder="예: 나, 다정한 친구"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="saju-g-field-hint">
          {profiles.principal === 'guest' ? '이 기기' : '내 계정'}에 별명과 출생정보를 보관해요.
          프로필 관리에서 수정하거나 삭제할 수 있어요.
        </p>
        <button className="saju-g-primary" disabled={busy}>
          {busy ? '보관 중…' : '프로필 보관'}
        </button>
        {message && (
          <p role="alert" className="saju-g-error">
            {message}
          </p>
        )}
      </form>
    </dialog>
  );
}
