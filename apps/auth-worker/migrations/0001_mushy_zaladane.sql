CREATE TABLE `auth_methods` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`type` text NOT NULL,
	`provider_id` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`public_visible` integer DEFAULT false NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`configuration_ref` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_methods_workspace_status_idx` ON `auth_methods` (`workspace_id`,`status`,`public_visible`);--> statement-breakpoint
CREATE INDEX `auth_methods_order_idx` ON `auth_methods` (`workspace_id`,`display_order`);--> statement-breakpoint
CREATE TABLE `auth_ui_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`contribution_id` text NOT NULL,
	`slot` text NOT NULL,
	`renderer_json` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_ui_contributions_workspace_slot_idx` ON `auth_ui_contributions` (`workspace_id`,`slot`,`status`);--> statement-breakpoint
CREATE INDEX `auth_ui_contributions_order_idx` ON `auth_ui_contributions` (`workspace_id`,`display_order`);--> statement-breakpoint
CREATE TABLE `passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`public_key` text NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text,
	`created_at` integer,
	`aaguid` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passkey_user_id_idx` ON `passkey` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `passkey_credential_id_idx` ON `passkey` (`credential_id`);