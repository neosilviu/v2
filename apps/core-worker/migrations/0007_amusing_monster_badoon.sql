CREATE TABLE `service_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`credential_ref` text,
	`capabilities_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `service_identities_workspace_idx` ON `service_identities` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `service_identities_kind_idx` ON `service_identities` (`workspace_id`,`kind`);--> statement-breakpoint
CREATE TABLE `workspace_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`role_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`token_hash` text,
	`expires_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `workspace_roles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `workspace_invitations_workspace_idx` ON `workspace_invitations` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `workspace_invitations_email_idx` ON `workspace_invitations` (`workspace_id`,`email`);--> statement-breakpoint
CREATE TABLE `workspace_member_roles` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`, `role_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `workspace_roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_member_roles_user_idx` ON `workspace_member_roles` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_members_email_idx` ON `workspace_members` (`workspace_id`,`email`);--> statement-breakpoint
CREATE INDEX `workspace_members_status_idx` ON `workspace_members` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `workspace_role_permissions` (
	`workspace_id` text NOT NULL,
	`role_id` text NOT NULL,
	`permission` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `role_id`, `permission`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `workspace_roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_role_permissions_permission_idx` ON `workspace_role_permissions` (`workspace_id`,`permission`);--> statement-breakpoint
CREATE TABLE `workspace_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`system_key` text,
	`description` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_roles_system_idx` ON `workspace_roles` (`workspace_id`,`system_key`);--> statement-breakpoint
CREATE INDEX `workspace_roles_workspace_idx` ON `workspace_roles` (`workspace_id`);