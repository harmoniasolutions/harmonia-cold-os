# Leads data integrity — incident, fix, and prevention

Source of truth for cold-outreach leads is the Google Sheet **`14sLwEEmqf6U56zdOWxo_48ozKNQI9yT1qMoyllZafvo`**, tab **`Leads`** (**50 cols** as of 2026‑07‑15, `id` in col A). Every system reads/writes it: Cold Call OS, Cold Email Sender, Email Status + Recovery, Demo Command Center, SARA, GHL.

> The column count keeps drifting (28 → 37 → 50) because several writers use `handlingExtraData: insertInNewColumn`, which silently creates columns. **Always read the live header row rather than trusting a documented list, and always address columns by header name, never by index.**

## The 2026‑06‑19 incident
An ad‑hoc enrichment run (`source=harmonia_230`, `last_agent_action=backfill_icp_from_name`) inserted a stray header row into the contact columns **D:P (`owner`→`online_booking`)** at sheet **row 273**, shifting every value in those columns **down one row** for rows 273–504 (232 leads). Result: each business showed the owner/email/phone/website of the business listed *above* it. `id`/`biz_name`/`icp` (A–C) and the operational columns (Q+) were untouched — which is why the repair was possible by keying on `id`.

## The fix (2026‑07‑09)
Realigned the D:P block up one row, keyed on `id`, verified live. Also made `id` **globally unique**: dataset‑B rows 1273–1292 had *reused* ids 279–298 (20 collisions) → renumbered to **822–841**; cleared one stray `status="status"` cell (row 15). Full pre‑fix backup: `scratchpad/leads_backup_A1_P510.json`.

## Why it happened + the rule
Root cause = a **positional block write** (paste a column block at a row position) that slipped one row. Prevention rule:

> **Never write to the Leads sheet by row position. Every write is an upsert keyed on `id`.** (native Google Sheets "update / appendOrUpdate → match on `id`").

Audit of live writers (re‑verified against n8n 2026‑07‑15): Cold Email Sender (`lead_id=id`), Salon Email Enricher v2 (by id), Email Status (by id), Lead Tag Save (by id), Lead Notes Save (by id), Number Error Investigator (by id) are id‑keyed; promoters *append* new ids. The culprit was an external/ad‑hoc script, not a standing workflow — which is why the canary below (writer‑agnostic) is the real safety net.

Two corrections to the earlier (2026‑07‑09) version of this audit, both verified live:
- **Cold Call Log (`XRGVaqWxWAZaQlVJ`) does NOT write to `Leads` at all.** It `append`s to the **`Script_Performance`** tab; its `matchingColumns: ["Row ID"]` is vestigial and ignored under `append`. Its name and description both claim otherwise. **So a caller's disposition never reaches `Leads.disposition`/`status`** — do not build anything on the assumption that it does.
- **The one write that is unavoidably positional** is the row delete in Orphan Lead (below). It is guarded by an id re‑read immediately before deleting; see that section.

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

# Cold Call OS webhooks

n8n workflows on `infoharmonia.app.n8n.cloud` backing Cold Call OS features. All three below are **ACTIVE**. App source of truth for all of them is [`../src/HarmoniaColdCallerOS.jsx`](../src/HarmoniaColdCallerOS.jsx) (webhook consts near the top).

## 1. Recording Upload — id `xmjpDFHSaYkdsWjS`
Backs the **Recording** tab (a standalone call‑MP3 library, per‑caller **Private** or **Global**). Source: [`recording-upload.workflow.js`](./recording-upload.workflow.js). Webhook **POST `/webhook/recording-upload`** (JSON `{ filename, mime, data_b64, title, notes, caller_name, visibility }`, base64 body, ~12 MB app‑side cap). Chain: Webhook → Code (normalize) → Convert to File (base64→binary) → Google Drive upload → Google Sheets append → Respond `{ status:"ok", file_id, link }`.

Storage: a **`Recordings`** tab on the **Caller Settings** sheet `1PTg69597Xf-aOsKlOFQ2nnLjQ-eOjfUfUDsIE0qKvSc` (kept OFF the Leads sheet so the integrity canary stays clean). Columns:
`id | title | caller_name | visibility | drive_file_id | drive_link | mime | uploaded_at | notes`.
The app reads that tab via `fetchRecordingsSheet()` and shows a row when `visibility==="global"` OR `caller_name===callerName`. Inline playback uses `https://drive.google.com/uc?export=download&id=<drive_file_id>` with an "Open in Drive" fallback.

**Live since 2026‑07‑15.** Drive folder **Cold Call Recordings** = `1DZl6NvaRWzXtzPQj6T-dmOxFjeiMJ8R2`; `Recordings` tab created on `1PTg…KvSc`. Note the Drive cred (`GtTcUnXNO9Gb4CZh`) is domain‑restricted and **refuses to run in an HTTP Request node** — use the native `googleDrive` node for Drive ops.

## 2. Number Error Investigator — id `0Ne5cBJWMFVdaMpa`
Fires in real time when a caller taps the **Number Error** disposition (`confirmOutcome` also POSTs the lead to this webhook). Source: [`number-error-investigator.workflow.js`](./number-error-investigator.workflow.js). Webhook **POST `/webhook/number-error-check`** (JSON `{ lead_id, biz, owner, city, state, icp, caller_name, mobile_phone, corporate_phone, home_phone, phone }`; responds immediately, fire‑and‑forget). Chain: Webhook → Code (recheck) → IF → `autofix`: Build Fix Row → Google Sheets appendOrUpdate **matched on `id`** / `orphan`: HTTP POST to `/webhook/orphan-lead`.

Logic (ports the app's `toE164`, Leads‑sheet‑safe): `strictOK` = any stored phone already dials → formatting isn't the problem. Otherwise a lenient extractor scans for a valid 10‑digit NANP number (catches extensions like `…x201`, leading `0`, stray chars). **Fixable** (`!strictOK && extractable`) → writes the cleaned `+1XXXXXXXXXX` back to the field it came from + `last_agent_action`/`last_agent_at` (upsert by `id`), silently, and the lead **stays in the queue**. **Unfixable** → handed to Orphan Lead, which moves it off the Leads sheet.

Only the un‑fixable case orphans, and that asymmetry is the point: leads were once mass‑tagged Number Error purely because the sheet stored phones human‑formatted (`(724) 728‑8004`) while Twilio needs strict E.164. A formatting typo must never cost a lead.

Two traps this node has already fallen into — do not reintroduce:
- **`cellFormat` must be `RAW`.** The default `USER_ENTERED` strips the leading `+` off the E.164 number it just wrote, re‑breaking the number it set out to fix.
- **The resourceMapper `schema` must be populated.** With `mappingMode: autoMapInputData` and an empty `schema: []`, the `id` match silently fails and every "fix" **APPENDs a duplicate lead row** instead of updating in place. (Caught in testing: one fix produced two rows with the same id — which the canary's duplicate‑id check would then have flagged daily.)

## 3. Orphan Lead — id `0VfoYrSTrPVZF1Zy`
Moves a lead **out of** the Leads OS and into the standalone **Harmonia Orphans** spreadsheet `1MX4oIg0ORi_owQn2pVCTaecd2jliwsfhWyoAMVsY0KM` (tab `Orphans`, owned by info@harmoniasolutions.ai, shared with the owner). Source: [`orphan-lead.workflow.js`](./orphan-lead.workflow.js). Webhook **POST `/webhook/orphan-lead`** (JSON `{ lead_id, reason, detail, caller_name, biz }`).

Two callers, one implementation:
- **Wrong ICP** — the app POSTs directly from `confirmOutcome` (`reason: "wrong_icp"`). The business isn't in our vertical, so it should never be dialled again.
- **Number Error** — only via the investigator's un‑fixable branch (`reason: "number_error"`).

Chain: Webhook → **Find Lead Row** (Sheets read, lookup `id`) → **Build Orphan Row** (Code) → **Copy To Orphans** (append, autoMap + `insertInNewColumn`, RAW) → **Re‑read Id Cell** (`A{row_number}`) → **Verify Row Id** → IF → delete + Discord notice / abort + Discord warning.

The Orphans tab mirrors every Leads column (so a lead can be restored by copying the row back) plus `orphan_reason | orphan_detail | orphaned_by | orphaned_at`.

Three deliberate properties, each guarding a real failure mode:
1. **Copy before delete.** A failure mid‑flow can only ever duplicate a lead, never lose one.
2. **Re‑verify the id immediately before deleting.** The delete is the *only* positional write against this sheet (§ the rule above), and this sheet has a history of positional corruption. If a concurrent write shifts rows between the lookup and the delete, the id at `A{row_number}` no longer matches and the flow **aborts and Discord‑warns instead of deleting the wrong lead**.
3. **An unmatched `lead_id` matches no row, so the chain simply stops** — nothing is appended, nothing deleted. This is the guard `Lead Tag Save`/`Lead Notes Save` lack: their `appendOrUpdate` + `autoMapInputData` on an unmatched id would **append a blank‑id junk row**, and blank ids slip past the canary's duplicate check (`if(!id) continue`). Latent, not yet realised — a full scan on 2026‑07‑15 found **0 blank ids** — but worth closing the same way, and worth adding a blank‑id check to the canary.

Verified live end‑to‑end 2026‑07‑15 on throwaway leads: Wrong ICP → row copied with all 50 columns aligned (`+` preserved on the phone) and removed from Leads, **total row count down exactly 1**; un‑fixable Number Error → orphaned; fixable Number Error → repaired and **kept**; unknown `lead_id` → no‑op. All test rows removed afterwards; both sheets back to their pre‑test state.

> Webhook URLs are hardcoded fallbacks in the app, overridable via `VITE_RECORDING_UPLOAD_WEBHOOK_URL`, `VITE_NUMBER_ERROR_WEBHOOK_URL`, `VITE_ORPHAN_WEBHOOK_URL` in `.env.local` (not required). App changes go live when `main` is pushed (Vercel auto‑deploy).

---

# Cold Call OS — Discord Reports · id `RZlWmvas32akt6E1` (ACTIVE, added 2026‑07‑15)

Reports the `history` tab back to Discord. Source: [`discord-reports.workflow.js`](./discord-reports.workflow.js). **Live and verified — no manual go‑live steps outstanding.** Three chains on one canvas; each fires from its own trigger and shares nothing (deliberately — see "two read nodes" below).

| Chain | Trigger | What it does |
|---|---|---|
| **A · Milestone** | cron `0 0,30 11-20 * * 1-5` (every :00/:30, calling hours, weekdays ≈390 execs/mo) | When **any** roster caller clears **100 dials** in an ET day: one Discord post — dials, disposition breakdown, a data‑aware deviation line, and a prefilled retro link. **Exactly once per (caller, day).** |
| **B · Memo** | cron `0 0 20 * * *` (8:00 PM ET daily) | Every caller who called today by name + count (desc), team total, disposition breakdown. |
| **C · Retro form** | `POST /form/call-retro` | The link chain A posts. Answers → **`Retro`** tab on the Caller Settings sheet `1PTg…KvSc`. |

**Storage.** Idempotency lives in the n8n **Data Table `coldcall_milestones`** (`CofaZZ6O1eAr1J1s`, personal project `bLhA9R3zS6aIvjH1`): `caller_name | day | calls | announced_at`. Retro answers live on the **Caller Settings** sheet, *not* Leads — same rule as `Recordings`, so the integrity canary stays clean. This workflow only ever **reads** the Leads doc.

## Why the code looks the way it does

Each of these is a bug that actually bit during the build. Don't undo them.

1. **`caller_name`, never `caller`.** n8n rejects the identifier `caller` (it shadows `Function.prototype.caller`) in **two** places, with two different symptoms: `{{ $json.caller }}` throws *"Cannot access caller due to security concerns"*, and a **resourceMapper key** named `caller` silently writes an **empty cell** — green execution, no error, missing data. The data‑table column, the JSON field, and the sheet header are therefore all `caller_name`. The query param stays `?caller=` (only a Code node reads it, and Code is unaffected).
2. **Claim BEFORE posting.** `Not Yet Announced` → `Claim Milestone` → `Discord`. Insert‑then‑post costs *one* missed celebration + a red execution if Discord fails. Post‑then‑insert costs **unbounded duplicates — one every 30 min** on the one day that matters. Bounded miss wins; `retryOnFail` (3× / 2s) covers transients.
3. **Never `$json` after a Data Table node.** It returns its own row shape (and Discord returns 204/empty). Anything downstream reads `$('Tally & Compose').item.json.*`. Verified: paired‑item resolution survives the Data Table hop.
4. **Two separate `Read history` nodes** — one per chain, never shared. n8n follows *all* downstream connections from whichever trigger fired, so one shared read node would make the 30‑min poll also fire the 8 PM memo, all afternoon.
5. **`matchType: 'allConditions'`** on `Not Yet Announced`. The default is `anyCondition` = "caller OR day", which would post exactly once ever and then go permanently, silently dead.
6. **ET day bucketing is explicit** (`Intl.DateTimeFormat` + `America/New_York`) inside the Code nodes, not inherited. Calls run to 19:37 ET = 23:37 UTC, so raw‑UTC slicing misfiles every evening call onto the next day. `settings.timezone` only controls *when the cron fires*; a timezone mistake then yields a correct memo at the wrong hour rather than a wrong memo.
7. **`Date.parse` + `isFinite`, not Luxon.** 24 history rows have a blank `Timestamp`; `DateTime.fromISO('')` doesn't throw — it renders the literal string `"Invalid DateTime"`, creating a phantom day bucket. This also makes the Code‑node bodies runnable in plain Node, which is what the local test suite exercises.
8. **Deviation uses percentage‑*points*, floored at ≥5 occurrences today AND ≥5 in the baseline, with today excluded from the baseline.** A naive max‑ratio scan surfaces noise every time (`not_interested` occurs once in 497 rows → "+220%!"). <3 prior days or <50 prior calls → "first tracked 100‑day, no baseline yet".
9. **Silent on 0 calls; LOUD on 0 rows read.** A ~500‑row sheet returning nothing is a read/permission failure, not a quiet day (canary idiom).
10. **`ignoreBots` must stay `false`.** It doesn't prevent junk submissions (link previews only GET; `Normalize Retro` `return []`s on a blank caller — that's the real guard) and it *does* 401 Discordbot, killing the unfurl on the very link we post. Beware: n8n reports a bot rejection as `401 + WWW-Authenticate: Basic` — a bot block cosplaying as an auth failure, which sends you hunting the wrong parameter. `curl` is classified as a bot; test with a browser UA.
11. **Dispositions are derived from the data, never hardcoded** — a new slug must not become invisible. A ≥100 day under a non‑roster name is **surfaced with a warning**, not dropped.
12. **No connect rate, no demo count — dials only** (2026‑07‑15, Javi's call). **A connect is not derivable from the current dispositions.** Only `hung_up`, `not_interested` and `followup_sent` ("send info") imply a human actually answered; `answered`/`owner`/`gatekeeper` aren't pressed reliably enough to count. The first build reported connects as `owner+answered+gatekeeper` and was simply wrong. Every readout built on it is gone — here, and from the app's header stat row and Session‑stats panel (`connectRate`/`demoRate`/`totalAns` deleted). The raw disposition breakdown stays: it's the honest version of the same question. **Don't reintroduce a connect metric until a disposition (or Twilio call duration / `dial_status`) actually marks a human answering.**

## Redeploy

`validate_workflow` → `create_workflow_from_code` (`projectId bLhA9R3zS6aIvjH1`). **The SDK file cannot carry two things — both verified the hard way:**

1. **`newCredential('…','zOZhujXDtoNhIPm5')` leaves the node with no `credentials` key.** Confirmed again 2026‑07‑15: after deploy all three Sheets nodes had the key *absent entirely* (not wrong — absent), and `create_workflow_from_code` reported `autoAssignedCredentials: []`. Whether it would still resolve at runtime is **untested here** — the creds were bound before anything executed. Bind explicitly on **`Read history (poll)`**, **`Read history (memo)`**, **`Save Retro`** via `update_workflow` → `setNodeCredential` (`googleSheetsOAuth2Api` = `zOZhujXDtoNhIPm5`) and don't rely on it. Where auto‑assign *does* fire it picks `info@hs.ai` — the wrong account — so it is worse than nothing.
2. **`settings.timezone` is ignored by the SDK** (`validate_workflow` returns `valid:true` even for `timezone:'Mars/Olympus_Mons'` — it never reads the third argument). Set it via `update_workflow` → `setWorkflowSettings {timezone:'America/New_York'}`. The instance default happens to be ET, but nothing pins it.

Then `publish_workflow` — **the form serves from `activeVersion`, so an unpublished draft change is invisible.** `/form/call-retro` 404s whenever the workflow is deactivated.

Two `update_workflow` gotchas: JSON‑Pointer array indexing is unsupported (`/filters/conditions/0/keyValue` → *"cannot descend into non-object"*; replace the whole `/filters` object), and paths containing `caller` are rejected as *"unsafe segments"* (replace the whole `/columns` object).

## Tests

`scratchpad/test.js` replays the three Code‑node bodies **byte‑identically** (via `new Function`) against the real 497 history rows, time‑shifting the dataset so a target day lands on "today" (calls run 11:00–19:37 ET, nowhere near midnight, so DST can't move a day). 25 assertions. The dataset contains a true positive and a true negative already: **Javi/2026‑07‑13 = 104 → fires; 2026‑07‑14 = 82 → silent; Nick/2026‑06‑23 = 93 → silent.**

Verified live 2026‑07‑15: jsCode byte‑identical on all 3 Code nodes post‑deploy; `rowNotExists` passes the input item through; a second identical run emits **0 items and stops** (idempotency); memo excludes prior‑day + blank‑timestamp rows and surfaces a blank caller as `(unattributed)`; a real form POST landed a correct row on the `Retro` tab; the 15:30 ET cron fired against live data and went correctly silent. All test rows removed; `coldcall_milestones` and `Retro` are back to empty.
