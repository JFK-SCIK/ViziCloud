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

  albumName: '',

  lbIndex: -1,
  lbPushedHistory: false,
  lbSuppressNextPopstate: false,

  touchStartX: 0,
  touchIsZoom: false,
  lbWasSwipe: false,

  settingsPushedHistory: false,
};
