/* core.js — shared constants, state, helpers and the plan logic.
   Every other file hangs off window.HC. Load order matters (see index.html). */
(function(){
"use strict";

// on.render = full redraw, on.refresh = cheap read-only views after every save,
// on.show[tab] = redraw when a tab is opened (so edits made elsewhere show up)
var HC = window.HC = { on: { render: [], refresh: [], show: {} }, activeTab: "today" };

HC.KEY = "headclear_state_v1";
HC.WORKER_URL = "https://head-clear-reminders.benjasondixon.workers.dev";
HC.VAPID_PUBLIC_KEY = "BM_9NQhAYZrDlwb5L4WBEepLa-_ZsMzsEXcl1yW7QRj9QctOopQ5v7JeUtCVIPLvOSqS9LVKyLOZyotdm69EQek";

/* ---------------- small helpers ---------------- */
function pad(n){ return n < 10 ? "0" + n : "" + n; }
HC.pad = pad;
HC.uid = function(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
HC.dateKey = function(d){ d = d || new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
HC.todayKey = function(){ return HC.dateKey(new Date()); };
// noon avoids DST edge cases when adding/diffing whole days
HC.parseKey = function(k){ var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0); };
HC.addDays = function(k, n){ var d = HC.parseKey(k); d.setDate(d.getDate() + n); return HC.dateKey(d); };
HC.diffDays = function(a, b){ return Math.round((HC.parseKey(b) - HC.parseKey(a)) / 86400000); };
HC.hmToMin = function(s){ var m = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; };
HC.minToHm = function(n){ n = ((n % 1440) + 1440) % 1440; return pad(Math.floor(n / 60)) + ":" + pad(n % 60); };
HC.nowHm = function(){ var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
HC.fmtDate = function(key, opts){ return HC.parseKey(key).toLocaleDateString(undefined, opts || { weekday: "short", month: "short", day: "numeric" }); };

/* tiny DOM builder — textContent only, so nothing the user types is ever parsed as HTML */
HC.el = function(tag, props, kids){
  var e = document.createElement(tag);
  if(props){
    Object.keys(props).forEach(function(k){
      var v = props[k];
      if(v === null || v === undefined || v === false) return;
      if(k === "class") e.className = v;
      else if(k === "text") e.textContent = v;
      else if(k === "html") e.innerHTML = v; // only ever called with developer-written markup (icons)
      else if(k === "style") e.style.cssText = v;
      else if(k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    });
  }
  (kids || []).forEach(function(c){
    if(c === null || c === undefined || c === false) return;
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return e;
};
var el = HC.el;
HC.$ = function(id){ return document.getElementById(id); };

HC.ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
HC.ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>';

/* ---------------- plan content ----------------
   Everything in this file is deliberately GENERIC. Anything specific to one person's
   diagnosis or treatment (restrictions, rehab streams, clearance items, meds, HR numbers)
   lives in a "plan file" that is pasted into the app once (Info → My plan file) and stored
   only on that device — never in this public repository. */
HC.LADDER_STEPS = [
  { name: "Back to normal daily life", detail: "Work, study, screens at ordinary levels — no lingering symptoms at rest." },
  { name: "Light aerobic activity", detail: "10–15 min walk, easy bike — no head movement or contact risk." },
  { name: "Moderate activity", detail: "Running, moderate cycling, non-contact gym work, more head/body movement." },
  { name: "Heavy, non-contact training", detail: "Sprinting, full gym loading, sport drills — still no contact." },
  { name: "Full-contact practice", detail: "Only after the clearance list above and your clinician's sign-off for contact." },
  { name: "Return to competition", detail: "" }
];

// Tokens: {ceiling} {low} {bedtime} {screensOff} are filled in by HC.fmt()
HC.RHYTHM = [
  { key: "wake", time: "Wake", items: [
    { id: "wakeTime", label: "Same wake time as usual", why: "An irregular wake time drifts recovery more than one short night." },
    { id: "rehydrate", label: "Rehydrate before coffee", why: "Water or a low-sugar electrolyte drink." },
    { id: "breakfast", label: "Real breakfast — protein + colour", why: "Eggs, oily fish, fruit/veg — not carb-only." }
  ]},
  { key: "midday", time: "Training & rehab", items: [
    { id: "aerobicDose", label: "Cardio — under {ceiling} bpm", why: "Log it in Train. Symptoms must stay quiet during, after and next morning." },
    { id: "vor", label: "Rehab exercises (from your clinician)", why: "Ease off if they bring on dizziness, head pressure or nausea." },
    { id: "physioWork", label: "Physio exercises", why: "" },
    { id: "daylight", label: "Get outside / into daylight", why: "Helps circadian rhythm and mood." }
  ]},
  { key: "afternoon", time: "Afternoon", items: [
    { id: "screenPacing", label: "Pace screens in 25–30 min blocks", why: "5–10 min off between, rather than pushing through." },
    { id: "napOk", label: "Nap under an hour, before 3pm (if needed)", why: "Later or longer eats into night-time sleep." },
    { id: "journal", label: "Log the day in a couple of lines", why: "Symptoms, triggers, what helped." }
  ]},
  { key: "evening", time: "Evening", items: [
    { id: "screensOff", label: "Screens off by {screensOff}", why: "No screens for the 2 hours before bed." },
    { id: "lightDinner", label: "Earlier, lighter dinner — no alcohol", why: "Alcohol fragments the deep sleep your brain needs most." },
    { id: "noLateExercise", label: "No vigorous exercise within 3h of bed", why: "" }
  ]},
  { key: "bed", time: "Bed", items: [
    { id: "sameBedtime", label: "In bed by {bedtime} — dark, cool, quiet, phone away", why: "" },
    { id: "sevenNine", label: "7–9 hours — up briefly if awake past 20 min", why: "Rather than lying there frustrated." }
  ]}
];

HC.STANDING = [
  { id: "hydration", label: "Hydration", why: "~2–2.5 L water/day plus what you sweat out." },
  { id: "noAlcohol", label: "No alcohol", why: "Until fully cleared — protects sleep and cognitive recovery." },
  { id: "caffeineOk", label: "Caffeine kept modest", why: "Fine in small amounts; none after midday if sleep is off." },
  { id: "moodCheckin", label: "Mood check-in", why: "Frustration and low mood are expected, not a sign you're doing it wrong." }
];

// The 22-symptom list and 0–6 scoring used on the SCAT5 symptom evaluation
// (the tool a World Rugby HIA is built on). Max severity score = 22×6 = 132.
HC.HIA_SYMPTOMS = [
  { id: "headache", label: "Headache" },
  { id: "pressureInHead", label: "Pressure in head" },
  { id: "neckPain", label: "Neck pain" },
  { id: "nauseaVomiting", label: "Nausea or vomiting" },
  { id: "dizziness", label: "Dizziness" },
  { id: "blurredVision", label: "Blurred vision" },
  { id: "balanceProblems", label: "Balance problems" },
  { id: "sensitivityLight", label: "Sensitivity to light" },
  { id: "sensitivityNoise", label: "Sensitivity to noise" },
  { id: "feelingSlowedDown", label: "Feeling slowed down" },
  { id: "feelingInFog", label: "Feeling like “in a fog”" },
  { id: "dontFeelRight", label: "Don’t feel right" },
  { id: "difficultyConcentrating", label: "Difficulty concentrating" },
  { id: "difficultyRemembering", label: "Difficulty remembering" },
  { id: "fatigue", label: "Fatigue or low energy" },
  { id: "confusion", label: "Confusion" },
  { id: "drowsiness", label: "Drowsiness" },
  { id: "troubleFallingAsleep", label: "Trouble falling asleep" },
  { id: "moreEmotional", label: "More emotional" },
  { id: "irritability", label: "Irritability" },
  { id: "sadness", label: "Sadness" },
  { id: "nervousAnxious", label: "Nervous or anxious" }
];
HC.HIA_MAX = HC.HIA_SYMPTOMS.length * 6;

/* The generic plan. A plan file replaces any of these keys (objects are merged one level deep). */
HC.PLAN_KEY = "headclear_plan_v1";
HC.DEFAULT_PLAN = {
  phaseNames: ["Cardio only", "Cardio + gym", "Next stage of rehab"],
  phaseSub: [
    "Stay under your heart-rate ceiling. Symptoms stay quiet during, after and the next morning.",
    "Cardio in the morning, gym in the afternoon — never straight after cardio.",
    "Your clinician has added the next stage of rehab. Same rules: heart rate under the ceiling, symptoms quiet."
  ],
  phaseBullets: {
    1: ["Cardio at or under your heart-rate ceiling ({ceiling} bpm)", "No symptoms during, after, or the next morning", "Step up +5 bpm after 5 tolerated days in a row and a week at the band", "Retest the BCTT every 2 weeks"],
    2: ["Cardio in the morning, gym that afternoon — never straight after", "Follow your clinician's rules on head position and exercise choice"],
    3: ["The next stage of rehab, added by your clinician once you've shown you're not symptomatic"]
  },
  phase3Label: "My clinician has added the next stage",
  trainRule: "cardio under {ceiling} bpm. Symptoms must not rise during, after, or the next morning. Gym only in the afternoon after morning cardio — never straight after it.",
  gymNote: "Cardio in the morning, gym that afternoon. Follow your physio's rules on head position and exercise choice.",
  avoid: ["Heart rate above {ceiling} bpm", "Gym straight after cardio", "Screens in the 2 hours before bed (after {screensOff})"],
  avoidSource: "From your plan.",
  clearance: [
    { id: "restSymptoms", label: "Symptom-free at rest and through every phase of training", why: "Including the next morning." },
    { id: "bctt", label: "BCTT passed — confirmed by your clinician", why: "Retested every 2 weeks." },
    { id: "signoff", label: "Doctor / physio clearance for contact", why: "" }
  ],
  postureSteps: [],
  postureHint: "",
  physioFocus: ["Neck", "Balance", "Vision"],
  alongside: [],
  report: null,
  options: { headUpright: false, outdoors: false },
  sessionTypes: [
    { id: "cardio", label: "Cardio", item: "aerobicDose", defMin: 30 },
    { id: "gym", label: "Gym", item: null, defMin: 40 },
    { id: "vor", label: "Rehab exercises", item: "vor", defMin: 10, timer: true },
    { id: "physio", label: "Physio rehab", item: "physioWork", defMin: 30 }
  ],
  rhythmOverrides: {},
  rhythmExtras: [],
  profile: null,
  meds: null,
  reportContext: "",
  feedbackKey: "",
  painkillers: ["Paracetamol", "Ibuprofen", "Codeine-containing", "Other"],
  triggerTags: ["Screens", "Noise", "Busy places", "Stress", "Poor sleep", "Exercise", "Travel / driving", "Skipped meal", "Heat", "Caffeine"]
};

function mergePlan(extra){
  var out = JSON.parse(JSON.stringify(HC.DEFAULT_PLAN));
  if(!extra || typeof extra !== "object") return out;
  Object.keys(HC.DEFAULT_PLAN).forEach(function(k){
    if(extra[k] === undefined || extra[k] === null) return;
    var base = HC.DEFAULT_PLAN[k];
    if(base && typeof base === "object" && !Array.isArray(base) && typeof extra[k] === "object" && !Array.isArray(extra[k])) out[k] = Object.assign({}, base, extra[k]);
    else out[k] = extra[k];
  });
  return out;
}
HC.hasPlanFile = function(){ try{ return !!localStorage.getItem(HC.PLAN_KEY); }catch(e){ return false; } };
function loadPlan(){
  try{
    var raw = localStorage.getItem(HC.PLAN_KEY);
    return mergePlan(raw ? JSON.parse(raw) : null);
  }catch(e){ return mergePlan(null); }
}
HC.plan = loadPlan();
HC.setPlan = function(obj){ localStorage.setItem(HC.PLAN_KEY, JSON.stringify(obj)); HC.plan = mergePlan(obj); };
HC.clearPlan = function(){ try{ localStorage.removeItem(HC.PLAN_KEY); }catch(e){} HC.plan = mergePlan(null); };
// Copies the personal numbers and meds from a plan file into this device's own settings.
HC.applyPlanSettings = function(obj){
  var s = HC.state, p = s.profile;
  if(obj.profile && typeof obj.profile === "object"){
    var before = p.hrLow + "-" + p.hrHigh;
    ["hrLow", "hrHigh", "bedtime", "allowedRise", "gymGapHours", "name"].forEach(function(k){ if(obj.profile[k] !== undefined) p[k] = obj.profile[k]; });
    if(before !== p.hrLow + "-" + p.hrHigh) p.bandSince = HC.todayKey();
  }
  if(Array.isArray(obj.meds)) s.meds = obj.meds.map(function(m){ return { id: HC.uid(), name: String(m.name || ""), dose: String(m.dose || ""), when: m.when || "any" }; });
};

// The user's own edits (reworded, removed, added items) are applied last, on top of the plan file.
function userEdit(items, blockKey){
  var cu = HC.state.custom;
  var out = items.filter(function(it){ var u = cu.items[it.id]; return !(u && u.removed); }).map(function(it){
    var u = cu.items[it.id];
    return u ? { id: it.id, label: u.label !== undefined ? u.label : it.label, why: u.why !== undefined ? u.why : it.why } : it;
  });
  cu.added.forEach(function(a){ if(a.block === blockKey) out.push({ id: a.id, label: a.label, why: a.why || "", custom: true }); });
  return out;
}
// Returns the daily checklist: base items + plan file wording/extras + the user's own edits.
HC.rhythm = function(){
  var ov = HC.plan.rhythmOverrides || {}, ex = HC.plan.rhythmExtras || [];
  return HC.RHYTHM.map(function(b){
    var items = b.items.map(function(it){
      var o = ov[it.id];
      return o ? { id: it.id, label: o.label || it.label, why: o.why !== undefined ? o.why : it.why } : it;
    });
    ex.forEach(function(e){ if(e.block === b.key) items.push({ id: e.id, label: e.label, why: e.why || "" }); });
    return { key: b.key, time: b.time, items: userEdit(items, b.key) };
  });
};
HC.standingItems = function(){ return userEdit(HC.STANDING.slice(), "standing"); };

HC.typeLabel = function(id){
  var t = HC.plan.sessionTypes;
  for(var i = 0; i < t.length; i++) if(t[i].id === id) return t[i].label;
  return id;
};


// Daily extras that feed the weekly report (all generic; a plan file may override the tag lists).
HC.HRV_STATUS = ["Balanced", "Unbalanced", "Low", "Poor"];
HC.HEAD_HOURS = [{ v: 0.5, l: "<1 h" }, { v: 2, l: "1–3 h" }, { v: 4.5, l: "3–6 h" }, { v: 8, l: "6+ h" }];
HC.HEAD_LOC = ["Front", "Back / neck", "Sides", "Behind eyes", "All over"];
HC.EVENT_TAGS = [
  { id: "nearFaint", label: "Near-faint / blackout", flag: true },
  { id: "knock", label: "Fall or knock to the head", flag: true },
  { id: "vomit", label: "Vomiting", flag: true },
  { id: "newSymptom", label: "New symptom" },
  { id: "muchWorse", label: "Much worse than usual" }
];

/* ---------------- state ---------------- */
function defaultProfile(){
  var t = HC.todayKey();
  return { hrLow: 100, hrHigh: 110, bandSince: t, planStart: t, bedtime: "22:00", allowedRise: 1, gymGapHours: 3, physioHeadUpDown: false, gymOverride: false, name: "" };
}
function defaultMeds(){ return []; } // meds are entered by the user (or come from the plan file)
HC.defaultState = function(){
  return {
    v: 2, createdAt: new Date().toISOString(), days: {},
    ladder: { started: false, currentStep: 0, stepStartedAt: null, history: [] },
    hidden: { rhythm: {}, standing: {} }, featureNotes: "", feedback: { sentAt: null, sentText: "" },
    profile: defaultProfile(), meds: defaultMeds(), bctt: [], bcttNext: null, clearance: {}, ui: { avoidOpen: false },
    tests: [], questions: [],
    custom: { items: {}, added: [], removedLabels: {} }
  };
};
function load(){
  try{
    var raw = localStorage.getItem(HC.KEY);
    if(!raw) return HC.defaultState();
    var p = JSON.parse(raw);
    if(!p || typeof p !== "object") return HC.defaultState();
    var d = HC.defaultState();
    d.createdAt = p.createdAt || d.createdAt;
    d.days = p.days && typeof p.days === "object" ? p.days : d.days;
    Object.assign(d.ladder, p.ladder || {});
    if(p.hidden){
      Object.assign(d.hidden.rhythm, p.hidden.rhythm || {});
      Object.assign(d.hidden.standing, p.hidden.standing || {});
    }
    d.featureNotes = typeof p.featureNotes === "string" ? p.featureNotes : "";
    d.feedback = p.feedback && typeof p.feedback === "object" ? Object.assign({ sentAt: null, sentText: "" }, p.feedback) : d.feedback;
    d.profile = Object.assign(defaultProfile(), p.profile || {});
    d.meds = Array.isArray(p.meds) ? p.meds : defaultMeds();
    d.bctt = Array.isArray(p.bctt) ? p.bctt : [];
    d.bcttNext = p.bcttNext || null;
    d.tests = Array.isArray(p.tests) ? p.tests : [];
    d.questions = Array.isArray(p.questions) ? p.questions : [];
    d.clearance = p.clearance && typeof p.clearance === "object" ? p.clearance : {};
    d.ui = Object.assign({ avoidOpen: false }, p.ui || {});
    var c = p.custom && typeof p.custom === "object" ? p.custom : {};
    d.custom = { items: c.items && typeof c.items === "object" ? c.items : {}, added: Array.isArray(c.added) ? c.added : [], removedLabels: c.removedLabels && typeof c.removedLabels === "object" ? c.removedLabels : {} };
    return d;
  }catch(e){ return HC.defaultState(); }
}
HC.state = load();

function emptyDay(){
  return { symptomScore: null, wake: {}, midday: {}, afternoon: {}, evening: {}, bed: {}, standing: {}, journal: "", doses: [], hia: {}, sessions: [], sleep: {}, meds: {}, auto: {}, head: {}, ev: { trig: [], evt: [] } };
}
// getDay creates the day if missing (use for today / explicit writes); peekDay never creates.
HC.getDay = function(key){
  var s = HC.state;
  var d = s.days[key];
  if(!d) d = s.days[key] = emptyDay();
  ["wake", "midday", "afternoon", "evening", "bed", "standing", "hia", "sleep", "meds", "auto", "head"].forEach(function(k){ if(!d[k] || typeof d[k] !== "object") d[k] = {}; });
  if(!Array.isArray(d.sessions)) d.sessions = [];
  if(!Array.isArray(d.doses)) d.doses = [];
  if(!d.ev || typeof d.ev !== "object") d.ev = {};
  if(!Array.isArray(d.ev.trig)) d.ev.trig = [];
  if(!Array.isArray(d.ev.evt)) d.ev.evt = [];
  if(typeof d.journal !== "string") d.journal = "";
  return d;
};
HC.peekDay = function(key){ var d = HC.state.days[key]; return d ? HC.getDay(key) : null; };
HC.today = function(){ return HC.getDay(HC.todayKey()); };

HC.save = function(){
  try{ localStorage.setItem(HC.KEY, JSON.stringify(HC.state)); }catch(e){}
  HC.on.refresh.forEach(function(fn){ try{ fn(); }catch(e){ console.error(e); } });
};
HC.renderAll = function(){
  HC.on.render.forEach(function(fn){ try{ fn(); }catch(e){ console.error(e); } });
};

HC.fmt = function(str){
  var p = HC.state.profile;
  var bed = HC.hmToMin(p.bedtime);
  return str
    .replace(/\{ceiling\}/g, p.hrHigh).replace(/\{low\}/g, p.hrLow)
    .replace(/\{bedtime\}/g, p.bedtime)
    .replace(/\{screensOff\}/g, bed === null ? "2 h before bed" : HC.minToHm(bed - 120));
};

/* ---------------- modal / toast / scale ---------------- */
HC.openModal = function(nodes){
  var card = HC.$("modalCard");
  card.innerHTML = "";
  [].concat(nodes).forEach(function(n){ if(n) card.appendChild(n); });
  HC.$("modalOverlay").hidden = false;
};
HC.closeModal = function(){ HC.$("modalOverlay").hidden = true; HC.$("modalCard").innerHTML = ""; };
HC.$("modalOverlay").addEventListener("click", function(e){ if(e.target === HC.$("modalOverlay")) HC.closeModal(); });

HC.confirm = function(o){
  HC.openModal([
    el("h3", { text: o.title }),
    o.message ? el("p", { text: o.message }) : null,
    el("div", { class: "modal-actions" }, [
      el("button", { class: "btn btn-ghost", type: "button", text: o.cancelLabel || "Cancel", onclick: HC.closeModal }),
      el("button", { class: "btn " + (o.danger ? "btn-danger" : "btn-primary"), type: "button", text: o.confirmLabel || "Confirm",
        onclick: function(){ HC.closeModal(); o.onConfirm(); } })
    ])
  ]);
};
HC.notice = function(title, lines){
  HC.openModal([
    el("h3", { text: title }),
    el("div", { class: "stack", style: "gap:8px;" }, lines.map(function(t){ return el("p", { text: t }); })),
    el("div", { class: "modal-actions" }, [el("button", { class: "btn btn-primary", type: "button", text: "OK", onclick: HC.closeModal })])
  ]);
};
var toastTimer;
HC.toast = function(msg){
  var t = HC.$("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.hidden = true; }, 3800);
};

HC.renderScale = function(container, value, onPick, max){
  max = (max === undefined) ? 10 : max;
  container.innerHTML = "";
  for(var i = 0; i <= max; i++){
    (function(i){
      container.appendChild(el("button", { type: "button", class: "scale-btn" + (value === i ? " on" : ""), text: String(i), onclick: function(){ onPick(i); } }));
    })(i);
  }
};

HC.promptScore = function(title, sub, cb){
  var picked = null;
  var scale = el("div", { class: "scale-row" });
  var ok = el("button", { class: "btn btn-primary", type: "button", text: "Save", disabled: true });
  function paint(){ [].forEach.call(scale.children, function(b, i){ b.classList.toggle("on", i === picked); }); }
  HC.renderScale(scale, null, function(v){ picked = v; ok.disabled = false; paint(); });
  ok.addEventListener("click", function(){ if(picked === null) return; HC.closeModal(); cb(picked); });
  HC.openModal([
    el("h3", { text: title }), el("p", { text: sub || "Symptom score right now, 0 (none) to 10 (severe)." }), scale,
    el("div", { class: "modal-actions" }, [el("button", { class: "btn btn-ghost", type: "button", text: "Cancel", onclick: HC.closeModal }), ok])
  ]);
};

/* ---------------- tabs ---------------- */
HC.switchTab = function(tab){
  HC.activeTab = tab;
  document.querySelectorAll(".panel").forEach(function(p){ p.classList.toggle("active", p.id === "panel-" + tab); });
  document.querySelectorAll(".tab-btn").forEach(function(b){ b.classList.toggle("active", b.dataset.tab === tab); });
  (HC.on.show[tab] || []).forEach(function(fn){ try{ fn(); }catch(e){ console.error(e); } });
  document.querySelector("main").scrollTop = 0;
};

/* ---------------- sessions + plan logic ---------------- */
HC.allSessions = function(){
  var out = [];
  Object.keys(HC.state.days).sort().forEach(function(k){
    HC.getDay(k).sessions.forEach(function(s){ out.push({ date: k, s: s }); });
  });
  return out;
};

// Tolerated = HR stayed under the ceiling, head upright, and symptoms did not rise
// (by more than the allowed amount) during, after, or the next morning.
HC.sessionVerdict = function(s){
  var p = HC.state.profile, rise = p.allowedRise, flags = [];
  var base = typeof s.before === "number" ? s.before : 0;
  var ceil = s.ceiling || p.hrHigh;
  if(s.type === "cardio" && typeof s.peakHr === "number" && s.peakHr > ceil) flags.push("Peak HR " + s.peakHr + " over " + ceil);
  if((s.type === "cardio" || s.type === "gym") && s.upright === false) flags.push("Head not upright");
  var up = [];
  if(typeof s.worst === "number" && s.worst > base + rise) up.push("during");
  if(typeof s.after === "number" && s.after > base + rise) up.push("after");
  if(typeof s.nextMorning === "number" && s.nextMorning > base + rise) up.push("next morning");
  if(up.length) flags.push("Symptoms up " + up.join(" + "));
  if(flags.length) return { cls: "warn", label: flags.join(" · "), tolerated: false, pending: false };
  if(typeof s.nextMorning !== "number") return { cls: "wait", label: "Awaiting next-morning check", tolerated: false, pending: true };
  return { cls: "good", label: "Tolerated", tolerated: true, pending: false };
};

HC.cardioDays = function(since){
  var days = [];
  Object.keys(HC.state.days).sort().forEach(function(k){
    if(since && k < since) return;
    var cs = HC.getDay(k).sessions.filter(function(s){ return s.type === "cardio"; });
    if(!cs.length) return;
    var vs = cs.map(HC.sessionVerdict);
    var bad = vs.some(function(v){ return v.cls === "warn"; });
    var pend = !bad && vs.some(function(v){ return v.pending; });
    days.push({ date: k, bad: bad, pending: pend, ok: !bad && !pend });
  });
  var streak = 0, lastBad = null;
  for(var i = days.length - 1; i >= 0; i--){ if(days[i].bad) break; if(days[i].ok) streak++; }
  days.forEach(function(x){ if(x.bad) lastBad = x.date; });
  return { days: days, streak: streak, okDays: days.filter(function(x){ return x.ok; }).length, lastBad: lastBad };
};

HC.STEP_DAYS_NEEDED = 5;   // tolerated cardio days in a row at this band
HC.STEP_MIN_DAYS = 7;      // and at least a week at it ("each week increase by 5 bpm")
HC.GYM_DAYS_NEEDED = 2;    // "2 days of light cardio only and see if he is symptomatic"

HC.planStatus = function(){
  var p = HC.state.profile, t = HC.todayKey();
  var band = HC.cardioDays(p.bandSince), all = HC.cardioDays(p.planStart);
  var gymUnlocked = !!p.gymOverride || all.okDays >= HC.GYM_DAYS_NEEDED;
  var phase = p.physioHeadUpDown ? 3 : (gymUnlocked ? 2 : 1);
  var daysSinceBand = HC.diffDays(p.bandSince, t);
  var quietWeek = !band.lastBad || HC.diffDays(band.lastBad, t) >= 7;
  return {
    phase: phase, streak: band.streak, daysSinceBand: daysSinceBand, lastBad: band.lastBad,
    stepUpReady: band.streak >= HC.STEP_DAYS_NEEDED && daysSinceBand >= HC.STEP_MIN_DAYS && quietWeek,
    gymUnlocked: gymUnlocked, okDaysAll: all.okDays
  };
};

/* BCTT (Buffalo Concussion Treadmill Test) retest every 2 weeks */
HC.bcttDue = function(){
  var s = HC.state;
  if(s.bcttNext) return s.bcttNext;
  if(s.bctt.length) return HC.addDays(s.bctt.map(function(b){ return b.date; }).sort().pop(), 14);
  return null;
};
HC.bcttCompact = function(){
  var due = HC.bcttDue();
  if(!due) return "—";
  var n = HC.diffDays(HC.todayKey(), due);
  return n < 0 ? "late" : n === 0 ? "today" : n + "d";
};
HC.bcttPhrase = function(){
  var due = HC.bcttDue();
  if(!due) return "No date set";
  var n = HC.diffDays(HC.todayKey(), due);
  var when = n < 0 ? Math.abs(n) + " day" + (Math.abs(n) === 1 ? "" : "s") + " overdue" : n === 0 ? "due today" : "in " + n + " day" + (n === 1 ? "" : "s");
  return HC.fmtDate(due) + " · " + when;
};
// keeps the reminder Worker's copy of the next BCTT date current (date only, nothing else)
HC.syncConfig = function(){
  try{
    fetch(HC.WORKER_URL + "/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bcttDue: HC.bcttDue() }) }).catch(function(){});
  }catch(e){}
};

/* ---------------- symptom evaluation helpers (used by today + history) ---------------- */
HC.hiaSeverity = function(day){
  var sum = 0;
  HC.HIA_SYMPTOMS.forEach(function(s){ var v = day.hia && day.hia[s.id]; if(typeof v === "number") sum += v; });
  return sum;
};
HC.hiaCount = function(day){
  var n = 0;
  HC.HIA_SYMPTOMS.forEach(function(s){ var v = day.hia && day.hia[s.id]; if(typeof v === "number" && v > 0) n++; });
  return n;
};
HC.hiaTouched = function(day){
  return !!(day.hia && HC.HIA_SYMPTOMS.some(function(s){ return typeof day.hia[s.id] === "number"; }));
};

HC.isHiddenRhythm = function(blockKey, itemId){ return !!HC.state.hidden.rhythm[blockKey + ":" + itemId]; };
HC.isHiddenStanding = function(itemId){ return !!HC.state.hidden.standing[itemId]; };

})();
