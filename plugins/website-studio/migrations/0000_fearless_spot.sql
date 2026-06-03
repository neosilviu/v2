CREATE TABLE `website_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`object_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`alt_text` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `website_assets_object_key_idx` ON `website_assets` (`workspace_id`,`object_key`);--> statement-breakpoint
CREATE TABLE `website_context_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`page_id` text NOT NULL,
	`surface_id` text NOT NULL,
	`readable_json` text DEFAULT '{}' NOT NULL,
	`allowed_tools_json` text DEFAULT '[]' NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `website_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `website_context_surface_idx` ON `website_context_shares` (`workspace_id`,`surface_id`,`page_id`);--> statement-breakpoint
CREATE TABLE `website_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`published_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `website_pages_workspace_slug_idx` ON `website_pages` (`workspace_id`,`slug`);--> statement-breakpoint
CREATE INDEX `website_pages_workspace_status_idx` ON `website_pages` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `website_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`kind` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`content_json` text DEFAULT '{}' NOT NULL,
	`ai_context_enabled` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `website_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `website_sections_page_order_idx` ON `website_sections` (`page_id`,`sort_order`);