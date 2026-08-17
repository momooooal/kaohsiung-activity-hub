(() => {
  'use strict';

  const CONFIG = window.ACTIVITY_HUB_CONFIG || {};
  const state = {
    activities: [],
    filtered: [],
    month: monthKey(new Date()),
    type: '',
    department: '',
    query: '',
    view: localStorage.getItem('activityHubView') || 'grid',
    demoMode: false
  };

  const el = (id) => document.getElementById(id);
  const els = {
    adminLink: el('adminLink'),
    copyHubBtn: el('copyHubBtn'),
    footerCopyBtn: el('footerCopyBtn'),
    prevMonth: el('prevMonth'),
    nextMonth: el('nextMonth'),
    monthPickerBtn: el('monthPickerBtn'),
    monthPicker: el('monthPicker'),
    monthLabel: el('monthLabel'),
    searchInput: el('searchInput'),
    gridViewBtn: el('gridViewBtn'),
    listViewBtn: el('listViewBtn'),
    typeFilters: el('typeFilters'),
    departmentFilter: el('departmentFilter'),
    statusNotice: el('statusNotice'),
    featuredSection: el('featuredSection'),
    featuredGrid: el('featuredGrid'),
    activityGrid: el('activityGrid'),
    resultCount: el('resultCount'),
    emptyState: el('emptyState'),
    resetFiltersBtn: el('resetFiltersBtn'),
    heroMonth: el('heroMonth'),
    heroCardMonth: el('heroCardMonth'),
    heroCount: el('heroCount'),
    heroUpdated: el('heroUpdated'),
    detailDialog: el('detailDialog'),
    detailContent: el('detailContent'),
    closeDialogBtn: el('closeDialogBtn'),
    toast: el('toast')
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    syncConfigLinks();
    hydrateFromUrl();
    bindEvents();
    setView(state.view);
    setMonthUI();
    await loadActivities();
    buildFilters();
    render();
    openEventFromUrl();
  }

  function syncConfigLinks() {
    if (CONFIG.ADMIN_WEBAPP_URL && els.adminLink) {
      els.adminLink.href = 'admin.html';
    }
    if (CONFIG.SITE_NAME) document.title = CONFIG.SITE_NAME;
  }

  function bindEvents() {
    els.prevMonth.addEventListener('click', () => shiftMonth(-1));
    els.nextMonth.addEventListener('click', () => shiftMonth(1));
    els.monthPickerBtn.addEventListener('click', () => {
      els.monthPicker.value = state.month;
      if (typeof els.monthPicker.showPicker === 'function') els.monthPicker.showPicker();
      else els.monthPicker.click();
    });
    els.monthPicker.addEventListener('change', (event) => {
      if (!event.target.value) return;
      state.month = event.target.value;
      setMonthUI();
      render();
      updateUrl();
    });
    els.searchInput.addEventListener('input', debounce((event) => {
      state.query = event.target.value.trim();
      render();
    }, 120));
    els.departmentFilter.addEventListener('change', (event) => {
      state.department = event.target.value;
      render();
    });
    els.gridViewBtn.addEventListener('click', () => setView('grid'));
    els.listViewBtn.addEventListener('click', () => setView('list'));
    els.resetFiltersBtn.addEventListener('click', resetFilters);
    els.copyHubBtn.addEventListener('click', copyCurrentUrl);
    els.footerCopyBtn.addEventListener('click', copyCurrentUrl);
    els.closeDialogBtn.addEventListener('click', closeDetails);
    els.detailDialog.addEventListener('click', (event) => {
      if (event.target === els.detailDialog) closeDetails();
    });
    window.addEventListener('popstate', () => {
      hydrateFromUrl();
      setMonthUI();
      render();
      openEventFromUrl();
    });
  }

  async function loadActivities() {
    const csvUrl = String(CONFIG.PUBLISHED_CSV_URL || '').trim();
    if (!csvUrl) {
      state.demoMode = true;
      state.activities = demoActivities();
      showNotice('目前使用內建示範資料。完成 Google Sheets「發布到網路」後，把 CSV 網址貼到 config.js 就會切換成正式資料。');
      return;
    }

    try {
      const response = await fetch(`${csvUrl}${csvUrl.includes('?') ? '&' : '?'}_=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error('CSV 沒有活動資料');
      state.activities = rowsToActivities(rows).filter((item) => item.id && item.title);
      if (!state.activities.length) showNotice('資料表目前沒有已發布活動。');
    } catch (error) {
      console.error(error);
      state.demoMode = true;
      state.activities = demoActivities();
      showNotice('正式活動資料暫時讀取失敗，現在顯示示範資料。請檢查 config.js 的 CSV 網址，以及 Google Sheets 是否只發布「公開活動」工作表。');
    }
  }

  function rowsToActivities(rows) {
    const headers = rows[0].map((value) => String(value || '').trim().toLowerCase());
    return rows.slice(1).map((row) => {
      const obj = {};
      headers.forEach((header, index) => { obj[header] = String(row[index] ?? '').trim(); });
      return normalizeActivity(obj);
    });
  }

  function normalizeActivity(raw) {
    const pick = (...keys) => {
      for (const key of keys) {
        if (raw[key] !== undefined && raw[key] !== '') return raw[key];
      }
      return '';
    };
    return {
      id: pick('id', '活動id'),
      title: pick('title', '活動名稱'),
      department: pick('department', '科室'),
      type: pick('type', '類型'),
      startDate: normalizeDate(pick('start_date', '開始日期')),
      endDate: normalizeDate(pick('end_date', '結束日期')),
      startTime: pick('start_time', '開始時間'),
      endTime: pick('end_time', '結束時間'),
      location: pick('location', '地點'),
      summary: pick('summary', '摘要'),
      details: pick('details', '詳細說明'),
      registrationUrl: cleanUrl(pick('registration_url', '報名網址')),
      infoUrl: cleanUrl(pick('info_url', '詳細網址')),
      imageUrl: normalizeImageUrl(pick('image_url', '圖片網址')),
      featured: truthy(pick('featured', '焦點')),
      status: pick('status', '狀態'),
      sortOrder: Number(pick('sort_order', '排序')) || 0
    };
  }

  function buildFilters() {
    const types = unique(state.activities.map((item) => item.type).filter(Boolean));
    const ordered = [...(CONFIG.TYPE_ORDER || [])].filter((type) => types.includes(type));
    types.forEach((type) => { if (!ordered.includes(type)) ordered.push(type); });

    els.typeFilters.innerHTML = '';
    const allButton = filterButton('全部', '');
    els.typeFilters.appendChild(allButton);
    ordered.forEach((type) => els.typeFilters.appendChild(filterButton(type, type)));

    const departments = unique(state.activities.map((item) => item.department).filter(Boolean)).sort(localeSort);
    els.departmentFilter.innerHTML = '<option value="">全部科室</option>' + departments.map((department) => `<option value="${escapeAttr(department)}">${escapeHtml(department)}</option>`).join('');
    els.departmentFilter.value = state.department;
  }

  function filterButton(label, value) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter-chip${state.type === value ? ' is-active' : ''}`;
    button.textContent = label;
    button.dataset.value = value;
    button.addEventListener('click', () => {
      state.type = value;
      [...els.typeFilters.querySelectorAll('.filter-chip')].forEach((chip) => chip.classList.toggle('is-active', chip.dataset.value === value));
      render();
    });
    return button;
  }

  function render() {
    const filtered = state.activities
      .filter((activity) => occursInMonth(activity, state.month))
      .filter((activity) => !state.type || activity.type === state.type)
      .filter((activity) => !state.department || activity.department === state.department)
      .filter((activity) => matchesQuery(activity, state.query))
      .sort(activitySort);

    state.filtered = filtered;
    renderHero(filtered);
    renderFeatured(filtered.filter((activity) => activity.featured));
    renderActivities(filtered);
    updateUrl();
  }

  function renderHero(filtered) {
    const date = monthDate(state.month);
    const label = `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
    els.heroMonth.textContent = `${date.getMonth() + 1} 月`;
    els.heroCardMonth.textContent = `${String(date.getMonth() + 1).padStart(2, '0')}月`;
    els.heroCount.textContent = String(filtered.length);
    els.heroUpdated.textContent = new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric' }).format(new Date());
    els.monthLabel.textContent = label;
    els.resultCount.textContent = String(filtered.length);
  }

  function renderFeatured(featured) {
    const picks = featured.slice(0, 4);
    els.featuredSection.classList.toggle('is-hidden', picks.length === 0);
    els.featuredGrid.innerHTML = picks.map(featureCardHtml).join('');
    els.featuredGrid.querySelectorAll('[data-detail-id]').forEach((node) => node.addEventListener('click', () => openDetails(node.dataset.detailId)));
  }

  function renderActivities(activities) {
    els.activityGrid.classList.toggle('is-list', state.view === 'list');
    els.activityGrid.innerHTML = activities.map(activityCardHtml).join('');
    els.emptyState.classList.toggle('is-hidden', activities.length > 0);

    els.activityGrid.querySelectorAll('[data-detail-id]').forEach((node) => node.addEventListener('click', () => openDetails(node.dataset.detailId)));
    els.activityGrid.querySelectorAll('[data-share-id]').forEach((node) => node.addEventListener('click', () => shareActivity(node.dataset.shareId)));
  }

  function featureCardHtml(activity) {
    const background = activity.imageUrl
      ? `<div class="feature-image" style="background-image:url('${escapeAttr(activity.imageUrl)}')"></div>`
      : '<div class="feature-fallback"></div>';
    return `
      <article class="feature-card">
        ${background}
        <div class="feature-content">
          <div class="feature-tags"><span>${escapeHtml(activity.type || '活動')}</span><span>${escapeHtml(activity.department || '')}</span></div>
          <h3>${escapeHtml(activity.title)}</h3>
          <p>${escapeHtml(formatDateRange(activity))}${activity.location ? ` · ${escapeHtml(activity.location)}` : ''}</p>
          <button class="feature-action text-button" type="button" data-detail-id="${escapeAttr(activity.id)}">查看活動 →</button>
        </div>
      </article>`;
  }

  function activityCardHtml(activity) {
    const imageStyle = activity.imageUrl ? ` style="background-image:url('${escapeAttr(activity.imageUrl)}')"` : '';
    const date = parseLocalDate(activity.startDate);
    const day = date ? date.getDate() : '—';
    const month = date ? `${date.getMonth() + 1}月` : '';
    const primaryUrl = activity.registrationUrl || activity.infoUrl;
    const primaryLabel = activity.registrationUrl ? '我要報名' : activity.infoUrl ? '官方資訊' : '查看詳情';
    const primaryAction = primaryUrl
      ? `<a class="button button-primary" href="${escapeAttr(primaryUrl)}" target="_blank" rel="noopener">${primaryLabel}</a>`
      : `<button class="button button-primary" type="button" data-detail-id="${escapeAttr(activity.id)}">查看詳情</button>`;

    return `
      <article class="activity-card">
        <div class="card-image"${imageStyle}>
          <div class="card-date-badge"><strong>${escapeHtml(String(day))}</strong><small>${escapeHtml(month)}</small></div>
        </div>
        <div class="card-body">
          <div class="card-kicker"><span>${escapeHtml(activity.type || '活動')}</span><span>${escapeHtml(activity.department || '')}</span></div>
          <h3>${escapeHtml(activity.title)}</h3>
          <p class="summary">${escapeHtml(activity.summary || activity.details || '點擊查看活動資訊。')}</p>
          <div class="card-meta">
            <span>◷ <b>${escapeHtml(formatDateRange(activity))}${formatTimeRange(activity) ? `｜${escapeHtml(formatTimeRange(activity))}` : ''}</b></span>
            ${activity.location ? `<span>⌖ <b>${escapeHtml(activity.location)}</b></span>` : ''}
          </div>
          <div class="card-actions">
            ${primaryAction}
            <button class="button button-soft" type="button" data-detail-id="${escapeAttr(activity.id)}">詳情</button>
            <button class="card-share" type="button" data-share-id="${escapeAttr(activity.id)}" aria-label="分享活動">↗</button>
          </div>
        </div>
      </article>`;
  }

  function openDetails(id) {
    const activity = state.activities.find((item) => item.id === id);
    if (!activity) return;
    const coverStyle = activity.imageUrl ? ` style="background-image:url('${escapeAttr(activity.imageUrl)}')"` : '';
    const registration = activity.registrationUrl ? `<a class="button button-primary" href="${escapeAttr(activity.registrationUrl)}" target="_blank" rel="noopener">前往報名</a>` : '';
    const info = activity.infoUrl ? `<a class="button button-soft" href="${escapeAttr(activity.infoUrl)}" target="_blank" rel="noopener">官方詳細資訊</a>` : '';
    els.detailContent.innerHTML = `
      <div class="detail-cover"${coverStyle}></div>
      <div class="detail-body">
        <span class="eyebrow">${escapeHtml(activity.type || 'ACTIVITY')} · ${escapeHtml(activity.department || '')}</span>
        <h2>${escapeHtml(activity.title)}</h2>
        <p>${escapeHtml(activity.details || activity.summary || '')}</p>
        <div class="detail-info">
          <div><small>日期</small><strong>${escapeHtml(formatDateRange(activity))}</strong></div>
          <div><small>時間</small><strong>${escapeHtml(formatTimeRange(activity) || '依主辦單位公告')}</strong></div>
          <div><small>地點</small><strong>${escapeHtml(activity.location || '依主辦單位公告')}</strong></div>
          <div><small>承辦／維護</small><strong>${escapeHtml(activity.department || '—')}</strong></div>
        </div>
        <div class="detail-actions">
          ${registration}${info}
          <button class="button button-ghost" type="button" id="dialogShareBtn">分享這個活動</button>
        </div>
      </div>`;
    els.detailDialog.showModal();
    history.replaceState({}, '', eventUrl(activity.id));
    el('dialogShareBtn').addEventListener('click', () => shareActivity(activity.id));
  }

  function closeDetails() {
    if (els.detailDialog.open) els.detailDialog.close();
    const url = new URL(window.location.href);
    url.searchParams.delete('event');
    history.replaceState({}, '', url);
  }

  function openEventFromUrl() {
    const id = new URL(window.location.href).searchParams.get('event');
    if (id && state.activities.some((activity) => activity.id === id)) openDetails(id);
  }

  async function shareActivity(id) {
    const activity = state.activities.find((item) => item.id === id);
    if (!activity) return;
    const url = eventUrl(id).toString();
    if (navigator.share) {
      try {
        await navigator.share({ title: activity.title, text: activity.summary || '活動資訊', url });
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
      }
    }
    await copyText(url);
    toast('已複製活動連結');
  }

  async function copyCurrentUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('event');
    await copyText(url.toString());
    toast('已複製活動總入口網址');
  }

  function resetFilters() {
    state.type = '';
    state.department = '';
    state.query = '';
    els.searchInput.value = '';
    els.departmentFilter.value = '';
    [...els.typeFilters.querySelectorAll('.filter-chip')].forEach((chip) => chip.classList.toggle('is-active', chip.dataset.value === ''));
    render();
  }

  function shiftMonth(delta) {
    const date = monthDate(state.month);
    date.setMonth(date.getMonth() + delta);
    state.month = monthKey(date);
    setMonthUI();
    render();
  }

  function setMonthUI() {
    els.monthPicker.value = state.month;
    const date = monthDate(state.month);
    els.monthLabel.textContent = `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
  }

  function setView(view) {
    state.view = view === 'list' ? 'list' : 'grid';
    localStorage.setItem('activityHubView', state.view);
    els.gridViewBtn.classList.toggle('is-active', state.view === 'grid');
    els.listViewBtn.classList.toggle('is-active', state.view === 'list');
    els.gridViewBtn.setAttribute('aria-pressed', String(state.view === 'grid'));
    els.listViewBtn.setAttribute('aria-pressed', String(state.view === 'list'));
    if (state.activities.length) renderActivities(state.filtered);
  }

  function occursInMonth(activity, key) {
    const monthStart = monthDate(key);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59);
    const start = parseLocalDate(activity.startDate) || monthStart;
    const end = parseLocalDate(activity.endDate) || start;
    return start <= monthEnd && end >= monthStart;
  }

  function matchesQuery(activity, query) {
    if (!query) return true;
    const needle = query.toLocaleLowerCase('zh-TW');
    return [activity.title, activity.department, activity.type, activity.location, activity.summary, activity.details]
      .join(' ')
      .toLocaleLowerCase('zh-TW')
      .includes(needle);
  }

  function activitySort(a, b) {
    if (a.sortOrder !== b.sortOrder) return b.sortOrder - a.sortOrder;
    return String(a.startDate).localeCompare(String(b.startDate)) || localeSort(a.title, b.title);
  }

  function formatDateRange(activity) {
    const start = parseLocalDate(activity.startDate);
    const end = parseLocalDate(activity.endDate);
    if (!start) return '日期依公告';
    const format = (date) => `${date.getMonth() + 1}/${date.getDate()}`;
    if (!end || activity.endDate === activity.startDate) return format(start);
    return `${format(start)}－${format(end)}`;
  }

  function formatTimeRange(activity) {
    if (!activity.startTime && !activity.endTime) return '';
    if (activity.startTime && activity.endTime) return `${activity.startTime}－${activity.endTime}`;
    return activity.startTime || activity.endTime;
  }

  function normalizeImageUrl(value) {
    const url = cleanUrl(value);
    if (!url) return '';
    const driveMatch = url.match(/(?:\/d\/|id=)([a-zA-Z0-9_-]{20,})/);
    if (driveMatch) return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w1600`;
    return url;
  }

  function cleanUrl(value) {
    const url = String(value || '').trim();
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (/^www\./i.test(url)) return `https://${url}`;
    return url;
  }

  function normalizeDate(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    const iso = text.match(/^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})$/);
    if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    return text;
  }

  function parseLocalDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let value = '';
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (quoted) {
        if (char === '"' && next === '"') { value += '"'; i += 1; }
        else if (char === '"') quoted = false;
        else value += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') { row.push(value); value = ''; }
      else if (char === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; }
      else value += char;
    }
    if (value.length || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
    return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
  }

  function hydrateFromUrl() {
    const url = new URL(window.location.href);
    const month = url.searchParams.get('month');
    if (/^\d{4}-\d{2}$/.test(month || '')) state.month = month;
  }

  function updateUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('month', state.month);
    if (!url.searchParams.get('event')) history.replaceState({}, '', url);
  }

  function eventUrl(id) {
    const url = new URL(window.location.href);
    url.searchParams.set('month', state.month);
    url.searchParams.set('event', id);
    return url;
  }

  function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function monthDate(key) {
    const [year, month] = String(key).split('-').map(Number);
    return new Date(year || new Date().getFullYear(), (month || 1) - 1, 1);
  }

  function truthy(value) {
    return ['1', 'true', 'yes', 'y', '是', '焦點', 'v', '✓'].includes(String(value || '').trim().toLowerCase());
  }

  function unique(values) { return [...new Set(values)]; }
  function localeSort(a, b) { return String(a).localeCompare(String(b), 'zh-Hant'); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
  function escapeAttr(value) { return escapeHtml(value); }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  let toastTimer;
  function toast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 1800);
  }

  function showNotice(message) {
    els.statusNotice.textContent = message;
    els.statusNotice.classList.remove('is-hidden');
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function demoActivities() {
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const mk = (day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return [
      {
        id: 'demo-raft', title: '高雄創意造筏競賽', department: '全民運動科', type: '賽事',
        startDate: mk(22), endDate: mk(23), startTime: '14:00', endTime: '17:00', location: '高雄港灣',
        summary: '自己動手造船、現場試航，一起把創意划進港都。',
        details: '示範活動：這裡可以放比賽介紹、參加資格、注意事項與報名方式。正式上線後會改讀 Google Sheets 的活動資料。',
        registrationUrl: '', infoUrl: '', imageUrl: '', featured: true, status: '發布', sortOrder: 100
      },
      {
        id: 'demo-running', title: '港都夜跑體驗班', department: '全民運動科', type: '課程',
        startDate: mk(7), endDate: mk(28), startTime: '18:30', endTime: '20:00', location: '苓雅運動園區',
        summary: '從暖身、配速到跑姿，適合想開始規律跑步的市民。', details: '',
        registrationUrl: '', infoUrl: '', imageUrl: '', featured: true, status: '發布', sortOrder: 80
      },
      {
        id: 'demo-senior', title: '樂齡肌力動起來', department: '全民運動科', type: '體驗',
        startDate: mk(16), endDate: mk(16), startTime: '09:30', endTime: '11:30', location: '前金運動中心',
        summary: '簡單、安全、好上手的樂齡運動體驗。', details: '',
        registrationUrl: '', infoUrl: '', imageUrl: '', featured: false, status: '發布', sortOrder: 20
      },
      {
        id: 'demo-team', title: '城市代表隊應援日', department: '競技運動科', type: '活動',
        startDate: mk(25), endDate: mk(25), startTime: '15:00', endTime: '18:00', location: '高雄市區',
        summary: '一起認識選手、替高雄隊加油。', details: '',
        registrationUrl: '', infoUrl: '', imageUrl: '', featured: false, status: '發布', sortOrder: 10
      }
    ];
  }
})();
