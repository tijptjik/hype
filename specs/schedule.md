We want to create the schema in [@schedule.ts](zed:///agent/file?path=%2Fhome%2Fio%2Fcode%2Fhype%2Fsrc%2Flib%2Fdb%2Fschema%2Fschedule.ts) to allow for flexible schedules to be recorded -- e.g. opening hours of a restaurant, monthly markets, annual holidays, and start and end times of events.

The schema that you come up with will span multiple tables, so that schedules can be easily managed and queried. There will be a table for weekly_hours, nth_dow_hours, public_holidays, and event_times - when determining the schedule, we should follow the following priority `exception-date` → `public-holiday` → `nth-DOW` → `weekly`.

The schema should meet the following requirements:

- Ordinary weekly hours (Mon-Sun open/close)
- Unlimited segments per rule (so you can store “09:00-11:00, 14:00-17:00, 19:00-22:00” in one rule).
- “Every 1st / 2nd / 3rd / 4th / last Monday (or any DOW) of the month”
- A default public-holiday row (applies to any calendar date flagged as a PH).
- Special one-off dates (holidays, events) that override the regular rules
- Permanent flags such as “CLOSED” or “24h” without inventing magic times.

We also want to have helper functions to easily query the schedule for a given date and time - please implement these functions in [@schedule.ts](zed:///agent/file?path=%2Fhome%2Fio%2Fcode%2Fhype%2Fsrc%2Flib%2Fdb%2Fservices%2Fschedule.ts)

---

We are trying to achieve [@schedule.md](zed:///agent/file?path=%2Fhome%2Fio%2Fcode%2Fhype%2Fspecs%2Fschedule.md) - and one of the goals is support for OSM's opening hours mini-language. We've distilled the differenced in [@Claude Code - Schedule Schema vs OSM Schema.md](zed:///agent/file?path=%2Fhome%2Fio%2Fcode%2Fhype%2Fchats%2FClaude+Code+-+Schedule+Schema+vs+OSM+Schema.md).

Are you able to modify [@schedule.ts](zed:///agent/file?path=%2Fhome%2Fio%2Fcode%2Fhype%2Fsrc%2Flib%2Fdb%2Fservices%2Fschedule.ts) and [@schedule.ts](zed:///agent/file?path=%2Fhome%2Fio%2Fcode%2Fhype%2Fsrc%2Flib%2Fdb%2Fschema%2Fschedule.ts) to add support for:

- Open-ended times (no closing times)
- Seasonal patterns (e.g. Nov-Feb 09:00-16:00; Mar-Oct 09:00-18:00) - we would just have TWO schedules associated with (e.g.) a feature, but then we would need to know when a particular schedule is active or not with starting and and dates.
- We want to be able to support "Quoted comments on rules" - so we need to add a scheduleI18n table (see [@layer.ts](zed:///agent/file?path=%2Fhome%2Fio%2Fcode%2Fhype%2Fsrc%2Flib%2Fdb%2Fschema%2Flayer.ts) for an example how I18n tables are created). We should move 'name' and 'description' to the i18n table, and make both optional. In the response the default value for 'name' is "Opening Hours" in English and the equivalent value in the Chineses.

also extend the schedule schema with a field to retain the osm_opening_hours string -- this can be later be parsed to calculate the opening hours.

---

In [@schedule.ts](zed:///agent/file?path=%2Fhome%2Fio%2Fcode%2Fhype%2Fsrc%2Flib%2Fdb%2Fschema%2Fschedule.ts) -- don't you think we can merge `publicHolidaySchedule` into `weeklySchedule` by making the dayOfWeek optional, and adding a `publicHoliday` ruleType? Please rename nth_dow to nthDow. This would act as the default publicHoliday schedule. For an override for a particular holiday, the user would rely on the `exceptionDateSchedule`.

Rename 'weeklySchedule' to 'scheduleRule' and `weeklyScheduleI18n` to `scheduleRuleI18n` and `exceptionDateSchedule` to `exceptionDateSchedule` to `scheduleException` and `exceptionDateScheduleI18n` to `scheduleExceptionI18n`

We want to remove `publicHoliday` and instead rely on the https://www.npmjs.com/package/date-holidays library to determine whether a date is a public holiday or not --- this will be provided at the query-level, and doesn't need to be recorded in the database.
