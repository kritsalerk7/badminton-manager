// Courts Firestore helpers (module-safe, no import of project's firebase.js)
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getCurrentGroupId } from "../../group_state.js";


function tryGetDb(){
  try {
    if (typeof getApps === "function") {
      const apps = getApps();
      if (apps && apps.length > 0) {
        try {
          return getFirestore(apps[0]); // use existing default app without calling getApp()
        } catch (e) {}
      }
    }
  } catch(e) {}
  // compat fallback
  if (typeof window !== "undefined" && window.firebase && window.firebase.firestore) {
    try { return window.firebase.firestore(); } catch(e){}
  }
  // global variable fallback
  if (typeof window !== "undefined" && window.db) return window.db;
  // last resort: attempt default getFirestore (may succeed if default app exists)
  try { return getFirestore(); } catch(e) {}
  throw new Error("ไม่พบ Firebase App/Firestore: โปรดตรวจว่า court.html โหลดไฟล์ firebase ของโปรเจกต์ก่อนสคริปต์ของหน้า court");
}
        
export const db = tryGetDb();

export {
  collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, where, orderBy, limit
};

export function todayKey(t = new Date()){
  const tz = new Date(t.getTime() - t.getTimezoneOffset()*60000);
  return tz.toISOString().slice(0,10);
}

export const paths = {
  groupDoc: (gid) => doc(db, "groups", gid),
  membersCol: (gid) => collection(db, "groups", gid, "members"),
  membersProfilesCol: (gid) => collection(db, "groups", gid, "members_profiles"),
  datesCol: (gid) => collection(db, "groups", gid, "dates"),
  dateRoot: (dateKey, gid = getCurrentGroupId()) => doc(db, "groups", gid, "dates", dateKey),
  attendeesCol: (dateKey, gid = getCurrentGroupId()) => collection(db, "groups", gid, "dates", dateKey, "attendees"),
  excludedCol: (dateKey, gid = getCurrentGroupId()) => collection(db, "groups", gid, "dates", dateKey, "excluded"),
  courtsCol: (dateKey, gid = getCurrentGroupId()) => collection(db, "groups", gid, "dates", dateKey, "courts"),
  courtDoc: (dateKey, courtId, gid = getCurrentGroupId()) => doc(db, "groups", gid, "dates", dateKey, "courts", courtId),
  queueCol: (dateKey, gid = getCurrentGroupId()) => collection(db, "groups", gid, "dates", dateKey, "queue"),
  standbyCol: (dateKey, courtId, gid = getCurrentGroupId()) => collection(db, "groups", gid, "dates", dateKey, "courts", courtId, "standby_matches"),
  currentMatchDoc: (dateKey, courtId, gid = getCurrentGroupId()) => doc(db, "groups", gid, "dates", dateKey, "courts", courtId, "current_match", "live"),
  historyCol: (dateKey, courtId, gid = getCurrentGroupId()) => collection(db, "groups", gid, "dates", dateKey, "courts", courtId, "matches_history"),
  statsPlayersCol: (dateKey, gid = getCurrentGroupId()) => collection(db, "groups", gid, "dates", dateKey, "stats", "players"),
  courtsStatsCol: (dateKey, gid = getCurrentGroupId()) => collection(db, "groups", gid, "dates", dateKey, "courts_stats"),
};


export function uid(){ return Math.random().toString(36).slice(2,10); }