-- Migration: Add DB-level constraint to prevent overlapping bookings
-- This ensures no double-bookings can occur even in race condition scenarios

ALTER TABLE bookings
    ADD CONSTRAINT bookings_no_overlap
    EXCLUDE USING GIST (
        resource_id WITH =,
        time_range WITH &&
    );
