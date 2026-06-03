# Public Delivery

Core is private-by-default. A plugin declaration is only a candidate for public delivery; it does not become public when the plugin is installed or activated.

Plugins may declare generic public route, surface and tool candidates in their manifests. Workspace administrators publish those candidates explicitly through Core. Core stores the publication in `workspace_publications`, stores the access rule in `public_access_policies`, audits the action and serves it only through the generic public delivery router.

The public router must stay feature-neutral. Platform apps must not add special routes such as `/website`, `/commerce` or `/ai-chat`; those experiences are resolved from published workspace records and plugin manifests.

Routes may be exact (`/about`) or parameterized (`/:slug`, `/products/:id`, `/category/:slug`). Patterns are declarative and limited to static segments plus `:paramName` segments; arbitrary regexes and executable routing code are not accepted. Exact matches win before parameterized matches, then precedence is deterministic by static segment count, parameter count and route priority.

Anonymous access is allowed only when the stored public access policy allows it. Authenticated public delivery can reuse Core session checks, but workspace internals such as installed plugins, active plugins, runtime tools, providers, settings and layout remain protected.

Declarative pages may request data sources and actions through generic runtime endpoints. Core validates the publication, active plugin, policy and declared operation before dispatch. Until dynamic plugin worker execution is implemented through a proper runtime boundary, unsupported query/action dispatch returns an explicit unavailable envelope rather than fake business data.
