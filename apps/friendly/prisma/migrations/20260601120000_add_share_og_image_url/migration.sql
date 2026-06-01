-- AlterTable: owner 가 갤러리에서 고른 식당 사진의 원본 URL(네이버 호스트).
-- null = 미선택 → 토큰 시드로 결정적 랜덤. 특정 1장으로 OG 미리보기 고정용.
ALTER TABLE "settlement_sessions" ADD COLUMN "shareOgImageUrl" TEXT;
