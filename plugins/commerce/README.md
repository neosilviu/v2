# Commerce plugin

`commerce` owns product/catalog, variant and order domain functionality. Its worker, schema and persistence remain independent from Core and Auth.

## Storage

`server/db/schema.ts` and `migrations/0001_initial.sql` define dedicated D1 tables for products, variants and orders. Deployments must bind `COMMERCE_DB` and any optional storage resources server-side.

## Security

Catalog editing is reversible and permission-controlled. Order reads and order management are sensitive capabilities and must require runtime grants/approvals where exposed to Agent AI or MCP. Customer or payment secrets must never be placed in notifications, tool payload logs or frontend state.

## Status

Implemented: package, manifest, schema/migration and minimal read-only Worker foundation. Remaining: UI surface, repositories, checkout/payment integrations, order workflows and approved Agent AI tooling.
