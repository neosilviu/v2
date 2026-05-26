CREATE TABLE `plugin_runtime_deployments` (
	`workspace_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`release_id` text NOT NULL,
	`runtime_key` text NOT NULL,
	`runtime_kind` text DEFAULT 'dispatch-namespace' NOT NULL,
	`runtime_status` text DEFAULT 'pending' NOT NULL,
	`deployed_version` text,
	`deployment_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`activated_at` text,
	`disabled_at` text,
	`last_error` text,
	PRIMARY KEY(`workspace_id`, `plugin_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plugin_runtime_workspace_status_idx` ON `plugin_runtime_deployments` (`workspace_id`,`runtime_status`);--> statement-breakpoint
CREATE INDEX `plugin_runtime_key_idx` ON `plugin_runtime_deployments` (`runtime_key`);