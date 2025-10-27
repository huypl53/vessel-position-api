-- CreateTable
CREATE TABLE "Vessel" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "mmsi" TEXT,
    "imo" TEXT,
    "callSign" TEXT,
    "flag" TEXT,
    "type" TEXT,
    "subType" TEXT,
    "lengthMeters" DOUBLE PRECISION,
    "breadthMeters" DOUBLE PRECISION,
    "draughtMeters" DOUBLE PRECISION,
    "deadweightTons" DOUBLE PRECISION,
    "grossTonnage" DOUBLE PRECISION,
    "yearBuilt" INTEGER,
    "lastKnownLat" DOUBLE PRECISION,
    "lastKnownLon" DOUBLE PRECISION,
    "lastKnownAt" TIMESTAMP(3),
    "source" TEXT,
    "crawlerMetadata" JSONB,

    CONSTRAINT "Vessel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VesselImage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vesselId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectName" TEXT NOT NULL,
    "originalUrl" TEXT,
    "contentType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "sizeBytes" INTEGER,
    "checksum" TEXT,

    CONSTRAINT "VesselImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vessel_mmsi_key" ON "Vessel"("mmsi");

-- CreateIndex
CREATE UNIQUE INDEX "Vessel_imo_key" ON "Vessel"("imo");

-- CreateIndex
CREATE INDEX "Vessel_name_idx" ON "Vessel"("name");

-- CreateIndex
CREATE INDEX "Vessel_mmsi_idx" ON "Vessel"("mmsi");

-- CreateIndex
CREATE INDEX "Vessel_imo_idx" ON "Vessel"("imo");

-- AddForeignKey
ALTER TABLE "VesselImage" ADD CONSTRAINT "VesselImage_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
