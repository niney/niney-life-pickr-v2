import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTablingPlace } from './tabling-place.http.adapter.js';

// place 페이지는 모바일 API 가 없고 JSON-LD 가 RSC flight(__next_f) 안에 이중
// 인코딩돼 있다. 가장 취약한 경로라 픽스처로 디코드를 고정한다.

const OID = '6762812966de5f0698ee08c3';

const LD = {
  '@context': 'https://schema.org',
  '@type': 'FoodEstablishment',
  name: '우진 해장국',
  address: { '@type': 'PostalAddress', streetAddress: '제주 제주시 서사로 11' },
  geo: { '@type': 'GeoCoordinates', latitude: 33.5115, longitude: 126.52 },
  aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.4', reviewCount: 260 },
  servesCuisine: ['한식', '해장국'],
  image: ['https://image.tabling.co.kr/prod/x.jpg'],
};

const stubText = (text: string, status = 200): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
      json: async () => ({}),
      headers: { get: () => 'text/html' },
    })) as unknown as typeof fetch,
  );
};

afterEach(() => vi.unstubAllGlobals());

describe('fetchTablingPlace', () => {
  it('decodes JSON-LD double-encoded in __next_f flight payload', async () => {
    // 내부 JSON-LD 가 prop 의 stringified 값으로 박히고, 다시 flight 청크로 감싸짐.
    const inner = JSON.stringify(LD);
    const flight = `2:[{"foo":"bar","jsonLd":${JSON.stringify(inner)}}]`;
    const html = `<!doctype html><body><script>self.__next_f.push([1,${JSON.stringify(
      flight,
    )}])</script></body>`;
    stubText(html);

    const p = await fetchTablingPlace(OID);

    expect(p.objectId).toBe(OID);
    expect(p.name).toBe('우진 해장국');
    expect(p.lat).toBeCloseTo(33.5115);
    expect(p.lng).toBeCloseTo(126.52);
    expect(p.address).toBe('제주 제주시 서사로 11');
    expect(p.rating).toBeCloseTo(4.4);
    expect(p.reviewCount).toBe(260);
    expect(p.cuisines).toEqual(['한식', '해장국']);
    expect(p.images).toEqual(['https://image.tabling.co.kr/prod/x.jpg']);
    expect(p.source).toBe('jsonld');
    expect(p.rawSourceUrl).toContain(OID);
  });

  it('falls back to a real <script type="application/ld+json"> tag', async () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(
      LD,
    )}</script></head></html>`;
    stubText(html);
    const p = await fetchTablingPlace(OID);
    expect(p.name).toBe('우진 해장국');
    expect(p.lat).toBeCloseTo(33.5115);
  });

  it('throws when JSON-LD is absent', async () => {
    stubText('<html><body>no structured data</body></html>');
    await expect(fetchTablingPlace(OID)).rejects.toThrow();
  });

  it('rejects an invalid objectId before fetching', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy as unknown as typeof fetch);
    await expect(fetchTablingPlace('not-an-objectid')).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});
