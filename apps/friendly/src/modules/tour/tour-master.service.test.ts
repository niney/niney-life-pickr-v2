import { gzipSync } from 'node:zlib';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TourDataset, TourRegion } from '@repo/api-contract';
import { TOUR_DATASET_KEYS, TOUR_REGION_KEYS } from '@repo/utils';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import {
  TOUR_TABLES,
  emptyTourReport,
  getTourLoadStatus,
  normalizeTourPhoto,
  normalizeTourPlace,
  normalizeTourTrip,
  normalizeTourVisit,
  readTourManifest,
  replaceTourTables,
  tourChunkSize,
  tourNormalizeCtx,
  unloadTourTables,
  type RawRow,
  type TourManifest,
  type TourTable,
} from './tour-master.service.js';

// 여행로그 적재 — 정규화 규칙(비공개 마스킹·좌표 범위·제외 열)과 전량 교체·폐기 불변식을 고정한다. 실 export 는
// data/open/tour/(리포 밖)라 여기서는 표 10개짜리 작은 export 를 임시 폴더에 만들어 쓴다.

const visitRow = (over: RawRow = {}): RawRow => ({
  travel_id: 'h_h000001',
  visit_area_id: '2305270001',
  visit_order: 2,
  day_index: 1,
  visit_date: '2023-05-27',
  arrival_ts: '2023-05-27 12:00:00',
  depart_ts: '2023-05-27 13:00:00',
  stay_min: 60,
  travel_min_from_prev: 30,
  travel_min_raw: 30,
  type_cd: '11',
  type_nm: '식당/카페',
  type_short: '식당',
  is_private: false,
  private_role: null,
  place_id: 'pd804155188',
  name: '우진해장국',
  poi_id: 'POI01000TR037867V',
  poi_nm: '우진해장국',
  road_addr: '제주특별자치도 제주시 서사로 11',
  lot_addr: '제주특별자치도 제주시 삼도이동 831',
  lon: 126.5200013,
  lat: 33.5115169,
  sido: '제주특별자치도',
  sigungu: '제주시',
  emd: '삼도이동',
  region: '제주시',
  is_jeju: true,
  is_island: false,
  revisit_yn: 'N',
  reason_cd: '1',
  reason_nm: '온라인(SNS, 블로그 등) 평가가 좋아서',
  lodging_type_cd: null,
  lodging_type_nm: null,
  dgstfn: 5,
  revisit_int: 4,
  rcmd_int: 5,
  mvmn_cd: '1',
  mvmn_nm: '렌터카',
  mvmn_cd2: null,
  mvmn_nm2: null,
  n_photos: 0,
  n_activities: 1,
  spend_sum: 20000,
  spend_pp: 10000,
  prev_place_id: null,
  next_place_id: null,
  arrival_hour: 12,
  arrival_weekday: 5,
  gender: '여',
  age_grp: '30',
  accompany: '2인 여행(가족 외)',
  residence_sido: '서울특별시',
  nights: 2,
  month: 5,
  persona_mission: '일반미션',
  traveler_label: '여행자 #0001',
  ...over,
});

const placeRow = (over: RawRow = {}): RawRow => ({
  place_id: 'pd804155188',
  name: '우진해장국',
  aliases: '우진 해장국',
  type_cd: '11',
  type_nm: '식당/카페',
  type_short: '식당',
  poi_id: 'POI01000TR037867V',
  road_addr: '제주특별자치도 제주시 서사로 11',
  lot_addr: null,
  lon: 126.5200013,
  lat: 33.5115169,
  sido: '제주특별자치도',
  sigungu: '제주시',
  emd: '삼도이동',
  region: '제주시',
  is_jeju: true,
  is_island: false,
  n_visits: 115,
  n_travelers: 110,
  n_rated: 115,
  mean_dgstfn: 4.43,
  bayes_score: 4.43,
  mean_revisit_int: 4.13,
  mean_rcmd_int: 4.38,
  revisit_rate: 0.322,
  stay_median: 60,
  n_photos: 3,
  spend_pp_median: 10000,
  spend_n: 122,
  n_activities: 120,
  top_reason_nm: '온라인(SNS, 블로그 등) 평가가 좋아서',
  n_lodging: 0,
  lodging_type_nm: null,
  first_seen: '2023-05-01',
  last_seen: '2023-09-20',
  first_day_share: 0.452,
  search_text: '우진해장국 우진 해장국',
  ...over,
});

const tripRow = (over: RawRow = {}): RawRow => ({
  travel_id: 'h_h000001',
  traveler_label: '여행자 #0001',
  start_date: '2023-05-27',
  end_date: '2023-05-29',
  nights: 2,
  month: 5,
  start_weekday: 5,
  persona_mission: '일반미션',
  mission_codes: '22;1',
  mission_names: 'SNS 인생샷;쇼핑',
  mvmn_nm: '자가용',
  gender: '여',
  age_grp: '30',
  residence_sido: '서울특별시',
  accompany: '2인 여행(가족 외)',
  companions_num: 1,
  destination: '제주',
  style_1: 2,
  style_2: 4,
  style_3: 3,
  style_4: 5,
  style_5: 2,
  style_6: 6,
  style_7: 3,
  style_8: 7,
  motive_1_nm: '휴식',
  motive_2_nm: null,
  motive_3_nm: null,
  n_visits: 14,
  n_public: 12,
  n_jeju: 10,
  n_island: 0,
  n_photos: 2,
  n_activities: 16,
  spend_activity: 300000,
  spend_lodge: 200000,
  spend_move: 150000,
  spend_adv: 0,
  spend_total: 650000,
  gps_km: 120.5,
  gps_hours: 40,
  has_gps: true,
  main_region: '제주시',
  first_place_id: null,
  first_place_name: '제주국제공항',
  last_place_id: null,
  last_place_name: '제주국제공항',
  lodging_types: '펜션',
  mean_dgstfn: 4.5,
  regions: '제주시;서귀포시',
  cover_photo_id: null,
  ...over,
});

const photoRow = (over: RawRow = {}): RawRow => ({
  photo_id: 'h00000101002p0001',
  travel_id: 'h_h000001',
  visit_area_id: '2305270001',
  place_id: 'pd804155188',
  place_name: '우진해장국',
  taken_ts: '2023-05-27 12:10:00',
  taken_hour: 12,
  taken_date: '2023-05-27',
  width: 4032,
  height: 3024,
  has_thumb: true,
  caption: null,
  caption_tokens: null,
  landmark: null,
  has_caption: false,
  visit_type_cd: '11',
  visit_type_nm: '식당/카페',
  region: '제주시',
  is_jeju: true,
  day_index: 1,
  source: 'train',
  seq: 1,
  gender: '여',
  age_grp: '30',
  accompany: '2인 여행(가족 외)',
  month: 5,
  nights: 2,
  ...over,
});

describe('tour-master 데이터셋·지역 키', () => {
  it('utils 의 키 목록이 api-contract zod enum 과 같다(순환 금지 → 리터럴 이중 정의를 여기서 검증)', () => {
    expect(TourDataset.options).toEqual([...TOUR_DATASET_KEYS]);
    expect(TourRegion.options).toEqual([...TOUR_REGION_KEYS]);
  });

  it('장소 id 접두 — 첫 세트(jeju)는 그대로, 그 밖은 "<key>:" 접두', () => {
    expect(normalizeTourPlace(placeRow(), emptyTourReport().places, tourNormalizeCtx('jeju'))).toMatchObject({ id: 'pd804155188', dataset: 'jeju' });
    expect(normalizeTourPlace(placeRow(), emptyTourReport().places, tourNormalizeCtx('west'))).toMatchObject({ id: 'west:pd804155188', dataset: 'west' });
    expect(normalizeTourPlace(placeRow(), emptyTourReport().places, tourNormalizeCtx('east'))).toMatchObject({ id: 'east:pd804155188', dataset: 'east' });
    // 방문의 placeId 도 접두가 붙는다.
    expect(normalizeTourVisit(visitRow(), emptyTourReport().visits, tourNormalizeCtx('west'))).toMatchObject({ dataset: 'west', placeId: 'west:pd804155188' });
    expect(normalizeTourVisit(visitRow(), emptyTourReport().visits, tourNormalizeCtx('east'))).toMatchObject({ dataset: 'east', placeId: 'east:pd804155188' });
  });
});

describe('tour-master normalize', () => {
  it('공개 방문은 그대로, 비공개 방문에 이름·주소·좌표가 남아 있으면 privateLeak 로 버린다', () => {
    const rep = emptyTourReport();
    const ok = normalizeTourVisit(visitRow(), rep.visits);
    expect(ok).toMatchObject({ id: 'h_h000001:2305270001', placeId: 'pd804155188', lat: 33.5115169, lng: 126.5200013, typeShort: '식당', dgstfn: 5 });

    const masked = visitRow({ is_private: true, type_cd: '21', type_short: '집', place_id: null, name: null, poi_id: null, poi_nm: null, road_addr: null, lot_addr: null, lon: null, lat: null });
    expect(normalizeTourVisit(masked, rep.visits)).toMatchObject({ isPrivate: true, placeId: null, name: null, lat: null, lng: null });

    const leaked = visitRow({ is_private: true, type_short: '집', place_id: null, poi_id: null, road_addr: null, lot_addr: null, lon: null, lat: null });
    expect(() => normalizeTourVisit(leaked, rep.visits)).toThrow(/비공개 방문에 name/);
  });

  it('좌표가 한국 범위 밖이면 행은 살리고 좌표만 null (badCoord 카운트)', () => {
    const rep = emptyTourReport();
    const row = normalizeTourPlace(placeRow({ lon: 0, lat: 0 }), rep.places);
    expect(row.lat).toBeNull();
    expect(row.lng).toBeNull();
    expect(rep.places.badCoord).toBe(1);
    expect(normalizeTourPlace(placeRow(), rep.places)).toMatchObject({ id: 'pd804155188', nTravelers: 110, bayesScore: 4.43, isJeju: true });
  });

  it('필수 키가 비거나 형이 어긋나면 badId/badField, 알 수 없는 유형은 세기만 한다', () => {
    const rep = emptyTourReport();
    expect(() => normalizeTourPlace(placeRow({ place_id: '' }), rep.places)).toThrow(/place_id 가 비었습니다/);
    expect(() => normalizeTourPlace(placeRow({ n_visits: 'many' }), rep.places)).toThrow(/정수/);
    normalizeTourPlace(placeRow({ type_short: '외계' }), rep.places);
    expect(rep.places.unknownType).toBe(1);
  });

  it('제외하기로 한 열(설문 원문·촬영 좌표)이 섞여 오면 적재하지 않는다', () => {
    const rep = emptyTourReport();
    expect(() => normalizeTourTrip(tripRow({ income_nm: '300만원' }), rep.trips)).toThrow(/제외 열 income_nm/);
    expect(() => normalizeTourPhoto(photoRow({ lon: 126.5, lat: 33.5 }), rep.photos)).toThrow(/제외 열 lon/);
    expect(normalizeTourTrip(tripRow(), rep.trips)).toMatchObject({ id: 'h_h000001', nights: 2, style8: 7, hasGps: true });
    expect(normalizeTourPhoto(photoRow(), rep.photos)).toMatchObject({ id: 'h00000101002p0001', hasThumb: true, source: 'train' });
  });

  it('청크 크기는 열 수 × 행 수가 바인드 예산 아래', () => {
    for (const t of TOUR_TABLES) {
      const size = tourChunkSize(t);
      expect(size).toBeGreaterThanOrEqual(50);
      expect(size).toBeLessThanOrEqual(1000);
    }
    expect(tourChunkSize('visits')).toBeLessThan(tourChunkSize('companions'));
  });
});

// ── 전량 교체·폐기 (격리 DB) ───────────────────────────────────────────────
const gz = (rows: RawRow[]): Buffer => gzipSync(Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8'));

const writeExport = (dir: string, tables: Partial<Record<TourTable, RawRow[]>>, over: Partial<TourManifest> = {}): TourManifest => {
  const meta: TourManifest['tables'] = {};
  for (const t of TOUR_TABLES) {
    const buf = gz(tables[t] ?? []);
    const file = `${t}.jsonl.gz`;
    writeFileSync(join(dir, file), buf);
    meta[t] = { file, rows: (tables[t] ?? []).length, bytes: buf.length, sha256: 'x', columns: [] };
  }
  const manifest: TourManifest = {
    exportVersion: 1,
    format: 'jsonl.gz',
    dataset: 'aihub-71780',
    name: 'lp-test',
    region: 'all',
    built_at: '2026-09-13T15:00:00',
    tables: meta,
    thumbs: null,
    ...over,
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf8');
  return manifest;
};

describe('tour-master replace/unload (isolated db)', () => {
  let isolated: IsolatedDatabase;
  let prisma: PrismaClient;
  let dir: string;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    prisma = new PrismaClient();
    dir = mkdtempSync(join(tmpdir(), 'tour-export-'));
  });

  afterAll(async () => {
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
    isolated.restore();
  });

  it('manifest 계약 위반은 읽기에서 막는다', () => {
    writeExport(dir, {}, { exportVersion: 2 });
    expect(() => readTourManifest(dir)).toThrow(/exportVersion 2/);
    writeExport(dir, {}, { dataset: 'other' });
    expect(() => readTourManifest(dir)).toThrow(/여행로그 export 가 아닙니다/);
  });

  it('전량 교체 → 이력 → 재적재로 갈아엎기 → unload 로 0', async () => {
    const leaked = visitRow({ visit_area_id: '2305270009', is_private: true, type_short: '집', place_id: null, poi_id: null, road_addr: null, lot_addr: null, lon: null, lat: null });
    writeExport(dir, {
      places: [placeRow(), placeRow({ place_id: 'p2', name: '자매국수' })],
      trips: [tripRow()],
      visits: [visitRow(), visitRow({ visit_area_id: '2305270002', place_id: 'p2', name: '자매국수' }), leaked],
      codes: [{ cd_a: 'VIS', group_nm: '방문지 유형', cd_b: '11', cd_nm: '식당/카페', order_num: 11, del_flag: 'N' }],
    });
    const manifest = readTourManifest(dir);

    const dry = await replaceTourTables(prisma, dir, manifest, { dryRun: true });
    expect(dry.report.visits).toMatchObject({ rows: 3, kept: 2, dropped: { privateLeak: 1 } });
    expect(await prisma.tourPlace.count()).toBe(0);

    const first = await replaceTourTables(prisma, dir, manifest);
    expect(first.inserted).toMatchObject({ places: 2, trips: 1, visits: 2, codes: 1, photos: 0 });
    let status = await getTourLoadStatus(prisma);
    expect(status).toMatchObject({ loaded: true, places: 2, baseDate: '2026-09-13', sourceFile: expect.stringContaining('#v1') });
    expect(status.counts.visits).toBe(2);

    // 재적재는 이전 행을 남기지 않는다.
    writeExport(dir, { places: [placeRow()], trips: [tripRow()], visits: [visitRow()] });
    await replaceTourTables(prisma, dir, readTourManifest(dir));
    status = await getTourLoadStatus(prisma);
    expect(status.counts).toMatchObject({ places: 1, visits: 1, codes: 0 });

    await unloadTourTables(prisma);
    status = await getTourLoadStatus(prisma);
    expect(status.loaded).toBe(false);
    expect(Object.values(status.counts).every((n) => n === 0)).toBe(true);
    const last = await prisma.lifeMasterSync.findFirst({ where: { layer: 'tour' }, orderBy: { loadedAt: 'desc' } });
    expect(last).toMatchObject({ count: 0, sourceFile: 'unload' });
  });
});
