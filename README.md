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
