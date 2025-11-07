# Book Meetings

A high-performance API service for booking single and recurring meetings with conflict detection, availability search, and next-slot recommendations, built in Node.js with PostgreSQL. It handles infinite recurrences, exceptions, and load resilience through optimized range queries and structured recurrence expansion.

<img width="1501" height="920" alt="Screenshot 2025-11-07 at 5 10 09 PM" src="https://github.com/user-attachments/assets/1646215b-aa82-49f1-8af0-cfb5a2d8f093" />

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js
- **Database:** Postgres 16 with Prisma ORM
- **Validation:** Zod
- **Logging:** Pino
- **Testing:** Jest with ts-jest
- **Date handling:** dayjs

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
   npm run docker:up
   ```

5. **Create, Run Migrations and Seed DB:**

   ```bash
   npm run db:setup
   ```

## Development

Start the development server with hot reload:

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## Testing

Run Unit Tests:

```bash
npm test
```

## Performance Testing

For detailed information on performance testing, refer to the [Performance Testing Guide](tests/perf/README.md).

## Building

Build TypeScript to JavaScript:

```bash
npm run build
```

Run production build:

```bash
npm start
```

## Server Information

The server runs on port `3000` by default.

API documentation is available at `http://localhost:3000/api-docs`