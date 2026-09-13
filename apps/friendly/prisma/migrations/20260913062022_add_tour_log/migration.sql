-- CreateTable
CREATE TABLE "tour_places" (
    "id" TEXT NOT NULL PRIMARY KEY,
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

-- CreateTable
CREATE TABLE "tour_trips" (
    "id" TEXT NOT NULL PRIMARY KEY,
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

-- CreateTable
CREATE TABLE "tour_visits" (
    "id" TEXT NOT NULL PRIMARY KEY,
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

-- CreateTable
CREATE TABLE "tour_activities" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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

-- CreateTable
CREATE TABLE "tour_spend" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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

-- CreateTable
CREATE TABLE "tour_transitions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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

-- CreateTable
CREATE TABLE "tour_day_sequences" (
    "id" TEXT NOT NULL PRIMARY KEY,
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

-- CreateTable
CREATE TABLE "tour_companions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "travelId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "relCd" TEXT,
    "relNm" TEXT,
    "genderNm" TEXT,
    "ageNm" TEXT,
    "situationNm" TEXT
);

-- CreateTable
CREATE TABLE "tour_photos" (
    "id" TEXT NOT NULL PRIMARY KEY,
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

-- CreateTable
CREATE TABLE "tour_codes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cdA" TEXT NOT NULL,
    "groupNm" TEXT,
    "cdB" TEXT NOT NULL,
    "cdNm" TEXT,
    "orderNum" INTEGER,
    "delFlag" TEXT
);

-- CreateIndex
CREATE INDEX "tour_places_lat_lng_idx" ON "tour_places"("lat", "lng");

-- CreateIndex
CREATE INDEX "tour_places_typeShort_nTravelers_idx" ON "tour_places"("typeShort", "nTravelers");

-- CreateIndex
CREATE INDEX "tour_places_isJeju_typeShort_idx" ON "tour_places"("isJeju", "typeShort");

-- CreateIndex
CREATE INDEX "tour_trips_ageGrp_accompany_nights_idx" ON "tour_trips"("ageGrp", "accompany", "nights");

-- CreateIndex
CREATE INDEX "tour_trips_nJeju_idx" ON "tour_trips"("nJeju");

-- CreateIndex
CREATE INDEX "tour_trips_month_idx" ON "tour_trips"("month");

-- CreateIndex
CREATE INDEX "tour_visits_placeId_idx" ON "tour_visits"("placeId");

-- CreateIndex
CREATE INDEX "tour_visits_travelId_visitOrder_idx" ON "tour_visits"("travelId", "visitOrder");

-- CreateIndex
CREATE INDEX "tour_visits_isJeju_typeShort_isPrivate_idx" ON "tour_visits"("isJeju", "typeShort", "isPrivate");

-- CreateIndex
CREATE INDEX "tour_visits_emd_idx" ON "tour_visits"("emd");

-- CreateIndex
CREATE INDEX "tour_activities_placeId_idx" ON "tour_activities"("placeId");

-- CreateIndex
CREATE INDEX "tour_activities_travelId_visitAreaId_idx" ON "tour_activities"("travelId", "visitAreaId");

-- CreateIndex
CREATE INDEX "tour_spend_placeId_idx" ON "tour_spend"("placeId");

-- CreateIndex
CREATE INDEX "tour_spend_brno_idx" ON "tour_spend"("brno");

-- CreateIndex
CREATE INDEX "tour_spend_travelId_idx" ON "tour_spend"("travelId");

-- CreateIndex
CREATE INDEX "tour_transitions_fromPlaceId_idx" ON "tour_transitions"("fromPlaceId");

-- CreateIndex
CREATE INDEX "tour_transitions_toPlaceId_idx" ON "tour_transitions"("toPlaceId");

-- CreateIndex
CREATE INDEX "tour_transitions_fromType_toType_idx" ON "tour_transitions"("fromType", "toType");

-- CreateIndex
CREATE INDEX "tour_transitions_travelId_idx" ON "tour_transitions"("travelId");

-- CreateIndex
CREATE INDEX "tour_day_sequences_isJejuDay_idx" ON "tour_day_sequences"("isJejuDay");

-- CreateIndex
CREATE INDEX "tour_day_sequences_travelId_idx" ON "tour_day_sequences"("travelId");

-- CreateIndex
CREATE INDEX "tour_companions_travelId_idx" ON "tour_companions"("travelId");

-- CreateIndex
CREATE INDEX "tour_photos_placeId_idx" ON "tour_photos"("placeId");

-- CreateIndex
CREATE INDEX "tour_photos_travelId_idx" ON "tour_photos"("travelId");

-- CreateIndex
CREATE INDEX "tour_codes_cdA_idx" ON "tour_codes"("cdA");
