import { useState, useEffect, useRef } from "react";
import { SCRIPT_OPTIONS, OBJECTION_PRESETS } from './config/sheetMapping';

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
const LINE_COLOR = { opener:C.accent, discovery:C.teal, pitch:C.amber, close:C.green };

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
    competitor: lead?.competitor||"",
    caller:     callerName||"",
  };
}

const PAIN_WEIGHTS = [3, 3, 2, 2];
function calcPainScore(responses) {
  let score = 0;
  PAIN_WEIGHTS.forEach((w, i) => { if (responses[i] === "pain") score += w; });
  return score;
}
function painColor(score, C) {
  if (score >= 7) return { color: C.red, fontWeight: 700 };
  if (score >= 4) return { color: C.amber, fontWeight: 500 };
  return { color: C.t3, fontWeight: 400 };
}

const REVIEW_PHONE_KEYWORDS = /phone|call|answer|voicemail|reach|wait/i;

function getRecommendedOpeners(lead) {
  const recs = [];
  const reviews = lead?.google_reviews || [];
  if (reviews.some(r => REVIEW_PHONE_KEYWORDS.test(r.text || ""))) {
    recs.push({ openerId: "6", reason: "Has a phone-related review" });
  }
  if (lead?.competitor) {
    recs.push({ openerId: "7", reason: "Competitor intel available" });
    recs.push({ openerId: "8", reason: "Competitor + free trial angle" });
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
      status:        r.status || "queued",
      competitor:    r.competitor || "",
      pain_signals:  safeJSON(r.pain_signals, []),
      google_reviews:safeJSON(r.google_reviews, []),
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

function safeJSON(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; }
  catch { return fallback; }
}

/* ─────────────────────────────────────────────
   WRITE BACK TO SHEETS (disposition logging)
───────────────────────────────────────────── */
async function writeDisposition(lead, outcome, variant, callSecs, caller) {
  const timestamp = new Date().toISOString();
  const row = [
    timestamp + "-" + lead.id,
    lead.id,
    caller,
    lead.icp,
    variant,
    outcome,
    callSecs,
    lead.pain,
    timestamp,
  ];
  await fetch(
    `${BASE.replace("/values","")}/values/Script_Performance:append?valueInputOption=USER_ENTERED&key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [row] }),
    }
  );
}

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
  const [callPhase, setCallPhase] = useState("opener"); // 'opener'|'discovery'|'pitch'|'close'

  const sessRef = useRef(); const callRef = useRef();

  /* ── FETCH ALL SHEET DATA ON MOUNT ── */
  useEffect(() => {
    async function load() {
      try {
        const [leadsRaw, scriptsRaw, objectionsRaw] = await Promise.all([
          fetchSheet("Leads"),
          fetchSheet("Scripts"),
          fetchSheet("Objections"),
        ]);
        const parsedLeads = parseLeads(leadsRaw);
        setLeads(parsedLeads);
        setScripts(parseScripts(scriptsRaw));
        setObjections(parseObjections(objectionsRaw));
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

  useEffect(() => {
    if(pitchUnlocked && callPhase==="discovery") setCallPhase("pitch");
  },[pitchUnlocked, callPhase]);

  if (loading || loadError) return <LoadingScreen error={loadError} />;

  const filtered     = leads.filter(l => filter==="all" || l.icp===filter);
  const queueLeft    = filtered.filter(l=>l.status==="queued").length;
  const totalAns     = stats.answered + stats.demos;
  const connectRate  = stats.dials>0 ? Math.round(totalAns/stats.dials*100) : 0;
  const demoRate     = totalAns>0    ? Math.round(stats.demos/totalAns*100) : 0;

  const curScripts   = scripts[active?.icp] || {};
  const curScript    = curScripts[variant]  || curScripts[Object.keys(curScripts)[0]];
  const curObjs      = objections[active?.icp] || [];
  const variants     = Object.keys(curScripts);
  const flaggedReviews = (active?.google_reviews||[]).filter(r=>r.flagged||r.flagged==="TRUE"||r.flagged==="true");
  const recommended = active ? getRecommendedOpeners(active) : [];
  const recMap = Object.fromEntries(recommended.map(r=>[r.openerId, r.reason]));
  const hasDiscoveryInput = Object.keys(discoveryResponses).length > 0;
  const livePain = hasDiscoveryInput ? calcPainScore(discoveryResponses) : null;
  const painSignalCount = Object.values(discoveryResponses).filter(v=>v==="pain").length;
  const pitchUnlocked = painSignalCount >= 2;
  const displayPain = (lead) => livePain !== null && lead?.id === active?.id ? livePain : (lead?.pain || 0);
  const painStyle = (score) => painColor(score, C);
  const pendingMeta = pendingOutcome ? OUTCOMES[pendingOutcome] : null;

  function selectLead(lead) {
    setActive(lead);
    setDiscoveryResponses({});
    setCallPhase("opener");
    const recs = getRecommendedOpeners(lead);
    const avail = Object.keys(scripts[lead?.icp] || {});
    const pick = recs.find(r => avail.includes(r.openerId));
    setVariant(pick ? pick.openerId : avail[0] || "1");
  }

  function startSess(){ setSessRun(true);setSessSecs(0);setStats({dials:0,answered:0,demos:0,vm:0});setLog([]); }
  function endSess()  { setSessRun(false); if(callRun){setCallRun(false);setCallSecs(0);} }

  async function dial(lead){
    if(!sessRun||callRun||lead.status!=="queued"||!callerName) return;
    setActive(lead);setCallRun(true);setCallSecs(0);setTab("intel");setOpenObj(null);
    resetCaptureFields();
    setStats(s=>({...s,dials:s.dials+1}));
    const url=`https://infoharmonia.app.n8n.cloud/webhook/click_to_call?from=${encodeURIComponent(caller)}&to=${encodeURIComponent(lead.phone)}`;
    try{ await fetch(url,{method:"GET",mode:"no-cors"}); }
    catch(e){ console.log("Call fired:",lead.phone); }
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

    setLeads(ls=>ls.map(l=>l.id===active.id?{...l,
      status: outcome==="demo_booked"?"demo_booked"
            : outcome==="dnc"?"dnc"
            : outcome==="not_qualified"?"not_qualified"
            : "called",
      script_used:scriptUsed,
      prospect_email: captureEmail || l.prospect_email || "",
      pain: hasDiscoveryInput ? livePain : l.pain,
    }:l));

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
        lead_id:active.id, biz:active.biz, owner:active.owner, phone:active.phone,
        city:active.city, state:active.state, icp:active.icp,
        disposition:outcome, status:meta.ghl||"called",
        ghl_stage:meta.ghl||null, discord_channel:meta.discord||null,
        script_used:scriptUsed, call_duration:dur,
        call_timestamp:new Date().toISOString(), call_link:'',
        objection_raised:objection, caller_name:callerName,
        prospect_email:captureEmail||null, prospect_phone:capturePhone||null,
        notes:captureNotes||null,
        calendly_opened:outcome==="demo_booked"?calendlyOpened:null,
        loom_context:outcome==="loom_sent"?(loomContext||`Pain: ${hasDiscoveryInput?livePain:active.pain}/10. ${(active.pain_signals||[]).slice(0,2).join(". ")}`):null,
        loom_queued:outcome==="loom_sent"?true:null,
        callback_datetime:callbackISO,
        send_type:outcome==="followup_sent"?sendType:null,
        gatekeeper_name:outcome==="gatekeeper"?gatekeeperName:null,
        discovery_signals:Object.keys(discoveryResponses).length>0?discoveryResponses:null,
        pain_score:hasDiscoveryInput?livePain:active.pain,
      };
      fetch(WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    } catch(err){ console.error('webhook failed:',err); }

    resetCaptureFields();
    const next=filtered.find(l=>l.id!==active.id&&l.status==="queued");
    if(next){selectLead(next);setTab("intel");}
    await writeDisposition(active, outcome, scriptUsed, dur, caller);
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
                {name:"Joel",   phone:null},
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
              {name:"Joel",   phone:null},
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
      </div>

      {/* ── BODY ── */}
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>

        {/* ── QUEUE ── */}
        <div style={{width:244,borderRight:`1px solid ${C.border}`,
          display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{padding:"9px 10px 8px",borderBottom:`1px solid ${C.border}`,
            display:"flex",gap:4,flexWrap:"wrap"}}>
            {["all","hvac","salon","barbershop"].map(f=>(
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
                    {active.owner}&nbsp;·&nbsp;{active.phone}&nbsp;·&nbsp;{active.city}{active.state?`, ${active.state}`:""}
                  </div>
                </div>

                {/* Call controls */}
                <div style={{display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
                  {callRun&&(
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:22,fontWeight:300,fontFamily:FM,color:C.green}}>
                        {fmt(callSecs)}
                      </div>
                      <div style={{fontSize:10,color:C.green,marginTop:1}}>live call</div>
                    </div>
                  )}
                  {(()=>{
                    const canDial=sessRun&&active.status==="queued"&&!!callerName;
                    if(!callRun&&!pendingOutcome) return (
                      <button onClick={()=>dial(active)}
                        disabled={!canDial}
                        style={{padding:"7px 22px",borderRadius:8,
                          border:`1px solid ${canDial?C.t1:C.border}`,
                          background:canDial?C.t1:"transparent",
                          color:canDial?C.bg:C.t3,
                          fontSize:12,fontWeight:500,
                          cursor:canDial?"pointer":"not-allowed",
                          transition:"all 0.15s"}}>
                        {active.status!=="queued"?"Called":!callerName?"Select caller":sessRun?"Dial":"Start session"}
                      </button>
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
                    {(SCRIPT_OPTIONS[active.icp]||[]).map(s=>(
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

                {/* ── INTEL ── */}
                {tab==="intel"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:12,maxWidth:660}}>
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

                    <div style={{background:C.surface,borderRadius:12,padding:"14px 16px",maxWidth:320}}>
                      <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Local competitor</div>
                      <input value={active.competitor||""} onChange={e=>{
                          const val=e.target.value;
                          setLeads(ls=>ls.map(l=>l.id===active.id?{...l,competitor:val}:l));
                          setActive(a=>({...a,competitor:val}));
                        }}
                        onBlur={e=>{
                          if(!e.target.value) return;
                          fetch(WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json'},
                            body:JSON.stringify({lead_id:active.id,field_update:'competitor',competitor:e.target.value})
                          }).catch(()=>{});
                        }}
                        onKeyDown={e=>{if(e.key==="Enter")e.target.blur();}}
                        placeholder="e.g. Mike's HVAC, Bella Salon..."
                        style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",
                          fontSize:12,background:C.bg,color:C.t1,outline:"none"}}/>
                      <div style={{fontSize:10,color:C.t3,marginTop:4}}>Used by openers #7 and #8 for {"{competitor}"} placeholder</div>
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

                {/* ── SCRIPT ── */}
                {tab==="script"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:640}}>
                    {active.opener&&(
                      <div style={{background:C.surface,borderRadius:12,padding:"14px 16px"}}>
                        <div style={{fontSize:10,color:C.t3,marginBottom:6}}>Lead opener (from sheet)</div>
                        <div style={{fontSize:14,color:C.t1,lineHeight:1.65,fontStyle:"italic"}}>
                          "{fillPlaceholders(active.opener, buildPlaceholderContext(active, callerName))}"
                        </div>
                      </div>
                    )}
                    {variants.length === 0 ? (
                      <div style={{fontSize:12,color:C.t3,padding:"20px 0"}}>
                        No scripts found for this vertical.<br/>
                        Add rows to the Scripts tab in your Google Sheet.
                      </div>
                    ):(
                      <>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                          {variants.map(v=>{
                            const isRec = !!recMap[v];
                            const isPrimary = recommended[0]?.openerId === v;
                            return (
                            <button key={v} onClick={()=>{setVariant(v);setCallPhase("opener");setDiscoveryResponses({});}}
                              style={{padding:"7px 12px",borderRadius:8,textAlign:"left",
                                border:`1px solid ${variant===v?C.t1:isRec?C.green+"60":C.border}`,
                                background:variant===v?C.t1:isRec?C.green+"08":"transparent",
                                color:variant===v?C.bg:C.t2,
                                fontSize:11,fontWeight:500,transition:"all 0.15s",
                                display:"flex",flexDirection:"column",gap:2}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,width:"100%"}}>
                                <span style={{fontFamily:FM,fontSize:10,opacity:0.6}}>{v}</span>
                                <span>{curScripts[v]?.name}</span>
                                {isRec&&<div style={{width:6,height:6,borderRadius:"50%",
                                  background:variant===v?C.bg:C.green,marginLeft:"auto",flexShrink:0}}/>}
                                {!isRec&&curScripts[v]?.tag&&<span style={{fontSize:9,opacity:0.5,marginLeft:"auto"}}>({curScripts[v].tag})</span>}
                              </div>
                              {isRec&&<div style={{fontSize:9,color:variant===v?`${C.bg}90`:C.green,
                                paddingLeft:18}}>{isPrimary?"★ ":""}{recMap[v]}</div>}
                            </button>
                            );
                          })}
                        </div>

                        {curScript?.tag&&(
                          <div style={{display:"flex",alignItems:"center",gap:7}}>
                            <span style={{fontSize:10,color:C.t3}}>Angle</span>
                            <span style={{fontSize:11,padding:"3px 12px",borderRadius:100,
                              border:`1px solid ${C.border}`,color:C.t2}}>{curScript.tag}</span>
                          </div>
                        )}

                        {(variant==="7"||variant==="8")&&!active.competitor&&(
                          <div style={{background:"#FFF3CD",border:"1px solid #FFE69C",borderRadius:8,
                            padding:"8px 12px",fontSize:11,color:"#856404"}}>
                            ⚠ Add a competitor name in the{" "}
                            <button onClick={()=>setTab("intel")}
                              style={{color:"#856404",fontWeight:600,textDecoration:"underline",
                                border:"none",background:"transparent",cursor:"pointer",
                                fontSize:11,padding:0}}>Intel tab</button>
                            {" "}first
                          </div>
                        )}

                        <div style={{display:"flex",flexDirection:"column",gap:2}}>
                          {(curScript?.lines||[]).map((line,i)=>{
                            const isDiscovery = line.type === "discovery";
                            const isPitch = line.type === "pitch";
                            const isClose = line.type === "close";
                            const borderColors = {opener:"#EF4444",discovery:"#F59E0B",pitch:"#3B82F6",close:"#10B981"};
                            const leftColor = borderColors[line.type] || C.t3;

                            // Visibility logic
                            const hidden = (isDiscovery && callPhase==="opener")
                              || (isPitch && callPhase==="opener")
                              || (isClose && callPhase==="opener");
                            const locked = (isPitch || isClose) && !pitchUnlocked && callPhase!=="opener";
                            const isCurrentPhase = line.type === callPhase;

                            if (hidden && line.type==="discovery") {
                              // Show "They're talking →" button instead
                              return (
                                <div key={i} style={{display:"flex",justifyContent:"center",padding:"16px 0"}}>
                                  <button onClick={()=>setCallPhase("discovery")}
                                    style={{padding:"10px 28px",borderRadius:100,border:"none",
                                      background:C.t1,color:C.bg,fontSize:12,fontWeight:500,
                                      cursor:"pointer",animation:"pulse 2s ease-in-out infinite"}}>
                                    They're talking →
                                  </button>
                                </div>
                              );
                            }
                            if (hidden) return null;

                            const bullets = isDiscovery && line.text.includes(" // ")
                              ? line.text.split(" // ").map(b=>b.replace(/^[•·\-]\s*/, "").replace(/^[""]|[""]$/g,"").trim()).filter(Boolean)
                              : null;
                            const painCount = bullets ? bullets.filter((_,qi)=>discoveryResponses[qi]==="pain").length : 0;

                            return (
                            <div key={i} style={{
                              padding:"16px 18px",marginBottom:4,borderRadius:10,
                              borderLeft:`3px solid ${leftColor}`,
                              background:isCurrentPhase?`${leftColor}06`:locked?C.surface:"transparent",
                              opacity:locked?0.3:1,filter:locked?"blur(1px)":"none",
                              position:"relative",transition:"opacity 0.3s ease, filter 0.3s ease",
                              pointerEvents:locked?"none":"auto"}}>

                              {locked&&(
                                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",
                                  justifyContent:"center",zIndex:1,borderRadius:10}}>
                                  <span style={{fontSize:11,color:C.t2,fontWeight:500,
                                    background:`${C.bg}E0`,padding:"4px 14px",borderRadius:100}}>
                                    🔒 Confirm 2+ pain signals to unlock
                                  </span>
                                </div>
                              )}

                              <div style={{fontSize:10,color:LINE_COLOR[line.type]||C.t2,
                                fontWeight:500,marginBottom:8,textTransform:"uppercase",
                                letterSpacing:"0.03em"}}>{line.type}</div>

                              {isDiscovery && bullets ? (
                                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                                  {bullets.map((q,qi)=>{
                                    const resp = discoveryResponses[qi] || null;
                                    return (
                                    <div key={qi} style={{display:"flex",alignItems:"center",gap:8,
                                      padding:"8px 12px",borderRadius:8,
                                      border:`1px solid ${resp==="pain"?C.green+"40":resp==="no"?C.border:C.border}`,
                                      background:resp==="pain"?C.green+"06":resp==="no"?C.surface:"transparent"}}>
                                      <div style={{flex:1,fontSize:13,color:C.t1,lineHeight:1.5}}>
                                        {fillPlaceholders(q, buildPlaceholderContext(active, callerName))}
                                      </div>
                                      <div style={{display:"flex",gap:4,flexShrink:0}}>
                                        {[{k:"pain",l:"Pain",bg:C.green},{k:"no",l:"No",bg:C.t3},{k:"skip",l:"Skip",bg:C.border}].map(opt=>(
                                          <button key={opt.k} onClick={()=>setDiscoveryResponses(prev=>({...prev,[qi]:prev[qi]===opt.k?null:opt.k}))}
                                            style={{padding:"3px 10px",borderRadius:100,fontSize:10,fontWeight:500,
                                              border:resp===opt.k?`1px solid ${opt.bg}`:`1px solid ${C.border}`,
                                              background:resp===opt.k?opt.bg+"20":"transparent",
                                              color:resp===opt.k?opt.bg:C.t3,cursor:"pointer",transition:"all 0.1s"}}>
                                            {opt.l}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    );
                                  })}
                                  <div style={{fontSize:11,color:painCount>0?C.green:C.t3,marginTop:4,fontWeight:500}}>
                                    Pain signals: {painCount}/{bullets.length}
                                  </div>
                                </div>
                              ) : (
                                <div style={{fontSize:14,color:C.t1,lineHeight:1.75,
                                  fontStyle:line.type==="opener"?"italic":"normal"}}>
                                  {fillPlaceholders(line.text, buildPlaceholderContext(active, callerName))}
                                </div>
                              )}
                            </div>
                            );
                          })}
                        </div>

                      </>
                    )}
                  </div>
                )}

                {/* ── OBJECTIONS ── */}
                {tab==="objections"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:8,maxWidth:600}}>
                    {curObjs.length === 0 ? (
                      <div style={{fontSize:12,color:C.t3,padding:"20px 0"}}>
                        No objections found for this vertical.<br/>
                        Add rows to the Objections tab in your Google Sheet.
                      </div>
                    ):(
                      <>
                        <div style={{fontSize:11,color:C.t3,marginBottom:4}}>Tap to expand</div>
                        {curObjs.map((obj,i)=>(
                          <div key={i} style={{borderRadius:12,overflow:"hidden",
                            border:`1px solid ${openObj===i?C.borderMd:C.border}`,
                            transition:"border-color 0.15s"}}>
                            <div onClick={()=>setOpenObj(openObj===i?null:i)}
                              style={{padding:"12px 16px",display:"flex",alignItems:"center",
                                gap:12,cursor:"pointer",
                                background:openObj===i?C.surface:C.bg}}>
                              <div style={{width:5,height:5,borderRadius:"50%",
                                background:openObj===i?C.t1:C.t3,flexShrink:0,
                                transition:"background 0.15s"}}/>
                              <span style={{fontSize:13,color:C.t1,flex:1}}>"{obj.q}"</span>
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
                              </div>
                            )}
                          </div>
                        ))}
                      </>
                    )}
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

        {/* ── RIGHT PANEL ── */}
        <div style={{width:210,borderLeft:`1px solid ${C.border}`,
          display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{padding:"12px 10px 0",display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
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
      </div>
    </div>
  );
}
