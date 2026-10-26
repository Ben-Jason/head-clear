/* boot.js — runs last: wires the tab bar, draws everything, and rolls the day over. */
(function(){
"use strict";
var HC = window.HC;

document.querySelectorAll(".tab-btn").forEach(function(b){
  b.addEventListener("click", function(){ HC.switchTab(b.dataset.tab); });
});

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
