#!/usr/bin/env ts-node
import dotenv from "dotenv";
import Server from "./classes/server";
import logger from "./lib/logger";

dotenv.config();

const port = process.env.PORT ?? 5000;
// eslint-disable-next-line no-new
logger.info({ port }, "Starting API server");
new Server(port);
