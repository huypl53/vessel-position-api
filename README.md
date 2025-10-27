# Vessel Tracking & Data Crawling System

A comprehensive, production-ready system for tracking vessel positions and details from MarineTraffic with advanced bot detection bypass, database caching, and image storage.

## Features

- **Intelligent Data Crawling**: Automated vessel data extraction from MarineTraffic
- **Database Caching**: PostgreSQL with Prisma ORM for efficient data storage and retrieval
- **Image Storage**: MinIO object storage for vessel images
- **Bot Detection Bypass**: Advanced anti-detection techniques with browser pooling
- **RESTful API**: Clean, well-documented API endpoints
- **File Logging**: Structured logging with Winston
- **Docker Deployment**: Complete Docker Compose setup
- **Testing Suite**: Unit tests, integration tests, and benchmarks
- **Git Hooks**: Pre-commit checks for code quality

## Tech Stack

### Core
- **Node.js** (v18+)
- **TypeScript** for type safety
- **Express** for API server

### Database & Storage
- **PostgreSQL** (v16) for relational data
- **Prisma ORM** for database management
- **MinIO** for object storage

### Web Scraping
- **Playwright** with stealth plugin for bot bypass
- **Cheerio** for HTML parsing
- **Browser Pooling** for efficient resource management

### Testing & Quality
- **Jest** for unit and integration tests
- **Husky** for git hooks
- **ESLint** for code linting
- **Prettier** for code formatting

### Logging
- **Winston** for structured logging
- Separate log files for errors, crawler, and combined logs

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│         Express API Server          │
│  ┌──────────────────────────────┐  │
│  │    Vessel Routes & Handlers   │  │
│  └──────────────────────────────┘  │
└──────────┬──────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│        Vessel Service Layer          │
│  • Caching logic                     │
│  • Database orchestration            │
│  • Crawler coordination              │
└──────┬───────────────────────────────┘
       │
       ├─────────┬──────────┬────────────┐
       ▼         ▼          ▼            ▼
  ┌─────────┐ ┌────────┐ ┌────────┐ ┌────────┐
  │  Prisma │ │ MinIO  │ │Crawler │ │ Logger │
  │   ORM   │ │Storage │ │Service │ │Service │
  └────┬────┘ └───┬────┘ └───┬────┘ └────┬───┘
       │          │           │           │
       ▼          ▼           ▼           ▼
  ┌─────────┐ ┌────────┐ ┌────────┐ ┌────────┐
  │Postgres │ │ MinIO  │ │Browser │ │  Logs  │
  │   DB    │ │ Bucket │ │  Pool  │ │  Files │
  └─────────┘ └────────┘ └────────┘ └────────┘
```

## Installation

### Prerequisites

- Node.js v18 or higher
- Docker and Docker Compose (for deployment)
- Git

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd position-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.template .env
   # Edit .env with your configuration
   ```

4. **Set up database**
   ```bash
   # Start PostgreSQL (using Docker)
   docker-compose up -d postgres

   # Run migrations
   npm run prisma:migrate

   # Generate Prisma client
   npm run prisma:generate
   ```

5. **Start MinIO**
   ```bash
   docker-compose up -d minio
   ```

6. **Build the project**
   ```bash
   npm run build
   ```

7. **Start development server**
   ```bash
   npm run dev
   ```

## Docker Deployment

### Quick Start

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f position-api

# Stop services
docker-compose down
```

### Services

The Docker Compose setup includes:

- **postgres**: PostgreSQL database (port 5432)
- **minio**: MinIO object storage (ports 9000, 9001)
- **position-api**: Main application (port 5001)

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | 5001 |
| `DATABASE_URL` | PostgreSQL connection string | postgresql://postgres:postgres@localhost:5432/vessel_db |
| `MINIO_ENDPOINT` | MinIO server endpoint | localhost |
| `MINIO_PORT` | MinIO server port | 9000 |
| `MINIO_ACCESS_KEY` | MinIO access key | minioadmin |
| `MINIO_SECRET_KEY` | MinIO secret key | minioadmin |
| `MINIO_BUCKET_NAME` | Storage bucket name | vessel-images |
| `LOG_LEVEL` | Logging level | info |
| `LOG_DIR` | Logs directory | logs |

## API Endpoints

### Get Vessel Details

```http
GET /api/vessels/:identifier
```

Retrieves vessel details by MMSI (9 digits) or IMO (7 digits).

**Parameters:**
- `identifier`: MMSI or IMO number
- `refresh` (query, optional): Set to `true` to force refresh from source

**Response:**
```json
{
  "error": null,
  "data": {
    "id": "uuid",
    "mmsi": "123456789",
    "imo": "1234567",
    "name": "Vessel Name",
    "vesselType": "Cargo",
    "flag": "US",
    "length": 200.5,
    "width": 30.2,
    "positions": [...],
    "images": [...],
    "lastCrawled": "2025-01-01T00:00:00.000Z"
  }
}
```

### Get Latest Position

```http
GET /api/vessels/:identifier/position/latest
```

**Response:**
```json
{
  "error": null,
  "data": {
    "latitude": 35.5,
    "longitude": -120.5,
    "speed": 12.5,
    "course": 180,
    "timestamp": "2025-01-01T00:00:00.000Z",
    "source": "MarineTraffic",
    "sourceType": "AIS"
  }
}
```

### Force Refresh Vessel

```http
POST /api/vessels/:identifier/refresh
```

Forces a fresh crawl of vessel data, bypassing cache.

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

### Legacy Endpoints

The system maintains backward compatibility with legacy endpoints:

- `GET /legacy/getLastPositionFromMT/:mmsi`
- `GET /legacy/getLastPosition/:mmsi`
- `GET /legacy/getVesselsInArea/:area`
- `GET /legacy/getVesselsNearMe/:lat/:lng/:distance`
- `GET /legacy/getVesselsInPort/:shipPort`

## Usage Examples

### Fetch Vessel by MMSI

```bash
curl http://localhost:5001/api/vessels/211879870
```

### Get Latest Position

```bash
curl http://localhost:5001/api/vessels/636018594/position/latest
```

### Force Refresh

```bash
curl -X POST http://localhost:5001/api/vessels/211879870/refresh
```

## Testing

### Run All Tests

```bash
npm test
```

### Unit Tests

```bash
npm run test:unit
```

### Integration Tests

```bash
npm run test:integration
```

### Benchmark System

```bash
npm run benchmark
```

The benchmark tool tests:
- Single vessel crawl performance
- Cache retrieval speed
- Concurrent request handling
- Bot detection bypass effectiveness

### Demo System

```bash
npm run demo
```

Interactive demonstration of:
- Vessel data fetching
- Database caching
- Position tracking
- Image storage

## Development

### Project Structure

```
position-api/
├── src/
│   ├── classes/
│   │   ├── server.ts              # Express server
│   │   └── sources/
│   │       ├── Source.ts          # Base crawler class
│   │       ├── BrowserPool.ts     # Browser pooling
│   │       └── ais/
│   │           ├── mt.ts          # MarineTraffic basic
│   │           └── mt-enhanced.ts # Enhanced crawler
│   ├── services/
│   │   ├── database.service.ts    # Prisma wrapper
│   │   ├── storage.service.ts     # MinIO client
│   │   ├── vessel.service.ts      # Business logic
│   │   └── logger.service.ts      # Winston logger
│   ├── routes/
│   │   └── vessel.routes.ts       # API routes
│   └── index.ts                   # Entry point
├── prisma/
│   ├── schema.prisma              # Database schema
│   └── migrations/                # DB migrations
├── test/
│   ├── unit/                      # Unit tests
│   └── integration/               # Integration tests
├── tools/
│   ├── benchmark.ts               # Performance testing
│   └── demo.ts                    # System demo
├── docker-compose.yml             # Container orchestration
├── Dockerfile                     # App container
└── README.md                      # This file
```

### Code Style

The project uses:
- **ESLint** for linting
- **Prettier** for formatting
- **TypeScript** strict mode

Run code checks:
```bash
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix issues
npm run prettier      # Format code
```

### Git Hooks

Pre-commit hooks automatically run:
1. ESLint
2. Prettier
3. TypeScript compilation
4. Unit tests

## Bot Detection Bypass

### Techniques Implemented

1. **Browser Pooling**
   - Multiple browser instances
   - Rotating user agents
   - Randomized viewports

2. **Stealth Plugin**
   - Hides automation indicators
   - Overrides navigator.webdriver
   - Spoofs plugin and language arrays

3. **Human-like Behavior**
   - Random mouse movements
   - Variable request timing
   - Realistic viewport sizes

4. **Request Distribution**
   - Multiple browser contexts
   - Connection pooling
   - Rate limiting friendly

### Monitoring

Check crawler logs:
```bash
tail -f logs/crawler.log
```

Review bot detection success rate:
```bash
npm run benchmark
```

## Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# View database logs
docker-compose logs postgres

# Restart database
docker-compose restart postgres
```

### MinIO Connection Issues

```bash
# Check MinIO status
docker-compose ps minio

# Access MinIO console
# Open: http://localhost:9001
# Login: minioadmin / minioadmin

# Restart MinIO
docker-compose restart minio
```

### Crawler Timeout Issues

1. Check your internet connection
2. Verify target website is accessible
3. Review crawler logs: `logs/crawler.log`
4. Increase timeout in crawler configuration

### Build Errors

```bash
# Clean build
rm -rf dist node_modules

# Reinstall dependencies
npm install

# Regenerate Prisma client
npm run prisma:generate

# Rebuild
npm run build
```

## Performance Optimization

### Caching Strategy

- Fresh data cached for 1 hour by default
- Stale cache served on crawl failure
- Manual refresh available via API

### Database Indexes

- MMSI and IMO indexed for fast lookups
- Position timestamp indexed
- Vessel last_crawled indexed

### Browser Pool

- Max 3 concurrent browsers
- 30-minute idle timeout
- Automatic cleanup

## Monitoring & Logging

### Log Files

- `logs/error.log`: Error-level logs only
- `logs/combined.log`: All log levels
- `logs/crawler.log`: Crawler-specific logs

### Log Levels

- `error`: Critical issues
- `warn`: Warnings
- `info`: General information (default)
- `debug`: Detailed debugging

Set log level in `.env`:
```bash
LOG_LEVEL=debug
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

Pre-commit hooks will automatically check:
- Code style
- Type safety
- Test coverage

## License

ISC License

## Support

For issues and questions:
- Create an issue on GitHub
- Check existing documentation
- Review logs for error details

---

**Built with Node.js, TypeScript, Express, Playwright, Prisma, and PostgreSQL**
