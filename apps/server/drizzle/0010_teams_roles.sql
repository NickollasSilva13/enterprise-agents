CREATE TABLE `area_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `area_roles_name_unique` ON `area_roles` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `role_members` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `area_roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `role_members_role_idx` ON `role_members` (`role_id`);--> statement-breakpoint
ALTER TABLE `projects` ADD `template_id` text;--> statement-breakpoint
ALTER TABLE `workflow_stages` ADD `role_id` text;