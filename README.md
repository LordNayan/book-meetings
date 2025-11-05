# book-meetings

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

## Database Management

### Migrations

Run migrations to set up the database schema:

```bash
npm run db:migrate
```

This will create the following tables:

- `resources` - Bookable resources (rooms, desks, etc.)
- `bookings` - Individual booking records with time ranges
- `recurrence_rules` - Recurrence patterns (RRULE format)
- `exceptions` - Exceptions and modifications to recurring bookings

### Seed Data

Populate the database with sample data:

```bash
npm run db:seed
```

This creates:

- 5 sample resources (conference rooms, meeting rooms, desks)
- Several single bookings with metadata
- 1 recurring booking with weekly pattern

## API Endpoints

- `GET /health` - Health check endpoint, returns `{ status: "ok" }`

## Database Schema

### Resources

```sql
id (TEXT PRIMARY KEY) - Unique resource identifier
name (TEXT) - Display name of the resource
```

### Bookings

```sql
id (UUID PRIMARY KEY) - Booking ID
resource_id (TEXT FK) - Reference to resource
start_time (TIMESTAMPTZ) - Booking start time
end_time (TIMESTAMPTZ) - Booking end time
time_range (TSTZRANGE) - Generated time range column
metadata (JSONB) - Additional booking data
created_at (TIMESTAMPTZ) - Creation timestamp
```

**Indexes:**

- GIST index on `(resource_id, time_range)` for efficient range queries
- B-tree index on `(resource_id, start_time, end_time)`

### Recurrence Rules

```sql
booking_id (UUID PRIMARY KEY FK) - Reference to booking
rrule (TEXT) - RFC 5545 RRULE string
is_infinite (BOOLEAN) - Whether recurrence has no end
```

### Exceptions

```sql
id (UUID PRIMARY KEY) - Exception ID
booking_id (UUID FK) - Reference to booking
except_date (DATE) - Date to exclude or modify
replace_start (TIMESTAMPTZ) - Replacement start time (nullable)
replace_end (TIMESTAMPTZ) - Replacement end time (nullable)
```

**Index:**

- B-tree index on `(booking_id, except_date)`

## Project Structure

```
src/
├── server.ts   # Express app and routes
├── config.ts   # Environment configuration
├── logger.ts   # Pino logger setup
├── db.ts       # Prisma client singleton
└── types.ts    # TypeScript interfaces

prisma/
└── schema.prisma  # Prisma schema definition

db/
└── migrations/
    └── 001_init.sql  # Initial SQL migration

scripts/
├── init-db.ts  # Database initialization script
└── seed.ts     # Database seed script

tests/
└── sample.test.ts  # Basic tests
```

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js
- **Database:** Postgres 16 with Prisma ORM
- **Validation:** Zod
- **Logging:** Pino
- **Testing:** Jest with ts-jest
- **Date handling:** dayjs
