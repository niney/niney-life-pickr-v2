// 여행로그 원본 열람(3차, 관리자 allowlist 전용) — 장소 하나에 대한 개별 방문·주문 원문·영수증·사진 메타·그 장소를 포함한
// 여행(일차별 순서)과 여행 한 건의 타임라인. AI 허브 이용조건상 "승인받은 본인" 만 보는 층이라 공개 집계 서비스와 파일을
// 나누고, 라우트는 TOUR_RAW_USER_IDS allowlist 로 막는다(docs/PLAN-tour-log.md §관리자 층). 이 서비스는 읽기만 한다.
//
// 비공개 방문(집·친지집·사무실)은 tour-c 가 이름·주소·좌표를 지운 채로 왔고 여기서도 privateRole("출발지"·"귀가"·"비공개
// 장소")만 낸다 — 타임라인의 순서를 보여주기 위해서다.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrismaClient, TourTrip } from '@prisma/client';
import type {
  TourRawActivitiesResultType,
  TourRawPageQueryType,
  TourRawPhotosResultType,
  TourRawSpendResultType,
  TourRawTripDetailType,
  TourRawTripSummaryType,
  TourRawTripsResultType,
  TourRawVisitsResultType,
} from '@repo/api-contract';
import { resolveTourThumbsDir } from './tour-master.service.js';

export const TOUR_PHOTO_SIZES = ['s', 'm'] as const;
export type TourPhotoSize = (typeof TOUR_PHOTO_SIZES)[number];
// 사진 id 는 `h00003002003p0001` 꼴 — 경로 조작 방지용 화이트리스트.
export const TOUR_PHOTO_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

// 쉼표 목록 → Set. 공백·빈 항목 무시.
export const parseTourRawAllowlist = (raw: string | undefined): Set<string> =>
  new Set(
    (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );

export class TourRawService {
  constructor(private readonly prisma: PrismaClient) {}

  async placeExists(placeId: string): Promise<boolean> {
    return (await this.prisma.tourPlace.count({ where: { id: placeId } })) > 0;
  }

  async listVisits(placeId: string, page: TourRawPageQueryType): Promise<TourRawVisitsResultType> {
    const [rows, total] = await Promise.all([
      this.prisma.tourVisit.findMany({ where: { placeId }, orderBy: [{ visitDate: 'desc' }, { travelId: 'asc' }], take: page.limit, skip: page.offset }),
      this.prisma.tourVisit.count({ where: { placeId } }),
    ]);
    const ids = new Set<string>();
    for (const r of rows) {
      if (r.prevPlaceId) ids.add(r.prevPlaceId);
      if (r.nextPlaceId) ids.add(r.nextPlaceId);
    }
    const names = new Map((await this.prisma.tourPlace.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]));
    return {
      tourPlaceId: placeId,
      total,
      items: rows.map((r) => ({
        id: r.id,
        travelId: r.travelId,
        travelerLabel: r.travelerLabel,
        visitDate: r.visitDate,
        dayIndex: r.dayIndex,
        arrivalTs: r.arrivalTs,
        stayMin: r.stayMin,
        dgstfn: r.dgstfn,
        revisitInt: r.revisitInt,
        rcmdInt: r.rcmdInt,
        revisitYn: r.revisitYn,
        reasonNm: r.reasonNm,
        mvmnNm: r.mvmnNm,
        spendSum: r.spendSum,
        spendPp: r.spendPp,
        nPhotos: r.nPhotos,
        nActivities: r.nActivities,
        gender: r.gender,
        ageGrp: r.ageGrp,
        accompany: r.accompany,
        residenceSido: r.residenceSido,
        nights: r.nights,
        month: r.month,
        prevPlaceName: r.prevPlaceId ? (names.get(r.prevPlaceId) ?? null) : null,
        nextPlaceName: r.nextPlaceId ? (names.get(r.nextPlaceId) ?? null) : null,
      })),
    };
  }

  async listActivities(placeId: string, page: TourRawPageQueryType): Promise<TourRawActivitiesResultType> {
    const [rows, total] = await Promise.all([
      this.prisma.tourActivity.findMany({ where: { placeId }, orderBy: [{ visitDate: 'desc' }, { travelId: 'asc' }, { seq: 'asc' }], take: page.limit, skip: page.offset }),
      this.prisma.tourActivity.count({ where: { placeId } }),
    ]);
    return {
      tourPlaceId: placeId,
      total,
      items: rows.map((r) => ({
        travelId: r.travelId,
        visitAreaId: r.visitAreaId,
        typeNm: r.typeNm,
        seq: r.seq,
        detail: r.detail,
        rsvtYn: r.rsvtYn,
        expndNm: r.expndNm,
        admissionNm: r.admissionNm,
        visitDate: r.visitDate,
        dayIndex: r.dayIndex,
        ageGrp: r.ageGrp,
        accompany: r.accompany,
      })),
    };
  }

  async listSpend(placeId: string, page: TourRawPageQueryType): Promise<TourRawSpendResultType> {
    const [rows, total] = await Promise.all([
      this.prisma.tourSpend.findMany({ where: { placeId }, orderBy: [{ paidTs: 'desc' }, { id: 'asc' }], take: page.limit, skip: page.offset }),
      this.prisma.tourSpend.count({ where: { placeId } }),
    ]);
    return {
      tourPlaceId: placeId,
      total,
      items: rows.map((r) => ({
        id: r.id,
        travelId: r.travelId,
        category: r.category,
        subtypeNm: r.subtypeNm,
        item: r.item,
        storeNm: r.storeNm,
        brno: r.brno,
        amount: r.amount,
        payNum: r.payNum,
        perPerson: r.perPerson,
        methodNm: r.methodNm,
        paidTs: r.paidTs,
        dayIndex: r.dayIndex,
        ageGrp: r.ageGrp,
        accompany: r.accompany,
        roadAddr: r.roadAddr,
      })),
    };
  }

  thumbsSizes(): TourPhotoSize[] {
    const dir = resolveTourThumbsDir(null);
    if (!dir) return [];
    return TOUR_PHOTO_SIZES.filter((s) => existsSync(resolve(dir, s)));
  }

  async listPhotos(placeId: string, page: TourRawPageQueryType): Promise<TourRawPhotosResultType> {
    const where = { placeId, hasThumb: true };
    const [rows, total] = await Promise.all([
      this.prisma.tourPhoto.findMany({ where, orderBy: [{ takenTs: 'desc' }, { id: 'asc' }], take: page.limit, skip: page.offset }),
      this.prisma.tourPhoto.count({ where }),
    ]);
    return {
      tourPlaceId: placeId,
      total,
      sizes: this.thumbsSizes(),
      items: rows.map((r) => ({
        id: r.id,
        travelId: r.travelId,
        visitAreaId: r.visitAreaId,
        takenTs: r.takenTs,
        width: r.width,
        height: r.height,
        caption: r.caption,
        landmark: r.landmark,
        source: r.source,
      })),
    };
  }

  // 그 장소를 포함한 여행 — 여행 ID 목록(distinct)을 페이지로 자른 뒤 여행·일차 순서를 붙인다.
  async listTrips(placeId: string, page: TourRawPageQueryType): Promise<TourRawTripsResultType> {
    const travelIds = (await this.prisma.tourVisit.findMany({ where: { placeId }, distinct: ['travelId'], select: { travelId: true }, orderBy: { travelId: 'asc' } })).map((r) => r.travelId);
    const slice = travelIds.slice(page.offset, page.offset + page.limit);
    const [trips, days] = await Promise.all([
      this.prisma.tourTrip.findMany({ where: { id: { in: slice } }, orderBy: { id: 'asc' } }),
      this.prisma.tourDaySequence.findMany({ where: { travelId: { in: slice } }, orderBy: [{ travelId: 'asc' }, { dayIndex: 'asc' }] }),
    ]);
    const daysBy = new Map<string, TourRawTripSummaryType['days']>();
    for (const d of days) {
      const arr = daysBy.get(d.travelId) ?? [];
      arr.push({ dayIndex: d.dayIndex, visitDate: d.visitDate, nStops: d.nStops, typeSeq: d.typeSeq, placeSeq: d.placeSeq });
      daysBy.set(d.travelId, arr);
    }
    return { tourPlaceId: placeId, total: travelIds.length, items: trips.map((t) => toTripSummary(t, daysBy.get(t.id) ?? [])) };
  }

  // 여행 한 건의 타임라인 — 방문 순서대로, 각 방문에 활동·활동 소비·사진 id 를 붙이고 숙박·이동·사전 소비는 따로.
  async getTrip(travelId: string): Promise<TourRawTripDetailType | null> {
    const trip = await this.prisma.tourTrip.findUnique({ where: { id: travelId } });
    if (!trip) return null;
    const [days, companions, visits, activities, spend, photos] = await Promise.all([
      this.prisma.tourDaySequence.findMany({ where: { travelId }, orderBy: { dayIndex: 'asc' } }),
      this.prisma.tourCompanion.findMany({ where: { travelId }, orderBy: { seq: 'asc' } }),
      this.prisma.tourVisit.findMany({ where: { travelId }, orderBy: { visitOrder: 'asc' } }),
      this.prisma.tourActivity.findMany({ where: { travelId }, orderBy: [{ visitAreaId: 'asc' }, { seq: 'asc' }] }),
      this.prisma.tourSpend.findMany({ where: { travelId }, orderBy: { id: 'asc' } }),
      this.prisma.tourPhoto.findMany({ where: { travelId, hasThumb: true }, orderBy: [{ takenTs: 'asc' }, { id: 'asc' }], select: { id: true, visitAreaId: true } }),
    ]);
    const actsBy = groupBy(activities, (a) => a.visitAreaId);
    const spendBy = groupBy(spend.filter((s) => s.visitAreaId !== null), (s) => s.visitAreaId!);
    const photosBy = groupBy(photos.filter((p) => p.visitAreaId !== null), (p) => p.visitAreaId!);
    return {
      trip: toTripSummary(trip, days.map((d) => ({ dayIndex: d.dayIndex, visitDate: d.visitDate, nStops: d.nStops, typeSeq: d.typeSeq, placeSeq: d.placeSeq }))),
      companions: companions.map((c) => ({ relNm: c.relNm, genderNm: c.genderNm, ageNm: c.ageNm, situationNm: c.situationNm })),
      visits: visits.map((v) => ({
        visitAreaId: v.visitAreaId,
        visitOrder: v.visitOrder,
        dayIndex: v.dayIndex,
        visitDate: v.visitDate,
        arrivalTs: v.arrivalTs,
        departTs: v.departTs,
        stayMin: v.stayMin,
        typeShort: v.typeShort,
        isPrivate: v.isPrivate,
        privateRole: v.privateRole,
        placeId: v.placeId,
        name: v.isPrivate ? null : v.name,
        sigungu: v.sigungu,
        emd: v.emd,
        dgstfn: v.dgstfn,
        reasonNm: v.reasonNm,
        mvmnNm: v.mvmnNm,
        spendSum: v.spendSum,
        nPhotos: v.nPhotos,
        activities: (actsBy.get(v.visitAreaId) ?? []).map((a) => ({ typeNm: a.typeNm, detail: a.detail })),
        spend: (spendBy.get(v.visitAreaId) ?? []).map((s) => ({ storeNm: s.storeNm, item: s.item, amount: s.amount, payNum: s.payNum, methodNm: s.methodNm })),
        photoIds: (photosBy.get(v.visitAreaId) ?? []).map((p) => p.id),
      })),
      otherSpend: spend
        .filter((s) => s.visitAreaId === null)
        .map((s) => ({ category: s.category, subtypeNm: s.subtypeNm, item: s.item, amount: s.amount, payNum: s.payNum, methodNm: s.methodNm, dayIndex: s.dayIndex })),
    };
  }

  // 썸네일 파일 경로 — id 화이트리스트 + 폴더 밖 탈출 차단. 없으면 null.
  photoPath(photoId: string, size: TourPhotoSize): string | null {
    if (!TOUR_PHOTO_ID_RE.test(photoId)) return null;
    const dir = resolveTourThumbsDir(null);
    if (!dir) return null;
    const base = resolve(dir, size);
    const path = resolve(base, `${photoId}.webp`);
    if (!path.startsWith(base)) return null;
    return existsSync(path) ? path : null;
  }
}

const toTripSummary = (t: TourTrip, days: TourRawTripSummaryType['days']): TourRawTripSummaryType => ({
  travelId: t.id,
  travelerLabel: t.travelerLabel,
  startDate: t.startDate,
  endDate: t.endDate,
  nights: t.nights,
  month: t.month,
  gender: t.gender,
  ageGrp: t.ageGrp,
  accompany: t.accompany,
  residenceSido: t.residenceSido,
  mvmnNm: t.mvmnNm,
  missionNames: t.missionNames,
  nPublic: t.nPublic,
  nPhotos: t.nPhotos,
  spendTotal: t.spendTotal,
  mainRegion: t.mainRegion,
  days,
});

const groupBy = <T>(rows: T[], key: (r: T) => string): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = m.get(k) ?? [];
    arr.push(r);
    m.set(k, arr);
  }
  return m;
};
