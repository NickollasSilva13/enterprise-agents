-- Harness providers are reached by running a program instead of over HTTP:
-- `base_url` stops being mandatory and `command` holds the program.
--
-- Written by hand because the generated version copied `command` from the old
-- table, which does not have the column yet.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`base_url` text,
	`command` text,
	`is_external` integer NOT NULL,
	`secret_ref` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_providers`("id", "name", "kind", "base_url", "command", "is_external", "secret_ref", "created_at", "updated_at")
SELECT "id", "name", "kind", "base_url", NULL, "is_external", "secret_ref", "created_at", "updated_at" FROM `providers`;--> statement-breakpoint
DROP TABLE `providers`;--> statement-breakpoint
ALTER TABLE `__new_providers` RENAME TO `providers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `providers_name_unique` ON `providers` (`name`);
