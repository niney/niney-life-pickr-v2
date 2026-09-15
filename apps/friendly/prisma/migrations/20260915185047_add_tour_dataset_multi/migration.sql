-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_tour_activities" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dataset" TEXT NOT NULL DEFAULT 'jeju',
    "travelId" TEXT NOT NULL,
    "visitAreaId" TEXT NOT NULL,
    "placeId" TEXT,
    "isPrivate" BOOLEAN NOT NULL,
    "typeCd" TEXT NOT NULL,
    "typeNm" TEXT,
    "seq" INTEGER NOT NULL,
    "detail" TEXT,
    "rsvtYn" TEXT,
    "expndSe" TEXT,
    "expndNm" TEXT,
    "admissionNm" TEXT,
    "visitDate" TEXT,
    "dayIndex" INTEGER,
    "visitTypeCd" TEXT,
    "visitTypeNm" TEXT,
    "region" TEXT,
    "isJeju" BOOLEAN NOT NULL,
    "gender" TEXT,
    "ageGrp" TEXT,
    "accompany" TEXT,
    "month" INTEGER
);
INSERT INTO "new_tour_activities" ("accompany", "admissionNm", "ageGrp", "dayIndex", "detail", "expndNm", "expndSe", "gender", "id", "isJeju", "isPrivate", "month", "placeId", "region", "rsvtYn", "seq", "travelId", "typeCd", "typeNm", "visitAreaId", "visitDate", "visitTypeCd", "visitTypeNm") SELECT "accompany", "admissionNm", "ageGrp", "dayIndex", "detail", "expndNm", "expndSe", "gender", "id", "isJeju", "isPrivate", "month", "placeId", "region", "rsvtYn", "seq", "travelId", "typeCd", "typeNm", "visitAreaId", "visitDate", "visitTypeCd", "visitTypeNm" FROM "tour_activities";
DROP TABLE "tour_activities";
ALTER TABLE "new_tour_activities" RENAME TO "tour_activities";
CREATE INDEX "tour_activities_placeId_idx" ON "tour_activities"("placeId");
CREATE INDEX "tour_activities_travelId_visitAreaId_idx" ON "tour_activities"("travelId", "visitAreaId");
CREATE INDEX "tour_activities_dataset_idx" ON "tour_activities"("dataset");
CREATE TABLE "new_tour_companions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dataset" TEXT NOT NULL DEFAULT 'jeju',
    "travelId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "relCd" TEXT,
    "relNm" TEXT,
    "genderNm" TEXT,
    "ageNm" TEXT,
    "situationNm" TEXT
);
INSERT INTO "new_tour_companions" ("ageNm", "genderNm", "id", "relCd", "relNm", "seq", "situationNm", "travelId") SELECT "ageNm", "genderNm", "id", "relCd", "relNm", "seq", "situationNm", "travelId" FROM "tour_companions";
DROP TABLE "tour_companions";
ALTER TABLE "new_tour_companions" RENAME TO "tour_companions";
CREATE INDEX "tour_companions_travelId_idx" ON "tour_companions"("travelId");
CREATE INDEX "tour_companions_dataset_idx" ON "tour_companions"("dataset");
CREATE TABLE "new_tour_day_sequences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dataset" TEXT NOT NULL DEFAULT 'jeju',
    "sidos" TEXT,
    "travelId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "visitDate" TEXT,
    "nStops" INTEGER NOT NULL,
    "typeSeq" TEXT NOT NULL,
    "placeSeq" TEXT,
    "placeIds" TEXT,
    "isJejuDay" BOOLEAN NOT NULL,
    "isLastDay" BOOLEAN NOT NULL,
    "gender" TEXT,
    "ageGrp" TEXT,
    "accompany" TEXT,
    "residenceSido" TEXT,
    "nights" INTEGER,
    "month" INTEGER
);
INSERT INTO "new_tour_day_sequences" ("accompany", "ageGrp", "dayIndex", "gender", "id", "isJejuDay", "isLastDay", "month", "nStops", "nights", "placeIds", "placeSeq", "residenceSido", "travelId", "typeSeq", "visitDate") SELECT "accompany", "ageGrp", "dayIndex", "gender", "id", "isJejuDay", "isLastDay", "month", "nStops", "nights", "placeIds", "placeSeq", "residenceSido", "travelId", "typeSeq", "visitDate" FROM "tour_day_sequences";
DROP TABLE "tour_day_sequences";
ALTER TABLE "new_tour_day_sequences" RENAME TO "tour_day_sequences";
CREATE INDEX "tour_day_sequences_isJejuDay_idx" ON "tour_day_sequences"("isJejuDay");
CREATE INDEX "tour_day_sequences_travelId_idx" ON "tour_day_sequences"("travelId");
CREATE INDEX "tour_day_sequences_dataset_idx" ON "tour_day_sequences"("dataset");
CREATE TABLE "new_tour_photos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dataset" TEXT NOT NULL DEFAULT 'jeju',
    "travelId" TEXT,
    "visitAreaId" TEXT,
    "placeId" TEXT,
    "placeName" TEXT,
    "takenTs" TEXT,
    "takenHour" INTEGER,
    "takenDate" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "hasThumb" BOOLEAN NOT NULL,
    "caption" TEXT,
    "captionTokens" INTEGER,
    "landmark" TEXT,
    "hasCaption" BOOLEAN NOT NULL,
    "visitTypeCd" TEXT,
    "visitTypeNm" TEXT,
    "region" TEXT,
    "isJeju" BOOLEAN NOT NULL,
    "dayIndex" INTEGER,
    "source" TEXT NOT NULL,
    "seq" INTEGER,
    "gender" TEXT,
    "ageGrp" TEXT,
    "accompany" TEXT,
    "month" INTEGER,
    "nights" INTEGER
);
INSERT INTO "new_tour_photos" ("accompany", "ageGrp", "caption", "captionTokens", "dayIndex", "gender", "hasCaption", "hasThumb", "height", "id", "isJeju", "landmark", "month", "nights", "placeId", "placeName", "region", "seq", "source", "takenDate", "takenHour", "takenTs", "travelId", "visitAreaId", "visitTypeCd", "visitTypeNm", "width") SELECT "accompany", "ageGrp", "caption", "captionTokens", "dayIndex", "gender", "hasCaption", "hasThumb", "height", "id", "isJeju", "landmark", "month", "nights", "placeId", "placeName", "region", "seq", "source", "takenDate", "takenHour", "takenTs", "travelId", "visitAreaId", "visitTypeCd", "visitTypeNm", "width" FROM "tour_photos";
DROP TABLE "tour_photos";
ALTER TABLE "new_tour_photos" RENAME TO "tour_photos";
CREATE INDEX "tour_photos_placeId_idx" ON "tour_photos"("placeId");
CREATE INDEX "tour_photos_travelId_idx" ON "tour_photos"("travelId");
CREATE INDEX "tour_photos_dataset_idx" ON "tour_photos"("dataset");
CREATE TABLE "new_tour_places" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dataset" TEXT NOT NULL DEFAULT 'jeju',
    "name" TEXT NOT NULL,
    "aliases" TEXT,
    "typeCd" TEXT NOT NULL,
    "typeNm" TEXT,
    "typeShort" TEXT NOT NULL,
    "poiId" TEXT,
    "roadAddr" TEXT,
    "lotAddr" TEXT,
    "lat" REAL,
    "lng" REAL,
    "sido" TEXT,
    "sigungu" TEXT,
    "emd" TEXT,
    "region" TEXT,
    "isJeju" BOOLEAN NOT NULL,
    "isIsland" BOOLEAN NOT NULL,
    "nVisits" INTEGER NOT NULL,
    "nTravelers" INTEGER NOT NULL,
    "nRated" INTEGER NOT NULL,
    "meanDgstfn" REAL,
    "bayesScore" REAL,
    "meanRevisitInt" REAL,
    "meanRcmdInt" REAL,
    "revisitRate" REAL,
    "stayMedian" REAL,
    "nPhotos" INTEGER NOT NULL,
    "spendPpMedian" REAL,
    "spendN" INTEGER NOT NULL,
    "nActivities" INTEGER NOT NULL,
    "topReasonNm" TEXT,
    "nLodging" INTEGER NOT NULL,
    "lodgingTypeNm" TEXT,
    "firstSeen" TEXT,
    "lastSeen" TEXT,
    "firstDayShare" REAL,
    "searchText" TEXT
);
INSERT INTO "new_tour_places" ("aliases", "bayesScore", "emd", "firstDayShare", "firstSeen", "id", "isIsland", "isJeju", "lastSeen", "lat", "lng", "lodgingTypeNm", "lotAddr", "meanDgstfn", "meanRcmdInt", "meanRevisitInt", "nActivities", "nLodging", "nPhotos", "nRated", "nTravelers", "nVisits", "name", "poiId", "region", "revisitRate", "roadAddr", "searchText", "sido", "sigungu", "spendN", "spendPpMedian", "stayMedian", "topReasonNm", "typeCd", "typeNm", "typeShort") SELECT "aliases", "bayesScore", "emd", "firstDayShare", "firstSeen", "id", "isIsland", "isJeju", "lastSeen", "lat", "lng", "lodgingTypeNm", "lotAddr", "meanDgstfn", "meanRcmdInt", "meanRevisitInt", "nActivities", "nLodging", "nPhotos", "nRated", "nTravelers", "nVisits", "name", "poiId", "region", "revisitRate", "roadAddr", "searchText", "sido", "sigungu", "spendN", "spendPpMedian", "stayMedian", "topReasonNm", "typeCd", "typeNm", "typeShort" FROM "tour_places";
DROP TABLE "tour_places";
ALTER TABLE "new_tour_places" RENAME TO "tour_places";
CREATE INDEX "tour_places_lat_lng_idx" ON "tour_places"("lat", "lng");
CREATE INDEX "tour_places_typeShort_nTravelers_idx" ON "tour_places"("typeShort", "nTravelers");
CREATE INDEX "tour_places_isJeju_typeShort_idx" ON "tour_places"("isJeju", "typeShort");
CREATE INDEX "tour_places_dataset_idx" ON "tour_places"("dataset");
CREATE INDEX "tour_places_sido_typeShort_idx" ON "tour_places"("sido", "typeShort");
CREATE TABLE "new_tour_spend" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dataset" TEXT NOT NULL DEFAULT 'jeju',
    "travelId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "categoryCd" TEXT NOT NULL,
    "visitAreaId" TEXT,
    "placeId" TEXT,
    "subtypeCd" TEXT,
    "subtypeNm" TEXT,
    "item" TEXT,
    "storeNm" TEXT,
    "brno" TEXT,
    "amount" REAL,
    "payNum" INTEGER,
    "perPerson" REAL,
    "methodCd" TEXT,
    "methodNm" TEXT,
    "paidTs" TEXT,
    "paidHour" INTEGER,
    "rsvtYn" TEXT,
    "etcText" TEXT,
    "roadAddr" TEXT,
    "sggCd" TEXT,
    "dayIndex" INTEGER,
    "gender" TEXT,
    "ageGrp" TEXT,
    "accompany" TEXT,
    "residenceSido" TEXT,
    "nights" INTEGER,
    "month" INTEGER
);
INSERT INTO "new_tour_spend" ("accompany", "ageGrp", "amount", "brno", "category", "categoryCd", "dayIndex", "etcText", "gender", "id", "item", "methodCd", "methodNm", "month", "nights", "paidHour", "paidTs", "payNum", "perPerson", "placeId", "residenceSido", "roadAddr", "rsvtYn", "sggCd", "storeNm", "subtypeCd", "subtypeNm", "travelId", "visitAreaId") SELECT "accompany", "ageGrp", "amount", "brno", "category", "categoryCd", "dayIndex", "etcText", "gender", "id", "item", "methodCd", "methodNm", "month", "nights", "paidHour", "paidTs", "payNum", "perPerson", "placeId", "residenceSido", "roadAddr", "rsvtYn", "sggCd", "storeNm", "subtypeCd", "subtypeNm", "travelId", "visitAreaId" FROM "tour_spend";
DROP TABLE "tour_spend";
ALTER TABLE "new_tour_spend" RENAME TO "tour_spend";
CREATE INDEX "tour_spend_placeId_idx" ON "tour_spend"("placeId");
CREATE INDEX "tour_spend_brno_idx" ON "tour_spend"("brno");
CREATE INDEX "tour_spend_travelId_idx" ON "tour_spend"("travelId");
CREATE INDEX "tour_spend_dataset_idx" ON "tour_spend"("dataset");
CREATE TABLE "new_tour_transitions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dataset" TEXT NOT NULL DEFAULT 'jeju',
    "fromSido" TEXT,
    "toSido" TEXT,
    "travelId" TEXT NOT NULL,
    "dayIndex" INTEGER,
    "fromVisitId" TEXT NOT NULL,
    "toVisitId" TEXT NOT NULL,
    "fromPlaceId" TEXT,
    "toPlaceId" TEXT,
    "fromName" TEXT,
    "toName" TEXT,
    "fromTypeCd" TEXT,
    "toTypeCd" TEXT,
    "fromType" TEXT,
    "toType" TEXT,
    "mvmnCd" TEXT,
    "mvmnNm" TEXT,
    "travelMin" INTEGER,
    "sameDay" BOOLEAN NOT NULL,
    "viaPrivate" BOOLEAN NOT NULL,
    "bothJeju" BOOLEAN NOT NULL,
    "fromRegion" TEXT,
    "toRegion" TEXT,
    "gender" TEXT,
    "ageGrp" TEXT,
    "accompany" TEXT,
    "residenceSido" TEXT,
    "nights" INTEGER,
    "month" INTEGER
);
INSERT INTO "new_tour_transitions" ("accompany", "ageGrp", "bothJeju", "dayIndex", "fromName", "fromPlaceId", "fromRegion", "fromType", "fromTypeCd", "fromVisitId", "gender", "id", "month", "mvmnCd", "mvmnNm", "nights", "residenceSido", "sameDay", "toName", "toPlaceId", "toRegion", "toType", "toTypeCd", "toVisitId", "travelId", "travelMin", "viaPrivate") SELECT "accompany", "ageGrp", "bothJeju", "dayIndex", "fromName", "fromPlaceId", "fromRegion", "fromType", "fromTypeCd", "fromVisitId", "gender", "id", "month", "mvmnCd", "mvmnNm", "nights", "residenceSido", "sameDay", "toName", "toPlaceId", "toRegion", "toType", "toTypeCd", "toVisitId", "travelId", "travelMin", "viaPrivate" FROM "tour_transitions";
DROP TABLE "tour_transitions";
ALTER TABLE "new_tour_transitions" RENAME TO "tour_transitions";
CREATE INDEX "tour_transitions_fromPlaceId_idx" ON "tour_transitions"("fromPlaceId");
CREATE INDEX "tour_transitions_toPlaceId_idx" ON "tour_transitions"("toPlaceId");
CREATE INDEX "tour_transitions_fromType_toType_idx" ON "tour_transitions"("fromType", "toType");
CREATE INDEX "tour_transitions_travelId_idx" ON "tour_transitions"("travelId");
CREATE INDEX "tour_transitions_dataset_idx" ON "tour_transitions"("dataset");
CREATE INDEX "tour_transitions_fromSido_toSido_idx" ON "tour_transitions"("fromSido", "toSido");
CREATE TABLE "new_tour_trips" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dataset" TEXT NOT NULL DEFAULT 'jeju',
    "visitSidos" TEXT,
    "travelerLabel" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "nights" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "startWeekday" INTEGER,
    "personaMission" TEXT,
    "missionCodes" TEXT,
    "missionNames" TEXT,
    "mvmnNm" TEXT,
    "gender" TEXT,
    "ageGrp" TEXT,
    "residenceSido" TEXT,
    "accompany" TEXT,
    "companionsNum" INTEGER,
    "destination" TEXT,
    "style1" INTEGER,
    "style2" INTEGER,
    "style3" INTEGER,
    "style4" INTEGER,
    "style5" INTEGER,
    "style6" INTEGER,
    "style7" INTEGER,
    "style8" INTEGER,
    "motive1Nm" TEXT,
    "motive2Nm" TEXT,
    "motive3Nm" TEXT,
    "nVisits" INTEGER NOT NULL,
    "nPublic" INTEGER NOT NULL,
    "nJeju" INTEGER NOT NULL,
    "nIsland" INTEGER NOT NULL,
    "nPhotos" INTEGER NOT NULL,
    "nActivities" INTEGER NOT NULL,
    "spendActivity" REAL,
    "spendLodge" REAL,
    "spendMove" REAL,
    "spendAdv" REAL,
    "spendTotal" REAL,
    "gpsKm" REAL,
    "gpsHours" REAL,
    "hasGps" BOOLEAN NOT NULL,
    "mainRegion" TEXT,
    "firstPlaceId" TEXT,
    "firstPlaceName" TEXT,
    "lastPlaceId" TEXT,
    "lastPlaceName" TEXT,
    "lodgingTypes" TEXT,
    "meanDgstfn" REAL,
    "regions" TEXT,
    "coverPhotoId" TEXT
);
INSERT INTO "new_tour_trips" ("accompany", "ageGrp", "companionsNum", "coverPhotoId", "destination", "endDate", "firstPlaceId", "firstPlaceName", "gender", "gpsHours", "gpsKm", "hasGps", "id", "lastPlaceId", "lastPlaceName", "lodgingTypes", "mainRegion", "meanDgstfn", "missionCodes", "missionNames", "month", "motive1Nm", "motive2Nm", "motive3Nm", "mvmnNm", "nActivities", "nIsland", "nJeju", "nPhotos", "nPublic", "nVisits", "nights", "personaMission", "regions", "residenceSido", "spendActivity", "spendAdv", "spendLodge", "spendMove", "spendTotal", "startDate", "startWeekday", "style1", "style2", "style3", "style4", "style5", "style6", "style7", "style8", "travelerLabel") SELECT "accompany", "ageGrp", "companionsNum", "coverPhotoId", "destination", "endDate", "firstPlaceId", "firstPlaceName", "gender", "gpsHours", "gpsKm", "hasGps", "id", "lastPlaceId", "lastPlaceName", "lodgingTypes", "mainRegion", "meanDgstfn", "missionCodes", "missionNames", "month", "motive1Nm", "motive2Nm", "motive3Nm", "mvmnNm", "nActivities", "nIsland", "nJeju", "nPhotos", "nPublic", "nVisits", "nights", "personaMission", "regions", "residenceSido", "spendActivity", "spendAdv", "spendLodge", "spendMove", "spendTotal", "startDate", "startWeekday", "style1", "style2", "style3", "style4", "style5", "style6", "style7", "style8", "travelerLabel" FROM "tour_trips";
DROP TABLE "tour_trips";
ALTER TABLE "new_tour_trips" RENAME TO "tour_trips";
CREATE INDEX "tour_trips_ageGrp_accompany_nights_idx" ON "tour_trips"("ageGrp", "accompany", "nights");
CREATE INDEX "tour_trips_nJeju_idx" ON "tour_trips"("nJeju");
CREATE INDEX "tour_trips_month_idx" ON "tour_trips"("month");
CREATE INDEX "tour_trips_dataset_idx" ON "tour_trips"("dataset");
CREATE TABLE "new_tour_visits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dataset" TEXT NOT NULL DEFAULT 'jeju',
    "travelId" TEXT NOT NULL,
    "visitAreaId" TEXT NOT NULL,
    "visitOrder" INTEGER NOT NULL,
    "dayIndex" INTEGER,
    "visitDate" TEXT NOT NULL,
    "arrivalTs" TEXT,
    "departTs" TEXT,
    "stayMin" INTEGER,
    "travelMinFromPrev" INTEGER,
    "travelMinRaw" INTEGER,
    "typeCd" TEXT NOT NULL,
    "typeNm" TEXT,
    "typeShort" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL,
    "privateRole" TEXT,
    "placeId" TEXT,
    "name" TEXT,
    "poiId" TEXT,
    "poiNm" TEXT,
    "roadAddr" TEXT,
    "lotAddr" TEXT,
    "lat" REAL,
    "lng" REAL,
    "sido" TEXT,
    "sigungu" TEXT,
    "emd" TEXT,
    "region" TEXT,
    "isJeju" BOOLEAN NOT NULL,
    "isIsland" BOOLEAN NOT NULL,
    "revisitYn" TEXT,
    "reasonCd" TEXT,
    "reasonNm" TEXT,
    "lodgingTypeCd" TEXT,
    "lodgingTypeNm" TEXT,
    "dgstfn" INTEGER,
    "revisitInt" INTEGER,
    "rcmdInt" INTEGER,
    "mvmnCd" TEXT,
    "mvmnNm" TEXT,
    "mvmnCd2" TEXT,
    "mvmnNm2" TEXT,
    "nPhotos" INTEGER NOT NULL,
    "nActivities" INTEGER NOT NULL,
    "spendSum" REAL,
    "spendPp" REAL,
    "prevPlaceId" TEXT,
    "nextPlaceId" TEXT,
    "arrivalHour" INTEGER,
    "arrivalWeekday" INTEGER,
    "gender" TEXT,
    "ageGrp" TEXT,
    "accompany" TEXT,
    "residenceSido" TEXT,
    "nights" INTEGER,
    "month" INTEGER,
    "personaMission" TEXT,
    "travelerLabel" TEXT
);
INSERT INTO "new_tour_visits" ("accompany", "ageGrp", "arrivalHour", "arrivalTs", "arrivalWeekday", "dayIndex", "departTs", "dgstfn", "emd", "gender", "id", "isIsland", "isJeju", "isPrivate", "lat", "lng", "lodgingTypeCd", "lodgingTypeNm", "lotAddr", "month", "mvmnCd", "mvmnCd2", "mvmnNm", "mvmnNm2", "nActivities", "nPhotos", "name", "nextPlaceId", "nights", "personaMission", "placeId", "poiId", "poiNm", "prevPlaceId", "privateRole", "rcmdInt", "reasonCd", "reasonNm", "region", "residenceSido", "revisitInt", "revisitYn", "roadAddr", "sido", "sigungu", "spendPp", "spendSum", "stayMin", "travelId", "travelMinFromPrev", "travelMinRaw", "travelerLabel", "typeCd", "typeNm", "typeShort", "visitAreaId", "visitDate", "visitOrder") SELECT "accompany", "ageGrp", "arrivalHour", "arrivalTs", "arrivalWeekday", "dayIndex", "departTs", "dgstfn", "emd", "gender", "id", "isIsland", "isJeju", "isPrivate", "lat", "lng", "lodgingTypeCd", "lodgingTypeNm", "lotAddr", "month", "mvmnCd", "mvmnCd2", "mvmnNm", "mvmnNm2", "nActivities", "nPhotos", "name", "nextPlaceId", "nights", "personaMission", "placeId", "poiId", "poiNm", "prevPlaceId", "privateRole", "rcmdInt", "reasonCd", "reasonNm", "region", "residenceSido", "revisitInt", "revisitYn", "roadAddr", "sido", "sigungu", "spendPp", "spendSum", "stayMin", "travelId", "travelMinFromPrev", "travelMinRaw", "travelerLabel", "typeCd", "typeNm", "typeShort", "visitAreaId", "visitDate", "visitOrder" FROM "tour_visits";
DROP TABLE "tour_visits";
ALTER TABLE "new_tour_visits" RENAME TO "tour_visits";
CREATE INDEX "tour_visits_placeId_idx" ON "tour_visits"("placeId");
CREATE INDEX "tour_visits_travelId_visitOrder_idx" ON "tour_visits"("travelId", "visitOrder");
CREATE INDEX "tour_visits_isJeju_typeShort_isPrivate_idx" ON "tour_visits"("isJeju", "typeShort", "isPrivate");
CREATE INDEX "tour_visits_emd_idx" ON "tour_visits"("emd");
CREATE INDEX "tour_visits_dataset_idx" ON "tour_visits"("dataset");
CREATE INDEX "tour_visits_sido_typeShort_isPrivate_idx" ON "tour_visits"("sido", "typeShort", "isPrivate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- 7차 보정: 시도 지역 필터가 쓰는 파생 열을 기존 행(제주 세트)에도 채운다. 로더(tour-master.service.ts)가 적재 뒤 같은 문장을
-- 데이터셋 단위로 실행하므로, 이 마이그레이션은 재적재 없이 운영 DB 를 맞추기 위한 1회 백필이다.
UPDATE "tour_trips" SET "visitSidos" = (
  SELECT ',' || group_concat(DISTINCT v."sido") || ','
  FROM "tour_visits" v
  WHERE v."travelId" = "tour_trips"."id" AND v."isPrivate" = 0 AND v."sido" IS NOT NULL
);
UPDATE "tour_day_sequences" SET "sidos" = (
  SELECT ',' || group_concat(DISTINCT v."sido") || ','
  FROM "tour_visits" v
  WHERE v."travelId" = "tour_day_sequences"."travelId" AND v."dayIndex" = "tour_day_sequences"."dayIndex" AND v."isPrivate" = 0 AND v."sido" IS NOT NULL
);
UPDATE "tour_transitions" SET
  "fromSido" = (SELECT v."sido" FROM "tour_visits" v WHERE v."id" = "tour_transitions"."travelId" || ':' || "tour_transitions"."fromVisitId"),
  "toSido" = (SELECT v."sido" FROM "tour_visits" v WHERE v."id" = "tour_transitions"."travelId" || ':' || "tour_transitions"."toVisitId");
