CREATE TABLE `area_links` (
	`id` text PRIMARY KEY NOT NULL,
	`from_project_id` text NOT NULL,
	`to_project_id` text NOT NULL,
	`requires_approval` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`from_project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `area_links_pair_unique` ON `area_links` (`from_project_id`,`to_project_id`);--> statement-breakpoint
ALTER TABLE `task_events` ADD `related_task_id` text REFERENCES tasks(id);--> statement-breakpoint
ALTER TABLE `tasks` ADD `parent_task_id` text REFERENCES tasks(id);--> statement-breakpoint
CREATE INDEX `tasks_parent_idx` ON `tasks` (`parent_task_id`);