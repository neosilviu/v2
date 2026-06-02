CREATE TABLE `workspace_cloudflare_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`label` text NOT NULL,
	`account_id` text,
	`configuration_ref` text,
	`token_hint` text,
	`allowed_zones_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'untested' NOT NULL,
	`default_for_provisioning` integer DEFAULT false NOT NULL,
	`last_checked_at` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_cloudflare_accounts_workspace_idx` ON `workspace_cloudflare_accounts` (`workspace_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_cloudflare_accounts_label_idx` ON `workspace_cloudflare_accounts` (`workspace_id`,`label`);