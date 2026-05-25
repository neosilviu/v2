CREATE TABLE `plugin_catalog_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`version` text NOT NULL,
	`manifest_json` text NOT NULL,
	`package_object_key` text NOT NULL,
	`sha256` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`format` text NOT NULL,
	`worker_isolation` text DEFAULT 'none' NOT NULL,
	`ui_mode` text DEFAULT 'declarative' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`source` text DEFAULT 'official' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`published_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugin_catalog`(`plugin_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_catalog_releases_identity_idx` ON `plugin_catalog_releases` (`plugin_id`,`version`,`sha256`);--> statement-breakpoint
CREATE INDEX `plugin_catalog_releases_plugin_status_idx` ON `plugin_catalog_releases` (`plugin_id`,`status`);--> statement-breakpoint
CREATE INDEX `plugin_catalog_releases_source_idx` ON `plugin_catalog_releases` (`source`);