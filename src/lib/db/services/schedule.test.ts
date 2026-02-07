import { describe, it, expect, beforeEach } from 'vitest';
import { getScheduleForDateTime, getPublicHolidays } from './schedule';
import { schedule, scheduleRule, scheduleException } from '../schema';
import type { Database } from '$lib/types';

/**
 * Test examples for the schedule system
 * Demonstrates various scheduling scenarios
 */

describe('Schedule Service', () => {
  let db: Database;

  beforeEach(async () => {
    // Setup test database - this would be mocked in actual tests
    // For now, this serves as documentation of usage patterns
  });

  describe('Restaurant Schedule Example', () => {
    it('should handle restaurant with complex weekly hours', async () => {
      // Create a restaurant schedule
      const restaurantSchedule = await db.insert(schedule).values({
        ownerType: 'feature',
        ownerId: 'restaurant-123',
        name: 'Main Restaurant Hours',
        description: 'Regular opening hours for the restaurant',
        timezone: 'Asia/Hong_Kong'
      });

      // Monday-Friday: 11:00-15:00, 18:00-22:00
      for (let day = 1; day <= 5; day++) {
        await db.insert(scheduleRule).values({
          scheduleId: restaurantSchedule.id,
          dayOfWeek: day,
          ruleType: 'weekly',
          timeSegments: [
            { startTime: '11:00', endTime: '15:00' },
            { startTime: '18:00', endTime: '22:00' }
          ]
        });
      }

      // Saturday: 10:00-23:00 (continuous)
      await db.insert(scheduleRule).values({
        scheduleId: restaurantSchedule.id,
        dayOfWeek: 6,
        ruleType: 'weekly',
        timeSegments: [{ startTime: '10:00', endTime: '23:00' }]
      });

      // Sunday: Closed
      await db.insert(scheduleRule).values({
        scheduleId: restaurantSchedule.id,
        dayOfWeek: 7,
        ruleType: 'weekly',
        isClosed: true
      });

      // Test various times
      const mondayLunch = await getScheduleForDateTime(
        db,
        'feature',
        'restaurant-123',
        '2024-01-15',
        '12:30'
      );
      expect(mondayLunch?.isOpen).toBe(true);
      expect(mondayLunch?.ruleType).toBe('weekly');

      const mondayAfternoon = await getScheduleForDateTime(
        db,
        'feature',
        'restaurant-123',
        '2024-01-15',
        '16:00'
      );
      expect(mondayAfternoon?.isOpen).toBe(false);

      const sundayAnyTime = await getScheduleForDateTime(
        db,
        'feature',
        'restaurant-123',
        '2024-01-14',
        '12:00'
      );
      expect(sundayAnyTime?.isClosed).toBe(true);
    });
  });

  describe('Monthly Market Example', () => {
    it('should handle monthly market on 1st and 3rd Saturday', async () => {
      const marketSchedule = await db.insert(schedule).values({
        ownerType: 'feature',
        ownerId: 'market-456',
        name: 'Monthly Market',
        description: 'Market held on 1st and 3rd Saturday of each month'
      });

      // 1st Saturday: 08:00-14:00
      await db.insert(scheduleRule).values({
        scheduleId: marketSchedule.id,
        ruleType: 'nthDow',
        nth: 1,
        dayOfWeek: 6,
        timeSegments: [{ startTime: '08:00', endTime: '14:00' }]
      });

      // 3rd Saturday: 08:00-14:00
      await db.insert(scheduleRule).values({
        scheduleId: marketSchedule.id,
        ruleType: 'nthDow',
        nth: 3,
        dayOfWeek: 6,
        timeSegments: [{ startTime: '08:00', endTime: '14:00' }]
      });

      // Test 1st Saturday of January 2024 (Jan 6)
      const firstSaturday = await getScheduleForDateTime(
        db,
        'feature',
        'market-456',
        '2024-01-06',
        '10:00'
      );
      expect(firstSaturday?.isOpen).toBe(true);
      expect(firstSaturday?.ruleType).toBe('nthDow');

      // Test 2nd Saturday (should be closed)
      const secondSaturday = await getScheduleForDateTime(
        db,
        'feature',
        'market-456',
        '2024-01-13',
        '10:00'
      );
      expect(secondSaturday?.isOpen).toBe(false);

      // Test 3rd Saturday (should be open)
      const thirdSaturday = await getScheduleForDateTime(
        db,
        'feature',
        'market-456',
        '2024-01-20',
        '10:00'
      );
      expect(thirdSaturday?.isOpen).toBe(true);
    });
  });

  describe('Public Holiday Example', () => {
    it('should handle public holiday schedules', async () => {
      const holidaySchedule = await db.insert(schedule).values({
        ownerType: 'organisation',
        ownerId: 'mall-789',
        name: 'Holiday Hours'
      });

      // Default public holiday: 10:00-18:00
      await db.insert(scheduleRule).values({
        scheduleId: holidaySchedule.id,
        ruleType: 'publicHoliday',
        timeSegments: [{ startTime: '10:00', endTime: '18:00' }]
      });

      // Specific holiday: New Year's Day closed
      await db.insert(scheduleException).values({
        scheduleId: holidaySchedule.id,
        exceptionDate: '2024-01-01',
        exceptionType: 'holiday',
        isClosed: true
      });

      // Test New Year's Day (should be closed)
      const newYear = await getScheduleForDateTime(
        db,
        'organisation',
        'mall-789',
        '2024-01-01',
        '12:00'
      );
      expect(newYear?.isClosed).toBe(true);
      expect(newYear?.ruleType).toBe('exception');

      // Test Lunar New Year (should use default holiday hours)
      const lunarNewYear = await getScheduleForDateTime(
        db,
        'organisation',
        'mall-789',
        '2024-02-10',
        '12:00'
      );
      expect(lunarNewYear?.isOpen).toBe(true);
      expect(lunarNewYear?.ruleType).toBe('publicHoliday');
    });
  });

  describe('Exception Date Example', () => {
    it('should handle special event exceptions', async () => {
      const storeSchedule = await db.insert(schedule).values({
        ownerType: 'feature',
        ownerId: 'store-abc',
        name: 'Store Hours'
      });

      // Regular hours: Monday-Friday 09:00-18:00
      for (let day = 1; day <= 5; day++) {
        await db.insert(scheduleRule).values({
          scheduleId: storeSchedule.id,
          dayOfWeek: day,
          ruleType: 'weekly',
          timeSegments: [{ startTime: '09:00', endTime: '18:00' }]
        });
      }

      // Special event: extended hours
      await db.insert(scheduleException).values({
        scheduleId: storeSchedule.id,
        exceptionDate: '2024-01-15',
        exceptionType: 'event',
        description: 'New Year Sale - Extended Hours',
        timeSegments: [{ startTime: '09:00', endTime: '22:00' }]
      });

      // Closure: maintenance day
      await db.insert(scheduleException).values({
        scheduleId: storeSchedule.id,
        exceptionDate: '2024-01-20',
        exceptionType: 'closure',
        description: 'Store Maintenance',
        isClosed: true
      });

      // Test regular day (should use weekly schedule)
      const regularDay = await getScheduleForDateTime(
        db,
        'feature',
        'store-abc',
        '2024-01-16',
        '12:00'
      );
      expect(regularDay?.isOpen).toBe(true);
      expect(regularDay?.ruleType).toBe('weekly');

      // Test special event day (should override weekly schedule)
      const eventDay = await getScheduleForDateTime(
        db,
        'feature',
        'store-abc',
        '2024-01-15',
        '20:00'
      );
      expect(eventDay?.isOpen).toBe(true);
      expect(eventDay?.ruleType).toBe('exception');
      expect(eventDay?.description).toBe('New Year Sale - Extended Hours');

      // Test closure day (should override everything)
      const closureDay = await getScheduleForDateTime(
        db,
        'feature',
        'store-abc',
        '2024-01-20',
        '12:00'
      );
      expect(closureDay?.isClosed).toBe(true);
      expect(closureDay?.ruleType).toBe('exception');
    });
  });

  describe('24-Hour Schedule Example', () => {
    it('should handle 24-hour operations', async () => {
      const hotelSchedule = await db.insert(schedule).values({
        ownerType: 'feature',
        ownerId: 'hotel-24h',
        name: '24-Hour Reception'
      });

      // Daily 24-hour operation
      for (let day = 1; day <= 7; day++) {
        await db.insert(scheduleRule).values({
          scheduleId: hotelSchedule.id,
          dayOfWeek: day,
          ruleType: 'weekly',
          is24Hours: true
        });
      }

      const anyTime = await getScheduleForDateTime(
        db,
        'feature',
        'hotel-24h',
        '2024-01-15',
        '03:30'
      );
      expect(anyTime?.isOpen).toBe(true);
      expect(anyTime?.is24Hours).toBe(true);
      expect(anyTime?.ruleType).toBe('weekly');
    });
  });

  describe('Precedence Rules Example', () => {
    it('should respect precedence order: exception > public holiday > nth DOW > weekly', async () => {
      const complexSchedule = await db.insert(schedule).values({
        ownerType: 'feature',
        ownerId: 'complex-venue',
        name: 'Complex Schedule'
      });

      // Weekly: Monday closed
      await db.insert(scheduleRule).values({
        scheduleId: complexSchedule.id,
        dayOfWeek: 1,
        ruleType: 'weekly',
        isClosed: true
      });

      // Nth DOW: 1st Monday open 10:00-14:00
      await db.insert(scheduleRule).values({
        scheduleId: complexSchedule.id,
        ruleType: 'nthDow',
        nth: 1,
        dayOfWeek: 1,
        timeSegments: [{ startTime: '10:00', endTime: '14:00' }]
      });

      // Public holiday: open 12:00-16:00
      await db.insert(scheduleRule).values({
        scheduleId: complexSchedule.id,
        ruleType: 'publicHoliday',
        timeSegments: [{ startTime: '12:00', endTime: '16:00' }]
      });

      // Exception: closed for private event
      await db.insert(scheduleException).values({
        scheduleId: complexSchedule.id,
        exceptionDate: '2024-01-01',
        isClosed: true,
        description: 'Private Event'
      });

      // Jan 1, 2024 is a Monday and a public holiday with an exception
      // Should use exception (closed) despite other rules saying it should be open
      const result = await getScheduleForDateTime(
        db,
        'feature',
        'complex-venue',
        '2024-01-01',
        '13:00'
      );
      expect(result?.isClosed).toBe(true);
      expect(result?.ruleType).toBe('exception');
    });
  });

  describe('Schedule Query Functions', () => {
    it('should get public holidays for date range', async () => {
      const holidays = getPublicHolidays('2024-01-01', '2024-01-31', 'HK');
      expect(holidays.length).toBeGreaterThan(0);
      expect(holidays.some((holiday) => holiday.date === '2024-01-01')).toBe(true);
    });
  });
});
