CREATE TABLE `commerce_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`customer_ref` text,
	`status` text NOT NULL,
	`total_minor` integer NOT NULL,
	`currency` text DEFAULT 'RON' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `commerce_orders_workspace_status_idx` ON `commerce_orders` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `commerce_products` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`description` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_products_workspace_slug_idx` ON `commerce_products` (`workspace_id`,`slug`);--> statement-breakpoint
CREATE TABLE `commerce_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`sku` text NOT NULL,
	`price_minor` integer NOT NULL,
	`currency` text DEFAULT 'RON' NOT NULL,
	`stock_quantity` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `commerce_products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_variants_sku_idx` ON `commerce_variants` (`sku`);--> statement-breakpoint
CREATE INDEX `commerce_variants_product_idx` ON `commerce_variants` (`product_id`);