# 타로 덱 프롬프트북 — 제미나이 이미지 생성용 (78장 + 뒷면)

> 2026-09-02 작성. `docs/PLAN-tarot.md` 0차 산출물. 생성한 원본은 `assets-src/tarot/raw/<cardId>.png` 로 저장하고
> `pnpm --filter friendly build:tarot-deck` 으로 7:12 크롭·webp 변환한다(`apps/friendly/scripts/build-tarot-deck.ts`).
> 일부만 다시 만들 땐 `--only=major-17,back`, 아직 없는 카드를 임시 카드로 채우려면 `--placeholders`.
> 결과와 누락 목록은 `apps/web/public/tarot/cards/manifest.json` 에 남는다.

## 1. 작업 순서

1. **방향 시험(5장)** — §3 의 스타일 블록 A(민화+금박)·B(아르누보+금박) 각각으로 `major-17 별` 과 `major-08 힘` 을 만들고, 뒷면(§4)을 A 로 1장 만든다. 마음에 드는 방향을 고른다.
2. **기준 카드 확정** — 고른 방향으로 `major-17 별` 을 마음에 들 때까지 재생성해 **기준 카드**로 삼는다. 이후 모든 생성에 이 이미지를 첨부하고 §3 의 "참조 문장"을 붙인다.
3. **수트별 배치 생성** — 메이저 22장 → 완드 14장 → 컵 14장 → 소드 14장 → 펜타클 14장 순. 수트를 시작할 때 그 수트의 에이스를 먼저 만들어 기준 카드와 함께 참조로 첨부하면 소품(완드·컵·소드·펜타클 모양)이 통일된다.
4. **검수(§6 체크리스트)** 후 파일명대로 저장.

**생성 설정**: 종횡비 **9:16**, 해상도 **2K 이상**(1K 는 세로 1024 라 부족). 한 프롬프트에 한 장씩. 같은 대화에서 이어 가되 스타일이 흔들리면 새 대화에서 기준 카드를 다시 첨부한다.

## 2. 프롬프트 조립 규칙

한 장의 프롬프트 = **[스타일 블록] + [참조 문장(기준 카드 첨부 시)] + [수트 블록(마이너만)] + [카드 장면] + [제약 블록]**.

- 스타일·참조·수트·제약 블록은 §3 에서 복사한다. 카드 장면은 §5 의 각 카드 `Scene:` 문단이다.
- 영어로 보내는 편이 구도 재현이 정확하다. 한글 제목은 식별용이며 프롬프트에 넣지 않는다.
- 조립 예시(완드 8):

```
[STYLE A 블록]
Match the exact art style, palette, line weight, gold-leaf treatment and paper texture of the attached reference card.
[WANDS 수트 블록]
Scene: Eight sprouting wands fly diagonally across a clear sky over a green river landscape, no people, motion and speed.
[제약 블록]
```

## 3. 고정 블록

### STYLE A — 민화 + 금박 (1순위)

```
Korean minhwa folk-painting style tarot illustration. Flat, slightly naive perspective with bold confident ink outlines. Vivid obangsaek palette (vermilion red, cobalt blue, ochre yellow, ivory white, ink black) with gilded gold-leaf accents on outlines and highlights. Background: deep indigo-black aged hanji paper texture with faint gold speckle. Decorative stylized clouds, waves, peonies, pine, cranes and layered mountains in the tradition of Joseon folk painting (tiger-and-magpie, sun-moon-five-peaks, scholar's-shelf paintings). Figures wear hanbok, buildings are hanok. Painterly, textured, luminous, museum quality, richly detailed. Vertical composition, main subject centered, generous empty margin at top and bottom.
```

### STYLE B — 아르누보 + 금박 (대안)

```
Early-20th-century Art Nouveau poster style tarot illustration. Elegant flowing linework, gold-leaf ornament, muted jewel tones (deep teal, wine, amber, ivory) over a midnight-blue background, stylized floral and celestial motifs woven into the scene itself (not a frame), soft luminous glow, fine engraved texture. Vertical composition, main subject centered, generous empty margin at top and bottom.
```

### 참조 문장 (기준 카드를 첨부할 때 붙임)

```
Match the exact art style, palette, line weight, gold-leaf treatment and paper texture of the attached reference card. This is one card of the same deck.
```

### 수트 블록 (마이너 아르카나에만)

```
WANDS: Wands are living wooden staffs sprouting fresh green leaves and small red blossoms. Warm palette dominates: vermilion, persimmon orange, ochre. Fire, summer, growth motifs.
```
```
CUPS: Cups are celadon-green Goryeo chalices with a soft jade glaze. Cool palette dominates: jade, cobalt, sea-blue. Water, lotus, fish, crane, mist motifs.
```
```
SWORDS: Swords are straight double-edged swords with bright silver blades and simple hilts. Palette dominates: silver-grey, pale blue, slate. Wind, drifting clouds, distant mountains, storm motifs.
```
```
PENTACLES: Pentacles are large gold coins engraved with a five-pointed star inside a circle. Palette dominates: gold, moss green, earth brown. Pine, harvest, rice fields, walled gardens motifs.
```

### 제약 블록 (항상 마지막에)

```
Strictly no text, no letters, no numbers, no captions, no signature, no watermark. No card border, no frame, no rounded card shape — draw only the full-bleed illustration. One unified scene, no split panels, no collage. Correct anatomy: natural faces, five fingers per hand. Portrait 9:16.
```

## 4. 뒷면 (`back`)

정·역방향을 뒷면으로 알아볼 수 없어야 하므로 **상하·좌우 완전 대칭**이 필수다. 빌드 스크립트에 `--symmetrize back` 옵션이 있어 위쪽 절반을 거울로 복제해 강제 대칭을 만들 수 있으니, 대칭이 조금 어긋나도 중앙 구도만 좋으면 된다.

```
[STYLE 블록]
Scene: Ornamental tarot card back. A perfectly symmetrical design, mirrored both vertically and horizontally: a central gold-leaf medallion of a full moon holding a lotus, surrounded by concentric rings of stylized clouds, tiny stars and wave patterns, on deep indigo hanji paper. Fine gold linework, no central figure, no animals, no asymmetry. It must look identical when rotated 180 degrees.
[제약 블록]
```

## 5. 카드 장면 (78장)

파일명은 `<cardId>.png`. 각 카드의 `Scene:` 줄만 프롬프트에 넣는다. 괄호 안 한글 설명은 검수용 요약이다.

### 메이저 아르카나 (22)

**major-00 · 바보 (The Fool)**
`Scene: A carefree young traveler in bright hanbok stands at the very edge of a high cliff, one foot lifted mid-step, face turned up to the sky in wonder; a small bundle tied to a stick rests on the shoulder, a white flower in the other hand; a small white dog leaps playfully at the heels; snow-capped stylized peaks and a large radiant white sun behind.`
(절벽 끝의 여행자, 흰 개, 보따리, 흰 꽃)

**major-01 · 마법사 (The Magician)**
`Scene: A young magician stands behind a low wooden table, right arm raised holding a glowing wand toward the sky, left hand pointing down to the earth; on the table lie a celadon cup, a silver sword, a sprouting wand and a gold coin; a glowing infinity symbol floats above the head; red roses and white lilies grow around.`
(위아래 가리키는 손, 탁자 위 네 상징, 무한대 기호)

**major-02 · 여사제 (The High Priestess)**
`Scene: A serene priestess seated on a throne between a black pillar and a white pillar, holding a rolled scroll in her lap; a crescent moon rests at her feet, a moon crown on her head; behind her a veil embroidered with pomegranates, and beyond it a calm night sea.`
(흑백 기둥 사이, 두루마리, 초승달, 석류 휘장)

**major-03 · 여황제 (The Empress)**
`Scene: A gracious empress reclines on a cushioned throne in a lush garden, wearing a crown of twelve stars and a robe patterned with pomegranates, holding a short scepter; a golden wheat field in front, a waterfall and dense forest behind; a heart-shaped shield with a stylized circle-and-cross symbol leans on the throne.`
(풍요, 밀밭, 폭포, 열두 별 관)

**major-04 · 황제 (The Emperor)**
`Scene: A stern bearded emperor seated frontally on a massive stone throne carved with four ram heads, holding a scepter in the right hand and a golden orb in the left, red robes over armor; behind him a folding screen of the sun, moon and five peaks; barren orange mountains in the distance.`
(숫양 왕좌, 홀과 보주, 일월오봉도 병풍)

**major-05 · 교황 (The Hierophant)**
`Scene: A high priest in layered ceremonial robes and a tall triple crown sits on a throne between two grey stone pillars, right hand raised in blessing, left hand holding a staff topped with a triple cross; two shaven-headed monks kneel before him; two crossed golden keys lie at his feet.`
(축복하는 손, 삼중관, 두 수도승, 교차 열쇠)

**major-06 · 연인 (The Lovers)**
`Scene: A man and a woman in simple white robes stand facing each other on a green meadow, looking up at a great winged celestial being spreading its arms in the sky beneath a radiant sun; behind the woman a fruit tree with a serpent coiled in it, behind the man a tree of small flames; a single mountain between them.`
(두 사람, 천상의 존재, 과일나무의 뱀, 불꽃나무)

**major-07 · 전차 (The Chariot)**
`Scene: A confident young warrior in ornate armor stands upright in a stone chariot under a starry blue canopy, holding a short wand, crescent moons on the shoulders, a square emblem on the chest; the chariot is drawn by a black haetae and a white haetae (Korean lion-dog guardians) sitting side by side; a walled city and a river behind.`
(흑백 해태가 끄는 전차, 별 덮개, 성벽)

**major-08 · 힘 (Strength)**
`Scene: A calm young woman in a white hanbok with a garland of flowers in her hair gently closes the jaws of a large folk-painting-style tiger with her bare hands, the tiger docile and looking up at her; a glowing infinity symbol floats above her head; rolling green hills and a blue mountain behind.`
(호랑이 입을 다물게 하는 여인, 무한대 기호)

**major-09 · 은둔자 (The Hermit)**
`Scene: An old hermit in a long grey hooded robe stands alone on a snowy mountain summit, eyes lowered, holding up a lantern that contains a glowing six-pointed star, and leaning on a tall wooden staff; cold indigo night, distant peaks below.`
(눈 덮인 산정의 노인, 별이 든 등불, 지팡이)

**major-10 · 운명의 수레바퀴 (Wheel of Fortune)**
`Scene: A great golden wheel floats in the sky, engraved with alchemical symbols (no letters); a sphinx-like guardian with a sword sits on top, a serpent slides down the left side, a jackal-headed figure rises up the right side; in the four corners, on clouds, the four guardian creatures: a blue dragon, a white tiger, a vermilion bird and a black tortoise-serpent.`
(하늘의 수레바퀴, 사신도 사방신)

**major-11 · 정의 (Justice)**
`Scene: A crowned figure in a red robe sits frontally on a stone throne between two pillars, holding a sword upright in the right hand and balanced golden scales in the left; a purple veil hangs behind; the expression is level and impartial.`
(검과 저울, 두 기둥)

**major-12 · 매달린 사람 (The Hanged Man)**
`Scene: A serene young man hangs upside-down by one ankle from the horizontal branch of a living T-shaped tree, the free leg bent behind the other to form a cross, hands held behind his back, his calm face surrounded by a golden halo; the tree sprouts green leaves; peaceful mood, not violent.`
(한 발로 거꾸로 매달린 평온한 남자, 후광)
 · 거부되면: `a young man suspended upside-down by one ankle from a tree in peaceful meditation, glowing halo`

**major-13 · 죽음 (Death)**
`Scene: A knight in black armor with a pale bone-white face like a mask rides a white horse, carrying a black banner with a large white five-petaled flower; before the horse a fallen king's crown lies on the ground, a priest pleads with folded hands, a woman turns her face away, a child offers flowers; a river with a small boat, and far away the sun rising between two stone towers.`
(백마 탄 흑기사, 흰 꽃 검은 깃발, 두 탑 사이 일출)
 · 거부되면: `a pale masked rider in black armor on a white horse carrying a black banner with a white flower, figures bowing, sunrise between two towers` 로 인물 반응 묘사를 줄인다.

**major-14 · 절제 (Temperance)**
`Scene: A winged celestial being in a flowing white robe stands with one bare foot on the land and the other in a clear pool, pouring water in a continuous arc between two celadon cups; a path leads from the pool toward two mountains with a glowing golden crown of light between them; purple irises bloom at the water's edge.`
(두 잔 사이로 물을 붓는 천사, 한 발은 물에)

**major-15 · 악마 (The Devil)**
`Scene: A large horned Korean goblin (dokkaebi) with bat-like wings squats on a black stone pedestal, one hand raised open, the other holding a torch pointing downward; a man and a woman with small horns and tails stand at the base, loose chains around their necks fastened to the pedestal, chains clearly slack enough to slip off; dark cave background.`
(도깨비, 느슨한 사슬의 두 사람)
 · 거부되면: `a mischievous horned goblin on a pedestal, two figures with loose ribbon-like chains` 로 완곡하게.

**major-16 · 탑 (The Tower)**
`Scene: A tall stone pagoda on a rocky crag is struck by a jagged bolt of lightning; its golden crown is knocked off into the air, flames burst from the windows, sparks and small tongues of fire rain down; two figures leap outward away from the tower against the dark storm sky; grey clouds.`
(번개 맞은 탑, 떨어지는 왕관, 뛰어내리는 두 사람)

**major-17 · 별 (The Star)** ← 기준 카드
`Scene: A young woman in a thin white robe kneels at the edge of a still pool under a deep night sky, pouring water from two jars, one onto the grass and one into the pool; one large eight-pointed gold star shines above with seven smaller stars around it; a white crane perches on a flowering tree behind her; mood of hope and calm.`
(두 항아리로 물 붓는 여인, 큰 별 하나와 작은 별 일곱, 학)

**major-18 · 달 (The Moon)**
`Scene: A full moon with a serene calm face hangs in the night sky dripping drops of dew; below it a tame dog and a wild wolf howl upward; a crayfish crawls out of a pool onto a winding path that leads between two tall wooden jangseung totem poles toward distant blue mountains.`
(얼굴 있는 달, 개와 늑대, 가재, 두 장승)

**major-19 · 태양 (The Sun)**
`Scene: A joyful naked-shouldered child in a simple wrap rides a white horse without a saddle, arms open, holding a large red banner, beneath a huge radiant golden sun with a calm smiling face; behind, a stone garden wall with four tall sunflowers.`
(백마 탄 아이, 붉은 깃발, 해바라기 넷, 얼굴 있는 해)

**major-20 · 심판 (Judgement)**
`Scene: A celestial being with flowing ribbons (Korean flying apsara) emerges from the clouds blowing a long golden trumpet with a small flag; below, on a wide calm sea, a man, a woman and a child stand in wooden boats with arms raised in awe, awakening to the call; snowy mountains on the horizon.`
(나팔 부는 비천, 배 위에서 팔 든 사람들)

**major-21 · 세계 (The World)**
`Scene: A graceful dancing figure wrapped only in a long flowing purple sash floats inside a large oval wreath of laurel tied with red ribbons at top and bottom, holding a short wand in each hand; in the four corners, on clouds, the four guardian creatures: a blue dragon, a white tiger, a vermilion bird and a black tortoise-serpent.`
(월계관 안의 춤추는 인물, 사방신)

### 완드 (14) — 앞에 WANDS 수트 블록

**wands-01 · 완드 에이스 (Ace of Wands)**
`Scene: A hand emerges from a gold-rimmed cloud holding a single tall sprouting wand upright; small leaves drift down; below, a river winds through green hills toward a small hanok castle on a hill.`
(구름에서 나온 손, 완드 하나)

**wands-02 · 완드 2**
`Scene: A man in a red robe stands on a castle battlement holding a small globe in one hand and a wand in the other, gazing out over the sea and mountains; a second wand is fixed to the wall beside him; roses and lilies are carved on the stone.`
(성벽 위 지구본 든 남자, 완드 둘)

**wands-03 · 완드 3**
`Scene: A merchant in a long robe stands on a cliff with his back to the viewer, watching three ships sail across a golden sea at sunset; three wands are planted upright around him and he rests a hand on one.`
(뒷모습, 바다의 배 세 척, 완드 셋)

**wands-04 · 완드 4**
`Scene: Four tall wands form a canopy hung with a garland of fruit and flowers; two women in bright hanbok wave bouquets in celebration beneath it; a walled village with people feasting and a hanok bridge in the background; festive, sunny.`
(화환 걸린 완드 넷, 축제)

**wands-05 · 완드 5**
`Scene: Five youths in colorful tunics brandish five wands at once in a playful mock battle, the wands crossing in a tangle, on open ground under a clear blue sky; energetic, not injured.`
(다섯 청년의 완드 다툼)

**wands-06 · 완드 6**
`Scene: A rider crowned with a laurel wreath rides a white horse in a procession, holding a wand topped with a laurel wreath; around him people on foot raise five more wands and cheer; triumphant.`
(월계관 기수, 환호하는 사람들, 완드 여섯)

**wands-07 · 완드 7**
`Scene: A young man standing on the top of a green hill holds one wand across his body defensively, facing six wands rising up toward him from below the edge; he wears mismatched shoes; determined.`
(언덕 위에서 방어하는 남자, 아래서 올라오는 완드 여섯)

**wands-08 · 완드 8**
`Scene: Eight sprouting wands fly diagonally across a clear blue sky in a parallel group over a green river landscape with a small house; no people; a sense of speed and motion.`
(하늘을 나는 완드 여덟, 사람 없음)

**wands-09 · 완드 9**
`Scene: A wary man with a bandaged head leans on one wand, glancing sideways, standing guard in front of a row of eight wands planted like a fence behind him; tired but unbroken.`
(붕대 감은 남자, 울타리 같은 완드 여덟 + 손에 하나)

**wands-10 · 완드 10**
`Scene: A man bends forward under the weight of ten heavy wands bundled in his arms, struggling to carry them along a path toward a distant hanok village; his face hidden by the load.`
(완드 열 개를 안고 걷는 남자)

**wands-page · 완드 페이지**
`Scene: A young page in a tunic patterned with small salamanders and a feathered cap stands in a dry ochre desert with three stylized pyramids far away, holding a tall sprouting wand with both hands and gazing up at its tip with curiosity.`
(사막의 시종, 완드를 올려다봄)

**wands-knight · 완드 나이트**
`Scene: An armored knight on a rearing chestnut horse charges forward holding a sprouting wand aloft, a yellow tunic patterned with salamanders and a plume of flame-like feathers; a desert with pyramids far behind; bold and fast.`
(뛰어오르는 말 위의 기사)

**wands-queen · 완드 퀸**
`Scene: A queen in a golden robe sits on a throne carved with lions and sunflowers, holding a sprouting wand in the right hand and a large sunflower in the left; a black cat sits at her feet looking at the viewer; warm desert background.`
(해바라기 든 여왕, 검은 고양이)

**wands-king · 완드 킹**
`Scene: A king in red and gold robes sits on a throne carved with lions and salamanders, holding a tall sprouting wand, gazing to the side with confidence; a small salamander crawls at the base of the throne; desert background.`
(완드 든 왕, 도롱뇽)

### 컵 (14) — 앞에 CUPS 수트 블록

**cups-01 · 컵 에이스 (Ace of Cups)**
`Scene: A hand emerges from a gold-rimmed cloud holding a celadon chalice from which five streams of water overflow into a pond full of lotus blossoms; a white dove descends toward the cup carrying a small round wafer; peaceful.`
(넘치는 잔, 연꽃 연못, 비둘기)

**cups-02 · 컵 2**
`Scene: A young man and a young woman in hanbok face each other, each holding out a celadon cup toward the other in a pledge; above them floats a winged lion's head over a staff entwined by two serpents; a small hanok house on a hill behind.`
(잔을 맞대는 두 사람, 날개 달린 사자 머리)

**cups-03 · 컵 3**
`Scene: Three young women in flowing bright hanbok dance in a circle raising three celadon cups high in a toast, amid an autumn harvest of pumpkins, grapes and fruit; joyful celebration.`
(세 여인의 건배 춤)

**cups-04 · 컵 4**
`Scene: A young man sits under a tree with arms and legs crossed, staring dully at three celadon cups standing on the grass before him, ignoring a fourth cup being offered by a hand from a small cloud beside him.`
(나무 아래 무심한 남자, 잔 셋 + 구름의 잔 하나)

**cups-05 · 컵 5**
`Scene: A figure in a long black cloak stands with head bowed, looking down at three celadon cups that have fallen over and spilled; two cups still stand upright behind him; a river and a stone bridge leading to a hanok castle in the distance.`
(검은 망토, 쓰러진 잔 셋, 서 있는 잔 둘)

**cups-06 · 컵 6**
`Scene: In a sunny hanok courtyard a boy offers a celadon cup filled with a white flower to a smaller girl; six cups each holding a white flower are arranged around them; an old guard walks away in the background; nostalgic and gentle.`
(꽃 담긴 잔을 건네는 아이들, 잔 여섯)

**cups-07 · 컵 7**
`Scene: A man seen from behind as a dark silhouette gazes up at seven celadon cups floating in glowing clouds, each holding a different vision: a beautiful face, a veiled glowing figure, a serpent, a castle tower, glittering jewels, a laurel wreath, and a small dragon.`
(구름 위 환상의 잔 일곱)

**cups-08 · 컵 8**
`Scene: Under a night sky with an eclipsed moon, a man in a red cloak walks away with a staff toward barren mountains, leaving behind eight celadon cups stacked neatly in two rows on the shore of a still pool.`
(잔 여덟을 두고 떠나는 남자, 일식의 달)

**cups-09 · 컵 9**
`Scene: A plump satisfied man in a fine robe sits on a wooden bench with arms folded and a contented smile; behind him a curved shelf draped in blue cloth displays nine celadon cups in an arc.`
(팔짱 낀 만족한 남자, 아치형 잔 아홉)

**cups-10 · 컵 10**
`Scene: A couple stand side by side with arms raised in joy, two children dance holding hands beside them; above them arcs a rainbow holding ten celadon cups; a peaceful hanok house, river and green hills.`
(무지개 위 잔 열, 행복한 가족)

**cups-page · 컵 페이지**
`Scene: A young page in a tunic patterned with lotus flowers and a soft beret stands at the seashore, holding up a celadon cup from which a small fish pokes its head, looking at it with amusement; gentle waves behind.`
(물고기가 나오는 잔을 든 시종)

**cups-knight · 컵 나이트**
`Scene: A knight in a winged helmet rides a calm white horse at a slow walk, holding a celadon cup forward in one hand as if offering it; a quiet river and low hills; dreamy and graceful.`
(잔을 든 채 천천히 가는 기사)

**cups-queen · 컵 퀸**
`Scene: A queen sits on an ornate shell-shaped throne at the water's edge, gazing intently at a large closed ornate celadon cup with angel-shaped handles held in both hands; pebbles and clear water at her feet, cliffs behind.`
(닫힌 화려한 잔을 응시하는 여왕)

**cups-king · 컵 킹**
`Scene: A king in a blue robe sits calmly on a stone throne that floats on a choppy sea, holding a celadon cup in one hand and a short scepter in the other; a fish leaps from the water on one side and a ship sails on the other.`
(바다 위 왕좌의 왕, 물고기와 배)

### 소드 (14) — 앞에 SWORDS 수트 블록

**swords-01 · 소드 에이스 (Ace of Swords)**
`Scene: A hand emerges from a gold-rimmed cloud gripping a single upright silver sword whose tip passes through a golden crown hung with laurel and olive branches; barren grey mountains below.`
(왕관을 꿴 검 하나)

**swords-02 · 소드 2**
`Scene: A blindfolded woman in a white robe sits on a stone bench at the shore holding two silver swords crossed over her chest, perfectly balanced; a crescent moon in the sky, calm water with scattered rocks behind her.`
(눈가리개, 교차한 검 둘, 초승달)

**swords-03 · 소드 3**
`Scene: A large red heart floats in the center pierced by three silver swords, against a grey stormy sky with falling rain; no people; stark and simple.`
(검 셋에 꿰인 심장, 비)

**swords-04 · 소드 4**
`Scene: Inside a quiet stone chapel a knight lies still in full armor on top of a tomb, hands pressed together in prayer; three swords hang on the wall above him and a fourth is carved on the side of the tomb; soft light through a latticed hanok window.`
(누운 기사, 벽의 검 셋 + 조각된 검 하나)

**swords-05 · 소드 5**
`Scene: A smirking man gathers three silver swords into his arms while two defeated figures walk away with slumped shoulders toward the water; two more swords lie on the ground; a windy sky with ragged clouds.`
(검 셋 챙기는 남자, 떠나는 둘, 바닥의 검 둘)

**swords-06 · 소드 6**
`Scene: A ferryman poles a small wooden boat across calm grey water toward a far green shore; a cloaked woman and a child sit huddled in the boat; six silver swords stand upright in the bow.`
(배로 건너는 여인과 아이, 검 여섯)

**swords-07 · 소드 7**
`Scene: A man tiptoes away from a camp of colorful tents carrying five silver swords bundled in his arms, glancing back over his shoulder with a sly smile; two swords remain stuck upright in the ground behind him.`
(검 다섯 훔쳐 가는 남자, 남은 검 둘)

**swords-08 · 소드 8**
`Scene: A blindfolded woman loosely bound with cloth stands in shallow mud amid eight silver swords planted upright around her, not touching her; a castle on a cliff behind; the bindings clearly loose.`
(느슨히 묶인 눈가리개 여인, 검 여덟)

**swords-09 · 소드 9**
`Scene: A person sits up in bed in the dark night with face buried in both hands; nine silver swords hang horizontally on the black wall above; the quilt is patterned with roses and small zodiac symbols.`
(침대에서 얼굴 감싼 사람, 벽의 검 아홉)

**swords-10 · 소드 10**
`Scene: Under a black night sky with the first gold of dawn on the horizon, a figure lies face down and still on the shore of calm water, ten silver swords planted upright in a row along his back and the ground beside him; no blood; quiet finality.`
(엎드린 인물, 등을 따라 꽂힌 검 열)
 · 거부되면: `a figure resting face-down on a shore with ten swords planted upright in the ground in a row beside and over him, dawn breaking`

**swords-page · 소드 페이지**
`Scene: A watchful young page stands on uneven rocky ground holding a silver sword upright with both hands, looking sharply to the side; strong wind blows the hair and the clouds; birds fly in the sky.`
(바람 속의 시종)

**swords-knight · 소드 나이트**
`Scene: A knight charges at full gallop on a white horse, sword raised high, cloak flying, leaning into the wind; storm clouds race and trees bend behind; fierce speed.`
(전속력으로 달리는 기사)

**swords-queen · 소드 퀸**
`Scene: A stern queen seen in profile sits on a stone throne carved with butterflies and a small cherub, raising a silver sword upright in her right hand while her left hand extends outward; grey clouds gather, a single bird flies high.`
(옆모습 여왕, 검을 세움)

**swords-king · 소드 킹**
`Scene: A king faces the viewer on a stone throne carved with butterflies and crescent moons, holding a silver sword slightly tilted in his right hand, expression grave and clear; two birds fly and low clouds drift behind.`
(정면 왕, 기울인 검, 새 두 마리)

### 펜타클 (14) — 앞에 PENTACLES 수트 블록

**pentacles-01 · 펜타클 에이스 (Ace of Pentacles)**
`Scene: A hand emerges from a gold-rimmed cloud holding a large gold pentacle coin above a walled garden of white lilies; an arched gateway of roses opens onto distant blue mountains.`
(황금 코인 하나, 백합 정원, 장미 아치)

**pentacles-02 · 펜타클 2**
`Scene: A young man in a tall hat dances on one foot juggling two gold pentacle coins connected by a green ribbon looped into an infinity shape; behind him two ships ride huge stylized waves.`
(무한대 리본으로 이어진 코인 둘, 큰 파도의 배 둘)

**pentacles-03 · 펜타클 3**
`Scene: A young stone craftsman stands on a bench chiseling the arch of a temple gate while a monk and a robed figure holding a drawing consult him; three gold pentacle coins are carved into the arch above.`
(장인과 상담하는 둘, 아치에 새겨진 코인 셋)

**pentacles-04 · 펜타클 4**
`Scene: A crowned man sits stiffly on a stone stool clutching one gold pentacle coin tightly to his chest, another balanced on top of his crown, and two more pressed under his feet; a walled city behind him.`
(코인을 움켜쥔 남자, 머리 위 하나, 발밑 둘)

**pentacles-05 · 펜타클 5**
`Scene: Two ragged figures, one on crutches, trudge barefoot through falling snow at night past the glowing latticed window of a temple; the window's lattice pattern holds five gold pentacle coins; cold and lonely.`
(눈 속 두 사람, 빛나는 창의 코인 다섯)

**pentacles-06 · 펜타클 6**
`Scene: A wealthy merchant in a fine robe holds a balanced scale in one hand and drops coins into the hands of two kneeling beggars with the other; six gold pentacle coins float arranged above; a hanok town behind.`
(저울 든 상인, 무릎 꿇은 둘, 코인 여섯)

**pentacles-07 · 펜타클 7**
`Scene: A young farmer leans on a long hoe, chin on his hands, gazing thoughtfully at a leafy vine that has grown seven gold pentacle coins like fruit; a plowed field and blue mountains.`
(괭이에 기대 열매 같은 코인 일곱을 보는 농부)

**pentacles-08 · 펜타클 8**
`Scene: A focused craftsman sits at a workbench carving a gold pentacle coin with a small chisel; six finished coins hang in a column on a wooden post beside him and one lies on the ground; a hanok town far in the distance.`
(코인을 새기는 장인, 기둥에 걸린 코인 여섯 + 바닥 하나 + 작업 중 하나)

**pentacles-09 · 펜타클 9**
`Scene: An elegant woman in a long robe patterned with flowers stands alone in a lush vineyard garden, a hooded falcon perched on her gloved hand; nine gold pentacle coins nestle among the grapevines; a small snail crawls at her feet; a manor behind.`
(매를 든 여인, 포도밭의 코인 아홉, 달팽이)

**pentacles-10 · 펜타클 10**
`Scene: Under a stone archway an old white-bearded man in a patterned robe sits with two dogs, watching a young couple and a child in a bustling hanok courtyard; ten gold pentacle coins are arranged over the scene in a tree-of-life pattern; family crests on the arch.`
(노인과 개, 가족, 생명나무 배열의 코인 열)

**pentacles-page · 펜타클 페이지**
`Scene: A youth in a green tunic and red cap stands in a flowering meadow holding a single gold pentacle coin up with both hands, gazing at it with full attention; a plowed field and a small grove behind.`
(코인을 응시하는 시종)

**pentacles-knight · 펜타클 나이트**
`Scene: A knight in dark armor sits motionless on a heavy black horse in the middle of a plowed field, holding a gold pentacle coin steadily in one hand and looking ahead; oak leaves on his helmet and the horse's bridle; patient and solid.`
(멈춰 선 검은 말의 기사)

**pentacles-queen · 펜타클 퀸**
`Scene: A queen sits on a throne carved with fruit, goats and cherubs inside a bower of roses in a garden, looking down at a gold pentacle coin held in her lap; a rabbit sits at the corner of the frame; fertile and warm.`
(장미 정자 안의 여왕, 토끼)

**pentacles-king · 펜타클 킹**
`Scene: A king in a robe patterned with grapes and vines sits on a throne carved with bull heads, holding a short scepter in one hand and resting a gold pentacle coin on his knee with the other; his armored foot rests on a carved bull; his castle behind him.`
(포도 무늬 왕, 황소 왕좌, 코인)

## 6. 검수 체크리스트

각 이미지에 대해:

- [ ] 글자·숫자·서명·워터마크 없음 (가장 흔한 실패, 있으면 재생성)
- [ ] 테두리·카드 모양 없음, 전면 일러스트만
- [ ] **상징 개수** 정확 (완드 8개, 컵 9개 등 — 마이너 숫자 카드에서 가장 자주 틀림)
- [ ] 얼굴·손 정상
- [ ] 주요 피사체가 중앙 90% 안에 있음 (좌우가 조금 잘려도 되도록 7:12 중앙 크롭)
- [ ] 기준 카드와 팔레트·선 굵기·종이 질감 일치
- [ ] 뒷면은 180° 회전해도 같아 보임

파일 저장: `assets-src/tarot/raw/<cardId>.png` (예: `major-00.png`, `wands-page.png`, `back.png`). 78 + 1 = 79장.

## 7. 진행표

| 묶음 | cardId | 상태 |
|---|---|---|
| 뒷면 | back | |
| 메이저 | major-00 ~ major-21 (22) | |
| 완드 | wands-01 ~ wands-10, wands-page/knight/queen/king (14) | |
| 컵 | cups-01 ~ cups-10, cups-page/knight/queen/king (14) | |
| 소드 | swords-01 ~ swords-10, swords-page/knight/queen/king (14) | |
| 펜타클 | pentacles-01 ~ pentacles-10, pentacles-page/knight/queen/king (14) | |
