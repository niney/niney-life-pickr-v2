import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { MapPin, Maximize2, X } from 'lucide-react';
import type { RestaurantDetailType } from '@repo/api-contract';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { SectionHeader } from '~/components/restaurant/sections';
import { VWorldMap } from '~/components/restaurant/VWorldMap';

// 우측 위치 사이드바 — xl 이상에서만 노출(예전 상세 그대로). 작은 화면은 "정보" 탭에 주소·좌표가
// 있어 지도가 없어도 정보 부재는 없다. sticky 기준은 어드민 상단바(h-14) 아래.
export const AdminLocationAside = ({ detail }: { detail: RestaurantDetailType }) => {
  const [expanded, setExpanded] = useState(false);
  const s = detail.snapshot;
  return (
    <>
      <aside className="hidden xl:block">
        <div className="sticky top-[4.5rem] space-y-4">
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <SectionHeader icon={<MapPin className="size-4" />} label="위치" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpanded(true)}
                  aria-label="지도 크게 보기"
                  title="지도 크게 보기"
                  className="h-7 px-2"
                >
                  <Maximize2 className="size-4" />
                </Button>
              </div>
              <div className="mt-3">
                <VWorldMap lat={s.latitude} lng={s.longitude} name={detail.name} />
              </div>
              {detail.address && (
                <p className="mt-3 text-sm text-foreground/80">{detail.address}</p>
              )}
              {s.roadAddress && <p className="text-xs text-muted-foreground">{s.roadAddress}</p>}
              {detail.phone && (
                <p className="mt-1 text-xs text-muted-foreground">전화 {detail.phone}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </aside>

      {/*
        풀 높이 우측 슬라이드오버. 사이드바의 컴팩트 카드와 별개의 VWorldMap
        인스턴스를 렌더링한다 — 같은 ol Map 을 두 컨테이너에 옮겨 다는 건
        ol API 가 정식 지원하지 않고 (setTarget 으로 가능하긴 하나 view·layer
        상태가 어색해진다), 두 인스턴스 비용은 무시할 만하다.
      */}
      <Dialog.Root open={expanded} onOpenChange={setExpanded}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
          <Dialog.Content
            // 우측에서 슬라이드 인. 모바일은 화면 거의 전체, 데스크톱은
            // 740px 정도로 제한.
            className="fixed inset-y-0 right-0 z-50 flex h-screen w-full flex-col border-l bg-background shadow-xl outline-none sm:max-w-[740px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
          >
            <header className="flex items-center justify-between gap-3 border-b px-5 py-3">
              <div className="min-w-0">
                <Dialog.Title className="flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="size-4" />
                  <span className="truncate">{detail.name}</span>
                </Dialog.Title>
                {detail.address && (
                  <Dialog.Description className="mt-0.5 truncate text-xs text-muted-foreground">
                    {detail.address}
                  </Dialog.Description>
                )}
              </div>
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="닫기"
                  className="h-8 w-8 shrink-0 p-0"
                >
                  <X className="size-4" />
                </Button>
              </Dialog.Close>
            </header>

            <div className="flex-1 p-4">
              <VWorldMap
                lat={s.latitude}
                lng={s.longitude}
                name={detail.name}
                className="h-full w-full"
              />
            </div>

            {(s.roadAddress || detail.phone) && (
              <div className="border-t px-5 py-3 text-xs text-muted-foreground">
                {s.roadAddress && <div>도로명 · {s.roadAddress}</div>}
                {detail.phone && <div>전화 · {detail.phone}</div>}
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
