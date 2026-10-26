/* plan.js — the phased plan, the HR band, the return-to-contact clearance list,
   and the return-to-sport ladder. */
(function(){
"use strict";
var HC = window.HC, el = HC.el, $ = HC.$;

function toggleRow(label, why, on, onClick){
  return el("button", { type: "button", class: "check-item" + (on ? " done" : ""), onclick: onClick }, [
    el("span", { class: "box", html: HC.ICON_CHECK }),
    el("span", { class: "txt" }, [el("b", { text: label }), why ? el("span", { class: "why", text: why }) : null])
  ]);
}
function bullets(items){ return el("ul", {}, items.map(function(t){ return el("li", { text: HC.fmt(t) }); })); }
function bar(pct){ return el("div", { class: "progress" }, [el("i", { style: "width:" + Math.max(0, Math.min(100, pct)) + "%;" })]); }

/* ---------------- HR band ---------------- */
HC.stepUp = function(){
  var p = HC.state.profile;
  HC.confirm({
    title: "Step up +5 bpm?",
    message: "New band: " + (p.hrLow + 5) + "–" + (p.hrHigh + 5) + " bpm (ceiling " + (p.hrHigh + 5) + "). Check with your physio if you're unsure. This restarts the week-at-this-band clock.",
    confirmLabel: "Step up",
    onConfirm: function(){ p.hrLow += 5; p.hrHigh += 5; p.bandSince = HC.todayKey(); HC.save(); HC.toast("Band is now " + p.hrLow + "–" + p.hrHigh + " bpm."); }
  });
};
function editBand(){
  var p = HC.state.profile;
  var lo = el("input", { type: "number", inputmode: "numeric", min: 60, max: 200, value: String(p.hrLow) });
  var hi = el("input", { type: "number", inputmode: "numeric", min: 60, max: 200, value: String(p.hrHigh) });
  HC.openModal([
    el("h3", { text: "Heart-rate band" }),
    el("div", { class: "row2" }, [
      el("div", { class: "field" }, [el("label", { text: "Target from" }), lo]),
      el("div", { class: "field" }, [el("label", { text: "Ceiling (max)" }), hi])
    ]),
    el("p", { class: "hint", text: "Your ceiling is the number a session is checked against. Changing the band restarts the week-at-this-band clock." }),
    el("div", { class: "modal-actions" }, [
      el("button", { class: "btn btn-ghost", type: "button", text: "Cancel", onclick: HC.closeModal }),
      el("button", { class: "btn btn-primary", type: "button", text: "Save", onclick: function(){
        var a = +lo.value, b = +hi.value;
        if(!(a >= 60 && b <= 200 && a < b)){ hi.classList.add("err"); return; }
        if(a !== p.hrLow || b !== p.hrHigh){ p.hrLow = a; p.hrHigh = b; p.bandSince = HC.todayKey(); }
        HC.save(); HC.closeModal();
      } })
    ])
  ]);
}

HC.editBand = editBand;

/* ---------------- phases ---------------- */
function phaseCard(n, ps, title, pill, children){
  return el("div", { class: "phase-card" + (ps.phase === n ? " current" : "") + (n === 2 && !ps.gymUnlocked && ps.phase < 2 ? " locked" : "") + (n === 3 && ps.phase < 3 ? " locked" : "") }, [
    el("div", { class: "phase-head" }, [el("b", { text: "Phase " + n + " · " + title }), pill]),
  ].concat(children));
}
function renderPhases(){
  var box = $("phaseCards"), ps = HC.planStatus(), p = HC.state.profile, pl = HC.plan;
  box.innerHTML = "";
  box.appendChild(el("div", { class: "section-title", text: "Where you are" }));

  // Phase 1
  var lastBadLine = ps.lastBad ? el("p", { class: "hint warn", text: "Last flagged session: " + HC.fmtDate(ps.lastBad) + ". The 5-day count restarts after a flagged day." }) : null;
  var c1 = [
    bullets(pl.phaseBullets[1] || []),
    el("div", { class: "kv", style: "border-top:none;" }, [el("div", { class: "k", text: "Band" }), el("div", { class: "v", text: p.hrLow + "–" + p.hrHigh + " bpm" })]),
    el("div", {}, [el("p", { class: "hint", style: "margin-bottom:4px;", text: "Tolerated days in a row: " + Math.min(ps.streak, HC.STEP_DAYS_NEEDED) + "/" + HC.STEP_DAYS_NEEDED }), bar(ps.streak / HC.STEP_DAYS_NEEDED * 100)]),
    el("div", {}, [el("p", { class: "hint", style: "margin-bottom:4px;", text: "Days at this band: " + Math.min(ps.daysSinceBand, HC.STEP_MIN_DAYS) + "/" + HC.STEP_MIN_DAYS }), bar(ps.daysSinceBand / HC.STEP_MIN_DAYS * 100)]),
    lastBadLine,
    el("div", { class: "summary-actions" }, [
      el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Edit band", style: "flex:0 0 auto;", onclick: editBand }),
      ps.stepUpReady ? el("button", { class: "btn btn-primary btn-sm", type: "button", text: "Step up +5 bpm", style: "flex:0 0 auto;", onclick: HC.stepUp }) : null
    ])
  ];
  box.appendChild(phaseCard(1, ps, pl.phaseNames[0], el("span", { class: "phase-pill", text: ps.phase === 1 ? "Current" : "Ongoing" }), c1));

  // Phase 2
  var c2 = [
    bullets(pl.phaseBullets[2] || []),
    el("div", {}, [el("p", { class: "hint", style: "margin-bottom:4px;", text: "Tolerated cardio-only days: " + Math.min(ps.okDaysAll, HC.GYM_DAYS_NEEDED) + "/" + HC.GYM_DAYS_NEEDED + " (unlocks gym)" }), bar(ps.okDaysAll / HC.GYM_DAYS_NEEDED * 100)]),
    toggleRow("My physio okayed gym", "Unlocks gym regardless of the count above.", p.gymOverride, function(){ p.gymOverride = !p.gymOverride; HC.save(); })
  ];
  box.appendChild(phaseCard(2, ps, pl.phaseNames[1], el("span", { class: "phase-pill " + (ps.gymUnlocked ? "open" : ""), text: ps.phase === 2 ? "Current" : ps.gymUnlocked ? "Unlocked" : "Locked" }), c2));

  // Phase 3
  var c3 = [
    bullets(pl.phaseBullets[3] || []),
    toggleRow(pl.phase3Label, "Manual — this one is your clinician's call.", p.physioHeadUpDown, function(){ p.physioHeadUpDown = !p.physioHeadUpDown; HC.save(); })
  ];
  box.appendChild(phaseCard(3, ps, pl.phaseNames[2], el("span", { class: "phase-pill", text: ps.phase === 3 ? "Current" : "Locked" }), c3));
}

function renderAlongside(){
  var box = $("alongsideCard"), items = HC.plan.alongside || [];
  box.innerHTML = "";
  box.hidden = !items.length;
  if(!items.length) return;
  box.appendChild(el("div", { class: "section-title", style: "margin-bottom:8px;", text: "Running alongside, every week" }));
  box.appendChild(bullets(items));
}

/* ---------------- clearance list (gates for contact) ---------------- */
function renderClearance(){
  var box = $("clearanceCard"), c = HC.state.clearance;
  var done = HC.plan.clearance.filter(function(i){ return c[i.id] && c[i.id].done; }).length;
  box.innerHTML = "";
  box.appendChild(el("div", { class: "block-head", style: "margin-bottom:4px;" }, [
    el("div", { class: "section-title", style: "margin:0;", text: "Before contact" }),
    el("span", { class: "phase-pill", text: done + "/" + HC.plan.clearance.length })
  ]));
  box.appendChild(el("p", { class: "small", style: "margin-bottom:8px;", text: "Your neck can't absorb a big hit yet, so contact stays off until these are done. Tick each one when the person responsible confirms it." }));
  var list = el("div", { class: "check-list" });
  HC.plan.clearance.forEach(function(it){
    var st = c[it.id], on = !!(st && st.done);
    var why = (it.why ? it.why + " " : "") + (on && st.date ? "Ticked " + HC.fmtDate(st.date) + "." : "");
    list.appendChild(el("button", { type: "button", class: "clear-item" + (on ? " done" : ""), onclick: function(){
      c[it.id] = on ? { done: false, date: null } : { done: true, date: HC.todayKey() };
      HC.save();
    } }, [
      el("span", { class: "box", html: HC.ICON_CHECK }),
      el("span", {}, [el("b", { text: it.label }), why.trim() ? el("span", { class: "why", text: why.trim() }) : null])
    ]));
  });
  box.appendChild(list);
}
HC.clearanceDone = function(){ var c = HC.state.clearance; return HC.plan.clearance.filter(function(i){ return c[i.id] && c[i.id].done; }).length; };

/* ---------------- return-to-sport ladder ---------------- */
function hoursOnStep(){ var l = HC.state.ladder; return l.stepStartedAt ? (Date.now() - new Date(l.stepStartedAt).getTime()) / 3600000 : 0; }
function fmtHours(h){ var m = Math.round(Math.max(0, h) * 60); return Math.floor(m / 60) + "h " + (m % 60) + "m"; }

function renderLadder(){
  var L = HC.state.ladder, card = $("ladderStatusCard");
  card.innerHTML = "";
  if(!L.started){
    card.appendChild(el("div", { class: "section-title", style: "margin-bottom:8px;", text: "Not started yet" }));
    card.appendChild(el("p", { class: "small", style: "margin-bottom:12px;", text: "Start once the clearance list above is done and your physio agrees." }));
    card.appendChild(el("button", { class: "btn btn-primary", type: "button", text: "Start return-to-sport ladder", onclick: function(){
      function go(){ L.started = true; L.currentStep = 0; L.stepStartedAt = new Date().toISOString(); L.history.push({ date: new Date().toISOString(), event: "started", step: 0 }); HC.save(); }
      var left = HC.plan.clearance.length - HC.clearanceDone();
      if(left > 0) HC.confirm({ title: "Start anyway?", message: left + " item" + (left === 1 ? "" : "s") + " on the clearance list " + (left === 1 ? "isn't" : "aren't") + " ticked yet.", confirmLabel: "Start anyway", danger: true, onConfirm: go });
      else go();
    } }));
  } else {
    var hrs = hoursOnStep(), ok = hrs >= 48;
    [["Current step", (L.currentStep + 1) + " of 6", ""], ["Time on this step", fmtHours(hrs), ok ? "good" : "warn"], ["48h checkpoint", ok ? "Met" : "Not yet — " + fmtHours(48 - hrs) + " left", ok ? "good" : "warn"]].forEach(function(r, i){
      card.appendChild(el("div", { class: "kv", style: i === 0 ? "border-top:none;" : "" }, [el("div", { class: "k", text: r[0] }), el("div", { class: "v " + r[2], text: r[1] })]));
    });
  }

  var list = $("ladderList"); list.innerHTML = "";
  HC.LADDER_STEPS.forEach(function(step, i){
    var st = "pending";
    if(L.started){ if(i < L.currentStep) st = "done"; else if(i === L.currentStep) st = "current"; }
    list.appendChild(el("div", { class: "rung " + st }, [
      el("div", { class: "dotcol" }, [el("div", { class: "dot", text: st === "done" ? "✓" : String(i + 1) }), el("div", { class: "connector" })]),
      el("div", { class: "rtxt" }, [el("div", { class: "rname", text: step.name }), step.detail ? el("div", { class: "rdetail", text: step.detail }) : null])
    ]));
  });

  var act = $("ladderActions"); act.innerHTML = "";
  if(L.started){
    if(L.currentStep < HC.LADDER_STEPS.length - 1){
      act.appendChild(el("button", { class: "btn btn-primary", type: "button", text: "Advance to step " + (L.currentStep + 2), onclick: function(){
        function adv(){ L.currentStep++; L.stepStartedAt = new Date().toISOString(); L.history.push({ date: new Date().toISOString(), event: "advanced", step: L.currentStep }); HC.save(); }
        var h = hoursOnStep();
        if(h < 48) HC.confirm({ title: "Advance early?", message: "Only " + fmtHours(h) + " on this step — under the 48h checkpoint given your history of repeated symptom return. Advance anyway?", confirmLabel: "Advance anyway", danger: true, onConfirm: adv });
        else adv();
      } }));
    } else {
      act.appendChild(el("div", { class: "badge good", style: "margin:0 auto;", text: "Ladder complete — return to competition" }));
    }
    act.appendChild(el("button", { class: "btn btn-ghost", type: "button", style: "color:var(--danger-ink);", text: "Symptoms returned — step back", onclick: function(){
      HC.confirm({ title: "Log a symptom return?", message: "This drops you back to the previous step and restarts the 48h checkpoint from there.", confirmLabel: "Step back", danger: true, onConfirm: function(){
        L.history.push({ date: new Date().toISOString(), event: "reset", step: L.currentStep });
        L.currentStep = Math.max(0, L.currentStep - 1); L.stepStartedAt = new Date().toISOString(); HC.save();
      } });
    } }));
  }

  var hist = $("ladderHistory"); hist.innerHTML = "";
  var h = L.history.slice().reverse();
  if(!h.length) hist.appendChild(el("p", { class: "small", text: "No entries yet." }));
  h.forEach(function(e){
    var label = e.event === "started" ? "Started ladder" : e.event === "advanced" ? "Advanced to step " + (e.step + 1) : "Symptoms returned at step " + (e.step + 1);
    hist.appendChild(el("div", { class: "kv" }, [
      el("div", { class: "k", text: new Date(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) }),
      el("div", { class: "v", style: "font-family:inherit; font-weight:500;" + (e.event === "reset" ? "color:var(--danger-ink);" : ""), text: label })
    ]));
  });
}

function renderAll(){ renderPhases(); renderAlongside(); renderClearance(); renderLadder(); }
HC.on.render.push(renderAll);
HC.on.refresh.push(function(){ renderPhases(); renderClearance(); renderLadder(); });
HC.on.show.plan = [renderAll];
})();
