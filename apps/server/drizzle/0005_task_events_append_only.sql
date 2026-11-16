-- The history of a task accepts inserts only, like the audit trail
-- (SECURITY C-23): what an agent or the user did to a task cannot be
-- rewritten afterwards.
CREATE TRIGGER `task_events_no_update`
BEFORE UPDATE ON `task_events`
BEGIN
  SELECT RAISE(ABORT, 'task_events is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `task_events_no_delete`
BEFORE DELETE ON `task_events`
BEGIN
  SELECT RAISE(ABORT, 'task_events is append-only');
END;
