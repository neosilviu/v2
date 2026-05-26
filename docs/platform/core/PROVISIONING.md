# Workspace Provisioning

Production does not create the first Owner through public signup and does not store an Owner password in environment variables.

Create the first workspace and one-time owner setup request from a controlled terminal:

```bash
pnpm provision:workspace:prod --workspace default --name "Print Center" --owner admin@example.com --admin-domain app.example.com --auth-domain auth.example.com
```

The command writes a `workspace_provisioning_requests` row with only a token hash and prints the one-time setup URL once. Local development can use:

```bash
pnpm bootstrap:workspace:dev --owner owner@example.local
```

The public `/setup/owner?token=...` route only reports token state. The authenticated consume step links the signed-in matching email as Owner, consumes the token and marks the workspace active. Permission checks never create Owners as a side effect.

`RECOVERY_ADMIN_ENABLED` and `RECOVERY_ADMIN_EMAILS` are break-glass only. Keep recovery disabled after provisioning.
