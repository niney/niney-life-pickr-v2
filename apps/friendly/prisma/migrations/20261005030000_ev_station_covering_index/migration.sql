-- DropIndex
DROP INDEX "ev_stations_lat_lng_idx";

-- CreateIndex
CREATE INDEX "ev_stations_lat_lng_availableCount_hasFast_parkingFree_limited_idx" ON "ev_stations"("lat", "lng", "availableCount", "hasFast", "parkingFree", "limited");
