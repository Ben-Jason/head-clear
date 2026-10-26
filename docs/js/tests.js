/* tests.js — the weekly objective tests: near-point of convergence, reaction time
   (ruler drop, left vs right), lying-to-standing heart rate. Feeds the weekly report. */
(function(){
"use strict";
var HC = window.HC, el = HC.el, $ = HC.$;

var TEST_EVERY_DAYS = 7;
// Reaction time is stored in milliseconds (from the colour-change tap test below).
HC.rtMs = function(v){ return (typeof v === "number" && v > 0) ? Math.round(v) : null; };

/* Colour-change tap test: the screen is red, turns green after a random wait, tap as soon as
   it does. 5 taps per thumb, the median is kept. Tapping early restarts that attempt. */
var RT_TRIALS = 5;
function runReactionTest(hand, done){
  var times = [], timer = null, greenAt = 0, state = "idle", msg;
  var ov = el("div", { id: "rtOverlay" });
  var top = el("div", { class: "rt-top" }, [el("b", { text: hand + " thumb" }), el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Cancel", onclick: close })]);
  var pad = el("div", { class: "rt-pad" });
  var big = el("div", { class: "rt-big" }), small = el("div", { class: "rt-small" });
  pad.appendChild(big); pad.appendChild(small);
  ov.appendChild(top); ov.appendChild(pad);
  document.body.appendChild(ov);
  function close(){ clearTimeout(timer); ov.remove(); }
  function paint(cls, b, sm){ pad.className = "rt-pad " + cls; big.textContent = b; small.textContent = sm || ""; }
  function ready(){ state = "idle"; paint("idle", times.length ? times[times.length - 1] + " ms" : "Tap to start", times.length ? "Tap for attempt " + (times.length + 1) + " of " + RT_TRIALS : "Hold the phone in your " + hand.toLowerCase() + " hand and tap with that thumb. " + RT_TRIALS + " attempts."); }
  function wait(){
    state = "wait"; paint("wait", "Wait…", "Tap only when the screen turns green");
    timer = setTimeout(function(){
      state = "go"; pad.className = "rt-pad go"; big.textContent = "TAP!"; small.textContent = "";
      requestAnimationFrame(function(){ greenAt = performance.now(); });
    }, 1500 + Math.random() * 3000);
  }
  function finish(){
    state = "done";
    var sorted = times.slice().sort(function(a, b){ return a - b; }), med = sorted[Math.floor(sorted.length / 2)];
    pad.className = "rt-pad idle"; pad.innerHTML = "";
    pad.appendChild(el("div", { class: "rt-big", text: med + " ms" }));
    pad.appendChild(el("div", { class: "rt-small", text: "Median of " + times.join(", ") + " ms" }));
    pad.appendChild(el("div", { class: "rt-actions" }, [
      el("button", { class: "btn btn-ghost", type: "button", text: "Redo", onclick: function(){ times = []; pad.innerHTML = ""; pad.appendChild(big); pad.appendChild(small); ready(); } }),
      el("button", { class: "btn btn-primary", type: "button", text: "Use " + med + " ms", onclick: function(){ close(); done(med); } })
    ]));
  }
  pad.addEventListener("pointerdown", function(e){
    if(e.target.closest && e.target.closest(".rt-actions")) return;
    e.preventDefault();
    if(state === "idle") wait();
    else if(state === "wait"){ clearTimeout(timer); state = "early"; paint("early", "Too early", "Wait for green — tap to retry"); }
    else if(state === "early") wait();
    else if(state === "go"){
      var ms = Math.round(performance.now() - greenAt);
      times.push(ms);
      if(times.length >= RT_TRIALS) finish(); else ready();
    }
  });
  ready();
}
HC.runReactionTest = runReactionTest;

HC.sortedTests = function(){ return HC.state.tests.slice().sort(function(a, b){ return a.date < b.date ? 1 : -1; }); };
HC.testsDue = function(){
  var t = HC.sortedTests();
  if(!t.length) return HC.todayKey();
  return HC.addDays(t[0].date, TEST_EVERY_DAYS);
};
HC.testsDuePhrase = function(){
  var due = HC.testsDue(), n = HC.diffDays(HC.todayKey(), due);
  if(!HC.state.tests.length) return "No tests logged yet — do your first set this week";
  return n < 0 ? "Overdue by " + Math.abs(n) + " day" + (Math.abs(n) === 1 ? "" : "s") : n === 0 ? "Due today" : "Next set in " + n + " day" + (n === 1 ? "" : "s") + " (" + HC.fmtDate(due) + ")";
};
HC.standDelta = function(t, which){
  var v = t[which];
  return (typeof t.hrLie === "number" && typeof v === "number") ? v - t.hrLie : null;
};

function field(label, node, hint){ return el("div", { class: "field", style: "margin-top:12px;" }, [el("label", { text: label }), node, hint ? el("p", { class: "hint", text: hint }) : null]); }
function num(value, ph, min, max){
  return el("input", { type: "number", inputmode: "decimal", placeholder: ph, min: min, max: max, step: "any", value: value === undefined || value === null ? "" : String(value) });
}
function val(inp){ return inp.value === "" ? null : +inp.value; }
function signed(n){ return (n >= 0 ? "+" : "") + n; }

function line(t){
  var bits = [];
  if(typeof t.npc === "number") bits.push("NPC " + t.npc + " cm");
  var l = HC.rtMs(t.rtL), r = HC.rtMs(t.rtR);
  if(l || r) bits.push("Reaction L " + (l ? l + " ms" : "—") + " / R " + (r ? r + " ms" : "—"));
  var d1 = HC.standDelta(t, "hrS1"), d3 = HC.standDelta(t, "hrS3");
  if(d1 !== null || d3 !== null) bits.push("Lie→stand " + (d1 !== null ? signed(d1) : "—") + " (1 min) / " + (d3 !== null ? signed(d3) : "—") + " (3 min) bpm");
  return bits.join(" · ") || "No values entered";
}

function openForm(existing){
  var t = existing || {};
  var date = el("input", { type: "date", value: t.date || HC.todayKey() });
  var npc = num(t.npc, "cm", 0, 40);
  var rtL = num(t.rtL, "ms", 50, 2000), rtR = num(t.rtR, "ms", 50, 2000);
  function rtField(label, inp, hand){
    return field(label, el("div", { style: "display:flex; gap:8px;" }, [inp, el("button", { class: "btn btn-ghost btn-sm", type: "button", style: "white-space:nowrap;", text: "Run test", onclick: function(){ runReactionTest(hand, function(ms){ inp.value = String(ms); }); } })]));
  }
  var hl = num(t.hrLie, "bpm", 30, 220), h1 = num(t.hrS1, "bpm", 30, 240), h3 = num(t.hrS3, "bpm", 30, 240);
  var note = el("input", { type: "text", placeholder: "Optional", value: t.note || "" });
  HC.openModal([
    el("h3", { text: existing ? "Edit test results" : "Log this week's tests" }),
    el("div", { class: "stack", style: "gap:0; max-height:58vh; overflow-y:auto; padding-right:2px;" }, [
      field("Date", date),
      field("Near-point of convergence (cm)", npc, "Pen at arm's length, slowly bring it to your nose; stop when it doubles. Measure the distance. Best of 3."),
      rtField("Reaction time — left thumb (ms)", rtL, "Left"),
      rtField("Reaction time — right thumb (ms)", rtR, "Right"),
      field("Lying heart rate (bpm)", hl, "After 5 minutes flat on your back."),
      field("Standing heart rate at 1 min (bpm)", h1),
      field("Standing heart rate at 3 min (bpm)", h3),
      field("Note", note)
    ]),
    el("div", { class: "modal-actions" }, [
      el("button", { class: "btn btn-ghost", type: "button", text: "Cancel", onclick: HC.closeModal }),
      el("button", { class: "btn btn-primary", type: "button", text: "Save", onclick: function(){
        if(!date.value){ date.classList.add("err"); return; }
        var rec = { id: t.id || HC.uid(), date: date.value, npc: val(npc), rtL: val(rtL), rtR: val(rtR), hrLie: val(hl), hrS1: val(h1), hrS3: val(h3), note: note.value.trim() };
        if(existing) Object.keys(rec).forEach(function(k){ existing[k] = rec[k]; }); else HC.state.tests.push(rec);
        HC.save(); HC.closeModal(); HC.toast("Test results saved.");
      } })
    ])
  ]);
}
HC.openTestsForm = openForm;

function render(){
  var box = $("testsCard"), list = HC.sortedTests();
  box.innerHTML = "";
  box.appendChild(el("div", { class: "section-title", style: "margin-bottom:6px;", text: "Weekly tests" }));
  box.appendChild(el("p", { class: "small", style: "margin-bottom:10px;", text: "Three quick checks once a week — convergence, reaction time left vs right, and lying-to-standing heart rate. They go in the weekly report." }));
  box.appendChild(el("div", { class: "kv", style: "border-top:none;" }, [el("div", { class: "k", text: "Status" }), el("div", { class: "v", style: "font-size:12.5px; text-align:right;", text: HC.testsDuePhrase() })]));
  box.appendChild(el("div", { class: "summary-actions", style: "margin-top:10px;" }, [el("button", { class: "btn btn-primary", type: "button", text: "Log tests", onclick: function(){ openForm(null); } })]));
  if(list.length){
    var hist = el("div", { style: "margin-top:12px;" });
    list.slice(0, 4).forEach(function(t){
      hist.appendChild(el("button", { type: "button", class: "kv test-row", onclick: function(){ openForm(t); } }, [
        el("div", { class: "k", text: HC.fmtDate(t.date) }),
        el("div", { class: "v", style: "font-size:12px; text-align:right; font-family:inherit; font-weight:500;", text: line(t) })
      ]));
    });
    box.appendChild(hist);
    box.appendChild(el("button", { class: "link-btn", type: "button", style: "margin-top:8px; color:var(--danger-ink);", text: "Delete the latest set", onclick: function(){
      HC.confirm({ title: "Delete the latest set?", message: HC.fmtDate(list[0].date) + " — " + line(list[0]), confirmLabel: "Delete", danger: true, onConfirm: function(){
        HC.state.tests = HC.state.tests.filter(function(x){ return x.id !== list[0].id; }); HC.save();
      } });
    } }));
  }
}

// A gentle nudge on Today when the weekly set is due.
function renderDue(){
  var box = $("dueCard");
  var n = HC.diffDays(HC.todayKey(), HC.testsDue());
  box.innerHTML = "";
  box.hidden = !(n <= 0);
  if(box.hidden) return;
  box.appendChild(el("div", { class: "section-title", text: "Weekly tests due" }));
  box.appendChild(el("p", { class: "small", style: "margin:6px 2px 10px;", text: HC.testsDuePhrase() + ". Takes about five minutes." }));
  box.appendChild(el("button", { class: "btn btn-primary", type: "button", text: "Log tests now", onclick: function(){ openForm(null); } }));
}

HC.on.render.push(function(){ render(); renderDue(); });
HC.on.refresh.push(function(){ render(); renderDue(); });
HC.on.show.train = (HC.on.show.train || []).concat([render]);
HC.on.show.today = (HC.on.show.today || []).concat([renderDue]);
})();
