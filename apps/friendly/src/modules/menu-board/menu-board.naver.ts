import type { NaverMenuBoardImageType, NaverMenuBoardReadType } from '@repo/api-contract';
import { MENU_BOARD_PROMPT_VERSION } from './menu-board.prompt.js';
import type { RestaurantService } from '../restaurant/restaurant.service.js';
import { MenuBoardError, type MenuBoardService } from './menu-board.service.js';

// 네이버 맛집 메뉴판 사진 자동 읽기 — 크롤 직후(백그라운드)와 read:naver-menu-boards 스크립트가 부른다.
// 스냅샷의 menuBoardImages 중 아직 안 읽었거나 옛 프롬프트로 읽은 사진만 메뉴판 읽기(purpose menu-board)로 읽어
// 결과를 붙이고, 저장 때 등록 메뉴와의 짝(menuBoardMenus, 구분값 origin)이 다시 계산된다. 같은 주소·같은 프롬프트
// 버전의 사진은 재크롤 때 다시 읽지 않는다.

// 다시 읽어야 하는 사진 — 안 읽었거나 지금보다 낮은 프롬프트 버전(없으면 1)으로 읽은 것.
export const needsMenuBoardRead = (image: NaverMenuBoardImageType): boolean =>
  !image.read || (image.read.promptVersion ?? 1) < MENU_BOARD_PROMPT_VERSION;

// 가게당 한 번에 읽는 사진 상한 — 로컬 네이버 23곳은 1~10장(평균 3.2장). 넘는 사진은 다음 크롤에서 이어 읽는다.
export const NAVER_MENU_BOARD_MAX_READS = 12;
const FETCH_TIMEOUT_MS = 20_000;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

export interface NaverMenuBoardReadSummary {
  total: number; // 스냅샷의 메뉴판 사진 수
  alreadyRead: number; // 지금 프롬프트 버전으로 이미 읽은 장수
  read: number; // 이번에 읽어 붙인 장수
  failed: { url: string; error: string }[];
  added: number; // 저장 뒤 '사진에만 있는 메뉴'(origin=menu-board) 수
  // 메뉴판 읽기 모델·키가 없어 읽기를 멈췄다(남은 사진은 다음 크롤에서).
  noProvider: boolean;
}

const fetchImage = async (url: string): Promise<Buffer> => {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`사진 HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
};

export class NaverMenuBoardReader {
  constructor(
    private readonly restaurants: Pick<
      RestaurantService,
      'findNaverMenuBoardState' | 'saveNaverMenuBoardReads'
    >,
    private readonly menuBoards: Pick<MenuBoardService, 'read'>,
    private readonly deps: { fetchImage?: (url: string) => Promise<Buffer>; maxReads?: number } = {},
  ) {}

  // 아직 안 읽은 메뉴판 사진 수(이번에 읽을 상한 적용 전). 사진 목록을 모르면 0.
  async pendingCount(placeId: string): Promise<number> {
    const state = await this.restaurants.findNaverMenuBoardState(placeId);
    return (state?.menuBoardImages ?? []).filter(needsMenuBoardRead).length;
  }

  // 사진 목록을 모르는(크롤 전·수집 전) 가게는 null. 사진이 없거나 다 읽었으면 모델을 부르지 않는다.
  async readPending(placeId: string): Promise<NaverMenuBoardReadSummary | null> {
    const state = await this.restaurants.findNaverMenuBoardState(placeId);
    if (!state || !Array.isArray(state.menuBoardImages)) return null;
    const pending = state.menuBoardImages
      .filter(needsMenuBoardRead)
      .slice(0, this.deps.maxReads ?? NAVER_MENU_BOARD_MAX_READS);
    const reads = new Map<string, NaverMenuBoardReadType>();
    const failed: NaverMenuBoardReadSummary['failed'] = [];
    let noProvider = false;
    for (const image of pending) {
      try {
        const buffer = await (this.deps.fetchImage ?? fetchImage)(image.url);
        const result = await this.menuBoards.read(buffer);
        reads.set(image.url, {
          items: result.items,
          model: result.model,
          readAt: new Date().toISOString(),
          promptVersion: MENU_BOARD_PROMPT_VERSION,
        });
      } catch (e) {
        if (e instanceof MenuBoardError && e.code === 'no_provider') {
          noProvider = true; // 설정이 없으면 다른 사진도 같은 결과 — 바로 멈춘다
          break;
        }
        failed.push({ url: image.url, error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
      }
    }
    const saved =
      reads.size > 0
        ? await this.restaurants.saveNaverMenuBoardReads(placeId, reads)
        : { attached: 0, menuBoardMenus: state.menuBoardMenus ?? [] };
    return {
      total: state.menuBoardImages.length,
      alreadyRead: state.menuBoardImages.filter((i) => !needsMenuBoardRead(i)).length,
      read: saved.attached,
      failed,
      added: saved.menuBoardMenus.filter((m) => m.origin === 'menu-board').length,
      noProvider,
    };
  }
}
