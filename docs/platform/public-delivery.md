# Public Delivery

Core is private-by-default. A plugin declaration is only a candidate for public delivery; it does not become public when the plugin is installed or activated.

Plugins may declare generic public route, surface and tool candidates in their manifests. Workspace administrators publish those candidates explicitly through Core. Core stores the publication in `workspace_publications`, stores the access rule in `public_access_policies`, audits the action and serves it only through the generic public delivery router.

The public router must stay feature-neutral. Platform apps must not add special routes such as `/website`, `/commerce` or `/ai-chat`; those experiences are resolved from published workspace records and plugin manifests.

Anonymous access is allowed only when the stored public access policy allows it. Authenticated public delivery can reuse Core session checks, but workspace internals such as installed plugins, active plugins, runtime tools, providers, settings and layout remain protected.
