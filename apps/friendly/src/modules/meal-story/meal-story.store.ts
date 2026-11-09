import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Routes } from '@repo/api-contract';
import { resolveMealStory, type ResolvedMealStory } from './meal-story.resolve.js';
import { MealStoryFoodsFile, MealStoryScript, type MealStoryScriptType } from './meal-story.script.js';

// 건강식단 스토리 파일 읽기 — content/meal-stories/<slug>/{story.json, foods.json, images/*}. 배포(git pull)로 올라온다.
// 파일이 바뀐 것만 다시 읽는다(story·foods·사진의 수정 시각을 키로) — 몇 초에 한 번만 살핀다. 형식이 틀린 원고는 건너뛰고
// 로그에 남긴다(다른 스토리는 그대로 보인다).

export const MEAL_STORY_FILE = 'story.json';
export const MEAL_STORY_FOODS_FILE = 'foods.json';
export const MEAL_STORY_IMAGE_DIR = 'images';

export const mealStoryDir = (): string =>
  process.env.MEAL_STORY_DIR ?? join(process.cwd(), 'content', 'meal-stories');

export interface LoadedMealStory extends ResolvedMealStory {
  script: MealStoryScriptType;
  dir: string;
}

interface CacheEntry {
  key: string;
  loaded: LoadedMealStory | null;
  error: string | null;
}

const mtimeOf = async (path: string): Promise<number | null> => {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
};

const imageVersions = async (dir: string): Promise<Map<string, number>> => {
  const out = new Map<string, number>();
  let names: string[];
  try {
    names = await readdir(join(dir, MEAL_STORY_IMAGE_DIR));
  } catch {
    return out;
  }
  for (const name of names) {
    const m = await mtimeOf(join(dir, MEAL_STORY_IMAGE_DIR, name));
    if (m !== null) out.set(name, Math.floor(m));
  }
  return out;
};

/** 원고 한 편을 읽어 푼다 — 형식 오류는 throw(메시지에 경로). 점검 스크립트도 같은 함수를 쓴다. */
export const loadMealStoryDir = async (dir: string): Promise<LoadedMealStory> => {
  const raw = JSON.parse(await readFile(join(dir, MEAL_STORY_FILE), 'utf8')) as unknown;
  const parsed = MealStoryScript.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(전체)'}: ${i.message}`)
      .join(' / ');
    throw new Error(`story.json 형식 오류 — ${first}`);
  }
  const script = parsed.data;
  let foodsFile = null;
  try {
    const foodsRaw = JSON.parse(await readFile(join(dir, MEAL_STORY_FOODS_FILE), 'utf8')) as unknown;
    const f = MealStoryFoodsFile.safeParse(foodsRaw);
    if (!f.success) throw new Error(`foods.json 형식 오류 — ${f.error.issues[0]?.path.join('.')}: ${f.error.issues[0]?.message}`);
    foodsFile = f.data;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const versions = await imageVersions(dir);
  const resolved = resolveMealStory(script, foodsFile, (file) => {
    const v = versions.get(file);
    return v === undefined ? null : `${Routes.MealStory.image(script.slug, file)}?v=${v}`;
  });
  return { ...resolved, script, dir };
};

export class MealStoryStore {
  private readonly cache = new Map<string, CacheEntry>();
  private scannedAt = 0;
  private slugs: string[] = [];

  constructor(
    private readonly opts: {
      dir?: string;
      /** 파일을 다시 살피는 간격(ms). 테스트는 0. */
      recheckMs?: number;
      logger?: { warn: (obj: object, msg: string) => void };
    } = {},
  ) {}

  get dir(): string {
    return this.opts.dir ?? mealStoryDir();
  }

  private async refresh(): Promise<void> {
    const now = Date.now();
    if (now - this.scannedAt < (this.opts.recheckMs ?? 5_000) && this.scannedAt > 0) return;
    this.scannedAt = now;
    let entries: string[];
    try {
      entries = (await readdir(this.dir, { withFileTypes: true }))
        .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
        .map((d) => d.name);
    } catch {
      entries = [];
    }
    const seen: string[] = [];
    for (const slug of entries) {
      const dir = join(this.dir, slug);
      const storyM = await mtimeOf(join(dir, MEAL_STORY_FILE));
      if (storyM === null) continue;
      const foodsM = await mtimeOf(join(dir, MEAL_STORY_FOODS_FILE));
      const versions = await imageVersions(dir);
      const key = [storyM, foodsM ?? 0, ...[...versions].map(([n, v]) => `${n}:${v}`)].join('|');
      seen.push(slug);
      if (this.cache.get(slug)?.key === key) continue;
      try {
        const loaded = await loadMealStoryDir(dir);
        if (loaded.script.slug !== slug) throw new Error(`slug(${loaded.script.slug})가 폴더 이름(${slug})과 다르다`);
        if (loaded.issues.length > 0) this.opts.logger?.warn({ slug, issues: loaded.issues }, '[meal-story] 풀리지 않은 가리킴');
        this.cache.set(slug, { key, loaded, error: null });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        this.opts.logger?.warn({ slug, error }, '[meal-story] 원고를 읽지 못함 — 건너뜀');
        this.cache.set(slug, { key, loaded: null, error });
      }
    }
    for (const slug of [...this.cache.keys()]) if (!seen.includes(slug)) this.cache.delete(slug);
    this.slugs = seen;
  }

  /** 보이는 스토리 — 게시한 것(관리자는 초안도), 게시일 최근 순. */
  async list(opts: { includeDrafts: boolean }): Promise<LoadedMealStory[]> {
    await this.refresh();
    return this.slugs
      .map((s) => this.cache.get(s)?.loaded ?? null)
      .filter((s): s is LoadedMealStory => s !== null && (opts.includeDrafts || s.script.status === 'published'))
      .sort((a, b) => b.script.publishedAt.localeCompare(a.script.publishedAt) || a.script.slug.localeCompare(b.script.slug));
  }

  async get(slug: string, opts: { includeDrafts: boolean }): Promise<LoadedMealStory | null> {
    await this.refresh();
    const s = this.cache.get(slug)?.loaded ?? null;
    if (!s) return null;
    return opts.includeDrafts || s.script.status === 'published' ? s : null;
  }

  /** 사진 파일 경로 — 그 스토리 폴더가 있을 때만(초안 사진도 준다: <img> 는 인증을 못 싣는다). */
  async imagePath(slug: string, file: string): Promise<string | null> {
    await this.refresh();
    if (!this.cache.get(slug)?.loaded) return null;
    const path = join(this.dir, slug, MEAL_STORY_IMAGE_DIR, file);
    return (await mtimeOf(path)) === null ? null : path;
  }
}
