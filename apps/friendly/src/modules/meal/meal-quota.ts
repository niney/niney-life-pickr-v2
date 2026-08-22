// 사용자별 일일 LLM 호출 한도 — 인메모리 카운터(in-memory-singleton-gates 패턴).
// 인식·추천은 사용자 트리거 LLM 호출이라 계정 게이트(동시성)만으로는 비용을 못 막는다.
// DB 에 카운터를 두지 않는 이유: 재시작 시 리셋돼도 손해가 없고(하루치 상한이 다시 열릴 뿐),
// 쓰기 경합을 만들 이유가 없다. 날짜 경계는 Asia/Seoul(subway 쿼터와 같은 규칙).

const KST_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const kstDateKey = (now: Date = new Date()): string => KST_DATE.format(now);

// 카운터가 무한히 늘지 않게 — 사용자 수가 이보다 많아지면 오래된 항목부터 버린다(그 사용자는
// 그날 한도가 다시 열린다 — 비용 상한은 여전히 사용자당이 아니라 전체 트래픽이 결정).
const MAX_ENTRIES = 5000;

interface Counter {
  dateKey: string;
  count: number;
}

export class DailyQuota {
  private readonly counters = new Map<string, Counter>();

  // 한도 안이면 소비하고 true. 넘으면 증가시키지 않고 false.
  consume(key: string, limit: number, now: Date = new Date()): boolean {
    if (limit <= 0) return true; // 0 이하 = 무제한(끄기)
    const dateKey = kstDateKey(now);
    const cur = this.counters.get(key);
    if (!cur || cur.dateKey !== dateKey) {
      this.evictIfNeeded();
      this.counters.set(key, { dateKey, count: 1 });
      return true;
    }
    if (cur.count >= limit) return false;
    cur.count += 1;
    return true;
  }

  used(key: string, now: Date = new Date()): number {
    const cur = this.counters.get(key);
    if (!cur || cur.dateKey !== kstDateKey(now)) return 0;
    return cur.count;
  }

  reset(): void {
    this.counters.clear();
  }

  private evictIfNeeded(): void {
    if (this.counters.size < MAX_ENTRIES) return;
    const oldest = this.counters.keys().next();
    if (!oldest.done) this.counters.delete(oldest.value);
  }
}

export const mealQuota = new DailyQuota();

export const recognizeQuotaKey = (userId: string): string => `recognize|${userId}`;
export const recommendQuotaKey = (userId: string): string => `recommend|${userId}`;
