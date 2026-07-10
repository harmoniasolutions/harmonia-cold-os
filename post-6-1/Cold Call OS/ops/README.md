# Leads data integrity — incident, fix, and prevention

Source of truth for cold-outreach leads is the Google Sheet **`14sLwEEmqf6U56zdOWxo_48ozKNQI9yT1qMoyllZafvo`**, tab **`Leads`** (37 cols, `id` in col A). Every system reads/writes it: Cold Call OS, Cold Email Sender, Email Status + Recovery, Demo Command Center, SARA, GHL.

## The 2026‑06‑19 incident
An ad‑hoc enrichment run (`source=harmonia_230`, `last_agent_action=backfill_icp_from_name`) inserted a stray header row into the contact columns **D:P (`owner`→`online_booking`)** at sheet **row 273**, shifting every value in those columns **down one row** for rows 273–504 (232 leads). Result: each business showed the owner/email/phone/website of the business listed *above* it. `id`/`biz_name`/`icp` (A–C) and the operational columns (Q+) were untouched — which is why the repair was possible by keying on `id`.

## The fix (2026‑07‑09)
Realigned the D:P block up one row, keyed on `id`, verified live. Also made `id` **globally unique**: dataset‑B rows 1273–1292 had *reused* ids 279–298 (20 collisions) → renumbered to **822–841**; cleared one stray `status="status"` cell (row 15). Full pre‑fix backup: `scratchpad/leads_backup_A1_P510.json`.

## Why it happened + the rule
Root cause = a **positional block write** (paste a column block at a row position) that slipped one row. Prevention rule:

> **Never write to the Leads sheet by row position. Every write is an upsert keyed on `id`.** (native Google Sheets "update / appendOrUpdate → match on `id`").

Audit of live writers (2026‑07‑09): all are already id‑keyed — Cold Call Log (by ID), Cold Email Sender (`lead_id=id`), Salon Email Enricher v2 (by id), Email Status (by id); promoters *append* new ids. The culprit was an external/ad‑hoc script, not a standing workflow — which is why the canary below (writer‑agnostic) is the real safety net.

## The canary — daily smoke detector
n8n workflow **`Leads Integrity Canary (daily)`** — id **`3IsmFxwlaOGMqDwh`**, ACTIVE, runs **daily 7:00am**. Reads the whole sheet and Discord‑alerts only when it finds:
1. **HEADER‑IN‑CELL** — a cell whose value equals its own header (e.g. `owner="owner"`). This is the *exact* signature of a column‑block shift.
2. **DUPLICATE ids** — `id` must be globally unique.
3. **WEBSITE↔BIZ shift run** — ≥5 consecutive rows where the website matches the *next* row's business (owner/contact columns drifted one row).

Verified: replaying it against the pre‑fix backup fires checks (1) and (3) — it would have caught the incident **on day one**. Source: [`leads-integrity-canary.workflow.js`](./leads-integrity-canary.workflow.js). Discord + Sheets creds are bound in n8n (`googleSheetsOAuth2Api` = `zOZhujXDtoNhIPm5`).

## If the canary fires (repair playbook)
1. Back up the affected range first (read → save JSON).
2. Identify the shifted column block + row span (a run of HEADER‑IN‑CELL cells marks the seam).
3. Realign **keyed on `id`** (read the misplaced block, write it to the correct rows matched by id), RAW cell format. Never re‑paste positionally.
4. Re‑run the canary → green.

## Longer‑term
Promote a keyed store (Supabase / n8n Data Table, primary key `id`) to source of truth; make the Sheet a generated read‑only mirror. A DB row is an atomic "block" — column drift becomes structurally impossible.
