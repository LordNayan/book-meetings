import { expandOccurrences, validateRRule, describeRRule } from '../../src/core/rrule';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

// Enable UTC plugin for consistent timezone handling in tests
dayjs.extend(utc);

describe('RRule Module', () => {
  describe('expandOccurrences', () => {
    it('should expand a weekly recurrence rule', () => {
      const baseStart = dayjs.utc('2025-11-04T10:00:00').toDate();
      const baseEnd = dayjs.utc('2025-11-04T11:00:00').toDate();
      const windowStart = dayjs.utc('2025-11-01T00:00:00').toDate();
      const windowEnd = dayjs.utc('2025-12-01T00:00:00').toDate();

      const occurrences = expandOccurrences(
        'FREQ=WEEKLY;BYDAY=MO',
        windowStart,
        windowEnd,
        baseStart,
        baseEnd
      );

      expect(occurrences.length).toBeGreaterThan(0);
      expect(occurrences[0]).toHaveProperty('start');
      expect(occurrences[0]).toHaveProperty('end');
    });

    it('should apply exceptions to skip occurrences', () => {
      const baseStart = dayjs.utc('2025-11-04T10:00:00').toDate();
      const baseEnd = dayjs.utc('2025-11-04T11:00:00').toDate();
      const windowStart = dayjs.utc('2025-11-01T00:00:00').toDate();
      const windowEnd = dayjs.utc('2025-12-01T00:00:00').toDate();

      const exceptions = [
        {
          exceptDate: dayjs.utc('2025-11-11').toDate(),
        },
      ];

      const occurrences = expandOccurrences(
        'FREQ=WEEKLY;BYDAY=MO',
        windowStart,
        windowEnd,
        baseStart,
        baseEnd,
        exceptions
      );

      // Check that the exception date is not in the occurrences
      const hasExceptionDate = occurrences.some(
        (occ) => dayjs.utc(occ.start).format('YYYY-MM-DD') === '2025-11-11'
      );
      expect(hasExceptionDate).toBe(false);
    });

    it('should apply exceptions to replace occurrences', () => {
      const baseStart = dayjs.utc('2025-11-04T10:00:00').toDate();
      const baseEnd = dayjs.utc('2025-11-04T11:00:00').toDate();
      const windowStart = dayjs.utc('2025-11-01T00:00:00').toDate();
      const windowEnd = dayjs.utc('2025-12-01T00:00:00').toDate();

      const exceptions = [
        {
          exceptDate: dayjs.utc('2025-11-10').toDate(),
          replaceStart: dayjs.utc('2025-11-10T14:00:00').toDate(),
          replaceEnd: dayjs.utc('2025-11-10T15:00:00').toDate(),
        },
      ];

      const occurrences = expandOccurrences(
        'FREQ=WEEKLY;BYDAY=MO',
        windowStart,
        windowEnd,
        baseStart,
        baseEnd,
        exceptions
      );

      // Check that replacement time exists
      const replacedOccurrence = occurrences.find(
        (occ) => dayjs.utc(occ.start).format('YYYY-MM-DD') === '2025-11-10'
      );
      expect(replacedOccurrence).toBeDefined();
      expect(dayjs.utc(replacedOccurrence?.start).hour()).toBe(14);
    });
  });

  describe('validateRRule', () => {
    it('should validate correct RRULE strings', () => {
      expect(validateRRule('FREQ=WEEKLY;BYDAY=MO')).toBe(true);
      expect(validateRRule('FREQ=DAILY;COUNT=10')).toBe(true);
      expect(validateRRule('FREQ=MONTHLY;BYMONTHDAY=15')).toBe(true);
    });

    it('should invalidate incorrect RRULE strings', () => {
      expect(validateRRule('INVALID_RULE')).toBe(false);
      expect(validateRRule('FREQ=INVALID')).toBe(false);
    });
  });

  describe('describeRRule', () => {
    it('should describe an RRULE in human-readable format', () => {
      const description = describeRRule('FREQ=WEEKLY;BYDAY=MO');
      expect(description).toContain('Monday');
    });

    it('should handle invalid RRULE gracefully', () => {
      const description = describeRRule('INVALID');
      expect(description).toBe('Invalid recurrence rule');
    });
  });
});
