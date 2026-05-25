CREATE TABLE `plugin_catalog` (
	`plugin_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`manifest_json` text NOT NULL,
	`category` text NOT NULL,
	`demo_available` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'official' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plugin_catalog_source_idx` ON `plugin_catalog` (`source`);--> statement-breakpoint
CREATE INDEX `plugin_catalog_category_idx` ON `plugin_catalog` (`category`);