import { state } from './state.js';
import { setupNotificationToggle, refreshNotifStatus } from './notifications.js';

const $panel   = document.getElementById('settings-panel');
const $overlay = document.getElementById('settings-overlay');

export function openSettings() {
  $panel.classList.add('open');
  $overlay.classList.add('open');
  history.pushState({ panel: 'settings' }, '');
  state.settingsPushedHistory = true;
  refreshNotifStatus();
}

export function closeSettingsUI() {
  $panel.classList.remove('open');
  $overlay.classList.remove('open');
}

export function closeSettings() {
  closeSettingsUI();
  if (state.settingsPushedHistory) {
    state.settingsPushedHistory = false;
    history.back();
  }
}

function setupPrefetchControl() {
  const ctrl = document.getElementById('prefetch-ctrl');
  const btns = ctrl.querySelectorAll('.seg-opt');
  const update = val => btns.forEach(b => b.classList.toggle('active', b.dataset.val === String(val)));
  update(state.prefetchSize);
  ctrl.addEventListener('click', e => {
    const btn = e.target.closest('.seg-opt');
    if (!btn) return;
    const val = parseInt(btn.dataset.val, 10);
    state.prefetchSize = val;
    localStorage.setItem('vc-prefetch-size', String(val));
    update(val);
  });
}

export function setupSettingsEvents() {
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  $overlay.addEventListener('click', closeSettings);
  setupNotificationToggle();
  setupPrefetchControl();
}
