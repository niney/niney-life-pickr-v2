// 여행로그(AI 허브 71780) 적재 — tour-c 가 내보낸 `manifest.json + <table>.jsonl.gz`(표 10개)를 읽어 Tour* 테이블을
// 전량 교체한다. bus-master·life-map-master·life-store-master 와 같은 골격: 정규화는 순수 함수 + 사유별 drop 리포트,
// 쓰기는 한 트랜잭션 안에서 청크 createMany(SQLite 바인드 32,766 아래), 마지막에 `LifeMasterSync layer=tour`.
//
// 이 파일이 지키는 이용조건(docs/PLAN-tour-log.md §이용조건):
//   * 비공개 방문(집·친지집·사무실)에 이름·주소·좌표·place_id 가 남아 있으면 그 행을 버리고 센다(privateLeak) —
//     tour-c 가 이미 마스킹하지만 적재기가 다시 확인한다.
//   * 여행자 설문 원문·GPS·원본 표는 export 에 없고, 있어도 읽지 않는다(TOUR_TABLES 밖 파일 무시).
//   * 원본 행은 DB 에 있되 공개 API 는 이 모듈이 아니라 집계 서비스만 거친다.
//
// JSONL 인 이유: 자유기술의 줄바꿈·따옴표와 숫자/불리언 형이 그대로 오므로 CSV 열 인덱스 매핑·형 변환이 없다.
// 대신 각 표의 정규화 함수가 "있어야 할 키·형"을 명시해 export 스키마 드리프트를 잡는다.

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createGunzip } from 'node:zlib';
import type { Prisma, PrismaClient } from '@prisma/client';
import { TOUR_PRIVATE_TYPE_SHORTS, TOUR_TYPE_SHORTS } from '@repo/utils';
import { iterateLines } from '../housing/housing-price-master.service.js';

export const TOUR_EXPORT_VERSION = 1;
export const TOUR_EXPORT_FORMAT = 'jsonl.gz';
export const TOUR_SYNC_LAYER = 'tour';

export const TOUR_TABLES = [
  'places',
  'trips',
  'visits',
  'activities',
  'spend',
  'transitions',
  'day_sequences',
  'companions',
  'photos',
  'codes',
] as const;
export type TourTable = (typeof TOUR_TABLES)[number];

// WGS84 한국 범위 — 계약(lat 33~39, lng 124~132)과 동일. 밖이면 좌표만 null(행은 유지, badCoord 로 센다).
const LAT_MIN = 33;
const LAT_MAX = 39;
const LNG_MIN = 124;
const LNG_MAX = 132;

// createMany 한 번의 바인드 변수 예산 — 열 수로 나눠 청크 크기를 정한다(SQLite 상한 32,766).
const BIND_BUDGET = 30_000;
// 25만 행 전량 교체 — 넉넉히.
const REPLACE_TX_TIMEOUT_MS = 60 * 60_000;

export interface TourManifestTable {
  file: string;
  rows: number;
  bytes: number;
  sha256: string;
  columns: string[];
}

export interface TourManifest {
  exportVersion: number;
  format: string;
  dataset: string;
  datasetName?: string;
  name: string;
  region: string;
  built_at: string;
  source?: { tour_c_built_at?: string | null; rules?: string[] };
  tables: Record<string, TourManifestTable>;
  thumbs: Record<string, number> | null;
}

// manifest.json 을 읽고 계약(exportVersion·format·표 10개·파일 존재)을 검사한다. 어긋나면 던진다.
export const readTourManifest = (dir: string): TourManifest => {
  const path = resolve(dir, 'manifest.json');
  if (!existsSync(path)) throw new Error(`manifest.json 이 없습니다: ${path}`);
  const m = JSON.parse(readFileSync(path, 'utf8')) as TourManifest;
  if (m.exportVersion !== TOUR_EXPORT_VERSION) {
    throw new Error(`exportVersion ${m.exportVersion} 은 지원하지 않습니다(적재기 ${TOUR_EXPORT_VERSION}) — tour-c export 를 다시 만드세요`);
  }
  if (m.format !== TOUR_EXPORT_FORMAT) throw new Error(`format ${m.format} 은 지원하지 않습니다(${TOUR_EXPORT_FORMAT})`);
  if (m.dataset !== 'aihub-71780') throw new Error(`dataset ${m.dataset} — 여행로그 export 가 아닙니다`);
  for (const t of TOUR_TABLES) {
    const meta = m.tables?.[t];
    if (!meta) throw new Error(`manifest 에 표 ${t} 가 없습니다`);
    const f = resolve(dir, meta.file);
    if (!existsSync(f)) throw new Error(`표 파일이 없습니다: ${f}`);
    if (statSync(f).size !== meta.bytes) throw new Error(`표 파일 크기가 manifest 와 다릅니다: ${meta.file}`);
  }
  return m;
};

// ── JSONL 스트림 ─────────────────────────────────────────────────────────────
export type RawRow = Record<string, unknown>;

export async function* iterateJsonl(path: string): AsyncGenerator<RawRow> {
  const stream = createReadStream(path).pipe(createGunzip());
  for await (const line of iterateLines(stream)) {
    const s = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (s.length === 0) continue;
    yield JSON.parse(s) as RawRow;
  }
}

// ── 정규화(순수 함수) ────────────────────────────────────────────────────────
export type TourDropReason = 'badId' | 'badField' | 'privateLeak';

export interface TourTableReport {
  rows: number;
  kept: number;
  dropped: Record<TourDropReason, number>;
  // 좌표가 한국 범위 밖이라 null 로 바꾼 행(버리지 않음).
  badCoord: number;
  // type_short 가 알려진 목록 밖(버리지 않음 — 화면 색만 기본값).
  unknownType: number;
}

export type TourNormalizeReport = Record<TourTable, TourTableReport>;

export const emptyTourReport = (): TourNormalizeReport => {
  const one = (): TourTableReport => ({ rows: 0, kept: 0, dropped: { badId: 0, badField: 0, privateLeak: 0 }, badCoord: 0, unknownType: 0 });
  return Object.fromEntries(TOUR_TABLES.map((t) => [t, one()])) as TourNormalizeReport;
};

class Drop extends Error {
  constructor(readonly reason: TourDropReason, message: string) {
    super(message);
  }
}

// 원시 행 접근자 — 형이 어긋나면 badField 로 버린다. 필수(Req)는 null/빈 문자열도 허용하지 않는다.
class R {
  constructor(
    readonly raw: RawRow,
    readonly table: TourTable,
  ) {}
  private bad(key: string, want: string): never {
    throw new Drop('badField', `${this.table}.${key}: ${want} 가 아닙니다 (${JSON.stringify(this.raw[key])})`);
  }
  str(key: string): string | null {
    const v = this.raw[key];
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return this.bad(key, '문자열');
  }
  strReq(key: string): string {
    const v = this.str(key);
    if (v === null || v === '') throw new Drop('badId', `${this.table}.${key} 가 비었습니다`);
    return v;
  }
  int(key: string): number | null {
    const v = this.raw[key];
    if (v === null || v === undefined) return null;
    if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
    if (typeof v === 'string' && /^-?\d+$/.test(v)) return Number(v);
    return this.bad(key, '정수');
  }
  intReq(key: string): number {
    const v = this.int(key);
    if (v === null) throw new Drop('badField', `${this.table}.${key} 가 비었습니다`);
    return v;
  }
  int0(key: string): number {
    return this.int(key) ?? 0;
  }
  num(key: string): number | null {
    const v = this.raw[key];
    if (v === null || v === undefined) return null;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
    return this.bad(key, '숫자');
  }
  bool(key: string, fallback = false): boolean {
    const v = this.raw[key];
    if (v === null || v === undefined) return fallback;
    if (typeof v === 'boolean') return v;
    if (v === 'true' || v === 1) return true;
    if (v === 'false' || v === 0) return false;
    return this.bad(key, '불리언');
  }
}

// 좌표 쌍 — 둘 다 있고 한국 범위 안이면 그대로, 밖이면 둘 다 null + badCoord.
const coords = (r: R, rep: TourTableReport, lonKey = 'lon', latKey = 'lat'): { lat: number | null; lng: number | null } => {
  const lng = r.num(lonKey);
  const lat = r.num(latKey);
  if (lat === null || lng === null) return { lat: null, lng: null };
  if (lat < LAT_MIN || lat > LAT_MAX || lng < LNG_MIN || lng > LNG_MAX) {
    rep.badCoord += 1;
    return { lat: null, lng: null };
  }
  return { lat, lng };
};

const KNOWN_TYPES = new Set<string>([...TOUR_TYPE_SHORTS, ...TOUR_PRIVATE_TYPE_SHORTS]);
const typeShort = (r: R, rep: TourTableReport, key = 'type_short'): string => {
  const t = r.strReq(key);
  if (!KNOWN_TYPES.has(t)) rep.unknownType += 1;
  return t;
};

const PRIVATE_KEYS = ['name', 'road_addr', 'lot_addr', 'lon', 'lat', 'place_id', 'poi_id'] as const;

export const normalizeTourPlace = (raw: RawRow, rep: TourTableReport): Prisma.TourPlaceCreateManyInput => {
  const r = new R(raw, 'places');
  const c = coords(r, rep);
  return {
    id: r.strReq('place_id'),
    name: r.strReq('name'),
    aliases: r.str('aliases'),
    typeCd: r.strReq('type_cd'),
    typeNm: r.str('type_nm'),
    typeShort: typeShort(r, rep),
    poiId: r.str('poi_id'),
    roadAddr: r.str('road_addr'),
    lotAddr: r.str('lot_addr'),
    lat: c.lat,
    lng: c.lng,
    sido: r.str('sido'),
    sigungu: r.str('sigungu'),
    emd: r.str('emd'),
    region: r.str('region'),
    isJeju: r.bool('is_jeju'),
    isIsland: r.bool('is_island'),
    nVisits: r.int0('n_visits'),
    nTravelers: r.int0('n_travelers'),
    nRated: r.int0('n_rated'),
    meanDgstfn: r.num('mean_dgstfn'),
    bayesScore: r.num('bayes_score'),
    meanRevisitInt: r.num('mean_revisit_int'),
    meanRcmdInt: r.num('mean_rcmd_int'),
    revisitRate: r.num('revisit_rate'),
    stayMedian: r.num('stay_median'),
    nPhotos: r.int0('n_photos'),
    spendPpMedian: r.num('spend_pp_median'),
    spendN: r.int0('spend_n'),
    nActivities: r.int0('n_activities'),
    topReasonNm: r.str('top_reason_nm'),
    nLodging: r.int0('n_lodging'),
    lodgingTypeNm: r.str('lodging_type_nm'),
    firstSeen: r.str('first_seen'),
    lastSeen: r.str('last_seen'),
    firstDayShare: r.num('first_day_share'),
    searchText: r.str('search_text'),
  };
};

export const normalizeTourTrip = (raw: RawRow, _rep: TourTableReport): Prisma.TourTripCreateManyInput => {
  const r = new R(raw, 'trips');
  // 설문 원문이 섞여 들어오면(잘못된 export) 적재하지 않는다 — 계약 위반을 조용히 넘기지 않는다.
  for (const k of ['traveler_id', 'income_nm', 'job_nm', 'edu_nm', 'house_income_nm']) {
    if (k in raw) throw new Drop('badField', `trips 에 제외 열 ${k} 가 있습니다 — export 계약 위반`);
  }
  return {
    id: r.strReq('travel_id'),
    travelerLabel: r.strReq('traveler_label'),
    startDate: r.strReq('start_date'),
    endDate: r.strReq('end_date'),
    nights: r.intReq('nights'),
    month: r.intReq('month'),
    startWeekday: r.int('start_weekday'),
    personaMission: r.str('persona_mission'),
    missionCodes: r.str('mission_codes'),
    missionNames: r.str('mission_names'),
    mvmnNm: r.str('mvmn_nm'),
    gender: r.str('gender'),
    ageGrp: r.str('age_grp'),
    residenceSido: r.str('residence_sido'),
    accompany: r.str('accompany'),
    companionsNum: r.int('companions_num'),
    destination: r.str('destination'),
    style1: r.int('style_1'),
    style2: r.int('style_2'),
    style3: r.int('style_3'),
    style4: r.int('style_4'),
    style5: r.int('style_5'),
    style6: r.int('style_6'),
    style7: r.int('style_7'),
    style8: r.int('style_8'),
    motive1Nm: r.str('motive_1_nm'),
    motive2Nm: r.str('motive_2_nm'),
    motive3Nm: r.str('motive_3_nm'),
    nVisits: r.int0('n_visits'),
    nPublic: r.int0('n_public'),
    nJeju: r.int0('n_jeju'),
    nIsland: r.int0('n_island'),
    nPhotos: r.int0('n_photos'),
    nActivities: r.int0('n_activities'),
    spendActivity: r.num('spend_activity'),
    spendLodge: r.num('spend_lodge'),
    spendMove: r.num('spend_move'),
    spendAdv: r.num('spend_adv'),
    spendTotal: r.num('spend_total'),
    gpsKm: r.num('gps_km'),
    gpsHours: r.num('gps_hours'),
    hasGps: r.bool('has_gps'),
    mainRegion: r.str('main_region'),
    firstPlaceId: r.str('first_place_id'),
    firstPlaceName: r.str('first_place_name'),
    lastPlaceId: r.str('last_place_id'),
    lastPlaceName: r.str('last_place_name'),
    lodgingTypes: r.str('lodging_types'),
    meanDgstfn: r.num('mean_dgstfn'),
    regions: r.str('regions'),
    coverPhotoId: r.str('cover_photo_id'),
  };
};

export const normalizeTourVisit = (raw: RawRow, rep: TourTableReport): Prisma.TourVisitCreateManyInput => {
  const r = new R(raw, 'visits');
  const isPrivate = r.bool('is_private');
  if (isPrivate) {
    const leaked = PRIVATE_KEYS.filter((k) => raw[k] !== null && raw[k] !== undefined && raw[k] !== '');
    if (leaked.length > 0) throw new Drop('privateLeak', `비공개 방문에 ${leaked.join(',')} 가 남아 있습니다`);
  }
  const travelId = r.strReq('travel_id');
  const visitAreaId = r.strReq('visit_area_id');
  const c = coords(r, rep);
  return {
    id: `${travelId}:${visitAreaId}`,
    travelId,
    visitAreaId,
    visitOrder: r.intReq('visit_order'),
    dayIndex: r.int('day_index'),
    visitDate: r.strReq('visit_date'),
    arrivalTs: r.str('arrival_ts'),
    departTs: r.str('depart_ts'),
    stayMin: r.int('stay_min'),
    travelMinFromPrev: r.int('travel_min_from_prev'),
    travelMinRaw: r.int('travel_min_raw'),
    typeCd: r.strReq('type_cd'),
    typeNm: r.str('type_nm'),
    typeShort: typeShort(r, rep),
    isPrivate,
    privateRole: r.str('private_role'),
    placeId: r.str('place_id'),
    name: r.str('name'),
    poiId: r.str('poi_id'),
    poiNm: r.str('poi_nm'),
    roadAddr: r.str('road_addr'),
    lotAddr: r.str('lot_addr'),
    lat: c.lat,
    lng: c.lng,
    sido: r.str('sido'),
    sigungu: r.str('sigungu'),
    emd: r.str('emd'),
    region: r.str('region'),
    isJeju: r.bool('is_jeju'),
    isIsland: r.bool('is_island'),
    revisitYn: r.str('revisit_yn'),
    reasonCd: r.str('reason_cd'),
    reasonNm: r.str('reason_nm'),
    lodgingTypeCd: r.str('lodging_type_cd'),
    lodgingTypeNm: r.str('lodging_type_nm'),
    dgstfn: r.int('dgstfn'),
    revisitInt: r.int('revisit_int'),
    rcmdInt: r.int('rcmd_int'),
    mvmnCd: r.str('mvmn_cd'),
    mvmnNm: r.str('mvmn_nm'),
    mvmnCd2: r.str('mvmn_cd2'),
    mvmnNm2: r.str('mvmn_nm2'),
    nPhotos: r.int0('n_photos'),
    nActivities: r.int0('n_activities'),
    spendSum: r.num('spend_sum'),
    spendPp: r.num('spend_pp'),
    prevPlaceId: r.str('prev_place_id'),
    nextPlaceId: r.str('next_place_id'),
    arrivalHour: r.int('arrival_hour'),
    arrivalWeekday: r.int('arrival_weekday'),
    gender: r.str('gender'),
    ageGrp: r.str('age_grp'),
    accompany: r.str('accompany'),
    residenceSido: r.str('residence_sido'),
    nights: r.int('nights'),
    month: r.int('month'),
    personaMission: r.str('persona_mission'),
    travelerLabel: r.str('traveler_label'),
  };
};

export const normalizeTourActivity = (raw: RawRow, _rep: TourTableReport): Prisma.TourActivityCreateManyInput => {
  const r = new R(raw, 'activities');
  return {
    travelId: r.strReq('travel_id'),
    visitAreaId: r.strReq('visit_area_id'),
    placeId: r.str('place_id'),
    isPrivate: r.bool('is_private'),
    typeCd: r.strReq('type_cd'),
    typeNm: r.str('type_nm'),
    seq: r.int0('seq'),
    detail: r.str('detail'),
    rsvtYn: r.str('rsvt_yn'),
    expndSe: r.str('expnd_se'),
    expndNm: r.str('expnd_nm'),
    admissionNm: r.str('admission_nm'),
    visitDate: r.str('visit_date'),
    dayIndex: r.int('day_index'),
    visitTypeCd: r.str('visit_type_cd'),
    visitTypeNm: r.str('visit_type_nm'),
    region: r.str('region'),
    isJeju: r.bool('is_jeju'),
    gender: r.str('gender'),
    ageGrp: r.str('age_grp'),
    accompany: r.str('accompany'),
    month: r.int('month'),
  };
};

export const normalizeTourSpend = (raw: RawRow, _rep: TourTableReport): Prisma.TourSpendCreateManyInput => {
  const r = new R(raw, 'spend');
  return {
    id: r.intReq('spend_id'),
    travelId: r.strReq('travel_id'),
    category: r.strReq('category'),
    categoryCd: r.strReq('category_cd'),
    visitAreaId: r.str('visit_area_id'),
    placeId: r.str('place_id'),
    subtypeCd: r.str('subtype_cd'),
    subtypeNm: r.str('subtype_nm'),
    item: r.str('item'),
    storeNm: r.str('store_nm'),
    brno: r.str('brno'),
    amount: r.num('amount'),
    payNum: r.int('pay_num'),
    perPerson: r.num('per_person'),
    methodCd: r.str('method_cd'),
    methodNm: r.str('method_nm'),
    paidTs: r.str('paid_ts'),
    paidHour: r.int('paid_hour'),
    rsvtYn: r.str('rsvt_yn'),
    etcText: r.str('etc_text'),
    roadAddr: r.str('road_addr'),
    sggCd: r.str('sgg_cd'),
    dayIndex: r.int('day_index'),
    gender: r.str('gender'),
    ageGrp: r.str('age_grp'),
    accompany: r.str('accompany'),
    residenceSido: r.str('residence_sido'),
    nights: r.int('nights'),
    month: r.int('month'),
  };
};

export const normalizeTourTransition = (raw: RawRow, _rep: TourTableReport): Prisma.TourTransitionCreateManyInput => {
  const r = new R(raw, 'transitions');
  return {
    travelId: r.strReq('travel_id'),
    dayIndex: r.int('day_index'),
    fromVisitId: r.strReq('from_visit_id'),
    toVisitId: r.strReq('to_visit_id'),
    fromPlaceId: r.str('from_place_id'),
    toPlaceId: r.str('to_place_id'),
    fromName: r.str('from_name'),
    toName: r.str('to_name'),
    fromTypeCd: r.str('from_type_cd'),
    toTypeCd: r.str('to_type_cd'),
    fromType: r.str('from_type'),
    toType: r.str('to_type'),
    mvmnCd: r.str('mvmn_cd'),
    mvmnNm: r.str('mvmn_nm'),
    travelMin: r.int('travel_min'),
    sameDay: r.bool('same_day'),
    viaPrivate: r.bool('via_private'),
    bothJeju: r.bool('both_jeju'),
    fromRegion: r.str('from_region'),
    toRegion: r.str('to_region'),
    gender: r.str('gender'),
    ageGrp: r.str('age_grp'),
    accompany: r.str('accompany'),
    residenceSido: r.str('residence_sido'),
    nights: r.int('nights'),
    month: r.int('month'),
  };
};

export const normalizeTourDaySequence = (raw: RawRow, _rep: TourTableReport): Prisma.TourDaySequenceCreateManyInput => {
  const r = new R(raw, 'day_sequences');
  const travelId = r.strReq('travel_id');
  const dayIndex = r.intReq('day_index');
  return {
    id: `${travelId}:${dayIndex}`,
    travelId,
    dayIndex,
    visitDate: r.str('visit_date'),
    nStops: r.int0('n_stops'),
    typeSeq: r.strReq('type_seq'),
    placeSeq: r.str('place_seq'),
    placeIds: r.str('place_ids'),
    isJejuDay: r.bool('is_jeju_day'),
    isLastDay: r.bool('is_last_day'),
    gender: r.str('gender'),
    ageGrp: r.str('age_grp'),
    accompany: r.str('accompany'),
    residenceSido: r.str('residence_sido'),
    nights: r.int('nights'),
    month: r.int('month'),
  };
};

export const normalizeTourCompanion = (raw: RawRow, _rep: TourTableReport): Prisma.TourCompanionCreateManyInput => {
  const r = new R(raw, 'companions');
  return {
    travelId: r.strReq('travel_id'),
    seq: r.int0('seq'),
    relCd: r.str('rel_cd'),
    relNm: r.str('rel_nm'),
    genderNm: r.str('gender_nm'),
    ageNm: r.str('age_nm'),
    situationNm: r.str('situation_nm'),
  };
};

export const normalizeTourPhoto = (raw: RawRow, _rep: TourTableReport): Prisma.TourPhotoCreateManyInput => {
  const r = new R(raw, 'photos');
  for (const k of ['lon', 'lat', 'filename']) {
    if (k in raw) throw new Drop('badField', `photos 에 제외 열 ${k} 가 있습니다 — export 계약 위반`);
  }
  return {
    id: r.strReq('photo_id'),
    travelId: r.str('travel_id'),
    visitAreaId: r.str('visit_area_id'),
    placeId: r.str('place_id'),
    placeName: r.str('place_name'),
    takenTs: r.str('taken_ts'),
    takenHour: r.int('taken_hour'),
    takenDate: r.str('taken_date'),
    width: r.int('width'),
    height: r.int('height'),
    hasThumb: r.bool('has_thumb'),
    caption: r.str('caption'),
    captionTokens: r.int('caption_tokens'),
    landmark: r.str('landmark'),
    hasCaption: r.bool('has_caption'),
    visitTypeCd: r.str('visit_type_cd'),
    visitTypeNm: r.str('visit_type_nm'),
    region: r.str('region'),
    isJeju: r.bool('is_jeju'),
    dayIndex: r.int('day_index'),
    source: r.str('source') ?? 'train',
    seq: r.int('seq'),
    gender: r.str('gender'),
    ageGrp: r.str('age_grp'),
    accompany: r.str('accompany'),
    month: r.int('month'),
    nights: r.int('nights'),
  };
};

export const normalizeTourCode = (raw: RawRow, _rep: TourTableReport): Prisma.TourCodeCreateManyInput => {
  const r = new R(raw, 'codes');
  return {
    cdA: r.strReq('cd_a'),
    groupNm: r.str('group_nm'),
    cdB: r.strReq('cd_b'),
    cdNm: r.str('cd_nm'),
    orderNum: r.int('order_num'),
    delFlag: r.str('del_flag'),
  };
};

type Normalizer = (raw: RawRow, rep: TourTableReport) => Record<string, unknown>;
const NORMALIZERS: Record<TourTable, { normalize: Normalizer; columns: number }> = {
  places: { normalize: normalizeTourPlace, columns: 37 },
  trips: { normalize: normalizeTourTrip, columns: 52 },
  visits: { normalize: normalizeTourVisit, columns: 58 },
  activities: { normalize: normalizeTourActivity, columns: 22 },
  spend: { normalize: normalizeTourSpend, columns: 29 },
  transitions: { normalize: normalizeTourTransition, columns: 26 },
  day_sequences: { normalize: normalizeTourDaySequence, columns: 16 },
  companions: { normalize: normalizeTourCompanion, columns: 7 },
  photos: { normalize: normalizeTourPhoto, columns: 27 },
  codes: { normalize: normalizeTourCode, columns: 6 },
};

// 한 번의 createMany 행 수 — 열 수 × 행 수 ≤ BIND_BUDGET. 열 7개인 companions 도 1,000 상한.
export const tourChunkSize = (table: TourTable): number => Math.max(50, Math.min(1000, Math.floor(BIND_BUDGET / NORMALIZERS[table].columns)));

// 한 표를 정규화된 청크 배열로 흘려 보낸다. drop 은 리포트에 사유별로 센다.
export async function* iterateTourChunks(dir: string, manifest: TourManifest, table: TourTable, report: TourNormalizeReport): AsyncGenerator<Record<string, unknown>[]> {
  const { normalize } = NORMALIZERS[table];
  const size = tourChunkSize(table);
  const rep = report[table];
  let buf: Record<string, unknown>[] = [];
  for await (const raw of iterateJsonl(resolve(dir, manifest.tables[table]!.file))) {
    rep.rows += 1;
    try {
      buf.push(normalize(raw, rep));
      rep.kept += 1;
    } catch (e) {
      if (e instanceof Drop) rep.dropped[e.reason] += 1;
      else throw e;
    }
    if (buf.length >= size) {
      yield buf;
      buf = [];
    }
  }
  if (buf.length > 0) yield buf;
}

// ── 전량 교체 ────────────────────────────────────────────────────────────────
export interface TourReplaceOptions {
  dryRun?: boolean;
  onProgress?: (table: TourTable, inserted: number) => void;
}

export interface TourReplaceResult {
  report: TourNormalizeReport;
  inserted: Record<TourTable, number>;
}

type Tx = Prisma.TransactionClient;
const DELEGATE: Record<TourTable, (tx: Tx) => { deleteMany: () => Promise<unknown>; createMany: (args: { data: never[] }) => Promise<unknown> }> = {
  places: (tx) => tx.tourPlace,
  trips: (tx) => tx.tourTrip,
  visits: (tx) => tx.tourVisit,
  activities: (tx) => tx.tourActivity,
  spend: (tx) => tx.tourSpend,
  transitions: (tx) => tx.tourTransition,
  day_sequences: (tx) => tx.tourDaySequence,
  companions: (tx) => tx.tourCompanion,
  photos: (tx) => tx.tourPhoto,
  codes: (tx) => tx.tourCode,
};

// 표 10개를 한 트랜잭션 안에서 delete → 청크 createMany → 적재 이력. 중간에 실패하면 롤백돼 이전 적재본이 남는다.
// dryRun 이면 정규화·리포트만(쓰기 없음).
export const replaceTourTables = async (prisma: PrismaClient, dir: string, manifest: TourManifest, opts: TourReplaceOptions = {}): Promise<TourReplaceResult> => {
  const report = emptyTourReport();
  const inserted = Object.fromEntries(TOUR_TABLES.map((t) => [t, 0])) as Record<TourTable, number>;

  const run = async (tx: Tx | null): Promise<void> => {
    if (tx) for (const t of TOUR_TABLES) await DELEGATE[t](tx).deleteMany();
    for (const t of TOUR_TABLES) {
      for await (const chunk of iterateTourChunks(dir, manifest, t, report)) {
        if (tx) await DELEGATE[t](tx).createMany({ data: chunk as never[] });
        inserted[t] += chunk.length;
        opts.onProgress?.(t, inserted[t]);
      }
    }
    if (tx) {
      await tx.lifeMasterSync.create({
        data: {
          layer: TOUR_SYNC_LAYER,
          count: inserted.places,
          geocoded: null,
          baseDate: manifest.built_at.slice(0, 10),
          sourceFile: `${basename(dir)}#v${manifest.exportVersion}`,
        },
      });
    }
  };

  if (opts.dryRun) await run(null);
  else await prisma.$transaction((tx) => run(tx), { timeout: REPLACE_TX_TIMEOUT_MS, maxWait: 60_000 });
  return { report, inserted };
};

// 환수·폐기 대비 — 표 10개 + 매칭·사업자 상태를 비우고 count 0 인 이력 행을 남긴다(적재 상태 "없음").
export const unloadTourTables = async (prisma: PrismaClient): Promise<void> => {
  await prisma.$transaction(
    async (tx) => {
      for (const t of TOUR_TABLES) await DELEGATE[t](tx).deleteMany();
      await tx.restaurantTourMatch.deleteMany();
      await tx.tourPlaceBizStatus.deleteMany();
      await tx.lifeMasterSync.create({ data: { layer: TOUR_SYNC_LAYER, count: 0, geocoded: null, baseDate: null, sourceFile: 'unload' } });
    },
    { timeout: REPLACE_TX_TIMEOUT_MS, maxWait: 60_000 },
  );
};

export interface TourLoadStatus {
  loaded: boolean;
  places: number;
  baseDate: string | null;
  sourceFile: string | null;
  loadedAt: Date | null;
  counts: Record<TourTable, number>;
}

// 최신 이력 행 + 실제 건수. 이력이 없거나 count 0 이면 미적재.
export const getTourLoadStatus = async (prisma: PrismaClient): Promise<TourLoadStatus> => {
  const sync = await prisma.lifeMasterSync.findFirst({ where: { layer: TOUR_SYNC_LAYER }, orderBy: { loadedAt: 'desc' } });
  const [places, trips, visits, activities, spend, transitions, daySequences, companions, photos, codes] = await Promise.all([
    prisma.tourPlace.count(),
    prisma.tourTrip.count(),
    prisma.tourVisit.count(),
    prisma.tourActivity.count(),
    prisma.tourSpend.count(),
    prisma.tourTransition.count(),
    prisma.tourDaySequence.count(),
    prisma.tourCompanion.count(),
    prisma.tourPhoto.count(),
    prisma.tourCode.count(),
  ]);
  return {
    loaded: (sync?.count ?? 0) > 0 && places > 0,
    places,
    baseDate: sync?.baseDate ?? null,
    sourceFile: sync?.sourceFile ?? null,
    loadedAt: sync?.loadedAt ?? null,
    counts: { places, trips, visits, activities, spend, transitions, day_sequences: daySequences, companions, photos, codes },
  };
};

// 기본 export 폴더 — 리포 밖 data/open/tour/lp-2023. 서버는 apps/friendly 에서 뜨고(pm2·dev) 스크립트도 그 cwd 라
// cwd 기준 두 후보를 본다(번들된 dist 에서는 import.meta.url 이 리포 구조를 잃어 못 쓴다). 운영에서 다른 곳에 두면
// TOUR_THUMBS_DIR 로 사진 폴더만 따로 지정한다.
export const tourDefaultExportDir = (): string => {
  const candidates = [resolve(process.cwd(), 'data/open/tour/lp-2023'), resolve(process.cwd(), '../../data/open/tour/lp-2023')];
  return candidates.find((c) => existsSync(c)) ?? candidates[1]!;
};

// 썸네일 폴더 — TOUR_THUMBS_DIR > (주어진 export 폴더 | 기본 export 폴더)/thumbs. 관리자 사진 라우트(3차)와 적재 리포트가
// 같이 쓴다. 폴더가 없어도 경로는 돌려주고(존재 여부는 호출부가 existsSync), env 도 export 도 없을 때만 null.
export const resolveTourThumbsDir = (exportDir: string | null): string | null => {
  const env = process.env.TOUR_THUMBS_DIR?.trim();
  if (env) return resolve(env);
  return resolve(exportDir ?? tourDefaultExportDir(), 'thumbs');
};
