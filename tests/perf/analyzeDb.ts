import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

// Minimal DB analysis script.
// Usage: ts-node tests/perf/analyzeDb.ts <mode>
// <mode> should be one of: load | spike

async function main() {
  const mode = process.argv[2] || 'unknown';
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/recurring_meetings_test';
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set, using fallback local test URL.');
  }

  const client = new Client({ connectionString: databaseUrl });
  interface AnalysisResult {
    timestamp: string;
    mode: string;
    database: { urlRedacted: string };
    connections?: { state: string; count: number }[];
    slowQueries?: { avg_ms: string; calls: number; query: string }[];
    frequentQueries?: { calls: number; avg_ms: string; query: string }[];
    aggregate?: { total_queries: string; total_calls: string; avg_mean_exec_time_ms: string; max_mean_exec_time_ms: string };
    error?: string;
    pgStatStatementsAvailable?: boolean;
    hintEnablePgStatStatements?: string;
  }

  const result: AnalysisResult = {
    timestamp: new Date().toISOString(),
    mode,
    database: { urlRedacted: databaseUrl.replace(/:\/\/.*@/, '://***:***@') }
  };

  try {
    await client.connect();

    // Try to ensure pg_stat_statements is available; if not, we'll degrade gracefully
    let pgssAvailable = true;
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements');
      // probe
      await client.query('SELECT 1 FROM pg_stat_statements LIMIT 1');
    } catch (e: unknown) {
      pgssAvailable = false;
      result.pgStatStatementsAvailable = false;
      result.hintEnablePgStatStatements = 'Add "shared_preload_libraries=pg_stat_statements" to postgres config (e.g. custom postgresql.conf or docker image) then restart DB.';
    }

    // Connection state summary
    const connRes = await client.query(`SELECT state, count(*)::int AS count
                                         FROM pg_stat_activity
                                         WHERE datname = current_database()
                                         GROUP BY state`);
    result.connections = connRes.rows;

    if (pgssAvailable) {
      result.pgStatStatementsAvailable = true;
      const slowRes = await client.query(`SELECT round(mean_exec_time::numeric,2) AS avg_ms,
              calls::int,
              left(query,120) AS query
            FROM pg_stat_statements
            WHERE query NOT LIKE '%pg_stat_statements%'
            ORDER BY mean_exec_time DESC
            LIMIT 5`);
      result.slowQueries = slowRes.rows;

      const freqRes = await client.query(`SELECT calls::int,
              round(mean_exec_time::numeric,2) AS avg_ms,
              left(query,120) AS query
            FROM pg_stat_statements
            WHERE query NOT LIKE '%pg_stat_statements%'
            ORDER BY calls DESC
            LIMIT 5`);
      result.frequentQueries = freqRes.rows;

      const aggRes = await client.query(`SELECT count(*) AS total_queries,
                  sum(calls)::bigint AS total_calls,
                  round(avg(mean_exec_time)::numeric,2) AS avg_mean_exec_time_ms,
                  round(max(mean_exec_time)::numeric,2) AS max_mean_exec_time_ms
                FROM pg_stat_statements
                WHERE query NOT LIKE '%pg_stat_statements%'`);
      result.aggregate = aggRes.rows[0];
    }

  } catch (err) {
    result.error = (err as Error).message;
  } finally {
    try { await client.end(); } catch (e) {
      // ignore
    }
  }

  const fileName = `db-analysis-${mode}-${Date.now()}.json`;
  const outPath = path.join(__dirname, fileName);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`DB analysis written: ${outPath}`);
}

main();
