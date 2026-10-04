import { Loader2 } from 'lucide-react';
import { useDebounced } from '~/lib/useDebounced';
import type { SettlementContactType } from '@repo/api-contract';
import { useSettlementContacts } from '@repo/shared';

interface Props {
  // 현재 행에서 사용자가 입력 중인 이름. 닉네임도 같이 검색되지만 표시 위치는
  // 이름 input 아래라 prop 이름은 query 로 일반화.
  query: string;
  onPick(contact: SettlementContactType): void;
}

// 정산 입력 단계의 자동완성 드롭다운. 250ms 디바운스 후 GET /me/contacts?q=
// 호출. 빈 검색어로 focus 하면 최근 사용 순으로 단골이 나열되어, 새 정산을
// 만들 때 자주 쓰는 참여자를 한 번에 채울 수 있다.
//
// 마운트 = 드롭다운 열림. 부모(Step1) 가 focus 가 있는 행에서만 렌더한다 — 닫힌
// 상태로 행마다 깔아 두면 참여자 수만큼 쿼리가 돌아, 이름이 채워진 정산을 열 때
// 보이지도 않는 검색이 사람 수만큼 한꺼번에 나간다.
//
// 위치/배경은 호출 측이 relative wrapper 로 감싸 absolute 가 input 바로 아래
// 정렬되도록 한다. 외부 닫기 처리는 부모(Step1) 가 맡는다.
export const ContactSuggestions = ({ query, onPick }: Props) => {
  const debounced = useDebounced(query.trim(), 250);
  // 드롭다운은 max-h 로 잘리고 스크롤되므로 넉넉히 가져온다 — 사용자가
  // "분명히 있는 단골이 자동완성에 안 뜬다" 고 느끼는 사고를 막는 게 6 개
  // 깔끔함보다 우선. 더 많이 필요해지면 /me/contacts 페이지(100)로 안내.
  // 타이핑하는 동안엔 직전 결과를 그대로 둔다(keepPrevious) — 글자마다 목록이
  // "찾는 중" 으로 바뀌었다 돌아오지 않게.
  const list = useSettlementContacts(
    { q: debounced || undefined, take: 20 },
    { keepPrevious: true },
  );

  const items = list.data?.items ?? [];
  // 직전 검색어의 빈 결과가 남아 있는 동안은 아직 답을 모르는 상태다 — "일치하는
  // 단골이 없습니다" 가 아니라 찾는 중으로 보여 준다.
  const searching = list.isLoading || (list.isPlaceholderData && items.length === 0);

  return (
    <div
      role="listbox"
      className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-md border bg-popover p-1 shadow-md"
    >
      {searching ? (
        <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          단골 찾는 중…
        </div>
      ) : items.length === 0 ? (
        <div className="px-2 py-2 text-xs text-muted-foreground">
          {debounced
            ? `"${debounced}" 에 일치하는 단골이 없습니다`
            : '아직 단골이 없습니다 — 정산을 저장하면 자동으로 적립됩니다'}
        </div>
      ) : (
        items.map((c) => (
          <button
            key={c.id}
            type="button"
            role="option"
            // 부모 input 의 blur 보다 mousedown 이 먼저 발동 — blur 가 드롭다운을
            // 닫아 onClick 가 도달 안 하는 흔한 사고를 피한다.
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(c);
            }}
            className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
          >
            <div className="min-w-0">
              <div className="truncate text-sm">
                {displayName(c)}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                {c.lastExcludeAlcohol && <Tag>술 X</Tag>}
                {c.lastExcludeNonAlcohol && <Tag>음료 X</Tag>}
                {c.lastExcludeSide && <Tag>안주 X</Tag>}
                {!c.lastExcludeAlcohol &&
                  !c.lastExcludeNonAlcohol &&
                  !c.lastExcludeSide && <Tag>기본</Tag>}
              </div>
            </div>
            {c.useCount > 1 && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {c.useCount}회
              </span>
            )}
          </button>
        ))
      )}
    </div>
  );
};

const Tag = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded bg-muted px-1 py-px">{children}</span>
);

const displayName = (c: SettlementContactType): string => {
  const nm = (c.name ?? '').trim();
  const nick = (c.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || '(이름 없음)';
};
