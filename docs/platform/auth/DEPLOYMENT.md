# Auth deployment

The assigned `AUTH_DB` D1 identifier remains in `wrangler.jsonc` by project-owner decision. The committed initial migration targets that binding.

Set authentication and optional OAuth values through Cloudflare server-side configuration before production deployment. For production also configure `DEPLOYMENT_ENV=production`, an HTTPS application authentication URL, and HTTPS trusted application origins. Development defaults in `wrangler.jsonc` are not valid production settings and production validation fails closed if they remain local or HTTP.

The Worker enables the `nodejs_als` compatibility flag required for its Better Auth runtime integration on Cloudflare Workers.
