# Core RBAC

Core RBAC is the production authority for workspace administration.

Standard roles are Owner, Admin, Operator and Viewer. Permissions are stored in `workspace_role_permissions` and assigned through `workspace_member_roles`.

A user has no administration access until an explicit provisioning, invitation or membership mutation grants it.

Important invariants:

- `hasPermission()` is read-only and must not create Owners.
- Settings, Marketplace, Domains, Auth admin proxy and Mail Runtime routes all require workspace permissions.
- Auth administration from Web goes through Core. Core verifies permissions and calls Auth over an internal service binding.
- Recovery email allowlists are not a replacement for workspace RBAC.
