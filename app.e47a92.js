// ═══════════════════════════════════════════════════════════
// MediHome — Medicine Inventory Management
// ═══════════════════════════════════════════════════════════

let medicines = [];
let editingId = null;
let searchTimeout = null;
let activeFilter = 'all';   // 'all' | 'low' | 'expiring' | 'expired'
let sortOrder = 'expiry';   // 'expiry' | 'name' | 'quantity' | 'added'
let compactView = false;

// Dynamic lists — seeded from data, then user-editable via gear icons
let customCategories = [];
let customForms = [];
let customOwners = [];      // [{key, label, short}]
let customTypes = [];
let healthDiary = [];       // current branch's health diary entries
let currentHealthOwner = null; // which owner tab is selected in the Health Diary modal
let quantityLog = [];       // current branch's log of add/delete/increase/decrease (last 20)
let editingHealthEntryId = null; // set while editing an existing entry
let currentMgmtField = '';  // 'category' | 'owner' | 'form' | 'type' — which manage modal is open

// ── Branches ("houses") ─────────────────────────────────────
// Each branch is a fully independent set of medicines/categories/forms/owners/types.
// `medicines`/`customCategories`/etc. above always mirror the *active* branch —
// every other function in this file keeps working unmodified.
let branches = {};            // { branchId: { name, medicines, categories, forms, owners, types } }
let branchOrder = [];         // display order of branch IDs
let activeBranchId = null;    // branch currently loaded into medicines/customX
let defaultBranchId = null;   // branch that auto-loads on every refresh
let _branchInitialized = false; // true once the first real page load has run

// Units that are countable → auto low-stock
const COUNTABLE_UNITS = ['tablets','tablet','pieces','piece','pouches','pouch','capsules','capsule','lozenges','lozenge'];
// Thresholds for auto low-stock by unit type
const LOW_THRESHOLDS = { tablets:5, tablet:5, pieces:3, piece:3, pouches:2, pouch:2, capsules:5, capsule:5, lozenges:3, lozenge:3 };

// Fallback defaults used only if a deleted category/form/owner/type needs somewhere to land
const FALLBACK_CATEGORY = 'Debility & Wellness';
const FALLBACK_FORM = 'Edible Drops';
const FALLBACK_OWNER = 'shared';
const FALLBACK_TYPE = 'homeopathic';

const DEFAULT_OWNERS = [
  { key:'shared', label:"👨‍👩‍👧 Family — Shared by All", short:'👨‍👩‍👧 Family' },
  { key:'babita', label:"👩 Mumma's Medicines",            short:'👩 Mumma'  },
  { key:'shivam', label:"👦 Shivam's Medicines",            short:'👦 Shivam' }
];
const DEFAULT_CATEGORIES = [
  'Fever, Cold & Cough Care','Mouth Ulcer Care','Pain Relief & Injury Care',
  'Digestion, Gut Health & Hydration','Allergies & Infections',"Uterus & Women's Health",
  'Eye Care','Jaw Pain Care','Hair & Nail Health','Cold & Cough Care',
  'Gut & Appetite Care','Hair Care','Debility & Wellness'
];
const DEFAULT_FORMS = [
  'Eye Drops','Drops','Edible Drops','Tablets','Chewable Tablets','Cream','Ointment',
  'Gel/Liquid','Tonic','Bandage','Rehydration Pouch','Candy/Lozenges','Hair Oil',
];
const DEFAULT_TYPES = ['homeopathic','allopathic','ayurvedic'];

// ── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  initScrollFeatures();
  setHeaderHeightVar();
  initImageDropZone();
  // Restore persisted compact view and sort order
  if (localStorage.getItem('compactView') === 'true') {
    compactView = true;
    document.body.classList.add('compact-view');
  }
  const savedSort = localStorage.getItem('sortOrder');
  if (savedSort) {
    sortOrder = savedSort;
  }
  updateSortLabel();
  initAuthGate(); // shows login screen if signed out; calls loadData() once signed in
});

// Keep stats bar exactly flush under the header at all times
function setHeaderHeightVar() {
  const h = document.querySelector('.site-header');
  const s = document.querySelector('.stats-bar');
  if (!h) return;
  const update = () => {
    document.documentElement.style.setProperty('--header-h', h.offsetHeight + 'px');
    if (s) document.documentElement.style.setProperty('--stats-h', s.offsetHeight + 'px');
  };
  update();
  new ResizeObserver(update).observe(h);
  if (s) new ResizeObserver(update).observe(s);
  window.addEventListener('resize', update, { passive: true });
}

// ── Authentication ───────────────────────────────────────
let _dataLoadedOnce = false;

function initAuthGate() {
  window._fbAuth.onChange((user) => {
    const loginScreen = document.getElementById('loginScreen');
    const submitBtn = document.getElementById('loginSubmitBtn');
    if (user) {
      if (loginScreen) loginScreen.classList.add('hidden');
      document.body.classList.remove('login-locked');
      if (submitBtn) submitBtn.classList.remove('btn-loading');
      if (!_dataLoadedOnce) {
        _dataLoadedOnce = true;
        loadData(); // Firebase listener triggers renderAll() when data arrives
      }
    } else {
      _dataLoadedOnce = false;
      medicines = [];
      const list = document.getElementById('medicineList');
      if (list) list.innerHTML = '';
      if (loginScreen) loginScreen.classList.remove('hidden');
      document.body.classList.add('login-locked');
      const passEl = document.getElementById('loginPassword');
      if (passEl) passEl.value = '';
    }
  });
}

function handleLogin(e) {
  e.preventDefault();
  const emailEl = document.getElementById('loginEmail');
  const passEl = document.getElementById('loginPassword');
  const rememberEl = document.getElementById('loginRemember');
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('loginSubmitBtn');
  const email = (emailEl.value || '').trim();
  const password = passEl.value || '';

  if (!email || !password) {
    showLoginError('Please enter both email and password.');
    return;
  }

  errorEl.classList.add('hidden');
  btn.disabled = true;
  btn.classList.add('btn-loading');

  window._fbAuth
    .login(email, password, rememberEl.checked)
    .catch((err) => {
      console.error('Login failed:', err);
      showLoginError(friendlyAuthError(err));
      btn.disabled = false;
      btn.classList.remove('btn-loading');
    });
  // On success, initAuthGate()'s onChange listener takes over (hides screen, loads data).
}

function showLoginError(msg) {
  const errorEl = document.getElementById('loginError');
  if (!errorEl) return;
  errorEl.textContent = msg || 'Could not sign in. Please try again.';
  errorEl.classList.remove('hidden');
}

function friendlyAuthError(err) {
  const code = err && err.code;
  const map = {
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/user-not-found': 'Incorrect email or password.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/invalid-login-credentials': 'Incorrect email or password.',
    'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
    'auth/network-request-failed': 'Network error — check your connection.',
  };
  return (code && map[code]) || 'Could not sign in. Please try again.';
}

function confirmLogout() {
  if (confirm('Log out of MediHome on this device?')) logout();
}

function logout() {
  window._fbAuth.logout();
}

function loadData() {
  // Show loading state
  document.getElementById('medicineList').innerHTML =
    '<div class="empty-state"><div class="loading-spinner" role="status" aria-label="Loading"></div><p>Loading from cloud…</p></div>';

  window._fbListen(data => {
    let needsMigrationSave = false;

    if (data && data.branches && typeof data.branches === 'object' && Object.keys(data.branches).length) {
      // Current shape: multiple branches
      branches = data.branches;
      branchOrder = (data.branchOrder && data.branchOrder.length)
        ? data.branchOrder.filter(id => branches[id])
        : Object.keys(branches);
      // Include any branch present in `branches` but missing from the order list
      const missingFromOrder = Object.keys(branches).filter(id => !branchOrder.includes(id));
      if (missingFromOrder.length) { branchOrder.push(...missingFromOrder); needsMigrationSave = true; }
      if (!data.defaultBranchId || !branches[data.defaultBranchId]) needsMigrationSave = true;
      defaultBranchId = (data.defaultBranchId && branches[data.defaultBranchId]) ? data.defaultBranchId : branchOrder[0];
    } else if (data && data.medicines && Array.isArray(data.medicines)) {
      // Pre-branches shape: { medicines:[...], categories:[...], forms:[...], owners:[...] }
      // Migrate the existing data into a single "Home" branch so nothing is lost.
      const id = 'home';
      branches = { [id]: {
        name: 'Home',
        medicines: data.medicines,
        categories: (data.categories && data.categories.length) ? data.categories : DEFAULT_CATEGORIES.slice(),
        forms:      (data.forms && data.forms.length) ? data.forms : DEFAULT_FORMS.slice(),
        owners:     (data.owners && data.owners.length) ? data.owners : DEFAULT_OWNERS.slice(),
        types:      (data.types && data.types.length) ? data.types : DEFAULT_TYPES.slice()
      }};
      branchOrder = [id];
      defaultBranchId = id;
      needsMigrationSave = true;
    } else if (data && Array.isArray(data) && data.length > 0) {
      // Legacy shape: plain array of medicines (old saves)
      const id = 'home';
      branches = { [id]: {
        name: 'Home', medicines: data,
        categories: DEFAULT_CATEGORIES.slice(), forms: DEFAULT_FORMS.slice(),
        owners: DEFAULT_OWNERS.slice(), types: DEFAULT_TYPES.slice()
      }};
      branchOrder = [id];
      defaultBranchId = id;
      needsMigrationSave = true;
    } else {
      // First time ever — seed with defaults
      const id = 'home';
      branches = { [id]: {
        name: 'Home', medicines: JSON.parse(JSON.stringify(MEDICINE_DB)),
        categories: DEFAULT_CATEGORIES.slice(), forms: DEFAULT_FORMS.slice(),
        owners: DEFAULT_OWNERS.slice(), types: DEFAULT_TYPES.slice()
      }};
      branchOrder = [id];
      defaultBranchId = id;
      needsMigrationSave = true;
    }

    // Only jump to the default/home branch on the very FIRST load of this
    // session (a real page refresh). This same listener re-fires on every
    // subsequent save too (since saving writes back to this same data), and
    // if we reset activeBranchId every time, saving a medicine while working
    // on a non-default branch would silently yank you back to the default
    // branch mid-edit. Refresh = reset to default; saving = stay put.
    if (!_branchInitialized) {
      activeBranchId = defaultBranchId;
      _branchInitialized = true;
    } else if (!branches[activeBranchId]) {
      // Edge case: the branch we were on got deleted from elsewhere — fall
      // back to default rather than pointing at a branch that no longer exists.
      activeBranchId = defaultBranchId;
    }
    loadActiveBranchIntoState();
    // Only write back when the shape actually needed migrating/seeding —
    // avoids an unnecessary save (and possible listener feedback loop) on every normal load.
    if (needsMigrationSave) saveAllBranches();
  });
}

// Copies the active branch's data into the working variables that the rest
// of the app reads/writes (medicines, customCategories, etc.), then re-renders.
function loadActiveBranchIntoState() {
  const b = branches[activeBranchId];
  if (!b) return;
  medicines        = b.medicines || [];
  customCategories = (b.categories && b.categories.length) ? b.categories : DEFAULT_CATEGORIES.slice();
  customForms      = (b.forms && b.forms.length) ? b.forms : DEFAULT_FORMS.slice();
  customOwners     = (b.owners && b.owners.length) ? b.owners : DEFAULT_OWNERS.slice();
  customTypes      = (b.types && b.types.length) ? b.types : DEFAULT_TYPES.slice();
  healthDiary      = b.healthDiary || [];
  quantityLog      = b.quantityLog || [];
  // Only clear the selected tab if it's genuinely no longer valid (e.g. we
  // just switched branches, or that owner was deleted) — NOT on every sync,
  // since this same function re-runs after every save (including our own),
  // and blindly nulling it out here left the modal one refresh away from
  // going blank right after adding/editing an entry.
  if (currentHealthOwner && !(b.owners || []).some(o => o.key === currentHealthOwner)) {
    currentHealthOwner = null;
  }

  reconcileDynamicLists();
  backfillSerialIds();
  populateAllDropdowns();
  renderOwnerNavChips();
  renderAll();
  updateStats();
  updateMenuBranchLabel();

  // Keep the Health Diary modal in sync with the authoritative data too,
  // if it happens to be open.
  const healthModal = document.getElementById('healthDiaryModal');
  if (healthModal && !healthModal.classList.contains('hidden')) {
    renderHealthOwnerTabs();
    renderHealthDiaryList();
  }
  const qtyModal = document.getElementById('quantityLogModal');
  if (qtyModal && !qtyModal.classList.contains('hidden')) renderQuantityLogList();
}

// Serial ID helpers — user-assignable medicine numbers (separate from internal m.id)
function nextAvailableSerialId() {
  const used = new Set(medicines.map(m => Number(m.serialId)).filter(n => !isNaN(n)));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}
function backfillSerialIds() {
  medicines.forEach((m, idx) => {
    if (m.serialId === undefined || m.serialId === null || m.serialId === '') {
      m.serialId = idx + 1;
    }
  });
}

// Live validation for the ID field: blocks Save (and shows an inline error)
// while a duplicate is entered, instead of silently reassigning a different ID.
function validateSerialIdField() {
  const input = document.getElementById('medSerialId');
  const errorEl = document.getElementById('medSerialIdError');
  const saveBtn = document.getElementById('saveBtn');
  const val = input.value.trim();

  let isDupe = false;
  if (val !== '') {
    const num = parseInt(val, 10);
    isDupe = !isNaN(num) && medicines.some(m => m.serialId === num && m.id !== editingId);
  }

  if (isDupe) {
    errorEl.textContent = `ID ${val} is already in use — choose another or clear the field for auto-assign.`;
    errorEl.classList.remove('hidden');
    input.classList.add('input-error');
    saveBtn.disabled = true;
  } else {
    errorEl.classList.add('hidden');
    input.classList.remove('input-error');
    saveBtn.disabled = false;
  }
  return !isDupe;
}

// Make sure every category/form/owner actually used by a medicine exists in its list
function reconcileDynamicLists() {
  const catSet = new Set(customCategories);
  const formSet = new Set(customForms);
  const typeSet = new Set(customTypes);
  const ownerKeys = new Set(customOwners.map(o => o.key));

  medicines.forEach(m => {
    if (m.category && !catSet.has(m.category)) { catSet.add(m.category); customCategories.push(m.category); }
    if (m.form && !formSet.has(m.form)) { formSet.add(m.form); customForms.push(m.form); }
    if (m.type && !typeSet.has(m.type)) { typeSet.add(m.type); customTypes.push(m.type); }
    if (m.owner && !ownerKeys.has(m.owner)) {
      ownerKeys.add(m.owner);
      customOwners.push({ key: m.owner, label: m.owner.charAt(0).toUpperCase() + m.owner.slice(1) + "'s Medicines", short: m.owner.charAt(0).toUpperCase() + m.owner.slice(1) });
    }
  });
}

function saveData() {
  if (!activeBranchId || !branches[activeBranchId]) return;
  branches[activeBranchId].medicines   = medicines;
  branches[activeBranchId].categories  = customCategories;
  branches[activeBranchId].forms       = customForms;
  branches[activeBranchId].owners      = customOwners;
  branches[activeBranchId].types       = customTypes;
  branches[activeBranchId].healthDiary = healthDiary;
  branches[activeBranchId].quantityLog = quantityLog;
  saveAllBranches();
}

function saveAllBranches() {
  const payload = { branches, branchOrder, defaultBranchId };
  window._fbSet(payload).catch(err => {
    showToast('Cloud save failed — check connection.', 'error');
    console.error(err);
  });
}

function resetToDefault() {
  if (confirm('Empty the entire medicine database? All medicines will be deleted. This cannot be undone.')) {
    medicines = [];
    saveData();
    populateAllDropdowns();
    renderOwnerNavChips();
    renderAll();
    showToast('Database emptied.', 'info');
  }
}

// ── Auto low-stock logic ──────────────────────────────────
function isCountableUnit(unit) {
  return COUNTABLE_UNITS.includes((unit || '').toLowerCase().trim());
}
function autoIsLow(m) {
  if (!isCountableUnit(m.quantityUnit)) return false; // bottles/tubes: manual only
  const threshold = LOW_THRESHOLDS[(m.quantityUnit || '').toLowerCase().trim()] || 3;
  return m.quantity <= threshold;
}
function effectiveLowStock(m) {
  if (isCountableUnit(m.quantityUnit)) return autoIsLow(m) || m.quantity === 0;
  return m.lowStock || m.quantity === 0;
}

// ── Render ────────────────────────────────────────────────
function renderAll() {
  // Never called while search is active — search has its own render path
  if (searchMode) return;
  const base = getFilteredMedicines();
  renderReorderAlert(base);
  renderMedicineList(base);
  updateStats();
}

function getFilteredMedicines() {
  if (activeFilter === 'all') return medicines;
  if (activeFilter === 'low')      return medicines.filter(m => effectiveLowStock(m));
  if (activeFilter === 'expiring') return medicines.filter(m => isExpiringSoonMed(m.expiryDate) && !isExpiredMed(m.expiryDate));
  if (activeFilter === 'expired')  return medicines.filter(m => isExpiredMed(m.expiryDate));
  return medicines;
}

function setFilter(type, btn) {
  // Clicking the already-active chip again clears the filter back to 'all'
  if (type !== 'all' && activeFilter === type) {
    type = 'all';
    btn = document.querySelector('.stat-chip.total');
  }
  activeFilter = type;
  // Update active chip UI
  document.querySelectorAll('.stat-chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');

  // Update filter label bar
  const bar = document.getElementById('activeFilterBar');
  const label = document.getElementById('activeFilterLabel');
  const iconEl = document.getElementById('activeFilterIcon');
  if (type === 'all') {
    bar.classList.add('hidden');
  } else {
    const labels = {
      low:      { icon: 'fa-triangle-exclamation', text: 'Showing: Low Stock / Finished' },
      expiring: { icon: 'fa-hourglass-half',        text: 'Showing: Expiring Within 6 Months' },
      expired:  { icon: 'fa-ban',                   text: 'Showing: Expired Medicines' }
    };
    const cfg = labels[type];
    if (cfg) {
      label.textContent = cfg.text;
      if (iconEl) iconEl.className = `fa-solid ${cfg.icon}`;
    } else {
      label.textContent = '';
    }
    bar.classList.remove('hidden');
  }

  // Clear search when filter changes
  clearSearchState();
  renderAll();
}

function renderReorderAlert(list) {
  const lowItems = list.filter(m => effectiveLowStock(m));
  const container = document.getElementById('reorderSection');
  if (lowItems.length === 0) { container.classList.add('hidden'); return; }
  container.classList.remove('hidden');
  document.getElementById('reorderCount').textContent = lowItems.length;
  document.getElementById('reorderGrid').innerHTML = lowItems.map(m => `
    <div class="reorder-card" onclick="scrollToMedicine('${m.id}')">
      <div class="reorder-icon">${getFormIcon(m.form)}</div>
      <div class="reorder-info">
        <div class="reorder-name">${m.name}</div>
        <div class="reorder-meta">
          ${ownerLabel(m.owner)} · ${m.quantity === 0 ? '<span class="badge-critical">Finished</span>' : `${m.quantity} ${m.quantityUnit} left`}
        </div>
      </div>
    </div>`).join('');
}

function sortMeds(arr) {
  const copy = arr.slice();
  if (sortOrder === 'name') {
    copy.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortOrder === 'quantity') {
    copy.sort((a, b) => b.quantity - a.quantity); // High → Low
  } else if (sortOrder === 'added') {
    // higher index in original medicines array = added later
    copy.sort((a, b) => medicines.indexOf(b) - medicines.indexOf(a));
  } else {
    // default: expiry
    copy.sort((a, b) => {
      if (!a.expiryDate && !b.expiryDate) return 0;
      if (!a.expiryDate) return 1; if (!b.expiryDate) return -1;
      return new Date(a.expiryDate) - new Date(b.expiryDate);
    });
  }
  return copy;
}

function renderMedicineList(list) {
  const container = document.getElementById('medicineList');
  const ownerOrder = customOwners.map(o => o.key);
  const groups = {};

  ownerOrder.forEach(owner => {
    const ownerMeds = list.filter(m => m.owner === owner);
    if (!ownerMeds.length) return;
    const catMap = {};
    ownerMeds.forEach(m => {
      if (!catMap[m.category]) catMap[m.category] = [];
      catMap[m.category].push(m);
    });
    Object.keys(catMap).forEach(cat => {
      catMap[cat] = sortMeds(catMap[cat]);
    });
    const ownerCfg = customOwners.find(o => o.key === owner);
    groups[owner] = { name: ownerCfg ? ownerCfg.label : owner, categories: catMap };
  });

  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div><p>No medicines found. Try different keywords.</p></div>`;
    return;
  }

  container.innerHTML = ownerOrder.map(owner => {
    if (!groups[owner]) return '';
    const g = groups[owner];
    return `
      <div class="owner-section" id="owner-${owner}">
        <div class="owner-header">
          <h2 class="owner-title">${g.name}</h2>
          <span class="owner-count">${list.filter(m=>m.owner===owner).length} medicines</span>
        </div>
        ${Object.entries(g.categories).map(([cat,meds]) => `
          <div class="category-group">
            <div class="category-label">${getCategoryIcon(cat)}${cat}</div>
            <div class="medicine-grid">${meds.map(m => renderMedicineCard(m, m.serialId != null ? m.serialId : (medicines.indexOf(m) + 1))).join('')}</div>
          </div>`).join('')}
      </div>`;
  }).join('');
  initCardRevealObserver();
}

// Scroll-triggered "lift in" effect for medicine cards — replays every time
// a card enters/leaves the viewport, matching BC's section/faculty-card
// reveal style (40px offset, 0.6s ease, threshold 0.2). The 0.6s timing is
// applied only for the moment of the reveal itself (via inline style) and
// released right after, so it never slows down the existing hover-lift,
// which keeps using its normal fast var(--transition) speed.
let cardRevealObserver = null;
function initCardRevealObserver() {
  if (!('IntersectionObserver' in window)) return;
  if (cardRevealObserver) cardRevealObserver.disconnect();
  cardRevealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const el = entry.target;
      el.style.transitionDuration = '0.6s';
      el.classList.toggle('scroll-in', entry.isIntersecting);
      clearTimeout(el._revealTimer);
      el._revealTimer = setTimeout(() => { el.style.transitionDuration = ''; }, 650);
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.medicine-card, .owner-header, .category-label').forEach(card => {
    card.classList.add('scroll-reveal');
    cardRevealObserver.observe(card);
  });
}

function renderMedicineCard(m, serialNum) {
  const isLow = effectiveLowStock(m);
  const isExpired = isExpiredMed(m.expiryDate);
  const isExpiringSoon = isExpiringSoonMed(m.expiryDate);
  const serial = serialNum ? `<span class="card-serial">#${String(serialNum).padStart(2,'0')}</span>` : '';

  const classes = ['medicine-card'];
  if (isLow) classes.push('card-low-stock');
  if (isExpired) classes.push('card-expired');
  else if (isExpiringSoon) {
    // Graduated expiry intensity
    const daysLeft = m.expiryDate ? Math.ceil((new Date(m.expiryDate) - new Date()) / 86400000) : 999;
    if (daysLeft <= 30)       classes.push('expiry-critical');
    else if (daysLeft <= 90)  classes.push('expiry-urgent');
    else                      classes.push('expiry-soon');
  }
  if (m.image) classes.push('has-image');

  const imageHtml = m.image
    ? `<div class="card-image-wrap" onclick="openImgViewer('${escHtml(m.image)}','${escHtml(m.name)}')" style="cursor:pointer;" title="Click to view image"><img src="${escHtml(m.image)}" alt="${escHtml(m.name)}" onerror="this.parentElement.style.display='none'" /></div>`
    : '';

  // Compact view inline meta
  const compactExpiryClass = isExpired ? 'is-expired' : isExpiringSoon ? 'is-expiring' : '';
  const compactExpiryText = m.expiryDate
    ? (isExpired ? `Exp'd ${new Date(m.expiryDate).toLocaleDateString('en-IN',{month:'short',year:'numeric'})}` : `Exp: ${new Date(m.expiryDate).toLocaleDateString('en-IN',{month:'short',year:'numeric'})}`)
    : 'No expiry';

  const formInfo = splitFormIcon(m.form);

  return `
    <div class="${classes.join(' ')}" id="med-${m.id}" data-id="${m.id}" onclick="handleCardBulkClick(event, '${m.id}')">
      <input type="checkbox" class="card-bulk-check" ${bulkSelected.has(m.id)?'checked':''} onclick="toggleBulkSelect('${m.id}')" />
      ${imageHtml}
      <div class="card-top">
        <div class="card-form-icon">${formInfo.icon}</div>
        <div class="card-badges">
          <span class="badge ${typeBadgeClass(m.type)}"${typeBadgeStyle(m.type)}>${formatTypeLabel(m.type)}</span>
          ${m.frequentlyUsed?'<span class="badge badge-freq"><i class="fa-solid fa-star"></i> Frequent</span>':''}
          ${isLow?'<span class="badge badge-low"><i class="fa-solid fa-triangle-exclamation"></i> Low Stock</span>':''}
          ${isExpired?'<span class="badge badge-expired">Expired</span>':''}
          ${!isExpired&&isExpiringSoon?'<span class="badge badge-expiring">Exp. Soon</span>':''}
        </div>
        <div class="card-actions">
          ${serial}
          <button class="btn-icon" onclick="openEdit('${m.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon btn-delete" onclick="deleteMedicine('${m.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <div class="card-body">
        <h3 class="card-name">${m.name}</h3>
        <p class="card-desc">${m.description}</p>
        ${m.notes?`<p class="card-notes"><i class="fa-solid fa-lightbulb"></i> ${m.notes}</p>`:''}
        <div class="card-meta">
          <span class="meta-item ${isLow?'meta-low':''}"><i class="fa-solid fa-box"></i> ${m.quantity===0?'<strong>Finished</strong>':`${m.quantity} ${m.quantityUnit}`}</span>
          <span class="meta-item ${isExpired?'meta-expired':isExpiringSoon?'meta-expiring':''}"><i class="fa-solid fa-calendar"></i> ${formatExpiry(m.expiryDate)}</span>
          <span class="meta-item">${formInfo.icon}${formInfo.text}</span>
        </div>
      </div>
      <div class="compact-row-meta">
        <span class="compact-qty">${m.quantity === 0 ? 'Finished' : `${m.quantity} ${m.quantityUnit}`}</span>
        <span class="compact-expiry ${compactExpiryClass}">${compactExpiryText}</span>
        <span class="compact-actions">
          <button class="btn-icon" onclick="openEdit('${m.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon btn-delete" onclick="deleteMedicine('${m.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </span>
      </div>
      <div class="card-qty-row">
        <button class="qty-btn qty-finish" onclick="markFinished('${m.id}')" title="Mark as finished" ${m.quantity===0?'disabled':''}><i class="fa-solid fa-flag-checkered"></i></button>
        <button class="qty-btn qty-minus" onclick="adjustQuantity('${m.id}',-1)" title="Decrease quantity" ${m.quantity===0?'disabled':''}>−</button>
        <span class="qty-display">${m.quantity} <span class="qty-unit">${m.quantityUnit}</span></span>
        <button class="qty-btn qty-plus" onclick="adjustQuantity('${m.id}',1)" title="Increase quantity">+</button>
      </div>
    </div>`;
}

// ── Owner nav chips (rendered dynamically so add/remove owner reflects instantly) ──
function renderOwnerNavChips() {
  // Fill menu owner chips
  const menuContainer = document.getElementById('menuOwnerChips');
  if (menuContainer) {
    menuContainer.innerHTML = customOwners.map(o => `
      <button class="owner-chip" onclick="scrollToOwner('${o.key}');closeAppMenu()">${o.short}</button>
    `).join('');
  }
  // Legacy: also fill old ownerNavChips if it still exists
  const container = document.getElementById('ownerNavChips');
  if (container) {
    container.innerHTML = customOwners.map(o => `
      <button class="owner-chip" onclick="scrollToOwner('${o.key}')">${o.short}</button>
    `).join('');
  }
}

// ── Owner scroll nav ──────────────────────────────────────
function scrollToOwner(owner) {
  // Always reset filter to 'all' first so the section exists
  if (activeFilter !== 'all') {
    setFilter('all', document.querySelector('.stat-chip.total'));
    setTimeout(() => _doScrollToOwner(owner), 120);
  } else {
    _doScrollToOwner(owner);
  }
}
function _doScrollToOwner(owner) {
  const el = document.getElementById(`owner-${owner}`);
  if (el) scrollCardIntoView(el, 'smooth', 10);
}

// ── Search ───────────────────────────────────────────────────
let searchMode = false;
let searchResults = [];   // ordered array of matching medicine objects
let searchIndex  = -1;

function bindEvents() {
  const inp = document.getElementById('searchInput');

  // Enter in modal fields → save medicine (except textarea which needs Enter for newlines)
  document.getElementById('modal').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.tagName === 'TEXTAREA') return; // let textarea use Enter normally
    e.preventDefault();
    saveMedicine();
  });

  // Live duplicate-ID check as the user types
  document.getElementById('medSerialId').addEventListener('input', validateSerialIdField);

  // Live filter as user types
  inp.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(runSearch, 250);
  });

  // Enter → navigate through results one by one, wrap around, never go to non-matches
  inp.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!searchResults.length) return;
    searchIndex = (searchIndex + 1) % searchResults.length;   // wraps back to 0 at end
    highlightResult(searchIndex);
  });

  document.getElementById('clearSearch').addEventListener('click', clearSearch);

  // Clear the red "required field" highlight the moment the user fixes it.
  // medSerialId is excluded — it has its own dedicated duplicate-ID live check.
  function clearFieldError(e) {
    if (e.target.id === 'medSerialId') return;
    if (e.target.classList && e.target.classList.contains('input-error')) {
      e.target.classList.remove('input-error');
    }
  }
  document.getElementById('modal').addEventListener('input', clearFieldError);
  document.getElementById('modal').addEventListener('change', clearFieldError);

  // Enter to send in the assistant panel
  const assistantInput = document.getElementById('assistantInput');
  if (assistantInput) {
    assistantInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); sendAssistantMessage(); }
    });
  }
}

// Fuzzy: every char of needle appears in name in order (name only, min 3 chars)
function fuzzyName(needle, name) {
  if (needle.length < 3) return false;  // too short = too many false positives
  let h = 0;
  for (let n = 0; n < needle.length; n++) {
    h = name.indexOf(needle[n], h);
    if (h === -1) return false;
    h++;
  }
  return true;
}

// Returns true if medicine matches ALL words in the query
function medicineMatches(med, query) {
  const name = (med.name || '').toLowerCase();
  const ownerCfg = customOwners.find(o => o.key === med.owner);
  const hay  = [
    med.name,
    med.description,
    med.category,
    med.notes || '',
    med.form,
    med.type,
    ownerRaw(med.owner),
    ownerCfg ? ownerCfg.short : '',           // e.g. "Papa Ji" — the short chip name, in case it isn't a literal substring of the full label
    med.frequentlyUsed ? 'frequently used frequent' : ''  // lets "frequent" find frequently-used medicines
  ].join(' ').toLowerCase();

  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);

  // Serial number search: e.g. "#01", "01", "#1", "1"
  const serialNum = med.serialId != null ? med.serialId : (medicines.indexOf(med) + 1);
  const serialStr = String(serialNum).padStart(2, '0');
  const serialFull = `#${serialStr}`;
  const queryClean = query.trim().replace(/^#/, '');

  // If query looks like a serial number (all digits, optionally prefixed with #)
  if (/^#?\d+$/.test(query.trim())) {
    const queryNum = parseInt(queryClean, 10);
    return serialNum === queryNum;
  }

  // Every word must match — AND logic
  return words.every(word =>
    hay.includes(word) ||      // exact substring anywhere in all fields
    fuzzyName(word, name)      // fuzzy only against medicine name, min 3 chars
  );
}

function runSearch() {
  const query = document.getElementById('searchInput').value.trim();
  const clearBtn = document.getElementById('clearSearch');

  if (!query) {
    clearSearch();
    return;
  }

  clearBtn.classList.remove('hidden');
  searchMode = true;
  searchIndex = -1;

  // Filter to only matching medicines (preserve original medicines array order)
  searchResults = medicines.filter(m => medicineMatches(m, query));

  // Render only the matches — non-matching cards never enter the DOM
  renderMatchList(searchResults);
  renderReorderAlert(searchResults);
  updateStats();
}

// Render only the given list of medicines, grouped by owner → category
function renderMatchList(list) {
  const container = document.getElementById('medicineList');

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
        <p>No available medicines match your search.</p>
        <p class="empty-sub">Try symptoms, name, or keywords.</p>
      </div>`;
    return;
  }

  const ownerOrder = customOwners.map(o => o.key);
  let html = '';

  ownerOrder.forEach(owner => {
    const ownerMeds = list.filter(m => m.owner === owner);
    if (!ownerMeds.length) return;

    const ownerCfg = customOwners.find(o => o.key === owner);
    const ownerName = ownerCfg ? ownerCfg.label : owner;

    // Group by category
    const catMap = {};
    ownerMeds.forEach(m => {
      if (!catMap[m.category]) catMap[m.category] = [];
      catMap[m.category].push(m);
    });

    let catsHtml = '';
    Object.entries(catMap).forEach(([cat, meds]) => {
      catsHtml += `
        <div class="category-group">
          <div class="category-label">${getCategoryIcon(cat)}${cat}</div>
          <div class="medicine-grid">
            ${meds.map(m => renderMedicineCard(m, m.serialId != null ? m.serialId : (medicines.indexOf(m) + 1))).join('')}
          </div>
        </div>`;
    });

    html += `
      <div class="owner-section" id="owner-${owner}">
        <div class="owner-header">
          <h2 class="owner-title">${ownerName}</h2>
          <span class="owner-count">${ownerMeds.length} result${ownerMeds.length !== 1 ? 's' : ''}</span>
        </div>
        ${catsHtml}
      </div>`;
  });

  container.innerHTML = html;
  initCardRevealObserver();
}

// Scroll to and highlight a specific search result by index
function highlightResult(idx) {
  const med = searchResults[idx];
  if (!med) return;

  // Remove previous highlights
  document.querySelectorAll('.medicine-card').forEach(el =>
    el.classList.remove('highlight-pulse', 'highlight-active')
  );

  const el = document.getElementById('med-' + med.id);
  if (el) {
    scrollCardIntoView(el);
    el.classList.add('highlight-pulse', 'highlight-active');
    setTimeout(() => el.classList.remove('highlight-pulse', 'highlight-active'), 1800);
  }

  showToast(`${idx + 1} of ${searchResults.length}: ${med.name}`, 'info');
}

function clearSearch() {
  searchMode   = false;
  searchResults = [];
  searchIndex  = -1;
  const inp = document.getElementById('searchInput');
  if (inp) inp.value = '';
  document.getElementById('clearSearch').classList.add('hidden');
  renderAll();
}

function clearSearchState() {
  // Legacy alias used by setFilter — just calls clearSearch
  clearSearch();
}

function scrollCardIntoView(el, behavior = 'smooth', gapOverride = null) {
  // rAF ensures we measure after any pending DOM paint (e.g. right after renderAll).
  // Deterministic manual scroll (rather than native scrollIntoView) avoids a
  // browser quirk where smooth scrollIntoView can overshoot past sticky ancestors.
  requestAnimationFrame(() => {
    const header   = document.querySelector('.site-header');
    const statsBar = document.querySelector('.stats-bar');
    // --scroll-gap is a CSS var (see style.css) so desktop and mobile can be
    // tuned independently — the mobile stats bar wraps to two rows and is
    // already taller, so it needs a smaller extra gap than desktop.
    let gap = gapOverride;
    if (gap == null) {
      const gapVar = getComputedStyle(document.documentElement).getPropertyValue('--scroll-gap');
      gap = parseFloat(gapVar) || 24;
    }
    // Note: the bulk-selection bar is fixed to the BOTTOM of the screen, so it
    // never covers the top of a card and must not factor into this offset.
    const offsetTop = (header   ? header.offsetHeight  : 0) +
                      (statsBar ? statsBar.offsetHeight : 0) + gap;
    const rect = el.getBoundingClientRect();
    const absoluteTop = rect.top + window.scrollY;
    window.scrollTo({ top: absoluteTop - offsetTop, behavior });
  });
}

function scrollToMedicine(id) {
  if (searchMode) {
    clearSearch();
    setTimeout(() => _doScrollToMed(id), 120);
  } else {
    _doScrollToMed(id);
  }
}

function _doScrollToMed(id) {
  const el = document.getElementById(`med-${id}`);
  if (el) {
    scrollCardIntoView(el);
    el.classList.add('highlight-pulse');
    setTimeout(() => el.classList.remove('highlight-pulse'), 1500);
  }
}

// ── Scroll features ───────────────────────────────────────
function initScrollFeatures() {
  const btn = document.getElementById('goTopBtn');
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 320);
  }, { passive:true });
  btn.addEventListener('click', () => window.scrollTo({ top:0, behavior:'smooth' }));
}

// ── Modal open/close with body-scroll lock ────────────────
// Reference-counted so that closing one modal never unlocks the body
// while another modal (e.g. Add/Edit opened underneath Manage) is still open.
// Every open/close below is guarded by the modal's own hidden-state so a
// double-tap or a stray duplicate call can never lock/unlock more than once
// per real open/close — that mismatch was what let the counter drift and
// leave the body permanently scroll-locked ("frozen") after repeated use.
let openModalCount = 0;
function lockBodyScroll() {
  openModalCount++;
  document.body.classList.add('modal-open');
}
function unlockBodyScroll() {
  openModalCount = Math.max(0, openModalCount - 1);
  if (openModalCount === 0) document.body.classList.remove('modal-open');
}
// Self-healing safety net: if nothing is actually visible anymore but the
// counter thinks otherwise (or vice versa), reconcile so scroll never gets
// stuck locked (or unlocked while a modal is genuinely open).
function reconcileBodyScrollLock() {
  const anyOpen = ['modal', 'mgmtModal', 'imgViewerModal', 'branchModal', 'healthDiaryModal', 'quantityLogModal'].some(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  });
  if (!anyOpen && openModalCount !== 0) {
    openModalCount = 0;
    document.body.classList.remove('modal-open');
  } else if (anyOpen && openModalCount === 0) {
    openModalCount = 1;
    document.body.classList.add('modal-open');
  }
}

function openModal() {
  const modal = document.getElementById('modal');
  if (!modal.classList.contains('hidden')) return; // already open — ignore duplicate call
  modal.classList.remove('hidden');
  setTimeout(() => modal.classList.add('active'), 10);
  lockBodyScroll();
}
function closeModal() {
  const modal = document.getElementById('modal');
  if (modal.classList.contains('hidden')) return; // already closed — ignore duplicate call
  modal.classList.remove('active');
  setTimeout(() => modal.classList.add('hidden'), 250);
  unlockBodyScroll();
  editingId = null;
  setTimeout(reconcileBodyScrollLock, 300);
}
// Close-on-outside-click, but ignore text-selection drags: only close if
// BOTH the mousedown and the click landed directly on the backdrop itself,
// not if the drag started inside the modal box and was released outside.
function bindOverlayClose(overlayEl, closeFn) {
  if (!overlayEl) return;
  let downOnOverlay = false;
  overlayEl.addEventListener('mousedown', e => { downOnOverlay = (e.target === overlayEl); });
  overlayEl.addEventListener('click', e => {
    if (downOnOverlay && e.target === overlayEl) closeFn();
  });
}
bindOverlayClose(document.getElementById('modal'), closeModal);
bindOverlayClose(document.getElementById('mgmtModal'), closeMgmtModal);

function openImgViewer(src, name) {
  const modal = document.getElementById('imgViewerModal');
  if (!modal.classList.contains('hidden')) return; // already open — ignore duplicate call
  document.getElementById('imgViewerImg').src = src;
  document.getElementById('imgViewerTitle').textContent = name || 'Medicine Image';
  modal.classList.remove('hidden');
  setTimeout(() => modal.classList.add('active'), 10);
  lockBodyScroll();
}
function closeImgViewer() {
  const modal = document.getElementById('imgViewerModal');
  if (modal.classList.contains('hidden')) return; // already closed — ignore duplicate call
  modal.classList.remove('active');
  setTimeout(() => modal.classList.add('hidden'), 250);
  unlockBodyScroll();
  setTimeout(reconcileBodyScrollLock, 300);
}

bindOverlayClose(document.getElementById('imgViewerModal'), closeImgViewer);

// ── Category custom input ─────────────────────────────────
function onCategoryChange() {
  const sel = document.getElementById('medCategory');
  const custom = document.getElementById('medCategoryCustom');
  if (sel.value === '__new__') {
    custom.classList.remove('hidden');
    custom.focus();
  } else {
    custom.classList.add('hidden');
    custom.value = '';
  }
}

// ── Form custom input (mirrors category's "create new…" pattern) ─
function onFormSelectChange() {
  const sel = document.getElementById('medFormField');
  const custom = document.getElementById('medFormCustom');
  if (!custom) { syncLowStockUI(); return; }
  if (sel.value === '__new__') {
    custom.classList.remove('hidden');
    custom.focus();
  } else {
    custom.classList.add('hidden');
    custom.value = '';
  }
  syncLowStockUI();
}

// ── Form — low stock logic based on unit type ─────────────
function onQuantityChange() { syncLowStockUI(); }

function syncLowStockUI() {
  const unit = document.getElementById('medQuantityUnit').value.trim().toLowerCase();
  const qty  = parseFloat(document.getElementById('medQuantity').value);
  const lowRow   = document.getElementById('lowStockRow');
  const autoLabel = document.getElementById('autoLowLabel');
  const autoLabelText = document.getElementById('autoLowLabelText');

  if (isCountableUnit(unit)) {
    // Auto mode: hide checkbox, show auto label if below threshold
    lowRow.classList.add('hidden');
    const threshold = LOW_THRESHOLDS[unit] || 3;
    if (!isNaN(qty) && qty <= threshold) {
      if (autoLabelText) autoLabelText.textContent = `Auto low-stock (${qty} ${unit} ≤ ${threshold} threshold)`;
      autoLabel.classList.remove('hidden');
    } else {
      autoLabel.classList.add('hidden');
    }
  } else {
    // Manual mode: show checkbox
    lowRow.classList.remove('hidden');
    autoLabel.classList.add('hidden');
  }
}

// ── Dropdown population (category / owner / form) ─────────
function populateAllDropdowns() {
  populateCategoryDropdown();
  populateOwnerDropdown();
  populateFormDropdown();
  populateTypeDropdown();
}

function populateTypeDropdown(selected) {
  const sel = document.getElementById('medType');
  if (!sel) return;
  const prev = selected !== undefined ? selected : sel.value;
  const sortedTypes = customTypes.slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  sel.innerHTML = sortedTypes.map(t => `<option value="${escHtml(t)}">${escHtml(formatTypeLabel(t))}</option>`).join('');
  if (prev && customTypes.includes(prev)) sel.value = prev;
}

function populateCategoryDropdown(selected) {
  const sel = document.getElementById('medCategory');
  if (!sel) return;
  const prev = selected !== undefined ? selected : sel.value;
  const sortedCategories = customCategories.slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  sel.innerHTML = '<option value="">— Select category —</option>' +
    sortedCategories.map(c => `<option value="${escHtml(c)}">${getCategoryIcon(c)}${escHtml(c)}</option>`).join('');
  if (prev && customCategories.includes(prev)) sel.value = prev;
}

function populateOwnerDropdown(selected) {
  const sel = document.getElementById('medOwner');
  if (!sel) return;
  const prev = selected !== undefined ? selected : sel.value;
  sel.innerHTML = customOwners.map(o => `<option value="${escHtml(o.key)}">${escHtml(o.short)}</option>`).join('');
  if (prev && customOwners.some(o => o.key === prev)) sel.value = prev;
}

function populateFormDropdown(selected) {
  const sel = document.getElementById('medFormField');
  if (!sel) return;
  const prev = selected !== undefined ? selected : sel.value;
  const sortedForms = customForms.slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  sel.innerHTML = '<option value="">— Select form —</option>' +
    sortedForms.map(f => `<option value="${escHtml(f)}">${getFormIcon(f)}${escHtml(f)}</option>`).join('');
  if (prev && customForms.includes(prev)) sel.value = prev;
}

// ── Medicine Image handling ───────────────────────────────
let _activeImgTab = 'upload'; // 'upload' | 'url'

function switchImgTab(tab) {
  _activeImgTab = tab;
  document.getElementById('imgTabUpload').classList.toggle('active', tab === 'upload');
  document.getElementById('imgTabUrl').classList.toggle('active', tab === 'url');
  document.getElementById('imgPanelUpload').classList.toggle('hidden', tab !== 'upload');
  document.getElementById('imgPanelUrl').classList.toggle('hidden', tab !== 'url');
}

function handleImageFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 1.2 * 1024 * 1024) { showToast('Image too large (max 1 MB).', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const data = e.target.result;
    document.getElementById('medImageData').value = data;
    const preview = document.getElementById('imgPreviewUpload');
    preview.src = data;
    preview.classList.remove('hidden');
    document.getElementById('imgDropContent').style.display = 'none';
    document.getElementById('imgClearUpload').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function handleImageUrl() {
  const url = document.getElementById('medImageUrl').value.trim();
  const preview = document.getElementById('imgPreviewUrl');
  const clearBtn = document.getElementById('imgClearUrl');
  if (url) {
    preview.src = url;
    preview.classList.remove('hidden');
    clearBtn.classList.remove('hidden');
    document.getElementById('medImageData').value = url;
    preview.onerror = () => { preview.classList.add('hidden'); };
    preview.onload = () => { preview.classList.remove('hidden'); };
  } else {
    clearImageUrl();
  }
}

function clearImage() {
  document.getElementById('medImageFile').value = '';
  document.getElementById('medImageData').value = '';
  const preview = document.getElementById('imgPreviewUpload');
  preview.src = '';
  preview.classList.add('hidden');
  document.getElementById('imgDropContent').style.display = '';
  document.getElementById('imgClearUpload').classList.add('hidden');
}

function clearImageUrl() {
  document.getElementById('medImageUrl').value = '';
  document.getElementById('medImageData').value = '';
  const preview = document.getElementById('imgPreviewUrl');
  preview.src = '';
  preview.classList.add('hidden');
  document.getElementById('imgClearUrl').classList.add('hidden');
}

function resetImageFields() {
  clearImage();
  clearImageUrl();
  switchImgTab('upload');
}

function initImageDropZone() {
  const zone = document.getElementById('imgDropZone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const fakeEvt = { target: { files: [file] } };
      handleImageFile(fakeEvt);
    }
  });
}

// ── Add medicine ──────────────────────────────────────────
function openAdd() {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'Add Medicine';
  document.getElementById('medId').value = '';
  document.getElementById('medSerialId').value = '';
  document.getElementById('medSerialIdError').classList.add('hidden');
  document.getElementById('medSerialId').classList.remove('input-error');
  document.getElementById('saveBtn').disabled = false;
  document.getElementById('medName').value = '';
  document.getElementById('medDesc').value = '';
  populateTypeDropdown('');
  document.getElementById('medType').value = customTypes[0] || FALLBACK_TYPE;

  populateFormDropdown('');
  document.getElementById('medFormField').value = '';
  const formCustom = document.getElementById('medFormCustom');
  if (formCustom) { formCustom.value = ''; formCustom.classList.add('hidden'); }

  document.getElementById('medQuantity').value = '';
  document.getElementById('medQuantityUnit').value = '';
  document.getElementById('medExpiry').value = '';

  populateCategoryDropdown('');
  document.getElementById('medCategory').value = '';
  document.getElementById('medCategoryCustom').value = '';
  document.getElementById('medCategoryCustom').classList.add('hidden');

  populateOwnerDropdown('shared');
  document.getElementById('medOwner').value = customOwners.some(o=>o.key==='shared') ? 'shared' : (customOwners[0] ? customOwners[0].key : '');

  document.getElementById('medFrequent').checked = false;
  document.getElementById('medLowStock').checked = false;
  document.getElementById('medNotes').value = '';
  document.getElementById('lowStockRow').classList.remove('hidden');
  document.getElementById('autoLowLabel').classList.add('hidden');
  resetImageFields();
  openModal();
}

// ── Edit medicine ─────────────────────────────────────────
function openEdit(id) {
  const m = medicines.find(x => x.id === id);
  if (!m) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = 'Edit Medicine';
  document.getElementById('medId').value = m.id;
  document.getElementById('medSerialId').value = (m.serialId != null) ? m.serialId : '';
  document.getElementById('medSerialIdError').classList.add('hidden');
  document.getElementById('medSerialId').classList.remove('input-error');
  document.getElementById('saveBtn').disabled = false;
  document.getElementById('medName').value = m.name;
  document.getElementById('medDesc').value = m.description;
  populateTypeDropdown(m.type);

  // Form: known option or custom text (same pattern as category)
  populateFormDropdown();
  const formSel = document.getElementById('medFormField');
  const formCustom = document.getElementById('medFormCustom');
  if (formCustom) {
    if (customForms.includes(m.form)) {
      formSel.value = m.form;
      formCustom.classList.add('hidden');
      formCustom.value = '';
    } else {
      formSel.value = '__new__';
      formCustom.classList.remove('hidden');
      formCustom.value = m.form;
    }
  } else {
    formSel.value = m.form;
  }

  document.getElementById('medQuantity').value = m.quantity;
  document.getElementById('medQuantityUnit').value = m.quantityUnit;
  document.getElementById('medExpiry').value = m.expiryDate ? m.expiryDate.slice(0, 7) : '';

  // Handle category: check if it's a known option or a custom one
  populateCategoryDropdown();
  const catSel = document.getElementById('medCategory');
  const customInp = document.getElementById('medCategoryCustom');
  if (customCategories.includes(m.category)) {
    catSel.value = m.category;
    customInp.classList.add('hidden');
    customInp.value = '';
  } else {
    catSel.value = '__new__';
    customInp.classList.remove('hidden');
    customInp.value = m.category;
  }

  populateOwnerDropdown(m.owner);
  document.getElementById('medOwner').value = m.owner;
  document.getElementById('medFrequent').checked = m.frequentlyUsed;
  document.getElementById('medLowStock').checked = m.lowStock;
  document.getElementById('medNotes').value = m.notes || '';
  syncLowStockUI();

  // Load image
  resetImageFields();
  if (m.image) {
    document.getElementById('medImageData').value = m.image;
    if (m.image.startsWith('data:')) {
      // base64 upload
      switchImgTab('upload');
      const preview = document.getElementById('imgPreviewUpload');
      preview.src = m.image;
      preview.classList.remove('hidden');
      document.getElementById('imgDropContent').style.display = 'none';
      document.getElementById('imgClearUpload').classList.remove('hidden');
    } else {
      // URL
      switchImgTab('url');
      document.getElementById('medImageUrl').value = m.image;
      const preview = document.getElementById('imgPreviewUrl');
      preview.src = m.image;
      preview.classList.remove('hidden');
      document.getElementById('imgClearUrl').classList.remove('hidden');
    }
  }

  openModal();
}

document.getElementById('saveBtn').addEventListener('click', saveMedicine);

// Marks (or clears) the red required-field highlight on a form field
function highlightInvalidField(id, isInvalid) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('input-error', !!isInvalid);
}

function saveMedicine() {
  const name         = document.getElementById('medName').value.trim();
  const desc         = document.getElementById('medDesc').value.trim();
  const type         = document.getElementById('medType').value;
  const quantity     = parseFloat(document.getElementById('medQuantity').value);
  const quantityUnit = document.getElementById('medQuantityUnit').value.trim();
  const expiryDate   = document.getElementById('medExpiry').value || null;
  const owner        = document.getElementById('medOwner').value;
  const frequentlyUsed = document.getElementById('medFrequent').checked;
  const notes        = document.getElementById('medNotes').value.trim();
  const image        = document.getElementById('medImageData').value.trim() || null;

  // Resolve form: dropdown value or custom text input
  const formSelVal = document.getElementById('medFormField').value.trim();
  const formCustomEl = document.getElementById('medFormCustom');
  const formCustomVal = formCustomEl ? formCustomEl.value.trim() : '';
  const form = formSelVal === '__new__' ? formCustomVal : formSelVal;

  // Resolve category: dropdown value or custom text input
  const catSel = document.getElementById('medCategory').value.trim();
  const catCustom = document.getElementById('medCategoryCustom').value.trim();
  const category = catSel === '__new__' ? catCustom : catSel;

  // Low stock: auto for countables, manual checkbox for others
  const lowStock = isCountableUnit(quantityUnit)
    ? autoIsLow({ quantity, quantityUnit })
    : document.getElementById('medLowStock').checked;

  if (!name || !desc || !form || isNaN(quantity) || !quantityUnit || !category) {
    showToast('Please fill all required fields.', 'error');
    highlightInvalidField('medName', !name);
    highlightInvalidField('medDesc', !desc);
    highlightInvalidField(formSelVal === '__new__' ? 'medFormCustom' : 'medFormField', !form);
    highlightInvalidField('medQuantity', isNaN(quantity));
    highlightInvalidField('medQuantityUnit', !quantityUnit);
    highlightInvalidField(catSel === '__new__' ? 'medCategoryCustom' : 'medCategory', !category);
    return;
  }

  // Serial ID: user-entered value always wins; otherwise auto-assign the
  // next available number (or keep the existing one when editing). A
  // duplicate ID blocks saving entirely — it's never silently swapped,
  // since these IDs commonly match a physical label on the medicine box.
  const serialInput = document.getElementById('medSerialId').value.trim();
  let serialId = serialInput !== '' ? parseInt(serialInput, 10) : NaN;
  if (isNaN(serialId)) {
    const existing = editingId ? medicines.find(x => x.id === editingId) : null;
    serialId = (existing && existing.serialId != null) ? existing.serialId : nextAvailableSerialId();
  } else if (!validateSerialIdField()) {
    document.getElementById('medSerialId').focus();
    return;
  }

  if (catSel === '__new__' && !catCustom) {
    showToast('Please type a category name.', 'error');
    highlightInvalidField('medCategoryCustom', true);
    return;
  }
  if (formSelVal === '__new__' && !formCustomVal) {
    showToast('Please type a form name.', 'error');
    highlightInvalidField('medFormCustom', true);
    return;
  }

  // If it's a new custom category/form, add it to the lists for future use
  if (catSel === '__new__' && catCustom && !customCategories.includes(catCustom)) {
    customCategories.push(catCustom);
  }
  if (formSelVal === '__new__' && formCustomVal && !customForms.includes(formCustomVal)) {
    customForms.push(formCustomVal);
  }

  if (editingId) {
    pushUndo(`Edited "${name}"`);
    const idx = medicines.findIndex(m => m.id === editingId);
    if (idx !== -1) medicines[idx] = { ...medicines[idx], name, description:desc, type, form, quantity, quantityUnit, expiryDate, category, owner, frequentlyUsed, lowStock, notes, image, serialId };
    showUndoToast(`"${name}" updated — tap Undo within 6s`, 'fa-pen');
  } else {
    medicines.push({ id:'m'+Date.now(), name, description:desc, type, form, quantity, quantityUnit, expiryDate, category, owner, frequentlyUsed, lowStock, notes, image, serialId });
    logQuantityChange('added', name, `${quantity} ${quantityUnit}`);
    showToast('Medicine added ✓', 'success');
  }

 saveData(); closeModal();
  exitBulkMode();
  populateAllDropdowns();
  renderOwnerNavChips();
  if (searchMode) {
    runSearch();
  } else {
    renderAll();
  }
}

function deleteMedicine(id) {
  const m = medicines.find(x => x.id === id);
  if (!m || !confirm(`Delete "${m.name}"?`)) return;
  pushUndo(`Deleted "${m.name}"`);
  logQuantityChange('deleted', m.name, `${m.quantity} ${m.quantityUnit}`);
  medicines = medicines.filter(x => x.id !== id);
  saveData();
  exitBulkMode();
  searchMode = false;
  renderAll();
  showUndoToast(`"${m.name}" deleted — tap Undo within 6s`, 'fa-trash');
}

// ── Quick quantity adjust ─────────────────────────────────
function adjustQuantity(id, delta) {
  const idx = medicines.findIndex(m => m.id === id);
  if (idx === -1) return;
  const m = medicines[idx];
  const newQty = Math.max(0, (m.quantity || 0) + delta);
  // Recalculate lowStock for countable units
  const lowStock = isCountableUnit(m.quantityUnit)
    ? autoIsLow({ quantity: newQty, quantityUnit: m.quantityUnit })
    : m.lowStock;
  const oldQty = m.quantity || 0;
  medicines[idx] = { ...m, quantity: newQty, lowStock };
  logQuantityChange(delta > 0 ? 'increased' : 'decreased', m.name, `${oldQty} → ${newQty} ${m.quantityUnit}`);
  saveData();
  // Partial re-render: just replace this card's HTML in place
  const el = document.getElementById(`med-${id}`);
  if (el) {
    const serialNum = medicines[idx].serialId != null ? medicines[idx].serialId : (medicines.indexOf(medicines[idx]) + 1);
    const newHtml = renderMedicineCard(medicines[idx], serialNum);
    const tmp = document.createElement('div');
    tmp.innerHTML = newHtml;
    el.replaceWith(tmp.firstElementChild);
  }
  // Refresh reorder section and stats without touching medicine list
  const base = searchMode ? searchResults : getFilteredMedicines();
  renderReorderAlert(base);
  updateStats();
  showToast(delta > 0 ? `+1 → ${newQty} ${m.quantityUnit}` : (newQty === 0 ? `${m.name} finished` : `-1 → ${newQty} ${m.quantityUnit}`), 'info');
}

// Quick action: jump straight to 0 instead of tapping "−" repeatedly.
function markFinished(id) {
  const m = medicines.find(x => x.id === id);
  if (!m || m.quantity === 0) return;
  adjustQuantity(id, -m.quantity);
}

// ═══════════════════════════════════════════════════════════
// Manage modal — Add / Edit / Delete for Categories, Owners, Forms
// ═══════════════════════════════════════════════════════════
function manageField(fieldType) {
  currentMgmtField = fieldType;
  const titleEl = document.getElementById('mgmtModalTitle');
  const titles = { category:'Manage Categories', owner:'Manage Owners', form:'Manage Forms', type:'Manage Types' };
  if (titleEl) titleEl.textContent = titles[fieldType] || 'Manage Items';
  const inp = document.getElementById('mgmtSearchInput');
  if (inp) inp.value = '';
  document.querySelectorAll('#mgmtTabs .mgmt-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.field === fieldType);
  });
  renderMgmtList();
  const modal = document.getElementById('mgmtModal');
  if (modal && modal.classList.contains('hidden')) {
    modal.classList.remove('hidden');
    lockBodyScroll();
  }
}

function closeMgmtModal() {
  const modal = document.getElementById('mgmtModal');
  if (!modal || modal.classList.contains('hidden')) return; // already closed — ignore duplicate call
  modal.classList.add('hidden');
  unlockBodyScroll();
  // Refresh the underlying add/edit form dropdowns to reflect any changes made
  populateAllDropdowns();
  renderOwnerNavChips();
  renderAll();
  setTimeout(reconcileBodyScrollLock, 50);
}

// Lightweight fuzzy match: true if every typed character appears in order
// somewhere in the text (not necessarily contiguous). Empty query matches all.
function fuzzyMatch(query, text) {
  query = (query || '').toLowerCase().trim();
  if (!query) return true;
  text = (text || '').toLowerCase();
  return text.includes(query);
}

function filterMgmtList() { renderMgmtList(); }

function renderMgmtList() {
  const container = document.getElementById('mgmtListContainer');
  if (!container) return;
  const searchEl = document.getElementById('mgmtSearchInput');
  const query = searchEl ? searchEl.value : '';
  let listHtml = '';

  if (currentMgmtField === 'category') {
    const catOrder = customCategories.map((c, idx) => idx)
      .filter(idx => fuzzyMatch(query, sortKey(customCategories[idx])))
      .sort((a, b) => sortKey(customCategories[a]).localeCompare(sortKey(customCategories[b])));
    listHtml = catOrder.map(idx => { const c = customCategories[idx]; return `
      <div class="mgmt-item">
        <span>${getCategoryIcon(c)}${escHtml(c)}</span>
        <div class="mgmt-actions">
          <button class="mgmt-btn" onclick="editMgmtItem(${idx})" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="mgmt-btn" onclick="deleteMgmtItem(${idx})" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`; }).join('');
  } else if (currentMgmtField === 'owner') {
    listHtml = customOwners.map((o, idx) => ({ o, idx })).filter(({ o }) => fuzzyMatch(query, o.short)).map(({ o, idx }) => `
      <div class="mgmt-item">
        <span>${escHtml(o.label)}</span>
        <div class="mgmt-actions">
          <button class="mgmt-btn" onclick="editMgmtItem(${idx})" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="mgmt-btn" onclick="deleteMgmtItem(${idx})" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`).join('');
  } else if (currentMgmtField === 'form') {
    const formOrder = customForms.map((f, idx) => idx)
      .filter(idx => fuzzyMatch(query, sortKey(customForms[idx])))
      .sort((a, b) => sortKey(customForms[a]).localeCompare(sortKey(customForms[b])));
    listHtml = formOrder.map(idx => { const f = customForms[idx]; return `
      <div class="mgmt-item">
        <span>${getFormIcon(f)}${escHtml(f)}</span>
        <div class="mgmt-actions">
          <button class="mgmt-btn" onclick="editMgmtItem(${idx})" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="mgmt-btn" onclick="deleteMgmtItem(${idx})" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`; }).join('');
  } else if (currentMgmtField === 'type') {
    const typeOrder = customTypes.map((t, idx) => idx)
      .filter(idx => fuzzyMatch(query, formatTypeLabel(customTypes[idx])))
      .sort((a, b) => sortKey(customTypes[a]).localeCompare(sortKey(customTypes[b])));
    listHtml = typeOrder.map(idx => { const t = customTypes[idx]; return `
      <div class="mgmt-item">
        <span>${escHtml(formatTypeLabel(t))}</span>
        <div class="mgmt-actions">
          <button class="mgmt-btn" onclick="editMgmtItem(${idx})" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="mgmt-btn" onclick="deleteMgmtItem(${idx})" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`; }).join('');
  }

  container.innerHTML = listHtml || `<p style="font-size:0.8rem;color:var(--text-muted, #888);">No entries found.</p>`;
}

function promptAddMgmtItem() {
  const labels = { category:'category', form:'form', type:'type', owner:'owner' };
  const val = prompt(`Add new ${labels[currentMgmtField] || 'entry'}:`);
  if (val === null) return; // cancelled
  addMgmtValue(val.trim());
}

function addMgmtValue(val) {
  if (!val) return;

  if (currentMgmtField === 'category') {
    if (customCategories.includes(val)) return showToast('Category already exists.', 'error');
    customCategories.push(val);
  } else if (currentMgmtField === 'form') {
    if (customForms.includes(val)) return showToast('Form already exists.', 'error');
    customForms.push(val);
  } else if (currentMgmtField === 'owner') {
    const key = val.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
    if (!key || customOwners.some(o => o.key === key)) return showToast('Owner already exists or name invalid.', 'error');
    customOwners.push({ key, label: `${val}'s Medicines`, short: val });
  } else if (currentMgmtField === 'type') {
    if (customTypes.includes(val)) return showToast('Type already exists.', 'error');
    customTypes.push(val);
  }

  pushUndo(`Added "${val}" to ${currentMgmtField}`);
  saveData();
  renderMgmtList();
  showUndoToast(`"${val}" added — tap Undo within 6s`, 'fa-check');
}

function editMgmtItem(idx) {
  let current;
  if (currentMgmtField === 'category') current = customCategories[idx];
  else if (currentMgmtField === 'form') current = customForms[idx];
  else if (currentMgmtField === 'type') current = customTypes[idx];
  else if (currentMgmtField === 'owner') current = customOwners[idx].label;
  else return;

  // Prefill with the icon shown for this item (if any) so preset emojis
  // become part of the editable text too, not just custom ones.
  let promptDefault = current;
  if (currentMgmtField === 'category') promptDefault = `${getCategoryIcon(current)}${current}`;
  else if (currentMgmtField === 'form') promptDefault = `${getFormIcon(current)}${current}`;

  const newVal = prompt('Edit value:', promptDefault);
  if (newVal === null) return; // cancelled
  const updated = newVal.trim();
  if (!updated) { showToast('Value cannot be empty.', 'error'); return; }

  if (currentMgmtField === 'category') {
    const oldVal = customCategories[idx];
    if (oldVal === updated) return;
    customCategories[idx] = updated;
    medicines.forEach(m => { if (m.category === oldVal) m.category = updated; });
  } else if (currentMgmtField === 'form') {
    const oldVal = customForms[idx];
    if (oldVal === updated) return;
    customForms[idx] = updated;
    medicines.forEach(m => { if (m.form === oldVal) m.form = updated; });
  } else if (currentMgmtField === 'owner') {
    // The whole line (e.g. "Family — Shared by All") is now editable as one
    // piece; the compact "short" used in chips/dropdowns is derived from it.
    customOwners[idx] = { ...customOwners[idx], label: updated, short: deriveOwnerShort(updated) };
    // Note: owner key itself stays the same to avoid breaking saved medicine.owner references.
  } else if (currentMgmtField === 'type') {
    const oldVal = customTypes[idx];
    if (oldVal === updated) return;
    customTypes[idx] = updated;
    medicines.forEach(m => { if (m.type === oldVal) m.type = updated; });
  }

  pushUndo(`Edited ${currentMgmtField} "${current}" → "${updated}"`);
  saveData();
  renderMgmtList();
  showUndoToast(`"${updated}" saved — tap Undo within 6s`, 'fa-pen');
}

// When deleting a category/form/type/owner that's in use, ask the user where
// the affected medicines should move instead of silently picking a fallback.
// choices: array of {label, value}. Returns the chosen value, or undefined if
// the user cancelled or entered something that didn't match any option.
function promptMoveDestination(count, itemType, removedLabel, choices) {
  const list = choices.map((c, i) => `${i + 1}. ${c.label}`).join('\n');
  const msg = `${count} medicine${count === 1 ? '' : 's'} ${count === 1 ? 'is' : 'are'} currently in "${removedLabel}".\n` +
    `Which ${itemType} would you like to move ${count === 1 ? 'it' : 'them'} to?\n\n${list}`;
  const answer = prompt(msg, '1');
  if (answer === null) return undefined; // cancelled
  const trimmed = answer.trim();
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= choices.length) return choices[num - 1].value;
  const match = choices.find(c => c.label.toLowerCase() === trimmed.toLowerCase());
  return match ? match.value : undefined;
}

function deleteMgmtItem(idx) {
  if (currentMgmtField === 'category') {
    if (customCategories.length <= 1) { showToast('At least one category must remain.', 'error'); return; }
    const removed = customCategories[idx];
    const affected = medicines.filter(m => m.category === removed);
    const remaining = customCategories.filter((c, i) => i !== idx);
    let dest = FALLBACK_CATEGORY;
    if (affected.length) {
      dest = promptMoveDestination(affected.length, 'category', removed, remaining.map(c => ({ label: c, value: c })));
      if (dest === undefined) { showToast('Deletion cancelled.', 'error'); return; }
    } else if (!confirm(`Delete category "${removed}"? No medicines are using it.`)) return;
    customCategories.splice(idx, 1);
    medicines.forEach(m => { if (m.category === removed) m.category = dest; });
  } else if (currentMgmtField === 'form') {
    if (customForms.length <= 1) { showToast('At least one form must remain.', 'error'); return; }
    const removed = customForms[idx];
    const affected = medicines.filter(m => m.form === removed);
    const remaining = customForms.filter((f, i) => i !== idx);
    let dest = FALLBACK_FORM;
    if (affected.length) {
      dest = promptMoveDestination(affected.length, 'form', removed, remaining.map(f => ({ label: f, value: f })));
      if (dest === undefined) { showToast('Deletion cancelled.', 'error'); return; }
    } else if (!confirm(`Delete form "${removed}"? No medicines are using it.`)) return;
    customForms.splice(idx, 1);
    medicines.forEach(m => { if (m.form === removed) m.form = dest; });
  } else if (currentMgmtField === 'owner') {
    if (customOwners.length <= 1) { showToast('At least one owner must remain.', 'error'); return; }
    const removed = customOwners[idx];
    const affected = medicines.filter(m => m.owner === removed.key);
    const remaining = customOwners.filter((o, i) => i !== idx);
    let dest = customOwners.some(o => o.key === FALLBACK_OWNER) ? FALLBACK_OWNER : remaining[0].key;
    if (affected.length) {
      dest = promptMoveDestination(affected.length, 'owner', removed.short, remaining.map(o => ({ label: o.short, value: o.key })));
      if (dest === undefined) { showToast('Deletion cancelled.', 'error'); return; }
    } else if (!confirm(`Delete owner "${removed.short}"? No medicines are assigned to them.`)) return;
    customOwners.splice(idx, 1);
    medicines.forEach(m => { if (m.owner === removed.key) m.owner = dest; });
  } else if (currentMgmtField === 'type') {
    if (customTypes.length <= 1) { showToast('At least one type must remain.', 'error'); return; }
    const removed = customTypes[idx];
    const affected = medicines.filter(m => m.type === removed);
    const remaining = customTypes.filter((t, i) => i !== idx);
    let dest = FALLBACK_TYPE;
    if (affected.length) {
      dest = promptMoveDestination(affected.length, 'type', formatTypeLabel(removed), remaining.map(t => ({ label: formatTypeLabel(t), value: t })));
      if (dest === undefined) { showToast('Deletion cancelled.', 'error'); return; }
    } else if (!confirm(`Delete type "${formatTypeLabel(removed)}"? No medicines are using it.`)) return;
    customTypes.splice(idx, 1);
    medicines.forEach(m => { if (m.type === removed) m.type = dest; });
  }

  pushUndo(`Deleted ${currentMgmtField}`);
  saveData();
  renderMgmtList();
  showUndoToast(`Deleted — tap Undo within 6s`, 'fa-trash');
}

// ── Branches ("houses") ─────────────────────────────────────
// Each branch is a fully independent medicine list + owner/category/type/form
// set. `medicines`/`customCategories`/etc. always mirror whichever branch is
// active, so every other function in this file works unmodified regardless
// of how many branches exist.
function slugifyBranchId(name) {
  const base = name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '') || 'branch';
  let id = base, n = 2;
  while (branches[id]) id = `${base}-${n++}`;
  return id;
}

function updateMenuBranchLabel() {
  const label = document.getElementById('menuBranchLabel');
  const b = branches[activeBranchId];
  if (label) label.textContent = b ? b.name : 'Branch';
}

function openBranchModal() {
  renderBranchList();
  const modal = document.getElementById('branchModal');
  if (modal && modal.classList.contains('hidden')) {
    modal.classList.remove('hidden');
    lockBodyScroll();
  }
}
function closeBranchModal() {
  const modal = document.getElementById('branchModal');
  if (!modal || modal.classList.contains('hidden')) return;
  modal.classList.add('hidden');
  unlockBodyScroll();
  setTimeout(reconcileBodyScrollLock, 50);
}
bindOverlayClose(document.getElementById('branchModal'), closeBranchModal);

// ── Health Diary ─────────────────────────────────────────────
// Per-branch log of health updates and medicines taken, grouped by owner
// (excluding the "shared by all" owner — this is per-person by design).
function openHealthDiary() {
  const modal = document.getElementById('healthDiaryModal');
  if (!modal || !modal.classList.contains('hidden')) return;
  const search = document.getElementById('healthSearchInput');
  if (search) search.value = '';
  const eligibleOwners = customOwners.filter(o => o.key !== 'shared');
  if (!currentHealthOwner || !eligibleOwners.some(o => o.key === currentHealthOwner)) {
    currentHealthOwner = eligibleOwners.length ? eligibleOwners[0].key : null;
  }
  renderHealthOwnerTabs();
  renderHealthDiaryList();
  modal.classList.remove('hidden');
  lockBodyScroll();
}
function closeHealthDiary() {
  const modal = document.getElementById('healthDiaryModal');
  if (!modal || modal.classList.contains('hidden')) return;
  modal.classList.add('hidden');
  unlockBodyScroll();
  setTimeout(reconcileBodyScrollLock, 50);
}
bindOverlayClose(document.getElementById('healthDiaryModal'), closeHealthDiary);

// ── Quantity Log ─────────────────────────────────────────────
// Read-only per-branch log of add/delete/increase/decrease actions,
// capped at the last 20 (see logQuantityChange).
function openQuantityLog() {
  const modal = document.getElementById('quantityLogModal');
  if (!modal || !modal.classList.contains('hidden')) return;
  const search = document.getElementById('quantityLogSearchInput');
  if (search) search.value = '';
  qtyLogSelectMode = false;
  qtyLogSelected.clear();
  const btn = document.getElementById('qtyLogSelectBtn');
  const bar = document.getElementById('qtyLogSelectBar');
  if (btn) btn.textContent = 'Select';
  if (bar) bar.classList.add('hidden');
  renderQuantityLogList();
  modal.classList.remove('hidden');
  lockBodyScroll();
}
function closeQuantityLog() {
  const modal = document.getElementById('quantityLogModal');
  if (!modal || modal.classList.contains('hidden')) return;
  modal.classList.add('hidden');
  unlockBodyScroll();
  setTimeout(reconcileBodyScrollLock, 50);
}
bindOverlayClose(document.getElementById('quantityLogModal'), closeQuantityLog);

const QTY_LOG_ICONS = { added: 'fa-plus', deleted: 'fa-trash', increased: 'fa-arrow-up', decreased: 'fa-arrow-down' };
const QTY_LOG_LABELS = { added: 'Added', deleted: 'Deleted', increased: 'Increased', decreased: 'Decreased' };

let qtyLogSelectMode = false;
let qtyLogSelected = new Set();

function toggleQtyLogSelectMode() {
  qtyLogSelectMode = !qtyLogSelectMode;
  qtyLogSelected.clear();
  renderQuantityLogList();
  const btn = document.getElementById('qtyLogSelectBtn');
  const bar = document.getElementById('qtyLogSelectBar');
  if (btn) btn.textContent = qtyLogSelectMode ? 'Cancel' : 'Select';
  if (bar) bar.classList.toggle('hidden', !qtyLogSelectMode);
}

function toggleQtyLogEntrySelect(id) {
  if (qtyLogSelected.has(id)) qtyLogSelected.delete(id);
  else qtyLogSelected.add(id);
  renderQuantityLogList();
}

let _qtyLogUndoData = null;

function deleteSelectedQtyLogEntries() {
  if (!qtyLogSelected.size) { showToast('No entries selected.', 'error'); return; }
  const count = qtyLogSelected.size;
  _qtyLogUndoData = quantityLog.filter(e => qtyLogSelected.has(e.id));
  quantityLog = quantityLog.filter(e => !qtyLogSelected.has(e.id));
  saveData();
  qtyLogSelectMode = false;
  qtyLogSelected.clear();
  const btn = document.getElementById('qtyLogSelectBtn');
  const bar = document.getElementById('qtyLogSelectBar');
  if (btn) btn.textContent = 'Select';
  if (bar) bar.classList.add('hidden');
  renderQuantityLogList();
  showUndoToast(`Deleted ${count} log entr${count > 1 ? 'ies' : 'y'}`, 'fa-trash');
}

function renderQuantityLogList() {
  const container = document.getElementById('quantityLogListContainer');
  if (!container) return;
  const query = (document.getElementById('quantityLogSearchInput')?.value || '').toLowerCase().trim();
  let entries = quantityLog.slice().reverse(); // newest first
  if (query) {
    entries = entries.filter(e =>
      (e.medName || '').toLowerCase().includes(query) ||
      (e.action || '').toLowerCase().includes(query) ||
      (e.detail || '').toLowerCase().includes(query)
    );
  }
  if (!entries.length) {
    container.innerHTML = `<p class="branch-modal-hint">${query ? 'No matching log entries.' : 'No quantity changes logged yet.'}</p>`;
    return;
  }
  container.innerHTML = entries.map(e => `
    <div class="mgmt-item health-entry ${qtyLogSelectMode ? 'qty-log-selectable' : ''} ${qtyLogSelected.has(e.id) ? 'qty-log-selected' : ''}" ${qtyLogSelectMode ? `onclick="toggleQtyLogEntrySelect('${e.id}')"` : ''}>
      ${qtyLogSelectMode ? `<input type="checkbox" class="qty-log-check" ${qtyLogSelected.has(e.id) ? 'checked' : ''} onclick="event.stopPropagation(); toggleQtyLogEntrySelect('${e.id}')" />` : ''}
      <span class="health-entry-body">
        <span class="health-entry-date"><i class="fa-solid ${QTY_LOG_ICONS[e.action] || 'fa-circle'}"></i> ${QTY_LOG_LABELS[e.action] || e.action} — ${escHtml(formatQtyLogTime(e.ts))}</span>
        <span class="health-entry-issue">${escHtml(e.medName)}</span>
        ${e.detail ? `<span class="health-entry-meds">${escHtml(e.detail)}</span>` : ''}
      </span>
    </div>
  `).join('');
}

function formatQtyLogTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' +
    d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function renderHealthOwnerTabs() {
  const container = document.getElementById('healthOwnerTabs');
  if (!container) return;
  const eligibleOwners = customOwners.filter(o => o.key !== 'shared');
  if (!eligibleOwners.length) {
    container.innerHTML = '<p class="branch-modal-hint">Add an owner first (via Manage) to start a health diary.</p>';
    return;
  }
  container.innerHTML = eligibleOwners.map(o => `
    <button class="mgmt-tab-btn ${o.key === currentHealthOwner ? 'active' : ''}" onclick="selectHealthOwnerTab('${o.key}')">${escHtml(o.short)}</button>
  `).join('');
}
function selectHealthOwnerTab(key) {
  currentHealthOwner = key;
  const search = document.getElementById('healthSearchInput');
  if (search) search.value = '';
  renderHealthOwnerTabs();
  renderHealthDiaryList();
}

function renderHealthDiaryList() {
  const container = document.getElementById('healthDiaryListContainer');
  if (!container) return;
  if (!currentHealthOwner) { container.innerHTML = ''; return; }

  const query = (document.getElementById('healthSearchInput')?.value || '').toLowerCase().trim();
  let entries = healthDiary.filter(e => e.owner === currentHealthOwner);
  if (query) {
    entries = entries.filter(e =>
      (e.issue || '').toLowerCase().includes(query) ||
      (e.medicines || '').toLowerCase().includes(query) ||
      (e.date || '').includes(query)
    );
  }
  // Newest first; entries on the same date keep their most-recently-added first
  entries = entries.slice().sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  if (!entries.length) {
    container.innerHTML = `<p class="branch-modal-hint">${query ? 'No matching entries.' : 'No health diary entries yet.'}</p>`;
    return;
  }

  container.innerHTML = entries.map(e => `
    <div class="mgmt-item health-entry">
      <span class="health-entry-body">
        <span class="health-entry-date"><i class="fa-solid fa-calendar-day"></i> ${escHtml(formatHealthDate(e.date))}</span>
        <span class="health-entry-issue">${escHtml(e.issue)}</span>
        ${e.medicines ? `<span class="health-entry-meds"><i class="fa-solid fa-pills"></i> ${escHtml(e.medicines)}</span>` : ''}
      </span>
      <div class="mgmt-actions">
        <button class="mgmt-btn" onclick="editHealthEntry('${e.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button class="mgmt-btn" onclick="deleteHealthEntry('${e.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `).join('');
}

function formatHealthDate(d) {
  if (!d) return 'No date';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function promptAddHealthEntry() {
  if (!currentHealthOwner) { showToast('Add an owner first via Manage.', 'error'); return; }
  const today = new Date().toISOString().slice(0, 10);
  const date = prompt('Date (YYYY-MM-DD):', today);
  if (date === null) return;

  const issue = prompt('Health update / issue:');
  if (issue === null) return;
  if (!issue.trim()) { showToast('Please enter a health update.', 'error'); return; }

  const meds = prompt('Medicines taken (optional):', '');

  healthDiary.push({
    id: 'h' + Date.now(),
    owner: currentHealthOwner,
    date: date.trim() || today,
    issue: issue.trim(),
    medicines: (meds || '').trim(),
    createdAt: Date.now()
  });
  saveData();
  renderHealthDiaryList();
  showToast('Health diary entry added.', 'success');
}

function editHealthEntry(id) {
  const entry = healthDiary.find(e => e.id === id);
  if (!entry) return;

  const date = prompt('Date (YYYY-MM-DD):', entry.date);
  if (date === null) return;

  const issue = prompt('Health update / issue:', entry.issue);
  if (issue === null) return;
  if (!issue.trim()) { showToast('Please enter a health update.', 'error'); return; }

  const meds = prompt('Medicines taken (optional):', entry.medicines || '');
  if (meds === null) return;

  entry.date = date.trim() || entry.date;
  entry.issue = issue.trim();
  entry.medicines = meds.trim();
  saveData();
  renderHealthDiaryList();
  showToast('Health diary entry updated.', 'success');
}

function deleteHealthEntry(id) {
  const entry = healthDiary.find(e => e.id === id);
  if (!entry) return;
  if (!confirm('Delete this health diary entry?')) return;
  pushUndo('Deleted health diary entry');
  healthDiary = healthDiary.filter(e => e.id !== id);
  saveData();
  renderHealthDiaryList();
  showUndoToast('Health diary entry deleted — tap Undo within 6s', 'fa-trash');
}

function renderBranchList() {
  const container = document.getElementById('branchListContainer');
  if (!container) return;
  container.innerHTML = branchOrder.map(id => {
    const b = branches[id];
    if (!b) return '';
    const isActive  = id === activeBranchId;
    const isDefault = id === defaultBranchId;
    return `
      <div class="mgmt-item branch-item ${isActive ? 'branch-item-active' : ''}" onclick="switchBranch('${id}')" title="Switch to this branch">
        <span class="branch-item-name">
          <i class="fa-solid fa-house"></i> ${escHtml(b.name)}
          ${isActive ? '<span class="branch-badge branch-badge-current">Current</span>' : ''}
          ${isDefault ? '<span class="branch-badge branch-badge-default"><i class="fa-solid fa-star"></i> Default</span>' : ''}
        </span>
        <div class="mgmt-actions">
          ${!isDefault ? `<button class="mgmt-btn" onclick="event.stopPropagation(); setDefaultBranch('${id}')" title="Set as default (opens on refresh)"><i class="fa-regular fa-star"></i></button>` : ''}
          <button class="mgmt-btn" onclick="event.stopPropagation(); promptRenameBranch('${id}')" title="Rename"><i class="fa-solid fa-pen"></i></button>
          <button class="mgmt-btn" onclick="event.stopPropagation(); deleteBranch('${id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
  }).join('');
}

function switchBranch(id) {
  if (!branches[id] || id === activeBranchId) { closeBranchModal(); return; }
  // Make sure nothing from the branch we're leaving is lost in memory.
  saveData();
  // A pending undo snapshot belongs to the branch we're leaving — committing
  // it after switching would silently overwrite the new branch's data.
  _undoStack = null;
  clearTimeout(_undoTimer);
  hideUndoToast();
  activeBranchId = id;
  loadActiveBranchIntoState();
  closeBranchModal();
  showToast(`Switched to "${branches[id].name}"`, 'info');
}

function promptAddBranch() {
  const name = prompt('Name this branch (e.g. a family member\'s house):');
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) return;

  const id = slugifyBranchId(trimmed);
  // Brand-new branch: blank medicine list, sensible fresh defaults for the
  // rest so the Add Medicine form is immediately usable without importing
  // anything from other branches.
  branches[id] = {
    name: trimmed,
    medicines: [],
    categories: DEFAULT_CATEGORIES.slice(),
    forms: DEFAULT_FORMS.slice(),
    owners: [{ key: 'shared', label: '👨‍👩‍👧 Family — Shared by All', short: '👨‍👩‍👧 Family' }],
    types: DEFAULT_TYPES.slice(),
    healthDiary: [],
    quantityLog: []
  };
  branchOrder.push(id);
  saveAllBranches();
  renderBranchList();
  showToast(`Branch "${trimmed}" created.`, 'success');
}

function promptRenameBranch(id) {
  const b = branches[id];
  if (!b) return;
  const name = prompt('Rename branch:', b.name);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) { showToast('Name cannot be empty.', 'error'); return; }
  b.name = trimmed;
  saveAllBranches();
  renderBranchList();
  if (id === activeBranchId) updateMenuBranchLabel();
  showToast('Branch renamed.', 'success');
}

function setDefaultBranch(id) {
  if (!branches[id]) return;
  defaultBranchId = id;
  saveAllBranches();
  renderBranchList();
  showToast(`"${branches[id].name}" will now open by default on refresh.`, 'success');
}

function deleteBranch(id) {
  const b = branches[id];
  if (!b) return;
  if (branchOrder.length <= 1) { showToast('At least one branch must remain.', 'error'); return; }
  const count = (b.medicines || []).length;
  const warning = count
    ? `Delete branch "${b.name}"? This will permanently delete all ${count} medicine${count === 1 ? '' : 's'} in it. This cannot be undone.`
    : `Delete branch "${b.name}"?`;
  if (!confirm(warning)) return;

  delete branches[id];
  branchOrder = branchOrder.filter(x => x !== id);
  if (defaultBranchId === id) defaultBranchId = branchOrder[0];

  if (activeBranchId === id) {
    _undoStack = null;
    clearTimeout(_undoTimer);
    hideUndoToast();
    activeBranchId = defaultBranchId;
    loadActiveBranchIntoState();
  }
  saveAllBranches();
  renderBranchList();
  showToast('Branch deleted.', 'info');
}

// ── Stats ─────────────────────────────────────────────────
function updateStats() {
  document.getElementById('statTotal').textContent    = medicines.length;
  document.getElementById('statLow').textContent      = medicines.filter(m => effectiveLowStock(m)).length;
  document.getElementById('statExpiring').textContent = medicines.filter(m => isExpiringSoonMed(m.expiryDate) && !isExpiredMed(m.expiryDate)).length;
  document.getElementById('statExpired').textContent  = medicines.filter(m => isExpiredMed(m.expiryDate)).length;
}

// ── Helpers ───────────────────────────────────────────────
function isExpiredMed(d) { return d ? new Date(d) < new Date() : false; }
function isExpiringSoonMed(d) {
  if (!d) return false;
  const dt = new Date(d), now = new Date(), six = new Date();
  six.setMonth(six.getMonth() + 6);
  return dt >= now && dt <= six;
}
function formatExpiry(d) {
  if (!d) return 'Expiry Not Available';
  const dt = new Date(d);
  return isExpiredMed(d)
    ? `Expired ${dt.toLocaleDateString('en-IN',{month:'short',year:'numeric'})}`
    : `Exp: ${dt.toLocaleDateString('en-IN',{month:'short',year:'numeric'})}`;
}
function ownerLabel(o) {
  const cfg = customOwners.find(x => x.key === o);
  return cfg ? cfg.short : o;
}
function ownerRaw(o) {
  const cfg = customOwners.find(x => x.key === o);
  return cfg ? cfg.label : o;
}
// Derives the compact "short" display (used in chips/dropdowns) from a full,
// user-edited owner label like "👨‍👩‍👧 Family — Shared by All" or "Mumma's Medicines".
function deriveOwnerShort(label) {
  if (label.includes(' — ')) return label.split(' — ')[0].trim();
  if (label.endsWith("'s Medicines")) return label.slice(0, -("'s Medicines".length)).trim();
  return label.trim();
}
function escHtml(s)    { return (s || '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function logQuantityChange(action, medName, detail) {
  quantityLog.push({ id: 'q' + Date.now() + Math.random().toString(36).slice(2,6), ts: Date.now(), action, medName, detail: detail || '' });
  if (quantityLog.length > 20) quantityLog = quantityLog.slice(-20);
}

// Some category/form names have a user-typed emoji baked into the start of
// the string (e.g. "🍎 Skin Care"). Emoji sort before/after letters by
// codepoint, which breaks plain A-Z ordering — so sort by the text with any
// leading emoji/symbols stripped, not the raw string.
function sortKey(s) { return (s || '').toString().replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase(); }

function formatTypeLabel(t) {
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function typeBadgeClass(type) {
  const known = ['homeopathic', 'allopathic', 'ayurvedic'];
  if (known.includes(type)) return `badge-${type}`;
  // Custom types (e.g. "First Aid/Medical Supplies") may contain spaces/slashes
  // which break unquoted class names — slugify for a valid class.
  const slug = String(type).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `badge-type-custom badge-${slug}`;
}
// Deterministic "random" color per custom type name, so each new type reads
// distinctly instead of all sharing one flat gray. Built-in types are untouched.
const CUSTOM_BADGE_PALETTE = [
  { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' }, // blue
  { bg: '#FDF2F8', color: '#BE185D', border: '#FBCFE8' }, // pink
  { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' }, // orange
  { bg: '#FEFCE8', color: '#854D0E', border: '#FEF08A' }, // yellow
  { bg: '#EEF2FF', color: '#4338CA', border: '#C7D2FE' }, // indigo
  { bg: '#FFF1F2', color: '#BE123C', border: '#FECDD3' }, // rose
  { bg: '#ECFEFF', color: '#0E7490', border: '#A5F3FC' }, // cyan
  { bg: '#F7FEE7', color: '#3F6212', border: '#D9F99D' }, // lime
];
function typeBadgeStyle(type) {
  const known = ['homeopathic', 'allopathic', 'ayurvedic'];
  if (known.includes(type)) return '';
  let hash = 0;
  const s = String(type);
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  const c = CUSTOM_BADGE_PALETTE[Math.abs(hash) % CUSTOM_BADGE_PALETTE.length];
  return ` style="background:${c.bg};color:${c.color};border:1px solid ${c.border};"`;
}
function getCategoryIcon(cat) {
  const m = {'Fever, Cold & Cough Care':'🌡️','Mouth Ulcer Care':'🦷','Pain Relief & Injury Care':'🤕','Digestion, Gut Health & Hydration':'🤢','Allergies & Infections':'🛡️',"Uterus & Women's Health":'🩺','Eye Care':'👁️','Jaw Pain Care':'🦴','Hair & Nail Health':'💇‍♀️','Cold & Cough Care':'🌡️','Gut & Appetite Care':'🤢','Hair Care':'💇‍♂️','Debility & Wellness':'💪'};
  // No default folder icon — if the category isn't a known preset, assume any
  // emoji the user typed is already part of the name itself.
  return m[cat] ? m[cat] + ' ' : '';
}
function getFormIcon(form) {
  if (!form) return '💊 ';
  const f = form.toLowerCase();
  if (f.includes('drop')) return '💧 ';
  if (f.includes('tablet')||f.includes('chewy')||f.includes('candy')||f.includes('lozenge')) return '🔵 ';
  if (f.includes('cream')||f.includes('ointment')||f.includes('gel')) return '🧴 ';
  if (f.includes('tonic')) return '🍶 ';
  if (f.includes('bandage')) return '🩹 ';
  if (f.includes('pouch')) return '🧃 ';
  if (f.includes('oil')) return '🫙 ';
  // No keyword match — fall through to splitFormIcon's emoji extraction / fallback.
  return '';
}

// Separates a form label into {icon, text}. If the stored name already has
// an emoji typed at the start (custom forms), that emoji becomes the icon
// and is stripped from the text so it isn't shown twice. Otherwise falls
// back to the keyword-matched icon above, or a generic pill if neither
// applies — so every form (present or future) always shows an icon
// consistently in every spot on the card, dropdown, and manage list.
function splitFormIcon(form) {
  form = form || '';
  const m = form.match(/^(\p{Extended_Pictographic}(?:\uFE0F|\u200d\p{Extended_Pictographic})*)\s*/u);
  if (m) return { icon: m[1] + ' ', text: form.slice(m[0].length) };
  const kw = getFormIcon(form);
  return { icon: kw || '💊 ', text: form };
}

// ── Toast ─────────────────────────────────────────────────
function showToast(msg, type='success') {
  const t = document.getElementById('toast');
  const msgEl = document.getElementById('toastMsg');
  const iconEl = document.getElementById('toastIcon');
  const cleanMsg = msg.replace(/\s*✓\s*$/, '');
  if (msgEl) msgEl.textContent = cleanMsg;
  const icons = { success: 'fa-check', error: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  if (iconEl) iconEl.className = `fa-solid ${icons[type] || icons.success}`;
  t.className = `toast toast-${type} show`;
  setTimeout(() => t.classList.remove('show'), 4000);
}

// ── Undo System ───────────────────────────────────────────
let _undoStack = null;   // { snapshot: {medicines,categories,forms,owners}, msg }
let _undoTimer = null;
const UNDO_DELAY = 6000; // 6 seconds to undo

function pushUndo(msg) {
  // Save a deep clone of current state BEFORE the action is committed
  _undoStack = {
    msg,
    snapshot: JSON.parse(JSON.stringify({
      medicines,
      categories: customCategories,
      forms: customForms,
      owners: customOwners,
      types: customTypes,
      healthDiary
    }))
  };
}

let _undoCountdownInterval = null;

function showUndoToast(msg, iconClass = 'fa-pen') {
  const toast = document.getElementById('undoToast');
  const msgEl = document.getElementById('undoToastMsg');
  const iconEl = document.getElementById('undoToastIcon');
  const cdEl  = document.getElementById('undoCountdown');
  // Strip old "within Xs" suffix so msg stays clean
  const cleanMsg = msg.replace(/\s*—?\s*tap Undo within \ds/i, '');
  if (msgEl) msgEl.textContent = cleanMsg;
  if (iconEl) iconEl.className = `fa-solid ${iconClass}`;
  toast.classList.remove('hidden');
  toast.classList.add('show');

  // Clear any existing timers
  clearTimeout(_undoTimer);
  clearInterval(_undoCountdownInterval);

  let remaining = Math.round(UNDO_DELAY / 1000);
  if (cdEl) cdEl.textContent = remaining;

  _undoCountdownInterval = setInterval(() => {
    remaining--;
    if (cdEl) cdEl.textContent = remaining > 0 ? remaining : '';
    if (remaining <= 0) clearInterval(_undoCountdownInterval);
  }, 1000);

  _undoTimer = setTimeout(() => {
    _undoStack = null;
    clearInterval(_undoCountdownInterval);
    hideUndoToast();
  }, UNDO_DELAY);
}

function hideUndoToast() {
  const toast = document.getElementById('undoToast');
  toast.classList.remove('show');
  clearInterval(_undoCountdownInterval);
  setTimeout(() => toast.classList.add('hidden'), 400);
}

function commitUndo() {
  if (_qtyLogUndoData) {
    quantityLog = quantityLog.concat(_qtyLogUndoData).sort((a, b) => a.ts - b.ts);
    _qtyLogUndoData = null;
    clearTimeout(_undoTimer);
    clearInterval(_undoCountdownInterval);
    hideUndoToast();
    saveData();
    renderQuantityLogList();
    return;
  }
  if (!_undoStack) return;
  
  const s = _undoStack.snapshot;
  medicines        = s.medicines;
  customCategories = s.categories;
  customForms      = s.forms;
  customOwners     = s.owners;
  customTypes      = s.types || customTypes;
  healthDiary      = s.healthDiary || healthDiary;
  _undoStack = null;
  clearTimeout(_undoTimer);
  clearInterval(_undoCountdownInterval);
  hideUndoToast();
  saveData();
  populateAllDropdowns();
  renderOwnerNavChips();
  renderAll();
  const healthModal = document.getElementById('healthDiaryModal');
  if (healthModal && !healthModal.classList.contains('hidden')) renderHealthDiaryList();
  showToast('Undone ✓', 'success');
}

// ── Bulk Mode ─────────────────────────────────────────────
let bulkMode = false;
let bulkSelected = new Set();

function exitBulkMode() {
  if (!bulkMode) return;
  bulkMode = false;
  bulkSelected.clear();
  document.body.classList.remove('bulk-mode');
  document.getElementById('bulkActionBar').classList.add('hidden');
  document.documentElement.style.removeProperty('--bulk-bar-h');
  const legacyBtn = document.getElementById('bulkToggleBtn');
  if (legacyBtn) legacyBtn.classList.remove('active');
  updateMenuBulkLabel();
}

function toggleBulkMode() {
  if (bulkMode) { exitBulkMode(); renderAll(); return; }
  bulkMode = true;
  bulkSelected.clear();
  document.body.classList.add('bulk-mode');
  document.getElementById('bulkActionBar').classList.remove('hidden');
  const legacyBtn = document.getElementById('bulkToggleBtn');
  if (legacyBtn) legacyBtn.classList.add('active');
  populateBulkDropdowns();
  updateBulkCount();
  updateMenuBulkLabel();
  closeAppMenu();
  renderAll();
  updateBulkBarHeightVar();
}

// Keeps the share/go-top buttons floating just above the bulk bar, whatever
// its actual rendered height is (it varies between 1-row desktop and
// 2-row mobile layouts).
function updateBulkBarHeightVar() {
  requestAnimationFrame(() => {
    const bar = document.getElementById('bulkActionBar');
    if (bar && !bar.classList.contains('hidden')) {
      document.documentElement.style.setProperty('--bulk-bar-h', bar.offsetHeight + 'px');
    }
  });
}
window.addEventListener('resize', () => { if (bulkMode) updateBulkBarHeightVar(); });

function populateBulkDropdowns() {
  const ownerSel = document.getElementById('bulkOwnerSel');
  const catSel   = document.getElementById('bulkCatSel');
  ownerSel.innerHTML = '<option value="">Change Owner</option>' +
    customOwners.map(o => `<option value="${escHtml(o.key)}">${escHtml(o.short)}</option>`).join('');
  catSel.innerHTML = '<option value="">Change Category…</option>' +
    customCategories.map(c => `<option value="${escHtml(c)}">${getCategoryIcon(c)}${escHtml(c)}</option>`).join('');
  ownerSel.onchange = () => { if (ownerSel.value) bulkChangeOwner(ownerSel.value); ownerSel.value=''; };
  catSel.onchange   = () => { if (catSel.value)   bulkChangeCategory(catSel.value); catSel.value=''; };
}

// Clicking anywhere on a card in bulk mode toggles selection, except on
// controls that must keep working independently: quantity buttons
// (finish/-/+), edit/delete, and the checkbox itself (which already
// toggles selection via its own onclick — avoid double-firing).
function handleCardBulkClick(e, id) {
  if (!bulkMode) return;
  if (e.target.closest('.qty-btn, .btn-icon, .card-bulk-check, .card-image-wrap')) return;
  toggleBulkSelect(id);
}

function toggleBulkSelect(id) {
  if (bulkSelected.has(id)) bulkSelected.delete(id);
  else bulkSelected.add(id);
  updateBulkCount();
  const card = document.getElementById('med-' + id);
  if (card) {
    card.classList.toggle('bulk-selected', bulkSelected.has(id));
    const cb = card.querySelector('.card-bulk-check');
    if (cb) cb.checked = bulkSelected.has(id);
  }
  // Manually deselecting the last remaining item exits selection mode —
  // "Deselect All" stays in bulk mode on purpose, since that's more often
  // used to reset a selection mid-workflow than to abandon it.
  if (bulkMode && bulkSelected.size === 0) {
    exitBulkMode();
    renderAll();
  }
}

function updateBulkCount() {
  document.getElementById('bulkCount').textContent = `${bulkSelected.size} selected`;
}

function bulkSelectAll() {
  const visible = [...document.querySelectorAll('.medicine-card[data-id]')];
  visible.forEach(el => {
    bulkSelected.add(el.dataset.id);
    el.classList.add('bulk-selected');
    const cb = el.querySelector('.card-bulk-check');
    if (cb) cb.checked = true;
  });
  updateBulkCount();
}

function bulkDeselectAll() {
  bulkSelected.clear();
  document.querySelectorAll('.medicine-card').forEach(el => {
    el.classList.remove('bulk-selected');
    const cb = el.querySelector('.card-bulk-check');
    if (cb) cb.checked = false;
  });
  updateBulkCount();
}

function bulkDelete() {
  if (!bulkSelected.size) { showToast('No medicines selected.', 'error'); return; }
  if (!confirm(`Delete ${bulkSelected.size} selected medicine(s)? This can be undone via the Undo button.`)) return;
  pushUndo(`Deleted ${bulkSelected.size} medicine(s)`);
  medicines.forEach(m => {
    if (bulkSelected.has(m.id)) logQuantityChange('deleted', m.name, `${m.quantity} ${m.quantityUnit}`);
  });
  medicines = medicines.filter(m => !bulkSelected.has(m.id));
  saveData();
  searchMode = false;
  exitBulkMode();
  renderAll();
  showUndoToast(`Deleted — tap Undo within 6s`, 'fa-trash');
}

function bulkChangeOwner(ownerKey) {
  if (!bulkSelected.size) { showToast('No medicines selected.', 'error'); return; }
  pushUndo(`Changed owner for ${bulkSelected.size} medicine(s)`);
  medicines.forEach(m => { if (bulkSelected.has(m.id)) m.owner = ownerKey; });
  saveData();
  const ownerName = (customOwners.find(o => o.key === ownerKey) || {}).short || ownerKey;
  exitBulkMode();
  renderAll();
  showUndoToast(`Owner changed to ${ownerName}`, 'fa-pen');
}

function bulkChangeCategory(cat) {
  if (!bulkSelected.size) { showToast('No medicines selected.', 'error'); return; }
  pushUndo(`Changed category for ${bulkSelected.size} medicine(s)`);
  medicines.forEach(m => { if (bulkSelected.has(m.id)) m.category = cat; });
  saveData();
  exitBulkMode();
  renderAll();
  showUndoToast(`Category changed to ${cat}`, 'fa-pen');
}

// Ctrl+P / Cmd+P triggers the same custom export
window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
    e.preventDefault();
    exportToPDF();
  }
});

// ── Export to PDF ─────────────────────────────────────────
// Pure jsPDF vector drawing (doc.rect + doc.text), same technique as
// Babita Classes' result.js — no html2canvas, no window.print(). Both of
// those depend on the mobile browser/webview's own rendering engine, which
// is exactly what was producing inconsistent results across phones.
// doc.save() always triggers a genuine file download, identically on
// desktop and mobile.
function stripEmoji(str) {
  // jsPDF's built-in fonts (Times/Helvetica/Courier) can't render emoji —
  // they show as blank boxes or broken glyphs — so every label is plain text.
  return String(str)
    .replace(/[\u{1F000}-\u{1FFFF}\u{2190}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function exportToPDF() {
  try {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      showToast('The PDF tool did not load — check your connection and try again.', 'error');
      return;
    }
    const { jsPDF } = window.jspdf;
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const dateSlash   = `${pad(now.getDate())}-${pad(now.getMonth()+1)}-${now.getFullYear()}`;
    const timeColon   = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const timeForName = timeColon.replace(/:/g, '-');
    const fileName    = `MediHome Stock ${dateSlash} ${timeForName}`;

    // Build grouped, sequentially-numbered entries (owner → category → medicines)
    const ownerOrder = customOwners.map(o => o.key);
    let counter = 0;
    const entries = [];
    ownerOrder.forEach(owner => {
      const ownerMeds = medicines.filter(m => m.owner === owner);
      if (!ownerMeds.length) return;
      const ownerCfg = customOwners.find(o => o.key === owner);
      entries.push({ type: 'owner', text: stripEmoji(ownerCfg ? ownerCfg.label : owner) });
      const catMap = {};
      ownerMeds.forEach(m => { (catMap[m.category] = catMap[m.category] || []).push(m); });
      Object.keys(catMap).forEach(cat => {
        entries.push({ type: 'cat', text: stripEmoji(getCategoryIcon(cat) + cat) });
        sortMeds(catMap[cat]).forEach(m => {
          counter++;
          const exp = m.expiryDate
            ? new Date(m.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
            : '—';
          entries.push({
            type: 'item',
            id: (m.serialId != null ? m.serialId : counter),
            name: stripEmoji(m.name),
            qty: stripEmoji(`${m.quantity} ${m.quantityUnit}`),
            expiry: exp,
            expired: isExpiredMed(m.expiryDate)
          });
        });
      });
    });

    // Split into two side-by-side columns by index — same as before —
    // so the whole inventory fits on one page.
    const splitAt = Math.ceil(entries.length / 2) || 1;
    const col1 = entries.slice(0, splitAt);
    const col2 = entries.slice(splitAt);
    const rowCount = Math.max(col1.length, col2.length, 1);

    // Font/row size tiers so larger inventories still fit one A4 page.
    const fontSize  = entries.length > 55 ? 8   : entries.length > 35 ? 9   : 10;
    const rowHeight = entries.length > 55 ? 5.5 : entries.length > 35 ? 6.2 : 7;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = 210, pageH = 297;
    const MARGIN = 3;   // thin outer margin, per request
    const PAD = 4;      // inner breathing room between the border and the content
    const contentX = MARGIN + PAD;
    const contentW = pageW - 2 * contentX;
    const FONT = 'times';

    // Outer border frame (thin, 3mm from the page edge)
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(MARGIN, MARGIN, pageW - 2 * MARGIN, pageH - 2 * MARGIN);

    // Title + meta
    let y = contentX + 3;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(fontSize + 8);
    const branchName = (branches[activeBranchId] && branches[activeBranchId].name) ? branches[activeBranchId].name : '';
    const titleText = branchName
      ? `MediHome - Family Medicine Inventory (${branchName})`
      : 'MediHome - Family Medicine Inventory';
    doc.text(titleText, pageW / 2, y, { align: 'center' });
    y += fontSize * 0.5 + 3;

    doc.setFont(FONT, 'normal');
    doc.setFontSize(fontSize - 1);
    doc.text(
      `Downloaded from https://medihomeapp.vercel.app/index.html on ${dateSlash} ${timeColon}`,
      pageW / 2, y, { align: 'center' }
    );
    y += 5;

    // Two column-groups: ID | Name | Quantity | Expiry, side by side
    const half = contentW / 2;
    const idW = 8, qtyW = 19, expW = 19;
    const nameW = half - idW - qtyW - expW;
    const groups = [
      { id: contentX,               name: contentX + idW,               qty: contentX + idW + nameW,               expiry: contentX + idW + nameW + qtyW },
      { id: contentX + half,        name: contentX + half + idW,        qty: contentX + half + idW + nameW,        expiry: contentX + half + idW + nameW + qtyW }
    ];

    function drawHeaderRow(rowY) {
      doc.setFont(FONT, 'bold');
      doc.setFontSize(fontSize);
      groups.forEach(g => {
        doc.setFillColor(232, 232, 232);
        doc.rect(g.id, rowY, idW, rowHeight, 'FD');
        doc.rect(g.name, rowY, nameW, rowHeight, 'FD');
        doc.rect(g.qty, rowY, qtyW, rowHeight, 'FD');
        doc.rect(g.expiry, rowY, expW, rowHeight, 'FD');
        doc.text('ID', g.id + idW / 2, rowY + rowHeight / 2 + fontSize * 0.15, { align: 'center' });
        doc.text('Name', g.name + nameW / 2, rowY + rowHeight / 2 + fontSize * 0.15, { align: 'center' });
        doc.text('Quantity', g.qty + qtyW / 2, rowY + rowHeight / 2 + fontSize * 0.15, { align: 'center' });
        doc.text('Expiry', g.expiry + expW / 2, rowY + rowHeight / 2 + fontSize * 0.15, { align: 'center' });
      });
    }

    function drawCell(g, e, rowY) {
      if (!e) {
        doc.setDrawColor(0);
        doc.rect(g.id, rowY, idW, rowHeight);
        doc.rect(g.name, rowY, nameW, rowHeight);
        doc.rect(g.qty, rowY, qtyW, rowHeight);
        doc.rect(g.expiry, rowY, expW, rowHeight);
        return;
      }
      const groupW = idW + nameW + qtyW + expW;
      if (e.type === 'owner' || e.type === 'cat') {
        doc.setFillColor(e.type === 'owner' ? 208 : 238, e.type === 'owner' ? 208 : 238, e.type === 'owner' ? 208 : 238);
        doc.rect(g.id, rowY, groupW, rowHeight, 'FD');
        doc.setFont(FONT, 'bold');
        doc.setFontSize(fontSize);
        doc.text(e.text, g.id + groupW / 2, rowY + rowHeight / 2 + fontSize * 0.15, { align: 'center', maxWidth: groupW - 4 });
        return;
      }
      doc.setDrawColor(0);
      doc.rect(g.id, rowY, idW, rowHeight);
      doc.rect(g.name, rowY, nameW, rowHeight);
      doc.rect(g.qty, rowY, qtyW, rowHeight);
      doc.rect(g.expiry, rowY, expW, rowHeight);

      const textY = rowY + rowHeight / 2 + fontSize * 0.15;
      doc.setFont(FONT, 'normal'); doc.setFontSize(fontSize);
      doc.text(String(e.id).padStart(2, '0'), g.id + idW / 2, textY, { align: 'center' });
      doc.text(e.name, g.name + 1.5, textY, { maxWidth: nameW - 3 });
      doc.text(e.qty, g.qty + 1.5, textY, { maxWidth: qtyW - 3 });

      doc.setFont(FONT, e.expired ? 'bold' : 'normal');
      doc.text(e.expiry, g.expiry + 1.5, textY, { maxWidth: expW - 3 });
      if (e.expired) {
        const tw = Math.min(doc.getTextWidth(e.expiry), expW - 3);
        doc.setLineWidth(0.2);
        doc.line(g.expiry + 1.5, textY + 0.6, g.expiry + 1.5 + tw, textY + 0.6);
      }
    }

    drawHeaderRow(y);
    y += rowHeight;

    if (!entries.length) {
      doc.setFont(FONT, 'normal');
      doc.setFontSize(fontSize);
      doc.text('No medicines yet.', pageW / 2, y + 10, { align: 'center' });
    }

    for (let i = 0; i < rowCount; i++) {
      drawCell(groups[0], col1[i], y);
      drawCell(groups[1], col2[i], y);
      y += rowHeight;
    }

    doc.save(fileName + '.pdf');
  } catch (err) {
    console.error('Export PDF failed:', err);
    showToast('Could not export PDF. Please try again.', 'error');
  }
}


// Share button logic
const shareBtn = document.getElementById("shareBtn");

if (shareBtn) {
  shareBtn.addEventListener("click", async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: document.title,
          text: "Check out MediHome website.",
          url: window.location.href
        });
      } catch (err) {
        console.error("Share failed:", err);
      }
    } else {
      // Fallback if Web Share API not supported
      alert("Sharing not supported on this browser.");
    }
  });
}

// ── Compact View Toggle ───────────────────────────────────
function toggleCompactView() {
  compactView = !compactView;
  document.body.classList.toggle('compact-view', compactView);
  localStorage.setItem('compactView', compactView);
  updateMenuViewLabel();
}
function updateMenuViewLabel() {
  const icon = document.getElementById('menuViewIcon');
  const label = document.getElementById('menuViewLabel');
  if (icon) icon.className = compactView ? 'fa-solid fa-address-card' : 'fa-solid fa-list';
  if (label) label.textContent = compactView ? 'Card View' : 'Compact View';
}

// ── Sort Order ────────────────────────────────────────────
function setSortOrder(val) {
  sortOrder = val;
  localStorage.setItem('sortOrder', val);
  updateSortLabel();
  renderAll();
}

// ── Custom sort dropdown (native <select> can't render icons in its options) ──
const SORT_OPTIONS = {
  expiry:   { icon: 'fa-hourglass-half', label: 'Sort by: Expiry (Soonest→Latest)' },
  name:     { icon: 'fa-font',           label: 'Sort by: Name (A→Z)' },
  quantity: { icon: 'fa-box',            label: 'Sort by: Quantity (High→Low)' },
  added:    { icon: 'fa-clock',          label: 'Sort by: Recently Added' }
};
function updateSortLabel() {
  const cfg = SORT_OPTIONS[sortOrder] || SORT_OPTIONS.expiry;
  const icon = document.getElementById('menuSortIcon');
  const label = document.getElementById('menuSortLabel');
  if (icon) icon.className = `fa-solid ${cfg.icon}`;
  if (label) label.textContent = cfg.label;
}
function toggleSortDropdown() {
  const dd = document.getElementById('menuSortDropdown');
  if (dd) dd.classList.toggle('hidden');
}
function closeSortDropdown() {
  const dd = document.getElementById('menuSortDropdown');
  if (dd) dd.classList.add('hidden');
}
function selectSortOption(val) {
  setSortOrder(val);
  closeSortDropdown();
}
document.addEventListener('click', e => {
  const wrap = document.querySelector('.menu-sort-wrap');
  if (wrap && !wrap.contains(e.target)) closeSortDropdown();
});

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
  updateMenuThemeLabel();
  // legacy hidden btn
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = isDark ? '🌙' : '☀️';
}
function updateMenuThemeLabel() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const icon = document.getElementById('menuThemeIcon');
  const label = document.getElementById('menuThemeLabel');
  if (icon) icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  if (label) label.textContent = isDark ? 'Light Mode' : 'Dark Mode';
}

// ── App Menu ─────────────────────────────────────────────
function toggleAppMenu() {
  const menu = document.getElementById('appMenu');
  const btn  = document.getElementById('menuToggleBtn');
  const isOpen = !menu.classList.contains('hidden');
  if (isOpen) {
    menu.classList.remove('menu-expanded'); // clip immediately so closing also animates cleanly
    menu.classList.add('hidden');
    btn.classList.remove('active');
    closeSortDropdown();
  } else {
    menu.classList.remove('hidden');
    btn.classList.add('active');
    updateMenuThemeLabel();
    updateMenuBulkLabel();
    updateMenuViewLabel();
    updateSortLabel();
    updateMenuBranchLabel();
    // Wait for the max-height reveal to finish before allowing overflow —
    // this is what makes the buttons fade in progressively with the drawer
    // instead of popping in fully rendered before the drawer catches up.
    menu.addEventListener('transitionend', function onEnd(e) {
      if (e.propertyName !== 'max-height') return;
      menu.removeEventListener('transitionend', onEnd);
      if (!menu.classList.contains('hidden')) menu.classList.add('menu-expanded');
    });
  }
}
function closeAppMenu() {
  const menu = document.getElementById('appMenu');
  const btn  = document.getElementById('menuToggleBtn');
  closeSortDropdown();
  if (menu) { menu.classList.add('hidden'); menu.classList.remove('menu-expanded'); }
  if (btn) btn.classList.remove('active');
}
function updateMenuBulkLabel() {
  const icon = document.getElementById('menuBulkIcon');
  const label = document.getElementById('menuBulkLabel');
  if (icon) icon.className = bulkMode ? 'fa-solid fa-xmark' : 'fa-solid fa-square-check';
  if (label) label.textContent = bulkMode ? 'Exit Select' : 'Select';
}
(function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';
    updateMenuThemeLabel();
    // Close menu when clicking outside
    document.addEventListener('click', e => {
      const menu = document.getElementById('appMenu');
      const toggle = document.getElementById('menuToggleBtn');
      if (menu && !menu.contains(e.target) && toggle && !toggle.contains(e.target)) {
        closeAppMenu();
      }
    });
    // Close the assistant panel when clicking outside it
    document.addEventListener('click', e => {
      const panel = document.getElementById('assistantPanel');
      const btn = document.getElementById('assistantBtn');
      if (!panel || panel.classList.contains('hidden')) return;
      if (!panel.contains(e.target) && btn && !btn.contains(e.target)) {
        panel.classList.add('hidden');
        startAssistantHints();
        stopAssistantSpeech();
      }
    });
  });
})();

// ── Offline detection ─────────────────────────────────────
window.addEventListener('offline', () => {
  showToast('No internet connection — changes won\'t sync.', 'error');
});
window.addEventListener('online', () => {
  showToast('Back online — syncing data.', 'success');
});

// ── Assistant (local only — free, no API, no network call) ────
// Answers using the medicines/owners already loaded in the browser, reusing
// the same helpers the rest of the app uses (effectiveLowStock, isExpiredMed,
// medicineMatches, etc.) so its answers always match what's on screen.
// ── Assistant hint bubble ───────────────────────────────────
// Rotates small nudge messages above the assistant button while its panel
// is closed; stops the moment the panel opens, resumes when it closes again.
const ASSISTANT_HINTS = [
  'Need something? Ask here.',
  'Try: "what\'s expiring soon?"',
  'Ask about any medicine.',
  'Curious what\'s low on stock?',
  'I can look things up for you.'
];
let _hintIndex = 0;
let _hintTimer = null;
let _hintCycleActive = false;

function showNextHint() {
  const panel = document.getElementById('assistantPanel');
  if (panel && !panel.classList.contains('hidden')) return; // paused while panel is open
  const hintEl = document.getElementById('assistantHint');
  if (!hintEl) return;

  hintEl.textContent = ASSISTANT_HINTS[_hintIndex % ASSISTANT_HINTS.length];
  _hintIndex++;
  hintEl.classList.remove('hidden');
  hintEl.classList.remove('show');
  void hintEl.offsetHeight; // force reflow so the browser paints the "before" state first
  requestAnimationFrame(() => hintEl.classList.add('show'));

  _hintTimer = setTimeout(() => {
    hintEl.classList.remove('show');
    setTimeout(() => hintEl.classList.add('hidden'), 400); // matches CSS fade duration
    _hintTimer = setTimeout(showNextHint, 3000);
  }, 4000);
}

function startAssistantHints() {
  if (_hintCycleActive) return;
  _hintCycleActive = true;
  clearTimeout(_hintTimer);
  _hintTimer = setTimeout(showNextHint, 2000);
}
function stopAssistantHints() {
  _hintCycleActive = false;
  clearTimeout(_hintTimer);
  const hintEl = document.getElementById('assistantHint');
  if (hintEl) { hintEl.classList.remove('show'); hintEl.classList.add('hidden'); }
}

function toggleAssistant() {
  const panel = document.getElementById('assistantPanel');
  if (!panel) return;
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    stopAssistantHints();
    const input = document.getElementById('assistantInput');
    if (input) input.focus();
  } else {
    startAssistantHints();
    stopAssistantSpeech();
  }
}

document.addEventListener('DOMContentLoaded', startAssistantHints);

function appendAssistantMessage(text, sender, isLoading = false) {
  const container = document.getElementById('assistantMessages');
  if (!container) return null;
  const el = document.createElement('div');
  el.className = `assistant-msg assistant-msg-${sender}${isLoading ? ' assistant-msg-loading' : ''}`;
  if (sender === 'bot' && !isLoading) {
    // escHtml first so nothing in the reply can inject real markup, THEN add
    // our own <strong> tags for **bold** — safe because the only tags that
    // can exist afterward are ones we just added ourselves.
    el.innerHTML = escHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<span class="assistant-emphasis">$1</span>');
  } else {
    el.textContent = text;
  }
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  if (sender === 'bot' && !isLoading) {
    const plain = text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
    _lastReplyPlainText = plain; // kept independent of active playback state, for Replay
    speakAssistantReply(plain);
  }
  return el;
}

// ── Voice input (speech-to-text) ────────────────────────────
// Native Web Speech API — no key, no cost, no backend involved. Support
// varies by browser, so the mic button only appears when it's available.
const _SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
let _recognizer = null;
let _micListening = false;

function initAssistantVoice() {
  const micBtn = document.getElementById('assistantMicBtn');
  if (!micBtn) return;
  if (!_SpeechRecognitionCtor) return; // not supported here — stay hidden

  micBtn.classList.remove('hidden');
  _recognizer = new _SpeechRecognitionCtor();
  _recognizer.continuous = false;
  _recognizer.interimResults = false;
  _recognizer.lang = 'en-US';

  _recognizer.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    const input = document.getElementById('assistantInput');
    if (input) input.value = transcript;
    sendAssistantMessage();
  };
  _recognizer.onerror = () => setMicListening(false);
  _recognizer.onend = () => setMicListening(false);
}

function setMicListening(on) {
  _micListening = on;
  const micBtn = document.getElementById('assistantMicBtn');
  if (micBtn) micBtn.classList.toggle('listening', on);
}

function toggleAssistantMic() {
  if (!_recognizer) return;
  if (_micListening) {
    _recognizer.stop();
    setMicListening(false);
  } else {
    stopAssistantSpeech(); // don't listen while it's still talking
    try {
      _recognizer.start();
      setMicListening(true);
    } catch (_) { /* already started — ignore */ }
  }
}

// ── Voice output (text-to-speech) ───────────────────────────
// Native speechSynthesis.pause()/resume() is unreliable across browsers —
// resume() in particular is known to silently fail on mobile Chrome/Safari
// after a pause, and both pause/resume can lag noticeably on desktop.
// Instead: "pause" fully cancels (reliable everywhere, instant) while
// tracking how far we got; "resume" starts a fresh utterance from that
// tracked position rather than truly resuming. Position is tracked two ways:
// word-boundary events (precise, but mobile often never fires them) AND a
// time-elapsed estimate (works everywhere, used as a fallback/floor).
const SPEECH_CHARS_PER_SEC = 15; // rough average speaking rate at normal pace
let _speechFullText = '';
let _speechCharIndex = 0;
let _speechPaused = false;
let _speechStartTime = 0;
let _speechStartIndex = 0;
let _speechGeneration = 0; // bumped on every deliberate interruption/new utterance,
                            // so late-firing events from an abandoned utterance are ignored
let _currentUtterance = null; // detached (handlers nulled) whenever we cancel deliberately
let _lastReplyPlainText = ''; // persists across stop/close, unlike the vars above

function replayLastAssistantReply() {
  if (!_lastReplyPlainText) return;
  speakAssistantReply(_lastReplyPlainText); // resets all playback state, same as any new reply
}

// Strip an outgoing utterance's own handlers before we cancel it. Some mobile
// TTS engines fire onend/onerror several seconds late after cancel() — the
// generation check below already guards against that, but nulling the
// handlers directly means a late native callback has nothing to call at all,
// which is the more bulletproof of the two safeguards.
function _detachCurrentUtterance() {
  if (_currentUtterance) {
    _currentUtterance.onstart = null;
    _currentUtterance.onend = null;
    _currentUtterance.onerror = null;
    _currentUtterance.onboundary = null;
    _currentUtterance = null;
  }
}

function speakAssistantReply(text) {
  if (!('speechSynthesis' in window)) return; // not supported — silently skip
  _speechGeneration++; // invalidate whatever utterance was previously in flight
  _detachCurrentUtterance();
  speechSynthesis.cancel(); // don't overlap with a previous reply still speaking
  _speechFullText = text;
  _speechCharIndex = 0;
  _speechPaused = false;
  _speakFrom(0);
}

function _speakFrom(charIndex) {
  const remaining = _speechFullText.slice(charIndex);
  if (!remaining) { setSpeechToggle(false); return; }
  const myGen = ++_speechGeneration; // this utterance's own identity
  const utterance = new SpeechSynthesisUtterance(remaining);
  _currentUtterance = utterance;
  utterance.lang = 'en-US';
  utterance.onboundary = (e) => {
    if (myGen !== _speechGeneration) return; // a later utterance has since taken over
    _speechCharIndex = charIndex + e.charIndex;
  };
  utterance.onstart = () => {
    if (myGen !== _speechGeneration) return;
    _speechStartTime = Date.now();
    _speechStartIndex = charIndex;
    setSpeechToggle(true, false);
    setReplayVisible(false); // pause/play takes over while actively reading
  };
  utterance.onend = () => {
    if (myGen !== _speechGeneration) return; // stale — cancel() likely triggered this late
    if (!_speechPaused) { setSpeechToggle(false); setReplayVisible(true); } // finished naturally
  };
  utterance.onerror = () => {
    if (myGen !== _speechGeneration) return;
    if (!_speechPaused) setSpeechToggle(false);
  };
  speechSynthesis.speak(utterance);
}

function setSpeechToggle(visible, paused = false) {
  const btn = document.getElementById('assistantSpeechToggle');
  if (!btn) return;
  btn.classList.toggle('hidden', !visible);
  const icon = btn.querySelector('i');
  if (icon) icon.className = paused ? 'fa-solid fa-play' : 'fa-solid fa-pause';
  btn.setAttribute('aria-label', paused ? 'Resume reading' : 'Pause reading');
}

function setReplayVisible(visible) {
  const btn = document.getElementById('assistantReplayBtn');
  if (btn) btn.classList.toggle('hidden', !visible);
}

function toggleAssistantSpeech() {
  if (!('speechSynthesis' in window)) return;
  if (!_speechPaused) {
    // Estimate progress from elapsed time as a floor — onboundary alone
    // isn't enough since mobile browsers frequently never fire it, which
    // was leaving _speechCharIndex stuck at 0 and restarting from the top.
    const elapsedSec = (Date.now() - _speechStartTime) / 1000;
    const estimatedIndex = _speechStartIndex + Math.floor(elapsedSec * SPEECH_CHARS_PER_SEC);
    _speechCharIndex = Math.max(_speechCharIndex, estimatedIndex);
    _speechPaused = true;
    _speechGeneration++; // invalidate the utterance we're about to cancel
    _detachCurrentUtterance();
    speechSynthesis.cancel(); // instant and reliable, unlike pause()
    setSpeechToggle(true, true); // must be the LAST step — nothing above can override it
  } else {
    _speechPaused = false;
    _speakFrom(_speechCharIndex); // fresh utterance from where we left off
  }
}

function stopAssistantSpeech() {
  _speechGeneration++; // invalidate any utterance still in flight
  _detachCurrentUtterance();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  _speechPaused = false;
  _speechFullText = '';
  _speechCharIndex = 0;
  setSpeechToggle(false);
  setReplayVisible(false);
}

document.addEventListener('DOMContentLoaded', initAssistantVoice);

function _assistantListNames(list, limit = 8) {
  const names = list.slice(0, limit).map(m => m.name);
  const extra = list.length - names.length;
  return names.join(', ') + (extra > 0 ? `, and ${extra} more` : '');
}

function localAssistantAnswer(rawQuery) {
  const q = rawQuery.toLowerCase().trim();
  const branchName = (branches[activeBranchId] && branches[activeBranchId].name) || 'this branch';

  // Branches
  if (/\bbranch(es)?\b/.test(q)) {
    const names = branchOrder.map(id => {
      const b = branches[id];
      if (!b) return '';
      const tag = id === activeBranchId ? ' (current)' : (id === defaultBranchId ? ' (default)' : '');
      return `${b.name}${tag}`;
    }).filter(Boolean);
    return names.length ? `You have ${names.length} branch${names.length === 1 ? '' : 'es'}: ${names.join(', ')}.` : 'No branches found.';
  }

  // Manage-modal lists
  if (/\bcategories\b/.test(q)) {
    return customCategories.length ? `Categories in "${branchName}": ${customCategories.join(', ')}.` : `No categories set up in "${branchName}" yet.`;
  }
  if (/\btypes\b/.test(q)) {
    return customTypes.length ? `Types in "${branchName}": ${customTypes.join(', ')}.` : `No types set up in "${branchName}" yet.`;
  }
  if (/\bforms\b/.test(q)) {
    return customForms.length ? `Forms in "${branchName}": ${customForms.join(', ')}.` : `No forms set up in "${branchName}" yet.`;
  }
  if (/\bowners\b/.test(q)) {
    const names = customOwners.map(o => o.short).join(', ');
    return names ? `Owners in "${branchName}": ${names}.` : `No owners set up in "${branchName}" yet.`;
  }

  // Health Diary
  if (/\bhealth\b|\bdiary\b|\bsymptom/.test(q)) {
    if (!healthDiary.length) return `No health diary entries recorded in "${branchName}" yet.`;
    let entries = healthDiary;
    let ownerMatch = null;
    for (const o of customOwners) {
      const candidates = [o.short, o.label]
        .filter(Boolean).map(s => s.replace(/[^\w\s]/g, '').trim().toLowerCase()).filter(Boolean);
      if (candidates.some(name => name && q.includes(name))) { ownerMatch = o; break; }
    }
    if (ownerMatch) entries = entries.filter(e => e.owner === ownerMatch.key);
    entries = entries.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
    if (!entries.length) return ownerMatch ? `No health diary entries for ${ownerMatch.short} yet.` : `No health diary entries recorded in "${branchName}" yet.`;
    const lines = entries.map(e => {
      const oCfg = customOwners.find(o => o.key === e.owner);
      const oName = oCfg ? oCfg.short : e.owner;
      return `${e.date} (${oName}): ${e.issue}${e.medicines ? ` — took ${e.medicines}` : ''}`;
    });
    return `Recent health diary entries: ${lines.join('; ')}.`;
  }

  // Quantity Log
  if (/\bquantity log\b|\brecent (change|addition|deletion)/.test(q)) {
    if (!quantityLog.length) return `No quantity changes logged yet in "${branchName}".`;
    const lines = quantityLog.slice().reverse().slice(0, 5).map(e =>
      `${e.action} ${e.medName}${e.detail ? ` (${e.detail})` : ''} on ${formatQtyLogTime(e.ts)}`
    );
    return `Recent quantity log: ${lines.join('; ')}.`;
  }

  // Total count
  if (/\b(how many|total|count)\b.*\b(medicine|medicines|meds|items)\b/.test(q) ||
      /^(medicines|meds)\s*(count|total)?$/.test(q)) {
    return `You have ${medicines.length} medicine${medicines.length === 1 ? '' : 's'} recorded in "${branchName}".`;
  }

  // Expired (check before the more general "expiry" pattern below)
  if (/\bexpired\b/.test(q)) {
    const list = medicines.filter(m => isExpiredMed(m.expiryDate));
    if (!list.length) return `Nothing is expired right now in "${branchName}" — good news!`;
    return `${list.length} expired medicine${list.length === 1 ? '' : 's'}: ${_assistantListNames(list)}.`;
  }

  // Expiring soon
  if (/\bexpir(ing|es|y)\b/.test(q)) {
    const list = medicines.filter(m => isExpiringSoonMed(m.expiryDate));
    if (!list.length) return `Nothing is expiring within the next 6 months in "${branchName}".`;
    return `${list.length} medicine${list.length === 1 ? '' : 's'} expiring within 6 months: ${_assistantListNames(list)}.`;
  }

  // Low stock / finished / reorder
  if (/\b(low stock|running low|reorder|out of stock|finished)\b/.test(q)) {
    const list = medicines.filter(effectiveLowStock);
    if (!list.length) return `Nothing is low on stock in "${branchName}" right now.`;
    return `${list.length} medicine${list.length === 1 ? '' : 's'} low on stock or finished: ${_assistantListNames(list)}.`;
  }

  // Frequently used
  if (/\bfrequent(ly)?\b/.test(q)) {
    const list = medicines.filter(m => m.frequentlyUsed);
    if (!list.length) return `No medicines are marked as frequently used in "${branchName}" yet.`;
    return `${list.length} frequently used medicine${list.length === 1 ? '' : 's'}: ${_assistantListNames(list)}.`;
  }

  // Owner-specific — "what does mumma have", "papa ji's medicines", etc.
  for (const o of customOwners) {
    const candidates = [o.short, o.label]
      .filter(Boolean)
      .map(s => s.replace(/[^\w\s]/g, '').trim().toLowerCase())
      .filter(Boolean);
    if (candidates.some(name => name && q.includes(name))) {
      const list = medicines.filter(m => m.owner === o.key);
      if (!list.length) return `No medicines are recorded for ${o.short} yet.`;
      return `${o.short} has ${list.length} medicine${list.length === 1 ? '' : 's'}: ${_assistantListNames(list)}.`;
    }
  }

  // Fall back to the same matching logic the search bar uses — covers
  // medicine names, categories, types, forms, and notes.
  const matches = medicines.filter(m => medicineMatches(m, rawQuery));
  if (matches.length === 1) {
    const m = matches[0];
    const qty = m.quantity === 0 ? 'Finished' : `${m.quantity} ${m.quantityUnit}`;
    return `${m.name} — ${qty}, owner: ${ownerLabel(m.owner)}, ${formatExpiry(m.expiryDate)}.` +
      (m.notes ? ` Note: ${m.notes}` : '');
  }
  if (matches.length > 1) {
    return `Found ${matches.length} matching medicines: ${_assistantListNames(matches, 10)}.`;
  }

  return `I couldn't find anything for that. Try "what's expiring soon", "low stock", "frequently used", an owner's name, or a medicine name.`;
}

// Concise plain-text summary of the current branch's inventory, sent along
// with each question so the model can answer about your actual data.
function buildInventoryContext() {
  const branchName = (branches[activeBranchId] && branches[activeBranchId].name) || 'Unknown';
  const parts = [`Today's date: ${new Date().toISOString().slice(0, 10)}`];

  // Branches
  const branchLines = branchOrder.map(id => {
    const b = branches[id];
    if (!b) return '';
    const tags = [id === activeBranchId ? 'current' : '', id === defaultBranchId ? 'default' : '']
      .filter(Boolean).join(', ');
    return `- ${b.name}${tags ? ` (${tags})` : ''}`;
  }).filter(Boolean);
  parts.push(`Branches:\n${branchLines.join('\n')}`);

  // Owners / categories / types / forms (Manage modal lists) for the active branch
  const ownerNames = customOwners.map(o => o.short).join(', ') || 'none';
  parts.push(
    `Active branch: ${branchName}\n` +
    `Owners: ${ownerNames}\n` +
    `Categories: ${customCategories.join(', ') || 'none'}\n` +
    `Types: ${customTypes.join(', ') || 'none'}\n` +
    `Forms: ${customForms.join(', ') || 'none'}`
  );

  // Health Diary (placed before Medicines since that list can get long)
  if (!healthDiary.length) {
    parts.push('Health Diary: no entries yet.');
  } else {
    const entries = healthDiary.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const diaryLines = entries.map(e => {
      const ownerCfg = customOwners.find(o => o.key === e.owner);
      const ownerName = ownerCfg ? ownerCfg.short : e.owner;
      return `- ${e.date} | ${ownerName} | ${e.issue}${e.medicines ? ` | took: ${e.medicines}` : ''}`;
    });
    parts.push(`Health Diary (${entries.length} entries):\n${diaryLines.join('\n')}`);
  }

  // Quantity Log (last 20 add/delete/increase/decrease actions)
  if (!quantityLog.length) {
    parts.push('Quantity Log: no changes logged yet.');
  } else {
    const logLines = quantityLog.slice().reverse().map(e =>
      `- ${formatQtyLogTime(e.ts)} | ${e.action} | ${e.medName}${e.detail ? ` | ${e.detail}` : ''}`
    );
    parts.push(`Quantity Log (last ${logLines.length} changes):\n${logLines.join('\n')}`);
  }

  // Medicines
  if (!medicines.length) {
    parts.push('Medicines: none recorded yet.');
  } else {
    const lines = medicines.map(m => {
      const ownerCfg = customOwners.find(o => o.key === m.owner);
      const ownerName = ownerCfg ? ownerCfg.short : m.owner;
      const qty = m.quantity === 0 ? 'FINISHED' : `${m.quantity} ${m.quantityUnit}`;
      const exp = m.expiryDate || 'no expiry set';
      return `- #${String(m.serialId || '').padStart(2, '0')} ${m.name} | ${m.category} | ${m.type} | ${m.form} | ${qty} | owner: ${ownerName} | expiry: ${exp}${m.frequentlyUsed ? ' | frequently used' : ''}`;
    });
    parts.push(`Medicines (${medicines.length} total):\n${lines.join('\n')}`);
  }

  return parts.join('\n\n');
}

let _assistantBusy = false;
async function sendAssistantMessage() {
  if (_assistantBusy) return;
  const input = document.getElementById('assistantInput');
  if (!input) return;
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  appendAssistantMessage(msg, 'user');
  const loadingEl = appendAssistantMessage('Thinking…', 'bot', true);
  _assistantBusy = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, context: buildInventoryContext() })
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* non-JSON error page */ }
    if (loadingEl) loadingEl.remove();
    if (!res.ok) {
      // Fall back to local rule-based matching so a down/unconfigured API
      // doesn't leave the assistant completely useless.
      appendAssistantMessage(localAssistantAnswer(msg), 'bot');
      return;
    }
    appendAssistantMessage(data.reply || "Sorry, I couldn't generate a response.", 'bot');
  } catch (err) {
    if (loadingEl) loadingEl.remove();
    appendAssistantMessage(localAssistantAnswer(msg), 'bot');
    console.error('Assistant API error:', err);
  } finally {
    _assistantBusy = false;
  }
}
