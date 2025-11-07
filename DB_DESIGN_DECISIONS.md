# DB Design Decisions for book-meetings

## Overview

This document explains the rationale and design choices for the database schema powering the book-meetings. The goal is to efficiently support single and recurring bookings, exceptions, and resource management, with robust querying and extensibility.

## Database Schema

<img width="1337" height="519" alt="Screenshot 2025-11-07 at 5 13 35 PM" src="https://github.com/user-attachments/assets/f8fcb74c-b9c5-4c3d-bbe8-561cdba5f6c4" />

## DESIGN DECISIONS

## Why Postgres was chosen over any other NoSQL DB?

1. Native Time Range Support - Postgres supports tstzrange type out of the box which will be useful for overlap logic.
2. Transaction Integrity - Double booking prevention logic can be easily handled using atomic operations(ON CONFLICT).
3. Index Types - Postgres supports GIST index that are used to optimize range queries.
4. Clear ER - Entity and its relationships are quite clear from the start and many results are just one simple join away.

## Schema Summary

### Tables

- **resources**: Bookable entities (rooms, desks, etc.)
- **bookings**: Individual booking records, with time range and metadata
- **recurrence_rules**: RRULE string for recurring bookings
- **exceptions**: Modifications or exclusions for recurring bookings

### Key Columns & Types

- All primary keys are UUIDs for uniqueness and scalability
- `time_range` column uses PostgreSQL's `tstzrange` for efficient time interval queries
- `metadata` is JSONB for flexible, extensible booking details

## Recurring Bookings

- Recurrence rules are stored in RFC 5545 RRULE format (e.g., `FREQ=WEEKLY;BYDAY=MO`)
- Each recurring booking has a single row in `recurrence_rules` linked by `booking_id`
- Infinite recurrences are flagged with `is_infinite`

## Exceptions

- Exceptions allow skipping or modifying specific occurrences of a recurring booking
- If `replace_start` and `replace_end` are set, the occurrence is rescheduled; if null, the occurrence is skipped
- Indexes on `(booking_id, except_date)` optimize lookup for exception dates

## Indexing & Performance

- **GIST index** on `time_range` enables fast overlap/containment queries for availability checks
- **B-tree indexes** on `(resource_id, start_time, end_time)` and `(booking_id, except_date)` support fast lookups and reporting
- Additional B-tree index on `resource_id` for direct resource queries

## Constraints & Data Integrity

- `end_time > start_time` enforced at DB level
- Exception replacement times must be both null or both set, and `replace_end > replace_start` if present
- Foreign keys with `ON DELETE CASCADE` ensure related data is cleaned up

## Extensibility

- `metadata` JSONB allows storing arbitrary booking details (organizer, attendees, etc.)
- Schema supports future expansion (e.g., resource types, booking statuses, approval workflows)

## Alternatives Considered

- Considered using composite primary keys for bookings, but UUIDs offer better scalability and simplicity
- Evaluated storing recurrence rules directly in bookings, but separate table improves normalization and query flexibility
- Considered using only Prisma migrations, but direct SQL is needed for generated columns and advanced indexes

## Summary

This design balances flexibility, query performance, and future extensibility. PostgreSQL features (UUID, tstzrange, GIST) are leveraged for robust time-based booking logic, while Prisma provides developer productivity and type safety.
