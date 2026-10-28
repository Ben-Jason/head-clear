/* today.js — the daily dashboard: plan hero, step-up prompt, morning-after check,
   avoid list, HIA symptom evaluation, sleep, rhythm checklist, meds, journal. */
(function(){
"use strict";
var HC = window.HC, el = HC.el, $ = HC.$;

var CHECK = '<path d="M20 6 9 17l-5-5"/>';
var WHEN = { morning: "Morning", evening: "Evening", any: "Any time" };

/* ---------------- hero ---------------- */
function easyStreak(){
  var streak = 0, d = new Date();
  for(var i = 0; i < 365; i++){
    var key = HC.dateKey(d), day = HC.state.days[key];
    if(!day || day.symptomScore === null || day.symptomScore === undefined){
      if(key === HC.todayKey()){ d.setDate(d.getDate() - 1); continue; } // today just isn't rated yet
      break;
    }
    if(day.symptomScore <= 2){ streak++; d.setDate(d.getDate() - 1); } else break;
  }
  return streak;
}
HC.easyStreak = easyStreak;

function renderHero(){
  var ps = HC.planStatus(), p = HC.state.profile;
  $("phaseEyebrow").textContent = "Phase " + ps.phase + " · " + HC.plan.phaseNames[ps.phase - 1];
  $("statusHeadline").textContent = "Stay under " + p.hrHigh + " bpm";
  $("statusSub").textContent = HC.fmt(HC.plan.phaseSub[ps.phase - 1] || "");
  $("statStreak").textContent = Math.min(ps.streak, HC.STEP_DAYS_NEEDED) + "/" + HC.STEP_DAYS_NEEDED;
  $("statBctt").textContent = HC.bcttCompact();
  $("statEasy").textContent = String(easyStreak());
  $("hdrDate").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function renderStepUp(){
  var box = $("stepUpCard"), ps = HC.planStatus(), p = HC.state.profile;
  box.innerHTML = "";
  if(!ps.stepUpReady){ box.hidden = true; return; }
  box.hidden = false;
  box.appendChild(el("div", { class: "section-title", text: "Ready to step up" }));
  box.appendChild(el("p", { style: "margin:6px 2px 10px; font-size:13.5px; color:var(--ink);",
    text: HC.STEP_DAYS_NEEDED + " tolerated cardio days in a row and a week at " + p.hrLow + "–" + p.hrHigh + " bpm. Next band: " + (p.hrLow + 5) + "–" + (p.hrHigh + 5) + " bpm." }));
  box.appendChild(el("button", { class: "btn btn-primary", type: "button", text: "Step up +5 bpm", onclick: function(){ HC.stepUp(); } }));
}

/* ---------------- morning-after check ---------------- */
function pendingMorning(){
  var out = [], t = HC.todayKey();
  [1, 2].forEach(function(n){
    var k = HC.addDays(t, -n), d = HC.peekDay(k);
    if(!d) return;
    d.sessions.forEach(function(s){ if(typeof s.nextMorning !== "number") out.push({ date: k, s: s }); });
  });
  return out;
}
HC.pendingMorning = pendingMorning;

function renderMorning(){
  var box = $("morningCard"), list = pendingMorning();
  box.innerHTML = "";
  if(!list.length){ box.hidden = true; return; }
  box.hidden = false;
  var y = HC.addDays(HC.todayKey(), -1);
  var names = list.map(function(x){ return (x.date === y ? "Yesterday" : HC.fmtDate(x.date)) + ": " + HC.typeLabel(x.s.type) + (x.s.duration ? " " + x.s.duration + " min" : ""); });
  box.appendChild(el("div", { class: "section-title", text: "Morning-after check" }));
  box.appendChild(el("p", { class: "small", style: "margin:6px 2px 10px;", text: names.join(" · ") }));
  box.appendChild(el("p", { style: "margin:0 2px 8px; font-size:13.5px; font-weight:600;", text: "How do your symptoms feel right now, this morning?" }));
  var scale = el("div", { class: "scale-row" });
  HC.renderScale(scale, null, function(v){
    pendingMorning().forEach(function(x){ x.s.nextMorning = v; x.s.nextMorningAt = new Date().toISOString(); });
    HC.save();
    HC.toast("Next-morning check saved.");
  });
  box.appendChild(scale);
  box.appendChild(el("div", { class: "scale-legend" }, [el("span", { text: "0 · none" }), el("span", { text: "10 · severe" })]));
}

/* ---------------- avoid list ---------------- */
function renderAvoid(){
  var box = $("avoidCard"), open = HC.state.ui.avoidOpen;
  box.innerHTML = "";
  box.appendChild(el("div", { class: "block-head", style: "margin-bottom:0;" }, [
    el("div", { class: "section-title", style: "margin:0;", text: "Avoid for now" }),
    el("button", { class: "link-btn", type: "button", text: open ? "Hide" : "Show all " + HC.plan.avoid.length,
      onclick: function(){ HC.state.ui.avoidOpen = !HC.state.ui.avoidOpen; HC.save(); } })
  ]));
  if(!open){
    box.appendChild(el("p", { class: "avoid-preview", text: HC.plan.avoid.slice(0, 4).map(HC.fmt).join(" · ") }));
    return;
  }
  var list = el("div", { class: "avoid-list" });
  HC.plan.avoid.forEach(function(t){
    list.appendChild(el("div", { class: "avoid-item" }, [el("span", { html: HC.ICON_X, style: "display:flex;" }), el("span", { text: HC.fmt(t) })]));
  });
  box.appendChild(list);
  box.appendChild(el("p", { class: "small", style: "margin-top:10px;", text: HC.plan.avoidSource || "From your plan." }));
}

/* ---------------- HIA symptom evaluation ---------------- */
var hiaExpanded = false;
function syncSymptomScore(day){
  if(!HC.hiaTouched(day)) return;
  day.symptomScore = Math.round((HC.hiaSeverity(day) / HC.HIA_MAX) * 10);
}
function renderHIASummary(){
  var root = $("hiaSummary"), day = HC.today(), touched = HC.hiaTouched(day);
  root.innerHTML = "";
  [[touched ? HC.hiaCount(day) + " / " + HC.HIA_SYMPTOMS.length : "—", "Symptoms present"],
   [touched ? HC.hiaSeverity(day) + " / " + HC.HIA_MAX : "—", "Severity score"]].forEach(function(r){
    root.appendChild(el("div", { class: "stat-tile" }, [el("b", { text: r[0] }), el("span", { text: r[1] })]));
  });
}
function renderHIA(){
  var toggle = $("hiaToggleBtn"), list = $("hiaList"), day = HC.today();
  list.hidden = !hiaExpanded;
  toggle.textContent = hiaExpanded ? "Hide" : (HC.hiaTouched(day) ? "Edit" : "Start");
  if(hiaExpanded){
    list.innerHTML = "";
    HC.HIA_SYMPTOMS.forEach(function(s){
      var val = day.hia[s.id], rated = typeof val === "number";
      var scale = el("div", { class: "scale-row" });
      list.appendChild(el("div", { class: "hia-row" + (rated ? " rated" : "") }, [
        el("div", { class: "hia-row-head" }, [el("span", { class: "hia-name", text: s.label }), el("span", { class: "hia-val", text: rated ? String(val) : "—" })]),
        scale
      ]));
      HC.renderScale(scale, rated ? val : null, function(v){
        var d = HC.today();
        d.hia[s.id] = v;
        syncSymptomScore(d);
        HC.save();
        renderHIA(); renderSparkline();
      }, 6);
    });
  }
  renderHIASummary();
}
$("hiaToggleBtn").addEventListener("click", function(){ hiaExpanded = !hiaExpanded; renderHIA(); });

function renderSparkline(){
  var root = $("sparkline"), d = new Date(), cols = [];
  root.innerHTML = "";
  for(var i = 6; i >= 0; i--){
    var dd = new Date(d); dd.setDate(d.getDate() - i);
    var day = HC.state.days[HC.dateKey(dd)];
    var score = day ? day.symptomScore : null, none = score === null || score === undefined;
    var fill = el("div", { class: "spark-fill", style: "height:" + (none ? 6 : Math.max(10, score * 10)) + "%; background:" + (none ? "var(--surface-2)" : score <= 2 ? "var(--good)" : score <= 5 ? "var(--warn)" : "var(--danger)") + ";" });
    cols.push(el("div", { class: "spark-bar" }, [fill, el("div", { class: "spark-day", text: dd.toLocaleDateString(undefined, { weekday: "narrow" }) })]));
  }
  cols.forEach(function(c){ root.appendChild(c); });
}

/* ---------------- sleep (Garmin sleep score) ---------------- */
function sleepAvg(){
  var sum = 0, n = 0, t = HC.todayKey();
  for(var i = 0; i < 7; i++){
    var d = HC.peekDay(HC.addDays(t, -i));
    if(d && typeof d.sleep.score === "number"){ sum += d.sleep.score; n++; }
  }
  return n ? (sum / n) : null;
}
function renderSleep(){
  var box = $("sleepCard"), sl = HC.today().sleep;
  box.innerHTML = "";
  box.appendChild(el("div", { class: "section-title", text: "Last night's sleep" }));
  box.appendChild(el("p", { class: "small", style: "margin:4px 2px 0;", text: "Copy the score from the Garmin app: Sleep → last night's score out of 100." }));
  var inp = el("input", { type: "number", inputmode: "numeric", min: 0, max: 100, step: "1", placeholder: "e.g. 78", value: typeof sl.score === "number" ? String(sl.score) : "" });
  inp.addEventListener("change", function(){
    var v = inp.value === "" ? null : Math.round(+inp.value);
    if(v !== null && (isNaN(v) || v < 0 || v > 100)){ inp.classList.add("err"); return; }
    inp.classList.remove("err");
    var d = HC.today(); if(v === null) delete d.sleep.score; else d.sleep.score = v;
    HC.save(); renderSleep();
  });
  box.appendChild(el("div", { class: "field", style: "margin-top:12px;" }, [el("label", { text: "Garmin sleep score (0–100)" }), inp]));
  var avg = sleepAvg();
  box.appendChild(el("p", { class: "small", style: "margin-top:12px;", text: avg === null ? "Log it each morning to see your 7-night average." : "7-night average: " + Math.round(avg) + "/100." }));
}

/* ---------------- checklist rows (with full editing) ---------------- */
var PENCIL = '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>';
function checkRow(o){
  var path = o.edit ? PENCIL : CHECK;
  var color = o.edit ? (o.hidden ? "var(--ink-faint)" : "var(--accent-ink)") : "#fff";
  var box = el("span", { class: "box" + (o.edit ? " eyebox" : ""),
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (o.edit ? 2.2 : 3) + '" stroke-linecap="round" stroke-linejoin="round" style="' + (o.edit ? "opacity:1;" : "") + "color:" + color + '">' + path + "</svg>" });
  return el("button", { type: "button", class: "check-item" + (o.done ? " done" : "") + (o.edit && o.hidden ? " item-hidden" : ""), onclick: o.onClick }, [
    box, el("span", { class: "txt" }, [el("b", { text: o.label }), o.why ? el("span", { class: "why", text: o.why }) : null])
  ]);
}

var editMode = false;
function redrawLists(){ renderRhythm(); renderStanding(); }

/* ---------------- yesterday view: tick the checklist, background habits and meds for yesterday ---------------- */
var viewing = null; // yesterday's date key while the "Yesterday" tab is selected
var TICK_MAPS = ["wake", "midday", "afternoon", "evening", "bed", "standing", "meds"];
function viewKey(){ var y = HC.addDays(HC.todayKey(), -1); if(viewing && viewing !== y) viewing = null; return viewing; }
function emptyShape(){ var o = {}; TICK_MAPS.forEach(function(k){ o[k] = {}; }); return o; }
function readDay(){ var k = viewKey(); return k ? (HC.peekDay(k) || emptyShape()) : HC.today(); }
function writeDay(){ var k = viewKey(); return k ? HC.getDay(k) : HC.today(); } // only creates yesterday's record when something is ticked
function yesterdayEmpty(){
  var d = HC.peekDay(HC.addDays(HC.todayKey(), -1));
  if(!d) return true;
  return !TICK_MAPS.some(function(k){ return Object.keys(d[k]).some(function(id){ return d[k][id] === true; }); });
}
function redrawAll(){ renderRhythm(); renderStanding(); renderMeds(); }
function renderDayToggle(){
  var y = HC.addDays(HC.todayKey(), -1), on = viewKey();
  var box = $("dayToggle"), banner = $("yBanner");
  box.innerHTML = "";
  var wrap = el("div", { class: "seg" });
  [["Yesterday", y], ["Today", null]].forEach(function(o){
    wrap.appendChild(el("button", { type: "button", class: (on || null) === o[1] ? "on" : "", text: o[0], onclick: function(){ viewing = o[1]; redrawAll(); } }));
  });
  box.appendChild(wrap);
  $("rhythmTitle").textContent = on ? "Yesterday's rhythm" : "Today's rhythm";
  $("standingTitle").textContent = on ? "Running in the background · yesterday" : "Running in the background";
  banner.innerHTML = "";
  if(on){
    banner.hidden = false;
    banner.appendChild(el("span", { text: "Editing " + HC.fmtDate(on, { weekday: "long", day: "numeric", month: "short" }) + ". Your ticks here count for that day." }));
  } else if(yesterdayEmpty() && HC.state.ui.yDismissed !== HC.todayKey()){
    banner.hidden = false;
    banner.appendChild(el("span", { text: "Nothing was ticked yesterday." }));
    banner.appendChild(el("button", { type: "button", class: "link-btn", text: "Check in for yesterday", onclick: function(){ viewing = y; redrawAll(); } }));
    banner.appendChild(el("button", { type: "button", class: "link-btn", style: "color:var(--ink-faint);", text: "Dismiss", onclick: function(){ HC.state.ui.yDismissed = HC.todayKey(); HC.save(); renderDayToggle(); } }));
  } else banner.hidden = true;
}

function isHidden(blockKey, id){ return blockKey === "standing" ? HC.isHiddenStanding(id) : HC.isHiddenRhythm(blockKey, id); }
function setHidden(blockKey, id, v){
  if(blockKey === "standing") HC.state.hidden.standing[id] = v; else HC.state.hidden.rhythm[blockKey + ":" + id] = v;
}

// Change the wording of an item, hide/show it, or remove it.
function editItemModal(it, blockKey){
  var cu = HC.state.custom;
  var label = el("input", { type: "text", value: it.label, maxlength: "140" });
  var why = el("input", { type: "text", value: it.why || "", placeholder: "Optional small note under it", maxlength: "200" });
  var hidden = isHidden(blockKey, it.id);
  HC.openModal([
    el("h3", { text: "Edit item" }),
    el("div", { class: "field" }, [el("label", { text: "Wording" }), label]),
    el("div", { class: "field" }, [el("label", { text: "Note" }), why]),
    el("div", { class: "summary-actions" }, [
      el("button", { class: "btn btn-ghost btn-sm", type: "button", style: "flex:1;", text: hidden ? "Show again" : "Hide for now", onclick: function(){
        setHidden(blockKey, it.id, !hidden); HC.save(); HC.closeModal(); redrawLists();
      } }),
      el("button", { class: "btn btn-ghost btn-sm", type: "button", style: "flex:1; color:var(--danger-ink);", text: "Remove", onclick: function(){
        HC.confirm({ title: "Remove this item?", message: "It disappears from your list. Days you already ticked it keep their record.", confirmLabel: "Remove", danger: true, onConfirm: function(){
          if(it.custom) cu.added = cu.added.filter(function(a){ return a.id !== it.id; });
          else cu.items[it.id] = Object.assign({}, cu.items[it.id], { removed: true });
          cu.removedLabels[it.id] = it.label;
          HC.save(); redrawLists();
        } });
      } })
    ]),
    el("div", { class: "modal-actions" }, [
      el("button", { class: "btn btn-ghost", type: "button", text: "Cancel", onclick: HC.closeModal }),
      el("button", { class: "btn btn-primary", type: "button", text: "Save", onclick: function(){
        var txt = label.value.trim();
        if(!txt){ label.classList.add("err"); return; }
        if(it.custom){
          cu.added.forEach(function(a){ if(a.id === it.id){ a.label = txt; a.why = why.value.trim(); } });
        } else {
          cu.items[it.id] = Object.assign({}, cu.items[it.id], { label: txt, why: why.value.trim() });
        }
        HC.save(); HC.closeModal(); redrawLists();
      } })
    ])
  ]);
}

// Add a brand-new tick-box to a block of the checklist (or to the standing habits).
function addItemModal(blockKey, blockName){
  var label = el("input", { type: "text", placeholder: "e.g. Stretch neck for 5 minutes", maxlength: "140" });
  var why = el("input", { type: "text", placeholder: "Optional small note under it", maxlength: "200" });
  HC.openModal([
    el("h3", { text: "Add to " + blockName }),
    el("div", { class: "field" }, [el("label", { text: "Wording" }), label]),
    el("div", { class: "field" }, [el("label", { text: "Note" }), why]),
    el("div", { class: "modal-actions" }, [
      el("button", { class: "btn btn-ghost", type: "button", text: "Cancel", onclick: HC.closeModal }),
      el("button", { class: "btn btn-primary", type: "button", text: "Add", onclick: function(){
        var txt = label.value.trim();
        if(!txt){ label.classList.add("err"); return; }
        HC.state.custom.added.push({ id: "c_" + HC.uid(), block: blockKey, label: txt, why: why.value.trim() });
        HC.save(); HC.closeModal(); redrawLists();
      } })
    ])
  ]);
}

function itemRow(it, blockKey, doneMap){
  var hidden = isHidden(blockKey, it.id);
  return checkRow({
    edit: editMode, hidden: hidden, done: !editMode && !!doneMap[it.id],
    label: HC.fmt(it.label), why: HC.fmt(it.why || ""),
    onClick: function(){
      if(editMode){ editItemModal(it, blockKey); return; }
      var d = writeDay(), m = blockKey === "standing" ? d.standing : d[blockKey];
      m[it.id] = !m[it.id];
      HC.save(); redrawLists();
    }
  });
}
function addButton(blockKey, blockName){
  return el("button", { type: "button", class: "link-btn", style: "margin:4px 4px 0;", text: "+ Add to " + blockName, onclick: function(){ addItemModal(blockKey, blockName); } });
}

function renderRhythm(){
  var root = $("rhythmBlocks"), day = readDay();
  renderDayToggle();
  root.innerHTML = "";
  $("editChecklistBtn").textContent = editMode ? "Done" : "Edit";
  $("editHint").hidden = !editMode;
  HC.rhythm().forEach(function(block){
    var visible = block.items.filter(function(it){ return editMode || !HC.isHiddenRhythm(block.key, it.id); });
    if(!visible.length && !editMode) return;
    var list = el("div", { class: "check-list" });
    visible.forEach(function(it){ list.appendChild(itemRow(it, block.key, day[block.key])); });
    root.appendChild(el("div", {}, [
      el("div", { class: "block-head" }, [el("span", { class: "label", text: block.time }), el("span", { class: "time", text: visible.length + " items" })]),
      list,
      editMode ? addButton(block.key, block.time) : null
    ]));
  });
  if(editMode){
    root.appendChild(el("button", { type: "button", class: "link-btn", style: "color:var(--danger-ink); align-self:flex-start;", text: "Restore the original list", onclick: function(){
      HC.confirm({ title: "Restore the original list?", message: "Your reworded, added and removed items go back to the app's defaults. Hidden items stay hidden. Past ticks are kept.", confirmLabel: "Restore", danger: true, onConfirm: function(){
        var rl = HC.state.custom.removedLabels; HC.state.custom.added.forEach(function(x){ rl[x.id] = x.label; });
        HC.state.custom = { items: {}, added: [], removedLabels: rl }; HC.save(); redrawLists();
      } });
    } }));
  }
}
$("editChecklistBtn").addEventListener("click", function(){ editMode = !editMode; redrawLists(); });

function renderStanding(){
  var root = $("standingList"), day = readDay();
  root.innerHTML = "";
  HC.standingItems().forEach(function(it){
    if(!editMode && HC.isHiddenStanding(it.id)) return;
    root.appendChild(itemRow(it, "standing", day.standing));
  });
  if(editMode) root.appendChild(addButton("standing", "Running in the background"));
}

/* ---------------- meds & supplements (ticks; the list itself is edited in Info) ---------------- */
function renderMeds(){
  var box = $("medsCard"), day = readDay(), meds = HC.state.meds;
  box.innerHTML = "";
  box.appendChild(el("div", { class: "block-head", style: "margin-bottom:8px;" }, [
    el("div", { class: "section-title", style: "margin:0;", text: viewKey() ? "Meds & supplements · yesterday" : "Meds & supplements" }),
    el("button", { class: "link-btn", type: "button", text: "Edit list", onclick: function(){ HC.switchTab("info"); var m = $("medsEditorCard"); if(m) m.scrollIntoView({ block: "start" }); } })
  ]));
  if(!meds.length){
    box.appendChild(el("p", { class: "small", text: "Nothing on your list yet — add items under Info → Meds & supplements." }));
    return;
  }
  var list = el("div", { class: "check-list" });
  meds.forEach(function(m){
    list.appendChild(checkRow({
      done: !!day.meds[m.id], label: m.name || "Unnamed",
      why: (m.dose ? m.dose : "dose not set — add it under Info") + " · " + (WHEN[m.when] || "Any time"),
      onClick: function(){ var d = writeDay(); d.meds[m.id] = !d.meds[m.id]; HC.save(); renderMeds(); }
    }));
  });
  box.appendChild(list);
  if(meds.some(function(m){ return m.when === "evening"; })) box.appendChild(el("p", { class: "small", style: "margin-top:10px;", text: "Your 8pm reminder includes a nudge to take your evening medication." }));
}

/* ---------------- journal ---------------- */
var journalEl = $("journalInput"), journalTimer;
journalEl.addEventListener("input", function(){
  clearTimeout(journalTimer);
  journalTimer = setTimeout(function(){ HC.today().journal = journalEl.value; HC.save(); }, 400);
});
function renderJournal(){ if(document.activeElement !== journalEl) journalEl.value = HC.today().journal || ""; }

/* ---------------- sos shortcut ---------------- */
$("sosBtn").addEventListener("click", function(){ HC.switchTab("info"); var f = $("redFlagList"); if(f) f.scrollIntoView({ block: "start" }); });

/* ---------------- wiring ---------------- */
HC.resetTodayUI = function(){ hiaExpanded = false; editMode = false; viewing = null; journalEl.value = ""; };
HC.on.render.push(function(){
  renderHero(); renderStepUp(); renderMorning(); renderAvoid(); renderHIA(); renderSparkline();
  renderSleep(); renderRhythm(); renderMeds(); renderStanding(); renderJournal();
});
HC.on.refresh.push(function(){ renderHero(); renderStepUp(); renderMorning(); renderAvoid(); renderSparkline(); });
HC.on.show.today = [function(){ renderHero(); renderStepUp(); renderMorning(); renderAvoid(); renderRhythm(); renderMeds(); renderSleep(); renderHIASummary(); }];
})();
