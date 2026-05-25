# Auth Deployment

## D1 Binding

Create a D1 database for Auth and bind it as `AUTH_DB` in `apps/auth-worker/wrangler.jsonc`.

Apply migrations:

```bash
wrangler d1 migrations apply v2-auth --config apps/auth-worker/wrangler.jsonc
```

Use `--remote` when applying to the deployed Cloudflare account.

## Required Values

Set these server-side:

```bash
wrangler secret put BETTER_AUTH_SECRET --config apps/auth-worker/wrangler.jsonc
```

Configure deployment variables for:

- `BETTER_AUTH_URL`: Auth Worker public URL.
- `APP_ORIGIN`: application origin allowed to send credentialed auth requests.
- `TRUSTED_ORIGINS`: optional extra origins.

Do not commit real secrets or production IDs to source.

## Optional GitHub OAuth

Set both values to enable GitHub OAuth:

```bash
wrangler secret put GITHUB_CLIENT_ID --config apps/auth-worker/wrangler.jsonc
wrangler secret put GITHUB_CLIENT_SECRET --config apps/auth-worker/wrangler.jsonc
```

If either value is missing, GitHub OAuth remains disabled.
