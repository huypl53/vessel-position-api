#!/usr/bin/env npx tsx
/**
 * VesselFinder Benchmark Script
 *
 * Tests rate limiting behavior and performance of the VesselFinder scraper.
 * Measures:
 * - Response times
 * - Success/failure rates
 * - Rate limiting detection
 */

import VesselFinder from "../classes/sources/ais/vf";

interface BenchmarkResult {
  mmsi: string;
  success: boolean;
  duration: number;
  data?: any;
  error?: string;
  timestamp: string;
  requestNumber: number;
}

interface BenchmarkSummary {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  rateLimitDetected: boolean;
  errors: string[];
}

const TEST_MMSIS = [
  "533132788", // Target vessel (ASB MARINE 3)
  "211879870", // Random vessel
  "366814480", // Random vessel
  "244630584", // Random vessel
  "338107922", // Random vessel
];

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSingleTest(
  vf: VesselFinder,
  mmsi: string,
  requestNumber: number,
): Promise<BenchmarkResult> {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const data = await vf.getVesselDetails(mmsi);
    const duration = Date.now() - start;

    return {
      mmsi,
      success: data !== null,
      duration,
      data: data
        ? {
            name: data.name,
            type: data.type,
            length: data.length,
            beam: data.beam,
            callsign: data.callsign,
          }
        : null,
      timestamp,
      requestNumber,
    };
  } catch (err: any) {
    const duration = Date.now() - start;
    return {
      mmsi,
      success: false,
      duration,
      error: err.message || String(err),
      timestamp,
      requestNumber,
    };
  }
}

function summarize(results: BenchmarkResult[]): BenchmarkSummary {
  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);
  const durations = successes.map((r) => r.duration);

  const rateLimitIndicators = [
    "429",
    "rate limit",
    "too many",
    "blocked",
    "captcha",
  ];
  const rateLimitDetected = failures.some(
    (f) =>
      f.error &&
      rateLimitIndicators.some((indicator) =>
        f.error!.toLowerCase().includes(indicator),
      ),
  );

  return {
    totalRequests: results.length,
    successCount: successes.length,
    failureCount: failures.length,
    avgResponseTime:
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0,
    minResponseTime: durations.length > 0 ? Math.min(...durations) : 0,
    maxResponseTime: durations.length > 0 ? Math.max(...durations) : 0,
    rateLimitDetected,
    errors: [...new Set(failures.map((f) => f.error || "Unknown error"))],
  };
}

async function runSequentialTest(
  delayMs: number,
  requestCount: number,
): Promise<BenchmarkResult[]> {
  console.log(
    `\n=== Sequential Test (${delayMs}ms delay, ${requestCount} requests) ===\n`,
  );

  const vf = new VesselFinder();
  const results: BenchmarkResult[] = [];

  for (let i = 0; i < requestCount; i++) {
    const mmsi = TEST_MMSIS[i % TEST_MMSIS.length];
    console.log(`Request ${i + 1}/${requestCount}: MMSI ${mmsi}...`);

    const result = await runSingleTest(vf, mmsi, i + 1);
    results.push(result);

    const status = result.success ? "SUCCESS" : "FAILED";
    console.log(`  ${status} in ${result.duration}ms`);
    if (result.data) {
      console.log(`  Name: ${result.data.name}, Type: ${result.data.type}`);
    }
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }

    // Wait before next request (except for last one)
    if (i < requestCount - 1) {
      console.log(`  Waiting ${delayMs}ms...`);
      await delay(delayMs);
    }
  }

  return results;
}

async function runBurstTest(requestCount: number): Promise<BenchmarkResult[]> {
  console.log(`\n=== Burst Test (${requestCount} parallel requests) ===\n`);

  const vf = new VesselFinder();
  const promises: Promise<BenchmarkResult>[] = [];

  for (let i = 0; i < requestCount; i++) {
    const mmsi = TEST_MMSIS[i % TEST_MMSIS.length];
    console.log(`Launching request ${i + 1}: MMSI ${mmsi}`);
    promises.push(runSingleTest(vf, mmsi, i + 1));
  }

  console.log("\nWaiting for all requests to complete...\n");
  const results = await Promise.all(promises);

  for (const result of results) {
    const status = result.success ? "SUCCESS" : "FAILED";
    console.log(`Request ${result.requestNumber}: ${status} in ${result.duration}ms`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  }

  return results;
}

async function main() {
  console.log("=".repeat(60));
  console.log("VesselFinder Benchmark Suite");
  console.log("=".repeat(60));
  console.log(`Start time: ${new Date().toISOString()}`);
  console.log(`Test MMSIs: ${TEST_MMSIS.join(", ")}`);

  const allResults: BenchmarkResult[] = [];

  // Test 1: Single request
  console.log("\n--- Test 1: Single Request ---");
  const singleResult = await runSequentialTest(0, 1);
  allResults.push(...singleResult);

  // Wait 10 seconds before next test
  console.log("\nWaiting 10s before next test...");
  await delay(10000);

  // Test 2: Sequential with 5s delay
  console.log("\n--- Test 2: Sequential (5s delay) ---");
  const seq5sResults = await runSequentialTest(5000, 3);
  allResults.push(...seq5sResults);

  // Wait 15 seconds before next test
  console.log("\nWaiting 15s before next test...");
  await delay(15000);

  // Test 3: Sequential with 10s delay
  console.log("\n--- Test 3: Sequential (10s delay) ---");
  const seq10sResults = await runSequentialTest(10000, 3);
  allResults.push(...seq10sResults);

  // Wait 15 seconds before next test
  console.log("\nWaiting 15s before burst test...");
  await delay(15000);

  // Test 4: Burst test (parallel requests)
  console.log("\n--- Test 4: Burst Test ---");
  const burstResults = await runBurstTest(3);
  allResults.push(...burstResults);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK SUMMARY");
  console.log("=".repeat(60));

  const summary = summarize(allResults);
  console.log(`\nTotal Requests: ${summary.totalRequests}`);
  console.log(
    `Success Rate: ${((summary.successCount / summary.totalRequests) * 100).toFixed(1)}%`,
  );
  console.log(`Successful: ${summary.successCount}`);
  console.log(`Failed: ${summary.failureCount}`);
  console.log(`\nResponse Times:`);
  console.log(`  Average: ${summary.avgResponseTime.toFixed(0)}ms`);
  console.log(`  Min: ${summary.minResponseTime}ms`);
  console.log(`  Max: ${summary.maxResponseTime}ms`);
  console.log(`\nRate Limiting Detected: ${summary.rateLimitDetected ? "YES" : "NO"}`);

  if (summary.errors.length > 0) {
    console.log(`\nErrors encountered:`);
    summary.errors.forEach((err) => console.log(`  - ${err}`));
  }

  // Recommendations
  console.log("\n" + "=".repeat(60));
  console.log("RECOMMENDATIONS");
  console.log("=".repeat(60));

  if (summary.rateLimitDetected) {
    console.log("- Rate limiting detected! Increase delay between requests");
    console.log("- Recommended minimum delay: 30 seconds");
    console.log("- Consider implementing exponential backoff");
  } else if (summary.failureCount > 0) {
    console.log("- Some failures detected, check error messages");
    console.log("- Consider increasing timeout or retry logic");
  } else {
    console.log("- All tests passed!");
    console.log("- Safe interval appears to be 5-10 seconds");
    console.log("- Monitor for any changes in behavior over time");
  }

  console.log(`\nEnd time: ${new Date().toISOString()}`);

  return {
    results: allResults,
    summary,
  };
}

main()
  .then(({ summary }) => {
    process.exit(summary.failureCount > summary.successCount ? 1 : 0);
  })
  .catch((err) => {
    console.error("Benchmark failed:", err);
    process.exit(1);
  });
