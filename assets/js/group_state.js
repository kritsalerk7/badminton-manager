// assets/js/group_state.js (no collectionGroup; uses users/{uid}/groups mapping)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, getDoc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

if (!window.__FBAPP__) {
  window.__FBAPP__ = initializeApp(window.FIREBASE_CONFIG);
}
const db = getFirestore();
const LS_KEY = 'currentGroupId';

export function getCurrentGroupId(){ return localStorage.getItem(LS_KEY) || 'default'; }
export function setCurrentGroupId(gid){
  localStorage.setItem(LS_KEY, gid);
  dispatchEvent(new CustomEvent('group:changed', { detail: { groupId: gid } }));
}

// Ensure default group exists and write membership + user mapping
export async function ensureDefaultGroupExists(){
  const gid = getCurrentGroupId();
  const gref = doc(db, 'groups', gid);
  const gsnap = await getDoc(gref);
  const uid = getAuth().currentUser?.uid || null;
  if (!gsnap.exists()){
    await setDoc(gref, { name: gid, ownerUid: uid, createdAt: serverTimestamp(), isDeleted:false }, { merge:true });
  }
  // group membership
  if (uid){
    await setDoc(doc(db, 'groups', gid, 'members', uid), { uid, role:'owner', joinedAt: serverTimestamp() }, { merge:true });
    // user mapping
    await setDoc(doc(db, 'users', uid, 'groups', gid), { groupId: gid, role:'owner', mappedAt: serverTimestamp() }, { merge:true });
  }
  return gid;
}

// List my groups from users/{uid}/groups
export async function listMyGroups(){
  await ensureOwnerMappings();
  const uid = getAuth().currentUser?.uid;
  if(!uid) return [];
  const qs = await getDocs(collection(db, 'users', uid, 'groups'));
  const out = [];
  for (const d of qs.docs){
    const gid = d.id;
    const g = await getDoc(doc(db, 'groups', gid));
    if (g.exists()){
      const data = g.data() || {};
      if (!data.isDeleted){
        out.push({ id: gid, ...data, myRole: (d.data()?.role || 'member') });
      }
    }
  }
  out.sort((a,b)=> (a.myRole==='owner'?0:1) - (b.myRole==='owner'?0:1) || (a.name||'').localeCompare(b.name||''));
  return out;
}

// Create group: write group doc, membership, and user mapping
export async function createGroup(name){
  const uid = getAuth().currentUser?.uid || null;
  const ref = await addDoc(collection(db, 'groups'), {
    name: name || 'My Group',
    ownerUid: uid,
    createdAt: serverTimestamp(),
    isDeleted: false,
  });
  if (uid){
    await setDoc(doc(db, 'groups', ref.id, 'members', uid), { uid, role:'owner', joinedAt: serverTimestamp() }, { merge:true });
    await setDoc(doc(db, 'users', uid, 'groups', ref.id), { groupId: ref.id, role:'owner', mappedAt: serverTimestamp() }, { merge:true });
  }
  return ref.id;
}

export async function renameGroup(groupId, newName){
  await updateDoc(doc(db, 'groups', groupId), { name: newName, updatedAt: serverTimestamp() });
}

export async function leaveGroup(groupId){
  const uid = getAuth().currentUser?.uid;
  if (!uid) throw new Error('not signed in');
  // remove membership
  await deleteDoc(doc(db, 'groups', groupId, 'members', uid));
  // remove user mapping
  await deleteDoc(doc(db, 'users', uid, 'groups', groupId));
  // switch current group if leaving the active one
  if (getCurrentGroupId() === groupId){
    setCurrentGroupId('default');
    await ensureDefaultGroupExists();
  }
}

export async function deleteGroup(groupId){
  // soft delete group doc (owner only – UI/Rules should enforce)
  await updateDoc(doc(db, 'groups', groupId), { isDeleted:true, deletedAt: serverTimestamp() });
  // active switch if needed
  if (getCurrentGroupId() === groupId){
    setCurrentGroupId('default');
    await ensureDefaultGroupExists();
  }
  // NOTE: We do NOT fan-out delete all user mappings/members here to keep it simple.
  // Optionally, add a Cloud Function to clean up users/*/groups mappings for this groupId.
}

export function renderRoleBadge(role){
  const span = document.createElement('span');
  span.className = 'badge rounded-pill ' + (role==='owner' ? 'text-bg-primary' : role==='admin' ? 'text-bg-secondary' : 'text-bg-light');
  span.textContent = role;
  return span;
}

// UI helper: mount a simple group switcher <select> into the given element
export async function mountGroupSwitcher(el){
  if (!el) return;
  const groups = await listMyGroups();
  const sel = document.createElement('select');
  sel.className = 'form-select form-select-sm';
  const curr = getCurrentGroupId();
  if (groups.length === 0){
    const opt = document.createElement('option');
    opt.value = 'default'; opt.textContent = 'default (auto)';
    if (curr === 'default') opt.selected = true;
    sel.appendChild(opt);
  } else {
    for (const g of groups){
      const opt = document.createElement('option');
      opt.value = g.id; opt.textContent = g.name || g.id;
      if (g.id === curr) opt.selected = true;
      sel.appendChild(opt);
    }
  }
  sel.addEventListener('change', e=> setCurrentGroupId(e.target.value));
  el.innerHTML = '';
  el.appendChild(sel);
}

// --- Invite & Join helpers ---
export function uid(n=8){ return Math.random().toString(36).slice(2, 2+n); }

// Owner: create an invite code under groups/{gid}/invites/{code}
export async function createInvite(groupId){
  const auth = getAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('not signed in');
  // We do not enforce role here; security rules should allow only owner/admin to write invites.
  const code = uid + '-' + uid.substring(0,4) + '-' + Math.random().toString(36).slice(2,6);
  await setDoc(doc(db, 'groups', groupId, 'invites', code), {
    code, createdBy: uid, createdAt: serverTimestamp(), active: true
  }, { merge: true });
  return code;
}

// Owner: list invites (for display/copy/revoke)
export async function listInvites(groupId){
  const snap = await getDocs(collection(db, 'groups', groupId, 'invites'));
  const out = [];
  snap.forEach(d=> { const x = d.data() || {}; out.push({ id:d.id, ...x }); });
  out.sort((a,b)=> (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
  return out;
}

// Owner: revoke invite (set active=false)
export async function revokeInvite(groupId, code){
  await setDoc(doc(db, 'groups', groupId, 'invites', code), { active:false, revokedAt: serverTimestamp() }, { merge:true });
}

// Member (self-join): join group using gid + code
export async function joinGroup(groupId, code){
  const auth = getAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('not signed in');
  const invRef = doc(db, 'groups', groupId, 'invites', code);
  const invSnap = await getDoc(invRef);
  if (!invSnap.exists()) throw new Error('โค้ดเชิญไม่ถูกต้อง');
  const inv = invSnap.data() || {};
  if (inv.active === false) throw new Error('โค้ดนี้ถูกยกเลิกแล้ว');
  // write membership + user mapping
  await setDoc(doc(db, 'groups', groupId, 'members', uid), { uid, role:'member', joinedAt: serverTimestamp() }, { merge:true });
  await setDoc(doc(db, 'users', uid, 'groups', groupId), { groupId, role:'member', mappedAt: serverTimestamp() }, { merge:true });
  // consume invite (optional: keep for audit, just set active=false)
  await setDoc(invRef, { active:false, consumedBy: uid, consumedAt: serverTimestamp() }, { merge:true });
  return true;
}

// --- Owner group helpers & navbar switcher ---

// Ensure mappings for groups where current user is the owner


// List groups that I own


// Navbar switcher that shows only owner groups








// --- owner helpers (canonical) ---
export async function ensureOwnerMappings(){
  try{
    const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    const { getFirestore, collection, query, where, getDocs, doc, getDoc, setDoc, serverTimestamp } =
      await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const db = getFirestore();
    const uid = getAuth().currentUser?.uid;
    if (!uid) return [];
    const q = query(collection(db, 'groups'), where('ownerUid', '==', uid));
    const qs = await getDocs(q);
    const ensured = [];
    for (const d of qs.docs){
      const gid = d.id;
      const mapRef = doc(db, 'users', uid, 'groups', gid);
      const mSnap = await getDoc(mapRef);
      if (!mSnap.exists()){
        await setDoc(mapRef, { groupId: gid, role: 'owner', mappedAt: serverTimestamp() }, { merge: true });
      }
      ensured.push(gid);
    }
    return ensured;
  }catch(e){ console.warn('[ensureOwnerMappings]', e); return []; }
}

export async function listOwnerGroups(){
  try{
    const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    const { getFirestore, getDocs, collection, doc, getDoc } =
      await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const db = getFirestore();
    const uid = getAuth().currentUser?.uid;
    if (!uid) return [];
    const qs = await getDocs(collection(db, 'users', uid, 'groups'));
    const out = [];
    for (const d of qs.docs){
      const role = (d.data()?.role || 'member');
      if (role !== 'owner') continue;
      const gid = d.id;
      const g = await getDoc(doc(db, 'groups', gid));
      if (g.exists()){
        const data = g.data() || {};
        if (!data.isDeleted) out.push({ id: gid, ...data, myRole: role });
      }
    }
    out.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
    return out;
  }catch(e){ console.warn('[listOwnerGroups]', e); return []; }
}




export async function waitForAuthReady(timeoutMs=8000){
  const { getAuth, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
  const auth = getAuth();
  if (auth.currentUser) return auth.currentUser;
  return await new Promise((res, rej)=>{
    const t = setTimeout(()=> rej(new Error('auth-timeout')), timeoutMs);
    const off = onAuthStateChanged(auth, u=>{ clearTimeout(t); off(); res(u); });
  });
}

export async function mountOwnerGroupSwitcher(el){
  try{
    if (!el) return;
    await waitForAuthReady();
    await ensureOwnerMappings();
    let groups = await listOwnerGroups();
    let labelSuffix = '';
    if (!groups.length){
      groups = await listMyGroups();
      labelSuffix = ' (member)';
    }
    const curr = (typeof getCurrentGroupId === 'function') ? getCurrentGroupId() : (localStorage.getItem('currentGroupId')||'default');
    const select = document.createElement('select');
    select.className = 'form-select form-select-sm';
    select.id = 'ownerGroupSelect';
    select.name = 'ownerGroupSelect';

    if (groups.length === 0){
      const o = document.createElement('option');
      o.value = 'default'; o.textContent = 'เลือกก๊วน'; // empty state
      if (curr==='default') o.selected = true;
      select.appendChild(o);
    } else {
      for (const g of groups){
        const o = document.createElement('option');
        o.value = g.id; o.textContent = (g.name || g.id) + (g.myRole==='owner' ? '' : ' (member)');
        if (g.id === curr) o.selected = true;
        select.appendChild(o);
      }
    }
    select.addEventListener('change', e=> {
      const val = e.target.value;
      if (typeof setCurrentGroupId === 'function') setCurrentGroupId(val);
      else localStorage.setItem('currentGroupId', val);
    });
    el.innerHTML = '';
    el.appendChild(select);
  }catch(e){ console.warn('[mountOwnerGroupSwitcher]', e); }
}
