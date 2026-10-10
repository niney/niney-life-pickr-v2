import type { ReactNode } from 'react';
import { ImageOff, ScanText } from 'lucide-react';
import type { MenuBoardMenuType, NaverPlaceDataType } from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';

// 어드민 메뉴 탭 — 네이버 '메뉴판 이미지로 보기' 사진과, 크롤 직후 메뉴판 읽기(kimi-k3)로 읽어 등록 메뉴와 짝지은
// 결과(snapshot.menuBoardMenus). 구분값 origin: 'menu-board' = 사진에만 있는 메뉴, 'registered' = 등록 메뉴와 같은 메뉴.
// 공개 화면·칼로리·정산에는 아직 쓰지 않는다.

type Snapshot = Pick<NaverPlaceDataType, 'menuBoardImages' | 'menuBoardMenus' | 'menuUpdatedOn'>;

// 등록 가격은 숫자만 저장돼 있어('5000') 쉼표를 붙인다. 사진 가격은 적힌 그대로.
const won = (price: string | null): string =>
  price === null ? '–' : /^\d+$/.test(price) ? Number(price).toLocaleString('ko-KR') : price;

// 사진 날짜가 등록 메뉴 업데이트보다 늦으면 사진 가격이 더 최신일 수 있다.
const newer = (photo: string | null, registered: string | null | undefined): 'photo' | 'registered' | null => {
  if (!photo || !registered) return null;
  if (photo > registered) return 'photo';
  return 'registered';
};

export const AdminMenuBoardSection = ({ snapshot }: { snapshot: Snapshot }) => {
  const images = snapshot.menuBoardImages;
  if (!images) return null; // 수집 전 스냅샷
  const menus = snapshot.menuBoardMenus ?? [];
  const added = menus.filter((m) => m.origin === 'menu-board');
  const priced = menus.filter((m) => m.priceCheck === 'different');
  const confirmed = menus.filter((m) => m.origin === 'registered');
  const readCount = images.filter((i) => i.read).length;

  return (
    <section className="space-y-4" aria-label="메뉴판 사진">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <ScanText className="size-4" /> 메뉴판 사진
        </h3>
        <Badge variant="secondary">
          {images.length}장 · 읽음 {readCount}장
        </Badge>
        {snapshot.menuUpdatedOn && <Badge variant="outline">등록 메뉴 업데이트 {snapshot.menuUpdatedOn}</Badge>}
        <span className="text-xs text-muted-foreground">어드민 전용 · 크롤 직후 새 사진만 자동으로 읽는다</span>
      </header>

      {images.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ImageOff className="size-4" /> 네이버에 올라온 메뉴판 사진이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {images.map((image, i) => (
            <li key={image.url} className="w-28 text-[11px] text-muted-foreground">
              <a href={image.url} target="_blank" rel="noreferrer" title="원본 열기">
                <img
                  src={image.url}
                  alt={`메뉴판 사진 ${i + 1}`}
                  loading="lazy"
                  className="h-20 w-28 rounded border object-cover"
                />
              </a>
              <div>{image.uploadedOn ?? '날짜 모름'}</div>
              <div>{image.read ? `${image.read.items.length}개 읽음` : '안 읽음'}</div>
            </li>
          ))}
        </ul>
      )}

      {readCount > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <MenuList
            title={`사진에만 있는 메뉴 ${added.length}`}
            hint="등록 메뉴에 없어 메뉴판 사진으로만 확인된 메뉴(이미지로 등록된 메뉴)"
            menus={added}
            render={(m) => (
              <>
                <TableCell className="min-w-32">
                  <div className="font-medium">
                    {m.name} <Badge variant="violet">메뉴판 사진</Badge>
                  </div>
                  {m.description && <div className="text-xs text-muted-foreground">{m.description}</div>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{m.price ?? '–'}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{m.uploadedOn ?? '–'}</TableCell>
              </>
            )}
          />
          <MenuList
            title={`가격이 다른 등록 메뉴 ${priced.length}`}
            hint="사진 날짜가 등록 메뉴 업데이트보다 늦으면 사진 가격이 더 최신일 수 있다"
            menus={priced}
            render={(m) => {
              const which = newer(m.uploadedOn, snapshot.menuUpdatedOn);
              return (
                <>
                  <TableCell className="min-w-32">
                    <div className="font-medium">{m.registeredName}</div>
                    {m.registeredName !== m.name && (
                      <div className="text-xs text-muted-foreground">사진: {m.name}</div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {won(m.registeredPrice)} → {m.price ?? '–'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    <div className="text-muted-foreground">{m.uploadedOn ?? '날짜 모름'}</div>
                    {which === 'photo' && <Badge variant="amber">사진이 최신</Badge>}
                    {which === 'registered' && <span className="text-muted-foreground">등록이 최신</span>}
                  </TableCell>
                </>
              );
            }}
          />
        </div>
      )}
      {confirmed.length > 0 && (
        <p className="text-xs text-muted-foreground">
          사진에서도 확인된 등록 메뉴 {confirmed.length}개(가격 같음{' '}
          {confirmed.filter((m) => m.priceCheck === 'same').length} · 크기별 가격{' '}
          {confirmed.filter((m) => m.priceCheck === 'range').length})
        </p>
      )}
    </section>
  );
};

const MenuList = ({
  title,
  hint,
  menus,
  render,
}: {
  title: string;
  hint: string;
  menus: MenuBoardMenuType[];
  render: (menu: MenuBoardMenuType) => ReactNode;
}) => (
  <div className="min-w-0">
    <h4 className="text-sm font-medium" title={hint}>
      {title}
    </h4>
    {menus.length === 0 ? (
      <p className="text-xs text-muted-foreground">없음</p>
    ) : (
      <div className="max-h-96 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>메뉴</TableHead>
              <TableHead className="text-right">가격</TableHead>
              <TableHead>사진 날짜</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {menus.map((m, i) => (
              <TableRow key={`${m.name}-${i}`}>{render(m)}</TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )}
  </div>
);
