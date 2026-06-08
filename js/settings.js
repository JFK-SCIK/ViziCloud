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

export function setupSettingsEvents() {
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  $overlay.addEventListener('click', closeSettings);
  setupNotificationToggle();
}
