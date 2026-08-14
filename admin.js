(() => {
  const cfg = window.APP_CONFIG || {};
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('YOUR_') && cfg.SUPABASE_KEY && !cfg.SUPABASE_KEY.includes('YOUR_');
  const client = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY) : null;
  const $ = id => document.getElementById(id);
  const state = { user:null, profile:null, departments:[], activities:[], audit:[] };
  const globalRoles = new Set(['chief_editor','planning_editor']);
  const roleLabels = { department_editor:'科室小編', chief_editor:'總編', planning_editor:'綜企科小編' };

  function escapeHtml(value='') { return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
  function toast(message) { const el=$('toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.remove('show'),2200); }
  function setMsg(id, text, isError=false) { const el=$(id); el.textContent=text; el.classList.toggle('error', isError); }
  function isGlobal() { return globalRoles.has(state.profile?.role); }
  function manageable(a) { return isGlobal() || a.department_id === state.profile?.department_id; }

  if (!configured) $('setupWarning').classList.remove('hidden');

  async function getProfile(user) {
    const { data, error } = await client.from('profiles').select('*, departments(name)').eq('id', user.id).eq('active', true).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function afterLogin(user) {
    const profile = await getProfile(user);
    if (!profile) {
      await client.auth.signOut();
      throw new Error('此信箱尚未被加入允許名單，請聯絡總編或系統管理者。');
    }
    state.user = user; state.profile = profile;
    $('loginPanel').classList.add('hidden'); $('dashboard').classList.remove('hidden'); $('logoutBtn').classList.remove('hidden');
    $('profileName').textContent = profile.display_name || user.email.split('@')[0];
    $('profileDept').textContent = profile.departments?.name || (isGlobal() ? '跨科室管理' : '未設定科室');
    $('profileAvatar').textContent = (profile.display_name || '小').slice(0,1);
    $('roleBadge').textContent = roleLabels[profile.role] || profile.role;
    $('permissionHint').textContent = isGlobal() ? '你可以新增、編輯與刪除全部科室活動。' : '你只能新增、編輯與刪除自己科室的活動。';
    await loadDashboardData();
  }

  async function loadDashboardData() {
    const [depsRes, actsRes] = await Promise.all([
      client.from('departments').select('*').eq('active', true).order('sort_order'),
      client.from('activities').select('*, departments(name)').order('start_date', {ascending:false})
    ]);
    if (depsRes.error) throw depsRes.error;
    if (actsRes.error) throw actsRes.error;
    state.departments = depsRes.data || [];
    state.activities = actsRes.data || [];
    populateDepartmentOptions(); renderAdminList();
  }

  function populateDepartmentOptions() {
    const available = isGlobal() ? state.departments : state.departments.filter(d => d.id === state.profile.department_id);
    const options = available.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join('');
    $('activityDepartment').innerHTML = options;
    $('adminDepartmentFilter').innerHTML = `<option value="">所有可管理科室</option>${options}`;
    $('adminDepartmentFilter').disabled = !isGlobal();
  }

  function filteredAdminActivities() {
    const q = $('adminSearchInput').value.trim().toLowerCase();
    const dep = $('adminDepartmentFilter').value;
    const status = $('adminStatusFilter').value;
    return state.activities.filter(a => manageable(a) && (!q || `${a.title} ${a.summary||''}`.toLowerCase().includes(q)) && (!dep || a.department_id===dep) && (!status || (status==='published' ? a.published : !a.published)));
  }

  function renderAdminList() {
    const items = filteredAdminActivities();
    const allManageable = state.activities.filter(manageable);
    const thisMonth = new Date().toISOString().slice(0,7);
    $('statTotal').textContent = allManageable.length;
    $('statPublished').textContent = allManageable.filter(a=>a.published).length;
    $('statDraft').textContent = allManageable.filter(a=>!a.published).length;
    $('statMonth').textContent = allManageable.filter(a=>String(a.start_date||'').slice(0,7)===thisMonth).length;
    $('adminEmpty').classList.toggle('hidden', items.length>0);
    $('adminActivityList').innerHTML = items.map(a => `
      <article class="admin-activity-row">
        <div class="admin-date"><strong>${escapeHtml(String(a.start_date||'').slice(5).replace('-','/'))}</strong><span>${escapeHtml(a.category||'活動')}</span></div>
        <div class="admin-row-main">
          <div class="admin-row-title"><h3>${escapeHtml(a.title)}</h3><span class="status-pill ${a.published?'published':'draft'}">${a.published?'已發布':'草稿'}</span>${a.featured?'<span class="mini-pill">焦點</span>':''}</div>
          <p>${escapeHtml(a.departments?.name||'')} ${a.location?`・${escapeHtml(a.location)}`:''}</p>
        </div>
        <button class="ghost-btn small edit-btn" data-id="${escapeHtml(a.id)}" type="button">編輯</button>
      </article>`).join('');
    document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => openDialog(state.activities.find(a=>String(a.id)===String(btn.dataset.id)))));
  }

  function openDialog(activity=null) {
    $('activityForm').reset(); setMsg('activityFormMessage',''); $('summaryCount').textContent='0';
    $('activityId').value = activity?.id || '';
    $('dialogTitle').textContent = activity ? '編輯活動' : '新增活動';
    $('deleteActivityBtn').classList.toggle('hidden', !activity);
    const depId = activity?.department_id || state.profile.department_id || state.departments[0]?.id || '';
    $('activityDepartment').value = depId;
    $('activityDepartment').disabled = !isGlobal();
    $('activityTitle').value = activity?.title || '';
    $('activityCategory').value = activity?.category || '課程';
    $('activityStartDate').value = activity?.start_date || '';
    $('activityEndDate').value = activity?.end_date || '';
    $('activityLocation').value = activity?.location || '';
    $('activitySummary').value = activity?.summary || '';
    $('summaryCount').textContent = $('activitySummary').value.length;
    $('registrationUrl').value = activity?.registration_url || '';
    $('infoUrl').value = activity?.info_url || '';
    $('imageUrl').value = activity?.image_url || '';
    $('featuredToggle').checked = !!activity?.featured;
    $('publishedToggle').checked = !!activity?.published;
    $('activityDialog').showModal();
  }

  async function uploadImage(file) {
    if (!file) return $('imageUrl').value.trim() || null;
    if (file.size > 10*1024*1024) throw new Error('圖片請控制在 10MB 以下。');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path = `${state.user.id}/${Date.now()}-${safeName}`;
    const { error } = await client.storage.from('activity-images').upload(path, file, { cacheControl:'3600', upsert:false });
    if (error) throw error;
    return client.storage.from('activity-images').getPublicUrl(path).data.publicUrl;
  }

  async function saveActivity(e) {
    e.preventDefault();
    setMsg('activityFormMessage','儲存中…');
    try {
      const id = $('activityId').value;
      const departmentId = isGlobal() ? $('activityDepartment').value : state.profile.department_id;
      if (!departmentId) throw new Error('找不到你的科室設定。');
      const imageUrl = await uploadImage($('imageFile').files[0]);
      const payload = {
        title:$('activityTitle').value.trim(), department_id:departmentId, category:$('activityCategory').value,
        start_date:$('activityStartDate').value, end_date:$('activityEndDate').value || null, location:$('activityLocation').value.trim() || null,
        summary:$('activitySummary').value.trim(), registration_url:$('registrationUrl').value.trim() || null,
        info_url:$('infoUrl').value.trim() || null, image_url:imageUrl, featured:$('featuredToggle').checked,
        published:$('publishedToggle').checked, updated_by:state.user.id
      };
      if (!payload.title || !payload.summary || !payload.start_date) throw new Error('請填完必填欄位。');
      let result;
      if (id) result = await client.from('activities').update(payload).eq('id', id).select().single();
      else result = await client.from('activities').insert({...payload, created_by:state.user.id}).select().single();
      if (result.error) throw result.error;
      $('activityDialog').close(); toast(id ? '活動已更新' : '活動已新增'); await loadDashboardData();
    } catch (err) { console.error(err); setMsg('activityFormMessage', err.message || '儲存失敗，請稍後再試。', true); }
  }

  async function deleteActivity() {
    const id = $('activityId').value; if (!id) return;
    if (!confirm('確定要刪除這個活動嗎？這個動作會留下異動紀錄。')) return;
    const { error } = await client.from('activities').delete().eq('id', id);
    if (error) return setMsg('activityFormMessage', error.message, true);
    $('activityDialog').close(); toast('活動已刪除'); await loadDashboardData();
  }

  async function loadAudit() {
    const { data, error } = await client.from('activity_audit_log').select('*, profiles(display_name,email), departments(name)').order('created_at',{ascending:false}).limit(100);
    if (error) { $('auditList').innerHTML = `<div class="empty-state"><p>${escapeHtml(error.message)}</p></div>`; return; }
    state.audit = data || [];
    $('auditList').innerHTML = state.audit.map(x => {
      const label = {INSERT:'新增',UPDATE:'修改',DELETE:'刪除'}[x.action] || x.action;
      return `<article class="audit-row"><span class="audit-action">${label}</span><div><strong>${escapeHtml(x.activity_title||'活動')}</strong><p>${escapeHtml(x.departments?.name||'')}・${escapeHtml(x.profiles?.display_name||x.profiles?.email||'系統')}・${new Date(x.created_at).toLocaleString('zh-TW')}</p></div></article>`;
    }).join('') || '<div class="empty-state"><p>目前沒有異動紀錄。</p></div>';
  }

  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault(); if (!configured) return setMsg('loginMessage','請先完成 Supabase 設定。',true);
    setMsg('loginMessage','登入中…');
    try {
      const { data, error } = await client.auth.signInWithPassword({ email:$('loginEmail').value.trim(), password:$('loginPassword').value });
      if (error) throw error;
      await afterLogin(data.user); setMsg('loginMessage','');
    } catch (err) { setMsg('loginMessage', err.message || '登入失敗，請確認信箱與密碼。', true); }
  });

  $('forgotPasswordBtn').addEventListener('click', async () => {
    if (!configured) return setMsg('loginMessage','請先完成 Supabase 設定。',true);
    const email=$('loginEmail').value.trim(); if(!email) return setMsg('loginMessage','請先輸入你的信箱。',true);
    const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
    setMsg('loginMessage', error ? error.message : '重設密碼信已寄出，請查看信箱。', !!error);
  });

  $('logoutBtn').addEventListener('click', async()=>{ await client.auth.signOut(); location.reload(); });
  $('newActivityBtn').addEventListener('click',()=>openDialog());
  $('closeDialogBtn').addEventListener('click',()=> $('activityDialog').close());
  $('cancelDialogBtn').addEventListener('click',()=> $('activityDialog').close());
  $('activityForm').addEventListener('submit', saveActivity);
  $('deleteActivityBtn').addEventListener('click', deleteActivity);
  $('activitySummary').addEventListener('input',()=> $('summaryCount').textContent=$('activitySummary').value.length);
  ['adminSearchInput','adminDepartmentFilter','adminStatusFilter'].forEach(id => $(id).addEventListener(id==='adminSearchInput'?'input':'change',renderAdminList));
  document.querySelectorAll('[data-admin-view]').forEach(btn=>btn.addEventListener('click',async()=>{
    document.querySelectorAll('[data-admin-view]').forEach(x=>x.classList.toggle('active',x===btn));
    const audit=btn.dataset.adminView==='audit'; $('activitiesView').classList.toggle('hidden',audit); $('auditView').classList.toggle('hidden',!audit); if(audit) await loadAudit();
  }));

  async function boot() {
    if (!configured) return;
    const {data:{session}} = await client.auth.getSession();
    if (session?.user) { try { await afterLogin(session.user); } catch(err) { setMsg('loginMessage',err.message,true); } }
  }
  boot();
})();
