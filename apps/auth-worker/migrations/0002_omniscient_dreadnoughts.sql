ALTER TABLE `auth_ui_contributions` ADD `template_id` text DEFAULT 'auth.login' NOT NULL;--> statement-breakpoint
ALTER TABLE `auth_ui_contributions` ADD `schema_json` text DEFAULT '{}' NOT NULL;