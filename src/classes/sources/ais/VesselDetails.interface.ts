export interface VesselDetails {
  // Identity
  mmsi?: string;
  imo?: string;
  name?: string;
  callsign?: string;
  flag?: string;

  // Type
  vesselType?: string;
  vesselTypeCode?: number;

  // Dimensions
  length?: number;
  width?: number;
  draught?: number;
  deadweight?: number;
  grossTonnage?: number;

  // Build info
  yearBuilt?: number;
  builder?: string;

  // Status
  status?: string;
  destination?: string;
  eta?: Date;

  // Position
  position?: {
    latitude: number;
    longitude: number;
    course?: number;
    speed?: number;
    heading?: number;
    timestamp: Date;
    source: string;
    sourceType: string;
  };

  // Images
  images?: Array<{
    url: string;
    type?: string;
  }>;
}
