# Auth Worker

Auth owns identity and sessions only. It uses Better Auth with the Drizzle/D1 adapter and exposes authentication requests through `/api/auth/*`.

Core consumes browser sessions through a private service binding. Plugins never write to authentication tables and Auth does not own workspace or feature data.
