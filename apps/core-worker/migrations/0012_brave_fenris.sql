CREATE TABLE `plugin_permissions` (
	`plugin_id` text NOT NULL,
	`permission` text NOT NULL,
	`description` text,
	`risk` text DEFAULT 'safe' NOT NULL,
	PRIMARY KEY(`plugin_id`, `permission`),
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plugin_permissions_permission_idx` ON `plugin_permissions` (`permission`);