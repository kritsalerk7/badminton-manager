
// เชื่อมต่อ Google Sheets API
const SHEET_API_URL = "https://script.google.com/macros/s/AKfycbxO1HlXtUH3_Dk1KLtgqJyNVx0j5sNmbPjs-Ap4auuVNaBivTZRP8yYjvuuWOV0HWT5Gg/exec";

// เพิ่มสมาชิกใหม่
export function addMember(name) {
    fetch(SHEET_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, status: "มาแล้ว" })
    })
    .then(res => res.text())
    .then(data => {
        alert("เพิ่มสมาชิกเรียบร้อย");
        loadMembers();
    });
}

// โหลดรายชื่อสมาชิก
export function loadMembers() {
    fetch(SHEET_API_URL)
        .then(res => res.json())
        .then(data => {
            const list = document.getElementById("memberList");
            list.innerHTML = "";
            data.forEach(member => {
                const li = document.createElement("li");
                li.textContent = member.name + " (" + member.status + ")";
                list.appendChild(li);
            });
        });
}
