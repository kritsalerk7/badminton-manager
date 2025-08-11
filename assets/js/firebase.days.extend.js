// ต้องมี db จาก firebase.js แล้ว
// ใช้ Firestore v9 modular
// import พวกนี้ไว้ใน firebase.js เดิมอยู่แล้ว: doc, setDoc, getDoc, onSnapshot, collection, query, where, getDocs

(function(){
  if (!window.db) { console.error("[days.extend] db not found"); return; }
  const daysCol = "days";
  window.DB = window.DB || {};

  // อ่านรายวัน (รองรับ schema เก่า/ใหม่)
  window.DB.getDay = window.DB.getDay || async function(dateStr){
    const ref = doc(db, daysCol, dateStr);
    const s = await getDoc(ref);
    return s.exists() ? { id: s.id, ...s.data() } : { id: dateStr, playerIds: [] };
  };

  // realtime รายวัน
  window.DB.observeDay = window.DB.observeDay || function(dateStr, cb){
    const ref = doc(db, daysCol, dateStr);
    return onSnapshot(ref, snap => cb({ id: snap.id, ...snap.data() }));
  };

  // อัปเดตรายชื่อ (รักษา arrived เดิมไว้ถ้าไม่มีให้ส่งมา)
  window.DB.setDayPlayers = async function(dateStr, ids){
    const ref = doc(db, daysCol, dateStr);
    const snap = await getDoc(ref);
    const prev = snap.exists() ? snap.data() : {};
    const prevArrived = prev.arrived || {};
    const players = (ids||[]).map(id => ({ id, arrived: !!prevArrived[id] }));
    await setDoc(ref, {
      playerIds: ids || [],
      players,
      arrived: players.reduce((a,p)=> (a[p.id]=!!p.arrived, a), {}),
      ym: dateStr.slice(0,7),
      date: dateStr,
      updatedAt: Date.now()
    }, { merge: true });
  };

  // เซ็ตทั้งชุด (มี arrived ครบ)
  window.DB.setDayRoster = async function(dateStr, roster){
    const ref = doc(db, daysCol, dateStr);
    const ids = (roster||[]).map(r => r.id);
    const arrived = {}; (roster||[]).forEach(r => arrived[r.id] = !!r.arrived);
    await setDoc(ref, {
      playerIds: ids,
      players: roster || [],
      arrived,
      ym: dateStr.slice(0,7),
      date: dateStr,
      updatedAt: Date.now()
    }, { merge: true });
  };

  // เซ็ตเฉพาะ arrived map
  window.DB.setDayArrived = async function(dateStr, arrivedMap){
    await setDoc(doc(db, daysCol, dateStr), {
      arrived: arrivedMap || {},
      updatedAt: Date.now()
    }, { merge: true });
  };

  // ดึงข้อมูลทั้งเดือน (สำหรับโปรไฟล์)
  window.DB.getMonthDays = window.DB.getMonthDays || async function(ym){
    const qy = query(collection(db, daysCol), where("ym","==", ym));
    const res = await getDocs(qy);
    return res.docs.map(d => ({ id: d.id, ...d.data() }));
  };
})();
