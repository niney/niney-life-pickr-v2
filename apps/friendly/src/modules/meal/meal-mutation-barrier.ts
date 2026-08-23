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

  /** 테스트와 운영 진단에서 꼬리 키가 정리됐는지만 확인한다. */
  pendingUserCount(): number {
    return this.tails.size;
  }
}

export const mealMutationBarrier = new MealMutationBarrier();
