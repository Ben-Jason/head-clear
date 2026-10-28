/* info.js — reminders (Web Push), plan settings, meds list, the report summary,
   red flags, feature notes, erase, install banner, service-worker registration. */
(function(){
"use strict";
var HC = window.HC, el = HC.el, $ = HC.$;

/* ---------------- push reminders ---------------- */
function urlBase64ToUint8Array(b64){
  var padding = "=".repeat((4 - (b64.length % 4)) % 4);
  var raw = atob((b64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  var out = new Uint8Array(raw.length);
  for(var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function isStandalone(){ return window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches; }
function isIOS(){ return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }

function refreshReminderUI(){
  var btn = $("remindersBtn"), desc = $("remindersDesc");
  if(!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)){
    desc.textContent = "Push notifications aren't supported in this browser."; btn.hidden = true; return;
  }
  if(isIOS() && !isStandalone()){
    desc.textContent = "Add Head Clear to your Home Screen first, then open it from there to enable reminders."; btn.hidden = true; return;
  }
  btn.hidden = false;
  navigator.serviceWorker.ready.then(function(reg){ return reg.pushManager.getSubscription(); }).then(function(sub){
    if(sub){
      desc.textContent = "Reminders are on: 8am morning check-in, 8pm evening check-in (with a medication nudge), and a nudge when your BCTT retest is due.";
      btn.textContent = "Turn off reminders"; btn.onclick = disableReminders;
      HC.syncConfig();
    } else {
      desc.textContent = "Get a push notification at 8am and 8pm, plus a nudge when your BCTT retest is due.";
      btn.textContent = "Enable reminders"; btn.onclick = enableReminders;
    }
  }).catch(function(){ desc.textContent = "Couldn't check reminder status."; });
}
function enableReminders(){
  var btn = $("remindersBtn"), desc = $("remindersDesc");
  btn.disabled = true;
  Notification.requestPermission().then(function(perm){
    if(perm !== "granted"){ desc.textContent = "Notifications permission was not granted."; return null; }
    return navigator.serviceWorker.ready.then(function(reg){
      return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(HC.VAPID_PUBLIC_KEY) });
    }).then(function(sub){
      return fetch(HC.WORKER_URL + "/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
    }).then(function(){ refreshReminderUI(); });
  }).catch(function(){ desc.textContent = "Couldn't enable reminders — try again."; }).finally(function(){ btn.disabled = false; });
}
function disableReminders(){
  var btn = $("remindersBtn");
  btn.disabled = true;
  navigator.serviceWorker.ready.then(function(reg){ return reg.pushManager.getSubscription(); }).then(function(sub){ if(sub) return sub.unsubscribe(); }).then(function(){
    fetch(HC.WORKER_URL + "/unsubscribe", { method: "POST" }).catch(function(){});
    refreshReminderUI();
  }).catch(function(){}).finally(function(){ btn.disabled = false; });
}

/* ---------------- plan settings ---------------- */
function settingRow(label, hint, control){
  return el("div", { class: "field", style: "margin-top:12px;" }, [el("label", { text: label }), control, hint ? el("p", { class: "hint", text: hint }) : null]);
}
function renderSettings(){
  var box = $("settingsCard"), p = HC.state.profile;
  box.innerHTML = "";
  box.appendChild(el("div", { class: "section-title", style: "margin-bottom:2px;", text: "My plan" }));
  box.appendChild(el("div", { class: "kv" }, [
    el("div", { class: "k", text: "Heart-rate band" }),
    el("div", { class: "v" }, [el("span", { text: p.hrLow + "–" + p.hrHigh + " bpm  " }), el("button", { class: "link-btn", type: "button", text: "Edit", onclick: function(){ HC.editBand(); } })])
  ]));
  box.appendChild(settingRow("Name on the weekly report", "Printed at the top of the PDF. Stays on this phone.",
    el("input", { type: "text", maxlength: "60", placeholder: "Your name", value: p.name || "", onchange: function(e){ p.name = e.target.value.trim(); HC.save(); } })));
  box.appendChild(settingRow("Bedtime", "Screens-off time is worked out as 2 hours before this.",
    el("input", { type: "time", value: p.bedtime, onchange: function(e){ if(e.target.value){ p.bedtime = e.target.value; HC.save(); HC.renderAll(); } } })));
  var sel = el("select", { onchange: function(e){ p.allowedRise = +e.target.value; HC.save(); } });
  [[0, "0 — any rise counts"], [1, "1 point (default)"], [2, "2 points"]].forEach(function(o){ sel.appendChild(el("option", { value: String(o[0]), text: o[1], selected: p.allowedRise === o[0] })); });
  box.appendChild(settingRow("Symptom rise that still counts as tolerated", "Compared with your score before the session, on the 0–10 scale. The usual rule is that symptoms shouldn't be provoked at all — 1 point absorbs scoring noise.", sel));
  box.appendChild(settingRow("Minimum gap between cardio and gym (hours)", "Gym belongs in the afternoon after morning cardio, never straight after.",
    el("input", { type: "number", inputmode: "numeric", min: 1, max: 12, value: String(p.gymGapHours), onchange: function(e){ var v = +e.target.value; if(v >= 1 && v <= 12){ p.gymGapHours = v; HC.save(); } } })));
}

/* ---------------- meds & supplements list ---------------- */
var WHEN_OPTS = [["morning", "Morning"], ["evening", "Evening"], ["any", "Any time"]];
var saveTimer;
function saveSoon(){ clearTimeout(saveTimer); saveTimer = setTimeout(function(){ HC.save(); }, 350); }
function renderMedsEditor(){
  var box = $("medsEditorCard");
  box.innerHTML = "";
  box.appendChild(el("div", { class: "section-title", style: "margin-bottom:4px;", text: "Meds & supplements" }));
  box.appendChild(el("p", { class: "small", style: "margin-bottom:6px;", text: "Type the dose exactly as you were told — the app doesn't suggest or check doses. These appear as tick-boxes on Today." }));
  HC.state.meds.forEach(function(m){
    var when = el("select", { onchange: function(e){ m.when = e.target.value; HC.save(); } });
    WHEN_OPTS.forEach(function(o){ when.appendChild(el("option", { value: o[0], text: o[1], selected: m.when === o[0] })); });
    box.appendChild(el("div", { class: "med-row" }, [
      el("input", { type: "text", value: m.name, placeholder: "Name", oninput: function(e){ m.name = e.target.value; saveSoon(); } }),
      el("div", { class: "row2" }, [
        el("input", { type: "text", value: m.dose, placeholder: "Dose as prescribed", oninput: function(e){ m.dose = e.target.value; saveSoon(); } }),
        when
      ]),
      el("button", { class: "link-btn med-del", type: "button", style: "color:var(--danger-ink);", text: "Remove", onclick: function(){
        HC.confirm({ title: "Remove " + (m.name || "this item") + "?", message: "It's taken off your daily list. Past ticks stay in your history.", confirmLabel: "Remove", danger: true, onConfirm: function(){
          HC.state.meds = HC.state.meds.filter(function(x){ return x.id !== m.id; }); HC.save(); renderMedsEditor();
        } });
      } })
    ]));
  });
  box.appendChild(el("button", { class: "btn btn-ghost", type: "button", style: "margin-top:10px;", text: "Add item", onclick: function(){
    HC.state.meds.push({ id: HC.uid(), name: "", dose: "", when: "any" }); HC.save(); renderMedsEditor();
  } }));
}

/* ---------------- static content ---------------- */
function renderRedFlags(){
  var root = $("redFlagList");
  root.innerHTML = "";
  ["Worsening or severe headache", "Repeated vomiting", "Seizure", "Increasing confusion, or can't be woken", "Slurred speech, weakness or numbness", "Very unusual behaviour"].forEach(function(t){
    root.appendChild(el("div", { class: "redflag-item" }, [el("span", { html: HC.ICON_X, style: "display:flex;" }), el("span", { text: t })]));
  });
}
function renderReport(){
  var box = $("reportCard"), r = HC.plan.report;
  box.innerHTML = "";
  box.hidden = !(r && r.sections && r.sections.length);
  if(box.hidden) return;
  box.appendChild(el("div", { class: "section-title", style: "margin-bottom:8px;", text: r.title || "About your plan" }));
  r.sections.forEach(function(x){ box.appendChild(el("p", {}, [el("b", { text: x[0] + ". " }), x[1]])); });
  if(r.footer) box.appendChild(el("p", { class: "small", text: r.footer }));
}

/* ---------------- plan file (personal details, kept on this device only) ---------------- */
function renderPlanFile(){
  var box = $("planFileCard"), loaded = HC.hasPlanFile();
  box.innerHTML = "";
  box.appendChild(el("div", { class: "section-title", style: "margin-bottom:6px;", text: "My plan file" }));
  box.appendChild(el("p", { class: "small", style: "margin-bottom:10px;", text: loaded
    ? "A plan file is loaded on this device. It holds your personal restrictions, clearance list, meds and numbers. It never leaves your phone."
    : "Paste the plan file you were given to tailor the app to you. It's stored only on this device — it isn't part of the public app." }));
  var ta = el("textarea", { class: "summary-box", style: "min-height:110px;", placeholder: "Paste the plan file text here" });
  var show = !loaded;
  var holder = el("div", { style: "display:flex; flex-direction:column; gap:10px;" });
  function paint(){
    holder.innerHTML = "";
    if(show){
      holder.appendChild(ta);
      holder.appendChild(el("button", { class: "btn btn-primary", type: "button", text: loaded ? "Replace plan file" : "Load plan file", onclick: loadFromText }));
    }
    if(loaded){
      holder.appendChild(el("div", { class: "summary-actions" }, [
        el("button", { class: "btn btn-ghost", type: "button", text: show ? "Cancel" : "Replace…", onclick: function(){ show = !show; paint(); } }),
        el("button", { class: "btn btn-ghost", type: "button", style: "color:var(--danger-ink);", text: "Remove", onclick: function(){
          HC.confirm({ title: "Remove the plan file?", message: "The app goes back to its generic plan. Your logged data stays.", confirmLabel: "Remove", danger: true, onConfirm: function(){ HC.clearPlan(); HC.save(); HC.renderAll(); } });
        } })
      ]));
    }
  }
  function loadFromText(){
    var obj;
    try{ obj = JSON.parse(ta.value.trim()); }catch(e){ HC.notice("Couldn't read that", ["It doesn't look like a plan file. Paste the whole text, from the first { to the last }."]); return; }
    if(!obj || obj.format !== "headclear-plan"){ HC.notice("Not a plan file", ["This text isn't a Head Clear plan file."]); return; }
    HC.setPlan(obj);
    HC.applyPlanSettings(obj);
    HC.save(); HC.renderAll();
    HC.toast("Plan file loaded.");
  }
  paint();
  box.appendChild(holder);
}

/* ---------------- feature ideas + erase ---------------- */
var notesEl = $("featureNotesInput"), notesTimer;
notesEl.value = HC.state.featureNotes || "";
notesEl.addEventListener("input", function(){
  clearTimeout(notesTimer);
  notesTimer = setTimeout(function(){ HC.state.featureNotes = notesEl.value; HC.save(); renderFeedback(); }, 400);
});

// "Send to Claude": posts the note to this app's own Worker inbox, where a routine on the
// Mac picks it up, drafts the change on a separate branch and waits for approval.
function appVersion(){
  var s = [].filter.call(document.scripts, function(x){ return /js\/core\.js/.test(x.src); })[0];
  var m = s && /[?&]v=([^&]+)/.exec(s.src);
  return m ? m[1] : "";
}
function renderFeedback(){
  var box = $("feedbackActions"), fb = HC.state.feedback, text = (notesEl.value || "").trim();
  box.innerHTML = "";
  var key = HC.plan.feedbackKey;
  var already = !!text && fb.sentText === text;
  var btn = el("button", { class: "btn btn-primary", type: "button", text: already ? "Sent ✓" : "Send to Claude", disabled: !text || !key || already });
  btn.addEventListener("click", function(){
    btn.disabled = true; btn.textContent = "Sending…";
    fetch(HC.WORKER_URL + "/feedback", { method: "POST", headers: { "Content-Type": "application/json", "X-Feedback-Key": key },
      body: JSON.stringify({ text: text, meta: { v: appVersion(), standalone: window.navigator.standalone === true } }) })
      .then(function(r){ if(!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function(){ fb.sentAt = new Date().toISOString(); fb.sentText = text; HC.save(); HC.toast("Sent. Claude will draft it for your review."); renderFeedback(); })
      .catch(function(e){ HC.toast(e && e.message === "401" ? "The feedback key was rejected — re-paste your plan file." : "Couldn't send — check your connection and try again."); renderFeedback(); });
  });
  box.appendChild(btn);
  var hint = !key ? "Sending is switched on by the feedback key in your plan file (Info → My plan file)."
    : fb.sentAt ? "Last sent " + new Date(fb.sentAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + ". Your note stays here until you clear it." : "Your note stays here until you clear it.";
  box.appendChild(el("p", { class: "small", style: "margin-top:8px;", text: hint }));
}
HC.on.render.push(renderFeedback);
$("resetDataBtn").addEventListener("click", function(){
  HC.confirm({
    title: "Erase all data?",
    message: "This removes every checklist, session, symptom score, plan setting and ladder entry stored on this device. It can't be undone.",
    confirmLabel: "Erase everything", danger: true,
    onConfirm: function(){
      try{ localStorage.removeItem(HC.KEY); }catch(e){}
      HC.clearPlan();
      HC.state = HC.defaultState();
      HC.resetTodayUI(); HC.resetTrainUI();
      notesEl.value = "";
      HC.save(); HC.renderAll();
    }
  });
});

/* ---------------- install banner + service worker ---------------- */
(function(){
  var dismissed = false;
  try{ dismissed = localStorage.getItem("headclear_install_dismissed") === "1"; }catch(e){}
  if(isIOS() && !isStandalone() && !dismissed) $("installBanner").hidden = false;
  $("installClose").addEventListener("click", function(){
    $("installBanner").hidden = true;
    try{ localStorage.setItem("headclear_install_dismissed", "1"); }catch(e){}
  });
})();

if("serviceWorker" in navigator){
  // When a new release's worker takes over, reload once so the page and its scripts match.
  var hadController = !!navigator.serviceWorker.controller, reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", function(){
    if(!hadController || reloaded) return;
    reloaded = true; location.reload();
  });
  window.addEventListener("load", function(){ navigator.serviceWorker.register("sw.js").catch(function(){}); });
}

/* ---------------- wiring ---------------- */
HC.on.render.push(function(){ renderPlanFile(); renderSettings(); renderMedsEditor(); renderRedFlags(); renderReport(); refreshReminderUI(); });
HC.on.show.info = [function(){ renderSettings(); }];
})();
