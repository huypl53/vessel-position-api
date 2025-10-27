# Sea Vision Marine Traffic API

Robust vessel intelligence service that continuously crawls MarineTraffic, stores vessel profiles in Postgres via Prisma, persists imagery in MinIO object storage, and serves a caching API with bot-evasion safeguards.

## Highlights
- **Smart caching** – Prisma/Postgres backfill on first crawl, instant responses afterwards.
- **Media storage** – Vessel photos mirrored to MinIO with checksum metadata.
- **Hardened crawling** – Playwright + stealth plugins, randomized fingerprints, retry-friendly benchmark runner.
- **Structured logging** – Pino logs streamed to console and rotating files under `./logs`.
- **Quality gate** – Husky pre-commit hook enforces lint + tests locally.
- **Container stack** – Docker Compose spins up API, Postgres, and MinIO in one command.

## Tech Stack
- **Runtime**: Node.js 18+, Express, TypeScript (NodeNext modules)
- **Scraping**: Playwright Extra + stealth plugin, custom anti-bot hardening
- **Persistence**: PostgreSQL 15, Prisma ORM, MinIO object storage
- **Tooling**: Jest, Supertest, Husky, ESLint, Prettier, TSX, Pino

## Quick Start (Local)
```bash
cp .env.template .env             # adjust ports/credentials as needed
npm install
npm run prisma:generate
# optionally run migrations against a local Postgres instance
# npm run prisma:migrate:dev
npm run dev                       # compiles + nodemon reload using dist/index.js
```

### Running the API
- Development (hot reload): `npm run dev`
- Production build: `npm run build` then `node dist/index.js`
- Direct TypeScript execution: `npm start`

The server listens on `PORT` (defaults to `5005` via `.env`).

## Docker Compose Deployment
```bash
docker compose up --build
```
Services launched:
- `postgres`: Postgres 15 with database `vessels` exposed on `5433`
- `minio`: MinIO S3-compatible store (`http://localhost:9000`, console on `9001`)
- `app`: Marine crawler API on `http://localhost:5000`

The app container runs `npm run prisma:migrate` on boot to apply migrations, then starts the API.

### Useful credentials
```
Postgres: postgres / postgres
MinIO:   minioadmin / minioadmin
```

## Environment Variables
| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port for API |
| `DATABASE_URL` | Prisma connection string to Postgres |
| `MINIO_*` (`ENDPOINT`, `PORT`, `ACCESS_KEY`, `SECRET_KEY`, `BUCKET`, `REGION`, `USE_SSL`) | MinIO connectivity |
| `PLAYWRIGHT_EXECUTABLE_PATH` | Optional custom Chromium path |
| `LOG_LEVEL` / `LOG_DIR` | Pino logging level and file directory |
| `RUN_CURL_TESTS` | Set to `true` to re-enable legacy curl integration tests |

## Database Schema (Prisma)
```
Vessel
 ├─ id (UUID)
 ├─ name, mmsi, imo, callsign, flag, type/subType
 ├─ dimensional metrics (length, breadth, draught, tonnage)
 ├─ last known position and timestamp
 ├─ crawlerMetadata (JSON)
 └─ images[] (relation)

VesselImage
 ├─ object location (bucket/objectName)
 ├─ original URL, dimensions, bytes, checksum
```
`prisma/migrations/0001_init/migration.sql` contains the SQL for provisioning.

## API Overview
### Vessel cache endpoint
```
GET /vessels/:identifier?type=mmsi|imo&force=true
```
- If present in Postgres cache, returns immediately (with MinIO public URLs).
- On cache miss, crawls MarineTraffic, stores metadata + images, then responds.

Sample response:
```json
{
  "error": null,
  "data": {
    "name": "EVERGREEN",
    "mmsi": "123456789",
    "type": "Container Ship",
    "dimensions": { "lengthMeters": 400, "breadthMeters": 59 },
    "images": [
      {
        "bucket": "vessel-images",
        "objectName": "123456789-<hash>.jpg",
        "publicUrl": "http://minio:9000/vessel-images/123456789-<hash>.jpg"
      }
    ]
  }
}
```

### Legacy endpoints
Existing AIS / ADS-B routes remain available for backwards compatibility:
- `GET /ais/mt/:mmsi/location/latest`
- `GET /adsb/adsbe/:icao/location/latest`
- `GET /legacy/getLastPositionFromVF/:mmsi`
- `GET /legacy/getLastPositionFromMT/:mmsi`
- `GET /legacy/getLastPosition/:mmsi`
- `GET /legacy/getVesselsInArea/:area`
- `GET /legacy/getVesselsNearMe/:lat/:lng/:distance`
- `GET /legacy/getVesselsInPort/:shipPort`

## Crawling & Anti-Bot Strategies
- Stealth plugin preloaded for Playwright Extra.
- Randomized user agents, viewport sizes, and navigator fingerprints per request.
- Isolated browser contexts per crawl with automated cleanup.
- Optional `benchmark` tool to stress-test detection resilience.

Run benchmark:
```bash
npm run benchmark -- --identifier 211879870 --iterations 5 --force
```

## Logging
- Pino logs stream to stdout (pretty in dev) and to `logs/app.log` + `logs/error.log`.
- Update `LOG_LEVEL` or `LOG_DIR` in `.env` to tweak behavior.

## Testing
- Unit tests: `npm test`
- Lint: `npm run lint`
- Format: `npm run prettier`
- Optional curl integration tests: `RUN_CURL_TESTS=true npm test`

`test/vesselService.test.ts` exercises the cache/crawl orchestration with mocked dependencies. `test/api.curl.test.ts` is skipped unless `RUN_CURL_TESTS=true`.

## Git Hooks
Husky pre-commit hook runs ESLint and Jest before allowing commits:
```
.husky/pre-commit
  ├─ npm run lint
  └─ npm test
```
`npm install` triggers Husky via the `prepare` script. Disable temporarily with `HUSKY=0 git commit ...` if necessary.

## Troubleshooting
- **Bot detection triggered**: rerun benchmark with `--force` to validate crawling; ensure proxies/IP rotation are configured externally if required.
- **MinIO upload errors**: confirm server running (`docker compose ps`) and credentials match `.env`.
- **Prisma connection refused**: verify Postgres service reachable on `5433` (host) or `postgres:5432` (Docker network).

## Next Steps / Ideas
1. Add scheduled jobs for periodic refresh & stale detection.
2. Integrate proxy pools or residential IP rotation for high-volume scrapes.
3. Extend benchmark tooling with success ratios across IP pools.
4. Surface metrics via Prometheus + Grafana for real-time monitoring.

---

Enjoy building with Sea Vision! Contributions and issues welcome.
