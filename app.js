(() => {
  'use strict';

  const CONFIG = window.ACTIVITY_HUB_CONFIG || {};
  const SPORT_META = {
    '跑步健走': { icon: '🏃', key: 'run' },
    '球類': { icon: '🏀', key: 'ball' },
    '水域': { icon: '🚣', key: 'water' },
    '單車': { icon: '🚴', key: 'bike' },
    '健身體適能': { icon: '💪', key: 'fitness' },
    '樂齡': { icon: '🌿', key: 'senior' },
    '親子': { icon: '👨‍👩‍👧', key: 'family' },
    '舞蹈韻律': { icon: '💃', key: 'dance' },
    '武術格鬥': { icon: '🥋', key: 'martial' },
    '戶外休閒': { icon: '🥾', key: 'outdoor' },
    '綜合運動': { icon: '🏅', key: 'multi' },
    '其他': { icon: '✨', key: 'other' }
  };

  const state = {
    activities: [], filtered: [], month: monthKey(new Date()), type: '', sport: '', department: '', query: '',
    view: localStorage.getItem('activityHubView') || 'grid', demoMode: false, boardPosition: 0
  };

  const el = (id) => document.getElementById(id);
  const els = {
    adminLink: el('adminLink'), copyHubBtn: el('copyHubBtn'), footerCopyBtn: el('footerCopyBtn'),
    heroBrowseBtn: el('heroBrowseBtn'), heroGameBtn: el('heroGameBtn'),
    prevMonth: el('prevMonth'), nextMonth: el('nextMonth'), monthPickerBtn: el('monthPickerBtn'), monthPicker: el('monthPicker'), monthLabel: el('monthLabel'),
    searchInput: el('searchInput'), gridViewBtn: el('gridViewBtn'), listViewBtn: el('listViewBtn'),
    sportFilters: el('sportFilters'), resetSportBtn: el('resetSportBtn'), typeFilters: el('typeFilters'), departmentFilter: el('departmentFilter'),
    statusNotice: el('statusNotice'), latestSection: el('latestSection'), latestRail: el('latestRail'),
    featuredSection: el('featuredSection'), featuredGrid: el('featuredGrid'), activityGrid: el('activityGrid'), resultCount: el('resultCount'),
    activeFilterSummary: el('activeFilterSummary'), emptyState: el('emptyState'), resetFiltersBtn: el('resetFiltersBtn'),
    heroMonth: el('heroMonth'), heroCardMonth: el('heroCardMonth'), heroCount: el('heroCount'), heroUpdated: el('heroUpdated'),
    monopolySection: el('monopolySection'), monopolyBoard: el('monopolyBoard'), rollDiceBtn: el('rollDiceBtn'), resetBoardBtn: el('resetBoardBtn'), diceFace: el('diceFace'), boardMessage: el('boardMessage'),
    detailDialog: el('detailDialog'), detailContent: el('detailContent'), closeDialogBtn: el('closeDialogBtn'), toast: el('toast')
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    syncConfigLinks(); hydrateFromUrl(); bindEvents(); setView(state.view); setMonthUI();
    await loadActivities(); buildFilters(); renderLatest(); render(); openEventFromUrl();
  }

  function syncConfigLinks() {
    if (CONFIG.SITE_NAME) document.title = CONFIG.SITE_NAME;
  }

  function bindEvents() {
    els.prevMonth.addEventListener('click', () => shiftMonth(-1));
    els.nextMonth.addEventListener('click', () => shiftMonth(1));
    els.monthPickerBtn.addEventListener('click', () => {
      els.monthPicker.value = state.month;
      if (typeof els.monthPicker.showPicker === 'function') els.monthPicker.showPicker(); else els.monthPicker.click();
    });
    els.monthPicker.addEventListener('change', (event) => {
      if (!event.target.value) return;
      state.month = event.target.value; state.boardPosition = 0; setMonthUI(); render(); updateUrl();
    });
    els.searchInput.addEventListener('input', debounce((event) => { state.query = event.target.value.trim(); render(); }, 120));
    els.departmentFilter.addEventListener('change', (event) => { state.department = event.target.value; render(); });
    els.gridViewBtn.addEventListener('click', () => setView('grid'));
    els.listViewBtn.addEventListener('click', () => setView('list'));
    els.resetFiltersBtn.addEventListener('click', resetFilters);
    els.resetSportBtn.addEventListener('click', () => { state.sport = ''; render(); });
    els.copyHubBtn.addEventListener('click', copyMonthlyUrl); els.footerCopyBtn.addEventListener('click', copyMonthlyUrl);
    els.heroBrowseBtn.addEventListener('click', () => el('browseSection').scrollIntoView({ behavior: 'smooth', block: 'start' }));
    els.heroGameBtn.addEventListener('click', () => els.monopolySection.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    els.rollDiceBtn.addEventListener('click', rollDice); els.resetBoardBtn.addEventListener('click', resetBoard);
    els.closeDialogBtn.addEventListener('click', closeDetails);
    els.detailDialog.addEventListener('click', (event) => { if (event.target === els.detailDialog) closeDetails(); });
    window.addEventListener('popstate', () => { hydrateFromUrl(); setMonthUI(); render(); openEventFromUrl(); });
  }

  async function loadActivities() {
    const csvUrl = String(CONFIG.PUBLISHED_CSV_URL || '').trim();
    if (!csvUrl) {
      state.demoMode = true; state.activities = demoActivities();
      showNotice('目前使用內建示範資料。完成 Google Sheets「發布到網路」後，把 CSV 網址貼到 config.js 就會切換成正式資料。');
      return;
    }

    try {
      const result = await loadPublishedRows(csvUrl);
      const rows = result.rows || [];
      if (!rows.length) throw new Error('讀到的資料完全沒有標題列');

      // V3 修正：只有標題列代表「成功連線，但目前 0 筆已發布活動」，不是讀取失敗。
      if (rows.length === 1) {
        state.demoMode = false;
        state.activities = [];
        showNotice(`已成功連上正式資料（${result.method}），但「公開活動」目前沒有已發布活動。請確認後台活動狀態是否為「發布」。`);
        return;
      }

      state.demoMode = false;
      state.activities = rowsToActivities(rows).filter((item) => item.id && item.title);
      if (!state.activities.length) {
        showNotice(`已成功連上正式資料（${result.method}），但沒有找到可顯示的活動。請確認「公開活動」第一列欄位名稱沒有被改掉。`);
      }
    } catch (error) {
      console.error('[Activity Hub] 正式資料讀取失敗：', error);
      state.demoMode = true;
      state.activities = demoActivities();
      showNotice(`正式活動資料暫時讀取失敗，現在顯示示範資料。系統已同時嘗試 CSV 與 Google Visualization 備援讀取。錯誤：${friendlyDataError(error)}`);
    }
  }

  async function loadPublishedRows(csvUrl) {
    const errors = [];
    try {
      const response = await fetch(`${csvUrl}${csvUrl.includes('?') ? '&' : '?'}_=${Date.now()}`, { cache: 'no-store', redirect: 'follow' });
      if (!response.ok) throw new Error(`CSV HTTP ${response.status}`);
      const text = await response.text();
      const rows = parseCSV(text);
      if (!rows.length) throw new Error('CSV 回傳空白內容');
      return { rows, method: 'CSV' };
    } catch (error) {
      errors.push(error);
      console.warn('[Activity Hub] CSV 直接讀取失敗，改用 Google Visualization：', error);
    }

    try {
      const rows = await loadViaGoogleVisualization(csvUrl);
      if (!rows.length) throw new Error('Google Visualization 回傳空白內容');
      return { rows, method: 'Google Visualization 備援' };
    } catch (error) {
      errors.push(error);
      console.warn('[Activity Hub] Google Visualization 備援也失敗：', error);
    }

    throw new Error(errors.map(error => error && error.message ? error.message : String(error)).join('；'));
  }

  function loadViaGoogleVisualization(sourceUrl) {
    return new Promise((resolve, reject) => {
      let url;
      try { url = buildGvizUrl(sourceUrl); } catch (error) { reject(error); return; }
      const callbackName = `__activityHubGviz_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      let settled = false;
      const timer = setTimeout(() => finish(new Error('Google Visualization 讀取逾時')), 12000);

      function cleanup() {
        clearTimeout(timer);
        try { delete window[callbackName]; } catch (error) { window[callbackName] = undefined; }
        script.remove();
      }
      function finish(error, rows) {
        if (settled) return;
        settled = true; cleanup();
        if (error) reject(error); else resolve(rows);
      }

      window[callbackName] = (payload) => {
        if (!payload || payload.status === 'error' || !payload.table) {
          const detail = payload && payload.errors && payload.errors[0] ? payload.errors[0].detailed_message || payload.errors[0].message : '未知錯誤';
          finish(new Error(`Google Visualization：${detail}`));
          return;
        }
        const headers = (payload.table.cols || []).map(col => String(col.label || col.id || '').trim());
        const dataRows = (payload.table.rows || []).map(row => (row.c || []).map(cell => {
          if (!cell) return '';
          if (cell.f !== undefined && cell.f !== null) return String(cell.f);
          if (cell.v === undefined || cell.v === null) return '';
          return String(cell.v);
        }));
        finish(null, [headers, ...dataRows]);
      };

      const separator = url.includes('?') ? '&' : '?';
      script.src = `${url}${separator}headers=1&tqx=${encodeURIComponent(`responseHandler:${callbackName}`)}&_=${Date.now()}`;
      script.async = true;
      script.onerror = () => finish(new Error('Google Visualization script 載入失敗'));
      document.head.appendChild(script);
    });
  }

  function buildGvizUrl(sourceUrl) {
    const url = new URL(sourceUrl, window.location.href);
    const gid = url.searchParams.get('gid') || '0';
    const published = url.pathname.match(/\/spreadsheets\/d\/e\/([^/]+)\/(?:pub|gviz\/tq)/);
    if (published) return `https://docs.google.com/spreadsheets/d/e/${published[1]}/gviz/tq?gid=${encodeURIComponent(gid)}`;
    const normal = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (normal) return `https://docs.google.com/spreadsheets/d/${normal[1]}/gviz/tq?gid=${encodeURIComponent(gid)}`;
    throw new Error('無法從 config.js 的網址判斷 Google Sheets ID');
  }

  function friendlyDataError(error) {
    const message = error && error.message ? error.message : String(error || '未知錯誤');
    if (/Failed to fetch|NetworkError|CORS/i.test(message)) return '瀏覽器無法直接讀取 Google CSV，且備援連線也沒有成功。';
    return message.slice(0, 220);
  }

  function rowsToActivities(rows) {
    const headers = rows[0].map((value) => String(value || '').trim().toLowerCase());
    return rows.slice(1).map((row) => {
      const obj = {}; headers.forEach((header, index) => { obj[header] = String(row[index] ?? '').trim(); });
      return normalizeActivity(obj);
    });
  }

  function normalizeActivity(raw) {
    const pick = (...keys) => { for (const key of keys) if (raw[key] !== undefined && raw[key] !== '') return raw[key]; return ''; };
    const activity = {
      id: pick('id', '活動id'), title: pick('title', '活動名稱'), department: pick('department', '科室'), type: pick('type', '類型'),
      startDate: normalizeDate(pick('start_date', '開始日期')), endDate: normalizeDate(pick('end_date', '結束日期')),
      startTime: normalizeTime(pick('start_time', '開始時間')), endTime: normalizeTime(pick('end_time', '結束時間')),
      location: pick('location', '地點'), summary: pick('summary', '摘要'), details: pick('details', '詳細說明'),
      registrationUrl: cleanUrl(pick('registration_url', '報名網址')), infoUrl: cleanUrl(pick('info_url', '詳細網址')),
      imageUrl: normalizeImageUrl(pick('image_url', '圖片網址')), featured: truthy(pick('featured', '焦點')), status: pick('status', '狀態'),
      sortOrder: Number(pick('sort_order', '排序')) || 0, sportCategory: pick('sport_category', '運動類別'), contactPhone: pick('contact_phone', '聯絡電話')
    };
    activity.sportCategory = inferSport(activity);
    return activity;
  }

  function buildFilters() {
    const types = unique(state.activities.map((item) => item.type).filter(Boolean));
    const ordered = [...(CONFIG.TYPE_ORDER || [])].filter((type) => types.includes(type)); types.forEach((type) => { if (!ordered.includes(type)) ordered.push(type); });
    els.typeFilters.innerHTML = ''; els.typeFilters.appendChild(filterButton('全部', ''));
    ordered.forEach((type) => els.typeFilters.appendChild(filterButton(type, type)));
    const departments = unique(state.activities.map((item) => item.department).filter(Boolean)).sort(localeSort);
    els.departmentFilter.innerHTML = '<option value="">全部科室</option>' + departments.map((department) => `<option value="${escapeAttr(department)}">${escapeHtml(department)}</option>`).join('');
    els.departmentFilter.value = state.department;
  }

  function filterButton(label, value) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `filter-chip${state.type === value ? ' is-active' : ''}`; button.textContent = label; button.dataset.value = value;
    button.addEventListener('click', () => { state.type = value; [...els.typeFilters.querySelectorAll('.filter-chip')].forEach((chip) => chip.classList.toggle('is-active', chip.dataset.value === value)); render(); });
    return button;
  }

  function render() {
    const monthActivities = state.activities.filter((activity) => occursInMonth(activity, state.month)).sort(activitySort);
    renderSportFilters(monthActivities); renderMonopoly(monthActivities);
    const filtered = monthActivities
      .filter((activity) => !state.sport || activity.sportCategory === state.sport)
      .filter((activity) => !state.type || activity.type === state.type)
      .filter((activity) => !state.department || activity.department === state.department)
      .filter((activity) => matchesQuery(activity, state.query));
    state.filtered = filtered;
    renderHero(monthActivities, filtered); renderFeatured(filtered.filter((activity) => activity.featured)); renderActivities(filtered); renderActiveFilterSummary(); updateUrl();
  }

  function renderHero(monthActivities, filtered) {
    const date = monthDate(state.month); const label = `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
    els.heroMonth.textContent = `${date.getMonth() + 1} 月`; els.heroCardMonth.textContent = `${String(date.getMonth() + 1).padStart(2, '0')}月`;
    els.heroCount.textContent = state.sport || state.type || state.department || state.query ? `${filtered.length}/${monthActivities.length}` : String(monthActivities.length);
    els.heroUpdated.textContent = new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric' }).format(new Date());
    els.monthLabel.textContent = label; els.resultCount.textContent = String(filtered.length);
  }

  function renderLatest() {
    const today = startOfToday();
    const upcoming = state.activities.filter((a) => (parseLocalDate(a.endDate) || parseLocalDate(a.startDate) || new Date(0)) >= today)
      .sort((a, b) => (parseLocalDate(a.startDate) || new Date(8640000000000000)) - (parseLocalDate(b.startDate) || new Date(8640000000000000)))
      .slice(0, 4);
    els.latestSection.classList.toggle('is-hidden', upcoming.length === 0);
    els.latestRail.innerHTML = upcoming.map((activity) => {
      const meta = sportMeta(activity.sportCategory);
      return `<button class="latest-card sport-${meta.key}" type="button" data-detail-id="${escapeAttr(activity.id)}"><span class="latest-icon">${meta.icon}</span><span class="latest-copy"><small>${escapeHtml(formatDateRange(activity))} · ${escapeHtml(activity.sportCategory)}</small><strong>${escapeHtml(activity.title)}</strong><em>${escapeHtml(activity.location || '地點依公告')}</em></span><span class="latest-arrow">→</span></button>`;
    }).join('');
    els.latestRail.querySelectorAll('[data-detail-id]').forEach((node) => node.addEventListener('click', () => openDetails(node.dataset.detailId)));
  }

  function renderSportFilters(monthActivities) {
    const counts = new Map(); monthActivities.forEach((a) => counts.set(a.sportCategory, (counts.get(a.sportCategory) || 0) + 1));
    const configured = CONFIG.SPORT_ORDER || Object.keys(SPORT_META);
    const sports = [...configured.filter((s) => counts.has(s)), ...[...counts.keys()].filter((s) => !configured.includes(s))];
    const cards = [{ name: '', label: '全部運動', icon: '✨', key: 'all', count: monthActivities.length }, ...sports.map((name) => ({ name, label: name, ...sportMeta(name), count: counts.get(name) || 0 }))];
    els.sportFilters.innerHTML = cards.map((item) => `<button class="sport-filter sport-${item.key}${state.sport === item.name ? ' is-active' : ''}" type="button" data-sport="${escapeAttr(item.name)}"><span class="sport-filter-icon">${item.icon}</span><span><strong>${escapeHtml(item.label)}</strong><small>${item.count} 個活動</small></span></button>`).join('');
    els.sportFilters.querySelectorAll('[data-sport]').forEach((button) => button.addEventListener('click', () => { state.sport = button.dataset.sport; render(); el('activitiesTitle').scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    els.resetSportBtn.classList.toggle('is-hidden', !state.sport);
  }

  function renderFeatured(featured) {
    const picks = featured.slice(0, 4); els.featuredSection.classList.toggle('is-hidden', picks.length === 0);
    els.featuredGrid.innerHTML = picks.map(featureCardHtml).join('');
    els.featuredGrid.querySelectorAll('[data-detail-id]').forEach((node) => node.addEventListener('click', () => openDetails(node.dataset.detailId)));
  }

  function featureCardHtml(activity) {
    const visual = featureVisualHtml(activity);
    return `<article class="feature-card">${visual}<div class="feature-content"><div class="feature-tags"><span>${escapeHtml(activity.sportCategory)}</span><span>${escapeHtml(activity.type || '活動')}</span></div><h3>${escapeHtml(activity.title)}</h3><p>${escapeHtml(formatDateRange(activity))}${formatTimeRange(activity) ? ` · ${escapeHtml(formatTimeRange(activity))}` : ''}${activity.location ? ` · ${escapeHtml(activity.location)}` : ''}</p><button class="feature-action text-button" type="button" data-detail-id="${escapeAttr(activity.id)}">查看活動 →</button></div></article>`;
  }

  function renderActivities(activities) {
    els.activityGrid.classList.toggle('is-list', state.view === 'list'); els.activityGrid.innerHTML = activities.map(activityCardHtml).join('');
    els.emptyState.classList.toggle('is-hidden', activities.length > 0);
    els.activityGrid.querySelectorAll('[data-detail-id]').forEach((node) => node.addEventListener('click', () => openDetails(node.dataset.detailId)));
    els.activityGrid.querySelectorAll('[data-share-id]').forEach((node) => node.addEventListener('click', () => shareActivity(node.dataset.shareId)));
  }

  function activityCardHtml(activity) {
    const date = parseLocalDate(activity.startDate); const day = date ? date.getDate() : '—'; const month = date ? `${date.getMonth() + 1}月` : '';
    const primaryUrl = activity.registrationUrl || activity.infoUrl; const primaryLabel = activity.registrationUrl ? '我要報名' : activity.infoUrl ? '官方資訊' : '查看詳情';
    const primaryAction = primaryUrl ? `<a class="button button-primary" href="${escapeAttr(primaryUrl)}" target="_blank" rel="noopener">${primaryLabel}</a>` : `<button class="button button-primary" type="button" data-detail-id="${escapeAttr(activity.id)}">查看詳情</button>`;
    return `<article class="activity-card">${cardVisualHtml(activity, day, month)}<div class="card-body"><div class="card-kicker"><span>${escapeHtml(activity.sportCategory)} · ${escapeHtml(activity.type || '活動')}</span><span>${escapeHtml(activity.department || '')}</span></div><h3>${escapeHtml(activity.title)}</h3><p class="summary">${escapeHtml(activity.summary || activity.details || '點擊查看活動資訊。')}</p><div class="card-meta"><span>📅 <b>${escapeHtml(formatDateRange(activity))}${formatTimeRange(activity) ? `｜${escapeHtml(formatTimeRange(activity))}` : ''}</b></span>${activity.location ? `<span>📍 <b>${escapeHtml(activity.location)}</b></span>` : ''}${activity.contactPhone ? `<span>☎ <b>${escapeHtml(activity.contactPhone)}</b></span>` : ''}</div><div class="card-actions">${primaryAction}<button class="button button-soft" type="button" data-detail-id="${escapeAttr(activity.id)}">詳情</button><button class="card-share" type="button" data-share-id="${escapeAttr(activity.id)}" aria-label="分享活動">↗</button></div></div></article>`;
  }

  function cardVisualHtml(activity, day, month) {
    const meta = sportMeta(activity.sportCategory);
    if (activity.imageUrl) return `<div class="card-image has-photo sport-${meta.key}" style="background-image:url('${escapeAttr(activity.imageUrl)}')"><div class="card-date-badge"><strong>${escapeHtml(String(day))}</strong><small>${escapeHtml(month)}</small></div><span class="visual-sport-tag">${meta.icon} ${escapeHtml(activity.sportCategory)}</span></div>`;
    return `<div class="card-image fallback-visual sport-${meta.key}"><div class="fallback-pattern"></div><div class="fallback-sport"><span>${meta.icon}</span><strong>${escapeHtml(activity.sportCategory)}</strong><small>${escapeHtml(activity.type || '運動活動')}</small></div><div class="card-date-badge"><strong>${escapeHtml(String(day))}</strong><small>${escapeHtml(month)}</small></div></div>`;
  }

  function featureVisualHtml(activity) {
    const meta = sportMeta(activity.sportCategory);
    if (activity.imageUrl) return `<div class="feature-image sport-${meta.key}" style="background-image:url('${escapeAttr(activity.imageUrl)}')"></div>`;
    return `<div class="feature-fallback sport-${meta.key}"><div class="feature-fallback-icon">${meta.icon}</div><div class="feature-fallback-label">${escapeHtml(activity.sportCategory)}</div></div>`;
  }

  function renderActiveFilterSummary() {
    const parts = [];
    if (state.sport) parts.push(`運動：${state.sport}`); if (state.type) parts.push(`形式：${state.type}`); if (state.department) parts.push(`科室：${state.department}`); if (state.query) parts.push(`搜尋：「${state.query}」`);
    els.activeFilterSummary.classList.toggle('is-hidden', parts.length === 0);
    els.activeFilterSummary.innerHTML = parts.length ? `<span>目前篩選</span><strong>${parts.map(escapeHtml).join('　·　')}</strong><button id="clearActiveFilters" type="button">全部清除</button>` : '';
    const clear = el('clearActiveFilters'); if (clear) clear.addEventListener('click', resetFilters);
  }

  function renderMonopoly(monthActivities) {
    const activities = [...monthActivities].sort(boardSort); const maxPosition = activities.length;
    if (state.boardPosition > maxPosition) state.boardPosition = maxPosition;
    const cells = [{ start: true, label: 'START', title: '本月起點', icon: '🚩' }, ...activities.map((a) => ({ activity: a, label: formatShortDate(a.startDate), title: a.title, icon: sportMeta(a.sportCategory).icon }))];
    els.monopolyBoard.innerHTML = cells.map((cell, index) => {
      const player = index === state.boardPosition ? '<span class="board-player" aria-label="目前位置">👟</span>' : '';
      if (cell.start) return `<div class="board-cell board-start${index === state.boardPosition ? ' is-current' : ''}">${player}<span class="board-cell-icon">${cell.icon}</span><strong>${cell.label}</strong><small>${cell.title}</small></div>`;
      const meta = sportMeta(cell.activity.sportCategory);
      return `<button class="board-cell sport-${meta.key}${index === state.boardPosition ? ' is-current' : ''}" type="button" data-detail-id="${escapeAttr(cell.activity.id)}">${player}<span class="board-cell-icon">${cell.icon}</span><strong>${escapeHtml(cell.label)}</strong><small>${escapeHtml(cell.title)}</small></button>`;
    }).join('');
    els.monopolyBoard.querySelectorAll('[data-detail-id]').forEach((node) => node.addEventListener('click', () => openDetails(node.dataset.detailId)));
    els.rollDiceBtn.disabled = activities.length === 0;
    if (!activities.length) els.boardMessage.textContent = '這個月目前還沒有活動格，等小編新增活動後就會自動長出來。';
  }

  function rollDice() {
    const activities = state.activities.filter((a) => occursInMonth(a, state.month)).sort(boardSort);
    if (!activities.length) return;
    const roll = Math.floor(Math.random() * 6) + 1; els.diceFace.textContent = ['⚀','⚁','⚂','⚃','⚄','⚅'][roll - 1];
    const totalCells = activities.length + 1; state.boardPosition = (state.boardPosition + roll) % totalCells;
    renderMonopoly(activities);
    if (state.boardPosition === 0) els.boardMessage.textContent = `擲到 ${roll} 點，繞了一圈回到起點！再來一次看看。`;
    else { const activity = activities[state.boardPosition - 1]; els.boardMessage.innerHTML = `擲到 <strong>${roll}</strong> 點！走到「<button type="button" id="boardResultBtn">${escapeHtml(activity.title)}</button>」`; const button = el('boardResultBtn'); if (button) button.addEventListener('click', () => openDetails(activity.id)); }
  }

  function resetBoard() { state.boardPosition = 0; els.diceFace.textContent = '🎲'; els.boardMessage.textContent = '目前在起點，擲骰開始探索！'; renderMonopoly(state.activities.filter((a) => occursInMonth(a, state.month)).sort(boardSort)); }

  function openDetails(id) {
    const activity = state.activities.find((item) => item.id === id); if (!activity) return;
    const meta = sportMeta(activity.sportCategory); const cover = activity.imageUrl ? `<div class="detail-cover sport-${meta.key}" style="background-image:url('${escapeAttr(activity.imageUrl)}')"></div>` : `<div class="detail-cover detail-fallback sport-${meta.key}"><span>${meta.icon}</span><strong>${escapeHtml(activity.sportCategory)}</strong></div>`;
    const registration = activity.registrationUrl ? `<a class="button button-primary" href="${escapeAttr(activity.registrationUrl)}" target="_blank" rel="noopener">前往報名</a>` : '';
    const info = activity.infoUrl ? `<a class="button button-soft" href="${escapeAttr(activity.infoUrl)}" target="_blank" rel="noopener">官方詳細資訊</a>` : '';
    const phone = activity.contactPhone ? `<a class="button button-soft" href="tel:${escapeAttr(phoneForTel(activity.contactPhone))}">☎ 撥打 ${escapeHtml(activity.contactPhone)}</a>` : '';
    const map = activity.location ? `<a class="button button-ghost" href="${escapeAttr(mapUrl(activity.location))}" target="_blank" rel="noopener">📍 開啟地圖</a>` : '';
    els.detailContent.innerHTML = `${cover}<div class="detail-body"><div class="detail-badges"><span>${meta.icon} ${escapeHtml(activity.sportCategory)}</span><span>${escapeHtml(activity.type || '活動')}</span></div><h2>${escapeHtml(activity.title)}</h2><p>${escapeHtml(activity.details || activity.summary || '活動詳細資訊請依主辦單位公告。')}</p><div class="detail-info"><div><small>日期</small><strong>${escapeHtml(formatDateRange(activity, true))}</strong></div><div><small>時間</small><strong>${escapeHtml(formatTimeRange(activity) || '依主辦單位公告')}</strong></div><div><small>地點</small><strong>${escapeHtml(activity.location || '依主辦單位公告')}</strong></div><div><small>聯絡電話</small><strong>${escapeHtml(activity.contactPhone || '依主辦單位公告')}</strong></div><div><small>運動類別</small><strong>${escapeHtml(activity.sportCategory)}</strong></div><div><small>承辦／維護</small><strong>${escapeHtml(activity.department || '—')}</strong></div></div><div class="detail-actions">${registration}${info}${phone}${map}<a class="button button-ghost" href="${escapeAttr(calendarUrl(activity))}" target="_blank" rel="noopener">＋ 加入行事曆</a><button class="button button-ghost" type="button" id="dialogShareBtn">分享這個活動</button></div></div>`;
    els.detailDialog.showModal(); history.replaceState({}, '', eventUrl(activity.id)); el('dialogShareBtn').addEventListener('click', () => shareActivity(activity.id));
  }

  function closeDetails() { if (els.detailDialog.open) els.detailDialog.close(); const url = new URL(window.location.href); url.searchParams.delete('event'); history.replaceState({}, '', url); }
  function openEventFromUrl() { const id = new URL(window.location.href).searchParams.get('event'); if (id && state.activities.some((activity) => activity.id === id)) openDetails(id); }

  async function shareActivity(id) {
    const activity = state.activities.find((item) => item.id === id); if (!activity) return; const url = eventUrl(id).toString();
    if (navigator.share) { try { await navigator.share({ title: activity.title, text: activity.summary || '高雄運動活動資訊', url }); return; } catch (error) { if (error && error.name === 'AbortError') return; } }
    await copyText(url); toast('已複製活動連結');
  }

  async function copyMonthlyUrl() { const url = new URL(window.location.href); url.search = ''; url.searchParams.set('month', state.month); await copyText(url.toString()); toast(`已複製 ${Number(state.month.slice(5))} 月活動入口網址`); }

  function resetFilters() {
    state.type = ''; state.sport = ''; state.department = ''; state.query = ''; els.searchInput.value = ''; els.departmentFilter.value = '';
    [...els.typeFilters.querySelectorAll('.filter-chip')].forEach((chip) => chip.classList.toggle('is-active', chip.dataset.value === '')); render();
  }

  function shiftMonth(delta) { const date = monthDate(state.month); date.setMonth(date.getMonth() + delta); state.month = monthKey(date); state.boardPosition = 0; setMonthUI(); render(); }
  function setMonthUI() { els.monthPicker.value = state.month; const date = monthDate(state.month); els.monthLabel.textContent = `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`; }
  function setView(view) { state.view = view === 'list' ? 'list' : 'grid'; localStorage.setItem('activityHubView', state.view); els.gridViewBtn.classList.toggle('is-active', state.view === 'grid'); els.listViewBtn.classList.toggle('is-active', state.view === 'list'); els.gridViewBtn.setAttribute('aria-pressed', String(state.view === 'grid')); els.listViewBtn.setAttribute('aria-pressed', String(state.view === 'list')); if (state.activities.length) renderActivities(state.filtered); }

  function occursInMonth(activity, key) {
    const monthStart = monthDate(key); const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59);
    const start = parseLocalDate(activity.startDate) || monthStart; const end = parseLocalDate(activity.endDate) || start; return start <= monthEnd && end >= monthStart;
  }
  function matchesQuery(activity, query) { if (!query) return true; const needle = query.toLocaleLowerCase('zh-TW'); return [activity.title, activity.department, activity.type, activity.sportCategory, activity.location, activity.summary, activity.details, activity.contactPhone].join(' ').toLocaleLowerCase('zh-TW').includes(needle); }
  function activitySort(a, b) { if (a.sortOrder !== b.sortOrder) return b.sortOrder - a.sortOrder; return String(a.startDate).localeCompare(String(b.startDate)) || localeSort(a.title, b.title); }
  function boardSort(a, b) { return String(a.startDate).localeCompare(String(b.startDate)) || localeSort(a.title, b.title); }

  function formatDateRange(activity, full = false) {
    const start = parseLocalDate(activity.startDate); const end = parseLocalDate(activity.endDate); if (!start) return '日期依公告';
    const fmt = (date, includeYear) => `${includeYear ? `${date.getFullYear()}年` : ''}${date.getMonth() + 1}月${date.getDate()}日（${'日一二三四五六'[date.getDay()]}）`;
    const same = !end || sameDate(start, end); if (same) return fmt(start, full);
    const crossYear = start.getFullYear() !== end.getFullYear(); return `${fmt(start, full || crossYear)}－${fmt(end, full || crossYear)}`;
  }
  function formatShortDate(value) { const date = parseLocalDate(value); return date ? `${date.getMonth() + 1}/${date.getDate()}` : '日期'; }
  function formatTimeRange(activity) { if (!activity.startTime && !activity.endTime) return ''; if (activity.startTime && activity.endTime) return `${activity.startTime}－${activity.endTime}`; return activity.startTime || activity.endTime; }

  function normalizeImageUrl(value) { const url = cleanUrl(value); if (!url) return ''; const driveMatch = url.match(/(?:\/d\/|id=)([a-zA-Z0-9_-]{20,})/); return driveMatch ? `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w1600` : url; }
  function cleanUrl(value) { const url = String(value || '').trim(); if (!url) return ''; if (/^https?:\/\//i.test(url)) return url; if (/^www\./i.test(url)) return `https://${url}`; return url; }

  function normalizeDate(value) {
    let text = String(value || '').trim(); if (!text) return '';
    text = text.replace(/[年月]/g, '-').replace(/日/g, '').replace(/\./g, '/').replace(/\s+.*/, '');
    const match = text.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/) || text.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (match) return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
    const parsed = new Date(text); if (!Number.isNaN(parsed.getTime())) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`; return '';
  }

  function normalizeTime(value) {
    let text = String(value || '').trim(); if (!text) return '';
    let m = text.match(/^(上午|下午)\s*(\d{1,2}):(\d{2})(?::\d{2})?$/); if (m) { let h = Number(m[2]); if (m[1] === '下午' && h < 12) h += 12; if (m[1] === '上午' && h === 12) h = 0; return `${String(h).padStart(2, '0')}:${m[3]}`; }
    m = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i); if (m) { let h = Number(m[1]); const ap = m[3].toUpperCase(); if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0; return `${String(h).padStart(2, '0')}:${m[2]}`; }
    m = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/); if (m) return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
    return text;
  }

  function parseLocalDate(value) { const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!match) return null; const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])); return Number.isNaN(date.getTime()) ? null : date; }
  function sameDate(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function startOfToday() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  function inferSport(activity) {
    if (activity.sportCategory && SPORT_META[activity.sportCategory]) return activity.sportCategory;
    const text = `${activity.title || ''} ${activity.summary || ''} ${activity.details || ''} ${activity.type || ''}`.toLowerCase();
    const rules = [
      ['水域', /龍舟|造筏|游泳|水域|獨木舟|SUP|划船|帆船|潛水|衝浪/i], ['跑步健走', /跑步|路跑|馬拉松|健走|田徑|夜跑|慢跑/i],
      ['單車', /單車|自行車|腳踏車|騎行|bike|cycling/i], ['球類', /籃球|足球|棒球|壘球|排球|羽球|網球|桌球|匹克球|球類|高爾夫/i],
      ['舞蹈韻律', /舞蹈|韻律|有氧|瑜珈|瑜伽|zumba|街舞|太極/i], ['武術格鬥', /跆拳|柔道|空手道|拳擊|武術|格鬥|角力|擊劍/i],
      ['樂齡', /樂齡|銀髮|高齡|長者|長輩/i], ['親子', /親子|兒童|小小|家庭|親幼/i], ['戶外休閒', /登山|健行|露營|攀岩|戶外|定向|飛盤/i],
      ['健身體適能', /肌力|體適能|健身|核心|伸展|重量|體能/i]
    ];
    for (const [sport, regex] of rules) if (regex.test(text)) return sport;
    return activity.type === '賽事' ? '綜合運動' : activity.type === '課程' ? '健身體適能' : '其他';
  }

  function sportMeta(name) { return SPORT_META[name] || { icon: '✨', key: 'other' }; }
  function phoneForTel(phone) { return String(phone || '').replace(/[^\d+#*]/g, ''); }
  function mapUrl(location) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`; }

  function calendarUrl(activity) {
    const start = parseLocalDate(activity.startDate); const end = parseLocalDate(activity.endDate) || start; if (!start) return 'https://calendar.google.com/calendar/u/0/r';
    const timed = Boolean(activity.startTime); const startStamp = calendarStamp(start, activity.startTime || '00:00');
    let endStamp; if (timed) endStamp = calendarStamp(end, activity.endTime || activity.startTime || '23:59'); else { const next = new Date(end); next.setDate(next.getDate() + 1); endStamp = `${next.getFullYear()}${String(next.getMonth()+1).padStart(2,'0')}${String(next.getDate()).padStart(2,'0')}`; }
    const startValue = timed ? startStamp : `${start.getFullYear()}${String(start.getMonth()+1).padStart(2,'0')}${String(start.getDate()).padStart(2,'0')}`;
    const params = new URLSearchParams({ action: 'TEMPLATE', text: activity.title, dates: `${startValue}/${endStamp}`, details: activity.summary || activity.details || '', location: activity.location || '', ctz: 'Asia/Taipei' });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }
  function calendarStamp(date, time) { const [h, m] = String(time || '00:00').split(':'); return `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}T${String(h||'00').padStart(2,'0')}${String(m||'00').padStart(2,'0')}00`; }

  function parseCSV(text) {
    const rows = []; let row = []; let value = ''; let quoted = false;
    for (let i = 0; i < text.length; i += 1) { const char = text[i]; const next = text[i + 1]; if (quoted) { if (char === '"' && next === '"') { value += '"'; i += 1; } else if (char === '"') quoted = false; else value += char; } else if (char === '"') quoted = true; else if (char === ',') { row.push(value); value = ''; } else if (char === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; } else value += char; }
    if (value.length || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); } return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
  }

  function hydrateFromUrl() { const url = new URL(window.location.href); const month = url.searchParams.get('month'); if (/^\d{4}-\d{2}$/.test(month || '')) state.month = month; }
  function updateUrl() { const url = new URL(window.location.href); url.searchParams.set('month', state.month); if (!url.searchParams.get('event')) history.replaceState({}, '', url); }
  function eventUrl(id) { const url = new URL(window.location.href); url.searchParams.set('month', state.month); url.searchParams.set('event', id); return url; }
  function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
  function monthDate(key) { const [year, month] = String(key).split('-').map(Number); return new Date(year || new Date().getFullYear(), (month || 1) - 1, 1); }
  function truthy(value) { return ['1', 'true', 'yes', 'y', '是', '焦點', 'v', '✓'].includes(String(value || '').trim().toLowerCase()); }
  function unique(values) { return [...new Set(values)]; }
  function localeSort(a, b) { return String(a).localeCompare(String(b), 'zh-Hant'); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
  function escapeAttr(value) { return escapeHtml(value); }

  async function copyText(text) { if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text); const textarea = document.createElement('textarea'); textarea.value = text; textarea.style.position = 'fixed'; textarea.style.opacity = '0'; document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); textarea.remove(); }
  let toastTimer; function toast(message) { clearTimeout(toastTimer); els.toast.textContent = message; els.toast.classList.add('is-visible'); toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 1800); }
  function showNotice(message) { els.statusNotice.textContent = message; els.statusNotice.classList.remove('is-hidden'); }
  function debounce(fn, wait) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; }

  function demoActivities() {
    const year = new Date().getFullYear(), month = new Date().getMonth() + 1; const mk = (day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return [
      { id:'demo-raft', title:'高雄創意造筏競賽', department:'全民運動科', type:'賽事', sportCategory:'水域', contactPhone:'07-581-3680 分機 408', startDate:mk(22), endDate:mk(23), startTime:'14:00', endTime:'17:00', location:'高雄港灣', summary:'自己動手造船、現場試航，一起把創意划進港都。', details:'示範活動：這裡可以放比賽介紹、參加資格、注意事項與報名方式。', registrationUrl:'', infoUrl:'', imageUrl:'', featured:true, status:'發布', sortOrder:100 },
      { id:'demo-running', title:'港都夜跑體驗班', department:'全民運動科', type:'課程', sportCategory:'跑步健走', contactPhone:'07-581-3680 分機 405', startDate:mk(7), endDate:mk(28), startTime:'18:30', endTime:'20:00', location:'苓雅運動園區', summary:'從暖身、配速到跑姿，適合想開始規律跑步的市民。', details:'', registrationUrl:'', infoUrl:'', imageUrl:'', featured:true, status:'發布', sortOrder:80 },
      { id:'demo-senior', title:'樂齡肌力動起來', department:'全民運動科', type:'體驗', sportCategory:'樂齡', contactPhone:'07-581-3680', startDate:mk(16), endDate:mk(16), startTime:'09:30', endTime:'11:30', location:'前金運動中心', summary:'簡單、安全、好上手的樂齡運動體驗。', details:'', registrationUrl:'', infoUrl:'', imageUrl:'', featured:false, status:'發布', sortOrder:20 },
      { id:'demo-ball', title:'夏日親子籃球日', department:'競技運動科', type:'活動', sportCategory:'球類', contactPhone:'07-581-3680', startDate:mk(25), endDate:mk(25), startTime:'15:00', endTime:'18:00', location:'高雄市區', summary:'一起認識籃球、親子上場動一動。', details:'', registrationUrl:'', infoUrl:'', imageUrl:'', featured:false, status:'發布', sortOrder:10 }
    ];
  }
})();
