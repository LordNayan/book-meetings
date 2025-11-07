import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const failureRate = new Rate('http_req_failed');
const availabilityDuration = new Trend('availability_duration');
const bookingDuration = new Trend('booking_duration');
const requestCounter = new Counter('total_requests');

// Configuration
/* global __ENV */
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
// Generate valid UUIDs for resources
const RESOURCE_IDS = [
  '550e8400-e29b-41d4-a716-446655440001',
  '550e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440003',
  '550e8400-e29b-41d4-a716-446655440004',
  '550e8400-e29b-41d4-a716-446655440005',
  '550e8400-e29b-41d4-a716-446655440006',
  '550e8400-e29b-41d4-a716-446655440007',
  '550e8400-e29b-41d4-a716-446655440008',
];

// Test configuration - 1 hour duration with ramp phases
// Target: ~1000 requests/hour (70% GET availability, 30% POST bookings = ~300 bookings/hour)
// To achieve ~1000 total requests/hour with realistic think time, we need ~10 VUs
export const options = {
  stages: [
    { duration: '5m', target: 10 },   // Ramp up to 10 VUs over 5 minutes
    { duration: '50m', target: 10 },  // Stay at 10 VUs for 50 minutes
    { duration: '5m', target: 0 },    // Ramp down to 0 VUs over 5 minutes
  ],
  thresholds: {
    'http_req_duration': ['p(50)<120', 'p(95)<250', 'p(99)<500'],
    'http_req_failed': ['rate<0.05'], // Less than 5% errors
    'availability_duration': ['p(95)<200'],
    'booking_duration': ['p(95)<300'],
  },
  summaryTrendStats: ['min', 'avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  summaryTimeUnit: 'ms',
};

// Helper function to get random element from array
function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Counter to ensure unique, non-overlapping time slots
let slotCounter = 0;

// Helper function to generate non-overlapping future dates
// Each call returns a time slot that's at least 2 hours apart from previous slots
function randomFutureDate() {
  const now = new Date();
  
  // Start from 1 hour in the future to avoid any past dates
  const baseOffsetHours = 1;
  
  // Each slot is separated by 2 hours to prevent any overlap
  // (1 hour booking + 1 hour buffer)
  const slotSeparationHours = 2;
  
  // Calculate offset based on counter to ensure non-overlapping slots
  const totalOffsetHours = baseOffsetHours + (slotCounter * slotSeparationHours);
  
  // Increment counter for next call
  slotCounter++;
  
  // Create new date with calculated offset
  const futureDate = new Date(now.getTime() + totalOffsetHours * 60 * 60 * 1000);
  
  // Round to nearest hour for cleaner timestamps
  futureDate.setMinutes(0, 0, 0);
  
  return futureDate.toISOString();
}

// Helper function to add hours to a date
function addHours(dateString, hours) {
  const date = new Date(dateString);
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

// GET /availability request
function checkAvailability() {
  const resourceId = randomElement(RESOURCE_IDS);
  const startTime = randomFutureDate();
  const endTime = addHours(startTime, 8); // 8-hour window
  
  const url = `${BASE_URL}/availability?resource_id=${resourceId}&from=${startTime}&to=${endTime}`;
  
  console.log(`[GET /availability] URL: ${url}`);
  
  const response = http.get(url, {
    tags: { name: 'GetAvailability' },
  });
  
  console.log(`[GET /availability] Status: ${response.status}`);
  console.log(`[GET /availability] Body: ${response.body}`);
  
  check(response, {
    'availability status is 200': (r) => r.status === 200,
    'availability response has slots': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.available_slots);
      } catch {
        return false;
      }
    },
  });
  
  // Only mark as failed if it's not a success (2xx status)
  const failed = response.status < 200 || response.status >= 300;
  availabilityDuration.add(response.timings.duration);
  failureRate.add(failed);
  requestCounter.add(1);
  
  return response;
}

// POST /bookings request
function createBooking() {
  const resourceId = randomElement(RESOURCE_IDS);
  const startTime = randomFutureDate();
  const endTime = addHours(startTime, 1); // 1-hour booking
  
  const payload = JSON.stringify({
    resource_id: resourceId,
    start_time: startTime,
    end_time: endTime,
    title: `Load Test Booking ${Math.random().toString(36).substring(7)}`,
    description: 'Automated load test booking',
  });
  
  console.log(`[POST /bookings] Payload: ${payload}`);
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { name: 'CreateBooking' },
  };
  
  const response = http.post(`${BASE_URL}/bookings`, payload, params);
  
  console.log(`[POST /bookings] Status: ${response.status}`);
  console.log(`[POST /bookings] Body: ${response.body}`);
  
  check(response, {
    'booking status is 201 or 409': (r) => r.status === 201 || r.status === 409,
    'booking response has id or error': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.id || body.error;
      } catch {
        return false;
      }
    },
  });
  
  // Only mark as failed if it's a real error (not 201 Created or 409 Conflict)
  // 409 is expected behavior for overlapping bookings, not a failure
  const failed = response.status !== 201 && response.status !== 409;
  bookingDuration.add(response.timings.duration);
  failureRate.add(failed);
  requestCounter.add(1);
  
  return response;
}

// Main test scenario - 70% GET, 30% POST
export default function () {
  const rand = Math.random();
  
  if (rand < 0.7) {
    // 70% - Check availability
    checkAvailability();
  } else {
    // 30% - Create booking
    createBooking();
  }
  
  // Think time - simulate realistic user behavior
  // Average ~3.6 seconds between requests to achieve ~1000 requests/hour with 10 VUs
  sleep(Math.random() * 7 + 0.5); // Random sleep 0.5-7.5 seconds
}

// Setup function - runs once before the test
export function setup() {
  console.log(`Starting load test against ${BASE_URL}`);
  console.log(`Resource IDs: ${RESOURCE_IDS.join(', ')}`);
  console.log('Test duration: 1 hour (5m ramp-up, 50m steady, 5m ramp-down)');
  console.log('Virtual Users: 10 (steady state)');
  console.log('Expected load: ~1000 requests/hour (70% GET, 30% POST)');
  console.log('Target: ~300 bookings/hour');
  console.log('\nNote: Ensure test resources are created by running:');
  console.log('  npm run perf:setup\n');
}

// Teardown function - runs once after the test
export function teardown(_data) {
  console.log('Load test completed');
}

// Export summary to JSON
export function handleSummary(data) {
  return {
    'tests/perf/load-test-summary.json': JSON.stringify(data, null, 2),
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const { indent = '' } = options;
  const metrics = data.metrics;
  
  let output = '\n';
  output += `${indent}Load Test Summary\n`;
  output += `${indent}${'='.repeat(60)}\n\n`;
  
  if (metrics.http_req_duration && metrics.http_req_duration.values) {
    output += `${indent}HTTP Request Duration:\n`;
    const values = metrics.http_req_duration.values;
    if (values['p(50)'] !== undefined) output += `${indent}  p(50): ${values['p(50)'].toFixed(2)} ms\n`;
    if (values['p(95)'] !== undefined) output += `${indent}  p(95): ${values['p(95)'].toFixed(2)} ms\n`;
    if (values['p(99)'] !== undefined) output += `${indent}  p(99): ${values['p(99)'].toFixed(2)} ms\n`;
    if (values.avg !== undefined) output += `${indent}  avg:   ${values.avg.toFixed(2)} ms\n`;
    if (values.max !== undefined) output += `${indent}  max:   ${values.max.toFixed(2)} ms\n`;
    output += '\n';
  }
  
  if (metrics.http_req_failed && metrics.http_req_failed.values && metrics.http_req_failed.values.rate !== undefined) {
    const failRate = (metrics.http_req_failed.values.rate * 100).toFixed(2);
    output += `${indent}Error Rate: ${failRate}%\n\n`;
  }
  
  if (metrics.total_requests && metrics.total_requests.values && metrics.total_requests.values.count !== undefined) {
    output += `${indent}Total Requests: ${metrics.total_requests.values.count}\n\n`;
  }
  
  if (metrics.vus_max && metrics.vus_max.values && metrics.vus_max.values.max !== undefined) {
    output += `${indent}Virtual Users (max): ${metrics.vus_max.values.max}\n\n`;
  }
  
  output += `${indent}${'='.repeat(60)}\n`;
  
  return output;
}
