/* tests.js — the weekly objective tests: near-point of convergence, reaction time
   (ruler drop, left vs right), lying-to-standing heart rate. Feeds the weekly report. */
(function(){
"use strict";
var HC = window.HC, el = HC.el, $ = HC.$;

var TEST_EVERY_DAYS = 7;
// Ruler-drop: distance fallen d (cm) -> reaction time t = sqrt(2d/g).
HC.rtMs = function(cm){ return (typeof cm === "number" && cm > 0) ? Math.round(Math.sqrt(2 * cm / 981) * 1000) : null; };

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
  var rtL = num(t.rtL, "cm", 0, 60), rtR = num(t.rtR, "cm", 0, 60);
  var hl = num(t.hrLie, "bpm", 30, 220), h1 = num(t.hrS1, "bpm", 30, 240), h3 = num(t.hrS3, "bpm", 30, 240);
  var note = el("input", { type: "text", placeholder: "Optional", value: t.note || "" });
  var base = "Someone holds a ruler; catch it as it drops. Average of 3 drops, in cm.";
  var rtHint = el("p", { class: "hint", text: base });
  function sync(){
    var a = HC.rtMs(val(rtL)), b = HC.rtMs(val(rtR));
    rtHint.textContent = (a || b) ? "≈ " + (a ? a + " ms left" : "") + (a && b ? ", " : "") + (b ? b + " ms right" : "") : base;
  }
  rtL.addEventListener("input", sync); rtR.addEventListener("input", sync); sync();
  HC.openModal([
    el("h3", { text: existing ? "Edit test results" : "Log this week's tests" }),
    el("div", { class: "stack", style: "gap:0; max-height:58vh; overflow-y:auto; padding-right:2px;" }, [
      field("Date", date),
      field("Near-point of convergence (cm)", npc, "Pen at arm's length, slowly bring it to your nose; stop when it doubles. Measure the distance. Best of 3."),
      field("Reaction time — left hand (ruler drop, cm)", rtL),
      field("Reaction time — right hand (ruler drop, cm)", rtR),
      rtHint,
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
