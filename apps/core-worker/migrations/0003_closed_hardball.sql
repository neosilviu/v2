CREATE TABLE `public_access_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`access` text DEFAULT 'anonymous' NOT NULL,
	`rules_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `public_access_policies_workspace_idx` ON `public_access_policies` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `workspace_publications` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`contribution_kind` text NOT NULL,
	`contribution_id` text NOT NULL,
	`public_path` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`policy_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`published_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`policy_id`) REFERENCES `public_access_policies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_publications_path_idx` ON `workspace_publications` (`workspace_id`,`public_path`);--> statement-breakpoint
CREATE INDEX `workspace_publications_plugin_idx` ON `workspace_publications` (`workspace_id`,`plugin_id`);--> statement-breakpoint
CREATE INDEX `workspace_publications_status_idx` ON `workspace_publications` (`workspace_id`,`status`);