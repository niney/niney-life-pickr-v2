import { useEffect, useRef, useState } from 'react';
import { Copy, Download, Link2Off, X } from 'lucide-react';
import { getGuestKey, sajuGApi, sajuGShareCredential } from '@repo/shared';
import type {
  CreateSajuGShareInputType,
  SajuGReadingResultType,
  SajuGShareResultType,
} from '@repo/api-contract';

export function SajuGShareDialog({
  result,
  pair,
  onClose,
}: {
  onClose: () => void;
} & (
  | { result: SajuGReadingResultType; pair?: never }
  | { result?: never; pair: NonNullable<CreateSajuGShareInputType['pair']> }
)) {
  const ref = useRef<HTMLDialogElement>(null);
  const [share, setShare] = useState<SajuGShareResultType | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const create = async () => {
    setBusy(true);
    setMessage('');
    try {
      const value = await sajuGApi.share(
        pair
          ? { pair }
          : result?.readingId
            ? { readingId: result.readingId }
            : { birth: result.birth },
        getGuestKey(),
      );
      setShare(value);
      if (!sajuGShareCredential.set(value.token, value.revokeToken))
        setMessage(
          '브라우저 저장 공간을 사용할 수 없어요. 공유 취소는 이 창이 열려 있을 때 가능해요.',
        );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '공유 링크를 만들지 못했어요.');
    } finally {
      setBusy(false);
    }
  };
  const revoke = async () => {
    if (!share) return;
    setBusy(true);
    try {
      await sajuGApi.revokeShare(share.token, share.revokeToken);
      sajuGShareCredential.remove(share.token);
      setShare(null);
      setMessage('공유 링크를 취소했어요.');
    } catch {
      setMessage('취소하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(`${location.origin}${share.path}`);
      setMessage('링크를 복사했어요.');
    } catch {
      setMessage('아래 링크를 선택해서 복사해 주세요.');
    }
  };
  const download = async () => {
    if (!share) return;
    setBusy(true);
    try {
      const response = await fetch(sajuGApi.imageUrl(share.token));
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = pair ? '우리의-오행-지도.png' : '나의-오행-지도.png';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setMessage('이미지를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={ref}
      className="saju-g-share-dialog"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="saju-g-share-title"
    >
      <div className="saju-g-dialog-body">
        <button className="saju-g-dialog-close" onClick={onClose} aria-label="공유 창 닫기">
          <X size={20} />
        </button>
        <span className="saju-g-eyebrow">A LITTLE PIECE OF YOU</span>
        <h2 id="saju-g-share-title">{pair ? '우리의' : '나의'} 오행 지도 나누기</h2>
        <p>
          {pair ? '두 사람의' : '나의'} 상징과 오행 구성만 담아요.
          <br />
          생년월일·시간·질문·개인 해석은 포함하지 않아요.
        </p>
        {share ? (
          <>
            <img
              className="saju-g-share-preview"
              src={sajuGApi.imageUrl(share.token)}
              alt={pair ? '공유할 우리의 오행 지도' : '공유할 나의 오행 지도'}
            />
            <input
              aria-label="공유 링크"
              readOnly
              value={`${location.origin}${share.path}`}
              onFocus={(e) => e.target.select()}
            />
            <div className="saju-g-share-actions">
              <button onClick={copy}>
                <Copy size={15} />
                링크 복사
              </button>
              <button onClick={download} disabled={busy}>
                <Download size={15} />
                이미지 저장
              </button>
            </div>
            <button className="saju-g-text-button" disabled={busy} onClick={revoke}>
              <Link2Off size={14} />
              공유 링크 취소
            </button>
            <p className="saju-g-field-hint">
              같은 브라우저에서 공유 페이지를 다시 열어 취소할 수 있어요. 저장된 이미지 사본은
              회수되지 않아요.
            </p>
          </>
        ) : (
          <button className="saju-g-primary" onClick={create} disabled={busy}>
            {busy ? '공유 카드 준비 중…' : '이 내용으로 공유 링크 만들기'}
          </button>
        )}
        {message && (
          <p role="status" className="saju-g-action-message">
            {message}
          </p>
        )}
      </div>
    </dialog>
  );
}
