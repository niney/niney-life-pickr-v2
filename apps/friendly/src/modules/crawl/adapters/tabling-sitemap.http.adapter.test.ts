import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTablingSitemap } from './tabling-sitemap.http.adapter.js';

// 사이트맵은 검색 API 가 없는 테이블링의 전수 발견 백본 — shop/place 별로 다른
// 정규식으로 id 를 추출한다.

const fetchedUrls: string[] = [];

const stubXml = (xml: string): void => {
  fetchedUrls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      fetchedUrls.push(String(input));
      return {
        ok: true,
        status: 200,
        text: async () => xml,
        json: async () => ({}),
        headers: { get: () => 'application/xml' },
      } as unknown as Response;
    }),
  );
};

afterEach(() => vi.unstubAllGlobals());

describe('fetchTablingSitemap', () => {
  it('extracts numeric idx from the shop sitemap', async () => {
    stubXml(
      `<?xml version="1.0"?><urlset>
        <url><loc>https://www.tabling.co.kr/restaurant/27</loc></url>
        <url><loc>https://www.tabling.co.kr/restaurant/136</loc></url>
        <url><loc>https://www.tabling.co.kr/restaurant/27</loc></url>
      </urlset>`,
    );
    const r = await fetchTablingSitemap('shop');
    expect(fetchedUrls[0]).toContain('/sitemap-shop.xml');
    // 중복 제거됨.
    expect(r.ids).toEqual(['27', '136']);
    expect(r.total).toBe(2);
  });

  it('extracts 24-hex objectIds from a place sitemap page', async () => {
    stubXml(
      `<urlset>
        <url><loc>https://www.tabling.co.kr/place/6762812966de5f0698ee08c3</loc></url>
        <url><loc>https://www.tabling.co.kr/place/677ccf2666de5f069883f089</loc></url>
      </urlset>`,
    );
    const r = await fetchTablingSitemap('place', 2);
    expect(fetchedUrls[0]).toContain('/sitemap-place-2.xml');
    expect(r.ids).toEqual([
      '6762812966de5f0698ee08c3',
      '677ccf2666de5f069883f089',
    ]);
  });

  it('clamps place page to 1..5', async () => {
    stubXml('<urlset></urlset>');
    await fetchTablingSitemap('place', 99);
    expect(fetchedUrls[0]).toContain('/sitemap-place-5.xml');
  });
});
