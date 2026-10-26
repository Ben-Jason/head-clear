/* train.js — session logging (cardio, gym, rehab, physio), the gym gate,
   the session timer, and the BCTT log. */
(function(){
"use strict";
var HC = window.HC, el = HC.el, $ = HC.$;

function types(){ return HC.plan.sessionTypes; }
function typeDef(id){ return types().filter(function(t){ return t.id === id; })[0] || types()[0]; }
function defaultStart(minutes){
  var d = new Date(); d.setMinutes(d.getMinutes() - minutes);
  return HC.minToHm(Math.round((d.getHours() * 60 + d.getMinutes()) / 5) * 5);
}
function newForm(type){
  var def = typeDef(type || "cardio");
  return { type: def.id, dateKey: HC.todayKey(), duration: def.defMin, start: defaultStart(def.defMin), avgHr: "", peakHr: "",
    upright: true, outdoors: false, before: null, worst: null, after: null, posture: [false, false, false, false], focus: [], notes: "" };
}
var F = newForm("cardio");

/* ---------------- rule box + gym gate ---------------- */
function renderRule(){
  var box = $("trainRule");
  box.innerHTML = "";
  box.appendChild(el("b", { text: "The rules: " }));
  box.appendChild(document.createTextNode(HC.fmt(HC.plan.trainRule)));
}

function renderGate(){
  var ps = HC.planStatus(), box = $("gymGateCard");
  box.innerHTML = "";
  box.appendChild(el("div", { class: "block-head", style: "margin-bottom:6px;" }, [
    el("div", { class: "section-title", style: "margin:0;", text: "Gym" }),
    el("span", { class: "phase-pill " + (ps.gymUnlocked ? "open" : ""), text: ps.gymUnlocked ? "Unlocked" : "Locked" })
  ]));
  if(ps.gymUnlocked){
    box.appendChild(el("p", { class: "small", text: HC.fmt(HC.plan.gymNote) }));
  } else {
    box.appendChild(el("p", { class: "small", style: "margin-bottom:8px;", text: "Needs " + HC.GYM_DAYS_NEEDED + " tolerated cardio-only days first (" + Math.min(ps.okDaysAll, HC.GYM_DAYS_NEEDED) + "/" + HC.GYM_DAYS_NEEDED + "). Your physio can okay it sooner — switch that on under Plan." }));
    box.appendChild(el("div", { class: "progress" }, [el("i", { style: "width:" + Math.round(Math.min(ps.okDaysAll, HC.GYM_DAYS_NEEDED) / HC.GYM_DAYS_NEEDED * 100) + "%;" })]));
  }
}

/* ---------------- plan warnings for a session about to be logged ---------------- */
function planWarnings(f){
  var w = [], ps = HC.planStatus(), gap = HC.state.profile.gymGapHours * 60;
  if(f.type === "gym" && !ps.gymUnlocked) w.push("Gym isn't unlocked yet — your plan needs " + HC.GYM_DAYS_NEEDED + " tolerated cardio-only days first.");
  if(HC.plan.options.headUpright && (f.type === "gym" || f.type === "cardio") && f.upright === false) w.push("Cardio and gym are head-upright only.");
  if(f.type === "gym" || f.type === "cardio"){
    var other = f.type === "gym" ? "cardio" : "gym", day = HC.peekDay(f.dateKey), st = HC.hmToMin(f.start);
    if(day && st !== null){
      day.sessions.forEach(function(s){
        if(s.type !== other) return;
        var os = HC.hmToMin(s.startTime);
        if(os === null) return;
        var oe = os + (s.duration || 0), fe = st + (f.duration || 0);
        var sep = st >= os ? st - oe : os - fe; // gap between the earlier one ending and the later one starting
        if(sep < gap){
          var gymStart = f.type === "gym" ? st : os, cardioEnd = f.type === "gym" ? oe : st + (f.duration || 0);
          if(gymStart >= cardioEnd - 1) w.push("Gym is too soon after cardio (cardio ends " + HC.minToHm(cardioEnd) + "). Your physio says not directly after — aim for " + HC.minToHm(cardioEnd + gap) + " or later.");
          else w.push("Cardio and gym are less than " + HC.state.profile.gymGapHours + " h apart.");
        }
      });
    }
  }
  return w.filter(function(x, i, a){ return a.indexOf(x) === i; });
}

/* ---------------- form ---------------- */
function field(label, node, hint){
  return el("div", { class: "field" }, [el("label", { text: label }), node, hint || null]);
}
function seg(options, isOn, onPick, cls){
  var wrap = el("div", { class: "seg " + (cls || "") });
  options.forEach(function(o){ wrap.appendChild(el("button", { type: "button", class: isOn(o.v) ? "on" : "", text: o.l, onclick: function(){ onPick(o.v); } })); });
  return wrap;
}
function numInput(val, min, max, onInput, ph){
  return el("input", { type: "number", inputmode: "numeric", min: min, max: max, placeholder: ph || "", value: val === "" || val === null ? null : String(val),
    oninput: function(e){ var v = e.target.value; onInput(v === "" ? "" : +v); } });
}
function pulseRow(label, key, required){
  var scale = el("div", { class: "scale-row" });
  function paint(){ HC.renderScale(scale, F[key], function(v){ F[key] = v; scale.classList.remove("err"); paint(); }); }
  paint();
  var wrap = el("div", { class: "field" }, [el("label", { text: label + (required ? "" : " (optional)") }), scale]);
  wrap._scale = scale;
  return wrap;
}

var refs = {};
function renderForm(){
  var box = $("sessionFormCard"), def = typeDef(F.type), ceil = HC.state.profile.hrHigh;
  box.innerHTML = "";
  refs = {};
  box.appendChild(el("div", { class: "section-title", text: "Log a session" }));

  box.appendChild(field("Type", seg(types().map(function(t){ return { v: t.id, l: t.label }; }), function(v){ return F.type === v; }, function(v){
    var keep = { dateKey: F.dateKey, notes: F.notes };
    F = newForm(v); F.dateKey = keep.dateKey; F.notes = keep.notes; renderForm();
  })));

  var t = HC.todayKey(), y = HC.addDays(t, -1);
  box.appendChild(field("Day", seg([{ v: t, l: "Today" }, { v: y, l: "Yesterday" }], function(v){ return F.dateKey === v; }, function(v){ F.dateKey = v; renderForm(); })));

  refs.duration = numInput(F.duration, 1, 300, function(v){ F.duration = v; refs.duration.classList.remove("err"); });
  box.appendChild(el("div", { class: "row2" }, [
    field("Started at", el("input", { type: "time", value: F.start, oninput: function(e){ F.start = e.target.value; } })),
    field("Minutes", refs.duration)
  ]));

  if(F.type === "cardio"){
    var peakHint = el("p", { class: "hint", text: "From Garmin Connect's activity summary." });
    function checkPeak(){
      if(F.peakHr !== "" && F.peakHr > ceil){ peakHint.className = "hint bad"; peakHint.textContent = "Over your " + ceil + " bpm ceiling — this session will be flagged."; }
      else if(F.peakHr !== ""){ peakHint.className = "hint"; peakHint.textContent = "Under your " + ceil + " bpm ceiling."; }
      else { peakHint.className = "hint"; peakHint.textContent = "From Garmin Connect's activity summary."; }
    }
    refs.peak = numInput(F.peakHr, 40, 230, function(v){ F.peakHr = v; refs.peak.classList.remove("err"); checkPeak(); }, "bpm");
    box.appendChild(el("div", { class: "row2" }, [
      field("Average HR", numInput(F.avgHr, 40, 230, function(v){ F.avgHr = v; }, "bpm")),
      field("Peak HR", refs.peak)
    ]));
    box.appendChild(peakHint);
    checkPeak();
  }

  if(HC.plan.options.headUpright && (F.type === "cardio" || F.type === "gym")){
    box.appendChild(field("Head upright?", seg([{ v: true, l: "Yes" }, { v: false, l: "No" }], function(v){ return F.upright === v; }, function(v){ F.upright = v; renderForm(); }, "tight")));
  }
  if(HC.plan.options.outdoors && F.type === "cardio"){
    box.appendChild(field("Outdoors?", seg([{ v: false, l: "No" }, { v: true, l: "Yes" }], function(v){ return F.outdoors === v; }, function(v){ F.outdoors = v; renderForm(); }, "tight"),
      F.outdoors ? el("p", { class: "hint warn", text: "Sunglasses and a hat." }) : null));
  }

  var warnNow = planWarnings(F);
  if(warnNow.length) box.appendChild(el("div", { class: "stack", style: "gap:4px;" }, warnNow.map(function(m){ return el("p", { class: "hint warn", text: "⚠ " + m }); })));

  if((F.type === "gym" || F.type === "physio") && HC.plan.postureSteps.length){
    var rows = el("div", { class: "check-list" });
    HC.plan.postureSteps.forEach(function(txt, i){
      var b = el("button", { type: "button", class: "check-item" + (F.posture[i] ? " done" : ""), onclick: function(){ F.posture[i] = !F.posture[i]; b.classList.toggle("done", F.posture[i]); } }, [
        el("span", { class: "box", html: HC.ICON_CHECK }), el("span", { class: "txt" }, [el("b", { text: txt })])
      ]);
      rows.appendChild(b);
    });
    box.appendChild(field("Starting position set first", rows,
      HC.plan.postureHint ? el("p", { class: "hint", text: HC.plan.postureHint }) : null));
  }
  if(F.type === "physio"){
    box.appendChild(field("Focus", seg(HC.plan.physioFocus.map(function(f){ return { v: f, l: f }; }), function(v){ return F.focus.indexOf(v) >= 0; }, function(v){
      var i = F.focus.indexOf(v); if(i >= 0) F.focus.splice(i, 1); else F.focus.push(v); renderForm();
    }, "tight")));
  }

  refs.before = pulseRow("Symptoms before (0–10)", "before", true);
  refs.worst = pulseRow("Worst during (0–10)", "worst", false);
  refs.after = pulseRow("Symptoms right after (0–10)", "after", true);
  box.appendChild(refs.before); box.appendChild(refs.worst); box.appendChild(refs.after);

  box.appendChild(field("Notes", el("textarea", { class: "journal", style: "min-height:56px;", placeholder: F.type === "vor" ? "Which exercises, and what they felt like" : "Anything worth remembering",
    oninput: function(e){ F.notes = e.target.value; } , text: F.notes })));

  box.appendChild(el("button", { class: "btn btn-primary", type: "button", text: "Save session", onclick: saveSession }));
  box.appendChild(el("p", { class: "hint", text: "Tomorrow morning the app asks how you feel — that completes the check." }));
}

function flashErr(node){ if(!node) return; node.classList.add("err"); }

function saveSession(){
  var bad = false;
  if(!(F.duration > 0)){ flashErr(refs.duration); bad = true; }
  if(F.type === "cardio" && !(F.peakHr > 0)){ flashErr(refs.peak); bad = true; }
  if(typeof F.before !== "number"){ flashErr(refs.before._scale); bad = true; }
  if(typeof F.after !== "number"){ flashErr(refs.after._scale); bad = true; }
  if(bad){ HC.toast(F.type === "cardio" ? "Add duration, peak HR, and the before/after scores." : "Add duration and the before/after scores."); return; }
  var warnings = planWarnings(F);
  function commit(){
    var s = { id: HC.uid(), type: F.type, startTime: F.start, duration: F.duration, before: F.before, worst: typeof F.worst === "number" ? F.worst : null,
      after: F.after, nextMorning: null, notes: F.notes.trim(), loggedAt: new Date().toISOString(), planFlags: warnings };
    if(F.type === "cardio"){ s.avgHr = F.avgHr > 0 ? F.avgHr : null; s.peakHr = F.peakHr; s.ceiling = HC.state.profile.hrHigh; s.upright = F.upright; s.outdoors = F.outdoors; }
    if(F.type === "gym"){ s.upright = F.upright; }
    if((F.type === "gym" || F.type === "physio") && HC.plan.postureSteps.length){ s.postureSet = F.posture.slice(0, HC.plan.postureSteps.length).every(Boolean); }
    if(F.type === "physio"){ s.focus = F.focus.slice(); }
    var day = HC.getDay(F.dateKey);
    day.sessions.push(s);
    var item = typeDef(F.type).item;
    if(item) day.midday[item] = true;
    HC.save();
    var v = HC.sessionVerdict(s);
    F = newForm(F.type);
    renderForm(); renderSessions(); renderGate();
    HC.toast(v.cls === "warn" ? "Logged — flagged: " + v.label : "Session logged.");
  }
  if(warnings.length) HC.confirm({ title: "Heads up before logging", message: warnings.join(" "), confirmLabel: "Log it anyway", onConfirm: commit });
  else commit();
}

/* ---------------- sessions list ---------------- */
function line(parts){
  var node = el("div", { class: "sess-meta" });
  parts.forEach(function(p){ node.appendChild(typeof p === "string" ? document.createTextNode(p) : p); });
  return node;
}
function bold(t){ return el("b", { text: String(t) }); }
function sessionCard(r){
  var s = r.s, v = HC.sessionVerdict(s), t = HC.todayKey();
  var card = el("div", { class: "dose-item" });
  card.appendChild(el("div", { class: "dose-top" }, [
    el("b", { text: HC.typeLabel(s.type) + (s.duration ? " · " + s.duration + " min" : "") }),
    el("span", { text: (r.date === t ? "Today" : "Yesterday") + (s.startTime ? " · " + s.startTime : "") })
  ]));
  card.appendChild(el("div", { class: "badge " + v.cls, text: v.label }));
  if(s.type === "cardio"){
    card.appendChild(line(["Avg HR ", bold(s.avgHr || "—"), " · Peak ", bold(s.peakHr || "—"), " / ceiling ", bold(s.ceiling || HC.state.profile.hrHigh), HC.plan.options.headUpright ? (s.upright === false ? " · head NOT upright" : " · head upright") : "", s.outdoors ? " · outdoors" : ""]));
  }
  if(s.type === "gym" && HC.plan.postureSteps.length) card.appendChild(line([HC.plan.options.headUpright ? (s.upright === false ? "Head NOT upright · " : "Head upright · ") : "", s.postureSet ? "start position set" : "start position not confirmed"]));
  if(s.type === "physio"){
    if(s.focus && s.focus.length) card.appendChild(line(["Focus: " + s.focus.join(", ")]));
    if(HC.plan.postureSteps.length) card.appendChild(line([s.postureSet ? "Start position set" : "Start position not confirmed"]));
  }
  card.appendChild(line(["Before ", bold(s.before), " · During ", bold(typeof s.worst === "number" ? s.worst : "—"), " · After ", bold(s.after), " · Next morning ", bold(typeof s.nextMorning === "number" ? s.nextMorning : "—")]));
  if(s.notes) card.appendChild(line([s.notes]));
  if(s.planFlags && s.planFlags.length) s.planFlags.forEach(function(m){ card.appendChild(el("p", { class: "hint warn", text: "⚠ " + m })); });
  var actions = el("div", { class: "sess-actions" });
  if(typeof s.nextMorning !== "number" && r.date < t){
    actions.appendChild(el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Log next-morning score", onclick: function(){
      HC.promptScore("Next morning", "How did your symptoms feel the morning after this session? 0 (none) to 10 (severe).", function(v2){ s.nextMorning = v2; s.nextMorningAt = new Date().toISOString(); HC.save(); });
    } }));
  }
  actions.appendChild(el("button", { class: "link-btn del", type: "button", text: "Delete", onclick: function(){
    HC.confirm({ title: "Delete this session?", message: "It's removed from your streaks and history. This can't be undone.", confirmLabel: "Delete", danger: true, onConfirm: function(){
      var d = HC.getDay(r.date); d.sessions = d.sessions.filter(function(x){ return x.id !== s.id; }); HC.save();
    } });
  } }));
  card.appendChild(actions);
  return card;
}
function renderSessions(){
  var box = $("sessionsCard"), t = HC.todayKey(), rows = [];
  box.innerHTML = "";
  box.appendChild(el("div", { class: "section-title", style: "margin-bottom:10px;", text: "Today & yesterday" }));
  [0, 1].forEach(function(n){
    var k = HC.addDays(t, -n), d = HC.peekDay(k);
    if(d) d.sessions.forEach(function(s){ rows.push({ date: k, s: s }); });
  });
  if(!rows.length){ box.appendChild(el("p", { class: "small", text: "Nothing logged yet." })); return; }
  rows.sort(function(a, b){ return a.date !== b.date ? (a.date < b.date ? 1 : -1) : ((b.s.startTime || "") < (a.s.startTime || "") ? -1 : 1); });
  var list = el("div", { class: "sess-list" });
  rows.forEach(function(r){ list.appendChild(sessionCard(r)); });
  box.appendChild(list);
}

/* ---------------- session timer (dark, dim countdown) ---------------- */
var timer = null, tickId = null, wakeLock = null, audioCtx = null;
function timerTypes(){ return types().filter(function(t){ return t.timer; }); }
function renderTimerCard(){
  var box = $("timerCard"), tt = timerTypes();
  box.innerHTML = "";
  if(!tt.length){ box.hidden = true; return; }
  box.hidden = false;
  var tType = tt[0].id, tMin = tt[0].defMin;
  box.appendChild(el("div", { class: "section-title", style: "margin-bottom:6px;", text: "Session timer" }));
  box.appendChild(el("p", { class: "small", style: "margin-bottom:10px;", text: "A dark, dim countdown for timed sessions. When it ends, one tap logs the session." }));
  var minsInput = el("input", { type: "number", inputmode: "numeric", min: 1, max: 120, value: String(tMin), oninput: function(e){ tMin = +e.target.value; } });
  var typeSeg = el("div", { class: "seg tight" });
  function paintSeg(){
    typeSeg.innerHTML = "";
    tt.forEach(function(o){
      typeSeg.appendChild(el("button", { type: "button", class: tType === o.id ? "on" : "", text: o.label, onclick: function(){ tType = o.id; minsInput.value = o.defMin; tMin = o.defMin; paintSeg(); } }));
    });
  }
  paintSeg();
  box.appendChild(el("div", { class: "row2" }, [field("Type", typeSeg), field("Minutes", minsInput)]));
  box.appendChild(el("button", { class: "btn btn-primary", type: "button", style: "margin-top:12px;", text: "Start timer", onclick: function(){
    if(!(tMin > 0)){ HC.toast("Enter the minutes."); return; }
    startTimer(tType, tMin);
  } }));
}
function startTimer(type, min){
  try{ var AC = window.AudioContext || window.webkitAudioContext; if(AC && !audioCtx) audioCtx = new AC(); if(audioCtx && audioCtx.state === "suspended") audioCtx.resume(); }catch(e){}
  timer = { type: type, total: min, endAt: Date.now() + min * 60000, startedAt: Date.now() };
  requestWake();
  var ov = $("timerOverlay");
  ov.hidden = false; ov.innerHTML = "";
  ov.appendChild(el("div", { class: "tlabel", text: HC.typeLabel(type) }));
  ov.appendChild(el("div", { class: "tnum", id: "tnum", text: fmtLeft(min * 60000) }));
  ov.appendChild(el("button", { type: "button", text: "Stop", onclick: function(){ stopTimer(false); } }));
  clearInterval(tickId); tickId = setInterval(tick, 500);
}
function fmtLeft(ms){ var s = Math.ceil(ms / 1000), m = Math.floor(s / 60); return HC.pad(m) + ":" + HC.pad(s % 60); }
function tick(){
  if(!timer) return;
  var left = timer.endAt - Date.now();
  var n = $("tnum"); if(n) n.textContent = fmtLeft(Math.max(0, left));
  if(left <= 0) finishTimer();
}
function beep(){
  try{
    if(!audioCtx) return;
    [0, 0.45, 0.9].forEach(function(off){
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 660; g.gain.value = 0.04;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(audioCtx.currentTime + off); o.stop(audioCtx.currentTime + off + 0.25);
    });
  }catch(e){}
}
function finishTimer(){
  clearInterval(tickId); releaseWake(); beep();
  var t = timer, ov = $("timerOverlay");
  ov.innerHTML = "";
  ov.appendChild(el("div", { class: "tlabel", text: "Done" }));
  ov.appendChild(el("div", { class: "tnum", text: "00:00" }));
  ov.appendChild(el("button", { type: "button", text: "Log this session", onclick: function(){
    ov.hidden = true; ov.innerHTML = ""; timer = null;
    F = newForm(t.type); F.duration = t.total; F.start = defaultStart(t.total);
    HC.switchTab("train"); renderForm(); $("sessionFormCard").scrollIntoView({ block: "start" });
  } }));
  ov.appendChild(el("button", { type: "button", text: "Close", onclick: function(){ ov.hidden = true; ov.innerHTML = ""; timer = null; } }));
}
function stopTimer(){ clearInterval(tickId); releaseWake(); timer = null; var ov = $("timerOverlay"); ov.hidden = true; ov.innerHTML = ""; }
function requestWake(){ try{ if(navigator.wakeLock) navigator.wakeLock.request("screen").then(function(l){ wakeLock = l; }).catch(function(){}); }catch(e){} }
function releaseWake(){ try{ if(wakeLock){ wakeLock.release(); wakeLock = null; } }catch(e){} }
document.addEventListener("visibilitychange", function(){ if(!document.hidden && timer){ tick(); requestWake(); } });

/* ---------------- BCTT ---------------- */
function renderBctt(){
  var box = $("bcttCard"), list = HC.state.bctt.slice().sort(function(a, b){ return a.date < b.date ? 1 : -1; });
  box.innerHTML = "";
  box.appendChild(el("div", { class: "section-title", style: "margin-bottom:6px;", text: "BCTT retest — every 2 weeks" }));
  box.appendChild(el("p", { class: "small", style: "margin-bottom:10px;", text: "Buffalo Concussion Treadmill Test. Log the heart rate at which symptoms stopped the test." }));
  box.appendChild(el("div", { class: "kv", style: "border-top:none;" }, [el("div", { class: "k", text: "Next test" }), el("div", { class: "v", style: "font-size:12.5px;", text: HC.bcttPhrase() })]));
  if(list.length) box.appendChild(el("div", { class: "kv" }, [el("div", { class: "k", text: "Last test" }), el("div", { class: "v", style: "font-size:12.5px;", text: HC.fmtDate(list[0].date) + (list[0].thresholdHr ? " · " + list[0].thresholdHr + " bpm" : "") })]));
  box.appendChild(el("div", { class: "summary-actions", style: "margin-top:10px;" }, [
    el("button", { class: "btn btn-primary", type: "button", text: "Log BCTT result", onclick: logBctt }),
    el("button", { class: "btn btn-ghost", type: "button", text: "Change date", onclick: changeBcttDate })
  ]));
  if(list.length > 1){
    var hist = el("div", { style: "margin-top:12px;" });
    list.slice(0, 5).forEach(function(b){
      hist.appendChild(el("div", { class: "kv" }, [el("div", { class: "k", text: HC.fmtDate(b.date) }), el("div", { class: "v", style: "font-size:12.5px;", text: (b.thresholdHr ? b.thresholdHr + " bpm" : "—") + (b.note ? " · " + b.note : "") })]));
    });
    box.appendChild(hist);
  }
}
function logBctt(){
  var date = el("input", { type: "date", value: HC.todayKey() });
  var hr = el("input", { type: "number", inputmode: "numeric", min: 40, max: 230, placeholder: "bpm" });
  var note = el("input", { type: "text", placeholder: "e.g. dizzy at 8 min" });
  HC.openModal([
    el("h3", { text: "Log BCTT result" }),
    field("Test date", date), field("HR when symptoms stopped the test", hr), field("Note", note),
    el("div", { class: "modal-actions" }, [
      el("button", { class: "btn btn-ghost", type: "button", text: "Cancel", onclick: HC.closeModal }),
      el("button", { class: "btn btn-primary", type: "button", text: "Save", onclick: function(){
        if(!date.value){ date.classList.add("err"); return; }
        HC.state.bctt.push({ id: HC.uid(), date: date.value, thresholdHr: hr.value ? +hr.value : null, note: note.value.trim() });
        HC.state.bcttNext = null;
        HC.save(); HC.syncConfig(); HC.closeModal(); renderBctt();
        HC.toast("Logged. Next retest: " + HC.bcttPhrase());
      } })
    ])
  ]);
}
function changeBcttDate(){
  var due = HC.bcttDue() || HC.todayKey();
  var date = el("input", { type: "date", value: due });
  HC.openModal([
    el("h3", { text: "Next BCTT date" }),
    field("Date", date),
    el("div", { class: "modal-actions" }, [
      el("button", { class: "btn btn-ghost", type: "button", text: "Cancel", onclick: HC.closeModal }),
      el("button", { class: "btn btn-primary", type: "button", text: "Save", onclick: function(){
        if(!date.value){ date.classList.add("err"); return; }
        HC.state.bcttNext = date.value;
        HC.save(); HC.syncConfig(); HC.closeModal(); renderBctt();
      } })
    ])
  ]);
}

/* ---------------- wiring ---------------- */
HC.resetTrainUI = function(){ F = newForm("cardio"); };
HC.on.render.push(function(){ renderRule(); renderGate(); renderForm(); renderSessions(); renderTimerCard(); renderBctt(); });
HC.on.refresh.push(function(){ renderRule(); renderGate(); renderSessions(); renderBctt(); });
HC.on.show.train = [function(){ renderRule(); renderGate(); renderForm(); renderSessions(); renderBctt(); }];
})();
