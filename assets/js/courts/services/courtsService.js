// Courts service with standby, DnD helpers, time accounting and settings
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, where, orderBy, limit, db
} from "./firestore.js";
import { todayKey, paths, uid } from "./firestore.js";

function normalizePlayer(p){
  return { id: p.id || uid(), name: p.name || "Unknown", level: p.level ?? 0 };
}

// --- Settings ---
export async function getCourtCount(){
  const local = parseInt(localStorage.getItem("courtCount")||"10", 10);
  return isNaN(local) ? 10 : local;
}
export async function setCourtCount(n){
  localStorage.setItem("courtCount", String(n));
}

// --- Candidates (from attendees or members fallback) ---
export function subscribeCandidates(dateKey, {onChange}){
  const col = paths.attendeesCol(dateKey);
  const qy = query(col, orderBy("name"));
  return onSnapshot(qy, async snap => {
    if (snap.empty){
      const mq = query(collection(db, "members"), where("todayCheckedIn", "==", true), orderBy("name"));
      const msnap = await getDocs(mq);
      const items = msnap.docs.map(d=>({id:d.id, ...d.data()}));
      onChange(items);
    } else {
      const items = snap.docs.map(d => ({id:d.id, ...d.data()}));
      onChange(items);
    }
  });
}

// --- Queue ---
export function subscribeQueue(dateKey, {onChange}){
  const qy = query(paths.queueCol(dateKey), orderBy("joinedAt","asc"));
  return onSnapshot(qy, snap => {
    const items = snap.docs.map(d => ({id:d.id, ...d.data()}));
    onChange(items);
  });
}

export async function joinQueue(dateKey, player){
  const ref = doc(paths.queueCol(dateKey), player.id);
  const snap = await getDoc(ref);
  const now = serverTimestamp();
  if(!snap.exists()){
    await setDoc(ref, { player: normalizePlayer(player), joinedAt: now, waitTotalMs: 0 });
  }
}

export async function leaveQueue(dateKey, playerId){
  const ref = doc(paths.queueCol(dateKey), playerId);
  const snap = await getDoc(ref);
  if(snap.exists()) await deleteDoc(ref);
}

export async function popFromQueue(dateKey, playerId){
  const ref = doc(paths.queueCol(dateKey), playerId);
  const snap = await getDoc(ref);
  if(!snap.exists()) return null;
  const data = snap.data();
  await deleteDoc(ref);
  await incPlayerCounter(dateKey, playerId, {waitDeltaMsFromJoinedAt:data.joinedAt});
  return data.player;
}

// --- Exclude ---
export function subscribeExcluded(dateKey, {onChange}){
  return onSnapshot(paths.excludedCol(dateKey), snap => {
    const ids = new Set(snap.docs.map(d=>d.id));
    onChange(ids);
  });
}
export async function toggleExclude(dateKey, playerId){
  const ref = doc(paths.excludedCol(dateKey), playerId);
  const snap = await getDoc(ref);
  if(snap.exists()) await deleteDoc(ref); else await setDoc(ref, {createdAt: serverTimestamp()});
}

// --- Standby matches ---
export function subscribeStandby(dateKey, courtId, {onChange}){
  const qy = query(paths.standbyCol(dateKey, courtId), orderBy("createdAt","asc"));
  return onSnapshot(qy, snap => {
    onChange(snap.docs.map(d=>({id:d.id, ...d.data()})));
  });
}
export async function createStandbyMatch(dateKey, courtId, teamA, teamB){
  const payload = { teamA: teamA.map(normalizePlayer), teamB: teamB.map(normalizePlayer), createdAt: serverTimestamp() };
  await addDoc(paths.standbyCol(dateKey, courtId), payload);
}
export async function deleteStandbyMatch(dateKey, courtId, matchId){
  await deleteDoc(doc(paths.standbyCol(dateKey, courtId), matchId));
}
export async function swapPlayerInStandby(dateKey, courtId, matchId, side, index, newPlayer){
  const ref = doc(paths.standbyCol(dateKey, courtId), matchId);
  const snap = await getDoc(ref);
  if(!snap.exists()) return;
  const data = snap.data();
  const team = side === "A" ? (data.teamA||[]) : (data.teamB||[]);
  team[index] = normalizePlayer(newPlayer);
  await updateDoc(ref, { [side === "A" ? "teamA":"teamB"]: team });
}

// --- Live matches ---
export function subscribeLive(dateKey, courtId, {onChange}){
  return onSnapshot(paths.currentMatchDoc(dateKey, courtId), snap => onChange(snap.exists()?snap.data():null));
}
export async function startMatch(dateKey, courtId, match){
  const ref = paths.currentMatchDoc(dateKey, courtId);
  await setDoc(ref, {
    courtId, state:"live",
    teamA: (match.teamA||[]).map(normalizePlayer),
    teamB: (match.teamB||[]).map(normalizePlayer),
    startedAt: serverTimestamp()
  });
  if(match.id){
    await deleteStandbyMatch(dateKey, courtId, match.id);
  }
}
export async function finishMatch(dateKey, courtId){
  const liveRef = paths.currentMatchDoc(dateKey, courtId);
  const liveSnap = await getDoc(liveRef);
  if(!liveSnap.exists()) throw new Error("ยังไม่มีแมตช์ในคอร์ทนี้");
  const live = liveSnap.data();
  const finishedAt = serverTimestamp();
  await addDoc(paths.historyCol(dateKey, courtId), { ...live, state:"finished", finishedAt });
  await deleteDoc(liveRef);
  await incPlayersPlayTime(dateKey, [...(live.teamA||[]), ...(live.teamB||[])], live.startedAt, finishedAt);
  await incCourtPlayTime(dateKey, courtId, live.startedAt, finishedAt);
}

// --- Stats helpers ---
async function incPlayersPlayTime(dateKey, players, startedAt, finishedAt){
  for(const p of players){
    await incPlayerCounter(dateKey, p.id, { playDeltaFromRange: {startedAt, finishedAt} });
  }
}
async function incCourtPlayTime(dateKey, courtId, startedAt, finishedAt){
  const ref = doc(paths.courtsStatsCol(dateKey), courtId);
  const snap = await getDoc(ref);
  const curr = snap.exists()? snap.data(): { playTimeMsTotal:0 };
  const delta = rangeMs(startedAt, finishedAt);
  await setDoc(ref, { playTimeMsTotal: (curr.playTimeMsTotal||0) + delta }, {merge:true});
}

function rangeMs(startedAt, finishedAt){
  const s = toMillis(startedAt), f = toMillis(finishedAt);
  return Math.max(0, f - s);
}
function toMillis(ts){
  if (!ts) return Date.now();
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts.seconds) return ts.seconds*1000 + Math.floor((ts.nanoseconds||0)/1e6);
  return Date.now();
}

async function incPlayerCounter(dateKey, playerId, opts){
  const ref = doc(paths.statsPlayersCol(dateKey), playerId);
  const snap = await getDoc(ref);
  const curr = snap.exists()? snap.data(): { games:0, wins:0, losses:0, playTimeMsTotal:0, waitTimeMsTotal:0 };
  let updates = {};
  if (opts.waitDeltaMsFromJoinedAt){
    const delta = toMillis(serverTimestamp()) - toMillis(opts.waitDeltaMsFromJoinedAt);
    updates.waitTimeMsTotal = (curr.waitTimeMsTotal||0) + Math.max(0, delta);
  }
  if (opts.playDeltaFromRange){
    const delta = rangeMs(opts.playDeltaFromRange.startedAt, opts.playDeltaFromRange.finishedAt);
    updates.playTimeMsTotal = (curr.playTimeMsTotal||0) + Math.max(0, delta);
    updates.games = (curr.games||0) + 1;
  }
  updates.updatedAt = serverTimestamp();
  await setDoc(ref, updates, {merge:true});
}
