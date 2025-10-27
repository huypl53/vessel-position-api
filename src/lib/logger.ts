import fs from "fs";
import path from "path";
import pino, { type TransportTargetOptions } from "pino";

const LOG_DIR = process.env.LOG_DIR ?? path.join(process.cwd(), "logs");
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

function ensureLogDirectory() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

ensureLogDirectory();

const targets: TransportTargetOptions[] = [];

if (process.env.NODE_ENV !== "production") {
  targets.push({
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      singleLine: false,
    },
    level: LOG_LEVEL,
  });
}

targets.push(
  {
    target: "pino/file",
    options: {
      destination: path.join(LOG_DIR, "app.log"),
      mkdir: true,
    },
    level: LOG_LEVEL,
  },
  {
    target: "pino/file",
    options: {
      destination: path.join(LOG_DIR, "error.log"),
      mkdir: true,
    },
    level: "error",
  },
);

const transport = pino.transport({
  targets,
});

const logger = pino(
  {
    level: LOG_LEVEL,
    base: {
      pid: process.pid,
      service: "marine-traffic-crawler",
    },
  },
  transport,
);

export default logger;
