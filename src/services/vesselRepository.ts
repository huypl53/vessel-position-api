import prisma from "../lib/prisma";
import {
  VesselDetail,
  VesselImageMetadata,
  VesselLookup,
} from "../domain/vessel";

function mapDbVesselToDomain(dbVessel: any): VesselDetail | null {
  if (!dbVessel) {
    return null;
  }

  const detail: VesselDetail = {
    name: dbVessel.name ?? undefined,
    mmsi: dbVessel.mmsi ?? undefined,
    imo: dbVessel.imo ?? undefined,
    callSign: dbVessel.callSign ?? undefined,
    flag: dbVessel.flag ?? undefined,
    type: dbVessel.type ?? undefined,
    subType: dbVessel.subType ?? undefined,
    yearBuilt: dbVessel.yearBuilt ?? undefined,
    source: dbVessel.source ?? undefined,
    crawlerMetadata: dbVessel.crawlerMetadata ?? undefined,
    dimensions: {
      lengthMeters: dbVessel.lengthMeters ?? undefined,
      breadthMeters: dbVessel.breadthMeters ?? undefined,
      draughtMeters: dbVessel.draughtMeters ?? undefined,
      deadweightTons: dbVessel.deadweightTons ?? undefined,
      grossTonnage: dbVessel.grossTonnage ?? undefined,
    },
    position: dbVessel.lastKnownLat
      ? {
          latitude: dbVessel.lastKnownLat,
          longitude: dbVessel.lastKnownLon ?? undefined,
          capturedAt: dbVessel.lastKnownAt ?? undefined,
        }
      : undefined,
    images: (dbVessel.images ?? []).map((image: any) => ({
      bucket: image.bucket,
      objectName: image.objectName,
      originalUrl: image.originalUrl ?? undefined,
      contentType: image.contentType ?? undefined,
      width: image.width ?? undefined,
      height: image.height ?? undefined,
      sizeBytes: image.sizeBytes ?? undefined,
      checksum: image.checksum ?? undefined,
    })) as VesselImageMetadata[],
  };

  return detail;
}

export class VesselRepository {
  async findByIdentifier(identifier: string): Promise<VesselDetail | null> {
    const vessel = await prisma.vessel.findFirst({
      where: {
        OR: [{ mmsi: identifier }, { imo: identifier }],
      },
      include: {
        images: true,
      },
    });

    return mapDbVesselToDomain(vessel);
  }

  async findByLookup({ identifier, identifierType }: VesselLookup): Promise<VesselDetail | null> {
    const vessel = await prisma.vessel.findFirst({
      where: identifierType === "mmsi" ? { mmsi: identifier } : { imo: identifier },
      include: { images: true },
    });

    return mapDbVesselToDomain(vessel);
  }

  async upsertVessel(detail: VesselDetail): Promise<VesselDetail> {
    if (!detail.mmsi && !detail.imo) {
      throw new Error("Cannot upsert vessel without MMSI or IMO");
    }

    const existing = await prisma.vessel.findFirst({
      where: {
        OR: [
          detail.mmsi ? { mmsi: detail.mmsi } : undefined,
          detail.imo ? { imo: detail.imo } : undefined,
        ].filter(Boolean) as any,
      },
      include: { images: true },
    });

    const vesselData: any = {
      name: detail.name ?? existing?.name ?? null,
      mmsi: detail.mmsi ?? existing?.mmsi ?? null,
      imo: detail.imo ?? existing?.imo ?? null,
      callSign: detail.callSign ?? existing?.callSign ?? null,
      flag: detail.flag ?? existing?.flag ?? null,
      type: detail.type ?? existing?.type ?? null,
      subType: detail.subType ?? existing?.subType ?? null,
      yearBuilt: detail.yearBuilt ?? existing?.yearBuilt ?? null,
      lengthMeters: detail.dimensions?.lengthMeters ?? existing?.lengthMeters ?? null,
      breadthMeters: detail.dimensions?.breadthMeters ?? existing?.breadthMeters ?? null,
      draughtMeters: detail.dimensions?.draughtMeters ?? existing?.draughtMeters ?? null,
      deadweightTons: detail.dimensions?.deadweightTons ?? existing?.deadweightTons ?? null,
      grossTonnage: detail.dimensions?.grossTonnage ?? existing?.grossTonnage ?? null,
      lastKnownLat: detail.position?.latitude ?? existing?.lastKnownLat ?? null,
      lastKnownLon: detail.position?.longitude ?? existing?.lastKnownLon ?? null,
      lastKnownAt: detail.position?.capturedAt ?? existing?.lastKnownAt ?? null,
      source: detail.source ?? existing?.source ?? null,
      crawlerMetadata: detail.crawlerMetadata ?? existing?.crawlerMetadata ?? null,
    };

    const saveDetail = await prisma.$transaction(async (tx) => {
      let vesselRecord;

      if (existing) {
        vesselRecord = await tx.vessel.update({
          where: { id: existing.id },
          data: vesselData,
        });

        if (detail.images?.length) {
          await tx.vesselImage.deleteMany({ where: { vesselId: vesselRecord.id } });
          await tx.vesselImage.createMany({
            data: detail.images.map((image) => ({
              vesselId: vesselRecord.id,
              bucket: image.bucket,
              objectName: image.objectName,
              originalUrl: image.originalUrl ?? null,
              contentType: image.contentType ?? null,
              width: image.width ?? null,
              height: image.height ?? null,
              sizeBytes: image.sizeBytes ?? null,
              checksum: image.checksum ?? null,
            })),
          });
        }
      } else {
        vesselRecord = await tx.vessel.create({
          data: {
            ...vesselData,
            images: detail.images?.length
              ? {
                  create: detail.images.map((image) => ({
                    bucket: image.bucket,
                    objectName: image.objectName,
                    originalUrl: image.originalUrl ?? null,
                    contentType: image.contentType ?? null,
                    width: image.width ?? null,
                    height: image.height ?? null,
                    sizeBytes: image.sizeBytes ?? null,
                    checksum: image.checksum ?? null,
                  })),
                }
              : undefined,
          },
          include: { images: true },
        });

        const mapped = mapDbVesselToDomain(vesselRecord);
        if (!mapped) {
          throw new Error("Failed to map created vessel record");
        }
        return mapped;
      }

      const updated = await tx.vessel.findUnique({
        where: { id: vesselRecord.id },
        include: { images: true },
      });

      const mapped = mapDbVesselToDomain(updated);
      if (!mapped) {
        throw new Error("Failed to map updated vessel record");
      }

      return mapped;
    });

    return saveDetail;
  }
}

const vesselRepository = new VesselRepository();
export default vesselRepository;
