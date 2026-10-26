/* history.js — streaks, heatmap, cardio + sleep charts, day-by-day list and
   detail, and the plain-text summary for the physio. */
(function(){
"use strict";
var HC = window.HC, el = HC.el, $ = HC.$;

var LEGACY_LABELS = { scoreIt: "Score before / after / +1hr" };
var STREAK_MILESTONES = [3, 7, 14, 30];

/* ---------------- completion + streaks ---------------- */
function countTrue(obj){ var n = 0; for(var k in obj){ if(obj[k] === true) n++; } return n; }
function dayCompletedCount(day){
  var n = countTrue(day.wake) + countTrue(day.midday) + countTrue(day.afternoon) + countTrue(day.evening) + countTrue(day.bed) + countTrue(day.standing);
  HC.state.meds.forEach(function(m){ if(day.meds && day.meds[m.id]) n++; });
  return n;
}
function totalVisibleItems(){
  var n = 0;
  HC.rhythm().forEach(function(b){ b.items.forEach(function(it){ if(!HC.isHiddenRhythm(b.key, it.id)) n++; }); });
  HC.standingItems().forEach(function(it){ if(!HC.isHiddenStanding(it.id)) n++; });
  return n + HC.state.meds.length;
}
function completionRatio(day){ var t = totalVisibleItems(); return (t <= 0 || !day) ? 0 : Math.min(1, dayCompletedCount(day) / t); }
function heatLevel(r){ return r <= 0 ? 0 : r < 0.25 ? 1 : r < 0.5 ? 2 : r < 0.75 ? 3 : 4; }
function heatColor(l){ return "color-mix(in srgb, var(--good) " + [0, 25, 50, 75, 100][l] + "%, var(--surface-2))"; }

function habitStreaks(){
  var current = 0, cd = new Date();
  for(var i = 0; i < 400; i++){
    var key = HC.dateKey(cd), day = HC.state.days[key];
    if(!(day && dayCompletedCount(day) > 0)){
      if(key === HC.todayKey()){ cd.setDate(cd.getDate() - 1); continue; }
      break;
    }
    current++; cd.setDate(cd.getDate() - 1);
  }
  var best = 0, run = 0, prev = null;
  Object.keys(HC.state.days).sort().forEach(function(key){
    if(dayCompletedCount(HC.state.days[key]) <= 0){ run = 0; prev = null; return; }
    var d = HC.parseKey(key);
    run = (prev && Math.round((d - prev) / 86400000) === 1) ? run + 1 : 1;
    if(run > best) best = run;
    prev = d;
  });
  return { current: current, best: Math.max(best, current) };
}

function renderStreaks(){
  var root = $("streakStats"), s = habitStreaks();
  root.innerHTML = "";
  [[s.current, "Current streak"], [s.best, "Best streak"], [Object.keys(HC.state.days).length, "Days logged"]].forEach(function(r){
    root.appendChild(el("div", { class: "stat-tile" }, [el("b", { text: String(r[0]) }), el("span", { text: r[1] })]));
  });
  var badges = $("streakBadges"); badges.innerHTML = "";
  STREAK_MILESTONES.forEach(function(m){
    var on = s.best >= m;
    badges.appendChild(el("div", { class: "streak-badge" + (on ? " earned" : ""), text: (on ? "🔥 " : "") + m + "-day streak" }));
  });
}

function renderHeatmap(){
  var root = $("heatmap"), legend = $("legendCells");
  root.innerHTML = "";
  if(!legend.children.length) for(var L = 0; L < 5; L++) legend.appendChild(el("div", { class: "heat-cell", style: "background:" + heatColor(L) + ";" }));
  var today = new Date(); today.setHours(12, 0, 0, 0);
  var start = new Date(today); start.setDate(start.getDate() - 83); start.setDate(start.getDate() - start.getDay());
  var end = new Date(today); end.setDate(end.getDate() + (6 - end.getDay()));
  for(var d = new Date(start); d <= end; d.setDate(d.getDate() + 1)){
    var key = HC.dateKey(d), day = HC.state.days[key];
    if(d > today){ root.appendChild(el("div", { class: "heat-cell future" })); continue; }
    var cell = el("div", { class: "heat-cell", style: "background:" + heatColor(day ? heatLevel(completionRatio(day)) : 0) + ";" + (day ? "cursor:pointer;" : "") });
    if(day){ cell.title = key; (function(k){ cell.addEventListener("click", function(){ showDayDetail(k); }); })(key); }
    root.appendChild(cell);
  }
}

/* ---------------- cardio chart: peak HR vs ceiling ---------------- */
function renderCardioChart(){
  var box = $("cardioChartCard");
  box.innerHTML = "";
  box.appendChild(el("div", { class: "section-title", style: "margin-bottom:10px;", text: "Cardio — peak HR vs ceiling" }));
  var rows = HC.allSessions().filter(function(r){ return r.s.type === "cardio" && typeof r.s.peakHr === "number"; }).slice(-14);
  if(!rows.length){ box.appendChild(el("p", { class: "small", text: "Log a cardio session in Train and it shows up here." })); return; }
  var vals = [];
  rows.forEach(function(r){ vals.push(r.s.peakHr); vals.push(r.s.ceiling || HC.state.profile.hrHigh); });
  var lo = Math.floor((Math.min.apply(null, vals) - 15) / 5) * 5, hi = Math.ceil((Math.max.apply(null, vals) + 5) / 5) * 5;
  function pct(v){ return Math.max(2, Math.min(100, (v - lo) / (hi - lo) * 100)); }
  var chart = el("div", { class: "chart" });
  rows.forEach(function(r){
    var v = HC.sessionVerdict(r.s), ceil = r.s.ceiling || HC.state.profile.hrHigh;
    chart.appendChild(el("div", { class: "col" }, [
      el("div", { class: "val", text: String(r.s.peakHr) }),
      el("div", { class: "barwrap" }, [
        el("div", { class: "bar " + (v.cls === "warn" ? "warn" : v.cls === "wait" ? "pend" : ""), style: "height:" + pct(r.s.peakHr) + "%;" }),
        el("div", { class: "ceil", style: "bottom:" + pct(ceil) + "%;" })
      ]),
      el("div", { class: "lab", text: String(HC.parseKey(r.date).getDate()) })
    ]));
  });
  box.appendChild(chart);
  box.appendChild(el("div", { class: "chart-legend" }, [
    el("span", {}, [el("i", { style: "background:var(--accent);" }), "Tolerated"]),
    el("span", {}, [el("i", { style: "background:var(--danger);" }), "Flagged"]),
    el("span", {}, [el("i", { style: "background:var(--ink-faint);" }), "Awaiting morning"]),
    el("span", {}, [el("i", { class: "dash" }), "Ceiling"])
  ]));
}

/* ---------------- sleep chart (Garmin sleep score) ---------------- */
function renderSleepChart(){
  var box = $("sleepChartCard"), t = HC.todayKey(), sum = 0, n = 0;
  box.innerHTML = "";
  box.appendChild(el("div", { class: "section-title", style: "margin-bottom:10px;", text: "Sleep score — last 14 nights" }));
  var chart = el("div", { class: "chart" });
  for(var i = 13; i >= 0; i--){
    var k = HC.addDays(t, -i), d = HC.peekDay(k), v = d && typeof d.sleep.score === "number" ? d.sleep.score : null;
    if(v !== null){ sum += v; n++; }
    chart.appendChild(el("div", { class: "col" }, [
      el("div", { class: "val", text: v === null ? "" : String(v) }),
      el("div", { class: "barwrap" }, [el("div", { class: "bar" + (v === null ? " pend" : ""), style: "height:" + (v === null ? 3 : Math.max(4, v)) + "%;" + (v === null ? "opacity:.35;" : "") })]),
      el("div", { class: "lab", text: String(HC.parseKey(k).getDate()) })
    ]));
  }
  box.appendChild(chart);
  box.appendChild(el("p", { class: "small", style: "margin-top:10px;", text: n ? "Average " + Math.round(sum / n) + "/100 over " + n + " logged night" + (n === 1 ? "" : "s") + "." : "Log last night's Garmin sleep score on Today each morning." }));
}

/* ---------------- day list + detail ---------------- */
function renderList(){
  var root = $("historyList"), keys = Object.keys(HC.state.days).sort().reverse();
  root.innerHTML = "";
  if(!keys.length){ root.appendChild(el("p", { class: "small", style: "text-align:center; padding:20px 0;", text: "No days logged yet." })); return; }
  keys.forEach(function(key){
    var day = HC.getDay(key), sc = day.symptomScore, none = sc === null || sc === undefined;
    var meta = [dayCompletedCount(day) + " done"];
    if(day.sessions.length) meta.push(day.sessions.length + " session" + (day.sessions.length > 1 ? "s" : ""));
    root.appendChild(el("button", { type: "button", class: "history-row", onclick: function(){ showDayDetail(key); } }, [
      el("div", { class: "hist-date", text: key === HC.todayKey() ? "Today" : HC.fmtDate(key) }),
      el("div", { class: "hist-mid" }, [
        el("span", { class: "hist-dot", style: "background:" + (none ? "var(--ink-faint)" : sc <= 2 ? "var(--good)" : sc <= 5 ? "var(--warn)" : "var(--danger)") + ";" }),
        el("span", { class: "hist-score", text: none ? "—" : sc + "/10" })
      ]),
      el("div", { class: "hist-meta", text: meta.join(" · ") })
    ]));
  });
}

function group(title, lines){
  return el("div", { class: "detail-group" }, [el("div", { class: "section-title", style: "margin:0 0 2px;", text: title })].concat(lines.map(function(t){ return el("div", { class: "detail-line", text: t }); })));
}
function sessionLine(s){
  var v = HC.sessionVerdict(s), bits = [HC.typeLabel(s.type) + (s.duration ? " " + s.duration + " min" : "")];
  if(s.type === "cardio") bits.push("avg " + (s.avgHr || "—") + " / peak " + (s.peakHr || "—") + " (ceiling " + (s.ceiling || "—") + ")");
  bits.push("symptoms " + s.before + " → " + (typeof s.worst === "number" ? s.worst + " → " : "") + s.after + (typeof s.nextMorning === "number" ? " → " + s.nextMorning + " next morning" : ""));
  bits.push(v.label);
  return bits.join(" · ");
}
function showDayDetail(key){
  var day = HC.getDay(key), body = el("div", { class: "stack", style: "gap:14px; max-height:56vh; overflow-y:auto; padding-right:2px;" });
  var sc = day.symptomScore;
  body.appendChild(el("div", { class: "kv", style: "border-top:none;" }, [el("div", { class: "k", text: "Overall symptoms" }), el("div", { class: "v", text: (sc === null || sc === undefined) ? "Not logged" : sc + "/10" })]));
  if(HC.hiaTouched(day)){
    body.appendChild(el("div", { class: "kv" }, [el("div", { class: "k", text: "HIA severity score" }), el("div", { class: "v", text: HC.hiaSeverity(day) + " / " + HC.HIA_MAX + " (" + HC.hiaCount(day) + " symptoms)" })]));
    body.appendChild(group("Symptom evaluation", HC.HIA_SYMPTOMS.filter(function(s){ return typeof day.hia[s.id] === "number"; }).map(function(s){ return s.label + " — " + day.hia[s.id] + "/6"; })));
  }
  if(day.sessions.length) body.appendChild(group("Sessions", day.sessions.map(sessionLine)));
  var sl = day.sleep, sleepBits = [];
  if(typeof sl.score === "number") sleepBits.push("score " + sl.score + "/100");
  if(typeof sl.hours === "number") sleepBits.push(sl.hours + " h");
  if(sleepBits.length) body.appendChild(group("Sleep", [sleepBits.join(" · ")]));
  var medsTaken = HC.state.meds.filter(function(m){ return day.meds[m.id]; }).map(function(m){ return "✓ " + m.name; });
  if(medsTaken.length) body.appendChild(group("Meds & supplements", medsTaken));
  HC.rhythm().forEach(function(b){
    var known = b.items.map(function(it){ return it.id; });
    var lines = b.items.filter(function(it){ return day[b.key][it.id] === true; }).map(function(it){ return "✓ " + HC.fmt(it.label); });
    Object.keys(day[b.key]).forEach(function(id){ var lbl = LEGACY_LABELS[id] || HC.state.custom.removedLabels[id]; if(day[b.key][id] === true && known.indexOf(id) < 0 && lbl) lines.push("✓ " + HC.fmt(lbl)); });
    if(lines.length) body.appendChild(group(b.time, lines));
  });
  var knownSt = HC.standingItems().map(function(it){ return it.id; });
  var st = HC.standingItems().filter(function(it){ return day.standing[it.id] === true; }).map(function(it){ return "✓ " + HC.fmt(it.label); });
  Object.keys(day.standing).forEach(function(id){ var lbl = HC.state.custom.removedLabels[id]; if(day.standing[id] === true && knownSt.indexOf(id) < 0 && lbl) st.push("✓ " + lbl); });
  if(st.length) body.appendChild(group("Standing habits", st));
  if(day.doses.length) body.appendChild(group("Earlier aerobic doses (old format)", day.doses.map(function(d){
    return d.activity + " — before " + d.before + ", after " + (d.after === null || d.after === undefined ? "—" : d.after) + ", +1hr " + (d.after1hr === null || d.after1hr === undefined ? "—" : d.after1hr);
  })));
  if(day.journal) body.appendChild(el("div", { class: "detail-group" }, [el("div", { class: "section-title", style: "margin:0 0 2px;", text: "Notes" }), el("div", { class: "detail-line", style: "white-space:pre-wrap; color:var(--ink);", text: day.journal })]));
  if(body.children.length === 1) body.appendChild(el("p", { class: "small", text: "Nothing else logged this day." }));
  HC.openModal([
    el("h3", { text: key === HC.todayKey() ? "Today" : HC.fmtDate(key) }), body,
    el("div", { class: "modal-actions" }, [el("button", { class: "btn btn-primary", type: "button", text: "Close", onclick: HC.closeModal })])
  ]);
}

/* ---------------- plain-text summary for the physio ---------------- */
function buildSummary(){
  var p = HC.state.profile, ps = HC.planStatus(), t = HC.todayKey(), L = [];
  L.push("HEAD CLEAR — progress summary (" + HC.fmtDate(t, { day: "numeric", month: "short", year: "numeric" }) + ")");
  L.push("Phase " + ps.phase + " · " + HC.plan.phaseNames[ps.phase - 1] + " · HR band " + p.hrLow + "–" + p.hrHigh + " bpm (ceiling " + p.hrHigh + ") · tolerated cardio days in a row " + ps.streak + "/" + HC.STEP_DAYS_NEEDED);
  var b = HC.state.bctt.slice().sort(function(x, y){ return x.date < y.date ? 1 : -1; })[0];
  L.push("BCTT: next " + HC.bcttPhrase() + (b ? " · last " + HC.fmtDate(b.date) + (b.thresholdHr ? " (symptoms stopped test at " + b.thresholdHr + " bpm)" : "") : ""));
  L.push("Contact clearance: " + HC.clearanceDone() + "/" + HC.plan.clearance.length + " ticked");
  L.push("");
  L.push("LAST 14 DAYS");
  var any = false;
  for(var i = 0; i < 14; i++){
    var k = HC.addDays(t, -i), d = HC.peekDay(k);
    if(!d) continue;
    var lines = [];
    if(HC.hiaTouched(d)) lines.push("  Symptoms (HIA 0–6 x 22): severity " + HC.hiaSeverity(d) + "/" + HC.HIA_MAX + ", " + HC.hiaCount(d) + " symptoms");
    else if(d.symptomScore !== null && d.symptomScore !== undefined) lines.push("  Symptoms: " + d.symptomScore + "/10");
    d.sessions.forEach(function(s){ lines.push("  " + sessionLine(s)); });
    if(typeof d.sleep.score === "number") lines.push("  Sleep score: " + d.sleep.score + "/100");
    var meds = HC.state.meds.filter(function(m){ return d.meds[m.id]; }).map(function(m){ return m.name; });
    if(meds.length) lines.push("  Meds: " + meds.join(", "));
    if(d.journal) lines.push("  Notes: " + d.journal.replace(/\s+/g, " ").trim());
    if(!lines.length) continue;
    any = true;
    L.push(HC.fmtDate(k, { weekday: "short", day: "numeric", month: "short" }));
    L = L.concat(lines);
  }
  if(!any) L.push("(nothing logged yet)");
  return L.join("\n");
}
$("copySummaryBtn").addEventListener("click", function(){
  var text = buildSummary();
  function fallback(){
    var box = el("textarea", { class: "summary-box", readonly: true, text: text });
    HC.openModal([el("h3", { text: "Summary" }), box, el("div", { class: "modal-actions" }, [el("button", { class: "btn btn-primary", type: "button", text: "Close", onclick: HC.closeModal })])]);
    box.focus(); box.select();
  }
  try{
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function(){ HC.toast("Summary copied — paste it into a message."); }, fallback);
    else fallback();
  }catch(e){ fallback(); }
});

/* ---------------- wiring ---------------- */
HC.showDayDetail = showDayDetail;
HC.buildSummary = buildSummary;
function renderAll(){ renderStreaks(); renderHeatmap(); renderCardioChart(); renderSleepChart(); renderList(); }
HC.on.render.push(renderAll);
HC.on.refresh.push(renderAll);
HC.on.show.history = [renderAll];
})();
