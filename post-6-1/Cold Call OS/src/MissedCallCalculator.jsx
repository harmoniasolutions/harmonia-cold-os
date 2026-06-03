import { useState, useRef, useEffect, useCallback } from 'react';

const C = {
  bg:"#FFFFFF", surface:"#F5F5F7", border:"#E5E5EA",
  t1:"#1D1D1F", t2:"#6E6E73", t3:"#AEAEB2",
  accent:"#0071E3", green:"#34C759", red:"#FF3B30",
};
const F = "-apple-system, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', sans-serif";

function useAnimatedNumber(target, duration = 350) {
  const [display, setDisplay] = useState(target);
  const raf = useRef(null);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current, to = target;
    if (from === to) return;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      setDisplay(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else prev.current = to;
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return display;
}

const PRESETS = [
  { label: "Hair Salon",  missed: 15, value: 75, rate: 40 },
  { label: "Barbershop",  missed: 20, value: 35, rate: 50 },
  { label: "Nail Salon",  missed: 12, value: 45, rate: 45 },
];

const HARMONIA_PRICE = 297;

const CSS = `
.hmc-s{-webkit-appearance:none;appearance:none;width:100%;height:3px;border-radius:2px;outline:none;cursor:pointer;background:linear-gradient(to right,var(--f) var(--p),${C.border} var(--p))}
.hmc-s::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 .5px 2px rgba(0,0,0,.2),0 0 0 .5px rgba(0,0,0,.04);cursor:grab;transition:transform .15s}
.hmc-s::-webkit-slider-thumb:hover{transform:scale(1.15)}
.hmc-s::-webkit-slider-thumb:active{cursor:grabbing;transform:scale(1.1)}
.hmc-s::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 .5px 2px rgba(0,0,0,.2);border:none;cursor:grab}
.hmc-s::-moz-range-track{height:3px;border-radius:2px;background:${C.border}}
.hmc-s::-moz-range-progress{height:3px;border-radius:2px;background:var(--f)}
.hmc-n{width:52px;text-align:center;border:none;border-bottom:1px solid ${C.border};padding:2px 0;font-size:13px;font-weight:500;background:transparent;color:${C.t1};outline:none;font-family:${F}}
.hmc-n:focus{border-color:${C.accent}}
@keyframes hmc-p{0%{transform:scale(1)}50%{transform:scale(1.02)}100%{transform:scale(1)}}
.hmc-p{animation:hmc-p .3s ease}
@media(max-width:480px){.hmc-h{font-size:36px!important}.hmc-y{font-size:20px!important}}
`;

function fmt(n) { return n.toLocaleString("en-US"); }

function Slider({ label, note, value, onChange, min, max, step, prefix, suffix, color }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: C.t2, letterSpacing: ".01em" }}>{label}</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          {prefix && <span style={{ fontSize: 11, color: C.t3 }}>{prefix}</span>}
          <input type="number" className="hmc-n" min={min} max={max} step={step} value={value}
            onChange={e => { let v = Number(e.target.value); if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v))); }} />
          {suffix && <span style={{ fontSize: 11, color: C.t3 }}>{suffix}</span>}
        </div>
      </div>
      <input type="range" className="hmc-s" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ "--f": color, "--p": pct + "%" }} />
      {note && <div style={{ fontSize: 10, color: C.t3, marginTop: 3 }}>{note}</div>}
    </div>
  );
}

export default function MissedCallCalculator({ embedded } = {}) {
  const [missed, setMissed] = useState(15);
  const [avgValue, setAvgValue] = useState(65);
  const [convRate, setConvRate] = useState(40);
  const [period, setPeriod] = useState("week");
  const [shareMsg, setShareMsg] = useState(null);
  const lastK = useRef(0);
  const heroRef = useRef(null);

  const missedMonthly = period === "week" ? Math.round(missed * 4.33) : missed;
  const missedWeekly = period === "month" ? Math.round(missed / 4.33) : missed;
  const lostMonthly = Math.round(missedMonthly * avgValue * (convRate / 100));
  const lostYearly = lostMonthly * 12;
  const roi = lostMonthly > 0 ? lostMonthly / HARMONIA_PRICE : 0;

  const animMonthly = useAnimatedNumber(lostMonthly);
  const animYearly = useAnimatedNumber(lostYearly);
  const animRoi = useAnimatedNumber(Math.round(roi * 10));

  useEffect(() => {
    const k = Math.floor(lostMonthly / 1000);
    if (k !== lastK.current && lastK.current !== 0) {
      const el = heroRef.current;
      if (el) { el.classList.remove("hmc-p"); void el.offsetWidth; el.classList.add("hmc-p"); }
    }
    lastK.current = k;
  }, [lostMonthly]);

  const applyPreset = useCallback((p) => {
    setMissed(p.missed); setAvgValue(p.value); setConvRate(p.rate); setPeriod("week");
  }, []);

  const reset = useCallback(() => {
    setMissed(15); setAvgValue(65); setConvRate(40); setPeriod("week");
  }, []);

  const share = useCallback(() => {
    const text = `You're losing approximately $${fmt(lostMonthly)}/month ($${fmt(lostYearly)}/year) from missed calls. At $${HARMONIA_PRICE}/month, Harmonia pays for itself ${roi.toFixed(1)}x over.`;
    navigator.clipboard.writeText(text).then(() => {
      setShareMsg("Copied"); setTimeout(() => setShareMsg(null), 1500);
    }).catch(() => {
      setShareMsg("Failed"); setTimeout(() => setShareMsg(null), 1500);
    });
  }, [lostMonthly, lostYearly, roi]);

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
      padding: embedded ? "4px 0" : "40px 16px", fontFamily: F,
      background: embedded ? "transparent" : C.surface, minHeight: embedded ? "auto" : "100vh" }}>
      <style>{CSS}</style>

      {!embedded && (
        <div style={{ textAlign:"center", marginBottom: 20 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: C.t1, letterSpacing: "-.02em" }}>
            Missed Call Revenue Calculator
          </div>
          <div style={{ fontSize: 12, color: C.t3, marginTop: 4, fontWeight: 400 }}>
            See what unanswered calls are costing you
          </div>
        </div>
      )}

      {/* Presets */}
      <div style={{ display:"flex", gap: 6, marginBottom: 12 }}>
        {PRESETS.map(p => (
          <button key={p.label} onClick={() => applyPreset(p)}
            style={{ padding:"4px 12px", borderRadius: 14, border:`1px solid ${C.border}`,
              background:"transparent", color: C.t3, fontSize: 10, cursor:"pointer", fontFamily: F,
              fontWeight: 500, transition:"all .2s", letterSpacing:".01em" }}
            onMouseEnter={e => { e.target.style.borderColor = C.t2; e.target.style.color = C.t1; }}
            onMouseLeave={e => { e.target.style.borderColor = C.border; e.target.style.color = C.t3; }}>
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ background: C.bg, borderRadius: 14, border:`1px solid ${C.border}`,
        padding: embedded ? 18 : 24, maxWidth: 420, width:"100%", fontFamily: F,
        boxShadow:"0 1px 3px rgba(0,0,0,.04)" }}>

        {/* Missed calls */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: C.t2 }}>
              Missed calls per {period}
            </span>
            <div style={{ display:"flex", alignItems:"baseline", gap: 6 }}>
              <input type="number" className="hmc-n" min={0} max={period==="week"?100:433} value={missed}
                onChange={e => { let v = Number(e.target.value); if (!isNaN(v)) setMissed(Math.max(0, v)); }} />
              <button onClick={() => {
                if (period==="week") { setMissed(Math.round(missed*4.33)); setPeriod("month"); }
                else { setMissed(Math.round(missed/4.33)); setPeriod("week"); }
              }}
                style={{ fontSize: 9, color: C.t3, background:"none", border:"none", cursor:"pointer",
                  fontFamily: F, padding: 0, textDecoration:"underline", textUnderlineOffset: 2 }}>
                {period==="week"?"monthly":"weekly"}
              </button>
            </div>
          </div>
          <input type="range" className="hmc-s" min={0} max={period==="week"?100:433} value={missed}
            onChange={e => setMissed(Number(e.target.value))}
            style={{ "--f":"#EF4444", "--p":((missed/(period==="week"?100:433))*100)+"%" }} />
          <div style={{ fontSize: 9, color: C.t3, marginTop: 2 }}>
            {period==="week"?`~${missedMonthly}/month`:`~${missedWeekly}/week`}
          </div>
        </div>

        <Slider label="Average service value" prefix="$" value={avgValue} onChange={setAvgValue}
          min={0} max={500} step={5} color={C.t2} />

        <Slider label="Booking rate if answered" suffix="%" value={convRate} onChange={setConvRate}
          min={0} max={100} step={5} color={C.t2} />

        {/* Results */}
        <div style={{ background: C.surface, borderRadius: 10, padding:"18px 16px", textAlign:"center", marginTop: 4 }}>
          <div style={{ fontSize: 9, fontWeight: 500, color: C.t3, textTransform:"uppercase",
            letterSpacing:".08em", marginBottom: 6 }}>
            Revenue lost per month
          </div>
          <div ref={heroRef} className="hmc-h"
            style={{ fontSize: 42, fontWeight: 700, color: C.red, lineHeight: 1,
              letterSpacing:"-.03em", fontFamily: F }}>
            ${fmt(animMonthly)}
          </div>
          <div className="hmc-y"
            style={{ fontSize: 22, fontWeight: 600, color: C.red+"99", marginTop: 4,
              letterSpacing:"-.02em", fontFamily: F }}>
            ${fmt(animYearly)}
            <span style={{ fontSize: 11, fontWeight: 400, color: C.t3, marginLeft: 3 }}>/year</span>
          </div>

          <div style={{ marginTop: 14, paddingTop: 12, borderTop:`1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.t3 }}>
              Harmonia catches those calls for <span style={{ fontWeight: 600, color: C.t2 }}>${HARMONIA_PRICE}/mo</span>
            </div>
            {lostMonthly > HARMONIA_PRICE ? (
              <div style={{ fontSize: 16, fontWeight: 600, color: C.green, marginTop: 4, letterSpacing:"-.02em" }}>
                {(animRoi / 10).toFixed(1)}x return
              </div>
            ) : (
              <div style={{ fontSize: 11, color: C.green, fontWeight: 500, marginTop: 4 }}>
                Even a few recovered calls pays for itself
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop: 12 }}>
          <button onClick={reset}
            style={{ background:"none", border:"none", color: C.t3, fontSize: 10, cursor:"pointer",
              fontFamily: F, padding: 0 }}>
            Reset
          </button>
          <button onClick={share}
            style={{ padding:"5px 14px", borderRadius: 6, border:`1px solid ${C.border}`,
              background:"transparent", color: C.t2, fontSize: 10, fontWeight: 500,
              cursor:"pointer", fontFamily: F, transition:"all .15s" }}
            onMouseEnter={e => { e.target.style.borderColor = C.t2; e.target.style.color = C.t1; }}
            onMouseLeave={e => { e.target.style.borderColor = C.border; e.target.style.color = C.t2; }}>
            {shareMsg || "Copy report"}
          </button>
        </div>
      </div>
    </div>
  );
}
