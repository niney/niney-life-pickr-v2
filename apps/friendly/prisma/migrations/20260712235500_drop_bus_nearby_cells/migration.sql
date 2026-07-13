-- 주변 정류장 셀 캐시 폐기 — nearby 가 정류소 마스터(load:bus-stations) 로컬
-- 바운딩박스 조회로 전환되어(지하철과 동일 설계) 더 이상 쓰지 않는다.
-- 두 테이블 모두 서울시 API 재수집 가능한 캐시라 데이터 손실 아님.

-- DropTable
DROP TABLE "bus_nearby_cell_hits";

-- DropTable
DROP TABLE "bus_nearby_cells";
