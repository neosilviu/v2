# Auth Worker

Auth owns identity and sessions only. It uses Better Auth with the Drizzle/D1 adapter and exposes:

- public login configuration through `GET /public/auth/login-config?workspaceId=...`;
- session and auth requests through `/api/auth/*`;
- owner provisioning through `/setup/owner/*`;
- recovery-only administration through `/admin/auth/*`.

Core consumes browser sessions through a private service binding and owns workspace RBAC, domain trust and platform settings. Auth does not own workspace or feature data, and plugins never write to authentication tables.
