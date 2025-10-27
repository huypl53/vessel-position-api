import Source from "../Source";
import logger from "../../../lib/logger";

class Marinetraffic extends Source {
  parseLocation = async function (result: any) {
    const location = {
      timestamp: result.timestamp,
      latitude: result.latitude,
      longitude: result.longitude,
      course: result.course,
      speed: result.speed,
      source: "Marinetraffic",
      source_type: "AIS",
    };
    return location;
  };

  getLocation = async (mmsi: number) => {
    logger.debug({ mmsi }, "Starting MarineTraffic location lookup");

    const url =
      "https://www.marinetraffic.com/en/ais/details/ships/mmsi:" + mmsi;
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    /* CAN BE USED FOR DEBUGGING
    page.on('request', (request) => {
      console.log(`[${request.resourceType()}] ${request.method()} ${request.url()}`);
    });

    page.on('requestfailed', (request) => {
      console.log(`[FAILED] ${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
    }); */

    // Wrap the vessel position extraction in a Promise
    const vesselPositionPromise = new Promise<any>((resolve, reject) => {
      page.on("response", (response) => {
        const reqUrl = response.url();
        // console.log(`[RESPONSE] ${response.status()} ${reqUrl}`);
        if (/vessels\/.*\/position/.test(reqUrl)) {
          response.text().then((body) => {
            // console.log('Vessel position response:', body);
            try {
              const parsedData = JSON.parse(body);
              const result = {
                course: parseFloat(
                  parsedData.course ??
                    parsedData.course ??
                    parsedData.heading ??
                    0,
                ),
                speed: parseFloat(parsedData.speed ?? 0),
                latitude: parseFloat(
                  parsedData.lat ?? parsedData.latitude ?? parsedData.lat ?? 0,
                ),
                longitude: parseFloat(
                  parsedData.lon ?? parsedData.longitude ?? parsedData.lon ?? 0,
                ),
                timestamp: new Date(
                  (parsedData.timestamp ?? parsedData.lastPos ?? 0) * 1000,
                ).toISOString(),
                originalResponse: parsedData,
              };
              console.log("Parsed vessel position:", parsedData);
              logger.debug(
                { url: reqUrl, parsedData },
                "Parsed vessel position response",
              );
              resolve(result);
            } catch (err) {
              logger.error(
                { err, url: reqUrl },
                "Failed to parse vessel position response",
              );
              reject(err);
            }
          });
        }
      });
    });

    await page.goto(url, { waitUntil: "domcontentloaded" });
    const finalUrl = page.url();
    logger.debug({ finalUrl }, "MarineTraffic redirected URL");

    // Wait for the vessel position or timeout after 35 seconds
    let result = null;
    try {
      result = await Promise.race([
        vesselPositionPromise,
        new Promise((_resolve, reject) =>
          setTimeout(() => {
            reject(new Error("Timeout waiting for vessel position"));
          }, 15000),
        ),
      ]);
    } catch (err) {
      logger.error(
        { err },
        "Error or timeout while waiting for vessel position",
      );
    }

    await browser.close();
    return result;
  };
}

export default Marinetraffic;
