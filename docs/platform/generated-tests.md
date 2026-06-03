# Generated Tests

`pnpm test:generated` runs invariant checks generated from current contracts, plugin manifests and declarative HTTP scenario files.

The runner does not require a test framework. It currently checks:

- all plugin manifests discoverable under `plugins/*`;
- duplicate contribution identifiers;
- public contribution references to declared tools and surfaces;
- runtime-first architecture rules in platform source;
- Core workspace read routes that must require authenticated or internal access;
- optional HTTP scenarios from `tests/scenarios/*.json`.

HTTP scenarios run only when `CORE_TEST_BASE_URL` is set:

```bash
CORE_TEST_BASE_URL=http://localhost:8787 pnpm test:generated
```

Drizzle migration drift checks are intentionally opt-in because they invoke package `db:generate` scripts:

```bash
pnpm test:generated -- --check-migrations
```

New repetitive tests should prefer new generated scenarios or contract-derived checks over one-off test code.
