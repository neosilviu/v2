CREATE TABLE `provider_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'unavailable' NOT NULL,
	`secret_binding_ref` text,
	`default_model_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `provider_connections_workspace_idx` ON `provider_connections` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `provider_connections_title_idx` ON `provider_connections` (`workspace_id`,`title`);--> statement-breakpoint
CREATE TABLE `provider_model_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`model_id` text NOT NULL,
	`title` text NOT NULL,
	`capabilities_json` text DEFAULT '[]' NOT NULL,
	`detected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `provider_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `provider_models_connection_idx` ON `provider_model_snapshots` (`connection_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `provider_models_model_idx` ON `provider_model_snapshots` (`connection_id`,`model_id`);