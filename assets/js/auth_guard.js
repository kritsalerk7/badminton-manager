// assets/js/auth_guard.js
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

if (!window.__FBAPP__) {
  window.__FBAPP__ = initializeApp(window.FIREBASE_CONFIG);
}

const auth = getAuth();

export function requireAuth(redirectTo='login.html'){
  onAuthStateChanged(auth, (user)=>{
    if(!user){
      location.replace(redirectTo);
    }
  });
}

export function getCurrentUser(){
  return auth.currentUser;
}

export async function doSignOut(){
  await signOut(auth);
}
