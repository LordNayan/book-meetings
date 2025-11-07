## Performance Tests

This folder contains two automated k6 scenarios plus a lightweight Postgres analysis step. One command for the sustained load profile, one for the spike profile; both automatically: (1) set up test resources, (2) run k6, (3) capture DB query stats, (4) teardown.

### Commands
```bash
npm run load:test   # 1h load (~1000 total requests; ~300 bookings)
npm run spike:test  # 30s spike (~10k requests burst)
```

### Prerequisites
1. API running locally: `npm run dev`
2. `DATABASE_URL` exported (Postgres). Script auto-enables `pg_stat_statements` if possible.
3. k6 installed (macOS: `brew install k6`).

### Test Profiles
Load Test (k6Load.js):
- Duration: 1h (5m ramp-up → 50m steady @10 VUs → 5m ramp-down)
- Mix: 70% GET `/availability`, 30% POST `/bookings`
- Target throughput: ~1000 requests/hour (~300 booking attempts)

Spike Test (k6Spike.js):
- Duration: 30s constant arrival
- Rate: ~333 req/s (≈10,000 total)
- Mix: 80% availability lookups, 20% bookings
- Auto-scaling VUs (preAllocated 100, max 200)

### Metrics Collected (k6)
- Global: http_req_duration (p50, p95, p99, avg, max), http_req_failed, total requests
- Custom Trends: `availability_duration`, `booking_duration`
- Counters: `total_requests`

### Thresholds (Configured in scripts)
Load:
- p95 http_req_duration < 250ms
- p99 http_req_duration < 500ms
- p95 availability_duration < 200ms
- p95 booking_duration < 300ms
- error rate < 5%

Spike:
- p95 http_req_duration < 500ms
- p99 http_req_duration < 1000ms
- p95 availability_duration < 400ms
- p95 booking_duration < 600ms
- error rate < 10%

### Automatic DB Analysis (`analyzeDb.ts`)
Runs after each test; writes JSON snapshot with:
- Connection state counts (active / idle / idle in transaction)
- Top 5 slow queries (avg execution time)
- Top 5 most frequent queries
- Aggregate stats (total tracked statements, mean/max mean_exec_time)
Output files (gitignored):
```
tests/perf/db-analysis-load-<timestamp>.json
tests/perf/db-analysis-spike-<timestamp>.json
```

### Generated k6 Output Files (gitignored)
- `tests/perf/load-test-summary.json`
- `tests/perf/spike-test-summary.json`

### How to Inspect Results Quickly
```bash
jq '.metrics.http_req_duration.values' tests/perf/load-test-summary.json
jq '.metrics.http_req_failed.values.rate' tests/perf/load-test-summary.json
jq '.slowQueries' tests/perf/db-analysis-load-*.json | head -20
```

### Interpreting Key Signals
- Rising p95/p99 during steady phase → latency regression or resource saturation
- Elevated error rate (> threshold) → API stability or DB constraints issue
- Slow queries with high call counts → indexing/caching target
- Many idle-in-transaction connections → unclosed transactions in code

### Customization Tips
Adjust load pattern: edit the `stages` array in `k6Load.js`.
Adjust spike rate: modify `rate` in the `scenarios.spike` block of `k6Spike.js`.
Tighten/loosen SLOs: edit `thresholds` object in each script.
Capture deeper DB info: extend queries inside `tests/perf/analyzeDb.ts` (e.g. add lock inspection).

### Common Tweaks
Increase throughput: raise VUs or reduce sleep in `k6Load.js`.
Lower noise for small machines: cut steady period from 50m to 10m.
Test different mixes: change GET/POST ratio logic in default function.

### Minimal Troubleshooting
| Symptom | Quick Check | Likely Fix |
|---------|-------------|-----------|
| Many 409s | Booking responses | Expected conflict handling |
| High error rate | `http_req_failed` metric | Inspect server logs / DB availability |
| Slow bookings | `booking_duration` p95 | Add composite index (resource_id,start_time) |
| Idle in tx | DB analysis connections | Ensure transactions closed in code |

### Clean Exit
Teardown runs automatically in script (removes test resources). No manual cleanup needed.

### Security Note
`analyzeDb.ts` redacts credentials when echoing URL; review before sharing outputs externally.

### Editing Recap
- Modify traffic: `k6Load.js`, `k6Spike.js`
- Modify DB stats: `tests/perf/analyzeDb.ts`
- Add new performance artifact: keep it gitignored if large/noise.

That’s it—two commands, essential outputs, focused diagnostics.

