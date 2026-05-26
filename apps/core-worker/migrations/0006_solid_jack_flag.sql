ALTER TABLE `workspace_publications` ADD `route_pattern` text DEFAULT '/' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_publications` ADD `route_priority` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_publications` ADD `route_kind` text DEFAULT 'exact' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_publications` ADD `parameter_names_json` text;--> statement-breakpoint
CREATE INDEX `workspace_publications_route_idx` ON `workspace_publications` (`workspace_id`,`route_kind`,`status`);