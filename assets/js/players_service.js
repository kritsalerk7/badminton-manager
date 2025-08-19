// assets/js/players_service.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  serverTimestamp, query, where, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getCurrentGroupId } from "./group_state.js?v=20250812";

if (!window.__FBAPP__) window.__FBAPP__ = initializeApp(window.FIREBASE_CONFIG);
const db = getFirestore();

export async function listOwnerPlayers(){
  const uid = getAuth().currentUser?.uid;
  if(!uid) return [];
  const qs = await getDocs(collection(db, 'users', uid, 'players'));
  return qs.docs.map(d=> ({ id:d.id, ...(d.data()||{}) }));
}

export async function createOwnerPlayer(data){
  const uid = getAuth().currentUser?.uid;
  if(!uid) throw new Error('not signed in');
  const ref = await addDoc(collection(db, 'users', uid, 'players'), {
    name: data.name || '',
    level: data.level || 0,
    note: data.note || '',
    createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateOwnerPlayer(id, patch){
  const uid = getAuth().currentUser?.uid;
  if(!uid) throw new Error('not signed in');
  await updateDoc(doc(db, 'users', uid, 'players', id), { ...(patch||{}), updatedAt: serverTimestamp() });
}

export async function deleteOwnerPlayer(id){
  const uid = getAuth().currentUser?.uid;
  if(!uid) throw new Error('not signed in');
  await deleteDoc(doc(db, 'users', uid, 'players', id));
}

export async function listGroupPlayers(gid = getCurrentGroupId()){
  const qs = await getDocs(collection(db, 'groups', gid, 'members_profiles'));
  return qs.docs.map(d=> ({ id:d.id, ...(d.data()||{}) }));
}

export async function addPlayerToGroup(player, gid = getCurrentGroupId()){
  const uid = getAuth().currentUser?.uid;
  if(!uid) throw new Error('not signed in');
  const ref = doc(db, 'groups', gid, 'members_profiles', player.id);
  await setDoc(ref, {
    playerId: player.id,
    refUserUid: uid,
    name: player.name || '',
    level: player.level || 0,
    note: player.note || '',
    addedAt: serverTimestamp()
  }, { merge: true });
}

export async function removePlayerFromGroup(playerId, gid = getCurrentGroupId()){
  const uid = getAuth().currentUser?.uid;
  if(!uid) throw new Error('not signed in');
  await deleteDoc(doc(db, 'groups', gid, 'members_profiles', playerId));
}
