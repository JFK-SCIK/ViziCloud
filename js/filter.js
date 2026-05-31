import { state } from './state.js';
import { toDate } from './ui.js';
import { appendBatch } from './gallery.js';

const $gallery    = document.getElementById('gallery');
const $countBadge = document.getElementById('count-badge');

function photoMonthKey(p) {
  const d = toDate(p.dateCreated);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function applyFilter() {
  const { contributors, years } = state.activeFilters;
  const hasFilter = contributors.size || years.size;

  state.filteredPhotos = hasFilter
    ? state.allPhotos.filter(p => {
        if (contributors.size && !contributors.has(p.contributorFullName || '—')) return false;
        if (years.size && !years.has(photoMonthKey(p))) return false;
        return true;
      })
    : state.allPhotos;

  const n = state.filteredPhotos.length;
  $countBadge.textContent = `${n} photo${n > 1 ? 's' : ''}${hasFilter ? ' (filtrées)' : ''}`;
  document.getElementById('settings-btn').classList.toggle('filter-on', !!hasFilter);
  document.getElementById('filter-clear').disabled = !hasFilter;

  $gallery.innerHTML = '';
  state.loadedCount = 0;

  if (n === 0) {
    $gallery.innerHTML = '<div class="empty-state"><h2>Aucune photo</h2><p>Aucun résultat pour ce filtre.</p></div>';
    return;
  }
  appendBatch();
}

export function buildFilterUI() {
  let anyVisible = false;

  function attachChips($el, activeSet) {
    $el.addEventListener('click', e => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      const val = chip.dataset.val;
      if (activeSet.has(val)) activeSet.delete(val);
      else activeSet.add(val);
      $el.querySelectorAll('.filter-chip').forEach(c =>
        c.classList.toggle('active', activeSet.has(c.dataset.val))
      );
      applyFilter();
    });
  }

  function buildSection(groupId, chipsId, items, activeSet) {
    if (items.length <= 1) return;
    anyVisible = true;
    document.getElementById(groupId).style.display = '';
    const $el = document.getElementById(chipsId);
    $el.innerHTML = items.map(([label, count]) =>
      `<button class="filter-chip" data-val="${String(label).replace(/"/g, '&quot;')}">${label} <span class="filter-chip-count">${count}</span></button>`
    ).join('');
    attachChips($el, activeSet);
  }

  // Contributeurs
  const cCounts = {};
  state.allPhotos.forEach(p => {
    const n = p.contributorFullName || '—';
    cCounts[n] = (cCounts[n] || 0) + 1;
  });
  buildSection('contrib-group', 'contrib-chips',
    Object.entries(cCounts).sort((a, b) => a[0].localeCompare(b[0])),
    state.activeFilters.contributors);

  // Mois + Année (data-val = clé YYYY-MM, label = "jan. 2025")
  const mCounts = {};
  state.allPhotos.forEach(p => {
    const key = photoMonthKey(p);
    if (key) mCounts[key] = (mCounts[key] || 0) + 1;
  });
  const monthItems = Object.entries(mCounts)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, count]) => {
      const [y, m] = key.split('-');
      const label  = new Date(+y, +m - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
      return [key, count, label];
    });

  if (monthItems.length >= 1) {
    anyVisible = true;
    document.getElementById('year-group').style.display = '';
    const $el = document.getElementById('year-chips');
    $el.innerHTML = monthItems.map(([key, count, label]) =>
      `<button class="filter-chip" data-val="${key}">${label} <span class="filter-chip-count">${count}</span></button>`
    ).join('');
    if (monthItems.length > 1) attachChips($el, state.activeFilters.years);
  }

  if (!anyVisible) return;
  document.getElementById('filter-section').style.display = '';
  document.getElementById('filter-clear').addEventListener('click', () => {
    state.activeFilters.contributors.clear();
    state.activeFilters.years.clear();
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    applyFilter();
  });
}
