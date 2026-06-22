# review-search 연구 노트 (리뷰 문맥검색 / RAG)

크롤된 식당 리뷰에 대해 "리뷰 목록"이 아니라 **질문에 근거 있는 답(RAG)** 을 주는 도메인의
설계·평가·개선 기록. 운영 코드는 `src/modules/review-search/`, 이 폴더는 그 **검증·연구 자산**.

## 1. 아키텍처 (확정)

```
질문
 → HyDE(가상 리뷰 생성→임베딩, 짧은 질의 recall↑)
 → 하이브리드 회수: BM25(char-trigram, 인앱) ⊕ bge-m3 dense → RRF
 → listwise LLM 리랭크 (hybrid 풀 top-RERANK_POOL 재정렬)
 → RAG 생성: 근거 ASK_EVIDENCE(6)건으로만 답 + 인용[n] + confidence
 → 검증 가드레일: 2차 LLM이 claim↔근거 축자 대조 → 미지원 제거 + confidence 강등
```

- **임베딩** `bge-m3`(로컬 Ollama, dim 1024) — `embeddingJson` 컬럼 + 인앱 코사인(식당 단위 ~1000건이라 ~ms). sqlite-vec/FTS5 미사용.
- **생성/리랭크** ollama-cloud chat(gpt-oss). ⚠️ Ollama 네이티브 rerank 없음 + Qwen3-Reranker 사용불가 → **listwise LLM 리랭크**가 현실 최적.
- **enrich = on-demand**: 검색되는 식당만 첫 1회 관점+문맥+임베딩 생성→DB저장, 이후 멱등 스킵.
- **답은 상위 6건만 읽는다**(전수 채점·top-6 생성). → "요지/합의"형 질문엔 충분, "전수 집계"형엔 한계(아래 천장).

## 2. 평가 방법론 — `probe:eval`

| env | 의미 |
|---|---|
| `EVAL_JUDGE` | `claude`(기본, 헤드리스 `claude -p`, **API 키 불필요**, opus-4-8 독립) / `ollama`(self-bias 폴백) |
| `EVAL_SECTION` | `A`=검색 지표만(claude 비용 0) / `B`=RAG만 / 미지정=전체 |
| `EVAL_ROUNDS` | RAG A/B 라운드 수(기본 2) |

- **A. 검색 지표**: aspects 라벨을 약식 정답으로 recall@k·precision·극성순도(dense/hybrid/rerank).
- **B. RAG 가드레일 A/B**: **같은 생성에 verify on/off 격리**(독립 생성은 분산이 신호를 가림) + 다회 평균. Claude 독립 판정으로 faithfulness/relevance.
- **C. known-answer**: 데이터에 없는 질문 → confidence none 기대(환각 게이트).

### 핵심 주의 (검증 신뢰성)
- **self-bias 함정**: 판정자가 생성기와 같은 gpt-oss면 faithfulness 가 부풀려짐(실측 100% → 독립 Claude 67~83%). **반드시 `EVAL_JUDGE=claude`.**
- **순환 함정**: recall 메트릭의 정답이 aspects 라벨이므로 **aspect 라벨을 회수 레버로 쓰면 순환**(무의미). 회수 개선은 라벨과 독립된 메트릭(Claude 관련성/답 완전성)으로만 검증.
- **노이즈**: rerank·생성·판정이 다 LLM → N=12 에선 변동 큼. **같은 생성 within-run 비교만 깨끗이 귀인**되고, run 간 절대치 비교는 노이즈(라운드↑로 안정화).

## 3. 검증된 개선 (채택)

독립 Claude 판정으로 검증. 모두 운영 코드에 반영됨.

1. **verifier span-grounding** — claim별 축자 근거 span 강제 + 근거 모순 시 제거. 가드레일 lift **0 → +9~16pp**(기존 verifier는 환각에 제거=0이었음).
2. **generator 과추론 억제(완화판)** — "구체적 미지원 한정어(요일·시간·수치) 금지"는 유지, "전반적 경향 결론은 허용". relevance **100% 유지**하며 강도 과장 감소. (※ 무딘 버전은 relevance 83%로 떨어뜨려 폐기 — 결론까지 막았음.)
3. **verifier revisedAnswer 삭제 위주** — 원문에 없는 새 내용 추가 금지. 재작성이 환각을 주입하던 **역효과(off true→on false) 제거**.

순효과: 가드레일이 faithfulness 를 신뢰성 있게 올리고 **절대 해치지 않음**, relevance 100%.

## 4. 기각된 변경 (negative result)

- **rerank 풀 = dense∪hybrid 합집합**: 양적다 rerank {56,78,44} vs baseline {67,44,67} **완전 겹침 = 효과 0**(rerank LLM 노이즈). 놓치는 정답은 dense·hybrid 양쪽 다 약하게 회수(짧은 한국어 리뷰 임베딩 한계)라 후보 추가로 안 풀림 → **되돌림**. (verify-loop 가 비개선 변경을 걸러낸 사례.)

## 5. 알려진 천장

- **faithfulness ~83%(가드레일 후, 어려운 질의)**: 짧고 잡다한 한국어 리뷰 + Ollama 제약상 프롬프트만으론 한계. 실전 안전망 = confidence + 인용 + "정보 없음".
- **회수 recall(폴라리티 질의 44~78% 변동)**: 임베딩이 극성을 못 잡음(맛없다↔맛있다).
  - **요지/합의형 질문엔 top-6 로 충분** — 양적다 recall 44%여도 "양은 충분해?"는 faithful. 관측된 faithfulness 실패도 전부 "생성 과추론"이지 "리뷰 누락"이 아니었음.
  - **그러나 열거/완전성형 질문엔 recall 이 병목** — `probe:completeness` 측정상 "단점 다 알려줘"류가 전수 부정 테마의 **~58%만 포착**(강매·위생·직원 불친절 등 누락). 여기선 회수 개선이 곧 답 품질 개선. ← aspect-fusion 정당화 + 검증 지표 확보.

## 6. 미래 개선 레버 + 검증법

> **게이트(측정됨)**: `probe:completeness` baseline **평균 58%**(열거형 질문) → recall 이 병목임이 확인됨. 따라서 회수 개선(아래)은 **이 completeness 지표를 올리는지**로 검증한다(요지형 faithfulness 가 아니라).

| 레버 | 가설 | 검증법(순환·self-bias 회피) |
|---|---|---|
| **aspect-fusion** | 전수 극성 라벨로 회수 부스팅 → 폴라리티 recall↑ | `probe:completeness` 완전성 Δ + Claude 관련성 판정(라벨-recall 금지) |
| **다른 임베딩 모델** | bge-m3 보다 한국어/극성 잘 잡는 모델 | 재임베딩 후 recall@k(임베딩≠라벨이라 공정) |
| **멀티쿼리 확장** | 질의 패러프레이즈 ×3 합집합 회수 | recall@k(패러프레이즈는 라벨과 독립) |
| **생성/검증 모델 분리** | verifier 를 생성기와 다른 모델로 → 공유 맹점 깨기 | faithfulness Δ(Claude 판정), 어려운 셋 |
| **eval 라운드↑** | N=12 노이즈 제거 | 절대치 안정화(개선 아님, 측정 신뢰) |
| **응답 속도** | LLM 콜 4개 순차가 ~95% — 스트리밍/서브태스크 작은모델/HyDE 제거/캐시 | 단계별 latency 계측 후 A/B |

## 7. 프로브 사용법

```bash
pnpm --filter friendly probe:eval            # 정확도(검색+RAG 가드레일 A/B). 기본 Claude 판정
EVAL_SECTION=A pnpm --filter friendly probe:eval   # 검색 지표만(빠름·무료)
EVAL_JUDGE=ollama pnpm --filter friendly probe:eval # self-bias 폴백(키/네트워크 없이)
pnpm --filter friendly probe:completeness    # recall 병목 진단(회수 개선 착수 게이트)
pnpm --filter friendly probe:review-search   # e2e 스모크(enrich→검색→RAG→캐시)
```
대상은 `조연탄`(이미 enrich됨). 판정자 Claude 는 Claude Code 헤드리스라 별도 키 불필요.

## 8. 핵심 파일

- 운영: `src/modules/review-search/{retrieval.ts, review-search.service.ts, review-search.route.ts}`
- 계약: `packages/api-contract/src/schemas/review-search.ts`, `routes.ts`(ReviewSearch)
- 공유: `packages/shared/src/{api/review-search.api.ts, hooks/useReviewSearch.ts}`
- 어드민: `apps/web/src/routes/admin/AdminReviewSearchPage.tsx` (enrich + RAG만)
- 공개: 웹/앱 상세 "질문" 탭(`AskTab`), `GET/POST /api/v1/restaurants/:placeId/qa{,/ready}`
- 연구: 이 폴더(`research/review-search/`)
