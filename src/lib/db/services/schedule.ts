import { and, asc, eq, inArray } from 'drizzle-orm';
// I18n
import { m } from '$lib/i18n';
// Holidays
import Holidays from 'date-holidays';
//
import {
  schedule,
  scheduleRule,
  scheduleRuleI18n,
  scheduleException,
  scheduleExceptionI18n,
  type ScheduleOwnerType,
  type TimeSegment
} from '../schema';
// TYPES
import type { Database } from '$lib/types';

/* ============================================================================
 * SCHEDULE QUERY HELPERS
 * ============================================================================
 * Functions for querying schedules with precedence: exception → publicHoliday → nthDow → weekly
 */

type ScheduleRuleRow = typeof scheduleRule.$inferSelect;

type RuleWithValidity = Pick<
  ScheduleRuleRow,
  | 'validFromMonth'
  | 'validFromDay'
  | 'validUntilMonth'
  | 'validUntilDay'
  | 'validFromYear'
  | 'validUntilYear'
  | 'modifiedAt'
  | 'createdAt'
>;

function getRuleSpecificity(rule: RuleWithValidity): number {
  const values = [
    rule.validFromYear,
    rule.validFromMonth,
    rule.validFromDay,
    rule.validUntilYear,
    rule.validUntilMonth,
    rule.validUntilDay
  ];
  return values.reduce(
    (total, value) => (value === null || value === undefined ? total : total + 1),
    0
  );
}

function hasYearConstraint(rule: RuleWithValidity): boolean {
  return rule.validFromYear !== null || rule.validUntilYear !== null;
}

function pickMostSpecificRule<T extends RuleWithValidity>(rules: T[]): T | null {
  return rules.reduce<T | null>((best, current) => {
    if (!best) {
      return current;
    }

    const bestScore = getRuleSpecificity(best);
    const currentScore = getRuleSpecificity(current);

    if (currentScore > bestScore) {
      return current;
    }

    if (currentScore < bestScore) {
      return best;
    }

    const bestHasYear = hasYearConstraint(best);
    const currentHasYear = hasYearConstraint(current);

    if (currentHasYear && !bestHasYear) {
      return current;
    }

    if (bestHasYear && !currentHasYear) {
      return best;
    }

    const bestTimestamp = Date.parse(best.modifiedAt ?? best.createdAt);
    const currentTimestamp = Date.parse(current.modifiedAt ?? current.createdAt);

    if (Number.isNaN(bestTimestamp) && Number.isNaN(currentTimestamp)) {
      return current;
    }

    if (Number.isNaN(bestTimestamp)) {
      return current;
    }

    if (Number.isNaN(currentTimestamp)) {
      return best;
    }

    return currentTimestamp >= bestTimestamp ? current : best;
  }, null);
}

/**
 * Check if a date is a public holiday using date-holidays library
 */
export function isPublicHoliday(
  date: string, // YYYY-MM-DD format
  region: string = 'HK' // Default to Hong Kong
): boolean {
  const hd = new Holidays(region);
  const holidays = hd.isHoliday(new Date(date));
  return holidays !== false;
}

/**
 * Get public holiday info for a date using date-holidays library
 */
export function getPublicHoliday(
  date: string, // YYYY-MM-DD format
  region: string = 'HK' // Default to Hong Kong
) {
  const hd = new Holidays(region);
  const holidays = hd.isHoliday(new Date(date));

  if (holidays === false) {
    return null;
  }

  // Return the first holiday if multiple exist
  const holiday = Array.isArray(holidays) ? holidays[0] : holidays;

  return {
    date,
    name: holiday.name,
    nameEn: holiday.name,
    // Try to get localized names if available
    nameZhHant: holiday.name,
    nameZhHans: holiday.name,
    isRegional: false,
    region
  };
}

/**
 * Get the day of week for a date (1=Monday, 2=Tuesday, ..., 7=Sunday)
 * ISO 8601 format: Monday is the first day of the week
 */
function getDayOfWeek(date: string): number {
  const d = new Date(date + 'T00:00:00');
  const day = d.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  return day === 0 ? 7 : day; // Convert Sunday (0) to 7, keep Monday-Saturday as 1-6
}

/**
 * Get the nth occurrence of a day of week in a month
 * Returns 1-4 for 1st-4th, or -1 for last
 * Uses ISO 8601 DOW encoding: 1=Monday, 7=Sunday
 */
function getNthDayOfWeek(date: string): number {
  const d = new Date(date + 'T00:00:00');
  const day = d.getDate();
  const targetDayOfWeek = getDayOfWeek(date); // Get ISO DOW (1-7)

  // Count how many of this day of week have occurred so far this month
  const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  let count = 0;
  let current = new Date(firstOfMonth);

  while (current <= d) {
    if (getDayOfWeek(current.toISOString().split('T')[0]) === targetDayOfWeek) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  // If it's the 5th occurrence, it's the "last" one
  if (count === 5) {
    return -1;
  }

  return count;
}

/**
 * Check if a time is within any of the time segments
 */
function isTimeInSegments(time: string, segments: TimeSegment[]): boolean {
  // Convert time to minutes since midnight
  const [hours, minutes] = time.split(':').map(Number);
  const timeInMinutes = hours * 60 + minutes;

  return segments.some((segment) => {
    const [startHours, startMinutes] = segment.startTime.split(':').map(Number);
    const startInMinutes = startHours * 60 + startMinutes;

    // Handle open-ended times (no closing time)
    if (segment.endTime === null) {
      return timeInMinutes >= startInMinutes;
    }

    const [endHours, endMinutes] = segment.endTime.split(':').map(Number);
    const endInMinutes = endHours * 60 + endMinutes;

    // Handle cases where end time is after midnight
    if (endInMinutes < startInMinutes) {
      return timeInMinutes >= startInMinutes || timeInMinutes <= endInMinutes;
    }

    return timeInMinutes >= startInMinutes && timeInMinutes <= endInMinutes;
  });
}

/**
 * Checks if a given date is within the validity range of a schedule rule.
 * Handles recurring annual schedules and year-specific schedules.
 */
function isDateInRuleRange(
  date: Date,
  rule: {
    validFromMonth: number | null;
    validFromDay: number | null;
    validUntilMonth: number | null;
    validUntilDay: number | null;
    validFromYear: number | null;
    validUntilYear: number | null;
  }
): boolean {
  // If no validity range is set, the rule is always valid.
  if (rule.validFromMonth === null || rule.validUntilMonth === null) {
    return true;
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate(); // 1-31

  // 1. Check for year-specific ranges
  if (rule.validFromYear !== null && year < rule.validFromYear) {
    return false;
  }

  if (rule.validUntilYear !== null && year > rule.validUntilYear) {
    return false;
  }

  // Create date objects for comparison, using the target date's year for recurring rules.
  // Using UTC to prevent timezone-related date shifts.
  const fromDate = new Date(
    Date.UTC(year, rule.validFromMonth - 1, rule.validFromDay ?? 1)
  );
  const untilDate = new Date(
    Date.UTC(year, rule.validUntilMonth - 1, rule.validUntilDay ?? 1)
  );
  const checkDate = new Date(Date.UTC(year, month - 1, day));

  // 2. Handle ranges that span across the new year (e.g., Dec 1 to Jan 31)
  if (fromDate > untilDate) {
    // The range is something like Dec 1 to Jan 31.
    // The date is valid if it's (after Dec 1 of this year) OR (before Jan 31 of this year).
    // We need to check against two ranges:
    // Range 1: fromDate (this year) to end of this year
    // Range 2: start of this year to untilDate (this year)
    const endOfYear = new Date(Date.UTC(year, 11, 31));
    const startOfYear = new Date(Date.UTC(year, 0, 1));

    const isInFirstPart = checkDate >= fromDate && checkDate <= endOfYear;
    const isInSecondPart = checkDate >= startOfYear && checkDate <= untilDate;

    return isInFirstPart || isInSecondPart;
  } else {
    // 3. Handle normal ranges within the same year
    return checkDate >= fromDate && checkDate <= untilDate;
  }
}

/**
 * Get active schedules for an owner
 */
export async function getActiveSchedules(
  db: Database,
  ownerType: ScheduleOwnerType,
  ownerId: string
) {
  return await db
    .select()
    .from(schedule)
    .where(
      and(
        eq(schedule.ownerType, ownerType),
        eq(schedule.ownerId, ownerId),
        eq(schedule.isActive, true)
      )
    )
    .orderBy(asc(schedule.createdAt));
}

/**
 * Get the effective schedule for a specific date and time
 * Follows precedence: exception → publicHoliday → nthDow → weekly
 */
export async function getScheduleForDateTime(
  db: Database,
  ownerType: ScheduleOwnerType,
  ownerId: string,
  date: string, // YYYY-MM-DD format
  time: string, // HH:MM format (24-hour)
  region?: string // Optional region for public holidays
): Promise<{
  isOpen: boolean;
  timeSegments: TimeSegment[];
  is24Hours: boolean;
  isClosed: boolean;
  ruleType: 'exception' | 'publicHoliday' | 'nthDow' | 'weekly' | 'none';
  ruleId: string | null;
  description?: string;
} | null> {
  const activeSchedules = await getActiveSchedules(db, ownerType, ownerId);

  if (activeSchedules.length === 0) {
    return null;
  }

  const targetDate = new Date(date + 'T00:00:00Z'); // Use a specific time and UTC to avoid timezone issues
  const dayOfWeek = getDayOfWeek(date);
  const nthDayOfWeek = getNthDayOfWeek(date);
  const isHoliday = isPublicHoliday(date, region);
  const holidayInfo = isHoliday ? getPublicHoliday(date, region) : null;

  // Check each schedule in precedence order
  for (const sched of activeSchedules) {
    // 1. Check exception date schedules (highest priority)
    const exceptionRules = await db
      .select()
      .from(scheduleException)
      .where(
        and(
          eq(scheduleException.scheduleId, sched.id),
          eq(scheduleException.exceptionDate, date)
        )
      )
      .limit(1);

    if (exceptionRules.length > 0) {
      const rule = exceptionRules[0];
      return {
        isOpen:
          !rule.isClosed &&
          (rule.is24Hours ||
            (rule.timeSegments ? isTimeInSegments(time, rule.timeSegments) : false)),
        timeSegments: rule.timeSegments || [],
        is24Hours: rule.is24Hours,
        isClosed: rule.isClosed,
        ruleType: 'exception',
        ruleId: rule.id,
        description: rule.description
      };
    }

    // 2. Check public holiday schedules
    if (isHoliday) {
      const holidayRules = await db
        .select()
        .from(scheduleRule)
        .where(
          and(
            eq(scheduleRule.scheduleId, sched.id),
            eq(scheduleRule.ruleType, 'publicHoliday')
          )
        );

      const validHolidayRules = holidayRules.filter((rule) =>
        isDateInRuleRange(targetDate, rule)
      );

      const rule = pickMostSpecificRule(validHolidayRules);

      if (rule) {
        return {
          isOpen:
            !rule.isClosed &&
            (rule.is24Hours ||
              (rule.timeSegments ? isTimeInSegments(time, rule.timeSegments) : false)),
          timeSegments: rule.timeSegments || [],
          is24Hours: rule.is24Hours,
          isClosed: rule.isClosed,
          ruleType: 'publicHoliday',
          ruleId: rule.id,
          description: holidayInfo?.name || 'Public Holiday'
        };
      }
    }

    // 3. & 4. Check combined weekly and nth day-of-week schedules
    const dayRules = await db
      .select()
      .from(scheduleRule)
      .where(
        and(
          eq(scheduleRule.scheduleId, sched.id),
          eq(scheduleRule.dayOfWeek, dayOfWeek),
          inArray(scheduleRule.ruleType, ['weekly', 'nthDow'])
        )
      );

    // Separate the rules by type
    const nthDowRules = dayRules.filter((r) => r.ruleType === 'nthDow');
    const regularWeeklyRules = dayRules.filter((r) => r.ruleType === 'weekly');

    // First, process nthDow rules as they have higher precedence
    const validNthDowRules = nthDowRules
      .filter((rule) => rule.nth === nthDayOfWeek)
      .filter((rule) => isDateInRuleRange(targetDate, rule));

    const nthDowRule = pickMostSpecificRule(validNthDowRules);

    if (nthDowRule) {
      return {
        isOpen:
          !nthDowRule.isClosed &&
          (nthDowRule.is24Hours ||
            (nthDowRule.timeSegments
              ? isTimeInSegments(time, nthDowRule.timeSegments)
              : false)),
        timeSegments: nthDowRule.timeSegments || [],
        is24Hours: nthDowRule.is24Hours,
        isClosed: nthDowRule.isClosed,
        ruleType: 'nthDow',
        ruleId: nthDowRule.id
      };
    }

    // If no valid nthDow rule was found, process the regular weekly rules
    const validWeeklyRules = regularWeeklyRules.filter((rule) =>
      isDateInRuleRange(targetDate, rule)
    );

    const weeklyRule = pickMostSpecificRule(validWeeklyRules);

    if (weeklyRule) {
      return {
        isOpen:
          !weeklyRule.isClosed &&
          (weeklyRule.is24Hours ||
            (weeklyRule.timeSegments
              ? isTimeInSegments(time, weeklyRule.timeSegments)
              : false)),
        timeSegments: weeklyRule.timeSegments || [],
        is24Hours: weeklyRule.is24Hours,
        isClosed: weeklyRule.isClosed,
        ruleType: 'weekly',
        ruleId: weeklyRule.id
      };
    }
  }

  // No matching rules found
  return {
    isOpen: false,
    timeSegments: [],
    is24Hours: false,
    isClosed: true,
    ruleType: 'none',
    ruleId: null
  };
}

/**
 * Get schedule status for a full day
 */
export async function getScheduleForDate(
  db: Database,
  ownerType: ScheduleOwnerType,
  ownerId: string,
  date: string, // YYYY-MM-DD format
  region?: string
) {
  const hourlyStatus = [];

  for (let hour = 0; hour < 24; hour++) {
    const time = `${hour.toString().padStart(2, '0')}:00`;
    const status = await getScheduleForDateTime(
      db,
      ownerType,
      ownerId,
      date,
      time,
      region
    );

    if (status) {
      hourlyStatus.push({
        hour,
        time,
        isOpen: status.isOpen,
        is24Hours: status.is24Hours,
        isClosed: status.isClosed,
        ruleType: status.ruleType,
        description: status.description
      });
    }
  }

  return hourlyStatus;
}

/**
 * Get next opening time from a given date/time
 */
export async function getNextOpeningTime(
  db: Database,
  ownerType: ScheduleOwnerType,
  ownerId: string,
  fromDate: string, // YYYY-MM-DD format
  fromTime: string, // HH:MM format
  maxDays: number = 30,
  region?: string
): Promise<{
  date: string;
  time: string;
  ruleType: string;
  description?: string;
} | null> {
  let currentDate = new Date(fromDate + 'T' + fromTime);
  const endDate = new Date(currentDate);
  endDate.setDate(endDate.getDate() + maxDays);

  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const timeStr = currentDate.toTimeString().slice(0, 5);

    const status = await getScheduleForDateTime(
      db,
      ownerType,
      ownerId,
      dateStr,
      timeStr,
      region
    );

    if (status?.isOpen) {
      return {
        date: dateStr,
        time: timeStr,
        ruleType: status.ruleType,
        description: status.description
      };
    }

    // Check every hour
    currentDate.setHours(currentDate.getHours() + 1);
  }

  return null;
}

/**
 * Get public holidays for a date range using date-holidays library
 * Returns holidays for the specified region
 */
export function getPublicHolidays(
  startDate: string,
  endDate: string,
  region: string = 'HK'
) {
  const hd = new Holidays(region);
  const start = new Date(startDate);
  const end = new Date(endDate);

  const holidays = [];
  const current = new Date(start);

  while (current <= end) {
    const holiday = hd.isHoliday(current);
    if (holiday !== false) {
      const holidayData = Array.isArray(holiday) ? holiday[0] : holiday;
      holidays.push({
        date: current.toISOString().split('T')[0],
        name: holidayData.name,
        nameEn: holidayData.name,
        nameZhHant: holidayData.name,
        nameZhHans: holidayData.name,
        isRegional: false,
        region
      });
    }
    current.setDate(current.getDate() + 1);
  }

  return holidays;
}

/**
 * Create a complete weekly schedule for a business
 */
export async function createWeeklySchedule(
  db: Database,
  ownerType: ScheduleOwnerType,
  ownerId: string,
  weeklyHours: {
    dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday (0 will be normalized to 7)
    timeSegments: TimeSegment[];
    isClosed?: boolean;
    is24Hours?: boolean;
    validFromMonth?: number;
    validFromDay?: number;
    validUntilMonth?: number;
    validUntilDay?: number;
    validYear?: number;
    localeNames?: Record<string, string>; // locale -> name mapping for this specific weekly schedule
    localeNameShorts?: Record<string, string>; // locale -> short name mapping
    localeDescriptions?: Record<string, string>; // locale -> description mapping
  }[],
  options?: {
    osmOpeningHours?: string;
    timezone?: string;
  }
) {
  const timezone = options?.timezone || 'Asia/Hong_Kong';

  // Create the main schedule
  const newSchedule = await db.insert(schedule).values({
    ownerType,
    ownerId,
    osmOpeningHours: options?.osmOpeningHours,
    timezone
  });

  // Add weekly schedule entries with individual I18n
  for (const daySchedule of weeklyHours) {
    const normalizedDayOfWeek = daySchedule.dayOfWeek === 0 ? 7 : daySchedule.dayOfWeek;

    const scheduleRuleRecord = await db.insert(scheduleRule).values({
      scheduleId: newSchedule.id,
      dayOfWeek: normalizedDayOfWeek,
      ruleType: 'weekly',
      timeSegments: daySchedule.timeSegments,
      isClosed: daySchedule.isClosed || false,
      is24Hours: daySchedule.is24Hours || false,
      validFromMonth: daySchedule.validFromMonth,
      validFromDay: daySchedule.validFromDay,
      validUntilMonth: daySchedule.validUntilMonth,
      validUntilDay: daySchedule.validUntilDay,
      validFromYear: daySchedule.validYear,
      validUntilYear: daySchedule.validYear
    });

    // Add individual weekly schedule I18n if provided
    if (daySchedule.localeNames) {
      for (const [locale, name] of Object.entries(daySchedule.localeNames)) {
        await db.insert(scheduleRuleI18n).values({
          scheduleRuleId: scheduleRuleRecord.id,
          locale,
          name,
          nameShort: daySchedule.localeNameShorts?.[locale],
          description: daySchedule.localeDescriptions?.[locale]
        });
      }
    }
  }

  return newSchedule;
}

/**
 * Add an exception date to an existing schedule
 */
export async function addExceptionDate(
  db: Database,
  scheduleId: string,
  exceptionDate: string,
  exceptionType: 'holiday' | 'event' | 'closure' | 'special_hours',
  options: {
    description?: string;
    timeSegments?: TimeSegment[];
    isClosed?: boolean;
    is24Hours?: boolean;
  } = {}
) {
  return await db.insert(scheduleException).values({
    scheduleId,
    exceptionDate,
    exceptionType,
    description: options.description,
    timeSegments: options.timeSegments,
    isClosed: options.isClosed || false,
    is24Hours: options.is24Hours || false
  });
}

/* ============================================================================
 * SCHEDULE I18N FUNCTIONS
 * ============================================================================
 * Functions for managing schedule internationalization
 */

/* ============================================================================
 * SCHEDULE RULE I18N FUNCTIONS
 * ============================================================================
 * Functions for managing schedule rule internationalization
 * Most useful for seasonal schedules: "Winter Hours", "Summer Schedule", etc.
 */

/**
 * Get schedule rule I18n data for a specific locale
 */
export async function getScheduleRuleI18n(
  db: Database,
  scheduleRuleId: string,
  locale: string
) {
  const result = await db
    .select()
    .from(scheduleRuleI18n)
    .where(
      and(
        eq(scheduleRuleI18n.scheduleRuleId, scheduleRuleId),
        eq(scheduleRuleI18n.locale, locale)
      )
    )
    .limit(1);

  return result[0] || null;
}

/**
 * Get all I18n data for a schedule rule
 */
export async function getScheduleRuleI18nAll(db: Database, scheduleRuleId: string) {
  return await db
    .select()
    .from(scheduleRuleI18n)
    .where(eq(scheduleRuleI18n.scheduleRuleId, scheduleRuleId));
}

/**
 * Set schedule rule I18n data
 */
export async function setScheduleRuleI18n(
  db: Database,
  scheduleRuleId: string,
  locale: string,
  data: {
    name?: string;
    nameShort?: string;
    nameGen?: boolean;
    nameShortGen?: boolean;
  }
) {
  // Use upsert pattern - try to update first, then insert if not exists
  const existing = await getScheduleRuleI18n(db, scheduleRuleId, locale);

  if (existing) {
    return await db
      .update(scheduleRuleI18n)
      .set(data)
      .where(
        and(
          eq(scheduleRuleI18n.scheduleRuleId, scheduleRuleId),
          eq(scheduleRuleI18n.locale, locale)
        )
      );
  } else {
    return await db.insert(scheduleRuleI18n).values({
      scheduleRuleId,
      locale,
      name: data.name,
      nameShort: data.nameShort,
      nameGen: data.nameGen ?? true,
      nameShortGen: data.nameShortGen ?? true
    });
  }
}

/**
 * Get schedule rule with I18n data
 */
export async function getScheduleRuleWithI18n(
  db: Database,
  scheduleRuleId: string,
  locale: string = 'en'
) {
  const scheduleRuleData = await db
    .select()
    .from(scheduleRule)
    .where(eq(scheduleRule.id, scheduleRuleId))
    .limit(1);

  if (scheduleRuleData.length === 0) {
    return null;
  }

  const i18nData = await getScheduleRuleI18n(db, scheduleRuleId, locale);

  // Provide default names based on date ranges if no I18n data exists
  const rule = scheduleRuleData[0];
  const defaultName = 'Schedule Rule';
  const defaultNameShort = 'Rule';

  return {
    ...rule,
    name: i18nData?.name || defaultName,
    nameShort: i18nData?.nameShort || defaultNameShort
  };
}

/**
 * Get all schedule rules for a schedule with I18n data
 */
export async function getScheduleRulesWithI18n(
  db: Database,
  scheduleId: string,
  locale: string = 'en'
) {
  const scheduleRules = await db
    .select()
    .from(scheduleRule)
    .where(eq(scheduleRule.scheduleId, scheduleId))
    .orderBy(scheduleRule.dayOfWeek, scheduleRule.ruleType);

  return Promise.all(
    scheduleRules.map(async (rule) => {
      const i18nData = await getScheduleRuleWithI18n(db, rule.id, locale);
      return i18nData || rule;
    })
  );
}

/* ============================================================================
 * NTH DAY-OF-WEEK SCHEDULE I18N FUNCTIONS
 * ============================================================================
 * Functions for managing nth day-of-week schedule internationalization
 * Useful for named recurring events: "First Saturday Market", "Last Friday Sale", etc.
 */

/**
 * Get nth day-of-week schedule I18n data for a specific locale
 */
export async function getNthDowScheduleI18n(
  db: Database,
  nthDowScheduleId: string,
  locale: string
) {
  const rule = await db
    .select({ ruleType: scheduleRule.ruleType })
    .from(scheduleRule)
    .where(eq(scheduleRule.id, nthDowScheduleId))
    .limit(1);

  if (rule.length === 0 || rule[0].ruleType !== 'nthDow') {
    return null;
  }

  return await getScheduleRuleI18n(db, nthDowScheduleId, locale);
}

/**
 * Get all I18n data for a nth day-of-week schedule
 */
export async function getNthDowScheduleI18nAll(db: Database, nthDowScheduleId: string) {
  const rule = await db
    .select({ ruleType: scheduleRule.ruleType })
    .from(scheduleRule)
    .where(eq(scheduleRule.id, nthDowScheduleId))
    .limit(1);

  if (rule.length === 0 || rule[0].ruleType !== 'nthDow') {
    return [];
  }

  return await db
    .select()
    .from(scheduleRuleI18n)
    .where(eq(scheduleRuleI18n.scheduleRuleId, nthDowScheduleId));
}

/**
 * Set nth day-of-week schedule I18n data
 */
export async function setNthDowScheduleI18n(
  db: Database,
  nthDowScheduleId: string,
  locale: string,
  data: {
    name?: string;
    nameShort?: string;
    nameGen?: boolean;
    nameShortGen?: boolean;
  }
) {
  // Use upsert pattern - try to update first, then insert if not exists
  const existing = await getNthDowScheduleI18n(db, nthDowScheduleId, locale);

  if (existing) {
    return await db
      .update(scheduleRuleI18n)
      .set(data)
      .where(
        and(
          eq(scheduleRuleI18n.scheduleRuleId, nthDowScheduleId),
          eq(scheduleRuleI18n.locale, locale)
        )
      );
  } else {
    const rule = await db
      .select({ ruleType: scheduleRule.ruleType })
      .from(scheduleRule)
      .where(eq(scheduleRule.id, nthDowScheduleId))
      .limit(1);

    if (rule.length === 0 || rule[0].ruleType !== 'nthDow') {
      return null;
    }

    return await db.insert(scheduleRuleI18n).values({
      scheduleRuleId: nthDowScheduleId,
      locale,
      name: data.name,
      nameShort: data.nameShort,
      nameGen: data.nameGen ?? true,
      nameShortGen: data.nameShortGen ?? true
    });
  }
}

/**
 * Get nth day-of-week schedule with I18n data
 */
export async function getNthDowScheduleWithI18n(
  db: Database,
  nthDowScheduleId: string,
  locale: string = 'en'
) {
  const nthDowRuleData = await db
    .select()
    .from(scheduleRule)
    .where(
      and(eq(scheduleRule.id, nthDowScheduleId), eq(scheduleRule.ruleType, 'nthDow'))
    )
    .limit(1);

  if (nthDowRuleData.length === 0) {
    return null;
  }

  const i18nData = await getNthDowScheduleI18n(db, nthDowScheduleId, locale);

  // Provide default names based on nth pattern if no I18n data exists
  const nthDowSchedule = nthDowRuleData[0];
  let defaultName = 'Monthly Schedule';
  let defaultNameShort = 'Monthly';

  if (nthDowSchedule.nth === -1) {
    defaultName = locale === 'en' ? 'Last Day Schedule' : '最後一天時間';
    defaultNameShort = locale === 'en' ? 'Last' : '最後';
  } else if (nthDowSchedule.nth >= 1 && nthDowSchedule.nth <= 4) {
    const nthNames = ['First', 'Second', 'Third', 'Fourth'];
    const nthNamesShort = ['1st', '2nd', '3rd', '4th'];
    defaultName =
      locale === 'en'
        ? `${nthNames[nthDowSchedule.nth - 1]} Day Schedule`
        : `第${nthDowSchedule.nth}天時間`;
    defaultNameShort =
      locale === 'en'
        ? nthNamesShort[nthDowSchedule.nth - 1]
        : `第${nthDowSchedule.nth}`;
  }

  return {
    ...nthDowSchedule,
    name: i18nData?.name || defaultName,
    nameShort: i18nData?.nameShort || defaultNameShort
  };
}

/**
 * Get schedule with I18n data
 */

/* ============================================================================
 * EXCEPTION DATE SCHEDULE I18N FUNCTIONS
 * ============================================================================
 * Functions for managing exception date schedule internationalization
 * Useful for named special events: "Christmas Closure", "New Year's Event", etc.
 */

/**
 * Get schedule exception I18n data for a specific locale
 */
export async function getScheduleExceptionI18n(
  db: Database,
  scheduleExceptionId: string,
  locale: string
) {
  const result = await db
    .select()
    .from(scheduleExceptionI18n)
    .where(
      and(
        eq(scheduleExceptionI18n.scheduleExceptionId, scheduleExceptionId),
        eq(scheduleExceptionI18n.locale, locale)
      )
    )
    .limit(1);

  return result[0] || null;
}

/**
 * Get all I18n data for a schedule exception
 */
export async function getScheduleExceptionI18nAll(
  db: Database,
  scheduleExceptionId: string
) {
  return await db
    .select()
    .from(scheduleExceptionI18n)
    .where(eq(scheduleExceptionI18n.scheduleExceptionId, scheduleExceptionId));
}

/**
 * Set schedule exception I18n data
 */
export async function setScheduleExceptionI18n(
  db: Database,
  scheduleExceptionId: string,
  locale: string,
  data: {
    name?: string;
    nameShort?: string;
    nameGen?: boolean;
    nameShortGen?: boolean;
  }
) {
  // Use upsert pattern - try to update first, then insert if not exists
  const existing = await getScheduleExceptionI18n(db, scheduleExceptionId, locale);

  if (existing) {
    return await db
      .update(scheduleExceptionI18n)
      .set(data)
      .where(
        and(
          eq(scheduleExceptionI18n.scheduleExceptionId, scheduleExceptionId),
          eq(scheduleExceptionI18n.locale, locale)
        )
      );
  } else {
    return await db.insert(scheduleExceptionI18n).values({
      scheduleExceptionId,
      locale,
      name: data.name,
      nameShort: data.nameShort,
      nameGen: data.nameGen ?? true,
      nameShortGen: data.nameShortGen ?? true
    });
  }
}

/**
 * Get schedule exception with I18n data
 */
export async function getScheduleExceptionWithI18n(
  db: Database,
  scheduleExceptionId: string,
  locale: string = 'en'
) {
  const scheduleExceptionData = await db
    .select()
    .from(scheduleException)
    .where(eq(scheduleException.id, scheduleExceptionId))
    .limit(1);

  if (scheduleExceptionData.length === 0) {
    return null;
  }

  const i18nData = await getScheduleExceptionI18n(db, scheduleExceptionId, locale);

  // Provide default names based on exception type if no I18n data exists
  const exception = scheduleExceptionData[0];
  let defaultName = 'Special Schedule';
  let defaultNameShort = 'Special';

  switch (exception.exceptionType) {
    case 'holiday':
      defaultName = locale === 'en' ? 'Holiday Schedule' : '假期時間';
      defaultNameShort = locale === 'en' ? 'Holiday' : '假期';
      break;
    case 'event':
      defaultName = locale === 'en' ? 'Event Schedule' : '活動時間';
      defaultNameShort = locale === 'en' ? 'Event' : '活動';
      break;
    case 'closure':
      defaultName = locale === 'en' ? 'Closure Schedule' : '關閉時間';
      defaultNameShort = locale === 'en' ? 'Closure' : '關閉';
      break;
    case 'special_hours':
      defaultName = locale === 'en' ? 'Special Hours' : '特別時間';
      defaultNameShort = locale === 'en' ? 'Special' : '特別';
      break;
  }

  return {
    ...exception,
    name: i18nData?.name || defaultName,
    nameShort: i18nData?.nameShort || defaultNameShort
  };
}
export async function getScheduleWithI18n(
  db: Database,
  scheduleId: string,
  locale: string = 'en'
) {
  const scheduleData = await db
    .select()
    .from(schedule)
    .where(eq(schedule.id, scheduleId))
    .limit(1);

  if (scheduleData.length === 0) {
    return null;
  }

  const i18nData = await getScheduleI18n(db, scheduleId, locale);

  // Provide default name if no I18n data exists
  const defaultName = m.schedule__opening_hours();

  return {
    ...scheduleData[0],
    name: i18nData?.name || defaultName,
    description: i18nData?.description
  };
}

/* ============================================================================
 * OSM OPENING HOURS FUNCTIONS
 * ============================================================================
 * Functions for working with OSM opening_hours format
 */

/**
 * Parse basic OSM opening_hours string and create schedule
 * Supports simple patterns like "Mo-Fr 09:00-17:00; Sa 10:00-14:00"
 */
export async function parseOsmOpeningHours(
  db: Database,
  ownerType: ScheduleOwnerType,
  ownerId: string,
  osmOpeningHours: string,
  options?: {
    timezone?: string;
    localeNames?: Record<string, string>;
    localeDescriptions?: Record<string, string>;
  }
) {
  // This is a basic parser - for production, you'd want a more robust OSM opening_hours parser
  const rules = osmOpeningHours.split(';').map((rule) => rule.trim());
  const weeklyHours: any[] = [];

  for (const rule of rules) {
    // Simple regex for "Mo-Fr 09:00-17:00" pattern
    const match = rule.match(
      /^(\w+(?:-\w+)?)\s+((?:\d{2}:\d{2}-\d{2}:\d{2})(?:,\s*\d{2}:\d{2}-\d{2}:\d{2})*)$/
    );

    if (match) {
      const dayRange = match[1];
      const timeRanges = match[2].split(',').map((range) => range.trim());

      // Parse day range
      const days = parseDayRange(dayRange);
      const timeSegments = timeRanges.map((range) => {
        const [start, end] = range.split('-');
        return { startTime: start, endTime: end };
      });

      for (const dayOfWeek of days) {
        weeklyHours.push({
          dayOfWeek,
          timeSegments,
          isClosed: false,
          is24Hours: false
        });
      }
    }
  }

  if (weeklyHours.length === 0) {
    throw new Error('Could not parse OSM opening_hours format');
  }

  return await createWeeklySchedule(db, ownerType, ownerId, weeklyHours, {
    osmOpeningHours,
    timezone: options?.timezone,
    localeNames: options?.localeNames,
    localeDescriptions: options?.localeDescriptions
  });
}

/**
 * Helper function to parse day range like "Mo-Fr" into array of day numbers
 */
function parseDayRange(dayRange: string): number[] {
  const dayMap: Record<string, number> = {
    Mo: 1,
    Tu: 2,
    We: 3,
    Th: 4,
    Fr: 5,
    Sa: 6,
    Su: 0
  };

  if (dayRange.includes('-')) {
    const [start, end] = dayRange.split('-');
    const startDay = dayMap[start];
    const endDay = dayMap[end];

    if (startDay === undefined || endDay === undefined) {
      return [];
    }

    const days = [];
    for (let i = startDay; i <= endDay; i++) {
      days.push(i);
    }
    return days;
  } else {
    const day = dayMap[dayRange];
    return day !== undefined ? [day] : [];
  }
}
