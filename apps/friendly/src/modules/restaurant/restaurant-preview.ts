import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Routes } from '@repo/api-contract';
import { env } from '../../config/env.js';
import { RestaurantService, type RestaurantPublicSeoMeta } from './restaurant.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function candidateIndexPaths(): string[] {
  if (env.WEB_INDEX_PATH) return [resolve(env.WEB_INDEX_PATH)];
  const seen = new Set<string>();
  for (const base of [__dirname, process.cwd()]) {
    let cur = base;
    for (let i = 0; i < 7; i += 1) {
      seen.add(resolve(cur, 'apps/web/dist/index.html'));
      seen.add(resolve(cur, 'web/dist/index.html'));
      const up = dirname(cur);
      if (up === cur) break;
      cur = up;
    }
  }
  return [...seen];
}

let cachedIndex: string | null = null;
async function loadIndex(): Promise<{ html: string } | { tried: string[] }> {
  if (cachedIndex) return { html: cachedIndex };
  const tried = candidateIndexPaths();
  for (const p of tried) {
    try {
      cachedIndex = await readFile(p, 'utf8');
      return { html: cachedIndex };
    } catch {
      // try next candidate
    }
  }
  return { tried };
}

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]!);
}

function escapeJsonLd(s: string): string {
  return s.replace(/</g, '\\u003c');
}

function formatCount(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

interface RestaurantOgMeta {
  title: string;
  description: string;
  url: string;
  image: string;
  canonicalUrl: string;
  jsonLd?: string;
  bodyHtml?: string;
  noindex?: boolean;
}

function buildMetaTags(og: RestaurantOgMeta): string {
  const title = escapeHtml(og.title);
  const description = escapeHtml(og.description);
  const url = escapeHtml(og.url);
  const image = escapeHtml(og.image);
  const canonicalUrl = escapeHtml(og.canonicalUrl);
  const tags = [
    `<link rel="canonical" href="${canonicalUrl}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="ko_KR" />`,
    `<meta property="og:site_name" content="Life Pickr" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta name="description" content="${description}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ];
  if (og.noindex) tags.push('<meta name="robots" content="noindex" />');
  if (og.jsonLd) tags.push(`<script type="application/ld+json">${og.jsonLd}</script>`);
  return tags.join('\n    ');
}

function injectOg(html: string, og: RestaurantOgMeta): string {
  const withTitle = html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtml(og.title)}</title>`,
  );
  const withHead = withTitle.replace('</head>', `    ${buildMetaTags(og)}\n  </head>`);
  if (!og.bodyHtml) return withHead;
  return withHead.replace(/<body([^>]*)>/, `<body$1>\n    ${og.bodyHtml}`);
}

function absoluteUrl(origin: string, pathOrUrl: string): string {
  return pathOrUrl.startsWith('http') ? pathOrUrl : `${origin}${pathOrUrl}`;
}

function thumbnailUrl(origin: string, imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  const params = new URLSearchParams({ url: imageUrl, w: '1200', q: '80' });
  return `${origin}${Routes.Media.thumbnail}?${params.toString()}`;
}

function getPublicOrigin(req: FastifyRequest): string {
  if (env.PUBLIC_ORIGIN) return env.PUBLIC_ORIGIN.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
  const host = req.headers.host ?? 'ninelife.kr';
  return `${proto}://${host}`;
}

function buildDescription(meta: RestaurantPublicSeoMeta): string {
  const bits = [meta.category, meta.roadAddress ?? meta.address].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  if (meta.rating !== null) bits.push(`평점 ${meta.rating.toFixed(1)}`);
  if (meta.reviewCount !== null) bits.push(`리뷰 ${formatCount(meta.reviewCount)}`);
  const prefix = bits.length > 0 ? `${bits.join(' · ')}. ` : '';
  return `${prefix}Life Pickr에서 메뉴, 사진, AI 리뷰 분석을 확인해보세요.`;
}

function buildJsonLd(meta: RestaurantPublicSeoMeta, url: string, image: string): string {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: meta.name,
    url,
    image,
    sameAs: [meta.rawSourceUrl],
  };
  if (meta.category) data.servesCuisine = meta.category;
  if (meta.phone) data.telephone = meta.phone;
  if (meta.businessHours) data.description = meta.businessHours;
  const streetAddress = meta.roadAddress ?? meta.address;
  if (streetAddress) {
    data.address = {
      '@type': 'PostalAddress',
      streetAddress,
      addressCountry: 'KR',
    };
  }
  if (meta.latitude !== null && meta.longitude !== null) {
    data.geo = {
      '@type': 'GeoCoordinates',
      latitude: meta.latitude,
      longitude: meta.longitude,
    };
  }
  if (meta.rating !== null && meta.reviewCount !== null && meta.reviewCount > 0) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: meta.rating.toFixed(1),
      reviewCount: meta.reviewCount,
    };
  }
  return escapeJsonLd(JSON.stringify(data));
}

function buildSeoBody(meta: RestaurantPublicSeoMeta, image: string): string {
  const address = meta.roadAddress ?? meta.address;
  const facts = [
    meta.category,
    address,
    meta.rating !== null ? `평점 ${meta.rating.toFixed(1)}` : null,
    meta.reviewCount !== null ? `리뷰 ${formatCount(meta.reviewCount)}` : null,
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);
  const menuItems = meta.menus
    .slice(0, 12)
    .map(
      (menu) =>
        `<li>${escapeHtml(menu.name)}${menu.price ? ` <span>${escapeHtml(menu.price)}</span>` : ''}</li>`,
    );
  return [
    '<noscript>',
    '<main class="seo-restaurant">',
    `<article itemscope itemtype="https://schema.org/Restaurant">`,
    `<h1 itemprop="name">${escapeHtml(meta.name)}</h1>`,
    `<p>${escapeHtml(buildDescription(meta))}</p>`,
    `<img src="${escapeHtml(image)}" alt="${escapeHtml(meta.name)} 대표 사진" itemprop="image" />`,
    facts.length > 0 ? `<p>${facts.map(escapeHtml).join(' · ')}</p>` : '',
    meta.phone ? `<p>전화: <span itemprop="telephone">${escapeHtml(meta.phone)}</span></p>` : '',
    meta.businessHours ? `<p>영업 정보: ${escapeHtml(meta.businessHours)}</p>` : '',
    menuItems.length > 0
      ? `<section><h2>대표 메뉴</h2><ul>${menuItems.join('')}</ul></section>`
      : '',
    '</article>',
    '</main>',
    '</noscript>',
  ]
    .filter(Boolean)
    .join('\n    ');
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]!);
}

export async function registerRestaurantPreview(app: FastifyInstance): Promise<void> {
  const service = new RestaurantService(app.prisma);

  const handler = async (
    req: FastifyRequest<{ Params: { placeId: string } }>,
    reply: FastifyReply,
  ) => {
    const loaded = await loadIndex();
    if (!('html' in loaded)) {
      app.log.error(
        { triedPaths: loaded.tried, cwd: process.cwd() },
        'restaurant-preview: index.html 을 찾지 못함 — WEB_INDEX_PATH 로 명시 지정 권장',
      );
      return reply.code(500).type('text/plain; charset=utf-8').send('preview unavailable');
    }

    const { placeId } = req.params;
    const origin = getPublicOrigin(req);
    const canonicalUrl = `${origin}/r/${encodeURIComponent(placeId)}`;
    const fallbackImage = absoluteUrl(origin, env.OG_IMAGE_PATH);

    const meta = await service.getPublicSeoMeta(placeId);
    if (!meta) {
      return reply
        .code(404)
        .type('text/html; charset=utf-8')
        .header('cache-control', 'no-cache')
        .send(
          injectOg(loaded.html, {
            title: 'Life Pickr 맛집',
            description: 'Life Pickr에서 맛집 정보를 확인해보세요.',
            url: canonicalUrl,
            canonicalUrl,
            image: fallbackImage,
            noindex: true,
          }),
        );
    }

    const image = thumbnailUrl(origin, meta.imageUrls[0] ?? null) ?? fallbackImage;
    const og = {
      title: `${meta.name} - Life Pickr`,
      description: buildDescription(meta),
      url: canonicalUrl,
      canonicalUrl,
      image,
      jsonLd: buildJsonLd(meta, canonicalUrl, image),
      bodyHtml: buildSeoBody(meta, image),
    };

    return reply
      .code(200)
      .type('text/html; charset=utf-8')
      .header('cache-control', 'public, max-age=300')
      .send(injectOg(loaded.html, og));
  };

  const sitemapHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const origin = getPublicOrigin(req);
    const entries = await service.getPublicSitemapEntries();
    const urls = entries.map((entry) =>
      [
        '  <url>',
        `    <loc>${escapeXml(`${origin}/r/${encodeURIComponent(entry.placeId)}`)}</loc>`,
        `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`,
        '    <changefreq>weekly</changefreq>',
        '    <priority>0.8</priority>',
        '  </url>',
      ].join('\n'),
    );
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls,
      '</urlset>',
    ].join('\n');
    return reply
      .code(200)
      .type('application/xml; charset=utf-8')
      .header('cache-control', 'public, max-age=3600')
      .send(xml);
  };

  const robotsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const origin = getPublicOrigin(req);
    return reply
      .code(200)
      .type('text/plain; charset=utf-8')
      .header('cache-control', 'public, max-age=3600')
      .send(
        [
          'User-agent: *',
          'Allow: /',
          'Disallow: /admin/',
          'Disallow: /api/',
          'Disallow: /me/',
          'Disallow: /login',
          `Sitemap: ${origin}/sitemap.xml`,
          '',
        ].join('\n'),
      );
  };

  app.get('/r/:placeId', handler);
  app.get('/sitemap.xml', sitemapHandler);
  app.get('/robots.txt', robotsHandler);
}
