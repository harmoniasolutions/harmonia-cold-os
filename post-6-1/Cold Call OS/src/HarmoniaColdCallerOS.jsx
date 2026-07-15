import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { OBJECTION_PRESETS } from './config/sheetMapping';
import MissedCallCalculator from './MissedCallCalculator';

/* ─────────────────────────────────────────────
   GOOGLE SHEETS CONFIG
   These come from .env file:
     VITE_SHEET_ID=14sLwEEmqf6U56zdOWxo_48ozKNQI9yT1qMoyllZafvo
     VITE_SHEETS_API_KEY=your_api_key_here
───────────────────────────────────────────── */
const SHEET_ID    = import.meta.env.VITE_SHEET_ID;
const API_KEY     = import.meta.env.VITE_SHEETS_API_KEY;
const BASE        = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values`;
const WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL || 'https://infoharmonia.app.n8n.cloud/webhook/cold-call-log';
// Lead tags (Intel tab) — upserts the Leads row by id → cross-device tag persistence
const TAG_WEBHOOK_URL = import.meta.env.VITE_TAG_WEBHOOK_URL || 'https://infoharmonia.app.n8n.cloud/webhook/lead-tag-save';
// Shared Notes — upserts the Leads row by id (lead_notes/notes_edited_by/notes_edited_at) → truly shared across devices
const NOTES_WEBHOOK_URL = import.meta.env.VITE_NOTES_WEBHOOK_URL || 'https://infoharmonia.app.n8n.cloud/webhook/lead-notes-save';
const DISCORD_WEBHOOK_URL = 'https://infoharmonia.app.n8n.cloud/webhook/cold-call-discord';
// Recording library — uploads an MP3 (base64 JSON) → n8n → Google Drive + a Recordings tab row.
const RECORDING_UPLOAD_WEBHOOK = import.meta.env.VITE_RECORDING_UPLOAD_WEBHOOK_URL || 'https://infoharmonia.app.n8n.cloud/webhook/recording-upload';
// Number Error investigator — auto-fixes a fixable phone in Leads OS, else pings Discord to decide.
const NUMBER_ERROR_WEBHOOK = import.meta.env.VITE_NUMBER_ERROR_WEBHOOK_URL || 'https://infoharmonia.app.n8n.cloud/webhook/number-error-check';
const CALENDLY_URL = import.meta.env.VITE_CALENDLY_URL || 'https://calendly.com/harmonia-demo';

// ── Scripts now come from a SEPARATE sheet with one tab per ICP (Salon, Barbershop, …) ──
// New per-ICP-tab format: Stage | Variant | Name | Tag | Script (say this) | Caller note, with
// a title/legend preamble above the header row. Read via the Sheets API key, so this sheet must
// be shared "Anyone with the link → Viewer" like the main one. Leads/Objections/Offers still
// live on the main SHEET_ID — only the scripts feed moved here.
const SCRIPTS_SHEET_ID = import.meta.env.VITE_SCRIPTS_SHEET_ID || '1FZ9tiUMwiNIwg6GIPwiEu1popGNaVYksKnzC5XY2FQc';
const SCRIPT_ICP_TABS  = { salon: 'Salon', barbershop: 'Barbershop' };

// ── Cross-device caller settings (a SEPARATE spreadsheet, not Harmonia Leads OS) ──
// Holds one row per caller (scripts + layout) + reserved rows for team-shared
// objections (__OBJECTIONS__) and admin toggles (__ADMIN__). Read via the Sheets API
// key, written via the caller-settings-save n8n webhook (upsert by caller_name).
const CALLER_SETTINGS_SHEET_ID = import.meta.env.VITE_CALLER_SETTINGS_SHEET_ID || '1PTg69597Xf-aOsKlOFQ2nnLjQ-eOjfUfUDsIE0qKvSc';
const CALLER_SETTINGS_TAB      = 'Settings';
const CALLER_SETTINGS_WEBHOOK  = import.meta.env.VITE_CALLER_SETTINGS_WEBHOOK_URL || 'https://infoharmonia.app.n8n.cloud/webhook/caller-settings-save';
const OBJECTIONS_KEY = '__OBJECTIONS__';
const OPENERS_KEY    = '__OPENERS__';   // team-shared custom openers — any caller adds, everyone sees
const ADMIN_KEY      = '__ADMIN__';
const OFFER_KEY      = '__OFFER__';   // team-shared Offer canvas — Javi (admin) edits, everyone reads

async function fetchSheet(tab) {
  const res = await fetch(`${BASE}/${tab}?key=${API_KEY}`);
  const json = await res.json().catch(() => null);
  // Fail loudly on any non-200 (bad tab name, bad key, etc.) instead of returning [] —
  // an empty array reads as "no data" and silently hides a wrong tab name.
  if (!res.ok) {
    const apiMsg = json?.error?.message || res.statusText || "unknown error";
    const msg = `fetchSheet("${tab}") failed: HTTP ${res.status} — ${apiMsg}`;
    console.error(`[Harmonia] ${msg}`);
    throw new Error(msg);
  }
  const [headers, ...rows] = json?.values || [];
  if (!headers) return []; // 200 with a genuinely empty tab
  return rows.map(row =>
    Object.fromEntries(headers.map((h, i) => [h.trim(), row[i] ?? ""]))
  );
}

// Read one ICP tab from the scripts sheet as RAW rows (values arrays). The tab carries a
// title + legend preamble above the header, so we hand back raw rows and let parseNewScriptTab
// locate the `Stage` header. Degrades to [] (with a loud console error) so a missing/unshared
// tab shows "No scripts found" rather than white-screening the whole app.
async function fetchScriptTabRaw(tab) {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SCRIPTS_SHEET_ID}/values/${encodeURIComponent(tab)}?key=${API_KEY}`;
    const res = await fetch(url);
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      console.error(`[Harmonia] scripts tab "${tab}" read failed: HTTP ${res.status} — ${json?.error?.message || res.statusText}. Is the scripts sheet shared "Anyone with the link → Viewer"?`);
      return [];
    }
    return json?.values || [];
  } catch (e) { console.error(`[Harmonia] scripts tab "${tab}" read error`, e); return []; }
}

// Read the separate Caller Settings spreadsheet. Degrades to [] on any failure
// (e.g. the sheet isn't shared link-viewable yet) so it never blocks app load.
async function fetchSettingsSheet() {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CALLER_SETTINGS_SHEET_ID}/values/${CALLER_SETTINGS_TAB}?key=${API_KEY}`;
    const res = await fetch(url);
    const json = await res.json().catch(() => null);
    if (!res.ok) { console.warn(`[Harmonia] caller-settings read failed: HTTP ${res.status}`); return []; }
    const [headers, ...rows] = json?.values || [];
    if (!headers) return [];
    return rows.map(row => Object.fromEntries(headers.map((h, i) => [h.trim(), row[i] ?? ""])));
  } catch (e) { console.warn('[Harmonia] caller-settings read error', e); return []; }
}

// Read the Recordings tab (call-library) from the same Caller Settings spreadsheet.
// Degrades to [] on any failure (e.g. the tab doesn't exist yet) so it never blocks app load.
async function fetchRecordingsSheet() {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CALLER_SETTINGS_SHEET_ID}/values/Recordings?key=${API_KEY}`;
    const res = await fetch(url);
    const json = await res.json().catch(() => null);
    if (!res.ok) { console.warn(`[Harmonia] recordings read failed: HTTP ${res.status}`); return []; }
    const [headers, ...rows] = json?.values || [];
    if (!headers) return [];
    return rows.map(row => Object.fromEntries(headers.map((h, i) => [h.trim(), row[i] ?? ""])));
  } catch (e) { console.warn('[Harmonia] recordings read error', e); return []; }
}

// Read the `call_recordings` tab (row_id → Twilio recording + Drive transcript, written by the
// recording_done / transcribe_call workflows). Kept OFF the append-only `history` tab so the
// call log is never upserted into. Degrades to [] if the tab doesn't exist yet.
async function fetchCallRecordingsSheet() {
  try {
    const res = await fetch(`${BASE}/call_recordings?key=${API_KEY}`);
    const json = await res.json().catch(() => null);
    if (!res.ok) { console.warn(`[Harmonia] call_recordings read failed: HTTP ${res.status}`); return []; }
    const [headers, ...rows] = json?.values || [];
    if (!headers) return [];
    return rows.map(row => Object.fromEntries(headers.map((h, i) => [h.trim(), row[i] ?? ""])));
  } catch (e) { console.warn('[Harmonia] call_recordings read error', e); return []; }
}

/* ─────────────────────────────────────────────
   DESIGN TOKENS
───────────────────────────────────────────── */
// Harmonia brand palette — white glass canvas, deep-ink/slate text, sky reserved for payoff.
const C = {
  bg:       "#FFFFFF",
  surface:  "#F6F9FB",   // faint cool glass panel (was solid grey)
  border:   "#E6ECF0",   // hairline rule
  borderMd: "#D4DEE5",
  t1:       "#1C3D52",   // deep ink — headlines & high-contrast text
  t2:       "#6E8597",   // muted slate — quiet supporting voice
  t3:       "#94A7B5",   // light slate — captions / sub-labels
  accent:   "#4A9EED",   // sky blue — payoff only (wordmark, CTA, active tab, links, live dot)
  skyTint:  "#B8DAF7",   // light sky tint — ring-signature strokes (kept: RingMark reads this)
  green:    "#2E9E6B",
  amber:    "#C98A2E",
  red:      "#D1533F",
  teal:     "#3E8FC4",
  purple:   "#7A6AB0",
};
const F  = "'IBM Plex Sans', -apple-system, sans-serif";
const FM = "'IBM Plex Mono', 'SF Mono', monospace";

// Ordered tab-ribbon ids — kept in sync with tabDefs at the ribbon. Used by the
// active-tab guard so a hidden tab can never remain selected.
const TAB_IDS = ["intel","script","offer","openers","objections","voicemail","recording","roi","booking","history"];

// Raw Leads-tab icp values → canonical group used by the Scripts/Objections tabs + filter buttons.
// The raw icp is kept on the lead so the card shows the specific sub-type; the group is for lookup/filtering.
const ICP_GROUP = {
  hair_salon:'salon', hair_and_spa:'salon', nail_salon:'salon', salon:'salon', hair:'salon',
  barbershop:'barbershop', barber:'barbershop',
  medspa:'beauty_spa', day_spa:'beauty_spa', lash_brow:'beauty_spa', beauty_spa:'beauty_spa',
  hvac:'hvac',
};
// Junk/off-target icps (pet_groomer, non_salon, mlm_distributor, corporate_hq) fall through as
// themselves → no script set, visible only under "All".
const icpGroup = (raw) => {
  const k = (raw || '').toLowerCase().trim();
  return ICP_GROUP[k] || k;
};
// Active ICPs — only hair salon & barbershop. Any lead whose group is not one of these is
// hidden from the queue/filters entirely (see VISIBLE_GROUPS / activeLeads).
const FILTER_GROUPS = ["all", "salon", "barbershop"];
const GROUP_LABEL   = { salon:"Hair Salon", barbershop:"Barbershop" };
// Caller-applied lead tags (Intel tab). "E" opens a free-text field.
const LEAD_TAGS = [
  { code:"A", label:"No Online Booking" },
  { code:"B", label:"Owner Operator" },
  { code:"C", label:"No Receptionist" },
  { code:"D", label:"Receptionist" },
  { code:"E", label:"Other" },
];
// Groups that show anywhere in the app. Everything else (spa/nail/medspa/pet/junk) is filtered out.
const VISIBLE_GROUPS = new Set(["salon", "barbershop"]);

// Caller-facing label per raw icp — collapses to just "Hair Salon" / "Barbershop".
const ICP_LABEL  = {
  salon:"Hair Salon", hair_salon:"Hair Salon", hair_and_spa:"Hair Salon",
  nail_salon:"Hair Salon", hair:"Hair Salon",
  barbershop:"Barbershop", barber:"Barbershop",
};
// Openers benched for this week's test — DISPLAY filter only (rows stay in the Scripts sheet as the
// iteration bank). Edit this one line to change which openers are live. Applies to the opener list only;
// downstream phases (bridge/discovery/pitch/close) and objections are unaffected.
// Current Scripts-sheet openers: 1=Email Pretense  2=Honest Cold Call  3=Busy Chair Pattern
// (variants 4-8 are legacy/retired — no longer rows in the sheet).
const ACTIVE_OPENERS = ["1", "2"];

// "Emailed?" status shown in Intel — fed from the Leads tab `emailed` column.
// Use a checkbox (TRUE/FALSE), "yes"/"no", or a date — any non-empty value that isn't an
// explicit no/false/0 counts as emailed. Lets a date double as "when".
const EMAILED_NEGATIVE = new Set(["", "false", "no", "n", "0", "not emailed", "pending", "none", "-", "—"]);
const EMAILED_GENERIC  = new Set(["true", "yes", "y", "sent", "1", "✓", "emailed", "done"]);
function leadEmailed(lead) {
  let raw = (lead?.emailed ?? "").toString().trim();
  if (raw.startsWith("=")) raw = raw.slice(1).trim();
  const sent = raw !== "" && !EMAILED_NEGATIVE.has(raw.toLowerCase());
  // If the value carries extra info (e.g. a date) rather than a generic yes, surface it.
  const detail = sent && !EMAILED_GENERIC.has(raw.toLowerCase()) ? raw : "";
  return { sent, detail };
}

// Owner name — the Leads sheet only has a single full-name `owner` column, so split it
// into first/last here (skip leading titles like Dr./Mr. and trailing suffixes like Jr./III).
const NAME_TITLES   = new Set(["dr", "mr", "mrs", "ms", "miss", "mx", "prof"]);
const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "md", "dds", "phd", "esq"]);
function parseOwnerName(owner) {
  let raw = (owner ?? "").toString().trim();
  if (raw.startsWith("=")) raw = raw.slice(1).trim();
  let parts = raw.replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length > 1 && NAME_TITLES.has(parts[0].toLowerCase().replace(/\./g, ""))) parts = parts.slice(1);
  if (parts.length > 1 && NAME_SUFFIXES.has(parts[parts.length - 1].toLowerCase().replace(/[.,]/g, ""))) parts = parts.slice(0, -1);
  if (!parts.length) return { first: "", last: "", full: "" };
  const first = parts[0];
  const last = parts.length > 1 ? parts.slice(1).join(" ") : "";
  return { first, last, full: [first, last].filter(Boolean).join(" ") };
}

const SCORE_DOT  = { A:C.green, B:C.amber, C:C.red };
const LINE_COLOR = { opener:C.t1, bridge:C.purple, discovery:C.teal, pitch:C.amber, close:C.green };

// Pitch retired from the live layout (see RETIRED_PHASES). Discovery keeps the id "discovery"
// (used as branchData key / n8n payload) but shows the caller-facing label "Cost Frame".
const DEFAULT_PHASES = [
  { id: "opener",    label: "Opener",     color: "#EF4444", isDefault: true },
  { id: "bridge",    label: "Bridge",     color: "#a855f7", isDefault: true },
  { id: "discovery", label: "Cost Frame", color: "#F59E0B", isDefault: true },
  { id: "close",     label: "Close",      color: "#10B981", isDefault: true },
];
// Phase ids dropped from the layout — filtered out of any persisted phase order on load.
const RETIRED_PHASES = new Set(["pitch"]);
const COLOR_PALETTE = ["#EF4444","#F59E0B","#3B82F6","#10B981","#8B5CF6","#EC4899","#14B8A6","#F97316","#6366F1","#84CC16"];

// ── Bridge phase data ──
// BUBBLE_STYLES — rendering config only, not content data
const BUBBLE_STYLES = {
  green:  { bg:"#f0fdf4", border:"#86efac", text:"#166534", dot:"#22c55e", label:"They're open — deliver this" },
  yellow: { bg:"#fefce8", border:"#fde047", text:"#854d0e", dot:"#eab308", label:"Pivot — redirect to Cost Frame" },
  red:    { bg:"#fef2f2", border:"#fca5a5", text:"#991b1b", dot:"#ef4444", label:"Handle — reframe and redirect" },
};

const OUTCOMES = {
  demo_booked:    { label:"Demo booked",    color:C.green,   short:"Demo", ghl:"Meeting Booked",      discord:"#meetings-booked",  needsEmail:true,  needsBooking:true  },
  loom_sent:      { label:"Send Loom",      color:C.teal,    short:"Loom", ghl:"Loom Outreach",       discord:"#loom-queue",       needsEmail:true,  needsLoom:true     },
  callback:       { label:"Callback later", color:C.amber,   short:"CB",   ghl:"Follow-Up Scheduled", discord:"#follow-ups",       needsDateTime:true                  },
  followup_sent:  { label:"Send info",      color:C.purple,  short:"Info", ghl:"Nurture",             discord:null,                needsEmail:true                     },
  answered:       { label:"Answered",       color:C.t2,      short:"Ans",  ghl:null,                  discord:null                                                    },
  voicemail:      { label:"Left voicemail", color:C.amber,   short:"VM",   ghl:null,                  discord:null                                                    },
  gatekeeper:     { label:"Gatekeeper",     color:C.t2,      short:"GK",   ghl:null,                  discord:null,                needsGatekeeper:true                },
  robo_responder: { label:"Robo responder", color:C.teal,    short:"Robo", ghl:null,                  discord:null                                                    },
  owner:          { label:"Owner",          color:C.t2,      short:"Own",  ghl:null,                  discord:null                                                    },
  number_error:   { label:"Number Error",   color:C.amber,   short:"Err",  ghl:null,                  discord:null                                                    },
  no_answer:      { label:"No Answer",      color:C.red,     short:"N/A",  ghl:null,                  discord:null                                                    },
  not_interested: { label:"Not interested", color:C.t3,      short:"N/I",  ghl:"Closed Lost",         discord:null                                                    },
  hung_up:        { label:"Hung up",        color:C.red,     short:"Hung", ghl:null,                  discord:null                                                    },
  wrong_icp:      { label:"Wrong ICP",      color:C.t3,      short:"ICP",  ghl:"Closed Lost",         discord:null                                                    },
  not_qualified:  { label:"Not qualified",  color:C.t3,      short:"N/Q",  ghl:"Closed Lost",         discord:null                                                    },
  dnc:            { label:"Do not call",    color:C.red,     short:"DNC",  ghl:"Do Not Contact",      discord:null                                                    },
};

// ── Offer color palette — cycles through for each offer loaded from sheet ──
const OFFER_COLORS = ["#F97316","#10B981","#3B82F6","#8B5CF6","#EC4899","#F59E0B","#14B8A6","#EF4444"];

const OUTCOME_ROWS = [
  ["demo_booked", "followup_sent", "no_answer"],
  ["voicemail", "gatekeeper", "robo_responder"],
  ["not_qualified", "dnc", "number_error"],
  ["not_interested", "hung_up", "wrong_icp"],
];

// Caller roster — seeds the leaderboard so every caller shows even with 0 activity.
const CALLER_ROSTER = ["Javi", "Julian", "Owen", "Joel", "Nick", "Blake", "RJ", "Reese"];
const CALLER_PHONES = { Javi:"+16102153863", Julian:"+16092771636", Owen:"+16094120214", Joel:"+16096743986", Nick:"+18563943453", Blake:"+12019574476", RJ:"+17573776621", Reese:"+12026417341" };
// Leaderboard temporarily hidden (per request) — flip to true to restore the button + view.
const SHOW_LEADERBOARD = false;
// Callers excluded from the leaderboard ranking (e.g. admins/owners who aren't cold-calling).
const LEADERBOARD_EXCLUDE = new Set(["Javi"]);
// Remember the last-selected caller so their saved scripts reload on reopen.
const CALLER_LS_KEY = "harmonia-current-caller";
const storedCaller = (() => { try { const v = localStorage.getItem(CALLER_LS_KEY) || ""; return CALLER_ROSTER.includes(v) ? v : ""; } catch { return ""; } })();
// ── Login / auth ── server-checked password via the caller-auth webhook. A valid
// session (this device, < TTL) skips the login screen. Passwords never live here.
const AUTH_SESSION_KEY    = "harmonia-auth-session";
const SESSION_TTL_MS      = 30 * 24 * 60 * 60 * 1000; // stay logged in 30 days per device
const CALLER_AUTH_WEBHOOK = import.meta.env.VITE_CALLER_AUTH_WEBHOOK_URL || 'https://infoharmonia.app.n8n.cloud/webhook/caller-auth';
const storedSession = (() => {
  try {
    const s = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || "null");
    if (s && s.caller && CALLER_ROSTER.includes(s.caller) && (Date.now() - (s.ts || 0) < SESSION_TTL_MS)) return s.caller;
  } catch {}
  return "";
})();

const pad  = (n) => String(n).padStart(2,"0");
const fmt  = (s) => `${pad(Math.floor(s/60))}:${pad(s%60)}`;
const fmtH = (s) => {
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60;
  return h>0?`${pad(h)}:${pad(m)}:${pad(sc)}`:`${pad(m)}:${pad(sc)}`;
};
// NaN-safe timestamp → epoch ms. Blank/garbage cells on the "history" tab are common, and
// new Date("") is Invalid Date → subtraction yields NaN, which corrupts newest-first sorts.
const parseTs = (s) => { const t = Date.parse(s || ""); return isNaN(t) ? 0 : t; };

// One unique id per call attempt. It rides click_to_call → twiml_bridge → recording_done
// (Twilio's recordingStatusCallback) AND is written onto this call's `history` row, so the
// recording/transcript that lands seconds later can be joined back to this exact call.
// Must never be blank: a blank id would collide with every other blank one.
const newRowId = (leadId) =>
  `${leadId || "lead"}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ── Call-recording playback + script decoding (used by the Call History view) ──
// Raw Twilio recording URLs need HTTP basic-auth, so they won't play in a bare <audio> tag.
// If an audio-proxy webhook is configured (VITE_CALL_AUDIO_PROXY), route Twilio media through
// it; Drive / other already-public URLs are returned unchanged.
const CALL_AUDIO_PROXY = import.meta.env.VITE_CALL_AUDIO_PROXY || "";
function playableAudioUrl(url) {
  const u = (url || "").trim();
  if (!u) return "";
  // Twilio *and* SignalWire recording URLs are ".../Recordings/<id>" and need HTTP basic-auth,
  // so they won't play in a bare <audio>. Route them through the audio-proxy webhook when one is
  // configured; already-public URLs (Google Drive, googleusercontent, direct .mp3) pass through.
  const isAuthGated = /\/Recordings\//i.test(u) && !/drive\.google|googleusercontent/i.test(u);
  if (isAuthGated && CALL_AUDIO_PROXY) return `${CALL_AUDIO_PROXY}${CALL_AUDIO_PROXY.includes("?")?"&":"?"}url=${encodeURIComponent(u)}`;
  return u; // Drive / other public URL (or best-effort raw provider URL when no proxy is configured)
}

// Turn the dense "Script Used" blob the logger writes (e.g.
// "hair_salon-A: Referral opener · sel{close=2, bridge=1} · ab{bridge}") into readable parts.
function decodeScriptVariant(variant) {
  const raw = (variant || "").trim();
  if (!raw) return { title: "—", parts: [], raw: "" };
  if (/^blank canvas/i.test(raw)) {
    const after = raw.replace(/^blank canvas:?\s*/i, "").trim();
    return { title: "Blank canvas", parts: (after && !/^\(empty\)$/i.test(after)) ? [after.slice(0,120)] : [], raw };
  }
  const parts = [];
  const head = raw.split(" · ")[0] || raw;
  let title = head;
  const m = head.match(/^(.*?)-([A-Za-z0-9]+):\s*(.*)$/); // "<icp>-<Variant>: <opener name>"
  if (m) { title = `Script ${m[2]}`; if (m[3]) parts.push(`opener “${m[3]}”`); }
  const sel = raw.match(/sel\{([^}]*)\}/);                // sel{close=2, bridge=1} → "close v2"
  if (sel && sel[1].trim()) {
    sel[1].split(",").map(s=>s.trim()).filter(Boolean).forEach(pair => {
      const [k,v] = pair.split("=").map(x=>(x||"").trim());
      if (k) parts.push(`${k} v${v || "?"}`);
    });
  }
  const ab = raw.match(/ab\{([^}]*)\}/);                  // ab{bridge} → "bridge → B"
  if (ab && ab[1].trim()) ab[1].split(",").map(s=>s.trim()).filter(Boolean).forEach(k => parts.push(`${k} → B`));
  return { title, parts, raw };
}
function fillPlaceholders(text, context) {
  if (!text) return "";
  const map = context || {};
  const parts = [];
  const regex = /\{(\w+)\}/gi;
  let last = 0, match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const key = match[1].toLowerCase();
    const val = map[key];
    if (val) {
      parts.push(val);
    } else {
      parts.push(<span key={match.index} style={{background:"#FFF3CD",color:"#856404",
        padding:"0 3px",borderRadius:3,fontSize:"inherit"}}>{match[0]}</span>);
    }
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}

function buildPlaceholderContext(lead, callerName) {
  return {
    owner:      (lead?.owner||"").split(" ")[0],
    city:       lead?.city||"",
    leak:       lead?.leak||"",
    chairs:     lead?.chairs||"your",
    biz:        lead?.biz||"",
    caller:     callerName||"",
  };
}

// Plain-text interpolation for textareas (no JSX)
function fillPlaceholdersPlain(text, context) {
  if (!text) return "";
  const map = context || {};
  return text.replace(/\{(\w+)\}/gi, (match, key) => {
    const val = map[key.toLowerCase()];
    return val || match;
  });
}

// Convert // delimiters to newlines for display, preserve through edits
function formatScriptLines(text) {
  if (!text) return "";
  return text.replace(/\s*\/\/\s*/g, "\n");
}

// Convert newlines back to // for storage
function unformatScriptLines(text) {
  if (!text) return "";
  return text.replace(/\n/g, " // ");
}

const PAIN_WEIGHTS = [3, 3, 2, 2];
function calcPainScore(responses) {
  let score = 0;
  PAIN_WEIGHTS.forEach((w, i) => { if (responses[i] === "pain") score += w; });
  return score;
}
function painColor(score, colors) {
  if (score >= 7) return { color: colors.red, fontWeight: 700 };
  if (score >= 4) return { color: colors.amber, fontWeight: 500 };
  return { color: colors.t3, fontWeight: 400 };
}

const REVIEW_PHONE_KEYWORDS = /phone|call|answer|voicemail|reach|wait/i;

function getRecommendedOpeners(lead) {
  const recs = [];
  const reviews = lead?.google_reviews || [];
  if (reviews.some(r => REVIEW_PHONE_KEYWORDS.test(r.text || ""))) {
    recs.push({ openerId: "6", reason: "Has a phone-related review" });
  }
  if (lead?.disposition === "voicemail" || lead?.disposition === "no_answer" || lead?.status === "called") {
    recs.push({ openerId: "3", reason: "Called before — no answer" });
    if (!recs.find(r => r.openerId === "1")) {
      recs.push({ openerId: "1", reason: "Follow-up pretense fits prior attempt" });
    }
  }
  if (recs.length === 0) {
    recs.push({ openerId: "2", reason: "Cold lead — pattern interrupt" });
    recs.push({ openerId: "5", reason: "Cold lead — founder energy" });
  }
  return recs;
}

function defaultCallbackDateTime() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return { date: d.toISOString().split("T")[0], time: "14:00" };
}

function StarRow({ stars }) {
  const n = parseInt(stars) || 0;
  return (
    <span style={{ display:"inline-flex", gap:1 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ fontSize:10, color: i<=n ? C.amber : C.border }}>★</span>
      ))}
    </span>
  );
}

/* ─────────────────────────────────────────────
   THE SIGNATURE — concentric rings, the logic of a voice travelling
   outward from a single point. Thin etched strokes only (never filled),
   optional 01–03 index marks and a belief phrase set at 45°, in the spirit
   of a prototype drawing. Used tiny as the wordmark glyph and large + faint
   as the watermark in the empty centre.
───────────────────────────────────────────── */
function RingMark({ size=320, stroke=C.skyTint, index=true, phrase="every call answered",
                    dim=1, uid="sig", outer=true, dot=true }) {
  const rings = [15, 28, 41];
  const pid = `ringpath-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none"
      style={{ display:"block", opacity:dim, overflow:"visible" }} aria-hidden="true">
      {outer && <circle cx="50" cy="50" r="48" stroke={stroke} strokeWidth="0.4" opacity="0.45"/>}
      {rings.map((r,i)=>(
        <circle key={r} cx="50" cy="50" r={r} stroke={stroke} strokeWidth="0.7" opacity={0.9 - i*0.14}/>
      ))}
      {dot && <circle cx="50" cy="50" r="1.5" fill={stroke} opacity="0.9"/>}
      {index && rings.map((r,i)=>(
        <text key={"ix"+r} x="50" y={50 - r - 1.4} textAnchor="middle"
          fontFamily={FM} fontSize="3.3" letterSpacing="0.05em" fill={stroke} opacity="0.8">
          {"0"+(i+1)}
        </text>
      ))}
      {phrase && (
        <>
          <path id={pid} d="M50 9 A41 41 0 1 1 49.99 9"/>
          <text fontFamily={FM} fontSize="3.2" letterSpacing="0.14em" fill={stroke} opacity="0.6">
            <textPath href={"#"+pid} startOffset="12.5%">{phrase}</textPath>
          </text>
        </>
      )}
    </svg>
  );
}

// Shared style for the signature toggle pills (active = quiet ink, never sky).
const sigPillStyle = (active, disabled) => ({
  padding:"4px 11px", borderRadius:100, fontSize:11, fontWeight:500, fontFamily:F,
  border:`0.75px solid ${active?C.t1:C.border}`,
  background: active?`${C.t1}0A`:"transparent",
  color: active?C.t1:C.t2,
  cursor: disabled?"default":"pointer", opacity: disabled?0.4:1, transition:"all 0.15s",
  display:"inline-flex", alignItems:"center", justifyContent:"center",
});

/* ─────────────────────────────────────────────
   PHONE NORMALIZATION
───────────────────────────────────────────── */
// Normalize a raw phone to strict NANP E.164 (+1XXXXXXXXXX) — the only format Twilio's
// <Dial> reliably connects. Sheet numbers arrive human-formatted ("(724) 728-8004",
// "215-469-0896"), which Twilio rejects, so every dial must pass through here first.
// Returns "" when the input can't be made callable (too few digits, junk, bad area code).
function toE164(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  const d = s.replace(/\D/g, "");
  let core = "";
  if (d.length === 11 && d[0] === "1") core = d.slice(1);
  else if (d.length === 10) core = d;
  else if (s.startsWith("+") && d.length >= 11 && d.length <= 15) return "+" + d; // rare intl passthrough
  else return "";
  // NANP sanity: area-code and exchange first digit must be 2-9.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(core)) return "";
  return "+1" + core;
}

/* ─────────────────────────────────────────────
   DATA PARSERS
───────────────────────────────────────────── */
function parseLeads(rows) {
  return rows
    // Sheet header migrated: biz→biz_name, phone→corporate_phone/mobile_phone, intel_comments→intel,
    // score→reviews_rating. Map current headers onto the names the render/intel path reads.
    .filter(r => (r.biz_name || r.biz || "").trim() !== "")
    .map((r, i) => {
      const phone = r.mobile_phone || r.corporate_phone || r.phone || "";
      return {
      ...r,
      biz:           r.biz_name ?? r.biz ?? "",
      phone,
      intel_comments:r.intel ?? r.intel_comments ?? "",
      score:         r.reviews_rating ?? r.score ?? "",   // numeric rating; SCORE_DOT falls back to neutral
      id:            r.id || phone || `lead-${i}`,
      pain:          parseInt(r.pain) || 0,
      chairs:        r.chairs ? parseInt(r.chairs) : null,
      reviews_count: parseInt(r.reviews_count) || 0,
      status:        (!r.status || r.status === "new") ? "queued" : r.status,
      competitor:    r.competitor || "",
      pain_signals:  safeJSON(r.pain_signals, []),
      google_reviews:safeJSON(r.google_reviews, []),
      call_count:         parseInt(r.call_count) || 0,
      last_call_timestamp: r.last_call_timestamp || "",
      disposition:         r.disposition || "",
      caller_tag:         r.caller_tag || "",
      caller_tag_other:   r.caller_tag_other || "",
      tag_by:             r.tag_by || "",
      tag_at:             r.tag_at || "",
      };
    });
}

function parseScripts(rows) {
  const out = {};
  rows.forEach(r => {
    const icp = r.icp, id = r.opener_id || r.variant;
    const { name, tag, type, text } = r;
    if (!icp || !id) return;
    // Bubble/branch rows belong to parseBubblesAndBranches; skip here so they don't create phantom variants.
    const t = (type || '').toLowerCase().trim();
    if (t === 'bridge_bubble' || t === 'close_bubble' || t === 'discovery_branch') return;
    if (!out[icp]) out[icp] = {};
    if (!out[icp][id]) out[icp][id] = { name, tag, lines: [] };
    if (type && text) out[icp][id].lines.push({ type, text, name, tag });
  });
  return out;
}

// Parse one ICP tab from the new scripts sheet (Stage | Variant | Name | Tag | Script | Caller note)
// into the OS's existing shapes. Stage → phase (Cost Frame → internal id `discovery`). Numbered
// variants are stage lines that feed the per-phase variant dropdown; Variant "-" rows are colored
// replies (bridge/close/discovery bubbles). The old discovery branch-tree model is retired — Cost
// Frame is now sequential numbered steps + flat replies. Returns { scripts, bubbles }.
// The OS always keeps the fixed Opener → Bridge → Cost Frame → Close formula. Map a Stage cell to
// one of those 4 phases by NAME match (tolerant of spelling/spacing), so a row lands in the right
// stage no matter how it's written or where it sits on the sheet.
const STAGE_TO_PHASE = { opener: 'opener', bridge: 'bridge', 'cost frame': 'discovery', close: 'close' };
function stageToPhase(stage) {
  const s = (stage || '').toString().trim().toLowerCase();
  if (!s) return null;
  if (s.includes('open'))   return 'opener';
  if (s.includes('bridge')) return 'bridge';
  if (s.includes('cost') || s.includes('discov')) return 'discovery';
  if (s.includes('close'))  return 'close';
  return STAGE_TO_PHASE[s] || null;
}
// Header row = the first row containing a cell exactly "stage" (anywhere in the row).
function findHeaderRow(rows) {
  return Array.isArray(rows) ? rows.findIndex(r => Array.isArray(r) && r.some(c => (c || '').toString().trim().toLowerCase() === 'stage')) : -1;
}
// Resolve each logical column by its HEADER NAME so the columns may sit in any order/position on the
// sheet; fall back to the conventional index when a header isn't found.
function resolveCols(headerRow) {
  const H = (headerRow || []).map(c => (c || '').toString().trim().toLowerCase());
  const find = (pred, dflt) => { const i = H.findIndex(pred); return i >= 0 ? i : dflt; };
  return {
    stage:   find(h => h === 'stage', 0),
    variant: find(h => h === 'variant' || h === 'type', -1), // -1 = no explicit Variant column
    name:    find(h => h === 'element' || h === 'name', 1),
    ab:      find(h => h.replace(/\s/g, '') === 'a/b' || h === 'ab', -1), // -1 = no A/B column
    tag:     find(h => h === 'tag', 3),
    script:  find(h => h.startsWith('script') || h === 'say this', 4),
    note:    find(h => h.includes('note'), 5),
  };
}
const REPLY_VARIANT  = new Set(['', '-', '–', '—']); // hyphen / en-dash / em-dash all mean "a reply, not a stage line"
function parseNewScriptTab(rows) {
  const scripts = {};                                  // variant -> { name, tag, lines:[] }
  const bubbles = { bridge: [], close: [], discovery: [] };
  if (!Array.isArray(rows)) return { scripts, bubbles };
  // Skip the title/legend preamble: data starts after the header row.
  const h = findHeaderRow(rows);
  for (let i = h + 1; i < rows.length; i++) {          // h = -1 when no header → starts at 0
    const r = rows[i]; if (!Array.isArray(r)) continue;
    const stage   = (r[0] || '').toString().trim();
    const variant = (r[1] || '').toString().trim();
    const name    = (r[2] || '').toString().trim();
    const tag     = (r[3] || '').toString().trim().toLowerCase();
    const text    = (r[4] || '').toString();
    const note    = (r[5] || '').toString();
    if (!stage) continue;
    const phase = stageToPhase(stage);
    if (!phase) continue;
    if (REPLY_VARIANT.has(variant)) {
      if (bubbles[phase]) bubbles[phase].push({ label: name, type: tag || 'yellow', response: text, note, showScript: tag === 'green' });
    } else {
      if (!scripts[variant]) scripts[variant] = { name, tag, lines: [] };
      scripts[variant].lines.push({ type: phase, text, name, tag, note });
    }
  }
  return { scripts, bubbles };
}

// ── A/B-format scripts sheet (richer layout) ──
// Columns: Stage | Element | A/B | Tag | Script (say this) | Caller note
//  • Element name uses a "Group: subpart" convention — rows sharing a prefix before ":" stitch
//    into one multi-part frame (e.g. "Simple frame: help line" + "Simple frame: SARA line").
//  • A/B: A = current line, B = the variant to test (shown on a toggle). Paired per (group, subpart).
//  • A row is a reply/branch (shown as a colored chip) when its name starts "Reply:" OR its A/B cell
//    is blank (the legend's "Blank A/B = single branch/reply line"). Everything else is a script line.
// Returns per-phase { groups:[{name,tag,pieces:[{sub,a:{text,note},b}]}], replies:[{name,tag,a,b}] }.
function isAbFormatRows(rows) {
  const h = findHeaderRow(rows);
  if (h < 0) return false;
  const H = rows[h].map(c => (c || '').toString().trim().toLowerCase());
  return H.some(x => x === 'element' || x.replace(/\s/g, '') === 'a/b' || x === 'variant');
}
function parseAbScriptTab(rows) {
  const phases = {
    opener:    { groups: [], replies: [], sections: [] },
    bridge:    { groups: [], replies: [], sections: [] },
    discovery: { groups: [], replies: [], sections: [] },
    close:     { groups: [], replies: [], sections: [] },
  };
  if (!Array.isArray(rows)) return phases;
  const h = findHeaderRow(rows);
  const col = resolveCols(h >= 0 ? rows[h] : null);     // columns matched by header name, any position
  const useVariant = col.variant >= 0;                  // explicit Variant column drives the new rule
  const addReply = (phase, title, tag, ab, text, note) => {
    const reps = phases[phase].replies;
    const target = ab === 'B' ? reps.find(x => x._raw === title && !x.b) : null;       // B pairs to its A by title
    if (target) target.b = { text, note };
    else reps.push({ name: title.replace(/^reply:\s*/i, ''), tag: tag || 'yellow', a: { text, note }, b: null, _raw: title });
  };
  const addPiece = (phase, key, frameName, pname, sub, tag, ab, text, note) => {
    let g = phases[phase].groups.find(x => x.key === key);
    if (!g) { g = { key, name: frameName, tag, pieces: [] }; phases[phase].groups.push(g); }
    const target = ab === 'B' ? g.pieces.find(p => p._pname === pname && !p.b) : null;  // B pairs to its A by name
    if (target) target.b = { text, note };
    else g.pieces.push({ sub, _pname: pname, a: { text, note }, b: null });
  };
  // Cost Frame sections: group by Name (the section: Volume / Value / The math / The inversion); the
  // Variant value picks a variant WITHIN that section (its own dropdown). Optional A/B per variant.
  const addSectionVariant = (phase, secName, id, tag, ab, text, note) => {
    let sec = phases[phase].sections.find(s => s.name === secName);
    if (!sec) { sec = { name: secName, tag, variants: [] }; phases[phase].sections.push(sec); }
    let vr = sec.variants.find(x => x.id === id);
    if (!vr) { vr = { id, a: null, b: null }; sec.variants.push(vr); }
    if (ab === 'B') vr.b = { text, note }; else vr.a = { text, note };
  };
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i]; if (!Array.isArray(r)) continue;
    const stage = (r[col.stage] || '').toString().trim(); if (!stage) continue;
    const phase = stageToPhase(stage); if (!phase) continue;   // slot into the fixed 4-stage formula
    const rawName = (r[col.name] || '').toString().trim();
    const ab   = col.ab >= 0 ? (r[col.ab] || '').toString().trim().toUpperCase() : '';
    const tag  = (r[col.tag]  || '').toString().trim().toLowerCase();
    const text = (r[col.script] || '').toString();
    const note = (r[col.note]   || '').toString();
    if (useVariant) {
      // NEW RULE: Variant cell = a number → a dropdown variant (Name labels it); = "Bubble" → a reply chip (Name titles it).
      const v = (r[col.variant] || '').toString().trim();
      if (!v) continue;
      if (v.toLowerCase() === 'bubble' || REPLY_VARIANT.has(v)) {
        addReply(phase, rawName, tag, ab, text, note);
      } else if (phase === 'discovery') {
        // Cost Frame: Name = the section, Variant = which variant of that section (its own dropdown).
        addSectionVariant(phase, rawName, v, tag, ab, text, note);
      } else {
        addPiece(phase, v, rawName || `Variant ${v}`, rawName, rawName, tag, ab, text, note);
      }
    } else {
      // Element/A·B sheet: reply when name starts "Reply:" or A/B blank; frames grouped by "Group: subpart" prefix.
      const isReply = /^reply:/i.test(rawName) || ab === '';
      if (isReply) { addReply(phase, rawName, tag, ab, text, note); continue; }
      const groupName = rawName.includes(':') ? rawName.split(':')[0].trim() : rawName;
      const sub       = rawName.includes(':') ? rawName.split(':').slice(1).join(':').trim() : '';
      addPiece(phase, groupName, groupName, sub, sub, tag, ab, text, note);
    }
  }
  return phases;
}

function parseObjections(rows) {
  const out = {};
  rows.forEach(r => {
    const { icp, question, answer } = r;
    if (!icp || !question) return;
    if (!out[icp]) out[icp] = [];
    out[icp].push({ q: question, a: answer });
  });
  return out;
}

// Offers tab: columns = id, label, text (per ICP coming later, for now global)
function parseOffers(rows) {
  return rows.filter(r => r.id && r.label).map((r, i) => ({
    id: r.id.trim(),
    label: r.label.trim(),
    text: r.text || "",
    color: OFFER_COLORS[i % OFFER_COLORS.length],
  }));
}

// Unified parser for "bubbles & branches" tab (same columns as Scripts: icp, variant, name, tag, type, text)
// type values:
//   bridge_bubble  — tag: green_show (reveals script), green, yellow, red
//   close_bubble   — tag: green, yellow, red
//   discovery      — root question node (name=variant label, text=root question). tag is just a
//                    human label (ROOT/Recommended/Alternative/Secondary), NOT a structural marker.
//   discovery_branch — tag: green/yellow/red → branch node (name=label, text=response)
// Returns { bubbles: { [icp]: { bridge:[], close:[] } }, branches: { [icp]: { [variant]: [...] } } }
//
// Grouping rules (kept tolerant so a messy sheet still renders in harmony):
//  • Any `discovery` row opens a variant root — we do NOT require tag==='ROOT'. The sheet tags its
//    roots Recommended/Alternative/Secondary, so the old literal check left every variant but the
//    first one rootless → blank trees.
//  • A variant key (icp+variant) is LAST-WINS: a later root row supersedes an earlier one sharing the
//    same number, so a newer discovery script cleanly replaces a legacy one instead of merging into it.
//  • A `discovery_branch` attaches to the current root for its icp (the root row above it in sheet
//    order), not to its own variant number — legacy rows numbered branches independently of the root.
function parseBubblesAndBranches(rows) {
  const bubbles = {};  // keyed by icp
  const branches = {}; // keyed by icp then variant
  const curRootVid = {}; // icp -> variant id of the most recently seen discovery root
  rows.forEach(r => {
    const t = (r.type || '').toLowerCase().trim();
    const tag = (r.tag || '').trim();
    const icp = (r.icp || '').toLowerCase().trim();
    if (!icp) return;
    if (!bubbles[icp]) bubbles[icp] = { bridge: [], close: [] };
    if (!branches[icp]) branches[icp] = {};
    if (t === 'bridge_bubble') {
      const isShowScript = tag.toLowerCase().includes('green');
      const color = tag.replace(/_show$/i, '').toLowerCase() || 'yellow';
      bubbles[icp].bridge.push({ label: r.name || '', type: color, response: r.text || '', showScript: isShowScript });
    } else if (t === 'close_bubble') {
      bubbles[icp].close.push({ label: r.name || '', type: tag.toLowerCase() || 'yellow', response: r.text || '' });
    } else if (t === 'discovery') {
      const vid = r.variant || '1';
      // Last-wins: start a fresh tree for this variant, discarding any earlier root/children.
      branches[icp][vid] = [{
        branchId: 'ROOT', parentId: null, depth: 0, rootQuestion: r.text || '',
        label: '', type: '', response: '', nextPhase: '', variantLabel: r.name || `Variant ${vid}`,
      }];
      curRootVid[icp] = vid;
    } else if (t === 'discovery_branch') {
      const vid = curRootVid[icp];
      const lst = vid != null ? branches[icp][vid] : null;
      if (!lst) return; // branch with no preceding root for this icp — skip rather than orphan
      const color = tag.toLowerCase() || 'yellow';
      const existingChildren = lst.filter(n => n.parentId === 'ROOT' && n.depth === 1).length;
      const branchId = `${vid}${String.fromCharCode(65 + existingChildren)}`;
      lst.push({
        branchId, parentId: 'ROOT', depth: 1, rootQuestion: '', label: r.name || '',
        type: color, response: r.text || '', nextPhase: 'PITCH', variantLabel: '',
      });
    }
  });
  return { bubbles, branches };
}

function buildBranchTree(flatNodes) {
  const map = {};
  flatNodes.forEach(n => { map[n.branchId] = { ...n, children: [] }; });
  const roots = [];
  flatNodes.forEach(n => {
    if (n.parentId && map[n.parentId]) map[n.parentId].children.push(map[n.branchId]);
    else if (n.depth === 0) roots.push(map[n.branchId]);
  });
  return roots;
}

function safeJSON(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; }
  catch { return fallback; }
}

/* ─────────────────────────────────────────────
   WRITE BACK TO SHEETS (disposition logging)
───────────────────────────────────────────── */
/* writeDisposition removed — n8n webhook handles all Sheets writes
   via /webhook/cold-call-log with proper Google OAuth credentials */

/* ─────────────────────────────────────────────
   LOADING SCREEN
───────────────────────────────────────────── */
function LoadingScreen({ error }) {
  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", fontFamily:F, gap:12 }}>
      {error ? (
        <>
          <div style={{ fontSize:13, color:C.red }}>Failed to load sheet data</div>
          <div style={{ fontSize:11, color:C.t3, maxWidth:400, textAlign:"center" }}>{error}</div>
          <div style={{ fontSize:11, color:C.t3 }}>
            Check your .env file has VITE_SHEET_ID and VITE_SHEETS_API_KEY set correctly,
            and that the Sheet is shared as "Anyone with the link can view".
          </div>
        </>
      ) : (
        <>
          <div style={{ width:20, height:20, border:`2px solid ${C.border}`,
            borderTopColor:C.t1, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
          <div style={{ fontSize:13, color:C.t2 }}>Loading leads...</div>
        </>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────
   OSSelect — native-to-the-OS dropdown (replaces browser <select> in the
   Script mixer). Renders a styled trigger + a popover list in the Harmonia
   design language. When `onAdd` is passed, the menu grows an inline
   "＋ Add option" row so callers can author their own options in place;
   `onRemove` (custom options only) shows a × to delete one.
───────────────────────────────────────────── */
function OSSelect({ value, options = [], onChange, onAdd, onRemove, size = "md",
                   placeholder = "Select…", triggerStyle = {}, menuWidth, star }) {
  const [open, setOpen]   = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) { setOpen(false); setAdding(false); } };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); setAdding(false); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  useEffect(() => { if (adding && inputRef.current) inputRef.current.focus(); }, [adding]);

  const sel = options.find(o => o.value === value) || null;
  const pad  = size === "sm" ? "3px 7px" : "4px 9px";
  const font = size === "sm" ? 10 : 11;
  const selLabel = sel ? sel.label : placeholder;

  const commitAdd = () => {
    const t = draft.trim();
    if (t && onAdd) onAdd(t);
    setDraft(""); setAdding(false); setOpen(false);
  };

  return (
    <div ref={rootRef} style={{ position: "relative", ...(triggerStyle.flex ? { flex: triggerStyle.flex } : {}), minWidth: 0, ...triggerStyle.wrap }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", boxSizing: "border-box",
          border: `0.75px solid ${open ? C.accent : C.border}`, borderRadius: 6, padding: pad,
          fontSize: font, background: C.bg, color: sel ? C.t1 : C.t3, cursor: "pointer", outline: "none",
          fontFamily: F, textAlign: "left", transition: "border-color 0.12s", ...triggerStyle }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selLabel}{star && sel && star(sel) ? " ★" : ""}
        </span>
        <span style={{ fontSize: font - 2, color: C.t3, flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.12s" }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 40,
          minWidth: menuWidth || "100%", maxWidth: 340, maxHeight: 280, overflowY: "auto",
          background: C.bg, border: `0.75px solid ${C.borderMd}`, borderRadius: 8,
          boxShadow: "0 8px 24px rgba(28,61,82,0.14)", padding: 4, fontFamily: F }}>
          {options.length === 0 && !onAdd && (
            <div style={{ padding: "6px 9px", fontSize: font, color: C.t3 }}>No options</div>
          )}
          {options.map(o => {
            const on = o.value === value;
            return (
              <div key={o.value} onClick={() => { onChange && onChange(o.value); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: pad, borderRadius: 5,
                  fontSize: font, color: on ? C.accent : C.t1, cursor: "pointer",
                  background: on ? C.accent + "14" : "transparent", fontWeight: on ? 600 : 400 }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.background = C.surface; }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.background = "transparent"; }}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.label}{star && star(o) ? " ★" : ""}{o.custom ? "" : ""}
                </span>
                {o.custom && onRemove && (
                  <span onClick={(e) => { e.stopPropagation(); onRemove(o.value); }}
                    title="Remove this custom option"
                    style={{ fontSize: font + 1, lineHeight: 1, color: C.t3, padding: "0 2px", cursor: "pointer" }}
                    onMouseEnter={e => { e.currentTarget.style.color = C.red; }}
                    onMouseLeave={e => { e.currentTarget.style.color = C.t3; }}>×</span>
                )}
              </div>
            );
          })}
          {onAdd && (
            <>
              <div style={{ height: 1, background: C.border, margin: "4px 2px" }} />
              {adding ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px" }}>
                  <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commitAdd(); }
                                      else if (e.key === "Escape") { e.stopPropagation(); setAdding(false); setDraft(""); } }}
                    placeholder="Name your option…"
                    style={{ flex: 1, minWidth: 0, border: `0.75px solid ${C.borderMd}`, borderRadius: 5,
                      padding: "4px 7px", fontSize: font, fontFamily: F, color: C.t1, background: C.bg, outline: "none" }} />
                  <button type="button" onClick={commitAdd} disabled={!draft.trim()}
                    style={{ border: "none", borderRadius: 5, padding: "4px 9px", fontSize: font, fontWeight: 600, fontFamily: F,
                      background: draft.trim() ? C.accent : C.border, color: draft.trim() ? "#fff" : C.t3,
                      cursor: draft.trim() ? "pointer" : "default" }}>Add</button>
                </div>
              ) : (
                <div onClick={() => setAdding(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: pad, borderRadius: 5,
                    fontSize: font, color: C.accent, cursor: "pointer", fontWeight: 500 }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.accent + "10"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                  <span style={{ fontSize: font + 2, lineHeight: 1 }}>＋</span> Add option
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────── */
export default function HarmoniaOS() {
  const [leads,    setLeads]    = useState([]);
  const [scripts,  setScripts]  = useState({});
  const [objections,setObjections]= useState({});
  // Recording library (call MP3s) — rows from the Recordings tab + the upload form state.
  const [recordings,   setRecordings]   = useState([]);
  const [recFile,      setRecFile]      = useState(null);
  const [recTitle,     setRecTitle]     = useState("");
  const [recNotes,     setRecNotes]     = useState("");
  const [recVisibility,setRecVisibility]= useState("private"); // private (just me) | global (team)
  const [recUploading, setRecUploading] = useState(false);
  const [recError,     setRecError]     = useState("");
  const [bridgeBubbles, setBridgeBubbles] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [loadError,setLoadError]= useState(null);

  const [active,   setActive]   = useState(null);
  const [filter,   setFilter]   = useState("all");
  const [phoneFilter,   setPhoneFilter]   = useState("all"); // all | mobile | corporate
  const [emailedFilter, setEmailedFilter] = useState("all"); // all | emailed | not
  const [starFilter,    setStarFilter]    = useState("all"); // all | starred
  const [filtersOpen,   setFiltersOpen]   = useState(false); // filter panel collapsed by default
  const [tab,      setTab]      = useState("intel");
  // ── Brand signature (the etched rings in the empty centre) ──
  const BELIEFS = ["every call answered","presence as a product","silence costs revenue","nothing left to add"];
  const [sigOn,    setSigOn]    = useState(()=>{ try { return localStorage.getItem("harmonia-sig-on")!=="0"; } catch { return true; } });
  const [sigIndex, setSigIndex] = useState(()=>{ try { return localStorage.getItem("harmonia-sig-index")!=="0"; } catch { return true; } });
  const [sigPhrase,setSigPhrase]= useState(()=>{ try { return Math.max(0, BELIEFS.indexOf(localStorage.getItem("harmonia-sig-phrase"))); } catch { return 0; } });
  useEffect(()=>{ try { localStorage.setItem("harmonia-sig-on", sigOn?"1":"0"); } catch {} }, [sigOn]);
  useEffect(()=>{ try { localStorage.setItem("harmonia-sig-index", sigIndex?"1":"0"); } catch {} }, [sigIndex]);
  useEffect(()=>{ try { localStorage.setItem("harmonia-sig-phrase", BELIEFS[sigPhrase]); } catch {} }, [sigPhrase]);
  const [variant,  setVariant]  = useState("1");
  const [caller,   setCaller]   = useState(CALLER_PHONES[storedSession] || "+16178006699");
  const [sessRun,  setSessRun]  = useState(false);
  const [sessSecs, setSessSecs] = useState(0);
  const [callRun,  setCallRun]  = useState(false);
  const [callSecs, setCallSecs] = useState(0);
  const [stats,    setStats]    = useState({ dials:0, answered:0, demos:0, vm:0, looms:0 });
  const [log,      setLog]      = useState([]);
  const [openObj,  setOpenObj]  = useState(null);
  const [flash,    setFlash]    = useState(null);
  const [callerName,       setCallerName]       = useState(storedSession);   // set by login; settings hydrate keys off it
  const [authed,           setAuthed]           = useState(!!storedSession); // logged in this device?
  const [loginName,        setLoginName]        = useState(storedSession || "");
  const [loginPw,          setLoginPw]          = useState("");
  const [loginPw2,         setLoginPw2]         = useState("");
  const [authStep,         setAuthStep]         = useState("login");  // "login" | "setup" (first-time password)
  const [loginErr,         setLoginErr]         = useState("");
  const [loginBusy,        setLoginBusy]        = useState(false);
  const [objectionRaised,  setObjectionRaised]  = useState("");   // Task 3 — resets per call
  const [customObjection,  setCustomObjection]  = useState("");   // Task 3 — custom objection text
  const [pendingOutcome,   setPendingOutcome]   = useState(null); // two-step disposition
  const [captureEmail,     setCaptureEmail]     = useState("");
  const [capturePhone,     setCapturePhone]     = useState("");
  const [captureNotes,     setCaptureNotes]     = useState("");
  const [callbackDate,     setCallbackDate]     = useState("");
  const [callbackTime,     setCallbackTime]     = useState("");
  const [gatekeeperName,   setGatekeeperName]   = useState("");
  const [loomContext,      setLoomContext]       = useState("");
  const [sendType,         setSendType]         = useState("website");
  const [calendlyOpened,   setCalendlyOpened]   = useState(false);
  const [undoLast,         setUndoLast]         = useState(null);    // snapshot for undo
  const [discoveryResponses, setDiscoveryResponses] = useState({});  // { questionIndex: 'pain'|'no'|'skip'|null }
  const [callPhase, setCallPhase] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem("harmonia-phase-order")); if (Array.isArray(s) && s.length > 0) return s[0].id; } catch {} return "opener";
  });
  const [phaseSecs, setPhaseSecs] = useState(0);
  const [phaseTimes, setPhaseTimes] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem("harmonia-phase-order")); if (Array.isArray(s) && s.length > 0) return Object.fromEntries(s.map(p => [p.id, 0])); } catch {} return {opener:0,discovery:0,pitch:0,close:0};
  });
  const phaseRef = useRef();
  const [closeEmail, setCloseEmail] = useState("");
  const [closeEmailStatus, setCloseEmailStatus] = useState(null); // null|'success'|'error'
  const [dispoBarOpen, setDispoBarOpen] = useState(false);
  const [phoneMenuOpen, setPhoneMenuOpen] = useState(false);  // dial phone dropdown
  const [lastDialedPhone, setLastDialedPhone] = useState(""); // track which phone was dialed
  const [showStatsPanel, setShowStatsPanel] = useState(false); // toggle right panel

  // Script tab — toggleable side panels
  const [scriptShowHistory, setScriptShowHistory] = useState(false);
  const [scriptShowNotes, setScriptShowNotes] = useState(false);

  // Custom objections added by callers (merged with sheet data)
  const [customObjections, setCustomObjections] = useState(() => {
    try { return JSON.parse(localStorage.getItem("harmonia-custom-objections") || "{}"); }
    catch { return {}; }
  });
  const [newObjQ, setNewObjQ] = useState("");
  const [newObjA, setNewObjA] = useState("");

  // Custom openers added by callers — shared team-wide (same mechanism as objections).
  // Keyed by ICP: { [icp]: [{ name, body, added_by }] }. The scripted openers still come
  // from the Scripts sheet; these are caller-authored and sync to everyone via OPENERS_KEY.
  const [customOpeners, setCustomOpeners] = useState(() => {
    try { return JSON.parse(localStorage.getItem("harmonia-custom-openers") || "{}"); }
    catch { return {}; }
  });
  const [newOpenerName, setNewOpenerName] = useState("");
  const [newOpenerBody, setNewOpenerBody] = useState("");
  const [openOpener, setOpenOpener] = useState(null);   // expanded card key ("s0" scripted / "c0" custom)

  // Phase order — reorderable, removable, addable
  const [phaseOrder, setPhaseOrder] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("harmonia-phase-order"));
      if (Array.isArray(stored) && stored.length > 0) {
        // reconcilePhases (hoisted) drops retired phases, relabels defaults (Discovery→Cost Frame),
        // and re-injects any missing defaults — same normalization the server-hydration path uses.
        const next = reconcilePhases(stored);
        if (JSON.stringify(next) !== JSON.stringify(stored)) {
          try { localStorage.setItem("harmonia-phase-order", JSON.stringify(next)); } catch {}
        }
        return next;
      }
    } catch {}
    return DEFAULT_PHASES;
  });
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState("");
  const [offers, setOffers] = useState([]); // from Offers sheet tab
  const [selectedOfferId, setSelectedOfferId] = useState(""); // which offer is picked in dropdown
  const [offerCollapsed, setOfferCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("harmonia-offer-collapsed")) === true; }
    catch { return false; }
  });
  const [activeBridgeBubble, setActiveBridgeBubble] = useState(null); // index of expanded bubble
  const [activeCloseBubble, setActiveCloseBubble] = useState(null);  // index of expanded close bubble
  const [activeDiscoveryBubble, setActiveDiscoveryBubble] = useState(null); // index of expanded Cost Frame reply
  const [bubbleData, setBubbleData] = useState({}); // { [icp]: { bridge:[], close:[] } }
  const [branchData, setBranchData] = useState({}); // { [icp]: { [variant]: [flat branch nodes] } }
  // A/B-format scripts (auto-detected from the sheet header). When scriptFormat==='ab' the phase
  // body renders stacked frames + per-piece A/B toggles + reply chips instead of the legacy UI.
  const [scriptFormat, setScriptFormat] = useState('legacy'); // 'legacy' | 'ab'
  const [abData, setAbData] = useState({});      // { [icp]: { opener:{groups,replies}, ... } }
  const [abChoice, setAbChoice] = useState({});  // { "phase:group:sub": 'A'|'B' } — which variant is shown
  const [abReplyOpen, setAbReplyOpen] = useState({}); // { [phase]: replyIndex|null } — expanded reply chip
  const [activeBranches, setActiveBranches] = useState({}); // { depth: branch_id }
  const [addBranchForm, setAddBranchForm] = useState(null); // { parentId, depth } or null
  const [newBranchLabel, setNewBranchLabel] = useState("");
  const [newBranchType, setNewBranchType] = useState("green");
  const [newBranchResponse, setNewBranchResponse] = useState("");
  const [collapsedPhases, setCollapsedPhases] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem("harmonia-collapsed-phases")); return new Set(Array.isArray(s)?s:[]); } catch { return new Set(); }
  });

  // Tab ribbon visibility — ids of tabs the caller has hidden. Per-caller (rides the
  // settings blob) + localStorage fallback, same as the phase layout. Managed from the
  // ⚙ button at the end of the ribbon. See tabDefs / visibleTabs at the ribbon.
  const [hiddenTabs, setHiddenTabs] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem("harmonia-hidden-tabs")); return new Set(Array.isArray(s)?s:[]); } catch { return new Set(); }
  });
  const [tabManagerOpen, setTabManagerOpen] = useState(false);

  // Script Mixer — per-caller editable scripts
  const [phaseSelections, setPhaseSelections] = useState({opener:"1",bridge:"1",discovery:"1",pitch:"1",close:"1"});
  const [callerScripts, setCallerScripts] = useState({}); // { "opener_1": "custom text", ... }
  const [scriptSaveStatus, setScriptSaveStatus] = useState({}); // { phase: 'saved'|'saving'|'reset'|null }
  const saveTimerRefs = useRef({});

  // Caller-authored dropdown options, keyed per dropdown (e.g. "variant:opener",
  // "frame:bridge", "section:discovery:Anchor"). Each entry is a list of { value, label }.
  // Persists to localStorage now and rides along in the per-caller settings blob so a
  // caller's custom options follow them across devices. See addDropdownOption / removeDropdownOption.
  const [customDropdownOpts, setCustomDropdownOpts] = useState(() => {
    try { return JSON.parse(localStorage.getItem("harmonia-custom-dropdown-opts") || "{}"); }
    catch { return {}; }
  });
  const persistDropdownOpts = (next) => {
    try { localStorage.setItem("harmonia-custom-dropdown-opts", JSON.stringify(next)); } catch {}
  };
  const addDropdownOption = (dropdownKey, label) => {
    const clean = (label || "").trim();
    if (!clean) return null;
    const value = `custom-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    setCustomDropdownOpts(prev => {
      const list = prev[dropdownKey] || [];
      const next = { ...prev, [dropdownKey]: [...list, { value, label: clean }] };
      persistDropdownOpts(next);
      return next;
    });
    return value;
  };
  const removeDropdownOption = (dropdownKey, value) => {
    setCustomDropdownOpts(prev => {
      const list = (prev[dropdownKey] || []).filter(o => o.value !== value);
      const next = { ...prev, [dropdownKey]: list };
      persistDropdownOpts(next);
      return next;
    });
  };
  const customOptsFor = (dropdownKey) => (customDropdownOpts[dropdownKey] || []);

  // Script tab mode — "phases" (the mixer) or "blank" (free-text canvas + draggable variables)
  const [scriptMode, setScriptMode] = useState(() => {
    try { return localStorage.getItem("harmonia-script-mode") || "phases"; } catch { return "phases"; }
  });
  const [blankScripts, setBlankScripts] = useState(() => { // { [callerName]: rawText }
    try { return JSON.parse(localStorage.getItem("harmonia-blank-scripts") || "{}"); } catch { return {}; }
  });
  // Saved script "standards" — named versions the caller can keep and reload. { [callerName]: [{id,name,text,savedAt}] }
  const [blankVersions, setBlankVersions] = useState(() => {
    try { return JSON.parse(localStorage.getItem("harmonia-blank-versions") || "{}"); } catch { return {}; }
  });
  const saveBlankVersions = (next) => {
    setBlankVersions(next);
    try { localStorage.setItem("harmonia-blank-versions", JSON.stringify(next)); } catch {}
  };
  // Blank-canvas bubble ribbons — caller-authored rows of clickable bubbles that sit inside
  // the canvas and span it horizontally. Shape: { [caller]: [{ id, bubbles:[{id,label,response}] }] }.
  // Press a bubble → its response drops open below the ribbon. Rides the per-caller settings
  // blob (cross-device) the same way blankVersions does.
  const [blankRibbons, setBlankRibbons] = useState(() => {
    try { return JSON.parse(localStorage.getItem("harmonia-blank-ribbons") || "{}"); } catch { return {}; }
  });
  const saveBlankRibbons = (next) => {
    setBlankRibbons(next);
    try { localStorage.setItem("harmonia-blank-ribbons", JSON.stringify(next)); } catch {}
  };
  const [openBubble, setOpenBubble] = useState(null); // "<ribbonId>:<bubbleId>" currently pressed open
  // Blank-canvas font size (px) — per-device, applies to both the editor and the live preview
  const [blankFontSize, setBlankFontSize] = useState(() => {
    try { return Number(localStorage.getItem("harmonia-blank-font-size")) || 14; } catch { return 14; }
  });
  const applyBlankFontSize = (n) => setBlankFontSize(() => {
    const next = Math.max(1, Math.round(n) || 1);   // no upper limit — type whatever you want
    try { localStorage.setItem("harmonia-blank-font-size", String(next)); } catch {}
    return next;
  });
  const changeBlankFontSize = (delta) => setBlankFontSize(prev => {
    const next = Math.max(1, prev + delta);
    try { localStorage.setItem("harmonia-blank-font-size", String(next)); } catch {}
    return next;
  });
  // Blank-canvas display: false = pseudocode (editable, shows {tokens}), true = filled values (read-only)
  const [blankShowValues, setBlankShowValues] = useState(() => {
    try { return localStorage.getItem("harmonia-blank-show-values") === "1"; } catch { return false; }
  });
  const toggleBlankShowValues = () => setBlankShowValues(prev => {
    const next = !prev;
    try { localStorage.setItem("harmonia-blank-show-values", next ? "1" : "0"); } catch {}
    return next;
  });
  // Blank-canvas font color (per-device)
  const [blankFontColor, setBlankFontColor] = useState(() => {
    try { return localStorage.getItem("harmonia-blank-font-color") || C.t1; } catch { return C.t1; }
  });
  const changeBlankFontColor = (val) => setBlankFontColor(() => {
    try { localStorage.setItem("harmonia-blank-font-color", val); } catch {}
    return val;
  });
  // Blank-canvas font family (per-device)
  const BLANK_FONTS = [
    { id:"sans",   label:"Sans",       css:F },
    { id:"mono",   label:"Mono",       css:FM },
    { id:"serif",  label:"Serif",      css:"'Iowan Old Style', Georgia, 'Times New Roman', serif" },
    { id:"rounded",label:"Rounded",    css:"'SF Pro Rounded', ui-rounded, 'Nunito', system-ui, sans-serif" },
    { id:"system", label:"System",     css:"system-ui, -apple-system, sans-serif" },
  ];
  const [blankFontFamily, setBlankFontFamily] = useState(() => {
    try { return localStorage.getItem("harmonia-blank-font-family") || F; } catch { return F; }
  });
  const changeBlankFontFamily = (css) => setBlankFontFamily(() => {
    try { localStorage.setItem("harmonia-blank-font-family", css); } catch {}
    return css;
  });
  // Blank-canvas height (px) — user steps it taller/shorter; persists across the Variables/Values
  // toggle and reloads so the size sticks in both views.
  const [blankCanvasHeight, setBlankCanvasHeight] = useState(() => {
    try { return Number(localStorage.getItem("harmonia-blank-canvas-height")) || 300; } catch { return 300; }
  });
  const applyBlankCanvasHeight = (n) => setBlankCanvasHeight(() => {
    const next = Math.max(80, Math.round(n) || 80);   // no upper limit — go as tall as you want
    try { localStorage.setItem("harmonia-blank-canvas-height", String(next)); } catch {}
    return next;
  });
  const changeBlankCanvasHeight = (delta) => setBlankCanvasHeight(prev => {
    const next = Math.max(80, prev + delta);
    try { localStorage.setItem("harmonia-blank-canvas-height", String(next)); } catch {}
    return next;
  });
  const blankRef = useRef(null);

  // Lead ownership — a caller claims a lead as "mine" (auto on demo booked, or manual)
  const [claimedLeads, setClaimedLeads] = useState(() => { // { [leadId]: callerName }
    try { return JSON.parse(localStorage.getItem("harmonia-claimed-leads") || "{}"); } catch { return {}; }
  });
  // Starred leads — a caller flags leads worth coming back to (per-device, persisted)
  const [starredLeads, setStarredLeads] = useState(() => { // { [leadId]: true }
    try { return JSON.parse(localStorage.getItem("harmonia-starred-leads") || "{}"); } catch { return {}; }
  });
  const toggleStar = (leadId) => setStarredLeads(prev => {
    const next = { ...prev };
    if (next[leadId]) delete next[leadId]; else next[leadId] = true;
    try { localStorage.setItem("harmonia-starred-leads", JSON.stringify(next)); } catch {}
    return next;
  });
  // Preserve the queue's scroll position across the end-call auto-advance
  const queueScrollRef    = useRef(null);
  const preserveScrollRef = useRef(null);

  // Shared Lead Notes
  const [leadNotesData, setLeadNotesData] = useState({}); // { leadId: { text, edited_by, edited_at } }
  const [notesSaveStatus, setNotesSaveStatus] = useState(null);
  const notesSaveRef = useRef(null);
  const [spokeWith, setSpokeWith] = useState("");

  // Caller-applied lead tags (Intel tab) — { leadId: { tag, other, tagged_by, tagged_at } }
  // Seeds from a local cache for instant paint; the sheet-loaded value (active.caller_tag)
  // is the shared source of truth and is merged in when a lead is selected.
  const [leadTags, setLeadTags] = useState(() => {
    try { return JSON.parse(localStorage.getItem("harmonia-lead-tags") || "{}"); } catch { return {}; }
  });
  const tagSaveRef = useRef({}); // per-lead debounce timers for the free-text field
  const saveLeadTag = (leadId, biz, patch) => setLeadTags(prev => {
    const cur = prev[leadId] || {};
    const rec = { tag:"", other:"", ...cur, ...patch,
      tagged_by: callerName || "Unknown", tagged_at: new Date().toISOString() };
    const next = { ...prev, [leadId]: rec };
    try { localStorage.setItem("harmonia-lead-tags", JSON.stringify(next)); } catch {}
    // Persist to the Leads sheet (upsert by id) so tags are shared across all devices.
    // Debounce so typing in the "Other" box doesn't fire a write per keystroke.
    const push = () => fetch(TAG_WEBHOOK_URL, {method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({lead_id:leadId,biz,
        tag:rec.tag,tag_label:(LEAD_TAGS.find(t=>t.code===rec.tag)||{}).label||"",
        tag_other:rec.other,tagged_by:rec.tagged_by,tagged_at:rec.tagged_at})
    }).catch(()=>{});
    if (tagSaveRef.current[leadId]) clearTimeout(tagSaveRef.current[leadId]);
    if ("other" in patch && !("tag" in patch)) {
      tagSaveRef.current[leadId] = setTimeout(push, 900); // free-text edits: debounce
    } else {
      push(); // dropdown pick: write immediately
    }
    return next;
  });

  // Admin Console — Javi-only script management
  const [disabledScripts, setDisabledScripts] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("harmonia-admin-disabled-scripts"));
      // Filter out retired variants 7 & 8 from stored data
      const valid = (stored || []).filter(id => id !== "7" && id !== "8");
      return new Set(valid.length > 0 ? valid : []);
    } catch { return new Set(); }
  });
  const [disabledIcps, setDisabledIcps] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("harmonia-admin-disabled-icps"));
      return new Set(stored || []);
    } catch { return new Set(); }
  });
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminTab, setAdminTab] = useState("icps");

  // Call history from the "history" tab — shared across all callers
  const [callHistory, setCallHistory] = useState({}); // { leadId: [{caller, outcome, duration, variant, timestamp, notes, spoke_with}, ...] }
  // Recording linkage: the row_id minted for the call currently being dialed/logged.
  const [callRowId, setCallRowId] = useState("");

  // Call History OS (Javi-only tab): free-text search across every logged call
  const [histQuery, setHistQuery] = useState("");
  const [histSelected, setHistSelected] = useState(null); // leadId of the opened result

  // Leaderboard: top-level view toggle + Booked Demos rows (source of Shows)
  const [mainView, setMainView] = useState("workspace"); // "workspace" | "leaderboard"
  const [bookedDemos, setBookedDemos] = useState([]); // [{caller, status}]

  // Cross-device caller settings (separate sheet): raw rows + hydration/save gates
  const [allCallerSettings, setAllCallerSettings] = useState([]);
  const personalHydrated   = useRef(false);
  const objectionsHydrated = useRef(false);
  const openersHydrated    = useRef(false);
  const adminHydrated      = useRef(false);
  const personalSaveTimer   = useRef(null);
  const objectionsSaveTimer = useRef(null);
  const openersSaveTimer    = useRef(null);
  const adminSaveTimer      = useRef(null);

  // Team-shared "The Offer" canvas — Javi (admin) edits, everyone else views what he saved
  const [offerCanvas, setOfferCanvas] = useState("");
  const offerHydrated  = useRef(false);
  const offerSaveTimer = useRef(null);
  const [offerSaveStatus, setOfferSaveStatus] = useState(null); // null|'saving'|'saved'

  // Clean broken formula values (#ERROR!, #NAME?, #REF!) and strip leading = from formula cells
  function clean(v) {
    if (!v || typeof v !== "string") return v || "";
    if (v.startsWith("#") && (v.includes("ERROR") || v.includes("NAME") || v.includes("REF") || v.includes("VALUE"))) return "";
    if (v.startsWith("=")) return v.slice(1);
    return v;
  }

  // Parse a "history" tab row — handles both sheet headers ("Lead ID") and webhook keys ("lead_id")
  function parsePerfRow(r) {
    const lid       = clean(r["Lead ID"] || r.lead_id || r.id || "");
    const caller    = clean(r["Caller Name"] || r.caller_name || r.caller || "");
    const outcome   = clean(r["Disposition"] || r.disposition || r.outcome || "");
    const duration  = parseInt(r["Call Duration (Sec)"] || r["Total Time (Sec)"] || r.call_duration || r.duration) || 0;
    const variant   = clean(r["Script Used"] || r.script_used || r.variant || "");
    const timestamp = clean(r["Timestamp"] || r.call_timestamp || r.timestamp || "");
    const notes     = clean(r["Notes"] || r.notes || "");
    const spokeW    = clean(r["Spoke With"] || r.spoke_with || "");
    const biz       = clean(r["Business Name"] || r.biz || "");
    const gatekeeper= clean(r["Gatekeeper Name"] || r.gatekeeper_name || "");
    const owner     = clean(r["Owner Name"] || r.owner || "");
    const recording = clean(r["recording_url"] || r["Recording URL"] || r.recording_url || "");
    const transcript= clean(r["transcript_url"] || r["Transcript"] || r.transcript || r.transcript_url || "");
    const callSid   = clean(r["call_sid"] || r["Call SID"] || r.call_sid || r.recording_sid || "");
    const rowId     = clean(r["row_id"] || r.row_id || "");
    return { lid, caller, outcome, duration, variant, timestamp, notes, spoke_with: spokeW, biz, gatekeeper, owner, recording, transcript, callSid, rowId };
  }

  // Re-fetch the "history" tab (per-call log written by n8n) and rebuild call history map
  async function refreshCallHistory() {
    try {
      // The call log (append-only) + the recordings side-table, joined on row_id.
      const [perfRaw, recRaw] = await Promise.all([fetchSheet("history"), fetchCallRecordingsSheet()]);
      const recMap = {};
      recRaw.forEach(r => { const k = (r.row_id || "").trim(); if (k) recMap[k] = r; });
      const histMap = {};
      perfRaw.forEach(r => {
        const p = parsePerfRow(r);
        if (!p.lid || !p.lid.trim()) return;
        if (!histMap[p.lid]) histMap[p.lid] = [];
        const rec = p.rowId ? recMap[p.rowId] : null;
        histMap[p.lid].push({
          caller:     p.caller,
          outcome:    p.outcome,
          duration:   p.duration,
          variant:    p.variant,
          timestamp:  p.timestamp,
          notes:      p.notes,
          spoke_with: p.spoke_with,
          biz:        p.biz,
          owner:      p.owner,
          // Prefer the side-table; fall back to the legacy columns on the history row itself.
          recording:  ((rec && rec.recording_url)  || p.recording  || "").trim(),
          transcript: ((rec && rec.transcript_url) || p.transcript || "").trim(),
          call_sid:   p.callSid,
          row_id:     p.rowId,
        });
      });
      Object.values(histMap).forEach(arr => arr.sort((a,b) => parseTs(b.timestamp) - parseTs(a.timestamp)));
      setCallHistory(histMap);
      console.log("[Harmonia] Call history built for", Object.keys(histMap).length, "leads");
    } catch(e) { console.error("[Harmonia] Failed to refresh call history:", e); }
  }

  // ── Cross-device caller settings: parse / reconcile / hydrate ──
  // Single source of truth for normalizing a stored/hydrated phase layout (localStorage OR the
  // per-caller settings sheet) against the current DEFAULT_PHASES. Drops retired phases (pitch),
  // relabels/recolors default phases by id (so renames like Discovery→Cost Frame land on layouts
  // that cached the old label server-side), then re-injects any missing defaults in place.
  function reconcilePhases(stored) {
    if (!Array.isArray(stored) || stored.length === 0) return DEFAULT_PHASES;
    let next = stored
      .filter(p => !RETIRED_PHASES.has(p.id))
      .map(p => {
        const dp = DEFAULT_PHASES.find(d => d.id === p.id);
        return dp ? { ...p, label: dp.label, color: dp.color } : p;
      });
    DEFAULT_PHASES.forEach((dp, di) => {
      if (!next.find(p => p.id === dp.id)) {
        const prevDefault = DEFAULT_PHASES[di - 1];
        const insertAfter = prevDefault ? next.findIndex(p => p.id === prevDefault.id) : -1;
        next.splice(insertAfter >= 0 ? insertAfter + 1 : Math.min(di, next.length), 0, dp);
      }
    });
    return next;
  }
  function parseSettingsRow(row) {
    if (!row || !row.settings_json) return null;
    try { const b = JSON.parse(row.settings_json); if (!b.updated_at) b.updated_at = row.updated_at || ""; return b; }
    catch { return null; }
  }
  function pickNewer(a, b) {            // newest updated_at wins; ties → a (server passed first)
    if (!a) return b; if (!b) return a;
    return (b.updated_at || "") > (a.updated_at || "") ? b : a;
  }
  function readLocal(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } }
  function postSettings(callerKey, blob) {
    fetch(CALLER_SETTINGS_WEBHOOK, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ caller_name: callerKey, settings_json: JSON.stringify(blob), updated_at: blob.updated_at })
    }).catch(()=>{});
  }

  // ── Recording library ── re-read the Recordings tab (after an upload), and base64-upload an MP3.
  async function refreshRecordings() {
    try { setRecordings(await fetchRecordingsSheet()); } catch {}
  }
  function uploadRecording() {
    if (!recFile) { setRecError("Choose an audio file first."); return; }
    const MAX = 12 * 1024 * 1024; // ~12MB pre-encode — stays under n8n Cloud's ~16MB webhook limit once base64'd
    if (recFile.size > MAX) { setRecError("File too large (max ~12 MB). Trim or re-export the recording."); return; }
    setRecError(""); setRecUploading(true);
    const reader = new FileReader();
    reader.onerror = () => { setRecUploading(false); setRecError("Couldn't read that file."); };
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result || "");
        const data_b64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
        const res = await fetch(RECORDING_UPLOAD_WEBHOOK, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: recFile.name, mime: recFile.type || 'audio/mpeg', data_b64,
            title: (recTitle || recFile.name).trim(), notes: recNotes || "",
            caller_name: callerName || "Unknown", visibility: recVisibility,
          }),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok || out.status !== "ok") throw new Error(out.error || `HTTP ${res.status}`);
        setFlash("Recording uploaded ✦"); setTimeout(() => setFlash(null), 3000);
        setRecFile(null); setRecTitle(""); setRecNotes("");
        setTimeout(() => refreshRecordings(), 1500);
      } catch (err) {
        setRecError("Upload failed — try again. (" + (err?.message || "error") + ")");
      } finally { setRecUploading(false); }
    };
    reader.readAsDataURL(recFile);
  }

  // Hydrate the team-shared rows (objections + admin) — server-or-local, newest wins.
  function hydrateTeam(rows) {
    const obj = pickNewer(parseSettingsRow(rows.find(r => (r.caller_name||"").trim() === OBJECTIONS_KEY)), readLocal("harmonia-team-objections"));
    if (obj && obj.customObjections) setCustomObjections(obj.customObjections);
    const opn = pickNewer(parseSettingsRow(rows.find(r => (r.caller_name||"").trim() === OPENERS_KEY)), readLocal("harmonia-team-openers"));
    if (opn && opn.customOpeners) setCustomOpeners(opn.customOpeners);
    const adm = pickNewer(parseSettingsRow(rows.find(r => (r.caller_name||"").trim() === ADMIN_KEY)), readLocal("harmonia-team-admin"));
    if (adm) {
      if (Array.isArray(adm.disabledScripts)) setDisabledScripts(new Set(adm.disabledScripts.filter(id => id!=="7" && id!=="8")));
      if (Array.isArray(adm.disabledIcps))    setDisabledIcps(new Set(adm.disabledIcps));
    }
    const off = pickNewer(parseSettingsRow(rows.find(r => (r.caller_name||"").trim() === OFFER_KEY)), readLocal("harmonia-team-offer"));
    if (off && typeof off.text === "string") setOfferCanvas(off.text);
    objectionsHydrated.current = true;
    openersHydrated.current = true;
    adminHydrated.current = true;
    offerHydrated.current = true;
  }

  // Hydrate one caller's personal scripts + layout. isInitial preserves this device's
  // legacy global layout for its regular user the first time (pre-migration only).
  function hydrateCaller(name, rows, isInitial = false) {
    if (!name) return;
    const server = parseSettingsRow((rows || allCallerSettings).find(r => (r.caller_name||"").trim() === name));
    const chosen = pickNewer(server, readLocal(`harmonia-settings-${name}`));
    if (chosen) {
      setCallerScripts(chosen.scripts || {});
      setPhaseOrder(reconcilePhases(chosen.phaseOrder));
      setCollapsedPhases(new Set(Array.isArray(chosen.collapsedPhases) ? chosen.collapsedPhases : []));
      setOfferCollapsed(chosen.offerCollapsed === true);
      // Saved standards sync per-caller. Only overwrite if the chosen blob carries them, so a
      // pre-feature server row (no blankVersions) never wipes this device's local standards.
      if (Array.isArray(chosen.blankVersions)) {
        setBlankVersions(prev => {
          const next = { ...prev, [name]: chosen.blankVersions };
          try { localStorage.setItem("harmonia-blank-versions", JSON.stringify(next)); } catch {}
          return next;
        });
      }
      // Bubble ribbons sync per-caller — same guard: a pre-feature server row can't wipe
      // this device's locally-authored ribbons.
      if (Array.isArray(chosen.blankRibbons)) {
        setBlankRibbons(prev => {
          const next = { ...prev, [name]: chosen.blankRibbons };
          try { localStorage.setItem("harmonia-blank-ribbons", JSON.stringify(next)); } catch {}
          return next;
        });
      }
      // Caller-authored dropdown options — only overwrite when the blob carries them, so a
      // pre-feature server row can't wipe this device's local custom options.
      if (chosen.customDropdownOpts && typeof chosen.customDropdownOpts === "object") {
        setCustomDropdownOpts(chosen.customDropdownOpts);
        persistDropdownOpts(chosen.customDropdownOpts);
      }
      // Hidden-tab preferences — only overwrite when present (pre-feature rows keep this device's).
      if (Array.isArray(chosen.hiddenTabs)) {
        setHiddenTabs(new Set(chosen.hiddenTabs));
        try { localStorage.setItem("harmonia-hidden-tabs", JSON.stringify(chosen.hiddenTabs)); } catch {}
      }
    } else {
      setCallerScripts(readLocal(`harmonia-scripts-${name}`) || {});   // legacy per-caller scripts
      if (isInitial) {                                                  // keep this device's existing layout once
        const po = readLocal("harmonia-phase-order");
        setPhaseOrder(reconcilePhases(Array.isArray(po) && po.length ? po : DEFAULT_PHASES));
        const cp = readLocal("harmonia-collapsed-phases");
        setCollapsedPhases(new Set(Array.isArray(cp) ? cp : []));
        setOfferCollapsed(readLocal("harmonia-offer-collapsed") === true);
      } else {
        setPhaseOrder(DEFAULT_PHASES);
        setCollapsedPhases(new Set());
        setOfferCollapsed(false);
      }
    }
    personalHydrated.current = true;
  }

  // ── Login / auth handlers (server-checked password via caller-auth webhook) ──
  function completeLogin(name) {
    try { localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ caller: name, ts: Date.now() })); } catch {}
    try { localStorage.setItem(CALLER_LS_KEY, name); } catch {}
    setCallerName(name);
    if (CALLER_PHONES[name]) setCaller(CALLER_PHONES[name]);
    personalHydrated.current = false;
    hydrateCaller(name, allCallerSettings);
    setLoginPw(""); setLoginPw2(""); setAuthStep("login"); setLoginErr(""); setLoginBusy(false);
    setAuthed(true);
  }
  async function submitLogin() {
    if (!loginName || !loginPw) return;
    const mode = authStep === "setup" ? "set" : "check";
    if (mode === "set") {
      if (loginPw.length < 4) { setLoginErr("Password must be at least 4 characters."); return; }
      if (loginPw !== loginPw2) { setLoginErr("Passwords don't match."); return; }
    }
    setLoginErr(""); setLoginBusy(true);
    try {
      const res = await fetch(CALLER_AUTH_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caller_name: loginName, password: loginPw, mode }) });
      const data = await res.json().catch(() => ({}));
      if (data.status === "ok")          { completeLogin(loginName); return; }
      if (data.status === "needs_setup") { setAuthStep("setup"); setLoginErr(""); setLoginBusy(false); return; }
      if (data.status === "bad")         { setLoginErr("Incorrect password."); setLoginBusy(false); return; }
      setLoginErr("Login failed — try again."); setLoginBusy(false);
    } catch (e) { setLoginErr("Network error — check your connection."); setLoginBusy(false); }
  }
  function logout() {
    try { localStorage.removeItem(AUTH_SESSION_KEY); } catch {}
    setAuthed(false); setLoginPw(""); setLoginPw2(""); setAuthStep("login"); setLoginErr(""); setLoginName(callerName || "");
  }

  const sessRef = useRef(); const callRef = useRef();

  /* ── FETCH ALL SHEET DATA ON MOUNT ── */
  useEffect(() => {
    async function load() {
      try {
        const [leadsRaw, objectionsRaw, offersRaw, callerSettingsRaw, salonRaw, barberRaw, recordingsRaw] = await Promise.all([
          fetchSheet("Leads"),
          fetchSheet("Objections"),
          fetchSheet("Offers").catch(() => []),
          fetchSettingsSheet(),
          fetchScriptTabRaw(SCRIPT_ICP_TABS.salon),       // scripts now live on the per-ICP scripts sheet
          fetchScriptTabRaw(SCRIPT_ICP_TABS.barbershop),
          fetchRecordingsSheet(),                          // call-library (Recordings tab on the settings sheet)
        ]);
        setRecordings(recordingsRaw);
        // Cross-device settings: stash rows, hydrate team-shared now, and this device's
        // remembered caller (server is the source of truth; localStorage is the fallback).
        setAllCallerSettings(callerSettingsRaw);
        hydrateTeam(callerSettingsRaw);
        if (storedSession) hydrateCaller(storedSession, callerSettingsRaw, true);
        const parsedLeads = parseLeads(leadsRaw);
        setLeads(parsedLeads);
        // One-time per-device migration: legacy Shared Notes used to live only in this
        // browser's localStorage. Push any that the sheet doesn't already have up to the
        // Leads sheet so they become truly shared. Skips leads that already have a sheet
        // note (never clobbers a newer shared note); runs once, guarded by a flag.
        try {
          if (!localStorage.getItem("harmonia-notes-migrated-v1")) {
            const byId = Object.fromEntries(parsedLeads.map(l => [String(l.id), l]));
            const pending = [];
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (!k || !k.startsWith("harmonia-notes-")) continue;
              const id = k.slice("harmonia-notes-".length);
              let nd; try { nd = JSON.parse(localStorage.getItem(k) || "null"); } catch { nd = null; }
              const text = (nd?.text || "").trim();
              const lead = byId[String(id)];
              if (!text || !lead) continue;
              if ((lead.lead_notes || "").trim()) continue; // sheet already has a note — leave it
              pending.push({ id, text, edited_by: nd.edited_by || "Unknown",
                edited_at: nd.edited_at || new Date().toISOString(), biz: lead.biz });
            }
            // Stagger so we don't fire a burst of concurrent sheet upserts.
            pending.forEach((p, idx) => setTimeout(() => {
              fetch(NOTES_WEBHOOK_URL, {method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({lead_id:p.id,biz:p.biz,lead_notes:p.text,
                  notes_edited_by:p.edited_by,notes_edited_at:p.edited_at})}).catch(()=>{});
            }, idx * 500));
            localStorage.setItem("harmonia-notes-migrated-v1", String(pending.length));
            if (pending.length) console.log(`[Harmonia] migrating ${pending.length} local note(s) to the shared sheet`);
          }
        } catch {}
        // Scripts come from the per-ICP tabs. Auto-detect each tab's format from its header so the
        // old (Variant/Name + "-" replies) and new A/B (Element/A/B, multi-part frames) layouts both
        // work — old keeps rendering as-is, A/B switches the phase body to frames + toggles + chips.
        const tabs = [['salon', salonRaw], ['barbershop', barberRaw]];
        const useAb = tabs.some(([, raw]) => isAbFormatRows(raw));
        const scriptsByIcp = {}; const bubbleByIcp = {};
        if (useAb) {
          const abByIcp = {};
          tabs.forEach(([icp, raw]) => { abByIcp[icp] = parseAbScriptTab(raw); });
          setAbData(abByIcp);
          setScriptFormat('ab');
        } else {
          tabs.forEach(([icp, raw]) => {
            const parsedTab = parseNewScriptTab(raw);
            scriptsByIcp[icp] = parsedTab.scripts;
            bubbleByIcp[icp]  = parsedTab.bubbles;
          });
          setScripts(scriptsByIcp);
          setBubbleData(bubbleByIcp);
        }
        setBranchData({}); // discovery branch-tree model retired; Cost Frame is sequential steps now
        setObjections(parseObjections(objectionsRaw));
        const parsedOffers = parseOffers(offersRaw);
        setOffers(parsedOffers);
        // Fetch call history from the "history" tab (non-blocking)
        refreshCallHistory();
        // Booked Demos tab → source of leaderboard "Shows" (empty for now; degrade to [])
        fetchSheet("Booked Demos").then(rows => {
          setBookedDemos(rows.map(r => ({
            caller: clean(r["Caller Name"] || r.caller_name || ""),
            status: clean(r["Status"] || r.status || ""),
          })));
        }).catch(() => setBookedDemos([]));
        // Land on the first visible (hair salon / barbershop) lead, not a hidden vertical.
        const firstVisible = parsedLeads.find(l => VISIBLE_GROUPS.has(icpGroup(l.icp)) && getLeadPhones(l).length > 0) || parsedLeads[0];
        if (firstVisible) {
          setActive(firstVisible);
          // Opener-variant pick is legacy-only (A/B mode lists frames, no single selected variant).
          if (!useAb) {
            const recs = getRecommendedOpeners(firstVisible);
            const avail = Object.keys(scriptsByIcp[icpGroup(firstVisible?.icp)] || {});
            const pick = recs.find(r => avail.includes(r.openerId));
            setVariant(pick ? pick.openerId : avail[0] || "1");
          }
        }
        setLoading(false);
      } catch (e) {
        setLoadError(e.message);
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if(sessRun) sessRef.current=setInterval(()=>setSessSecs(s=>s+1),1000);
    else clearInterval(sessRef.current);
    return()=>clearInterval(sessRef.current);
  },[sessRun]);

  useEffect(() => {
    if(callRun) callRef.current=setInterval(()=>setCallSecs(s=>s+1),1000);
    else clearInterval(callRef.current);
    return()=>clearInterval(callRef.current);
  },[callRun]);

  // Auto-refresh call history every 60s so other callers' updates appear
  useEffect(() => {
    const interval = setInterval(() => refreshCallHistory(), 60000);
    return () => clearInterval(interval);
  }, []);

  // After the end-call auto-advance, restore the queue scroll so the caller keeps their place
  useLayoutEffect(() => {
    if (preserveScrollRef.current != null && queueScrollRef.current) {
      queueScrollRef.current.scrollTop = preserveScrollRef.current;
      preserveScrollRef.current = null;
    }
  });

  // Reset branch tree when discovery variant changes
  useEffect(() => {
    setActiveBranches({});
    setAddBranchForm(null);
  }, [phaseSelections.discovery]);

  useEffect(() => {
    if(callRun) phaseRef.current=setInterval(()=>setPhaseSecs(s=>s+1),1000);
    else clearInterval(phaseRef.current);
    return()=>clearInterval(phaseRef.current);
  },[callRun]);

  // Never leave a hidden tab selected — if the active tab gets hidden (here or on another
  // device via synced prefs, or set by selectLead/skip), fall back to the first visible tab.
  useEffect(() => {
    if (hiddenTabs.has(tab)) {
      // "history" is a Javi-only tab (not in tabDefs for others) — never fall back onto it for a
      // non-Javi, or the ribbon/body would render blank.
      const fv = TAB_IDS.find(id => !hiddenTabs.has(id) && (id !== "history" || callerName === "Javi"));
      if (fv && fv !== tab) setTab(fv);
    }
  }, [hiddenTabs, tab, callerName]);

  // ── Cross-device persistence: save settings (debounced 800ms). The mutation sites
  // already call setState, so these effects catch every script/layout/objection/admin
  // change and upsert the full blob. Gated by the hydrated refs so loading data never
  // counts as an edit. localStorage is written first as the offline cache. ──
  useEffect(() => {
    if (!callerName || !personalHydrated.current) return;
    const blob = { version:1, updated_at:new Date().toISOString(),
      scripts: callerScripts, phaseOrder, collapsedPhases:[...collapsedPhases], offerCollapsed,
      blankVersions: blankVersions[callerName] || [], customDropdownOpts, hiddenTabs:[...hiddenTabs],
      blankRibbons: blankRibbons[callerName] || [] };
    try { localStorage.setItem(`harmonia-settings-${callerName}`, JSON.stringify(blob)); } catch {}
    if (personalSaveTimer.current) clearTimeout(personalSaveTimer.current);
    personalSaveTimer.current = setTimeout(() => postSettings(callerName, blob), 800);
  }, [callerScripts, phaseOrder, collapsedPhases, offerCollapsed, blankVersions, customDropdownOpts, hiddenTabs, blankRibbons, callerName]);

  useEffect(() => {
    if (!objectionsHydrated.current) return;
    const blob = { version:1, updated_at:new Date().toISOString(), customObjections };
    try { localStorage.setItem("harmonia-team-objections", JSON.stringify(blob)); } catch {}
    if (objectionsSaveTimer.current) clearTimeout(objectionsSaveTimer.current);
    objectionsSaveTimer.current = setTimeout(() => postSettings(OBJECTIONS_KEY, blob), 800);
  }, [customObjections]);

  // Custom openers → team-shared row. Any caller who adds an opener writes OPENERS_KEY;
  // every device rehydrates it, so a new opener reaches the whole system.
  useEffect(() => {
    if (!openersHydrated.current) return;
    const blob = { version:1, updated_at:new Date().toISOString(), customOpeners };
    try { localStorage.setItem("harmonia-team-openers", JSON.stringify(blob)); } catch {}
    if (openersSaveTimer.current) clearTimeout(openersSaveTimer.current);
    openersSaveTimer.current = setTimeout(() => postSettings(OPENERS_KEY, blob), 800);
  }, [customOpeners]);

  useEffect(() => {
    if (!adminHydrated.current) return;
    const blob = { version:1, updated_at:new Date().toISOString(),
      disabledScripts:[...disabledScripts], disabledIcps:[...disabledIcps] };
    try { localStorage.setItem("harmonia-team-admin", JSON.stringify(blob)); } catch {}
    if (adminSaveTimer.current) clearTimeout(adminSaveTimer.current);
    adminSaveTimer.current = setTimeout(() => postSettings(ADMIN_KEY, blob), 800);
  }, [disabledScripts, disabledIcps]);

  // Persist the Offer canvas — ONLY Javi (the admin) writes it; other callers are view-only.
  useEffect(() => {
    if (!offerHydrated.current || callerName !== "Javi") return;
    const blob = { version:1, updated_at:new Date().toISOString(), text: offerCanvas };
    try { localStorage.setItem("harmonia-team-offer", JSON.stringify(blob)); } catch {}
    if (offerSaveTimer.current) clearTimeout(offerSaveTimer.current);
    setOfferSaveStatus("saving");
    offerSaveTimer.current = setTimeout(() => {
      postSettings(OFFER_KEY, blob);
      setOfferSaveStatus("saved");
      setTimeout(() => setOfferSaveStatus(null), 2000);
    }, 800);
  }, [offerCanvas, callerName]);

  // Live-refresh "The Offer" for viewers — poll the team settings sheet every 30s so Javi's
  // edits appear without a reload. Skipped for Javi (he's the author; never clobber his typing).
  useEffect(() => {
    if (callerName === "Javi") return;
    let cancelled = false;
    const pull = async () => {
      const rows = await fetchSettingsSheet();
      if (cancelled || !Array.isArray(rows) || rows.length === 0) return;
      const off = parseSettingsRow(rows.find(r => (r.caller_name||"").trim() === OFFER_KEY));
      if (off && typeof off.text === "string") {
        try { localStorage.setItem("harmonia-team-offer", JSON.stringify(off)); } catch {}
        setOfferCanvas(prev => prev === off.text ? prev : off.text);
      }
    };
    const id = setInterval(pull, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [callerName]);

  const hasDiscoveryInput = Object.keys(discoveryResponses).length > 0;
  const painSignalCount = Object.values(discoveryResponses).filter(v=>v==="pain").length;
  const pitchUnlocked = painSignalCount >= 2;

  useEffect(() => {
    if(pitchUnlocked && callPhase==="discovery") {
      const discoveryIdx = phaseOrder.findIndex(p => p.id === "discovery");
      const nextPhase = phaseOrder[discoveryIdx + 1];
      if (nextPhase) {
        setPhaseTimes(t=>({...t,discovery:phaseSecs}));
        setPhaseSecs(0);
        setCallPhase(nextPhase.id);
      }
    }
  },[pitchUnlocked, callPhase, phaseOrder]);

  if (loading || loadError) return <LoadingScreen error={loadError} />;

  // ── Login gate ── no valid session → show login (or first-time password setup) ──
  if (!authed) {
    const needsSetup = authStep === "setup";
    const canSubmit = !loginBusy && loginName && loginPw && (!needsSetup || loginPw2);
    const inputStyle = {width:"100%",boxSizing:"border-box",border:`0.75px solid ${C.border}`,borderRadius:7,
      padding:"9px 10px",fontSize:13,background:C.bg,color:C.t1,outline:"none"};
    return (
      <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:20,gap:24,flexWrap:"wrap"}}>
        <div style={{width:"100%",maxWidth:340,border:`0.75px solid ${C.border}`,borderRadius:12,padding:"34px 26px 26px"}}>
          {/* Open on pride — a single ring on glass-white, the wordmark, one belief line */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:24}}>
            <RingMark size={116} stroke={C.skyTint} index={sigIndex} phrase={null} dim={0.95} uid="login" outer dot/>
            <div style={{display:"flex",alignItems:"baseline",gap:8,marginTop:18}}>
              <span style={{fontSize:15,fontWeight:600,letterSpacing:"0.18em",color:C.accent}}>HARMONIA</span>
              <span style={{fontSize:11,color:C.t3}}>Cold caller</span>
            </div>
            <div style={{fontSize:10.5,color:C.t3,marginTop:7,fontFamily:FM,letterSpacing:"0.16em"}}>{BELIEFS[sigPhrase]}</div>
            <div style={{fontSize:12,color:C.t2,marginTop:14,textAlign:"center"}}>
              {needsSetup ? "First time here — create your password" : "Log in to your workspace"}
            </div>
          </div>
          <label style={{fontSize:11,color:C.t3,display:"block",marginBottom:5}}>Caller</label>
          <select value={loginName} disabled={needsSetup}
            onChange={e=>{ setLoginName(e.target.value); setAuthStep("login"); setLoginPw(""); setLoginPw2(""); setLoginErr(""); }}
            style={{...inputStyle, color:loginName?C.t1:C.t3, marginBottom:14, opacity:needsSetup?0.6:1}}>
            <option value="">Select your name…</option>
            {CALLER_ROSTER.map(n=><option key={n} value={n}>{n}</option>)}
          </select>
          <label style={{fontSize:11,color:C.t3,display:"block",marginBottom:5}}>{needsSetup?"New password":"Password"}</label>
          <input type="password" value={loginPw} autoFocus
            onChange={e=>setLoginPw(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") submitLogin(); }}
            placeholder={needsSetup?"Choose a password (min 4 chars)":"Enter your password"}
            style={{...inputStyle, marginBottom:needsSetup?12:14}} />
          {needsSetup && (
            <input type="password" value={loginPw2}
              onChange={e=>setLoginPw2(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") submitLogin(); }}
              placeholder="Confirm password" style={{...inputStyle, marginBottom:14}} />
          )}
          {loginErr && <div style={{fontSize:11,color:C.red,marginBottom:12}}>{loginErr}</div>}
          <button onClick={submitLogin} disabled={!canSubmit}
            style={{width:"100%",padding:"10px 0",borderRadius:7,border:"none",
              background:canSubmit?C.t1:C.t3,color:C.bg,fontSize:13,fontWeight:600,cursor:canSubmit?"pointer":"default"}}>
            {loginBusy ? "…" : needsSetup ? "Create password & log in" : "Log in"}
          </button>
          <div style={{fontSize:10,color:C.t3,marginTop:14,lineHeight:1.5}}>
            {needsSetup ? "Remember this — you'll use it to log in on any device." : "Forgot it? Ask your admin to reset your password."}
          </div>
        </div>
        {/* First-time helper — sits beside the card on wide screens, wraps below on narrow ones */}
        <aside style={{width:"100%",maxWidth:248,fontFamily:F}}>
          <div style={{fontSize:11,fontWeight:600,color:C.t1,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:9}}>
            First time logging in?
          </div>
          <div style={{fontSize:12.5,color:C.t2,lineHeight:1.65,marginBottom:11}}>
            You don't have a password yet — <span style={{color:C.t1,fontWeight:600}}>whatever you set the first time becomes your own</span>, and you'll use it on every device.
          </div>
          <div style={{fontSize:12,color:C.t3,lineHeight:1.6}}>
            Keep it simple — a few numbers (like <span style={{fontFamily:FM,color:C.t2}}>1234</span>) or a few letters you'll remember.
          </div>
        </aside>
      </div>
    );
  }

  // A lead is "retired" from the OS only on an explicit yes (demo booked) or
  // never-call (DNC) — logged this session (lead.status) or on any prior call in the
  // shared history tab, so a booked/DNC lead never pops back into the queue on reload.
  // Every other outcome keeps the lead queued and re-dialable, call after call.
  function leadStatusEffective(lead) {
    if (!lead) return "queued";
    if (lead.status === "demo_booked" || lead.status === "dnc") return lead.status;
    const hist = callHistory[lead.id] || [];
    if (hist.some(h => h.outcome === "dnc")) return "dnc";
    if (hist.some(h => h.outcome === "demo_booked")) return "demo_booked";
    return "queued";
  }

  // Surface leads that have a MOBILE or a CORPORATE number — only no-number leads are hidden.
  const activeLeads  = leads.filter(l => VISIBLE_GROUPS.has(icpGroup(l.icp)) && !disabledIcps.has(icpGroup(l.icp)) && ((l.mobile_phone || "").trim() !== "" || (l.corporate_phone || "").trim() !== ""));
  const filtered     = activeLeads.filter(l =>
       (filter==="all" || icpGroup(l.icp)===filter)
    && (phoneFilter==="all"   || (phoneFilter==="mobile" ? (l.mobile_phone||"").trim()!=="" : (l.corporate_phone||"").trim()!==""))
    && (emailedFilter==="all" || (emailedFilter==="emailed" ? leadEmailed(l).sent : !leadEmailed(l).sent))
    && (starFilter==="all"    || !!starredLeads[l.id]));
  const queueLeft    = filtered.filter(l=>leadStatusEffective(l)==="queued").length;
  const totalAns     = stats.answered + stats.demos;
  const connectRate  = stats.dials>0 ? Math.round(totalAns/stats.dials*100) : 0;
  const demoRate     = totalAns>0    ? Math.round(stats.demos/totalAns*100) : 0;

  const curScripts   = scripts[icpGroup(active?.icp)] || {};
  const curScript    = curScripts[variant]  || curScripts[Object.keys(curScripts)[0]];
  const curObjs      = [...(objections[icpGroup(active?.icp)] || []), ...(customObjections[active?.icp] || [])];
  const variants     = Object.keys(curScripts);
  // Whether THIS vertical has any script data — legacy variants, or A/B frames/replies on any phase.
  // Gates the "No scripts found" message so A/B mode (which leaves `scripts` empty) still renders.
  const curAbPhases  = scriptFormat === 'ab' ? (abData[icpGroup(active?.icp)] || {}) : null;
  const hasAnyScripts = variants.length > 0 || (!!curAbPhases && Object.values(curAbPhases).some(p => ((p.groups?.length || 0) + (p.replies?.length || 0)) > 0));
  // The scripted openers for the active vertical, reconstructed from the loaded Scripts data.
  // A/B format: each opener "frame" (group) is one scripted opener; join its A-line pieces.
  // Legacy format: each variant's opener-typed lines. These are read-only reference cards in the
  // Openers tab (independent of the ACTIVE_OPENERS display filter — show all of them here).
  const scriptedOpeners = (() => {
    const ab = curAbPhases?.opener;
    if (ab && Array.isArray(ab.groups) && ab.groups.length) {
      return ab.groups.map(g => ({
        name: g.name || "Opener",
        text: (g.pieces || []).map(pc => (pc.a?.text || pc.b?.text || "")).filter(Boolean).join(" // "),
      })).filter(o => o.text);
    }
    return Object.entries(curScripts).map(([id, v]) => ({
      name: v.name || `Opener ${id}`,
      text: (v.lines || []).filter(l => l.type === "opener").map(l => l.text).join(" // "),
    })).filter(o => o.text);
  })();
  const curCustomOpeners = customOpeners[active?.icp] || [];
  // Custom openers shaped as A/B "frames" so they drop into the Opener phase dropdown next to the
  // scripted ones. One piece carries the whole body (editable()'s formatScriptLines handles // →
  // line breaks). Names are de-duplicated against the scripted openers so the by-name dropdown
  // selection never collides.
  const customOpenerFrames = (() => {
    const used = new Set(scriptedOpeners.map(o => o.name));
    return curCustomOpeners.map((o, ci) => {
      let name = (o.name || "").trim() || `Custom opener ${ci + 1}`;
      const base = name; let n = 2;
      while (used.has(name)) name = `${base} (${n++})`;
      used.add(name);
      return {
        key: `co-${ci}`, name, tag: undefined, _custom: true,
        pieces: [{ sub: "", _pname: name,
          a: { text: o.body || "", note: o.added_by ? `Added by ${o.added_by}` : "" }, b: null }],
      };
    });
  })();
  const flaggedReviews = (active?.google_reviews||[]).filter(r=>r.flagged||r.flagged==="TRUE"||r.flagged==="true");
  const recommended = active ? getRecommendedOpeners(active) : [];
  const recMap = Object.fromEntries(recommended.map(r=>[r.openerId, r.reason]));
  const livePain = hasDiscoveryInput ? calcPainScore(discoveryResponses) : null;
  const displayPain = (lead) => livePain !== null && lead?.id === active?.id ? livePain : (lead?.pain || 0);
  const painStyle = (score) => painColor(score, C);
  const pendingMeta = pendingOutcome ? OUTCOMES[pendingOutcome] : null;

  // ── Phase order handlers ──
  function persistPhaseOrder(next) {
    try { localStorage.setItem("harmonia-phase-order", JSON.stringify(next)); } catch {}
    fetch(WEBHOOK_URL, {method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({type:'phase_order_update',caller_name:callerName,phase_order:next.map(p=>p.id),full_phases:next})
    }).catch(()=>{});
  }
  function movePhase(fromIdx, toIdx) {
    setPhaseOrder(prev => {
      const next = [...prev];
      [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];
      persistPhaseOrder(next);
      return next;
    });
  }
  function removePhase(phaseId) {
    const phaseObj = phaseOrder.find(p => p.id === phaseId);
    if (phaseOrder.length <= 1) return;
    if (!window.confirm(`Remove ${phaseObj?.label || phaseId} phase?`)) return;
    setPhaseOrder(prev => {
      const next = prev.filter(p => p.id !== phaseId);
      persistPhaseOrder(next);
      if (callPhase === phaseId) {
        setPhaseTimes(t => ({...t, [phaseId]: (t[phaseId]||0) + phaseSecs}));
        setPhaseSecs(0);
        setCallPhase(next[0].id);
      }
      return next;
    });
  }
  function addPhase() {
    const name = newPhaseName.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (phaseOrder.some(p => p.id === id)) { window.alert("A phase with this name already exists."); return; }
    const usedColors = new Set(phaseOrder.map(p => p.color));
    const color = COLOR_PALETTE.find(c => !usedColors.has(c)) || COLOR_PALETTE[phaseOrder.length % COLOR_PALETTE.length];
    const newPhaseObj = { id, label: name, color, isDefault: false };
    setPhaseOrder(prev => {
      const next = [...prev, newPhaseObj];
      persistPhaseOrder(next);
      return next;
    });
    setPhaseSelections(prev => ({...prev, [id]: "1"}));
    setPhaseTimes(prev => ({...prev, [id]: 0}));
    setNewPhaseName("");
    setShowAddPhase(false);
  }

  function selectLead(lead) {
    setActive(lead);
    setPhoneMenuOpen(false);
    setLastDialedPhone("");
    setDiscoveryResponses({});
    setActiveBridgeBubble(null);
    setActiveCloseBubble(null);
    setActiveBranches({});
    setAddBranchForm(null);
    setCallPhase(phaseOrder[0].id);
    setPhaseSecs(0);setPhaseTimes(Object.fromEntries(phaseOrder.map(p=>[p.id,0])));
    setCloseEmail(lead?.prospect_email||lead?.email||"");
    setCloseEmailStatus(null);
    const recs = getRecommendedOpeners(lead);
    const avail = Object.keys(scripts[icpGroup(lead?.icp)] || {});
    const pick = recs.find(r => avail.includes(r.openerId));
    setVariant(pick ? pick.openerId : avail[0] || "1");
    // Set phase selections — opener from recommendation, others default to first available
    const openerPick = pick ? pick.openerId : avail[0] || "1";
    const newSelections = {};
    phaseOrder.forEach((p, i) => { newSelections[p.id] = i === 0 ? openerPick : (avail[0] || "1"); });
    setPhaseSelections(newSelections);
    // Load lead notes from localStorage
    try {
      const storedNotes = JSON.parse(localStorage.getItem(`harmonia-notes-${lead?.id}`) || "null");
      if (storedNotes) setLeadNotesData(prev => ({...prev, [lead.id]: storedNotes}));
    } catch {}
  }

  function startSess(){ setSessRun(true);setSessSecs(0);setStats({dials:0,answered:0,demos:0,vm:0,looms:0});setLog([]); }
  function endSess()  { setSessRun(false); if(callRun){setCallRun(false);setCallSecs(0);} }

  function getLeadPhones(lead) {
    const phones = [];
    // Mobile first — callers should prioritize the direct line over the corporate number.
    if (lead.mobile_phone)    phones.push({ label: "Mobile",    number: lead.mobile_phone });
    if (lead.corporate_phone) phones.push({ label: "Corporate", number: lead.corporate_phone });
    if (lead.home_phone)      phones.push({ label: "Home",      number: lead.home_phone });
    // fallback for old data that still has single "phone" field
    if (phones.length === 0 && lead.phone) phones.push({ label: "Phone", number: lead.phone });
    // Tag each with its E.164 form + callability so the UI can flag/block un-dialable numbers.
    return phones.map(p => { const e164 = toE164(p.number); return { ...p, e164, callable: !!e164 }; });
  }
  // True when at least one of the lead's numbers can actually be dialed.
  function leadHasCallableNumber(lead) { return getLeadPhones(lead).some(p => p.callable); }

  async function dial(lead, phoneNumber){
    if(!sessRun||callRun||leadStatusEffective(lead)!=="queued"||!callerName) return;
    const num = phoneNumber || getLeadPhones(lead)[0]?.number;
    if (!num) return;
    // Twilio only connects strict E.164 — skip un-normalizable numbers instead of firing a
    // doomed call that the caller would have to mark "Number Error".
    const e164 = toE164(num);
    if (!e164) { console.warn("[Harmonia] skipping un-callable number:", num); return; }
    setActive(lead);setCallRun(true);setCallSecs(0);setTab("script");setOpenObj(null);
    resetCaptureFields();
    setPhoneMenuOpen(false);
    setLastDialedPhone(num);
    setStats(s=>({...s,dials:s.dials+1}));
    // Mint the call's row_id up front so Twilio's recording callback and this call's
    // history row land on the same key (confirmOutcome sends the same id).
    const rid = newRowId(lead.id);
    setCallRowId(rid);
    const url=`https://infoharmonia.app.n8n.cloud/webhook/click_to_call?from=${encodeURIComponent(caller)}&to=${encodeURIComponent(e164)}&row_id=${encodeURIComponent(rid)}`;
    try{ await fetch(url,{method:"GET",mode:"no-cors"}); }
    catch(e){ console.log("Call fired:",e164); }
  }

  function openDispoBar() {
    // The call is ended on the phone, not in the app — opening the dispo bar freezes the
    // live-call timer (keeping the elapsed seconds so the duration is still captured).
    if (callRun) setCallRun(false);
    if (closeEmailStatus==="success" && closeEmail.trim()) {
      setCaptureEmail(closeEmail.trim());
      setPendingOutcome("demo_booked");
    }
    setDispoBarOpen(true);
  }

  // True when an outcome can be logged with the fields we already have — i.e. it needs no
  // extra required input (prospect email / callback date-time). Simple dispositions like
  // No Answer, Voicemail, Gatekeeper or DNC pass immediately, so pressing them = one-click log.
  function outcomeReady(outcome) {
    const meta = OUTCOMES[outcome];
    if (!meta) return false;
    if (meta.needsEmail && !captureEmail.trim()) return false;
    if (meta.needsDateTime && (!callbackDate || !callbackTime)) return false;
    if (meta.needsBooking && !captureEmail.trim()) return false;
    return true;
  }

  function selectOutcome(outcome) {
    if (outcome === "callback") {
      const def = defaultCallbackDateTime();
      setCallbackDate(def.date);
      setCallbackTime(def.time);
    }
    setCalendlyOpened(false);
    // One-click logging: dispositions needing no extra input are submitted the moment they're
    // pressed. Ones that need an email (demo/Loom/info) or a callback time still open the form.
    if (outcomeReady(outcome)) { confirmOutcome(outcome); return; }
    setPendingOutcome(outcome);
  }

  function canSubmit() {
    if (!pendingOutcome) return false;
    const meta = OUTCOMES[pendingOutcome];
    if (meta.needsEmail && !captureEmail.trim()) return false;
    if (meta.needsDateTime && (!callbackDate || !callbackTime)) return false;
    if (meta.needsBooking && !captureEmail.trim()) return false;
    return true;
  }

  async function confirmOutcome(explicitOutcome){
    // Called either from a one-click disposition (explicitOutcome is the outcome string) or as a
    // button onClick handler (first arg is the event → ignore it and fall back to pendingOutcome).
    const outcome = typeof explicitOutcome === "string" ? explicitOutcome : pendingOutcome;
    if(!active||!outcome||!outcomeReady(outcome)) return;
    const meta = OUTCOMES[outcome];
    const dur=callSecs; setCallRun(false); setCallSecs(0);
    const finalPhaseTimes = {...phaseTimes, [callPhase]: phaseTimes[callPhase] + phaseSecs};
    setPhaseSecs(0);

    // Script-used signal — a snapshot of what was actually on screen, not a manual dropdown:
    //  • Blank canvas → save the raw canvas script the caller was working from (tokens kept raw).
    //  • Phases       → FULL snapshot: active opener + every phase/section selection + flipped
    //                   A/B toggles, so the sheet records exactly the option set that was live.
    const scriptUsed = (() => {
      if (scriptMode === "blank") {
        const canvas = (blankScripts[callerName || "_default"] || "").trim();
        return canvas ? `Blank canvas: ${canvas}` : "Blank canvas (empty)";
      }
      const vKey = curScripts[variant] ? variant : Object.keys(curScripts)[0];
      const script = curScripts[vKey];
      const opener = script?.lines?.find(l => l.type === "opener");
      const name = opener?.name || script?.name;
      const openerLabel = vKey
        ? (name ? `${active.icp}-${vKey}: ${name}` : `${active.icp}-${vKey}`)
        : `${active.icp} phases`;
      // Every per-phase / per-section variant pick (opener already shown in the label).
      const sel = Object.entries(phaseSelections)
        .filter(([k, v]) => k !== "opener" && v !== "" && v != null)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      // Only the A/B toggles the caller flipped to B (A is the default).
      const ab = Object.entries(abChoice)
        .filter(([, v]) => v === "B")
        .map(([k]) => k)
        .join(", ");
      return [openerLabel, sel && `sel{${sel}}`, ab && `ab{${ab}}`]
        .filter(Boolean)
        .join(" · ");
    })();

    const objection = customObjection.trim() || objectionRaised;

    const callbackISO = (outcome === "callback" && callbackDate && callbackTime)
      ? new Date(`${callbackDate}T${callbackTime}`).toISOString()
      : null;

    // Snapshot for undo
    const prevLead = leads.find(l=>l.id===active.id);
    const prevStats = {...stats};
    const prevLog = [...log];

    setLog(l=>[{num:stats.dials,biz:active.biz,icp:active.icp,script:scriptUsed,outcome,dur,
      ts:new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}),
      email:captureEmail||null},...l]);

    setStats(s=>({
      ...s,
      answered:(outcome==="answered"||outcome==="demo_booked")?s.answered+1:s.answered,
      demos:   outcome==="demo_booked"?s.demos+1:s.demos,
      vm:      outcome==="voicemail"?s.vm+1:s.vm,
      looms:   outcome==="loom_sent"?s.looms+1:s.looms,
    }));

    const newCallCount = (active.call_count || 0) + 1;
    const newTimestamp = new Date().toISOString();
    setLeads(ls=>ls.map(l=>l.id===active.id?{...l,
      // A lead stays in the queue and fully dialable no matter the outcome — only an
      // explicit "yes" (demo booked) or "never call again" (DNC) retires it from the OS.
      status: outcome==="demo_booked"?"demo_booked"
            : outcome==="dnc"?"dnc"
            : "queued",
      script_used:scriptUsed,
      prospect_email: captureEmail || l.prospect_email || "",
      pain: hasDiscoveryInput ? livePain : l.pain,
      call_count: newCallCount,
      last_call_timestamp: newTimestamp,
      disposition: outcome,
      spoke_with: spokeWith || l.spoke_with || "",
    }:l));

    // Demo booked = they said yes → auto-claim the lead for this caller
    if (outcome==="demo_booked" && callerName) claimFor(active.id, callerName);

    // Append to shared call history immediately (optimistic update)
    setCallHistory(prev => {
      const lid = active.id;
      const entry = {
        caller: callerName || "Unknown",
        outcome,
        duration: dur,
        variant: scriptUsed,
        timestamp: newTimestamp,
        notes: captureNotes || "",
        spoke_with: spokeWith || "",
      };
      return {...prev, [lid]: [entry, ...(prev[lid] || [])]};
    });
    // Re-fetch from sheet after n8n has time to write the row
    setTimeout(() => refreshCallHistory(), 5000);

    const flashMsg = outcome==="demo_booked"?"Demo booked ✦"
      :outcome==="loom_sent"?"Loom queued → Discord pinged"
      :outcome==="callback"?(()=>{const d=new Date(`${callbackDate}T${callbackTime}`);return `Callback set: ${d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})} at ${d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}`;})()
      :OUTCOMES[outcome]?.label||"Logged";
    setFlash(flashMsg);

    // Save undo snapshot (available for 5s)
    const undoSnapshot = {leadId:active.id, prevStatus:prevLead?.status||"queued", prevScriptUsed:prevLead?.script_used||null, prevEmail:prevLead?.prospect_email||"", prevStats, prevLog};
    setUndoLast(undoSnapshot);
    setTimeout(()=>setUndoLast(u=>u===undoSnapshot?null:u),5000);
    setTimeout(()=>setFlash(null),5000);

    try {
      // Reuse the id minted when this lead was dialed so Twilio's recording joins to this row.
      // Only if it was minted for THIS lead — otherwise (manual dial, or a stale id from the
      // previously-selected lead) mint a fresh one. Never blank: blank ids would all collide.
      const rowId = (callRowId && callRowId.startsWith(`${active.id}-`)) ? callRowId : newRowId(active.id);
      setCallRowId("");   // consumed — a later log on this lead mints its own id
      const payload = {
        row_id:rowId,
        lead_id:active.id, biz:active.biz, owner:active.owner, phone:lastDialedPhone||active.mobile_phone||active.corporate_phone||active.home_phone||active.phone,
        city:active.city, state:active.state, icp:active.icp,
        disposition:outcome, status:meta.ghl||"called",
        ghl_stage:meta.ghl||null, discord_channel:meta.discord||null,
        script_used:scriptUsed, call_duration:dur,
        call_timestamp:new Date().toISOString(), call_link:'',
        objection_raised:objection, caller_name:callerName,
        prospect_email:captureEmail||null, prospect_phone:capturePhone||null,
        notes:captureNotes||null, spoke_with:spokeWith||null,
        calendly_opened:outcome==="demo_booked"?calendlyOpened:null,
        loom_context:outcome==="loom_sent"?(loomContext||`Pain: ${hasDiscoveryInput?livePain:active.pain}/10. ${(active.pain_signals||[]).slice(0,2).join(". ")}`):null,
        loom_queued:outcome==="loom_sent"?true:null,
        callback_datetime:callbackISO,
        send_type:outcome==="followup_sent"?sendType:null,
        gatekeeper_name:outcome==="gatekeeper"?gatekeeperName:null,
        discovery_signals:Object.keys(discoveryResponses).length>0?discoveryResponses:null,
        pain_score:hasDiscoveryInput?livePain:active.pain,
        phase_times:finalPhaseTimes, total_time:dur,
        call_count:newCallCount, last_call_timestamp:newTimestamp,
      };
      payload.competitor = active.competitor || "";
      fetch(WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      fetch(DISCORD_WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{});
      // High-value outcome → direct Discord notification
      if (["demo_booked","loom_sent","followup_sent"].includes(outcome)) {
        const emoji = outcome==="demo_booked"?"🎯":outcome==="loom_sent"?"🎥":"📧";
        const label = OUTCOMES[outcome]?.label || outcome;
        fetch("https://discord.com/api/webhooks/1490887089812672612/AaHbR7e7xDC6cWp_FDLHXVwDPQy-vFrZSjrz_QwrfYSj7i5RFKFCOvNlXeDLdqfYHhzy", {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ content: `${emoji} **${label}** — ${active.biz}${active.owner?` (${active.owner})`:""}${active.city?`, ${active.city}`:""}\nCaller: ${callerName||"Unknown"} | Script: ${scriptUsed} | Duration: ${fmt(dur)}${captureEmail?`\nEmail: ${captureEmail}`:""}${captureNotes?`\nNotes: ${captureNotes}`:""}` })
        }).catch(()=>{});
      }
      // Number Error → hand the lead to the investigator: it auto-fixes a fixable phone in
      // Leads OS, otherwise pings Discord for Javi to decide (delete / enrich / find another).
      if (outcome === "number_error") {
        fetch(NUMBER_ERROR_WEBHOOK, {method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ lead_id:active.id, biz:active.biz, owner:active.owner,
            city:active.city, state:active.state, icp:active.icp, caller_name:callerName||"Unknown",
            mobile_phone:active.mobile_phone||"", corporate_phone:active.corporate_phone||"",
            home_phone:active.home_phone||"", phone:active.phone||"" })
        }).catch(()=>{});
      }
    } catch(err){ console.error('webhook failed:',err); }

    resetCaptureFields();
    setDispoBarOpen(false);
    // Advance to the next queued lead *below* the current one (only wrap to the top if none remain
    // below), and keep the queue scrolled where the caller left off.
    preserveScrollRef.current = queueScrollRef.current ? queueScrollRef.current.scrollTop : null;
    const curIdx = filtered.findIndex(l=>l.id===active.id);
    const next = filtered.slice(curIdx+1).find(l=>leadStatusEffective(l)==="queued")
              || filtered.find(l=>l.id!==active.id&&leadStatusEffective(l)==="queued");
    if(next){selectLead(next);setTab("intel");}
    // Sheets write handled by n8n webhook above
  }

  function resetCaptureFields() {
    setPendingOutcome(null);
    setObjectionRaised("");setCustomObjection("");
    setCaptureEmail("");setCapturePhone("");setCaptureNotes("");
    setCallbackDate("");setCallbackTime("");
    setGatekeeperName("");setLoomContext("");
    setSendType("website");setCalendlyOpened(false);
    setDiscoveryResponses({});
    setCloseEmail("");setCloseEmailStatus(null);
    setPhaseSecs(0);setPhaseTimes({opener:0,discovery:0,pitch:0,close:0});
    setSpokeWith("");
  }

  function resetCallState() {
    setCallRun(false);setCallSecs(0);
    resetCaptureFields();
  }

  // ── Lead ownership ──
  function persistClaims(next) {
    try { localStorage.setItem("harmonia-claimed-leads", JSON.stringify(next)); } catch {}
  }
  function claimFor(leadId, name) {
    if (!leadId || !name) return;
    setClaimedLeads(prev => {
      if (prev[leadId] === name) return prev;
      const next = {...prev, [leadId]: name};
      persistClaims(next);
      fetch(WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({type:'lead_claim',lead_id:leadId,caller_name:name,claimed:true})}).catch(()=>{});
      return next;
    });
  }
  function toggleClaim(leadId) {
    if (!callerName) { window.alert("Select your caller name at the top first — then you can claim leads as yours."); return; }
    setClaimedLeads(prev => {
      const next = {...prev};
      const claimed = next[leadId] !== callerName;
      if (claimed) next[leadId] = callerName; else delete next[leadId];
      persistClaims(next);
      fetch(WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({type:'lead_claim',lead_id:leadId,caller_name:claimed?callerName:null,claimed})}).catch(()=>{});
      return next;
    });
  }

  function openCalendly() {
    const url = `${CALENDLY_URL}?name=${encodeURIComponent(active.owner)}&email=${encodeURIComponent(captureEmail)}&a1=${encodeURIComponent(active.biz)}`;
    window.open(url, "_blank");
    setCalendlyOpened(true);
  }

  function captureCloseEmail() {
    const email = closeEmail.trim();
    if (!email || !email.includes("@") || !email.split("@")[1]?.includes(".")) {
      setCloseEmailStatus("error");
      setTimeout(()=>setCloseEmailStatus(s=>s==="error"?null:s),600);
      return;
    }
    setCaptureEmail(email);
    setLeads(ls=>ls.map(l=>l.id===active.id?{...l,prospect_email:email}:l));
    setActive(a=>({...a,prospect_email:email}));
    selectOutcome("demo_booked");
    setCloseEmailStatus("success");
    setTimeout(()=>setCloseEmailStatus(s=>s==="success"?null:s),3000);
  }

  function undoLastDisposition() {
    if (!undoLast) return;
    const {leadId, prevStatus, prevScriptUsed, prevEmail, prevStats, prevLog} = undoLast;
    setLeads(ls=>ls.map(l=>l.id===leadId?{...l, status:prevStatus, script_used:prevScriptUsed, prospect_email:prevEmail}:l));
    setStats(prevStats);
    setLog(prevLog);
    const undoLead = leads.find(l=>l.id===leadId)||active;
    selectLead(undoLead);
    setUndoLast(null);
    setFlash("Undone — pick the right disposition");
    setTimeout(()=>setFlash(null),2000);
  }

  return (
    <div style={{background:C.bg,height:"100vh",width:"100vw",display:"flex",flexDirection:"column",
      fontFamily:F,fontSize:13,color:C.t1,overflow:"hidden",margin:0,padding:0}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
        button,select{font-family:${F};cursor:pointer}
        @keyframes slideDown{from{transform:translateY(-8px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(29,29,31,0.3)}50%{box-shadow:0 0 0 8px rgba(29,29,31,0)}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-4px)}40%,80%{transform:translateX(4px)}}
        @keyframes livePulse{0%{box-shadow:0 0 0 0 rgba(74,158,237,0.45)}70%{box-shadow:0 0 0 6px rgba(74,158,237,0)}100%{box-shadow:0 0 0 0 rgba(74,158,237,0)}}
        a{color:${C.accent};text-decoration:none}a:hover{text-decoration:underline}
      `}</style>

      {flash&&<div style={{position:"fixed",top:18,left:"50%",transform:"translateX(-50%)",
        background:C.t1,color:C.bg,padding:"9px 22px",borderRadius:100,fontSize:13,fontWeight:500,
        zIndex:9999,boxShadow:"0 2px 14px rgba(28,61,82,0.10)",animation:"slideDown 0.2s ease",
        display:"flex",alignItems:"center",gap:12}}>
        {flash}
        {undoLast&&<button onClick={undoLastDisposition}
          style={{background:"transparent",border:`0.75px solid ${C.bg}50`,color:C.bg,
            padding:"2px 10px",borderRadius:100,fontSize:11,fontWeight:500,cursor:"pointer",
            marginLeft:4}}>Undo</button>}
      </div>}

      {/* ── HEADER ── */}
      <div style={{borderBottom:`0.75px solid ${C.border}`,padding:"0 20px",display:"flex",
        alignItems:"center",gap:22,height:52,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <RingMark size={18} stroke={C.accent} index={false} phrase={null} outer={false} dim={0.95}/>
          <span style={{display:"flex",alignItems:"baseline",gap:9}}>
            <span style={{fontSize:15,fontWeight:600,letterSpacing:"0.14em",color:C.accent}}>HARMONIA</span>
            <span style={{fontSize:11,color:C.t2}}>Cold caller</span>
          </span>
        </div>
        <div style={{width:1,height:18,background:C.border}}/>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <span style={{fontSize:11,color:C.t3}}>Caller</span>
          <span style={{fontSize:12,fontWeight:600,color:C.t1}}>{callerName}</span>
          <button onClick={logout} title="Log out / switch caller"
            style={{marginLeft:2,padding:"3px 9px",borderRadius:6,border:`0.75px solid ${C.border}`,
              background:"transparent",color:C.t2,fontSize:10,fontWeight:500,cursor:"pointer"}}>
            Log out
          </button>
        </div>
        <div style={{width:1,height:18,background:C.border}}/>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          {sessRun&&<span title="Live session" style={{width:7,height:7,borderRadius:"50%",
            background:C.accent,flexShrink:0,animation:"livePulse 2.2s ease-out infinite"}}/>}
          <span style={{fontSize:17,fontWeight:400,letterSpacing:"0.04em",fontFamily:FM,
            color:sessRun?C.t1:C.t3,minWidth:68}}>{fmtH(sessSecs)}</span>
          <button onClick={sessRun?endSess:startSess}
            style={{padding:"4px 14px",borderRadius:6,
              border:`0.75px solid ${sessRun?C.red:C.accent}`,background:"transparent",
              color:sessRun?C.red:C.accent,fontSize:11,fontWeight:500}}>
            {sessRun?"End":"Start session"}
          </button>
        </div>
        <div style={{width:1,height:18,background:C.border}}/>
        {[{l:"Dials",v:stats.dials,c:C.t1},{l:"Connect",v:stats.dials>0?connectRate+"%":"—",c:C.t1},
          {l:"Demos",v:stats.demos,c:C.green},
          {l:"Looms",v:stats.looms,c:C.teal}
        ].map(({l,v,c})=>(
          <div key={l} style={{textAlign:"center"}}>
            <div style={{fontSize:16,fontWeight:400,color:c,lineHeight:1,fontFamily:FM}}>{v}</div>
            <div style={{fontSize:10,color:C.t3,marginTop:2}}>{l}</div>
          </div>
        ))}
        <div style={{flex:1}}/>
        <div style={{fontSize:11,color:C.t3}}>
          {new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}
        </div>
        <div style={{width:1,height:18,background:C.border}}/>
        {SHOW_LEADERBOARD && (
        <button onClick={()=>setMainView("leaderboard")}
          style={{padding:"4px 10px",borderRadius:6,
            border:`0.75px solid ${C.border}`,background:"transparent",
            color:C.t2,fontSize:10,fontWeight:500,cursor:"pointer",transition:"all 0.15s"}}>
          Leaderboard
        </button>
        )}
        <button onClick={()=>setShowStatsPanel(v=>!v)}
          style={{padding:"4px 10px",borderRadius:6,
            border:`0.75px solid ${showStatsPanel?C.t1:C.border}`,
            background:showStatsPanel?C.t1:"transparent",
            color:showStatsPanel?C.bg:C.t2,
            fontSize:10,fontWeight:500,transition:"all 0.15s"}}>
          {showStatsPanel?"Hide stats":"Stats & log"}
        </button>
        {callerName==="Javi"&&(
          <>
            <div style={{width:1,height:18,background:C.border}}/>
            <button onClick={()=>setShowAdminPanel(true)}
              style={{padding:"4px 10px",borderRadius:6,
                border:`0.75px solid ${C.border}`,background:"transparent",
                color:C.t2,fontSize:10,fontWeight:500,cursor:"pointer",
                transition:"all 0.15s"}}>
              Admin
            </button>
          </>
        )}
      </div>

      {/* ── LEADERBOARD (top-level view) ── */}
      {SHOW_LEADERBOARD && mainView==="leaderboard" && (
        <div style={{position:"fixed",inset:0,zIndex:8000,background:C.bg,
          display:"flex",flexDirection:"column"}}>
          {/* Leaderboard header */}
          <div style={{borderBottom:`0.75px solid ${C.border}`,padding:"0 20px",display:"flex",
            alignItems:"center",gap:14,height:52,flexShrink:0}}>
            <span style={{fontSize:14,fontWeight:500,letterSpacing:"-0.01em"}}>Leaderboard</span>
            <span style={{fontSize:11,color:C.t3}}>All callers · from shared call history</span>
            <div style={{flex:1}}/>
            <button onClick={()=>setMainView("workspace")}
              style={{padding:"4px 12px",borderRadius:6,border:`0.75px solid ${C.border}`,
                background:"transparent",color:C.t2,fontSize:11,fontWeight:500,cursor:"pointer"}}>
              ← Back to caller
            </button>
          </div>
          {/* Table */}
          <div style={{flex:1,overflowY:"auto",padding:"28px 20px"}}>
            {(()=>{
              const COLS = "44px 1fr 110px 110px";
              const agg = {};
              CALLER_ROSTER.filter(c => !LEADERBOARD_EXCLUDE.has(c)).forEach(c => { agg[c] = { dials:0, booked:0 }; });
              // Dials + Booked from the shared call-history log
              Object.values(callHistory).flat().forEach(e => {
                const c = (e.caller||"").trim();
                if (!c || c === "#NAME?") return;           // skip junk/formula-error callers
                if (LEADERBOARD_EXCLUDE.has(c)) return;      // skip excluded (admins/owners)
                if (!agg[c]) agg[c] = { dials:0, booked:0 };
                agg[c].dials++;
                if (e.outcome === "demo_booked") agg[c].booked++;
              });
              // Overlay the active caller's LIVE session — the shared history log only gains a
              // row once a disposition is logged + the n8n webhook writes it, so mid-session it
              // lags behind real dials. max() keeps all-time history when it's already higher.
              if (callerName && agg[callerName]) {
                agg[callerName].dials  = Math.max(agg[callerName].dials,  stats.dials);
                agg[callerName].booked = Math.max(agg[callerName].booked, stats.demos);
              }
              const rows = Object.entries(agg)
                .map(([caller,s]) => ({ caller, ...s }))
                .sort((a,b) => b.booked-a.booked || b.dials-a.dials);
              return (
                <div style={{maxWidth:760,margin:"0 auto"}}>
                  {/* column headers */}
                  <div style={{display:"grid",gridTemplateColumns:COLS,padding:"0 16px 10px",
                    borderBottom:`0.75px solid ${C.border}`}}>
                    {["#","Caller","Dials","Booked"].map((h,i)=>(
                      <div key={h} style={{fontSize:10,color:C.t3,fontWeight:600,letterSpacing:"0.05em",
                        textTransform:"uppercase",textAlign:i<2?"left":"right"}}>{h}</div>
                    ))}
                  </div>
                  {rows.map((r,i)=>(
                    <div key={r.caller} style={{display:"grid",gridTemplateColumns:COLS,alignItems:"center",
                      padding:"15px 16px",borderBottom:`0.75px solid ${C.border}`,
                      background:i===0&&r.dials>0?`${C.green}08`:"transparent"}}>
                      <div style={{fontSize:13,fontWeight:600,color:i===0&&r.dials>0?C.green:C.t3}}>{i+1}</div>
                      <div style={{fontSize:14,fontWeight:500,color:C.t1}}>{r.caller}</div>
                      <div style={{textAlign:"right",fontFamily:FM,fontSize:14,color:C.t1}}>{r.dials}</div>
                      <div style={{textAlign:"right",fontFamily:FM,fontSize:14,fontWeight:600,
                        color:r.booked?C.green:C.t3}}>{r.booked}</div>
                    </div>
                  ))}
                  {/* footnote */}
                  <div style={{marginTop:18,fontSize:11,color:C.t3,lineHeight:1.6}}>
                    <div>Dials &amp; Booked come from the shared call history{callerName?`; your row (${callerName}) reflects your live session in real time`:""}.</div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── BODY ── */}
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>

        {/* ── QUEUE ── */}
        <div style={{width:244,borderRight:`0.75px solid ${C.border}`,
          display:"flex",flexDirection:"column",flexShrink:0}}>
          {(()=>{
            const activeCount = (filter!=="all"?1:0)+(phoneFilter!=="all"?1:0)+(emailedFilter!=="all"?1:0)+(starFilter!=="all"?1:0);
            return (
          <div style={{borderBottom:`0.75px solid ${C.border}`}}>
            {/* Filter toggle button — all filters live behind this */}
            <div style={{padding:"9px 10px",display:"flex",alignItems:"center",gap:6}}>
              <button onClick={()=>setFiltersOpen(o=>!o)}
                style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:100,
                  border:`0.75px solid ${activeCount||filtersOpen?C.t1:C.border}`,
                  background:activeCount?C.t1:"transparent",
                  color:activeCount?C.bg:C.t2,fontSize:10,fontWeight:500,cursor:"pointer",transition:"all 0.12s"}}>
                <span>Filter{activeCount?` · ${activeCount}`:""}</span>
                <span style={{fontSize:8,opacity:0.7}}>{filtersOpen?"▲":"▼"}</span>
              </button>
              {activeCount>0&&(
                <button onClick={()=>{setFilter("all");setPhoneFilter("all");setEmailedFilter("all");setStarFilter("all");}}
                  style={{background:"none",border:"none",padding:0,cursor:"pointer",
                    color:C.t3,fontSize:10,fontWeight:500}}>Clear</button>
              )}
            </div>
            {filtersOpen&&(
              <div style={{padding:"0 10px 10px",display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {FILTER_GROUPS.filter(f=>f==="all"||!disabledIcps.has(f)).map(f=>(
                    <button key={f} onClick={()=>setFilter(f)}
                      style={{padding:"3px 10px",borderRadius:100,
                        border:`0.75px solid ${filter===f?C.t1:C.border}`,
                        background:filter===f?C.t1:"transparent",
                        color:filter===f?C.bg:C.t2,fontSize:10,fontWeight:500,transition:"all 0.12s"}}>
                      {f==="all"?"All":GROUP_LABEL[f]}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  <span style={{fontSize:9,color:C.t3,width:38,flexShrink:0}}>Starred</span>
                  {[["all","All"],["starred","★ Starred"]].map(([v,lbl])=>(
                    <button key={v} onClick={()=>setStarFilter(v)}
                      style={{padding:"2px 8px",borderRadius:100,
                        border:`0.75px solid ${starFilter===v?C.amber:C.border}`,
                        background:starFilter===v?C.amber:"transparent",
                        color:starFilter===v?C.bg:C.t2,fontSize:9,fontWeight:500,transition:"all 0.12s"}}>
                      {lbl}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  <span style={{fontSize:9,color:C.t3,width:38,flexShrink:0}}>Phone</span>
                  {[["all","All"],["mobile","Mobile"],["corporate","Corp"]].map(([v,lbl])=>(
                    <button key={v} onClick={()=>setPhoneFilter(v)}
                      style={{padding:"2px 8px",borderRadius:100,
                        border:`0.75px solid ${phoneFilter===v?C.t1:C.border}`,
                        background:phoneFilter===v?C.t1:"transparent",
                        color:phoneFilter===v?C.bg:C.t2,fontSize:9,fontWeight:500,transition:"all 0.12s"}}>
                      {lbl}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  <span style={{fontSize:9,color:C.t3,width:38,flexShrink:0}}>Email</span>
                  {[["all","All"],["not","New"],["emailed","Emailed"]].map(([v,lbl])=>(
                    <button key={v} onClick={()=>setEmailedFilter(v)}
                      style={{padding:"2px 8px",borderRadius:100,
                        border:`0.75px solid ${emailedFilter===v?C.t1:C.border}`,
                        background:emailedFilter===v?C.t1:"transparent",
                        color:emailedFilter===v?C.bg:C.t2,fontSize:9,fontWeight:500,transition:"all 0.12s"}}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
            );
          })()}
          <div style={{padding:"7px 14px 5px",display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:11,color:C.t3}}>{queueLeft} remaining</span>
            <span style={{fontSize:11,color:C.t3}}>{filtered.length} total</span>
          </div>
          <div ref={queueScrollRef} style={{flex:1,overflowY:"auto"}}>
            {filtered.length === 0 && (
              <div style={{padding:20,textAlign:"center",fontSize:11,color:C.t3}}>
                {activeLeads.length === 0
                  ? <>No leads in sheet yet.<br/>Add rows to the Leads tab.</>
                  : <>No leads match these filters.</>}
              </div>
            )}
            {filtered.map(lead=>{
              const isActive=active?.id===lead.id;
              const effStatus=leadStatusEffective(lead), isDone=effStatus!=="queued";
              const noCallable=!isDone&&!leadHasCallableNumber(lead);
              return (
                <div key={lead.id} onClick={()=>selectLead(lead)}
                  style={{padding:"9px 14px",cursor:isDone?"default":"pointer",
                    opacity:isDone?0.38:1,borderBottom:`0.75px solid ${C.border}`,
                    borderLeft:isActive?`2px solid ${C.t1}`:"2px solid transparent",
                    background:isActive?C.surface:"transparent",transition:"background 0.1s",
                    textAlign:"left"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                    <div style={{width:6,height:6,borderRadius:"50%",
                      background:SCORE_DOT[lead.score]||C.t3,flexShrink:0}}/>
                    <span style={{fontSize:11,fontWeight:500,flex:1,lineHeight:1.3}}>{lead.biz}</span>
                    <button
                      onClick={(e)=>{e.stopPropagation();toggleStar(lead.id);}}
                      title={starredLeads[lead.id]?"Unstar lead":"Star lead"}
                      style={{background:"none",border:"none",padding:0,cursor:"pointer",lineHeight:1,
                        fontSize:13,flexShrink:0,transition:"color 0.12s",
                        color:starredLeads[lead.id]?C.amber:C.t3}}>
                      {starredLeads[lead.id]?"★":"☆"}
                    </button>
                  </div>
                  <div style={{paddingLeft:12}}>
                    <div style={{fontSize:11,color:C.t2}}>{lead.owner}</div>
                    <div style={{fontSize:10,color:C.t3,marginTop:1}}>
                      {ICP_LABEL[lead.icp]||lead.icp} · {lead.city}
                      {lead.competitor&&<span style={{color:C.t3}}> · vs. {lead.competitor}</span>}
                    </div>
                    {claimedLeads[lead.id]&&(
                      <div style={{marginTop:3,display:"inline-flex",alignItems:"center",gap:3,
                        fontSize:9,fontWeight:600,borderRadius:4,padding:"1px 6px",
                        color:claimedLeads[lead.id]===callerName?C.accent:C.purple,
                        background:(claimedLeads[lead.id]===callerName?C.accent:C.purple)+"15"}}>
                        ★ {claimedLeads[lead.id]===callerName?"Mine":claimedLeads[lead.id]}
                      </div>
                    )}
                    {/* No dialable number — flag it so callers skip instead of burning a dial +
                        a false Number-Error tag. Twilio can't connect a non-E.164 number. */}
                    {noCallable&&(
                      <div style={{marginTop:3,fontSize:10,fontWeight:500,color:C.amber}}>
                        ⚠ Number not callable
                      </div>
                    )}
                    {/* Retired leads (demo booked / DNC) show a label; merely-called leads stay
                        visually identical to fresh ones — "called" is surfaced in the main panel,
                        not the sidebar. */}
                    {isDone&&(
                      <div style={{marginTop:3,fontSize:10,fontWeight:500,
                        color:effStatus==="demo_booked"?C.green:C.red}}>
                        {effStatus==="demo_booked"?"✦ Demo booked":"⛔ Do not call"}
                        {effStatus==="demo_booked"&&lead.script_used&&<span style={{color:C.t3,fontWeight:400}}> · Script {lead.script_used.toUpperCase()}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── CENTER ── */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
          {active ? (
            <>
              {/* Lead header */}
              <div style={{padding:"13px 20px",borderBottom:`0.75px solid ${C.border}`,
                background:C.surface,display:"flex",alignItems:"flex-start",
                gap:16,flexShrink:0}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,flexWrap:"wrap"}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:SCORE_DOT[active.score]||C.t3}}/>
                    <span style={{fontSize:11,color:C.t3}}>
                      {ICP_LABEL[active.icp]||active.icp} · Score {active.score} · Pain <span style={painStyle(displayPain(active))}>{displayPain(active)}/10</span>
                    </span>
                    {active.website ? (
                      <>
                        <span style={{fontSize:11,color:C.border}}>·</span>
                        <a href={active.website} target="_blank" rel="noreferrer"
                          style={{fontSize:11,color:C.accent,display:"flex",alignItems:"center",gap:3}}
                          onClick={e=>e.stopPropagation()}>
                          ↗ {active.website.replace(/^https?:\/\//,"").replace(/\/$/,"")}
                        </a>
                      </>
                    ):null}
                    {(()=>{ const owner=claimedLeads[active.id]; const mine=owner===callerName; return (
                      <button onClick={()=>toggleClaim(active.id)}
                        title={owner?(mine?"Claimed by you — click to release":`Claimed by ${owner} — click to take over`):"Claim this lead as yours"}
                        style={{marginLeft:2,padding:"2px 10px",borderRadius:100,fontSize:10,fontWeight:600,cursor:"pointer",
                          border:`0.75px solid ${owner?(mine?C.accent:C.purple):C.border}`,
                          background:owner?((mine?C.accent:C.purple)+"12"):"transparent",
                          color:owner?(mine?C.accent:C.purple):C.t3,transition:"all 0.15s"}}>
                        {owner?(mine?"★ Mine":`★ ${owner}`):"☆ Claim"}
                      </button>
                    ); })()}
                  </div>
                  <div style={{fontSize:18,fontWeight:500,letterSpacing:"-0.01em",marginBottom:3,
                    whiteSpace:"normal",wordBreak:"break-word"}}>
                    {active.biz}
                  </div>
                  <div style={{fontSize:12,color:C.t2,whiteSpace:"nowrap"}}>
                    {active.owner}&nbsp;·&nbsp;{getLeadPhones(active).map((p,i)=>(
                      <span key={i}>{i>0?" · ":""}<span style={{color:C.t3,fontSize:10}}>{p.label}:</span> {p.number}</span>
                    ))}&nbsp;·&nbsp;{active.city}{active.state?`, ${active.state}`:""}
                  </div>
                </div>

                {/* Call controls */}
                <div style={{display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
                  {(()=>{
                    const eff=leadStatusEffective(active);
                    const calledBefore=(callHistory[active.id]?.length||0)>0;
                    const canDial=sessRun&&eff==="queued"&&!!callerName;
                    const phones=getLeadPhones(active);
                    // Only E.164-normalizable numbers connect on Twilio — everything else is a
                    // wasted dial + a false "Number Error", so gate the dial buttons on callability.
                    const dialable=phones.filter(p=>p.callable);
                    const noneCallable=phones.length>0&&dialable.length===0;
                    const primaryDialNum=(dialable[0]||phones[0])?.number;
                    if(!callRun&&!pendingOutcome) {
                      const btnLabel=eff==="demo_booked"?"Demo booked":eff==="dnc"?"Do not call":!callerName?"Select caller":!sessRun?"Start session":noneCallable?"Bad number":calledBefore?"Dial again":"Dial";
                      const canDialNow=canDial&&!noneCallable;
                      if(phones.length<=1) return (
                        <button onClick={()=>dial(active,primaryDialNum)}
                          disabled={!canDialNow}
                          title={noneCallable?`Un-callable number: ${phones[0]?.number||"—"}`:undefined}
                          style={{padding:"7px 22px",borderRadius:8,
                            border:`0.75px solid ${canDialNow?C.t1:noneCallable?C.amber:C.border}`,
                            background:canDialNow?C.t1:"transparent",
                            color:canDialNow?C.bg:noneCallable?C.amber:C.t3,
                            fontSize:12,fontWeight:500,
                            cursor:canDialNow?"pointer":"not-allowed",
                            transition:"all 0.15s"}}>
                          {noneCallable?"⚠ Bad number":btnLabel}
                        </button>
                      );
                      // Multiple phones — dial button + dropdown
                      return (
                        <div style={{position:"relative",display:"inline-block"}}>
                          <div style={{display:"flex",alignItems:"stretch"}}>
                            <button onClick={()=>dial(active,primaryDialNum)}
                              disabled={!canDialNow}
                              style={{padding:"7px 16px",borderRadius:"8px 0 0 8px",
                                border:`0.75px solid ${canDialNow?C.t1:noneCallable?C.amber:C.border}`,borderRight:"none",
                                background:canDialNow?C.t1:"transparent",
                                color:canDialNow?C.bg:noneCallable?C.amber:C.t3,
                                fontSize:12,fontWeight:500,
                                cursor:canDialNow?"pointer":"not-allowed",
                                transition:"all 0.15s"}}>
                              {noneCallable?"⚠ Bad number":btnLabel}
                            </button>
                            <button onClick={()=>{ if(canDial) setPhoneMenuOpen(v=>!v); }}
                              disabled={!canDial}
                              style={{padding:"7px 8px",borderRadius:"0 8px 8px 0",
                                border:`0.75px solid ${canDial?C.t1:C.border}`,
                                background:canDial?C.t1:"transparent",
                                color:canDial?C.bg:C.t3,
                                fontSize:10,fontWeight:500,
                                cursor:canDial?"pointer":"not-allowed",
                                transition:"all 0.15s"}}>
                              ▾
                            </button>
                          </div>
                          {phoneMenuOpen&&canDial&&(
                            <div style={{position:"absolute",top:"100%",right:0,marginTop:4,
                              background:C.bg,border:`0.75px solid ${C.border}`,borderRadius:8,
                              boxShadow:"0 2px 12px rgba(28,61,82,0.08)",zIndex:50,minWidth:200,
                              overflow:"hidden"}}>
                              {phones.map((p,i)=>(
                                <button key={i} onClick={()=>{ if(p.callable) dial(active,p.number); }}
                                  disabled={!p.callable}
                                  title={p.callable?undefined:"Un-callable number — bad format"}
                                  style={{display:"block",width:"100%",textAlign:"left",
                                    padding:"9px 14px",border:"none",background:"transparent",
                                    cursor:p.callable?"pointer":"not-allowed",fontSize:12,
                                    color:p.callable?C.t1:C.t3,
                                    borderBottom:i<phones.length-1?`0.75px solid ${C.border}`:"none"}}
                                  onMouseEnter={e=>{ if(p.callable) e.currentTarget.style.background=C.surface; }}
                                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                  <span style={{fontWeight:500}}>{p.label}</span>
                                  <span style={{color:p.callable?C.t2:C.t3,marginLeft:8}}>{p.number}</span>
                                  {!p.callable&&<span style={{color:C.amber,marginLeft:6,fontSize:10}}>⚠</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }
                    // During the call the Dial button is replaced by a filled "End Call" button;
                    // pressing it brings up the dispositions. (The call is ended on the phone.)
                    if(callRun) return (
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        {phones.length>1&&(
                          <div style={{position:"relative",display:"inline-block"}}>
                            <button onClick={()=>setPhoneMenuOpen(v=>!v)}
                              style={{padding:"7px 12px",borderRadius:8,
                                border:`0.75px solid ${C.border}`,background:"transparent",
                                color:C.t2,fontSize:11,cursor:"pointer"}}>
                              Try another #
                            </button>
                            {phoneMenuOpen&&(
                              <div style={{position:"absolute",top:"100%",right:0,marginTop:4,
                                background:C.bg,border:`0.75px solid ${C.border}`,borderRadius:8,
                                boxShadow:"0 2px 12px rgba(28,61,82,0.08)",zIndex:50,minWidth:200,
                                overflow:"hidden"}}>
                                {phones.filter(p=>p.number!==lastDialedPhone).map((p,i,arr)=>(
                                  <button key={i} onClick={()=>{
                                      if(!p.callable) return;
                                      setLastDialedPhone(p.number);setPhoneMenuOpen(false);
                                      const rid=newRowId(active?.id);
                                      setCallRowId(rid);
                                      const url=`https://infoharmonia.app.n8n.cloud/webhook/click_to_call?from=${encodeURIComponent(caller)}&to=${encodeURIComponent(p.e164)}&row_id=${encodeURIComponent(rid)}`;
                                      fetch(url,{method:"GET",mode:"no-cors"}).catch(()=>{});
                                    }}
                                    disabled={!p.callable}
                                    title={p.callable?undefined:"Un-callable number — bad format"}
                                    style={{display:"block",width:"100%",textAlign:"left",
                                      padding:"9px 14px",border:"none",background:"transparent",
                                      cursor:p.callable?"pointer":"not-allowed",fontSize:12,
                                      color:p.callable?C.t1:C.t3,
                                      borderBottom:i<arr.length-1?`0.75px solid ${C.border}`:"none"}}
                                    onMouseEnter={e=>{ if(p.callable) e.currentTarget.style.background=C.surface; }}
                                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                    <span style={{fontWeight:500}}>{p.label}</span>
                                    <span style={{color:p.callable?C.t2:C.t3,marginLeft:8}}>{p.number}</span>
                                    {!p.callable&&<span style={{color:C.amber,marginLeft:6,fontSize:10}}>⚠</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <button onClick={openDispoBar}
                          style={{padding:"7px 22px",borderRadius:8,border:`0.75px solid ${C.red}`,
                            background:C.red,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",
                            transition:"all 0.15s"}}>
                          End Call
                        </button>
                      </div>
                    );
                    return null;
                  })()}
                </div>
              </div>

              {/* Script-used is now snapshotted automatically at disposition time (phases opener
                  or blank-canvas text) — no manual "Script" dropdown. */}

              {/* Disposition logging happens only after End Call, via the dispo bar modal */}

              {pendingOutcome&&!dispoBarOpen&&(
                <div style={{padding:"12px 20px 14px",flexShrink:0,
                  borderBottom:`0.75px solid ${C.border}`,background:C.surface,
                  animation:"slideDown 0.2s ease",overflowY:"auto",maxHeight:"50vh"}}>

                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:pendingMeta?.color}}/>
                    <span style={{fontSize:13,fontWeight:500,color:pendingMeta?.color}}>{pendingMeta?.label}</span>
                    {pendingMeta?.ghl&&(
                      <span style={{fontSize:9,padding:"2px 8px",borderRadius:100,
                        background:`${pendingMeta.color}12`,border:`0.75px solid ${pendingMeta.color}25`,
                        color:pendingMeta.color}}>→ GHL: {pendingMeta.ghl}</span>
                    )}
                    {pendingMeta?.discord&&(
                      <span style={{fontSize:9,padding:"2px 8px",borderRadius:100,
                        background:`${C.purple}12`,border:`0.75px solid ${C.purple}25`,
                        color:C.purple}}>→ Discord {pendingMeta.discord}</span>
                    )}
                    <button onClick={()=>{setPendingOutcome(null);setCaptureEmail("");setCapturePhone("");setCaptureNotes("");}}
                      style={{fontSize:10,color:C.t3,border:"none",background:"transparent",cursor:"pointer",marginLeft:"auto"}}>← Change</button>
                  </div>

                  <div style={{display:"flex",flexDirection:"column",gap:10}}>

                    {pendingMeta?.needsEmail&&(
                      <div>
                        <div style={{fontSize:10,color:C.t3,marginBottom:4}}>{pendingOutcome==="demo_booked"?"Prospect email (for Calendly invite)":pendingOutcome==="loom_sent"?"Prospect email (to send Loom)":"Prospect email (to send info)"} <span style={{color:C.red,fontSize:9}}>required</span></div>
                        <input type="email" value={captureEmail} onChange={e=>setCaptureEmail(e.target.value)}
                          placeholder="owner@business.com"
                          style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none"}}/>
                      </div>
                    )}

                    {(pendingOutcome==="demo_booked"||pendingOutcome==="callback"||pendingOutcome==="followup_sent")&&(
                      <div>
                        <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Prospect mobile (if different from business line)</div>
                        <input type="tel" value={capturePhone} onChange={e=>setCapturePhone(e.target.value)}
                          placeholder="(610) 555-1234"
                          style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none"}}/>
                      </div>
                    )}

                    {pendingMeta?.needsBooking&&captureEmail.trim()&&(
                      <div style={{background:C.bg,borderRadius:8,border:`0.75px solid ${C.green}30`,padding:"10px 14px"}}>
                        <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Book the demo now</div>
                        <button onClick={openCalendly}
                          style={{width:"100%",padding:"8px 0",borderRadius:6,
                            border:`0.75px solid ${calendlyOpened?C.green:C.accent}`,
                            background:calendlyOpened?`${C.green}10`:"transparent",
                            color:calendlyOpened?C.green:C.accent,fontSize:12,fontWeight:500}}>
                          {calendlyOpened?"✓ Calendly opened — confirm booking":"Open Calendly →"}
                        </button>
                        <div style={{fontSize:10,color:C.t3,marginTop:6}}>Opens Calendly with {active.owner}'s name and email pre-filled. Calendly fires → n8n creates Zoom + GHL update + Discord alert.</div>
                      </div>
                    )}

                    {pendingMeta?.needsLoom&&(
                      <div>
                        <div style={{fontSize:10,color:C.t3,marginBottom:4}}>What should the Loom show? (for Javi/Julian to record)</div>
                        <textarea value={loomContext} onChange={e=>setLoomContext(e.target.value)}
                          placeholder={`e.g. "Show how after-hours calls get answered for a ${active.icp} shop in ${active.city}"`}
                          rows={2} style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none",resize:"vertical"}}/>
                        <div style={{fontSize:10,color:C.teal,marginTop:4}}>Pings Discord #loom-queue → Javi/Julian record → n8n auto-emails to prospect</div>
                      </div>
                    )}

                    {pendingMeta?.needsDateTime&&(
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        <div>
                          <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Callback date <span style={{color:C.red,fontSize:9}}>required</span></div>
                          <input type="date" value={callbackDate} onChange={e=>setCallbackDate(e.target.value)}
                            min={new Date().toISOString().split("T")[0]}
                            style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none"}}/>
                        </div>
                        <div>
                          <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Callback time <span style={{color:C.red,fontSize:9}}>required</span></div>
                          <input type="time" value={callbackTime} onChange={e=>setCallbackTime(e.target.value)}
                            style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none"}}/>
                        </div>
                        <div style={{gridColumn:"1/-1",fontSize:10,color:C.amber}}>Auto-sets GHL reminder + SMS to prospect 1hr before + Discord ping to caller</div>
                      </div>
                    )}

                    {pendingOutcome==="followup_sent"&&(
                      <div>
                        <div style={{fontSize:10,color:C.t3,marginBottom:4}}>What to send</div>
                        <div style={{display:"flex",gap:6}}>
                          {[{v:"website",l:"Website link"},{v:"info_packet",l:"Info packet"},{v:"case_study",l:"Case study"}].map(opt=>(
                            <button key={opt.v} onClick={()=>setSendType(opt.v)}
                              style={{padding:"4px 12px",borderRadius:100,
                                border:`0.75px solid ${sendType===opt.v?C.t1:C.border}`,
                                background:sendType===opt.v?`${C.t1}08`:"transparent",
                                color:sendType===opt.v?C.t1:C.t2,fontSize:11,fontWeight:500}}>
                              {opt.l}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {pendingMeta?.needsGatekeeper&&(
                      <div>
                        <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Gatekeeper name</div>
                        <input value={gatekeeperName} onChange={e=>setGatekeeperName(e.target.value)}
                          placeholder="e.g. Maria, front desk"
                          style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none"}}/>
                        <div style={{fontSize:10,color:C.t3,marginTop:4}}>Logged for next call — use their name to get past them</div>
                      </div>
                    )}

                    {pendingOutcome && pendingOutcome!=="no_answer" && pendingOutcome!=="voicemail" && (
                      <div>
                        <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Spoke with</div>
                        <div style={{display:"flex",gap:6}}>
                          {["Owner","Gatekeeper","Manager","Unknown"].map(opt=>(
                            <button key={opt} onClick={()=>setSpokeWith(opt)}
                              style={{padding:"4px 12px",borderRadius:100,
                                border:`0.75px solid ${spokeWith===opt?C.t1:C.border}`,
                                background:spokeWith===opt?`${C.t1}08`:"transparent",
                                color:spokeWith===opt?C.t1:C.t2,fontSize:11,fontWeight:500,cursor:"pointer"}}>
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {(pendingOutcome==="answered"||pendingOutcome==="demo_booked"||pendingOutcome==="not_interested")&&(
                      <div>
                        <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Objection raised</div>
                        <select value={objectionRaised} onChange={e=>setObjectionRaised(e.target.value)}
                          style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:6,padding:"4px 8px",fontSize:11,background:C.bg,color:C.t1,outline:"none"}}>
                          <option value="">Select objection...</option>
                          {[...(OBJECTION_PRESETS[icpGroup(active.icp)]||[]),...(OBJECTION_PRESETS._global||[])].map(o=>(
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                        <input value={customObjection} onChange={e=>setCustomObjection(e.target.value)}
                          placeholder="Or type a custom objection..."
                          style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:6,padding:"4px 8px",fontSize:11,background:C.bg,color:C.t1,outline:"none",marginTop:4}}/>
                      </div>
                    )}

                    <div>
                      <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Notes</div>
                      <textarea value={captureNotes} onChange={e=>setCaptureNotes(e.target.value)}
                        placeholder="Anything relevant — context for next call, owner personality, timing..."
                        rows={2} style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none",resize:"vertical"}}/>
                    </div>

                    <button onClick={confirmOutcome} disabled={!canSubmit()}
                      style={{width:"100%",padding:"8px 0",borderRadius:8,border:"none",
                        background:canSubmit()?C.t1:`${C.t3}40`,color:canSubmit()?C.bg:C.t3,
                        fontSize:12,fontWeight:500,cursor:canSubmit()?"pointer":"not-allowed"}}>
                      {!canSubmit()
                        ?(pendingMeta?.needsEmail&&!captureEmail.trim()?"Enter email to submit"
                          :pendingMeta?.needsDateTime&&!callbackDate?"Set callback date/time"
                          :"Submit")
                        :`Submit — ${pendingMeta?.label}`}
                    </button>
                  </div>
                </div>
              )}

              {/* Tabs */}
              {(() => {
                const tabDefs = [
                  {id:"intel",      label:"Intel"},
                  {id:"script",     label:"Script"},
                  {id:"offer",      label:"The Offer"},
                  {id:"openers",    label:`Openers (${scriptedOpeners.length + curCustomOpeners.length})`},
                  {id:"objections", label:`Objections (${curObjs.length})`},
                  {id:"voicemail",  label:"Voicemail"},
                  {id:"recording",  label:"Recording"},
                  {id:"roi",        label:"ROI Calc"},
                  {id:"booking",    label:"Booking"},
                  ...(callerName === "Javi" ? [{id:"history", label:"Call History"}] : []),
                ];
                const visibleTabs = tabDefs.filter(t => !hiddenTabs.has(t.id));
                const toggleTab = (id) => {
                  const next = new Set(hiddenTabs);
                  if (next.has(id)) { next.delete(id); }
                  else {
                    // Never hide the last visible tab — always leave at least one.
                    if (tabDefs.filter(t => !next.has(t.id) && t.id !== id).length === 0) return;
                    next.add(id);
                    if (tab === id) { const fv = tabDefs.find(t => !next.has(t.id)); if (fv) setTab(fv.id); }
                  }
                  setHiddenTabs(next);
                  try { localStorage.setItem("harmonia-hidden-tabs", JSON.stringify([...next])); } catch {}
                };
                return (
                <div style={{display:"flex",alignItems:"center",padding:"0 20px",borderBottom:`0.75px solid ${C.border}`,
                  gap:0,flexShrink:0,background:C.bg,position:"relative"}}>
                  {visibleTabs.map(t=>(
                    <button key={t.id} onClick={()=>setTab(t.id)}
                      style={{padding:"10px 15px",border:"none",background:"transparent",
                        borderBottom:tab===t.id?`1.5px solid ${C.accent}`:"1.5px solid transparent",
                        color:tab===t.id?C.t1:C.t3,fontSize:12,
                        fontWeight:tab===t.id?500:400,marginBottom:"-1px",
                        transition:"color 0.15s"}}>
                      {t.label}
                    </button>
                  ))}
                  <div style={{flex:1}} />
                  {/* Manage tabs — hide/unhide from the ribbon */}
                  <button onClick={()=>setTabManagerOpen(o=>!o)}
                    title="Show or hide tabs"
                    style={{border:`0.75px solid ${tabManagerOpen?C.accent:C.border}`,borderRadius:100,
                      background:tabManagerOpen?C.accent+"12":"transparent",color:tabManagerOpen?C.accent:C.t3,
                      cursor:"pointer",fontSize:11,fontWeight:500,fontFamily:F,padding:"3px 11px",
                      display:"flex",alignItems:"center",gap:5,marginLeft:8,alignSelf:"center",transition:"all 0.15s"}}>
                    <span style={{fontSize:12,lineHeight:1}}>⚙</span> Tabs
                  </button>
                  {tabManagerOpen && (
                    <>
                      <div onClick={()=>setTabManagerOpen(false)}
                        style={{position:"fixed",inset:0,zIndex:49}} />
                      <div style={{position:"absolute",top:"calc(100% + 6px)",right:16,zIndex:50,width:240,
                        background:C.bg,border:`0.75px solid ${C.borderMd}`,borderRadius:10,
                        boxShadow:"0 10px 30px rgba(28,61,82,0.16)",padding:8,fontFamily:F}}>
                        <div style={{fontSize:9,fontWeight:600,color:C.t3,textTransform:"uppercase",
                          letterSpacing:".06em",padding:"4px 8px 8px"}}>Show tabs</div>
                        {tabDefs.map(t=>{
                          const shown = !hiddenTabs.has(t.id);
                          const isLastVisible = shown && visibleTabs.length === 1;
                          return (
                            <div key={t.id} onClick={()=>{ if(!isLastVisible) toggleTab(t.id); }}
                              title={isLastVisible?"At least one tab must stay visible":(shown?"Click to hide":"Click to show")}
                              style={{display:"flex",alignItems:"center",gap:9,padding:"6px 8px",borderRadius:6,
                                cursor:isLastVisible?"default":"pointer",opacity:isLastVisible?0.55:1}}
                              onMouseEnter={e=>{ if(!isLastVisible) e.currentTarget.style.background=C.surface; }}
                              onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; }}>
                              <span style={{width:16,height:16,borderRadius:4,flexShrink:0,display:"flex",
                                alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,
                                border:`1px solid ${shown?C.accent:C.borderMd}`,
                                background:shown?C.accent:"transparent",color:shown?"#fff":"transparent"}}>✓</span>
                              <span style={{flex:1,fontSize:12,color:shown?C.t1:C.t3}}>{t.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
                );
              })()}

              {/* Tab content */}
              <div style={{flex:1,overflowY:"auto",padding:20,position:"relative"}}>
                {/* Ambient signature — the rings etched faintly into the workspace dead space */}
                {sigOn&&(
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",
                    justifyContent:"center",pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
                    <RingMark size={520} stroke={C.skyTint} index={sigIndex} phrase={BELIEFS[sigPhrase]}
                      dim={0.22} uid="ambient" outer dot/>
                  </div>
                )}
                <div style={{position:"relative",zIndex:1}}>

                {/* ── INTEL (two-column: dossier left, notes right) ── */}
                {tab==="intel"&&(
                  <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
                    {/* Left column — Pre-call dossier */}
                    <div style={{display:"flex",flexDirection:"column",gap:12,flex:"1 1 320px",minWidth:280}}>
                      {/* Contact — phone in use, email status, and web links in one box */}
                      {(()=>{
                        const e=leadEmailed(active);
                        const o=parseOwnerName(active.owner);
                        const phones=getLeadPhones(active);
                        const primary=phones.find(p=>p.number===lastDialedPhone)||phones[0];
                        const phoneDot=!primary?C.t3:primary.label==="Mobile"?C.green:C.amber;
                        const site=(active.website||"").trim();
                        const li=(active.linkedin||"").trim();
                        const href=(u)=>/^https?:\/\//i.test(u)?u:`https://${u}`;
                        const siteLabel=site.replace(/^https?:\/\//i,"").replace(/\/$/,"");
                        const lbl={width:54,flexShrink:0,fontSize:11,color:C.t3};
                        return (
                        <div style={{background:C.surface,borderRadius:14,padding:"15px 18px",maxWidth:340,width:"100%"}}>
                          <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.08em",color:C.t3,
                            textTransform:"uppercase",marginBottom:13}}>Contact</div>
                          <div style={{display:"flex",flexDirection:"column",gap:11}}>
                            {/* Owner — first + last parsed from the Leads `owner` column */}
                            {o.full&&(
                              <div style={{display:"flex",alignItems:"center",gap:10}}>
                                <div style={{width:7,height:7,borderRadius:"50%",background:C.t2,flexShrink:0}}/>
                                <span style={lbl}>Owner</span>
                                <span style={{fontSize:13,fontWeight:600,color:C.t1,whiteSpace:"nowrap"}}>
                                  {o.first}{o.last&&<span style={{fontWeight:400,color:C.t2}}> {o.last}</span>}
                                </span>
                              </div>
                            )}
                            {/* Phone — Mobile (preferred) vs Corporate/Home, number on one line */}
                            <div style={{display:"flex",alignItems:"center",gap:10}}>
                              <div style={{width:7,height:7,borderRadius:"50%",background:phoneDot,flexShrink:0}}/>
                              <span style={lbl}>{primary?primary.label:"Phone"}</span>
                              <span style={{fontSize:13,fontWeight:500,color:C.t1,fontFamily:FM,whiteSpace:"nowrap"}}>
                                {primary?primary.number:"—"}
                              </span>
                            </div>
                            {/* Email outreach status — fed from Leads `emailed` column */}
                            <div style={{display:"flex",alignItems:"center",gap:10}}>
                              <div style={{width:7,height:7,borderRadius:"50%",background:e.sent?C.green:C.t3,flexShrink:0}}/>
                              <span style={lbl}>Email</span>
                              <span style={{fontSize:13,fontWeight:500,color:e.sent?C.green:C.t2,whiteSpace:"nowrap"}}>
                                {e.sent?"Emailed":"Not emailed yet"}
                              </span>
                              {e.sent&&e.detail&&(
                                <span style={{fontSize:11,color:C.t3,marginLeft:6,whiteSpace:"nowrap"}}>{e.detail}</span>
                              )}
                            </div>
                          </div>
                          {(site||li)&&(
                            <div style={{display:"flex",alignItems:"center",gap:16,marginTop:13,
                              paddingTop:12,borderTop:`0.75px solid ${C.border}`}}>
                              {site&&(
                                <a href={href(site)} target="_blank" rel="noreferrer" onClick={ev=>ev.stopPropagation()}
                                  style={{fontSize:12,color:C.accent,textDecoration:"none",whiteSpace:"nowrap",
                                    overflow:"hidden",textOverflow:"ellipsis",maxWidth:170}}>
                                  ↗ {siteLabel}
                                </a>
                              )}
                              {li&&(
                                <a href={href(li)} target="_blank" rel="noreferrer" onClick={ev=>ev.stopPropagation()}
                                  style={{fontSize:12,color:C.accent,textDecoration:"none",whiteSpace:"nowrap"}}>
                                  LinkedIn ↗
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      );})()}

                      {/* Caller tag — quick-classify the lead from the call.
                          Local edit wins; otherwise show the sheet value (shared across devices). */}
                      {(()=>{
                        const local = leadTags[active.id];
                        const rec = {
                          tag:   local?.tag   ?? active.caller_tag ?? "",
                          other: local?.other ?? active.caller_tag_other ?? "",
                          tagged_by: local?.tagged_by ?? active.tag_by ?? "",
                          tagged_at: local?.tagged_at ?? active.tag_at ?? "",
                        };
                        return (
                        <div style={{background:C.surface,borderRadius:14,padding:"15px 18px",maxWidth:340,width:"100%"}}>
                          <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.08em",color:C.t3,
                            textTransform:"uppercase",marginBottom:11}}>Tag</div>
                          <select
                            value={rec.tag||""}
                            onChange={e=>saveLeadTag(active.id,active.biz,{tag:e.target.value,other:rec.other})}
                            style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:8,
                              padding:"9px 12px",fontSize:13,background:C.bg,color:rec.tag?C.t1:C.t3,
                              outline:"none",fontFamily:F,cursor:"pointer"}}>
                            <option value="">Select a tag…</option>
                            {LEAD_TAGS.map(t=>(
                              <option key={t.code} value={t.code}>{t.code}: {t.label}</option>
                            ))}
                          </select>
                          {rec.tag==="E"&&(
                            <textarea
                              value={rec.other||""}
                              onChange={e=>saveLeadTag(active.id,active.biz,{other:e.target.value})}
                              placeholder="Describe…"
                              rows={2}
                              style={{width:"100%",marginTop:8,border:`0.75px solid ${C.border}`,borderRadius:8,
                                padding:"9px 12px",fontSize:13,background:C.bg,color:C.t1,outline:"none",
                                resize:"vertical",lineHeight:1.5,fontFamily:F}}
                            />
                          )}
                          {rec.tag&&rec.tagged_by&&(
                            <div style={{fontSize:10,color:C.t3,marginTop:8}}>
                              Tagged by {rec.tagged_by}
                              {rec.tagged_at?` on ${new Date(rec.tagged_at).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}`:""}
                            </div>
                          )}
                        </div>
                        );
                      })()}

                      {active.leak&&active.leak!=="—"&&(
                      <div style={{background:C.surface,borderRadius:12,padding:"14px 16px",maxWidth:200}}>
                        <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Revenue leak / mo</div>
                        <div style={{fontSize:17,fontWeight:500,color:C.red,letterSpacing:"-0.01em"}}>
                          {active.leak}
                        </div>
                      </div>
                      )}

                      {active.pain_signals?.length > 0 && (
                        <div style={{background:C.surface,borderRadius:12,padding:"14px 16px"}}>
                          <div style={{fontSize:10,color:C.t3,marginBottom:10}}>Pain signals</div>
                          <div style={{display:"flex",flexDirection:"column",gap:9}}>
                            {active.pain_signals.map((p,i)=>(
                              <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                                <div style={{width:4,height:4,borderRadius:"50%",background:C.amber,
                                  marginTop:5,flexShrink:0}}/>
                                <span style={{fontSize:13,color:C.t1,lineHeight:1.55}}>{p}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {active.intel_comments&&(
                        <div style={{background:C.surface,borderRadius:12,padding:"14px 16px"}}>
                          <div style={{fontSize:10,color:C.t3,marginBottom:8}}>Intel notes</div>
                          <div style={{fontSize:13,color:C.t1,lineHeight:1.68}}>{active.intel_comments}</div>
                        </div>
                      )}

                      {flaggedReviews.length > 0 && (
                        <div style={{borderRadius:12,border:`0.75px solid ${C.amber}30`,
                          padding:"14px 16px",background:"#FFFBF0"}}>
                          <div style={{fontSize:10,color:C.amber,marginBottom:10,fontWeight:500}}>
                            {flaggedReviews.length} pain signal{flaggedReviews.length>1?"s":""} in reviews
                          </div>
                          {flaggedReviews.slice(0,2).map((r,i)=>(
                            <div key={i} style={{fontSize:12,color:C.t1,lineHeight:1.55,marginBottom:6}}>
                              <StarRow stars={r.stars}/>{" "}
                              <span style={{color:C.t3,fontSize:10}}>{r.author} · {r.date}</span>
                              <div style={{marginTop:3,fontStyle:"italic",color:C.t2}}>
                                "{(r.text||"").slice(0,100)}{r.text?.length>100?"…":""}"
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {active.icp&&(
                      <div style={{background:C.surface,borderRadius:12,padding:"12px 14px",maxWidth:180}}>
                        <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Vertical</div>
                        <div style={{fontSize:15,fontWeight:500,color:C.t1}}>{ICP_LABEL[active.icp]||active.icp}</div>
                      </div>
                      )}
                    </div>

                    {/* Right column — Shared Lead Notes */}
                    <div style={{display:"flex",flexDirection:"column",gap:12,flex:"1 1 280px",minWidth:260}}>
                      {/* Call History from the "history" tab — shared across all callers */}
                      {(()=>{
                        const hist = callHistory[active.id] || [];
                        const totalCalls = hist.length;
                        const lastCall = hist[0];
                        return (
                      <div style={{background:C.surface,borderRadius:12,padding:"14px 16px"}}>
                        <div style={{fontSize:10,color:C.t3,marginBottom:10,fontWeight:500,textTransform:"uppercase",
                          letterSpacing:"0.03em"}}>Call History ({totalCalls} call{totalCalls!==1?"s":""})</div>

                        {totalCalls === 0 ? (
                          <div style={{fontSize:13,color:C.green,fontWeight:500,padding:"4px 0"}}>
                            Never called — fresh lead
                          </div>
                        ) : (
                          <>
                            {/* Quick-glance summary */}
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
                              <div style={{background:C.bg,borderRadius:8,padding:"8px 10px",textAlign:"center",
                                border:`0.75px solid ${C.border}`}}>
                                <div style={{fontSize:18,fontWeight:500,color:C.t1,fontFamily:FM}}>{totalCalls}</div>
                                <div style={{fontSize:9,color:C.t3,marginTop:2}}>Total Calls</div>
                              </div>
                              <div style={{background:C.bg,borderRadius:8,padding:"8px 10px",textAlign:"center",
                                border:`0.75px solid ${OUTCOMES[lastCall.outcome]?.color||C.border}`}}>
                                <div style={{fontSize:12,fontWeight:600,color:OUTCOMES[lastCall.outcome]?.color||C.t1,lineHeight:1.3}}>
                                  {OUTCOMES[lastCall.outcome]?.label || lastCall.outcome || "—"}
                                </div>
                                <div style={{fontSize:9,color:C.t3,marginTop:2}}>Last result</div>
                              </div>
                              <div style={{background:C.bg,borderRadius:8,padding:"8px 10px",textAlign:"center",
                                border:`0.75px solid ${C.border}`}}>
                                <div style={{fontSize:12,fontWeight:500,color:C.t1,lineHeight:1.3}}>
                                  {lastCall.caller || "—"}
                                </div>
                                <div style={{fontSize:9,color:C.t3,marginTop:2}}>Last caller</div>
                              </div>
                            </div>

                            {/* Unique callers who touched this lead */}
                            {(()=>{
                              const callers = [...new Set(hist.map(h=>h.caller).filter(Boolean))];
                              return callers.length > 0 && (
                                <div style={{marginBottom:10}}>
                                  <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Called by</div>
                                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                                    {callers.map(c=>(
                                      <span key={c} style={{fontSize:10,padding:"2px 8px",borderRadius:100,
                                        background:C.t2+"14",color:C.t2,fontWeight:500}}>{c}</span>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Full call log — every call, every caller */}
                            <div style={{borderTop:`0.75px solid ${C.border}`,paddingTop:10}}>
                              <div style={{fontSize:10,color:C.t3,marginBottom:8,fontWeight:500}}>
                                Every call (newest first)
                              </div>
                              <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:260,overflowY:"auto"}}>
                                {hist.map((h,i) => (
                                  <div key={i} style={{background:C.bg,borderRadius:8,padding:"8px 10px",
                                    border:`0.75px solid ${OUTCOMES[h.outcome]?.color||C.border}40`}}>
                                    {/* Row 1: disposition + duration */}
                                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                                        <span style={{width:6,height:6,borderRadius:"50%",
                                          background:OUTCOMES[h.outcome]?.color||C.t3,flexShrink:0}}/>
                                        <span style={{fontSize:12,fontWeight:600,color:OUTCOMES[h.outcome]?.color||C.t1}}>
                                          {OUTCOMES[h.outcome]?.label || h.outcome || "Unknown"}
                                        </span>
                                      </div>
                                      <span style={{fontSize:10,color:C.t3,fontFamily:FM}}>
                                        {h.duration ? fmt(h.duration) : ""}
                                      </span>
                                    </div>
                                    {/* Row 2: caller, date — script intentionally omitted from the
                                        OS chip (it's still written to the sheet, just not shown here). */}
                                    <div style={{display:"flex",justifyContent:"space-between",marginTop:4,
                                      alignItems:"center",flexWrap:"wrap",gap:4}}>
                                      <span style={{fontSize:11,color:C.t2,fontWeight:500}}>
                                        {h.caller || "Unknown caller"}
                                      </span>
                                      <span style={{fontSize:10,color:C.t3}}>
                                        {h.timestamp ? new Date(h.timestamp).toLocaleDateString("en-US",
                                          {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}) : ""}
                                      </span>
                                    </div>
                                    {/* Row 3: spoke with */}
                                    {h.spoke_with && (
                                      <div style={{fontSize:10,color:C.t2,marginTop:4}}>
                                        Spoke with: <strong>{h.spoke_with}</strong>
                                      </div>
                                    )}
                                    {/* Row 4: notes */}
                                    {h.notes && (
                                      <div style={{fontSize:10,color:C.t2,marginTop:3,fontStyle:"italic",
                                        background:C.surface,borderRadius:6,padding:"4px 8px"}}>
                                        "{h.notes.slice(0,200)}{h.notes.length>200?"…":""}"
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                        );
                      })()}

                      {/* Shared Notes textarea */}
                      <div style={{background:C.surface,borderRadius:12,padding:"14px 16px",flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                          <div style={{fontSize:10,color:C.t3,fontWeight:500,textTransform:"uppercase",
                            letterSpacing:"0.03em"}}>Shared Notes</div>
                          {notesSaveStatus && (
                            <span style={{fontSize:10,fontWeight:500,
                              color:notesSaveStatus==="saved"?C.green:C.t3}}>
                              {notesSaveStatus==="saved"?"Saved":"Saving..."}
                            </span>
                          )}
                        </div>
                        <textarea
                          value={(leadNotesData[active.id]?.text !== undefined ? leadNotesData[active.id].text : active.lead_notes) || ""}
                          onChange={e => {
                            const val = e.target.value;
                            const noteData = { text: val, edited_by: callerName || "Unknown", edited_at: new Date().toISOString() };
                            setLeadNotesData(prev => ({...prev, [active.id]: noteData}));
                            try { localStorage.setItem(`harmonia-notes-${active.id}`, JSON.stringify(noteData)); } catch {}
                            if (notesSaveRef.current) clearTimeout(notesSaveRef.current);
                            setNotesSaveStatus("saving");
                            notesSaveRef.current = setTimeout(() => {
                              // Upsert into the Leads sheet by id so notes are shared across every device.
                              fetch(NOTES_WEBHOOK_URL, {method:'POST',headers:{'Content-Type':'application/json'},
                                body:JSON.stringify({lead_id:active.id,biz:active.biz,
                                  lead_notes:val,notes_edited_by:callerName||"Unknown",
                                  notes_edited_at:new Date().toISOString()})
                              }).catch(()=>{});
                              setNotesSaveStatus("saved");
                              setTimeout(() => setNotesSaveStatus(null), 2000);
                            }, 2000);
                          }}
                          placeholder={'e.g. "Owner Jose said call back after 2pm," "Gatekeeper very protective — try different angle"'}
                          rows={5}
                          style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:8,padding:"10px 12px",
                            fontSize:13,background:C.bg,color:C.t1,outline:"none",resize:"vertical",
                            lineHeight:1.65,fontFamily:F}}
                        />
                        {(leadNotesData[active.id]?.edited_by || active.notes_edited_by) && (
                          <div style={{fontSize:10,color:C.t3,marginTop:6}}>
                            Last edited by {leadNotesData[active.id]?.edited_by || active.notes_edited_by} on{" "}
                            {(() => {
                              const ts = leadNotesData[active.id]?.edited_at || active.notes_edited_at;
                              return ts ? new Date(ts).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}) : "—";
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── REVIEWS ── */}
                {/* ── SCRIPT MIXER ── */}
                {tab==="script"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:0}}>
                    {/* Toggle buttons for Call History & Notes */}
                    <div style={{display:"flex",gap:6,marginBottom:12,alignItems:"center"}}>
                      <div style={{display:"flex",border:`0.75px solid ${C.border}`,borderRadius:100,overflow:"hidden",marginRight:2}}>
                        {[{id:"phases",l:"Phases"},{id:"script",l:"Script"},{id:"blank",l:"Blank Canvas"}].map(m=>(
                          <button key={m.id} onClick={()=>{setScriptMode(m.id);try{localStorage.setItem("harmonia-script-mode",m.id);}catch{}}}
                            style={{padding:"4px 12px",border:"none",fontSize:10,fontWeight:500,cursor:"pointer",
                              background:scriptMode===m.id?C.t1:"transparent",
                              color:scriptMode===m.id?C.bg:C.t2,transition:"all 0.15s"}}>
                            {m.l}
                          </button>
                        ))}
                      </div>
                      <button onClick={()=>setScriptShowHistory(v=>!v)}
                        style={{padding:"4px 12px",borderRadius:100,fontSize:10,fontWeight:500,
                          border:`0.75px solid ${scriptShowHistory?C.t1:C.border}`,
                          background:scriptShowHistory?C.t1:"transparent",
                          color:scriptShowHistory?C.bg:C.t2,cursor:"pointer",transition:"all 0.15s"}}>
                        {scriptShowHistory?"Hide":"Show"} Call History
                      </button>
                      <button onClick={()=>setScriptShowNotes(v=>!v)}
                        style={{padding:"4px 12px",borderRadius:100,fontSize:10,fontWeight:500,
                          border:`0.75px solid ${scriptShowNotes?C.t1:C.border}`,
                          background:scriptShowNotes?C.t1:"transparent",
                          color:scriptShowNotes?C.bg:C.t2,cursor:"pointer",transition:"all 0.15s"}}>
                        {scriptShowNotes?"Hide":"Show"} Notes
                      </button>
                    </div>

                    {/* Inline panels when toggled */}
                    {(scriptShowHistory||scriptShowNotes)&&(
                      <div style={{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap"}}>
                        {scriptShowHistory&&(()=>{
                          const hist = callHistory[active.id] || [];
                          const lastCall = hist[0];
                          return (
                          <div style={{background:C.surface,borderRadius:12,padding:"12px 14px",flex:"1 1 220px",minWidth:200}}>
                            <div style={{fontSize:10,color:C.t3,marginBottom:8,fontWeight:500,textTransform:"uppercase",
                              letterSpacing:"0.03em"}}>Call History ({hist.length})</div>
                            {hist.length === 0 ? (
                              <div style={{fontSize:11,color:C.t3}}>No prior calls</div>
                            ) : (
                              <>
                                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
                                  <div>
                                    <div style={{fontSize:9,color:C.t3}}>Last Outcome</div>
                                    <div style={{fontSize:11,color:OUTCOMES[lastCall.outcome]?.color||C.t1,fontWeight:500}}>
                                      {OUTCOMES[lastCall.outcome]?.label||lastCall.outcome||"—"}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{fontSize:9,color:C.t3}}>Last caller</div>
                                    <div style={{fontSize:11,color:C.t1,fontWeight:500}}>{lastCall.caller||"—"}</div>
                                  </div>
                                  <div>
                                    <div style={{fontSize:9,color:C.t3}}>Last Date</div>
                                    <div style={{fontSize:11,color:C.t1,fontWeight:500}}>
                                      {lastCall.timestamp?new Date(lastCall.timestamp).toLocaleDateString("en-US",{month:"short",day:"numeric"}):"—"}
                                    </div>
                                  </div>
                                  {lastCall.spoke_with && (
                                  <div>
                                    <div style={{fontSize:9,color:C.t3}}>Spoke With</div>
                                    <div style={{fontSize:11,color:C.t1,fontWeight:500}}>{lastCall.spoke_with}</div>
                                  </div>
                                  )}
                                </div>
                                {hist.length > 1 && (
                                  <div style={{borderTop:`0.75px solid ${C.border}`,paddingTop:6}}>
                                    {hist.slice(1,4).map((h,i)=>(
                                      <div key={i} style={{fontSize:10,color:C.t2,display:"flex",gap:6,marginBottom:3}}>
                                        <span style={{color:OUTCOMES[h.outcome]?.color||C.t2,fontWeight:500}}>
                                          {OUTCOMES[h.outcome]?.short||h.outcome}
                                        </span>
                                        <span>{h.caller}</span>
                                        <span style={{color:C.t3}}>
                                          {h.timestamp?new Date(h.timestamp).toLocaleDateString("en-US",{month:"short",day:"numeric"}):""}
                                        </span>
                                      </div>
                                    ))}
                                    {hist.length > 4 && <div style={{fontSize:10,color:C.t3}}>+{hist.length-4} more</div>}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                          );
                        })()}
                        {scriptShowNotes&&(
                          <div style={{background:C.surface,borderRadius:12,padding:"12px 14px",flex:"1 1 260px",minWidth:240}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                              <div style={{fontSize:10,color:C.t3,fontWeight:500,textTransform:"uppercase",
                                letterSpacing:"0.03em"}}>Shared Notes</div>
                              {notesSaveStatus&&(
                                <span style={{fontSize:9,fontWeight:500,color:notesSaveStatus==="saved"?C.green:C.t3}}>
                                  {notesSaveStatus==="saved"?"Saved":"Saving..."}
                                </span>
                              )}
                            </div>
                            <textarea
                              value={(leadNotesData[active.id]?.text!==undefined?leadNotesData[active.id].text:active.lead_notes)||""}
                              onChange={e=>{
                                const val=e.target.value;
                                const noteData={text:val,edited_by:callerName||"Unknown",edited_at:new Date().toISOString()};
                                setLeadNotesData(prev=>({...prev,[active.id]:noteData}));
                                try{localStorage.setItem(`harmonia-notes-${active.id}`,JSON.stringify(noteData));}catch{}
                                if(notesSaveRef.current)clearTimeout(notesSaveRef.current);
                                setNotesSaveStatus("saving");
                                notesSaveRef.current=setTimeout(()=>{
                                  fetch(WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json'},
                                    body:JSON.stringify({type:'lead_notes_update',lead_id:active.id,biz:active.biz,
                                      lead_notes:val,notes_edited_by:callerName||"Unknown",
                                      notes_edited_at:new Date().toISOString()})
                                  }).catch(()=>{});
                                  setNotesSaveStatus("saved");
                                  setTimeout(()=>setNotesSaveStatus(null),2000);
                                },2000);
                              }}
                              placeholder="Shared notes..."
                              rows={3}
                              style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:8,padding:"8px 10px",
                                fontSize:12,background:C.bg,color:C.t1,outline:"none",resize:"vertical",
                                lineHeight:1.55,fontFamily:F}}
                            />
                            {(leadNotesData[active.id]?.edited_by||active.notes_edited_by)&&(
                              <div style={{fontSize:9,color:C.t3,marginTop:4}}>
                                Last edited by {leadNotesData[active.id]?.edited_by||active.notes_edited_by}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {scriptMode==="blank" ? (()=>{
                      const key = callerName || "_default";
                      const blankRaw = blankScripts[key] || "";
                      const ctx = buildPlaceholderContext(active, callerName);
                      const VARS = [
                        {token:"{biz}",    label:"Salon name",   val:ctx.biz},
                        {token:"{owner}",  label:"Owner name",   val:ctx.owner},
                        {token:"{city}",   label:"City",         val:ctx.city},
                        {token:"{caller}", label:"Your name",    val:ctx.caller},
                        {token:"{leak}",   label:"Revenue leak", val:ctx.leak},
                        {token:"{chairs}", label:"Chairs",       val:ctx.chairs==="your"?"":ctx.chairs},
                      ];
                      const updateBlank = (val) => setBlankScripts(prev => {
                        const next = {...prev, [key]: val};
                        try { localStorage.setItem("harmonia-blank-scripts", JSON.stringify(next)); } catch {}
                        return next;
                      });
                      const insertToken = (token) => {
                        const ta = blankRef.current;
                        let start = blankRaw.length, end = blankRaw.length;
                        if (ta && document.activeElement === ta) { start = ta.selectionStart; end = ta.selectionEnd; }
                        const nextVal = blankRaw.slice(0,start) + token + blankRaw.slice(end);
                        updateBlank(nextVal);
                        requestAnimationFrame(()=>{ if(ta){ ta.focus(); const p=start+token.length; ta.setSelectionRange(p,p); } });
                      };
                      // Saved "standards" for this caller — keep the token source (blankRaw), not the filled text.
                      const versions = blankVersions[key] || [];
                      const saveAsVersion = () => {
                        if (!blankRaw.trim()) return;
                        const name = (window.prompt("Name this standard (e.g. \"Salon v3\", \"Best opener\"):", "") || "").trim();
                        if (!name) return;
                        const entry = { id: `${Date.now()}`, name, text: blankRaw, savedAt: new Date().toISOString() };
                        // Overwrite a same-named standard rather than duplicating it.
                        const nextList = [entry, ...versions.filter(v => v.name.toLowerCase() !== name.toLowerCase())];
                        saveBlankVersions({ ...blankVersions, [key]: nextList });
                      };
                      const loadVersion = (v) => {
                        if (!v) return;
                        if (blankRaw.trim() && blankRaw !== v.text &&
                            !window.confirm(`Replace the current script with "${v.name}"? Your current text isn't saved as a standard.`)) return;
                        updateBlank(v.text);
                      };
                      const deleteVersion = (id) => {
                        saveBlankVersions({ ...blankVersions, [key]: versions.filter(v => v.id !== id) });
                      };
                      // ── Bubble ribbons ── caller-authored rows of press-to-reveal bubbles that live
                      // inside the canvas. Editable in Variables mode; press-only in Values mode.
                      const ribbons = blankRibbons[key] || [];
                      const commitRibbons = (list) => saveBlankRibbons({ ...blankRibbons, [key]: list });
                      const uid = (p) => `${p}${Date.now()}${Math.floor(Math.random()*1e4)}`;
                      const addRibbon = () => {
                        const b = { id: uid("b"), label: "", response: "" };
                        const r = { id: uid("r"), bubbles: [b] };
                        commitRibbons([...ribbons, r]);
                        setOpenBubble(`${r.id}:${b.id}`);   // open the new bubble so it's obvious where to fill in
                      };
                      const removeRibbon = (rid) => {
                        if (!window.confirm("Remove this whole ribbon and its bubbles?")) return;
                        commitRibbons(ribbons.filter(r => r.id !== rid));
                      };
                      const addBubble = (rid) => {
                        const b = { id: uid("b"), label: "", response: "" };
                        commitRibbons(ribbons.map(r => r.id === rid ? { ...r, bubbles: [...r.bubbles, b] } : r));
                        setOpenBubble(`${rid}:${b.id}`);
                      };
                      const removeBubble = (rid, bid) => {
                        commitRibbons(ribbons.map(r => r.id === rid ? { ...r, bubbles: r.bubbles.filter(b => b.id !== bid) } : r));
                        setOpenBubble(o => o === `${rid}:${bid}` ? null : o);
                      };
                      const updateBubble = (rid, bid, field, val) => {
                        commitRibbons(ribbons.map(r => r.id === rid
                          ? { ...r, bubbles: r.bubbles.map(b => b.id === bid ? { ...b, [field]: val } : b) }
                          : r));
                      };
                      return (
                        <div style={{display:"flex",gap:16,alignItems:"flex-start"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:6,flexWrap:"wrap"}}>
                              <div style={{display:"flex",alignItems:"center",gap:8}}>
                                <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:".05em"}}>
                                  {blankShowValues ? "Read — values filled in" : "Write your script — drag variables in from the right"}
                                </div>
                                <div style={{display:"flex",border:`0.75px solid ${C.border}`,borderRadius:100,overflow:"hidden"}}>
                                  {[{v:false,l:"Variables"},{v:true,l:"Values"}].map(m=>(
                                    <button key={m.l} onClick={()=>{ if(blankShowValues!==m.v) toggleBlankShowValues(); }}
                                      title={m.v?"Show the dynamic values filled in for this lead":"Show the {pseudocode} variables — editable"}
                                      style={{padding:"3px 11px",border:"none",fontSize:10,fontWeight:500,cursor:"pointer",
                                        background:blankShowValues===m.v?C.t1:"transparent",
                                        color:blankShowValues===m.v?C.bg:C.t2,transition:"all 0.15s"}}>
                                      {m.l}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div style={{display:"flex",alignItems:"center",gap:12,flexShrink:0,flexWrap:"wrap"}}>
                                <div style={{display:"flex",alignItems:"center",gap:6}}>
                                  <span style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:".05em"}}>Font</span>
                                  <select value={blankFontFamily} onChange={e=>changeBlankFontFamily(e.target.value)}
                                    title="Font style"
                                    style={{border:`0.75px solid ${C.borderMd}`,borderRadius:6,padding:"3px 6px",
                                      fontSize:11,background:C.bg,color:C.t2,cursor:"pointer",fontFamily:F,outline:"none"}}>
                                    {BLANK_FONTS.map(f=>(
                                      <option key={f.id} value={f.css} style={{fontFamily:f.css}}>{f.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div style={{display:"flex",alignItems:"center",gap:6}}>
                                  <span style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:".05em"}}>Color</span>
                                  <input type="color" value={blankFontColor} onChange={e=>changeBlankFontColor(e.target.value)}
                                    title="Text color"
                                    style={{width:26,height:24,padding:0,border:`0.75px solid ${C.borderMd}`,
                                      borderRadius:6,background:C.bg,cursor:"pointer"}} />
                                  {blankFontColor.toLowerCase()!==C.t1.toLowerCase() && (
                                    <button onClick={()=>changeBlankFontColor(C.t1)} title="Reset to default color"
                                      style={{border:"none",background:"transparent",color:C.t3,cursor:"pointer",
                                        fontSize:10,textDecoration:"underline",fontFamily:F,padding:0}}>reset</button>
                                  )}
                                </div>
                                <div style={{display:"flex",alignItems:"center",gap:6}}>
                                  <span style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:".05em"}}>Text size</span>
                                  <button onClick={()=>changeBlankFontSize(-1)} title="Smaller text"
                                    style={{width:24,height:24,borderRadius:6,border:`0.75px solid ${C.borderMd}`,
                                      background:C.bg,color:C.t2,cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:F,
                                      display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>A−</button>
                                  <input type="number" value={blankFontSize} title="Type any font size"
                                    onChange={e=>{ if(e.target.value!=="") applyBlankFontSize(Number(e.target.value)); }}
                                    style={{width:44,height:24,textAlign:"center",fontSize:10,fontFamily:FM,color:C.t2,
                                      border:`0.75px solid ${C.borderMd}`,borderRadius:6,background:C.bg,outline:"none",padding:"0 4px"}} />
                                  <button onClick={()=>changeBlankFontSize(1)} title="Larger text"
                                    style={{width:24,height:24,borderRadius:6,border:`0.75px solid ${C.borderMd}`,
                                      background:C.bg,color:C.t2,cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:F,
                                      display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>A+</button>
                                </div>
                                <div style={{display:"flex",alignItems:"center",gap:6}}>
                                  <span style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:".05em"}}>Height</span>
                                  <button onClick={()=>changeBlankCanvasHeight(-60)} title="Shorter canvas"
                                    style={{width:24,height:24,borderRadius:6,border:`0.75px solid ${C.borderMd}`,
                                      background:C.bg,color:C.t2,cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:F,
                                      display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>−</button>
                                  <input type="number" value={blankCanvasHeight} title="Type any canvas height (px)"
                                    onChange={e=>{ if(e.target.value!=="") applyBlankCanvasHeight(Number(e.target.value)); }}
                                    style={{width:52,height:24,textAlign:"center",fontSize:10,fontFamily:FM,color:C.t2,
                                      border:`0.75px solid ${C.borderMd}`,borderRadius:6,background:C.bg,outline:"none",padding:"0 4px"}} />
                                  <button onClick={()=>changeBlankCanvasHeight(60)} title="Taller canvas"
                                    style={{width:24,height:24,borderRadius:6,border:`0.75px solid ${C.borderMd}`,
                                      background:C.bg,color:C.t2,cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:F,
                                      display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>+</button>
                                </div>
                              </div>
                            </div>
                            {/* Saved standards — save the current script as a named version, click a chip to reload it */}
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                              <button onClick={saveAsVersion} disabled={!blankRaw.trim()}
                                title="Save the current script as a reusable standard"
                                style={{padding:"4px 11px",borderRadius:100,fontSize:10,fontWeight:600,fontFamily:F,
                                  border:`0.75px solid ${blankRaw.trim()?C.accent:C.border}`,
                                  background:"transparent",color:blankRaw.trim()?C.accent:C.t3,
                                  cursor:blankRaw.trim()?"pointer":"default",transition:"all 0.15s"}}>
                                ＋ Save as standard
                              </button>
                              {versions.length>0 && (
                                <>
                                  <span style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:".05em"}}>Saved</span>
                                  {versions.map(v=>(
                                    <span key={v.id} style={{display:"inline-flex",alignItems:"center",
                                      border:`0.75px solid ${C.borderMd}`,borderRadius:100,overflow:"hidden",background:C.bg}}>
                                      <button onClick={()=>loadVersion(v)} title={`Load "${v.name}"`}
                                        style={{border:"none",background:"transparent",color:C.t1,cursor:"pointer",
                                          fontSize:11,fontWeight:500,fontFamily:F,padding:"4px 4px 4px 11px"}}>{v.name}</button>
                                      <button onClick={()=>deleteVersion(v.id)} title="Delete this standard"
                                        style={{border:"none",background:"transparent",color:C.t3,cursor:"pointer",
                                          fontSize:13,lineHeight:1,fontFamily:F,padding:"4px 9px 4px 5px"}}>×</button>
                                    </span>
                                  ))}
                                </>
                              )}
                            </div>
                            {blankShowValues ? (
                              <div style={{width:"100%",height:blankCanvasHeight,border:`0.75px solid ${C.border}`,borderRadius:10,
                                padding:"14px 16px",fontSize:blankFontSize,color:blankFontColor,lineHeight:1.7,background:C.surface,
                                whiteSpace:"pre-wrap",fontFamily:blankFontFamily,overflow:"auto"}}>
                                {blankRaw.trim()
                                  ? fillPlaceholders(formatScriptLines(blankRaw), ctx)
                                  : <span style={{color:C.t3}}>Nothing written yet — switch to Variables to write your script.</span>}
                              </div>
                            ) : (
                              <textarea
                                ref={blankRef}
                                value={blankRaw}
                                onChange={e=>updateBlank(e.target.value)}
                                onDragOver={e=>e.preventDefault()}
                                onDrop={e=>{e.preventDefault();const t=e.dataTransfer.getData("text/plain");if(t)insertToken(t);}}
                                placeholder={"Start typing your script here…\n\ne.g. Hi {owner}, is this the owner of {biz}? I'm {caller} — I help salons in {city} stop missing new-client calls."}
                                style={{width:"100%",height:blankCanvasHeight,border:`0.75px solid ${C.border}`,borderRadius:10,
                                  padding:"14px 16px",fontSize:blankFontSize,color:blankFontColor,lineHeight:1.7,background:C.bg,
                                  outline:"none",resize:"none",fontFamily:blankFontFamily}}
                              />
                            )}

                            {/* ── BUBBLE RIBBONS ── caller-authored rows of press-to-reveal bubbles that
                                 span the canvas. Variables mode = author them; Values mode = press only. ── */}
                            <div style={{marginTop:10}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:ribbons.length?8:0}}>
                                <span style={{fontSize:10,fontWeight:600,color:C.t3,textTransform:"uppercase",
                                  letterSpacing:".05em"}}>Bubble ribbons</span>
                                {!blankShowValues && (
                                  <button onClick={addRibbon} title="Add a new ribbon of bubbles"
                                    style={{padding:"3px 10px",borderRadius:100,fontSize:10,fontWeight:500,cursor:"pointer",
                                      border:`0.75px solid ${C.borderMd}`,background:C.bg,color:C.t2,fontFamily:F,
                                      transition:"all 0.15s"}}
                                    onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.color=C.accent;}}
                                    onMouseLeave={e=>{e.currentTarget.style.borderColor=C.borderMd;e.currentTarget.style.color=C.t2;}}>
                                    + Add ribbon
                                  </button>
                                )}
                                {ribbons.length===0 && (
                                  <span style={{fontSize:10,color:C.t3}}>
                                    {blankShowValues ? "None yet — add them in Variables mode." : "Rows of clickable bubbles that live in your canvas"}
                                  </span>
                                )}
                              </div>
                              {ribbons.map(r=>{
                                const openB = r.bubbles.find(b => openBubble === `${r.id}:${b.id}`) || null;
                                return (
                                  <div key={r.id} style={{border:`0.75px solid ${C.border}`,borderRadius:10,
                                    padding:"8px 10px",marginBottom:8,background:C.surface}}>
                                    <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:6,width:"100%"}}>
                                      {r.bubbles.map(b=>{
                                        const bk = `${r.id}:${b.id}`, isOpen = openBubble === bk;
                                        const shown = b.label.trim()
                                          ? (blankShowValues ? fillPlaceholdersPlain(b.label, ctx) : b.label)
                                          : "New bubble";
                                        return (
                                          <button key={b.id} onClick={()=>setOpenBubble(o => o===bk ? null : bk)}
                                            title={b.response.trim() ? "Press to see what comes out" : "No response set yet"}
                                            style={{padding:"5px 12px",borderRadius:100,fontSize:11,fontWeight:500,
                                              cursor:"pointer",fontFamily:F,transition:"all 0.15s",
                                              border:`0.75px solid ${isOpen?C.accent:C.borderMd}`,
                                              background:isOpen?C.accent:C.bg,
                                              color:isOpen?"#fff":(b.label.trim()?C.t1:C.t3)}}>
                                            {shown}
                                          </button>
                                        );
                                      })}
                                      {!blankShowValues && (
                                        <>
                                          <button onClick={()=>addBubble(r.id)} title="Add a bubble to this ribbon"
                                            style={{width:24,height:24,borderRadius:"50%",fontSize:13,lineHeight:1,
                                              cursor:"pointer",border:`0.75px dashed ${C.borderMd}`,background:"transparent",
                                              color:C.t3,fontFamily:F,display:"flex",alignItems:"center",justifyContent:"center"}}
                                            onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.color=C.accent;}}
                                            onMouseLeave={e=>{e.currentTarget.style.borderColor=C.borderMd;e.currentTarget.style.color=C.t3;}}>
                                            +
                                          </button>
                                          <div style={{flex:1}} />
                                          <button onClick={()=>removeRibbon(r.id)} title="Remove this ribbon"
                                            style={{border:"none",background:"transparent",color:C.t3,cursor:"pointer",
                                              fontSize:13,lineHeight:1,padding:"2px 4px",fontFamily:F}}
                                            onMouseEnter={e=>{e.currentTarget.style.color=C.red;}}
                                            onMouseLeave={e=>{e.currentTarget.style.color=C.t3;}}>
                                            ×
                                          </button>
                                        </>
                                      )}
                                    </div>
                                    {openB && (
                                      <div style={{marginTop:8,borderTop:`0.75px solid ${C.border}`,paddingTop:8}}>
                                        {blankShowValues ? (
                                          <div style={{fontSize:blankFontSize,color:blankFontColor,lineHeight:1.7,
                                            whiteSpace:"pre-wrap",fontFamily:blankFontFamily}}>
                                            {openB.response.trim()
                                              ? fillPlaceholders(formatScriptLines(openB.response), ctx)
                                              : <span style={{color:C.t3,fontSize:12}}>Nothing set for this bubble yet — add it in Variables mode.</span>}
                                          </div>
                                        ) : (
                                          <div style={{display:"flex",flexDirection:"column",gap:6}}>
                                            <input value={openB.label}
                                              onChange={e=>updateBubble(r.id,openB.id,"label",e.target.value)}
                                              placeholder="What's written on the bubble — e.g. “I'm busy”"
                                              style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:8,
                                                padding:"7px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none",
                                                fontFamily:F}}
                                            />
                                            <textarea value={openB.response}
                                              onChange={e=>updateBubble(r.id,openB.id,"response",e.target.value)}
                                              onDragOver={e=>e.preventDefault()}
                                              onDrop={e=>{e.preventDefault();const t=e.dataTransfer.getData("text/plain");
                                                if(t) updateBubble(r.id,openB.id,"response",(openB.response||"")+t);}}
                                              placeholder={"What comes out when this bubble is pressed…\n\ne.g. Totally get it {owner} — 20 seconds and I'm gone."}
                                              rows={3}
                                              style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:8,
                                                padding:"8px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none",
                                                resize:"vertical",lineHeight:1.6,fontFamily:F}}
                                            />
                                            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                                              <span style={{fontSize:9,color:C.t3}}>Variables like {"{owner}"} work here too</span>
                                              <button onClick={()=>removeBubble(r.id,openB.id)}
                                                style={{padding:"3px 9px",borderRadius:100,fontSize:10,fontWeight:500,
                                                  cursor:"pointer",border:`0.75px solid ${C.border}`,background:"transparent",
                                                  color:C.t3,fontFamily:F,transition:"all 0.15s"}}
                                                onMouseEnter={e=>{e.currentTarget.style.borderColor=C.red;e.currentTarget.style.color=C.red;}}
                                                onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.t3;}}>
                                                Remove bubble
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          {!blankShowValues && (
                          <div style={{width:200,flexShrink:0,border:`0.75px solid ${C.border}`,borderRadius:10,
                            padding:"12px",background:C.surface,position:"sticky",top:0}}>
                            <div style={{fontSize:10,fontWeight:600,color:C.t3,textTransform:"uppercase",
                              letterSpacing:".05em",marginBottom:4}}>Dynamic Variables</div>
                            <div style={{fontSize:10,color:C.t3,marginBottom:10,lineHeight:1.4}}>
                              Drag onto your script, or click to insert at the cursor
                            </div>
                            <div style={{display:"flex",flexDirection:"column",gap:7}}>
                              {VARS.map(v=>(
                                <div key={v.token} draggable
                                  onDragStart={e=>e.dataTransfer.setData("text/plain",v.token)}
                                  onClick={()=>insertToken(v.token)}
                                  title={v.val?`This lead: ${v.val}`:"No value for this lead yet"}
                                  style={{display:"flex",flexDirection:"column",gap:2,cursor:"grab",
                                    border:`0.75px solid ${C.borderMd}`,borderRadius:8,padding:"7px 10px",
                                    background:C.bg,transition:"border-color 0.12s"}}
                                  onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;}}
                                  onMouseLeave={e=>{e.currentTarget.style.borderColor=C.borderMd;}}>
                                  <span style={{fontSize:12,fontWeight:500,color:C.t1}}>{v.label}</span>
                                  <span style={{fontSize:10,color:C.accent,fontFamily:FM}}>{v.token}</span>
                                  {v.val?<span style={{fontSize:10,color:C.t2,whiteSpace:"nowrap",overflow:"hidden",
                                    textOverflow:"ellipsis"}}>= {v.val}</span>:null}
                                </div>
                              ))}
                            </div>
                          </div>
                          )}
                        </div>
                      );
                    })() : scriptMode==="script" ? (
                      /* ── SCRIPT READOUT ── read-only rendering of the exact phases the caller built:
                         the chosen variant/frame text, filled with this lead's values, top to bottom.
                         Reply "They respond…" chips and A/B toggles stay clickable so you can still
                         click through a live call. Off (collapsed) phases are excluded. This mirrors
                         the Phases mixer's selection logic — keep the two in sync when either changes. */
                      !hasAnyScripts ? (
                        <div style={{fontSize:12,color:C.t3,padding:"20px 0"}}>
                          No script yet — build it in the Phases tab first.
                        </div>
                      ) : (() => {
                        const placeholderCtx = buildPlaceholderContext(active, callerName);
                        const icpKey = icpGroup(active?.icp);
                        const ABON = scriptFormat === 'ab';
                        const abText = (editKey, sheetText) => {
                          const raw = (callerScripts[editKey] !== undefined && callerScripts[editKey] !== null) ? callerScripts[editKey] : sheetText;
                          return fillPlaceholdersPlain(formatScriptLines(raw), placeholderCtx);
                        };
                        // Clickable reply chips (shared by legacy + A/B). Same look as the mixer.
                        const renderReplies = (items, openIdx, onToggle) => (!items || items.length === 0) ? null : (
                          <div style={{marginTop:10}}>
                            <div style={{fontSize:9,fontWeight:600,color:C.t3,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>They respond…</div>
                            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:openIdx!=null?10:0}}>
                              {items.map((it,oi)=>{ const on=openIdx===oi; const s=BUBBLE_STYLES[it.tag]||BUBBLE_STYLES.yellow;
                                return (<button key={oi} onClick={()=>onToggle(on?null:oi)}
                                  style={{padding:"6px 14px",borderRadius:20,fontSize:11,fontWeight:500,cursor:"pointer",fontFamily:F,
                                    border:`1.5px solid ${on?s.border:"#e5e5e5"}`,background:on?s.bg:"#fff",color:on?s.text:"#555",minHeight:36}}>{it.label}</button>);
                              })}
                            </div>
                            {openIdx!=null && items[openIdx] && (()=>{ const it=items[openIdx]; const s=BUBBLE_STYLES[it.tag]||BUBBLE_STYLES.yellow;
                              return (<div style={{background:s.bg,border:`0.75px solid ${s.border}`,borderRadius:10,padding:"12px 14px"}}>
                                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                                  <div style={{width:7,height:7,borderRadius:"50%",background:s.dot}} />
                                  <span style={{fontSize:10,fontWeight:600,color:s.text,textTransform:"uppercase",letterSpacing:".04em"}}>{s.label}</span>
                                </div>
                                <div style={{fontSize:12,color:s.text,lineHeight:1.7,whiteSpace:"pre-line"}}>{fillPlaceholdersPlain(it.text||"", placeholderCtx)}</div>
                                {it.note && <div style={{fontSize:10,color:s.text,opacity:0.7,marginTop:6,fontStyle:"italic"}}>{it.note}</div>}
                              </div>);
                            })()}
                          </div>
                        );
                        const visiblePhases = phaseOrder.filter(p => !collapsedPhases.has(p.id));
                        return (
                          <div style={{display:"flex",flexDirection:"column",gap:10}}>
                            <div style={{fontSize:10,color:C.t3,letterSpacing:".03em",lineHeight:1.5}}>
                              Read-only view of the script you built in <b style={{color:C.t2}}>Phases</b>. Reply chips and A/B toggles stay clickable — switch to Phases to edit.
                            </div>
                            {visiblePhases.map(phaseObj => {
                              const phase = phaseObj.id;
                              const phaseColor = phaseObj.color;
                              const isCustomPhase = !phaseObj.isDefault;
                              let caption = "";
                              const blocks = []; // [{name?, text, note?, toggle?:{ck,choice}}]
                              let replies = null;

                              if (ABON) {
                                const ab = (abData[icpKey] || {})[phase] || { groups: [], replies: [], sections: [] };
                                const customFrames = customOptsFor(`frame:${phase}`).map(o => ({ name: o.label, _custom: true, pieces: [{ sub: "", a: { text: "", note: "" }, b: null }] }));
                                const frames = [...(ab.groups || []), ...(phase === 'opener' ? customOpenerFrames : []), ...customFrames];
                                const selName = frames.find(f => f.name === phaseSelections[phase]) ? phaseSelections[phase] : (frames[0]?.name || '');
                                const frame = frames.find(f => f.name === selName) || frames[0] || null;
                                const showAll = phase === 'discovery';
                                const sections = ab.sections || [];
                                const useSections = showAll && sections.length > 0;
                                if (!showAll && frame && frames.length > 1) caption = frame.name;
                                if (useSections) {
                                  sections.forEach(sec => {
                                    const secDdKey = `section:${phase}:${sec.name}`;
                                    const secVariants = [...sec.variants, ...customOptsFor(secDdKey).map(o => ({ id: o.value, custom: true, a: { text: "", note: "" }, b: null }))];
                                    const selKey = `${phase}:${sec.name}`;
                                    const selId = secVariants.find(v => v.id === phaseSelections[selKey]) ? phaseSelections[selKey] : secVariants[0]?.id;
                                    const vr = secVariants.find(v => v.id === selId) || secVariants[0] || { a: null, b: null };
                                    const ck = `${phase}:${sec.name}:ab`;
                                    const choice = (abChoice[ck] === 'B' && vr.b) ? 'B' : 'A';
                                    const shown = (choice === 'B' ? vr.b : vr.a) || vr.a || vr.b || { text: '', note: '' };
                                    const editKey = `ab:${phase}:${sec.name}:${selId}:${choice}`;
                                    blocks.push({ name: sec.name, text: abText(editKey, shown.text), note: shown.note, toggle: vr.b ? { ck, choice } : null });
                                  });
                                } else {
                                  const list = showAll ? frames : (frame ? [frame] : []);
                                  list.forEach((fr) => (fr.pieces || []).forEach((pc, pi) => {
                                    const ck = `${phase}:${fr.name}:${pc.sub || pi}`;
                                    const choice = (abChoice[ck] === 'B' && pc.b) ? 'B' : 'A';
                                    const variant = choice === 'B' ? pc.b : pc.a;
                                    const editKey = `ab:${phase}:${fr.name}:${pc.sub || pi}:${choice}`;
                                    const subLabel = showAll ? fr.name : ((pc.sub && pc.sub !== fr.name) ? pc.sub : '');
                                    blocks.push({ name: subLabel, text: abText(editKey, variant?.text || ''), note: variant?.note, toggle: pc.b ? { ck, choice } : null });
                                  }));
                                }
                                const repItems = (ab.replies || []).map((rep, ri) => {
                                  const ck = `${phase}:reply:${ri}`;
                                  const choice = (abChoice[ck] === 'B' && rep.b) ? 'B' : 'A';
                                  const v = choice === 'B' ? rep.b : rep.a;
                                  const editKey = `ab:${phase}:reply:${ri}:${choice}`;
                                  return { label: rep.name, tag: rep.tag, text: abText(editKey, v?.text || ''), note: v?.note };
                                });
                                replies = renderReplies(repItems, abReplyOpen[phase] ?? null, i => setAbReplyOpen(prev => ({ ...prev, [phase]: i })));
                              } else if (isCustomPhase) {
                                blocks.push({ text: fillPlaceholdersPlain(formatScriptLines(callerScripts[`${phase}_custom`] || ""), placeholderCtx) });
                              } else if (phase === 'discovery') {
                                const steps = Object.entries(scripts[icpKey] || {})
                                  .map(([v, sc]) => { const l = (sc.lines || []).find(x => x.type === 'discovery'); return l ? { variant: v, name: l.name, text: l.text, note: l.note } : null; })
                                  .filter(Boolean).sort((a, b) => (parseInt(a.variant) || 0) - (parseInt(b.variant) || 0));
                                steps.forEach((st, si) => blocks.push({ name: `${si + 1}. ${st.name}`, text: fillPlaceholdersPlain(formatScriptLines(st.text), placeholderCtx), note: st.note }));
                                const rep = (bubbleData[icpKey] || {}).discovery || [];
                                replies = renderReplies(rep.map(o => ({ label: o.label, tag: o.type, text: o.response, note: o.note })), activeDiscoveryBubble, setActiveDiscoveryBubble);
                              } else {
                                const icpScripts = scripts[icpKey] || {};
                                const REMOVED = new Set(["7", "8"]);
                                const options = [];
                                Object.entries(icpScripts).forEach(([varId, script]) => {
                                  if (phase === "opener" && !ACTIVE_OPENERS.includes(varId)) return;
                                  if (REMOVED.has(varId)) return;
                                  if (disabledScripts.has(varId)) return;
                                  const pls = script.lines.filter(l => l.type === phase);
                                  const line = pls[pls.length - 1];
                                  if (!line && phase !== "opener") return;
                                  options.push({ id: varId, name: line?.name || script.name, text: line?.text || "" });
                                });
                                customOptsFor(`variant:${phase}`).forEach(o => options.push({ id: o.value, name: o.label, text: "" }));
                                const persistedSel = phaseSelections[phase];
                                const selectedVar = (options.find(o => o.id === persistedSel) ? persistedSel : null) || options[0]?.id || "1";
                                const selectedOption = options.find(o => o.id === selectedVar) || options[0];
                                if (options.length > 1) caption = selectedOption?.name || "";
                                const customText = callerScripts[`${phase}_${selectedVar}`];
                                const rawText = (customText !== undefined && customText !== null) ? customText : (selectedOption?.text || "");
                                blocks.push({ text: fillPlaceholdersPlain(formatScriptLines(rawText), placeholderCtx) });
                                if (phase === 'bridge') { const rep = (bubbleData[icpKey] || {}).bridge || []; replies = renderReplies(rep.map(o => ({ label: o.label, tag: o.type, text: o.response, note: o.note })), activeBridgeBubble, setActiveBridgeBubble); }
                                if (phase === 'close') { const rep = (bubbleData[icpKey] || {}).close || []; replies = renderReplies(rep.map(o => ({ label: o.label, tag: o.type, text: o.response, note: o.note })), activeCloseBubble, setActiveCloseBubble); }
                              }

                              const hasContent = blocks.some(b => b.text && b.text.trim()) || replies != null;
                              if (!hasContent) return null;

                              return (
                                <div key={phase} style={{borderLeft:`3px solid ${phaseColor}`,background:`${phaseColor}04`,borderRadius:"0 10px 10px 0",padding:"12px 16px"}}>
                                  <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:8}}>
                                    <span style={{fontSize:10,fontWeight:600,color:phaseColor,textTransform:"uppercase",letterSpacing:".05em"}}>{phaseObj.label}</span>
                                    {caption && <span style={{fontSize:10,color:C.t3}}>{caption}</span>}
                                  </div>
                                  {blocks.map((b, bi) => (
                                    <div key={bi} style={{marginBottom: bi < blocks.length - 1 ? 12 : 0}}>
                                      {(b.name || b.toggle) && (
                                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                                          {b.name ? <span style={{flex:1,fontSize:10,fontWeight:700,color:C.t2,textTransform:"uppercase",letterSpacing:".04em"}}>{b.name}</span> : <span style={{flex:1}} />}
                                          {b.toggle && ['A','B'].map(opt => { const on = b.toggle.choice === opt;
                                            return (<button key={opt} onClick={()=>setAbChoice(prev => ({...prev, [b.toggle.ck]: opt}))}
                                              style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4,cursor:"pointer",fontFamily:F,
                                                border:`1px solid ${on?phaseColor:C.border}`,background:on?phaseColor:"#fff",color:on?"#fff":C.t3}}>{opt}</button>);
                                          })}
                                        </div>
                                      )}
                                      <div style={{fontSize:14,color:C.t1,lineHeight:1.75,whiteSpace:"pre-line"}}>
                                        {b.text ? b.text : <span style={{color:C.t3,fontStyle:"italic"}}>— nothing chosen —</span>}
                                      </div>
                                      {b.note && <div style={{fontSize:10,color:C.t3,marginTop:4,fontStyle:"italic",lineHeight:1.5}}>{b.note}</div>}
                                    </div>
                                  ))}
                                  {replies}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()
                    ) : !hasAnyScripts ? (
                      <div style={{fontSize:12,color:C.t3,padding:"20px 0"}}>
                        No scripts found for this vertical.<br/>
                        Add rows to the Scripts tab in your Google Sheet.
                      </div>
                    ) : (
                      <>
                        {phaseOrder.map((phaseObj, idx) => {
                          const phase = phaseObj.id;
                          const phaseColor = phaseObj.color;
                          const isOpener = idx === 0;
                          const isCustomPhase = !phaseObj.isDefault;
                          const isBridge = phase === "bridge";

                          // Get available variants for this phase
                          const icpScripts = scripts[icpGroup(active?.icp)] || {};
                          const REMOVED_VARIANTS = new Set(["7","8"]);
                          const options = [];
                          if (!isCustomPhase) {
                            Object.entries(icpScripts).forEach(([varId, script]) => {
                              // Opener phase: bench all but the active openers (display only). Downstream
                              // phases keep their full variant list — ACTIVE_OPENERS is opener-scoped.
                              if (phase === "opener" && !ACTIVE_OPENERS.includes(varId)) return;
                              if (REMOVED_VARIANTS.has(varId)) return;
                              if (disabledScripts.has(varId)) return;
                              // Last matching row wins — keeps the dropdown label in sync with the
                              // discovery tree's root (parseBubblesAndBranches is also last-wins), so a
                              // newer script supersedes an older one sharing the same variant number.
                              const phaseLines = script.lines.filter(l => l.type === phase);
                              const line = phaseLines[phaseLines.length - 1];
                              // Sheet is master: only include variants that actually have a row for this phase
                              // (so close dropdown shows just "Two-Choice Time Close" / "NEPQ Soft Close" — not
                              // every variant falling back to its opener name). Opener phase always shows all
                              // variants since each variant is defined by its opener row.
                              if (!line && phase !== "opener") return;
                              options.push({
                                id: varId,
                                name: line?.name || script.name,
                                tag: line?.tag || script.tag,
                                text: line?.text || "",
                              });
                            });
                            // Caller-authored variants for this phase's dropdown. They start with no
                            // sheet text (text:"") — selecting one shows an empty editable textarea the
                            // caller fills in, saved under callerScripts[`${phase}_${customValue}`].
                            customOptsFor(`variant:${phase}`).forEach(o => {
                              options.push({ id: o.value, name: o.label, tag: undefined, text: "", custom: true });
                            });
                          }

                          const isDiscoveryPhase = phase === "discovery";
                          const icpKey = icpGroup(active?.icp);
                          const icpBranches = branchData[icpKey] || {};
                          // Skip a default phase ONLY if it has no scripts AND no bubble/branch data for this ICP.
                          // Bridge/close still render their bubble chips even when no script row exists for the variant.
                          const phaseBubbles = bubbleData[icpKey] || { bridge: [], close: [] };
                          const hasBubblesHere = (phase === "bridge" && phaseBubbles.bridge.length > 0)
                                              || (phase === "close"  && phaseBubbles.close.length > 0);
                          const hasBranchesHere = phase === "discovery" && Object.keys(icpBranches).length > 0;
                          const abPhase = scriptFormat === 'ab' ? ((abData[icpKey] || {})[phase] || { groups: [], replies: [] }) : null;
                          const hasAbHere = !!abPhase && (abPhase.groups.length > 0 || abPhase.replies.length > 0);
                          if (!isCustomPhase && options.length === 0 && !hasBubblesHere && !hasBranchesHere && !hasAbHere) return null;

                          // Clamp the selection to an option that actually exists in this phase, so a stale
                          // localStorage value (e.g. close=3 from before the variant-3 close row existed)
                          // can't desync the dropdown label from the textarea text or pull a stale customText.
                          const persistedSel = phaseSelections[phase];
                          const validPersisted = options.find(o => o.id === persistedSel) ? persistedSel : null;
                          const selectedVar = isCustomPhase ? "custom" : (validPersisted || options[0]?.id || "1");
                          const selectedOption = options.find(o => o.id === selectedVar) || options[0];
                          const masterText = selectedOption?.text || "";
                          const scriptKey = isCustomPhase ? `${phase}_custom` : `${phase}_${selectedVar}`;
                          const customText = callerScripts[scriptKey];
                          const rawText = customText !== undefined && customText !== null ? customText : masterText;
                          const isCustomized = !isCustomPhase && customText !== undefined && customText !== null;
                          const placeholderCtx = buildPlaceholderContext(active, callerName);
                          const displayText = fillPlaceholdersPlain(formatScriptLines(rawText), placeholderCtx);

                          // Bridge-specific: selectedOption doubles as bridgeVariant
                          const bridgeVariant = isBridge ? selectedOption : null;
                          const collapsed = collapsedPhases.has(phase);

                          return (
                            <div key={phase} data-phase-block={phase} style={{borderLeft:`3px solid ${collapsed?C.t3+"60":phaseColor}`,marginBottom:8,
                              background:collapsed?"transparent":`${phaseColor}04`,borderRadius:"0 10px 10px 0",overflow:"visible",
                              transition:"all 0.2s ease",position:"relative",opacity:collapsed?0.5:1}}>
                              {/* Phase header */}
                              <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 16px",
                                borderBottom:`0.75px solid ${phaseColor}15`}}>
                                <div style={{display:"flex",flexDirection:"column",gap:1,marginRight:2}}>
                                  <button disabled={idx===0} onClick={()=>movePhase(idx,idx-1)}
                                    style={{background:"none",border:"none",padding:0,fontSize:11,lineHeight:1,
                                      color:idx===0?C.t3+"50":C.t3,cursor:idx===0?"default":"pointer",
                                      transition:"color 0.15s"}}
                                    onMouseEnter={e=>{if(idx!==0)e.target.style.color=C.t1}}
                                    onMouseLeave={e=>{e.target.style.color=idx===0?C.t3+"50":C.t3}}
                                    title="Move up">▲</button>
                                  <button disabled={idx===phaseOrder.length-1} onClick={()=>movePhase(idx,idx+1)}
                                    style={{background:"none",border:"none",padding:0,fontSize:11,lineHeight:1,
                                      color:idx===phaseOrder.length-1?C.t3+"50":C.t3,cursor:idx===phaseOrder.length-1?"default":"pointer",
                                      transition:"color 0.15s"}}
                                    onMouseEnter={e=>{if(idx!==phaseOrder.length-1)e.target.style.color=C.t1}}
                                    onMouseLeave={e=>{e.target.style.color=idx===phaseOrder.length-1?C.t3+"50":C.t3}}
                                    title="Move down">▼</button>
                                </div>
                                <span style={{fontSize:10,fontWeight:600,color:collapsed?C.t3:phaseColor,textTransform:"uppercase",
                                  letterSpacing:"0.05em",minWidth:72}}>{phaseObj.label}</span>
                                {/* On/off toggle switch */}
                                <div onClick={()=>{
                                  setCollapsedPhases(prev => {
                                    const next = new Set(prev);
                                    if (next.has(phase)) next.delete(phase); else next.add(phase);
                                    try { localStorage.setItem("harmonia-collapsed-phases", JSON.stringify([...next])); } catch {}
                                    return next;
                                  });
                                }}
                                  style={{width:28,height:16,borderRadius:8,cursor:"pointer",position:"relative",flexShrink:0,
                                    background:collapsed?C.t3+"40":phaseColor,transition:"background 0.2s ease"}}
                                  title={collapsed?"Turn on":"Turn off"}>
                                  <div style={{width:12,height:12,borderRadius:"50%",background:"#fff",position:"absolute",top:2,
                                    left:collapsed?2:14,transition:"left 0.2s ease",
                                    boxShadow:"none"}} />
                                </div>
                                {/* Bridge badge */}
                                {!collapsed && isBridge && bridgeVariant?.badge && (
                                  <span style={{fontSize:8,fontWeight:600,color:"#7c3aed",background:"#f5f0ff",
                                    padding:"2px 6px",borderRadius:4,letterSpacing:".04em"}}>{bridgeVariant.badge}</span>
                                )}
                                {/* Discovery branching badge */}
                                {!collapsed && isDiscoveryPhase && Object.keys(icpBranches).length > 0 && (
                                  <span style={{fontSize:8,fontWeight:600,color:"#B45309",background:"#FEF3C7",
                                    padding:"2px 6px",borderRadius:4,letterSpacing:".04em"}}>BRANCHING</span>
                                )}
                                {/* Cost Frame shows all its steps in sequence, so no variant picker there */}
                                {scriptFormat !== 'ab' && (!isCustomPhase || isBridge) && !isDiscoveryPhase && options.length > 0 && (
                                  <OSSelect
                                    value={selectedVar}
                                    options={options.map(o => ({
                                      value: o.id,
                                      label: o.custom ? o.name : `${o.id} — ${o.name}`,
                                      custom: o.custom,
                                    }))}
                                    onChange={v => setPhaseSelections(prev => ({...prev, [phase]: v}))}
                                    onAdd={label => { const v = addDropdownOption(`variant:${phase}`, label); if (v) setPhaseSelections(prev => ({...prev, [phase]: v})); }}
                                    onRemove={v => { removeDropdownOption(`variant:${phase}`, v); if (selectedVar === v) { const fb = options.find(o => o.id !== v); setPhaseSelections(prev => ({...prev, [phase]: fb ? fb.id : "1"})); } }}
                                    star={o => isBridge ? o.value === "1" : (isOpener && !!recMap[o.value])}
                                    triggerStyle={{ flex: 1, maxWidth: 320 }}
                                  />
                                )}
                                {isCustomPhase && !isBridge && (
                                  <span style={{flex:1,fontSize:10,color:C.t3,fontStyle:"italic"}}>Custom phase</span>
                                )}
                                {isCustomized && (
                                  <button onClick={() => {
                                    if (window.confirm("This will erase your custom edits for this script. Reset?")) {
                                      setCallerScripts(prev => {
                                        const next = {...prev};
                                        delete next[scriptKey];
                                        try { localStorage.setItem(`harmonia-scripts-${callerName}`, JSON.stringify(next)); } catch {}
                                        return next;
                                      });
                                      setScriptSaveStatus(prev => ({...prev, [phase]: "reset"}));
                                      setTimeout(() => setScriptSaveStatus(prev => ({...prev, [phase]: null})), 2000);
                                      fetch(WEBHOOK_URL, {method:'POST',headers:{'Content-Type':'application/json'},
                                        body:JSON.stringify({type:'caller_script_reset',caller_name:callerName,phase,variant_id:selectedVar})
                                      }).catch(()=>{});
                                    }
                                  }}
                                    style={{padding:"3px 10px",borderRadius:6,border:`0.75px solid ${C.border}`,
                                      background:C.bg,color:C.t3,fontSize:10,cursor:"pointer",whiteSpace:"nowrap"}}>
                                    Reset to Original
                                  </button>
                                )}
                                {scriptSaveStatus[phase] && (
                                  <span style={{fontSize:10,fontWeight:500,whiteSpace:"nowrap",
                                    color:scriptSaveStatus[phase]==="saved"?C.green:
                                      scriptSaveStatus[phase]==="reset"?C.amber:C.t3}}>
                                    {scriptSaveStatus[phase]==="saved"?"Saved":scriptSaveStatus[phase]==="reset"?"Reset":"Saving..."}
                                  </span>
                                )}
                              </div>
                              {!collapsed && (() => {
                                /* ── A/B format: ONE selected frame per stage + per-piece A/B toggle + editable text + reply chips ── */
                                if (scriptFormat === 'ab') {
                                  const ab = abPhase || { groups: [], replies: [] };
                                  // Caller-authored frames added straight from this phase's dropdown. Each is a
                                  // single empty editable piece the caller fills in (keyed by its own name).
                                  // Name === stored label, so removal/selection can match by name.
                                  const customFrames = customOptsFor(`frame:${phase}`).map(o => ({
                                    key: `cf-${o.value}`, name: o.label, tag: undefined, _custom: true, _optValue: o.value,
                                    pieces: [{ sub: "", a: { text: "", note: "" }, b: null }],
                                  }));
                                  // Team-shared custom openers appear as extra frames in the Opener dropdown.
                                  const frames = [
                                    ...ab.groups,
                                    ...(phase === 'opener' ? customOpenerFrames : []),
                                    ...customFrames,
                                  ];
                                  const selName = frames.find(f => f.name === phaseSelections[phase]) ? phaseSelections[phase] : (frames[0]?.name || '');
                                  const frame = frames.find(f => f.name === selName) || frames[0] || null;
                                  const activeChip = abReplyOpen[phase];
                                  const frameAccent = frame && BUBBLE_STYLES[frame.tag] ? BUBBLE_STYLES[frame.tag].border : phaseColor;
                                  // Per-caller edit: store raw (re-tokenized) text under the editKey. Persists to localStorage
                                  // now and to the caller-settings sheet via the settings autosave (keyed off callerScripts).
                                  const saveEdit = (editKey, displayVal) => {
                                    let edited = displayVal;
                                    const ctx = placeholderCtx;
                                    if (ctx.owner)  edited = edited.split(ctx.owner).join("{owner}");
                                    if (ctx.caller) edited = edited.split(ctx.caller).join("{caller}");
                                    if (ctx.biz)    edited = edited.split(ctx.biz).join("{biz}");
                                    if (ctx.city)   edited = edited.split(ctx.city).join("{city}");
                                    const rawVal = unformatScriptLines(edited);
                                    setCallerScripts(prev => {
                                      const next = { ...prev, [editKey]: rawVal };
                                      try { localStorage.setItem(`harmonia-scripts-${callerName}`, JSON.stringify(next)); } catch {}
                                      return next;
                                    });
                                  };
                                  const grow = el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } };
                                  const editable = (editKey, sheetText, accent, color) => {
                                    const raw = (callerScripts[editKey] !== undefined && callerScripts[editKey] !== null) ? callerScripts[editKey] : sheetText;
                                    const shown = fillPlaceholdersPlain(formatScriptLines(raw), placeholderCtx);
                                    return (
                                      <textarea value={shown} ref={grow} onInput={e=>grow(e.target)} onChange={e=>saveEdit(editKey, e.target.value)}
                                        rows={1} spellCheck={false}
                                        style={{width:"100%",boxSizing:"border-box",border:"none",borderLeft:`2px solid ${accent || frameAccent}`,
                                          padding:"1px 0 1px 10px",fontSize:13,color:color||C.t1,lineHeight:1.7,background:"transparent",
                                          outline:"none",resize:"none",overflow:"hidden",fontFamily:F}} />
                                    );
                                  };
                                  // Cost Frame is a sequence — show all its parts together. Other stages show one at a time via the dropdown.
                                  const showAll = phase === 'discovery';
                                  const sections = ab.sections || [];
                                  const useSections = showAll && sections.length > 0; // Cost Frame: each section has its own variant dropdown
                                  const list = useSections ? [] : (showAll ? frames : (frame ? [frame] : []));
                                  return (
                                    <div style={{padding:"8px 16px 12px"}}>
                                      {!showAll && frames.length > 1 && (
                                        <div style={{marginBottom:10}}>
                                          <OSSelect
                                            value={selName}
                                            options={frames.map(f => ({ value: f.name, label: f.name, custom: !!f._custom }))}
                                            onChange={v => setPhaseSelections(prev => ({...prev, [phase]: v}))}
                                            onAdd={label => { const val = addDropdownOption(`frame:${phase}`, label); if (val) setPhaseSelections(prev => ({...prev, [phase]: label})); }}
                                            onRemove={name => { const opt = customOptsFor(`frame:${phase}`).find(o => o.label === name); if (opt) removeDropdownOption(`frame:${phase}`, opt.value); if (selName === name) setPhaseSelections(prev => ({...prev, [phase]: ab.groups[0]?.name || ''})); }}
                                            triggerStyle={{ width: "100%" }}
                                          />
                                        </div>
                                      )}
                                      {useSections && sections.map((sec, si) => {
                                        const secAccent = BUBBLE_STYLES[sec.tag] ? BUBBLE_STYLES[sec.tag].border : phaseColor;
                                        const secDdKey = `section:${phase}:${sec.name}`;
                                        // Caller-authored section variants (empty a-line the caller fills in).
                                        const secVariants = [
                                          ...sec.variants,
                                          ...customOptsFor(secDdKey).map(o => ({ id: o.value, _label: o.label, custom: true, a: { text: "", note: "" }, b: null })),
                                        ];
                                        const selKey = `${phase}:${sec.name}`;
                                        const selId = secVariants.find(v => v.id === phaseSelections[selKey]) ? phaseSelections[selKey] : secVariants[0]?.id;
                                        const vr = secVariants.find(v => v.id === selId) || secVariants[0] || { a: null, b: null };
                                        const ck = `${phase}:${sec.name}:ab`;
                                        const choice = (abChoice[ck] === 'B' && vr.b) ? 'B' : 'A';
                                        const shown = (choice === 'B' ? vr.b : vr.a) || vr.a || vr.b || { text: '', note: '' };
                                        const editKey = `ab:${phase}:${sec.name}:${selId}:${choice}`;
                                        return (
                                          <div key={sec.name || si} style={{marginBottom:12}}>
                                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                                              <span style={{fontSize:10,fontWeight:700,color:C.t2,textTransform:"uppercase",letterSpacing:".04em"}}>{sec.name}</span>
                                              {secVariants.length > 1 && (
                                                <OSSelect
                                                  value={selId}
                                                  size="sm"
                                                  options={secVariants.map(v => ({ value: v.id, label: v.custom ? (v._label || "Custom") : v.id, custom: v.custom }))}
                                                  onChange={val => setPhaseSelections(prev => ({...prev, [selKey]: val}))}
                                                  onAdd={label => { const val = addDropdownOption(secDdKey, label); if (val) setPhaseSelections(prev => ({...prev, [selKey]: val})); }}
                                                  onRemove={val => { removeDropdownOption(secDdKey, val); if (selId === val) setPhaseSelections(prev => ({...prev, [selKey]: sec.variants[0]?.id})); }}
                                                  triggerStyle={{ minWidth: 68 }}
                                                  menuWidth={160}
                                                />
                                              )}
                                              <span style={{flex:1}} />
                                              {vr.b && ['A','B'].map(opt => {
                                                const on = choice === opt;
                                                return (
                                                  <button key={opt} onClick={()=>setAbChoice(prev=>({...prev,[ck]:opt}))}
                                                    style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4,cursor:"pointer",fontFamily:F,
                                                      border:`1px solid ${on?secAccent:C.border}`,background:on?secAccent:"#fff",color:on?"#fff":C.t3}}>{opt}</button>
                                                );
                                              })}
                                            </div>
                                            {editable(editKey, shown.text, secAccent)}
                                            {shown.note && <div style={{fontSize:10,color:C.t3,marginTop:3,fontStyle:"italic",lineHeight:1.5,paddingLeft:10}}>{shown.note}</div>}
                                          </div>
                                        );
                                      })}
                                      {list.map((fr, fi) => {
                                        const frAccent = BUBBLE_STYLES[fr.tag] ? BUBBLE_STYLES[fr.tag].border : phaseColor;
                                        return (
                                          <div key={fr.key || fr.name || fi} style={{marginBottom: showAll ? 12 : 0}}>
                                            {showAll && (
                                              <div style={{fontSize:10,fontWeight:700,color:C.t2,marginBottom:5,textTransform:"uppercase",letterSpacing:".04em"}}>{fr.name}</div>
                                            )}
                                            {fr.pieces.map((pc, pi) => {
                                              const ck = `${phase}:${fr.name}:${pc.sub || pi}`;
                                              const choice = (abChoice[ck] === 'B' && pc.b) ? 'B' : 'A';
                                              const variant = choice === 'B' ? pc.b : pc.a;
                                              const editKey = `ab:${phase}:${fr.name}:${pc.sub || pi}:${choice}`;
                                              const subLabel = (pc.sub && pc.sub !== fr.name) ? pc.sub : ''; // hide if it just repeats the frame name
                                              return (
                                                <div key={pi} style={{marginBottom:8}}>
                                                  {(subLabel || pc.b) && (
                                                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                                                      <span style={{flex:1,fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:".04em"}}>{subLabel}</span>
                                                      {pc.b && ['A','B'].map(opt => {
                                                        const on = choice === opt;
                                                        return (
                                                          <button key={opt} onClick={()=>setAbChoice(prev=>({...prev,[ck]:opt}))}
                                                            style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4,cursor:"pointer",fontFamily:F,
                                                              border:`1px solid ${on?frAccent:C.border}`,background:on?frAccent:"#fff",color:on?"#fff":C.t3}}>{opt}</button>
                                                        );
                                                      })}
                                                    </div>
                                                  )}
                                                  {editable(editKey, variant.text, frAccent)}
                                                  {variant.note && <div style={{fontSize:10,color:C.t3,marginTop:3,fontStyle:"italic",lineHeight:1.5,paddingLeft:10}}>{variant.note}</div>}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        );
                                      })}
                                      {ab.replies.length > 0 && (
                                        <div style={{marginTop:8}}>
                                          <div style={{fontSize:9,fontWeight:600,color:C.t3,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>They respond...</div>
                                          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:activeChip!=null?10:0}}>
                                            {ab.replies.map((rep, ri) => {
                                              const on = activeChip === ri;
                                              const s = BUBBLE_STYLES[rep.tag] || BUBBLE_STYLES.yellow;
                                              return (
                                                <button key={ri} onClick={()=>setAbReplyOpen(prev=>({...prev,[phase]: on?null:ri}))}
                                                  style={{padding:"6px 14px",borderRadius:20,fontSize:11,fontWeight:500,cursor:"pointer",fontFamily:F,
                                                    border:`1.5px solid ${on?s.border:"#e5e5e5"}`,background:on?s.bg:"#fff",color:on?s.text:"#555",minHeight:36}}>
                                                  {rep.name}
                                                </button>
                                              );
                                            })}
                                          </div>
                                          {activeChip != null && ab.replies[activeChip] && (() => {
                                            const rep = ab.replies[activeChip];
                                            const s = BUBBLE_STYLES[rep.tag] || BUBBLE_STYLES.yellow;
                                            const ck = `${phase}:reply:${activeChip}`;
                                            const choice = (abChoice[ck] === 'B' && rep.b) ? 'B' : 'A';
                                            const variant = choice === 'B' ? rep.b : rep.a;
                                            const editKey = `ab:${phase}:reply:${activeChip}:${choice}`;
                                            return (
                                              <div style={{background:s.bg,border:`0.75px solid ${s.border}`,borderRadius:10,padding:"10px 12px"}}>
                                                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                                                  <div style={{width:7,height:7,borderRadius:"50%",background:s.dot}} />
                                                  <span style={{fontSize:10,fontWeight:600,color:s.text,textTransform:"uppercase",letterSpacing:".04em",flex:1}}>{s.label}</span>
                                                  {rep.b && ['A','B'].map(opt => {
                                                    const on = choice === opt;
                                                    return (
                                                      <button key={opt} onClick={()=>setAbChoice(prev=>({...prev,[ck]:opt}))}
                                                        style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4,cursor:"pointer",fontFamily:F,
                                                          border:`1px solid ${on?s.border:C.border}`,background:on?s.border:"#fff",color:on?"#fff":C.t3}}>{opt}</button>
                                                    );
                                                  })}
                                                </div>
                                                {editable(editKey, variant.text, s.text)}
                                                {variant.note && <div style={{fontSize:10,color:s.text,opacity:0.7,marginTop:4,fontStyle:"italic",paddingLeft:10}}>{variant.note}</div>}
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      )}
                                    </div>
                                  );
                                }
                                const isDiscovery = phase === "discovery";
                                const isClose = phase === "close";
                                const scriptOnChange = e => {
                                  let edited = e.target.value;
                                  const ctx = placeholderCtx;
                                  if (ctx.owner) edited = edited.split(ctx.owner).join("{owner}");
                                  if (ctx.caller) edited = edited.split(ctx.caller).join("{caller}");
                                  if (ctx.biz) edited = edited.split(ctx.biz).join("{biz}");
                                  if (ctx.city) edited = edited.split(ctx.city).join("{city}");
                                  if (ctx.leak) edited = edited.split(ctx.leak).join("{leak}");
                                  if (ctx.chairs && ctx.chairs !== "your") edited = edited.split(ctx.chairs).join("{chairs}");
                                  const rawVal = unformatScriptLines(edited);
                                  setCallerScripts(prev => {
                                    const next = {...prev, [scriptKey]: rawVal};
                                    try { localStorage.setItem(`harmonia-scripts-${callerName}`, JSON.stringify(next)); } catch {}
                                    return next;
                                  });
                                  if (saveTimerRefs.current[phase]) clearTimeout(saveTimerRefs.current[phase]);
                                  setScriptSaveStatus(prev => ({...prev, [phase]: "saving"}));
                                  saveTimerRefs.current[phase] = setTimeout(() => {
                                    fetch(WEBHOOK_URL, {method:'POST',headers:{'Content-Type':'application/json'},
                                      body:JSON.stringify({type:'caller_script_update',caller_name:callerName,
                                        phase,variant_id:isCustomPhase?"custom":selectedVar,custom_script_text:rawVal})
                                    }).catch(()=>{});
                                    setScriptSaveStatus(prev => ({...prev, [phase]: "saved"}));
                                    setTimeout(() => setScriptSaveStatus(prev => ({...prev, [phase]: null})), 2000);
                                  }, 2000);
                                };
                                const scriptTextarea = (
                                  <textarea
                                    value={displayText}
                                    onChange={scriptOnChange}
                                    style={{width:"100%",border:"none",padding:"12px 16px",fontSize:13,
                                      color:C.t1,lineHeight:1.75,background:"transparent",outline:"none",
                                      resize:"none",fontFamily:F,
                                      fontStyle:idx===0?"italic":"normal"}}
                                    placeholder={isCustomPhase?`Type your ${phaseObj.label} script here...`:`No ${phase} script for this variant`}
                                    data-phase-textarea={phase}
                                  />
                                );
                                const resizeHandles = (
                                  <>
                                  <div style={{display:"flex",justifyContent:"center",cursor:"ns-resize",padding:"3px 0",userSelect:"none"}}
                                    onMouseDown={e=>{
                                      e.preventDefault();
                                      const ta=document.querySelector(`[data-phase-textarea="${phase}"]`);
                                      if(!ta)return;const startY=e.clientY;const startH=ta.offsetHeight;
                                      const onMove=ev=>{ta.style.height=Math.max(0,startH+(ev.clientY-startY))+"px";};
                                      const onUp=()=>{document.removeEventListener("mousemove",onMove);document.removeEventListener("mouseup",onUp);};
                                      document.addEventListener("mousemove",onMove);document.addEventListener("mouseup",onUp);
                                    }}>
                                    <div style={{width:40,height:4,borderRadius:2,background:C.t3+"40",transition:"background 0.15s"}}
                                      onMouseEnter={e=>{e.target.style.background=C.t3+"80"}}
                                      onMouseLeave={e=>{e.target.style.background=C.t3+"40"}} />
                                  </div>
                                  <div style={{position:"absolute",right:-5,top:"50%",transform:"translateY(-50%)",
                                    width:10,height:36,cursor:"ew-resize",display:"flex",alignItems:"center",justifyContent:"center",userSelect:"none",zIndex:1}}
                                    onMouseDown={e=>{
                                      e.preventDefault();
                                      const box=document.querySelector(`[data-phase-block="${phase}"]`);
                                      if(!box)return;const startX=e.clientX;const startW=box.offsetWidth;
                                      const onMove=ev=>{box.style.width=Math.max(0,startW+(ev.clientX-startX))+"px";};
                                      const onUp=()=>{document.removeEventListener("mousemove",onMove);document.removeEventListener("mouseup",onUp);};
                                      document.addEventListener("mousemove",onMove);document.addEventListener("mouseup",onUp);
                                    }}>
                                    <div style={{width:4,height:28,borderRadius:2,background:C.t3+"40",transition:"background 0.15s"}}
                                      onMouseEnter={e=>{e.target.style.background=C.t3+"80"}}
                                      onMouseLeave={e=>{e.target.style.background=C.t3+"40"}} />
                                  </div>
                                  </>
                                );

                                /* ── BRIDGE: script + reply chips (same shape as Close) ── */
                                if (isBridge) {
                                  const bridgeReplies = (bubbleData[icpGroup(active?.icp)] || {}).bridge || [];
                                  if (bridgeReplies.length === 0) {
                                    return (<>{scriptTextarea}{resizeHandles}</>);
                                  }
                                  return (<>
                                    {scriptTextarea}
                                    <div style={{padding:"0 16px 12px"}}>
                                      <div style={{fontSize:9,fontWeight:600,color:C.t3,textTransform:"uppercase",
                                        letterSpacing:".06em",marginBottom:8}}>After opener, they say...</div>
                                      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:activeBridgeBubble!==null?10:0}}>
                                        {bridgeReplies.map((obj,oi) => {
                                          const isActive = activeBridgeBubble === oi;
                                          const s = BUBBLE_STYLES[obj.type] || BUBBLE_STYLES.yellow;
                                          return (
                                            <button key={oi} onClick={()=>setActiveBridgeBubble(isActive?null:oi)}
                                              style={{padding:"6px 14px",borderRadius:20,fontSize:11,fontWeight:500,
                                                cursor:"pointer",transition:"all 0.15s",fontFamily:F,
                                                border:`1.5px solid ${isActive?s.border:"#e5e5e5"}`,
                                                background:isActive?s.bg:"#fff",
                                                color:isActive?s.text:"#555",minHeight:36}}>
                                              {obj.label}
                                            </button>
                                          );
                                        })}
                                      </div>
                                      {activeBridgeBubble !== null && bridgeReplies[activeBridgeBubble] && (() => {
                                        const obj = bridgeReplies[activeBridgeBubble];
                                        const s = BUBBLE_STYLES[obj.type] || BUBBLE_STYLES.yellow;
                                        return (
                                          <div style={{background:s.bg,border:`0.75px solid ${s.border}`,borderRadius:10,padding:"12px 14px"}}>
                                            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                                              <div style={{width:7,height:7,borderRadius:"50%",background:s.dot}} />
                                              <span style={{fontSize:10,fontWeight:600,color:s.text,textTransform:"uppercase",
                                                letterSpacing:".04em"}}>{s.label}</span>
                                            </div>
                                            <div style={{fontSize:12,color:s.text,lineHeight:1.7,whiteSpace:"pre-line"}}>
                                              {fillPlaceholdersPlain(obj.response, placeholderCtx)}
                                            </div>
                                            {obj.note && (
                                              <div style={{fontSize:10,color:s.text,opacity:0.7,marginTop:6,fontStyle:"italic"}}>{obj.note}</div>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                    {resizeHandles}
                                  </>);
                                }

                                /* ── COST FRAME: sequential steps + reply chips ── */
                                if (isDiscovery) {
                                  const icpK = icpGroup(active?.icp);
                                  const steps = Object.entries(scripts[icpK] || {})
                                    .map(([v, sc]) => {
                                      const l = (sc.lines || []).find(x => x.type === "discovery");
                                      return l ? { variant: v, name: l.name, tag: l.tag, text: l.text, note: l.note } : null;
                                    })
                                    .filter(Boolean)
                                    .sort((a, b) => (parseInt(a.variant) || 0) - (parseInt(b.variant) || 0));
                                  const replies = (bubbleData[icpK] || {}).discovery || [];
                                  if (steps.length === 0 && replies.length === 0) {
                                    return (<>{scriptTextarea}{resizeHandles}</>);
                                  }
                                  return (<>
                                    <div style={{padding:"8px 16px 12px"}}>
                                      {/* Sequential steps — say all in order */}
                                      {steps.map((st, si) => (
                                        <div key={st.variant} style={{marginBottom:12,paddingBottom:12,
                                          borderBottom: si < steps.length - 1 ? `0.75px solid ${C.border}` : "none"}}>
                                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                                            <span style={{width:18,height:18,borderRadius:"50%",background:phaseColor+"22",
                                              color:phaseColor,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",
                                              justifyContent:"center",flexShrink:0}}>{si + 1}</span>
                                            <span style={{fontSize:11,fontWeight:600,color:C.t2}}>{st.name}</span>
                                            {st.tag === "recommended" && (
                                              <span style={{fontSize:9,color:phaseColor}}>{"★"}</span>
                                            )}
                                          </div>
                                          <div style={{fontSize:13,color:C.t1,lineHeight:1.75,whiteSpace:"pre-line"}}>
                                            {fillPlaceholdersPlain(formatScriptLines(st.text), placeholderCtx)}
                                          </div>
                                          {st.note && (
                                            <div style={{fontSize:10,color:C.t3,marginTop:6,fontStyle:"italic",lineHeight:1.5}}>
                                              {st.note}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                      {/* Reply chips — what they say back */}
                                      {replies.length > 0 && (
                                        <div style={{marginTop:4}}>
                                          <div style={{fontSize:9,fontWeight:600,color:C.t3,textTransform:"uppercase",
                                            letterSpacing:".06em",marginBottom:8}}>They respond...</div>
                                          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:activeDiscoveryBubble!==null?10:0}}>
                                            {replies.map((obj, oi) => {
                                              const isActive = activeDiscoveryBubble === oi;
                                              const s = BUBBLE_STYLES[obj.type] || BUBBLE_STYLES.yellow;
                                              return (
                                                <button key={oi} onClick={()=>setActiveDiscoveryBubble(isActive?null:oi)}
                                                  style={{padding:"6px 14px",borderRadius:20,fontSize:11,fontWeight:500,
                                                    cursor:"pointer",transition:"all 0.15s",fontFamily:F,
                                                    border:`1.5px solid ${isActive?s.border:"#e5e5e5"}`,
                                                    background:isActive?s.bg:"#fff",color:isActive?s.text:"#555",minHeight:36}}>
                                                  {obj.label}
                                                </button>
                                              );
                                            })}
                                          </div>
                                          {activeDiscoveryBubble !== null && replies[activeDiscoveryBubble] && (() => {
                                            const obj = replies[activeDiscoveryBubble];
                                            const s = BUBBLE_STYLES[obj.type] || BUBBLE_STYLES.yellow;
                                            return (
                                              <div style={{background:s.bg,border:`0.75px solid ${s.border}`,borderRadius:10,padding:"12px 14px"}}>
                                                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                                                  <div style={{width:7,height:7,borderRadius:"50%",background:s.dot}} />
                                                  <span style={{fontSize:10,fontWeight:600,color:s.text,textTransform:"uppercase",letterSpacing:".04em"}}>{s.label}</span>
                                                </div>
                                                <div style={{fontSize:12,color:s.text,lineHeight:1.7,whiteSpace:"pre-line"}}>
                                                  {fillPlaceholdersPlain(obj.response, placeholderCtx)}
                                                </div>
                                                {obj.note && (
                                                  <div style={{fontSize:10,color:s.text,opacity:0.7,marginTop:6,fontStyle:"italic"}}>{obj.note}</div>
                                                )}
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      )}
                                    </div>
                                    {resizeHandles}
                                  </>);
                                }

                                /* ── CLOSE: textarea + bubbles ── */
                                if (isClose) {
                                  const closeBubbles = (bubbleData[icpGroup(active?.icp)] || { close: [] }).close;
                                  if (closeBubbles.length === 0) {
                                    return (<>{scriptTextarea}{resizeHandles}</>);
                                  }
                                  return (<>
                                    {scriptTextarea}
                                    <div style={{padding:"0 16px 12px"}}>
                                      <div style={{fontSize:9,fontWeight:600,color:C.t3,textTransform:"uppercase",
                                        letterSpacing:".06em",marginBottom:8}}>They respond...</div>
                                      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:activeCloseBubble!==null?10:0}}>
                                        {closeBubbles.map((obj,oi) => {
                                          const isActive = activeCloseBubble === oi;
                                          const s = BUBBLE_STYLES[obj.type] || BUBBLE_STYLES.yellow;
                                          return (
                                            <button key={oi} onClick={()=>setActiveCloseBubble(isActive?null:oi)}
                                              style={{padding:"6px 14px",borderRadius:20,fontSize:11,fontWeight:500,
                                                cursor:"pointer",transition:"all 0.15s",fontFamily:F,
                                                border:`1.5px solid ${isActive?s.border:"#e5e5e5"}`,
                                                background:isActive?s.bg:"#fff",
                                                color:isActive?s.text:"#555",minHeight:36}}>
                                              {obj.label}
                                            </button>
                                          );
                                        })}
                                      </div>
                                      {activeCloseBubble !== null && closeBubbles[activeCloseBubble] && (() => {
                                        const obj = closeBubbles[activeCloseBubble];
                                        const s = BUBBLE_STYLES[obj.type] || BUBBLE_STYLES.yellow;
                                        return (
                                          <div style={{background:s.bg,border:`0.75px solid ${s.border}`,borderRadius:10,
                                            padding:"12px 14px",transition:"all 0.2s ease"}}>
                                            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                                              <div style={{width:7,height:7,borderRadius:"50%",background:s.dot}} />
                                              <span style={{fontSize:10,fontWeight:600,color:s.text,textTransform:"uppercase",
                                                letterSpacing:".04em"}}>{s.label}</span>
                                            </div>
                                            <div style={{fontSize:12,color:s.text,lineHeight:1.7,whiteSpace:"pre-line"}}>
                                              {fillPlaceholdersPlain(obj.response, placeholderCtx)}
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                    {resizeHandles}
                                  </>);
                                }

                                /* ── DEFAULT: opener, pitch, custom phases ── */
                                return (<>
                                  {scriptTextarea}
                                  {resizeHandles}
                                </>);
                              })()}
                            </div>
                          );
                        })}
                        {/* ── OFFERS — retired from the live view (data still loads; panel hidden) ── */}
                        {false && offers.length > 0 && (()=>{
                          const offerColor = "#F97316";
                          const curOfferId = selectedOfferId || offers[0]?.id || "";
                          const curOffer = offers.find(o=>o.id===curOfferId) || offers[0];
                          const offerKey = `offer_${curOfferId}`;
                          const offerPlaceholderCtx = buildPlaceholderContext(active, callerName);
                          const customText = callerScripts[offerKey];
                          const masterText = curOffer?.text || "";
                          const rawText = customText !== undefined && customText !== null ? customText : masterText;
                          const isCustomized = customText !== undefined && customText !== null;
                          const displayText = fillPlaceholdersPlain(formatScriptLines(rawText), offerPlaceholderCtx);

                          return (
                            <div data-offer-block="offers" style={{borderLeft:`3px solid ${offerCollapsed?C.t3+"60":offerColor}`,marginBottom:8,
                              background:offerCollapsed?"transparent":`${offerColor}04`,borderRadius:"0 10px 10px 0",overflow:"visible",
                              transition:"all 0.2s ease",position:"relative",opacity:offerCollapsed?0.5:1}}>
                              {/* Header — matches phase headers exactly */}
                              <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 16px",
                                borderBottom:`0.75px solid ${offerColor}15`}}>
                                <span style={{fontSize:10,fontWeight:600,color:offerCollapsed?C.t3:offerColor,textTransform:"uppercase",
                                  letterSpacing:"0.05em",minWidth:72}}>Offers</span>
                                {/* On/off toggle */}
                                <div onClick={()=>{
                                  setOfferCollapsed(prev=>{
                                    const next = !prev;
                                    try { localStorage.setItem("harmonia-offer-collapsed", JSON.stringify(next)); } catch {}
                                    return next;
                                  });
                                }}
                                  style={{width:28,height:16,borderRadius:8,cursor:"pointer",position:"relative",flexShrink:0,
                                    background:offerCollapsed?C.t3+"40":offerColor,transition:"background 0.2s ease"}}
                                  title={offerCollapsed?"Turn on":"Turn off"}>
                                  <div style={{width:12,height:12,borderRadius:"50%",background:"#fff",position:"absolute",top:2,
                                    left:offerCollapsed?2:14,transition:"left 0.2s ease",
                                    boxShadow:"none"}} />
                                </div>
                                {/* Variant dropdown */}
                                <select value={curOfferId}
                                  onChange={e=>setSelectedOfferId(e.target.value)}
                                  style={{flex:1,border:`0.75px solid ${C.border}`,borderRadius:6,padding:"4px 8px",
                                    fontSize:11,background:C.bg,color:C.t1,outline:"none",maxWidth:320}}>
                                  {offers.map(o=>(
                                    <option key={o.id} value={o.id}>{o.label}</option>
                                  ))}
                                </select>
                                {isCustomized && (
                                  <button onClick={() => {
                                    if (window.confirm("Reset this offer script to the original from the sheet?")) {
                                      setCallerScripts(prev => {
                                        const next = {...prev};
                                        delete next[offerKey];
                                        try { localStorage.setItem(`harmonia-scripts-${callerName}`, JSON.stringify(next)); } catch {}
                                        return next;
                                      });
                                      setScriptSaveStatus(prev => ({...prev, offers: "reset"}));
                                      setTimeout(() => setScriptSaveStatus(prev => ({...prev, offers: null})), 2000);
                                    }
                                  }}
                                    style={{padding:"3px 10px",borderRadius:6,border:`0.75px solid ${C.border}`,
                                      background:C.bg,color:C.t3,fontSize:10,cursor:"pointer",whiteSpace:"nowrap"}}>
                                    Reset to Original
                                  </button>
                                )}
                                {scriptSaveStatus.offers && (
                                  <span style={{fontSize:10,fontWeight:500,whiteSpace:"nowrap",
                                    color:scriptSaveStatus.offers==="saved"?C.green:
                                      scriptSaveStatus.offers==="reset"?C.amber:C.t3}}>
                                    {scriptSaveStatus.offers==="saved"?"Saved":scriptSaveStatus.offers==="reset"?"Reset":"Saving..."}
                                  </span>
                                )}
                              </div>
                              {!offerCollapsed && (
                                <>
                                  <textarea
                                    value={displayText}
                                    onChange={e=>{
                                      let edited = e.target.value;
                                      const ctx = offerPlaceholderCtx;
                                      if (ctx.owner) edited = edited.split(ctx.owner).join("{owner}");
                                      if (ctx.caller) edited = edited.split(ctx.caller).join("{caller}");
                                      if (ctx.biz) edited = edited.split(ctx.biz).join("{biz}");
                                      if (ctx.city) edited = edited.split(ctx.city).join("{city}");
                                      if (ctx.leak) edited = edited.split(ctx.leak).join("{leak}");
                                      if (ctx.chairs && ctx.chairs !== "your") edited = edited.split(ctx.chairs).join("{chairs}");
                                      const rawVal = unformatScriptLines(edited);
                                      setCallerScripts(prev => {
                                        const next = {...prev, [offerKey]: rawVal};
                                        try { localStorage.setItem(`harmonia-scripts-${callerName}`, JSON.stringify(next)); } catch {}
                                        return next;
                                      });
                                      if (saveTimerRefs.current.offers) clearTimeout(saveTimerRefs.current.offers);
                                      setScriptSaveStatus(prev => ({...prev, offers: "saving"}));
                                      saveTimerRefs.current.offers = setTimeout(() => {
                                        fetch(WEBHOOK_URL, {method:'POST',headers:{'Content-Type':'application/json'},
                                          body:JSON.stringify({type:'caller_script_update',caller_name:callerName,
                                            phase:'offers',variant_id:curOfferId,custom_script_text:rawVal})
                                        }).catch(()=>{});
                                        setScriptSaveStatus(prev => ({...prev, offers: "saved"}));
                                        setTimeout(() => setScriptSaveStatus(prev => ({...prev, offers: null})), 2000);
                                      }, 2000);
                                    }}
                                    style={{width:"100%",border:"none",padding:"12px 16px",fontSize:13,
                                      color:C.t1,lineHeight:1.75,background:"transparent",outline:"none",
                                      resize:"none",fontFamily:F}}
                                    placeholder="No offer script — add text in the Offers sheet tab"
                                    data-offer-textarea="offers"
                                  />
                                  {/* Vertical resize handle */}
                                  <div style={{display:"flex",justifyContent:"center",cursor:"ns-resize",padding:"3px 0",userSelect:"none"}}
                                    onMouseDown={e=>{
                                      e.preventDefault();
                                      const ta=document.querySelector('[data-offer-textarea="offers"]');
                                      if(!ta)return;const startY=e.clientY;const startH=ta.offsetHeight;
                                      const onMove=ev=>{ta.style.height=Math.max(0,startH+(ev.clientY-startY))+"px";};
                                      const onUp=()=>{document.removeEventListener("mousemove",onMove);document.removeEventListener("mouseup",onUp);};
                                      document.addEventListener("mousemove",onMove);document.addEventListener("mouseup",onUp);
                                    }}>
                                    <div style={{width:40,height:4,borderRadius:2,background:C.t3+"40",transition:"background 0.15s"}}
                                      onMouseEnter={e=>{e.target.style.background=C.t3+"80"}}
                                      onMouseLeave={e=>{e.target.style.background=C.t3+"40"}} />
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })()}

                        {/* Add phase button + inline form */}
                        {showAddPhase ? (
                          <div style={{border:`1px dashed ${C.border}`,borderRadius:10,padding:12,marginTop:4}}>
                            <div style={{fontSize:11,fontWeight:600,color:C.t2,marginBottom:8}}>Add new phase</div>
                            <input value={newPhaseName} onChange={e=>setNewPhaseName(e.target.value)}
                              placeholder="Phase name (e.g. Rebuttal, Follow Up)"
                              onKeyDown={e=>{if(e.key==="Enter")addPhase();if(e.key==="Escape"){setShowAddPhase(false);setNewPhaseName("");}}}
                              style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:6,padding:"6px 10px",
                                fontSize:12,background:C.bg,color:C.t1,outline:"none",marginBottom:8,fontFamily:F}}
                              autoFocus />
                            <div style={{display:"flex",gap:8}}>
                              <button onClick={addPhase}
                                style={{padding:"4px 14px",borderRadius:6,border:"none",
                                  background:C.t1,color:"#fff",fontSize:11,cursor:"pointer",fontWeight:600}}>
                                Add
                              </button>
                              <button onClick={()=>{setShowAddPhase(false);setNewPhaseName("");}}
                                style={{padding:"4px 14px",borderRadius:6,border:`0.75px solid ${C.border}`,
                                  background:C.bg,color:C.t3,fontSize:11,cursor:"pointer"}}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={()=>setShowAddPhase(true)}
                            style={{width:"100%",padding:"8px 0",borderRadius:8,border:`1px dashed ${C.border}`,
                              background:"transparent",color:C.t3,fontSize:11,cursor:"pointer",marginTop:4,
                              transition:"all 0.15s"}}
                            onMouseEnter={e=>{e.target.style.borderColor=C.t1;e.target.style.color=C.t1}}
                            onMouseLeave={e=>{e.target.style.borderColor=C.border;e.target.style.color=C.t3}}>
                            + Add phase
                          </button>
                        )}
                      </>
                    )}

                    {/* ── Book a demo (bottom of script tab) ── */}
                    <div style={{marginTop:32,borderTop:`0.75px solid ${C.border}`,paddingTop:20}}>
                      <div style={{fontSize:13,fontWeight:600,color:C.t1,marginBottom:8}}>Book a demo</div>
                      <div style={{fontSize:11,color:C.t3,marginBottom:12}}>Schedule a call with the Harmonia team</div>
                      <iframe
                        src="https://cal.com/team/harmonia-solutions/cc-demo-booked?embed=true&theme=light"
                        style={{width:"100%",height:500,border:"none",borderRadius:12}}
                        title="Book a demo"
                      />
                    </div>
                  </div>
                )}

                {/* ── OPENERS ── */}
                {tab==="openers"&&(() => {
                  const openerCtx = buildPlaceholderContext(active, callerName);
                  const cards = [
                    ...scriptedOpeners.map((o,i)=>({...o, key:`s${i}`, scripted:true})),
                    ...curCustomOpeners.map((o,i)=>({name:o.name, text:o.body, added_by:o.added_by, key:`c${i}`, scripted:false, customIdx:i})),
                  ];
                  return (
                  <div style={{display:"flex",flexDirection:"column",gap:8,maxWidth:600}}>
                    <div style={{fontSize:11,color:C.t3,marginBottom:2}}>
                      The scripted openers plus any your team has written. Add one and it's shared with everyone.
                    </div>
                    {cards.length === 0 && (
                      <div style={{fontSize:12,color:C.t3,padding:"10px 0"}}>
                        No openers yet for this vertical.
                      </div>
                    )}
                    {cards.map(card => {
                      const isOpen = openOpener===card.key;
                      return (
                        <div key={card.key} style={{borderRadius:12,overflow:"hidden",
                          border:`0.75px solid ${isOpen?C.borderMd:card.scripted?C.border:C.t2+"40"}`,
                          transition:"border-color 0.15s"}}>
                          <div onClick={()=>setOpenOpener(isOpen?null:card.key)}
                            style={{padding:"12px 16px",display:"flex",alignItems:"center",
                              gap:12,cursor:"pointer",background:isOpen?C.surface:C.bg}}>
                            <div style={{width:5,height:5,borderRadius:"50%",
                              background:isOpen?C.t1:C.t3,flexShrink:0,transition:"background 0.15s"}}/>
                            <span style={{fontSize:13,color:C.t1,flex:1,fontWeight:500}}>{card.name}</span>
                            <span style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:".04em",
                              padding:"2px 7px",borderRadius:4,flexShrink:0,
                              background:card.scripted?C.t3+"22":C.accent+"1a",
                              color:card.scripted?C.t3:C.accent}}>
                              {card.scripted?"Scripted":"Team"}
                            </span>
                            {!card.scripted&&(
                              <button onClick={e=>{
                                e.stopPropagation();
                                setCustomOpeners(prev => {
                                  const icp = active?.icp;
                                  const next = {...prev, [icp]: (prev[icp]||[]).filter((_,ci)=>ci!==card.customIdx)};
                                  localStorage.setItem("harmonia-custom-openers", JSON.stringify(next));
                                  return next;
                                });
                                if(isOpen) setOpenOpener(null);
                              }}
                                style={{fontSize:10,color:C.t3,border:"none",background:"transparent",
                                  cursor:"pointer",padding:"2px 6px",flexShrink:0}}
                                title="Remove this opener">✕</button>
                            )}
                            <span style={{fontSize:10,color:C.t3}}>{isOpen?"▲":"▼"}</span>
                          </div>
                          {isOpen&&(
                            <div style={{padding:"0 16px 14px 33px",borderTop:`0.75px solid ${C.border}`}}>
                              <div style={{fontSize:10,color:C.t3,margin:"10px 0 7px",
                                textTransform:"uppercase",letterSpacing:"0.03em",fontWeight:500}}>
                                Say this
                              </div>
                              <div style={{fontSize:13,color:C.t1,lineHeight:1.72,whiteSpace:"pre-wrap"}}>
                                {fillPlaceholdersPlain(formatScriptLines(card.text), openerCtx)}
                              </div>
                              {!card.scripted&&card.added_by&&(
                                <div style={{fontSize:10,color:C.t3,marginTop:8}}>
                                  Added by {card.added_by}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Add new opener form — shared with the whole team on save */}
                    <div style={{borderRadius:12,border:`1px dashed ${C.border}`,padding:"14px 16px",
                      marginTop:cards.length>0?8:0}}>
                      <div style={{fontSize:10,color:C.t3,marginBottom:8,fontWeight:500,textTransform:"uppercase",
                        letterSpacing:"0.03em"}}>Write your own opener</div>
                      <input value={newOpenerName} onChange={e=>setNewOpenerName(e.target.value)}
                        placeholder="Name it — e.g. 'The Referral Angle'"
                        style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:6,padding:"8px 10px",
                          fontSize:12,background:C.bg,color:C.t1,outline:"none",marginBottom:8}}/>
                      <textarea value={newOpenerBody} onChange={e=>setNewOpenerBody(e.target.value)}
                        placeholder="What do you say? You can use {owner}, {biz}, {city}, {caller} — they fill in on the live call."
                        rows={4}
                        style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:6,padding:"8px 10px",
                          fontSize:12,background:C.bg,color:C.t1,outline:"none",resize:"vertical",
                          lineHeight:1.6}}/>
                      <button onClick={()=>{
                        if(!newOpenerName.trim()||!newOpenerBody.trim()) return;
                        const icp = active?.icp;
                        if(!icp) return;
                        const entry = {name:newOpenerName.trim(), body:newOpenerBody.trim(), added_by:callerName||"Unknown"};
                        setCustomOpeners(prev => {
                          const next = {...prev, [icp]: [...(prev[icp]||[]), entry]};
                          localStorage.setItem("harmonia-custom-openers", JSON.stringify(next));
                          return next;
                        });
                        setNewOpenerName("");setNewOpenerBody("");
                      }}
                        disabled={!newOpenerName.trim()||!newOpenerBody.trim()}
                        style={{marginTop:8,padding:"6px 18px",borderRadius:6,border:"none",
                          background:newOpenerName.trim()&&newOpenerBody.trim()?C.t1:`${C.t3}40`,
                          color:newOpenerName.trim()&&newOpenerBody.trim()?C.bg:C.t3,
                          fontSize:11,fontWeight:500,cursor:newOpenerName.trim()&&newOpenerBody.trim()?"pointer":"not-allowed"}}>
                        Add Opener — shared with team
                      </button>
                    </div>
                  </div>
                  );
                })()}

                {/* ── OBJECTIONS ── */}
                {tab==="objections"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:8,maxWidth:600}}>
                    {curObjs.length === 0 && (
                      <div style={{fontSize:12,color:C.t3,padding:"10px 0"}}>
                        No objections yet for this vertical.
                      </div>
                    )}
                    {curObjs.length > 0 && (
                      <>
                        <div style={{fontSize:11,color:C.t3,marginBottom:4}}>Tap to expand</div>
                        {curObjs.map((obj,i)=>{
                          const sheetCount = (objections[icpGroup(active?.icp)] || []).length;
                          const isCustom = i >= sheetCount;
                          const customIdx = i - sheetCount;
                          return (
                          <div key={i} style={{borderRadius:12,overflow:"hidden",
                            border:`0.75px solid ${openObj===i?C.borderMd:isCustom?C.t2+"40":C.border}`,
                            transition:"border-color 0.15s"}}>
                            <div onClick={()=>setOpenObj(openObj===i?null:i)}
                              style={{padding:"12px 16px",display:"flex",alignItems:"center",
                                gap:12,cursor:"pointer",
                                background:openObj===i?C.surface:C.bg}}>
                              <div style={{width:5,height:5,borderRadius:"50%",
                                background:openObj===i?C.t1:C.t3,flexShrink:0,
                                transition:"background 0.15s"}}/>
                              <span style={{fontSize:13,color:C.t1,flex:1}}>"{obj.q}"</span>
                              {isCustom&&(
                                <button onClick={e=>{
                                  e.stopPropagation();
                                  setCustomObjections(prev => {
                                    const icp = active?.icp;
                                    const next = {...prev, [icp]: (prev[icp]||[]).filter((_,ci)=>ci!==customIdx)};
                                    localStorage.setItem("harmonia-custom-objections", JSON.stringify(next));
                                    return next;
                                  });
                                  if(openObj===i) setOpenObj(null);
                                }}
                                  style={{fontSize:10,color:C.t3,border:"none",background:"transparent",
                                    cursor:"pointer",padding:"2px 6px",flexShrink:0}}
                                  title="Remove this objection">✕</button>
                              )}
                              <span style={{fontSize:10,color:C.t3}}>{openObj===i?"▲":"▼"}</span>
                            </div>
                            {openObj===i&&(
                              <div style={{padding:"0 16px 14px 33px",
                                borderTop:`0.75px solid ${C.border}`}}>
                                <div style={{fontSize:10,color:C.t3,margin:"10px 0 7px",
                                  textTransform:"uppercase",letterSpacing:"0.03em",fontWeight:500}}>
                                  Response
                                </div>
                                <div style={{fontSize:13,color:C.t1,lineHeight:1.72}}>{obj.a}</div>
                                {isCustom&&obj.added_by&&(
                                  <div style={{fontSize:10,color:C.t3,marginTop:8}}>
                                    Added by {obj.added_by}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          );
                        })}
                      </>
                    )}

                    {/* Add new objection form */}
                    <div style={{borderRadius:12,border:`1px dashed ${C.border}`,padding:"14px 16px",
                      marginTop:curObjs.length>0?8:0}}>
                      <div style={{fontSize:10,color:C.t3,marginBottom:8,fontWeight:500,textTransform:"uppercase",
                        letterSpacing:"0.03em"}}>Add Objection</div>
                      <input value={newObjQ} onChange={e=>setNewObjQ(e.target.value)}
                        placeholder="What's the objection? e.g. 'We already have a booking system'"
                        style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:6,padding:"8px 10px",
                          fontSize:12,background:C.bg,color:C.t1,outline:"none",marginBottom:8}}/>
                      <textarea value={newObjA} onChange={e=>setNewObjA(e.target.value)}
                        placeholder="How to respond to this objection..."
                        rows={3}
                        style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:6,padding:"8px 10px",
                          fontSize:12,background:C.bg,color:C.t1,outline:"none",resize:"vertical",
                          lineHeight:1.6}}/>
                      <button onClick={()=>{
                        if(!newObjQ.trim()||!newObjA.trim()) return;
                        const icp = active?.icp;
                        if(!icp) return;
                        const entry = {q:newObjQ.trim(), a:newObjA.trim(), added_by:callerName||"Unknown"};
                        setCustomObjections(prev => {
                          const next = {...prev, [icp]: [...(prev[icp]||[]), entry]};
                          localStorage.setItem("harmonia-custom-objections", JSON.stringify(next));
                          return next;
                        });
                        // Also send to webhook for sheet persistence
                        fetch(WEBHOOK_URL, {method:'POST',headers:{'Content-Type':'application/json'},
                          body:JSON.stringify({type:'objection_add',icp,question:newObjQ.trim(),
                            answer:newObjA.trim(),added_by:callerName||"Unknown"})
                        }).catch(()=>{});
                        setNewObjQ("");setNewObjA("");
                      }}
                        disabled={!newObjQ.trim()||!newObjA.trim()}
                        style={{marginTop:8,padding:"6px 18px",borderRadius:6,border:"none",
                          background:newObjQ.trim()&&newObjA.trim()?C.t1:`${C.t3}40`,
                          color:newObjQ.trim()&&newObjA.trim()?C.bg:C.t3,
                          fontSize:11,fontWeight:500,cursor:newObjQ.trim()&&newObjA.trim()?"pointer":"not-allowed"}}>
                        Add Objection
                      </button>
                    </div>
                  </div>
                )}

                {tab==="voicemail"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:12,maxWidth:600}}>
                    <div style={{fontSize:11,color:C.t3,marginBottom:2}}>
                      Use these scripts when you hit voicemail. Keep it under 30 seconds.
                    </div>
                    {[
                      {
                        title:"Standard VM — First Touch",
                        body:`Hi ${(active?.owner||"").split(" ")[0] || "there"}, this is ${callerName || "[Your Name]"} calling about ${active?.biz||"your business"}. I work with ${ICP_LABEL[active?.icp]||"businesses"} in ${active?.city||"your area"} to help them never miss a new customer call again. I'd love 2 minutes to show you how — give me a call back at this number or I'll try you again soon. Thanks!`
                      },
                      {
                        title:"Follow-Up VM — 2nd/3rd Attempt",
                        body:`Hey ${(active?.owner||"").split(" ")[0] || "there"}, it's ${callerName || "[Your Name]"} again — I tried reaching you ${active?.call_count > 1 ? active.call_count-1+" time"+(active.call_count>2?"s":"")+" before":"the other day"}. I've been helping ${ICP_LABEL[active?.icp]||"businesses"} like yours fill gaps in their schedule automatically. Figured it's worth one more try — call me back or I can shoot you a quick text. Talk soon!`
                      },
                      {
                        title:"Pain-Based VM",
                        body:`Hi ${(active?.owner||"").split(" ")[0] || "there"}, ${callerName || "[Your Name]"} here. I noticed ${active?.pain_signals?.length > 0 ? active.pain_signals[0] : "you might be missing calls when you're busy with clients"}. We built something specifically for ${ICP_LABEL[active?.icp]||"businesses"} like ${active?.biz||"yours"} that handles that 24/7 — no staff needed. Worth a quick chat? Call me back at this number. Thanks!`
                      },
                      {
                        title:"Scarcity / Competitor VM",
                        body:`Hey ${(active?.owner||"").split(" ")[0] || "there"}, quick message — ${callerName || "[Your Name]"} here. We're onboarding a few ${ICP_LABEL[active?.icp]||"businesses"} in ${active?.city||"your area"} this month and I wanted to make sure ${active?.biz||"you"} got a shot before we're full. It's an AI receptionist that books appointments while you're working. Call me back if you want the details. Cheers!`
                      },
                    ].map((vm,i)=>(
                      <div key={i} style={{borderRadius:12,overflow:"hidden",
                        border:`0.75px solid ${C.border}`}}>
                        <div style={{padding:"10px 16px",background:C.surface,
                          borderBottom:`0.75px solid ${C.border}`,
                          display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                          <span style={{fontSize:12,fontWeight:500,color:C.t1}}>{vm.title}</span>
                          <button onClick={()=>{navigator.clipboard.writeText(vm.body);setFlash("VM script copied");setTimeout(()=>setFlash(null),2000);}}
                            style={{padding:"3px 10px",borderRadius:6,border:`0.75px solid ${C.border}`,
                              background:C.bg,color:C.t2,fontSize:10,cursor:"pointer"}}>
                            Copy
                          </button>
                        </div>
                        <div style={{padding:"12px 16px",fontSize:13,color:C.t1,lineHeight:1.7}}>
                          {vm.body}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── RECORDING ── standalone call library; upload an MP3, keep it private or share with the team ── */}
                {tab==="recording"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:640}}>
                    <div style={{fontSize:11,color:C.t3}}>
                      Upload an MP3 of a call. <strong>Private</strong> is visible only to you; <strong>Global</strong> is shared with the whole team.
                    </div>

                    {/* Upload card */}
                    <div style={{borderRadius:12,border:`0.75px solid ${C.border}`,overflow:"hidden"}}>
                      <div style={{padding:"10px 16px",background:C.surface,borderBottom:`0.75px solid ${C.border}`,
                        fontSize:12,fontWeight:500,color:C.t1}}>Upload a recording</div>
                      <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
                        <label style={{display:"flex",alignItems:"center",gap:10,fontSize:12,color:C.t2,cursor:"pointer"}}>
                          <span style={{padding:"6px 12px",borderRadius:8,border:`0.75px solid ${C.border}`,
                            background:C.bg,color:C.t1,fontSize:12,whiteSpace:"nowrap"}}>Choose file</span>
                          <span style={{color:recFile?C.t1:C.t3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {recFile ? `${recFile.name} (${(recFile.size/1024/1024).toFixed(1)} MB)` : "No file selected"}
                          </span>
                          <input type="file" accept="audio/*" style={{display:"none"}}
                            onChange={e=>{setRecFile(e.target.files?.[0]||null);setRecError("");}} />
                        </label>
                        <input type="text" value={recTitle} placeholder="Title (e.g. Salon owner — great objection handle)"
                          onChange={e=>setRecTitle(e.target.value)}
                          style={{padding:"8px 12px",borderRadius:8,border:`0.75px solid ${C.border}`,
                            background:C.bg,color:C.t1,fontSize:13,outline:"none"}} />
                        <textarea value={recNotes} placeholder="Notes (optional)" rows={2}
                          onChange={e=>setRecNotes(e.target.value)}
                          style={{padding:"8px 12px",borderRadius:8,border:`0.75px solid ${C.border}`,
                            background:C.bg,color:C.t1,fontSize:13,outline:"none",resize:"vertical",fontFamily:"inherit"}} />
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:12,color:C.t3}}>Visibility</span>
                          {[["private","🔒 Private to me"],["global","🌐 Global team"]].map(([v,lbl])=>(
                            <button key={v} onClick={()=>setRecVisibility(v)}
                              style={{padding:"5px 12px",borderRadius:100,fontSize:11,fontWeight:500,cursor:"pointer",
                                border:`0.75px solid ${recVisibility===v?C.accent:C.border}`,
                                background:recVisibility===v?C.accent+"15":C.bg,
                                color:recVisibility===v?C.accent:C.t2}}>{lbl}</button>
                          ))}
                        </div>
                        {recError&&<div style={{fontSize:11,color:C.red}}>{recError}</div>}
                        <button onClick={uploadRecording} disabled={recUploading||!recFile}
                          style={{alignSelf:"flex-start",padding:"8px 18px",borderRadius:8,border:"none",
                            background:recUploading||!recFile?C.t3:C.accent,color:"#fff",fontSize:13,fontWeight:500,
                            cursor:recUploading||!recFile?"default":"pointer"}}>
                          {recUploading?"Uploading…":"Upload recording"}
                        </button>
                      </div>
                    </div>

                    {/* Library list */}
                    {(()=>{
                      const mine = recordings
                        .filter(r=>(r.visibility||"").toLowerCase()==="global" || (r.caller_name||"")===callerName)
                        .sort((a,b)=>(b.uploaded_at||"").localeCompare(a.uploaded_at||""));
                      if(!mine.length) return (
                        <div style={{fontSize:12,color:C.t3,padding:"8px 0"}}>No recordings yet. Upload one above.</div>
                      );
                      return (
                        <div style={{display:"flex",flexDirection:"column",gap:10}}>
                          <div style={{fontSize:11,color:C.t3}}>{mine.length} recording{mine.length===1?"":"s"}</div>
                          {mine.map((r,i)=>{
                            const isGlobal=(r.visibility||"").toLowerCase()==="global";
                            const when=r.uploaded_at?new Date(r.uploaded_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"";
                            return (
                              <div key={r.id||i} style={{borderRadius:12,border:`0.75px solid ${C.border}`,overflow:"hidden"}}>
                                <div style={{padding:"10px 16px",background:C.surface,borderBottom:`0.75px solid ${C.border}`,
                                  display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                                  <span style={{fontSize:12,fontWeight:500,color:C.t1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                    {r.title||"Untitled"}
                                  </span>
                                  <span style={{fontSize:9,fontWeight:600,padding:"2px 8px",borderRadius:100,whiteSpace:"nowrap",
                                    color:isGlobal?C.green:C.t2,background:(isGlobal?C.green:C.t3)+"18"}}>
                                    {isGlobal?"🌐 Global":"🔒 Private"}
                                  </span>
                                </div>
                                <div style={{padding:"12px 16px",display:"flex",flexDirection:"column",gap:8}}>
                                  <div style={{fontSize:10,color:C.t3}}>
                                    {r.caller_name||"Unknown"}{when?` · ${when}`:""}{r.notes?` · ${r.notes}`:""}
                                  </div>
                                  {r.drive_file_id&&(
                                    <audio controls preload="none" style={{width:"100%",height:36}}
                                      src={`https://drive.google.com/uc?export=download&id=${r.drive_file_id}`} />
                                  )}
                                  {r.drive_file_id&&(
                                    <a href={`https://drive.google.com/file/d/${r.drive_file_id}/view`} target="_blank" rel="noreferrer"
                                      style={{fontSize:11,color:C.accent,textDecoration:"none"}}>Open in Drive ↗</a>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {tab==="roi"&&(
                  <MissedCallCalculator embedded />
                )}

                {/* ── BOOKING ── */}
                {tab==="booking"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    <div style={{fontSize:14,fontWeight:600,color:C.t1}}>Book a demo</div>
                    <div style={{fontSize:12,color:C.t2}}>Schedule a call with the Harmonia Solutions team</div>
                    <iframe
                      src="https://cal.com/team/harmonia-solutions/cc-demo-booked?embed=true&theme=light"
                      style={{width:"100%",height:600,border:"none",borderRadius:12}}
                      title="Book a demo"
                    />
                  </div>
                )}

                {/* ── THE OFFER ── team-shared blank canvas; Javi edits, everyone else views ── */}
                {tab==="offer"&&(()=>{
                  const isOfferAdmin = callerName === "Javi";
                  return (
                    <div style={{maxWidth:820,position:"relative",zIndex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                        <span style={{fontSize:14,fontWeight:600,color:C.t1}}>The Offer</span>
                        <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:100,
                          color:isOfferAdmin?C.accent:C.t2,
                          background:(isOfferAdmin?C.accent:C.t3)+"15"}}>
                          {isOfferAdmin?"You can edit this — everyone sees it":"View only — managed by Javi"}
                        </span>
                        {isOfferAdmin&&offerSaveStatus&&(
                          <span style={{fontSize:10,fontWeight:500,marginLeft:"auto",
                            color:offerSaveStatus==="saved"?C.green:C.t3}}>
                            {offerSaveStatus==="saved"?"Saved for the team":"Saving…"}
                          </span>
                        )}
                      </div>
                      {isOfferAdmin ? (
                        <textarea
                          value={offerCanvas}
                          onChange={e=>setOfferCanvas(e.target.value)}
                          placeholder="Type the current offer here. Whatever you write is saved and shown to every caller…"
                          style={{width:"100%",minHeight:440,border:`0.75px solid ${C.border}`,borderRadius:12,
                            padding:"16px 18px",fontSize:14,color:C.t1,lineHeight:1.75,background:C.bg,
                            outline:"none",resize:"vertical",fontFamily:F}}
                        />
                      ) : offerCanvas.trim() ? (
                        <div style={{border:`0.75px solid ${C.border}`,borderRadius:12,padding:"16px 18px",
                          background:C.surface,fontSize:14,lineHeight:1.75,color:C.t1,whiteSpace:"pre-wrap",
                          wordBreak:"break-word",minHeight:200}}>
                          {offerCanvas}
                        </div>
                      ) : (
                        <div style={{border:`1px dashed ${C.border}`,borderRadius:12,padding:"40px 18px",
                          textAlign:"center",fontSize:12,color:C.t3}}>
                          No offer posted yet. Javi will add it here.
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── CALL HISTORY (Javi-only) — search every logged call, play the recording ── */}
                {tab==="history" && callerName==="Javi" && (()=>{
                  const tsval = parseTs; // NaN-safe (module helper) — shared with refreshCallHistory
                  // Build the search index from the already-loaded history map + leads (no new fetch).
                  const leadById = {};
                  leads.forEach(l => { if (l.id) leadById[l.id] = l; });
                  const groups = Object.entries(callHistory).map(([leadId, calls])=>{
                    const l = leadById[leadId] || {};
                    const last = calls[0] || {};
                    return {
                      leadId,
                      biz:   (l.biz || last.biz || "").trim(),
                      owner: (l.owner || (calls.find(c=>c.owner)||{}).owner || "").trim(),
                      phone: (l.phone || "").trim(),
                      city:  (l.city || "").trim(),
                      state: (l.state || "").trim(),
                      icp:   (l.icp || "").trim(),
                      calls,
                      lastTs: last.timestamp || "",
                    };
                  });
                  const q = histQuery.trim().toLowerCase();
                  const matches = groups
                    .filter(g => !q || g.biz.toLowerCase().includes(q) || g.owner.toLowerCase().includes(q) || g.phone.toLowerCase().includes(q))
                    .sort((a,b)=> tsval(b.lastTs) - tsval(a.lastTs));
                  const CAP = 60;
                  const shown = matches.slice(0, CAP);
                  const sel = matches.find(g=>g.leadId===histSelected) || shown[0] || null;
                  const titleOf = g => g.biz || g.owner || g.phone || `Lead ${g.leadId}`;
                  const totalCalls = groups.reduce((n,g)=>n+g.calls.length,0);
                  return (
                    <div>
                      <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:12}}>
                        <span style={{fontSize:14,fontWeight:600,color:C.t1}}>Call History</span>
                        <span style={{fontSize:11,color:C.t3}}>{Object.keys(callHistory).length} leads · {totalCalls} calls logged</span>
                      </div>
                      <input value={histQuery} onChange={e=>{setHistQuery(e.target.value); setHistSelected(null);}}
                        placeholder="Search owner, business, or phone…" autoFocus
                        style={{width:"100%",maxWidth:520,border:`0.75px solid ${C.borderMd}`,borderRadius:100,
                          padding:"9px 16px",fontSize:13,background:C.bg,color:C.t1,outline:"none",fontFamily:F,marginBottom:14}}/>
                      <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-start"}}>
                        {/* master list */}
                        <div style={{flex:"1 1 300px",minWidth:280,maxWidth:400,display:"flex",flexDirection:"column",
                          gap:6,maxHeight:600,overflowY:"auto"}}>
                          <div style={{fontSize:10,color:C.t3,fontWeight:500,textTransform:"uppercase",letterSpacing:".03em"}}>
                            {q ? `${matches.length} result${matches.length!==1?"s":""}` : "Recently called"}{matches.length>CAP?` · showing ${CAP}`:""}
                          </div>
                          {shown.length===0 && (
                            <div style={{fontSize:12,color:C.t3,padding:"10px 2px"}}>
                              {Object.keys(callHistory).length===0 ? "Call history is still loading…" : `No calls match “${histQuery}”.`}
                            </div>
                          )}
                          {shown.map(g=>{
                            const last = g.calls[0]||{};
                            const isSel = sel && g.leadId===sel.leadId;
                            const oc = OUTCOMES[last.outcome];
                            return (
                              <button key={g.leadId} onClick={()=>setHistSelected(g.leadId)}
                                style={{textAlign:"left",border:`0.75px solid ${isSel?C.accent:C.border}`,
                                  background:isSel?C.accent+"0C":C.bg,borderRadius:10,padding:"9px 12px",cursor:"pointer",
                                  fontFamily:F,display:"flex",flexDirection:"column",gap:3}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                                  <span style={{fontSize:13,fontWeight:500,color:C.t1,overflow:"hidden",
                                    textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{titleOf(g)}</span>
                                  <span style={{fontSize:9,fontWeight:600,padding:"1px 7px",borderRadius:100,flexShrink:0,
                                    color:oc?.color||C.t3,background:(oc?.color||C.t3)+"18"}}>{oc?.short||last.outcome||"—"}</span>
                                </div>
                                <div style={{fontSize:10,color:C.t3,display:"flex",gap:6,flexWrap:"wrap"}}>
                                  {g.owner && <span>{g.owner}</span>}
                                  {(g.city||g.state) && <span>· {[g.city,g.state].filter(Boolean).join(", ")}</span>}
                                  <span>· {g.calls.length} call{g.calls.length!==1?"s":""}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        {/* detail */}
                        <div style={{flex:"2 1 420px",minWidth:340}}>
                          {!sel ? (
                            <div style={{border:`1px dashed ${C.border}`,borderRadius:12,padding:"40px 18px",
                              textAlign:"center",fontSize:12,color:C.t3}}>
                              {q ? "Select a result to see its full call history." : "Search a business or owner to begin."}
                            </div>
                          ) : (()=>{
                            const hist = sel.calls;
                            const callers = [...new Set(hist.map(h=>h.caller).filter(Boolean))];
                            const lastCall = hist[0]||{};
                            return (
                              // key by leadId → switching leads remounts, clearing uncontrolled
                              // <details>/<audio> state so it never bleeds onto another business.
                              <div key={sel.leadId} style={{display:"flex",flexDirection:"column",gap:12}}>
                                <div>
                                  <div style={{fontSize:16,fontWeight:600,color:C.t1}}>{titleOf(sel)}</div>
                                  <div style={{fontSize:11,color:C.t3,marginTop:2,display:"flex",gap:8,flexWrap:"wrap"}}>
                                    {sel.owner && <span>{sel.owner}</span>}
                                    {sel.phone && <span style={{fontFamily:FM}}>{sel.phone}</span>}
                                    {(sel.city||sel.state) && <span>{[sel.city,sel.state].filter(Boolean).join(", ")}</span>}
                                    {sel.icp && <span>{sel.icp}</span>}
                                  </div>
                                </div>
                                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                                  <div style={{background:C.surface,borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                                    <div style={{fontSize:18,fontWeight:500,color:C.t1,fontFamily:FM}}>{hist.length}</div>
                                    <div style={{fontSize:9,color:C.t3,marginTop:2}}>Total calls</div>
                                  </div>
                                  <div style={{background:C.surface,borderRadius:8,padding:"8px 10px",textAlign:"center",
                                    border:`0.75px solid ${OUTCOMES[lastCall.outcome]?.color||C.border}`}}>
                                    <div style={{fontSize:12,fontWeight:600,color:OUTCOMES[lastCall.outcome]?.color||C.t1,lineHeight:1.3}}>
                                      {OUTCOMES[lastCall.outcome]?.label||lastCall.outcome||"—"}
                                    </div>
                                    <div style={{fontSize:9,color:C.t3,marginTop:2}}>Last result</div>
                                  </div>
                                  <div style={{background:C.surface,borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                                    <div style={{fontSize:12,fontWeight:500,color:C.t1,lineHeight:1.3}}>{lastCall.caller||"—"}</div>
                                    <div style={{fontSize:9,color:C.t3,marginTop:2}}>Last caller</div>
                                  </div>
                                </div>
                                {callers.length>0 && (
                                  <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                                    <span style={{fontSize:10,color:C.t3,marginRight:2}}>Called by</span>
                                    {callers.map(c=>(
                                      <span key={c} style={{fontSize:10,padding:"2px 8px",borderRadius:100,
                                        background:C.t2+"14",color:C.t2,fontWeight:500}}>{c}</span>
                                    ))}
                                  </div>
                                )}
                                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                                  {hist.map((h,i)=>{
                                    const oc = OUTCOMES[h.outcome];
                                    const script = decodeScriptVariant(h.variant);
                                    const audio = playableAudioUrl(h.recording);
                                    const tr = (h.transcript||"").trim();
                                    const trIsUrl = /^https?:\/\//i.test(tr);
                                    return (
                                      <div key={(h.timestamp||"t")+"-"+i} style={{background:C.bg,borderRadius:10,padding:"10px 12px",
                                        border:`0.75px solid ${(oc?.color||C.border)}40`}}>
                                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                                          <div style={{display:"flex",gap:6,alignItems:"center"}}>
                                            <span style={{width:6,height:6,borderRadius:"50%",background:oc?.color||C.t3,flexShrink:0}}/>
                                            <span style={{fontSize:12,fontWeight:600,color:oc?.color||C.t1}}>{oc?.label||h.outcome||"Unknown"}</span>
                                          </div>
                                          <span style={{fontSize:10,color:C.t3,fontFamily:FM}}>{h.duration?fmt(h.duration):""}</span>
                                        </div>
                                        <div style={{display:"flex",justifyContent:"space-between",marginTop:4,
                                          alignItems:"center",flexWrap:"wrap",gap:4}}>
                                          <span style={{fontSize:11,color:C.t2,fontWeight:500}}>{h.caller||"Unknown caller"}</span>
                                          <span style={{fontSize:10,color:C.t3}}>
                                            {h.timestamp?new Date(h.timestamp).toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}):""}
                                          </span>
                                        </div>
                                        {script.title!=="—" && (
                                          <div style={{marginTop:6,display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                                            <span style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:".04em"}}>Script</span>
                                            <span title={script.raw} style={{fontSize:10,fontWeight:600,color:C.t1,
                                              padding:"1px 8px",borderRadius:100,background:C.accent+"12"}}>{script.title}</span>
                                            {script.parts.map((p,pi)=>(
                                              <span key={pi} style={{fontSize:10,color:C.t2,padding:"1px 8px",borderRadius:100,
                                                background:C.surface,border:`0.75px solid ${C.border}`}}>{p}</span>
                                            ))}
                                          </div>
                                        )}
                                        {h.spoke_with && <div style={{fontSize:10,color:C.t2,marginTop:5}}>Spoke with: <strong>{h.spoke_with}</strong></div>}
                                        {h.notes && (
                                          <div style={{fontSize:10,color:C.t2,marginTop:5,fontStyle:"italic",
                                            background:C.surface,borderRadius:6,padding:"5px 8px"}}>“{h.notes.slice(0,400)}{h.notes.length>400?"…":""}”</div>
                                        )}
                                        {audio ? (
                                          <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:3}}>
                                            <audio controls preload="none" style={{width:"100%",height:34}} src={audio} />
                                            <a href={audio} target="_blank" rel="noreferrer"
                                              style={{fontSize:10,color:C.accent,textDecoration:"none"}}>Open recording ↗</a>
                                          </div>
                                        ) : (
                                          <div style={{marginTop:8,fontSize:10,color:C.t3}}>No recording linked to this call.</div>
                                        )}
                                        {tr && (trIsUrl ? (
                                          <a href={tr} target="_blank" rel="noreferrer"
                                            style={{fontSize:10,color:C.accent,textDecoration:"none",marginTop:4,display:"inline-block"}}>View transcript ↗</a>
                                        ) : (
                                          <details style={{marginTop:6}}>
                                            <summary style={{fontSize:10,color:C.accent,cursor:"pointer"}}>Transcript</summary>
                                            <div style={{fontSize:11,color:C.t2,lineHeight:1.6,marginTop:4,whiteSpace:"pre-wrap",
                                              maxHeight:240,overflowY:"auto",background:C.surface,borderRadius:6,padding:"8px 10px"}}>{tr}</div>
                                          </details>
                                        ))}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                </div>
              </div>
            </>
          ):(
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
              justifyContent:"center",color:C.t3,fontSize:13,padding:"24px"}}>
              {/* The signature — rings etched faintly into the empty centre */}
              {sigOn && (
                <RingMark size={340} stroke={C.skyTint} index={sigIndex}
                  phrase={BELIEFS[sigPhrase]} dim={0.85} uid="center" outer dot/>
              )}
              <div style={{marginTop:sigOn?32:0,fontSize:13,color:C.t2,letterSpacing:"0.01em"}}>
                {leads.length===0?"Add leads to your Google Sheet to get started":"Select a lead to begin"}
              </div>
              {/* Tweaks — toggle the rings, the index marks, swap the belief phrase */}
              <div style={{marginTop:24,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",
                justifyContent:"center"}}>
                <button onClick={()=>setSigOn(v=>!v)} style={sigPillStyle(sigOn,false)}>Rings</button>
                <button disabled={!sigOn} onClick={()=>setSigIndex(v=>!v)}
                  style={sigPillStyle(sigOn&&sigIndex,!sigOn)} title="Index marks 01–03">01–03</button>
                <button disabled={!sigOn} onClick={()=>setSigPhrase(p=>(p+1)%BELIEFS.length)}
                  style={{...sigPillStyle(false,!sigOn),fontFamily:FM,letterSpacing:"0.02em"}}
                  title="Swap belief phrase">{BELIEFS[sigPhrase]} ⟳</button>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL (toggleable) ── */}
        {showStatsPanel && (
          <div style={{width:210,borderLeft:`0.75px solid ${C.border}`,
            display:"flex",flexDirection:"column",flexShrink:0}}>
            <div style={{padding:"8px 10px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:10,color:C.t3,fontWeight:500}}>Session stats</span>
              <button onClick={()=>setShowStatsPanel(false)}
                style={{border:"none",background:"transparent",color:C.t3,fontSize:14,
                  cursor:"pointer",padding:"0 2px",lineHeight:1}}>×</button>
            </div>
            <div style={{padding:"8px 10px 0",display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              {[
                {l:"Dials",v:stats.dials,c:C.t1},
                {l:"Answered",v:totalAns,c:C.t1},
                {l:"Demos",v:stats.demos,c:C.green},
                {l:"Looms",v:stats.looms,c:C.teal},
                {l:"Voicemail",v:stats.vm,c:C.amber},
                {l:"Connect%",v:stats.dials>0?connectRate+"%":"—",c:C.t1},
                {l:"Demo rate",v:totalAns>0?demoRate+"%":"—",c:C.green},
              ].map(({l,v,c})=>(
                <div key={l} style={{background:C.surface,borderRadius:8,
                  padding:"9px 10px",textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:400,color:c,lineHeight:1,fontFamily:FM}}>{v}</div>
                  <div style={{fontSize:9,color:C.t3,marginTop:3}}>{l}</div>
                </div>
              ))}
            </div>

            {/* Signature — toggle the rings, the index marks, swap the belief phrase */}
            <div style={{padding:"14px 12px 12px",marginTop:10,borderTop:`0.75px solid ${C.border}`}}>
              <div style={{fontSize:9,color:C.t3,fontWeight:600,letterSpacing:"0.06em",
                textTransform:"uppercase",marginBottom:8}}>Signature</div>
              <div style={{display:"flex",gap:6,marginBottom:6}}>
                <button onClick={()=>setSigOn(v=>!v)} style={sigPillStyle(sigOn,false)}>Rings</button>
                <button disabled={!sigOn} onClick={()=>setSigIndex(v=>!v)}
                  style={sigPillStyle(sigOn&&sigIndex,!sigOn)} title="Index marks 01–03">01–03</button>
              </div>
              <button disabled={!sigOn} onClick={()=>setSigPhrase(p=>(p+1)%BELIEFS.length)}
                title="Swap belief phrase"
                style={{...sigPillStyle(false,!sigOn),width:"100%",fontFamily:FM,letterSpacing:"0.02em",
                  justifyContent:"space-between"}}>
                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{BELIEFS[sigPhrase]}</span>
                <span style={{marginLeft:8,flexShrink:0}}>⟳</span>
              </button>
            </div>

            <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
              <div style={{padding:"0 14px 8px",fontSize:10,color:C.t3,
                borderBottom:`0.75px solid ${C.border}`}}>Session log</div>
              <div style={{flex:1,overflowY:"auto"}}>
                {log.length===0?(
                  <div style={{padding:16,textAlign:"center",fontSize:11,color:C.t3}}>
                    No calls yet
                  </div>
                ):log.map((e,i)=>(
                  <div key={i} style={{padding:"7px 14px",borderBottom:`0.75px solid ${C.border}`,
                    display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:10,color:C.t3,minWidth:16,fontFamily:FM}}>{e.num}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,color:C.t1,fontWeight:500,overflow:"hidden",
                        textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {e.biz.split(" ").slice(0,2).join(" ")}
                      </div>
                      <div style={{fontSize:10,color:C.t3,display:"flex",gap:4,marginTop:1}}>
                        <span style={{fontFamily:FM}}>{fmt(e.dur)}</span>
                        <span>·</span>
                        <span>S:{e.script?.toUpperCase()}</span>
                        {e.email&&<><span>·</span><span style={{color:C.t2}}>✉</span></>}
                      </div>
                    </div>
                    <div style={{fontSize:10,fontWeight:500,color:OUTCOMES[e.outcome]?.color}}>
                      {OUTCOMES[e.outcome]?.short}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Reset Call State safety button */}
            <button onClick={resetCallState}
              style={{margin:"6px 10px 8px",padding:"4px 0",borderRadius:6,
                border:`0.75px solid ${C.border}`,background:"transparent",
                color:C.t3,fontSize:9,cursor:"pointer",opacity:0.5,transition:"opacity 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.opacity="1"}
              onMouseLeave={e=>e.currentTarget.style.opacity="0.5"}>
              Reset Call State
            </button>
          </div>
        )}
      </div>

      {/* Persistent "Log disposition" button — for re-logging when not on a live call
          (during a call, the header "End Call" button opens the dispositions). */}
      {active&&!dispoBarOpen&&!callRun&&sessRun&&(
        <button onClick={openDispoBar}
          style={{position:"fixed",bottom:16,right:20,padding:"6px 16px",borderRadius:100,
            border:`0.75px solid ${C.border}`,background:C.bg,color:C.t2,fontSize:11,fontWeight:500,
            cursor:"pointer",boxShadow:"0 2px 10px rgba(28,61,82,0.07)",zIndex:100}}>
          Log disposition
        </button>
      )}

      {/* Disposition bar overlay */}
      {dispoBarOpen&&(
        <div style={{position:"fixed",inset:0,zIndex:9000,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}
          onClick={e=>{if(e.target===e.currentTarget)setDispoBarOpen(false);}}>
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.3)"}}/>
          <div style={{position:"relative",background:C.bg,borderTop:`0.75px solid ${C.border}`,
            borderRadius:"16px 16px 0 0",padding:"20px 24px 24px",maxHeight:"70vh",overflowY:"auto",
            animation:"slideUp 0.3s ease",boxShadow:"0 -2px 16px rgba(28,61,82,0.07)"}}>

            <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
              <span style={{fontSize:14,fontWeight:500}}>Log disposition</span>
              {active&&<span style={{fontSize:12,color:C.t3,marginLeft:10}}>— {active.biz}</span>}
              <button onClick={()=>setDispoBarOpen(false)}
                style={{marginLeft:"auto",border:"none",background:"transparent",fontSize:16,
                  color:C.t3,cursor:"pointer",padding:"4px 8px"}}>✕</button>
            </div>

            {/* Disposition grid */}
            <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:16}}>
              {OUTCOME_ROWS.map((row,ri)=>(
                <div key={ri} style={{display:"grid",gridTemplateColumns:`repeat(${row.length},1fr)`,gap:4}}>
                  {row.map(key=>{
                    const o=OUTCOMES[key];
                    const sel=pendingOutcome===key;
                    return (
                      <button key={key} onClick={()=>selectOutcome(key)}
                        style={{padding:"8px 6px",borderRadius:8,
                          border:`1.5px solid ${sel?o.color:o.color+"30"}`,
                          background:sel?o.color+"15":o.color+"06",
                          color:o.color,fontSize:11,fontWeight:sel?600:500,
                          cursor:"pointer",transition:"all 0.15s"}}>
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Conditional fields */}
            {pendingOutcome&&(
              <div style={{display:"flex",flexDirection:"column",gap:10,
                borderTop:`0.75px solid ${C.border}`,paddingTop:14}}>

                {OUTCOMES[pendingOutcome]?.needsEmail&&(
                  <div>
                    <div style={{fontSize:10,color:C.t3,marginBottom:4}}>
                      {pendingOutcome==="demo_booked"?"Prospect email":"Prospect email"}
                    </div>
                    <input type="email" value={captureEmail} onChange={e=>setCaptureEmail(e.target.value)}
                      placeholder="owner@business.com"
                      style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:6,
                        padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none"}}/>
                  </div>
                )}

                {OUTCOMES[pendingOutcome]?.needsLoom&&(
                  <div>
                    <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Loom context</div>
                    <textarea value={loomContext} onChange={e=>setLoomContext(e.target.value)}
                      placeholder="What should the Loom cover for this prospect?"
                      rows={2} style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:6,
                        padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none",resize:"vertical"}}/>
                  </div>
                )}

                {OUTCOMES[pendingOutcome]?.needsDateTime&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div>
                      <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Callback date</div>
                      <input type="date" value={callbackDate} onChange={e=>setCallbackDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:6,
                          padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none"}}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Callback time</div>
                      <input type="time" value={callbackTime} onChange={e=>setCallbackTime(e.target.value)}
                        style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:6,
                          padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none"}}/>
                    </div>
                  </div>
                )}

                {pendingOutcome==="followup_sent"&&(
                  <div>
                    <div style={{fontSize:10,color:C.t3,marginBottom:4}}>What to send</div>
                    <div style={{display:"flex",gap:6}}>
                      {[{v:"website",l:"Website link"},{v:"info_packet",l:"Info packet"},{v:"case_study",l:"Case study"}].map(opt=>(
                        <button key={opt.v} onClick={()=>setSendType(opt.v)}
                          style={{padding:"4px 12px",borderRadius:100,
                            border:`0.75px solid ${sendType===opt.v?C.t1:C.border}`,
                            background:sendType===opt.v?`${C.t1}08`:"transparent",
                            color:sendType===opt.v?C.t1:C.t2,fontSize:11,fontWeight:500,cursor:"pointer"}}>
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {OUTCOMES[pendingOutcome]?.needsGatekeeper&&(
                  <div>
                    <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Gatekeeper name</div>
                    <input value={gatekeeperName} onChange={e=>setGatekeeperName(e.target.value)}
                      placeholder="e.g. Maria, front desk"
                      style={{width:"100%",border:`0.75px solid ${C.border}`,borderRadius:6,
                        padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none"}}/>
                  </div>
                )}

                {pendingOutcome && pendingOutcome!=="no_answer" && pendingOutcome!=="voicemail" && (
                  <div>
                    <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Spoke with</div>
                    <div style={{display:"flex",gap:6}}>
                      {["Owner","Gatekeeper","Manager","Unknown"].map(opt=>(
                        <button key={opt} onClick={()=>setSpokeWith(opt)}
                          style={{padding:"4px 12px",borderRadius:100,
                            border:`0.75px solid ${spokeWith===opt?C.t1:C.border}`,
                            background:spokeWith===opt?`${C.t1}08`:"transparent",
                            color:spokeWith===opt?C.t1:C.t2,fontSize:11,fontWeight:500,cursor:"pointer"}}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button onClick={confirmOutcome} disabled={!canSubmit()}
                  style={{width:"100%",padding:"10px 0",borderRadius:8,border:"none",
                    background:canSubmit()?C.t1:`${C.t3}40`,color:canSubmit()?C.bg:C.t3,
                    fontSize:13,fontWeight:500,cursor:canSubmit()?"pointer":"not-allowed",
                    marginTop:4}}>
                  {canSubmit()?`Confirm — ${OUTCOMES[pendingOutcome]?.label}`:"Fill required fields"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>

      {/* ── ADMIN CONSOLE (Javi only) ── */}
      {showAdminPanel&&(
        <div style={{position:"fixed",inset:0,zIndex:9500,display:"flex",alignItems:"center",justifyContent:"center"}}
          onClick={e=>{if(e.target===e.currentTarget)setShowAdminPanel(false);}}>
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.35)"}}/>
          <div style={{position:"relative",background:C.bg,borderRadius:16,padding:"24px 28px",
            width:460,maxHeight:"80vh",overflowY:"auto",
            boxShadow:"0 6px 30px rgba(28,61,82,0.10)",animation:"slideDown 0.2s ease"}}>
            <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
              <span style={{fontSize:15,fontWeight:600}}>Admin Settings</span>
              <button onClick={()=>setShowAdminPanel(false)}
                style={{marginLeft:"auto",border:"none",background:"transparent",fontSize:16,
                  color:C.t3,cursor:"pointer",padding:"4px 8px"}}>✕</button>
            </div>

            {/* ── Admin tab navigation ── */}
            <div style={{display:"flex",gap:4,marginBottom:16,borderBottom:`0.75px solid ${C.border}`,paddingBottom:8}}>
              {[{id:"icps",label:"ICPs"},{id:"scripts",label:"Scripts"}].map(t=>(
                <button key={t.id} onClick={()=>setAdminTab(t.id)}
                  style={{padding:"5px 16px",borderRadius:8,border:"none",
                    background:adminTab===t.id?C.t1:"transparent",
                    color:adminTab===t.id?C.bg:C.t2,
                    fontSize:11,fontWeight:600,cursor:"pointer",transition:"all 0.15s"}}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── ICPs tab ── */}
            {adminTab==="icps"&&(
              <div>
                <div style={{fontSize:11,color:C.t3,marginBottom:14}}>
                  Toggle verticals on/off. Disabled ICPs are hidden from the queue and filters for all callers.
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {Object.entries(GROUP_LABEL).map(([key,label])=>{
                    const isOff = disabledIcps.has(key);
                    const count = leads.filter(l=>icpGroup(l.icp)===key).length;
                    return (
                      <div key={key} style={{display:"flex",alignItems:"center",gap:12,
                        padding:"12px 14px",borderRadius:10,
                        border:`0.75px solid ${isOff?C.border:C.green+"40"}`,
                        background:isOff?C.surface:`${C.green}06`}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:600,color:isOff?C.t3:C.t1}}>{label}</div>
                          <div style={{fontSize:10,color:C.t3}}>{count} lead{count!==1?"s":""} in queue</div>
                        </div>
                        <button onClick={()=>{
                          setDisabledIcps(prev=>{
                            const next = new Set(prev);
                            if(next.has(key)) next.delete(key);
                            else next.add(key);
                            localStorage.setItem("harmonia-admin-disabled-icps",JSON.stringify([...next]));
                            return next;
                          });
                          // Reset filter if current filter is being disabled
                          if(!disabledIcps.has(key) && filter===key) setFilter("all");
                        }}
                          style={{padding:"5px 16px",borderRadius:100,fontSize:11,fontWeight:500,
                            border:`0.75px solid ${isOff?C.border:C.green}`,
                            background:isOff?"transparent":`${C.green}15`,
                            color:isOff?C.t3:C.green,cursor:"pointer",
                            transition:"all 0.15s",minWidth:76}}>
                          {isOff?"Disabled":"Enabled"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Scripts tab ── */}
            {adminTab==="scripts"&&(
              <div>
                <div style={{fontSize:11,color:C.t3,marginBottom:14}}>
                  Toggle scripts on/off for all callers. Disabled scripts are hidden from everyone's Script Mixer.
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {Object.entries(scripts.salon || scripts.hvac || {}).map(([varId, script])=>{
                    const isDisabled = disabledScripts.has(varId);
                    const opener = script.lines.find(l => l.type === "opener");
                    const name = opener?.name || script.name;
                    const tag = opener?.tag || script.tag;
                    return (
                      <div key={varId} style={{display:"flex",alignItems:"center",gap:12,
                        padding:"10px 14px",borderRadius:10,
                        border:`0.75px solid ${isDisabled?C.border:C.green+"40"}`,
                        background:isDisabled?C.surface:`${C.green}06`}}>
                        <span style={{fontFamily:FM,fontSize:11,color:C.t3,minWidth:16}}>{varId}</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:12,fontWeight:500,color:isDisabled?C.t3:C.t1}}>{name}</div>
                          <div style={{fontSize:10,color:C.t3}}>{tag}</div>
                        </div>
                        <button onClick={()=>{
                          setDisabledScripts(prev => {
                            const next = new Set(prev);
                            if (next.has(varId)) next.delete(varId);
                            else next.add(varId);
                            localStorage.setItem("harmonia-admin-disabled-scripts", JSON.stringify([...next]));
                            return next;
                          });
                        }}
                          style={{padding:"4px 14px",borderRadius:100,fontSize:11,fontWeight:500,
                            border:`0.75px solid ${isDisabled?C.border:C.green}`,
                            background:isDisabled?"transparent":`${C.green}15`,
                            color:isDisabled?C.t3:C.green,cursor:"pointer",
                            transition:"all 0.15s",minWidth:72}}>
                          {isDisabled?"Disabled":"Enabled"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
