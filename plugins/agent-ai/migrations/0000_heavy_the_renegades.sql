CREATE TABLE `agent_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`provider_binding_id` text,
	`system_prompt` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_channels_workspace_idx` ON `agent_channels` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `agent_knowledge_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`resource_ref` text,
	`source_url` text,
	`configuration_json` text,
	`last_synced_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_knowledge_sources_workspace_idx` ON `agent_knowledge_sources` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `agent_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`metadata_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `agent_channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_messages_channel_idx` ON `agent_messages` (`channel_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agent_provider_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`contribution_id` text NOT NULL,
	`connection_id` text,
	`title` text NOT NULL,
	`model` text NOT NULL,
	`status` text DEFAULT 'unavailable' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_provider_bindings_workspace_idx` ON `agent_provider_bindings` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `agent_provider_bindings_connection_idx` ON `agent_provider_bindings` (`connection_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_provider_binding_name_idx` ON `agent_provider_bindings` (`workspace_id`,`title`);--> statement-breakpoint
CREATE TABLE `agent_resource_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`binding_name` text NOT NULL,
	`purpose` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_resource_binding_idx` ON `agent_resource_bindings` (`workspace_id`,`resource_type`,`binding_name`);--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`provider_binding_id` text,
	`status` text NOT NULL,
	`input_message_id` text,
	`output_message_id` text,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`channel_id`) REFERENCES `agent_channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_binding_id`) REFERENCES `agent_provider_bindings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`input_message_id`) REFERENCES `agent_messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`output_message_id`) REFERENCES `agent_messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agent_runs_channel_idx` ON `agent_runs` (`channel_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agent_tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`tool_id` text NOT NULL,
	`input_json` text NOT NULL,
	`approval_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`result_json` text,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `agent_channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_tool_calls_run_idx` ON `agent_tool_calls` (`run_id`);--> statement-breakpoint
CREATE INDEX `agent_tool_calls_channel_idx` ON `agent_tool_calls` (`channel_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_tool_calls_approval_idx` ON `agent_tool_calls` (`approval_id`);