
import { saveGameToStorage, getGamesByDate } from './game.js';

let signedPlayers = [];
let selectedDate = '';

export function initCourtSystem() {
  selectedDate = document.getElementById('court-date').value = new Date().toISOString().split('T')[0];
  loadSignedPlayers();
  renderSignedPlayers();
  document.getElementById('add-guest-btn').addEventListener('click', addGuestPlayer);
  document.getElementById('randomize-btn').addEventListener('click', randomizeToCourt);
  document.getElementById('save-game-btn').addEventListener('click', saveCurrentGame);
}

function loadSignedPlayers() {
  const data = localStorage.getItem('signedPlayers-' + selectedDate);
  signedPlayers = data ? JSON.parse(data) : [];
}

function saveSignedPlayers() {
  localStorage.setItem('signedPlayers-' + selectedDate, JSON.stringify(signedPlayers));
}

function renderSignedPlayers() {
  const list = document.getElementById('signed-players');
  list.innerHTML = '';
  signedPlayers.forEach((player, i) => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = \`
      <span>\${player.name}</span>
      <div>
        <button class="btn btn-sm btn-outline-success me-1" onclick="toggleArrived(\${i})">
          \${player.arrived ? 'มาแล้ว' : 'ยังไม่มา'}
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="removePlayer(\${i})">ลบ</button>
      </div>
    \`;
    list.appendChild(li);
  });
  saveSignedPlayers();
}

function addGuestPlayer() {
  const name = prompt('ใส่ชื่อผู้เล่นอิสระ');
  if (!name) return;
  signedPlayers.push({ name, arrived: false });
  renderSignedPlayers();
}

window.toggleArrived = function (index) {
  signedPlayers[index].arrived = !signedPlayers[index].arrived;
  renderSignedPlayers();
};

window.removePlayer = function (index) {
  signedPlayers.splice(index, 1);
  renderSignedPlayers();
};

function randomizeToCourt() {
  const arrivedPlayers = signedPlayers.filter(p => p.arrived);
  if (arrivedPlayers.length < 4) {
    alert('ต้องมีผู้เล่นที่ "มาแล้ว" อย่างน้อย 4 คน');
    return;
  }

  const shuffled = arrivedPlayers.sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, 4);
  const courtArea = document.getElementById('court-container');
  courtArea.innerHTML = \`
    <div class="card">
      <div class="card-header">คอร์ท 1</div>
      <div class="card-body">
        <div class="row">
          <div class="col"><strong>ทีม A</strong><br>\${selected[0].name}<br>\${selected[1].name}</div>
          <div class="col"><strong>ทีม B</strong><br>\${selected[2].name}<br>\${selected[3].name}</div>
        </div>
      </div>
    </div>
  \`;

  // store temp selected for saving
  window.currentGame = {
    date: selectedDate,
    court: 1,
    players: selected.map(p => p.name),
    start: new Date().toISOString()
  };
}

function saveCurrentGame() {
  if (!window.currentGame) return alert('ยังไม่มีเกมที่สร้าง');
  window.currentGame.end = new Date().toISOString();
  saveGameToStorage(window.currentGame);
  alert('บันทึกเกมเรียบร้อย');
  document.getElementById('court-container').innerHTML = '';
  delete window.currentGame;
}
