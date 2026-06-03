CREATE TABLE `approval_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`plugin_id` text,
	`risk` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_by` text,
	`decided_by` text,
	`requested_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`decided_at` text,
	`expires_at` text,
	`consumed_at` text,
	`reason` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `approval_requests_workspace_status_idx` ON `approval_requests` (`workspace_id`,`status`,`requested_at`);--> statement-breakpoint
CREATE INDEX `approval_requests_kind_subject_idx` ON `approval_requests` (`kind`,`subject_id`);--> statement-breakpoint
CREATE INDEX `approval_requests_plugin_idx` ON `approval_requests` (`plugin_id`,`status`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`actor_id` text,
	`action` text NOT NULL,
	`payload_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_events_workspace_idx` ON `audit_events` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_action_idx` ON `audit_events` (`action`);--> statement-breakpoint
CREATE TABLE `installed_plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`manifest_json` text NOT NULL,
	`package_object_key` text,
	`package_sha256` text,
	`package_size_bytes` integer,
	`package_format` text,
	`worker_isolation` text DEFAULT 'none' NOT NULL,
	`ui_mode` text DEFAULT 'declarative' NOT NULL,
	`installed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`limits_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plugin_capabilities` (
	`plugin_id` text NOT NULL,
	`capability_id` text NOT NULL,
	`description` text,
	`risk` text DEFAULT 'safe' NOT NULL,
	PRIMARY KEY(`plugin_id`, `capability_id`),
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
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
CREATE INDEX `plugin_catalog_category_idx` ON `plugin_catalog` (`category`);--> statement-breakpoint
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
CREATE INDEX `plugin_catalog_releases_source_idx` ON `plugin_catalog_releases` (`source`);--> statement-breakpoint
CREATE TABLE `plugin_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`version` text NOT NULL,
	`object_key` text NOT NULL,
	`sha256` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`format` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_packages_identity_idx` ON `plugin_packages` (`plugin_id`,`version`,`sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_packages_object_key_idx` ON `plugin_packages` (`object_key`);--> statement-breakpoint
CREATE TABLE `plugin_permissions` (
	`plugin_id` text NOT NULL,
	`permission` text NOT NULL,
	`description` text,
	`risk` text DEFAULT 'safe' NOT NULL,
	PRIMARY KEY(`plugin_id`, `permission`),
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plugin_permissions_permission_idx` ON `plugin_permissions` (`permission`);--> statement-breakpoint
CREATE TABLE `plugin_runtime_deployments` (
	`workspace_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`release_id` text NOT NULL,
	`runtime_key` text NOT NULL,
	`runtime_kind` text DEFAULT 'dispatch-namespace' NOT NULL,
	`runtime_status` text DEFAULT 'pending' NOT NULL,
	`deployed_version` text,
	`deployment_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`activated_at` text,
	`disabled_at` text,
	`last_error` text,
	PRIMARY KEY(`workspace_id`, `plugin_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plugin_runtime_workspace_status_idx` ON `plugin_runtime_deployments` (`workspace_id`,`runtime_status`);--> statement-breakpoint
CREATE INDEX `plugin_runtime_key_idx` ON `plugin_runtime_deployments` (`runtime_key`);--> statement-breakpoint
CREATE TABLE `plugin_ui_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`contribution_id` text NOT NULL,
	`contribution_type` text NOT NULL,
	`source` text DEFAULT 'plugin' NOT NULL,
	`access_mode` text DEFAULT 'private' NOT NULL,
	`zone_id` text,
	`default_path` text,
	`label` text,
	`icon` text,
	`navigation_section` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`renderer_mode` text DEFAULT 'declarative' NOT NULL,
	`component_id` text,
	`configurable_json` text DEFAULT '{}' NOT NULL,
	`template_id` text NOT NULL,
	`schema_json` text NOT NULL,
	`required_permission` text,
	`version` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_ui_contributions_identity_idx` ON `plugin_ui_contributions` (`plugin_id`,`contribution_id`,`version`);--> statement-breakpoint
CREATE INDEX `plugin_ui_contributions_plugin_idx` ON `plugin_ui_contributions` (`plugin_id`);--> statement-breakpoint
CREATE INDEX `plugin_ui_contributions_template_idx` ON `plugin_ui_contributions` (`template_id`);--> statement-breakpoint
CREATE TABLE `public_access_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`access` text DEFAULT 'anonymous' NOT NULL,
	`authentication_mode` text DEFAULT 'anonymous' NOT NULL,
	`rules_json` text,
	`allowed_operations_json` text DEFAULT '[]' NOT NULL,
	`rate_limit_policy` text,
	`cache_policy` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `public_access_policies_workspace_idx` ON `public_access_policies` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `public_access_policies_enabled_idx` ON `public_access_policies` (`workspace_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `service_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`credential_ref` text,
	`capabilities_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `service_identities_workspace_idx` ON `service_identities` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `service_identities_kind_idx` ON `service_identities` (`workspace_id`,`kind`);--> statement-breakpoint
CREATE TABLE `tool_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`tool_id` text NOT NULL,
	`risk` text NOT NULL,
	`input_json` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_by` text,
	`decided_by` text,
	`requested_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`decided_at` text,
	`consumed_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tool_approvals_workspace_status_idx` ON `tool_approvals` (`workspace_id`,`status`,`requested_at`);--> statement-breakpoint
CREATE INDEX `tool_approvals_tool_idx` ON `tool_approvals` (`tool_id`,`requested_at`);--> statement-breakpoint
CREATE TABLE `user_plan_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_plan_assignments_user_idx` ON `user_plan_assignments` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `user_plan_assignments_plan_idx` ON `user_plan_assignments` (`plan_id`,`status`);--> statement-breakpoint
CREATE TABLE `workspace_capability_grants` (
	`workspace_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`capability_id` text NOT NULL,
	`granted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `plugin_id`, `capability_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workspace_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`hostname` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`verification_method` text DEFAULT 'manual' NOT NULL,
	`verification_token_hash` text,
	`verification_instructions_json` text,
	`publication_id` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`verified_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_domains_hostname_idx` ON `workspace_domains` (`workspace_id`,`hostname`);--> statement-breakpoint
CREATE INDEX `workspace_domains_status_idx` ON `workspace_domains` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `workspace_domains_kind_idx` ON `workspace_domains` (`workspace_id`,`kind`);--> statement-breakpoint
CREATE TABLE `workspace_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`role_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`token_hash` text,
	`expires_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `workspace_roles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `workspace_invitations_workspace_idx` ON `workspace_invitations` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `workspace_invitations_email_idx` ON `workspace_invitations` (`workspace_id`,`email`);--> statement-breakpoint
CREATE TABLE `workspace_layouts` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`layout_json` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
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
CREATE INDEX `workspace_mail_templates_workspace_idx` ON `workspace_mail_templates` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `workspace_member_permission_overrides` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`permission` text NOT NULL,
	`effect` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`, `permission`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_member_permission_overrides_lookup_idx` ON `workspace_member_permission_overrides` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `workspace_member_permission_overrides_permission_idx` ON `workspace_member_permission_overrides` (`workspace_id`,`permission`,`effect`);--> statement-breakpoint
CREATE TABLE `workspace_member_roles` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`, `role_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `workspace_roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_member_roles_user_idx` ON `workspace_member_roles` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_members_email_idx` ON `workspace_members` (`workspace_id`,`email`);--> statement-breakpoint
CREATE INDEX `workspace_members_status_idx` ON `workspace_members` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `workspace_plugins` (
	`workspace_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`activated_at` text,
	`deactivated_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `plugin_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_plugins_workspace_idx` ON `workspace_plugins` (`workspace_id`,`active`);--> statement-breakpoint
CREATE TABLE `workspace_provisioning_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`consumed_at` text,
	`metadata_json` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_provisioning_workspace_idx` ON `workspace_provisioning_requests` (`workspace_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_provisioning_token_idx` ON `workspace_provisioning_requests` (`token_hash`);--> statement-breakpoint
CREATE TABLE `workspace_publications` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`contribution_kind` text DEFAULT 'route' NOT NULL,
	`publication_type` text DEFAULT 'route' NOT NULL,
	`contribution_id` text NOT NULL,
	`public_path` text NOT NULL,
	`route_pattern` text DEFAULT '/' NOT NULL,
	`route_priority` integer DEFAULT 0 NOT NULL,
	`route_kind` text DEFAULT 'exact' NOT NULL,
	`parameter_names_json` text,
	`title` text DEFAULT 'Published page' NOT NULL,
	`template_id` text DEFAULT 'public.contentPage' NOT NULL,
	`schema_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`policy_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`published_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`policy_id`) REFERENCES `public_access_policies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_publications_path_idx` ON `workspace_publications` (`workspace_id`,`public_path`);--> statement-breakpoint
CREATE INDEX `workspace_publications_plugin_idx` ON `workspace_publications` (`workspace_id`,`plugin_id`);--> statement-breakpoint
CREATE INDEX `workspace_publications_status_idx` ON `workspace_publications` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `workspace_publications_route_idx` ON `workspace_publications` (`workspace_id`,`route_kind`,`status`);--> statement-breakpoint
CREATE TABLE `workspace_role_permissions` (
	`workspace_id` text NOT NULL,
	`role_id` text NOT NULL,
	`permission` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `role_id`, `permission`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `workspace_roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_role_permissions_permission_idx` ON `workspace_role_permissions` (`workspace_id`,`permission`);--> statement-breakpoint
CREATE TABLE `workspace_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`system_key` text,
	`description` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_roles_system_idx` ON `workspace_roles` (`workspace_id`,`system_key`);--> statement-breakpoint
CREATE INDEX `workspace_roles_workspace_idx` ON `workspace_roles` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `workspace_settings` (
	`workspace_id` text NOT NULL,
	`scope` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `scope`, `key`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workspace_theme_tokens` (
	`workspace_id` text NOT NULL,
	`token_key` text NOT NULL,
	`token_value` text NOT NULL,
	`scope` text DEFAULT 'both' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `token_key`, `scope`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workspace_ui_activations` (
	`workspace_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`contribution_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`visible_in_navigation` integer DEFAULT true NOT NULL,
	`label_override` text,
	`icon_override` text,
	`navigation_section_override` text,
	`path_alias` text,
	`zone_override` text,
	`order_index` integer DEFAULT 0 NOT NULL,
	`configuration_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `plugin_id`, `contribution_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plugin_id`) REFERENCES `installed_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_ui_activations_workspace_idx` ON `workspace_ui_activations` (`workspace_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'unprovisioned' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
