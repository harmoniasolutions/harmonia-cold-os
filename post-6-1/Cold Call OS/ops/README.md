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

---

# Cold Call OS webhooks added 2026‑07‑13

Two new n8n workflows back new Cold Call OS features. Both are **deployed inactive** on `infoharmonia.app.n8n.cloud` and need the manual go‑live steps below before activating. App source of truth for both is [`../src/HarmoniaColdCallerOS.jsx`](../src/HarmoniaColdCallerOS.jsx) (webhook consts near the top).

## 1. Recording Upload — id `xmjpDFHSaYkdsWjS`
Backs the **Recording** tab (a standalone call‑MP3 library, per‑caller **Private** or **Global**). Source: [`recording-upload.workflow.js`](./recording-upload.workflow.js). Webhook **POST `/webhook/recording-upload`** (JSON `{ filename, mime, data_b64, title, notes, caller_name, visibility }`, base64 body, ~12 MB app‑side cap). Chain: Webhook → Code (normalize) → Convert to File (base64→binary) → Google Drive upload → Google Sheets append → Respond `{ status:"ok", file_id, link }`.

Storage: a **`Recordings`** tab on the **Caller Settings** sheet `1PTg69597Xf-aOsKlOFQ2nnLjQ-eOjfUfUDsIE0qKvSc` (kept OFF the Leads sheet so the integrity canary stays clean). Columns:
`id | title | caller_name | visibility | drive_file_id | drive_link | mime | uploaded_at | notes`.
The app reads that tab via `fetchRecordingsSheet()` and shows a row when `visibility==="global"` OR `caller_name===callerName`. Inline playback uses `https://drive.google.com/uc?export=download&id=<drive_file_id>` with an "Open in Drive" fallback.

**Go‑live (manual):**
1. Create a Google Drive folder **"Cold Call Recordings"**, share it **"Anyone with the link → Viewer"** (so files inside inherit link‑viewability for `<audio>` playback). Copy its folder id.
2. Open the workflow → **Upload to Drive** → set **Folder** to that folder (replaces the `PASTE_COLD_CALL_RECORDINGS_FOLDER_ID` placeholder). Confirm the Google Drive cred is bound (auto‑assigned on deploy).
3. Add the **`Recordings`** tab + header row to `1PTg…KvSc`, and confirm the Google Sheets account (`zOZhujXDtoNhIPm5`, bound on **Log to Recordings**) has **edit** access to that sheet.
4. **Activate** the workflow.

## 2. Number Error Investigator — id `0Ne5cBJWMFVdaMpa`
Fires in real time when a caller taps the **Number Error** disposition (`confirmOutcome` also POSTs the lead to this webhook). Source: [`number-error-investigator.workflow.js`](./number-error-investigator.workflow.js). Webhook **POST `/webhook/number-error-check`** (JSON `{ lead_id, biz, owner, city, state, icp, caller_name, mobile_phone, corporate_phone, home_phone, phone }`; responds immediately, fire‑and‑forget). Chain: Webhook → Code (recheck) → IF → `autofix`: Google Sheets appendOrUpdate **matched on `id`** / `discord`: HTTP POST to Discord.

Logic (ports the app's `toE164`, Leads‑sheet‑safe): `strictOK` = any stored phone already dials → formatting isn't the problem. Otherwise a lenient extractor scans for a valid 10‑digit NANP number (catches extensions like `…x201`, leading `0`, stray chars). **Fixable** (`!strictOK && extractable`) → writes the cleaned `+1XXXXXXXXXX` to `mobile_phone` + `last_agent_action`/`last_agent_at` (upsert by `id` — never positional, per the rule above), silently. **Unfixable** → Discord message with the business, stored number(s), caller, `lead_id`, and the three options (🗑️ delete · 🔎 enrich · 🔁 find another) for a manual decision. Same Discord webhook + Sheets cred (`zOZhujXDtoNhIPm5`, bound on **Auto‑fix Phone**) as the canary.

**Go‑live (manual):** confirm the Sheets cred is bound on **Auto‑fix Phone**, then **Activate**. (Discord node needs no cred.)

> The three webhook URLs are hardcoded fallbacks in the app, overridable via `VITE_RECORDING_UPLOAD_WEBHOOK_URL` and `VITE_NUMBER_ERROR_WEBHOOK_URL` in `.env.local` (not required). App changes go live when `main` is pushed (Vercel auto‑deploy).
