# Schedule System Usage Examples

This document provides comprehensive examples of how to use the flexible schedule system for various business scenarios.

## Schema Overview

The schedule system supports multiple types of scheduling rules with the following priority order:

1. **Exception dates** (highest priority) - Special one-off dates
2. **Public holidays** - Holiday-specific schedules
3. **Nth day-of-week** - Monthly recurring patterns (1st Monday, 3rd Friday, etc.)
4. **Weekly schedules** (lowest priority) - Regular weekly hours

## Common Use Cases

### 1. Restaurant with Complex Weekly Hours

```typescript
import { createWeeklySchedule } from './schedule';

// Restaurant open Monday-Friday with lunch and dinner service
// Saturday continuous hours, Sunday closed
await createWeeklySchedule(
  db,
  'feature', // ownerType
  'restaurant-123', // ownerId
  'Restaurant Hours', // name
  [
    // Monday-Friday: Lunch and Dinner
    {
      dayOfWeek: 1,
      timeSegments: [
        { fromTime: '11:00', untilTime: '15:00' },
        { fromTime: '18:00', untilTime: '22:00' }
      ]
    },
    {
      dayOfWeek: 2,
      timeSegments: [
        { fromTime: '11:00', untilTime: '15:00' },
        { fromTime: '18:00', untilTime: '22:00' }
      ]
    },
    {
      dayOfWeek: 3,
      timeSegments: [
        { fromTime: '11:00', untilTime: '15:00' },
        { fromTime: '18:00', untilTime: '22:00' }
      ]
    },
    {
      dayOfWeek: 4,
      timeSegments: [
        { fromTime: '11:00', untilTime: '15:00' },
        { fromTime: '18:00', untilTime: '22:00' }
      ]
    },
    {
      dayOfWeek: 5,
      timeSegments: [
        { fromTime: '11:00', untilTime: '15:00' },
        { fromTime: '18:00', untilTime: '22:00' }
      ]
    },
    // Saturday: Continuous hours
    { dayOfWeek: 6, timeSegments: [{ fromTime: '10:00', untilTime: '23:00' }] },
    // Sunday: Closed
    { dayOfWeek: 0, isClosed: true }
  ],
  'Regular restaurant opening hours'
);
```

### 2. Monthly Market (1st and 3rd Saturday)

```typescript
import { createNthDowSchedule } from './schedule';

// Market held on 1st and 3rd Saturday of each month
await createNthDowSchedule(
  db,
  'feature',
  'market-456',
  'Monthly Market Schedule',
  [
    { nth: 1, dayOfWeek: 6, timeSegments: [{ fromTime: '08:00', untilTime: '14:00' }] },
    { nth: 3, dayOfWeek: 6, timeSegments: [{ fromTime: '08:00', untilTime: '14:00' }] }
  ],
  'Farmers market on 1st and 3rd Saturday'
);
```

### 3. Business with Holiday Hours

```typescript
import { createWeeklySchedule, addPublicHoliday } from './schedule';

// First, add some public holidays
await addPublicHoliday(db, '2024-01-01', "New Year's Day", '元旦', '元旦', 'HK');
await addPublicHoliday(db, '2024-12-25', 'Christmas Day', '聖誕節', '圣诞节', 'HK');

// Create main weekly schedule
const mallSchedule = await createWeeklySchedule(
  db,
  'organisation',
  'mall-789',
  'Mall Hours',
  [
    { dayOfWeek: 1, timeSegments: [{ fromTime: '10:00', untilTime: '22:00' }] },
    { dayOfWeek: 2, timeSegments: [{ fromTime: '10:00', untilTime: '22:00' }] },
    { dayOfWeek: 3, timeSegments: [{ fromTime: '10:00', untilTime: '22:00' }] },
    { dayOfWeek: 4, timeSegments: [{ fromTime: '10:00', untilTime: '22:00' }] },
    { dayOfWeek: 5, timeSegments: [{ fromTime: '10:00', untilTime: '22:00' }] },
    { dayOfWeek: 6, timeSegments: [{ fromTime: '10:00', untilTime: '23:00' }] },
    { dayOfWeek: 0, timeSegments: [{ fromTime: '10:00', untilTime: '21:00' }] }
  ]
);

// Add public holiday schedules (these override weekly schedules)
await db.insert(publicHolidaySchedule).values({
  scheduleId: mallSchedule.id,
  isDefault: true, // Applies to all public holidays
  timeSegments: [{ fromTime: '10:00', untilTime: '18:00' }]
});

// Special handling for Christmas (different from default holiday hours)
await db.insert(publicHolidaySchedule).values({
  scheduleId: mallSchedule.id,
  isDefault: false,
  isClosed: true // Closed on Christmas
});
```

### 4. Special Events and Exceptions

```typescript
import { addExceptionDate } from './schedule';

// Add special event that overrides all other schedules
await addExceptionDate(db, scheduleId, '2024-01-15', 'event', {
  description: 'New Year Sale - Extended Hours',
  timeSegments: [{ fromTime: '09:00', untilTime: '24:00' }]
});

// Add closure for maintenance
await addExceptionDate(db, scheduleId, '2024-01-20', 'closure', {
  description: 'Store Maintenance',
  isClosed: true
});
```

### 5. 24-Hour Business

```typescript
await createWeeklySchedule(
  db,
  'feature',
  'hotel-reception',
  '24-Hour Reception',
  [
    { dayOfWeek: 0, is24Hours: true },
    { dayOfWeek: 1, is24Hours: true },
    { dayOfWeek: 2, is24Hours: true },
    { dayOfWeek: 3, is24Hours: true },
    { dayOfWeek: 4, is24Hours: true },
    { dayOfWeek: 5, is24Hours: true },
    { dayOfWeek: 6, is24Hours: true }
  ],
  'Hotel reception open 24/7'
);
```

## Querying Schedules

### Check if open at specific time

```typescript
import { getScheduleForDateTime } from './schedule';

const status = await getScheduleForDateTime(
  db,
  'feature',
  'restaurant-123',
  '2024-01-15', // Date (YYYY-MM-DD)
  '12:30', // Time (HH:MM)
  'HK' // Region (optional, for public holidays)
);

console.log(status);
// {
//   isOpen: true,
//   timeSegments: [{ fromTime: '11:00', untilTime: '15:00' }],
//   is24Hours: false,
//   isClosed: false,
//   ruleType: 'weekly',
//   ruleId: 'abc123',
//   description: undefined
// }
```

### Get full day schedule

```typescript
import { getScheduleForDate } from './schedule';

const daySchedule = await getScheduleForDate(
  db,
  'feature',
  'restaurant-123',
  '2024-01-15',
  'HK'
);

// Returns array of 24 hourly status objects
daySchedule.forEach((hour) => {
  console.log(`${hour.time}: ${hour.isOpen ? 'OPEN' : 'CLOSED'} (${hour.ruleType})`);
});
```

### Get schedule summary for date range

```typescript
import { getScheduleSummary } from './schedule';

const summary = await getScheduleSummary(
  db,
  'feature',
  'restaurant-123',
  '2024-01-01',
  '2024-01-31',
  'HK'
);

summary.forEach((day) => {
  console.log(
    `${day.date}: ${day.openHours} hours open, ${day.closedHours} hours closed`
  );
  if (day.isClosedAllDay) console.log('  CLOSED ALL DAY');
  if (day.is24Hours) console.log('  OPEN 24 HOURS');
  if (day.descriptions.length > 0)
    console.log(`  Notes: ${day.descriptions.join(', ')}`);
});
```

### Find next opening time

```typescript
import { getNextOpeningTime } from './schedule';

const nextOpen = await getNextOpeningTime(
  db,
  'feature',
  'restaurant-123',
  '2024-01-15',
  '16:00', // Current time
  7, // Max days to search
  'HK'
);

if (nextOpen) {
  console.log(`Next opening: ${nextOpen.date} at ${nextOpen.time}`);
  console.log(`Reason: ${nextOpen.description || nextOpen.ruleType}`);
}
```

## Priority Rules

The system follows a strict priority order when multiple rules apply to the same date/time:

1. **Exception dates** (highest priority) - Always win
2. **Public holidays** - Override weekly/nth-DOW schedules
3. **Nth day-of-week** - Override weekly schedules
4. **Weekly schedules** (lowest priority) - Default fallback

### Example Priority Conflict Resolution

```typescript
// Weekly: Monday closed
await db.insert(weeklySchedule).values({
  scheduleId: schedule.id,
  dayOfWeek: 1, // Monday
  isClosed: true
});

// Nth DOW: 1st Monday open (overrides weekly)
await db.insert(nthDowSchedule).values({
  scheduleId: schedule.id,
  nth: 1,
  dayOfWeek: 1,
  timeSegments: [{ fromTime: '10:00', untilTime: '14:00' }]
});

// Exception: Specific Monday closed (overrides everything)
await addExceptionDate(db, schedule.id, '2024-01-01', 'closure', {
  description: 'Private Event',
  isClosed: true
});

// Jan 1, 2024 is a Monday and the 1st Monday of the month
// Result: CLOSED (exception wins over nth-DOW and weekly)
```

## Advanced Features

### Multiple Time Segments per Day

Support for businesses with split hours (e.g., lunch break):

```typescript
timeSegments: [
  { fromTime: '09:00', untilTime: '12:00' },
  { fromTime: '14:00', untilTime: '18:00' }
];
```

### Valid Date Ranges

Rules can have optional start/end dates:

```typescript
await db.insert(weeklySchedule).values({
  scheduleId: schedule.id,
  dayOfWeek: 1,
  timeSegments: [{ fromTime: '09:00', untilTime: '17:00' }],
  validFrom: '2024-01-01', // Rule starts Jan 1
  validUntil: '2024-03-31' // Rule ends March 31
});
```

### Priority Within Rule Types

Higher priority rules override lower priority ones within the same type:

```typescript
// Lower priority weekly schedule
await db.insert(weeklySchedule).values({
  scheduleId: schedule.id,
  dayOfWeek: 1,
  timeSegments: [{ fromTime: '09:00', untilTime: '17:00' }],
  priority: 0
});

// Higher priority weekly schedule (wins)
await db.insert(weeklySchedule).values({
  scheduleId: schedule.id,
  dayOfWeek: 1,
  timeSegments: [{ fromTime: '10:00', untilTime: '16:00' }],
  priority: 10
});
```

### Timezone Support

All schedules support timezone specification:

```typescript
await db.insert(schedule).values({
  ownerType: 'feature',
  ownerId: 'venue-123',
  name: 'Tokyo Office',
  timezone: 'Asia/Tokyo' // Japan timezone
});
```

## Performance Considerations

The system includes optimized indexes for common queries:

- `schedule_owner_idx`: Fast lookup by owner type/ID
- `exception_date_idx`: Fast exception date queries (highest priority)
- `weekly_schedule_day_idx`: Fast weekly schedule lookups
- `nth_dow_schedule_idx`: Fast nth-DOW queries
- `public_holiday_date_idx`: Fast holiday lookups

For best performance:

1. Use specific date queries when possible
2. Limit date ranges in summary queries
3. Cache frequently accessed schedules
4. Use region-specific holiday queries

## Error Handling

All functions include proper error handling for:

- Invalid date/time formats
- Missing schedules
- Database connection issues
- Invalid owner references

Always wrap schedule queries in try-catch blocks for production use.
