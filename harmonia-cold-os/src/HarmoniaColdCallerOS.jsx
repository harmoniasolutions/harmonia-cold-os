import { useState, useEffect, useRef } from "react";
import { SCRIPT_OPTIONS, OBJECTION_PRESETS } from './config/sheetMapping';
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
const DISCORD_WEBHOOK_URL = 'https://infoharmonia.app.n8n.cloud/webhook/cold-call-discord';
const CALENDLY_URL = import.meta.env.VITE_CALENDLY_URL || 'https://calendly.com/harmonia-demo';

async function fetchSheet(tab) {
  const res = await fetch(`${BASE}/${tab}?key=${API_KEY}`);
  const json = await res.json();
  const [headers, ...rows] = json.values || [];
  return rows.map(row =>
    Object.fromEntries(headers.map((h, i) => [h.trim(), row[i] ?? ""]))
  );
}

/* ─────────────────────────────────────────────
   DESIGN TOKENS
───────────────────────────────────────────── */
const C = {
  bg:       "#FFFFFF",
  surface:  "#F5F5F7",
  border:   "#E5E5EA",
  borderMd: "#D1D1D6",
  t1:       "#1D1D1F",
  t2:       "#6E6E73",
  t3:       "#AEAEB2",
  accent:   "#0071E3",
  green:    "#34C759",
  amber:    "#FF9500",
  red:      "#FF3B30",
  teal:     "#32ADE6",
  purple:   "#AF52DE",
};
const F  = "'DM Sans', -apple-system, sans-serif";
const FM = "'DM Mono', 'SF Mono', monospace";

const ICP_LABEL  = { hvac:"HVAC", salon:"Salon", barbershop:"Barber" };
const SCORE_DOT  = { A:C.green, B:C.amber, C:C.red };
const LINE_COLOR = { opener:C.accent, bridge:C.purple, discovery:C.teal, pitch:C.amber, close:C.green };

const DEFAULT_PHASES = [
  { id: "opener",    label: "Opener",    color: "#EF4444", isDefault: true },
  { id: "bridge",    label: "Bridge",    color: "#a855f7", isDefault: true },
  { id: "discovery", label: "Discovery", color: "#F59E0B", isDefault: true },
  { id: "pitch",     label: "Pitch",     color: "#3B82F6", isDefault: true },
  { id: "close",     label: "Close",     color: "#10B981", isDefault: true },
];
const COLOR_PALETTE = ["#EF4444","#F59E0B","#3B82F6","#10B981","#8B5CF6","#EC4899","#14B8A6","#F97316","#6366F1","#84CC16"];

// ── Bridge phase data ──
// BUBBLE_STYLES — rendering config only, not content data
const BUBBLE_STYLES = {
  green:  { bg:"#f0fdf4", border:"#86efac", text:"#166534", dot:"#22c55e", label:"They're open — deliver this" },
  yellow: { bg:"#fefce8", border:"#fde047", text:"#854d0e", dot:"#eab308", label:"Pivot — redirect to Discovery" },
  red:    { bg:"#fef2f2", border:"#fca5a5", text:"#991b1b", dot:"#ef4444", label:"Handle — reframe and redirect" },
};

const OUTCOMES = {
  demo_booked:    { label:"Demo booked",    color:C.green,   short:"Demo", ghl:"Meeting Booked",      discord:"#meetings-booked",  needsEmail:true,  needsBooking:true  },
  loom_sent:      { label:"Send Loom",      color:C.teal,    short:"Loom", ghl:"Loom Outreach",       discord:"#loom-queue",       needsEmail:true,  needsLoom:true     },
  callback:       { label:"Callback later", color:C.amber,   short:"CB",   ghl:"Follow-Up Scheduled", discord:"#follow-ups",       needsDateTime:true                  },
  followup_sent:  { label:"Send info",      color:C.purple,  short:"Info", ghl:"Nurture",             discord:null,                needsEmail:true                     },
  answered:       { label:"Answered",       color:C.accent,  short:"Ans",  ghl:null,                  discord:null                                                    },
  voicemail:      { label:"Left voicemail", color:C.amber,   short:"VM",   ghl:null,                  discord:null                                                    },
  gatekeeper:     { label:"Gatekeeper",     color:C.t2,      short:"GK",   ghl:null,                  discord:null,                needsGatekeeper:true                },
  no_answer:      { label:"No answer/VM",   color:C.red,     short:"N/A",  ghl:null,                  discord:null                                                    },
  not_interested: { label:"Not interested", color:C.t3,      short:"N/I",  ghl:"Closed Lost",         discord:null                                                    },
  not_qualified:  { label:"Not qualified",  color:C.t3,      short:"N/Q",  ghl:"Closed Lost",         discord:null                                                    },
  dnc:            { label:"Do not call",    color:C.red,     short:"DNC",  ghl:"Do Not Contact",      discord:null                                                    },
};

// ── Offer color palette — cycles through for each offer loaded from sheet ──
const OFFER_COLORS = ["#F97316","#10B981","#3B82F6","#8B5CF6","#EC4899","#F59E0B","#14B8A6","#EF4444"];

const OUTCOME_ROWS = [
  ["demo_booked", "loom_sent", "callback", "followup_sent"],
  ["answered", "voicemail", "gatekeeper", "no_answer"],
  ["not_interested", "not_qualified", "dnc"],
];

const pad  = (n) => String(n).padStart(2,"0");
const fmt  = (s) => `${pad(Math.floor(s/60))}:${pad(s%60)}`;
const fmtH = (s) => {
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60;
  return h>0?`${pad(h)}:${pad(m)}:${pad(sc)}`:`${pad(m)}:${pad(sc)}`;
};
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
   DATA PARSERS
───────────────────────────────────────────── */
function parseLeads(rows) {
  return rows
    .filter(r => r.biz && r.biz.trim() !== "")
    .map((r, i) => ({
      ...r,
      id:            r.id || r.phone || `lead-${i}`,
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
    }));
}

function parseScripts(rows) {
  const out = {};
  rows.forEach(r => {
    const icp = r.icp, id = r.opener_id || r.variant;
    const { name, tag, type, text } = r;
    if (!icp || !id) return;
    if (!out[icp]) out[icp] = {};
    if (!out[icp][id]) out[icp][id] = { name, tag, lines: [] };
    if (type && text) out[icp][id].lines.push({ type, text });
  });
  return out;
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
//   discovery      — tag: ROOT → root question node (name=variant label, text=root question)
//   discovery_branch — tag: green/yellow/red → branch node (name=label, text=response)
// Returns { bubbles: { [icp]: { bridge:[], close:[] } }, branches: { [icp]: { [variant]: [...] } } }
function parseBubblesAndBranches(rows) {
  const bubbles = {};  // keyed by icp
  const branches = {}; // keyed by icp then variant
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
    } else if (t === 'discovery' && tag.toUpperCase() === 'ROOT') {
      const vid = r.variant || '1';
      if (!branches[icp][vid]) branches[icp][vid] = [];
      branches[icp][vid].push({
        branchId: 'ROOT', parentId: null, depth: 0, rootQuestion: r.text || '',
        label: '', type: '', response: '', nextPhase: '', variantLabel: r.name || `Variant ${vid}`,
      });
    } else if (t === 'discovery_branch') {
      const vid = r.variant || '1';
      if (!branches[icp][vid]) branches[icp][vid] = [];
      const color = tag.toLowerCase() || 'yellow';
      const existingChildren = branches[icp][vid].filter(n => n.parentId === 'ROOT' && n.depth === 1).length;
      const branchId = `${vid}${String.fromCharCode(65 + existingChildren)}`;
      branches[icp][vid].push({
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
   MAIN COMPONENT
───────────────────────────────────────────── */
export default function HarmoniaOS() {
  const [leads,    setLeads]    = useState([]);
  const [scripts,  setScripts]  = useState({});
  const [objections,setObjections]= useState({});
  const [bridgeBubbles, setBridgeBubbles] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [loadError,setLoadError]= useState(null);

  const [active,   setActive]   = useState(null);
  const [filter,   setFilter]   = useState("all");
  const [tab,      setTab]      = useState("intel");
  const [variant,  setVariant]  = useState("1");
  const [caller,   setCaller]   = useState("+16178006699");
  const [sessRun,  setSessRun]  = useState(false);
  const [sessSecs, setSessSecs] = useState(0);
  const [callRun,  setCallRun]  = useState(false);
  const [callSecs, setCallSecs] = useState(0);
  const [stats,    setStats]    = useState({ dials:0, answered:0, demos:0, vm:0, looms:0 });
  const [log,      setLog]      = useState([]);
  const [openObj,  setOpenObj]  = useState(null);
  const [flash,    setFlash]    = useState(null);
  const [callerName,       setCallerName]       = useState("");   // Task 4a — session-level, persists
  const [selectedScript,   setSelectedScript]   = useState("");   // Task 2 — resets per call
  const [customScript,     setCustomScript]     = useState("");   // Task 2 — custom script name
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

  // Phase order — reorderable, removable, addable
  const [phaseOrder, setPhaseOrder] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("harmonia-phase-order"));
      if (Array.isArray(stored) && stored.length > 0) {
        // Migrate: re-inject any missing default phases in their natural position
        let changed = false;
        DEFAULT_PHASES.forEach((dp, di) => {
          if (!stored.find(p => p.id === dp.id)) {
            // Insert after the previous default phase, or at position di
            const prevDefault = DEFAULT_PHASES[di - 1];
            const insertAfter = prevDefault ? stored.findIndex(p => p.id === prevDefault.id) : -1;
            stored.splice(insertAfter >= 0 ? insertAfter + 1 : Math.min(di, stored.length), 0, dp);
            changed = true;
          }
        });
        if (changed) try { localStorage.setItem("harmonia-phase-order", JSON.stringify(stored)); } catch {}
        return stored;
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
  const [bubbleData, setBubbleData] = useState({}); // { [icp]: { bridge:[], close:[] } }
  const [branchData, setBranchData] = useState({}); // { [icp]: { [variant]: [flat branch nodes] } }
  const [activeBranches, setActiveBranches] = useState({}); // { depth: branch_id }
  const [addBranchForm, setAddBranchForm] = useState(null); // { parentId, depth } or null
  const [newBranchLabel, setNewBranchLabel] = useState("");
  const [newBranchType, setNewBranchType] = useState("green");
  const [newBranchResponse, setNewBranchResponse] = useState("");
  const [collapsedPhases, setCollapsedPhases] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem("harmonia-collapsed-phases")); return new Set(Array.isArray(s)?s:[]); } catch { return new Set(); }
  });

  // Script Mixer — per-caller editable scripts
  const [phaseSelections, setPhaseSelections] = useState({opener:"1",bridge:"1",discovery:"1",pitch:"1",close:"1"});
  const [callerScripts, setCallerScripts] = useState({}); // { "opener_1": "custom text", ... }
  const [scriptSaveStatus, setScriptSaveStatus] = useState({}); // { phase: 'saved'|'saving'|'reset'|null }
  const saveTimerRefs = useRef({});

  // Shared Lead Notes
  const [leadNotesData, setLeadNotesData] = useState({}); // { leadId: { text, edited_by, edited_at } }
  const [notesSaveStatus, setNotesSaveStatus] = useState(null);
  const notesSaveRef = useRef(null);
  const [spokeWith, setSpokeWith] = useState("");

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

  // Call history from Script_Performance tab — shared across all callers
  const [callHistory, setCallHistory] = useState({}); // { leadId: [{caller, outcome, duration, variant, timestamp, notes, spoke_with}, ...] }

  // Clean broken formula values (#ERROR!, #NAME?, #REF!) and strip leading = from formula cells
  function clean(v) {
    if (!v || typeof v !== "string") return v || "";
    if (v.startsWith("#") && (v.includes("ERROR") || v.includes("NAME") || v.includes("REF") || v.includes("VALUE"))) return "";
    if (v.startsWith("=")) return v.slice(1);
    return v;
  }

  // Parse a Script_Performance row — handles both sheet headers ("Lead ID") and webhook keys ("lead_id")
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
    return { lid, caller, outcome, duration, variant, timestamp, notes, spoke_with: spokeW, biz, gatekeeper };
  }

  // Re-fetch Script_Performance and rebuild call history map
  async function refreshCallHistory() {
    try {
      const perfRaw = await fetchSheet("Script_Performance");
      const histMap = {};
      perfRaw.forEach(r => {
        const p = parsePerfRow(r);
        if (!p.lid || !p.lid.trim()) return;
        if (!histMap[p.lid]) histMap[p.lid] = [];
        histMap[p.lid].push({
          caller:     p.caller,
          outcome:    p.outcome,
          duration:   p.duration,
          variant:    p.variant,
          timestamp:  p.timestamp,
          notes:      p.notes,
          spoke_with: p.spoke_with,
          biz:        p.biz,
        });
      });
      Object.values(histMap).forEach(arr => arr.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)));
      setCallHistory(histMap);
      console.log("[Harmonia] Call history built for", Object.keys(histMap).length, "leads");
    } catch(e) { console.error("[Harmonia] Failed to refresh call history:", e); }
  }

  const sessRef = useRef(); const callRef = useRef();

  /* ── FETCH ALL SHEET DATA ON MOUNT ── */
  useEffect(() => {
    async function load() {
      try {
        const [leadsRaw, scriptsRaw, objectionsRaw, offersRaw] = await Promise.all([
          fetchSheet("Leads"),
          fetchSheet("Scripts"),
          fetchSheet("Objections"),
          fetchSheet("Offers").catch(() => []),
        ]);
        const parsedLeads = parseLeads(leadsRaw);
        setLeads(parsedLeads);
        setScripts(parseScripts(scriptsRaw));
        setObjections(parseObjections(objectionsRaw));
        const parsedOffers = parseOffers(offersRaw);
        setOffers(parsedOffers);
        // Fetch call history from Script_Performance (non-blocking)
        refreshCallHistory();
        // Parse bubbles and branches from Scripts tab
        const parsed = parseBubblesAndBranches(scriptsRaw);
        if (Object.keys(parsed.bubbles).length > 0) setBubbleData(parsed.bubbles);
        if (Object.keys(parsed.branches).length > 0) setBranchData(parsed.branches);
        if (parsedLeads.length > 0) {
          setActive(parsedLeads[0]);
          const recs = getRecommendedOpeners(parsedLeads[0]);
          const avail = Object.keys(parseScripts(scriptsRaw)[parsedLeads[0]?.icp] || {});
          const pick = recs.find(r => avail.includes(r.openerId));
          setVariant(pick ? pick.openerId : avail[0] || "1");
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

  // Load per-caller custom scripts from localStorage
  useEffect(() => {
    if (callerName) {
      try {
        const stored = JSON.parse(localStorage.getItem(`harmonia-scripts-${callerName}`) || "{}");
        setCallerScripts(stored);
      } catch { setCallerScripts({}); }
    }
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

  const activeLeads  = leads.filter(l => !disabledIcps.has(l.icp));
  const filtered     = activeLeads.filter(l => filter==="all" || l.icp===filter);
  const queueLeft    = filtered.filter(l=>l.status==="queued").length;
  const totalAns     = stats.answered + stats.demos;
  const connectRate  = stats.dials>0 ? Math.round(totalAns/stats.dials*100) : 0;
  const demoRate     = totalAns>0    ? Math.round(stats.demos/totalAns*100) : 0;

  const curScripts   = scripts[active?.icp] || {};
  const curScript    = curScripts[variant]  || curScripts[Object.keys(curScripts)[0]];
  const curObjs      = [...(objections[active?.icp] || []), ...(customObjections[active?.icp] || [])];
  const variants     = Object.keys(curScripts);
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
    const avail = Object.keys(scripts[lead?.icp] || {});
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
    if (lead.corporate_phone) phones.push({ label: "Corporate", number: lead.corporate_phone });
    if (lead.mobile_phone)    phones.push({ label: "Mobile",    number: lead.mobile_phone });
    if (lead.home_phone)      phones.push({ label: "Home",      number: lead.home_phone });
    // fallback for old data that still has single "phone" field
    if (phones.length === 0 && lead.phone) phones.push({ label: "Phone", number: lead.phone });
    return phones;
  }

  async function dial(lead, phoneNumber){
    if(!sessRun||callRun||lead.status!=="queued"||!callerName) return;
    const num = phoneNumber || getLeadPhones(lead)[0]?.number;
    if (!num) return;
    setActive(lead);setCallRun(true);setCallSecs(0);setTab("script");setOpenObj(null);
    resetCaptureFields();
    setPhoneMenuOpen(false);
    setLastDialedPhone(num);
    setStats(s=>({...s,dials:s.dials+1}));
    const url=`https://infoharmonia.app.n8n.cloud/webhook/click_to_call?from=${encodeURIComponent(caller)}&to=${encodeURIComponent(num)}`;
    try{ await fetch(url,{method:"GET",mode:"no-cors"}); }
    catch(e){ console.log("Call fired:",num); }
  }

  function openDispoBar() {
    if (closeEmailStatus==="success" && closeEmail.trim()) {
      setCaptureEmail(closeEmail.trim());
      setPendingOutcome("demo_booked");
    }
    setDispoBarOpen(true);
  }

  function selectOutcome(outcome) {
    setPendingOutcome(outcome);
    if (outcome === "callback") {
      const def = defaultCallbackDateTime();
      setCallbackDate(def.date);
      setCallbackTime(def.time);
    }
    setCalendlyOpened(false);
  }

  function canSubmit() {
    if (!pendingOutcome) return false;
    const meta = OUTCOMES[pendingOutcome];
    if (meta.needsEmail && !captureEmail.trim()) return false;
    if (meta.needsDateTime && (!callbackDate || !callbackTime)) return false;
    if (meta.needsBooking && !captureEmail.trim()) return false;
    return true;
  }

  async function confirmOutcome(){
    if(!active||!pendingOutcome||!canSubmit()) return;
    const outcome = pendingOutcome;
    const meta = OUTCOMES[outcome];
    const dur=callSecs; setCallRun(false); setCallSecs(0);
    const finalPhaseTimes = {...phaseTimes, [callPhase]: phaseTimes[callPhase] + phaseSecs};
    setPhaseSecs(0);

    const scriptUsed = selectedScript === "custom"
      ? `Custom: ${customScript}`
      : selectedScript
        ? (() => { const opt = (SCRIPT_OPTIONS[active.icp]||[]).find(s=>s.variant===selectedScript); return opt ? `${active.icp}-${opt.variant}: ${opt.name}` : selectedScript; })()
        : variant;

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
      status: outcome==="demo_booked"?"demo_booked"
            : outcome==="dnc"?"dnc"
            : outcome==="not_qualified"?"not_qualified"
            : (outcome==="no_answer"||outcome==="voicemail")?"queued"
            : "called",
      script_used:scriptUsed,
      prospect_email: captureEmail || l.prospect_email || "",
      pain: hasDiscoveryInput ? livePain : l.pain,
      call_count: newCallCount,
      last_call_timestamp: newTimestamp,
      disposition: outcome,
      spoke_with: spokeWith || l.spoke_with || "",
    }:l));

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
      const payload = {
        lead_id:active.id, biz:active.biz, owner:active.owner, phone:lastDialedPhone||active.corporate_phone||active.mobile_phone||active.home_phone||active.phone,
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
    } catch(err){ console.error('webhook failed:',err); }

    resetCaptureFields();
    setDispoBarOpen(false);
    const next=filtered.find(l=>l.id!==active.id&&l.status==="queued");
    if(next){selectLead(next);setTab("intel");}
    // Sheets write handled by n8n webhook above
  }

  function resetCaptureFields() {
    setPendingOutcome(null);
    setSelectedScript("");setCustomScript("");
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
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
        button,select{font-family:${F};cursor:pointer}
        @keyframes slideDown{from{transform:translateY(-8px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(29,29,31,0.3)}50%{box-shadow:0 0 0 8px rgba(29,29,31,0)}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-4px)}40%,80%{transform:translateX(4px)}}
        a{color:${C.accent};text-decoration:none}a:hover{text-decoration:underline}
      `}</style>

      {flash&&<div style={{position:"fixed",top:18,left:"50%",transform:"translateX(-50%)",
        background:C.t1,color:C.bg,padding:"9px 22px",borderRadius:100,fontSize:13,fontWeight:500,
        zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.15)",animation:"slideDown 0.2s ease",
        display:"flex",alignItems:"center",gap:12}}>
        {flash}
        {undoLast&&<button onClick={undoLastDisposition}
          style={{background:"transparent",border:`1px solid ${C.bg}50`,color:C.bg,
            padding:"2px 10px",borderRadius:100,fontSize:11,fontWeight:500,cursor:"pointer",
            marginLeft:4}}>Undo</button>}
      </div>}

      {/* ── HEADER ── */}
      <div style={{borderBottom:`1px solid ${C.border}`,padding:"0 20px",display:"flex",
        alignItems:"center",gap:22,height:52,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"baseline",gap:7}}>
          <span style={{fontSize:14,fontWeight:500,letterSpacing:"-0.01em"}}>Harmonia</span>
          <span style={{fontSize:11,color:C.t3}}>Cold Caller</span>
        </div>
        <div style={{width:1,height:18,background:C.border}}/>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <span style={{fontSize:11,color:C.t3}}>Caller</span>
          <select value={callerName} onChange={e=>{
              const sel=e.target.value;
              setCallerName(sel);
              const match=[
                {name:"Javi",   phone:"+16102153863"},
                {name:"Julian", phone:"+16092771636"},
                {name:"Owen",   phone:"+16094120214"},
                {name:"Joel",   phone:"+16096743986"},
                {name:"Pete",   phone:null},
              ].find(c=>c.name===sel);
              if(match) setCaller(match.phone);
            }}
            style={{border:`1px solid ${callerName?C.border:C.amber}`,borderRadius:6,padding:"3px 8px",
              fontSize:12,background:C.bg,color:callerName?C.t1:C.t3,outline:"none"}}>
            <option value="">Select caller...</option>
            {[
              {name:"Javi",   phone:"+16102153863"},
              {name:"Julian", phone:"+16092771636"},
              {name:"Owen",   phone:"+16094120214"},
              {name:"Joel",   phone:"+16096743986"},
              {name:"Pete",   phone:null},
            ].map(c=><option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div style={{width:1,height:18,background:C.border}}/>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:17,fontWeight:300,letterSpacing:"0.04em",fontFamily:FM,
            color:sessRun?C.t1:C.t3,minWidth:68}}>{fmtH(sessSecs)}</span>
          <button onClick={sessRun?endSess:startSess}
            style={{padding:"4px 14px",borderRadius:6,
              border:`1px solid ${sessRun?C.red:C.accent}`,background:"transparent",
              color:sessRun?C.red:C.accent,fontSize:11,fontWeight:500}}>
            {sessRun?"End":"Start session"}
          </button>
        </div>
        <div style={{width:1,height:18,background:C.border}}/>
        {[{l:"Dials",v:stats.dials,c:C.t1},{l:"Connect",v:stats.dials>0?connectRate+"%":"—",c:C.accent},
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
        <button onClick={()=>setShowStatsPanel(v=>!v)}
          style={{padding:"4px 10px",borderRadius:6,
            border:`1px solid ${showStatsPanel?C.t1:C.border}`,
            background:showStatsPanel?C.t1:"transparent",
            color:showStatsPanel?C.bg:C.t2,
            fontSize:10,fontWeight:500,transition:"all 0.15s"}}>
          {showStatsPanel?"Hide Stats":"Stats & Log"}
        </button>
        {callerName==="Javi"&&(
          <>
            <div style={{width:1,height:18,background:C.border}}/>
            <button onClick={()=>setShowAdminPanel(true)}
              style={{padding:"4px 10px",borderRadius:6,
                border:`1px solid ${C.border}`,background:"transparent",
                color:C.t2,fontSize:10,fontWeight:500,cursor:"pointer",
                transition:"all 0.15s"}}>
              Admin
            </button>
          </>
        )}
      </div>

      {/* ── BODY ── */}
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>

        {/* ── QUEUE ── */}
        <div style={{width:244,borderRight:`1px solid ${C.border}`,
          display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{padding:"9px 10px 8px",borderBottom:`1px solid ${C.border}`,
            display:"flex",gap:4,flexWrap:"wrap"}}>
            {["all","hvac","salon","barbershop"].filter(f=>f==="all"||!disabledIcps.has(f)).map(f=>(
              <button key={f} onClick={()=>setFilter(f)}
                style={{padding:"3px 10px",borderRadius:100,
                  border:`1px solid ${filter===f?C.t1:C.border}`,
                  background:filter===f?C.t1:"transparent",
                  color:filter===f?C.bg:C.t2,fontSize:10,fontWeight:500,transition:"all 0.12s"}}>
                {f==="all"?"All":ICP_LABEL[f]}
              </button>
            ))}
          </div>
          <div style={{padding:"7px 14px 5px",display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:11,color:C.t3}}>{queueLeft} remaining</span>
            <span style={{fontSize:11,color:C.t3}}>{filtered.length} total</span>
          </div>
          <div style={{flex:1,overflowY:"auto"}}>
            {filtered.length === 0 && (
              <div style={{padding:20,textAlign:"center",fontSize:11,color:C.t3}}>
                No leads in sheet yet.<br/>Add rows to the Leads tab.
              </div>
            )}
            {filtered.map(lead=>{
              const isActive=active?.id===lead.id, isDone=lead.status!=="queued";
              return (
                <div key={lead.id} onClick={()=>selectLead(lead)}
                  style={{padding:"9px 14px",cursor:isDone?"default":"pointer",
                    opacity:isDone?0.38:1,borderBottom:`1px solid ${C.border}`,
                    borderLeft:isActive?`2px solid ${C.t1}`:"2px solid transparent",
                    background:isActive?C.surface:"transparent",transition:"background 0.1s",
                    textAlign:"left"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                    <div style={{width:6,height:6,borderRadius:"50%",
                      background:SCORE_DOT[lead.score]||C.t3,flexShrink:0}}/>
                    <span style={{fontSize:11,fontWeight:500,flex:1,lineHeight:1.3}}>{lead.biz}</span>
                    <span style={{fontSize:10,fontFamily:FM,...painStyle(displayPain(lead))}}>{displayPain(lead)}/10</span>
                  </div>
                  <div style={{paddingLeft:12}}>
                    <div style={{fontSize:11,color:C.t2}}>{lead.owner}</div>
                    <div style={{fontSize:10,color:C.t3,marginTop:1}}>
                      {ICP_LABEL[lead.icp]||lead.icp} · {lead.city}
                      {lead.competitor&&<span style={{color:C.t3}}> · vs. {lead.competitor}</span>}
                    </div>
                    {isDone&&(
                      <div style={{marginTop:3,fontSize:10,fontWeight:500,
                        color:lead.status==="demo_booked"?C.green:C.t3}}>
                        {lead.status==="demo_booked"?"✦ Demo booked"
                         :lead.status==="dnc"?"⛔ DNC"
                         :lead.status==="not_qualified"?"— Not qualified"
                         :"Called"}
                        {lead.script_used&&<span style={{color:C.t3,fontWeight:400}}> · Script {lead.script_used.toUpperCase()}</span>}
                      </div>
                    )}
                    {/* Call history indicator from Script_Performance */}
                    {!isDone && (callHistory[lead.id]?.length || 0) > 0 && (()=>{
                      const hist = callHistory[lead.id];
                      const last = hist[0];
                      const lastLabel = OUTCOMES[last.outcome]?.short || last.outcome || "?";
                      return (
                      <div style={{marginTop:3,display:"flex",alignItems:"center",gap:4}}>
                        <span style={{fontSize:9,fontWeight:600,color:OUTCOMES[last.outcome]?.color||C.amber,
                          background:(OUTCOMES[last.outcome]?.color||C.amber)+"15",padding:"1px 5px",borderRadius:4}}>
                          {lastLabel} ×{hist.length}
                        </span>
                        {last.caller && (
                          <span style={{fontSize:9,color:C.t3}}>{last.caller}</span>
                        )}
                        {last.timestamp && (
                          <span style={{fontSize:9,color:C.t3}}>
                            {(() => {
                              try {
                                const d = new Date(last.timestamp);
                                const now = new Date();
                                const diffMs = now - d;
                                const diffH = Math.floor(diffMs / 3600000);
                                const diffD = Math.floor(diffH / 24);
                                if (diffD > 0) return `${diffD}d ago`;
                                if (diffH > 0) return `${diffH}h ago`;
                                return `${Math.floor(diffMs/60000)}m ago`;
                              } catch { return ""; }
                            })()}
                          </span>
                        )}
                      </div>
                      );
                    })()}
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
              <div style={{padding:"13px 20px",borderBottom:`1px solid ${C.border}`,
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
                  {callRun&&(
                    <>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:22,fontWeight:300,fontFamily:FM,color:C.green}}>
                          {fmt(callSecs)}
                        </div>
                        <div style={{fontSize:10,color:C.green,marginTop:1}}>live call</div>
                      </div>
                      <button onClick={()=>{setCallRun(false);setCallSecs(0);setDispoBarOpen(true);}}
                        style={{padding:"6px 14px",borderRadius:6,
                          border:`1px solid ${C.red}`,background:"transparent",
                          color:C.red,fontSize:11,fontWeight:500,cursor:"pointer"}}>
                        End Call
                      </button>
                    </>
                  )}
                  {(()=>{
                    const canDial=sessRun&&active.status==="queued"&&!!callerName;
                    const phones=getLeadPhones(active);
                    if(!callRun&&!pendingOutcome) {
                      const btnLabel=active.status!=="queued"?"Called":!callerName?"Select caller":sessRun?"Dial":"Start session";
                      if(phones.length<=1) return (
                        <button onClick={()=>dial(active)}
                          disabled={!canDial}
                          style={{padding:"7px 22px",borderRadius:8,
                            border:`1px solid ${canDial?C.t1:C.border}`,
                            background:canDial?C.t1:"transparent",
                            color:canDial?C.bg:C.t3,
                            fontSize:12,fontWeight:500,
                            cursor:canDial?"pointer":"not-allowed",
                            transition:"all 0.15s"}}>
                          {btnLabel}
                        </button>
                      );
                      // Multiple phones — dial button + dropdown
                      return (
                        <div style={{position:"relative",display:"inline-block"}}>
                          <div style={{display:"flex",alignItems:"stretch"}}>
                            <button onClick={()=>dial(active,phones[0].number)}
                              disabled={!canDial}
                              style={{padding:"7px 16px",borderRadius:"8px 0 0 8px",
                                border:`1px solid ${canDial?C.t1:C.border}`,borderRight:"none",
                                background:canDial?C.t1:"transparent",
                                color:canDial?C.bg:C.t3,
                                fontSize:12,fontWeight:500,
                                cursor:canDial?"pointer":"not-allowed",
                                transition:"all 0.15s"}}>
                              {btnLabel}
                            </button>
                            <button onClick={()=>{ if(canDial) setPhoneMenuOpen(v=>!v); }}
                              disabled={!canDial}
                              style={{padding:"7px 8px",borderRadius:"0 8px 8px 0",
                                border:`1px solid ${canDial?C.t1:C.border}`,
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
                              background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,
                              boxShadow:"0 4px 12px rgba(0,0,0,0.12)",zIndex:50,minWidth:200,
                              overflow:"hidden"}}>
                              {phones.map((p,i)=>(
                                <button key={i} onClick={()=>dial(active,p.number)}
                                  style={{display:"block",width:"100%",textAlign:"left",
                                    padding:"9px 14px",border:"none",background:"transparent",
                                    cursor:"pointer",fontSize:12,color:C.t1,
                                    borderBottom:i<phones.length-1?`1px solid ${C.border}`:"none"}}
                                  onMouseEnter={e=>e.currentTarget.style.background=C.surface}
                                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                  <span style={{fontWeight:500}}>{p.label}</span>
                                  <span style={{color:C.t2,marginLeft:8}}>{p.number}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }
                    // During call — show "Try another" dropdown if multiple phones
                    if(callRun&&phones.length>1) return (
                      <div style={{position:"relative",display:"inline-block"}}>
                        <button onClick={()=>setPhoneMenuOpen(v=>!v)}
                          style={{padding:"5px 12px",borderRadius:6,
                            border:`1px solid ${C.border}`,background:"transparent",
                            color:C.t2,fontSize:11,cursor:"pointer"}}>
                          Try another #
                        </button>
                        {phoneMenuOpen&&(
                          <div style={{position:"absolute",top:"100%",right:0,marginTop:4,
                            background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,
                            boxShadow:"0 4px 12px rgba(0,0,0,0.12)",zIndex:50,minWidth:200,
                            overflow:"hidden"}}>
                            {phones.filter(p=>p.number!==lastDialedPhone).map((p,i,arr)=>(
                              <button key={i} onClick={()=>{
                                  setLastDialedPhone(p.number);setPhoneMenuOpen(false);
                                  const url=`https://infoharmonia.app.n8n.cloud/webhook/click_to_call?from=${encodeURIComponent(caller)}&to=${encodeURIComponent(p.number)}`;
                                  fetch(url,{method:"GET",mode:"no-cors"}).catch(()=>{});
                                }}
                                style={{display:"block",width:"100%",textAlign:"left",
                                  padding:"9px 14px",border:"none",background:"transparent",
                                  cursor:"pointer",fontSize:12,color:C.t1,
                                  borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none"}}
                                onMouseEnter={e=>e.currentTarget.style.background=C.surface}
                                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                <span style={{fontWeight:500}}>{p.label}</span>
                                <span style={{color:C.t2,marginLeft:8}}>{p.number}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                    return null;
                  })()}
                </div>
              </div>

              {/* Script selector — visible during call */}
              {(callRun||pendingOutcome)&&(
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 20px",flexShrink:0,
                  borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:11,color:C.t3}}>Script</span>
                  <select value={selectedScript} onChange={e=>{setSelectedScript(e.target.value);if(e.target.value!=="custom")setCustomScript("");}}
                    style={{border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 8px",
                      fontSize:12,background:C.bg,color:C.t1,outline:"none",flex:1,maxWidth:280}}>
                    <option value="">Select script...</option>
                    {(SCRIPT_OPTIONS[active.icp]||[]).filter(s=>!disabledScripts.has(s.variant)).map(s=>(
                      <option key={s.variant} value={s.variant}>{s.label}</option>
                    ))}
                    <option value="custom">Custom...</option>
                  </select>
                  {selectedScript==="custom"&&(
                    <input value={customScript} onChange={e=>setCustomScript(e.target.value)}
                      placeholder="Script name..."
                      style={{border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 8px",
                        fontSize:12,background:C.bg,color:C.t1,outline:"none",width:140}}/>
                  )}
                </div>
              )}

              {/* Outcome buttons — during live call, before confirming */}
              {callRun&&!pendingOutcome&&(
                <div style={{padding:"10px 20px",flexShrink:0,borderBottom:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {OUTCOME_ROWS.map((row,ri)=>(
                      <div key={ri} style={{display:"grid",
                        gridTemplateColumns:`repeat(${row.length},1fr)`,gap:4}}>
                        {row.map(key=>{
                          const o=OUTCOMES[key];
                          return (
                            <button key={key} onClick={()=>selectOutcome(key)}
                              style={{padding:"5px 6px",borderRadius:7,
                                border:`1px solid ${o.color}35`,background:`${o.color}08`,
                                color:o.color,fontSize:10,fontWeight:500,whiteSpace:"nowrap",
                                transition:"all 0.1s"}}>
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                )}

              {pendingOutcome&&(
                <div style={{padding:"12px 20px 14px",flexShrink:0,
                  borderBottom:`1px solid ${C.border}`,background:C.surface,
                  animation:"slideDown 0.2s ease",overflowY:"auto",maxHeight:"50vh"}}>

                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:pendingMeta?.color}}/>
                    <span style={{fontSize:13,fontWeight:500,color:pendingMeta?.color}}>{pendingMeta?.label}</span>
                    {pendingMeta?.ghl&&(
                      <span style={{fontSize:9,padding:"2px 8px",borderRadius:100,
                        background:`${pendingMeta.color}12`,border:`1px solid ${pendingMeta.color}25`,
                        color:pendingMeta.color}}>→ GHL: {pendingMeta.ghl}</span>
                    )}
                    {pendingMeta?.discord&&(
                      <span style={{fontSize:9,padding:"2px 8px",borderRadius:100,
                        background:`${C.purple}12`,border:`1px solid ${C.purple}25`,
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
                          style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none"}}/>
                      </div>
                    )}

                    {(pendingOutcome==="demo_booked"||pendingOutcome==="callback"||pendingOutcome==="followup_sent")&&(
                      <div>
                        <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Prospect mobile (if different from business line)</div>
                        <input type="tel" value={capturePhone} onChange={e=>setCapturePhone(e.target.value)}
                          placeholder="(610) 555-1234"
                          style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none"}}/>
                      </div>
                    )}

                    {pendingMeta?.needsBooking&&captureEmail.trim()&&(
                      <div style={{background:C.bg,borderRadius:8,border:`1px solid ${C.green}30`,padding:"10px 14px"}}>
                        <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Book the demo now</div>
                        <button onClick={openCalendly}
                          style={{width:"100%",padding:"8px 0",borderRadius:6,
                            border:`1px solid ${calendlyOpened?C.green:C.accent}`,
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
                          rows={2} style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none",resize:"vertical"}}/>
                        <div style={{fontSize:10,color:C.teal,marginTop:4}}>Pings Discord #loom-queue → Javi/Julian record → n8n auto-emails to prospect</div>
                      </div>
                    )}

                    {pendingMeta?.needsDateTime&&(
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        <div>
                          <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Callback date <span style={{color:C.red,fontSize:9}}>required</span></div>
                          <input type="date" value={callbackDate} onChange={e=>setCallbackDate(e.target.value)}
                            min={new Date().toISOString().split("T")[0]}
                            style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none"}}/>
                        </div>
                        <div>
                          <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Callback time <span style={{color:C.red,fontSize:9}}>required</span></div>
                          <input type="time" value={callbackTime} onChange={e=>setCallbackTime(e.target.value)}
                            style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none"}}/>
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
                                border:`1px solid ${sendType===opt.v?C.accent:C.border}`,
                                background:sendType===opt.v?`${C.accent}10`:"transparent",
                                color:sendType===opt.v?C.accent:C.t2,fontSize:11,fontWeight:500}}>
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
                          style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none"}}/>
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
                                border:`1px solid ${spokeWith===opt?C.accent:C.border}`,
                                background:spokeWith===opt?`${C.accent}10`:"transparent",
                                color:spokeWith===opt?C.accent:C.t2,fontSize:11,fontWeight:500,cursor:"pointer"}}>
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
                          style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px",fontSize:11,background:C.bg,color:C.t1,outline:"none"}}>
                          <option value="">Select objection...</option>
                          {[...(OBJECTION_PRESETS[active.icp]||[]),...(OBJECTION_PRESETS._global||[])].map(o=>(
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                        <input value={customObjection} onChange={e=>setCustomObjection(e.target.value)}
                          placeholder="Or type a custom objection..."
                          style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px",fontSize:11,background:C.bg,color:C.t1,outline:"none",marginTop:4}}/>
                      </div>
                    )}

                    <div>
                      <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Notes</div>
                      <textarea value={captureNotes} onChange={e=>setCaptureNotes(e.target.value)}
                        placeholder="Anything relevant — context for next call, owner personality, timing..."
                        rows={2} style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none",resize:"vertical"}}/>
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
              <div style={{display:"flex",padding:"0 20px",borderBottom:`1px solid ${C.border}`,
                gap:0,flexShrink:0,background:C.bg}}>
                {[
                  {id:"intel",      label:"Intel"},
                  {id:"reviews",    label:`Reviews (${active.google_reviews?.length||0})`},
                  {id:"script",     label:"Script"},
                  {id:"objections", label:`Objections (${curObjs.length})`},
                  {id:"voicemail",  label:"Voicemail"},
                  {id:"roi",        label:"ROI Calc"},
                  {id:"booking",    label:"Booking"},
                ].map(t=>(
                  <button key={t.id} onClick={()=>setTab(t.id)}
                    style={{padding:"10px 15px",border:"none",background:"transparent",
                      borderBottom:tab===t.id?`1.5px solid ${C.t1}`:"1.5px solid transparent",
                      color:tab===t.id?C.t1:C.t3,fontSize:12,
                      fontWeight:tab===t.id?500:400,marginBottom:"-1px",
                      transition:"color 0.15s"}}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{flex:1,overflowY:"auto",padding:20}}>

                {/* ── INTEL (two-column: dossier left, notes right) ── */}
                {tab==="intel"&&(
                  <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
                    {/* Left column — Pre-call dossier */}
                    <div style={{display:"flex",flexDirection:"column",gap:12,flex:"1 1 320px",minWidth:280}}>
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
                        <div style={{borderRadius:12,border:`1px solid ${C.amber}30`,
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
                          <button onClick={()=>setTab("reviews")}
                            style={{marginTop:8,fontSize:11,color:C.accent,border:"none",
                              background:"transparent",padding:0,cursor:"pointer"}}>
                            View all {active.google_reviews?.length} reviews →
                          </button>
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
                      {/* Call History from Script_Performance — shared across all callers */}
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
                                border:`1px solid ${C.border}`}}>
                                <div style={{fontSize:18,fontWeight:500,color:C.t1,fontFamily:FM}}>{totalCalls}</div>
                                <div style={{fontSize:9,color:C.t3,marginTop:2}}>Total Calls</div>
                              </div>
                              <div style={{background:C.bg,borderRadius:8,padding:"8px 10px",textAlign:"center",
                                border:`1px solid ${OUTCOMES[lastCall.outcome]?.color||C.border}`}}>
                                <div style={{fontSize:12,fontWeight:600,color:OUTCOMES[lastCall.outcome]?.color||C.t1,lineHeight:1.3}}>
                                  {OUTCOMES[lastCall.outcome]?.label || lastCall.outcome || "—"}
                                </div>
                                <div style={{fontSize:9,color:C.t3,marginTop:2}}>Last Result</div>
                              </div>
                              <div style={{background:C.bg,borderRadius:8,padding:"8px 10px",textAlign:"center",
                                border:`1px solid ${C.border}`}}>
                                <div style={{fontSize:12,fontWeight:500,color:C.accent,lineHeight:1.3}}>
                                  {lastCall.caller || "—"}
                                </div>
                                <div style={{fontSize:9,color:C.t3,marginTop:2}}>Last Caller</div>
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
                                        background:C.accent+"15",color:C.accent,fontWeight:500}}>{c}</span>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Full call log — every call, every caller */}
                            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10}}>
                              <div style={{fontSize:10,color:C.t3,marginBottom:8,fontWeight:500}}>
                                Every call (newest first)
                              </div>
                              <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:260,overflowY:"auto"}}>
                                {hist.map((h,i) => (
                                  <div key={i} style={{background:C.bg,borderRadius:8,padding:"8px 10px",
                                    border:`1px solid ${OUTCOMES[h.outcome]?.color||C.border}40`}}>
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
                                    {/* Row 2: caller, date, script */}
                                    <div style={{display:"flex",justifyContent:"space-between",marginTop:4,
                                      alignItems:"center",flexWrap:"wrap",gap:4}}>
                                      <span style={{fontSize:11,color:C.accent,fontWeight:500}}>
                                        {h.caller || "Unknown caller"}
                                      </span>
                                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                                        {h.variant && (
                                          <span style={{fontSize:9,color:C.t3,background:C.surface,borderRadius:4,
                                            padding:"1px 5px",border:`1px solid ${C.border}`}}>Script {h.variant}</span>
                                        )}
                                        <span style={{fontSize:10,color:C.t3}}>
                                          {h.timestamp ? new Date(h.timestamp).toLocaleDateString("en-US",
                                            {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}) : ""}
                                        </span>
                                      </div>
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
                              fetch(WEBHOOK_URL, {method:'POST',headers:{'Content-Type':'application/json'},
                                body:JSON.stringify({type:'lead_notes_update',lead_id:active.id,biz:active.biz,
                                  lead_notes:val,notes_edited_by:callerName||"Unknown",
                                  notes_edited_at:new Date().toISOString()})
                              }).catch(()=>{});
                              setNotesSaveStatus("saved");
                              setTimeout(() => setNotesSaveStatus(null), 2000);
                            }, 2000);
                          }}
                          placeholder={'e.g. "Owner Jose said call back after 2pm," "Gatekeeper very protective — try different angle"'}
                          rows={5}
                          style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",
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
                {tab==="reviews"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:660}}>
                    {active.google_reviews?.length === 0 ? (
                      <div style={{fontSize:12,color:C.t3,padding:"20px 0"}}>
                        No reviews scraped yet — n8n will populate this column.
                      </div>
                    ):(
                      <>
                        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:2}}>
                          <span style={{fontSize:11,color:C.t3}}>
                            {active.google_reviews?.length||0} reviews
                          </span>
                          {flaggedReviews.length>0&&(
                            <span style={{fontSize:11,padding:"2px 9px",borderRadius:100,
                              background:"#FFFBF0",border:`1px solid ${C.amber}30`,color:C.amber,fontWeight:500}}>
                              {flaggedReviews.length} pain signal{flaggedReviews.length!==1?"s":""}
                            </span>
                          )}
                        </div>
                        {(active.google_reviews||[]).map((r,i)=>(
                          <div key={i} style={{borderRadius:12,
                            border:`1px solid ${(r.flagged||r.flagged==="TRUE")?"#FF950040":C.border}`,
                            padding:"13px 16px",
                            background:(r.flagged||r.flagged==="TRUE")?"#FFFBF0":C.bg}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                              <StarRow stars={r.stars}/>
                              <span style={{fontSize:12,fontWeight:500}}>{r.author}</span>
                              <span style={{fontSize:11,color:C.t3,marginLeft:"auto"}}>{r.date}</span>
                              {(r.flagged||r.flagged==="TRUE")&&(
                                <span style={{fontSize:10,padding:"2px 8px",borderRadius:100,
                                  background:`${C.amber}15`,color:C.amber,fontWeight:500,
                                  border:`1px solid ${C.amber}30`}}>pain signal</span>
                              )}
                            </div>
                            <div style={{fontSize:13,color:C.t1,lineHeight:1.65}}>"{r.text}"</div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* ── SCRIPT MIXER ── */}
                {tab==="script"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:0}}>
                    {/* Toggle buttons for Call History & Notes */}
                    <div style={{display:"flex",gap:6,marginBottom:12}}>
                      <button onClick={()=>setScriptShowHistory(v=>!v)}
                        style={{padding:"4px 12px",borderRadius:100,fontSize:10,fontWeight:500,
                          border:`1px solid ${scriptShowHistory?C.t1:C.border}`,
                          background:scriptShowHistory?C.t1:"transparent",
                          color:scriptShowHistory?C.bg:C.t2,cursor:"pointer",transition:"all 0.15s"}}>
                        {scriptShowHistory?"Hide":"Show"} Call History
                      </button>
                      <button onClick={()=>setScriptShowNotes(v=>!v)}
                        style={{padding:"4px 12px",borderRadius:100,fontSize:10,fontWeight:500,
                          border:`1px solid ${scriptShowNotes?C.t1:C.border}`,
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
                                    <div style={{fontSize:9,color:C.t3}}>Last Caller</div>
                                    <div style={{fontSize:11,color:C.accent,fontWeight:500}}>{lastCall.caller||"—"}</div>
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
                                  <div style={{borderTop:`1px solid ${C.border}`,paddingTop:6}}>
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
                              style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",
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

                    {variants.length === 0 ? (
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
                          const icpScripts = scripts[active?.icp] || {};
                          const REMOVED_VARIANTS = new Set(["7","8"]);
                          const options = [];
                          if (!isCustomPhase) {
                            Object.entries(icpScripts).forEach(([varId, script]) => {
                              if (REMOVED_VARIANTS.has(varId)) return;
                              if (disabledScripts.has(varId)) return;
                              const line = script.lines.find(l => l.type === phase);
                              // Show all variants in every dropdown — text may be empty if no row for this phase
                              options.push({ id: varId, name: script.name, tag: script.tag, text: line?.text || "" });
                            });
                          }

                          const isDiscoveryPhase = phase === "discovery";
                          const icpBranches = branchData[active?.icp] || {};
                          // Default phases with no scripts in sheet: skip. Custom phases always render.
                          if (!isCustomPhase && options.length === 0) return null;

                          const selectedVar = isCustomPhase ? "custom" : (phaseSelections[phase] || options[0]?.id || "1");
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
                                borderBottom:`1px solid ${phaseColor}15`}}>
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
                                    boxShadow:"0 1px 2px rgba(0,0,0,.2)"}} />
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
                                {(!isCustomPhase || isBridge) && options.length > 0 && (
                                  <select value={selectedVar}
                                    onChange={e => setPhaseSelections(prev => ({...prev, [phase]: e.target.value}))}
                                    style={{flex:1,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px",
                                      fontSize:11,background:C.bg,color:C.t1,outline:"none",maxWidth:320}}>
                                    {options.map(o => (
                                      <option key={o.id} value={o.id}>
                                        {isBridge ? `${o.id} — ${o.name}${o.id==="1"?" \u2605":""}` :
                                          `${o.id} — ${o.name}${isOpener && recMap[o.id] ? " \u2605" : ""}`}
                                      </option>
                                    ))}
                                  </select>
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
                                    style={{padding:"3px 10px",borderRadius:6,border:`1px solid ${C.border}`,
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

                                /* ── BRIDGE: bubbles gate the script ── */
                                if (isBridge) {
                                  const icpBubbles = bubbleData[active?.icp] || { bridge: [], close: [] };
                                  const activeBubbles = icpBubbles.bridge.length > 0 ? icpBubbles.bridge : bridgeBubbles;
                                  if (activeBubbles.length === 0) {
                                    // No bubble data in sheet — render plain textarea
                                    return (<>{scriptTextarea}{resizeHandles}</>);
                                  }
                                  return (<>
                                    <div style={{padding:"8px 16px 12px"}}>
                                      <div style={{fontSize:9,fontWeight:600,color:C.t3,textTransform:"uppercase",
                                        letterSpacing:".06em",marginBottom:8}}>After opener, they say...</div>
                                      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:activeBridgeBubble!==null?10:0}}>
                                        {activeBubbles.map((obj,oi) => {
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
                                      {activeBridgeBubble !== null && activeBubbles[activeBridgeBubble] && (() => {
                                        const obj = activeBubbles[activeBridgeBubble];
                                        const s = BUBBLE_STYLES[obj.type] || BUBBLE_STYLES.yellow;
                                        const isGreen = obj.type === "green";
                                        return (
                                          <div style={{background:s.bg,border:`1px solid ${s.border}`,borderRadius:10,
                                            padding:"12px 14px",transition:"all 0.2s ease"}}>
                                            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                                              <div style={{width:7,height:7,borderRadius:"50%",background:s.dot}} />
                                              <span style={{fontSize:10,fontWeight:600,color:s.text,textTransform:"uppercase",
                                                letterSpacing:".04em"}}>{s.label}</span>
                                            </div>
                                            {isGreen ? (
                                              <>
                                                <textarea
                                                  value={displayText}
                                                  onChange={scriptOnChange}
                                                  style={{width:"100%",border:"none",padding:"4px 0",fontSize:13,
                                                    color:s.text,lineHeight:1.75,background:"transparent",outline:"none",
                                                    resize:"none",fontFamily:F}}
                                                  placeholder="Bridge script..."
                                                  data-phase-textarea={phase}
                                                />
                                                <div style={{fontSize:10,fontWeight:600,color:"#16a34a",marginTop:6,
                                                  textTransform:"uppercase",letterSpacing:".04em"}}>
                                                  Move to DISCOVERY
                                                </div>
                                              </>
                                            ) : (
                                              <div style={{fontSize:12,color:s.text,lineHeight:1.7,whiteSpace:"pre-line"}}>
                                                {fillPlaceholdersPlain(obj.response, placeholderCtx)}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                    {resizeHandles}
                                  </>);
                                }

                                /* ── DISCOVERY: branching tree ── */
                                if (isDiscovery) {
                                  const variantBranches = (branchData[active?.icp] || {})[selectedVar] || [];
                                  if (variantBranches.length > 0) {
                                    const tree = buildBranchTree(variantBranches);
                                    const rootNode = tree.find(n => n.depth === 0);
                                    const rootQuestion = rootNode?.rootQuestion || "";
                                    const depth1 = rootNode ? rootNode.children : tree.filter(n => n.depth === 1);

                                    const renderBranchLevel = (nodes, depth) => {
                                      if (!nodes || nodes.length === 0) return null;
                                      const activeId = activeBranches[depth];
                                      const activeNode = nodes.find(n => n.branchId === activeId);
                                      return (
                                        <div>
                                          {/* Connector line */}
                                          <div style={{display:"flex",justifyContent:"center",padding:"4px 0"}}>
                                            <div style={{width:2,height:20,background:activeNode?
                                              (BUBBLE_STYLES[activeNode.type]||BUBBLE_STYLES.yellow).border:C.border}} />
                                          </div>
                                          {/* Label */}
                                          <div style={{fontSize:9,fontWeight:600,color:C.t3,textTransform:"uppercase",
                                            letterSpacing:".06em",textAlign:"center",marginBottom:8}}>
                                            What do they say?
                                          </div>
                                          {/* Branch cards */}
                                          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:8}}>
                                            {nodes.map(node => {
                                              const isActive = activeId === node.branchId;
                                              const s = BUBBLE_STYLES[node.type] || BUBBLE_STYLES.yellow;
                                              return (
                                                <button key={node.branchId} onClick={() => {
                                                  setActiveBranches(prev => {
                                                    const next = {};
                                                    Object.keys(prev).forEach(d => { if (parseInt(d) < depth) next[d] = prev[d]; });
                                                    if (!isActive) next[depth] = node.branchId;
                                                    return next;
                                                  });
                                                }}
                                                  style={{padding:"10px 16px",borderRadius:10,fontSize:12,fontWeight:500,
                                                    cursor:"pointer",transition:"all 0.15s",fontFamily:F,
                                                    border:`1.5px solid ${isActive?s.border:"#e5e5e5"}`,
                                                    background:isActive?s.bg:"#fff",color:isActive?s.text:"#555",
                                                    minWidth:100,textAlign:"left",minHeight:44}}>
                                                  {node.label}
                                                </button>
                                              );
                                            })}
                                          </div>
                                          {/* Active branch response */}
                                          {activeNode && (
                                            <div>
                                              {/* Colored connector */}
                                              <div style={{display:"flex",justifyContent:"center",padding:"0 0 4px"}}>
                                                <div style={{width:2,height:16,
                                                  background:(BUBBLE_STYLES[activeNode.type]||BUBBLE_STYLES.yellow).border}} />
                                              </div>
                                              {(() => {
                                                const s = BUBBLE_STYLES[activeNode.type] || BUBBLE_STYLES.yellow;
                                                return (
                                                  <div style={{background:s.bg,border:`1px solid ${s.border}`,borderRadius:10,
                                                    padding:"12px 14px"}}>
                                                    <div style={{fontSize:9,fontWeight:600,color:s.text,textTransform:"uppercase",
                                                      letterSpacing:".06em",marginBottom:6}}>You say</div>
                                                    <div style={{fontSize:12,color:s.text,lineHeight:1.7,whiteSpace:"pre-line",
                                                      fontStyle:"italic"}}>
                                                      {fillPlaceholdersPlain(activeNode.response, placeholderCtx)}
                                                    </div>
                                                    {/* Terminal: show next phase */}
                                                    {activeNode.children.length === 0 && activeNode.nextPhase && (
                                                      <div style={{fontSize:10,fontWeight:600,color:"#16a34a",marginTop:8,
                                                        textTransform:"uppercase",letterSpacing:".04em"}}>
                                                        Move to {activeNode.nextPhase.toUpperCase()}
                                                      </div>
                                                    )}
                                                    {/* Admin: add branch on terminal nodes */}
                                                    {activeNode.children.length === 0 && callerName === "Javi" && (
                                                      <div style={{marginTop:10}}>
                                                        {addBranchForm && addBranchForm.parentId === activeNode.branchId ? (
                                                          <div style={{border:`1px dashed ${C.border}`,borderRadius:8,padding:10,
                                                            background:"#fff"}}>
                                                            <div style={{fontSize:10,fontWeight:600,color:C.t2,marginBottom:8}}>
                                                              After you say this, they might say...
                                                            </div>
                                                            <input value={newBranchLabel} onChange={e=>setNewBranchLabel(e.target.value)}
                                                              placeholder="Branch label (what they say)"
                                                              style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,
                                                                padding:"6px 10px",fontSize:12,marginBottom:6,fontFamily:F,
                                                                background:"#fff",color:C.t1,outline:"none"}} />
                                                            <select value={newBranchType} onChange={e=>setNewBranchType(e.target.value)}
                                                              style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,
                                                                padding:"6px 10px",fontSize:12,marginBottom:6,fontFamily:F,
                                                                background:"#fff",color:C.t1,outline:"none"}}>
                                                              <option value="green">Green (positive)</option>
                                                              <option value="yellow">Yellow (neutral)</option>
                                                              <option value="red">Red (negative)</option>
                                                            </select>
                                                            <textarea value={newBranchResponse} onChange={e=>setNewBranchResponse(e.target.value)}
                                                              placeholder="Response script (what you say back)"
                                                              rows={3}
                                                              style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,
                                                                padding:"6px 10px",fontSize:12,marginBottom:8,fontFamily:F,
                                                                background:"#fff",color:C.t1,outline:"none",resize:"vertical"}} />
                                                            <div style={{display:"flex",gap:8}}>
                                                              <button onClick={async () => {
                                                                if (!newBranchLabel.trim() || !newBranchResponse.trim()) return;
                                                                const newId = `${addBranchForm.parentId}-${Date.now()}`;
                                                                try {
                                                                  await fetch(WEBHOOK_URL, {
                                                                    method:'POST',headers:{'Content-Type':'application/json'},
                                                                    body:JSON.stringify({
                                                                      type:'add_branch', phase:'discovery',
                                                                      variant_id: selectedVar,
                                                                      branch_id: newId, parent_branch_id: addBranchForm.parentId,
                                                                      depth: addBranchForm.depth, branch_label: newBranchLabel.trim(),
                                                                      branch_type: newBranchType, branch_response: newBranchResponse.trim(),
                                                                      next_phase: 'PITCH',
                                                                    })
                                                                  });
                                                                  const fresh = await fetchSheet("Scripts").catch(()=>[]);
                                                                  const reParsed = parseBubblesAndBranches(fresh);
                                                                  if (Object.keys(reParsed.branches).length > 0) setBranchData(reParsed.branches);
                                                                } catch(err) { console.error("Failed to add branch:", err); }
                                                                setAddBranchForm(null); setNewBranchLabel(""); setNewBranchType("green"); setNewBranchResponse("");
                                                              }}
                                                                style={{padding:"5px 14px",borderRadius:6,border:"none",
                                                                  background:C.accent,color:"#fff",fontSize:11,fontWeight:600,
                                                                  cursor:"pointer"}}>Save</button>
                                                              <button onClick={()=>{setAddBranchForm(null);setNewBranchLabel("");setNewBranchType("green");setNewBranchResponse("");}}
                                                                style={{padding:"5px 14px",borderRadius:6,border:`1px solid ${C.border}`,
                                                                  background:"#fff",color:C.t2,fontSize:11,cursor:"pointer"}}>Cancel</button>
                                                            </div>
                                                          </div>
                                                        ) : (
                                                          <button onClick={()=>setAddBranchForm({parentId:activeNode.branchId,depth:depth+1})}
                                                            style={{padding:"5px 12px",borderRadius:6,border:`1px dashed ${C.border}`,
                                                              background:"transparent",color:C.t3,fontSize:10,cursor:"pointer",
                                                              fontFamily:F}}>
                                                            + Add branch below
                                                          </button>
                                                        )}
                                                      </div>
                                                    )}
                                                    {/* Recursive children */}
                                                    {activeNode.children.length > 0 && renderBranchLevel(activeNode.children, depth + 1)}
                                                  </div>
                                                );
                                              })()}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    };

                                    return (<>
                                      <div style={{padding:"8px 16px 12px"}}>
                                        {/* Root question box */}
                                        {rootQuestion && (
                                          <div style={{background:"#FEF3C7",border:"1px solid rgba(245,158,11,0.3)",
                                            borderRadius:10,padding:"10px 14px",marginBottom:4}}>
                                            <div style={{fontSize:9,fontWeight:600,color:"#B45309",textTransform:"uppercase",
                                              letterSpacing:".06em",marginBottom:4}}>You just asked</div>
                                            <div style={{fontSize:13,color:"#92400E",lineHeight:1.6}}>
                                              {fillPlaceholdersPlain(rootQuestion, placeholderCtx)}
                                            </div>
                                          </div>
                                        )}
                                        {renderBranchLevel(depth1, 1)}
                                      </div>
                                      {resizeHandles}
                                    </>);
                                  }
                                  // Fallback: no branch data, show plain textarea
                                  return (<>
                                    {scriptTextarea}
                                    {resizeHandles}
                                  </>);
                                }

                                /* ── CLOSE: textarea + bubbles ── */
                                if (isClose) {
                                  const closeBubbles = (bubbleData[active?.icp] || { close: [] }).close;
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
                                          <div style={{background:s.bg,border:`1px solid ${s.border}`,borderRadius:10,
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
                        {/* ── OFFERS — single phase block with dropdown selector ── */}
                        {offers.length > 0 && (()=>{
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
                                borderBottom:`1px solid ${offerColor}15`}}>
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
                                    boxShadow:"0 1px 2px rgba(0,0,0,.2)"}} />
                                </div>
                                {/* Variant dropdown */}
                                <select value={curOfferId}
                                  onChange={e=>setSelectedOfferId(e.target.value)}
                                  style={{flex:1,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px",
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
                                    style={{padding:"3px 10px",borderRadius:6,border:`1px solid ${C.border}`,
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

                        {/* Add Phase button + inline form */}
                        {showAddPhase ? (
                          <div style={{border:`1px dashed ${C.border}`,borderRadius:10,padding:12,marginTop:4}}>
                            <div style={{fontSize:11,fontWeight:600,color:C.t2,marginBottom:8}}>Add New Phase</div>
                            <input value={newPhaseName} onChange={e=>setNewPhaseName(e.target.value)}
                              placeholder="Phase name (e.g. Rebuttal, Follow Up)"
                              onKeyDown={e=>{if(e.key==="Enter")addPhase();if(e.key==="Escape"){setShowAddPhase(false);setNewPhaseName("");}}}
                              style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",
                                fontSize:12,background:C.bg,color:C.t1,outline:"none",marginBottom:8,fontFamily:F}}
                              autoFocus />
                            <div style={{display:"flex",gap:8}}>
                              <button onClick={addPhase}
                                style={{padding:"4px 14px",borderRadius:6,border:"none",
                                  background:C.accent,color:"#fff",fontSize:11,cursor:"pointer",fontWeight:600}}>
                                Add
                              </button>
                              <button onClick={()=>{setShowAddPhase(false);setNewPhaseName("");}}
                                style={{padding:"4px 14px",borderRadius:6,border:`1px solid ${C.border}`,
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
                            onMouseEnter={e=>{e.target.style.borderColor=C.accent;e.target.style.color=C.accent}}
                            onMouseLeave={e=>{e.target.style.borderColor=C.border;e.target.style.color=C.t3}}>
                            + Add Phase
                          </button>
                        )}
                      </>
                    )}

                    {/* ── Book a Demo (bottom of script tab) ── */}
                    <div style={{marginTop:32,borderTop:`1px solid ${C.border}`,paddingTop:20}}>
                      <div style={{fontSize:13,fontWeight:600,color:C.t1,marginBottom:8}}>Book a Demo</div>
                      <div style={{fontSize:11,color:C.t3,marginBottom:12}}>Schedule a call with the Harmonia team</div>
                      <iframe
                        src="https://cal.com/team/harmonia-solutions/cc-demo-booked?embed=true&theme=light"
                        style={{width:"100%",height:500,border:"none",borderRadius:12}}
                        title="Book a Demo"
                      />
                    </div>
                  </div>
                )}

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
                          const sheetCount = (objections[active?.icp] || []).length;
                          const isCustom = i >= sheetCount;
                          const customIdx = i - sheetCount;
                          return (
                          <div key={i} style={{borderRadius:12,overflow:"hidden",
                            border:`1px solid ${openObj===i?C.borderMd:isCustom?C.accent+"30":C.border}`,
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
                                borderTop:`1px solid ${C.border}`}}>
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
                        style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,padding:"8px 10px",
                          fontSize:12,background:C.bg,color:C.t1,outline:"none",marginBottom:8}}/>
                      <textarea value={newObjA} onChange={e=>setNewObjA(e.target.value)}
                        placeholder="How to respond to this objection..."
                        rows={3}
                        style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,padding:"8px 10px",
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
                        border:`1px solid ${C.border}`}}>
                        <div style={{padding:"10px 16px",background:C.surface,
                          borderBottom:`1px solid ${C.border}`,
                          display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                          <span style={{fontSize:12,fontWeight:500,color:C.t1}}>{vm.title}</span>
                          <button onClick={()=>{navigator.clipboard.writeText(vm.body);setFlash("VM script copied");setTimeout(()=>setFlash(null),2000);}}
                            style={{padding:"3px 10px",borderRadius:6,border:`1px solid ${C.border}`,
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

                {tab==="roi"&&(
                  <MissedCallCalculator embedded />
                )}

                {/* ── BOOKING ── */}
                {tab==="booking"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    <div style={{fontSize:14,fontWeight:600,color:C.t1}}>Book a Demo</div>
                    <div style={{fontSize:12,color:C.t2}}>Schedule a call with the Harmonia Solutions team</div>
                    <iframe
                      src="https://cal.com/team/harmonia-solutions/cc-demo-booked?embed=true&theme=light"
                      style={{width:"100%",height:600,border:"none",borderRadius:12}}
                      title="Book a Demo"
                    />
                  </div>
                )}

              </div>
            </>
          ):(
            <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",
              color:C.t3,fontSize:13}}>
              {leads.length===0?"Add leads to your Google Sheet to get started":"Select a lead"}
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL (toggleable) ── */}
        {showStatsPanel && (
          <div style={{width:210,borderLeft:`1px solid ${C.border}`,
            display:"flex",flexDirection:"column",flexShrink:0}}>
            <div style={{padding:"8px 10px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:10,color:C.t3,fontWeight:500}}>Session Stats</span>
              <button onClick={()=>setShowStatsPanel(false)}
                style={{border:"none",background:"transparent",color:C.t3,fontSize:14,
                  cursor:"pointer",padding:"0 2px",lineHeight:1}}>×</button>
            </div>
            <div style={{padding:"8px 10px 0",display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              {[
                {l:"Dials",v:stats.dials,c:C.t1},
                {l:"Answered",v:totalAns,c:C.accent},
                {l:"Demos",v:stats.demos,c:C.green},
                {l:"Looms",v:stats.looms,c:C.teal},
                {l:"Voicemail",v:stats.vm,c:C.amber},
                {l:"Connect%",v:stats.dials>0?connectRate+"%":"—",c:C.accent},
                {l:"Demo rate",v:totalAns>0?demoRate+"%":"—",c:C.green},
              ].map(({l,v,c})=>(
                <div key={l} style={{background:C.surface,borderRadius:8,
                  padding:"9px 10px",textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:400,color:c,lineHeight:1,fontFamily:FM}}>{v}</div>
                  <div style={{fontSize:9,color:C.t3,marginTop:3}}>{l}</div>
                </div>
              ))}
            </div>

            <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",marginTop:10}}>
              <div style={{padding:"0 14px 8px",fontSize:10,color:C.t3,
                borderBottom:`1px solid ${C.border}`}}>Session log</div>
              <div style={{flex:1,overflowY:"auto"}}>
                {log.length===0?(
                  <div style={{padding:16,textAlign:"center",fontSize:11,color:C.t3}}>
                    No calls yet
                  </div>
                ):log.map((e,i)=>(
                  <div key={i} style={{padding:"7px 14px",borderBottom:`1px solid ${C.border}`,
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
                        {e.email&&<><span>·</span><span style={{color:C.accent}}>✉</span></>}
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
                border:`1px solid ${C.border}`,background:"transparent",
                color:C.t3,fontSize:9,cursor:"pointer",opacity:0.5,transition:"opacity 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.opacity="1"}
              onMouseLeave={e=>e.currentTarget.style.opacity="0.5"}>
              Reset Call State
            </button>
          </div>
        )}
      </div>

      {/* Persistent "Log Disposition" button */}
      {active&&!dispoBarOpen&&sessRun&&(
        <button onClick={openDispoBar}
          style={{position:"fixed",bottom:16,right:20,padding:"6px 16px",borderRadius:100,
            border:`1px solid ${C.border}`,background:C.bg,color:C.t2,fontSize:11,fontWeight:500,
            cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,0.08)",zIndex:100}}>
          Log Disposition
        </button>
      )}

      {/* Disposition bar overlay */}
      {dispoBarOpen&&(
        <div style={{position:"fixed",inset:0,zIndex:9000,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}
          onClick={e=>{if(e.target===e.currentTarget)setDispoBarOpen(false);}}>
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.3)"}}/>
          <div style={{position:"relative",background:C.bg,borderTop:`1px solid ${C.border}`,
            borderRadius:"16px 16px 0 0",padding:"20px 24px 24px",maxHeight:"70vh",overflowY:"auto",
            animation:"slideUp 0.3s ease",boxShadow:"0 -4px 20px rgba(0,0,0,0.1)"}}>

            <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
              <span style={{fontSize:14,fontWeight:500}}>Log Disposition</span>
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
                borderTop:`1px solid ${C.border}`,paddingTop:14}}>

                {OUTCOMES[pendingOutcome]?.needsEmail&&(
                  <div>
                    <div style={{fontSize:10,color:C.t3,marginBottom:4}}>
                      {pendingOutcome==="demo_booked"?"Prospect email":"Prospect email"}
                    </div>
                    <input type="email" value={captureEmail} onChange={e=>setCaptureEmail(e.target.value)}
                      placeholder="owner@business.com"
                      style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,
                        padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none"}}/>
                  </div>
                )}

                {OUTCOMES[pendingOutcome]?.needsLoom&&(
                  <div>
                    <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Loom context</div>
                    <textarea value={loomContext} onChange={e=>setLoomContext(e.target.value)}
                      placeholder="What should the Loom cover for this prospect?"
                      rows={2} style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,
                        padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none",resize:"vertical"}}/>
                  </div>
                )}

                {OUTCOMES[pendingOutcome]?.needsDateTime&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div>
                      <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Callback date</div>
                      <input type="date" value={callbackDate} onChange={e=>setCallbackDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,
                          padding:"6px 10px",fontSize:12,background:C.bg,color:C.t1,outline:"none"}}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Callback time</div>
                      <input type="time" value={callbackTime} onChange={e=>setCallbackTime(e.target.value)}
                        style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,
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
                            border:`1px solid ${sendType===opt.v?C.accent:C.border}`,
                            background:sendType===opt.v?`${C.accent}10`:"transparent",
                            color:sendType===opt.v?C.accent:C.t2,fontSize:11,fontWeight:500,cursor:"pointer"}}>
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
                      style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,
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
                            border:`1px solid ${spokeWith===opt?C.accent:C.border}`,
                            background:spokeWith===opt?`${C.accent}10`:"transparent",
                            color:spokeWith===opt?C.accent:C.t2,fontSize:11,fontWeight:500,cursor:"pointer"}}>
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
            boxShadow:"0 8px 40px rgba(0,0,0,0.18)",animation:"slideDown 0.2s ease"}}>
            <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
              <span style={{fontSize:15,fontWeight:600}}>Admin Settings</span>
              <button onClick={()=>setShowAdminPanel(false)}
                style={{marginLeft:"auto",border:"none",background:"transparent",fontSize:16,
                  color:C.t3,cursor:"pointer",padding:"4px 8px"}}>✕</button>
            </div>

            {/* ── Admin tab navigation ── */}
            <div style={{display:"flex",gap:4,marginBottom:16,borderBottom:`1px solid ${C.border}`,paddingBottom:8}}>
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
                  {Object.entries(ICP_LABEL).map(([key,label])=>{
                    const isOff = disabledIcps.has(key);
                    const count = leads.filter(l=>l.icp===key).length;
                    return (
                      <div key={key} style={{display:"flex",alignItems:"center",gap:12,
                        padding:"12px 14px",borderRadius:10,
                        border:`1px solid ${isOff?C.border:C.green+"40"}`,
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
                            border:`1px solid ${isOff?C.border:C.green}`,
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
                  {(SCRIPT_OPTIONS.salon||SCRIPT_OPTIONS.hvac||[]).map(s=>{
                    const isDisabled = disabledScripts.has(s.variant);
                    return (
                      <div key={s.variant} style={{display:"flex",alignItems:"center",gap:12,
                        padding:"10px 14px",borderRadius:10,
                        border:`1px solid ${isDisabled?C.border:C.green+"40"}`,
                        background:isDisabled?C.surface:`${C.green}06`}}>
                        <span style={{fontFamily:FM,fontSize:11,color:C.t3,minWidth:16}}>{s.variant}</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:12,fontWeight:500,color:isDisabled?C.t3:C.t1}}>{s.name}</div>
                          <div style={{fontSize:10,color:C.t3}}>{s.tag}</div>
                        </div>
                        <button onClick={()=>{
                          setDisabledScripts(prev => {
                            const next = new Set(prev);
                            if (next.has(s.variant)) next.delete(s.variant);
                            else next.add(s.variant);
                            localStorage.setItem("harmonia-admin-disabled-scripts", JSON.stringify([...next]));
                            return next;
                          });
                        }}
                          style={{padding:"4px 14px",borderRadius:100,fontSize:11,fontWeight:500,
                            border:`1px solid ${isDisabled?C.border:C.green}`,
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
