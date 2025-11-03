-- Initial schema for recurring meetings API
-- Migration: 001_init.sql

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Resources table
CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL
);

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    time_range TSTZRANGE GENERATED ALWAYS AS (tstzrange(start_time, end_time, '[)')) STORED,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recurrence rules table
CREATE TABLE IF NOT EXISTS recurrence_rules (
    booking_id UUID PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
    rrule TEXT NOT NULL,
    is_infinite BOOLEAN NOT NULL
);

-- Exceptions table
CREATE TABLE IF NOT EXISTS exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    except_date DATE NOT NULL,
    replace_start TIMESTAMPTZ,
    replace_end TIMESTAMPTZ
);

-- Indexes
-- 1. Basic B-tree index for resource_id
CREATE INDEX IF NOT EXISTS idx_bookings_resource_id 
    ON bookings (resource_id);

-- 2. GiST index for time_range alone
CREATE INDEX IF NOT EXISTS idx_bookings_time_range 
    ON bookings USING GIST (time_range);

-- B-tree indexes for lookups
CREATE INDEX IF NOT EXISTS idx_bookings_resource_times 
    ON bookings (resource_id, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_exceptions_booking_date 
    ON exceptions (booking_id, except_date);

-- Add constraint to ensure end_time is after start_time
ALTER TABLE bookings 
    ADD CONSTRAINT chk_booking_time_order 
    CHECK (end_time > start_time);

-- Add constraint for exception replacement times
ALTER TABLE exceptions 
    ADD CONSTRAINT chk_exception_replacement 
    CHECK (
        (replace_start IS NULL AND replace_end IS NULL) OR 
        (replace_start IS NOT NULL AND replace_end IS NOT NULL AND replace_end > replace_start)
    );
