/* report.js — the weekly report for the doctor and physio.
   Two A4 pages drawn on canvases (page 1 doctor summary, page 2 physio training & rehab),
   previewed in-app and wrapped into a PDF (JPEG pages, written by hand — no library) that is
   handed to the iOS share sheet, plus a plain-text version for WhatsApp.
   Everything is built on this device from the data in this device's storage; nothing is uploaded. */
(function(){
"use strict";
var HC = window.HC, el = HC.el, $ = HC.$;

var PW = 794, PH = 1123, M = 36, CW = PW - 2 * M, SCALE = 2;
var C = {
  ink: "#1b2a24", mute: "#5d6b63", faint: "#8a958d", line: "#d9dfd8", panel: "#f3f6f2", paper: "#ffffff",
  deep: "#1c3d35", accent: "#2c6b57", accentSoft: "#e1ece3",
  good: "#2f7d4f", goodSoft: "#e2eee1", goodInk: "#1f5c3a",
  warn: "#af6317", warnSoft: "#f7e8d2", warnInk: "#7a4310",
  danger: "#ae2e21", dangerSoft: "#fae2dd", dangerInk: "#7c1f15"
};
var F = {
  sans: '-apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif',
  mono: '"SF Mono", Menlo, "IBM Plex Mono", Consolas, monospace',
  serif: 'Georgia, "Times New Roman", serif'
};

/* ---------------- small helpers ---------------- */
function isNum(v){ return typeof v === "number" && !isNaN(v); }
function mean(a){ var x = a.filter(isNum); return x.length ? x.reduce(function(s, v){ return s + v; }, 0) / x.length : null; }
function sum(a){ return a.reduce(function(s, v){ return s + (isNum(v) ? v : 0); }, 0); }
function rnd(v, dp){ var p = Math.pow(10, dp || 0); return Math.round(v * p) / p; }
function fmt(v, dp){ return isNum(v) ? rnd(v, dp || 0).toFixed(dp || 0) : "—"; }
function dayLabel(k, o){ return HC.fmtDate(k, o || { weekday: "short", day: "numeric", month: "short" }); }

/* ---------------- gathering a week of data ---------------- */
function keysEnding(end){ var out = []; for(var i = 6; i >= 0; i--) out.push(HC.addDays(end, -i)); return out; }

function summarize(keys){
  var S = { keys: keys, days: [], sessions: [], trig: {}, events: [], notes: [], meds: [], symptom: {}, focus: {} };
  keys.forEach(function(k){
    var d = HC.peekDay(k), m = { key: k, has: !!d, sessions: [] };
    if(d){
      var touched = HC.hiaTouched(d);
      m.sx = isNum(d.symptomScore) ? d.symptomScore : null;
      m.hia = touched ? HC.hiaSeverity(d) : null;
      m.hiaN = touched ? HC.hiaCount(d) : null;
      m.sleep = isNum(d.sleep.hours) ? d.sleep.hours : null;
      m.rest = isNum(d.sleep.quality) ? d.sleep.quality : null;
      m.rhr = isNum(d.auto.rhr) ? d.auto.rhr : null;
      m.hrv = isNum(d.auto.hrv) ? d.auto.hrv : null;
      m.lh = isNum(d.auto.lightheaded) ? d.auto.lightheaded : null;
      m.fluids = isNum(d.auto.fluids) ? d.auto.fluids : null;
      m.headPeak = isNum(d.head.peak) ? d.head.peak : null;
      m.headHours = isNum(d.head.hours) ? d.head.hours : null;
      m.pk = d.head.pk ? sum(Object.keys(d.head.pk).map(function(n){ return d.head.pk[n]; })) : null;
      m.sessions = d.sessions.map(function(s){ return { date: k, s: s, v: HC.sessionVerdict(s) }; });
      if(touched) HC.HIA_SYMPTOMS.forEach(function(sy){ if(isNum(d.hia[sy.id])) (S.symptom[sy.id] = S.symptom[sy.id] || []).push(d.hia[sy.id]); });
      d.ev.trig.forEach(function(t){ S.trig[t] = (S.trig[t] || 0) + 1; });
      d.ev.evt.forEach(function(id){
        var tag = HC.EVENT_TAGS.filter(function(x){ return x.id === id; })[0];
        if(tag) S.events.push({ date: k, label: tag.label, flag: !!tag.flag });
      });
      if(d.journal && d.journal.trim()) S.notes.push({ date: k, text: d.journal.replace(/\s+/g, " ").trim() });
      m.logged = m.sx !== null || touched || m.sleep !== null || m.rhr !== null || m.headPeak !== null || d.sessions.length > 0 || HC.state.meds.some(function(md){ return d.meds[md.id]; });
    }
    S.days.push(m);
    m.sessions.forEach(function(x){
      S.sessions.push(x);
      (x.s.focus || []).forEach(function(f){ S.focus[f] = (S.focus[f] || 0) + 1; });
    });
  });
  var D = S.days;
  S.logged = D.filter(function(m){ return m.logged; }).length;
  S.sx = mean(D.map(function(m){ return m.sx; }));
  S.sxN = D.filter(function(m){ return m.sx !== null && m.sx !== undefined; }).length;
  S.hia = mean(D.map(function(m){ return m.hia; }));
  S.hiaN = mean(D.map(function(m){ return m.hiaN; }));
  S.sleep = mean(D.map(function(m){ return m.sleep; }));
  S.rest = mean(D.map(function(m){ return m.rest; }));
  S.rhr = mean(D.map(function(m){ return m.rhr; }));
  S.hrv = mean(D.map(function(m){ return m.hrv; }));
  S.fluids = mean(D.map(function(m){ return m.fluids; }));
  S.lhDays = D.filter(function(m){ return isNum(m.lh) && m.lh >= 1; }).length;
  S.headLogged = D.filter(function(m){ return m.headPeak !== null && m.headPeak !== undefined; }).length;
  S.headDays = D.filter(function(m){ return isNum(m.headPeak) && m.headPeak > 0; }).length;
  S.headMax = S.headLogged ? Math.max.apply(null, D.map(function(m){ return isNum(m.headPeak) ? m.headPeak : 0; })) : null;
  S.pkDays = D.filter(function(m){ return isNum(m.pk) && m.pk > 0; }).length;
  S.pkDoses = sum(D.map(function(m){ return m.pk; }));
  S.nTol = S.sessions.filter(function(x){ return x.v.tolerated; }).length;
  S.nFlag = S.sessions.filter(function(x){ return x.v.cls === "warn"; }).length;
  S.nPend = S.sessions.filter(function(x){ return x.v.pending; }).length;
  S.cardioMin = sum(S.sessions.filter(function(x){ return x.s.type === "cardio"; }).map(function(x){ return x.s.duration; }));
  var peaks = S.sessions.filter(function(x){ return x.s.type === "cardio" && isNum(x.s.peakHr); });
  S.peakMax = peaks.length ? Math.max.apply(null, peaks.map(function(x){ return x.s.peakHr; })) : null;
  S.meds = HC.state.meds.map(function(md){
    return { name: md.name || "Unnamed", days: D.map(function(m){ return !!(m.has && HC.peekDay(m.key).meds[md.id]); }) };
  });
  S.symptomMean = {};
  Object.keys(S.symptom).forEach(function(id){ S.symptomMean[id] = mean(S.symptom[id]); });
  var inWin = HC.sortedTests().filter(function(t){ return t.date >= keys[0] && t.date <= keys[6]; });
  S.test = inWin[0] || null;
  return S;
}

function buildReport(end){
  var keys = keysEnding(end), prevKeys = keysEnding(HC.addDays(end, -7));
  var cur = summarize(keys), prev = summarize(prevKeys);
  var tests = HC.sortedTests();
  var before = tests.filter(function(t){ return t.date < keys[0]; })[0] || null;
  var p = HC.state.profile, ps = HC.planStatus();
  var lastB = HC.state.bctt.slice().sort(function(a, b){ return a.date < b.date ? 1 : -1; })[0] || null;
  return {
    end: end, keys: keys, cur: cur, prev: prev, hasPrev: prev.logged > 0,
    name: (p.name || "").trim(), context: (HC.plan.reportContext || "").trim(),
    profile: p, ps: ps, phaseName: HC.plan.phaseNames[ps.phase - 1], bcttNext: HC.bcttPhrase(), bcttLast: lastB,
    testNow: cur.test, testBefore: before, testFirst: tests.length ? tests[tests.length - 1] : null,
    questions: HC.state.questions.filter(function(q){ return !q.done; }),
    generated: HC.fmtDate(HC.todayKey(), { day: "numeric", month: "short", year: "numeric" }),
    range: dayLabel(keys[0], { weekday: "short", day: "numeric", month: "short" }) + " – " + dayLabel(keys[6], { weekday: "short", day: "numeric", month: "short", year: "numeric" })
  };
}

// delta of cur vs prev. better: "low" | "high" | null (neutral)
function dlt(cur, prev, dp, better){
  if(!isNum(cur) || !isNum(prev)) return null;
  var r = rnd(cur - prev, dp);
  if(r === 0) return { dir: 0, txt: "same as last week", col: C.mute };
  var good = better === "low" ? r < 0 : better === "high" ? r > 0 : null;
  return { dir: r > 0 ? 1 : -1, txt: Math.abs(r).toFixed(dp) + " vs last week", col: good === null ? C.mute : good ? C.good : C.danger };
}

/* ---------------- canvas drawing toolkit ---------------- */
function newCanvas(){
  var cv = document.createElement("canvas");
  cv.width = PW * SCALE; cv.height = PH * SCALE;
  var ctx = cv.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = C.paper; ctx.fillRect(0, 0, PW, PH);
  ctx.textBaseline = "alphabetic";
  return { cv: cv, ctx: ctx };
}
function setFont(ctx, o){ ctx.font = (o.weight || 400) + " " + (o.size || 11) + "px " + (o.font || F.sans); }
function ell(ctx, s, maxW){
  s = String(s);
  if(!maxW || ctx.measureText(s).width <= maxW) return s;
  while(s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}
// draws text; returns its width. o: size weight color font align maxW
function txt(ctx, s, x, y, o){
  o = o || {};
  setFont(ctx, o);
  ctx.fillStyle = o.color || C.ink;
  ctx.textAlign = o.align || "left";
  s = o.maxW ? ell(ctx, s, o.maxW) : String(s);
  ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}
function measure(ctx, s, o){ setFont(ctx, o || {}); return ctx.measureText(String(s)).width; }
// word-wrapped paragraph; returns the y for the line after the last one
function wrap(ctx, s, x, y, maxW, lh, o, maxLines){
  setFont(ctx, o);
  var words = String(s).split(" "), line = "", n = 0;
  for(var i = 0; i < words.length; i++){
    var test = line ? line + " " + words[i] : words[i];
    if(ctx.measureText(test).width > maxW && line){
      n++;
      if(maxLines && n === maxLines){ txt(ctx, line + "…", x, y, Object.assign({}, o, { maxW: maxW })); return y + lh; }
      txt(ctx, line, x, y, o); y += lh; line = words[i];
    } else line = test;
  }
  if(line){ txt(ctx, line, x, y, Object.assign({}, o, { maxW: maxW })); y += lh; }
  return y;
}
function rrect(ctx, x, y, w, h, r, fill, stroke){
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  if(fill){ ctx.fillStyle = fill; ctx.fill(); }
  if(stroke){ ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
function hline(ctx, x1, x2, y, col, w){ ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.strokeStyle = col; ctx.lineWidth = w || 1; ctx.stroke(); }
function circle(ctx, x, y, r, fill){ ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
function tri(ctx, x, y, s, dir, col){ // x,y = centre
  ctx.beginPath();
  if(dir > 0){ ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s * 0.8); ctx.lineTo(x - s, y + s * 0.8); }
  else { ctx.moveTo(x, y + s); ctx.lineTo(x + s, y - s * 0.8); ctx.lineTo(x - s, y - s * 0.8); }
  ctx.closePath(); ctx.fillStyle = col; ctx.fill();
}
function tick(ctx, x, y, s, col){
  ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x - s * 0.3, y + s * 0.7); ctx.lineTo(x + s, y - s * 0.7);
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
}
function section(ctx, title, x, y, w){
  txt(ctx, title.toUpperCase(), x, y, { size: 9.5, weight: 700, color: C.accent });
  hline(ctx, x, x + w, y + 6, C.line, 1);
  return y + 20;
}
function deltaLine(ctx, x, y, d, noPrev){
  if(!d){ txt(ctx, noPrev ? "no earlier week to compare" : "—", x, y, { size: 8.5, color: C.faint }); return; }
  if(d.dir === 0){ txt(ctx, d.txt, x, y, { size: 8.5, color: d.col }); return; }
  tri(ctx, x + 4, y - 3, 4, d.dir, d.col);
  txt(ctx, d.txt, x + 12, y, { size: 8.5, weight: 600, color: d.col });
}
var CELL = {
  g: { bg: C.goodSoft, fg: C.goodInk }, w: { bg: C.warnSoft, fg: C.warnInk },
  d: { bg: C.dangerSoft, fg: C.dangerInk }, n: { bg: C.panel, fg: C.ink }
};
function band(sx10){ return sx10 <= 2 ? "g" : sx10 <= 5 ? "w" : "d"; }

function header(ctx, R, tag, pageNo){
  var h = pageNo === 1 ? 92 : 72;
  ctx.fillStyle = C.deep; ctx.fillRect(0, 0, PW, h);
  txt(ctx, "WEEKLY RECOVERY REPORT", M, 26, { size: 9.5, weight: 700, color: "#a8d9c4" });
  var title = R.name || "Concussion recovery";
  txt(ctx, title, M, pageNo === 1 ? 54 : 50, { size: pageNo === 1 ? 24 : 20, weight: 700, color: "#ffffff", font: F.serif, maxW: 480 });
  txt(ctx, R.range, M, pageNo === 1 ? 74 : 66, { size: 11, color: "#cfe6dc", maxW: 500 });
  // pulse line + audience tag on the right
  ctx.beginPath(); ctx.moveTo(PW - 190, 30); ctx.lineTo(PW - 160, 30); ctx.lineTo(PW - 150, 44); ctx.lineTo(PW - 136, 14); ctx.lineTo(PW - 126, 36); ctx.lineTo(PW - 118, 30); ctx.lineTo(PW - M, 30);
  ctx.strokeStyle = "#6fbca2"; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
  var tw = measure(ctx, tag.toUpperCase(), { size: 9, weight: 700 }) + 20;
  rrect(ctx, PW - M - tw, h - 34, tw, 20, 10, "rgba(255,255,255,0.14)");
  txt(ctx, tag.toUpperCase(), PW - M - tw / 2, h - 20, { size: 9, weight: 700, color: "#ffffff", align: "center" });
}
function footer(ctx, R, pageNo){
  hline(ctx, M, PW - M, PH - 40, C.line, 1);
  txt(ctx, "Self-reported in the Head Clear app and not a diagnosis. Generated " + R.generated + ".", M, PH - 24, { size: 8.5, color: C.faint });
  txt(ctx, "Page " + pageNo + " of 2", PW - M, PH - 24, { size: 8.5, color: C.faint, align: "right" });
}
function tile(ctx, x, y, w, h, label, value, unit, delta, sub, noPrev){
  rrect(ctx, x, y, w, h, 8, C.panel, C.line);
  txt(ctx, label.toUpperCase(), x + 10, y + 17, { size: 8.5, weight: 700, color: C.mute });
  if(value === null || value === undefined) txt(ctx, "—", x + 10, y + 47, { size: 26, weight: 700, color: C.faint });
  else {
    var vw = txt(ctx, value, x + 10, y + 47, { size: 26, weight: 700, color: C.deep, font: F.mono });
    if(unit) txt(ctx, unit, x + 14 + vw, y + 47, { size: 11, color: C.mute });
  }
  deltaLine(ctx, x + 10, y + 64, delta, noPrev);
  if(sub) txt(ctx, sub, x + 10, y + 79, { size: 8.5, color: C.mute, maxW: w - 16 });
}

/* ---------------- page 1 — doctor summary ---------------- */
function page1(R){
  var P = newCanvas(), ctx = P.ctx, c = R.cur, p = R.prev, np = !R.hasPrev;
  header(ctx, R, "Doctor summary", 1);
  var y = 112;
  if(R.context) y = wrap(ctx, R.context, M, y, CW, 13, { size: 10, color: C.mute }, 2) + 2;
  else y = 106;

  // KPI tiles
  var tw = (CW - 4 * 8) / 5, th = 88, x = M;
  var tiles = [
    ["Symptoms", c.sx === null ? null : fmt(c.sx, 1), "/10", dlt(c.sx, p.sx, 1, "low"), c.sxN + " of 7 days rated"],
    ["HIA severity", c.hia === null ? null : fmt(c.hia, 0), "/132", dlt(c.hia, p.hia, 0, "low"), c.hiaN === null ? "no full evaluations" : "avg " + fmt(c.hiaN, 0) + " of 22 symptoms"],
    ["Sleep", c.sleep === null ? null : fmt(c.sleep, 1), "h", dlt(c.sleep, p.sleep, 1, "high"), c.rest === null ? "nightly average" : "rested " + fmt(c.rest, 1) + "/5 on average"],
    ["Headache", c.headLogged ? String(c.headDays) : null, "/7 days", dlt(c.headDays, p.headDays, 0, "low"), c.headLogged ? "peak " + c.headMax + "/10 · painkillers " + c.pkDays + " day" + (c.pkDays === 1 ? "" : "s") : "not logged"],
    ["Overnight HRV", c.hrv === null ? null : fmt(c.hrv, 0), "ms", dlt(c.hrv, p.hrv, 0, "high"), c.rhr === null ? "resting HR not logged" : "resting HR " + fmt(c.rhr, 0) + " bpm"]
  ];
  tiles.forEach(function(t, i){ tile(ctx, x + i * (tw + 8), y, tw, th, t[0], t[1], t[2], t[3], t[4], np); });
  y += th + 18;

  // day-by-day grid
  y = section(ctx, "The week day by day", M, y, CW);
  var LW = 112, cw = (CW - LW) / 7, rh = 21;
  // header cells
  c.days.forEach(function(m, i){
    var cx = M + LW + i * cw, isEnd = i === 6;
    txt(ctx, HC.fmtDate(m.key, { weekday: "short" }), cx + cw / 2, y + 2, { size: 9.5, weight: 700, color: isEnd ? C.accent : C.ink, align: "center" });
    txt(ctx, HC.fmtDate(m.key, { day: "numeric", month: "short" }), cx + cw / 2, y + 14, { size: 8.5, color: C.mute, align: "center" });
  });
  y += 22;
  var rows = [
    { label: "Symptoms /10", core: true, get: function(m){ return m.sx; }, cls: function(v){ return band(v); } },
    { label: "HIA severity /132", get: function(m){ return m.hia; }, cls: function(v){ return band(v / 13.2); } },
    { label: "Sleep (hours)", core: true, get: function(m){ return m.sleep; }, fmt: function(v){ return v <= 4 ? "≤4" : v >= 9 ? "9+" : String(v); }, cls: function(v){ return v >= 7 ? "g" : v >= 6 ? "w" : "d"; } },
    { label: "Headache peak /10", get: function(m){ return m.headPeak; }, cls: function(v){ return v === 0 ? "g" : v <= 4 ? "w" : "d"; } },
    { label: "Painkiller doses", get: function(m){ return m.pk; }, cls: function(v){ return v === 0 ? "n" : "w"; } },
    { label: "Resting HR (bpm)", get: function(m){ return m.rhr; } },
    { label: "Overnight HRV (ms)", get: function(m){ return m.hrv; } },
    { label: "Lightheaded standing", get: function(m){ return m.lh; }, fmt: function(v){ return HC.LIGHTHEAD[v] ? HC.LIGHTHEAD[v].l : String(v); }, cls: function(v){ return v === 0 ? "g" : v === 1 ? "w" : "d"; } },
    { label: "Fluids (litres)", get: function(m){ return m.fluids; }, fmt: function(v){ return String(rnd(v, 1)); }, cls: function(v){ return v >= 2 ? "g" : v >= 1.5 ? "n" : "w"; } }
  ];
  rows.forEach(function(r){
    var any = c.days.some(function(m){ var v = r.get(m); return v !== null && v !== undefined; });
    if(!any && !r.core) return;
    txt(ctx, r.label, M, y + 14, { size: 9.5, weight: 600, color: C.ink, maxW: LW - 6 });
    c.days.forEach(function(m, i){
      var v = r.get(m), cx = M + LW + i * cw;
      if(v === null || v === undefined){ txt(ctx, "–", cx + cw / 2, y + 14, { size: 10, color: C.faint, align: "center" }); return; }
      var k = r.cls ? CELL[r.cls(v)] : CELL.n;
      rrect(ctx, cx + 2, y + 1, cw - 4, rh - 3, 4, k.bg);
      txt(ctx, r.fmt ? r.fmt(v) : String(v), cx + cw / 2, y + 14.5, { size: 10, weight: 600, color: k.fg, align: "center" });
    });
    y += rh;
  });
  // sessions row (coloured dots)
  txt(ctx, "Training sessions", M, y + 14, { size: 9.5, weight: 600 });
  c.days.forEach(function(m, i){
    var cx = M + LW + i * cw, n = Math.min(m.sessions.length, 4);
    if(!m.sessions.length){ txt(ctx, "–", cx + cw / 2, y + 14, { size: 10, color: C.faint, align: "center" }); return; }
    var x0 = cx + cw / 2 - (n - 1) * 8;
    m.sessions.slice(0, 4).forEach(function(x, j){
      circle(ctx, x0 + j * 16, y + 10, 6.5, x.v.cls === "warn" ? C.danger : x.v.tolerated ? C.good : C.faint);
      txt(ctx, (HC.typeLabel(x.s.type) || "?").charAt(0).toUpperCase(), x0 + j * 16, y + 13, { size: 7.5, weight: 700, color: "#fff", align: "center" });
    });
  });
  y += rh;
  // legend
  circle(ctx, M + 4, y + 8, 4, C.good); txt(ctx, "tolerated", M + 12, y + 11, { size: 8, color: C.mute });
  circle(ctx, M + 66, y + 8, 4, C.danger); txt(ctx, "flagged", M + 74, y + 11, { size: 8, color: C.mute });
  circle(ctx, M + 118, y + 8, 4, C.faint); txt(ctx, "awaiting next-morning check", M + 126, y + 11, { size: 8, color: C.mute });
  y += 28;

  // two columns: symptoms | events & triggers
  var colW = (CW - 24) / 2, xL = M, xR = M + colW + 24, top = y;
  var yl = section(ctx, "Most frequent symptoms", xL, top, colW);
  var ids = Object.keys(c.symptomMean).filter(function(id){ return c.symptomMean[id] > 0; }).sort(function(a, b){ return c.symptomMean[b] - c.symptomMean[a]; }).slice(0, 6);
  if(!ids.length) yl = wrap(ctx, c.symptomMean && Object.keys(c.symptomMean).length ? "No symptoms rated above 0 this week." : "No full symptom evaluations this week.", xL, yl + 2, colW, 13, { size: 10, color: C.mute });
  ids.forEach(function(id){
    var sy = HC.HIA_SYMPTOMS.filter(function(s){ return s.id === id; })[0], v = c.symptomMean[id], pv = p.symptomMean[id];
    txt(ctx, sy.label, xL, yl + 9, { size: 10, maxW: 126 });
    rrect(ctx, xL + 132, yl + 1, 110, 9, 4.5, C.panel);
    rrect(ctx, xL + 132, yl + 1, Math.max(8, 110 * v / 6), 9, 4.5, v >= 3 ? C.danger : v >= 1.5 ? C.warn : C.accent);
    txt(ctx, fmt(v, 1), xL + 250, yl + 9.5, { size: 10, weight: 700, font: F.mono, color: C.ink });
    var d = isNum(pv) ? dlt(v, pv, 1, "low") : null;
    if(d && d.dir !== 0){ tri(ctx, xL + 292, yl + 5, 3.5, d.dir, d.col); txt(ctx, Math.abs(rnd(v - pv, 1)).toFixed(1), xL + 300, yl + 9, { size: 8.5, weight: 600, color: d.col }); }
    yl += 20;
  });
  if(ids.length) txt(ctx, "Average rating 0–6 on the days evaluated.", xL, yl + 4, { size: 8, color: C.faint });

  var yr = section(ctx, "Events & triggers", xR, top, colW);
  var evs = c.events.slice(0, 5);
  if(!c.events.length){
    tick(ctx, xR + 6, yr + 6, 5, C.good);
    yr = wrap(ctx, "No near-faints, knocks to the head or vomiting reported.", xR + 18, yr + 9, colW - 20, 13, { size: 10, color: C.ink }) ;
  }
  evs.forEach(function(e){
    circle(ctx, xR + 4, yr + 5, 3.5, e.flag ? C.danger : C.warn);
    txt(ctx, dayLabel(e.date, { weekday: "short", day: "numeric" }) + " — " + e.label, xR + 14, yr + 9, { size: 10, weight: e.flag ? 700 : 500, color: e.flag ? C.dangerInk : C.ink, maxW: colW - 16 });
    yr += 17;
  });
  if(c.events.length > 5) { txt(ctx, "+" + (c.events.length - 5) + " more", xR + 14, yr + 9, { size: 9, color: C.mute }); yr += 15; }
  yr += 6;
  txt(ctx, "TRIGGERS NOTED", xR, yr + 8, { size: 8.5, weight: 700, color: C.mute }); yr += 16;
  var trigs = Object.keys(c.trig).sort(function(a, b){ return c.trig[b] - c.trig[a]; }).slice(0, 8);
  if(!trigs.length) txt(ctx, "None logged.", xR, yr + 8, { size: 10, color: C.mute });
  else {
    var px = xR, py = yr;
    trigs.forEach(function(t){
      var label = t + " ×" + c.trig[t], w = measure(ctx, label, { size: 9.5, weight: 600 }) + 16;
      if(px + w > xR + colW){ px = xR; py += 22; }
      rrect(ctx, px, py, w, 18, 9, C.panel, C.line);
      txt(ctx, label, px + 8, py + 12.5, { size: 9.5, weight: 600, color: C.ink });
      px += w + 6;
    });
  }
  y = Math.max(yl + 8, yr + 40) + 14;
  y = Math.max(y, top + 160) + 8;

  // two columns: meds | training snapshot
  var yl2 = section(ctx, "Medicines & supplements", xL, y, colW);
  if(!c.meds.length) txt(ctx, "None on the list.", xL, yl2 + 8, { size: 10, color: C.mute });
  c.meds.slice(0, 5).forEach(function(md){
    txt(ctx, md.name, xL, yl2 + 10, { size: 10, maxW: 140 });
    md.days.forEach(function(on, i){ rrect(ctx, xL + 148 + i * 20, yl2 + 1, 16, 12, 3, on ? C.accent : C.panel, on ? null : C.line); });
    var n = md.days.filter(Boolean).length;
    txt(ctx, n + "/7", xL + 148 + 7 * 20 + 6, yl2 + 10.5, { size: 10, weight: 700, font: F.mono, color: n >= 6 ? C.good : n >= 4 ? C.warn : C.danger });
    yl2 += 20;
  });
  var yr2 = section(ctx, "Training this week", xR, y, colW);
  var stats = [[String(c.sessions.length), "sessions"], [String(c.nTol), "tolerated"], [String(c.nFlag), "flagged"], [c.cardioMin ? String(c.cardioMin) : "0", "cardio min"]];
  var sw = (colW - 18) / 4;
  stats.forEach(function(s, i){
    var bad = i === 2 && c.nFlag > 0;
    rrect(ctx, xR + i * (sw + 6), yr2, sw, 44, 8, bad ? C.dangerSoft : C.panel, bad ? null : C.line);
    txt(ctx, s[0], xR + i * (sw + 6) + sw / 2, yr2 + 23, { size: 18, weight: 700, font: F.mono, color: bad ? C.dangerInk : C.deep, align: "center" });
    txt(ctx, s[1], xR + i * (sw + 6) + sw / 2, yr2 + 37, { size: 8.5, color: C.mute, align: "center" });
  });
  yr2 += 56;
  var ceilTxt = c.peakMax !== null ? "Highest cardio heart rate " + c.peakMax + " bpm against a ceiling of " + R.profile.hrHigh + " bpm." : "No cardio heart rates logged this week.";
  yr2 = wrap(ctx, ceilTxt + " Phase " + R.ps.phase + ", " + R.profile.hrLow + "–" + R.profile.hrHigh + " bpm band. Detail on page 2.", xR, yr2 + 2, colW, 13, { size: 9.5, color: C.mute }, 3);
  y = Math.max(yl2, yr2) + 14;

  // notes
  if(c.notes.length && y < PH - 190){
    y = section(ctx, "From the daily notes", M, y, CW);
    c.notes.slice(-3).forEach(function(n){
      if(y > PH - 160) return;
      txt(ctx, dayLabel(n.date, { weekday: "short", day: "numeric" }), M, y + 9, { size: 9.5, weight: 700, color: C.accent });
      y = wrap(ctx, n.text, M + 56, y + 9, CW - 56, 12.5, { size: 9.5, color: C.ink }, 2) + 4;
    });
    y += 4;
  }
  // questions
  if(R.questions.length && y < PH - 100){
    var qh = 28 + Math.min(R.questions.length, 6) * 18;
    rrect(ctx, M, y, CW, qh, 10, C.accentSoft);
    txt(ctx, "QUESTIONS FOR THE APPOINTMENT", M + 14, y + 20, { size: 9.5, weight: 700, color: C.deep });
    var qy = y + 40;
    R.questions.slice(0, 6).forEach(function(q, i){
      txt(ctx, (i + 1) + ".", M + 14, qy, { size: 10.5, weight: 700, color: C.deep });
      txt(ctx, q.text, M + 30, qy, { size: 10.5, color: C.ink, maxW: CW - 46 });
      qy += 18;
    });
  }
  footer(ctx, R, 1);
  return P.cv;
}

/* ---------------- page 2 — physio training & rehab ---------------- */
function page2(R){
  var P = newCanvas(), ctx = P.ctx, c = R.cur, p = R.profile;
  header(ctx, R, "Physio detail", 2);
  var y = 92;

  // plan status tiles
  var tw = (CW - 3 * 8) / 4, th = 62, last = R.bcttLast;
  var st = [
    ["Phase " + R.ps.phase, R.phaseName || "", "cardio / rehab stage"],
    ["HR band", p.hrLow + "–" + p.hrHigh + " bpm", "ceiling " + p.hrHigh + " · since " + HC.fmtDate(p.bandSince, { day: "numeric", month: "short" })],
    ["Tolerated in a row", Math.min(R.ps.streak, HC.STEP_DAYS_NEEDED) + "/" + HC.STEP_DAYS_NEEDED, R.ps.stepUpReady ? "ready to step up +5 bpm" : "needs " + HC.STEP_DAYS_NEEDED + " days and " + HC.STEP_MIN_DAYS + " at band"],
    ["BCTT", R.bcttNext.split(" · ")[0], last ? "last " + HC.fmtDate(last.date, { day: "numeric", month: "short" }) + (last.thresholdHr ? " · stopped at " + last.thresholdHr + " bpm" : "") : "no result logged yet"]
  ];
  st.forEach(function(s, i){
    var x = M + i * (tw + 8);
    rrect(ctx, x, y, tw, th, 8, C.panel, C.line);
    txt(ctx, s[0].toUpperCase(), x + 10, y + 16, { size: 8.5, weight: 700, color: C.mute });
    txt(ctx, s[1], x + 10, y + 36, { size: 15, weight: 700, color: C.deep, maxW: tw - 16 });
    txt(ctx, s[2], x + 10, y + 52, { size: 8.5, color: C.mute, maxW: tw - 16 });
  });
  y += th + 18;

  // sessions table
  y = section(ctx, "Sessions this week", M, y, CW);
  var cols = [[62, "Day"], [118, "Session"], [96, "HR avg / peak"], [50, "Ceiling"], [150, "Symptoms*"], [246, "Result"]];
  var cx = M;
  cols.forEach(function(col){ txt(ctx, col[1].toUpperCase(), cx + 4, y + 4, { size: 8, weight: 700, color: C.mute }); col.push(cx); cx += col[0]; });
  y += 10; hline(ctx, M, PW - M, y, C.line, 1);
  var list = c.sessions.slice().sort(function(a, b){ return a.date !== b.date ? (a.date < b.date ? -1 : 1) : ((a.s.startTime || "") < (b.s.startTime || "") ? -1 : 1); });
  var maxRows = 11, shown = list.slice(-maxRows);
  if(!list.length) txt(ctx, "No sessions logged this week.", M + 4, y + 18, { size: 10, color: C.mute });
  shown.forEach(function(x, i){
    var s = x.s, v = x.v, rh = 25, ry = y + 1;
    if(i % 2 === 0) { ctx.fillStyle = C.panel; ctx.fillRect(M, ry, CW, rh); }
    var by = ry + 16;
    txt(ctx, dayLabel(x.date, { weekday: "short", day: "numeric" }), cols[0][2] + 4, by, { size: 9.5, weight: 600 });
    txt(ctx, HC.typeLabel(s.type) + (s.duration ? " " + s.duration + " min" : ""), cols[1][2] + 4, by, { size: 9.5, maxW: cols[1][0] - 6 });
    var hr = s.type === "cardio" ? (s.avgHr || "–") + " / " + (s.peakHr || "–") : "–";
    txt(ctx, hr, cols[2][2] + 4, by, { size: 9.5, font: F.mono, weight: 600, color: (s.type === "cardio" && s.peakHr > (s.ceiling || p.hrHigh)) ? C.danger : C.ink });
    txt(ctx, s.type === "cardio" ? String(s.ceiling || p.hrHigh) : "–", cols[3][2] + 4, by, { size: 9.5, font: F.mono, color: C.mute });
    var path = [s.before, s.worst, s.after, s.nextMorning].map(function(n){ return isNum(n) ? String(n) : "·"; }).join("  →  ");
    txt(ctx, path, cols[4][2] + 4, by, { size: 9.5, font: F.mono, color: C.ink });
    var col = v.cls === "warn" ? C.dangerInk : v.tolerated ? C.goodInk : C.mute;
    circle(ctx, cols[5][2] + 8, by - 3.5, 3.5, v.cls === "warn" ? C.danger : v.tolerated ? C.good : C.faint);
    var lbl = v.label;
    setFont(ctx, { size: 9, weight: 600 });
    if(ctx.measureText(lbl).width > cols[5][0] - 20) wrap(ctx, lbl, cols[5][2] + 18, by - 5, cols[5][0] - 22, 10.5, { size: 8.5, weight: 600, color: col }, 2);
    else txt(ctx, lbl, cols[5][2] + 18, by, { size: 9, weight: 600, color: col });
    y += rh;
  });
  if(list.length > maxRows) { txt(ctx, (list.length - maxRows) + " earlier session" + (list.length - maxRows === 1 ? "" : "s") + " this week not shown", M + 4, y + 14, { size: 9, color: C.mute }); y += 16; }
  txt(ctx, "*Symptoms 0–10: before → worst during → after → next morning.", M, y + 14, { size: 8, color: C.faint });
  y += 38;

  // cardio chart (last 28 days)
  y = section(ctx, "Cardio — peak heart rate against the ceiling, last 4 weeks", M, y, CW);
  var since = HC.addDays(R.end, -27);
  var cs = HC.allSessions().filter(function(r){ return r.s.type === "cardio" && isNum(r.s.peakHr) && r.date >= since && r.date <= R.end; });
  if(!cs.length) { txt(ctx, "No cardio sessions with a peak heart rate in the last four weeks.", M, y + 6, { size: 10, color: C.mute }); y += 30; }
  else {
    var vals = []; cs.forEach(function(r){ vals.push(r.s.peakHr); vals.push(r.s.ceiling || p.hrHigh); });
    var lo = Math.floor((Math.min.apply(null, vals) - 15) / 5) * 5, hi = Math.ceil((Math.max.apply(null, vals) + 5) / 5) * 5;
    var ch = 128, px0 = M + 30, pw = CW - 30, py0 = y + 10;
    function yOf(v){ return py0 + ch - (v - lo) / (hi - lo) * ch; }
    var step = (hi - lo) > 40 ? 10 : 5;
    for(var g = lo; g <= hi; g += step){
      hline(ctx, px0, px0 + pw, yOf(g), "#e8ede7", 1);
      txt(ctx, String(g), px0 - 6, yOf(g) + 3, { size: 8, color: C.faint, align: "right" });
    }
    var n = cs.length, slot = pw / Math.max(n, 6), bw = Math.min(30, slot * 0.62);
    cs.forEach(function(r, i){
      var cxm = px0 + slot * i + slot / 2, v = r.s.peakHr, vd = HC.sessionVerdict(r.s);
      var col = vd.cls === "warn" ? C.danger : vd.pending ? C.faint : C.accent;
      var inWeek = r.date >= R.keys[0];
      ctx.globalAlpha = inWeek ? 1 : 0.45;
      var top = yOf(v);
      rrect(ctx, cxm - bw / 2, top, bw, py0 + ch - top, 3, col);
      ctx.globalAlpha = 1;
      txt(ctx, HC.fmtDate(r.date, { day: "numeric", month: "numeric" }), cxm, py0 + ch + 12, { size: 8, color: inWeek ? C.ink : C.faint, align: "center" });
    });
    // ceiling step line
    ctx.beginPath(); ctx.setLineDash([5, 3]); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.4;
    cs.forEach(function(r, i){
      var yy = yOf(r.s.ceiling || p.hrHigh), x1 = px0 + slot * i, x2 = x1 + slot;
      if(i === 0) ctx.moveTo(x1, yy); else ctx.lineTo(x1, yy);
      ctx.lineTo(x2, yy);
    });
    ctx.stroke(); ctx.setLineDash([]);
    cs.forEach(function(r, i){
      var cxm = px0 + slot * i + slot / 2, tp = yOf(r.s.peakHr) - 4;
      setFont(ctx, { size: 8.5, weight: 700, font: F.mono }); ctx.textAlign = "center";
      ctx.lineWidth = 3.5; ctx.strokeStyle = "#ffffff"; ctx.lineJoin = "round"; ctx.strokeText(String(r.s.peakHr), cxm, tp);
      ctx.fillStyle = C.ink; ctx.fillText(String(r.s.peakHr), cxm, tp);
    });
    y = py0 + ch + 22;
    circle(ctx, M + 4, y + 4, 4, C.accent); txt(ctx, "tolerated", M + 12, y + 7, { size: 8, color: C.mute });
    circle(ctx, M + 66, y + 4, 4, C.danger); txt(ctx, "flagged", M + 74, y + 7, { size: 8, color: C.mute });
    circle(ctx, M + 118, y + 4, 4, C.faint); txt(ctx, "awaiting check", M + 126, y + 7, { size: 8, color: C.mute });
    hline(ctx, M + 200, M + 218, y + 4, C.ink, 1.4); txt(ctx, "ceiling (dashed)", M + 224, y + 7, { size: 8, color: C.mute });
    txt(ctx, "faded = earlier than this week", M + 320, y + 7, { size: 8, color: C.faint });
    y += 36;
  }

  // rehab adherence
  var topY = y;
  var colW = (CW - 24) / 2, xL = M, xR = M + colW + 24;
  var yl = section(ctx, "Training & rehab done", xL, y, colW);
  var LWr = 96, sq = (colW - LWr) / 7;
  c.days.forEach(function(m, i){ txt(ctx, HC.fmtDate(m.key, { weekday: "narrow" }), xL + LWr + i * sq + sq / 2, yl + 2, { size: 8, weight: 700, color: C.mute, align: "center" }); });
  yl += 8;
  var anyGym = HC.allSessions().some(function(r){ return r.s.type === "gym" && r.date >= since; });
  HC.plan.sessionTypes.forEach(function(t){
    if(t.id === "gym" && !anyGym && R.ps.phase < 2) return;
    txt(ctx, t.label, xL, yl + 11, { size: 9.5, weight: 600, maxW: LWr - 6 });
    var cnt = 0;
    c.days.forEach(function(m, i){
      var d = m.has ? HC.peekDay(m.key) : null;
      var done = !!d && (d.sessions.some(function(s){ return s.type === t.id; }) || !!(t.item && [d.wake, d.midday, d.afternoon, d.evening, d.bed].some(function(b){ return b[t.item] === true; })));
      if(done) cnt++;
      rrect(ctx, xL + LWr + i * sq + 2, yl + 2, sq - 4, 14, 3, done ? C.accent : C.panel, done ? null : C.line);
    });
    yl += 20;
  });
  var fk = Object.keys(c.focus).sort(function(a, b){ return c.focus[b] - c.focus[a]; });
  if(fk.length){ yl = wrap(ctx, "Physio focus: " + fk.map(function(f){ return f + " ×" + c.focus[f]; }).join(", "), xL, yl + 8, colW, 12, { size: 9, color: C.mute }, 3); }

  // weekly tests
  var yr = section(ctx, "Weekly tests", xR, topY, colW);
  var T0 = R.testFirst, T1 = R.testBefore, T2 = R.testNow;
  ["First", "Last wk", "This wk"].forEach(function(h, i){ txt(ctx, h.toUpperCase(), xR + 96 + i * 56 + 28, yr + 2, { size: 7.5, weight: 700, color: C.mute, align: "center" }); });
  yr += 8;
  var trows = [
    ["Convergence (cm)", function(t){ return isNum(t.npc) ? t.npc : null; }, 0, "low"],
    ["Reaction L (ms)", function(t){ return HC.rtMs(t.rtL); }, 0, "low"],
    ["Reaction R (ms)", function(t){ return HC.rtMs(t.rtR); }, 0, "low"],
    ["Lying HR (bpm)", function(t){ return isNum(t.hrLie) ? t.hrLie : null; }, 0, null],
    ["Stand +1 min (Δ)", function(t){ return HC.standDelta(t, "hrS1"); }, 0, null],
    ["Stand +3 min (Δ)", function(t){ return HC.standDelta(t, "hrS3"); }, 0, null]
  ];
  var anyTest = !!(T0 || T1 || T2);
  if(!anyTest) txt(ctx, "No test results logged yet.", xR, yr + 12, { size: 10, color: C.mute });
  else trows.forEach(function(r, i){
    if(i % 2 === 0){ ctx.fillStyle = C.panel; ctx.fillRect(xR, yr, colW, 19); }
    txt(ctx, r[0], xR + 4, yr + 13, { size: 9, weight: 600, maxW: 90 });
    [T0, T1, T2].forEach(function(t, j){
      var v = t ? r[1](t) : null, xx = xR + 96 + j * 56 + 28;
      var s = (v === null || v === undefined) ? "–" : (r[0].indexOf("Δ") > 0 && v >= 0 ? "+" : "") + v;
      var color = C.ink;
      if(j === 2 && v !== null && T1 && r[1](T1) !== null && r[3]){
        var d = v - r[1](T1); color = d === 0 ? C.ink : ((r[3] === "low") === (d < 0)) ? C.good : C.danger;
      }
      txt(ctx, s, xx, yr + 13, { size: 9.5, weight: j === 2 ? 700 : 500, font: F.mono, color: color, align: "center" });
    });
    yr += 19;
  });
  if(anyTest){
    var note = T2 ? "Latest set: " + HC.fmtDate(T2.date, { weekday: "short", day: "numeric", month: "short" }) + "." : "No test set logged this week.";
    txt(ctx, note, xR, yr + 14, { size: 8.5, color: C.faint });
    yr += 20;
  }
  y = Math.max(yl, yr) + 14;

  // flagged detail / BCTT history
  if(y < PH - 110){
    var flagged = list.filter(function(x){ return x.v.cls === "warn"; });
    y = section(ctx, "What to look at", M, y, CW);
    var lines = [];
    if(flagged.length) flagged.slice(0, 4).forEach(function(x){ lines.push(dayLabel(x.date, { weekday: "short", day: "numeric" }) + " " + HC.typeLabel(x.s.type) + " — " + x.v.label); });
    else if(list.length) lines.push("All " + list.length + " session" + (list.length === 1 ? "" : "s") + " this week stayed within the plan (heart rate under the ceiling, symptoms did not rise)" + (c.nPend ? ", " + c.nPend + " still awaiting the next-morning check." : "."));
    else lines.push("No sessions to review this week.");
    lines.forEach(function(t){
      if(y > PH - 60) return;
      circle(ctx, M + 4, y + 5, 3, flagged.length ? C.danger : C.good);
      y = wrap(ctx, t, M + 14, y + 9, CW - 16, 12.5, { size: 10, color: C.ink }, 2) + 3;
    });
  }
  footer(ctx, R, 2);
  return P.cv;
}

/* ---------------- PDF wrapper (JPEG pages) ---------------- */
function canvasJpeg(cv){
  return new Promise(function(resolve, reject){
    cv.toBlob(function(b){
      if(!b) return reject(new Error("render failed"));
      var fr = new FileReader();
      fr.onload = function(){ resolve({ bytes: new Uint8Array(fr.result), w: cv.width, h: cv.height }); };
      fr.onerror = reject;
      fr.readAsArrayBuffer(b);
    }, "image/jpeg", 0.92);
  });
}
function makePdf(pages){
  var enc = new TextEncoder(), parts = [], offs = [], len = 0;
  function push(x){ var b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; }
  var A4W = 595.28, A4H = 841.89, n = pages.length;
  push("%PDF-1.4\n%âãÏÓ\n");
  offs[1] = len; push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  var kids = []; for(var i = 0; i < n; i++) kids.push((3 + i * 3) + " 0 R");
  offs[2] = len; push("2 0 obj\n<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + n + " >>\nendobj\n");
  pages.forEach(function(pg, i){
    var po = 3 + i * 3, co = po + 1, io = po + 2;
    offs[po] = len;
    push(po + " 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + A4W + " " + A4H + "] /Resources << /XObject << /Im0 " + io + " 0 R >> >> /Contents " + co + " 0 R >>\nendobj\n");
    var content = "q " + A4W + " 0 0 " + A4H + " 0 0 cm /Im0 Do Q";
    offs[co] = len;
    push(co + " 0 obj\n<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream\nendobj\n");
    offs[io] = len;
    push(io + " 0 obj\n<< /Type /XObject /Subtype /Image /Width " + pg.w + " /Height " + pg.h + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + pg.bytes.length + " >>\nstream\n");
    push(pg.bytes);
    push("\nendstream\nendobj\n");
  });
  var total = 3 + n * 3, xref = len;
  var x = "xref\n0 " + total + "\n0000000000 65535 f \n";
  for(var k = 1; k < total; k++) x += ("0000000000" + offs[k]).slice(-10) + " 00000 n \n";
  push(x);
  push("trailer\n<< /Size " + total + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
  var out = new Uint8Array(len), pos = 0;
  parts.forEach(function(b){ out.set(b, pos); pos += b.length; });
  return out;
}

/* ---------------- text version (WhatsApp) ---------------- */
function arrow(d){ return d && d.dir ? (d.dir > 0 ? "▲" : "▼") : ""; }
function dtxt(cur, prev, dp, better){ var d = dlt(cur, prev, dp, better); return d && d.dir ? " (" + arrow(d) + d.txt.replace(" vs last week", "") + ")" : ""; }
function buildText(R){
  var c = R.cur, p = R.prev, L = [];
  L.push("*Weekly recovery report*" + (R.name ? " — " + R.name : ""));
  L.push(R.range);
  L.push("");
  if(c.sx !== null) L.push("*Symptoms:* avg " + fmt(c.sx, 1) + "/10" + dtxt(c.sx, p.sx, 1, "low") + (c.hia !== null ? " · HIA severity avg " + fmt(c.hia, 0) + "/132" + dtxt(c.hia, p.hia, 0, "low") : ""));
  else if(c.hia !== null) L.push("*Symptoms:* HIA severity avg " + fmt(c.hia, 0) + "/132" + dtxt(c.hia, p.hia, 0, "low"));
  if(c.sleep !== null) L.push("*Sleep:* avg " + fmt(c.sleep, 1) + " h" + dtxt(c.sleep, p.sleep, 1, "high") + (c.rest !== null ? ", rested " + fmt(c.rest, 1) + "/5" : ""));
  if(c.headLogged) L.push("*Headache:* " + c.headDays + "/7 days, worst " + c.headMax + "/10 · painkillers on " + c.pkDays + " day" + (c.pkDays === 1 ? "" : "s") + " (" + c.pkDoses + " dose" + (c.pkDoses === 1 ? "" : "s") + ")");
  var auto = [];
  if(c.rhr !== null) auto.push("resting HR " + fmt(c.rhr, 0) + " bpm" + dtxt(c.rhr, p.rhr, 0, "low"));
  if(c.hrv !== null) auto.push("overnight HRV " + fmt(c.hrv, 0) + " ms" + dtxt(c.hrv, p.hrv, 0, "high"));
  if(c.days.some(function(m){ return isNum(m.lh); })) auto.push("lightheaded on standing " + c.lhDays + " day" + (c.lhDays === 1 ? "" : "s"));
  if(auto.length) L.push("*Autonomic:* " + auto.join(" · "));
  if(c.sessions.length) L.push("*Training:* " + c.sessions.length + " session" + (c.sessions.length === 1 ? "" : "s") + " — " + c.nTol + " tolerated, " + c.nFlag + " flagged" + (c.nPend ? ", " + c.nPend + " awaiting next-morning check" : "") + (c.peakMax !== null ? " · top cardio HR " + c.peakMax + " (ceiling " + R.profile.hrHigh + ")" : ""));
  else L.push("*Training:* no sessions logged");
  var ids = Object.keys(c.symptomMean).filter(function(id){ return c.symptomMean[id] > 0; }).sort(function(a, b){ return c.symptomMean[b] - c.symptomMean[a]; }).slice(0, 4);
  if(ids.length) L.push("*Main symptoms:* " + ids.map(function(id){ return HC.HIA_SYMPTOMS.filter(function(s){ return s.id === id; })[0].label + " " + fmt(c.symptomMean[id], 1) + "/6"; }).join(", "));
  if(c.events.length) L.push("*Events:* " + c.events.map(function(e){ return dayLabel(e.date, { weekday: "short", day: "numeric" }) + " " + e.label; }).join("; "));
  else L.push("*Events:* none (no near-faints, knocks or vomiting)");
  var tr = Object.keys(c.trig).sort(function(a, b){ return c.trig[b] - c.trig[a]; }).slice(0, 4);
  if(tr.length) L.push("*Triggers:* " + tr.map(function(t){ return t + " ×" + c.trig[t]; }).join(", "));
  if(R.testNow){
    var t = R.testNow, bits = [];
    if(isNum(t.npc)) bits.push("convergence " + t.npc + " cm");
    var l = HC.rtMs(t.rtL), r = HC.rtMs(t.rtR);
    if(l || r) bits.push("reaction L " + (l || "–") + " / R " + (r || "–") + " ms");
    var d1 = HC.standDelta(t, "hrS1"), d3 = HC.standDelta(t, "hrS3");
    if(d1 !== null || d3 !== null) bits.push("lying→standing HR " + (d1 !== null ? (d1 >= 0 ? "+" : "") + d1 : "–") + " (1 min), " + (d3 !== null ? (d3 >= 0 ? "+" : "") + d3 : "–") + " (3 min)");
    if(bits.length) L.push("*Weekly tests:* " + bits.join(" · "));
  }
  if(R.questions.length){ L.push(""); L.push("*Questions:*"); R.questions.forEach(function(q, i){ L.push((i + 1) + ". " + q.text); }); }
  L.push(""); L.push("_Self-reported via Head Clear. PDF attached._");
  return L.join("\n");
}

/* ---------------- UI ---------------- */
var weekOffset = 0; // 0 = the 7 days ending today; -1 = the 7 days before that, ...
function endKey(){ return HC.addDays(HC.todayKey(), weekOffset * 7); }

function renderCard(){
  var box = $("weeklyReportCard");
  if(!box) return;
  box.innerHTML = "";
  box.appendChild(el("div", { class: "section-title", style: "margin-bottom:6px;", text: "Weekly report" }));
  box.appendChild(el("p", { class: "small", text: "Two pages: a summary for your doctor and the training detail for your physio. Built on this phone, then shared as a PDF." }));
  var end = endKey(), label = (weekOffset === 0 ? "Last 7 days" : "Week") + " · " + HC.fmtDate(HC.addDays(end, -6), { day: "numeric", month: "short" }) + " – " + HC.fmtDate(end, { day: "numeric", month: "short" });
  box.appendChild(el("div", { class: "wk-nav" }, [
    el("button", { type: "button", "aria-label": "Earlier week", text: "‹", onclick: function(){ weekOffset--; renderCard(); } }),
    el("b", { text: label }),
    el("button", { type: "button", "aria-label": "Later week", text: "›", disabled: weekOffset >= 0, onclick: function(){ weekOffset++; renderCard(); } })
  ]));
  box.appendChild(el("div", { class: "summary-actions" }, [
    el("button", { class: "btn btn-primary", type: "button", text: "Preview & share", onclick: openPreview }),
    el("button", { class: "btn btn-ghost", type: "button", text: "Text version", onclick: openText })
  ]));
  var qs = HC.state.questions;
  box.appendChild(el("div", { class: "section-title", style: "margin:16px 0 4px;", text: "Questions for the appointment" }));
  box.appendChild(el("p", { class: "small", text: "Jot them down as they come to you; they're printed on page 1 until you remove them." }));
  var list = el("div", { class: "q-list" });
  qs.forEach(function(q){
    list.appendChild(el("div", { class: "q-item" }, [el("span", { text: q.text }), el("button", { type: "button", "aria-label": "Remove question", text: "×", onclick: function(){ HC.state.questions = HC.state.questions.filter(function(x){ return x.id !== q.id; }); HC.save(); } })]));
  });
  box.appendChild(list);
  var inp = el("input", { type: "text", placeholder: "e.g. Can I add the next rehab step?", maxlength: "160" });
  function add(){ var t = inp.value.trim(); if(!t) return; HC.state.questions.push({ id: HC.uid(), text: t, done: false }); HC.save(); }
  inp.addEventListener("keydown", function(e){ if(e.key === "Enter"){ e.preventDefault(); add(); } });
  box.appendChild(el("div", { style: "display:flex; gap:8px;" }, [inp, el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Add", onclick: add })]));
}

var overlay = null, pdfPromise = null;
function closePreview(){ if(overlay){ overlay.remove(); overlay = null; } pdfPromise = null; }
function fileName(R){ return "head-clear-week-ending-" + R.end + ".pdf"; }

function openPreview(){
  var R = buildReport(endKey()), cvs;
  try{ cvs = [page1(R), page2(R)]; }catch(e){ console.error(e); HC.notice("Couldn't build the report", [String(e && e.message || e)]); return; }
  closePreview();
  overlay = el("div", { id: "reportOverlay" });
  var pages = el("div", { class: "rp-pages" }, cvs);
  cvs.forEach(function(cv){ cv.addEventListener("click", function(){ cv.classList.toggle("zoom"); }); });
  overlay.appendChild(el("div", { class: "rp-bar" }, [el("b", { text: "Weekly report — tap a page to zoom" }), el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Close", onclick: closePreview })]));
  overlay.appendChild(pages);
  var shareBtn = el("button", { class: "btn btn-primary", type: "button", text: "Share PDF" });
  overlay.appendChild(el("div", { class: "rp-actions" }, [
    shareBtn,
    el("button", { class: "btn btn-ghost", type: "button", text: "Text version", onclick: function(){ openText(R); } })
  ]));
  document.body.appendChild(overlay);
  // build the PDF now so the share sheet opens instantly when tapped
  pdfPromise = Promise.all(cvs.map(canvasJpeg)).then(function(js){ return new File([makePdf(js)], fileName(R), { type: "application/pdf" }); });
  shareBtn.addEventListener("click", function(){
    pdfPromise.then(function(file){ return sharePdf(file, R); }).catch(function(e){ if(e && e.name !== "AbortError") HC.toast("Couldn't create the PDF."); });
  });
}
function sharePdf(file, R){
  var data = { files: [file], title: "Weekly recovery report", text: R.range };
  if(navigator.canShare && navigator.canShare(data) && navigator.share) return navigator.share(data);
  var url = URL.createObjectURL(file), a = document.createElement("a");
  a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 30000);
  HC.toast("PDF saved — attach it to your message.");
}

function openText(R){
  R = (R && R.keys) ? R : buildReport(endKey());
  var text = buildText(R);
  var box = el("textarea", { class: "summary-box", readonly: true, text: text, style: "min-height:260px;" });
  HC.openModal([
    el("h3", { text: "Text version" }),
    el("p", { class: "small", text: "Short enough for a WhatsApp message. Send the PDF alongside it from the preview." }),
    box,
    el("div", { class: "modal-actions" }, [
      el("button", { class: "btn btn-ghost", type: "button", text: "Copy", onclick: function(){
        try{ navigator.clipboard.writeText(text).then(function(){ HC.toast("Copied."); }, function(){ box.focus(); box.select(); }); }catch(e){ box.focus(); box.select(); }
      } }),
      el("button", { class: "btn btn-primary", type: "button", text: "Open WhatsApp", onclick: function(){ window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank"); } })
    ])
  ]);
}

/* ---------------- wiring ---------------- */
HC.buildWeekReport = buildReport;
HC.weekReportText = function(end){ return buildText(buildReport(end || HC.todayKey())); };
HC.drawReportPages = function(end){ var R = buildReport(end || HC.todayKey()); return [page1(R), page2(R)]; };
HC.reportPdf = function(end){
  var cvs = HC.drawReportPages(end);
  return Promise.all(cvs.map(canvasJpeg)).then(makePdf);
};
HC.on.render.push(renderCard);
HC.on.refresh.push(renderCard);
HC.on.show.history = (HC.on.show.history || []).concat([renderCard]);
})();
