// debug.js — tiny diagnostics to confirm Firebase wiring
(function(){
  function log(){ try{ console.log.apply(console, arguments); }catch(e){} }
  window.__diag = {
    check: async function(){
      log('[diag] DB present?', !!window.DB);
      if (!window.DB){ alert('DB is not defined. Check firebase-config.js and firebase.js order.'); return; }
      if (window.__AUTH_READY__) await window.__AUTH_READY__;
      try {
        const list = await DB.getMembers();
        log('[diag] getMembers OK, count=', list.length);
        alert('Firebase OK! Members: ' + list.length);
      } catch(e){
        console.error('[diag] getMembers failed', e);
        alert('getMembers failed: ' + (e && e.message || e));
      }
    },
    add: async function(name){
      if (window.__AUTH_READY__) await window.__AUTH_READY__;
      const id = await DB.addMember({ name:name||('ทดสอบ ' + Date.now()), level:3, status:'active' });
      alert('Added member id=' + id);
    }
  };
})();