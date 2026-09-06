# 사주 이미지 프롬프트북 — 제미나이 생성용 (일간 10 + 띠 12)

> 2026-09-06 작성. `docs/PLAN-saju.md` 0차 산출물. 생성한 원본은 `assets-src/saju/raw/<id>.png`(gitignore) 로 저장하고
> `pnpm --filter friendly build:saju-images` 로 1:1 크롭·webp 변환한다(`apps/friendly/scripts/build-saju-images.ts`).
> 일부만 다시 만들 땐 `--only=stem-gap,branch-rat`. 결과와 누락 목록은 `apps/web/public/saju-c/images/manifest.json`.

## 1. 작업 순서

1. **기준 이미지(2장)** — §3 스타일 블록으로 `stem-byeong 병화(태양)` 과 `branch-tiger 호랑이` 를 먼저 만들어 톤을 확정한다. 마음에 드는 병화 이미지를 **기준 이미지**로 삼고 이후 모든 생성에 첨부 + §3 참조 문장.
2. **일간 10장** → **띠 12장** 순서. 띠는 동물이 주인공이라 톤이 튀기 쉬우니 기준 이미지 + 첫 띠(호랑이)를 함께 첨부한다.
3. **검수(§6)** 후 파일명대로 저장.

**생성 설정**: 종횡비 **1:1**, 해상도 **2K 이상**(원판 중앙·아바타·공유 카드 공용). 한 프롬프트에 한 장씩.

## 2. 프롬프트 조립 규칙

한 장 = **[스타일 블록] + [참조 문장(기준 첨부 시)] + [오행 팔레트 블록] + [장면] + [제약 블록]**.

- 영어로 보낸다. 한글 제목은 식별용.
- 일간은 **사람 캐릭터가 아니라 자연·사물 상징**으로 그린다(성별·나이 중립, 누구의 사주에도 어울리게).
- 띠 12장은 동물 한 마리가 주인공, 사람 없음.

## 3. 고정 블록

### STYLE — 민화 계열, 먹·한지·주사·금 (타로 덱과 같은 계열, 팔레트만 좁힘)

```
Korean minhwa folk-painting style illustration, square composition. Bold confident ink outlines, flat naive perspective, painterly hanji paper texture. Restricted palette: ink black, aged ivory hanji, cinnabar red (jusa), and gilded gold-leaf accents — plus ONE accent color given below for the five-element theme. Background: near-black obsidian stone with faint engraved gold star-chart lines (like the Joseon celestial chart Cheonsang Yeolcha Bunyajido) and a subtle circular ring framing the subject. Decorative stylized clouds, waves, pine, peony and moon motifs in the tradition of Joseon folk painting. Luminous, textured, museum quality. Main subject centered with generous empty margin on all four sides.
```

### 참조 문장

```
Match the exact art style, palette, line weight, gold-leaf treatment and stone-and-hanji texture of the attached reference image. This is one image of the same set.
```

### 오행 팔레트 블록 (장면 앞에 하나)

```
WOOD (목): accent color teal-green (#3f9b7a). Motifs: pine, bamboo, sprouting branches, spring.
FIRE (화): accent color vermilion-orange (#d9482b). Motifs: sun, flame, lantern light, summer.
EARTH (토): accent color ochre-yellow (#c9973a). Motifs: mountains, terraced fields, clay, late summer.
METAL (금): accent color pale silver-white (#dcdcd2). Motifs: polished stone, blade, jade ornament, autumn.
WATER (수): accent color deep indigo-blue (#2f4d7a). Motifs: sea, river, rain, mist, winter.
```

### 제약 블록 (항상 마지막)

```
No text, no letters, no numbers, no watermark, no border frame, no signature. No human faces. Single subject, no collage. Keep the four edges clean so the image can be cropped to a circle.
```

## 4. 일간 10장 (`stem-*`) — 파일명 → 장면

각 장면 앞에 해당 오행 팔레트 블록을 붙인다.

| id | 일간 | 오행 | Scene |
|---|---|---|---|
| `stem-gap` | 갑목 甲 | WOOD | A single towering old pine tree standing straight on a rocky cliff, roots gripping stone, crown reaching the moon, unbending and dignified. |
| `stem-eul` | 을목 乙 | WOOD | Flowering wisteria and orchid vines winding gracefully around a garden stone, flexible stems bending toward light, delicate and resilient. |
| `stem-byeong` | 병화 丙 | FIRE | A great red sun rising over layered mountains and sea, rays spreading wide, cranes flying across, generous and radiant. |
| `stem-jeong` | 정화 丁 | FIRE | A single paper lantern glowing warmly in a night courtyard, moths and fireflies drawn to its light, intimate and steady. |
| `stem-mu` | 무토 戊 | EARTH | A massive broad mountain with pine forests and clouds at its shoulders, immovable, sheltering a small village at its foot. |
| `stem-gi` | 기토 己 | EARTH | Terraced rice fields and rich dark soil after rain, seedlings in neat rows, a small path, nurturing and fertile. |
| `stem-gyeong` | 경금 庚 | METAL | A great boulder split cleanly by a straight iron sword planted in the ground, autumn wind, decisive and strong. |
| `stem-sin` | 신금 辛 | METAL | A finely carved jade binyeo hairpin and pearls resting on silk, catching moonlight, precise, refined and sharp. |
| `stem-im` | 임수 壬 | WATER | A vast open sea under a full moon, deep rolling waves, a whale surfacing far away, boundless and wise. |
| `stem-gye` | 계수 癸 | WATER | Soft spring rain over a clear mountain spring, dew on moss and lotus leaves, mist rising, gentle and quietly persistent. |

## 5. 띠 12장 (`branch-*`)

동물은 민화 특유의 해학적·당당한 표정. 사람 없음. 오행 팔레트는 지지의 오행을 따른다.

| id | 지지 | 오행 | Scene |
|---|---|---|---|
| `branch-rat` | 자 子 쥐 | WATER | A clever rat sitting on a grain sack beneath a crescent moon, holding a single rice stalk, bright eyes. |
| `branch-ox` | 축 丑 소 | EARTH | A sturdy ox standing calmly in a snowy field at dawn, breath steaming, patient and strong. |
| `branch-tiger` | 인 寅 호랑이 | WOOD | A minhwa tiger with a wide humorous grin sitting under a pine tree, a magpie on the branch above (kkachi-horangi). |
| `branch-rabbit` | 묘 卯 토끼 | WOOD | Two moon rabbits pounding rice cake with a mortar under a full moon, spring blossoms. |
| `branch-dragon` | 진 辰 용 | EARTH | A blue-green dragon coiling through storm clouds, holding a glowing pearl, rain beginning to fall. |
| `branch-snake` | 사 巳 뱀 | FIRE | An elegant snake coiled around a blooming peony branch in summer sun, calm and watchful. |
| `branch-horse` | 오 午 말 | FIRE | A galloping horse with flowing mane crossing a sunlit plain, dust and wind, joyful speed. |
| `branch-goat` | 미 未 양 | EARTH | A gentle goat resting on a warm hillside among wildflowers at late summer, soft light. |
| `branch-monkey` | 신 申 원숭이 | METAL | A curious monkey on a persimmon branch holding a ripe fruit, autumn sky, playful and quick. |
| `branch-rooster` | 유 酉 닭 | METAL | A proud rooster crowing on a stone wall at sunrise, feathers detailed, chrysanthemums below. |
| `branch-dog` | 술 戌 개 | EARTH | A loyal Jindo dog sitting at a hanok gate at dusk, alert and warm, lantern light. |
| `branch-pig` | 해 亥 돼지 | WATER | A plump contented pig lying under a pine in first snow, acorns and a small stream nearby, generous. |

## 6. 검수 체크리스트

- 정사각, 주 대상이 중앙, 네 모서리가 비어 원형 크롭에 안전한가.
- 글자·숫자·테두리·워터마크 없음. 사람 얼굴 없음.
- 팔레트가 먹·한지·주사·금 + 오행 포인트 1색 안에 있는가(오방색 전부 쓰면 타로와 구분이 안 됨).
- 배경에 흑요석 + 금선 천문도 힌트가 있는가.
- 띠 동물이 민화 표정(해학)인가, 사실적 사진풍이 아닌가.

## 7. 진행표

| id | 상태 | 비고 |
|---|---|---|
| stem-gap … stem-gye (10) | ☑ | 10장 전수 생성 및 1:1 WebP 변환 완료 |
| branch-rat … branch-pig (12) | ☑ | 12장 전수 생성 및 1:1 WebP 변환 완료 |
