import logger, { crawlerLogger, dbLogger, apiLogger } from "../../src/services/logger.service";

describe("Logger Service", () => {
  it("should have main logger instance", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("should have child loggers", () => {
    expect(crawlerLogger).toBeDefined();
    expect(dbLogger).toBeDefined();
    expect(apiLogger).toBeDefined();
  });

  it("should log messages without errors", () => {
    expect(() => {
      logger.info("Test message");
      crawlerLogger.debug("Crawler message");
      dbLogger.error("DB error message");
      apiLogger.warn("API warning");
    }).not.toThrow();
  });
});
