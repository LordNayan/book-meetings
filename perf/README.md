# Performance Testing Guide

This directory contains K6 performance tests for the recurring-meetings-api. The tests simulate realistic traffic patterns to measure system performance under different load conditions.

## Overview

- **k6-load.js**: Steady-state load test (1 hour duration)
- **k6-spike.js**: Spike/burst test (30 seconds duration)
- **Results.md**: Performance test findings and optimization recommendations

## Prerequisites

### Install K6

#### macOS
```bash
brew install k6
```

#### Linux
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

#### Windows
```powershell
choco install k6
```

For other installation methods, visit: https://k6.io/docs/getting-started/installation/

## Running Tests

### Prerequisites

1. **Start the database**
```bash
docker-compose up -d
```

2. **Start the API Server with Test Database**

- Uncomment the test database URL in the `.env` file.
- Run the ```npm run dev``` command to start the server:

Keep the server running in a separate terminal.

### Run Load Test (Steady State)

The test will automatically:
- Create the test database if it doesn't exist
- Run migrations
- Create test resources
- Execute the load test
- Drop the test database after completion

```bash
# Using npm script (handles all setup and cleanup automatically)
npm run load:test
```

**Load Test Profile:**
- Duration: 1 hour
- Phases:
  - 5 min ramp-up (0 → 10 VUs)
  - 50 min steady state (10 VUs)
  - 5 min ramp-down (10 → 0 VUs)
- Request distribution: 70% GET `/availability`, 30% POST `/bookings`
- Expected throughput: ~1,000 requests/hour
- Resources: 8 pre-created test resource UUIDs

### Run Spike Test (Burst)

The test will automatically:
- Create the test database if it doesn't exist
- Run migrations
- Create test resources
- Execute the spike test
- Drop the test database after completion

```bash
# Using npm script (handles all setup and cleanup automatically)
npm run spike:test

# Or directly with k6
k6 run perf/k6-spike.js

# With custom base URL
BASE_URL=http://localhost:4000 k6 run perf/k6-spike.js
```

**Spike Test Profile:**
- Duration: 30 seconds
- Target: ~10,000 requests
- Request rate: ~333 requests/second
- Request distribution: 80% GET `/availability`, 20% POST `/bookings`
- Resources: 8 different resource IDs
- Booking window: Next 24 hours
- VUs: Auto-scaling (pre-allocated 100, max 200)

## Environment Variables

Both tests support the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `BASE_URL` | Base URL of the API server | `http://localhost:3000` |

Example with custom environment:
```bash
BASE_URL=https://staging.example.com k6 run perf/k6-load.js
```

## Key Metrics

The tests collect and report the following metrics:

### HTTP Metrics
- **http_req_duration**: Total request duration (including DNS, TCP, TLS, request, and response)
  - p50: Median response time
  - p95: 95th percentile response time
  - p99: 99th percentile response time
- **http_req_failed**: Rate of failed requests (non-2xx/3xx responses)
- **http_reqs**: Total number of HTTP requests

### Custom Metrics
- **availability_duration**: Response time for GET `/availability` requests
- **booking_duration**: Response time for POST `/bookings` requests
- **total_requests**: Counter of all requests made
- **iteration_duration**: Time to complete one iteration

### System Metrics
- **vus_active**: Current number of active virtual users
- **vus_max**: Maximum number of virtual users reached

## Performance Thresholds

### Load Test Thresholds
- p50 response time < 120 ms
- p95 response time < 250 ms
- p99 response time < 500 ms
- Error rate < 1%
- Availability p95 < 200 ms
- Booking p95 < 300 ms

### Spike Test Thresholds
- p95 response time < 500 ms
- p99 response time < 1000 ms
- Error rate < 5%
- Availability p95 < 400 ms
- Booking p95 < 600 ms

## What to Monitor

While running tests, monitor the following:

### Application Metrics
1. **API Response Times**: Watch for increasing latency
2. **Error Rates**: Track 4xx and 5xx responses
3. **Request Throughput**: Verify expected requests/second
4. **Memory Usage**: Check for memory leaks
5. **CPU Utilization**: Monitor server CPU load

### Database Metrics
1. **Query Latency**: Time taken for DB queries
2. **Connection Pool**: Available vs. used connections
3. **CPU Usage**: Database server CPU utilization
4. **Lock Contention**: Wait times for locks
5. **Index Usage**: Verify indexes are being used efficiently

### System Metrics
1. **Network I/O**: Bandwidth utilization
2. **Disk I/O**: Read/write operations
3. **System Load**: Overall system health

## Test Output

Both tests generate two outputs:

1. **Console Summary**: Real-time statistics printed to stdout
2. **JSON Summary**: Detailed metrics exported to:
   - `perf/load-test-summary.json` (load test)
   - `perf/spike-test-summary.json` (spike test)

### Reading JSON Output

The JSON files contain detailed metrics including:
- Request counts and rates
- Response time distributions
- Error counts
- Virtual user statistics
- Custom metric values

Example structure:
```json
{
  "metrics": {
    "http_req_duration": {
      "values": {
        "avg": 125.5,
        "min": 45.2,
        "med": 115.3,
        "max": 850.7,
        "p(90)": 180.4,
        "p(95)": 220.1,
        "p(99)": 450.3
      }
    },
    "http_req_failed": {
      "values": {
        "rate": 0.0035
      }
    }
  }
}
```

## Interpreting Results

### Success Criteria

A successful test run should show:
- ✅ All thresholds passing (green checks)
- ✅ Error rate below threshold (<1% load, <5% spike)
- ✅ Response times within acceptable ranges
- ✅ Stable memory and CPU usage
- ✅ No database connection pool exhaustion

### Warning Signs

Watch for these issues:
- ⚠️ Increasing response times over test duration
- ⚠️ Growing error rates
- ⚠️ Memory leaks (steadily increasing memory usage)
- ⚠️ Database connection pool saturation
- ⚠️ High CPU utilization (>80%)
- ⚠️ Slow queries appearing in database logs

## Troubleshooting

### High Error Rates

If you see high error rates (>1% for load test, >5% for spike test):
1. Check database connection pool size
2. Review database query performance
3. Check for deadlocks or lock contention
4. Verify adequate server resources
5. Review application logs for errors

### Slow Response Times

If response times exceed thresholds:
1. Check database query plans (use EXPLAIN)
2. Verify indexes are present and being used
3. Review N+1 query patterns
4. Check for inefficient recurrence expansion
5. Monitor CPU and memory usage

### Connection Failures

If requests fail to connect:
1. Verify API server is running
2. Check BASE_URL is correct
3. Review firewall/network settings
4. Ensure sufficient file descriptors
5. Check for port conflicts

## Next Steps

After running tests, review `Results.md` for:
- Baseline performance metrics
- Identified bottlenecks
- Optimization recommendations
- Historical performance trends

## Additional Resources

- [K6 Documentation](https://k6.io/docs/)
- [K6 Metrics Guide](https://k6.io/docs/using-k6/metrics/)
- [K6 Thresholds](https://k6.io/docs/using-k6/thresholds/)
- [K6 Load Test Types](https://k6.io/docs/test-types/introduction/)
