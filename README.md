# Wrizo | Read

The group platform of the Wrizo house: a public **Reading Room** where finished work is
published and read, and a gated **Workshop** where writers workshop work-in-progress — blind and
honestly — before it is hung. Wrizo | Write is the solitary instrument; Read is the building
beside it. They touch at one narrow bridge.

**Read [`docs/foundations/foundations.md`](docs/foundations/foundations.md) first — it is
constitutional.** It supersedes all chat-only deliberation; amendments require Nick's word and a
committed revision to that file.

## Where things are

- [`docs/foundations/foundations.md`](docs/foundations/foundations.md) — AX0, the constitutional record.
- [`docs/governance/committees.md`](docs/governance/committees.md) — committees and rules of order.
- [`docs/briefs/ax1-brief.md`](docs/briefs/ax1-brief.md) — the AX1 build brief.
- [`docs/rc/`](docs/rc/) — normative visual references (RC2). North star for later tickets, not literal markup.

## Repo law

Read is its own building: its own repository, its own Railway project, its own Postgres. The Read
tree is **never shared with the Write tree** — one checkout per agent. No Read code lives in the
Write repo beyond the bridge client. Report = push; schema merges wait on Nick's explicit word.

## Develop

**Prerequisites:** Node 20 (`.nvmrc`), pnpm (`corepack enable`), Postgres 16.

```bash
pnpm install

# Point the API at a database and object storage.
cp apps/api/.env.example apps/api/.env      # edit DATABASE_URL (and S3_* for real storage)
createdb wrizo_read                          # or use your DATABASE_URL's database

# Apply the schema (migrations 001–003).
DATABASE_URL=postgres://postgres:postgres@localhost:5432/wrizo_read pnpm --filter @wrizo/api migrate:up

# Boot api + web (builds tokens first).
pnpm dev
```

With no `S3_*` configured the API uses an in-memory object store (dev/test only — never the
filesystem). Set `S3_ENDPOINT` + `S3_BUCKET` + keys for a real S3-compatible bucket.

**Tests & tools**

```bash
pnpm --filter @wrizo/api test          # property suite (needs DATABASE_URL; skips without one)
pnpm --filter @wrizo/web test:e2e      # rendered-geometry harness (laptop + tablet, both regimes)
pnpm check                             # zero-hard-coded-values gate over apps/web/src
pnpm verify:deposit <snapshot> --expect <sha256hex>   # reproduce a deposit hash independently
```

## Monorepo

- `packages/tokens` — the theme × regime token matrix (`tokens.json` is the source of truth) + `lex()`.
- `packages/contracts` — the `wrizo-bridge/1` envelope (zod) and canonicalization v1.
- `apps/api` — Fastify service: auth, the publish endpoint, the transactional Archive intake, migrations.
- `apps/web` — the token-driven shell.
