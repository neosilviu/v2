CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`actor_id` text,
	`action` text NOT NULL,
	`payload_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_events_workspace_idx` ON `audit_events` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_action_idx` ON `audit_events` (`action`);--> statement-breakpoint
CREATE TABLE `installed_plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`manifest_json` text NOT NULL,
	`package_object_key` text,
	`package_sha256` text,
	`package_size_bytes` integer,
	`package_format` text,
	`worker_isolation` text DEFAULT 'none' NOT NULL,
	`ui_mode` text DEFAULT 'declarative' NOT NULL,
	`installed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plugin_capabilities` (
	`plugin_id` text NOT NULL,
	`capability_id` text NOT NULL,
	`description` text,
	`risk` text DEFAULT 'safe' NOT NULL,
	PRIMARY KEY(`plugin_id`, `capability_id`),
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plugin_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`version` text NOT NULL,
	`object_key` text NOT NULL,
	`sha256` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`format` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_packages_identity_idx` ON `plugin_packages` (`plugin_id`,`version`,`sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_packages_object_key_idx` ON `plugin_packages` (`object_key`);--> statement-breakpoint
CREATE TABLE `tool_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`tool_id` text NOT NULL,
	`risk` text NOT NULL,
	`input_json` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_by` text,
	`decided_by` text,
	`requested_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`decided_at` text,
	`consumed_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tool_approvals_workspace_status_idx` ON `tool_approvals` (`workspace_id`,`status`,`requested_at`);--> statement-breakpoint
CREATE INDEX `tool_approvals_tool_idx` ON `tool_approvals` (`tool_id`,`requested_at`);--> statement-breakpoint
CREATE TABLE `workspace_capability_grants` (
	`workspace_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`capability_id` text NOT NULL,
	`granted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `plugin_id`, `capability_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workspace_layouts` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`layout_json` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workspace_plugins` (
	`workspace_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`activated_at` text,
	`deactivated_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `plugin_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_plugins_workspace_idx` ON `workspace_plugins` (`workspace_id`,`active`);--> statement-breakpoint
CREATE TABLE `workspace_settings` (
	`workspace_id` text NOT NULL,
	`scope` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `scope`, `key`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
