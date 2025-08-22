
/*! ui-pager.v1.js
 * Lightweight pager helper for the two lists (สมาชิกทั้งหมด & ผู้มาเล่นวันนี้).
 * Usage:
 *   // 1) init state once
 *   window.Pager.state = { left: 1, right: 1, size: 15 };
 *
 *   // 2) in renderLeft():
 *   const pgL = Pager.paginate(filteredMembers, Pager.state.left, Pager.state.size);
 *   memberListEl.innerHTML = renderMemberRows(pgL.data);
 *   Pager.renderAfter(memberListEl, "memberPager",
 *     pgL.total, pgL.page, pgL.pages,
 *     (p)=>{ Pager.state.left = p; renderLeft(); });
 *
 *   // 3) in renderDay():
 *   const pgR = Pager.paginate(filteredDay, Pager.state.right, Pager.state.size);
 *   dayListEl.innerHTML = renderDayRows(pgR.data);
 *   Pager.renderAfter(dayListEl, "dayPager",
 *     pgR.total, pgR.page, pgR.pages,
 *     (p)=>{ Pager.state.right = p; renderDay(); });
 */
(function(){
  const Pager = {
    state: { left: 1, right: 1, size: 12 },

    paginate(arr, page, size){
      arr = Array.isArray(arr) ? arr : [];
      page = Math.max(1, parseInt(page||1, 10));
      size = Math.max(1, parseInt(size||12, 10));
      const total = arr.length;
      const pages = Math.max(1, Math.ceil(total/size));
      if (page > pages) page = pages;
      const start = (page-1)*size;
      const end = start + size;
      return { data: arr.slice(start, end), total, page, pages, start: start+1, end: Math.min(end, total) };
    },

    renderAfter(listEl, id, total, page, pages, onChange){
      if (!listEl || !listEl.parentNode) return;
      let host = document.getElementById(id);
      if (!host){
        host = document.createElement("div");
        host.id = id;
        listEl.after(host);
      }
      host.innerHTML = this._markup(total, page, pages);
      this._wire(host, page, pages, onChange);
    },

    _markup(total, page, pages){
      const prevDis = page<=1 ? " disabled" : "";
      const nextDis = page>=pages ? " disabled" : "";
      // show 5-page window around current
      const win = 2;
      const from = Math.max(1, page-win);
      const to = Math.min(pages, page+win);
      let nums = "";
      for (let p=from; p<=to; p++){
        nums += `<button class="btn btn-sm btn-outline-secondary me-1${p===page?' active':''}" data-page="${p}">${p}</button>`;
      }
      return `
<div class="pager-bar d-flex align-items-center justify-content-between mt-2">
  <div class="text-muted small">รวม ${total.toLocaleString()} รายการ</div>
  <div class="d-flex align-items-center">
    <button class="btn btn-sm btn-outline-secondary me-2${prevDis}" data-page="${page-1}" aria-label="Previous">&laquo;</button>
    ${nums}
    <button class="btn btn-sm btn-outline-secondary ms-1${nextDis}" data-page="${page+1}" aria-label="Next">&raquo;</button>
  </div>
</div>`;
    },

    _wire(host, page, pages, onChange){
      host.querySelectorAll("[data-page]").forEach(btn => {
        btn.addEventListener("click", (e)=>{
          const p = parseInt(btn.getAttribute("data-page"), 10);
          if (!isFinite(p) || p<1 || p>pages || p===page) return;
          if (typeof onChange === "function") onChange(p);
        }, { once: true });
      });
    }
  };

  window.Pager = Pager;
})();
