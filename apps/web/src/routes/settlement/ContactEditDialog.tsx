import { useEffect, useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import type { SettlementContactType } from '@repo/api-contract';
import { ApiError, useUpdateSettlementContact } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';

interface Props {
  // null 이면 닫힌 상태. 외부에서 단골 선택 시 그 row 를 넘긴다.
  contact: SettlementContactType | null;
  onClose(): void;
}

// /me/contacts 의 인라인 수정 다이얼로그. SettlementShareDialog 와 동일한
// fixed overlay 패턴(외부 dialog 라이브러리 없이). 이름/닉네임만 수정 — 마지막
// 제외 옵션은 다음 정산에서 자연스럽게 갱신되므로 수정 UI 에 두지 않는다.
export const ContactEditDialog = ({ contact, onClose }: Props) => {
  const update = useUpdateSettlementContact();
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 다이얼로그가 열릴 때마다 row 값으로 폼 채움. 닫힐 때는 그대로 두되 다음
  // open 에서 다시 덮어쓴다 — 외부 시스템(서버 데이터) 동기화이므로 useEffect.
  useEffect(() => {
    if (!contact) return;
    setName(contact.name ?? '');
    setNickname(contact.nickname ?? '');
    setError(null);
  }, [contact]);

  // ESC 닫기.
  useEffect(() => {
    if (!contact) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contact, onClose]);

  if (!contact) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const nm = name.trim();
    const nick = nickname.trim();
    if (!nm && !nick) {
      setError('이름 또는 닉네임 중 하나는 입력해야 합니다.');
      return;
    }
    try {
      await update.mutateAsync({
        id: contact.id,
        input: { name: nm || null, nickname: nick || null },
      });
      onClose();
    } catch (e2) {
      setError(e2 instanceof ApiError ? e2.message : '저장 실패');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="단골 수정"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-t-lg bg-background p-5 shadow-lg sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold">단골 수정</div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label="닫기"
          >
            <X className="size-4" />
          </button>
        </div>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          <span>이름</span>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="홍길동"
            maxLength={40}
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          <span>닉네임</span>
          <Input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="길동이"
            maxLength={40}
          />
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={update.isPending}
          >
            취소
          </Button>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            저장
          </Button>
        </div>
      </form>
    </div>
  );
};
