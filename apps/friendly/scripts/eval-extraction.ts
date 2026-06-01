import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// 영수증 추출 측정 스크립트.
//
// SettlementExtractionService 가 EXTRACTION_DEBUG=1 로 돌 때 남긴
// data/extraction-debug/*.json 덤프를 집계해, "정산 이미지 인식이 얼마나
// 안 맞는지" 를 정량화한다. 라벨(정답) 없이도 의미 있는 신호(파싱 실패율,
// totalAmount 누락율, 합계 불일치율, amount=0 라인, UNCATEGORIZED 비율 등)
// 를 뽑고, --labels 디렉터리를 주면 항목 누락/금액/카테고리 정확도까지 낸다.
//
// 수집 방법:
//   1) friendly 를 EXTRACTION_DEBUG=1 로 띄운다.
//        EXTRACTION_DEBUG=1 pnpm --filter friendly dev
//   2) 앱에서 맛집 > 상세 > 정산 으로 영수증 사진을 몇 장 올린다.
//   3) data/extraction-debug/ 와 data/receipts/<token>.jpg 가 쌓인다.
//
// 실행:
//   pnpm --filter friendly eval:extraction
//   pnpm --filter friendly eval:extraction -- --dir data/extraction-debug --labels data/extraction-labels
//
// 라벨 파일(선택): <labels>/<token>.json
//   { "items": [{ "name": "김치찌개", "amount": 9000, "category": "SIDE" }], "totalAmount": 50000 }
//   (token 은 덤프 파일명/내용의 token, 또는 data/receipts/<token>.jpg 에서 확인)

type Category = 'ALCOHOL' | 'NON_ALCOHOL' | 'SIDE' | 'UNCATEGORIZED';

interface ResultItem {
  name: string;
  unitPrice: number | null;
  quantity: number | null;
  amount: number;
  category: Category;
  matchedMenuName: string | null;
}

interface Dump {
  phase: 'success' | 'parse_error' | 'llm_error';
  token: string;
  model: string | null;
  restaurantName: string;
  menuNamesCount: number;
  durationMs: number;
  parseError?: string;
  llmError?: string;
  result?: {
    items: ResultItem[];
    totalAmount: number | null;
    itemsSubtotal: number;
    warning: string | null;
  };
}

interface Label {
  items: { name: string; amount?: number; category?: Category }[];
  totalAmount?: number | null;
}

const parseArgs = (argv: string[]): { dir: string; labels: string | null; csv: string | null } => {
  let dir = join(process.cwd(), 'data', 'extraction-debug');
  let labels: string | null = null;
  let csv: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') dir = argv[++i]!;
    else if (a === '--labels') labels = argv[++i]!;
    else if (a === '--csv') csv = argv[++i]!;
  }
  if (csv === null) csv = join(dir, 'eval-report.csv');
  return { dir, labels, csv };
};

// 이름 정규화 — 공백/대소문자 무시. 라벨 매칭과 중복 판단에 쓴다.
const norm = (s: string): string => s.replace(/\s+/g, '').toLowerCase();

const pct = (n: number, d: number): string =>
  d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`;

const stats = (xs: number[]): { min: number; median: number; max: number; avg: number } => {
  if (xs.length === 0) return { min: 0, median: 0, max: 0, avg: 0 };
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  const avg = xs.reduce((s, x) => s + x, 0) / xs.length;
  return { min: sorted[0]!, median, max: sorted[sorted.length - 1]!, avg };
};

const main = async (): Promise<void> => {
  const { dir, labels: labelsDir, csv } = parseArgs(process.argv.slice(2));

  let files: string[];
  try {
    files = (await readdir(dir)).filter(
      (f) => f.endsWith('.json') && f !== 'eval-report.json',
    );
  } catch {
    console.error(`덤프 디렉터리를 읽지 못했습니다: ${dir}`);
    console.error('EXTRACTION_DEBUG=1 로 friendly 를 띄우고 영수증을 몇 장 올린 뒤 다시 실행하세요.');
    process.exit(1);
    return;
  }

  if (files.length === 0) {
    console.error(`덤프가 없습니다: ${dir}`);
    process.exit(1);
    return;
  }

  const dumps: Dump[] = [];
  for (const f of files) {
    try {
      dumps.push(JSON.parse(await readFile(join(dir, f), 'utf8')) as Dump);
    } catch {
      console.warn(`파싱 실패(건너뜀): ${f}`);
    }
  }

  const total = dumps.length;
  const success = dumps.filter((d) => d.phase === 'success');
  const parseErr = dumps.filter((d) => d.phase === 'parse_error');
  const llmErr = dumps.filter((d) => d.phase === 'llm_error');

  // ── 라벨 없이도 나오는 신호 ───────────────────────────────────────────
  let totalItems = 0;
  let amountZero = 0;
  let unitPriceNull = 0;
  let quantityNull = 0;
  let lineMismatch = 0; // amount != unitPrice*quantity (둘 다 있을 때)
  let matchedMenuFilled = 0;
  let matchedMenuEligible = 0; // menuNamesCount>0 인 영수증의 항목
  const catCount: Record<Category, number> = {
    ALCOHOL: 0,
    NON_ALCOHOL: 0,
    SIDE: 0,
    UNCATEGORIZED: 0,
  };
  let zeroItemReceipts = 0;
  let totalAmountNull = 0;
  let subtotalMismatch = 0;
  const mismatchDiffs: number[] = [];
  const itemCounts: number[] = [];
  const durations = dumps.map((d) => d.durationMs).filter((n) => Number.isFinite(n));

  const csvRows: string[] = [
    'token,restaurantName,model,itemCount,totalAmount,itemsSubtotal,diff,warning,amountZero,uncategorized,durationMs',
  ];

  for (const d of success) {
    const r = d.result;
    if (!r) continue;
    itemCounts.push(r.items.length);
    if (r.items.length === 0) zeroItemReceipts++;
    if (r.totalAmount == null) totalAmountNull++;
    let receiptAmountZero = 0;
    let receiptUncat = 0;
    for (const it of r.items) {
      totalItems++;
      if (it.amount === 0) {
        amountZero++;
        receiptAmountZero++;
      }
      if (it.unitPrice == null) unitPriceNull++;
      if (it.quantity == null) quantityNull++;
      if (
        it.unitPrice != null &&
        it.quantity != null &&
        it.amount !== it.unitPrice * it.quantity
      ) {
        lineMismatch++;
      }
      catCount[it.category]++;
      if (it.category === 'UNCATEGORIZED') receiptUncat++;
      if (d.menuNamesCount > 0) {
        matchedMenuEligible++;
        if (it.matchedMenuName != null) matchedMenuFilled++;
      }
    }
    const diff =
      r.totalAmount != null ? r.totalAmount - r.itemsSubtotal : null;
    if (r.warning != null) {
      subtotalMismatch++;
      if (diff != null) mismatchDiffs.push(Math.abs(diff));
    }
    csvRows.push(
      [
        d.token,
        JSON.stringify(d.restaurantName ?? ''),
        d.model ?? '',
        r.items.length,
        r.totalAmount ?? '',
        r.itemsSubtotal,
        diff ?? '',
        r.warning ? 1 : 0,
        receiptAmountZero,
        receiptUncat,
        d.durationMs,
      ].join(','),
    );
  }

  // ── 출력 ──────────────────────────────────────────────────────────────
  const line = (s = ''): void => console.log(s);
  line('');
  line('═══════════════════════════════════════════════════════════');
  line(`  영수증 추출 측정  —  ${dir}`);
  line('═══════════════════════════════════════════════════════════');
  line('');
  line(`  덤프 ${total}건`);
  line(`   · 성공      ${success.length} (${pct(success.length, total)})`);
  line(`   · 파싱실패  ${parseErr.length} (${pct(parseErr.length, total)})`);
  line(`   · LLM실패   ${llmErr.length} (${pct(llmErr.length, total)})`);
  const dur = stats(durations);
  line(`   · 소요(ms)  median ${Math.round(dur.median)} / max ${Math.round(dur.max)}`);
  line('');
  line('  ── 성공 추출 품질(라벨 불필요) ──────────────────────────');
  line(`   영수증당 항목수   avg ${stats(itemCounts).avg.toFixed(1)} (min ${stats(itemCounts).min} / max ${stats(itemCounts).max})`);
  line(`   항목 0개 영수증   ${zeroItemReceipts} / ${success.length} (${pct(zeroItemReceipts, success.length)})`);
  line(`   totalAmount 누락  ${totalAmountNull} / ${success.length} (${pct(totalAmountNull, success.length)})`);
  line(`   합계 불일치       ${subtotalMismatch} / ${success.length} (${pct(subtotalMismatch, success.length)})  ⟵ 인식 오류 1순위 신호`);
  if (mismatchDiffs.length > 0) {
    const md = stats(mismatchDiffs);
    line(`     └ 차액(원)      median ${Math.round(md.median).toLocaleString()} / max ${Math.round(md.max).toLocaleString()}`);
  }
  line('');
  line(`   전체 항목 ${totalItems}개 기준`);
  line(`     amount=0        ${amountZero} (${pct(amountZero, totalItems)})  ⟵ 금액 인식 실패`);
  line(`     unitPrice=null  ${unitPriceNull} (${pct(unitPriceNull, totalItems)})`);
  line(`     quantity=null   ${quantityNull} (${pct(quantityNull, totalItems)})`);
  line(`     라인 금액 불일치 ${lineMismatch} (${pct(lineMismatch, totalItems)})  (amount ≠ 단가×수량)`);
  line(`     UNCATEGORIZED   ${catCount.UNCATEGORIZED} (${pct(catCount.UNCATEGORIZED, totalItems)})  ⟵ 카테고리 모호`);
  line(`     카테고리 분포    주류 ${catCount.ALCOHOL} / 비주류 ${catCount.NON_ALCOHOL} / 안주 ${catCount.SIDE} / 미분류 ${catCount.UNCATEGORIZED}`);
  if (matchedMenuEligible > 0) {
    line(`     메뉴힌트 매칭    ${matchedMenuFilled} / ${matchedMenuEligible} (${pct(matchedMenuFilled, matchedMenuEligible)})`);
  }

  // ── 라벨 기반 정확도(선택) ────────────────────────────────────────────
  if (labelsDir) {
    let labelFiles: Set<string>;
    try {
      labelFiles = new Set(
        (await readdir(labelsDir)).filter((f) => f.endsWith('.json')),
      );
    } catch {
      labelFiles = new Set();
    }

    let evaluated = 0;
    let expectedItems = 0;
    let matchedNames = 0; // 정답 이름이 추출에 존재
    let predItems = 0;
    let amountCorrect = 0;
    let amountChecked = 0;
    let categoryCorrect = 0;
    let categoryChecked = 0;
    let totalAmountExact = 0;
    let totalAmountChecked = 0;

    for (const d of success) {
      if (!d.result) continue;
      const lf = `${d.token}.json`;
      if (!labelFiles.has(lf)) continue;
      let label: Label;
      try {
        label = JSON.parse(await readFile(join(labelsDir, lf), 'utf8')) as Label;
      } catch {
        continue;
      }
      evaluated++;
      const predByName = new Map(d.result.items.map((it) => [norm(it.name), it]));
      predItems += d.result.items.length;
      for (const exp of label.items) {
        expectedItems++;
        const pred = predByName.get(norm(exp.name));
        if (!pred) continue;
        matchedNames++;
        if (typeof exp.amount === 'number') {
          amountChecked++;
          if (pred.amount === exp.amount) amountCorrect++;
        }
        if (exp.category) {
          categoryChecked++;
          if (pred.category === exp.category) categoryCorrect++;
        }
      }
      if (typeof label.totalAmount === 'number') {
        totalAmountChecked++;
        if (d.result.totalAmount === label.totalAmount) totalAmountExact++;
      }
    }

    line('');
    line('  ── 라벨 기반 정확도 ─────────────────────────────────────');
    if (evaluated === 0) {
      line(`   매칭된 라벨 없음 (${labelsDir} 의 <token>.json 이 덤프 token 과 맞는지 확인)`);
    } else {
      line(`   평가 영수증       ${evaluated}건`);
      line(`   항목 재현율(recall)  ${matchedNames}/${expectedItems} (${pct(matchedNames, expectedItems)})  ⟵ 정답을 얼마나 잡았나`);
      line(`   항목 정밀도(precision) ${matchedNames}/${predItems} (${pct(matchedNames, predItems)})  ⟵ 추출 중 정답 비율`);
      line(`   금액 정확도       ${amountCorrect}/${amountChecked} (${pct(amountCorrect, amountChecked)})`);
      line(`   카테고리 정확도   ${categoryCorrect}/${categoryChecked} (${pct(categoryCorrect, categoryChecked)})`);
      line(`   총액 정확도       ${totalAmountExact}/${totalAmountChecked} (${pct(totalAmountExact, totalAmountChecked)})`);
    }
  } else {
    line('');
    line('  (라벨로 정확도까지 보려면: --labels <dir>, 파일명 <token>.json)');
  }

  // CSV
  if (csv) {
    try {
      await writeFile(csv, csvRows.join('\n'), 'utf8');
      line('');
      line(`  per-receipt CSV → ${csv}`);
    } catch (e) {
      line('');
      line(`  CSV 쓰기 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  line('');
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
