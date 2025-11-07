import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const failureRate = new Rate('http_req_failed');
const availabilityDuration = new Trend('availability_duration');
const bookingDuration = new Trend('booking_duration');
const requestCounter = new Counter('total_requests');

// Configuration
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

// Test configuration - 30 seconds spike with 10,000 requests
// Using constant VUs to simulate sudden spike
export const options = {
  scenarios: {
    spike: {
      executor: 'constant-arrival-rate',
      rate: 333, // ~333 requests per second = ~10,000 requests in 30 seconds
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 100, // Pre-allocate VUs
      maxVUs: 200, // Allow up to 200 VUs if needed
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    'http_req_failed': ['rate<0.10'], // Less than 10% errors during spike (more lenient)
    'availability_duration': ['p(95)<400'],
    'booking_duration': ['p(95)<600'],
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
// Each call returns a time slot that's at least 3 hours apart from previous slots
// (to accommodate varying booking durations in spike test)
function randomFutureDate() {
  const now = new Date();
  
  // Start from 1 hour in the future to avoid any past dates
  const baseOffsetHours = 1;
  
  // Each slot is separated by 3 hours to prevent any overlap
  // (up to 2 hours booking + 1 hour buffer)
  const slotSeparationHours = 3;
  
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

// Helper function to add minutes to a date
function addMinutes(dateString, minutes) {
  const date = new Date(dateString);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

// GET /availability request
function checkAvailability() {
  const resourceId = randomElement(RESOURCE_IDS);
  const startTime = randomFutureDate();
  // Vary the query window: 1-4 hours
  const windowHours = Math.floor(Math.random() * 3) + 1;
  const endTime = addHours(startTime, windowHours);
  
  const url = `${BASE_URL}/availability?resource_id=${resourceId}&from=${startTime}&to=${endTime}`;
  
  const response = http.get(url, {
    tags: { name: 'GetAvailability' },
  });
  
  const success = check(response, {
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
  // Vary booking duration: 30 min, 1 hour, or 2 hours
  const durations = [30, 60, 120];
  const duration = randomElement(durations);
  const endTime = addMinutes(startTime, duration);
  
  const payload = JSON.stringify({
    resource_id: resourceId,
    start_time: startTime,
    end_time: endTime,
    title: `Spike Test Booking ${Math.random().toString(36).substring(7)}`,
    description: 'Automated spike test booking',
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { name: 'CreateBooking' },
  };
  
  const response = http.post(`${BASE_URL}/bookings`, payload, params);
  
  const success = check(response, {
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

// Main test scenario - 80% GET, 20% POST
export default function () {
  const rand = Math.random();
  
  if (rand < 0.8) {
    // 80% - Check availability
    checkAvailability();
  } else {
    // 20% - Create booking
    createBooking();
  }
  
  // No sleep - maximum throughput for spike test
}

// Setup function - runs once before the test
export function setup() {
  console.log(`Starting spike test against ${BASE_URL}`);
  console.log(`Resource IDs: ${RESOURCE_IDS.join(', ')}`);
  console.log('Test duration: 30 seconds');
  console.log('Target: ~10,000 requests (80% GET, 20% POST)');
  console.log('Arrival rate: ~333 requests/second');
}

// Teardown function - runs once after the test
export function teardown(data) {
  console.log('Spike test completed');
}

// Export summary to JSON
export function handleSummary(data) {
  return {
    'perf/spike-test-summary.json': JSON.stringify(data, null, 2),
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const { indent = '', enableColors = false } = options;
  const metrics = data.metrics;
  
  let output = '\n';
  output += `${indent}Spike Test Summary\n`;
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
    output += `${indent}Total Requests: ${metrics.total_requests.values.count}\n`;
    const duration = 30; // 30 seconds
    const rps = (metrics.total_requests.values.count / duration).toFixed(2);
    output += `${indent}Requests/sec: ${rps}\n\n`;
  }
  
  if (metrics.vus_max && metrics.vus_max.values && metrics.vus_max.values.max !== undefined) {
    output += `${indent}Virtual Users (max): ${metrics.vus_max.values.max}\n\n`;
  }
  
  if (metrics.iterations && metrics.iterations.values && metrics.iterations.values.count !== undefined) {
    output += `${indent}Iterations: ${metrics.iterations.values.count}\n`;
    if (metrics.iteration_duration && metrics.iteration_duration.values && metrics.iteration_duration.values.avg !== undefined) {
      output += `${indent}Iteration Duration (avg): ${metrics.iteration_duration.values.avg.toFixed(2)} ms\n\n`;
    }
  }
  
  output += `${indent}${'='.repeat(60)}\n`;
  
  return output;
}
