
/**
 * firebase.days.extend.compat.js
 * Use with Firebase v8/v9-compat CDN (global `firebase` object).
 * Loads AFTER your firebase.js (which calls firebase.initializeApp and signs in).
 * Attaches new/updated methods to window.DB for day roster with `arrived` flags.
 */
(function(){
  if (!window.firebase || !firebase.firestore) {
    console.error("[days.extend.compat] firebase compat SDK not found. Load firebase-app-compat.js and firebase-firestore-compat.js first.");
    return;
  }
  var db = firebase.firestore();
  window.DB = window.DB || {};

  function dayRef(dateStr){ return db.collection("days").doc(dateStr); }
  function ymOf(dateStr){ return String(dateStr).slice(0,7); }

  // ---- Readers ----
  window.DB.getDay = window.DB.getDay || async function(dateStr){
    var s = await dayRef(dateStr).get();
    return s.exists ? Object.assign({ id: s.id }, s.data()) : { id: dateStr, playerIds: [] };
  };
  window.DB.observeDay = window.DB.observeDay || function(dateStr, cb){
    return dayRef(dateStr).onSnapshot(function(snap){
      cb(Object.assign({ id: snap.id }, snap.data()));
    });
  };
  window.DB.getMonthDays = window.DB.getMonthDays || async function(ym){
    var qs = await db.collection("days").where("ym","==", ym).get();
    return qs.docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); });
  };

  // ---- Writers ----
  // Preserve arrived flags when only ids are supplied
  window.DB.setDayPlayers = async function(dateStr, ids){
    var ref = dayRef(dateStr);
    var prev = await ref.get();
    var prevArrived = (prev.exists && prev.data().arrived) || {};
    var players = (ids||[]).map(function(id){ return { id: id, arrived: !!prevArrived[id] }; });
    var arrived = players.reduce(function(a,p){ a[p.id] = !!p.arrived; return a; }, {});
    await ref.set({
      playerIds: ids || [],
      players: players,
      arrived: arrived,
      ym: ymOf(dateStr),
      date: dateStr,
      updatedAt: Date.now()
    }, { merge: true });
  };

  // Full roster including arrived flags
  window.DB.setDayRoster = async function(dateStr, roster){
    var ref = dayRef(dateStr);
    var ids = (roster||[]).map(function(x){ return x.id; });
    var arrived = {}; (roster||[]).forEach(function(x){ arrived[x.id] = !!x.arrived; });
    await ref.set({
      playerIds: ids,
      players: roster || [],
      arrived: arrived,
      ym: ymOf(dateStr),
      date: dateStr,
      updatedAt: Date.now()
    }, { merge: true });
  };

  // Just update arrived map
  window.DB.setDayArrived = async function(dateStr, arrivedMap){
    var ref = dayRef(dateStr);
    await ref.set({
      arrived: arrivedMap || {},
      updatedAt: Date.now()
    }, { merge: true });
  };
})();
