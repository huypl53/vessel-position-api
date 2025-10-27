-- CreateTable
CREATE TABLE "Vessel" (
    "id" TEXT NOT NULL,
    "mmsi" TEXT,
    "imo" TEXT,
    "name" TEXT,
    "callsign" TEXT,
    "flag" TEXT,
    "vesselType" TEXT,
    "vesselTypeCode" INTEGER,
    "length" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "draught" DOUBLE PRECISION,
    "deadweight" INTEGER,
    "grossTonnage" INTEGER,
    "yearBuilt" INTEGER,
    "builder" TEXT,
    "status" TEXT,
    "destination" TEXT,
    "eta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastCrawled" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vessel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VesselPosition" (
    "id" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "course" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VesselPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VesselImage" (
    "id" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "bucketName" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "url" TEXT,
    "imageType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VesselImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vessel_mmsi_key" ON "Vessel"("mmsi");

-- CreateIndex
CREATE UNIQUE INDEX "Vessel_imo_key" ON "Vessel"("imo");

-- CreateIndex
CREATE INDEX "Vessel_mmsi_idx" ON "Vessel"("mmsi");

-- CreateIndex
CREATE INDEX "Vessel_imo_idx" ON "Vessel"("imo");

-- CreateIndex
CREATE INDEX "Vessel_lastCrawled_idx" ON "Vessel"("lastCrawled");

-- CreateIndex
CREATE INDEX "VesselPosition_vesselId_idx" ON "VesselPosition"("vesselId");

-- CreateIndex
CREATE INDEX "VesselPosition_timestamp_idx" ON "VesselPosition"("timestamp");

-- CreateIndex
CREATE INDEX "VesselImage_vesselId_idx" ON "VesselImage"("vesselId");

-- AddForeignKey
ALTER TABLE "VesselPosition" ADD CONSTRAINT "VesselPosition_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VesselImage" ADD CONSTRAINT "VesselImage_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
