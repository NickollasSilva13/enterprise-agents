CREATE TABLE `office_areas` (
	`id` text PRIMARY KEY NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`name` text,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`floor` text NOT NULL,
	`project_id` text,
	`doors` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `office_items` (
	`id` text PRIMARY KEY NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`facing` text NOT NULL,
	`agent_id` text,
	`label` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `office_items_agent_idx` ON `office_items` (`agent_id`);--> statement-breakpoint
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
);
--> statement-breakpoint
INSERT INTO `__new_providers`("id", "name", "kind", "base_url", "command", "is_external", "secret_ref", "created_at", "updated_at") SELECT "id", "name", "kind", "base_url", "command", "is_external", "secret_ref", "created_at", "updated_at" FROM `providers`;--> statement-breakpoint
DROP TABLE `providers`;--> statement-breakpoint
ALTER TABLE `__new_providers` RENAME TO `providers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `providers_name_unique` ON `providers` (`name`);--> statement-breakpoint
ALTER TABLE `agents` ADD `appearance` text;