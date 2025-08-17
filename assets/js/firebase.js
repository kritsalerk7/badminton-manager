// firebase.js (Firebase v9 compat)
(function(){
  'use strict';
  var cfg = window.FIREBASE_CONFIG;
  if (!cfg) { console.error('[firebase.js] Missing window.FIREBASE_CONFIG'); return; }

  // Init app once
  var app = (firebase.apps && firebase.apps.length) ? firebase.app() : firebase.initializeApp(cfg);

  // Services
  var auth = firebase.auth();
  var db   = firebase.firestore();

  // Firestore settings once
  if (!window.__FS_SETTINGS_SET__) {
    try {
      db.settings({ experimentalAutoDetectLongPolling: true, useFetchStreams: false , merge:true, });
    } catch(e) { console.warn('[firebase.js] db.settings skipped:', e); }
    window.__FS_SETTINGS_SET__ = true;
  }

  // Wait for auth ready to avoid early DB calls
  var AUTH_READY = new Promise(function(resolve){
    auth.onAuthStateChanged(function(){ resolve(); });
  });

  // Sign in anonymously (must enable Anonymous in Console)
  auth.signInAnonymously().catch(function(e){
    console.error('[firebase.js] signInAnonymously error:', e);
  });

  // Collections
  function colMembers(){ return db.collection('members'); }
  function colDays(){ return db.collection('days'); } // doc id = YYYY-MM-DD

  // Members API
  async function getMembers(){
    await AUTH_READY;
    var snap = await colMembers().orderBy('name').get();
    return snap.docs.map(function(d){ var data=d.data(); data.id=d.id; return data; });
  }
  async function addMember(data){
    await AUTH_READY;
    var doc = await colMembers().add({
      name: data.name || '',
      level: (data.level != null ? data.level : 1),
      status: data.status || 'active',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return doc.id;
  }
  async function updateMember(id, data){
    await AUTH_READY;
    await colMembers().doc(id).update(data);
  }
  async function deleteMember(id){
    await AUTH_READY;
    await colMembers().doc(id).delete();
  }
  function observeMembers(cb){
    return colMembers().orderBy('name').onSnapshot(function(snap){
      var list = snap.docs.map(function(d){ var obj=d.data(); obj.id=d.id; return obj; });
      cb(list);
    });
  }

  // Days API
  async function getDay(dateISO){
    await AUTH_READY;
    var ref = colDays().doc(dateISO);
    var doc = await ref.get();
    if (!doc.exists) {
      return { id: dateISO, date: dateISO, ym: dateISO.slice(0,7), playerIds: [], count: 0 };
    }
    var obj = doc.data(); obj.id = doc.id; return obj;
  }
  async function setDayPlayers(dateISO, playerIds){
    await AUTH_READY;
    var ym = dateISO.slice(0,7);
    await colDays().doc(dateISO).set({
      date: dateISO,
      ym: ym,
      playerIds: playerIds || [],
      count: (playerIds || []).length,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  function observeDay(dateISO, cb){
    return colDays().doc(dateISO).onSnapshot(function(doc){
      if (!doc.exists) {
        cb({ id: dateISO, date: dateISO, ym: dateISO.slice(0,7), playerIds: [], count: 0 });
      } else {
        var d = doc.data(); d.id = doc.id; cb(d);
      }
    });
  }
  async function getMonthDays(ym){
    await AUTH_READY;
    var snap = await colDays().where('ym','==',ym).get();
    var map = {};
    snap.forEach(function(doc){
      var d = doc.data(); map[d.date] = d.playerIds || [];
    });
    return map;
  }

  // Expose
  window.DB = {
    getMembers, addMember, updateMember, deleteMember, observeMembers,
    getDay, setDayPlayers, observeDay, getMonthDays
  };
})();

