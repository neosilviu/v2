CREATE TABLE `plugin_ui_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`contribution_id` text NOT NULL,
	`contribution_type` text NOT NULL,
	`access_mode` text DEFAULT 'private' NOT NULL,
	`zone_id` text,
	`template_id` text NOT NULL,
	`schema_json` text NOT NULL,
	`required_permission` text,
	`version` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_ui_contributions_identity_idx` ON `plugin_ui_contributions` (`plugin_id`,`contribution_id`,`version`);--> statement-breakpoint
CREATE INDEX `plugin_ui_contributions_plugin_idx` ON `plugin_ui_contributions` (`plugin_id`);--> statement-breakpoint
CREATE INDEX `plugin_ui_contributions_template_idx` ON `plugin_ui_contributions` (`template_id`);--> statement-breakpoint
CREATE TABLE `workspace_theme_tokens` (
	`workspace_id` text NOT NULL,
	`token_key` text NOT NULL,
	`token_value` text NOT NULL,
	`scope` text DEFAULT 'both' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `token_key`, `scope`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workspace_ui_activations` (
	`workspace_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`contribution_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`zone_override` text,
	`order_index` integer DEFAULT 0 NOT NULL,
	`configuration_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `plugin_id`, `contribution_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_ui_activations_workspace_idx` ON `workspace_ui_activations` (`workspace_id`,`enabled`);--> statement-breakpoint
ALTER TABLE `workspace_publications` ADD `publication_type` text DEFAULT 'route' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_publications` ADD `template_id` text DEFAULT 'public.contentPage' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_publications` ADD `schema_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `public_access_policies` ADD `authentication_mode` text DEFAULT 'anonymous' NOT NULL;--> statement-breakpoint
ALTER TABLE `public_access_policies` ADD `allowed_operations_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `public_access_policies` ADD `rate_limit_policy` text;--> statement-breakpoint
ALTER TABLE `public_access_policies` ADD `cache_policy` text;--> statement-breakpoint
ALTER TABLE `public_access_policies` ADD `enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `public_access_policies_enabled_idx` ON `public_access_policies` (`workspace_id`,`enabled`);
