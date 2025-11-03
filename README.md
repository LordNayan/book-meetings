# recurring-meetings-api

TypeScript Express API for recurring meetings with Postgres database.

## Prerequisites

- Node.js 18+
- Docker & Docker Compose
- npm or yarn

## Setup

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```

3. **Start Postgres via Docker:**
   ```bash
   docker-compose up -d
   ```

4. **Wait for database to be healthy:**
   ```bash
   docker-compose ps
   ```

## Development

Start the development server with hot reload:
```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## Testing

Run tests:
```bash
npm test
```

## Building

Build TypeScript to JavaScript:
```bash
npm run build
```

Run production build:
```bash
npm start
```

## API Endpoints

- `GET /health` - Health check endpoint, returns `{ status: "ok" }`

## Project Structure

```
src/
├── server.ts   # Express app and routes
├── config.ts   # Environment configuration
├── logger.ts   # Pino logger setup
└── types.ts    # TypeScript interfaces

tests/
└── sample.test.ts  # Basic tests
```

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js
- **Database:** Postgres 16
- **Validation:** Zod
- **Logging:** Pino
- **Testing:** Jest with ts-jest
- **Date handling:** dayjs
