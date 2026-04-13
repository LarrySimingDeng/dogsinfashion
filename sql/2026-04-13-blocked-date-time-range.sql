-- Allow blocked_dates to optionally specify a time range
-- If start_time and end_time are NULL, the entire day is blocked (existing behavior)
-- If both are set, only that time window is blocked

alter table blocked_dates
  add column start_time time,
  add column end_time time;

-- Ensure both are set or both are null
alter table blocked_dates
  add constraint blocked_dates_time_range_check
  check (
    (start_time is null and end_time is null) or
    (start_time is not null and end_time is not null and start_time < end_time)
  );
