import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Pencil, Search, Trash2, UserRound } from 'lucide-react';
import type { SettlementContactType } from '@repo/api-contract';
import {
  ApiError,
  useDeleteSettlementContact,
  useSettlementContacts,
} from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { ContactEditDialog } from './ContactEditDialog';

// /me/contacts — 사용자별 단골 참여자 관리. 정산을 저장할 때마다 자동 적립
// 되는 row 들을 검색/수정/삭제. 삭제해도 과거 정산은 그대로 남는다 (서버가
// participant.contactId 만 SetNull).
//
// 별도 페이지가 필요한 이유: 같은 이름 두 번 입력해서 중복 row 가 생긴 경우
// 한쪽을 지우거나, 이름이 잘못 들어간 단골을 수정하기 위한 출구.
export const ContactsPage = () => {
  const [q, setQ] = useState('');
  const list = useSettlementContacts({
    q: q.trim() || undefined,
    take: 100,
  });
  const remove = useDeleteSettlementContact();
  const [editing, setEditing] = useState<SettlementContactType | null>(null);

  const handleDelete = async (c: SettlementContactType) => {
    const label = displayName(c);
    if (
      !window.confirm(
        `'${label}' 단골을 삭제할까요? 자동완성에서 더 이상 보이지 않습니다. 과거 정산의 본문은 그대로 남습니다.`,
      )
    ) {
      return;
    }
    try {
      await remove.mutateAsync(c.id);
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : '삭제 실패');
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-4 flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <UserRound className="size-4" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">내 단골 참여자</h1>
          <p className="text-sm text-muted-foreground">
            정산을 저장하면 자동으로 적립됩니다. 자동완성에서 같은 사람을 다시
            고를 때 이름·닉네임과 마지막 제외 옵션이 미리 채워져요.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/me/settlements">정산 이력 →</Link>
        </Button>
      </header>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="이름·닉네임으로 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>

      {list.isLoading && (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
        </div>
      )}

      {list.isError && (
        <p className="text-sm text-destructive">
          단골을 불러오지 못했습니다.{' '}
          {list.error instanceof ApiError ? list.error.message : ''}
        </p>
      )}

      {list.data && (
        <>
          {list.data.items.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                {q.trim() ? (
                  <p>'{q.trim()}' 에 일치하는 단골이 없습니다.</p>
                ) : (
                  <>
                    <p>아직 단골이 없습니다.</p>
                    <p>정산을 저장하면 참여자가 자동으로 단골에 적립됩니다.</p>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {list.data.items.map((c) => (
                <li key={c.id}>
                  <Card>
                    <div className="flex items-center justify-between gap-2 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {displayName(c)}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                          {c.lastExcludeAlcohol && <Tag>주류 X</Tag>}
                          {c.lastExcludeNonAlcohol && <Tag>비주류 X</Tag>}
                          {c.lastExcludeSide && <Tag>안주 X</Tag>}
                          <Tag>{c.useCount}회 사용</Tag>
                          <Tag>
                            최근 {new Date(c.lastUsedAt).toLocaleDateString('ko-KR')}
                          </Tag>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="수정"
                          onClick={() => setEditing(c)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="삭제"
                          onClick={() => handleDelete(c)}
                          disabled={remove.isPending}
                        >
                          {remove.isPending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <ContactEditDialog
        contact={editing}
        onClose={() => setEditing(null)}
      />
    </main>
  );
};

const Tag = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded bg-muted px-1.5 py-0.5">{children}</span>
);

const displayName = (c: SettlementContactType): string => {
  const nm = (c.name ?? '').trim();
  const nick = (c.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || '(이름 없음)';
};
