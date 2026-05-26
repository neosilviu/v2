CREATE TABLE `workspace_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`hostname` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`verification_method` text DEFAULT 'manual' NOT NULL,
	`verification_token_hash` text,
	`verification_instructions_json` text,
	`publication_id` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`verified_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_domains_hostname_idx` ON `workspace_domains` (`workspace_id`,`hostname`);--> statement-breakpoint
CREATE INDEX `workspace_domains_status_idx` ON `workspace_domains` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `workspace_domains_kind_idx` ON `workspace_domains` (`workspace_id`,`kind`);