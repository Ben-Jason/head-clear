/* daily.js — the extra daily logs that feed the weekly report:
   morning autonomic check, headache + painkillers, triggers + events. */
(function(){
"use strict";
var HC = window.HC, el = HC.el, $ = HC.$;

function chipRow(options, isOn, onPick){
  var wrap = el("div", { class: "sleep-chips" });
  options.forEach(function(o){
    wrap.appendChild(el("button", { type: "button", class: isOn(o.v) ? "on" : "", text: o.l, onclick: function(){ onPick(o.v); } }));
  });
  return wrap;
}
function group(label, node, hint){
  return el("div", { class: "sleep-group" }, [el("label", { text: label }), node, hint ? el("p", { class: "hint", text: hint }) : null]);
}
function numInput(value, o, onSave){
  var inp = el("input", { type: "number", inputmode: o.decimal ? "decimal" : "numeric", min: o.min, max: o.max, step: o.step || "1", placeholder: o.ph || "", value: value === undefined || value === null ? "" : String(value) });
  inp.addEventListener("change", function(){
    var v = inp.value === "" ? null : +inp.value;
    if(v !== null && (isNaN(v) || v < o.min || v > o.max)){ inp.classList.add("err"); return; }
    inp.classList.remove("err");
    onSave(v);
  });
  return inp;
}

/* ---------------- morning autonomic check ---------------- */
// Collapses to a summary once both numbers are in; "Edit" reopens it until the next visit to Today.
var autoOpen = false;
function autoLogged(a){ return typeof a.rhr === "number" && typeof a.hrv === "number"; }
function renderAuto(){
  var box = $("autoCard"), a = HC.today().auto;
  box.innerHTML = "";
  var collapsed = autoLogged(a) && !autoOpen;
  var btn = el("button", { type: "button", class: "btn btn-ghost btn-sm", text: collapsed ? "Edit" : "Done", onclick: function(){ autoOpen = collapsed; renderAuto(); } });
  btn.hidden = !autoLogged(a);
  box.appendChild(el("div", { class: "block-head", style: "margin-bottom:2px;" }, [el("div", { class: "section-title", style: "margin:0;", text: "Morning autonomic check" }), btn]));
  if(collapsed){
    box.appendChild(el("div", { class: "log-summary", style: "margin-top:8px;" }, [[a.rhr + " bpm", "Resting HR"], [a.hrv + " ms", "Overnight HRV"]].map(function(t){
      return el("div", { class: "stat-tile" }, [el("b", { text: t[0] }), el("span", { text: t[1] })]);
    })));
    if(a.hrvStatus) box.appendChild(el("p", { class: "small", style: "margin:8px 2px 0;", text: "HRV status: " + a.hrvStatus }));
    return;
  }
  box.appendChild(el("p", { class: "small", style: "margin:4px 2px 0;", text: "Both numbers are in your Garmin app. They're graphed in your weekly report." }));
  function save(k, v){ var d = HC.today(); if(v === null || v === undefined) delete d.auto[k]; else d.auto[k] = v; HC.save(); btn.hidden = !autoLogged(d.auto); } // reveal "Done" without redrawing the inputs (keeps focus on iOS)
  var row = el("div", { class: "two-col" }, [
    el("div", { class: "field" }, [el("label", { text: "Resting HR (bpm)" }), numInput(a.rhr, { min: 30, max: 160, ph: "e.g. 62" }, function(v){ save("rhr", v); })]),
    el("div", { class: "field" }, [el("label", { text: "Overnight HRV (ms)" }), numInput(a.hrv, { min: 5, max: 250, ph: "e.g. 48" }, function(v){ save("hrv", v); })])
  ]);
  box.appendChild(el("div", { style: "margin-top:12px;" }, [row]));
  box.appendChild(group("HRV status (Garmin)", chipRow(HC.HRV_STATUS.map(function(s){ return { v: s, l: s }; }), function(v){ return a.hrvStatus === v; }, function(v){ save("hrvStatus", a.hrvStatus === v ? null : v); renderAuto(); })));
}

/* ---------------- headache + painkillers ---------------- */
function renderHead(){
  var box = $("headCard"), h = HC.today().head;
  box.innerHTML = "";
  box.appendChild(el("div", { class: "section-title", text: "Headache & painkillers" }));
  var scale = el("div", { class: "scale-row" });
  HC.renderScale(scale, typeof h.peak === "number" ? h.peak : null, function(v){ HC.today().head.peak = v; if(v === 0){ delete HC.today().head.hours; delete HC.today().head.loc; } HC.save(); renderHead(); }, 10);
  box.appendChild(group("Worst headache today (0 = none)", scale));
  box.appendChild(el("div", { class: "scale-legend" }, [el("span", { text: "0 · none" }), el("span", { text: "10 · severe" })]));
  if(typeof h.peak === "number" && h.peak > 0){
    box.appendChild(group("How long did it last?", chipRow(HC.HEAD_HOURS, function(v){ return h.hours === v; }, function(v){ HC.today().head.hours = v; HC.save(); renderHead(); })));
    var loc = h.loc || [];
    box.appendChild(group("Where?", chipRow(HC.HEAD_LOC.map(function(x){ return { v: x, l: x }; }), function(v){ return loc.indexOf(v) >= 0; }, function(v){
      var d = HC.today().head, cur = (d.loc || []).slice(), i = cur.indexOf(v);
      if(i >= 0) cur.splice(i, 1); else cur.push(v);
      d.loc = cur; HC.save(); renderHead();
    })));
  }
  var pkList = el("div", { class: "pk-list" });
  var pk = h.pk || {};
  HC.plan.painkillers.forEach(function(name){
    var n = pk[name] || 0;
    function set(v){ var d = HC.today().head; d.pk = d.pk || {}; if(v > 0) d.pk[name] = v; else delete d.pk[name]; HC.save(); renderHead(); }
    pkList.appendChild(el("div", { class: "pk-row" + (n ? " on" : "") }, [
      el("span", { class: "pk-name", text: name }),
      el("button", { type: "button", class: "pk-btn", "aria-label": "One fewer " + name, text: "−", disabled: n === 0, onclick: function(){ set(n - 1); } }),
      el("span", { class: "pk-n", text: String(n) }),
      el("button", { type: "button", class: "pk-btn", "aria-label": "One more " + name, text: "+", onclick: function(){ set(n + 1); } })
    ]));
  });
  box.appendChild(group("Painkillers taken today (doses)", pkList));
  var d = HC.today().head;
  box.appendChild(el("p", { class: "small", style: "margin-top:10px;", text: typeof d.pk === "object" && Object.keys(d.pk || {}).length ? "" : "Leave at 0 if none — your doctor will see the count per week." }));
}

/* ---------------- triggers + events ---------------- */
function renderEvents(){
  var box = $("eventsCard"), ev = HC.today().ev;
  box.innerHTML = "";
  box.appendChild(el("div", { class: "section-title", text: "Triggers & events" }));
  function toggle(list, v){ var i = list.indexOf(v); if(i >= 0) list.splice(i, 1); else list.push(v); HC.save(); renderEvents(); }
  box.appendChild(group("What set symptoms off today?", chipRow(HC.plan.triggerTags.map(function(x){ return { v: x, l: x }; }), function(v){ return ev.trig.indexOf(v) >= 0; }, function(v){ toggle(HC.today().ev.trig, v); })));
  box.appendChild(group("Anything to flag to your doctor?", chipRow(HC.EVENT_TAGS.map(function(x){ return { v: x.id, l: x.label }; }), function(v){ return ev.evt.indexOf(v) >= 0; }, function(v){ toggle(HC.today().ev.evt, v); })));
  var flagged = HC.EVENT_TAGS.some(function(x){ return x.flag && ev.evt.indexOf(x.id) >= 0; });
  if(flagged) box.appendChild(el("p", { class: "hint bad", style: "margin-top:10px;", text: "A near-faint, a knock to the head or vomiting should be reported — see the red-flag list in Info and contact your doctor if it's new or getting worse." }));
}

/* ---------------- wiring ---------------- */
function all(){ renderAuto(); renderHead(); renderEvents(); }
HC.on.render.push(all);
HC.on.show.today = (HC.on.show.today || []).concat([function(){ autoOpen = false; all(); }]);
})();
