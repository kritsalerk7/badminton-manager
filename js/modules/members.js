
let members = JSON.parse(localStorage.getItem('members')) || [];

export function initMembers() {
  const form = document.getElementById('member-form');
  form?.addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('member-name').value.trim();
    const level = document.getElementById('member-level').value;
    if (!name) return;
    members.push({ id: Date.now(), name, level });
    localStorage.setItem('members', JSON.stringify(members));
    form.reset();
    renderMemberList();
  });

  document.getElementById('edit-member-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const id = +document.getElementById('edit-member-id').value;
    const name = document.getElementById('edit-member-name').value.trim();
    const level = document.getElementById('edit-member-level').value;
    const m = members.find(mem => mem.id === id);
    if (m) {
      m.name = name;
      m.level = level;
      localStorage.setItem('members', JSON.stringify(members));
      renderMemberList();
      bootstrap.Modal.getInstance(document.getElementById('editMemberModal')).hide();
    }
  });

  renderMemberList();
}

function renderMemberList() {
	document.getElementById('member-count').textContent = members.length;

  if ($.fn.DataTable.isDataTable('#member-table')) {
    $('#member-table').DataTable().destroy();
  }

  const tbody = document.getElementById('member-table-body');
  tbody.innerHTML = '';

  members.forEach(mem => {
    let levelIcon = '';
    switch (mem.level) {
      case 'หนัก': levelIcon = '🐯'; break;
      case 'กลาง': levelIcon = '🐶'; break;
      case 'เบา': levelIcon = '🐰'; break;
      case 'มือใหม่': levelIcon = '🐢'; break;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td></td>
      <td>${mem.name}</td>
      <td data-search="${mem.level}">
        <span aria-hidden="true">${levelIcon}</span> ${mem.level}
      </td>
      <td>
        <button class="btn btn-sm btn-warning me-2" onclick="window.editMember(${mem.id})">แก้ไข</button>
        <button class="btn btn-sm btn-danger" onclick="window.deleteMember(${mem.id})">ลบ</button>
      </td>`;
    tbody.appendChild(tr);
  });

  $('#member-table').DataTable({
    language: {
      url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/th.json'
    },
    pageLength: 25,
    columnDefs: [{
      targets: 0,
      searchable: false,
      orderable: false
    }],
    order: [[1, 'asc']],
    drawCallback: function () {
      const api = this.api();
      const pageInfo = api.page.info();
      api.column(0, { page: 'current' }).nodes().each((cell, i) => {
        cell.innerHTML = pageInfo.start + i + 1;
      });
    }
  });
  
  renderAlphaPagination();
}




function renderAlphaPagination() {
  const container = document.getElementById('alpha-pagination');
  container.innerHTML = '';

  const letters = 'กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const table = $('#member-table').DataTable();

  let row = document.createElement('div');
  row.className = 'd-flex flex-wrap gap-2 mb-2';

  letters.forEach((letter, index) => {
    const btn = document.createElement('button');
    btn.textContent = letter;
    btn.className = 'btn btn-outline-secondary btn-sm';
    btn.onclick = () => {
      table.column(1).search('^' + letter, true, false).draw();
    };
    row.appendChild(btn);

    // แบ่งแถวใหม่ทุก 30 ตัว
    if ((index + 1) % 30 === 0 || index === letters.length - 1) {
      container.appendChild(row);
      row = document.createElement('div');
      row.className = 'd-flex flex-wrap gap-2 mb-2';
    }
  });

  // ปุ่ม "แสดงทั้งหมด"
  const allBtn = document.createElement('button');
  allBtn.textContent = 'แสดงทั้งหมด';
  allBtn.className = 'btn btn-primary btn-sm ms-2';
  allBtn.onclick = () => {
    table.column(1).search('').draw();
  };

  const finalRow = document.createElement('div');
  finalRow.className = 'mt-2';
  finalRow.appendChild(allBtn);
  container.appendChild(finalRow);
}


  

window.editMember = function(id) {
  const mem = members.find(m => m.id === id);
  if (mem) {
    document.getElementById('edit-member-id').value = mem.id;
    document.getElementById('edit-member-name').value = mem.name;
    document.getElementById('edit-member-level').value = mem.level;
    new bootstrap.Modal(document.getElementById('editMemberModal')).show();
  }
};

window.deleteMember = function(id) {
  if (confirm('ต้องการลบสมาชิกใช่หรือไม่?')) {
    members = members.filter(m => m.id !== id);
    localStorage.setItem('members', JSON.stringify(members));
    renderMemberList();
  }
};
