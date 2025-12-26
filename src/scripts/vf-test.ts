#!/usr/bin/env npx tsx
/**
 * Simple test script for VesselFinder scraper
 */

import VesselFinder from "../classes/sources/ais/vf";

async function test() {
  const mmsi = process.argv[2] || "533132788";

  console.log("=== VesselFinder Scraper Test ===\n");
  console.log(`Testing MMSI: ${mmsi}`);
  console.log(`Start time: ${new Date().toISOString()}\n`);

  const vf = new VesselFinder();

  try {
    const start = Date.now();
    const details = await vf.getVesselDetails(mmsi);
    const duration = Date.now() - start;

    console.log(`\nRequest completed in ${duration}ms\n`);

    if (details) {
      console.log("=== Vessel Details ===");
      console.log(`Name: ${details.name || "N/A"}`);
      console.log(`MMSI: ${details.mmsi}`);
      console.log(`IMO: ${details.imo || "N/A"}`);
      console.log(`Callsign: ${details.callsign || "N/A"}`);
      console.log(`Type: ${details.type || "N/A"}`);
      console.log(`Length: ${details.length || "N/A"} m`);
      console.log(`Beam: ${details.beam || "N/A"} m`);
      console.log(`Draught: ${details.draught || "N/A"} m`);
      console.log(`Flag: ${details.flag || "N/A"}`);
      console.log(`Year Built: ${details.yearBuilt || "N/A"}`);
      console.log(`\nRaw data:`);
      console.log(JSON.stringify(details.raw, null, 2));
    } else {
      console.log("No details returned");
    }
  } catch (err) {
    console.error("Error:", err);
  }

  console.log(`\nEnd time: ${new Date().toISOString()}`);
  process.exit(0);
}

test();
