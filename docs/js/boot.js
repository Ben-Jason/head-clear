/* boot.js — runs last: wires the tab bar, draws everything, and rolls the day over. */
(function(){
"use strict";
var HC = window.HC;

document.querySelectorAll(".tab-btn").forEach(function(b){
  b.addEventListener("click", function(){ HC.switchTab(b.dataset.tab); });
});

/* iOS home-screen mode can report the page as shorter than the real screen (by about the
   status-bar height), which left the tab bar floating above the bottom edge. When the gap is
   that size, size the shell to the screen instead; otherwise leave it to 100dvh. */
function fitScreenHeight(){
  var root = document.documentElement;
  var standalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  var portrait = window.matchMedia("(orientation: portrait)").matches;
  var gap = window.screen && window.screen.height ? window.screen.height - window.innerHeight : 0;
  if(standalone && portrait && gap >= 20 && gap <= 100) root.style.setProperty("--app-h", window.screen.height + "px");
  else root.style.removeProperty("--app-h");
}
HC.fitScreenHeight = fitScreenHeight;
fitScreenHeight();
window.addEventListener("resize", fitScreenHeight);
window.addEventListener("orientationchange", function(){ setTimeout(fitScreenHeight, 300); });

HC.today();            // make sure today's record exists
HC.renderAll();
HC.switchTab("today");
HC.save();             // persists any defaults added by this version (profile, meds, ...)

// If the app stays open (or is reopened from the background) past midnight, start the new day.
var lastKey = HC.todayKey();
function rollover(){
  var k = HC.todayKey();
  if(k === lastKey) return;
  lastKey = k;
  HC.today();
  HC.save();
  HC.renderAll();
}
setInterval(rollover, 60000);
document.addEventListener("visibilitychange", function(){ if(!document.hidden) rollover(); });
})();
