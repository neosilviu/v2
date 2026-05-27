CREATE TABLE `impersonation_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_session_id` text NOT NULL,
	`subject_user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text,
	`revoked_at` text,
	`ended_at` text,
	`root_session_id` text,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `impersonation_sessions_actor_idx` ON `impersonation_sessions` (`actor_user_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `impersonation_sessions_subject_idx` ON `impersonation_sessions` (`subject_user_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `impersonation_sessions_workspace_idx` ON `impersonation_sessions` (`workspace_id`,`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `session` ADD `impersonated_by` text;