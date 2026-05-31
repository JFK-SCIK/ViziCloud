export const state = {
  TOKEN: '',
  apiBase: '',

  allPhotos: [],
  filteredPhotos: [],
  urlCache: {},

  activeFilters: {
    contributors: new Set(),
    years: new Set(),
  },

  loadedCount: 0,
  isLoadingBatch: false,

  lbIndex: -1,
  lbPushedHistory: false,

  touchStartX: 0,
  touchIsZoom: false,

  settingsPushedHistory: false,
};
