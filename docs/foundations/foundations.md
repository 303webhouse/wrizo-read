# Wrizo | Read — Foundations (AX0)

**Status:** Ratified by Nick, July 22, 2026. This document is the constitutional record of the
Read arc (AX). It supersedes all chat-only deliberation. Amendments require Nick's word and a
committed revision to this file.

---

## 1. What Read is

Wrizo | Read is the group platform of the Wrizo house: a public **Reading Room** where finished
work is published and read, and a gated **Workshop** where writers workshop work-in-progress,
blind and honestly, before it is hung. Wrizo | Write is the solitary instrument; Read is the
building beside it. They touch at one narrow bridge.

The thesis, from the Experts' first sitting: detection is a losing war; **provenance is a moat**.
Read is the only workshop where the work is known to be human because the instrument watched it
being made. Intake to the Workshop happens only through Wrizo | Write. There is no web upload
form for Workshop pieces, ever.

## 2. Names

| Canonical | Working name | Notes |
|---|---|---|
| The writing app | **Wrizo \| Write** | working name; final name parked (§13) |
| The group platform | **Wrizo \| Read** | working name; final name parked (§13) |
| Public floor | **The Reading Room** | writer profiles are **Rooms** ("a room of one's own") |
| Gated floor | **The Workshop** | founder's word; unchanged |
| The anonymous queue | `queue` (schema) | **lexicon-themed**: Plateau *the Pile*, Flux *Degree Zero*, Machina *Intake*; Nomad and Volant name theirs when armed |
| Sealed author | **the Scriptor** | never "anonymous," never a handle |
| Reviews | **readings** | "file your reading" |
| Deposit ledger | **the Archive** | evidence, never verdict |
| Credits | **credits** | plain by law (§6) |
| Reviewer tiers | **Laurels** | Reader / Senior Reader / Laureate |
| Hallmark | **Forged in the Workshop** | the Publish glyph: two joined strokes in steep ascent |
| Long works | **Volumes** | outside the quota; opt-in only |

Retired working titles, kept for the record: the Annex (platform), the Gallery (public floor).

## 3. Constitutional architecture

- **Separate building.** Read lives in `303webhouse/wrizo-read`: its own repository, its own
  Railway project, its own Postgres. Write remains local-first and private; Read is server-first
  and public. No Read code in the Write repo beyond the bridge client.
- **One checkout per agent.** The Read tree is never shared with the Write tree. The Write-side
  bridge (the Workshop button + client) is a separate small ticket in the Write repo, slotted
  after the B-arc closes.
- **The bridge.** The Workshop button in Write POSTs a sealed snapshot to Read's publish API:
  text, tags, coarse provenance envelope, optional Board bundle. Read's side of the contract
  builds in AX1 and waits for its caller.

## 4. The identity triptych

One account, three faces. The linkage between them lives server-side only, in the Archive,
and nowhere else.

1. **Civic face** — the Reading Room profile. Public, customizable (the writer's Room).
2. **Reviewer face** — a persistent Workshop pseudonym. Laurels and reading-ratings attach here.
3. **The Scriptor** — per-piece sealed authorship. No handle at all, not even the pseudonym.
   Authorship cannot be linked across pieces by anyone on the floor.

**The claim door** is ceremonial: an author may claim a piece into their civic face (e.g., when
hanging it in the Reading Room). Deliberate, confirmed, one-way. Deanonymization is an event,
not a toggle.

## 5. The Workshop floor — laws

- **Sealed readings.** Other readings on a piece are not present in any client payload until the
  requester's own reading is committed. Enforced server-side; tested as an API property.
- **Reading-tone law.** Hard on the page, soft on the person. Posted in the charter at the door.
- **The charter at the door.** The floor's laws — reading-tone, flag, seeing — are shown once at
  first entry. Rules of discourse are explicit, not ambient.
- **The queue.** 7,500-word ceiling for queue pieces. Claim model: a reader claims a piece on a
  four-hour hold; serving is oldest-and-least-read weighted so coverage reaches the tail.
  Browse-by-room and "deal me one" both feed claims.
- **Volumes.** Long works post as Volumes: reviewable by choice, never served to the quota.
- **Rooms and hands.** Pieces are tagged by room (genre) and hand (style). Dual-room tagging is
  permitted (an essay-becoming-poem need not choose at the door).
- **No ratings on pieces, ever.** Only readings are rated (usefulness, by the author and the
  floor). Works are read, not scored.

## 6. The economy — anti-molarization law

One currency, a fixed price list, forever:

- Filing an accepted reading **earns 1 credit**.
- Filing a queue piece **costs 2 credits**.
- Filing a Volume **costs 4 credits** (and bypasses the quota engine).

No new currencies, no exchange rates, no bundles, no badges, no pay-to-skip. The moment credits
become capital, the floor molarizes. This clause exists to be pointed at.

## 7. Laurels

Coarse tiers — Reader, Senior Reader, Laureate — accrued from how authors and fellow readers
rate one's readings. Tiers, not tallies: no integers anywhere in the interface, no leaderboard,
quiet surfacing under the M1 progressive-disclosure frame. No door is ever shown locked.

## 8. AI rails (layered; no detector is ever judge)

1. **Provenance intake** — Workshop pieces enter only via the Write bridge, carrying a coarse
   provenance envelope (session count, span). The instrument is the certificate.
2. **The paste rail extends to the reading composer** — readings are written where they are
   filed. The floor's readers are as human as its writers.
3. **Community flags** — "reads synthetic" flags at a threshold convene committee review by
   humans. False flags cost standing.
4. **Structural friction** — the quota itself prices spam in human labor; per-account rate
   limits apply.

## 9. The Archive — and the seeing law

- Deposits are **append-only**: canonical-text SHA-256 (normalized whitespace and encoding),
  server timestamp, account id, full snapshot to object storage, daily chain-hash anchor for
  tamper evidence. Certificates render human-readable.
- **Evidence, never verdict.** The Archive testifies about who deposited what and when; it does
  not adjudicate authorship. Every certificate says so.
- **The seeing law.** The house sees only what its own laws require. Provenance is coarse by
  law (fine-grained timing is a fingerprint). The identity linkage table is sealed and
  access-audited. A public transparency charter states in plain words what the house can and
  cannot know about a Scriptor.
- **Counsel gate.** Counsel reviews the Archive, age policy, takedown process, and privacy
  baseline before any public launch. (The Reading Room, as a public platform, carries
  moderation, DMCA, and age-gate obligations the single-writer house never had.)

## 10. Theme × regime token architecture

- **Initial build ships Plateau only, day and night**, because themes have not yet been applied
  to Write itself. But the contract is total from the first commit.
- **Tokens are the sole styling source.** Palette, type, geometry, motion, and **lexicon** all
  resolve through the token layer. Zero hard-coded values anywhere in Read. Arming a new theme
  is a data drop, not a refactor.
- The matrix is **theme × regime** (day/night per theme; five themes eventually = ten sets).
  Precedent: Volant's foundations lock day and night tokens separately.
- **Lane law travels.** Rest states wear the door color; the evental lane arrives on
  hover/focus; press is the act. No at-rest affordances in the evental lane, in any theme.
- **Lexicon tokens** are part of the contract: the queue's name is the first entry (the Pile /
  Degree Zero / Intake). Copy strings resolve through the lexicon table exactly as colors
  resolve through the palette.
- The Workshop wears the writer's own theme; the Reading Room is Plateau to begin with. Reader
  theme unlocks arrive later as quiet unlocks (tenure + one contribution an author found
  useful), never counters.
- RC files (`docs/rc/`) are normative visual references. Current tokens are placeholders to be
  trued against Write's committed theme foundations when the theme arc arms.

## 11. Launch order and growth

Workshop first, Reading Room second. The Workshop is alive at thirty writers; a public feed at
thirty is a ghost town. The **Forged in the Workshop** hallmark is the funnel: every hung piece
recruits readers toward the floor, and readers toward Write. The Reading Room's recurring
invitation: *every piece hanging here was made in the rooms behind it.*

## 12. Phasing and backlog

**AX0** this document. **AX1** repo scaffold, token matrix, identity, publish API + Archive
intake (brief committed alongside). **AX2** the queue: submissions, claims, filters, Volumes
lane. **AX3** readings: composer with paste rail, server-side sealing, usefulness ratings.
**AX4** Archive certificates + chain anchor + transparency charter page. **AX5** Reading Room,
read phase: Rooms, follow, hung pieces, hallmark. **AX6** margin notes + the funnel band +
reader accounts. **AX7** Laurels, flags, the moderation desk, charter at the door.

**Write-repo ticket (post-B-arc):** the Workshop button + bridge client.

**Backlog:** resubmission lineage (versions as plateaus; delta visible to returning readers) —
flagship; ceremonial claim-door flow; reader theme unlocks; dual-room tag UI; reading-oriented
composer prompts ("where did you stop believing"); Volume gift-memory (the floor remembers
Volume readings generously).

**House rhythm unchanged:** committee pass → brief → build → Fable post-merge review (committed
file) → Nick's merge word → device sitting → Nick's deploy word. Schema tickets require Nick's
explicit go. Deploy ships a SHA. Report = push.

## 13. Parked: the final names

Deferred by Nick's word, July 22, 2026 — deliberately not a blocker. The slate, preserved:

- **Wrizo | Fold & Wrizo | Weave** — chair's recommendation (the fold makes the book; the weave
  makes the text; Deleuze and Barthes underneath).
- **Wrizo | Refrain & Wrizo | Ensemble** — runner-up (the ritornello; warmth).
- **Wrizo | Line & Wrizo | Plane** — geometric; cool; aviation ambiguity noted.
- **Runner** (stolon) — collective side only, if botany returns.
- **Declined with reasons on record:** Root & Stem (the tree is the declared adversary — the
  Deleuzian's flag stands); the Salon, the Milieu (period costume); the Gallery (borrows another
  art's prestige); the Annex (retired working title).
- Noted for the record: *Wrizo* already carries the rhizome (ῥίζα) in its letters; the rhizome
  is a horizontal stem, not a root — the botanical instinct, rotated, is the product itself.
