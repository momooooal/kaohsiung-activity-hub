(() => {
  const cfg = window.APP_CONFIG || {};
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('YOUR_') && cfg.SUPABASE_KEY && !cfg.SUPABASE_KEY.includes('YOUR_');
  const client = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY) : null;

  const state = {
    month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    activities: [],
    departments: [],
    view: 'grid'
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    monthLabel: $('monthLabel'), search: $('searchInput'), department: $('departmentFilter'), category: $('categoryFilter'),
    grid: $('activityGrid'), featured: $('featuredGrid'), featuredSection: $('featuredSection'), empty: $('emptyState'),
    count: $('resultCount'), hint: $('resultHint'), toast: $('toast')
  };

  const demoDepartments = [
    { id: 'd1', name: '全民運動科' }, { id: 'd2', name: '競技運動科' }, { id: 'd3', name: '綜合企劃科' }
  ];
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const demoActivities = [
    { id:'a1', title:'港都夜跑體驗班', summary:'一起在城市夜色裡跑起來，適合想建立規律跑步習慣的市民。', start_date:`${yyyy}-${mm}-18`, end_date:`${yyyy}-${mm}-18`, location:'苓雅運動園區田徑場', category:'課程', department_id:'d1', departments:{name:'全民運動科'}, registration_url:'#', info_url:'#', image_url:'', featured:true, published:true },
    { id:'a2', title:'創意造筏挑戰日', summary:'把腦洞變成能下水的作品！組隊挑戰創意、速度與團隊默契。', start_date:`${yyyy}-${mm}-23`, end_date:`${yyyy}-${mm}-24`, location:'愛河水域', category:'賽事', department_id:'d2', departments:{name:'競技運動科'}, registration_url:'#', info_url:'#', image_url:'', featured:false, published:true },
    { id:'a3', title:'銀髮活力運動體驗', summary:'從安全、好上手的運動開始，帶長輩一起動得開心、動得長久。', start_date:`${yyyy}-${mm}-27`, end_date:`${yyyy}-${mm}-27`, location:'前金運動中心', category:'體驗', department_id:'d1', departments:{name:'全民運動科'}, registration_url:'#', info_url:'#', image_url:'', featured:false, published:true }
  ];

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  function escapeHtml(value='') {
    return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function formatDateRange(a) {
    const start = new Date(`${a.start_date}T00:00:00`);
    const end = a.end_date ? new Date(`${a.end_date}T00:00:00`) : start;
    const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;
    return a.end_date && a.end_date !== a.start_date ? `${fmt(start)} — ${fmt(end)}` : fmt(start);
  }

  function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }
  function updateMonthLabel() { els.monthLabel.textContent = `${state.month.getFullYear()} 年 ${state.month.getMonth()+1} 月`; }

  function activityCard(a, featured=false) {
    const dept = a.departments?.name || '活動小編';
    const imageStyle = a.image_url ? `style="background-image:url('${escapeHtml(a.image_url)}')"` : '';
    const hasLink = a.registration_url || a.info_url;
    const primary = a.registration_url || a.info_url || '#';
    return `
      <article class="activity-card ${featured ? 'featured-card' : ''}">
        <div class="activity-image ${a.image_url ? 'has-image' : ''}" ${imageStyle}>
          <span class="category-pill">${escapeHtml(a.category || '活動')}</span>
          ${featured ? '<span class="featured-pill">本月焦點</span>' : ''}
          ${!a.image_url ? '<div class="image-placeholder"><span>KAOHSIUNG</span><strong>SPORTS</strong></div>' : ''}
        </div>
        <div class="activity-body">
          <div class="activity-meta"><span>${escapeHtml(formatDateRange(a))}</span><span>${escapeHtml(dept)}</span></div>
          <h3>${escapeHtml(a.title)}</h3>
          <p>${escapeHtml(a.summary || '')}</p>
          <div class="activity-info">
            ${a.location ? `<span>⌖ ${escapeHtml(a.location)}</span>` : ''}
          </div>
          <div class="activity-actions">
            ${hasLink ? `<a class="primary-btn small" href="${escapeHtml(primary)}" target="_blank" rel="noopener">${a.registration_url ? '我要報名' : '查看詳情'} ↗</a>` : '<span class="muted">詳細資訊陸續更新</span>'}
            <button class="ghost-btn small copy-activity" data-id="${escapeHtml(a.id)}" type="button">分享</button>
          </div>
        </div>
      </article>`;
  }

  function filteredActivities() {
    const key = monthKey(state.month);
    const q = els.search.value.trim().toLowerCase();
    const dep = els.department.value;
    const cat = els.category.value;
    return state.activities.filter(a => {
      const eventMonth = String(a.start_date || '').slice(0,7);
      const text = `${a.title} ${a.summary || ''} ${a.location || ''} ${a.departments?.name || ''} ${a.category || ''}`.toLowerCase();
      return eventMonth === key && (!q || text.includes(q)) && (!dep || a.department_id === dep) && (!cat || a.category === cat);
    }).sort((a,b) => String(a.start_date).localeCompare(String(b.start_date)));
  }

  function render() {
    updateMonthLabel();
    const items = filteredActivities();
    const featured = items.filter(a => a.featured);
    els.count.textContent = items.length;
    els.hint.textContent = items.length ? `已整理 ${state.month.getMonth()+1} 月最新活動，可再用關鍵字快速縮小範圍。` : '這個月份目前還沒有符合條件的活動。';
    els.grid.className = `activity-grid ${state.view === 'list' ? 'list-view' : ''}`;
    els.grid.innerHTML = items.map(a => activityCard(a)).join('');
    els.featured.innerHTML = featured.map(a => activityCard(a, true)).join('');
    els.featuredSection.classList.toggle('hidden', featured.length === 0);
    els.empty.classList.toggle('hidden', items.length !== 0);
    bindShareButtons();
  }

  function populateDepartments() {
    const options = state.departments.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join('');
    els.department.insertAdjacentHTML('beforeend', options);
  }

  async function loadData() {
    if (!configured) {
      state.departments = demoDepartments;
      state.activities = demoActivities;
      populateDepartments();
      render();
      els.hint.textContent += '（目前為未連線示範資料）';
      return;
    }
    const [{data: departments, error: depError}, {data: activities, error: actError}] = await Promise.all([
      client.from('departments').select('id,name').eq('active', true).order('sort_order'),
      client.from('activities').select('*, departments(name)').eq('published', true).order('start_date')
    ]);
    if (depError || actError) {
      console.error(depError || actError);
      els.hint.textContent = '活動資料暫時無法載入，請稍後再試。';
      return;
    }
    state.departments = departments || [];
    state.activities = activities || [];
    populateDepartments();
    render();
  }

  function bindShareButtons() {
    document.querySelectorAll('.copy-activity').forEach(btn => btn.addEventListener('click', async () => {
      const a = state.activities.find(x => String(x.id) === String(btn.dataset.id));
      if (!a) return;
      const text = `${a.title}｜${a.location || ''}\n${location.href}`;
      if (navigator.share) {
        try { await navigator.share({ title: a.title, text, url: location.href }); return; } catch (_) {}
      }
      await navigator.clipboard.writeText(text);
      toast('活動資訊已複製');
    }));
  }

  $('prevMonthBtn').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth()-1, 1); render(); });
  $('nextMonthBtn').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth()+1, 1); render(); });
  $('monthPickerBtn').addEventListener('click', () => { const n = new Date(); state.month = new Date(n.getFullYear(), n.getMonth(), 1); render(); });
  [els.search, els.department, els.category].forEach(el => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', render));
  $('clearFiltersBtn').addEventListener('click', () => { els.search.value=''; els.department.value=''; els.category.value=''; render(); });
  $('resetEmptyBtn').addEventListener('click', () => { const n = new Date(); state.month = new Date(n.getFullYear(), n.getMonth(), 1); els.search.value=''; els.department.value=''; els.category.value=''; render(); });
  document.querySelectorAll('.view-toggle button').forEach(btn => btn.addEventListener('click', () => {
    state.view = btn.dataset.view;
    document.querySelectorAll('.view-toggle button').forEach(x => x.classList.toggle('active', x === btn));
    render();
  }));
  document.addEventListener('keydown', e => { if (e.key === '/' && document.activeElement !== els.search) { e.preventDefault(); els.search.focus(); } });

  async function sharePage() {
    if (navigator.share) { try { await navigator.share({title: document.title, url: location.href}); return; } catch (_) {} }
    await navigator.clipboard.writeText(location.href); toast('活動入口網址已複製');
  }
  $('sharePageBtn').addEventListener('click', sharePage);
  $('copyPageBtn').addEventListener('click', sharePage);

  loadData();
})();
