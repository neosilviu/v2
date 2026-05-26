CREATE TABLE `auth_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`registration_mode` text DEFAULT 'disabled' NOT NULL,
	`require_email_verification` integer DEFAULT false NOT NULL,
	`allow_passkey_registration` integer DEFAULT false NOT NULL,
	`allow_passkey_signin` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_policies_workspace_idx` ON `auth_policies` (`workspace_id`);