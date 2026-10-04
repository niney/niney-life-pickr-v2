/**
 * 식단 도메인의 사용자별 쓰기를 직렬화한다.
 *
 * 라우트마다 서비스 인스턴스가 따로 만들어져도 같은 모듈 싱글턴을 공유해야 전체 삭제와
 * 기록·선호·추천·사진 쓰기가 한 FIFO에 놓인다. 꼬리 Promise는 항상 resolve되고 마지막
 * 작업이 끝나면 identity 확인 후 Map에서 제거하므로 실패한 작업이나 일회성 사용자 키가
 * 메모리에 남지 않는다.
 */
export class MealMutationBarrier {
  private readonly tails = new Map<string, Promise<void>>();

  async runExclusive<T>(userId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.tails.set(userId, tail);

    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.tails.get(userId) === tail) this.tails.delete(userId);
    }
  }

  /**
   * 함수 경계를 넘어 잡아 두는 잠금 — 응답 스트림처럼 작업이 끝나는 시점이 이벤트로 오는 경우용.
   * 돌려준 release 는 여러 번 불러도 한 번만 푼다. 같은 FIFO 를 쓰므로 runExclusive 와 순서가 섞이지 않는다.
   */
  async acquire(userId: string): Promise<() => void> {
    let unlock!: () => void;
    const held = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    let acquired!: () => void;
    const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    void this.runExclusive(userId, async () => {
      acquired();
      await held;
    });
    await ready;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      unlock();
    };
  }

  /** 테스트와 운영 진단에서 꼬리 키가 정리됐는지만 확인한다. */
  pendingUserCount(): number {
    return this.tails.size;
  }
}

export const mealMutationBarrier = new MealMutationBarrier();

/**
 * 사용자 데이터 세대 — 장벽 밖에서 오래 걸리는 계산(날씨·LLM)이 끝난 뒤 저장해도 되는지 판단한다.
 * 전체 삭제·추천 전체 삭제가 장벽 안에서 번호를 올리고, 계산 전에 읽은 번호가 저장 시점(장벽 안)에
 * 바뀌었으면 결과를 버린다. 그래야 삭제 응답 뒤에 지운 기록으로 만든 추천·조언이 다시 생기지 않는다.
 * 단일 인스턴스 서버라 메모리 Map 으로 충분하다(삭제를 한 번이라도 한 사용자만 키가 생긴다).
 */
export type MealDataScope = 'all' | 'recommendations';

export class MealDataGeneration {
  private readonly all = new Map<string, number>();
  private readonly recommendations = new Map<string, number>();

  /** 전체 삭제는 추천도 지우므로 추천 세대는 두 번호의 합이다. */
  read(userId: string, scope: MealDataScope): number {
    const all = this.all.get(userId) ?? 0;
    return scope === 'all' ? all : all + (this.recommendations.get(userId) ?? 0);
  }

  /** 반드시 해당 사용자의 장벽 안에서 부른다. */
  bump(userId: string, scope: MealDataScope): void {
    const map = scope === 'all' ? this.all : this.recommendations;
    map.set(userId, (map.get(userId) ?? 0) + 1);
  }
}

export const mealDataGeneration = new MealDataGeneration();
