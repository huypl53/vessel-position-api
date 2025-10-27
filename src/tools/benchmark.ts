import { performance } from "node:perf_hooks";
import vesselService from "../services/vesselService";
import logger from "../lib/logger";

interface BenchmarkOptions {
  identifier: string;
  type?: "mmsi" | "imo";
  iterations: number;
  force?: boolean;
}

interface BenchmarkResult {
  iteration: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

function parseArgs(argv: string[]): Partial<BenchmarkOptions> {
  const options: Partial<BenchmarkOptions> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--identifier":
      case "-i":
        options.identifier = argv[++i];
        break;
      case "--type":
      case "-t":
        options.type = argv[++i] as "mmsi" | "imo";
        break;
      case "--iterations":
      case "-n":
        options.iterations = parseInt(argv[++i] ?? "3", 10) || 3;
        break;
      case "--force":
      case "-f":
        options.force = true;
        break;
      default:
        if (!arg.startsWith("-")) {
          options.identifier = arg;
        }
        break;
    }
  }
  return options;
}

async function runBenchmark(options: BenchmarkOptions): Promise<void> {
  const results: BenchmarkResult[] = [];

  logger.info({ options }, "Starting vessel benchmark");

  for (let iteration = 0; iteration < options.iterations; iteration++) {
    const start = performance.now();
    try {
      await vesselService.getVessel({
        identifier: options.identifier,
        type: options.type,
        forceRefresh: options.force,
      });
      const durationMs = performance.now() - start;
      results.push({
        iteration,
        durationMs,
        success: true,
      });
      logger.info({ iteration, durationMs }, "Benchmark iteration succeeded");
    } catch (error) {
      const durationMs = performance.now() - start;
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        iteration,
        durationMs,
        success: false,
        error: message,
      });
      logger.error({ iteration, durationMs, error: message }, "Benchmark iteration failed");
    }
  }

  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);
  const averageMs =
    successes.reduce((acc, item) => acc + item.durationMs, 0) /
      Math.max(successes.length, 1) || 0;

  // eslint-disable-next-line no-console
  console.table(
    results.map((result) => ({
      iteration: result.iteration,
      durationMs: result.durationMs.toFixed(1),
      success: result.success,
      error: result.error ?? "",
    })),
  );

  logger.info(
    {
      total: results.length,
      successes: successes.length,
      failures: failures.length,
      averageMs,
    },
    "Benchmark summary",
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.identifier) {
    // eslint-disable-next-line no-console
    console.error("Usage: npm run benchmark -- --identifier <MMSI|IMO> [--type mmsi|imo] [--iterations N] [--force]");
    process.exitCode = 1;
    return;
  }

  const options: BenchmarkOptions = {
    identifier: args.identifier,
    type: args.type,
    iterations: args.iterations ?? 3,
    force: args.force ?? false,
  };

  await runBenchmark(options);
}

void main();
