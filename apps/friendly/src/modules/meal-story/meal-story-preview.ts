import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { defaultOgImage, getPublicOrigin, injectOg, loadWebIndex, type OgMeta } from '../../lib/web-index.js';
import { RATE } from '../../plugins/rate-limit.js';
import { mealStoryStore } from './meal-story.instance.js';

// 건강식단 스토리 공유 링크(/meal/stories[/:slug[/recipe]])의 SNS 미리보기(OG) — 봇은 head 메타만 읽고, 사람은 같은
// HTML 위에서 SPA 가 부팅된다(타로 공유와 같은 방식). `.route.ts` 가 아니라 autoload 대상이 아니어서 app.ts 에서 등록한다.
// 운영(nginx): `location ^~ /meal/stories` 를 friendly 로 넘겨야 미리보기가 산다(없어도 화면은 정적 index.html 로 뜬다).
// 초안·없는 스토리는 기본 미리보기 — 초안 제목이 링크로 새지 않게.

const LIST_OG = {
  title: 'Life Pickr 건강식단',
  description: '주제 하나를 장면으로 넘겨 보는 건강한 한 끼 이야기 — 줄이는 법, 만들어 먹는 레시피, 바꿔 먹기',
};

export async function registerMealStoryPreview(app: FastifyInstance): Promise<void> {
  const store = mealStoryStore(app.log);

  const handler = async (req: FastifyRequest<{ Params: { slug?: string } }>, reply: FastifyReply) => {
    const loaded = await loadWebIndex();
    if (!('html' in loaded)) {
      app.log.error({ triedPaths: loaded.tried, cwd: process.cwd() }, 'meal-story-preview: index.html 을 찾지 못함');
      return reply.code(500).type('text/plain; charset=utf-8').send('preview unavailable');
    }
    const origin = getPublicOrigin(req);
    const slug = req.params.slug;
    const story = slug ? await store.get(slug, { includeDrafts: false }) : null;
    const og: OgMeta = story
      ? {
          title: `건강식단 · ${story.script.title}`,
          description: story.script.summary,
          url: `${origin}/meal/stories/${slug}`,
          image: story.story.coverUrl ? `${origin}${story.story.coverUrl}` : defaultOgImage(origin),
        }
      : { ...LIST_OG, url: `${origin}/meal/stories`, image: defaultOgImage(origin) };
    return reply
      .code(200)
      .type('text/html; charset=utf-8')
      .header('cache-control', 'public, max-age=60')
      .send(injectOg(loaded.html, og));
  };

  const opts = { config: { rateLimit: RATE.mealStoryRead } };
  app.get('/meal/stories', opts, handler);
  app.get('/meal/stories/:slug', opts, handler);
  app.get('/meal/stories/:slug/recipe', opts, handler);
}
