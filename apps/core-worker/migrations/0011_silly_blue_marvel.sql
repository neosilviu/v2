CREATE TABLE `mail_delivery_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider_id` text,
	`template_key` text,
	`recipient_hash_or_safe_reference` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`purpose` text NOT NULL,
	`error_safe` text,
	`audit_event_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_id`) REFERENCES `workspace_mail_providers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `mail_delivery_events_workspace_idx` ON `mail_delivery_events` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `mail_delivery_events_provider_idx` ON `mail_delivery_events` (`workspace_id`,`provider_id`,`status`);--> statement-breakpoint
CREATE TABLE `workspace_mail_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`from_name` text NOT NULL,
	`from_email` text NOT NULL,
	`reply_to_email` text,
	`configuration_ref` text,
	`safe_config_json` text DEFAULT '{}' NOT NULL,
	`is_default_transactional` integer DEFAULT false NOT NULL,
	`last_tested_at` text,
	`last_test_status` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_mail_providers_workspace_idx` ON `workspace_mail_providers` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `workspace_mail_providers_default_idx` ON `workspace_mail_providers` (`workspace_id`,`is_default_transactional`);--> statement-breakpoint
CREATE TABLE `workspace_mail_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`template_key` text NOT NULL,
	`subject_template` text NOT NULL,
	`body_text_template` text NOT NULL,
	`body_html_template` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`locale` text DEFAULT 'ro-RO' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_mail_templates_key_idx` ON `workspace_mail_templates` (`workspace_id`,`template_key`,`locale`);--> statement-breakpoint
CREATE INDEX `workspace_mail_templates_workspace_idx` ON `workspace_mail_templates` (`workspace_id`,`status`);