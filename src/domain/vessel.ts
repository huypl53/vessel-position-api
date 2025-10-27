export interface VesselDimensions {
  lengthMeters?: number;
  breadthMeters?: number;
  draughtMeters?: number;
  deadweightTons?: number;
  grossTonnage?: number;
}

export interface VesselIdentity {
  name?: string;
  mmsi?: string;
  imo?: string;
  callSign?: string;
  flag?: string;
  type?: string;
  subType?: string;
  yearBuilt?: number;
}

export interface VesselImageMetadata {
  bucket: string;
  objectName: string;
  originalUrl?: string;
  contentType?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  checksum?: string;
  publicUrl?: string;
}

export interface VesselPosition {
  latitude?: number;
  longitude?: number;
  capturedAt?: Date;
}

export interface VesselDetail extends VesselIdentity {
  dimensions?: VesselDimensions;
  position?: VesselPosition;
  images?: VesselImageMetadata[];
  source?: string;
  crawlerMetadata?: Record<string, unknown>;
}

export interface VesselLookup {
  identifier: string;
  identifierType: "mmsi" | "imo";
}
