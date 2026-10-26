(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const categories = {brand_ip:'品牌IP',aigc_video:'动态影像',ad_visual:'视觉创作',stage_design:'舞台设计',personal:'UI设计',marketing_clips:'营销切片'};
  const state = {configured:false,user:null,works:[],previews:new Map(),blobPreviews:new Map(),base:null,media:[],dirty:false,status:'all',busy:{login:false,list:false,save:false,upload:false,status:false}};
  const mimeTypes = {'image/jpeg':['jpg','jpeg'],'image/png':['png'],'image/webp':['webp'],'image/gif':['gif'],'video/mp4':['mp4'],'video/webm':['webm']};
  let initialized = false;

  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = String(text);
    return el;
  }
  function showMessage(text, kind = 'info') {
    const notice = $('global-message');
    notice.className = 'notice' + (kind === 'error' ? ' error' : kind === 'success' ? '' : ' info');
    notice.textContent = text || '';
    notice.hidden = !text;
  }
  function statusText(status) { return status === 'published' ? '已发布' : status === 'archived' ? '回收站' : '草稿'; }
  function makePill(status, text) { return element('span', 'state-pill ' + (status || 'draft'), text || statusText(status)); }
  function formatTime(value) {
    const date = value ? new Date(value) : new Date();
    if (!Number.isFinite(date.getTime())) return '刚刚';
    return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
  }
  function safeRef(value) {
    if (typeof value !== 'string' || !value || value.length > 4096 || /[\u0000-\u0020"'<>\\]/.test(value)) return '';
    if (value.startsWith('assets/') && !value.split('/').some(segment => segment === '..' || segment === '.' || segment.startsWith('.'))) return '/' + value;
    if (value.startsWith('/assets/') && !value.split('/').some(segment => segment === '..' || segment === '.' || segment.startsWith('.'))) return value;
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
      // This also permits the same-origin upload/media endpoints of the isolated local QA fixture.
      if (url.protocol === 'http:' && url.origin === location.origin && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)) return url.href;
    } catch (_) {}
    return '';
  }
  function validMediaRef(value) {
    if (typeof value !== 'string') return false;
    if (/^storage:\/\/[A-Za-z0-9_-]+\/[A-Za-z0-9/_\-.]+$/.test(value) && !value.split('/').includes('..')) return true;
    return !!safeRef(value);
  }
  function previewSource(ref) {
    if (!ref) return '';
    if (state.blobPreviews.has(ref)) return state.blobPreviews.get(ref);
    const signed = state.previews.get(ref);
    return safeRef(signed || ref);
  }
  function mergePreviews(previews) {
    if (!previews || typeof previews !== 'object' || Array.isArray(previews)) return;
    for (const [ref,url] of Object.entries(previews)) if (safeRef(url)) state.previews.set(ref,url);
  }
  function revokeBlob(ref) {
    const url = state.blobPreviews.get(ref);
    if (url) URL.revokeObjectURL(url);
    state.blobPreviews.delete(ref);
  }
  function cleanUnusedBlobs() {
    const used = new Set([$('work-cover').value.trim(),...state.media.flatMap(item => [item.src,item.poster].filter(Boolean))]);
    for (const ref of state.blobPreviews.keys()) if (!used.has(ref)) revokeBlob(ref);
  }
  function clearBlobs() { for (const ref of [...state.blobPreviews.keys()]) revokeBlob(ref); }
  function markDirty(value = true) {
    state.dirty = value;
    const label = $('save-state');
    label.classList.toggle('is-dirty',value);
    label.textContent = value ? '有未保存的修改' : state.base?.id ? '已保存 · ' + formatTime(state.base.updated_at) : '填写内容后保存草稿';
  }
  function consentToLeave() {
    if (state.busy.upload || state.busy.save) { showMessage('请等待当前上传或保存完成。','info'); return false; }
    return !state.dirty || window.confirm('当前修改还没有保存。确定离开这件作品吗？');
  }
  function updateActions() {
    const saving = state.busy.save;
    const uploading = state.busy.upload;
    const editing = !!state.base;
    const archived = state.base?.status === 'archived';
    $('login-submit').disabled = !state.configured || state.busy.login || state.busy.status;
    $('login-email').disabled = state.busy.login || !state.configured;
    $('login-password').disabled = state.busy.login || !state.configured;
    $('login-submit').textContent = state.busy.login ? '正在登录…' : '登录后台 ↗';
    $('logout').disabled = saving || uploading || state.busy.login;
    $('new-work').disabled = !state.user || saving || uploading;
    $('new-work-empty').disabled = !state.user || saving || uploading;
    $('refresh-works').disabled = !state.user || state.busy.list || saving || uploading;
    $('refresh-works').textContent = state.busy.list ? '刷新中…' : '刷新列表';
    $('close-editor').disabled = saving || uploading;
    $('editor-fields').disabled = saving;
    $('work-cover').disabled = saving || uploading;
    for (const id of ['save-draft','publish-work','archive-work','restore-work']) $(id).disabled = !state.user || !editing || saving || uploading;
    $('cover-upload').disabled = saving || uploading || !state.user;
    $('media-upload').disabled = saving || uploading || !state.user;
    $('add-media').disabled = saving || uploading || !state.user;
    for (const label of document.querySelectorAll('.upload-label')) label.classList.toggle('is-disabled',saving || uploading || !state.user);
    $('save-draft').hidden = archived;
    $('publish-work').hidden = archived;
    $('restore-work').hidden = !archived;
    $('archive-work').hidden = !state.base?.id || archived;
    $('save-draft').textContent = saving ? '正在保存…' : state.base?.status === 'published' ? '转为草稿并保存' : '保存草稿';
    $('publish-work').textContent = saving ? '正在保存…' : state.base?.status === 'published' ? '保存并更新 ↗' : '发布作品 ↗';
    for (const button of $('media-list').querySelectorAll('button')) button.disabled = saving || uploading || !state.user || button.dataset.boundary === 'true';
  }
  function showLogin(expired = false) {
    state.user = null;
    $('auth-section').hidden = false;
    $('logout').hidden = true;
    $('auth-title').textContent = expired ? '重新登录后继续编辑' : '登录你的创作空间';
    $('auth-note').textContent = expired ? '会话已到期。你的输入仍保留在此页面，登录后可继续保存。' : '仅管理员可添加和修改作品。访客只能看到已发布的内容。';
    $('session-label').textContent = expired ? '登录已到期 · 当前输入已保留' : '等待管理员登录';
    updateActions();
  }
  function showSession(user) {
    state.user = user;
    $('auth-section').hidden = true;
    $('dashboard').hidden = false;
    $('logout').hidden = false;
    $('session-label').textContent = '已登录 · ' + (user.email || '管理员');
    updateActions();
  }
  async function api(action, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),20000);
    try {
      const method = options.method || 'GET';
      const headers = options.body === undefined ? {} : {'Content-Type':'application/json'};
      const response = await fetch('/api/admin?action=' + encodeURIComponent(action),{method,headers,body:options.body === undefined ? undefined : JSON.stringify(options.body),credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});
      let payload;
      try { payload = await response.json(); } catch (_) { throw Object.assign(new Error('后台返回了异常内容，请稍后重试。'),{status:response.status}); }
      if (!response.ok || !payload || payload.ok !== true) {
        if (response.status === 401 && !options.quiet401 && state.user) showLogin(true);
        throw Object.assign(new Error(typeof payload?.message === 'string' ? payload.message : response.status === 401 ? '请先登录后台。' : '操作未完成，请稍后重试。'),{status:response.status,code:payload?.code});
      }
      return payload;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('请求等待时间较长，内容未被清除，请稍后重试。');
      if (error instanceof TypeError) throw new Error('暂时连接不到后台，请检查网络后重试。');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function normalizeRow(row) {
    return {id:row.id,title:String(row.title || ''),category:Object.hasOwn(categories,row.category) ? row.category : 'personal',description:String(row.description || ''),cover:String(row.cover || ''),media:Array.isArray(row.media) ? row.media.map(item => ({type:item.type === 'video' ? 'video' : 'image',src:String(item.src || ''),...(item.poster ? {poster:String(item.poster)} : {})})) : [],status:['draft','published','archived'].includes(row.status) ? row.status : 'draft',sort_order:Number.isInteger(row.sort_order) ? row.sort_order : 10,version:row.version,created_at:row.created_at,updated_at:row.updated_at};
  }
  function renderList() {
    const counts = {all:0,published:0,draft:0,archived:0};
    for (const work of state.works) { if (work.status !== 'archived') counts.all++; counts[work.status]++; }
    for (const key of Object.keys(counts)) $('count-' + key).textContent = String(counts[key]);
    const search = $('work-search').value.trim().toLocaleLowerCase();
    const category = $('category-filter').value;
    const rows = state.works.filter(work => (state.status === 'all' ? work.status !== 'archived' : work.status === state.status) && (category === 'all' || work.category === category) && (!search || work.title.toLocaleLowerCase().includes(search))).sort((a,b) => a.sort_order - b.sort_order || String(a.id).localeCompare(String(b.id)));
    $('list-count').textContent = rows.length + ' 件作品';
    $('works-list').replaceChildren();
    $('empty-list').hidden = rows.length > 0;
    $('empty-list').replaceChildren(document.createTextNode(search || category !== 'all' ? '没有找到符合条件的作品。' : state.status === 'archived' ? '回收站是空的。' : '这里还没有作品。'),element('br'),element('span','',search || category !== 'all' ? '换个名称或分类试试。' : state.status === 'archived' ? '移入这里的作品会保留，之后可以恢复。' : '点击“添加作品”，开始新的记录。'));
    for (const work of rows) {
      const button = element('button','work-row' + (state.base?.id === work.id ? ' is-selected' : ''));
      button.type = 'button';
      button.setAttribute('aria-label','编辑作品：' + work.title);
      button.setAttribute('aria-pressed',state.base?.id === work.id ? 'true' : 'false');
      const src = previewSource(work.cover);
      if (src) { const image = element('img','work-thumb'); image.src = src; image.alt = ''; image.loading = 'lazy'; button.append(image); }
      else button.append(element('span','work-thumb work-thumb-placeholder','✳'));
      const copy = element('div','work-row-copy');
      copy.append(element('h3','',work.title || '未命名作品'));
      const details = element('div','work-row-subline');
      details.append(element('span','work-row-category',categories[work.category]),makePill(work.status),element('span','work-row-order','#' + work.sort_order));
      copy.append(details);button.append(copy,element('span','work-row-chevron','↗'));
      button.addEventListener('click',() => { if (state.base?.id === work.id) return; if (consentToLeave()) openEditor(work); });
      $('works-list').append(button);
    }
  }
  function renderCover() {
    const box = $('cover-preview');box.replaceChildren();
    const src = previewSource($('work-cover').value.trim());
    if (!src) { box.append(element('span','',$('work-cover').value ? '保存后可查看预览' : '封面预览')); return; }
    const image = element('img');image.src = src;image.alt = '作品封面预览';
    image.addEventListener('error',() => { box.replaceChildren(element('span','','图片暂未载入')); },{once:true});box.append(image);
  }
  function pathLabel(src) {
    try { return decodeURIComponent(String(src).split('?')[0].split('/').pop()) || src; } catch (_) { return String(src); }
  }
  function renderMedia() {
    const list = $('media-list');list.replaceChildren();$('empty-media').hidden = state.media.length > 0;
    state.media.forEach((item,index) => {
      const row = element('li','media-item');
      const thumbnail = previewSource(item.type === 'video' ? item.poster : item.src);
      if (thumbnail) { const image = element('img','media-thumb');image.src = thumbnail;image.alt = '';image.loading = 'lazy';row.append(image); }
      else row.append(element('span','media-thumb media-thumb-placeholder',item.type === 'video' ? '▶' : '✳'));
      const copy = element('div','media-item-content');
      const top = element('div','media-item-top');
      const label = element('span','media-item-label',item.type === 'video' ? '视频' : '图片');label.prepend(element('span','media-item-index',String(index + 1).padStart(2,'0')));
      const actions = element('div','media-item-actions');
      for (const [direction,text] of [[-1,'↑'],[1,'↓']]) {
        const button = element('button','mini-button',text);button.type = 'button';button.setAttribute('aria-label',(direction < 0 ? '上移媒体 ' : '下移媒体 ') + (index + 1));
        const boundary = index + direction < 0 || index + direction >= state.media.length;
        button.dataset.boundary = String(boundary);button.disabled = boundary;
        button.addEventListener('click',() => { if (boundary) return;const other=index+direction;[state.media[index],state.media[other]]=[state.media[other],state.media[index]];markDirty();renderMedia(); });actions.append(button);
      }
      const remove = element('button','mini-button remove','移除');remove.type = 'button';remove.setAttribute('aria-label','移除媒体 ' + (index + 1));remove.addEventListener('click',() => { state.media.splice(index,1);cleanUnusedBlobs();markDirty();renderMedia(); });actions.append(remove);
      top.append(label,actions);copy.append(top,element('p','media-item-path',pathLabel(item.src)));
      if (item.type === 'video') {
        const posterLabel = element('label','media-poster-label','视频封面地址（选填）');
        const input = element('input','media-poster-input');input.type = 'text';input.inputMode = 'url';input.value = item.poster || '';input.placeholder = '图片地址，也可使用已上传图片的地址';input.setAttribute('aria-label','媒体 ' + (index + 1) + ' 的视频封面地址');
        input.addEventListener('input',() => { if (input.value.trim()) state.media[index].poster = input.value.trim();else delete state.media[index].poster;markDirty(); });
        input.addEventListener('change',() => { cleanUnusedBlobs();renderMedia(); });posterLabel.append(input);copy.append(posterLabel);
      }
      row.append(copy);list.append(row);
    });
    updateActions();
  }
  function openEditor(work) {
    clearBlobs();
    const nextSort = state.works.length ? Math.min(100000,Math.max(...state.works.map(row => row.sort_order)) + 10) : 10;
    state.base = work ? normalizeRow(work) : {id:null,title:'',category:'brand_ip',description:'',cover:'',media:[],status:'draft',sort_order:nextSort};
    state.media = state.base.media.map(item => ({...item}));
    $('work-title').value = state.base.title;
    $('work-category').value = state.base.category;
    $('work-description').value = state.base.description;
    $('description-count').textContent = String(state.base.description.length);
    $('work-cover').value = state.base.cover;
    $('work-sort').value = String(state.base.sort_order);
    $('media-url').value = '';$('media-poster-url').value = '';
    $('editor-title').textContent = state.base.id ? '编辑作品' : '新作品';
    $('editor-status').className = 'state-pill ' + state.base.status;
    $('editor-status').textContent = state.base.id ? statusText(state.base.status) : '尚未保存';
    $('editor-empty').hidden = true;$('work-form').hidden = false;$('conflict-actions').hidden = true;
    markDirty(false);renderCover();renderMedia();renderList();updateActions();
    if (matchMedia('(max-width:760px)').matches) $('work-form').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth',block:'start'});
  }
  function closeEditor() {
    if (!consentToLeave()) return;
    clearBlobs();state.base=null;state.media=[];markDirty(false);$('work-form').hidden=true;$('editor-empty').hidden=false;renderList();
  }
  async function loadList() {
    if (state.busy.list || !state.user) return;
    state.busy.list = true;updateActions();
    try {
      const data = await api('list');
      if (!Array.isArray(data.works) || data.works.some(row => !row || typeof row.id !== 'string' || !Array.isArray(row.media))) throw new Error('作品列表格式异常，当前编辑内容已保留。');
      state.works = data.works.map(normalizeRow);mergePreviews(data.previews);renderList();
    } finally { state.busy.list = false;updateActions(); }
  }
  async function initializeConnection() {
    if (state.busy.status) return;
    state.busy.status = true;$('retry-connection').disabled=true;$('session-label').textContent='正在检查连接…';updateActions();
    try {
      const result = await api('status',{quiet401:true});
      state.configured = result.configured === true;
      $('setup-section').hidden = state.configured;
      if (!state.configured) {
        $('auth-section').hidden = true;$('dashboard').hidden = true;$('session-label').textContent = '等待连接 Supabase';
        $('setup-description').textContent = '完成一次设置后，就能在这里上传和发布作品。';return;
      }
      try {
        const session = await api('session',{quiet401:true});
        if (!session.user || typeof session.user.id !== 'string') throw new Error('登录状态返回异常，请重新登录。');
        showSession(session.user);await loadList();
      } catch (error) {
        if (error.status === 401) showLogin(false);
        else { showLogin(false);showMessage(error.message,'error'); }
      }
    } catch (error) {
      state.configured = false;$('setup-section').hidden = false;
      $('auth-section').hidden = true;$('session-label').textContent = '连接尚未就绪';
      $('setup-description').textContent = error.status === 503 ? '后台尚未连接作品库。请完成下面三个步骤后再检查。' : '暂时连接不到后台，请检查网络或部署状态后重试。';
      if (error.status !== 503) showMessage(error.message,'error');
    } finally { state.busy.status=false;$('retry-connection').disabled=false;updateActions(); }
  }
  async function login(event) {
    event.preventDefault();if (state.busy.login || !state.configured || !$('login-form').reportValidity()) return;
    state.busy.login = true;showMessage('');updateActions();
    try {
      const response = await api('login',{method:'POST',body:{email:$('login-email').value.trim(),password:$('login-password').value},quiet401:true});
      if (!response.user || typeof response.user.id !== 'string') throw new Error('登录返回异常，请重试。');
      $('login-password').value='';showSession(response.user);
      await loadList();showMessage(state.dirty ? '已重新登录，未保存的输入仍在，可继续保存。' : '已登录，欢迎回到你的创作空间。','success');
    } catch (error) { showMessage(error.message,'error'); }
    finally { state.busy.login=false;updateActions(); }
  }
  async function logout() {
    if (!consentToLeave()) return;
    try {
      await api('logout',{method:'POST',body:{},quiet401:true});
      clearBlobs();state.previews.clear();state.works=[];state.base=null;state.media=[];state.dirty=false;
      $('work-form').hidden=true;$('editor-empty').hidden=false;$('dashboard').hidden=true;$('login-password').value='';showLogin(false);showMessage('已退出登录。','success');
    } catch (error) { showMessage(error.message,'error'); }
  }
  function collectWork(status) {
    const work = {title:$('work-title').value.trim(),category:$('work-category').value,description:$('work-description').value.trim(),cover:$('work-cover').value.trim(),media:state.media.map(item => ({type:item.type,src:item.src,...(item.poster ? {poster:item.poster.trim()} : {})})),status,sort_order:Number($('work-sort').value)};
    if (state.base?.id) { work.id = state.base.id;work.version = state.base.version; }
    return work;
  }
  async function saveWork(status, options = {}) {
    if (!state.base || state.busy.save || state.busy.upload) return;
    if (!state.user) { showLogin(true);showMessage('请重新登录后继续保存，当前输入已保留。','info');return; }
    if (!$('work-form').reportValidity()) return;
    const work = collectWork(status);
    if (work.cover && !validMediaRef(work.cover)) { showMessage('请填写有效的 HTTPS 封面地址，或使用上传封面功能。','error');$('work-cover').focus();return; }
    if (status === 'published' && !work.cover) { showMessage('发布前，请先上传或填写作品封面。','error');$('work-cover').focus();return; }
    if (work.media.some(item => !validMediaRef(item.src) || (item.poster && !validMediaRef(item.poster)))) { showMessage('有详情文件或视频封面地址格式不正确，请核对后保存。','error');return; }
    if (!options.confirmed && status === 'draft' && state.base.status === 'published' && !window.confirm('保存为草稿后，这件作品会从前台下架。确定继续吗？')) return;
    state.busy.save=true;showMessage('');$('save-state').textContent='正在保存…';updateActions();
    try {
      const result=await api('save',{method:'POST',body:{work}});
      if (!result.work || typeof result.work.id !== 'string' || !Number.isInteger(result.work.version)) throw new Error('保存结果尚未确认，当前输入已保留，请刷新列表核对后再试。');
      const saved=normalizeRow(result.work);mergePreviews(result.previews);
      const index=state.works.findIndex(row=>row.id===saved.id);if(index<0)state.works.push(saved);else state.works[index]=saved;
      state.base=saved;state.media=saved.media.map(item=>({...item}));
      $('work-title').value=saved.title;$('work-description').value=saved.description;$('work-cover').value=saved.cover;$('work-sort').value=String(saved.sort_order);
      $('editor-title').textContent='编辑作品';$('editor-status').className='state-pill '+saved.status;$('editor-status').textContent=statusText(saved.status);$('conflict-actions').hidden=true;
      markDirty(false);renderCover();renderMedia();renderList();
      showMessage(status==='published'?'作品已发布，前台刷新后即可查看。':status==='archived'?'作品已移入回收站，可随时恢复。':'草稿已保存，暂不在前台展示。','success');
    } catch (error) {
      markDirty(true);
      if(error.status===409){$('conflict-actions').hidden=false;showMessage('这件作品已在其他页面更新。你的输入已保留，请先核对最新版本，避免覆盖。','error');}
      else showMessage(error.message,'error');
    } finally { state.busy.save=false;updateActions(); }
  }
  async function reloadSelected() {
    const id=state.base?.id;if(!id||!consentToLeave())return;
    try{await loadList();const newest=state.works.find(row=>row.id===id);if(!newest)throw new Error('列表中没有找到这件作品，当前输入已保留。');openEditor(newest);showMessage('已载入这件作品的最新版本。','info');}catch(error){showMessage(error.message,'error');}
  }
  function validateFile(file,cover) {
    const ext=file.name.split('.').pop().toLowerCase(),allowed=mimeTypes[file.type];
    if(!allowed||!allowed.includes(ext)||(cover&&!file.type.startsWith('image/')))throw new Error('请使用 JPG、PNG、WebP、GIF 图片或 MP4 / WebM 视频。');
    const limit=file.type.startsWith('image/')?15*1024*1024:50*1024*1024;
    if(!file.size||file.size>limit)throw new Error('文件“'+file.name+'”超过限制：图片最大15 MB，视频最大50 MB。');
  }
  async function uploadFile(file) {
    const signed=await api('upload',{method:'POST',body:{filename:file.name,mime:file.type,size:file.size}});
    if(typeof signed.ref!=='string'||!signed.ref.startsWith('storage://')||!validMediaRef(signed.ref)||typeof signed.uploadUrl!=='string'||!safeRef(signed.uploadUrl)||signed.method!=='PUT')throw new Error('上传地址返回异常，文件尚未加入作品。');
    const headers={};for(const [key,value]of Object.entries(signed.headers||{}))if(['content-type','cache-control','x-upsert'].includes(key.toLowerCase()))headers[key]=String(value);
    if(!Object.keys(headers).some(key=>key.toLowerCase()==='content-type'))headers['Content-Type']=file.type;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),300000);
    try{
      const result=await fetch(signed.uploadUrl,{method:'PUT',headers,body:file,credentials:'omit',redirect:'error',signal:controller.signal});
      if(!result.ok)throw new Error('文件“'+file.name+'”上传未完成，请重试。');
    }catch(error){if(error.name==='AbortError')throw new Error('文件上传超时，请保持网络连接后重试。');throw error;}finally{clearTimeout(timeout);}
    revokeBlob(signed.ref);state.blobPreviews.set(signed.ref,URL.createObjectURL(file));return signed.ref;
  }
  async function uploadFiles(input,cover) {
    const files=Array.from(input.files||[]);if(!files.length||!state.base)return;
    if(state.busy.upload||state.busy.save){input.value='';return;}
    if(!state.user){showLogin(true);showMessage('请重新登录后上传。','info');input.value='';return;}
    try{for(const file of files)validateFile(file,cover);if(!cover&&state.media.length+files.length>50)throw new Error('详情文件最多50个，请先移除不需要的文件。');}
    catch(error){showMessage(error.message,'error');input.value='';return;}
    state.busy.upload=true;$('upload-progress').hidden=false;showMessage('');updateActions();let completed=0;
    try{
      for(const file of files){$('upload-progress-text').textContent='正在上传 '+(completed+1)+' / '+files.length+' · '+file.name;const ref=await uploadFile(file);if(cover){$('work-cover').value=ref;cleanUnusedBlobs();renderCover();}else{state.media.push({type:file.type.startsWith('video/')?'video':'image',src:ref});renderMedia();}completed++;markDirty();}
      showMessage(cover?'封面上传完成，请保存作品。':completed+'个文件上传完成，请保存作品。','success');
    }catch(error){showMessage(error.message+(completed?' 已完成的'+completed+'个文件仍保留在编辑器中。':''),'error');}
    finally{state.busy.upload=false;input.value='';$('upload-progress').hidden=true;updateActions();renderMedia();}
  }
  function addMediaURL() {
    if(!state.base||state.busy.upload||state.busy.save)return;
    const src=$('media-url').value.trim(),poster=$('media-poster-url').value.trim(),type=$('media-type').value;
    if(!src||!validMediaRef(src)||(poster&&!validMediaRef(poster))){showMessage('请填写有效的文件地址；视频封面也需要使用有效图片地址。','error');return;}
    if(state.media.length>=50){showMessage('详情文件最多50个。','error');return;}
    state.media.push({type,src,...(type==='video'&&poster?{poster}:{})});$('media-url').value='';$('media-poster-url').value='';markDirty();renderMedia();
  }
  function init() {
    if(initialized)return;initialized=true;
    $('login-form').addEventListener('submit',login);
    $('logout').addEventListener('click',logout);
    $('retry-connection').addEventListener('click',initializeConnection);
    $('refresh-works').addEventListener('click',async()=>{try{await loadList();showMessage(state.dirty?'列表已刷新；编辑器中未保存的内容保持不变。':'作品列表已刷新。','info');}catch(error){showMessage(error.message,'error');}});
    for(const id of ['new-work','new-work-empty'])$(id).addEventListener('click',()=>{if(consentToLeave()){openEditor(null);$('work-title').focus({preventScroll:true});}});
    $('close-editor').addEventListener('click',closeEditor);
    $('work-form').addEventListener('submit',event=>event.preventDefault());
    $('work-form').addEventListener('input',event=>{if(!state.base||event.target.type==='file'||event.target.closest('.manual-media')||event.target.closest('.media-list'))return;markDirty();if(event.target.id==='work-cover'){cleanUnusedBlobs();renderCover();}if(event.target.id==='work-description')$('description-count').textContent=String(event.target.value.length);});
    $('work-category').addEventListener('change',()=>markDirty());
    $('save-draft').addEventListener('click',()=>saveWork('draft'));
    $('publish-work').addEventListener('click',()=>saveWork('published'));
    $('restore-work').addEventListener('click',()=>saveWork('draft',{confirmed:true}));
    $('archive-work').addEventListener('click',()=>{if(window.confirm('将作品移入回收站？前台会停止展示，之后可以恢复。'))saveWork('archived',{confirmed:true});});
    $('reload-selected').addEventListener('click',reloadSelected);
    $('cover-upload').addEventListener('change',event=>uploadFiles(event.target,true));
    $('media-upload').addEventListener('change',event=>uploadFiles(event.target,false));
    $('add-media').addEventListener('click',addMediaURL);
    $('work-search').addEventListener('input',renderList);$('category-filter').addEventListener('change',renderList);
    for(const button of document.querySelectorAll('#status-filters button'))button.addEventListener('click',()=>{state.status=button.dataset.status;for(const other of document.querySelectorAll('#status-filters button')){const active=other===button;other.classList.toggle('is-active',active);other.setAttribute('aria-pressed',String(active));}renderList();});
    window.addEventListener('beforeunload',event=>{if(state.dirty||state.busy.upload||state.busy.save){event.preventDefault();event.returnValue='';}});
    initializeConnection();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
