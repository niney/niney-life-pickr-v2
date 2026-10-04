import { describe, expect, it, vi } from 'vitest';
import type Feature from 'ol/Feature';
import type Point from 'ol/geom/Point';
import { toLonLat } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import type { MapMarker } from './MapCanvas';
import { MARKER_PROP, syncMarkerFeatures } from './mapMarkerSync';

// MapCanvas 의 마커 동기화 — 배열 참조가 바뀌어도 내용이 같으면 feature 를 다시 만들지 않고,
// 달라진 것만 추가·제거·다시 칠하는지 본다(예전엔 매번 clear 후 전량 재생성).

const marker = (id: string, over: Partial<MapMarker> = {}): MapMarker => ({
  id,
  lat: 37.5 + Number(id) * 0.001,
  lng: 127 + Number(id) * 0.001,
  ...over,
});

const setup = (initial: MapMarker[]) => {
  const src = new VectorSource();
  const byId = new Map<string, Feature>();
  syncMarkerFeatures(src, byId, initial);
  return { src, byId };
};

describe('syncMarkerFeatures', () => {
  it('첫 채움 — 마커마다 feature 를 만들고 markerId·마커 데이터를 싣는다', () => {
    const { src, byId } = setup([marker('1'), marker('2', { label: '둘' })]);
    expect(src.getFeatures()).toHaveLength(2);
    expect([...byId.keys()]).toEqual(['1', '2']);
    const f = byId.get('2')!;
    expect(f.get('markerId')).toBe('2');
    expect((f.get(MARKER_PROP) as MapMarker).label).toBe('둘');
    const [lng, lat] = toLonLat((f.getGeometry() as Point).getCoordinates());
    expect(lng).toBeCloseTo(127.002, 6);
    expect(lat).toBeCloseTo(37.502, 6);
  });

  it('내용이 같은 새 배열 — feature 를 그대로 두고 소스를 건드리지 않는다', () => {
    const { src, byId } = setup([marker('1'), marker('2')]);
    const before = [byId.get('1'), byId.get('2')];
    const onChange = vi.fn();
    src.on('change', onChange);
    const clear = vi.spyOn(src, 'clear');
    const add = vi.spyOn(src, 'addFeatures');
    const remove = vi.spyOn(src, 'removeFeatures');

    syncMarkerFeatures(src, byId, [marker('1'), marker('2')]);

    expect([byId.get('1'), byId.get('2')]).toEqual(before);
    expect(byId.get('1')).toBe(before[0]);
    expect(clear).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('일부만 겹칠 때 — 사라진 것만 제거하고 새 것만 추가한다', () => {
    const { src, byId } = setup([marker('1'), marker('2'), marker('3')]);
    const kept = byId.get('2');
    const removed = byId.get('1');

    syncMarkerFeatures(src, byId, [marker('2'), marker('3'), marker('4')]);

    expect([...byId.keys()].sort()).toEqual(['2', '3', '4']);
    expect(byId.get('2')).toBe(kept);
    expect(src.getFeatures()).toHaveLength(3);
    expect(src.getFeatures()).not.toContain(removed);
  });

  it('겉모습(라벨·아이콘)이 바뀐 feature 만 다시 칠한다', () => {
    const { src, byId } = setup([marker('1'), marker('2')]);
    const changed1 = vi.fn();
    const changed2 = vi.fn();
    byId.get('1')!.on('change', changed1);
    byId.get('2')!.on('change', changed2);

    syncMarkerFeatures(src, byId, [marker('1', { label: '하나' }), marker('2')]);

    expect(changed1).toHaveBeenCalledTimes(1);
    expect(changed2).not.toHaveBeenCalled();
    expect((byId.get('1')!.get(MARKER_PROP) as MapMarker).label).toBe('하나');
  });

  it('좌표가 바뀌면 같은 feature 의 위치만 옮긴다', () => {
    const { src, byId } = setup([marker('1')]);
    const f = byId.get('1')!;

    syncMarkerFeatures(src, byId, [marker('1', { lat: 35.1, lng: 129.0 })]);

    expect(byId.get('1')).toBe(f);
    const [lng, lat] = toLonLat((f.getGeometry() as Point).getCoordinates());
    expect(lng).toBeCloseTo(129.0, 6);
    expect(lat).toBeCloseTo(35.1, 6);
    expect(src.getFeatures()).toHaveLength(1);
  });

  it('겹치는 id 가 없으면 통째로 교체한다', () => {
    const { src, byId } = setup([marker('1'), marker('2')]);
    const clear = vi.spyOn(src, 'clear');

    syncMarkerFeatures(src, byId, [marker('3'), marker('4')]);

    expect(clear).toHaveBeenCalledWith(true);
    expect([...byId.keys()]).toEqual(['3', '4']);
    expect(src.getFeatures()).toHaveLength(2);
  });

  it('빈 배열이면 전부 비운다', () => {
    const { src, byId } = setup([marker('1'), marker('2')]);
    syncMarkerFeatures(src, byId, []);
    expect(byId.size).toBe(0);
    expect(src.getFeatures()).toHaveLength(0);
  });

  it('같은 id 가 두 번 오면 마지막 것 하나만 남긴다', () => {
    const { src, byId } = setup([marker('1', { label: '앞' }), marker('1', { label: '뒤' })]);
    expect(src.getFeatures()).toHaveLength(1);
    expect((byId.get('1')!.get(MARKER_PROP) as MapMarker).label).toBe('뒤');
  });
});
