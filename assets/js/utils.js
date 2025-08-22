// utils.js (helpers)
window.Utils = (() => {
  function escapeHtml(str = "") {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function uid() {
    return "m_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { console.warn("load failed", e); return fallback; }
  }
  function save(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); }
    catch (e) { console.warn("save failed", e); }
  }
  function todayKeyFrom(dateStr, prefix="bm_day_"){
    return prefix + dateStr; // YYYY-MM-DD
  }
  function formatThaiDate(dateStr){
    const d = new Date(dateStr);
    return d.toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' });
  }
  function monthThai(ym){ // ym: 'YYYY-MM'
    const [y,m] = ym.split('-').map(s=>parseInt(s,10));
    const d = new Date(y, m-1, 1);
    return d.toLocaleDateString('th-TH', { year:'numeric', month:'long' });
  }
  return { escapeHtml, uid, load, save, todayKeyFrom, formatThaiDate, monthThai };
})();