import { useState, useEffect, useRef } from "react";

const GITHUB_RAW = "https://raw.githubusercontent.com/ashrleahy/GymApp/main";
const GITHUB_API = "https://api.github.com/repos/ashrleahy/GymApp";

const PROGRAMS = {
  push: {
    label: "Heavy Push", color: "#e8714a",
    groups: [
      { name: "Chest", pick: 2,
        gym:  ["Incline Bench – Bar","Incline Bench – Dumbbells","Bench – Bar","Bench – Dumbbells","Cable Fly","Machine Bench","Push Ups"],
        home: ["Incline Bench – Bar","Incline Bench – Dumbbells","Bench – Bar","Bench – Dumbbells","Push Ups"] },
      { name: "Shoulders", pick: 2,
        gym:  ["Overhead Press – Bar","Overhead Press – Dumbbells","Lateral Raises – Cable","Lateral Raises – Dumbbells"],
        home: ["Overhead Press – Bar","Overhead Press – Dumbbells","Lateral Raises – Dumbbells"] },
      { name: "Tris", pick: 2,
        gym:  ["Dips","Cable Push Downs","Overhead Extensions"],
        home: ["Dips","Overhead Extensions"] },
    ],
  },
  pull: {
    label: "Heavy Pull", color: "#5b9cf6",
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
    label: "Legs", color: "#4ec99a",
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
    label: "Upper Consolidation", color: "#b07ef8",
    groups: [
      { name: "Chest",    pick: 1, gym: ["Incline Bench – Bar","Incline Bench – Dumbbells","Bench – Bar","Bench – Dumbbells","Machine Bench","Push Ups"], home: ["Incline Bench – Bar","Incline Bench – Dumbbells","Bench – Bar","Bench – Dumbbells","Push Ups"] },
      { name: "Shoulders",pick: 1, gym: ["Overhead Press – Bar","Overhead Press – Dumbbells","Lateral Raises – Dumbbells"], home: ["Overhead Press – Dumbbells","Lateral Raises – Dumbbells"] },
      { name: "Tris",     pick: 1, gym: ["Dips","Cable Push Downs","Overhead Extensions"],             home: ["Dips","Overhead Extensions"] },
      { name: "Back",     pick: 1, gym: ["Pull Ups","Chin Ups","Lat Pulldown","Barbell Row"],          home: ["Pull Ups","Chin Ups","Barbell Row"] },
      { name: "Biceps",   pick: 1, gym: ["Dumbbell Biceps","Barbell Biceps"],                          home: ["Dumbbell Biceps","Barbell Biceps"] },
    ],
  },
};

const MACHINES = new Set(["Cable Fly","Machine Bench","Lateral Raises – Cable","Cable Push Downs","Lat Pulldown","Machine Row","Machine Biceps","Leg Press Machine","Leg Extension","Seated Hamstring Curls","Seated Calf Raise","Leg Press Plyo"]);
const isMachine = ex => MACHINES.has(ex);

// ── CSV ───────────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
    return obj;
  });
}

function sessionToCSV(session) {
  const header = "date,session,location,exercise,group,set,kg,reps,rpe,notes,is_machine";
  const rows = [];
  session.exercises.forEach(ex => {
    ex.sets.forEach((s, i) => {
      rows.push([session.date, session.type, session.location, ex.name, ex.group, i+1,
        s.kg??"", s.reps??"", s.rpe??"", (s.notes||"").replace(/,/g,";"), isMachine(ex.name)
      ].join(","));
    });
  });
  return header + "\n" + rows.join("\n");
}

function downloadCSV(session) {
  const blob = new Blob([sessionToCSV(session)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${session.date}-${session.type}.csv`; a.click();
  URL.revokeObjectURL(url);
}

async function fetchHistory() {
  try {
    const res = await fetch(`${GITHUB_API}/git/trees/main?recursive=1`);
    if (!res.ok) return [];
    const { tree } = await res.json();
    const paths = tree.filter(f => f.path.startsWith("sessions/") && f.path.endsWith(".csv")).map(f => f.path);
    const all = [];
    await Promise.all(paths.map(async p => {
      const r = await fetch(`${GITHUB_RAW}/${p}?t=${Date.now()}`);
      if (r.ok) all.push(...parseCSV(await r.text()));
    }));
    return all.sort((a,b) => a.date.localeCompare(b.date));
  } catch { return []; }
}

// ── Claude API ────────────────────────────────────────────────────────────────
async function callClaude(user, system, maxTokens=400) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:maxTokens, system, messages:[{role:"user",content:user}] }),
  });
  const d = await res.json();
  return d.content?.map(b=>b.text||"").join("") || "";
}

async function getWeightSuggestion(exercise, history) {
  if (isMachine(exercise)) return null;
  const rows = history.filter(r => r.exercise===exercise && r.is_machine!=="true" && r.kg).slice(-20);
  if (!rows.length) return null;
  const hist = rows.map(r=>`${r.date}: ${r.kg}kg × ${r.reps} reps, RPE ${r.rpe}`).join("\n");
  try {
    const raw = await callClaude(
      `Exercise: ${exercise}\nHistory (oldest first):\n${hist}\nSuggest today's weight for 2 sets of 5-8 reps.`,
      `You are a strength coach. Respond ONLY with valid JSON, no markdown: {"kg": number, "reps": "5-8", "rationale": "one sentence max 12 words"}`
    );
    return JSON.parse(raw.replace(/```json|```/g,"").trim());
  } catch { return null; }
}

async function getProgramNudge(history) {
  if (history.length < 15) return null;
  const rows = history.filter(r=>r.is_machine!=="true"&&r.kg).slice(-80);
  const summary = rows.map(r=>`${r.date} [${r.session}] ${r.exercise}: ${r.kg}kg×${r.reps} RPE${r.rpe}`).join("\n");
  return callClaude(
    `Training log:\n${summary}`,
    `You are a strength coach reviewing a training log. Give 3 short specific observations about progress, recovery signals, or balance. Plain text, no bullets or markdown, 4 sentences max.`,
    500
  );
}

// ── Week helpers ──────────────────────────────────────────────────────────────
function getWeekBounds() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const mon = new Date(now); mon.setDate(now.getDate() - ((day+6)%7)); mon.setHours(0,0,0,0);
  const sun = new Date(mon); sun.setDate(mon.getDate()+6); sun.setHours(23,59,59,999);
  return { mon, sun };
}

function getWeekSessions(history) {
  const { mon, sun } = getWeekBounds();
  const done = {};
  history.forEach(r => {
    const d = new Date(r.date);
    if (d >= mon && d <= sun) done[r.session] = r.date;
  });
  return done; // { push: "2026-05-13", ... }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#111110;--surface:#1c1c1a;--surface2:#242422;--border:rgba(255,255,255,0.07);--border-md:rgba(255,255,255,0.13);--border-hi:rgba(255,255,255,0.22);
  --text:#f0efe8;--t2:#8a8a82;--t3:#4a4a44;
  --push:#e8714a;--pull:#5b9cf6;--legs:#4ec99a;--upper:#b07ef8;
  --green:#4ec99a;--red:#e8714a;--blue:#5b9cf6;--amber:#f0b955;
  --r:10px;--rs:6px;--mono:'DM Mono',monospace;--sans:'DM Sans',sans-serif;
}
body{font-family:var(--sans);background:var(--bg);color:var(--text);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;}
.app{max-width:680px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column;}

.nav{display:flex;border-bottom:1px solid var(--border);background:var(--bg);position:sticky;top:0;z-index:10;}
.ntab{flex:1;padding:13px 8px 11px;font-size:10px;font-weight:500;text-align:center;cursor:pointer;border:none;background:none;color:var(--t3);letter-spacing:.05em;text-transform:uppercase;border-bottom:2px solid transparent;transition:all .15s;font-family:var(--mono);}
.ntab i{display:block;font-size:18px;margin-bottom:3px;}
.ntab.active{color:var(--text);border-bottom-color:var(--text);}

.view{padding:18px 16px 80px;flex:1;}
.slabel{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--t3);margin:20px 0 8px;}
.slabel:first-child{margin-top:0;}

.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:13px 15px;margin-bottom:7px;}
.crow{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.ctitle{font-size:14px;font-weight:500;color:var(--text);}
.csub{font-size:12px;color:var(--t2);margin-top:2px;}

.badge{display:inline-block;font-family:var(--mono);font-size:10px;padding:2px 8px;border-radius:99px;white-space:nowrap;}
.b-blue{background:rgba(91,156,246,.15);color:#5b9cf6;}
.b-green{background:rgba(78,201,154,.15);color:#4ec99a;}
.b-gray{background:rgba(255,255,255,.07);color:var(--t2);}
.b-amber{background:rgba(240,185,85,.15);color:#f0b955;}
.b-red{background:rgba(232,113,74,.15);color:#e8714a;}

/* Week tracker */
.week-track{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:4px;}
.wt-card{border-radius:var(--r);padding:12px;border:1px solid var(--border);cursor:pointer;transition:all .2s;position:relative;overflow:hidden;}
.wt-card.done{border-color:transparent;}
.wt-card.todo{background:var(--surface);border-color:var(--border);}
.wt-card.todo:hover{border-color:var(--border-md);}
.wt-card .wt-label{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;}
.wt-card .wt-name{font-size:12px;font-weight:500;color:var(--text);line-height:1.3;}
.wt-card .wt-date{font-family:var(--mono);font-size:10px;color:var(--t2);margin-top:4px;}
.wt-card .wt-icon{font-size:20px;position:absolute;bottom:8px;right:10px;opacity:.3;}
.week-summary{font-family:var(--mono);font-size:11px;color:var(--t2);margin-bottom:18px;}
.week-summary span{color:var(--text);font-weight:500;}

/* Location toggle */
.loctog{display:inline-flex;border:1px solid var(--border-md);border-radius:var(--rs);overflow:hidden;}
.locbtn{padding:7px 15px;font-size:12px;font-weight:500;border:none;background:none;cursor:pointer;color:var(--t2);transition:all .15s;font-family:var(--sans);}
.locbtn.active{background:var(--text);color:var(--bg);}

/* Exercise picker */
.pick-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-bottom:10px;}
.pbtn{padding:10px 11px;font-size:12px;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface);cursor:pointer;text-align:left;color:var(--t2);transition:all .15s;font-family:var(--sans);line-height:1.3;}
.pbtn:hover{border-color:var(--border-md);color:var(--text);}
.pbtn.sel{border-color:var(--text);background:var(--text);color:var(--bg);}
.pbtn.mach{border-style:dashed;}

/* Set logging */
.sh{display:grid;grid-template-columns:20px 1fr 1fr 1fr 32px;gap:6px;margin-bottom:4px;}
.sh span{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--t3);text-align:center;}
.sr{display:grid;grid-template-columns:20px 1fr 1fr 1fr 32px;gap:6px;align-items:center;margin-bottom:6px;}
.snum{font-family:var(--mono);font-size:11px;color:var(--t3);text-align:center;}
.sinput{width:100%;padding:8px 3px;font-size:14px;font-family:var(--mono);text-align:center;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface2);color:var(--text);transition:border-color .15s;}
.sinput:focus{outline:none;border-color:var(--border-hi);}
.sinput.dk{background:var(--surface);color:var(--t2);}
.chkbtn{width:32px;height:32px;border-radius:50%;border:1px solid var(--border-md);background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--t3);font-size:14px;transition:all .15s;}
.chkbtn.done{background:var(--green);border-color:var(--green);color:var(--bg);}

/* AI boxes */
.ai-box{background:rgba(78,201,154,.08);border:1px solid rgba(78,201,154,.2);border-radius:var(--rs);padding:10px 12px;margin-bottom:10px;font-size:12px;color:#b8f0da;}
.ai-label{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--green);margin-bottom:5px;}
.ai-nudge{background:rgba(176,126,248,.08);border:1px solid rgba(176,126,248,.2);border-radius:var(--r);padding:13px 15px;font-size:13px;color:#dcc8ff;line-height:1.65;margin-bottom:8px;}
.ai-nudge .ai-label{color:var(--upper);}

/* Timer */
.timer-val{font-family:var(--mono);font-size:34px;font-weight:500;letter-spacing:-1px;line-height:1;}
.timer-sub{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--t3);margin-top:3px;}

/* History pills */
.hist-pill{background:var(--surface2);border-radius:var(--rs);padding:6px 10px;font-family:var(--mono);font-size:11px;color:var(--t2);margin-bottom:5px;display:flex;justify-content:space-between;}

/* Progress */
.pr-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);}
.pr-row:last-child{border-bottom:none;}
.pr-name{font-size:13px;font-weight:500;flex:1;}
.pr-sub{font-size:11px;color:var(--t2);font-weight:400;}
.pr-val{font-family:var(--mono);font-size:13px;color:var(--green);font-weight:500;}
.pbar-wrap{margin-bottom:10px;}
.pbar-top{display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;}
.pbar-bg{height:4px;background:var(--surface2);border-radius:99px;overflow:hidden;}
.pbar-fill{height:100%;border-radius:99px;background:var(--text);transition:width .5s ease;}

/* Stats */
.stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;}
.scard{background:var(--surface);border:1px solid var(--border);border-radius:var(--rs);padding:11px 12px;}
.sc-label{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--t3);margin-bottom:4px;}
.sc-val{font-size:22px;font-weight:500;color:var(--text);}
.sc-unit{font-size:11px;color:var(--t2);font-weight:400;}

/* Buttons */
.btn-p{width:100%;padding:13px;border-radius:var(--rs);background:var(--text);color:var(--bg);border:none;cursor:pointer;font-size:13px;font-weight:500;margin-top:10px;transition:opacity .15s;font-family:var(--sans);}
.btn-p:hover{opacity:.85;}
.btn-p:disabled{opacity:.3;cursor:not-allowed;}
.btn-g{width:100%;padding:11px;border:1px dashed var(--border-md);border-radius:var(--rs);background:none;cursor:pointer;font-size:12px;color:var(--t2);margin-top:6px;transition:all .15s;font-family:var(--sans);}
.btn-g:hover{background:var(--surface);color:var(--text);}
.btn-g:disabled{opacity:.35;cursor:not-allowed;}
.npair{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;}
.npair button{padding:10px;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface);cursor:pointer;font-size:12px;color:var(--t2);font-family:var(--sans);transition:all .15s;}
.npair button:hover{border-color:var(--border-md);color:var(--text);}
.npair button:disabled{opacity:.3;cursor:not-allowed;}

/* Misc */
.step-bar{display:flex;gap:4px;margin-bottom:14px;}
.step-pip{flex:1;height:3px;border-radius:99px;background:var(--border-md);transition:background .2s;}
.step-pip.done{background:var(--text);}
.sdot{width:8px;height:8px;border-radius:50%;display:inline-block;flex-shrink:0;}
.irow{display:flex;align-items:center;justify-content:space-between;}
textarea{width:100%;padding:8px 10px;font-size:12px;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface2);color:var(--text);resize:none;height:50px;font-family:var(--sans);transition:border-color .15s;}
textarea:focus{outline:none;border-color:var(--border-hi);}
textarea::placeholder{color:var(--t3);}
.spin{display:inline-block;width:13px;height:13px;border:2px solid var(--border-md);border-top-color:var(--text);border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;}
@keyframes spin{to{transform:rotate(360deg);}}
.empty{text-align:center;padding:48px 0;color:var(--t3);font-family:var(--mono);font-size:11px;line-height:2;}
input[type=number]::-webkit-inner-spin-button{opacity:.3;}
`;

// ── App root ──────────────────────────────────────────────────────────────────
export default function GymTracker() {
  const [tab, setTab]         = useState("plan");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [nudge, setNudge]     = useState(null);
  const [nudgeLoading, setNudgeLoading] = useState(false);

  useEffect(() => {
    fetchHistory().then(rows => { setHistory(rows); setLoading(false); });
  }, []);

  // PRs
  const prs = {};
  history.filter(r => r.is_machine!=="true" && r.kg && r.reps).forEach(r => {
    const kg=parseFloat(r.kg), reps=parseInt(r.reps);
    if (!isNaN(kg)&&!isNaN(reps)) {
      const c=prs[r.exercise];
      if (!c||kg>c.kg||(kg===c.kg&&reps>c.reps)) prs[r.exercise]={kg,reps,date:r.date};
    }
  });

  // Stats
  const sessionKeys = [...new Set(history.map(r=>r.date+r.session))];
  const totalSessions = sessionKeys.length;
  const weekDone = getWeekSessions(history);
  const thisWeek = Object.keys(weekDone).length;
  const rpes = history.map(r=>parseFloat(r.rpe)).filter(v=>!isNaN(v));
  const avgRpe = rpes.length ? (rpes.reduce((a,b)=>a+b,0)/rpes.length).toFixed(1) : "—";

  function startSession(type, location) {
    const prog = PROGRAMS[type];
    const exercises = [];
    prog.groups.forEach(g => {
      const list = location==="gym" ? g.gym : g.home;
      list.slice(0,g.pick).forEach(name => {
        exercises.push({ name, group:g.name, sets:[{kg:"",reps:"",rpe:"",notes:"",done:false},{kg:"",reps:"",rpe:"",notes:"",done:false}], suggestion:null, suggLoading:false });
      });
    });
    setSession({ type, location, date:new Date().toISOString().split("T")[0], exercises, step:"pick", exIdx:0 });
    setTab("log");
  }

  function finishSession() { downloadCSV(session); setSession(null); setTab("plan"); }

  return (
    <>
      <style>{S}</style>
      <div className="app">
        <nav className="nav">
          {[{id:"plan",icon:"ti-calendar",label:"Plan"},{id:"log",icon:"ti-barbell",label:"Log"},{id:"progress",icon:"ti-trending-up",label:"Progress"}].map(t=>(
            <button key={t.id} className={`ntab ${tab===t.id?"active":""}`} onClick={()=>setTab(t.id)}>
              <i className={`ti ${t.icon}`} aria-hidden="true"/>{t.label}
            </button>
          ))}
        </nav>
        {tab==="plan"     && <PlanView history={history} loading={loading} weekDone={weekDone} onStart={startSession}/>}
        {tab==="log"      && <LogView session={session} setSession={setSession} history={history} onFinish={finishSession} onStartNew={()=>setTab("plan")}/>}
        {tab==="progress" && <ProgressView history={history} loading={loading} prs={prs} totalSessions={totalSessions} thisWeek={thisWeek} avgRpe={avgRpe} nudge={nudge} nudgeLoading={nudgeLoading} onNudge={async()=>{setNudgeLoading(true);const n=await getProgramNudge(history);setNudge(n);setNudgeLoading(false);}}/>}
      </div>
    </>
  );
}

// ── Plan View ─────────────────────────────────────────────────────────────────
function PlanView({ history, loading, weekDone, onStart }) {
  const [loc, setLoc] = useState("gym");
  const sessionsLeft = Object.keys(PROGRAMS).filter(k => !weekDone[k]);
  const done = Object.keys(weekDone).length;

  // Last session date per type
  function lastDate(type) {
    const rows = history.filter(r=>r.session===type);
    return rows.length ? rows[rows.length-1].date : null;
  }

  return (
    <div className="view">
      <div className="irow" style={{marginBottom:16}}>
        <div>
          <div style={{fontSize:16,fontWeight:500}}>This week</div>
          <div className="week-summary" style={{marginBottom:0,marginTop:2}}>
            <span>{done}</span> of 4 sessions done
            {sessionsLeft.length > 0 && <> · <span>{sessionsLeft.map(k=>PROGRAMS[k].label.replace("Heavy ","").replace(" Consolidation","")).join(", ")}</span> to go</>}
          </div>
        </div>
        <div className="loctog">
          <button className={`locbtn ${loc==="gym"?"active":""}`} onClick={()=>setLoc("gym")}>
            <i className="ti ti-building" aria-hidden="true" style={{fontSize:12,marginRight:4}}/>Gym
          </button>
          <button className={`locbtn ${loc==="home"?"active":""}`} onClick={()=>setLoc("home")}>
            <i className="ti ti-home" aria-hidden="true" style={{fontSize:12,marginRight:4}}/>Home
          </button>
        </div>
      </div>

      {/* Week tracker — 4 session cards */}
      <div className="week-track" style={{marginBottom:20}}>
        {Object.entries(PROGRAMS).map(([key,prog])=>{
          const isDone = !!weekDone[key];
          const last = lastDate(key);
          return (
            <div key={key} className={`wt-card ${isDone?"done":"todo"}`}
              style={isDone ? {background:`${prog.color}18`,borderColor:`${prog.color}40`} : {}}
              onClick={()=>!isDone&&onStart(key,loc)}
            >
              <div className="wt-label" style={{color:prog.color}}>
                {isDone ? <i className="ti ti-check" aria-hidden="true" style={{fontSize:10,marginRight:3}}/> : <i className="ti ti-circle" aria-hidden="true" style={{fontSize:10,marginRight:3}}/>}
                {isDone?"done":"to do"}
              </div>
              <div className="wt-name">{prog.label.replace("Heavy ","").replace(" Consolidation","")}</div>
              {isDone
                ? <div className="wt-date">{weekDone[key]}</div>
                : last ? <div className="wt-date">last: {last}</div> : <div className="wt-date" style={{color:"var(--t3)"}}>not yet logged</div>
              }
              <i className={`ti ${isDone?"ti-check":"ti-chevron-right"} wt-icon`} aria-hidden="true" style={{color:prog.color}}/>
            </div>
          );
        })}
      </div>

      {/* Start session — undone sessions first */}
      <p className="slabel">Start a session</p>
      {[...sessionsLeft, ...Object.keys(weekDone)].map(key=>{
        const prog = PROGRAMS[key];
        const isDone = !!weekDone[key];
        const last = lastDate(key);
        return (
          <div key={key} className="card" style={{cursor:"pointer",opacity:isDone?.6:1}} onClick={()=>onStart(key,loc)}>
            <div className="crow">
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span className="sdot" style={{background:prog.color}}/>
                <div>
                  <div className="ctitle">{prog.label}</div>
                  <div className="csub">{prog.groups.map(g=>`${g.pick}× ${g.name}`).join(" · ")}</div>
                  {last && <div className="csub" style={{marginTop:1}}>Last: {last}</div>}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                {isDone && <span className="badge b-green">done this week</span>}
                <i className="ti ti-chevron-right" aria-hidden="true" style={{color:"var(--t3)",fontSize:16}}/>
              </div>
            </div>
          </div>
        );
      })}
      {loading && <div className="empty"><span className="spin" style={{display:"block",margin:"0 auto 8px"}}/><br/>Loading from GitHub…</div>}
    </div>
  );
}

// ── Exercise Picker ───────────────────────────────────────────────────────────
function ExercisePicker({ session, setSession }) {
  const prog = PROGRAMS[session.type];
  const [sel, setSel] = useState(()=>{
    const s={};
    prog.groups.forEach((g,gi)=>{
      const list = session.location==="gym" ? g.gym : g.home;
      s[gi] = new Set(list.slice(0,g.pick));
    });
    return s;
  });

  function toggle(gi, name) {
    const g = prog.groups[gi];
    setSel(prev=>{
      const s=new Set(prev[gi]);
      if (s.has(name)) { s.delete(name); }
      else { if(s.size>=g.pick){const f=[...s][0];s.delete(f);} s.add(name); }
      return {...prev,[gi]:s};
    });
  }

  function confirm() {
    const exercises=[];
    prog.groups.forEach((g,gi)=>{
      [...sel[gi]].forEach(name=>{
        exercises.push({name,group:g.name,sets:[{kg:"",reps:"",rpe:"",notes:"",done:false},{kg:"",reps:"",rpe:"",notes:"",done:false}],suggestion:null,suggLoading:false});
      });
    });
    setSession(s=>({...s,exercises,step:"log",exIdx:0}));
  }

  const allValid = prog.groups.every((g,gi)=>sel[gi].size===g.pick);

  return (
    <div className="view">
      <div style={{marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
          <span className="sdot" style={{background:PROGRAMS[session.type].color}}/>
          <span style={{fontSize:16,fontWeight:500}}>{PROGRAMS[session.type].label}</span>
          <span className="badge b-gray" style={{marginLeft:2}}>{session.location==="gym"?"Gym":"Home"}</span>
        </div>
        <div style={{fontSize:12,color:"var(--t2)"}}>{session.date} · Pick your exercises for today</div>
      </div>

      {prog.groups.map((g,gi)=>{
        const list = session.location==="gym" ? g.gym : g.home;
        const picked = sel[gi].size;
        return (
          <div key={gi} style={{marginBottom:14}}>
            <p className="slabel">
              {g.name}
              <span style={{color:picked===g.pick?"var(--green)":"var(--t3)",marginLeft:8}}>{picked}/{g.pick}</span>
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

      <button className="btn-p" disabled={!allValid} onClick={confirm}>
        Start logging <i className="ti ti-arrow-right" aria-hidden="true"/>
      </button>
    </div>
  );
}

// ── Log View ──────────────────────────────────────────────────────────────────
function LogView({ session, setSession, history, onFinish, onStartNew }) {
  const [timerSecs, setTimerSecs] = useState(120);
  const [timerOn, setTimerOn]     = useState(false);
  const ref = useRef(null);

  // All hooks must be at the top — before any early returns
  useEffect(()=>{
    if(timerOn){
      ref.current=setInterval(()=>setTimerSecs(s=>{
        if(s<=0){setTimerOn(false);return 0;}
        return s-1;
      }),1000);
    } else clearInterval(ref.current);
    return ()=>clearInterval(ref.current);
  },[timerOn]);

  const idx   = session?.exIdx ?? 0;
  const ex    = session?.exercises?.[idx] ?? null;

  useEffect(()=>{
    if(!ex||isMachine(ex.name)||ex.suggestion||ex.suggLoading) return;
    setSession(s=>({...s,exercises:s.exercises.map((e,i)=>i!==idx?e:{...e,suggLoading:true})}));
    getWeightSuggestion(ex.name,history).then(sugg=>{
      setSession(s=>({...s,exercises:s.exercises.map((e,i)=>i!==idx?e:{...e,suggestion:sugg,suggLoading:false})}));
    });
  },[idx, session?.step]);

  function startTimer(){ setTimerSecs(120); setTimerOn(true); }

  if(!session) return (
    <div className="view" style={{textAlign:"center",paddingTop:60}}>
      <i className="ti ti-barbell" aria-hidden="true" style={{fontSize:48,color:"var(--t3)",display:"block",marginBottom:12}}/>
      <div style={{color:"var(--t2)",marginBottom:20}}>No active session</div>
      <button className="btn-p" style={{maxWidth:220,margin:"0 auto"}} onClick={onStartNew}>Start a session</button>
    </div>
  );

  if(session.step==="pick") return <ExercisePicker session={session} setSession={setSession}/>;

  if(session.step==="done") return (
    <div className="view" style={{textAlign:"center",paddingTop:40}}>
      <i className="ti ti-trophy" aria-hidden="true" style={{fontSize:52,color:"var(--green)",display:"block",marginBottom:14}}/>
      <div style={{fontSize:18,fontWeight:500,marginBottom:6}}>Session complete</div>
      <div style={{fontSize:13,color:"var(--t2)",marginBottom:28}}>{session.exercises.length} exercises · {session.date}</div>
      <div className="card" style={{textAlign:"left",marginBottom:14}}>
        {session.exercises.map((ex,i)=>(
          <div key={i} className="pr-row">
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:500}}>{ex.name}</div>
              <div style={{fontSize:12,color:"var(--t2)"}}>{ex.group}</div>
            </div>
            <div style={{fontFamily:"var(--mono)",fontSize:12,color:"var(--t2)"}}>
              {ex.sets.filter(s=>s.done).length} sets · {[...new Set(ex.sets.filter(s=>s.kg).map(s=>s.kg))].join("/")} kg
            </div>
          </div>
        ))}
      </div>
      <button className="btn-p" onClick={onFinish} style={{background:"var(--blue)",maxWidth:300,margin:"0 auto"}}>
        <i className="ti ti-download" aria-hidden="true" style={{marginRight:6}}/>Download CSV &amp; finish
      </button>
      <div style={{fontSize:11,color:"var(--t3)",marginTop:10,fontFamily:"var(--mono)"}}>
        Push to sessions/ in your GitHub repo
      </div>
    </div>
  );

  const total = session.exercises.length;
  const mins=Math.floor(timerSecs/60), secs=timerSecs%60;

  function updateSet(si,field,val){
    setSession(s=>({...s,exercises:s.exercises.map((e,ei)=>ei!==idx?e:{...e,sets:e.sets.map((st,sii)=>sii!==si?st:{...st,[field]:val})})}));
  }
  function toggleDone(si){ updateSet(si,"done",!ex.sets[si].done); if(!ex.sets[si].done) startTimer(); }

  const exHistory = history.filter(r=>r.exercise===ex.name&&r.kg).slice(-5).reverse();

  return (
    <div className="view">
      <div className="step-bar">
        {session.exercises.map((_,i)=><div key={i} className={`step-pip ${i<=idx?"done":""}`}/>)}
      </div>

      <div className="irow" style={{marginBottom:14}}>
        <div>
          <div style={{fontSize:17,fontWeight:500}}>{ex.name}</div>
          <div style={{fontSize:12,color:"var(--t2)",marginTop:2}}>
            {ex.group} · {idx+1} of {total}
            {isMachine(ex.name)&&<span className="badge b-gray" style={{marginLeft:8}}>machine</span>}
          </div>
        </div>
        <div style={{textAlign:"right",cursor:"pointer"}} onClick={()=>timerOn?setTimerOn(false):startTimer()}>
          <div className="timer-val" style={{color:timerSecs<30&&timerOn?"var(--red)":"var(--text)"}}>
            {mins}:{String(secs).padStart(2,"0")}
          </div>
          <div className="timer-sub">{timerOn?"tap to pause":"tap to start"}</div>
        </div>
      </div>

      {!isMachine(ex.name)&&(
        <div className="ai-box">
          <div className="ai-label"><i className="ti ti-sparkles" aria-hidden="true" style={{fontSize:10,marginRight:4}}/>AI suggestion</div>
          {ex.suggLoading ? <span><span className="spin" style={{marginRight:6}}/>Calculating…</span>
           : ex.suggestion ? <span><strong>{ex.suggestion.kg} kg × {ex.suggestion.reps}</strong>{ex.suggestion.rationale?" — "+ex.suggestion.rationale:""}</span>
           : <span style={{color:"var(--t3)"}}>No history yet — log your starting weight.</span>}
        </div>
      )}

      {exHistory.length>0&&(
        <>
          <p className="slabel">Recent</p>
          {exHistory.map((r,i)=>(
            <div key={i} className="hist-pill">
              <span>{r.date}</span>
              <span>{r.kg}kg × {r.reps} <span style={{color:"var(--t3)"}}>RPE {r.rpe}</span></span>
            </div>
          ))}
          <div style={{marginBottom:12}}/>
        </>
      )}

      <div className="sh"><span/><span>kg</span><span>reps</span><span>rpe</span><span/></div>
      {ex.sets.map((st,si)=>(
        <div key={si} className="sr">
          <span className="snum">{si+1}</span>
          <input className={`sinput ${st.done?"dk":""}`} type="number" step="2.5" value={st.kg} placeholder="—" onChange={e=>updateSet(si,"kg",e.target.value)}/>
          <input className={`sinput ${st.done?"dk":""}`} type="number" min="1" max="20" value={st.reps} placeholder="—" onChange={e=>updateSet(si,"reps",e.target.value)}/>
          <input className={`sinput ${st.done?"dk":""}`} type="number" min="5" max="10" value={st.rpe} placeholder="—" onChange={e=>updateSet(si,"rpe",e.target.value)}/>
          <button className={`chkbtn ${st.done?"done":""}`} onClick={()=>toggleDone(si)} aria-label="Mark set done">
            <i className="ti ti-check" aria-hidden="true"/>
          </button>
        </div>
      ))}

      <textarea placeholder="Notes…" value={ex.sets[0].notes||""} onChange={e=>updateSet(0,"notes",e.target.value)} style={{marginTop:8}}/>

      <div className="npair">
        <button disabled={idx===0} onClick={()=>setSession(s=>({...s,exIdx:idx-1}))}>
          {idx>0?"← "+session.exercises[idx-1].name:"←"}
        </button>
        {idx<total-1
          ? <button style={{fontWeight:500,color:"var(--text)"}} onClick={()=>setSession(s=>({...s,exIdx:idx+1}))}>{session.exercises[idx+1].name} →</button>
          : <button style={{fontWeight:500,color:"var(--green)"}} onClick={()=>setSession(s=>({...s,step:"done"}))}>Finish session →</button>
        }
      </div>
    </div>
  );
}

// ── Progress View ─────────────────────────────────────────────────────────────
function ProgressView({ history, loading, prs, totalSessions, thisWeek, avgRpe, nudge, nudgeLoading, onNudge }) {
  const freePRs = Object.entries(prs).filter(([n])=>!isMachine(n)).sort((a,b)=>b[1].date.localeCompare(a[1].date)).slice(0,8);
  const sessionKeys = [...new Set(history.map(r=>r.date+r.session))];
  const recent4=sessionKeys.slice(-4), prev4=sessionKeys.slice(-8,-4);

  function vol(keys,ex){ return history.filter(r=>keys.includes(r.date+r.session)&&r.exercise===ex&&r.kg).reduce((s,r)=>s+(parseFloat(r.kg)*(parseInt(r.reps)||0)),0); }
  const keyLifts=["Bench","Squats","Deadlifts","Overhead Press – Bar","Pull Ups","Barbell Row"];
  const liftsWithData=keyLifts.filter(l=>history.some(r=>r.exercise===l&&r.kg));

  return (
    <div className="view">
      <div className="stat-grid">
        {[{label:"Sessions",val:totalSessions,unit:""},{label:"This week",val:thisWeek,unit:"/4"},{label:"PRs",val:Object.keys(prs).length,unit:""},{label:"Avg RPE",val:avgRpe,unit:""}].map(s=>(
          <div key={s.label} className="scard">
            <div className="sc-label">{s.label}</div>
            <div className="sc-val">{s.val}<span className="sc-unit">{s.unit}</span></div>
          </div>
        ))}
      </div>

      <p className="slabel">AI programme review</p>
      {nudge
        ? <div className="ai-nudge"><div className="ai-label"><i className="ti ti-sparkles" aria-hidden="true" style={{fontSize:10,marginRight:4}}/>Coach feedback</div>{nudge}</div>
        : <button className="btn-g" onClick={onNudge} disabled={nudgeLoading||history.length<15}>
            {nudgeLoading?<><span className="spin" style={{marginRight:6}}/>Analysing…</>:history.length<15?"Log more sessions to unlock AI review":<><i className="ti ti-sparkles" aria-hidden="true" style={{marginRight:6}}/>Get AI programme feedback ↗</>}
          </button>
      }

      {freePRs.length>0&&(
        <>
          <p className="slabel">Free weight PRs</p>
          <div className="card" style={{cursor:"default"}}>
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
          <p className="slabel">Volume · recent 4 vs prev 4 sessions</p>
          <div className="card" style={{cursor:"default"}}>
            {liftsWithData.map(lift=>{
              const r=vol(recent4,lift), p=vol(prev4,lift);
              const pct=p>0?Math.min(Math.round((r/p)*100),100):100;
              const delta=p>0?Math.round(((r-p)/p)*100):0;
              return (
                <div key={lift} className="pbar-wrap">
                  <div className="pbar-top">
                    <span style={{fontWeight:500}}>{lift}</span>
                    <span style={{color:delta>=0?"var(--green)":"var(--red)",fontFamily:"var(--mono)",fontSize:11}}>{delta>=0?"+":""}{delta}%</span>
                  </div>
                  <div className="pbar-bg"><div className="pbar-fill" style={{width:pct+"%"}}/></div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!loading&&history.length===0&&(
        <div className="empty">No session data yet.<br/>Push CSV files to sessions/ in your GitHub repo.<br/><span style={{color:"var(--t3)"}}>github.com/ashrleahy/GymApp</span></div>
      )}
      {loading&&<div className="empty"><span className="spin" style={{display:"block",margin:"0 auto 8px"}}/><br/>Loading from GitHub…</div>}
    </div>
  );
}
