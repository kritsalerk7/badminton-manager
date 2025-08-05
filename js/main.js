
import { initMembers } from './modules/members.js';


document.addEventListener('DOMContentLoaded', () => {
  initMembers();
  //initCourtSystem();
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const target = link.dataset.target;
	  

      document.querySelectorAll('.section').forEach(sec => sec.classList.add('d-none'));
      document.getElementById(target).classList.remove('d-none');
    });
  });
});
