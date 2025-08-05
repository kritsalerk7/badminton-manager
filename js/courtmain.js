
import { initCourtSystem } from './modules/court.js';

window.addEventListener('DOMContentLoaded', () => {
  initCourtSystem();

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.getAttribute('data-target');
      document.querySelectorAll('.section-block').forEach(sec => sec.classList.add('d-none'));
      document.getElementById(target).classList.remove('d-none');
    });
  });
});
