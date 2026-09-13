import { useState } from 'react';
import { ExternalLink, Loader2, Lock } from 'lucide-react';
import {
  ApiError,
  tourPhotoUrl,
  useTourPhotoBase,
  useTourRawActivities,
  useTourRawPhotos,
  useTourRawSpend,
  useTourRawTrip,
  useTourRawTrips,
  useTourRawVisits,
} from '@repo/shared';
import type { RestaurantTourMatchInfoType, TourRawTripSummaryType } from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Pager } from '~/components/ui/pager';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { cn } from '~/lib/utils';

// 여행로그 원본 근거(3차) — 장소 하나의 개별 방문·주문 원문·영수증·참고 사진·포함 여행(타임라인). 관리자 중에서도
// TOUR_RAW_USER_IDS allowlist 만 200 을 받고 나머지는 404 라, 404 는 "권한 없음" 안내로 바꾼다. 어드민 식당 상세
// (TourEvidenceSection)와 시드 콘솔의 행 펼침(TourEvidencePanel) 두 곳이 쓴다. 공개 화면에는 절대 넣지 않는다.

type Tab = 'visits' | 'orders' | 'receipts' | 'photos' | 'trips';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'visits', label: '방문' },
  { key: 'orders', label: '주문 원문' },
  { key: 'receipts', label: '영수증' },
  { key: 'photos', label: '사진' },
  { key: 'trips', label: '여행' },
];
const PAGE_SIZE = 50;

const won = (v: number | null | undefined): string => (v === null || v === undefined ? '–' : `${Math.round(v).toLocaleString('ko-KR')}원`);
const ts = (v: string | null): string => (v ? v.slice(0, 16) : '–');
const isForbidden = (e: unknown): boolean => e instanceof ApiError && e.statusCode === 404;

export const TourEvidencePanel = ({ tourPlaceId }: { tourPlaceId: string }) => {
  const [tab, setTab] = useState<Tab>('visits');
  const [page, setPage] = useState(1);
  const pageParams = { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
  const on = (t: Tab) => (tab === t ? tourPlaceId : null);
  const visits = useTourRawVisits(on('visits'), pageParams);
  const orders = useTourRawActivities(on('orders'), pageParams);
  const receipts = useTourRawSpend(on('receipts'), pageParams);
  const photos = useTourRawPhotos(on('photos'), pageParams);
  const trips = useTourRawTrips(on('trips'), pageParams);
  const active = { visits, orders, receipts, photos, trips }[tab];

  const changeTab = (t: Tab) => {
    setTab(t);
    setPage(1);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 rounded-md border p-0.5 text-xs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={cn('rounded px-2 py-1', tab === t.key ? 'bg-muted font-semibold' : 'text-muted-foreground')} onClick={() => changeTab(t.key)}>
            {t.label}
          </button>
        ))}
        <span className="ml-auto pr-1 text-[11px] text-muted-foreground">{active.data ? `${active.data.total.toLocaleString('ko-KR')}건` : ''}</span>
      </div>
      {active.isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 불러오는 중…
        </p>
      )}
      {active.isError &&
        (isForbidden(active.error) ? (
          <p className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
            <Lock className="size-3.5" /> 원본 열람 권한이 없습니다. AI 허브에서 데이터를 승인받은 계정만 TOUR_RAW_USER_IDS 에 넣어 열 수 있습니다.
          </p>
        ) : (
          <p className="text-sm text-destructive">{(active.error as Error).message}</p>
        ))}
      {tab === 'visits' && visits.data && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>날짜</TableHead>
                <TableHead>여행자</TableHead>
                <TableHead className="text-right">체류</TableHead>
                <TableHead className="text-right">만족</TableHead>
                <TableHead className="text-right">재방문</TableHead>
                <TableHead>이유</TableHead>
                <TableHead>동반</TableHead>
                <TableHead className="text-right">1인</TableHead>
                <TableHead>이전 → 다음</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visits.data.items.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {v.visitDate}
                    {v.arrivalTs ? ` ${v.arrivalTs.slice(11, 16)}` : ''}
                    {v.dayIndex !== null ? ` · ${v.dayIndex}일차` : ''}
                  </TableCell>
                  <TableCell className="text-xs">
                    {v.travelerLabel ?? v.travelId}
                    <div className="text-[11px] text-muted-foreground">
                      {[v.gender, v.ageGrp ? `${v.ageGrp}대` : null, v.residenceSido].filter(Boolean).join(' · ')}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{v.stayMin !== null ? `${v.stayMin}분` : '–'}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.dgstfn ?? '–'}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.revisitYn === 'Y' ? '재' : v.revisitYn === 'N' ? '첫' : '–'}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-xs" title={v.reasonNm ?? ''}>
                    {v.reasonNm ?? '–'}
                  </TableCell>
                  <TableCell className="text-xs">{v.accompany?.replace('(가족 외)', '').replace('(친척 포함)', '') ?? '–'}</TableCell>
                  <TableCell className="text-right tabular-nums">{won(v.spendPp)}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={`${v.prevPlaceName ?? ''} → ${v.nextPlaceName ?? ''}`}>
                    {v.prevPlaceName ?? '·'} → {v.nextPlaceName ?? '·'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {tab === 'orders' && orders.data && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>날짜</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>기록</TableHead>
                <TableHead>예약</TableHead>
                <TableHead>동반</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.data.items.map((a) => (
                <TableRow key={`${a.travelId}:${a.visitAreaId}:${a.seq}`}>
                  <TableCell className="whitespace-nowrap text-xs">{a.visitDate ?? '–'}</TableCell>
                  <TableCell className="text-xs">{a.typeNm ?? '–'}</TableCell>
                  <TableCell className="text-sm">{a.detail ?? <span className="text-muted-foreground">–</span>}</TableCell>
                  <TableCell className="text-xs">{a.rsvtYn === 'Y' ? '예약' : ''}</TableCell>
                  <TableCell className="text-xs">{[a.ageGrp ? `${a.ageGrp}대` : null, a.accompany?.replace('(가족 외)', '')].filter(Boolean).join(' · ')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {tab === 'receipts' && receipts.data && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>결제 시각</TableHead>
                <TableHead>상호</TableHead>
                <TableHead>사업자번호</TableHead>
                <TableHead>내역</TableHead>
                <TableHead className="text-right">금액</TableHead>
                <TableHead className="text-right">인원</TableHead>
                <TableHead className="text-right">1인</TableHead>
                <TableHead>수단</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts.data.items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap text-xs">{ts(s.paidTs)}</TableCell>
                  <TableCell className="text-sm">{s.storeNm ?? '–'}</TableCell>
                  <TableCell className="text-xs tabular-nums">{s.brno ?? '–'}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs" title={s.item ?? ''}>
                    {s.item ?? '–'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{won(s.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.payNum ?? '–'}</TableCell>
                  <TableCell className="text-right tabular-nums">{won(s.perPerson)}</TableCell>
                  <TableCell className="text-xs">{s.methodNm ?? '–'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {tab === 'photos' && photos.data && <PhotoGrid items={photos.data.items} sizes={photos.data.sizes} />}
      {tab === 'trips' && trips.data && <TripList items={trips.data.items} />}
      {active.data && active.data.total > PAGE_SIZE && <Pager total={active.data.total} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} pageSizeOptions={[PAGE_SIZE]} />}
      <p className="text-[11px] text-muted-foreground">
        AI 허브 「국내 여행로그 데이터(제주도 및 도서지역)」(2023) 원본 — 승인받은 계정의 내부 검토용. 화면 밖으로 내보내거나 공개 화면에 옮기지 않습니다.
      </p>
    </div>
  );
};

const PhotoGrid = ({ items, sizes }: { items: Array<{ id: string; takenTs: string | null; caption: string | null; landmark: string | null }>; sizes: Array<'s' | 'm'> }) => {
  const base = useTourPhotoBase(items.length > 0);
  if (sizes.length === 0) return <p className="text-sm text-muted-foreground">서버에 썸네일 폴더가 없습니다(TOUR_THUMBS_DIR). 메타만 {items.length}건.</p>;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">사진이 없습니다.</p>;
  if (!base.data) return <p className="text-sm text-muted-foreground">사진 URL 준비 중…</p>;
  const big = sizes.includes('m') ? 'm' : 's';
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {items.map((p) => (
        <li key={p.id} className="overflow-hidden rounded-md border bg-muted">
          <a href={tourPhotoUrl(base.data, p.id, big)} target="_blank" rel="noreferrer" title={[p.takenTs, p.landmark, p.caption].filter(Boolean).join(' · ')}>
            <img src={tourPhotoUrl(base.data, p.id, 's')} alt={p.caption ?? p.id} loading="lazy" className="aspect-square w-full object-cover" />
          </a>
          <div className="truncate px-1 py-0.5 text-[10px] text-muted-foreground">{p.takenTs ? p.takenTs.slice(0, 10) : p.id}</div>
        </li>
      ))}
    </ul>
  );
};

const TripList = ({ items }: { items: TourRawTripSummaryType[] }) => {
  const [openId, setOpenId] = useState<string | null>(null);
  if (items.length === 0) return <p className="text-sm text-muted-foreground">이 장소를 포함한 여행이 없습니다.</p>;
  return (
    <ul className="space-y-2">
      {items.map((t) => (
        <li key={t.travelId} className="rounded-md border p-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-medium">{t.travelerLabel}</span>
            <span className="text-muted-foreground">
              {t.startDate} · {t.nights}박 · {[t.gender, t.ageGrp ? `${t.ageGrp}대` : null, t.accompany?.replace('(가족 외)', ''), t.residenceSido].filter(Boolean).join(' · ')}
            </span>
            <span className="text-muted-foreground">방문 {t.nPublic} · 사진 {t.nPhotos} · 지출 {won(t.spendTotal)}</span>
            <Button type="button" size="sm" variant="ghost" className="ml-auto h-7" onClick={() => setOpenId(openId === t.travelId ? null : t.travelId)}>
              {openId === t.travelId ? '닫기' : '타임라인'}
            </Button>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {t.days.map((d) => (
              <Badge key={d.dayIndex} variant="outline" className="font-normal" title={d.placeSeq ?? ''}>
                {d.dayIndex}일차 · {d.typeSeq.replaceAll('>', ' › ')}
              </Badge>
            ))}
          </div>
          {openId === t.travelId && <TripTimeline travelId={t.travelId} />}
        </li>
      ))}
    </ul>
  );
};

const TripTimeline = ({ travelId }: { travelId: string }) => {
  const q = useTourRawTrip(travelId);
  const base = useTourPhotoBase();
  if (q.isPending) return <p className="mt-2 text-xs text-muted-foreground">타임라인 불러오는 중…</p>;
  if (q.isError) return <p className="mt-2 text-xs text-destructive">{(q.error as Error).message}</p>;
  const d = q.data;
  return (
    <div className="mt-2 space-y-1 border-t pt-2">
      {d.companions.length > 0 && (
        <p className="text-[11px] text-muted-foreground">동반: {d.companions.map((c) => [c.relNm, c.genderNm, c.ageNm].filter(Boolean).join(' ')).join(', ')}</p>
      )}
      <ol className="space-y-1">
        {d.visits.map((v) => (
          <li key={v.visitAreaId} className={cn('grid grid-cols-[52px_1fr] gap-2 text-xs', v.isPrivate && 'text-muted-foreground')}>
            <span className="tabular-nums">{v.arrivalTs ? v.arrivalTs.slice(11, 16) : v.dayIndex !== null ? `${v.dayIndex}일차` : ''}</span>
            <div className="min-w-0">
              <span className="font-medium">{v.isPrivate ? `(${v.privateRole ?? '비공개'})` : (v.name ?? '–')}</span>
              <span className="ml-1 text-muted-foreground">
                {v.typeShort}
                {v.stayMin !== null ? ` · ${v.stayMin}분` : ''}
                {v.dgstfn !== null ? ` · 만족 ${v.dgstfn}` : ''}
                {v.mvmnNm ? ` · ${v.mvmnNm.replace(/\(.*\)/, '')}` : ''}
              </span>
              {v.activities.length > 0 && (
                <div className="text-[11px] text-muted-foreground">{v.activities.map((a) => `${a.typeNm ?? ''}${a.detail ? `: ${a.detail}` : ''}`).join(' · ')}</div>
              )}
              {v.spend.length > 0 && (
                <div className="text-[11px] text-muted-foreground">{v.spend.map((s) => `${s.storeNm ?? ''} ${won(s.amount)}${s.payNum ? `/${s.payNum}명` : ''}`).join(' · ')}</div>
              )}
              {v.photoIds.length > 0 && base.data && (
                <div className="mt-0.5 flex gap-1">
                  {v.photoIds.slice(0, 6).map((id) => (
                    <a key={id} href={tourPhotoUrl(base.data!, id, 'm')} target="_blank" rel="noreferrer">
                      <img src={tourPhotoUrl(base.data!, id, 's')} alt="" loading="lazy" className="size-10 rounded object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {d.otherSpend.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          숙박·이동·사전: {d.otherSpend.map((s) => `${s.category} ${s.subtypeNm ?? s.item ?? ''} ${won(s.amount)}`).join(' · ')}
        </p>
      )}
    </div>
  );
};

// 어드민 식당 상세용 — 매칭된 여행로그 장소의 근거를 섹션 머리와 함께.
export const TourEvidenceSection = ({ tour }: { tour: RestaurantTourMatchInfoType }) => (
  <section className="space-y-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-base font-semibold">여행자 근거</h2>
      <span className="text-xs text-muted-foreground">
        여행로그 장소 "{tour.placeName}" · 여행자 {tour.nTravelers}명 · {tour.sampleLabel}
        <a className="ml-2 inline-flex items-center gap-0.5 underline" href="/admin/tour" target="_blank" rel="noreferrer">
          시드 콘솔 <ExternalLink className="size-3" />
        </a>
      </span>
    </div>
    <TourEvidencePanel tourPlaceId={tour.tourPlaceId} />
  </section>
);
