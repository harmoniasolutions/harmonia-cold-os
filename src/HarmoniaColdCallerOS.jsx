import { useState, useEffect, useRef } from "react";

/* ─────────────────────────────────────────────
   DESIGN TOKENS  —  Jony Ive / Apple
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
  yellow:   "#FFD60A",
};
const F  = "'DM Sans', -apple-system, sans-serif";
const FM = "'DM Mono', 'SF Mono', monospace";

/* ─────────────────────────────────────────────
   SCRIPTS — 3 variants each
───────────────────────────────────────────── */
const SCRIPTS = {
  hvac: {
    a: { name:"Revenue Leak", tag:"Pain-first", lines:[
      { type:"opener", text:"Hey {owner} — I'll be direct. Most HVAC shops your size in {city} miss 8–12 calls a day during peak. That's {leak} in lost bookings every month. Worth 20 minutes?" },
      { type:"bridge", text:"We put a 24/7 AI receptionist on your line. Answers every missed call, books the job, keeps the customer — while your techs are on the road." },
      { type:"close",  text:"I can show you what it looks like for a shop your size. Thursday or Friday this week?" },
    ]},
    b: { name:"After Hours", tag:"Urgency-first", lines:[
      { type:"opener", text:"Hey {owner} — when a homeowner's AC dies at 9pm Friday and you don't answer, where do they go? Whoever does. We make sure that's you." },
      { type:"bridge", text:"SAM covers your phones nights, weekends, holidays. Books the service call, texts confirmation — zero effort on your end." },
      { type:"close",  text:"20 minutes to show you the demo. Any day this week?" },
    ]},
    c: { name:"Peak Season", tag:"Timing-first", lines:[
      { type:"opener", text:"{owner}, peak season is here. Every call that hits voicemail while your dispatcher is on another line is a job going to your competitor." },
      { type:"bridge", text:"SAM handles overflow instantly — books appointments, captures new leads, sends confirmations. Works alongside whatever you already use." },
      { type:"close",  text:"Quick question — how many calls do you think you're missing on a busy day right now?" },
    ]},
  },
  salon: {
    a: { name:"Missed Bookings", tag:"Cost-first", lines:[
      { type:"opener", text:"{owner}, most {chairs}-chair salons miss 6–10 booking calls a week during appointments. At your prices, that's {leak} walking out every month." },
      { type:"bridge", text:"SAM books appointments, handles availability questions, works alongside Vagaro — 24/7, no front desk needed." },
      { type:"close",  text:"5-minute demo. I promise it's worth it — when are you free this week?" },
    ]},
    b: { name:"Vagaro Gap", tag:"Integration-first", lines:[
      { type:"opener", text:"Hey {owner} — Vagaro handles online booking great. But it can't answer the phone. When someone calls instead of booking online, that call hits voicemail half the time." },
      { type:"bridge", text:"SAM works alongside Vagaro — books directly into your calendar in real time, sends the confirmation. Not a replacement. The piece Vagaro's missing." },
      { type:"close",  text:"20 minutes to see it live — any day this week?" },
    ]},
    c: { name:"New Client Growth", tag:"Growth-first", lines:[
      { type:"opener", text:"Quick question, {owner} — how do new clients find {biz}? Most of them call before they book online. If nobody answers, they're at the next salon in 30 seconds." },
      { type:"bridge", text:"SAM answers every call like a trained front desk coordinator. Captures new clients you'd otherwise lose, even when you're mid-appointment." },
      { type:"close",  text:"What would 4–5 extra new clients a week mean for {biz}? Let me show you how it works." },
    ]},
  },
  barbershop: {
    a: { name:"Wait Time", tag:"Retention-first", lines:[
      { type:"opener", text:"Hey {owner} — how many calls a week come in to check wait time, get no answer, and walk somewhere else? For shops like {biz} it's usually 15–20. That's {leak} gone." },
      { type:"bridge", text:"SAM tells callers current wait time, answers hours and pricing, texts them when you're ready. Keeps them from going down the street." },
      { type:"close",  text:"20 minutes this week to see it?" },
    ]},
    b: { name:"New Clients", tag:"Growth-first", lines:[
      { type:"opener", text:"{owner}, your regulars know to walk in. But anyone new searches, sees your number, calls — and if nobody answers, they're gone. No voicemail. No callback. Gone." },
      { type:"bridge", text:"SAM picks up, tells them the wait, takes their number if the wait's long, texts when you're ready. First impression, locked in." },
      { type:"close",  text:"Worth a look? 20 minutes this week?" },
    ]},
    c: { name:"Walk-In Convert", tag:"Volume-first", lines:[
      { type:"opener", text:"Simple question — what percentage of people who call {biz} to check availability actually come in if nobody answers? Close to zero. We fix that." },
      { type:"bridge", text:"SAM answers, handles the wait-time question live, and converts that call into a visit. Works even when you've got scissors in your hand." },
      { type:"close",  text:"Can I send you a 2-minute demo video? No commitment — just want you to see what it looks like." },
    ]},
  },
};

const OBJECTIONS = {
  hvac: [
    { q:"We already have voicemail",  a:"Voicemail loses the job. When a homeowner's AC dies at 11pm they call the next contractor that answers — they don't wait. SAM answers live, books the service call, texts confirmation. That's the gap." },
    { q:"Too expensive",              a:"Lowest tier is $499/month. Missing 3 service calls at $300 average is $900 gone. SAM pays for itself in the first week. No long-term contract." },
    { q:"We're too busy right now",   a:"Busy season is exactly when you need it. When your techs are on jobs and the phone rings again, SAM handles it so you don't lose leads while serving the ones you have." },
    { q:"I'll think about it",        a:"Fair. While you think, your competitors are answering the calls you're missing. Can I send a 2-minute video — no commitment, just so it's concrete?" },
    { q:"We have a receptionist",     a:"SAM is overflow, not replacement. Your receptionist handles what she handles. SAM catches the calls when she's on another line, on break, or it's 8pm on a Saturday." },
  ],
  salon: [
    { q:"We use Vagaro already",      a:"Vagaro handles online scheduling. SAM handles the calls Vagaro can't answer. They work together — SAM books directly into your Vagaro calendar. Not a replacement." },
    { q:"My clients just text me",    a:"Your regulars do — but new clients call. Someone searching 'salon near me' is calling cold. If you don't pick up, they're at the next salon in 30 seconds." },
    { q:"Can't afford it right now",  a:"Salon tier starts at $499. Missing 4 booking calls a week at $60 average is nearly $1,000 a month walking out. What would recovering even half of that mean?" },
    { q:"I do everything myself",     a:"That's exactly why SAM helps — it runs itself. No management, no training. You share your calendar and it books into it. That's it." },
  ],
  barbershop: [
    { q:"People just walk in",        a:"Your regulars do. But anyone new checks wait time before driving over. If nobody answers, they go somewhere else. SAM tells them the wait, takes their number, texts when you're ready." },
    { q:"No time for new tech",       a:"Setup takes 48 hours and our engineer handles everything — you never touch a line of code. You'll spend more time on this call than on the entire onboarding." },
    { q:"Too expensive",              a:"Starts at $499/month. Missing 15–20 calls a week at $35 average ticket is $2,000–$2,800 a month gone. SAM pays for itself in the first few days." },
    { q:"I have someone who answers", a:"While they're cutting? SAM is overflow for when your person can't pick up. No conflict." },
  ],
};

/* ─────────────────────────────────────────────
   LEADS — with website, reviews, comments
───────────────────────────────────────────── */
const LEADS = [
  {
    id:1, biz:"Comfort Climate HVAC", owner:"Mike Russo", phone:"(610) 441-2891",
    city:"Ardmore", state:"PA", icp:"hvac", score:"A", pain:9,
    leak:"$3,200–$4,800/mo", chairs:null, reviews_count:4,
    website:"https://comfortclimatehvac.com",
    opener:"Mike, your Google reviews mention 'hard to reach' three times in the last 60 days. Most shops your size miss 8–12 calls a day during peak — that's $3,200 a month in jobs you never see.",
    pains:["4 reviews flagged: 'hard to reach', 'no answer', 'couldn't get through'","No after-hours coverage — voicemail after 5pm","1 dispatcher + 3 techs in field — phone rings during dispatch"],
    google_reviews:[
      { stars:5, author:"Patricia W.", date:"2 weeks ago",   text:"Great service, Mike really knows his stuff. Fixed our AC fast.",            flagged:false },
      { stars:2, author:"James H.",    date:"3 weeks ago",   text:"Tried calling three times over two days and couldn't get through. Finally had to just show up. Work was fine once they came out but the phone situation is frustrating.",  flagged:true  },
      { stars:4, author:"Donna C.",    date:"1 month ago",   text:"Good technicians, fair pricing. Wish it was easier to reach someone when you call.",  flagged:true  },
      { stars:1, author:"Tom A.",      date:"6 weeks ago",   text:"Called 4 times over a weekend with a broken unit. No answer, no callback. Had to go with someone else. Disappointing.",  flagged:true  },
    ],
    intel_comments:"Website has a basic contact form but no online booking — all scheduling appears phone-based. Google Business shows hours end at 5pm, no 'after hours' note. 3 techs listed on site. Owner replies to reviews occasionally so he's engaged.",
    status:"queued", script_used:null,
  },
  {
    id:2, biz:"Luxe Salon & Spa", owner:"Maria Chen", phone:"(610) 527-0183",
    city:"Wayne", state:"PA", icp:"salon", score:"A", pain:9,
    leak:"$2,800–$4,200/mo", chairs:4, reviews_count:3,
    website:"https://luxesalonwaynepa.com",
    opener:"Maria, Luxe has 4 stylists running. Most salons that size miss 6–10 booking calls a week during appointments — at your prices, that's $3K a month not showing up.",
    pains:["4-chair salon with no dedicated receptionist","Reviews: 'hard to get an appointment' mentioned 3×","Closes 7pm — no evening booking coverage"],
    google_reviews:[
      { stars:5, author:"Rachel B.",   date:"1 week ago",    text:"Maria is an artist. Color came out perfect. Will definitely be back.",         flagged:false },
      { stars:3, author:"Susan M.",    date:"2 weeks ago",   text:"Love the salon but it's nearly impossible to get through on the phone. I ended up just walking in to book.",  flagged:true  },
      { stars:2, author:"Kelly F.",    date:"1 month ago",   text:"Called 4 times one afternoon. No answer. I know they're busy but there has to be a better system. Ended up booking elsewhere.", flagged:true  },
      { stars:5, author:"Aisha T.",    date:"5 weeks ago",   text:"Best balayage in Wayne. Maria is incredibly talented.",                        flagged:false },
      { stars:3, author:"Diana L.",    date:"2 months ago",  text:"Great work but hard to get an appointment. Wish they had online booking that actually worked.",  flagged:true  },
    ],
    intel_comments:"Vagaro link on website but reviews suggest clients prefer calling. Instagram active — 2,400 followers, posts regularly. 4 stylists visible on site with individual bio pages. Premium pricing ($180+ for color services). No chatbot or booking widget that functions well.",
    status:"queued", script_used:null,
  },
  {
    id:3, biz:"Premier Cuts", owner:"DeShawn Williams", phone:"(610) 688-7742",
    city:"Bryn Mawr", state:"PA", icp:"barbershop", score:"A", pain:8,
    leak:"$1,400–$2,100/mo", chairs:null, reviews_count:2,
    website:"https://premiercutsbrynmawr.com",
    opener:"DeShawn — when someone calls to check wait time and no one picks up, where do they go? For shops like Premier Cuts it's 15–20 calls a week, gone.",
    pains:["High walk-in volume — phone rarely answered during cuts","2 reviews explicitly mention 'called and got no answer'","No system to capture missed caller info or text back"],
    google_reviews:[
      { stars:5, author:"Marcus J.",   date:"3 days ago",    text:"DeShawn is the best barber in the area. Fades are clean every time.",         flagged:false },
      { stars:5, author:"Ryan O.",     date:"1 week ago",    text:"Always a great cut. Busy shop which is a good sign.",                         flagged:false },
      { stars:2, author:"Andre P.",    date:"3 weeks ago",   text:"Tried calling to check the wait before driving over. No answer. Showed up and waited 45 min. Wish there was a way to check wait time remotely.",  flagged:true  },
      { stars:4, author:"Chris D.",    date:"1 month ago",   text:"Solid barbershop. Gets packed on weekends. Called once and no one picked up — just show up.",  flagged:true  },
    ],
    intel_comments:"Website is basic — just address, hours, phone. No Instagram link found though Google suggests they have one. Primarily walk-in based. Located in a busy strip mall near Bryn Mawr College. Google listing shows 'Usually busy' on Saturdays.",
    status:"queued", script_used:null,
  },
  {
    id:4, biz:"Efficient Air Solutions", owner:"Tom Bakshi", phone:"(484) 318-5500",
    city:"Malvern", state:"PA", icp:"hvac", score:"B", pain:7,
    leak:"$2,100–$3,500/mo", chairs:null, reviews_count:2,
    website:"https://efficientairsolutions.net",
    opener:"Tom, Efficient Air has solid reviews but 2 recent ones mention phone issues. With 3 techs on the road, the office line probably gets thin midday.",
    pains:["3 techs in field — office often unstaffed midday","Review: 'called 3 times, no answer'","Website shows no after-hours contact option"],
    google_reviews:[
      { stars:5, author:"Linda K.",    date:"2 weeks ago",   text:"Tom's team did a great job with our new AC install. On time and professional.",  flagged:false },
      { stars:5, author:"Dave N.",     date:"3 weeks ago",   text:"Best HVAC company in Malvern. Fair pricing, honest work.",                    flagged:false },
      { stars:2, author:"Gary S.",     date:"5 weeks ago",   text:"Called three times on a Tuesday afternoon and couldn't get anyone. Eventually got a callback the next morning — but that's too late when your AC is out in July.",  flagged:true  },
      { stars:3, author:"Janet M.",    date:"2 months ago",  text:"Work was solid. Hard to get through on the phone during the day though.",     flagged:true  },
    ],
    intel_comments:"Professional looking website with service area map covering Chester County. ServiceTitan logo visible in footer — they're already using field service software. This is a warm integration story: SAM feeds jobs directly into their existing workflow.",
    status:"queued", script_used:null,
  },
  {
    id:5, biz:"The Cut House", owner:"James Okonkwo", phone:"(610) 525-4421",
    city:"Wayne", state:"PA", icp:"barbershop", score:"B", pain:7,
    leak:"$1,200–$1,800/mo", chairs:null, reviews_count:1,
    website:null,
    opener:"James, The Cut House has great reviews. No way for people to call ahead and check wait time though — that's walk-ins going to whoever does answer.",
    pains:["No website found — Google profile only","Walk-in only format loses mobile-first customers","Single operator, can't answer while cutting"],
    google_reviews:[
      { stars:5, author:"Malik T.",    date:"4 days ago",    text:"James gives the cleanest fade in Wayne. Always consistent.",                  flagged:false },
      { stars:5, author:"Omar B.",     date:"2 weeks ago",   text:"Great barber. Gets busy but worth the wait.",                                flagged:false },
      { stars:3, author:"Kevin L.",    date:"1 month ago",   text:"Tried calling ahead to see if he was free. No answer. Just show up I guess — but that's a gamble when you're busy.",  flagged:true  },
    ],
    intel_comments:"No website — Google Business profile only. This is a 1-person operation. Pain angle: James is literally cutting while the phone rings. No receptionist, no system, no way to capture callers. Very clean entry point for the 'we run it for you' pitch.",
    status:"queued", script_used:null,
  },
  {
    id:6, biz:"Valley Comfort HVAC", owner:"Susan Park", phone:"(610) 648-2200",
    city:"Paoli", state:"PA", icp:"hvac", score:"B", pain:6,
    leak:"$1,800–$2,600/mo", chairs:null, reviews_count:1,
    website:"https://valleycomfortpa.com",
    opener:"Susan, most established HVAC shops like Valley Comfort are leaving money on the table after hours. Nobody's home at 9pm when the AC breaks.",
    pains:["Hours end at 5pm — peak emergency window completely unserved","No after-hours contact on website or Google listing","1 review mentions 'couldn't reach after hours'"],
    google_reviews:[
      { stars:5, author:"Helen R.",    date:"1 week ago",    text:"Great company. Susan's team was professional and got our heat running fast.",   flagged:false },
      { stars:4, author:"Bill C.",     date:"3 weeks ago",   text:"Good work. Wished they had after-hours availability but they got to us the next morning.",  flagged:true  },
      { stars:5, author:"Anne W.",     date:"2 months ago",  text:"Very reliable. Have used them for years.",                                   flagged:false },
    ],
    intel_comments:"Established company, likely been around 10+ years based on review history. Website mentions 24/7 emergency service but phone rolls to voicemail after 5pm — contradiction to use. Susan appears to be the owner-operator. Warm framing: 'you say 24/7, we make it real.'",
    status:"queued", script_used:null,
  },
  {
    id:7, biz:"Bella Hair Studio", owner:"Sophia Romano", phone:"(610) 527-9910",
    city:"Villanova", state:"PA", icp:"salon", score:"B", pain:6,
    leak:"$1,600–$2,400/mo", chairs:3, reviews_count:1,
    website:"https://bellahairstudiovillanova.com",
    opener:"Sophia, 3-chair salon in Villanova — you're probably booked solid. The issue is calls coming in while stylists are mid-service. New client revenue you can't grab.",
    pains:["3 stylists — no dedicated front desk","Vagaro online only — misses phone-first clients","No evening or weekend answering"],
    google_reviews:[
      { stars:5, author:"Claire B.",   date:"5 days ago",    text:"Sophia is amazing. Best highlights I've ever had.",                          flagged:false },
      { stars:4, author:"Megan S.",    date:"3 weeks ago",   text:"Love this salon. Hard to get through on the phone — I usually just DM them on Instagram.",  flagged:true  },
      { stars:5, author:"Julie N.",    date:"1 month ago",   text:"Wonderful experience. Very talented team.",                                 flagged:false },
    ],
    intel_comments:"Active on Instagram (~1,100 followers). Clients are DMing to book — that's the workaround people have found. This is the pitch: 'you shouldn't need a workaround.' Vagaro button on website doesn't appear to be fully configured. Upscale neighborhood — clientele is high-value.",
    status:"queued", script_used:null,
  },
  {
    id:8, biz:"Sharp & Clean Barbers", owner:"Ravi Patel", phone:"(484) 422-7800",
    city:"Exton", state:"PA", icp:"barbershop", score:"C", pain:5,
    leak:"$900–$1,400/mo", chairs:null, reviews_count:1,
    website:"https://sharpandcleanbarbers.com",
    opener:"Ravi, Sharp & Clean has a great reputation. The gap is calls coming in when your team is with clients — new customers you never hear from.",
    pains:["No call answering during peak hours","1 review mentions 'no one picked up'","2 barbers, single location"],
    google_reviews:[
      { stars:5, author:"Sanjay M.",   date:"1 week ago",    text:"Ravi gives a great cut. Very clean shop.",                                  flagged:false },
      { stars:4, author:"Chris W.",    date:"2 weeks ago",   text:"Good barbers. Called to check wait time once and no one answered — had to just show up.",  flagged:true  },
      { stars:5, author:"Jason P.",    date:"1 month ago",   text:"Best barber in Exton. Very friendly and professional.",                     flagged:false },
    ],
    intel_comments:"Newer shop, opened ~2 years ago based on review history. 2 barbers. Website is a simple one-pager. Lower pain score but it's a C lead worth calling — easy pitch, low resistance, could be a quick close if he's growth-minded.",
    status:"queued", script_used:null,
  },
];

const ICP_LABEL = { hvac:"HVAC", salon:"Salon", barbershop:"Barber" };
const SCORE_DOT = { A:C.green, B:C.amber, C:C.red };
const OUTCOMES  = {
  demo_booked:    { label:"Demo booked",   color:C.green,  short:"Demo" },
  answered:       { label:"Answered",       color:C.accent, short:"Ans"  },
  voicemail:      { label:"Voicemail",      color:C.amber,  short:"VM"   },
  callback:       { label:"Callback later", color:C.teal,   short:"CB"   },
  no_answer:      { label:"No answer",      color:C.red,    short:"N/A"  },
  not_interested: { label:"Not interested", color:C.t3,     short:"N/I"  },
};

const pad  = (n) => String(n).padStart(2,"0");
const fmt  = (s) => `${pad(Math.floor(s/60))}:${pad(s%60)}`;
const fmtH = (s) => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60; return h>0?`${pad(h)}:${pad(m)}:${pad(sc)}`:`${pad(m)}:${pad(sc)}`; };
const rv   = (t, lead) => (t||"")
  .replace("{owner}", (lead?.owner||"").split(" ")[0])
  .replace("{city}",  lead?.city||"")
  .replace("{leak}",  lead?.leak||"")
  .replace("{chairs}",lead?.chairs||"your")
  .replace("{biz}",   lead?.biz||"");

function StarRow({ stars }) {
  return (
    <span style={{ display:"inline-flex", gap:1 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ fontSize:10, color: i<=stars ? C.amber : C.border }}>★</span>
      ))}
    </span>
  );
}

/* ─────────────────────────────────────────────
   MAIN
───────────────────────────────────────────── */
export default function HarmoniaOS() {
  const [leads,    setLeads]   = useState(LEADS);
  const [active,   setActive]  = useState(LEADS[0]);
  const [filter,   setFilter]  = useState("all");
  const [tab,      setTab]     = useState("intel");
  const [variant,  setVariant] = useState("a");
  const [caller,   setCaller]  = useState("Bryan");
  const [sessRun,  setSessRun] = useState(false);
  const [sessSecs, setSessSecs]= useState(0);
  const [callRun,  setCallRun] = useState(false);
  const [callSecs, setCallSecs]= useState(0);
  const [stats,    setStats]   = useState({ dials:0, answered:0, demos:0, vm:0 });
  const [log,      setLog]     = useState([]);
  const [openObj,  setOpenObj] = useState(null);
  const [flash,    setFlash]   = useState(false);
  const sessRef = useRef(); const callRef = useRef();

  useEffect(()=>{
    if(sessRun) sessRef.current=setInterval(()=>setSessSecs(s=>s+1),1000);
    else clearInterval(sessRef.current);
    return()=>clearInterval(sessRef.current);
  },[sessRun]);

  useEffect(()=>{
    if(callRun) callRef.current=setInterval(()=>setCallSecs(s=>s+1),1000);
    else clearInterval(callRef.current);
    return()=>clearInterval(callRef.current);
  },[callRun]);

  const filtered    = leads.filter(l => filter==="all"||l.icp===filter);
  const queueLeft   = filtered.filter(l=>l.status==="queued").length;
  const totalAns    = stats.answered + stats.demos;
  const connectRate = stats.dials>0 ? Math.round(totalAns/stats.dials*100) : 0;
  const demoRate    = totalAns>0    ? Math.round(stats.demos/totalAns*100) : 0;
  const pace        = sessSecs>60   ? (stats.dials/(sessSecs/3600)).toFixed(1) : "—";
  const pipeline    = stats.demos * 649;
  const curScripts  = SCRIPTS[active?.icp] || {};
  const curScript   = curScripts[variant]  || curScripts.a;
  const curObjs     = OBJECTIONS[active?.icp] || [];
  const variants    = Object.keys(curScripts);
  const flaggedReviews = (active?.google_reviews||[]).filter(r=>r.flagged);

  function startSess(){ setSessRun(true);setSessSecs(0);setStats({dials:0,answered:0,demos:0,vm:0});setLog([]); }
  function endSess()  { setSessRun(false); if(callRun){setCallRun(false);setCallSecs(0);} }

  function dial(lead){
    if(!sessRun||callRun||lead.status!=="queued") return;
    setActive(lead);setCallRun(true);setCallSecs(0);setTab("intel");setOpenObj(null);
    setStats(s=>({...s,dials:s.dials+1}));
  }
  function logOutcome(outcome){
    if(!active) return;
    const dur=callSecs; setCallRun(false); setCallSecs(0);
    setLog(l=>[{num:stats.dials,biz:active.biz,icp:active.icp,script:variant,outcome,dur,ts:new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})},...l]);
    setStats(s=>({
      ...s,
      answered:(outcome==="answered"||outcome==="demo_booked")?s.answered+1:s.answered,
      demos:   outcome==="demo_booked"?s.demos+1:s.demos,
      vm:      outcome==="voicemail"?s.vm+1:s.vm,
    }));
    setLeads(ls=>ls.map(l=>l.id===active.id?{...l,status:outcome==="demo_booked"?"demo_booked":"called",script_used:variant}:l));
    if(outcome==="demo_booked"){setFlash(true);setTimeout(()=>setFlash(false),2500);}
    const next=filtered.find(l=>l.id!==active.id&&l.status==="queued");
    if(next){setActive(next);setTab("intel");setVariant("a");}
  }

  const lineColor = { opener:C.accent, bridge:C.t2, close:C.green };

  return (
    <div style={{background:C.bg,height:"100vh",display:"flex",flexDirection:"column",fontFamily:F,fontSize:13,color:C.t1,overflow:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
        button,select{font-family:${F};cursor:pointer}
        @keyframes slideDown{from{transform:translateY(-8px);opacity:0}to{transform:translateY(0);opacity:1}}
        .review-flagged { background: #FFFBF0; border-color: ${C.amber}40 !important; }
        a { color: ${C.accent}; text-decoration: none; }
        a:hover { text-decoration: underline; }
      `}</style>

      {/* FLASH */}
      {flash&&<div style={{position:"fixed",top:18,left:"50%",transform:"translateX(-50%)",background:C.t1,color:C.bg,padding:"9px 22px",borderRadius:100,fontSize:13,fontWeight:500,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.15)",animation:"slideDown 0.2s ease"}}>Demo booked ✦</div>}

      {/* ── HEADER ── */}
      <div style={{borderBottom:`1px solid ${C.border}`,padding:"0 20px",display:"flex",alignItems:"center",gap:22,height:52,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"baseline",gap:7}}>
          <span style={{fontSize:14,fontWeight:500,letterSpacing:"-0.01em"}}>Harmonia</span>
          <span style={{fontSize:11,color:C.t3}}>Cold Caller</span>
        </div>
        <div style={{width:1,height:18,background:C.border}}/>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <span style={{fontSize:11,color:C.t3}}>Caller</span>
          <select value={caller} onChange={e=>setCaller(e.target.value)} style={{border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 8px",fontSize:12,background:C.bg,color:C.t1,outline:"none"}}>
            {["Bryan","Pete","Caller 3"].map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <div style={{width:1,height:18,background:C.border}}/>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:17,fontWeight:300,letterSpacing:"0.04em",fontFamily:FM,color:sessRun?C.t1:C.t3,minWidth:68}}>{fmtH(sessSecs)}</span>
          <button onClick={sessRun?endSess:startSess} style={{padding:"4px 14px",borderRadius:6,border:`1px solid ${sessRun?C.red:C.accent}`,background:"transparent",color:sessRun?C.red:C.accent,fontSize:11,fontWeight:500}}>
            {sessRun?"End":"Start session"}
          </button>
        </div>
        <div style={{width:1,height:18,background:C.border}}/>
        {[{l:"Dials",v:stats.dials,c:C.t1},{l:"Connect",v:stats.dials>0?connectRate+"%":"—",c:C.accent},{l:"Demos",v:stats.demos,c:C.green},{l:"Pace",v:pace==="—"?"—":pace+"/hr",c:C.t2}].map(({l,v,c})=>(
          <div key={l} style={{textAlign:"center"}}>
            <div style={{fontSize:16,fontWeight:400,color:c,lineHeight:1,fontFamily:FM}}>{v}</div>
            <div style={{fontSize:10,color:C.t3,marginTop:2}}>{l}</div>
          </div>
        ))}
        <div style={{flex:1}}/>
        <div style={{fontSize:11,color:C.t3}}>{new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</div>
      </div>

      {/* ── BODY ── */}
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>

        {/* ── QUEUE ── */}
        <div style={{width:244,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{padding:"9px 10px 8px",borderBottom:`1px solid ${C.border}`,display:"flex",gap:4,flexWrap:"wrap"}}>
            {["all","hvac","salon","barbershop"].map(f=>(
              <button key={f} onClick={()=>setFilter(f)} style={{padding:"3px 10px",borderRadius:100,border:`1px solid ${filter===f?C.t1:C.border}`,background:filter===f?C.t1:"transparent",color:filter===f?C.bg:C.t2,fontSize:10,fontWeight:500,transition:"all 0.12s"}}>
                {f==="all"?"All":ICP_LABEL[f]}
              </button>
            ))}
          </div>
          <div style={{padding:"7px 14px 5px",display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:11,color:C.t3}}>{queueLeft} remaining</span>
            <span style={{fontSize:11,color:C.t3}}>{filtered.length} total</span>
          </div>
          <div style={{flex:1,overflowY:"auto"}}>
            {filtered.map(lead=>{
              const isActive=active?.id===lead.id,isDone=lead.status!=="queued";
              return (
                <div key={lead.id} onClick={()=>setActive(lead)} style={{padding:"9px 14px",cursor:isDone?"default":"pointer",opacity:isDone?0.38:1,borderBottom:`1px solid ${C.border}`,borderLeft:isActive?`2px solid ${C.t1}`:"2px solid transparent",background:isActive?C.surface:"transparent",transition:"background 0.1s"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:SCORE_DOT[lead.score],flexShrink:0}}/>
                    <span style={{fontSize:11,fontWeight:500,flex:1,lineHeight:1.3}}>{lead.biz}</span>
                    <span style={{fontSize:10,color:C.t3,fontFamily:FM}}>{lead.pain}/10</span>
                  </div>
                  <div style={{paddingLeft:12}}>
                    <div style={{fontSize:11,color:C.t2}}>{lead.owner}</div>
                    <div style={{fontSize:10,color:C.t3,marginTop:1}}>{ICP_LABEL[lead.icp]} · {lead.city}</div>
                    {isDone&&<div style={{marginTop:3,fontSize:10,fontWeight:500,color:lead.status==="demo_booked"?C.green:C.t3}}>{lead.status==="demo_booked"?"✦ Demo booked":"Called"}{lead.script_used&&<span style={{color:C.t3,fontWeight:400}}> · Script {lead.script_used.toUpperCase()}</span>}</div>}
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
              <div style={{padding:"13px 20px",borderBottom:`1px solid ${C.border}`,background:C.surface,display:"flex",alignItems:"flex-start",gap:16,flexShrink:0}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,flexWrap:"wrap"}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:SCORE_DOT[active.score]}}/>
                    <span style={{fontSize:11,color:C.t3}}>{ICP_LABEL[active.icp]} · Score {active.score} · Pain {active.pain}/10</span>
                    {active.website && (
                      <>
                        <span style={{fontSize:11,color:C.border}}>·</span>
                        <a href={active.website} target="_blank" rel="noreferrer"
                          style={{fontSize:11,color:C.accent,display:"flex",alignItems:"center",gap:3}}
                          onClick={e=>e.stopPropagation()}>
                          <span>↗</span>
                          <span>{active.website.replace(/^https?:\/\//,"").replace(/\/$/,"")}</span>
                        </a>
                      </>
                    )}
                    {!active.website && (
                      <>
                        <span style={{fontSize:11,color:C.border}}>·</span>
                        <span style={{fontSize:11,color:C.t3,fontStyle:"italic"}}>No website found</span>
                      </>
                    )}
                  </div>
                  <div style={{fontSize:18,fontWeight:500,letterSpacing:"-0.01em",marginBottom:3}}>{active.biz}</div>
                  <div style={{fontSize:12,color:C.t2}}>{active.owner}&nbsp;·&nbsp;{active.phone}&nbsp;·&nbsp;{active.city}, PA</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
                  {callRun&&(
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:22,fontWeight:300,fontFamily:FM,color:C.green}}>{fmt(callSecs)}</div>
                      <div style={{fontSize:10,color:C.green,marginTop:1}}>live call</div>
                    </div>
                  )}
                  {!callRun?(
                    <button onClick={()=>dial(active)} disabled={!sessRun||active.status!=="queued"} style={{padding:"7px 22px",borderRadius:8,border:`1px solid ${sessRun&&active.status==="queued"?C.t1:C.border}`,background:sessRun&&active.status==="queued"?C.t1:"transparent",color:sessRun&&active.status==="queued"?C.bg:C.t3,fontSize:12,fontWeight:500,cursor:sessRun&&active.status==="queued"?"pointer":"not-allowed",transition:"all 0.15s"}}>
                      {active.status!=="queued"?"Called":sessRun?"Dial":"Start session"}
                    </button>
                  ):(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5}}>
                      {Object.entries(OUTCOMES).map(([key,o])=>(
                        <button key={key} onClick={()=>logOutcome(key)} style={{padding:"5px 8px",borderRadius:7,border:`1px solid ${o.color}35`,background:`${o.color}08`,color:o.color,fontSize:10,fontWeight:500,whiteSpace:"nowrap",transition:"all 0.1s"}}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div style={{display:"flex",padding:"0 20px",borderBottom:`1px solid ${C.border}`,gap:0,flexShrink:0,background:C.bg}}>
                {[
                  {id:"intel",      label:"Intel"},
                  {id:"reviews",    label:`Reviews (${active.google_reviews?.length||0})`},
                  {id:"script",     label:"Script"},
                  {id:"objections", label:`Objections (${curObjs.length})`},
                ].map(t=>(
                  <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"10px 15px",border:"none",background:"transparent",borderBottom:tab===t.id?`1.5px solid ${C.t1}`:"1.5px solid transparent",color:tab===t.id?C.t1:C.t3,fontSize:12,fontWeight:tab===t.id?500:400,marginBottom:"-1px",transition:"color 0.15s"}}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{flex:1,overflowY:"auto",padding:20}}>

                {/* ── INTEL ── */}
                {tab==="intel"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:12,maxWidth:660}}>
                    <div style={{display:"grid",gridTemplateColumns:"160px 1fr",gap:12}}>
                      <div style={{background:C.surface,borderRadius:12,padding:"14px 16px"}}>
                        <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Revenue leak / mo</div>
                        <div style={{fontSize:17,fontWeight:500,color:C.red,letterSpacing:"-0.01em"}}>{active.leak}</div>
                      </div>
                      <div style={{background:C.surface,borderRadius:12,padding:"14px 16px"}}>
                        <div style={{fontSize:10,color:C.t3,marginBottom:6}}>Opener</div>
                        <div style={{fontSize:13,color:C.t1,lineHeight:1.65,fontStyle:"italic"}}>"{active.opener}"</div>
                      </div>
                    </div>

                    {/* Pain signals */}
                    <div style={{background:C.surface,borderRadius:12,padding:"14px 16px"}}>
                      <div style={{fontSize:10,color:C.t3,marginBottom:10}}>Pain signals</div>
                      <div style={{display:"flex",flexDirection:"column",gap:9}}>
                        {active.pains.map((p,i)=>(
                          <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                            <div style={{width:4,height:4,borderRadius:"50%",background:C.amber,marginTop:5,flexShrink:0}}/>
                            <span style={{fontSize:13,color:C.t1,lineHeight:1.55}}>{p}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Intel comments */}
                    {active.intel_comments && (
                      <div style={{background:C.surface,borderRadius:12,padding:"14px 16px"}}>
                        <div style={{fontSize:10,color:C.t3,marginBottom:8}}>Intel notes</div>
                        <div style={{fontSize:13,color:C.t1,lineHeight:1.68}}>{active.intel_comments}</div>
                      </div>
                    )}

                    {/* Flagged reviews summary */}
                    {flaggedReviews.length > 0 && (
                      <div style={{borderRadius:12,border:`1px solid ${C.amber}30`,padding:"14px 16px",background:"#FFFBF0"}}>
                        <div style={{fontSize:10,color:C.amber,marginBottom:10,fontWeight:500}}>
                          {flaggedReviews.length} pain signal{flaggedReviews.length>1?"s":""} in reviews — see Reviews tab for full text
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:7}}>
                          {flaggedReviews.slice(0,2).map((r,i)=>(
                            <div key={i} style={{fontSize:12,color:C.t1,lineHeight:1.55}}>
                              <StarRow stars={r.stars}/>{" "}
                              <span style={{color:C.t3,fontSize:10}}>{r.author} · {r.date}</span>
                              <div style={{marginTop:3,fontStyle:"italic",color:C.t2}}>"{r.text.length>100?r.text.slice(0,100)+"…":r.text}"</div>
                            </div>
                          ))}
                        </div>
                        <button onClick={()=>setTab("reviews")} style={{marginTop:10,fontSize:11,color:C.accent,border:"none",background:"transparent",padding:0,cursor:"pointer"}}>
                          View all {active.google_reviews?.length} reviews →
                        </button>
                      </div>
                    )}

                    {/* Meta */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                      {[{label:"Vertical",val:ICP_LABEL[active.icp],color:C.t1},{label:"Score",val:active.score,color:SCORE_DOT[active.score]},{label:"Pain",val:`${active.pain} / 10`,color:active.pain>=8?C.red:C.amber}].map(({label,val,color})=>(
                        <div key={label} style={{background:C.surface,borderRadius:12,padding:"12px 14px"}}>
                          <div style={{fontSize:10,color:C.t3,marginBottom:4}}>{label}</div>
                          <div style={{fontSize:15,fontWeight:500,color}}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── REVIEWS ── */}
                {tab==="reviews"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:660}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:2}}>
                      <span style={{fontSize:11,color:C.t3}}>{active.google_reviews?.length||0} reviews scraped</span>
                      <span style={{fontSize:11,padding:"2px 9px",borderRadius:100,background:"#FFFBF0",border:`1px solid ${C.amber}30`,color:C.amber,fontWeight:500}}>
                        {flaggedReviews.length} pain signal{flaggedReviews.length!==1?"s":""}
                      </span>
                    </div>
                    {(active.google_reviews||[]).map((r,i)=>(
                      <div key={i} className={r.flagged?"review-flagged":""} style={{borderRadius:12,border:`1px solid ${C.border}`,padding:"13px 16px",background:r.flagged?"#FFFBF0":C.bg,transition:"background 0.15s"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                          <StarRow stars={r.stars}/>
                          <span style={{fontSize:12,fontWeight:500,color:C.t1}}>{r.author}</span>
                          <span style={{fontSize:11,color:C.t3,marginLeft:"auto"}}>{r.date}</span>
                          {r.flagged&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:100,background:`${C.amber}15`,color:C.amber,fontWeight:500,border:`1px solid ${C.amber}30`}}>pain signal</span>}
                        </div>
                        <div style={{fontSize:13,color:C.t1,lineHeight:1.65}}>"{r.text}"</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── SCRIPT ── */}
                {tab==="script"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:640}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontSize:11,color:C.t3,marginRight:2}}>Variant</span>
                      {variants.map(v=>{
                        const s=curScripts[v];
                        return (
                          <button key={v} onClick={()=>setVariant(v)} style={{padding:"5px 14px",borderRadius:100,border:`1px solid ${variant===v?C.t1:C.border}`,background:variant===v?C.t1:"transparent",color:variant===v?C.bg:C.t2,fontSize:11,fontWeight:500,transition:"all 0.15s"}}>
                            {v.toUpperCase()} — {s.name}
                          </button>
                        );
                      })}
                      <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:5,fontSize:11,color:C.green}}>
                        <div style={{width:5,height:5,borderRadius:"50%",background:C.green}}/>
                        A leading
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                      <span style={{fontSize:10,color:C.t3}}>Angle</span>
                      <span style={{fontSize:11,padding:"3px 12px",borderRadius:100,border:`1px solid ${C.border}`,color:C.t2}}>{curScript?.tag}</span>
                    </div>
                    <div style={{display:"flex",flexDirection:"column"}}>
                      {curScript?.lines.map((line,i)=>(
                        <div key={i} style={{paddingBottom:18,marginBottom:i<curScript.lines.length-1?18:0,borderBottom:i<curScript.lines.length-1?`1px solid ${C.border}`:"none"}}>
                          <div style={{fontSize:10,color:lineColor[line.type],fontWeight:500,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.03em"}}>{line.type}</div>
                          <div style={{fontSize:14,color:C.t1,lineHeight:1.75,fontStyle:line.type==="opener"?"italic":"normal"}}>{rv(line.text,active)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── OBJECTIONS ── */}
                {tab==="objections"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:8,maxWidth:600}}>
                    <div style={{fontSize:11,color:C.t3,marginBottom:4}}>Tap to expand</div>
                    {curObjs.map((obj,i)=>(
                      <div key={i} style={{borderRadius:12,overflow:"hidden",border:`1px solid ${openObj===i?C.borderMd:C.border}`,transition:"border-color 0.15s"}}>
                        <div onClick={()=>setOpenObj(openObj===i?null:i)} style={{padding:"12px 16px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",background:openObj===i?C.surface:C.bg}}>
                          <div style={{width:5,height:5,borderRadius:"50%",background:openObj===i?C.t1:C.t3,flexShrink:0,transition:"background 0.15s"}}/>
                          <span style={{fontSize:13,color:C.t1,flex:1}}>"{obj.q}"</span>
                          <span style={{fontSize:10,color:C.t3}}>{openObj===i?"▲":"▼"}</span>
                        </div>
                        {openObj===i&&(
                          <div style={{padding:"0 16px 14px 33px",borderTop:`1px solid ${C.border}`}}>
                            <div style={{fontSize:10,color:C.t3,margin:"10px 0 7px",textTransform:"uppercase",letterSpacing:"0.03em",fontWeight:500}}>Response</div>
                            <div style={{fontSize:13,color:C.t1,lineHeight:1.72}}>{obj.a}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ):(
            <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:C.t3,fontSize:13}}>Select a lead</div>
          )}
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{width:210,borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{padding:"12px 10px 0",display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {[{l:"Dials",v:stats.dials,c:C.t1},{l:"Answered",v:totalAns,c:C.accent},{l:"Demos",v:stats.demos,c:C.green},{l:"Voicemail",v:stats.vm,c:C.amber},{l:"Connect%",v:stats.dials>0?connectRate+"%":"—",c:C.accent},{l:"Demo rate",v:totalAns>0?demoRate+"%":"—",c:C.green}].map(({l,v,c})=>(
              <div key={l} style={{background:C.surface,borderRadius:8,padding:"9px 10px",textAlign:"center"}}>
                <div style={{fontSize:18,fontWeight:400,color:c,lineHeight:1,fontFamily:FM}}>{v}</div>
                <div style={{fontSize:9,color:C.t3,marginTop:3}}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{margin:"10px 10px 0",background:C.surface,borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
            <div style={{fontSize:9,color:C.t3,marginBottom:3}}>Pipeline value</div>
            <div style={{fontSize:17,fontWeight:400,color:C.green,fontFamily:FM}}>${pipeline.toLocaleString()}</div>
            <div style={{fontSize:9,color:C.t3,marginTop:2}}>@ $649 avg MRR</div>
          </div>
          <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",marginTop:10}}>
            <div style={{padding:"0 14px 8px",fontSize:10,color:C.t3,borderBottom:`1px solid ${C.border}`}}>Session log</div>
            <div style={{flex:1,overflowY:"auto"}}>
              {log.length===0?(
                <div style={{padding:16,textAlign:"center",fontSize:11,color:C.t3}}>No calls yet</div>
              ):log.map((e,i)=>(
                <div key={i} style={{padding:"7px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:10,color:C.t3,minWidth:16,fontFamily:FM}}>{e.num}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,color:C.t1,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.biz.split(" ").slice(0,2).join(" ")}</div>
                    <div style={{fontSize:10,color:C.t3,display:"flex",gap:4,marginTop:1}}>
                      <span style={{fontFamily:FM}}>{fmt(e.dur)}</span><span>·</span><span>S:{e.script.toUpperCase()}</span>
                    </div>
                  </div>
                  <div style={{fontSize:10,fontWeight:500,color:OUTCOMES[e.outcome]?.color}}>{OUTCOMES[e.outcome]?.short}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
