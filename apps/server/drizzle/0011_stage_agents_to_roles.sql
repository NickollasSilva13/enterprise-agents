-- Phase 39 (D3): a stage points to a role, not to an agent. Every agent that
-- worked a stage becomes a role of its area named after it, with the agent as
-- its only member, and its stages point to that role. The role id is the
-- agent id with an "R" in front, so each agent gets one role however many
-- stages it worked. A stage whose agent was deleted or is in another area is
-- left without one (the task stopped there before too). Two names that are
-- the same in their first 40 letters get a number on the second.
INSERT INTO `area_roles` (`id`, `project_id`, `name`)
SELECT `id`, `project_id`,
  CASE WHEN `n` = 1 THEN `name` ELSE substr(`name`, 1, 36) || ' ' || `n` END
FROM (
  SELECT `id`, `project_id`, `name`,
    row_number() OVER (PARTITION BY `project_id`, `name` ORDER BY `id`) AS `n`
  FROM (
    SELECT DISTINCT 'R' || `a`.`id` AS `id`, `a`.`project_id`, substr(`a`.`name`, 1, 40) AS `name`
    FROM `workflow_stages` `s`
    JOIN `agents` `a` ON `a`.`id` = `s`.`agent_id` AND `a`.`project_id` = `s`.`project_id`
    WHERE `a`.`deleted_at` IS NULL
  )
);
--> statement-breakpoint
INSERT INTO `role_members` (`agent_id`, `role_id`)
SELECT `r`.`agent_id`, `r`.`role_id` FROM (
  SELECT DISTINCT substr(`id`, 2) AS `agent_id`, `id` AS `role_id` FROM `area_roles`
) `r`;
--> statement-breakpoint
UPDATE `workflow_stages`
SET `role_id` = CASE
    WHEN EXISTS (SELECT 1 FROM `area_roles` WHERE `id` = 'R' || `workflow_stages`.`agent_id`)
    THEN 'R' || `agent_id`
  END,
  `agent_id` = NULL
WHERE `agent_id` IS NOT NULL;
