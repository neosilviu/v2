CREATE TABLE `approval_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`plugin_id` text,
	`risk` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_by` text,
	`decided_by` text,
	`requested_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`decided_at` text,
	`expires_at` text,
	`consumed_at` text,
	`reason` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `approval_requests_workspace_status_idx` ON `approval_requests` (`workspace_id`,`status`,`requested_at`);--> statement-breakpoint
CREATE INDEX `approval_requests_kind_subject_idx` ON `approval_requests` (`kind`,`subject_id`);--> statement-breakpoint
CREATE INDEX `approval_requests_plugin_idx` ON `approval_requests` (`plugin_id`,`status`);