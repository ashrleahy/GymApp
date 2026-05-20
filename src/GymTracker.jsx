import { useState, useEffect, useRef, useCallback } from "react";

// ─── Exercise database ────────────────────────────────────────────────────────
const PROGRAMS = {
  push: {
    label: "Heavy Push", color: "#4f9cf9",
    groups: [
      { name: "Chest", pick: 2,
        gym:  ["Incline Bench – Bar","Incline Bench – Dumbbells","Bench – Bar","Bench – Dumbbells","Cable Fly","Machine Bench","Push Ups"],
        home: ["Incline Bench – Bar","Incline Bench – Dumbbells","Bench – Bar","Bench – Dumbbells","Push Ups"] },
      { name: "Shoulders", pick: 2,
        gym:  ["Overhead Press – Bar","Overhead Press – Dumbbells","Overhead Press – Machine","Lateral Raises – Cable","Lateral Raises – Dumbbells"],
        home: ["Overhead Press – Bar","Overhead Press – Dumbbells","Lateral Raises – Dumbbells"] },
      { name: "Tris", pick: 2,
        gym:  ["Dips","Cable Push Downs","Overhead Extensions"],
        home: ["Dips","Overhead Extensions"] },
    ],
  },
  pull: {
    label: "Heavy Pull", color: "#f9a24f",
    groups: [
      { name: "Vertical Pull", pick: 2,
        gym:  ["Pull Ups","Chin Ups","Lat Pulldown"],
        home: ["Pull Ups","Chin Ups"] },
      { name: "Horizontal Row", pick: 1,
        gym:  ["Barbell Row","Machine Row"],
        home: ["Barbell Row"] },
      { name: "Biceps", pick: 2,
        gym:  ["Dumbbell Biceps","Barbell Biceps","Machine Biceps"],
        home: ["Dumbbell Biceps","Barbell Biceps"] },
    ],
  },
  legs: {
    label: "Legs", color: "#4fc98a",
    groups: [
      { name: "Quad / Compound", pick: 2,
        gym:  ["Squats","Leg Press Machine","Leg Extension","Plyo Jumps","Leg Press Plyo"],
        home: ["Squats","Plyo Jumps","Walking Lunges"] },
      { name: "Posterior", pick: 2,
        gym:  ["Deadlifts","Seated Hamstring Curls"],
        home: ["Deadlifts","Walking Lunges"] },
      { name: "Calves", pick: 1,
        gym:  ["Standing Calf Raise","Seated Calf Raise"],
        home: ["Standing Calf Raise"] },
    ],
  },
  upper: {
    label: "Upper", color: "#c084fc",
    groups: [
      { name: "Chest",     pick: 1, gym: ["Incline Bench – Bar","Incline Bench – Dumbbells","Bench – Bar","Bench – Dumbbells","Machine Bench","Push Ups"], home: ["Incline Bench – Bar","Incline Bench – Dumbbells","Bench – Bar","Bench – Dumbbells","Push Ups"] },
      { name: "Shoulders", pick: 1, gym: ["Overhead Press – Bar","Overhead Press – Dumbbells","Overhead Press – Machine","Lateral Raises – Dumbbells"], home: ["Overhead Press – Bar","Overhead Press – Dumbbells","Lateral Raises – Dumbbells"] },
      { name: "Tris",      pick: 1, gym: ["Dips","Cable Push Downs","Overhead Extensions"], home: ["Dips","Overhead Extensions"] },
      { name: "Back",      pick: 1, gym: ["Pull Ups","Chin Ups","Lat Pulldown","Barbell Row"], home: ["Pull Ups","Chin Ups","Barbell Row"] },
      { name: "Biceps",    pick: 1, gym: ["Dumbbell Biceps","Barbell Biceps"], home: ["Dumbbell Biceps","Barbell Biceps"] },
    ],
  },
};

const MACHINES = new Set(["Cable Fly","Machine Bench","Overhead Press – Machine","Lateral Raises – Cable","Cable Push Downs","Lat Pulldown","Machine Row","Machine Biceps","Leg Press Machine","Leg Extension","Seated Hamstring Curls","Seated Calf Raise","Leg Press Plyo"]);
const isMachine = ex => MACHINES.has(ex);

// ─── Storage ──────────────────────────────────────────────────────────────────
const SCHEMA_VERSION = 2;

function migrateSession(session) {
  const exercises = (session.exercises || []).map(ex => {
    const sets = (ex.sets || []).map(s => ({ kg: s.kg ?? "", reps: s.reps ?? "", done: s.done ?? false }));
    return { name: ex.name, group: ex.group, sets, rpe: ex.rpe ?? (ex.sets?.[0]?.rpe ?? ""), notes: ex.notes ?? (ex.sets?.[0]?.notes ?? ""), suggestion: null, suggLoading: false };
  });
  return { ...session, exercises };
}

function loadLocalHistory() {
  try { const raw = localStorage.getItem('gymtracker_sessions'); return raw ? JSON.parse(raw).map(migrateSession) : []; }
  catch { return []; }
}

async function loadHistory() {
  try {
    const res = await fetch('/api/sessions');
    if (!res.ok) return loadLocalHistory();
    const { sessions } = await res.json();
    return (sessions || []).map(migrateSession);
  } catch { return loadLocalHistory(); }
}

async function saveHistory(sessions) {
  try { localStorage.setItem('gymtracker_sessions', JSON.stringify(sessions)); } catch {}
  try {
    await fetch('/api/sessions', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ sessions }) });
  } catch (err) { console.error('KV save failed:', err); }
}

async function saveSession(session, allSessions) {
  const filtered = allSessions.filter(s => !(s.date===session.date && s.type===session.type));
  filtered.push(session);
  filtered.sort((a,b) => a.date.localeCompare(b.date));
  await saveHistory(filtered);
  return filtered;
}

// ─── Derived helpers ──────────────────────────────────────────────────────────
// Flatten sessions into set rows for AI / history lookups
function flattenHistory(sessions) {
  const rows = [];
  sessions.forEach(s => {
    s.exercises.forEach(ex => {
      ex.sets.forEach((set, i) => {
        if (set.kg || set.reps) {
          rows.push({
            date: s.date, session: s.type, location: s.location,
            exercise: ex.name, group: ex.group, set: i+1,
            kg: set.kg, reps: set.reps, rpe: ex.rpe, notes: ex.notes,
            is_machine: isMachine(ex.name),
          });
        }
      });
    });
  });
  return rows;
}

// ─── Week helpers (starts Saturday) ──────────────────────────────────────────
function getWeekBounds() {
  const now = new Date();
  const day = now.getDay();
  const diffToSat = (day + 1) % 7;
  const sat = new Date(now);
  sat.setDate(now.getDate() - diffToSat);
  sat.setHours(0,0,0,0);
  const fri = new Date(sat);
  fri.setDate(sat.getDate() + 6);
  fri.setHours(23,59,59,999);
  return { start: sat, end: fri };
}

function getWeekSessions(sessions) {
  const { start, end } = getWeekBounds();
  const done = {};
  sessions.forEach(s => {
    const d = new Date(s.date + "T00:00:00");
    if (d >= start && d <= end) done[s.type] = s.date;
  });
  return done;
}

// ─── Claude API — server-side proxy ──────────────────────────────────────────
async function callClaude(user, system, maxTokens=400) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages:[{role:'user',content:user}], system, maxTokens }),
  });
  const d = await res.json();
  return d.text || '';
}

async function getWeightSuggestion(exercise, rows) {
  if (isMachine(exercise)) return null;
  const relevant = rows.filter(r => r.exercise===exercise && !r.is_machine && r.kg).slice(-20);
  if (!relevant.length) return null;
  const hist = relevant.map(r=>`${r.date}: ${r.kg}kg × ${r.reps} reps, RPE ${r.rpe||"?"}`).join("\n");
  try {
    const raw = await callClaude(
      `Exercise: ${exercise}\nHistory:\n${hist}\nSuggest today's weight for 2 sets of 5-8 reps.`,
      `You are a strength coach. Respond ONLY with valid JSON, no markdown: {"kg": number, "reps": "5-8", "rationale": "one sentence max 12 words"}`
    );
    return JSON.parse(raw.replace(/```json|```/g,"").trim());
  } catch { return null; }
}

async function getProgramNudge(rows) {
  if (rows.length < 5) return null;
  const freeRows = rows.filter(r=>!r.is_machine&&r.kg).slice(-80);
  const summary = freeRows.map(r=>`${r.date} [${r.session}] ${r.exercise}: ${r.kg}kg×${r.reps} RPE${r.rpe||"?"}`).join("\n");
  return callClaude(
    `Training log:\n${summary}`,
    `You are a strength coach. Give 3 short specific observations about progress, recovery, or balance. Plain text, no bullets, 4 sentences max.`,
    500
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#0f1117;--s1:#181c27;--s2:#1e2336;--s3:#252b3d;
  --border:rgba(255,255,255,0.06);--border-md:rgba(255,255,255,0.11);--border-hi:rgba(255,255,255,0.22);
  --text:#e8eaf0;--t2:#7b82a0;--t3:#3d4460;
  --blue:#4f9cf9;--orange:#f9a24f;--green:#4fc98a;--purple:#c084fc;--red:#f96b6b;--amber:#f9d44f;
  --r:12px;--rs:8px;
}
html,body{height:100%;background:var(--bg);}
body{font-family:'Inter',sans-serif;color:var(--text);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow-x:hidden;}
.app{max-width:480px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column;}
.nav{display:flex;background:var(--s1);border-top:1px solid var(--border-md);position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;z-index:100;padding-bottom:env(safe-area-inset-bottom);}
.ntab{flex:1;padding:12px 6px 10px;font-size:9px;font-weight:600;text-align:center;cursor:pointer;border:none;background:none;color:var(--t3);letter-spacing:.08em;text-transform:uppercase;border-top:2px solid transparent;transition:all .15s;}
.ntab i{display:block;font-size:22px;margin-bottom:2px;}
.ntab.active{color:var(--text);border-top-color:var(--text);}
.view{padding:16px 14px 90px;flex:1;}
.hbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;}
.hbar-title{font-size:18px;font-weight:600;letter-spacing:-.3px;}
.slabel{font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--t2);margin:18px 0 8px;}
.slabel:first-child{margin-top:0;}
.card{background:var(--s1);border:1px solid var(--border);border-radius:var(--r);padding:14px 15px;margin-bottom:8px;}
.card-row{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.card-title{font-size:14px;font-weight:500;}
.card-sub{font-size:12px;color:var(--t2);margin-top:2px;}
.badge{display:inline-block;font-size:10px;font-weight:600;padding:2px 8px;border-radius:99px;letter-spacing:.02em;}
.b-blue{background:rgba(79,156,249,.15);color:#4f9cf9;}
.b-green{background:rgba(79,201,138,.15);color:#4fc98a;}
.b-gray{background:rgba(255,255,255,.07);color:var(--t2);}
.b-purple{background:rgba(192,132,252,.15);color:#c084fc;}
.b-orange{background:rgba(249,162,79,.15);color:#f9a24f;}
.week-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px;}
.wcard{border-radius:var(--r);padding:13px 13px 12px;border:1px solid var(--border);cursor:pointer;transition:all .2s;position:relative;overflow:hidden;min-height:80px;background:var(--s1);}
.wcard.done{border-color:transparent;}
.wc-tag{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;gap:4px;}
.wc-name{font-size:13px;font-weight:600;line-height:1.3;}
.wc-date{font-size:10px;color:var(--t2);margin-top:5px;font-weight:500;}
.wc-icon{position:absolute;bottom:9px;right:11px;font-size:18px;opacity:.25;}
.week-meta{font-size:11px;color:var(--t2);margin-bottom:18px;font-weight:500;}
.week-meta strong{color:var(--text);}
.loctog{display:inline-flex;background:var(--s2);border-radius:var(--rs);padding:3px;gap:2px;}
.locbtn{padding:6px 14px;font-size:11px;font-weight:600;border:none;background:none;cursor:pointer;color:var(--t2);border-radius:6px;transition:all .15s;letter-spacing:.03em;}
.locbtn.active{background:var(--s3);color:var(--text);}
.pick-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;}
.pbtn{padding:11px 10px;font-size:12px;font-weight:500;border:1px solid var(--border);border-radius:var(--rs);background:var(--s1);cursor:pointer;text-align:left;color:var(--t2);transition:all .15s;line-height:1.35;}
.pbtn:hover{border-color:var(--border-md);color:var(--text);}
.pbtn.sel{border-color:var(--text);background:var(--s3);color:var(--text);}
.pbtn.mach{border-style:dashed;}
.pick-count{font-size:11px;font-weight:600;margin-left:6px;}
.sh{display:grid;grid-template-columns:22px 1fr 1fr 1fr 28px;gap:6px;margin-bottom:5px;padding:0 2px;}
.sh span{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--t3);text-align:center;}
.sr{display:grid;grid-template-columns:22px 1fr 1fr 1fr 28px;gap:6px;align-items:center;margin-bottom:8px;}
.snum{font-size:11px;font-weight:600;color:var(--t3);text-align:center;}
.sinput{width:100%;padding:10px 4px;font-size:16px;font-family:'Inter',sans-serif;font-weight:500;text-align:center;border:1px solid var(--border);border-radius:var(--rs);background:var(--s2);color:var(--text);transition:all .15s;}
.sinput:focus{outline:none;border-color:var(--border-hi);background:var(--s3);}
.sinput.done{background:rgba(79,201,138,.1);border-color:rgba(79,201,138,.3);color:#4fc98a;}
.set-done-row{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;background:rgba(79,201,138,.08);border:1px solid rgba(79,201,138,.2);border-radius:var(--rs);margin-bottom:8px;font-size:12px;font-weight:600;color:#4fc98a;}
.ai-box{background:rgba(79,201,138,.07);border:1px solid rgba(79,201,138,.18);border-radius:var(--rs);padding:11px 13px;margin-bottom:12px;font-size:12px;color:#a8f0cc;line-height:1.5;}
.ai-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--green);margin-bottom:5px;display:flex;align-items:center;gap:4px;}
.ai-nudge{background:rgba(192,132,252,.07);border:1px solid rgba(192,132,252,.18);border-radius:var(--r);padding:14px;font-size:13px;color:#e2c8ff;line-height:1.65;margin-bottom:8px;}
.ai-nudge .ai-label{color:var(--purple);}
.timer-wrap{text-align:right;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;}
.timer-val{font-size:32px;font-weight:300;letter-spacing:-1px;line-height:1;font-variant-numeric:tabular-nums;}
.timer-sub{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--t3);margin-top:2px;}
.hist-pill{background:var(--s2);border-radius:var(--rs);padding:8px 11px;font-size:11px;font-weight:500;color:var(--t2);margin-bottom:5px;display:flex;justify-content:space-between;align-items:center;}
.hist-pill span:last-child{color:var(--text);}
.pr-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);}
.pr-row:last-child{border-bottom:none;}
.pr-name{font-size:13px;font-weight:500;flex:1;}
.pr-sub{font-size:11px;color:var(--t2);font-weight:400;}
.pr-val{font-size:13px;font-weight:600;color:var(--green);}
.pbar-wrap{margin-bottom:12px;}
.pbar-top{display:flex;justify-content:space-between;font-size:12px;font-weight:500;margin-bottom:6px;}
.pbar-bg{height:4px;background:var(--s2);border-radius:99px;overflow:hidden;}
.pbar-fill{height:100%;border-radius:99px;background:var(--text);transition:width .5s ease;}
.stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;}
.scard{background:var(--s1);border:1px solid var(--border);border-radius:var(--r);padding:13px 14px;}
.sc-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--t2);margin-bottom:5px;}
.sc-val{font-size:26px;font-weight:300;color:var(--text);letter-spacing:-.5px;}
.sc-unit{font-size:12px;color:var(--t2);font-weight:400;}
.btn-p{width:100%;padding:14px;border-radius:var(--rs);background:var(--text);color:var(--bg);border:none;cursor:pointer;font-size:13px;font-weight:600;margin-top:10px;transition:opacity .15s;font-family:'Inter',sans-serif;letter-spacing:.01em;}
.btn-p:hover{opacity:.88;}
.btn-p:active{opacity:.75;}
.btn-p:disabled{opacity:.3;cursor:not-allowed;}
.btn-g{width:100%;padding:12px;border:1px dashed var(--border-md);border-radius:var(--rs);background:none;cursor:pointer;font-size:12px;font-weight:500;color:var(--t2);margin-top:6px;transition:all .15s;font-family:'Inter',sans-serif;}
.btn-g:hover{background:var(--s1);color:var(--text);}
.btn-g:disabled{opacity:.35;cursor:not-allowed;}
.npair{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;}
.npair button{padding:12px;border:1px solid var(--border);border-radius:var(--rs);background:var(--s1);cursor:pointer;font-size:12px;font-weight:500;color:var(--t2);font-family:'Inter',sans-serif;transition:all .15s;}
.npair button:hover{border-color:var(--border-md);color:var(--text);}
.npair button:disabled{opacity:.3;cursor:not-allowed;}
.step-bar{display:flex;gap:4px;margin-bottom:16px;}
.step-pip{flex:1;height:3px;border-radius:99px;background:var(--s3);transition:background .2s;}
.step-pip.done{background:var(--text);}
.sdot{width:9px;height:9px;border-radius:50%;display:inline-block;flex-shrink:0;}
.irow{display:flex;align-items:center;justify-content:space-between;}
textarea{width:100%;padding:10px 12px;font-size:13px;border:1px solid var(--border);border-radius:var(--rs);background:var(--s2);color:var(--text);resize:none;height:54px;font-family:'Inter',sans-serif;transition:border-color .15s;line-height:1.4;}
textarea:focus{outline:none;border-color:var(--border-hi);}
textarea::placeholder{color:var(--t3);}
.spin{display:inline-block;width:13px;height:13px;border:2px solid var(--border-md);border-top-color:var(--text);border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;}
@keyframes spin{to{transform:rotate(360deg);}}
.empty{text-align:center;padding:52px 0;color:var(--t3);font-size:12px;font-weight:500;line-height:2;}
input[type=number]{-moz-appearance:textfield;}
input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
`;

// ─── App root ─────────────────────────────────────────────────────────────────
export default function GymTracker() {
  const [tab, setTab]           = useState("plan");
  const [sessions, setSessions] = useState(loadLocalHistory); // start with local immediately
  const [session, setSession]   = useState(null);
  const [nudge, setNudge]       = useState(null);
  const [nudgeLoading, setNudgeLoading] = useState(false);

  // Load from KV on mount, merge with local
  useEffect(()=>{
    loadHistory().then(kvSessions => {
      if(kvSessions.length > 0) setSessions(kvSessions);
    });
  },[]);

  const flatRows = flattenHistory(sessions);

  const prs = {};
  flatRows.filter(r => !r.is_machine && r.kg && r.reps).forEach(r => {
    const kg=parseFloat(r.kg), reps=parseInt(r.reps);
    if (!isNaN(kg)&&!isNaN(reps)) {
      const c=prs[r.exercise];
      if (!c||kg>c.kg||(kg===c.kg&&reps>c.reps)) prs[r.exercise]={kg,reps,date:r.date};
    }
  });

  const weekDone = getWeekSessions(sessions);
  const thisWeek = Object.keys(weekDone).length;
  const rpes = flatRows.map(r=>parseFloat(r.rpe)).filter(v=>!isNaN(v));
  const avgRpe = rpes.length ? (rpes.reduce((a,b)=>a+b,0)/rpes.length).toFixed(1) : "—";

  function startSession(type, location) {
    const prog = PROGRAMS[type];
    const exercises = [];
    prog.groups.forEach(g => {
      const list = location==="gym" ? g.gym : g.home;
      list.slice(0,g.pick).forEach(name => {
        exercises.push({ name, group:g.name, sets:[{kg:"",reps:"",done:false},{kg:"",reps:"",done:false}], rpe:"", notes:"", suggestion:null, suggLoading:false });
      });
    });
    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    setSession({ type, location, date:localDate, exercises, step:"pick", exIdx:0 });
    setTab("log");
  }

  async function finishSession(completedSession) {
    const updated = await saveSession(completedSession, sessions);
    setSessions(updated);
    setSession(null);
    setTab("plan");
  }

  return (
    <>
      <style>{S}</style>
      <div className="app">
        {tab==="plan"     && <PlanView sessions={sessions} weekDone={weekDone} onStart={startSession}/>}
        {tab==="log"      && <LogView session={session} setSession={setSession} flatRows={flatRows} onFinish={finishSession} onStartNew={()=>setTab("plan")}/>}
        {tab==="progress" && <ProgressView flatRows={flatRows} sessions={sessions} prs={prs} thisWeek={thisWeek} avgRpe={avgRpe} nudge={nudge} nudgeLoading={nudgeLoading} onNudge={async()=>{setNudgeLoading(true);const n=await getProgramNudge(flatRows);setNudge(n);setNudgeLoading(false);}}/>}
        <nav className="nav">
          {[{id:"plan",icon:"ti-calendar",label:"Plan"},{id:"log",icon:"ti-barbell",label:"Log"},{id:"progress",icon:"ti-chart-bar",label:"Progress"}].map(t=>(
            <button key={t.id} className={`ntab ${tab===t.id?"active":""}`} onClick={()=>setTab(t.id)}>
              <i className={`ti ${t.icon}`} aria-hidden="true"/>{t.label}
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}

// ─── Plan View ────────────────────────────────────────────────────────────────
function PlanView({ sessions, weekDone, onStart }) {
  const [loc, setLoc] = useState("gym");
  const sessionsLeft = Object.keys(PROGRAMS).filter(k => !weekDone[k]);
  const done = Object.keys(weekDone).length;
  const { start } = getWeekBounds();
  const weekLabel = start.toLocaleDateString("en-AU", { day:"numeric", month:"short" });

  function lastDate(type) {
    const s = [...sessions].reverse().find(s=>s.type===type);
    return s ? s.date : null;
  }

  return (
    <div className="view">
      <div className="hbar">
        <div>
          <div className="hbar-title">This week</div>
          <div style={{fontSize:11,color:"var(--t2)",fontWeight:500,marginTop:2}}>w/c {weekLabel}</div>
        </div>
        <div className="loctog">
          <button className={`locbtn ${loc==="gym"?"active":""}`} onClick={()=>setLoc("gym")}>
            <i className="ti ti-building" aria-hidden="true" style={{fontSize:12,marginRight:4,verticalAlign:-1}}/>Gym
          </button>
          <button className={`locbtn ${loc==="home"?"active":""}`} onClick={()=>setLoc("home")}>
            <i className="ti ti-home" aria-hidden="true" style={{fontSize:12,marginRight:4,verticalAlign:-1}}/>Home
          </button>
        </div>
      </div>

      <div className="week-grid">
        {Object.entries(PROGRAMS).map(([key,prog])=>{
          const isDone = !!weekDone[key];
          const last = lastDate(key);
          return (
            <div key={key} className={`wcard ${isDone?"done":""}`}
              style={isDone?{background:`color-mix(in srgb, ${prog.color} 10%, var(--s1))`,borderColor:`color-mix(in srgb, ${prog.color} 30%, transparent)`}:{}}
              onClick={()=>onStart(key,loc)}
            >
              <div className="wc-tag" style={{color:prog.color}}>
                <i className={`ti ${isDone?"ti-check":"ti-circle"}`} aria-hidden="true" style={{fontSize:10}}/>
                {isDone?"done":"to do"}
              </div>
              <div className="wc-name">{prog.label}</div>
              {isDone
                ? <div className="wc-date">{weekDone[key]}</div>
                : <div className="wc-date" style={{color:last?"var(--t2)":"var(--t3)"}}>{last?`last: ${last}`:"not logged yet"}</div>
              }
              <i className={`ti ${isDone?"ti-check":"ti-chevron-right"} wc-icon`} aria-hidden="true" style={{color:prog.color}}/>
            </div>
          );
        })}
      </div>

      <div className="week-meta">
        <strong>{done}</strong> of 4 done
        {sessionsLeft.length>0 && <> · {sessionsLeft.map(k=>PROGRAMS[k].label).join(", ")} to go</>}
      </div>

      <p className="slabel">Start a session</p>
      {[...sessionsLeft, ...Object.keys(weekDone)].map(key=>{
        const prog=PROGRAMS[key], isDone=!!weekDone[key], last=lastDate(key);
        return (
          <div key={key} className="card" style={{cursor:"pointer",opacity:isDone?.55:1}} onClick={()=>onStart(key,loc)}>
            <div className="card-row">
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span className="sdot" style={{background:prog.color}}/>
                <div>
                  <div className="card-title">{prog.label}</div>
                  <div className="card-sub">{prog.groups.map(g=>`${g.pick}× ${g.name}`).join(" · ")}</div>
                  {last&&<div className="card-sub" style={{marginTop:1}}>Last: {last}</div>}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                {isDone&&<span className="badge b-green">✓</span>}
                <i className="ti ti-chevron-right" aria-hidden="true" style={{color:"var(--t3)",fontSize:16}}/>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Exercise Picker ──────────────────────────────────────────────────────────
function ExercisePicker({ session, setSession }) {
  const prog = PROGRAMS[session.type];
  const [sel, setSel] = useState(()=>{
    const s={};
    prog.groups.forEach((g,gi)=>{
      const list=session.location==="gym"?g.gym:g.home;
      s[gi]=new Set(list.slice(0,g.pick));
    });
    return s;
  });
  const [date, setDate] = useState(session.date);

  function toggle(gi,name) {
    setSel(prev=>{
      const s=new Set(prev[gi]);
      if(s.has(name)) s.delete(name);
      else s.add(name);
      return {...prev,[gi]:s};
    });
  }

  function confirm() {
    const exercises=[];
    prog.groups.forEach((g,gi)=>{
      [...sel[gi]].forEach(name=>{
        exercises.push({name,group:g.name,sets:[{kg:"",reps:"",done:false},{kg:"",reps:"",done:false}],rpe:"",notes:"",suggestion:null,suggLoading:false});
      });
    });
    setSession(s=>({...s,date,exercises,step:"log",exIdx:0}));
  }

  // valid if each group has at least the minimum pick count
  const allValid=prog.groups.every((g,gi)=>sel[gi].size>=g.pick);

  return (
    <div className="view">
      <div className="hbar">
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
            <span className="sdot" style={{background:PROGRAMS[session.type].color}}/>
            <span style={{fontSize:16,fontWeight:600}}>{PROGRAMS[session.type].label}</span>
          </div>
          <div style={{fontSize:12,color:"var(--t2)",fontWeight:500}}>{session.location==="gym"?"Gym":"Home"}</div>
        </div>
        <span className="badge b-gray">Pick exercises</span>
      </div>

      {/* Date picker */}
      <div style={{marginBottom:16}}>
        <p className="slabel" style={{marginTop:0}}>Session date</p>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)}
          style={{width:"100%",padding:"10px 12px",fontSize:14,border:"1px solid var(--border)",borderRadius:"var(--rs)",background:"var(--s2)",color:"var(--text)",fontFamily:"Inter,sans-serif"}}/>
      </div>

      {prog.groups.map((g,gi)=>{
        const list=session.location==="gym"?g.gym:g.home;
        const picked=sel[gi].size;
        return (
          <div key={gi} style={{marginBottom:16}}>
            <p className="slabel" style={{marginTop:0}}>
              {g.name}
              <span className="pick-count" style={{color:picked>=g.pick?"var(--green)":"var(--t2)"}}>
                {picked} selected {picked>g.pick&&<span style={{color:"var(--orange)"}}>+{picked-g.pick} extra</span>}
              </span>
            </p>
            <div className="pick-grid">
              {list.map(name=>(
                <button key={name} className={`pbtn ${isMachine(name)?"mach":""} ${sel[gi].has(name)?"sel":""}`} onClick={()=>toggle(gi,name)}>
                  {isMachine(name)&&<i className="ti ti-settings" aria-hidden="true" style={{fontSize:10,marginRight:4,opacity:.5}}/>}
                  {name}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <button className="btn-p" disabled={!allValid} onClick={confirm}>Start logging →</button>
    </div>
  );
}

// ─── Log View ─────────────────────────────────────────────────────────────────
function LogView({ session, setSession, flatRows, onFinish, onStartNew }) {
  const [timerSecs, setTimerSecs] = useState(120);
  const [timerOn, setTimerOn]     = useState(false);
  const ref = useRef(null);

  useEffect(()=>{
    if(timerOn){
      ref.current=setInterval(()=>setTimerSecs(s=>{
        if(s<=0){setTimerOn(false);return 0;}
        return s-1;
      }),1000);
    } else clearInterval(ref.current);
    return ()=>clearInterval(ref.current);
  },[timerOn]);

  const idx = session?.exIdx??0;
  const ex  = session?.exercises?.[idx]??null;

  useEffect(()=>{
    if(!ex||isMachine(ex.name)||ex.suggestion||ex.suggLoading) return;
    setSession(s=>({...s,exercises:s.exercises.map((e,i)=>i!==idx?e:{...e,suggLoading:true})}));
    getWeightSuggestion(ex.name,flatRows).then(sugg=>{
      setSession(s=>({...s,exercises:s.exercises.map((e,i)=>i!==idx?e:{...e,suggestion:sugg,suggLoading:false})}));
    });
  },[idx,session?.step]);

  function startTimer(){ setTimerSecs(120); setTimerOn(true); }

  if(!session) return (
    <div className="view" style={{textAlign:"center",paddingTop:80}}>
      <i className="ti ti-barbell" aria-hidden="true" style={{fontSize:52,color:"var(--t3)",display:"block",marginBottom:14}}/>
      <div style={{color:"var(--t2)",marginBottom:24,fontWeight:500}}>No active session</div>
      <button className="btn-p" style={{maxWidth:240,margin:"0 auto"}} onClick={onStartNew}>Start a session</button>
    </div>
  );

  if(session.step==="pick") return <ExercisePicker session={session} setSession={setSession}/>;

  if(session.step==="done") return (
    <div className="view" style={{textAlign:"center",paddingTop:50}}>
      <i className="ti ti-trophy" aria-hidden="true" style={{fontSize:56,color:"var(--green)",display:"block",marginBottom:16}}/>
      <div style={{fontSize:20,fontWeight:600,marginBottom:6}}>Session saved</div>
      <div style={{fontSize:13,color:"var(--t2)",marginBottom:28,fontWeight:500}}>{session.exercises.length} exercises · {session.date}</div>
      <div className="card" style={{textAlign:"left",marginBottom:14}}>
        {session.exercises.map((ex,i)=>{
          const doneSets = ex.sets.filter(s=>s.done||s.kg);
          return (
            <div key={i} className="pr-row">
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:500}}>{ex.name}</div>
                <div style={{fontSize:11,color:"var(--t2)"}}>{ex.group}</div>
              </div>
              <div style={{fontSize:12,fontWeight:600,color:"var(--t2)"}}>
                {doneSets.length} sets · {[...new Set(doneSets.filter(s=>s.kg).map(s=>s.kg))].join("/")||"—"} kg
              </div>
            </div>
          );
        })}
      </div>
      <button className="btn-p" onClick={()=>onFinish(session)} style={{background:"var(--green)",color:"#0f1117",maxWidth:280,margin:"0 auto"}}>
        <i className="ti ti-check" aria-hidden="true" style={{marginRight:6}}/>Save & finish
      </button>
    </div>
  );

  const total=session.exercises.length;
  const mins=Math.floor(timerSecs/60), secs=timerSecs%60;
  const prog=PROGRAMS[session.type];

  function updateSet(si,field,val){
    setSession(s=>({...s,exercises:s.exercises.map((e,ei)=>ei!==idx?e:{...e,sets:e.sets.map((st,sii)=>{
      if(sii!==si) return st;
      const updated={...st,[field]:val};
      if(updated.kg&&updated.reps) updated.done=true;
      return updated;
    })})}));
    if(field==="reps"&&val) startTimer();
  }

  function updateEx(field,val){
    setSession(s=>({...s,exercises:s.exercises.map((e,ei)=>ei!==idx?e:{...e,[field]:val})}));
  }

  const exHistory=flatRows.filter(r=>r.exercise===ex.name&&r.kg).slice(-5).reverse();

  return (
    <div className="view">
      <div className="step-bar">
        {session.exercises.map((_,i)=><div key={i} className={`step-pip ${i<=idx?"done":""}`} style={i===idx?{background:prog.color}:{}}/>)}
      </div>

      <div className="irow" style={{marginBottom:14,alignItems:"flex-start"}}>
        <div style={{flex:1}}>
          <div style={{fontSize:18,fontWeight:600,letterSpacing:"-.3px",lineHeight:1.2}}>{ex.name}</div>
          <div style={{fontSize:12,color:"var(--t2)",fontWeight:500,marginTop:4}}>
            {ex.group} · {idx+1}/{total}
            {isMachine(ex.name)&&<span className="badge b-gray" style={{marginLeft:8}}>machine</span>}
          </div>
        </div>
        <div className="timer-wrap" onClick={()=>timerOn?setTimerOn(false):startTimer()}>
          <div className="timer-val" style={{color:timerSecs<30&&timerOn?"var(--red)":"var(--text)"}}>
            {mins}:{String(secs).padStart(2,"0")}
          </div>
          <div className="timer-sub">{timerOn?"tap to pause":"rest timer"}</div>
        </div>
      </div>

      {!isMachine(ex.name)&&(
        <div className="ai-box">
          <div className="ai-label"><i className="ti ti-sparkles" aria-hidden="true" style={{fontSize:11}}/>AI suggestion</div>
          {ex.suggLoading?<span><span className="spin" style={{marginRight:6}}/>Calculating…</span>
           :ex.suggestion?<span><strong>{ex.suggestion.kg} kg × {ex.suggestion.reps}</strong>{ex.suggestion.rationale?" — "+ex.suggestion.rationale:""}</span>
           :<span style={{color:"rgba(168,240,204,.4)"}}>No history yet — log your starting weight.</span>}
        </div>
      )}

      {exHistory.length>0&&(
        <>
          <p className="slabel">Recent</p>
          {exHistory.map((r,i)=>(
            <div key={i} className="hist-pill">
              <span>{r.date}</span>
              <span>{r.kg}kg × {r.reps}{r.rpe?` · RPE ${r.rpe}`:""}</span>
            </div>
          ))}
          <div style={{marginBottom:14}}/>
        </>
      )}

      <div className="sh"><span/><span>kg</span><span>reps</span><span/></div>
      {ex.sets.map((st,si)=>(
        <div key={si} className="sr" style={{gridTemplateColumns:"22px 1fr 1fr 28px"}}>
          <span className="snum">{si+1}</span>
          <input className={`sinput ${st.done?"done":""}`} type="number" inputMode="decimal" step="2.5" value={st.kg} placeholder="—" onChange={e=>updateSet(si,"kg",e.target.value)}/>
          <input className={`sinput ${st.done?"done":""}`} type="number" inputMode="numeric" min="1" max="20" value={st.reps} placeholder="—" onChange={e=>updateSet(si,"reps",e.target.value)}/>
          <div style={{width:28,display:"flex",alignItems:"center",justifyContent:"center"}}>
            {st.done&&<i className="ti ti-check" aria-hidden="true" style={{fontSize:16,color:"var(--green)"}}/>}
          </div>
        </div>
      ))}

      {/* RPE per exercise */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginTop:12,marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:600,color:"var(--t2)",textTransform:"uppercase",letterSpacing:".06em",whiteSpace:"nowrap"}}>RPE (exercise)</span>
        <div style={{display:"flex",gap:5,flex:1,flexWrap:"wrap"}}>
          {[6,7,8,9,10].map(n=>(
            <button key={n} onClick={()=>updateEx("rpe",String(n))}
              style={{flex:1,minWidth:36,padding:"7px 4px",fontSize:13,fontWeight:600,border:`1px solid ${ex.rpe===String(n)?"var(--text)":"var(--border)"}`,borderRadius:"var(--rs)",background:ex.rpe===String(n)?"var(--text)":"var(--s2)",color:ex.rpe===String(n)?"var(--bg)":"var(--t2)",cursor:"pointer",transition:"all .15s"}}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <div style={{fontSize:10,color:"var(--t3)",marginBottom:10}}>6 = easy · 8 = 2 reps left · 10 = failure</div>

      <textarea placeholder="Notes…" value={ex.notes||""} onChange={e=>updateEx("notes",e.target.value)}/>

      <div className="npair">
        <button disabled={idx===0} onClick={()=>setSession(s=>({...s,exIdx:idx-1}))}>
          {idx>0?"← "+session.exercises[idx-1].name:"←"}
        </button>
        {idx<total-1
          ?<button style={{fontWeight:600,color:"var(--text)"}} onClick={()=>setSession(s=>({...s,exIdx:idx+1}))}>{session.exercises[idx+1].name} →</button>
          :<button style={{fontWeight:600,color:"var(--green)"}} onClick={()=>setSession(s=>({...s,step:"done"}))}>Finish →</button>
        }
      </div>
    </div>
  );
}

// ─── Progress View ────────────────────────────────────────────────────────────
function ProgressView({ flatRows, sessions, prs, thisWeek, avgRpe, nudge, nudgeLoading, onNudge }) {
  const freePRs=Object.entries(prs).filter(([n])=>!isMachine(n)).sort((a,b)=>b[1].date.localeCompare(a[1].date)).slice(0,8);
  const sessionKeys=[...new Set(flatRows.map(r=>r.date+r.session))];
  const recent4=sessionKeys.slice(-4), prev4=sessionKeys.slice(-8,-4);
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);

  async function syncToCloud() {
    setSyncing(true);
    try {
      await saveHistory(sessions);
      setSyncDone(true);
    } catch { } finally { setSyncing(false); }
  }

  function vol(keys,ex){ return flatRows.filter(r=>keys.includes(r.date+r.session)&&r.exercise===ex&&r.kg).reduce((s,r)=>s+(parseFloat(r.kg)*(parseInt(r.reps)||0)),0); }
  const keyLifts=["Bench – Bar","Bench – Dumbbells","Squats","Deadlifts","Overhead Press – Bar","Pull Ups","Barbell Row"];
  const liftsWithData=keyLifts.filter(l=>flatRows.some(r=>r.exercise===l&&r.kg));

  return (
    <div className="view">
      <div className="hbar"><div className="hbar-title">Progress</div></div>

      {/* Sync to cloud */}
      {sessions.length>0 && !syncDone && (
        <button className="btn-g" onClick={syncToCloud} disabled={syncing} style={{marginBottom:4}}>
          {syncing
            ? <><span className="spin" style={{marginRight:6}}/>Syncing to cloud…</>
            : <><i className="ti ti-cloud-upload" aria-hidden="true" style={{marginRight:6}}/>Sync existing sessions to cloud ↗</>
          }
        </button>
      )}
      {syncDone && (
        <div style={{fontSize:12,color:"var(--green)",marginBottom:12,fontWeight:500}}>
          <i className="ti ti-check" aria-hidden="true" style={{marginRight:6}}/>Synced — sessions now available on all devices
        </div>
      )}

      <div className="stat-grid">
        {[
          {label:"Total sessions",val:sessions.length,unit:""},
          {label:"This week",val:thisWeek,unit:" /4"},
          {label:"PRs tracked",val:Object.keys(prs).length,unit:""},
          {label:"Avg RPE",val:avgRpe,unit:""},
        ].map(s=>(
          <div key={s.label} className="scard">
            <div className="sc-label">{s.label}</div>
            <div className="sc-val">{s.val}<span className="sc-unit">{s.unit}</span></div>
          </div>
        ))}
      </div>

      <p className="slabel">AI programme review</p>
      {nudge
        ?<div className="ai-nudge"><div className="ai-label"><i className="ti ti-sparkles" aria-hidden="true" style={{fontSize:11}}/>Coach feedback</div>{nudge}</div>
        :<button className="btn-g" onClick={onNudge} disabled={nudgeLoading||flatRows.length<15}>
          {nudgeLoading?<><span className="spin" style={{marginRight:6}}/>Analysing…</>
           :flatRows.length<5?"Log at least one full session to unlock AI review"
           :<><i className="ti ti-sparkles" aria-hidden="true" style={{marginRight:6}}/>Get AI programme feedback ↗</>}
         </button>
      }

      {freePRs.length>0&&(
        <>
          <p className="slabel">Free weight PRs</p>
          <div className="card">
            {freePRs.map(([name,pr])=>(
              <div key={name} className="pr-row">
                <div style={{flex:1}}><div className="pr-name">{name}</div><div className="pr-sub">{pr.date}</div></div>
                <div className="pr-val">{pr.kg} kg × {pr.reps}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {liftsWithData.length>0&&(
        <>
          <p className="slabel">Volume · recent 4 vs prev 4</p>
          <div className="card">
            {liftsWithData.map(lift=>{
              const r=vol(recent4,lift), p=vol(prev4,lift);
              const pct=p>0?Math.min(Math.round((r/p)*100),100):100;
              const delta=p>0?Math.round(((r-p)/p)*100):0;
              return (
                <div key={lift} className="pbar-wrap">
                  <div className="pbar-top">
                    <span>{lift}</span>
                    <span style={{color:delta>=0?"var(--green)":"var(--red)",fontSize:11}}>{delta>=0?"+":""}{delta}%</span>
                  </div>
                  <div className="pbar-bg"><div className="pbar-fill" style={{width:pct+"%"}}/></div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {sessions.length===0&&(
        <div className="empty">No sessions yet.<br/>Log your first session to get started.</div>
      )}
    </div>
  );
}
