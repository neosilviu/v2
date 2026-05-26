CREATE TABLE `workspace_provisioning_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`consumed_at` text,
	`metadata_json` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_provisioning_workspace_idx` ON `workspace_provisioning_requests` (`workspace_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_provisioning_token_idx` ON `workspace_provisioning_requests` (`token_hash`);