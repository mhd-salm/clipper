/* ===================== helpers ===================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const api = (u, o) => fetch(u, o).then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText); return r.json(); });
const send = (u, b, method = 'POST') => api(u, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const store = {
  get(k, d) { try { const v = localStorage.getItem('spark.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('spark.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const mmss = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const fmtAgo = (ts) => { const s = Date.now() / 1000 - ts; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return Math.floor(s / 86400) + ' d ago'; };
const fmtSize = (b) => b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : (b / 1e6).toFixed(1) + ' MB';
const scoreCls = (n) => n >= 75 ? 'hi' : n >= 55 ? 'mid' : 'lo';
const running = (j) => ['queued', 'running'].includes(j.status);

const ICONS = {
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  check: '<path d="M20 6L9 17l-5-5"/>', x: '<path d="M18 6L6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  arrowl: '<path d="M19 12H5M12 19l-7-7 7-7"/>', arrowr: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  wand: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
};
const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const hydrateIcons = (root = document) => $$('i[data-i]', root).forEach(el => { el.outerHTML = icon(el.dataset.i, el.className); });

/* ----- toasts & dialogs (no more browser alert/confirm/prompt) ----- */
function toast(msg, { type = 'info', ms = 4500, action } = {}) {
  const t = document.createElement('div'); t.className = 'toast ' + type;
  t.innerHTML = `<span class="t">${esc(msg)}</span>${action ? `<button class="s sm" data-a>${esc(action.label)}</button>` : ''}<button class="ghost sm icon" aria-label="Dismiss">${icon('x', 'sm')}</button>`;
  const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 260); };
  t.querySelector('.icon').onclick = close;
  if (action) t.querySelector('[data-a]').onclick = () => { action.run(); close(); };
  $('#toasts').appendChild(t); if (ms) setTimeout(close, ms);
}
function dialog(html, setup) {
  return new Promise(res => {
    const host = $('#dlgHost'), prev = document.activeElement;
    host.innerHTML = `<div class="dlg" role="alertdialog" aria-modal="true">${html}</div>`; host.hidden = false;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(null); } };
    const close = (v) => { host.hidden = true; host.innerHTML = ''; document.removeEventListener('keydown', onKey, true); prev && prev.focus && prev.focus(); res(v); };
    document.addEventListener('keydown', onKey, true);
    host.onmousedown = (e) => { if (e.target === host) close(null); };
    setup(host, close);
    const f = host.querySelector('[autofocus]') || host.querySelector('input') || host.querySelector('button.p') || host.querySelector('button');
    f && f.focus();
  });
}
const ask = ({ title, text = '', ok = 'Confirm', danger = false }) => dialog(
  `<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="acts"><button class="s" data-c>Cancel</button><button class="${danger ? 's danger' : 'p'}" data-o ${danger ? 'autofocus' : ''}>${esc(ok)}</button></div>`,
  (h, close) => { h.querySelector('[data-c]').onclick = () => close(false); h.querySelector('[data-o]').onclick = () => close(true); }).then(v => !!v);
const askText = ({ title, label = '', placeholder = '', ok = 'Save' }) => dialog(
  `<h3>${esc(title)}</h3><label>${esc(label)}<input type="text" maxlength="40" placeholder="${esc(placeholder)}"></label><div class="acts" style="margin-top:16px"><button class="s" data-c>Cancel</button><button class="p" data-o>${esc(ok)}</button></div>`,
  (h, close) => {
    const i = h.querySelector('input'); const go = () => close(i.value.trim() || null);
    h.querySelector('[data-c]').onclick = () => close(null); h.querySelector('[data-o]').onclick = go;
    i.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  });
const busy = async (btn, fn) => { btn.classList.add('busy'); btn.disabled = true; try { return await fn(); } finally { btn.classList.remove('busy'); btn.disabled = false; } };

/* ===================== state ===================== */
const DEF = { mode: 'link', num: 0, len: 'standard', res: '1080p', subs: true, hook: true, hideLikes: true, content: 'auto', style: 'bold_yellow', layout: 'fill', minScore: 50 };
const _p = store.get('prefs', {}); if (_p.numV !== 2) delete _p.num; // the AI now decides the clip count by default
const S = Object.assign({}, DEF, _p); if (S.mode !== 'file') S.mode = 'link'; // Full auto now has its own page
const LEN = { short: [15, 30, 'Short', '15–30s'], standard: [20, 60, 'Standard', '20–60s'], long: [45, 90, 'Long', '45–90s'] };
const KINDS = { auto: ['Auto', 'Let AI decide'], talk: ['Talk & podcasts', 'Opinions, stories'], gaming: ['Gaming & funny', 'Fails, clutch, reactions'] };
const CAP = { bold_yellow: ['Bold yellow', '<em><span style="color:#fff">BIG</span> <span style="color:#ffe500">WORDS</span></em>'], clean_white: ['Clean white', '<em style="color:#fff;font-weight:600;text-transform:none">Clean text</em>'], green_pop: ['Green pop', '<em><span style="color:#fff">POP</span> <span style="color:#00ff66">IN</span></em>'] };
const savePrefs = () => store.set('prefs', { numV: 2, mode: S.mode, num: S.num, len: S.len, res: S.res, subs: S.subs, hook: S.hook, hideLikes: S.hideLikes, upPriv: S.upPriv, account: S.account, content: S.content, style: S.style, layout: S.layout, minScore: S.minScore });
let layouts = [], meta = { sub_styles: [], resolutions: ['720p', '1080p'] }, curJob = null, poll = null, currentWatch = null, custEd = null, pickedFile = null, step = 1;

const opts = () => ({ layout_id: S.layout, subtitles: S.subs, sub_style: S.style, num_clips: S.num, min_len: LEN[S.len][0], max_len: LEN[S.len][1], resolution: S.res, hook_text: S.hook, content: S.content, account: S.account || 'default', min_score: S.minScore, notes: ($('#aboutNote') ? $('#aboutNote').value.trim() : '') });
const layoutName = (id) => (layouts.find(l => l.id === id) || {}).name || id;

/* ===================== routing ===================== */
const PAGES = {
  home: ['Home', 'Find creators, follow them and pick their videos'],
  projects: ['Projects', 'Everything you have generated'],
  edits: ['Edits', 'Saved looks for your clips, one per creator'],
  explainers: ['Explainers', 'Animated 2D explainer videos with a free voice'],
  renders: ['Rendering', 'Every clip being made, across all projects'],
  uploads: ['Upload queue', 'Everything waiting to go to YouTube, across all projects'],
};
function route() {
  const [name = 'home', id] = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  const page = PAGES[name] ? name : 'home';
  closeModal(true);
  Object.keys(PAGES).forEach(p => { $('#page-' + p).hidden = p !== page; });
  $$('.nav a').forEach(a => a.setAttribute('aria-current', a.dataset.route === page ? 'page' : 'false'));
  $('#pgTitle').textContent = PAGES[page][0]; $('#pgSub').textContent = PAGES[page][1];
  document.title = PAGES[page][0] + ' · Spark Clipper'; $('#pgActions').innerHTML = '';
  clearInterval(poll); clearInterval(upTimer); clearInterval(renTimer); clearInterval(xTimer);
  if (page === 'explainers') loadExplainers();
  if (page === 'create' && step >= 3 && step < 4) {
    // coming back to Create: resume live updates for the job being generated (another page may have taken over the poller)
    const cj = sessionStorage.getItem('spark.createJob');
    if (cj) { watch(cj, '#progress'); }
  }
  if (page === 'auto') { loadAccts(); $('#autoPriv').value = S.upPriv || 'public'; $('#autoHl').checked = S.hideLikes !== false; checkAuto(); }
  if (page === 'renders') { renSig = ''; drawRenders(); renTimer = setInterval(drawRenders, 2000); }
  if (page === 'uploads') { $('#pgActions').innerHTML = '<button class="s sm danger" id="stopAllTop">Stop all uploads</button>'; $('#stopAllTop').onclick = stopAllUploads; upSig = ''; drawUploads(); upTimer = setInterval(drawUploads, 2000); }
  if (page === 'projects') { id ? showProject(id) : showProjectList(); }
  if (page === 'home') loadHome();
  if (page === 'edits') loadEdits();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ===================== system status / setup ===================== */
async function loadStatus() {
  try { meta = await api('/api/meta'); } catch { /* server down */ }
  let yt = {}; try { yt = await api('/api/publish/youtube/status'); } catch { /* ignore */ }
  $('#dotGem').className = 'dotc ' + (meta.gemini_configured ? 'ok' : 'bad');
  let ks = null; try { ks = await api('/api/keys'); } catch { /* ignore */ }
  const free = ks ? ks.ready : null;
  $('#txtGem').textContent = !meta.gemini_configured ? 'No AI key' : ks ? `AI ready · ${ks.ready}/${ks.total} keys free` : 'AI ready';
  if (ks && meta.gemini_configured) $('#dotGem').className = 'dotc ' + (ks.ready ? 'ok' : 'bad');
  const stEl = $('#txtGem').parentElement; stEl.style.cursor = 'pointer'; stEl.title = 'Click to see every AI key'; stEl.onclick = showKeys;
  $('#txtGem').title = (meta.ai_providers || []).join(', ');
  $('#dotYt').className = 'dotc ' + (yt.connected ? 'ok' : '');
  $('#txtYt').textContent = yt.connected ? 'YouTube connected' : yt.client_secret ? 'YouTube not connected' : 'YouTube not set up';
  $('#setupBanner').innerHTML = meta.gemini_configured ? '' : `<div class="banner warn">${icon('alert')}<div><b>Add an AI key to get started</b>Copy <code>.env.example</code> to <code>.env</code>, paste a key after <code>GEMINI_API_KEY=</code> (or Groq, Grok, OpenRouter and more), then restart the app. Get a key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>.</div><button class="s sm x" id="recheck">Recheck</button></div>`;
  const r = $('#recheck'); if (r) r.onclick = () => busy(r, loadStatus);
}

/* ---------- AI key health ---------- */
async function showKeys() {
  const draw = async (h, data) => {
    const k = data || await api('/api/keys');
    h.querySelector('.kbody').innerHTML = `<p class="mut">${k.ready} of ${k.total} keys can be used right now. Keys that hit a limit are skipped automatically and retried later.</p>` +
      k.providers.map(p => `<div class="kprov"><b>${esc(p.label)}</b> <span class="mut">${p.ready}/${p.total} ready</span><div class="kkeys">${p.keys.map(x =>
        `<span class="kk ${x.state}" title="${esc(x.reason || '')}">${esc(x.key)} · ${x.state === 'ready' ? 'ready' : x.state === 'bad' ? 'invalid' : 'rate limited, retry in ' + (x.retry_in >= 60 ? Math.ceil(x.retry_in / 60) + 'm' : x.retry_in + 's')}${x.uses ? ' · ' + x.uses + ' uses' : ''}<button class="kx" data-p="${esc(p.name)}" data-m="${esc(x.key)}" aria-label="Remove this key" title="Remove this key">×</button></span>`).join('')}</div></div>`).join('') || '<p class="mut">No keys yet. Add one below.</p>';
    const sel = h.querySelector('#kProv');
    if (sel && !sel.options.length) { sel.innerHTML = '<option value="auto">Auto-detect (any provider)</option>' + k.available.map(a => `<option value="${esc(a.id)}">${esc(a.label)}${a.free ? ' (free)' : ''}</option>`).join(''); sel._av = k.available; }
    const av = sel && sel._av && sel._av.find(a => a.id === sel.value); if (sel && sel.value === 'auto') h.querySelector('#kLink').textContent = 'Paste keys from any service; each is matched to its provider automatically.'; else if (av) h.querySelector('#kLink').innerHTML = `Get a ${av.free ? 'free ' : ''}key: <a href="${esc(av.url)}" target="_blank" rel="noopener">${esc(av.url.replace('https://', ''))}</a>`;
    h.querySelectorAll('.kx').forEach(b => b.onclick = async () => {
      if (!confirm('Remove this key from .env?')) return;
      try { await draw(h, await send('/api/keys/remove', { provider: b.dataset.p, mask: b.dataset.m })); toast('Key removed', { type: 'ok', ms: 2000 }); } catch (e) { toast(e.message, { type: 'bad' }); }
    });
    loadStatus();
  };
  return dialog(`<h3>AI keys</h3><div class="kbody"><p class="mut">Loading…</p></div>
    <div class="kadd"><h4>Add keys</h4>
      <div class="row" style="align-items:end"><label>Provider<select id="kProv"></select></label><span class="mut" id="kLink"></span></div>
      <textarea id="kNew" rows="3" placeholder="Paste one or many keys: separate with commas, spaces or new lines" spellcheck="false"></textarea>
      <div class="row" style="justify-content:space-between;align-items:center"><span class="mut kmsg"></span><button class="p sm" data-add>Add keys</button></div></div>
    <div class="acts" style="margin-top:16px"><button class="s" data-chk>Check keys</button><button class="s" data-rst>Retry limited now</button><button class="p" data-c>Close</button></div>`,
    (h, close) => {
      draw(h);
      h.querySelector('[data-c]').onclick = () => close(true);
      h.querySelector('#kProv').onchange = () => draw(h);
      const addb = h.querySelector('[data-add]'), kmsg = h.querySelector('.kmsg');
      addb.onclick = () => busy(addb, async () => {
        const keys = h.querySelector('#kNew').value.trim(); if (!keys) return toast('Paste at least one key', { type: 'warn' });
        kmsg.textContent = 'Checking the keys…';
        try {
          const r = await send('/api/keys/add', { provider: h.querySelector('#kProv').value, keys });
          h.querySelector('#kNew').value = '';
          const asg = Object.entries(r.assigned || {}).map(([n, c]) => `${c} → ${n}`).join(', '); kmsg.textContent = `${asg ? asg + ': ' : ''}${r.added} added${r.duplicates ? ', ' + r.duplicates + ' already there' : ''}${r.invalid.length ? ', ' + r.invalid.length + ' rejected as invalid (' + r.invalid.join(', ') + ')' : ''}${(r.limited || []).length ? ', ' + r.limited.length + ' added but rate limited right now (' + r.limited.join(', ') + ')' : ''}`;
          await draw(h, r.status); toast(r.added ? `${r.added} key${r.added === 1 ? '' : 's'} added and ready to use` : 'No new keys added', { type: r.added ? 'ok' : 'warn' });
        } catch (e) { kmsg.textContent = ''; toast(e.message, { type: 'bad' }); }
      });
      const chk = h.querySelector('[data-chk]'), rst = h.querySelector('[data-rst]');
      chk.onclick = () => busy(chk, async () => { try { await draw(h, await send('/api/keys/check', {})); toast('Checked every key', { type: 'ok', ms: 2000 }); } catch (e) { toast(e.message, { type: 'bad' }); } });
      rst.onclick = () => busy(rst, async () => { await draw(h, await send('/api/keys/reset', {})); toast('Limits cleared: every key will be tried again', { type: 'ok', ms: 2500 }); });
    });
}
setInterval(() => { if (!document.hidden) loadStatus(); }, 30000);

/* ===================== STEP 1: video + settings ===================== */
const ytId = (u) => { const m = String(u).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/))([\w-]{11})/); return m ? m[1] : null; };
let urlValid = false, fileOk = false;

function checkUrl() {
  const v = $('#url').value.trim(), msg = $('#urlMsg'), prev = $('#ytPrev'); urlValid = false; prev.innerHTML = '';
  if (!v) { msg.innerHTML = ''; return refreshS1(); }
  let u; try { u = new URL(v); if (!/^https?:$/.test(u.protocol)) throw 0; } catch { msg.innerHTML = '<div class="field-err">That doesn\'t look like a link. Paste the full video address.</div>'; return refreshS1(); }
  if (/youtube\.com\/(@|channel\/|c\/|user\/)/.test(v)) { msg.innerHTML = '<div class="field-err">That\'s a channel, not a video. Paste a single video link (channels go in <a href="#/creators">Creators</a>).</div>'; return refreshS1(); }
  const id = ytId(v);
  if (id) {
    urlValid = true; msg.innerHTML = '';
    prev.innerHTML = `<div class="vprev"><img alt="" src="https://i.ytimg.com/vi/${id}/mqdefault.jpg"><div class="meta"><b>YouTube video</b><span class="mut">${id} · ready to clip</span></div><span class="pill ok">Link OK</span></div>`;
    prev.querySelector('img').onerror = () => { prev.innerHTML = ''; msg.innerHTML = '<div class="field-err">Couldn\'t load this video. It may be private, removed, or the link is wrong.</div>'; urlValid = false; refreshS1(); };
  } else if (/youtube\.com|youtu\.be/.test(v)) { msg.innerHTML = '<div class="field-err">Couldn\'t find a video in that YouTube link.</div>'; }
  else { urlValid = true; msg.innerHTML = '<div class="field-ok">Link accepted. Sites other than YouTube work if the downloader supports them.</div>'; }
  refreshS1();
}
const autoUrls = () => [...new Set(($('#autoUrls').value.match(/https?:\/\/\S+/g) || []).filter(u => !/youtube\.com\/(@|channel\/|c\/|user\/)/.test(u)))];
function checkAuto() {
  const n = autoUrls().length, raw = ($('#autoUrls').value.match(/https?:\/\/\S+/g) || []).length;
  $('#autoMsg').innerHTML = n ? `<div class="field-ok">${n} video${n === 1 ? '' : 's'} will be processed one after another${raw > n ? ` (${raw - n} duplicate or channel link${raw - n === 1 ? '' : 's'} ignored)` : ''}.</div>` : '';
  refreshS1();
}
$('#autoUrls').addEventListener('input', checkAuto);
$('#autoPriv').onchange = (e) => { S.upPriv = e.target.value; savePrefs(); };
$('#autoHl').onchange = (e) => { S.hideLikes = e.target.checked; savePrefs(); };
$('#autoGo').onclick = async (e) => {
  const btn = e.currentTarget, urls = autoUrls();
  if (!await ask({ title: `Start full auto for ${urls.length} video${urls.length === 1 ? '' : 's'}?`, text: `Clips rated ${S.minScore}+ will be rendered and uploaded to YouTube channel "${(accts.find(a => a.id === S.account) || {}).name || 'Main channel'}" as ${S.upPriv || 'public'} without asking again. It stops if the daily limit is hit or anything unexpected happens.`, ok: 'Start' })) return;
  btn.classList.add('busy'); btn.disabled = true;
  try {
    for (const url of urls) await send('/api/jobs', { url, ...opts(), num_clips: 0, auto: true, auto_privacy: S.upPriv || 'public', hide_likes: S.hideLikes !== false, account: S.account || 'default' });
    toast(`Full auto started for ${urls.length} video${urls.length === 1 ? '' : 's'}. Watch progress under Projects.`, { type: 'ok', ms: 6000 });
    $('#autoUrls').value = ''; checkAuto(); location.hash = '#/projects';
  } catch (err) { toast(err.message, { type: 'bad' }); }
  btn.classList.remove('busy'); btn.disabled = false;
};
const dismissed = () => { try { return JSON.parse(sessionStorage.getItem('spark.dismissed') || '[]'); } catch { return []; } };
async function stopAllUploads() {
  if (!await ask({ title: 'Stop all uploads?', text: 'Everything waiting is dropped and the running upload is cancelled, on every channel. Full auto stays paused until you press Resume. Clips stay in their projects.', ok: 'Stop all', danger: true })) return;
  try { const r = await send('/api/uploads/stop-all', {}); toast(`Stopped ${r.stopped} upload${r.stopped === 1 ? '' : 's'}`, { type: 'ok' }); } catch (e) { toast(e.message, { type: 'bad' }); }
  upSig = ''; drawAuto(); if (typeof drawUploads === 'function') drawUploads();
}
async function drawAuto() {
  const box = $('#autoBanner'); if (!box) return;
  let a; try { a = await api('/api/auto/status'); } catch { return; }
  const hide = dismissed(), stops = (a.stops || []).filter(s => !hide.includes(s.account + '|' + s.t));
  if (!stops.length) { box.innerHTML = ''; return; }
  box.innerHTML = stops.map(s => `<div class="banner warn">${icon('alert')}<div><b>Uploads stopped for "${esc(s.name)}"</b>${esc(s.reason || '')}
    ${s.shot_url ? `<br><a href="${esc(s.shot_url)}" target="_blank" rel="noopener">Open the screenshot taken when it stopped</a>` : ''}
    <span class="mut"> · Fix the cause, then resume. Clips already made stay in their projects.</span></div>
    <div class="bacts"><button class="p sm" data-acc="${esc(s.account)}" type="button">Resume</button><button class="s xs" data-retry="${esc(s.account)}" type="button" title="Try the clip that failed again">Retry</button><button class="s xs danger" data-stopall type="button">Stop all</button><button class="ghost icon xs" data-dis="${esc(s.account + '|' + s.t)}" type="button" aria-label="Close">${icon('x', 'sm')}</button></div></div>`).join('');
  box.querySelectorAll('button[data-acc]').forEach(r => r.onclick = () => busy(r, async () => { await send('/api/auto/resume?account=' + encodeURIComponent(r.dataset.acc), {}); toast('Uploads resumed', { type: 'ok' }); drawAuto(); }));
  box.querySelectorAll('button[data-retry]').forEach(r => r.onclick = () => busy(r, async () => { try { await send('/api/uploads/continue', { account: r.dataset.retry, retry: true }); toast('Trying again', { type: 'ok', ms: 2500 }); } catch (e) { toast(e.message, { type: 'bad' }); } drawAuto(); }));
  box.querySelectorAll('button[data-stopall]').forEach(r => r.onclick = stopAllUploads);
  box.querySelectorAll('button[data-dis]').forEach(r => r.onclick = () => { try { sessionStorage.setItem('spark.dismissed', JSON.stringify(dismissed().concat(r.dataset.dis).slice(-50))); } catch { } drawAuto(); });
}
setInterval(drawAuto, 6000); setTimeout(drawAuto, 500);

/* ---------- YouTube channels (accounts) ---------- */
let accts = [];
async function loadAccts() {
  try { accts = await api('/api/accounts'); } catch { accts = []; }
  if (!accts.find(a => a.id === S.account)) S.account = (accts[0] || {}).id || 'default';
  $$('select.acct').forEach(s => fillAcct(s));
}
const acctOpts = (val) => accts.map(a => `<option value="${esc(a.id)}" ${a.id === val ? 'selected' : ''}>${esc(a.name)}${a.handle ? ' (' + esc(a.handle) + ')' : ''}</option>`).join('');
function fillAcct(sel, val) { sel.innerHTML = acctOpts(val || S.account); sel.onchange = () => { S.account = sel.value; savePrefs(); $$('select.acct').forEach(s => { if (s !== sel) s.value = S.account; }); }; }
function manageChannels() {
  const draw = (h) => {
    h.querySelector('.chlist').innerHTML = accts.map(a => `<div class="chrow" data-id="${esc(a.id)}"><div><b>${esc(a.name)}</b><small class="mut">${esc(a.handle || 'channel not set')}${a.pinned ? ' · pinned to this channel' : ''}${a.open ? ' · window open' : ''}</small></div>
      <button class="s sm" data-ren>Rename</button><button class="s sm" data-in>Sign in</button>${a.id === 'default' ? '' : '<button class="s sm danger" data-del>Remove</button>'}</div>`).join('');
    h.querySelectorAll('[data-ren]').forEach(b => b.onclick = () => {
      const row = b.closest('.chrow'), a = accts.find(x => x.id === row.dataset.id), box = row.firstElementChild;
      box.innerHTML = `<input maxlength="40" value="${esc(a.name)}" aria-label="Channel display name" style="width:100%"><small class="mut">Press Enter to save, Esc to cancel</small>`;
      const inp = box.querySelector('input'); inp.focus(); inp.select();
      let done = false;
      const finish = async (save) => {
        if (done) return; done = true;
        const name = inp.value.trim();
        if (save && name && name !== a.name) {
          try { await send('/api/accounts/' + a.id, { name, handle: '' }, 'PUT'); await loadAccts(); toast('Renamed to ' + name, { type: 'ok', ms: 2000 }); } catch (e) { toast(e.message, { type: 'bad' }); }
        }
        draw(h);
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); };
      inp.onblur = () => finish(true);
    });
    h.querySelectorAll('[data-in]').forEach(b => b.onclick = () => busy(b, async () => { try { await send(`/api/accounts/${b.closest('.chrow').dataset.id}/signin`, {}); toast('A Chrome window opened. Sign in to the right Google account / channel there, then keep it signed in.', { type: 'ok', ms: 7000 }); } catch (e) { toast(e.message, { type: 'bad' }); } }));
    h.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (await ask({ title: 'Remove this channel?', text: 'Uploads already made stay on YouTube. Its sign-in window profile stays on disk.', ok: 'Remove', danger: true })) { await api('/api/accounts/' + b.closest('.chrow').dataset.id, { method: 'DELETE' }); await loadAccts(); draw(h); } });
  };
  return dialog(`<h3>YouTube channels</h3><p class="mut">Each channel gets its own Chrome window that stays signed in. Add the channel's @handle so uploads can only ever go to that channel.</p>
    <div class="chlist"></div>
    <div class="row" style="margin-top:14px;align-items:end"><label class="grow">Name<input id="chName" maxlength="40" placeholder="Entertainment & fun"></label><label class="grow">@handle<input id="chHandle" placeholder="@itainttmeee"></label><button class="p sm" data-add>Add</button></div>
    <div class="acts" style="margin-top:16px"><button class="s" data-c>Close</button></div>`,
    (h, close) => {
      draw(h);
      h.querySelector('[data-c]').onclick = () => close(true);
      const add = h.querySelector('[data-add]');
      add.onclick = () => busy(add, async () => {
        const name = h.querySelector('#chName').value.trim(); if (!name) return toast('Give the channel a name', { type: 'warn' });
        try { const a = await send('/api/accounts', { name, handle: h.querySelector('#chHandle').value.trim() }); h.querySelector('#chName').value = ''; h.querySelector('#chHandle').value = ''; await loadAccts(); draw(h);
          toast(a.channel_id ? `Added ${a.name}. Press Sign in to log in to it.` : `Added ${a.name}. (Couldn't look up the handle, so it will pin itself to whichever channel you sign in to first.)`, { type: 'ok', ms: 6000 }); } catch (e) { toast(e.message, { type: 'bad' }); }
      });
    }).then(() => loadAccts());
}
$('#autoManage').onclick = manageChannels;
$('#navChannels').onclick = manageChannels;
$('#navKeys').onclick = showKeys;
$('#s1Manage').onclick = manageChannels;
loadAccts();

function setSource(mode) {
  S.mode = mode; savePrefs();
  $$('#srcSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === mode));
  $('#srcLink').hidden = mode !== 'link'; $('#srcFile').hidden = mode !== 'file';
  loadAccts(); refreshS1();
}
function refreshS1() {
  const ok = S.mode === 'link' ? urlValid : fileOk, aok = autoUrls().length > 0;
  $('#go').disabled = !ok; $('#autoGo').disabled = !aok;
  $('#s1hint').textContent = ok ? '' : S.mode === 'link' ? 'Paste a YouTube link to start.' : 'Choose a video file to start.';
  $('#autoHint').textContent = aok ? '' : 'Paste at least one video link.';
  if ($('#journey')) journey();
}
function pickFile(f) {
  fileOk = false; pickedFile = null; const card = $('#fileCard'); card.innerHTML = '';
  if (!f) return refreshS1();
  if (!(f.type.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(f.name))) { card.innerHTML = '<div class="field-err">That isn\'t a video file.</div>'; return refreshS1(); }
  pickedFile = f; fileOk = true;
  card.innerHTML = `<div class="filecard"><span class="ic">${icon('film')}</span><div class="meta"><b>${esc(f.name)}</b><span class="mut" id="fmeta">${fmtSize(f.size)}</span></div><button class="ghost icon" id="fclear" aria-label="Remove file">${icon('x')}</button></div>`;
  $('#fclear').onclick = () => { $('#file').value = ''; pickFile(null); };
  const v = document.createElement('video'); v.preload = 'metadata'; v.src = URL.createObjectURL(f);
  v.onloadedmetadata = () => { const m = $('#fmeta'); if (m) m.textContent = `${fmtSize(f.size)} · ${mmss(v.duration)}${v.duration < 60 ? ' · very short: few clips will be found' : ''}`; URL.revokeObjectURL(v.src); };
  refreshS1();
}
function buildSettings() {
  setTimeout(updateSum, 0);
  $$('.minScore').forEach(i => { if (document.activeElement !== i) i.value = S.minScore; });
  $('#numVal').textContent = S.num ? S.num : 'Auto';
  $('#lenChips').innerHTML = Object.entries(LEN).map(([k, v]) => `<button type="button" class="chip ${S.len === k ? 'on' : ''}" data-k="${k}">${v[2]}<small>${v[3]}</small></button>`).join('');
  $('#resSeg').innerHTML = meta.resolutions.map(r => `<button type="button" class="${S.res === r ? 'on' : ''}" data-v="${r}">${r}</button>`).join('');
  $('#subs').checked = S.subs; $('#hook').checked = S.hook;
  $('#kindChips').innerHTML = Object.entries(KINDS).map(([k, v]) => `<button type="button" class="chip ${S.content === k ? 'on' : ''}" data-k="${k}">${v[0]}<small>${v[1]}</small></button>`).join('');
  $$('#kindChips .chip').forEach(c => c.onclick = () => { S.content = c.dataset.k; savePrefs(); buildSettings(); });
  $('#capStyles').innerHTML = meta.sub_styles.map(k => `<button type="button" class="chip ${S.style === k ? 'on' : ''}" data-k="${k}"><em>${(CAP[k] || [k, esc(k)])[1]}</em><small>${(CAP[k] || [k])[0]}</small></button>`).join('');
  $('#capStyles').style.opacity = S.subs ? 1 : .4; $('#capStyles').style.pointerEvents = S.subs ? '' : 'none';
  $$('#lenChips .chip').forEach(c => c.onclick = () => { S.len = c.dataset.k; savePrefs(); buildSettings(); });
  $$('#resSeg button').forEach(c => c.onclick = () => { S.res = c.dataset.v; savePrefs(); buildSettings(); });
  $$('#capStyles .chip').forEach(c => c.onclick = () => { S.style = c.dataset.k; savePrefs(); buildSettings(); });
}
$('#numMinus').onclick = () => { S.num = Math.max(0, S.num - 1); savePrefs(); buildSettings(); };
$('#numPlus').onclick = () => { S.num = Math.min(20, S.num + 1); savePrefs(); buildSettings(); };
$$('.minScore').forEach(i => i.oninput = () => { const v = parseInt(i.value, 10); if (isNaN(v)) return; S.minScore = Math.max(0, Math.min(100, v)); savePrefs(); $$('.minScore').forEach(o => { if (o !== i) o.value = S.minScore; }); });
$('#hook').onchange =(e) => { S.hook = e.target.checked; savePrefs(); };
$('#subs').onchange = (e) => { S.subs = e.target.checked; savePrefs(); buildSettings(); };
$$('#srcSeg button').forEach(b => b.onclick = () => setSource(b.dataset.v));
$('#url').addEventListener('input', checkUrl);
$('#url').addEventListener('keydown', (e) => { if (e.key === 'Enter' && urlValid) $('#go').click(); });
$('#pasteBtn').onclick = async () => {
  try { const t = await navigator.clipboard.readText(); $('#url').value = t.trim(); checkUrl(); $('#url').focus(); }
  catch { toast('Couldn\'t read the clipboard. Click the box and press Ctrl+V.', { type: 'warn' }); $('#url').focus(); }
};
const drop = $('#drop');
$('#file').onchange = (e) => pickFile(e.target.files[0]);
drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } };
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) { const dt = new DataTransfer(); dt.items.add(f); $('#file').files = dt.files; pickFile(f); } });
window.addEventListener('dragover', (e) => e.preventDefault()); window.addEventListener('drop', (e) => e.preventDefault());

/* ===================== wizard ===================== */
function journey() {  // 1 Video -> 2 Style -> 3 Generate -> 4 Publish
  const ok = S.mode === 'link' ? urlValid : fileOk;
  const at = step >= 4 ? 4 : step >= 3 ? 3 : ok ? 2 : 1;
  $$('#journey li').forEach((li, i) => { li.classList.toggle('on', i + 1 === at); li.classList.toggle('done', i + 1 < at); li.querySelector('.n').innerHTML = i + 1 < at ? icon('check', 'sm') : i + 1; });
}
function goStep(n) {
  step = n;  // 1 = set up a video, 3 = generating, 4 = finished
  journey();
  $('#cform').hidden = n >= 3; $('#s3').hidden = n < 3;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
const updateSum = () => {
  const t = `${S.num ? S.num + ' clips' : 'AI picks the clips'} · ${LEN[S.len][3]} · ${S.res} · captions ${S.subs ? 'on' : 'off'} · hook ${S.hook ? 'on' : 'off'} · ${layoutName(S.layout)}`;
  $('#s2sum').textContent = ''; $('#autoSum').textContent = t;
  $('#laySum').textContent = layoutName(S.layout); $('#moreSum').textContent = `${LEN[S.len][2]} · ${S.res} · captions ${S.subs ? 'on' : 'off'} · hook ${S.hook ? 'on' : 'off'}`;
};

/* ---------- layouts ---------- */
function layoutCard(l, { del = false } = {}) {
  const d = document.createElement('div');
  d.className = 'lay' + (l.id === S.layout ? ' on' : ''); d.dataset.id = l.id; d.tabIndex = 0; d.setAttribute('role', 'button');
  d.setAttribute('aria-label', 'Layout ' + l.name);
  d.appendChild(LE.thumb(l));
  d.insertAdjacentHTML('beforeend', `<b>${esc(l.name)}</b><small>${esc(l.description || (l.builtin ? '' : 'Your custom layout'))}</small>${del && !l.builtin ? `<button class="ghost sm danger" data-del aria-label="Delete layout">${icon('trash', 'sm')}Delete</button>` : ''}`);
  return d;
}
async function loadLayouts() { layouts = await api('/api/layouts'); if (!layouts.find(l => l.id === S.layout)) S.layout = 'fill'; }
function renderLayoutGrid() {
  const box = $('#layouts'); box.innerHTML = '';
  layouts.forEach(l => {
    const c = layoutCard(l, { del: true });
    const pick = () => { S.layout = l.id; savePrefs(); renderLayoutGrid(); updateSum(); if (custEd) openCustomizer(); };
    c.onclick = async (ev) => {
      if (ev.target.closest('[data-del]')) {
        if (await ask({ title: `Delete "${l.name}"?`, text: 'Clips already made with it keep their look.', ok: 'Delete', danger: true })) {
          await api('/api/layouts/' + l.id, { method: 'DELETE' }); if (S.layout === l.id) S.layout = 'fill'; await loadLayouts(); renderLayoutGrid(); updateSum(); toast('Layout deleted', { type: 'ok' });
        } return;
      }
      pick();
    };
    c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.click(); } };
    box.appendChild(c);
  });
}
function openCustomizer() {
  const l = layouts.find(x => x.id === S.layout) || layouts[0];
  $('#cust').hidden = false; custEd = new LE.LayoutEditor($('#custEd'), { layout: l });
  $('#custName').value = l.builtin ? '' : l.name; $('#cust').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
$('#customize').onclick = openCustomizer;
$('#custSave').onclick = (e) => busy(e.currentTarget, async () => {
  const name = $('#custName').value.trim() || 'My layout';
  try {
    const saved = await send('/api/layouts', { ...custEd.getLayout(), name });
    S.layout = saved.id; savePrefs(); $('#cust').hidden = true; custEd = null; await loadLayouts(); renderLayoutGrid(); updateSum(); toast(`Saved "${saved.name}" and selected it`, { type: 'ok' });
  } catch (err) { toast(err.message, { type: 'bad' }); }
});

/* ---------- generate ---------- */
function uploadJob(fd, onProgress) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest(); x.open('POST', '/api/jobs/upload');
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round(e.loaded / e.total * 100));
    x.onload = () => { let b = {}; try { b = JSON.parse(x.responseText); } catch { /* ignore */ } x.status < 300 ? res(b) : rej(new Error(b.detail || 'Upload failed')); };
    x.onerror = () => rej(new Error('Upload failed - is the app still running?')); x.send(fd);
  });
}
$('#go').onclick = async (e) => {
  const btn = e.currentTarget;
  if (!meta.gemini_configured && !await ask({ title: 'No AI key found', text: 'The AI step will fail until you add an API key to .env. Continue anyway?', ok: 'Continue' })) return;
  btn.classList.add('busy'); btn.disabled = true;
  try {
    let job;
    if (S.mode === 'file') {
      const fd = new FormData(); fd.append('file', pickedFile); Object.entries(opts()).forEach(([k, v]) => fd.append(k, v));
      btn.classList.remove('busy'); const orig = btn.innerHTML;
      job = await uploadJob(fd, (p) => { btn.innerHTML = `Uploading ${p}%`; }).finally(() => { btn.innerHTML = orig; hydrateIcons(btn); });
    } else job = await send('/api/jobs', { url: $('#url').value.trim(), ...opts() });
    sessionStorage.setItem('spark.createJob', job.id);
    goStep(3); $('#s3actions').hidden = false; watch(job.id, '#progress');
  } catch (err) { toast(err.message, { type: 'bad' }); }
  btn.classList.remove('busy'); btn.disabled = false;
};
$('#another').onclick = () => {
  clearInterval(poll); sessionStorage.removeItem('spark.createJob'); $('#progress').innerHTML = ''; delete $('#progress').dataset.job;
  $('#url').value = ''; $('#file').value = ''; pickFile(null); checkUrl(); goStep(1);
};


/* ---------- review: pick which found clips to render ---------- */
function drawReview(el, j, sel) {
  const box = $('#g-review', el);
  if (j.status !== 'review') { box.innerHTML = ''; el._rv = null; return; }
  if (el._rv && el._rv.id === j.id) return; // keep the user's checkboxes while polling
  const list = [...j.clips].sort((a, b) => b.score - a.score);
  const R = el._rv = { id: j.id, min: (j.options || {}).min_score ?? 50, limit: '', on: new Set(list.filter(c => c.selected).map(c => c.id)) };
  const hi = list.filter(c => c.score >= R.min).length;
  box.innerHTML = `<div class="review">
    ${j.brief ? `<details class="brief"><summary>What the AI understood about this video</summary><p>${esc(j.brief).replace(/\n/g, '<br>')}</p><p class="mut">If something here is wrong, start again and fill in "Tell the AI about this video".</p></details>` : ''}
    <div class="rv-head"><div><h3>${list.length} clips found</h3><p class="mut">Ranked by the AI review panel. ${hi} scored ${R.min} or more. Untick any you don't want, then render.</p></div></div>
    <div class="rv-ctl">
      <label>Minimum rating <b id="rv-minv">60</b><input type="range" id="rv-min" min="0" max="100" step="5" value="60"></label>
      <label>Max clips <input type="number" id="rv-lim" min="1" max="${list.length}" placeholder="all" style="width:80px"></label>
      <button class="s sm" id="rv-all" type="button">Select all</button><button class="s sm" id="rv-none" type="button">None</button>
    </div>
    <div class="rv-list">${list.map((c, i) => `<label class="rv-row" data-id="${c.id}">
      <input type="checkbox" ${R.on.has(c.id) ? 'checked' : ''}><span class="rv-n">#${i + 1}</span>
      <span class="badge ${scoreCls(c.score)}">${c.score}</span>
      <span class="rv-t"><b>${esc(c.title)}</b><small class="mut">${mmss(c.params.start)}–${mmss(c.params.end)} · ${(c.params.end - c.params.start).toFixed(0)}s${c.rating ? ` · hook ${c.rating.hook} · retention ${c.rating.retention} · value ${c.rating.value} · share ${c.rating.shareability}` : ''}</small>
      <small class="mut">${esc(c.rating && c.rating.tip ? c.rating.tip : c.reason || '')}</small></span></label>`).join('')}</div>
    <div class="rv-foot"><span class="mut" id="rv-count"></span><button class="p" id="rv-go" type="button">${icon('sparkles', 'sm')}Render clips</button></div></div>`;
  const sync = () => {
    $$('.rv-row', box).forEach(r => { const on = R.on.has(r.dataset.id); r.querySelector('input').checked = on; r.classList.toggle('off', !on); });
    $('#rv-count').textContent = `${R.on.size} of ${list.length} selected`;
    $('#rv-go').disabled = !R.on.size; $('#rv-go').lastChild.textContent = `Render ${R.on.size} clip${R.on.size === 1 ? '' : 's'}`;
  };
  const byRule = () => { // minimum rating + max clips, best first
    const lim = parseInt($('#rv-lim').value, 10) || list.length;
    R.on = new Set(list.filter(c => c.score >= R.min).slice(0, lim).map(c => c.id)); sync();
  };
  $('#rv-min', box).oninput = (e) => { R.min = +e.target.value; $('#rv-minv').textContent = R.min; byRule(); };
  $('#rv-lim', box).oninput = byRule;
  $('#rv-all', box).onclick = () => { R.on = new Set(list.map(c => c.id)); sync(); };
  $('#rv-none', box).onclick = () => { R.on = new Set(); sync(); };
  $$('.rv-row input', box).forEach(inp => inp.onchange = () => { const id = inp.closest('.rv-row').dataset.id; inp.checked ? R.on.add(id) : R.on.delete(id); sync(); });
  const go = $('#rv-go', box);
  go.onclick = () => busy(go, async () => {
    try { await send(`/api/jobs/${j.id}/render`, { ids: [...R.on] }); el._rv = null; watch(j.id, sel); } catch (e) { toast(e.message, { type: 'bad' }); }
  });
  sync();
}

/* ===================== generation view ===================== */
const STAGES = [
  { k: 'download', label: 'Download', w: 10 }, { k: 'transcribe', label: 'Transcribe', w: 45 },
  { k: 'pick', label: 'AI picks & rates', w: 10 }, { k: 'review', label: 'Choose clips', w: 3 }, { k: 'render', label: 'Render clips', w: 32 },
];
let genTimer = null;
const upState = (c) => ((c.publish || {}).youtube || {}).status;
const uploading = (j) => j.clips.some(c => ['queued', 'uploading'].includes(upState(c)));
const finished = (j) => ['done', 'error', 'skipped'].includes(j.status) && !j.clips.some(c => ['rendering', 'pending'].includes(c.status)) && !uploading(j);

function watch(id, sel) {
  clearInterval(poll); currentWatch = { id, sel };
  const el = $(sel); if (el) delete el.dataset.job;
  const tick = async () => {
    try {
      const j = await api('/api/jobs/' + id); renderJob(j, sel);
      if (sel === '#progress') {
        $('#s3actions').hidden = false; $('#zipAll').href = `/api/jobs/${j.id}/zip`;
        $('#zipAll').hidden = !j.clips.some(c => c.version > 0);
        if (finished(j) && j.status === 'done' && step === 3) {
          sessionStorage.removeItem('spark.createJob'); goStep(4);
          toast(`${j.clips.length} clips ready, best first. Click one to edit or publish.`, { type: 'ok' });
        }
      }
      if (finished(j)) clearInterval(poll);
    } catch {
      clearInterval(poll);
      if (sel === '#jobview') { toast('That project no longer exists.', { type: 'warn' }); location.hash = '#/projects'; }
    }
  };
  tick(); poll = setInterval(tick, 1500);
}
function jobProgress(j) {
  if (j.status === 'done') return 100;
  const idx = STAGES.findIndex(s => s.k === j.stage_key); if (idx < 0) return 0;
  let frac = (j.progress || 0) / 100;
  if (j.stage_key === 'render' && j.render_total) frac = ((j.render_index - 1) + frac) / j.render_total;
  return Math.min(99, STAGES.slice(0, idx).reduce((a, s) => a + s.w, 0) + STAGES[idx].w * frac);
}
function friendlyHint(msg = '') {
  if (/not a bot/i.test(msg)) return 'Tip: download the video yourself and use the "Upload file" option instead.';
  if (/quota|RESOURCE_EXHAUSTED|\b429\b/i.test(msg)) return 'Every AI key hit its free limit. Add another provider key in .env (Groq, Grok, OpenRouter...), or Retry tomorrow.';
  if (/GEMINI_API_KEY|No AI key/i.test(msg)) return 'Add your key to .env and restart the app.';
  if (/No speech/i.test(msg)) return 'This video has no speech the app can transcribe, so there is nothing to pick clips from.';
  if (/503|UNAVAILABLE|high demand/i.test(msg)) return 'Google\'s AI servers are overloaded right now. Retry in a minute.';
  return '';
}
function buildGen(el, j) {
  el.dataset.job = j.id;
  el.innerHTML = `
    <div class="gen-head"><div><h2 id="g-title"></h2><div class="mut" id="g-sub"></div></div><span class="pill" id="g-pill"></span></div>
    <div class="bar" id="g-bar"><i></i></div>
    <div class="gen-meta"><b id="g-pct">0%</b><span id="g-stage"></span><span><span id="g-elapsed">0:00</span><span id="g-eta"></span></span></div>
    <div id="g-err"></div><div id="g-next"></div><div id="g-up"></div><div id="g-review"></div>
    <ol class="stepper" id="g-steps">${STAGES.map(s => `<li data-k="${s.k}"><div class="top"><span class="ico"></span><span>${s.label}</span></div><small></small><div class="bar" hidden><i></i></div></li>`).join('')}</ol>
    <div class="clips" id="g-clips"></div>
    <details class="logbox" open id="g-logbox"><summary><span class="dot"></span><span class="sp">Live log</span><button class="s sm" id="g-copy" type="button">${icon('copy', 'sm')}Copy</button></summary><div class="log" id="g-log"></div></details>`;
  el._st = { logN: 0, clipSig: {}, stageKey: null, stageT: Date.now() };
  $('#g-copy', el).onclick = (e) => { e.preventDefault(); navigator.clipboard && navigator.clipboard.writeText($('#g-log', el).innerText).then(() => toast('Log copied', { type: 'ok', ms: 1800 })); };
}
function renderJob(j, sel) {
  curJob = j;
  const el = $(sel); if (!el) return;
  if (el.dataset.job !== j.id) buildGen(el, j);
  const st = el._st, run = running(j);
  if (st.stageKey !== j.stage_key) { st.stageKey = j.stage_key; st.stageT = Date.now(); }

  $('#g-title', el).textContent = j.title || 'Starting…';
  $('#g-sub', el).textContent = [j.channel, j.duration ? mmss(j.duration) + ' video' : '', `Layout: ${layoutName(j.options.layout_id)}`].filter(Boolean).join(' · ');
  const pill = $('#g-pill', el);
  pill.className = 'pill ' + (j.status === 'done' ? 'ok' : j.status === 'error' ? 'bad' : j.status === 'skipped' ? 'idle' : j.status === 'review' ? 'ok' : 'run');
  pill.textContent = { done: 'Complete', error: 'Failed', skipped: 'Skipped', queued: 'Queued', running: 'Working', review: 'Your turn' }[j.status] || j.status;
  const pct = jobProgress(j);
  $('#g-bar', el).className = 'bar ' + (j.status === 'done' ? 'ok' : j.status === 'error' ? 'bad' : run ? 'run' : '');
  $('#g-bar i', el).style.width = pct + '%';
  $('#g-pct', el).textContent = Math.round(pct) + '%';
  $('#g-stage', el).textContent = j.status === 'done' ? 'All clips ready' : j.status === 'error' ? 'Stopped' : j.status === 'review' ? 'Pick the clips to render' : (j.stage || 'Queued');
  el._tick = () => {
    const t0 = j.started || j.created, t1 = j.finished || Date.now() / 1000;
    $('#g-elapsed', el).textContent = mmss(t1 - t0) + ' elapsed';
    const sp = (Date.now() - st.stageT) / 1000, p = j.progress || 0;
    $('#g-eta', el).textContent = run && p > 4 && p < 100 && sp > 4 ? ` · ~${mmss(sp / p * (100 - p))} left in this step` : '';
  };
  el._tick(); clearInterval(genTimer); if (run) genTimer = setInterval(() => el._tick && el._tick(), 1000);

  const hint = j.status === 'error' ? friendlyHint(j.error) : '';
  $('#g-err', el).innerHTML = j.status === 'error'
    ? `<div class="errbox"><div><b>Something went wrong</b><br>${esc(j.error)}${hint ? `<span class="hintline">${esc(hint)}</span>` : ''}</div><button class="s" id="retry" type="button">${icon('refresh', 'sm')}Retry</button></div>` : '';
  const failedClips = j.clips.filter(c => c.status === 'error');
  if (j.status === 'done' && failedClips.length) $('#g-err', el).innerHTML = `<div class="errbox"><div><b>${failedClips.length} clip${failedClips.length === 1 ? '' : 's'} failed to render</b><br>${esc(failedClips[0].error || 'Unknown error')}</div><button class="s" id="retry" type="button">${icon('refresh', 'sm')}Retry failed</button></div>`;
  const r = $('#retry', el); if (r) r.onclick = () => busy(r, () => api(`/api/jobs/${j.id}/retry`, { method: 'POST' }).then(() => watch(j.id, sel)));
  $('#g-next', el).innerHTML = j.status === 'done' && j.clips.length
    ? `<div class="banner info">${icon('sparkles')}<div><b>${j.clips.length} clips ready</b>Click any clip to change its layout, captions or trim, then publish it.</div></div>` : '';

  const cur = STAGES.findIndex(s => s.k === j.stage_key);
  $$('#g-steps li', el).forEach((li, i) => {
    const k = STAGES[i].k;
    let state = j.status === 'done' ? 'done' : i < cur ? 'done' : i === cur ? (j.status === 'error' ? 'error' : 'active') : '';
    if (j.status === 'queued') state = '';
    li.className = state;
    li.querySelector('.ico').innerHTML = state === 'done' ? icon('check', 'sm') : state === 'error' ? '!' : state === 'active' ? '' : i + 1;
    const bar = li.querySelector('.bar'), sm = li.querySelector('small');
    const showBar = state === 'active' && (j.progress || 0) > 0 && k !== 'pick';
    bar.hidden = !showBar;
    if (showBar) bar.firstElementChild.style.width = (j.stage_key === 'render' && j.render_total ? ((j.render_index - 1 + j.progress / 100) / j.render_total * 100) : j.progress) + '%';
    sm.textContent = state === 'done' ? (k === 'download' && !j.url ? 'Uploaded file' : 'Done') : state === 'active'
      ? (k === 'render' && j.render_total ? `Clip ${j.render_index} of ${j.render_total}` : k === 'pick' ? 'Picking & rating…' : `${j.progress || 0}%`) : 'Waiting';
  });

  drawReview(el, j, sel);
  const grid = $('#g-clips', el);
  const clips = j.status === 'review' ? [] : j.clips.length ? (j.status === 'done' ? [...j.clips].sort((a, b) => b.score - a.score) : j.clips) : Array.from({ length: j.status === 'error' ? 0 : (j.options.num_clips || 3) }, (_, i) => ({ id: 'ghost' + i, ghost: true }));
  const keep = new Set(clips.map(c => c.id));
  [...grid.children].forEach(ch => { if (!keep.has(ch.dataset.id)) ch.remove(); });
  clips.forEach((c, i) => {
    const sig = c.ghost ? 'g' : [c.status, c.version, c.progress, c.title, c.error, c.score, j.status === 'done' ? i : -1, upState(c), ((c.publish || {}).youtube || {}).note].join('|');
    let card = grid.querySelector(`[data-id="${c.id}"]`);
    if (card && st.clipSig[c.id] === sig) return;
    st.clipSig[c.id] = sig;
    if (!card) { card = document.createElement('div'); card.dataset.id = c.id; grid.insertBefore(card, grid.children[i] || null); }
    card.className = 'clip' + (c.ghost ? ' ghost' : '') + (upState(c) === 'uploading' ? ' up-now' : upState(c) === 'queued' ? ' up-wait' : upState(c) === 'done' ? ' up-done' : '');
    if (c.ghost) { card.innerHTML = '<div class="ph skel"></div><div class="m"><span style="width:40%"></span><span style="width:85%"></span><span style="width:55%"></span></div>'; card.onclick = null; card.removeAttribute('tabindex'); return; }
    const pic = c.version > 0 ? `<img src="/media/${j.id}/clips/${c.id}.jpg?v=${c.version}" alt="">`
      : c.status === 'error' ? '<div class="ph err">Render failed</div>'
      : `<div class="ph skel">${c.status === 'rendering' ? `<span class="ringpct">${c.progress || 0}%</span><div class="minibar"><i style="width:${c.progress || 0}%"></i></div><span>Rendering</span>` : '<span>Queued</span>'}</div>`;
    const dl = c.version > 0 ? `<a href="/media/${j.id}/clips/${c.id}.mp4?v=${c.version}" download title="Download" aria-label="Download clip">${icon('download', 'sm')}</a>` : '';
    const yp = (c.publish || {}).youtube || {};
    const upChip = { queued: ['idle', yp.note || 'Queued'], uploading: ['run', 'Uploading'], done: ['ok', 'Uploaded'], error: ['bad', 'Upload failed'], cancelled: ['idle', 'Stopped'] }[yp.status];
    const upHtml = upChip ? `<span class="pill ${upChip[0]}" title="${esc(yp.error || yp.note || '')}">${esc(upChip[1])}</span>` : '';
    const rank = j.status === 'done' && j.clips.length > 1 ? `<span class="rank">#${i + 1}</span>` : '';
    card.innerHTML = `${pic}${rank}<div class="hover">${dl}</div><div class="m"><span class="badge ${scoreCls(c.score)}" title="${c.rating ? `Hook ${c.rating.hook} · Retention ${c.rating.retention} · Value ${c.rating.value} · Share ${c.rating.shareability}` : 'AI virality score'}">${c.score}</span><b>${esc(c.title)}</b><span class="mut">${(c.params.end - c.params.start).toFixed(0)}s · ${c.status === 'rendering' ? 'updating…' : c.status}</span>${upHtml}${c.error ? `<div class="err">${esc(c.error)}</div>` : ''}</div>`;
    card.tabIndex = 0; card.setAttribute('role', 'button'); card.setAttribute('aria-label', 'Edit clip ' + c.title);
    card.onclick = (ev) => { if (!ev.target.closest('a')) openClip(j.id, c.id); };
    card.onkeydown = (ev) => { if (ev.key === 'Enter') openClip(j.id, c.id); };
  });

  clips.forEach((c, i) => { const n = grid.querySelector(`[data-id="${c.id}"]`); if (n && grid.children[i] !== n) grid.insertBefore(n, grid.children[i] || null); });
  const ready = j.clips.filter(c => c.version > 0 && c.status === 'ready');
  const todo = ready.filter(c => !['done', 'uploading', 'queued'].includes(upState(c)));
  const q = j.clips.filter(c => upState(c) === 'queued').length, doing = j.clips.some(c => upState(c) === 'uploading');
  const sumTxt = doing || q ? `Uploading… ${j.clips.filter(c => upState(c) === 'done').length} of ${ready.length} done${q ? ` · ${q} waiting` : ''}` : '';
  [$('#upAll'), $('#pup')].forEach(b => { if (!b) return; b.hidden = !todo.length && !(doing || q); b.dataset.job = j.id; b.dataset.todo = todo.length; b.dataset.q = q; b.dataset.doing = doing ? 1 : '';
    b.innerHTML = doing || q ? `${icon('x', 'sm')}Stop uploading` : `${icon('upload', 'sm')}Upload ${todo.length === ready.length ? 'all' : todo.length} to YouTube`; b.classList.toggle('danger', !!(doing || q)); b.disabled = false; });
  drawUp($('#g-up', el), j);
  const pz = $('#pzip'); if (pz && sel === '#jobview') { pz.hidden = !j.clips.some(c => c.version > 0); pz.href = `/api/jobs/${j.id}/zip`; }

  const lg = $('#g-log', el), logs = j.log || [], t0 = j.started || j.created;
  const near = lg.scrollHeight - lg.scrollTop - lg.clientHeight < 40;
  if (logs.length < st.logN) { lg.innerHTML = ''; st.logN = 0; }
  logs.slice(st.logN).forEach(l => { const d = document.createElement('div'); d.className = l.level; d.innerHTML = `<span class="t">${mmss(l.t - t0)}</span>${esc(l.msg)}`; lg.appendChild(d); });
  st.logN = logs.length; if (near) lg.scrollTop = lg.scrollHeight;
  $('#g-logbox', el).classList.toggle('live', run);
}

/* ===================== rendering queue ===================== */
let renTimer = null, renSig = '', renDrag = false;
const renNav = (n) => { const nb = $('#navRen'); if (nb) { nb.hidden = !n; nb.textContent = n; } };
async function drawRenders() {
  const box = $('#renq'); if (!box || $('#page-renders').hidden || document.hidden || renDrag) return;
  let q; try { q = await api('/api/renders/queue'); } catch { return; }
  renNav(q.total + q.preparing.length);
  const sig = JSON.stringify(q); if (sig === renSig) return; renSig = sig;
  const link = (c) => `<a href="#/projects/${esc(c.job_id)}">${esc(c.title || 'Clip')}</a><small class="mut">${esc(c.project)}</small>`;
  const stuck = q.stuck.length ? `<div class="uqstuck"><span>${q.stuck.length} project${q.stuck.length === 1 ? '' : 's'} stopped rendering (the app was probably restarted): ${q.stuck.map(s => esc(s.title)).join(', ')}</span><button class="s sm" data-resume>Resume rendering</button></div>` : '';
  const run = q.running ? `<div class="uqr now"><span class="uqn"><span class="spin"></span></span><span class="uqt">${link(q.running)}</span><span class="pill run">Rendering ${q.running.progress || 0}%${q.running.index ? ` · clip ${q.running.index} of ${q.running.total}` : ''}</span></div>` : '';
  const wait = q.waiting.map((w, i) => `<div class="uqr" draggable="true" data-j="${esc(w.job_id)}" data-c="${esc(w.clip_id || '')}"><span class="grip" title="Drag to change the order">⋮⋮</span><span class="uqn">${i + 1}</span><span class="uqt"><a href="#/projects/${esc(w.job_id)}">${esc(w.clip_id ? w.title : w.project)}</a><small class="mut">${w.clip_id ? esc(w.project) + ' · re-render' : w.count + ' clip' + (w.count === 1 ? '' : 's') + ' to render'}</small></span><span class="pill idle">Waiting</span><button class="s sm" data-top title="Render this next">Next</button></div>`).join('');
  const prep = q.preparing.map(p => `<div class="uqr"><span class="uqn"><span class="spin"></span></span><span class="uqt"><a href="#/projects/${esc(p.job_id)}">${esc(p.title)}</a><small class="mut">${esc(p.stage)} · ${Math.round(p.progress || 0)}%</small></span><span class="pill idle">Preparing</span></div>`).join('');
  const done = q.done.length ? `<h3 class="uqsec">Rendered <span class="mut">${q.done_total}</span></h3>` + q.done.map(c => `<div class="uqr done">${tickIc}<span class="uqt">${link(c)}</span>${c.t ? `<small class="mut">${fmtAgo(c.t)}</small>` : ''}</div>`).join('') : '';
  box.innerHTML = `<div class="card"><h2>${icon('scissors')}Rendering ${q.total || q.preparing.length ? `<span class="pill run">${q.total} to go</span>` : '<span class="pill ok">All caught up</span>'}</h2>
    <p class="mut">One clip renders at a time, in this order. Downloading and AI analysis run alongside.</p>${stuck}${run}${q.rest ? `<p class="mut">${q.rest} more clip${q.rest === 1 ? '' : 's'} of the running project follow it.</p>` : ''}<div class="uqlist">${wait}</div>${prep ? `<h3 class="uqsec">Getting ready</h3>${prep}` : ''}${done}</div>`;
  const list = $('.uqlist', box), saveR = async () => { try { await send('/api/renders/reorder', { order: [...list.querySelectorAll('.uqr')].map(r => [r.dataset.j, r.dataset.c || null]) }); } catch (e) { toast(e.message, { type: 'bad' }); } renSig = ''; drawRenders(); };
  list.querySelectorAll('.uqr').forEach(r => {
    $('[data-top]', r).onclick = () => { list.prepend(r); saveR(); };
    r.ondragstart = (e) => { renDrag = true; r.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.dataset.j); };
    r.ondragend = () => { r.classList.remove('drag'); renDrag = false; saveR(); };
  });
  list.ondragover = (e) => {
    e.preventDefault(); const d = $('.uqr.drag', list); if (!d) return;
    const over = [...list.querySelectorAll('.uqr:not(.drag)')].find(x => { const bb = x.getBoundingClientRect(); return e.clientY < bb.top + bb.height / 2; });
    if (over) list.insertBefore(d, over); else list.appendChild(d);
    const off = q.running ? 1 : 0; list.querySelectorAll('.uqr').forEach((x, i) => { $('.uqn', x).textContent = i + 1 + off; });
  };
  const b = $('[data-resume]', box);
  if (b) b.onclick = async () => { try { const r = await send('/api/renders/resume', {}); toast(`Resumed ${r.resumed} project${r.resumed === 1 ? '' : 's'}`, { type: 'ok', ms: 2500 }); } catch (e) { toast(e.message, { type: 'bad' }); } renSig = ''; drawRenders(); };
}
/* ===================== overall upload queue ===================== */
let upTimer = null, upSig = '', upDrag = false, upSeenHold = '';
const upNav = (q) => { const nb = $('#navUp'); if (nb) { nb.hidden = !q.total && !q.holds; nb.textContent = q.holds ? '!' : q.total; nb.classList.toggle('bad', !!q.holds); } };
const spinner = '<span class="spin" aria-label="Uploading"></span>';
const tickIc = '<span class="tick" aria-label="Uploaded">✓</span>';
function uqRow(c, k) {
  return `<div class="uqr" draggable="true" data-j="${esc(c.job_id)}" data-c="${esc(c.clip_id)}">
    <span class="grip" title="Drag to change the order">⋮⋮</span><span class="uqn">${k}</span>
    <span class="uqt"><a href="#/projects/${esc(c.job_id)}">${esc(c.title || 'Clip')}</a><small class="mut">${esc(c.project)} · ${esc(c.note || 'Waiting in the queue')}</small></span>
    <span class="pill idle">Queued</span>
    <button class="s sm" data-top title="Upload this one next">Next</button><button class="s sm danger" data-rm title="Take out of the queue">×</button></div>`;
}
async function drawUploads() {
  const box = $('#upq'); if (!box || $('#page-uploads').hidden || document.hidden || upDrag) return;
  let q; try { q = await api('/api/uploads/queue'); } catch { return; }
  upNav(q);
  const sig = JSON.stringify(q); if (sig === upSig) return; upSig = sig;
  if (!q.accounts.length) { box.innerHTML = `<div class="empty-state"><div class="big">${icon('upload')}</div><h3>Nothing uploaded yet</h3><p>Clips queued for YouTube show up here, across every project, in the order they will go.</p></div>`; return; }
  box.innerHTML = q.accounts.map(a => {
    const h = a.hold, n = a.queue.length + (a.running ? 1 : 0);
    const banner = h ? `<div class="uqhold"><div><b>${icon('alert', 'sm')} Uploads stopped</b><p>${esc(h.reason)}</p><small class="mut">${esc(h.project)} · ${esc(h.title)}${h.shot ? ` · <a href="${esc(h.shot)}" target="_blank">See screenshot</a>` : ''}</small></div>
      <div class="acts">${h.can_retry ? '<button class="s sm" data-retry>Retry</button>' : ''}<button class="p sm" data-skip>${h.can_retry ? 'Skip it and continue' : 'Continue'}</button><button class="s sm danger" data-stopall>Stop all</button></div></div>` : '';
    const run = a.running ? `<div class="uqr now"><span class="uqn">${spinner}</span><span class="uqt"><a href="#/projects/${esc(a.running.job_id)}">${esc(a.running.title || 'Clip')}</a><small class="mut">${esc(a.running.project)} · ${esc(a.running.note || 'Uploading…')}</small></span><span class="pill run">Uploading now</span><button class="s sm danger" data-stop data-j="${esc(a.running.job_id)}" data-c="${esc(a.running.clip_id)}">Stop</button></div>` : '';
    const stuck = a.stuck.length ? `<div class="uqstuck"><span>${a.stuck.length} clip${a.stuck.length === 1 ? '' : 's'} say they are uploading but nothing is working on them (the app was probably restarted).</span><button class="s sm" data-clear>Reset them</button></div>` : '';
    const done = a.done.length ? `<h3 class="uqsec">Uploaded <span class="mut">${a.done_total}</span></h3>` + a.done.map(c => `<div class="uqr done">${tickIc}<span class="uqt"><a href="#/projects/${esc(c.job_id)}">${esc(c.title || 'Clip')}</a><small class="mut">${esc(c.project)}${c.t ? ' · ' + fmtAgo(c.t) : ''}</small></span>${c.url && /^https?:/.test(c.url) ? `<a class="s sm" href="${esc(c.url)}" target="_blank" rel="noopener">Open on YouTube</a>` : ''}</div>`).join('') : '';
    return `<div class="card uqacct" data-acct="${esc(a.account)}"><h2>${icon('film')}${esc(a.name)} ${n ? `<span class="pill run">${n} to go</span>` : '<span class="pill ok">All caught up</span>'}${a.paused && !h ? '<span class="pill bad">Auto upload paused</span>' : ''}</h2>
      ${banner}${stuck}${run}<div class="uqlist">${a.queue.map((c, i) => uqRow(c, i + 1 + (a.running ? 1 : 0))).join('')}</div>${done}</div>`;
  }).join('');
  upBind(box);
}
function upBind(box) {
  box.querySelectorAll('.uqacct').forEach(card => {
    const acct = card.dataset.acct, list = $('.uqlist', card);
    const after = () => { upSig = ''; drawUploads(); };
    const go = (fn) => async () => { try { await fn(); } catch (e) { toast(e.message, { type: 'bad' }); } after(); };
    const sa = $('[data-stopall]', card); if (sa) sa.onclick = stopAllUploads;
    const rt = $('[data-retry]', card), sk = $('[data-skip]', card), cl = $('[data-clear]', card), st = $('[data-stop]', card);
    if (rt) rt.onclick = go(() => send('/api/uploads/continue', { account: acct, retry: true }));
    if (sk) sk.onclick = go(() => send('/api/uploads/continue', { account: acct, retry: false }));
    if (cl) cl.onclick = go(async () => { const r = await send('/api/uploads/clear-stuck?account=' + encodeURIComponent(acct), {}); toast(`Reset ${r.cleared}`, { type: 'ok', ms: 2500 }); });
    if (st) st.onclick = go(async () => { await send(`/api/jobs/${st.dataset.j}/clips/${st.dataset.c}/publish/cancel`, {}); toast('Upload stopped', { type: 'ok', ms: 2500 }); });
    const order = () => [...list.querySelectorAll('.uqr')].map(r => [r.dataset.j, r.dataset.c]);
    const save = go(() => send('/api/uploads/reorder', { account: acct, order: order() }));
    list.querySelectorAll('.uqr').forEach(r => {
      $('[data-top]', r).onclick = () => { list.prepend(r); save(); };
      $('[data-rm]', r).onclick = go(async () => { await send(`/api/jobs/${r.dataset.j}/clips/${r.dataset.c}/publish/cancel`, {}); });
      r.ondragstart = (e) => { upDrag = true; r.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.dataset.c); };
      r.ondragend = () => { r.classList.remove('drag'); upDrag = false; save(); };
    });
    list.ondragover = (e) => {
      e.preventDefault(); const d = $('.uqr.drag', list); if (!d) return;
      const over = [...list.querySelectorAll('.uqr:not(.drag)')].find(x => { const b = x.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; });
      if (over) list.insertBefore(d, over); else list.appendChild(d);
      const off = card.querySelector('.uqr.now') ? 1 : 0;
      list.querySelectorAll('.uqr').forEach((x, i) => { $('.uqn', x).textContent = i + 1 + off; });
    };
  });
}
/* ===================== upload all ===================== */
async function uploadAll(btn) {
  const id = btn.dataset.job; if (!id) return;
  if (+btn.dataset.q || btn.dataset.doing) {
    const r = await send(`/api/jobs/${id}/publish/cancel`, {}); toast(`Stopped ${r.cancelled} upload${r.cancelled === 1 ? '' : 's'}`, { type: 'ok' });
    return watch(id, currentWatch ? currentWatch.sel : '#progress');
  }
  const n = +btn.dataset.todo;
  await loadAccts();
  const privacy = await dialog(`<h3>Upload ${n} clip${n === 1 ? '' : 's'} to YouTube</h3>
    <p>They upload one by one through the browser window, best score first. Keep that window open; you can keep using this app meanwhile.</p>
    <label>Channel<select id="upAcct">${acctOpts((curJob && curJob.id === id && curJob.options.account) || S.account)}</select></label>
    <label style="margin-top:10px">Visibility<select id="upPriv">${['public', 'unlisted', 'private'].map(v => `<option value="${v}" ${(S.upPriv || 'public') === v ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select></label>
    <label class="chk" style="margin-top:12px"><span class="switch"><input type="checkbox" id="upHl" ${S.hideLikes ? 'checked' : ''}><span></span></span>Hide like count</label>
    <div class="acts" style="margin-top:16px"><button class="s" data-c>Cancel</button><button class="p" data-o>Start uploading</button></div>`,
    (h, close) => { h.querySelector('[data-c]').onclick = () => close(null); h.querySelector('[data-o]').onclick = () => close({ privacy: h.querySelector('#upPriv').value, hide_likes: h.querySelector('#upHl').checked, account: h.querySelector('#upAcct').value }); });
  if (!privacy) return;
  S.hideLikes = privacy.hide_likes; S.upPriv = privacy.privacy; S.account = privacy.account; savePrefs();
  try {
    const r = await send(`/api/jobs/${id}/publish/youtube-all`, privacy);
    toast(`Queued ${r.queued} upload${r.queued === 1 ? '' : 's'}`, { type: 'ok' });
    watch(id, currentWatch ? currentWatch.sel : '#progress');
  } catch (e) { toast(e.message, { type: 'bad' }); }
}
$('#upAll').onclick = (e) => uploadAll(e.currentTarget);
$('#pup').onclick = (e) => uploadAll(e.currentTarget);

/* ===================== projects ===================== */
let pFilter = 'all';
/* upload progress of a project: how many of its clips are on YouTube */
function upSummary(j) {
  const cl = j.clips || [], st = cl.map(c => ({ c, s: upState(c), p: (((c.publish || {}).youtube) || {}).progress || 0 }));
  const done = st.filter(x => x.s === 'done').length, doing = st.filter(x => x.s === 'uploading'), queued = st.filter(x => x.s === 'queued').length;
  const failed = st.filter(x => x.s === 'error').length, any = st.some(x => x.s);
  const total = j.options && j.options.auto && running(j) ? cl.length : st.filter(x => x.s || (x.c.version > 0 && x.c.status === 'ready')).length || cl.length;
  const cur = doing.length ? doing[0].p : 0;
  const pct = total ? Math.min(100, (done + cur / 100) / total * 100) : 0;
  return { total, done, doing: doing.length, queued, failed, any, pct, cur, auto: !!(j.options && j.options.auto), renderLeft: Math.max(0, cl.filter(c => c.status !== 'ready' && c.status !== 'error').length) };
}
function drawUp(box, j) {
  if (!box) return;
  const u = upSummary(j);
  if (!u.any && !(u.auto && running(j))) { box.innerHTML = ''; return; }
  const active = u.doing || u.queued || (u.auto && u.renderLeft);
  const cls = u.failed ? 'bad' : u.done === u.total && u.total && !active ? 'ok' : 'run';
  const title = u.done === u.total && u.total && !active ? `All ${u.total} clips uploaded` : `Uploaded ${u.done} of ${u.total}`;
  const sub = [u.doing ? `uploading now${u.cur ? ' (' + u.cur + '%)' : ''}` : '', u.queued ? `${u.queued} waiting` : '', u.auto && u.renderLeft ? `${u.renderLeft} still rendering` : '', u.failed ? `${u.failed} failed` : ''].filter(Boolean).join(' · ');
  box.innerHTML = `<div class="upbox ${cls}"><div class="uptop">${icon('upload')}<b>${esc(title)}</b><span class="mut">${esc(sub)}</span><span class="uppct">${Math.round(u.pct)}%</span></div><div class="bar ${cls}"><i style="width:${u.pct}%"></i></div></div>`;
}
const statusPill = (j) => { const m = { done: ['ok', 'Complete'], error: ['bad', 'Failed'], skipped: ['idle', 'Skipped'], queued: ['run', 'Queued'], running: ['run', 'Working'], review: ['ok', 'Choose clips'] }[j.status] || ['idle', j.status]; return `<span class="pill ${m[0]}">${m[1]}</span>`; };
function upBadge(j) {
  const u = upSummary(j);
  if (!j.clips.length || j.status === 'error' || j.status === 'review') return '';
  if (!u.any) return j.status === 'done' ? `<div class="upline"><span class="pill idle">Not uploaded</span></div>` : '';
  const active = u.doing || u.queued || (u.auto && running(j));
  const label = u.failed && !active ? `Upload failed · ${u.done}/${u.total} uploaded` : u.done === u.total && !active ? `Uploaded · all ${u.total}` : `${active ? 'Uploading' : 'Partly uploaded'} · ${u.done}/${u.total}`;
  const cls = u.failed && !active ? 'bad' : u.done === u.total && !active ? 'ok' : 'run';
  return `<div class="upline"><span class="pill ${cls}">${esc(label)}</span></div><div class="bar ${cls} thin"><i style="width:${u.pct}%"></i></div>`;
}
let plSig = '';
async function showProjectList(fromTimer) {
  $('#pdetail').hidden = true; $('#plistWrap').hidden = false;
  if (!fromTimer) { plSig = ''; clearInterval(poll); poll = setInterval(() => { if (!document.hidden && !$('#page-projects').hidden && $('#pdetail').hidden) showProjectList(true); }, 3000); }
  const list = $('#plist');
  if (!list.children.length) list.innerHTML = Array.from({ length: 3 }, () => '<div class="pcard"><div class="cover skel"></div><div class="pbody"><span class="skel" style="height:14px;border-radius:6px"></span><span class="skel" style="height:14px;width:50%;border-radius:6px"></span></div></div>').join('');
  let js = []; try { js = await api('/api/jobs'); } catch { toast('Couldn\'t load projects.', { type: 'bad' }); }
  const q = $('#pq').value.trim().toLowerCase();
  const vis = js.filter(j => (pFilter === 'all' || (pFilter === 'running' ? running(j) : pFilter === 'done' ? j.status === 'done' : j.status === 'error')) && (!q || (j.title || '').toLowerCase().includes(q)));
  if (!js.length) { list.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="big">${icon('film')}</div><h3>No projects yet</h3><p>Generate your first clips and they'll show up here.</p><a class="btn p" href="#/home">${icon('sparkles', 'sm')}Find a creator</a></div>`; return; }
  if (!vis.length) { list.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><h3>No matches</h3><p>Try a different search or filter.</p></div>'; return; }
  const sig = JSON.stringify(vis.map(j => [j.id, j.status, j.stage, j.title, j.clips.map(c => [c.status, c.version, ((c.publish || {}).youtube || {}).status, ((c.publish || {}).youtube || {}).progress])]));
  if (fromTimer && sig === plSig) return;
  plSig = sig;
  list.innerHTML = '';
  vis.forEach(j => {
    const thumbs = j.clips.filter(c => c.version > 0).slice(0, 3);
    const cover = thumbs.length ? `<div class="cover">${thumbs.map(c => `<img loading="lazy" alt="" src="/media/${j.id}/clips/${c.id}.jpg?v=${c.version}">`).join('')}</div>` : `<div class="cover empty">${running(j) ? '<div class="skel" style="position:absolute;inset:0"></div>' : ''}${icon('film')}</div>`;
    const c = document.createElement('div'); c.className = 'pcard'; c.tabIndex = 0; c.setAttribute('role', 'link');
    c.style.position = 'relative';
    c.innerHTML = `${cover}<button class="icon del danger" aria-label="Delete project" title="Delete">${icon('trash', 'sm')}</button><div class="pbody"><b>${esc(j.title || j.id)}</b><div class="pmeta">${statusPill(j)}<span>${j.clips.length} clips</span>${j.clips.some(c => c.status === 'error') ? `<span class="pill bad">${j.clips.filter(c => c.status === 'error').length} failed</span>` : ''}<span>· ${fmtAgo(j.created)}</span>${j.source === 'watcher' ? '<span class="pill idle">Auto</span>' : ''}</div>${upBadge(j)}</div>`;
    c.onclick = (ev) => { if (!ev.target.closest('.del')) location.hash = '#/projects/' + j.id; };
    c.onkeydown = (ev) => { if (ev.key === 'Enter') location.hash = '#/projects/' + j.id; };
    c.querySelector('.del').onclick = () => deleteProject(j, showProjectList);
    list.appendChild(c);
  });
}
async function deleteProject(j, after) {
  if (!await ask({ title: 'Delete this project?', text: `"${j.title || j.id}" and all of its clips will be permanently removed.`, ok: 'Delete', danger: true })) return;
  try { await api('/api/jobs/' + j.id, { method: 'DELETE' }); toast('Project deleted', { type: 'ok' }); after && after(); } catch (e) { toast(e.message, { type: 'bad' }); }
}
function showProject(id) {
  $('#plistWrap').hidden = true; $('#pdetail').hidden = false;
  $('#pgTitle').textContent = 'Project'; $('#pgSub').textContent = '';
  watch(id, '#jobview');
  $('#pdel').onclick = () => deleteProject({ id, title: curJob && curJob.id === id ? curJob.title : id }, () => { location.hash = '#/projects'; });
}
$('#pback').onclick = () => { location.hash = '#/projects'; };
let pqT; $('#pq').addEventListener('input', () => { clearTimeout(pqT); pqT = setTimeout(() => showProjectList(), 150); });
$$('#pfilter button').forEach(b => b.onclick = () => { pFilter = b.dataset.v; $$('#pfilter button').forEach(x => x.classList.toggle('on', x === b)); showProjectList(); });

/* ===================== creator videos + settings ===================== */
async function openCreator(c) {
  await Promise.all([loadAccts(), loadPresets()]);
  const fmtViews = (n) => n == null ? '' : (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n)) + ' views';
  const mode = c.options.auto ? 'Clip + upload' : 'Clip';
  const acct = (accts.find(a => a.id === (c.options.account || 'default')) || {}).name || 'Main channel';
  const pillOf = (x) => !x.enabled ? ['idle', 'Not checking new videos'] : x.options.auto ? ['ok', 'Full auto → ' + ((accts.find(a => a.id === (x.options.account || 'default')) || {}).name || 'Main channel')] : ['idle', 'Clips only'];
  return dialog(`<div class="cdetail">
      <div class="cd-head"><span class="avatar">${esc((c.name || '?')[0].toUpperCase())}</span>
        <div><h3>${esc(c.name)}</h3><span class="pill ${pillOf(c)[0]}">${esc(pillOf(c)[1])}</span><small class="mut" style="display:block;margin-top:4px" data-edsum></small></div>
        <button class="ghost icon" data-c aria-label="Close">${icon('x')}</button></div>
      <div class="cd-tabs" role="tablist"><button class="on" data-tab="videos" role="tab">Videos</button><button data-tab="settings" role="tab">Settings <i class="dirty" data-dirty hidden title="Unsaved changes"></i></button></div>
      <div class="cd-body">
        <div data-pane="videos">
          <div class="cd-sec"><div class="cl-head"><h4>Videos</h4><div class="seg" role="group" aria-label="Sort videos"><button class="on" data-sort="new" type="button">Newest</button><button data-sort="views" type="button">Most viewed</button></div></div>
            <p class="mut cl-note" hidden>Ranked by views among this channel's latest 300 uploads.</p><div class="cl-vids"></div>
            <button class="s cd-more" data-more hidden>Show more</button><div class="mut cl-msg"></div></div>
          <div class="cd-sec"><h4>Already clipped</h4><div class="cl-clipped mut">Loading…</div></div>
        </div>
        <div data-pane="settings" hidden>
          <div class="sform" data-set></div>
          <div class="cd-save"><button class="p" data-saveset>Save settings</button><span class="mut" data-savemsg></span><button class="s sm danger" data-unfollow style="margin-left:auto">Unfollow</button></div>
        </div>
      </div></div>`,
    (h, close) => {
      h.querySelector('.dlg').classList.add('wide');
      let dirty = false;
      const setDirty = (d) => { dirty = d; h.querySelector('[data-dirty]').hidden = !d; h.querySelector('[data-savemsg]').textContent = d ? 'Unsaved changes' : ''; };
      const tryClose = async () => { if (dirty && !await ask({ title: 'Discard your changes?', text: 'You changed settings but did not save them.', ok: 'Discard', danger: true })) return; close(true); };
      h.querySelector('[data-c]').onclick = tryClose;
      h.querySelectorAll('[data-tab]').forEach(t => t.onclick = () => {
        h.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === t));
        h.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== t.dataset.tab; });
        if (t.dataset.tab === 'settings') pvShow();
      });
      const setBox = h.querySelector('[data-set]'); const sv = { ...c.options, enabled: c.enabled, preset: presetName(c.preset) ? c.preset : '', allowCustom: true };
      setBox.innerHTML = settingsForm(sv); wireMode(setBox);
      const pvShow = wirePresetPreview(setBox, { ...FOLLOW_DEFAULTS, ...sv }, () => close(true));
      const edsum = () => { const x = presetName(c.preset); h.querySelector('[data-edsum]').textContent = 'Edit style: ' + (x || 'Custom look'); };
      edsum();
      setBox.addEventListener('input', () => setDirty(true)); setBox.addEventListener('change', () => setDirty(true));
      h.querySelector('[data-saveset]').onclick = (e) => busy(e.currentTarget, async () => {
        const body = readSettings(setBox);
        if (body.min_len >= body.max_len) { toast('Shortest clip must be shorter than the longest clip.', { type: 'bad' }); return; }
        try {
          const nc = await send(`/api/creators/${c.channel_id}/settings`, body, 'PUT'); Object.assign(c, nc); c.preset = nc.preset;
          const [cls, txt] = pillOf(c); const pill = h.querySelector('.cd-head .pill'); pill.className = 'pill ' + cls; pill.textContent = txt; edsum();
          setDirty(false); toast('Settings saved. They apply to new videos from now on.', { type: 'ok', ms: 3500 });
        } catch (err) { toast(err.message, { type: 'bad' }); }
      });
      h.querySelector('[data-unfollow]').onclick = async () => { if (await ask({ title: `Unfollow ${c.name}?`, text: "Future uploads won't be clipped. Existing projects stay.", ok: 'Unfollow', danger: true })) { await api('/api/creators/' + c.channel_id, { method: 'DELETE' }); close(true); } };
      const vids = h.querySelector('.cl-vids'), more = h.querySelector('[data-more]'), msg = h.querySelector('.cl-msg');
      let offset = 0, sortBy = 'new'; const PAGE = 5; let shown = {};
      api(`/api/creators/${c.channel_id}/detail`).then(d => {
        h.querySelector('.cl-clipped').innerHTML = d.clipped.length ? d.clipped.map(j => `<a class="cl-job" href="#/projects/${j.id}">
          <b>${esc(j.title || j.id)}</b><span class="mut">${esc(j.status)} · ${j.clips} clip${j.clips === 1 ? '' : 's'}${j.uploaded ? ' · ' + j.uploaded + ' uploaded' : ''} · ${fmtAgo(j.created)}</span></a>`).join('') : '<span class="mut">Nothing clipped from this creator yet.</span>';
        h.querySelectorAll('.cl-job').forEach(a => a.addEventListener('click', () => close(true)));
      }).catch(() => { h.querySelector('.cl-clipped').textContent = 'Couldn\'t load.'; });
      const row = (v) => {
        const r = document.createElement('div'); r.className = 'cl-vid';
        r.innerHTML = `<div class="cl-th"><img loading="lazy" alt="" src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg">${v.duration ? `<span class="dur">${mmss(v.duration)}</span>` : ''}</div>
          <div class="cl-t"><b>${esc(v.title)}</b><span class="mut">${[fmtViews(v.view_count), v.live ? 'Live stream' : ''].filter(Boolean).join(' · ') || '&nbsp;'}</span></div>
          <div class="cl-act">${v.job ? `<a class="s sm btn" href="#/projects/${v.job}">Clipped · View</a>` : `<button class="p sm">${mode}</button>`}</div>`;
        const b = r.querySelector('button');
        if (b) b.onclick = () => busy(b, async () => {
          if (c.options.auto && !await ask({ title: 'Clip and upload this video?', text: `Clips rated ${c.options.min_score ?? 50}+ will be uploaded to ${acct}, as ${c.options.auto_privacy || 'public'}.`, ok: 'Clip and upload' })) return;
          try { const res = await send(`/api/creators/${c.channel_id}/clip`, { video_id: v.id, title: v.title }); toast('Started. Follow it under Projects.', { type: 'ok', ms: 5000, action: { label: 'View', run: () => { location.hash = '#/projects/' + res.job; } } });
            b.outerHTML = `<a class="s sm btn" href="#/projects/${res.job}">Started · View</a>`; } catch (e) { toast(e.message, { type: 'bad' }); }
        });
        return r;
      };
      const load = async () => {
        more.classList.add('busy'); more.disabled = true; msg.textContent = '';
        try {
          const mySort = sortBy; const r = await api(`/api/creators/${c.channel_id}/videos?offset=${offset}&limit=${PAGE}&sort=${sortBy}`); if (mySort !== sortBy) return;
          r.videos.forEach(v => { if (!shown[v.id]) { shown[v.id] = 1; vids.appendChild(row(v)); } });
          offset += PAGE; more.hidden = !r.has_more;
          if (!vids.children.length) msg.textContent = 'No videos found.';
        } catch (e) { msg.textContent = e.message; more.hidden = false; }
        more.classList.remove('busy'); more.disabled = false;
      };
      more.onclick = load; more.hidden = false;
      h.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => {
        if (sortBy === b.dataset.sort) return;
        sortBy = b.dataset.sort; offset = 0; shown = {}; vids.innerHTML = '';
        h.querySelectorAll('[data-sort]').forEach(x => x.classList.toggle('on', x === b));
        h.querySelector('.cl-note').hidden = sortBy !== 'views';
        load();
      });
      load();
    });
}
/* ===================== edits: presets ===================== */
let presetList = [];
async function loadPresets() { try { presetList = await api('/api/presets'); } catch { /* keep the last list */ } return presetList; }
const presetName = (id) => (presetList.find(p => p.id === id) || {}).name;
const capName = (k) => (CAP[k] || [k])[0];
const presetFacts = (s) => [layoutName(s.layout_id), s.subtitles ? capName(s.sub_style) + ' captions' : 'No captions', s.hook_text ? 'Hook text' : 'No hook text', s.resolution,
  ...((s.look && s.look.filter && s.look.filter !== 'none') ? [((meta.filters || {})[s.look.filter] || s.look.filter) + ' filter'] : []), ...((s.pacing && s.pacing.speed > 100) ? ['Speed ' + s.pacing.speed + '%'] : []), ...((s.pacing && s.pacing.cut_pauses) ? ['Cuts pauses'] : []), ...((s.smart_framing === false) ? ['Fixed framing'] : []), ...((n) => n === 5 ? ['Retention edits'] : n > 0 ? ['Retention ' + n + '/5'] : [])(['trim_start', 'trim_end', 'hook_rules', 'hook_weight', 'punch'].filter(k => (s.retention || {})[k] !== false).length), ...((s.stock && s.stock.on) ? [s.stock.every_max <= 4.5 ? 'Fast-cut stock footage' : 'Stock cutaways'] : []), ...((s.music && s.music.track) ? ['Music'] : []), ...((s.motion && s.motion.zoom) ? ['Slow zoom ' + s.motion.zoom + '%'] : []), ...((s.motion && s.motion.shake) ? ['Shake ' + s.motion.shake + '%'] : [])];
const layoutById = (id) => layouts.find(l => l.id === id);

async function loadEdits() {
  const grid = $('#edlist');
  await loadPresets();
  $('#pgActions').innerHTML = `<button class="p sm" id="newPreset" type="button">${icon('sparkles', 'sm')}New preset</button>`;
  $('#newPreset').onclick = () => presetEditor(null).then(r => r && loadEdits());
  grid.innerHTML = '';
  let rep = {}; try { (await api('/api/styles/report')).forEach(r => { rep[r.preset] = r; }); } catch { /* report is optional */ }
  presetList.forEach(p => {
    const d = document.createElement('div'); d.className = 'edcard';
    const rp = rep[p.id], repTxt = rp ? `${rp.clips} clip${rp.clips === 1 ? '' : 's'} made` + (rp.rated ? ` · avg ${rp.avg_watched_pct}% stayed (${rp.rated} rated)` : ' · no results entered yet') : '';
    const lay = layoutById(p.settings.layout_id);
    d.innerHTML = `<div class="edth"></div><div class="edbody"><b>${esc(p.name)}</b>${p.builtin ? '<span class="pill idle">Ready-made' + (p.modified ? ' (changed)' : '') + '</span>' : ''}
      <p class="mut">${esc(p.description || '')}</p>
      <div class="edfacts">${presetFacts(p.settings).map(f => `<span>${esc(f)}</span>`).join('')}</div>
      <small class="mut">${p.used_by ? `Used by ${p.used_by} creator${p.used_by === 1 ? '' : 's'}` : 'Not used by anyone yet'}</small>${repTxt ? `<small class="mut">${esc(repTxt)}</small>` : ''}
      <div class="acts"><button class="s sm" data-dup>Duplicate</button><button class="p sm" data-edit>Edit</button>${p.modified ? '<button class="s sm" data-reset>Reset</button>' : ''}${p.builtin ? '' : '<button class="s sm danger" data-del>Delete</button>'}</div></div>`;
    if (lay) $('.edth', d).appendChild(LE.thumb(lay, 64));
    $('[data-dup]', d).onclick = async () => {
      try { await send('/api/presets', { name: (p.name + ' copy').slice(0, 40), description: p.description, settings: p.settings }); toast('Duplicated. Edit your copy to change it.', { type: 'ok' }); loadEdits(); } catch (e) { toast(e.message, { type: 'bad' }); }
    };
    const eb = $('[data-edit]', d); if (eb) eb.onclick = () => presetEditor(p).then(r => r && loadEdits());
    const rb = $('[data-reset]', d); if (rb) rb.onclick = async () => {
      if (!await ask({ title: `Reset "${p.name}"?`, text: 'Goes back to the original ready-made look. Creators using it get that look on new videos.', ok: 'Reset' })) return;
      try { await send('/api/presets/' + p.id + '/reset', {}); toast('Reset to original', { type: 'ok' }); loadEdits(); } catch (e) { toast(e.message, { type: 'bad' }); }
    };
    const db = $('[data-del]', d); if (db) db.onclick = async () => {
      if (!await ask({ title: `Delete "${p.name}"?`, text: p.used_by ? `${p.used_by} creator${p.used_by === 1 ? ' uses' : 's use'} it. They keep the look they have now, and it stops following this preset.` : 'This cannot be undone.', ok: 'Delete', danger: true })) return;
      try { await api('/api/presets/' + p.id, { method: 'DELETE' }); toast('Preset deleted', { type: 'ok' }); loadEdits(); } catch (e) { toast(e.message, { type: 'bad' }); }
    };
    grid.appendChild(d);
  });
}
let peTab = 0;
function presetEditor(p) {
  /* full-page editor with a live preview; resolves with the saved preset, or null if cancelled */
  const st = JSON.parse(JSON.stringify(p ? p.settings : presetList[0].settings));
  st.motion = { zoom: 0, shake: 0, ...(st.motion || {}) };
  st.caption = { ...(st.caption || {}) };
  st.hook = { ...(st.hook || {}) };
  if (st.smart_framing === undefined) st.smart_framing = true;
  st.retention = { trim_start: true, trim_end: true, hook_rules: true, hook_weight: true, punch: true, ...(st.retention || {}) };
  st.stock = { on: false, source: 'library_first', every_min: 5, every_max: 10, len_min: 1.5, len_max: 3, confidence: 60, fallback: 'zoom', max: 8, judge: false, ...(st.stock || {}) };
  st.music = { track: null, volume: 15, duck: true, ...(st.music || {}) };
  st.pacing = { speed: 100, cut_pauses: false, pause: 0.6, ...(st.pacing || {}) };
  st.look = { filter: 'none', strength: 60, brightness: 0, contrast: 0, saturation: 0, sharpness: 0, ...(st.look || {}) };
  const page = $('#page-edits'), list = $('#edlist'), intro = page.querySelector('.ed-intro');
  const acts = $('#pgActions'), savedActs = acts.innerHTML;
  const fonts = meta.fonts || ['Arial'];
  const sd = () => (meta.style_defs || {})[st.sub_style] || { font: 'Arial', size: 0.05, primary: '#FFFFFF', hi: '#FFFFFF', outline: 4, caps: false };
  const cv = (k) => st.caption[k] !== undefined ? st.caption[k] : ({ font: sd().font, size: sd().size, primary: sd().primary, hi: sd().hi, outline: sd().outline, caps: sd().caps, outline_color: '#000000', shadow: 2, bold: true, bottom: 0.22, words: 3, highlight: true, box: false })[k];
  const hv = (k) => st.hook[k] !== undefined ? st.hook[k] : ({ font: 'Arial', size: 0.05, color: '#FFFFFF', y: 0.14, duration: 3.5, bold: true, style: 'outline', outline_color: '#000000', box_color: '#000000' })[k];
  const rng = (id, lab, min, max, step) => `<label>${lab}: <b id="${id}_v"></b><input type="range" id="${id}" min="${min}" max="${max}" step="${step}"></label>`;
  const col = (id, lab) => `<label>${lab}<input type="color" id="${id}"></label>`;
  const fsel = (id, lab) => `<label>${lab}<select id="${id}">${fonts.map(f => `<option>${esc(f)}</option>`).join('')}</select></label>`;
  const soon = (title, text) => `<h5 class="wz-sec">${title} <span class="pill idle">Coming next</span></h5><p class="hint" style="opacity:.6">${text}</p>`;
  list.hidden = true; if (intro) intro.hidden = true;
  const root = document.createElement('div'); root.className = 'pe-full';
  page.appendChild(root);
  acts.innerHTML = '';
  return new Promise((resolve) => {
    const end = (r) => { root.remove(); list.hidden = false; if (intro) intro.hidden = false; acts.innerHTML = savedActs; const nb = $('#newPreset'); if (nb) nb.onclick = () => presetEditor(null).then(x => x && loadEdits()); resolve(r); };
    root.innerHTML = `<div class="pe-form">
      <div class="row" style="justify-content:space-between;margin:0 0 6px"><h3 style="margin:0">${p ? 'Edit preset' : 'New preset'}${p && p.builtin ? ' <span class="pill idle">Ready-made</span>' : ''}</h3>
        <div class="row" style="margin:0"><button class="s" data-c type="button">Cancel</button><button class="p" data-o type="button">${p ? 'Save preset' : 'Create preset'}</button></div></div>
      ${p && p.used_by ? `<div class="banner info" style="margin:8px 0">${icon('sparkles')}<div><p style="margin:0">${p.used_by} creator${p.used_by === 1 ? ' uses' : 's use'} this preset. Saving changes the look of their <em style="font-style:normal;font-weight:700">new</em> videos. Clips already made stay as they are.</p></div></div>` : ''}
      <div class="sgrid"><label>Name<input id="pe_name" maxlength="40" value="${esc(p ? p.name : '')}" placeholder="e.g. Podcast look"></label>
        <label>Short description (optional)<input id="pe_desc" maxlength="200" value="${esc(p ? p.description : '')}"></label></div>
      <h5 class="wz-sec">Layout</h5><div class="pe-lays" id="pe_lays"></div>
      <div class="sgrid one">${sw('pe_smart', 'Smart framing (for horizontal videos)', st.smart_framing)}</div>
      <p class="hint">Follows the speaker shot by shot: when the camera cuts to someone off-centre the picture re-centres on them, and wide shots or shots with nobody in them show the whole picture over a blurred background instead of a crop that loses people. Works with Full frame. Not shown in the still preview.</p>
      <h5 class="wz-sec">Captions</h5>
      <div class="sgrid">${sw('pe_subs', 'Captions on', st.subtitles)}</div>
      <div id="pe_capbox"><div class="chips" id="pe_caps"></div>
        <p class="hint">Pick a starting style, then change anything below. Every change shows in the preview.</p>
        <div class="sgrid">${fsel('c_font', 'Font')}${rng('c_size', 'Text size', 2.5, 9, 0.1)}${rng('c_bottom', 'Height from bottom', 3, 80, 1)}${rng('c_words', 'Words per line', 1, 6, 1)}</div>
        <div class="sgrid">${col('c_primary', 'Text color')}${col('c_hi', 'Spoken-word color')}${col('c_outc', 'Outline color')}${rng('c_outline', 'Outline thickness', 0, 12, 0.5)}${rng('c_shadow', 'Shadow', 0, 8, 0.5)}</div>
        <div class="sgrid">${sw('c_bold', 'Bold', cv('bold'))}${sw('c_caps', 'ALL CAPS', cv('caps'))}${sw('c_hl', 'Highlight the spoken word', cv('highlight'))}${sw('c_box', 'Box behind the text', cv('box'))}</div></div>
      <h5 class="wz-sec">Hook text (first seconds)</h5>
      <div class="sgrid">${sw('pe_hook', 'Show hook text', st.hook_text)}</div>
      <div id="pe_hookbox"><div class="sgrid">${fsel('h_font', 'Font')}${rng('h_size', 'Text size', 2.5, 9, 0.1)}${rng('h_y', 'Height from top', 4, 95, 1)}${rng('h_dur', 'Shows for', 0.5, 15, 0.5)}</div>
        <div class="sgrid"><label>Style<select id="h_style"><option value="outline">Outline</option><option value="plain">Plain</option><option value="box">Box</option></select></label>${col('h_color', 'Text color')}${col('h_outc', 'Outline color')}${col('h_boxc', 'Box color')}${sw('h_bold', 'Bold', hv('bold'))}</div></div>
      <h5 class="wz-sec">Keep viewers watching</h5>
      <p class="hint">Small edits that help viewers stay past the first seconds. They are all on by default; turn off any you don't want. None of them uses an extra AI request. They apply to new videos; clips already made stay as they are. (Not shown in the still preview.)</p>
      <div class="sgrid one">
        ${sw('rt_trim_start', 'Open on the hook: trim filler openers ("so", "um", "you know") and dead air at the start', st.retention.trim_start)}
        ${sw('rt_trim_end', 'End on the payoff: cut a closing "thank you / see you" line and trailing filler', st.retention.trim_end)}
        ${sw('rt_hook_rules', 'Stricter hook-text rules: short, a curiosity gap, specific, never gives the answer away', st.retention.hook_rules)}
        ${sw('rt_hook_weight', 'Rank clips by hook strength and prefer tight clips (15 to 45 seconds)', st.retention.hook_weight)}
        ${sw('rt_punch', 'Punch-in: a slight zoom that toggles at sentence starts, so the picture keeps changing', st.retention.punch)}
      </div>
      <h5 class="wz-sec">Quality</h5><div class="sgrid"><label>Resolution<select id="pe_res">${optHtml((meta.resolutions || ['720p', '1080p']).map(r => [r, r]), st.resolution)}</select></label></div>
      <h5 class="wz-sec">Color look</h5>
      <div class="sgrid"><label>Filter<select id="l_filter">${Object.entries(meta.filters || { none: 'No filter' }).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>${rng('l_strength', 'Filter strength', 0, 100, 5)}</div>
      <div class="sgrid">${rng('l_bright', 'Brightness', -100, 100, 5)}${rng('l_contrast', 'Contrast', -100, 100, 5)}${rng('l_sat', 'Saturation', -100, 100, 5)}${rng('l_sharp', 'Sharpness', 0, 100, 5)}</div>
      <p class="hint">Applies to the picture only; captions stay clean. All 0 and "No filter" = untouched.</p>
      <h5 class="wz-sec">Pacing</h5>
      <div class="sgrid">${rng('pc_speed', 'Speed', 100, 150, 5)}${sw('pc_cut', 'Cut long pauses', st.pacing.cut_pauses)}${rng('pc_pause', 'Cut pauses longer than', 0.3, 2, 0.1)}</div>
      <p class="hint">Speed 100% = normal. Cutting removes silent gaps between words, keeping a short breath each side; captions follow the cut. Pauses are found from the transcript, so "um" and "uh" are not removed unless the transcript has them as words.</p>
      <h5 class="wz-sec">Background music</h5>
      <div class="sgrid"><label>Track<select id="mu_track"></select></label>${rng('mu_vol', 'Music volume', 0, 100, 5)}${sw('mu_duck', 'Lower the music while someone speaks', st.music.duck)}</div>
      <div class="row" style="margin:0 0 8px;gap:10px"><label class="btn s sm" style="cursor:pointer">Upload a track<input type="file" id="mu_file" accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,audio/*" hidden></label><button class="s sm" id="mu_play" type="button">Play</button><button class="s sm danger" id="mu_del" type="button">Delete this track</button><audio id="mu_audio" hidden></audio></div>
      <p class="hint">Only upload music you have the right to use on YouTube. The track loops to fit the clip. Not shown in the picture preview.</p>
      <h5 class="wz-sec">Motion</h5>
      <div class="sgrid">${rng('pe_zoom', 'Slow zoom', 0, 100, 5)}${rng('pe_shake', 'Shake on loud moments', 0, 100, 5)}</div>
      <p class="hint">0 = off. Zoom slowly moves in over the whole clip. Shake gives a short, light jolt when the audio suddenly gets loud. Captions stay still. (Motion isn't shown in the still preview.)</p>
      <h5 class="wz-sec">Stock video cutaways</h5>
      <div class="sgrid">${sw('sk_on', 'Cut away to stock footage', st.stock.on)}</div>
      <div id="sk_box">
        <p class="hint">The AI finds moments where the speaker mentions something you can film (an air hostess, a piece of paper) and the clip cuts to matching free stock footage for a moment. Matching is by the footage's description and tags, not by looking inside it. It costs 1 AI request per clip.</p>
        <div class="row" style="margin:0 0 10px;gap:12px;align-items:center"><span class="mut">Pace</span><div class="seg" id="sk_pace" role="group" aria-label="Cutaway pace"><button type="button" data-pace="calm">Calm</button><button type="button" data-pace="fast">Fast cuts</button></div><small class="mut" id="sk_pacehint"></small></div>
        <div class="sgrid"><label>Where to get footage<select id="sk_src"><option value="library_first">My library first, then live search</option><option value="library">My library only</option><option value="live">Live search only</option></select></label>
          <label>When nothing matches well enough<select id="sk_fb"><option value="zoom">Quick zoom-in on the speaker</option><option value="skip">Skip that cutaway</option></select></label></div>
        <div class="sgrid">${rng('sk_emin', 'Shortest gap between cutaways', 1, 30, 0.5)}${rng('sk_emax', 'Longest gap', 1, 60, 0.5)}${rng('sk_lmin', 'Shortest cutaway', 0.5, 8, 0.5)}${rng('sk_lmax', 'Longest cutaway', 0.5, 10, 0.5)}${rng('sk_conf', 'Match confidence needed', 0, 100, 5)}${rng('sk_max', 'Most cutaways per clip', 1, 40, 1)}</div>
        <div class="sgrid one">${sw('sk_judge', 'Extra AI check on unclear picks (1 more AI request per clip, only if some picks are unclear)', st.stock.judge)}</div>
        <p class="hint">Higher confidence = fewer but better-fitting cutaways (the rest use the fallback). "Fast cuts" is a new visual every 1.5-3 seconds, like viral edits; it finds more moments, so it needs more footage. The extra AI check is off by default to save AI requests. Cutaways are planned once per clip when it renders; the preview picture above doesn't show them.</p>
        <div class="sk-keys" id="sk_keys"></div>
        <details class="sk-test"><summary>Try a search phrase</summary>
          <div class="row" style="margin:8px 0;gap:8px"><input id="sk_q" placeholder="e.g. air hostess" style="flex:1"><button class="s sm" id="sk_go" type="button">Search</button></div><div id="sk_res" class="sk-res"></div></details>
      </div>
    </div>
    <div class="pe-prev"><div class="pe-prevbox"><img id="pe_img" alt="Preview"><div class="pe-spin" id="pe_spin">Updating…</div></div>
      <p class="hint" style="text-align:center">Live preview on a frame from your latest video. Hook, captions and layout are real; the words are samples.</p></div>`;
    /* split the long form into tabs: one topic at a time, the preview stays in view */
    (() => {
      const form = root.querySelector('.pe-form');
      const kids = [...form.children];
      const first = kids.findIndex(k => k.classList.contains('wz-sec'));
      const top = document.createElement('div'); top.className = 'pe-top';
      const meta_ = document.createElement('div'); meta_.className = 'pe-meta';
      kids.slice(0, first).forEach((k, i) => (i === 0 ? top : meta_).appendChild(k));
      const groups = [['Basics', null], ['Layout', ['Layout']], ['Captions', ['Captions']], ['Hook text', ['Hook text (first seconds)']], ['Retention', ['Keep viewers watching']], ['Look', ['Quality', 'Color look']],
        ['Sound & pace', ['Pacing', 'Background music']], ['Motion', ['Motion']], ['Stock footage', ['Stock video cutaways']], ['Test', []]];
      const secs = {}; let cur = null;
      kids.slice(first).forEach(k => { if (k.classList.contains('wz-sec')) { cur = secs[k.textContent.trim()] = [k]; } else if (cur) cur.push(k); });
      const bar = document.createElement('div'); bar.className = 'pe-tabs'; bar.setAttribute('role', 'tablist');
      const panels = [];
      groups.forEach(([label, titles], gi) => {
        const panel = document.createElement('div'); panel.className = 'pe-panel'; panel.hidden = true;
        if (!titles) panel.appendChild(meta_);
        else titles.forEach(t => (secs[t] || []).forEach((el, i) => { panel.appendChild(el); if (i === 0 && titles.length === 1) el.hidden = true; }));
        const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('role', 'tab');
        b.onclick = () => { peTab = gi; bar.querySelectorAll('button').forEach((x, xi) => { x.classList.toggle('on', xi === gi); x.setAttribute('aria-selected', xi === gi); }); panels.forEach((p, pi) => { p.hidden = pi !== gi; }); };
        bar.appendChild(b); panels.push(panel);
      });
      top.appendChild(bar); form.appendChild(top); panels.forEach(p => form.appendChild(p));
      bar.children[Math.min(peTab, panels.length - 1)].click();
    })();
    const q = (s) => root.querySelector(s);
    /* testing area: render a short throw-away video with the settings as they are right now (saved or not) */
    (() => {
      const panel = [...root.querySelectorAll('.pe-panel')].pop(); if (!panel) return;
      panel.innerHTML = `<p class="hint" style="margin-top:0">Try this look on a real video before you save it. It renders a short test with the settings as they are right now (even unsaved ones), at 720p, with no stock footage. Nothing is added to the project.</p>
        <label class="fld">Project<select id="tp_job"><option value="">Loading…</option></select></label>
        <label class="fld">What to test<select id="tp_clip"></select></label>
        <div class="row" id="tp_range" style="gap:8px;align-items:center" hidden><label>From (seconds)<input type="number" id="tp_s" min="0" value="0" style="width:90px"></label><label>To (seconds)<input type="number" id="tp_e" min="3" value="30" style="width:90px"></label><span class="mut">Up to 60 s</span></div>
        <div class="row" style="margin-top:10px;gap:8px;align-items:center"><button class="p" type="button" id="tp_go">Render test</button><span class="mut" id="tp_state"></span></div>
        <video id="tp_vid" controls playsinline hidden style="margin-top:10px;max-height:420px;max-width:100%;border-radius:10px;background:#000"></video>`;
      let jobsL = [];
      api('/api/jobs').then(js => {
        jobsL = js.filter(j => (j.clips || []).length);
        const sel = panel.querySelector('#tp_job');
        sel.innerHTML = jobsL.length ? jobsL.map(j => `<option value="${esc(j.id)}">${esc(j.title || j.id)}</option>`).join('') : '<option value="">No projects yet</option>';
        sel.onchange();
      }).catch(() => { panel.querySelector('#tp_job').innerHTML = '<option value="">Couldn\'t load projects</option>'; });
      const selJob = panel.querySelector('#tp_job'), selClip = panel.querySelector('#tp_clip');
      selJob.onchange = () => {
        const j = jobsL.find(x => x.id === selJob.value);
        selClip.innerHTML = '<option value="">A part of the full video (choose the seconds)</option>' + ((j && j.clips) || []).map(c => `<option value="${esc(c.id)}">Clip: ${esc(c.title)} (${(c.params.end - c.params.start).toFixed(0)}s)</option>`).join('');
        if (j && j.clips && j.clips.length) selClip.value = j.clips[0].id;
        selClip.onchange();
      };
      selClip.onchange = () => { panel.querySelector('#tp_range').hidden = !!selClip.value; };
      const go = panel.querySelector('#tp_go'), stt = panel.querySelector('#tp_state'), vid = panel.querySelector('#tp_vid');
      go.onclick = async () => {
        if (!selJob.value) return toast('Pick a project first.', { type: 'bad' });
        go.disabled = true; vid.hidden = true; stt.textContent = 'Starting…';
        try {
          const body = { job_id: selJob.value, settings: clone(st) };
          if (selClip.value) body.clip_id = selClip.value; else { body.start = +panel.querySelector('#tp_s').value; body.end = +panel.querySelector('#tp_e').value; }
          const { id } = await send('/api/tests', body);
          for (;;) {
            await new Promise(r => setTimeout(r, 1000));
            if (!panel.isConnected) return;
            const t = await api('/api/tests/' + id);
            if (t.status === 'error') throw new Error(t.error || 'The test failed.');
            if (t.status === 'ready') { vid.src = t.url + '?v=' + Date.now(); vid.hidden = false; stt.textContent = 'Done (' + (t.range[1] - t.range[0]).toFixed(0) + ' s)'; break; }
            stt.textContent = t.status === 'queued' ? 'Waiting…' : 'Rendering… ' + (t.progress || 0) + '%';
          }
        } catch (e) { stt.textContent = ''; toast(e.message, { type: 'bad' }); }
        finally { go.disabled = false; }
      };
    })();
    /* live preview: re-rendered shortly after the last change; only the newest answer is shown */
    let timer = null, seq = 0;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const my = ++seq; q('#pe_spin').hidden = false;
        try {
          const r = await fetch('/api/presets/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: st }) });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'preview failed');
          const url = URL.createObjectURL(await r.blob());
          if (my === seq) { const old = q('#pe_img').src; q('#pe_img').src = url; if (old.startsWith('blob:')) URL.revokeObjectURL(old); }
        } catch (e) { if (my === seq) toast('Preview: ' + e.message, { type: 'bad' }); }
        finally { if (my === seq) q('#pe_spin').hidden = true; }
      }, 350);
    };
    const bindRange = (id, get, set, fmt) => { const r = q('#' + id), l = q('#' + id + '_v'); r.value = get(); l.textContent = fmt(+r.value); r.oninput = () => { set(+r.value); l.textContent = fmt(+r.value); refresh(); }; };
    const bindVal = (id, get, set) => { const e = q('#' + id); e.value = get(); e.oninput = e.onchange = () => { set(e.value); refresh(); }; };
    const bindChk = (key, get, set) => { const e = q(`[data-k="${key}"]`); e.checked = !!get(); e.onchange = () => { set(e.checked); refresh(); }; };
    const lays = q('#pe_lays'), caps = q('#pe_caps');
    const drawLays = () => { lays.innerHTML = ''; layouts.forEach(l => { const b = document.createElement('button'); b.type = 'button'; b.className = 'lay' + (l.id === st.layout_id ? ' on' : ''); b.appendChild(LE.thumb(l)); b.insertAdjacentHTML('beforeend', `<b>${esc(l.name)}</b>`); b.onclick = () => { st.layout_id = l.id; drawLays(); refresh(); }; lays.appendChild(b); }); };
    const syncCap = () => {  /* show the controls' values for the chosen starting style */
      q('#c_font').value = cv('font'); q('#c_size').value = cv('size') * 100; q('#c_size_v').textContent = pc(cv('size') * 100);
      q('#c_primary').value = cv('primary'); q('#c_hi').value = cv('hi'); q('#c_outline').value = cv('outline'); q('#c_outline_v').textContent = cv('outline');
      q('[data-k="c_caps"]').checked = !!cv('caps');
    };
    const drawCaps = () => {
      caps.innerHTML = meta.sub_styles.map(k => `<button type="button" class="chip ${st.sub_style === k ? 'on' : ''}" data-k="${k}"><em>${(CAP[k] || [k, esc(k)])[1]}</em><small>${(CAP[k] || [k])[0]}</small></button>`).join('');
      q('#pe_capbox').style.opacity = st.subtitles ? 1 : .4; q('#pe_capbox').style.pointerEvents = st.subtitles ? '' : 'none';
      caps.querySelectorAll('.chip').forEach(c => c.onclick = () => { st.sub_style = c.dataset.k; ['font', 'size', 'primary', 'hi', 'outline', 'caps'].forEach(k => delete st.caption[k]); drawCaps(); syncCap(); refresh(); });
    };
    const C = st.caption, Hk = st.hook, pc = (v) => v.toFixed(1) + '%';
    q('[data-k="pe_subs"]').checked = st.subtitles; q('[data-k="pe_subs"]').onchange = (e) => { st.subtitles = e.target.checked; drawCaps(); refresh(); };
    const hookDim = () => { q('#pe_hookbox').style.opacity = st.hook_text ? 1 : .4; q('#pe_hookbox').style.pointerEvents = st.hook_text ? '' : 'none'; };
    q('[data-k="pe_hook"]').checked = st.hook_text; q('[data-k="pe_hook"]').onchange = (e) => { st.hook_text = e.target.checked; hookDim(); refresh(); };
    hookDim();
    bindVal('c_font', () => cv('font'), (v) => { C.font = v; });
    bindRange('c_size', () => cv('size') * 100, (v) => { C.size = v / 100; }, pc);
    bindRange('c_bottom', () => cv('bottom') * 100, (v) => { C.bottom = v / 100; }, (v) => v + '%');
    bindRange('c_words', () => cv('words'), (v) => { C.words = v; }, (v) => v);
    bindVal('c_primary', () => cv('primary'), (v) => { C.primary = v; });
    bindVal('c_hi', () => cv('hi'), (v) => { C.hi = v; });
    bindVal('c_outc', () => cv('outline_color'), (v) => { C.outline_color = v; });
    bindRange('c_outline', () => cv('outline'), (v) => { C.outline = v; }, (v) => v);
    bindRange('c_shadow', () => cv('shadow'), (v) => { C.shadow = v; }, (v) => v);
    bindChk('c_bold', () => cv('bold'), (v) => { C.bold = v; });
    bindChk('c_caps', () => cv('caps'), (v) => { C.caps = v; });
    bindChk('c_hl', () => cv('highlight'), (v) => { C.highlight = v; });
    bindChk('c_box', () => cv('box'), (v) => { C.box = v; });
    bindVal('h_font', () => hv('font'), (v) => { Hk.font = v; });
    bindRange('h_size', () => hv('size') * 100, (v) => { Hk.size = v / 100; }, pc);
    bindRange('h_y', () => hv('y') * 100, (v) => { Hk.y = v / 100; }, (v) => v + '%');
    bindRange('h_dur', () => hv('duration'), (v) => { Hk.duration = v; }, (v) => v + ' s');
    bindVal('h_style', () => hv('style'), (v) => { Hk.style = v; });
    bindVal('h_color', () => hv('color'), (v) => { Hk.color = v; });
    bindVal('h_outc', () => hv('outline_color'), (v) => { Hk.outline_color = v; });
    bindVal('h_boxc', () => hv('box_color'), (v) => { Hk.box_color = v; });
    bindChk('h_bold', () => hv('bold'), (v) => { Hk.bold = v; });
    const L = st.look, sgn = (v) => v > 0 ? '+' + v : String(v);
    bindVal('l_filter', () => L.filter, (v) => { L.filter = v; });
    bindRange('l_strength', () => L.strength, (v) => { L.strength = v; }, (v) => v + '%');
    bindRange('l_bright', () => L.brightness, (v) => { L.brightness = v; }, sgn);
    bindRange('l_contrast', () => L.contrast, (v) => { L.contrast = v; }, sgn);
    bindRange('l_sat', () => L.saturation, (v) => { L.saturation = v; }, sgn);
    bindRange('l_sharp', () => L.sharpness, (v) => { L.sharpness = v; }, (v) => v ? v + '%' : 'off');
    const P = st.pacing, M = st.music;
    bindRange('pc_speed', () => P.speed, (v) => { P.speed = v; }, (v) => v + '%');
    bindRange('pc_pause', () => P.pause, (v) => { P.pause = v; }, (v) => v + ' s');
    const pcSync = () => { const r = q('#pc_pause'); r.disabled = !P.cut_pauses; r.closest('label').style.opacity = P.cut_pauses ? '' : '.4'; };
    bindChk('pc_cut', () => P.cut_pauses, (v) => { P.cut_pauses = v; pcSync(); });
    pcSync();
    bindRange('mu_vol', () => M.volume, (v) => { M.volume = v; }, (v) => v + '%');
    bindChk('mu_duck', () => M.duck, (v) => { M.duck = v; });
    const drawTracks = async () => {
      let tr = []; try { tr = await api('/api/music'); } catch { /* none */ }
      const sel = q('#mu_track');
      sel.innerHTML = '<option value="">No music</option>' + tr.map(t => `<option value="${esc(t.name)}">${esc(t.name)} (${t.mb} MB)</option>`).join('') + (M.track && !tr.some(t => t.name === M.track) ? `<option value="${esc(M.track)}">${esc(M.track)} (missing)</option>` : '');
      sel.value = M.track || '';
      q('#mu_play').disabled = q('#mu_del').disabled = !M.track;
    };
    q('#mu_track').onchange = (e) => { M.track = e.target.value || null; q('#mu_play').disabled = q('#mu_del').disabled = !M.track; q('#mu_audio').pause(); q('#mu_play').textContent = 'Play'; };
    q('#mu_file').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const fd = new FormData(); fd.append('file', f);
      try { const r = await fetch('/api/music', { method: 'POST', body: fd }); const j = await r.json(); if (!r.ok) throw new Error(j.detail || 'upload failed'); M.track = j.name; toast('Track added', { type: 'ok' }); await drawTracks(); } catch (err) { toast(err.message, { type: 'bad' }); }
      e.target.value = '';
    };
    q('#mu_play').onclick = () => { const a = q('#mu_audio'); if (!a.paused) { a.pause(); q('#mu_play').textContent = 'Play'; return; } a.src = '/api/music/' + encodeURIComponent(M.track) + '/file'; a.volume = Math.max(0.05, M.volume / 100); a.play(); q('#mu_play').textContent = 'Stop'; a.onended = () => { q('#mu_play').textContent = 'Play'; }; };
    q('#mu_del').onclick = async () => {
      if (!await ask({ title: `Delete "${M.track}"?`, text: 'Removes the file. Any preset that uses it will have no music until you pick another track.', ok: 'Delete', danger: true })) return;
      try { await api('/api/music/' + encodeURIComponent(M.track), { method: 'DELETE' }); M.track = null; await drawTracks(); toast('Track deleted', { type: 'ok' }); } catch (err) { toast(err.message, { type: 'bad' }); }
    };
    drawTracks();
    const K = st.stock;
    const skDim = () => { q('#sk_box').style.opacity = K.on ? 1 : .45; };
    bindChk('sk_on', () => K.on, (v) => { K.on = v; skDim(); });
    skDim();
    bindVal('sk_src', () => K.source, (v) => { K.source = v; });
    bindVal('sk_fb', () => K.fallback, (v) => { K.fallback = v; });
    bindRange('sk_emin', () => K.every_min, (v) => { K.every_min = v; }, (v) => v + ' s');
    bindRange('sk_emax', () => K.every_max, (v) => { K.every_max = v; }, (v) => v + ' s');
    bindRange('sk_lmin', () => K.len_min, (v) => { K.len_min = v; }, (v) => v + ' s');
    bindRange('sk_lmax', () => K.len_max, (v) => { K.len_max = v; }, (v) => v + ' s');
    bindRange('sk_conf', () => K.confidence, (v) => { K.confidence = v; }, (v) => v + '%');
    bindRange('sk_max', () => K.max, (v) => { K.max = v; }, (v) => v);
    bindChk('sk_judge', () => K.judge, (v) => { K.judge = v; });
    ['trim_start', 'trim_end', 'hook_rules', 'hook_weight', 'punch'].forEach(k => bindChk('rt_' + k, () => st.retention[k], (v) => { st.retention[k] = v; }));
    const PACES = { calm: { every_min: 5, every_max: 10, len_min: 1.5, len_max: 3, max: 8, confidence: 60 }, fast: { every_min: 1.5, every_max: 3, len_min: 1, len_max: 2, max: 30, confidence: 55 } };
    const PACE_IDS = { every_min: 'sk_emin', every_max: 'sk_emax', len_min: 'sk_lmin', len_max: 'sk_lmax', max: 'sk_max', confidence: 'sk_conf' };
    const markPace = () => {
      const on = Object.keys(PACES).find(n => Object.entries(PACES[n]).every(([k, v]) => Math.abs(K[k] - v) < 0.01));
      q('#sk_pace').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.pace === on));
      q('#sk_pacehint').textContent = on ? '' : 'Custom';
    };
    q('#sk_pace').querySelectorAll('button').forEach(b => b.onclick = () => {
      Object.entries(PACES[b.dataset.pace]).forEach(([k, v]) => { const r = q('#' + PACE_IDS[k]); r.value = v; r.oninput(); });
      markPace();
    });
    Object.values(PACE_IDS).forEach(id => q('#' + id).addEventListener('input', markPace));
    markPace();
    const KEYSITES = { pexels: ['Pexels', 'https://www.pexels.com/api/'], pixabay: ['Pixabay', 'https://pixabay.com/api/docs/'] };
    const drawKeys = async () => {
      let s = null; try { s = await api('/api/stock/status'); } catch { /* offline */ }
      const box = q('#sk_keys'); if (!s) { box.textContent = 'Could not load footage status.'; return; }
      box.innerHTML = `<h6 style="margin:6px 0">Free footage keys</h6>` + Object.entries(KEYSITES).map(([id, [nm, url]]) => s.keys[id].set
        ? `<div class="row" style="margin:4px 0;gap:10px"><span class="pill ok">${nm} connected ${esc(s.keys[id].hint)}</span><button class="s sm danger" data-rm="${id}" type="button">Remove</button></div>`
        : `<div class="row" style="margin:4px 0;gap:8px"><span class="pill idle" style="min-width:120px">${nm}: no key</span><input data-key="${id}" placeholder="Paste your ${nm} key" autocomplete="off" style="flex:1"><button class="p sm" data-add="${id}" type="button">Save</button><a href="${url}" target="_blank" rel="noopener">Get a free key</a></div>`).join('')
        + `<p class="hint">Keys are free: sign up on the site, copy the key and paste it here. Use at least one. Pexels has paused new keys for now, so Pixabay is the one to get. The key is saved on this computer only. Footage shown or used comes from Pexels / Pixabay.</p>`
        + `<div class="row" style="margin:6px 0;gap:10px"><span class="mut">Library: ${s.library.count} clip${s.library.count === 1 ? '' : 's'} (${s.library.mb} MB), kept so the next clip can reuse them.</span>${s.library.count ? '<button class="s sm danger" data-clear type="button">Clear library</button>' : ''}</div>`;
      box.querySelectorAll('[data-add]').forEach(b => b.onclick = () => busy(b, async () => {
        const id = b.dataset.add, v = box.querySelector(`[data-key="${id}"]`).value.trim(); if (!v) { toast('Paste the key first', { type: 'bad' }); return; }
        try { await send('/api/stock/key', { provider: id, key: v }); toast(KEYSITES[id][0] + ' key saved', { type: 'ok' }); drawKeys(); } catch (e) { toast(e.message, { type: 'bad' }); }
      }));
      box.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
        if (!await ask({ title: `Remove the ${KEYSITES[b.dataset.rm][0]} key?`, text: 'Footage already in your library stays.', ok: 'Remove', danger: true })) return;
        try { await send('/api/stock/key', { provider: b.dataset.rm, key: '' }); drawKeys(); } catch (e) { toast(e.message, { type: 'bad' }); }
      });
      const cb = box.querySelector('[data-clear]'); if (cb) cb.onclick = async () => {
        if (!await ask({ title: 'Clear the footage library?', text: `Deletes ${s.library.count} downloaded clip(s) (${s.library.mb} MB). They can be downloaded again, but clips already made are not affected.`, ok: 'Delete', danger: true })) return;
        try { await api('/api/stock/library', { method: 'DELETE' }); drawKeys(); } catch (e) { toast(e.message, { type: 'bad' }); }
      };
    };
    drawKeys();
    q('#sk_go').onclick = (e) => busy(e.currentTarget, async () => {
      const phrase = q('#sk_q').value.trim(), out = q('#sk_res'); if (!phrase) return;
      out.textContent = 'Searching…';
      try {
        const r = await api('/api/stock/test?q=' + encodeURIComponent(phrase));
        out.innerHTML = r.length ? r.map(c => `<a class="sk-card" href="${esc(c.page || '#')}" target="_blank" rel="noopener">${c.thumb ? `<img alt="" src="${esc(c.thumb)}">` : '<span class="mut">no image</span>'}<b>${c.conf}%</b><small class="mut">${esc(c.source)} · ${Math.round(c.dur)} s${c.conf >= K.confidence ? '' : ' · below your cut-off'}</small></a>`).join('') : '<span class="mut">Nothing found.</span>';
      } catch (err) { out.innerHTML = `<span class="field-err">${esc(err.message)}</span>`; }
    });
    bindChk('pe_smart', () => st.smart_framing, (v) => { st.smart_framing = v; });
    q('#pe_res').onchange = (e) => { st.resolution = e.target.value; };
    bindRange('pe_zoom', () => st.motion.zoom, (v) => { st.motion.zoom = v; }, (v) => v ? v + '%' : 'off');
    bindRange('pe_shake', () => st.motion.shake, (v) => { st.motion.shake = v; }, (v) => v ? v + '%' : 'off');
    drawLays(); drawCaps(); syncCap(); refresh();
    q('[data-c]').onclick = () => end(null);
    q('[data-o]').onclick = (e) => busy(e.currentTarget, async () => {
      const body = { name: q('#pe_name').value.trim(), description: q('#pe_desc').value.trim(), settings: st };
      if (!body.name) { toast('Give the preset a name', { type: 'bad' }); return; }
      try { const r = p ? await send('/api/presets/' + p.id, body, 'PUT') : await send('/api/presets', body); toast(p ? 'Preset saved' : 'Preset created', { type: 'ok' }); end(r); } catch (err) { toast(err.message, { type: 'bad' }); }
    });
  });
}
const PRESET_KEYS = ['layout_id', 'subtitles', 'sub_style', 'hook_text', 'resolution', 'caption', 'hook', 'look', 'music', 'pacing', 'motion'];
function grpPreset(v) {
  const cur = v.preset || '';
  const cards = presetList.map(p => `<label class="prc"><input type="radio" name="presetpick" data-k="preset" value="${esc(p.id)}" ${cur === p.id ? 'checked' : ''}><span class="prn">${esc(p.name)}</span><span class="mut">${esc(p.description || '')}</span><span class="edfacts">${presetFacts(p.settings).map(f => `<span>${esc(f)}</span>`).join('')}</span></label>`).join('');
  const custom = v.allowCustom ? `<label class="prc"><input type="radio" name="presetpick" data-k="preset" value="" ${cur === '' ? 'checked' : ''}><span class="prn">Custom (current look)</span><span class="mut">Keep the look this creator already has. It won't follow any preset.</span><span class="edfacts">${presetFacts({ ...v, layout_id: v.layout_id || 'fill', subtitles: v.subtitles !== false, sub_style: v.sub_style || 'bold_yellow', hook_text: v.hook_text !== false, resolution: v.resolution || '1080p' }).map(f => `<span>${esc(f)}</span>`).join('')}</span></label>` : '';
  return `<div class="pickgrid"><div class="pcards">${custom}${cards}</div>
    <div class="pv" data-pvbox><div class="pv-img"><img alt="" hidden><span class="mut" data-pvmsg>Pick a style to see it</span></div><small class="mut" data-pvname></small></div></div>
    <p class="hint">This creator's new videos are edited exactly like the style you pick, including later changes you make to that style. Change a style in the <a href="#/edits" data-editslink>Edits</a> tab.</p>`;
}
/* shows a picture of the selected edit style; returns a function that (re)loads it, so hidden steps can wait until they are shown */
const pvCache = new Map();
function wirePresetPreview(root, v, onNav) {
  const box = root.querySelector('[data-pvbox]'); if (!box) return () => {};
  const img = box.querySelector('img'), msg = box.querySelector('[data-pvmsg]'), nm = box.querySelector('[data-pvname]');
  const lnk = root.querySelector('[data-editslink]'); if (lnk && onNav) lnk.addEventListener('click', () => onNav());
  let seq = 0;
  const show = async () => {
    const sel = root.querySelector('[data-k="preset"]:checked'); if (!sel) return;
    const p = sel.value ? presetList.find(x => x.id === sel.value) : null;
    const s = p ? p.settings : Object.fromEntries(PRESET_KEYS.filter(k => v[k] !== undefined).map(k => [k, v[k]]));
    nm.textContent = p ? p.name : 'Custom (current look)';
    const key = JSON.stringify(s), my = ++seq;
    if (pvCache.has(key)) { img.src = pvCache.get(key); img.hidden = false; msg.hidden = true; return; }
    msg.hidden = false; msg.textContent = 'Loading preview…'; img.hidden = true;
    try {
      const r = await fetch('/api/presets/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: s }) });
      if (!r.ok) throw new Error();
      const url = URL.createObjectURL(await r.blob()); pvCache.set(key, url);
      if (my === seq) { img.src = url; img.hidden = false; msg.hidden = true; }
    } catch { if (my === seq) { msg.hidden = false; msg.textContent = 'Preview unavailable'; } }
  };
  root.querySelectorAll('[data-k="preset"]').forEach(r => r.addEventListener('change', show));
  return show;
}

/* ===================== home: search, follow (step-by-step), settings ===================== */
const fmtSubs = (n) => n == null ? '' : (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n)) + ' subscribers';
const sw = (id, label, on) => `<label class="chk"><span class="switch"><input type="checkbox" data-k="${id}" ${on ? 'checked' : ''}><span></span></span>${label}</label>`;
const optHtml = (arr, cur) => arr.map(([val, lbl]) => `<option value="${esc(val)}" ${val === cur ? 'selected' : ''}>${esc(lbl)}</option>`).join('');
const MODE_HINT = {
  off: "Nothing is checked automatically. The creator stays in your list so you can still open their videos and clip one yourself.",
  clips: 'When they post a new video it is clipped for you and the clips wait in Projects. Nothing is uploaded.',
  auto: 'When they post a new video it is clipped, and the clips that score high enough are uploaded to your channel by themselves.',
};
/* the three groups of settings; the step-by-step follow screen shows one at a time, the edit screen shows all of them */
const FOLLOW_DEFAULTS = { mode: 'auto', account: null, auto_privacy: 'public', hide_likes: true, min_score: 50, min_len: 20, max_len: 60, num_clips: 0, layout_id: 'fill', subtitles: true, sub_style: 'bold_yellow', resolution: '1080p', hook_text: true, preset: 'standard' };
const modeOf = (v) => v.enabled === false ? 'off' : v.auto ? 'auto' : 'clips';
function grpUpload(v) {
  return `<div class="sgrid one">
    <label>When they post a new video<select data-k="mode">${optHtml([['auto', 'Clip it and upload it automatically'], ['clips', 'Clip it and save it (no upload)'], ['off', "Don't check for new videos"]], v.mode)}</select></label>
    <p class="hint wz-hint" data-hint></p>
    <label>Upload to this YouTube channel<select data-k="account">${acctOpts(v.account || 'default')}</select></label>
    <label>Upload as<select data-k="auto_privacy">${optHtml([['public', 'Public'], ['unlisted', 'Unlisted'], ['private', 'Private']], v.auto_privacy || 'public')}</select></label>
    ${sw('hide_likes', 'Hide the like count', v.hide_likes !== false)}
  </div>`;
}
function grpPick(v) {
  return `<div class="sgrid">
    <label>Minimum score (0 to 100)<input type="number" data-k="min_score" min="0" max="100" step="5" value="${v.min_score ?? 50}"></label>
    <label>How many clips<select data-k="num_clips">${optHtml([[0, 'The AI decides'], [3, 'Up to 3'], [5, 'Up to 5'], [8, 'Up to 8'], [10, 'Up to 10']].concat([0, 3, 5, 8, 10].includes(+(v.num_clips || 0)) ? [] : [[+v.num_clips, 'Up to ' + v.num_clips]]), +(v.num_clips || 0))}</select></label>
    <label>Shortest clip (seconds)<input type="number" data-k="min_len" min="10" max="120" step="5" value="${v.min_len ?? 20}"></label>
    <label>Longest clip (seconds)<input type="number" data-k="max_len" min="15" max="180" step="5" value="${v.max_len ?? 60}"></label>
  </div><p class="hint">Only clips the AI scores at or above the minimum are made. A higher number means fewer, better clips.</p>`;
}
function settingsForm(v) {  /* all in one: used when editing a creator you already follow */
  v = { ...FOLLOW_DEFAULTS, ...v, mode: v.mode || modeOf(v) };
  return `<h5 class="wz-sec">Upload & automation</h5>${grpUpload(v)}<h5 class="wz-sec">Picking clips</h5>${grpPick(v)}<h5 class="wz-sec">Edit style</h5>${grpPreset(v)}`;
}
function wireMode(root) {
  const m = root.querySelector('[data-k="mode"]'), hint = root.querySelector('[data-hint]');
  const sync = () => {
    root.querySelectorAll('[data-k="account"],[data-k="auto_privacy"],[data-k="hide_likes"]').forEach(e => { e.disabled = m.value !== 'auto'; e.closest('label').style.opacity = m.value === 'auto' ? '' : '.45'; });
    if (hint) hint.textContent = MODE_HINT[m.value];
  };
  m.onchange = sync; sync();
}
function readSettings(root) {
  const o = {};
  root.querySelectorAll('[data-k]').forEach(e => { if (e.type === 'radio') { if (e.checked) o[e.dataset.k] = e.value; return; } o[e.dataset.k] = e.type === 'checkbox' ? e.checked : e.type === 'number' ? +e.value : (e.tagName === 'SELECT' && e.dataset.k === 'num_clips') ? +e.value : e.value; });
  o.enabled = o.mode !== 'off'; o.auto = o.mode === 'auto'; delete o.mode;
  o.min_score = Math.max(0, Math.min(100, o.min_score || 0));
  return o;
}
/* step-by-step setup shown when you press Follow */
function followWizard(r) {
  const v = { ...FOLLOW_DEFAULTS, account: S.account || 'default' };
  const steps = [['Upload & automation', grpUpload(v)], ['Picking clips', grpPick(v)], ['Edit style', grpPreset(v)]];
  return dialog(`<div class="wiz"><div class="wz-head">${r.thumb ? `<img class="avatar" alt="" src="${esc(r.thumb)}">` : `<span class="avatar">${esc((r.name || '?')[0].toUpperCase())}</span>`}
      <div><h3 style="margin:0">Follow ${esc(r.name)}</h3><span class="mut">${esc(fmtSubs(r.subs))}</span></div></div>
    <ol class="wz-dots">${steps.map((s, i) => `<li data-i="${i}"><span>${i + 1}</span>${esc(s[0])}</li>`).join('')}</ol>
    ${steps.map((s, i) => `<div class="wz-step" data-s="${i}" hidden>${s[1]}</div>`).join('')}
    <div class="acts"><button class="s" data-c>Cancel</button><button class="s" data-back>Back</button><button class="p" data-next>Next</button></div></div>`,
    (h, close) => {
      h.querySelector('.dlg').classList.add('wide');
      wireMode(h);
      const pvShow = wirePresetPreview(h, v, () => close(null));
      let i = 0;
      const show = () => {
        h.querySelectorAll('.wz-step').forEach((el, k) => { el.hidden = k !== i; });
        h.querySelectorAll('.wz-dots li').forEach((el, k) => { el.className = k === i ? 'on' : k < i ? 'done' : ''; });
        h.querySelector('[data-back]').hidden = i === 0; h.querySelector('[data-c]').hidden = i > 0;
        h.querySelector('[data-next]').textContent = i === steps.length - 1 ? `Follow ${r.name}` : 'Next';
        if (i === steps.length - 1) pvShow();
      };
      h.querySelector('[data-c]').onclick = () => close(null);
      h.querySelector('[data-back]').onclick = () => { i = Math.max(0, i - 1); show(); };
      h.querySelector('[data-next]').onclick = () => {
        const cur = readSettings(h);
        if (cur.min_len >= cur.max_len) { toast('Shortest clip must be shorter than the longest clip.', { type: 'bad' }); i = 1; show(); return; }
        if (i < steps.length - 1) { i++; show(); return; }
        close(cur);
      };
      show();
    });
}
async function drawAiUse() {
  const box = $('#aiuse'); if (!box) return;
  try {
    const u = await api('/api/ai-usage');
    const row = (b) => b.by_what.length ? b.by_what.map(([k, n]) => `<li><span>${esc(k)}</span><b>${n}</b></li>`).join('') : '<li class="mut">Nothing yet</li>';
    const prov = (b) => b.by_provider.map(([k, n]) => `${esc(k)} ${n}`).join(' · ') || '';
    box.innerHTML = `<h2 style="margin:0 0 4px">AI usage</h2><p class="mut" style="margin:0 0 10px">Requests sent to AI services. Transcription, face tracking and rendering run on your PC and are not counted.</p>
      <div class="row" style="gap:28px;align-items:flex-start">
        <div><div class="mut">Today</div><div style="font-size:26px;font-weight:700">${u.today.requests}</div><small class="mut">${u.today.failed} failed${u.today.tokens ? ' · ' + u.today.tokens.toLocaleString() + ' tokens' : ''}</small><ul class="aiu">${row(u.today)}</ul><small class="mut">${prov(u.today)}</small></div>
        <div><div class="mut">Last 7 days</div><div style="font-size:26px;font-weight:700">${u.week.requests}</div><small class="mut">${u.week.failed} failed${u.week.tokens ? ' · ' + u.week.tokens.toLocaleString() + ' tokens' : ''}</small><ul class="aiu">${row(u.week)}</ul><small class="mut">${prov(u.week)}</small></div>
      </div>`;
  } catch { box.innerHTML = ''; }
}
/* ---------- Explainers: 2D explainer videos ---------- */
let xTimer = null, xOpts = null, xEditing = null, xParseT = null, xParseSeq = 0;
const xPrompt = (long) => `Write a ${long ? '2.5-minute' : '40-second'} vertical explainer video script about: [TOPIC].
${long ? 'Use between 400 and 450 spoken words in total (count them, never more than 450), split into 18 to 22 scenes.\nEvery VOICE line is 15 to 28 words: two short sentences, never a fragment.\nStructure: a hook, 4 short sections that each make one clear point with an example, a quick recap, and a payoff.' : 'Use 95 to 105 spoken words in total, split into 6 to 8 scenes of 3 to 6 seconds each (8 to 18 words per scene).'}
Start with a curiosity gap in the first 6 words (no greeting). End with a payoff, never "like and subscribe".
Only use facts you are sure of, and add a SOURCE: line for every number. Never invent numbers for a chart.
Write for the ear: short sentences, plain words, numbers written as words in VOICE, no emojis, no brackets.
${long ? 'Use at least 7 different VISUAL types and never the same one twice in a row.' : 'Use at least 4 different VISUAL types across the scenes.'}
Use exactly this format:

TITLE: (3 to 6 words)
HOOK: (max 8 words shown on screen at the start, not spoken)

SCENE 1
VOICE: the exact words to speak
VISUAL: one of text, counter, list, bars, compare, flow, quote, donut, stats, timeline
TEXT: what shows on screen, items separated by |
      counter: the number, like 20% | of your energy
      quote: the quote | who said it
      timeline: 1969: Moon landing | 1989: Berlin wall   (a short year or date, a colon, the event)
DATA: only for bars, donut, stats or compare: Brain=20; Heart=8; Liver=5   (real numbers, same unit)
ICON: 1 to 3 simple object words (brain, battery, clock)
TONE: neutral, calm, serious, energetic, excited, slow or fast
PAUSE: seconds of silence after the scene (0.2 to 0.8)
SPEAKER: 2   (optional: a second voice, good for quotes)
SOURCE: where a number comes from (optional)

SCENE 2 ... (repeat).`;
const xDur = (n) => n == null ? '' : Math.round(n) + ' s';
async function loadExplainers() {
  if (!xOpts) { try { xOpts = await api('/api/explainers/options'); } catch (e) { return toast(e.message, { type: 'bad' }); } fillXOpts(); }
  xShowPrompt();
  drawXList();
  xParse();
}
const xLong = () => $('#xlen').value === 'long';
function xShowPrompt() { $('#xfmt').textContent = xPrompt(xLong()); }
function fillXOpts() {
  const o = xOpts, d = o.default;
  $('#xlen').innerHTML = '<option value="short">Short (about 40 seconds)</option><option value="long">Long (up to 3 minutes)</option>';
  $('#xlen').onchange = () => { xShowPrompt(); xParse(); };
  $('#xvoice2').innerHTML = '<option value="">Same voice</option>' + o.voices.filter(v => v.id !== 'windows').map(v => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
  $('#xvoice').innerHTML = o.voices.map(v => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
  $('#xtheme').innerHTML = o.themes.map(t => `<option value="${esc(t)}">${esc(t[0].toUpperCase() + t.slice(1))}</option>`).join('');
  $('#xcap').innerHTML = (meta.sub_styles || ['bold_yellow', 'clean_white', 'green_pop']).map(k => `<option value="${esc(k)}">${esc((CAP[k] || [k])[0])}</option>`).join('');
  $('#xmusic').innerHTML = '<option value="">No music</option>' + o.tracks.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  setXStyle(d);
  $('#xrate').oninput = () => { $('#xratev').textContent = ($('#xrate').value > 0 ? '+' : '') + $('#xrate').value + '%'; };
  $('#xscript').oninput = () => { clearTimeout(xParseT); xParseT = setTimeout(xParse, 400); };
  $('#xcopy').onclick = () => navigator.clipboard.writeText(xPrompt(xLong())).then(() => toast('Prompt copied. Replace [TOPIC] and paste the answer into the script box.', { type: 'ok', ms: 4000 }));
  $('#xwrite').onclick = () => busy($('#xwrite'), async () => {
    try { const r = await send('/api/explainers/write', { topic: $('#xtopic').value, length: $('#xlen').value }); $('#xscript').value = r.script; xParse(); toast('Script written. Read it and fix anything wrong before you make the video.', { type: 'ok', ms: 6000 }); }
    catch (e) { toast(e.message, { type: 'bad' }); }
  });
  $('#xgo').onclick = () => busy($('#xgo'), async () => {
    try {
      const body = { script: $('#xscript').value, style: getXStyle() };
      if (xEditing) await send('/api/explainers/' + xEditing, body, 'PUT'); else await send('/api/explainers', body);
      toast(xLong() ? 'Making the video. A long one takes several minutes.' : 'Making the video. This takes a minute or two.', { type: 'ok', ms: 5000 });
      xResetForm(); drawXList();
    } catch (e) { toast(e.message, { type: 'bad' }); }
  });
  $('#xnew').onclick = xResetForm;
}
function getXStyle() {
  return { voice: $('#xvoice').value, voice2: $('#xvoice2').value, length: $('#xlen').value, rate: +$('#xrate').value, theme: $('#xtheme').value, caption_style: $('#xcap').value, music: { track: $('#xmusic').value || null, volume: 12, duck: true } };
}
function setXStyle(s) {
  $('#xvoice').value = s.voice; $('#xvoice2').value = s.voice2 || ''; $('#xlen').value = s.length || 'short'; xShowPrompt(); $('#xrate').value = s.rate || 0; $('#xrate').oninput && $('#xrate').oninput(); $('#xtheme').value = s.theme; $('#xcap').value = s.caption_style;
  $('#xmusic').value = (s.music && s.music.track) || '';
}
function xResetForm() {
  xEditing = null; $('#xscript').value = ''; $('#xtopic').value = ''; $('#xhead').textContent = 'New 2D explainer'; $('#xgo').textContent = 'Make video'; $('#xnew').hidden = true; setXStyle(xOpts.default); xParse();
}
async function xParse() {
  const box = $('#xparse'); if (!box) return;
  const text = $('#xscript').value, my = ++xParseSeq;
  if (!text.trim()) { box.innerHTML = ''; return; }
  let p; try { p = await send('/api/explainers/parse', { script: text, length: $('#xlen').value }); } catch { return; }
  if (my !== xParseSeq) return;
  const over = p.total_est > p.limit;
  box.innerHTML = `<div class="${over ? 'field-err' : 'mut'}"><b>${p.scenes.length}</b> scene${p.scenes.length === 1 ? '' : 's'} · about <b>${Math.round(p.total_est)} s</b>${p.title ? ' · ' + esc(p.title) : ''}</div>` +
    p.warnings.map(w => `<div class="field-err">${esc(w)}</div>`).join('') +
    `<div class="xscenes">${p.scenes.map(s => `<div class="xsc"><span class="pill idle">${esc(s.type)}</span>${s.icons[0] ? `<span>${s.icons[0]}</span>` : ''}<span class="xv">${esc(s.voice)}</span><small class="mut">${s.est}s${s.tone !== 'neutral' ? ' · ' + esc(s.tone) : ''}${s.speaker === '2' ? ' · voice 2' : ''}</small></div>`).join('')}</div>`;
}
async function explainerUpload(x, btn) {
  await loadAccts();
  let r; try { r = await api('/api/explainers/' + x.id); } catch (e) { return toast(e.message, { type: 'bad' }); }
  let hook = ''; try { hook = (await send('/api/explainers/parse', { script: r.script, length: (r.style || {}).length })).hook || ''; } catch { /* optional */ }
  const v = await dialog(`<h3>Upload to YouTube</h3><p class="mut">Goes through the normal upload queue, so it also shows on the Uploads page.</p>
    <label>Title<input id="xu_t" maxlength="100" value="${esc(x.title)}"></label>
    <label>Description<textarea id="xu_d" rows="4" maxlength="4000">${esc(hook)}</textarea></label>
    <div class="row" style="gap:10px;flex-wrap:wrap"><label>Channel<select id="xu_a" class="acct"></select></label>
      <label>Who can see it<select id="xu_p"><option value="private">Only me (private)</option><option value="unlisted">Anyone with the link</option><option value="public">Public</option></select></label></div>
    <label class="row" style="gap:8px;align-items:center"><input type="checkbox" id="xu_h" ${S.hideLikes !== false ? 'checked' : ''}> Hide the like count</label>
    <div class="acts" style="margin-top:14px"><button class="s" data-c>Cancel</button><button class="p" data-ok>Upload</button></div>`,
    (h, close) => {
      fillAcct(h.querySelector('#xu_a'));
      h.querySelector('[data-c]').onclick = () => close(null);
      h.querySelector('[data-ok]').onclick = () => {
        const title = h.querySelector('#xu_t').value.trim(); if (!title) return toast('Give it a title.', { type: 'warn' });
        close({ title, description: h.querySelector('#xu_d').value, account: h.querySelector('#xu_a').value, privacy: h.querySelector('#xu_p').value, hide_likes: h.querySelector('#xu_h').checked });
      };
    });
  if (!v) return;
  await busy(btn, async () => {
    try {
      const b = await send(`/api/explainers/${x.id}/bridge`, {});
      await send(`/api/jobs/${b.job_id}/clips/${b.clip_id}/publish/youtube-web`, v);
      toast('Added to the upload queue.', { type: 'ok', ms: 5000, action: { label: 'View', run: () => { location.hash = '#/uploads'; } } });
      $('#xlist').dataset.sig = ''; drawXList();
    } catch (e) { toast(e.message, { type: 'bad' }); }
  });
}
async function drawXList() {
  const box = $('#xlist'); if (!box) return;
  let items = []; try { items = await api('/api/explainers'); } catch { return; }
  const busyAny = items.some(x => x.status === 'queued' || x.status === 'running' || ['queued', 'uploading'].includes((x.upload || {}).status));
  clearInterval(xTimer); if (busyAny && !$('#page-explainers').hidden) xTimer = setInterval(drawXList, 2500);
  if (!items.length) { box.innerHTML = '<div class="mut" style="padding:10px 2px">Nothing yet. Your finished videos will show up here.</div>'; return; }
  const sig = JSON.stringify(items); if (box.dataset.sig === sig) return; box.dataset.sig = sig;
  box.innerHTML = '';
  items.forEach(x => {
    const d = document.createElement('div'); d.className = 'xcard';
    const ready = x.status === 'ready';
    d.innerHTML = `<div class="xvid">${ready ? `<video src="/explainers/${esc(x.id)}/out.mp4?v=${x.version}" poster="/explainers/${esc(x.id)}/thumb.jpg?v=${x.version}" controls playsinline preload="metadata"></video>`
      : x.status === 'error' ? `<div class="vph err">${esc(x.error || 'Failed')}</div>` : `<div class="vph"><span class="spin"></span><div>${esc(x.stage)}</div><div class="minibar"><i style="width:${x.progress || 0}%"></i></div></div>`}</div>
      <div class="xb"><b>${esc(x.title)}</b><small class="mut">${ready ? xDur(x.duration) + ' · ' + (x.scenes || []).length + ' scenes' : esc(x.stage || '')}</small>
      ${(x.warnings || []).map(w => `<small class="field-err">${esc(w)}</small>`).join('')}
      ${(() => { const u = x.upload || {}, c = { queued: ['idle', u.note || 'Waiting to upload'], uploading: ['run', 'Uploading ' + (u.note || '')], done: ['ok', 'Uploaded'], error: ['bad', 'Upload failed'], cancelled: ['idle', 'Upload stopped'] }[u.status]; return c ? `<span class="pill ${c[0]}" title="${esc(u.error || '')}">${esc(c[1])}</span>${u.status === 'done' && u.url ? `<a href="${esc(u.url)}" target="_blank" rel="noopener" class="mut">Open on YouTube</a>` : ''}` : ''; })()}
      <div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap">${ready ? `<a class="btn s sm" download href="/explainers/${esc(x.id)}/out.mp4">${icon('download', 'sm')}Download</a><button class="p sm" data-up ${['queued', 'uploading'].includes((x.upload || {}).status) ? 'disabled' : ''}>${icon('upload', 'sm')}${(x.upload || {}).status === 'done' ? 'Upload again' : 'Upload'}</button>` : ''}
        <button class="s sm" data-edit ${x.status === 'running' || x.status === 'queued' ? 'disabled' : ''}>Edit script</button><button class="s sm danger" data-del ${x.status === 'running' || x.status === 'queued' ? 'disabled' : ''}>Delete</button></div></div>`;
    const upBtn = d.querySelector('[data-up]');
    if (upBtn) upBtn.onclick = () => explainerUpload(x, upBtn);
    d.querySelector('[data-edit]').onclick = async () => {
      let r; try { r = await api('/api/explainers/' + x.id); } catch (e) { return toast(e.message, { type: 'bad' }); }
      xEditing = x.id; $('#xscript').value = r.script; setXStyle(r.style); $('#xhead').textContent = 'Edit: ' + (r.title || 'explainer'); $('#xgo').textContent = 'Update video (only changed scenes are redrawn)'; $('#xnew').hidden = false;
      xParse(); $('#xform').scrollIntoView({ behavior: 'smooth' });
    };
    d.querySelector('[data-del]').onclick = async () => {
      if (!await ask({ title: 'Delete this explainer?', text: 'The video file is deleted. This cannot be undone.', ok: 'Delete', danger: true })) return;
      try { await api('/api/explainers/' + x.id, { method: 'DELETE' }); if (xEditing === x.id) xResetForm(); box.dataset.sig = ''; drawXList(); } catch (e) { toast(e.message, { type: 'bad' }); }
    };
    box.appendChild(d);
  });
}

/* ---------- Home: paste a link + recommended videos ---------- */
const fmtV = (n) => n == null ? '' : (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n)) + ' views';
const fmtLen = (s) => s >= 3600 ? Math.floor(s / 3600) + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') : mmss(s);
async function quickClip(url, title, btn, presetOverride, accountOverride) {
  const preset = presetOverride || $('#qpreset').value || null, account = accountOverride || $('#qacct').value || 'default';
  store.set('qpreset', preset);
  return busy(btn, async () => {
    try {
      const res = await send('/api/quickclip', { url, account, preset, title: title || null });
      toast('Started. The clips will be ready to choose in Projects.', { type: 'ok', ms: 6000, action: { label: 'View', run: () => { location.hash = '#/projects/' + res.job; } } });
      return true;
    } catch (e) { toast(e.message, { type: 'bad' }); }
  });
}
function drawQuick() {
  const pre = $('#qpreset'), want = store.get('qpreset', null);
  pre.innerHTML = presetList.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  if (want && presetList.some(p => p.id === want)) pre.value = want;
  fillAcct($('#qacct'));
  $('#qgo').onclick = () => { const u = $('#qurl').value.trim(); if (!u) return toast('Paste a YouTube link first.', { type: 'warn' }); quickClip(u, null, $('#qgo')).then((ok) => { if (ok) $('#qurl').value = ''; }); };
  $('#qurl').onkeydown = (e) => { if (e.key === 'Enter') $('#qgo').click(); };
}
let recAcct = null, recFilter = 'all', recSeq = 0;
async function drawRecs(refresh) {
  const box = $('#recs'); if (!box) return;
  if (!recAcct || !accts.some(a => a.id === recAcct)) recAcct = (accts.find(a => a.id === S.account) || accts[0] || {}).id || 'default';
  const my = ++recSeq, acct = accts.find(a => a.id === recAcct) || {};
  box.innerHTML = `<h2>${icon('sparkles')}Recommended videos</h2><div class="seg" id="rtabs" role="tablist">${accts.map(a => `<button type="button" role="tab" class="${a.id === recAcct ? 'on' : ''}" data-a="${esc(a.id)}">${esc(a.name)}</button>`).join('')}</div>
    <div class="mut" style="padding:14px 2px"><span class="spin"></span> Finding videos for ${esc(acct.name || 'this channel')}…</div>`;
  box.querySelectorAll('#rtabs button').forEach(b => b.onclick = () => { recAcct = b.dataset.a; drawRecs(); });
  let r; try { r = await api('/api/recs?account=' + encodeURIComponent(recAcct) + (refresh ? '&refresh=true' : '')); } catch (e) { if (my === recSeq) box.querySelector('.mut').innerHTML = `<span class="field-err">${esc(e.message)}</span>`; return; }
  if (my !== recSeq) return;
  const items = r.items.filter(v => recFilter === 'all' || (recFilter === 'follow' ? v.following : !v.following));
  box.innerHTML = `<div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">${icon('sparkles')}Recommended videos</h2><button class="s sm" id="rref" type="button">${icon('refresh', 'sm')}Refresh</button></div>
    <div class="seg" id="rtabs" role="tablist" style="margin-top:10px">${accts.map(a => `<button type="button" role="tab" class="${a.id === recAcct ? 'on' : ''}" data-a="${esc(a.id)}">${esc(a.name)}</button>`).join('')}</div>
    <div class="row" style="gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap"><label class="grow" style="min-width:240px">Topics for this channel (separate with commas)<input id="rtopics" value="${esc(r.topics.join(', '))}" maxlength="200"></label><button class="s sm" id="rtsave" type="button" style="align-self:end">Save topics</button></div>
    <div class="seg" id="rfil" style="margin-top:10px">${[['all', 'All'], ['follow', 'From creators I follow'], ['new', 'New channels']].map(([k, l]) => `<button type="button" class="${k === recFilter ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
    <p class="mut" style="margin:8px 0 0">Long videos (8 min to 3 h) uploaded this month, most viewed first. Videos you already clipped are hidden.</p>
    <div class="rgrid" id="rgrid">${items.length ? '' : '<div class="mut" style="padding:14px 2px">Nothing to show. Try different topics.</div>'}</div>`;
  box.querySelectorAll('#rtabs button').forEach(b => b.onclick = () => { recAcct = b.dataset.a; drawRecs(); });
  box.querySelectorAll('#rfil button').forEach(b => b.onclick = () => { recFilter = b.dataset.f; drawRecs(); });
  $('#rref').onclick = () => drawRecs(true);
  $('#rtsave').onclick = () => busy($('#rtsave'), async () => { try { await send(`/api/accounts/${recAcct}/topics`, { topics: $('#rtopics').value }, 'PUT'); await loadAccts(); toast('Topics saved', { type: 'ok', ms: 1500 }); drawRecs(true); } catch (e) { toast(e.message, { type: 'bad' }); } });
  const grid = $('#rgrid');
  items.forEach(v => {
    const d = document.createElement('div'); d.className = 'rcard';
    d.innerHTML = `<a class="rth" href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener" title="Watch on YouTube"><img loading="lazy" alt="" src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg"><span class="rdur">${fmtLen(v.duration)}</span></a>
      <div class="rb"><b title="${esc(v.title)}">${esc(v.title)}</b><small class="mut">${esc(v.channel)}${v.views != null ? ' · ' + fmtV(v.views) : ''}</small>
      <div class="row" style="gap:6px;align-items:center;margin-top:6px"><span class="pill ${v.following ? 'ok' : 'idle'}">${v.following ? 'Following' : 'New channel'}</span></div>
      <div class="row" style="gap:6px;align-items:center;margin-top:6px"><select class="rpre grow" aria-label="Edit type" title="Edit type for this clip" style="min-width:0">${presetList.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select><button class="p sm" type="button">Clip it</button></div></div>`;
    const sel = d.querySelector('.rpre'), want = store.get('qpreset', null);
    if (want && presetList.some(p => p.id === want)) sel.value = want;
    d.querySelector('button').onclick = (e) => { const b = e.currentTarget; quickClip('https://www.youtube.com/watch?v=' + v.id, v.title, b, sel.value, recAcct).then((ok) => { if (ok) d.remove(); }); };
    grid.appendChild(d);
  });
}

async function loadHome() {
  drawAiUse();
  await Promise.all([loadAccts(), loadPresets()]);
  drawQuick(); drawRecs();
  const list = $('#hlist');
  let cs = []; try { cs = await api('/api/creators'); } catch { toast("Couldn't load creators.", { type: 'bad' }); }
  let paused = []; try { paused = ((await api('/api/auto/status')).stops || []).map(x => x.account); } catch { }
  $('#hcount').textContent = cs.length ? cs.length + ' followed' : '';
  list.innerHTML = cs.length ? '' : `<div class="empty-state" style="grid-column:1/-1"><div class="big">${icon('users')}</div><h3>You're not following anyone yet</h3><p>Search for a channel above and press Follow.</p></div>`;
  cs.forEach(c => {
    const acct = (accts.find(a => a.id === (c.options.account || 'default')) || {}).name || 'Main channel';
    const d = document.createElement('div'); d.className = 'hcard'; d.tabIndex = 0;
    d.innerHTML = `<span class="avatar lg">${esc((c.name || '?')[0].toUpperCase())}</span><b>${esc(c.name)}</b>
      <span class="pill ${!c.enabled ? 'idle' : c.options.auto ? (paused.includes(c.options.account || 'default') ? 'bad' : 'ok') : 'run'}" ${c.enabled && c.options.auto && paused.includes(c.options.account || 'default') ? 'title="Uploads for this channel are paused. Press Resume in the banner at the top."' : ''}>${!c.enabled ? 'Not checking' : c.options.auto ? (paused.includes(c.options.account || 'default') ? 'Uploads paused' : 'Full auto') : 'Clips only'}</span>
      <small class="mut">${c.options.auto ? '→ ' + esc(acct) : 'No upload'}</small><small class="mut">${esc(presetName(c.preset) || 'Custom look')}</small>`;
    d.onclick = () => openCreator(c).then(loadHome);
    d.onkeydown = (e) => { if (e.key === 'Enter') d.click(); };
    list.appendChild(d);
  });
}
let hqT, hqSeq = 0;
$('#hq').addEventListener('input', () => {
  clearTimeout(hqT); const q = $('#hq').value.trim(), box = $('#hres');
  if (q.length < 2) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="mut" style="padding:10px 2px">Searching…</div>';
  hqT = setTimeout(async () => {
    const my = ++hqSeq;
    try {
      const rs = await api('/api/creators/search?q=' + encodeURIComponent(q)); if (my !== hqSeq) return;
      box.innerHTML = rs.length ? '' : '<div class="mut" style="padding:10px 2px">No channels found.</div>';
      rs.forEach(r => {
        const d = document.createElement('div'); d.className = 'hr';
        d.innerHTML = `${r.thumb ? `<img class="avatar" alt="" src="${esc(r.thumb)}">` : `<span class="avatar">${esc((r.name || '?')[0].toUpperCase())}</span>`}<div class="meta"><b>${esc(r.name)}</b><span class="mut">${esc(fmtSubs(r.subs)) || '&nbsp;'}</span></div>
          ${r.following ? '<span class="pill ok">Following</span>' : '<button class="p sm">Follow</button>'}`;
        const b = d.querySelector('button');
        if (b) b.onclick = async () => {
          await Promise.all([loadAccts(), loadPresets()]);
          const st = await followWizard(r); if (!st) return;
          busy(b, async () => {
            try { await send('/api/creators/follow', { channel_id: r.channel_id, name: r.name, ...st }); toast(`Following ${r.name}.`, { type: 'ok' }); b.outerHTML = '<span class="pill ok">Following</span>'; loadHome(); }
            catch (err) { toast(err.message, { type: 'bad' }); }
          });
        };
        box.appendChild(d);
      });
    } catch (err) { if (my === hqSeq) box.innerHTML = `<div class="field-err">${esc(err.message)}</div>`; }
  }, 450);
});
$('#hq').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; $('#hres').innerHTML = ''; } });
$('#checknow').onclick = (e) => busy(e.currentTarget, async () => {
  try { const r = await api('/api/creators/check', { method: 'POST' }); r.queued.length ? toast(`Queued ${r.queued.length} new video${r.queued.length > 1 ? 's' : ''}`, { type: 'ok', action: { label: 'View', run: () => { location.hash = '#/projects'; } } }) : toast('No new videos yet.'); }
  catch (err) { toast(err.message, { type: 'bad' }); }
});

/* ===================== clip editor ===================== */
let ed = null, draft = null, edCtx = null, pubTimer = null, applyPoll = null, snap0 = '';
const payload = () => ({ start: draft.start, end: draft.end, layout_id: draft.layout_id, layout: ed ? ed.getLayout() : draft.layout, resolution: draft.resolution, subtitles: draft.subtitles, sub_style: draft.sub_style, overlays: draft.overlays, captions: draft.captions || [] });
const isDirty = () => JSON.stringify(payload()) !== snap0;
function refreshDirty() {
  const ab = $('#apply'); if (!ab || !edCtx) return;
  const d = isDirty(); ab.disabled = ab.classList.contains('busy') ? true : !d;
  $('#astate').innerHTML = d ? '<span class="dirty">Unsaved changes</span>' : ($('#astate').dataset.msg || '');
}
async function closeModal(silent = false) {
  const m = $('#modal'); if (m.hidden) return true;
  if (!silent && edCtx && isDirty() && !await ask({ title: 'Discard your changes?', text: 'You have edits that haven\'t been applied to this clip.', ok: 'Discard', danger: true })) return false;
  clearInterval(pubTimer); clearInterval(applyPoll); ed = null; edCtx = null; m.hidden = true; $('#mbox').innerHTML = '';
  if (currentWatch && !silent) watch(currentWatch.id, currentWatch.sel);
  return true;
}
const videoHTML = (jid, c) => c.status === 'ready' || c.version > 0
  ? `<video src="/media/${jid}/clips/${c.id}.mp4?v=${c.version}" controls playsinline loop preload="metadata"></video>`
  : `<div class="vph">${c.status === 'error' ? 'Render failed' : 'Rendering…'}</div>`;

function styleHTML(job, c) {
  const o = job.options || {}, pr = presetList.find(p => p.id === o.preset);
  const rt = c.params.retention, on = rt ? Object.values(rt).filter(Boolean).length : 0, n = rt ? Object.keys(rt).length : 0;
  const res = c.results || {};
  return `<div class="stylebox"><div class="mut">Style: <b>${esc(pr ? pr.name : 'custom')}</b> · Retention tools: ${rt ? `${on} of ${n} on` : 'not used (older clip)'}</div>
    <div class="row" style="gap:6px;align-items:center;margin-top:6px"><span class="mut">YouTube results:</span>
      <input id="resPct" type="number" min="0" max="100" step="0.1" placeholder="% stayed" value="${res.watched_pct ?? ''}" style="width:90px" aria-label="Percent who stayed to watch">
      <input id="resViews" type="number" min="0" step="1" placeholder="views" value="${res.views ?? ''}" style="width:90px" aria-label="Views">
      <button class="s sm" id="resSave" type="button">Save</button></div></div>`;
}

function ratingHTML(c) {
  const r = c.rating;
  if (!r) return `<div class="vscore"><div class="ring ${scoreCls(c.score)}"><b>${c.score}</b></div><div class="vtxt"><b>Virality score</b><span class="mut">AI estimate from clip selection</span></div></div>`;
  const bars = [['Hook', r.hook], ['Retention', r.retention], ['Value', r.value], ['Shareability', r.shareability]]
    .map(([n, v]) => `<div class="vb"><span>${n}</span><div class="track ${scoreCls(v)}"><i style="width:${v}%"></i></div><b>${v}</b></div>`).join('');
  const tags = (r.hashtags || []).map(t => '#' + t).join(' ');
  return `<div class="vscore"><div class="ring ${scoreCls(r.overall)}"><b>${r.overall}</b><small>/100</small></div><div class="vbars">${bars}</div></div>
    <div class="tip">${icon('sparkles', 'sm')}<span>${esc(r.tip)}</span></div>
    <div class="capbox"><span>${esc(r.caption)} <em>${esc(tags)}</em></span><button class="s sm" type="button" data-copycap="${esc(r.caption + ' ' + tags)}">${icon('copy', 'sm')}Copy</button></div>`;
}

async function openClip(jid, cid) {
  let job; try { job = await api('/api/jobs/' + jid); } catch { return toast('Couldn\'t open that clip.', { type: 'bad' }); }
  if (job.source === 'explainer') return toast('Explainer videos are edited in the Explainers tab.', { type: 'warn', ms: 4000 });
  curJob = job; const c = job.clips.find(x => x.id === cid); if (!c) return;
  const base = clone(c.params);
  draft = { ...base, captions: base.captions || null, layout: base.layout || clone(layouts.find(l => l.id === base.layout_id) || layouts[0]), overlays: base.overlays || [] };
  edCtx = { jid, cid, c };
  $('#modal').hidden = false;
  $('#mbox').innerHTML = `
    <div class="mhead"><h2><span class="badge" title="AI virality score">${c.score}</span>${esc(c.title)}</h2><button class="ghost icon" id="mclose" aria-label="Close editor">${icon('x')}</button></div>
    <div class="mbody">
      <div class="mvid" id="mvid">${videoHTML(jid, c)}</div>
      <div class="mside">
        ${ratingHTML(c)}
        ${styleHTML(job, c)}
        <p class="hint" style="margin-top:0">${esc(c.reason)}</p>
        <div class="tabs" role="tablist">
          <button data-t="layout" class="on" role="tab">${icon('layout', 'sm')}Layout</button><button data-t="text" role="tab">${icon('type', 'sm')}Captions &amp; text</button>
          <button data-t="trim" role="tab">${icon('scissors', 'sm')}Trim &amp; quality</button><button data-t="pub" role="tab">${icon('send', 'sm')}Publish</button>
        </div>
        <div data-p="layout"></div><div data-p="text" hidden></div><div data-p="trim" hidden></div><div data-p="pub" hidden></div>
        <div class="applybar"><button class="p" id="apply" type="button">${icon('refresh', 'sm')}Apply &amp; re-render</button><a class="btn s" id="dl" download href="/media/${jid}/clips/${cid}.mp4">${icon('download', 'sm')}Download</a><span id="astate" class="mut"></span></div>
      </div>
    </div>`;
  hydrateIcons($('#mbox'));
  $$('[data-copycap]').forEach(b => b.onclick = () => navigator.clipboard.writeText(b.dataset.copycap).then(() => toast('Caption copied', { type: 'ok', ms: 1800 })));
  $('#mclose').onclick = () => closeModal();
  const rsave = $('#resSave');
  if (rsave) rsave.onclick = async () => {
    try { await send(`/api/jobs/${jid}/clips/${cid}/results`, { watched_pct: $('#resPct').value.trim() === '' ? null : $('#resPct').value, views: $('#resViews').value.trim() === '' ? null : $('#resViews').value }, 'PUT'); toast('Results saved', { type: 'ok', ms: 1800 }); }
    catch (e) { toast(e.message, { type: 'bad' }); }
  };
  const tabs = $$('.tabs button');
  const showTab = (t) => { tabs.forEach(x => { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', x === t); }); $$('[data-p]').forEach(p => { p.hidden = p.dataset.p !== t.dataset.t; }); if (t.dataset.t === 'pub') drawPub(); if (t.dataset.t === 'text' && edCtx && edCtx.reloadCaps) edCtx.reloadCaps(); };
  tabs.forEach(b => { b.onclick = () => showTab(b); b.onkeydown = (e) => { const i = tabs.indexOf(b); if (e.key === 'ArrowRight') { tabs[(i + 1) % 4].focus(); showTab(tabs[(i + 1) % 4]); } if (e.key === 'ArrowLeft') { tabs[(i + 3) % 4].focus(); showTab(tabs[(i + 3) % 4]); } }; });
  buildLayoutTab(); buildTextTab(); buildTrimTab();
  snap0 = JSON.stringify(payload()); $('#apply').onclick = applyChanges; refreshDirty();
  ['input', 'change', 'click'].forEach(ev => $('#mbox').addEventListener(ev, () => setTimeout(refreshDirty, 0)));
}

function buildLayoutTab() {
  const { jid } = edCtx, mid = (draft.start + draft.end) / 2;
  const p = $('[data-p=layout]');
  p.innerHTML = `<div class="presets" id="presets"></div><div id="leRoot"></div><div class="row" style="margin-top:14px"><button class="s" id="saveTpl" type="button">Save as template…</button></div>`;
  const pres = $('#presets');
  layouts.forEach(l => {
    const card = layoutCard(l); card.querySelector('small').remove();
    card.onclick = () => { draft.layout_id = l.id; ed.setLayout(l); $$('.lay', pres).forEach(x => x.classList.toggle('on', x.dataset.id === l.id)); refreshDirty(); };
    card.onkeydown = (e) => { if (e.key === 'Enter') card.click(); };
    card.classList.toggle('on', l.id === draft.layout_id); pres.appendChild(card);
  });
  const frame = (t) => `/api/jobs/${jid}/frame?t=${t.toFixed(1)}`;
  ed = new LE.LayoutEditor($('#leRoot'), { layout: draft.layout, frameUrl: frame(mid), range: { start: draft.start, end: draft.end }, frameFor: frame, onChange: (l) => { draft.layout = l; refreshDirty(); } });
  const refreshThumbs = (img, fx, fy) => layouts.forEach(l => { const cv = pres.querySelector(`.lay[data-id="${l.id}"] canvas`); if (cv) LE.renderLayout(cv, l, img, img.naturalWidth, img.naturalHeight, fx, fy); });
  let realFace = [0.5, 0.4]; const fimg = new Image();
  fimg.onload = () => refreshThumbs(fimg, ...realFace); fimg.src = frame(mid);
  api(`/api/jobs/${jid}/facex?start=${draft.start}&end=${draft.end}`).then(r => { realFace = [r.x, r.y]; if (ed) ed.setFace(r.x, r.y); if (fimg.complete && fimg.naturalWidth) refreshThumbs(fimg, r.x, r.y); }).catch(() => { });
  $('#saveTpl').onclick = async () => {
    const name = await askText({ title: 'Save as template', label: 'Template name', placeholder: 'e.g. Podcast split' }); if (!name) return;
    try { const s = await send('/api/layouts', { ...ed.getLayout(), name }); await loadLayouts(); toast(`Saved "${s.name}". It's now in your layout list.`, { type: 'ok' }); } catch (e) { toast(e.message, { type: 'bad' }); }
  };
}
function buildTextTab() {
  const p = $('[data-p=text]');
  const hasHook = !!(edCtx.c.rating && edCtx.c.rating.hook_text);
  const styleChips = () => meta.sub_styles.map(k => `<button type="button" class="chip ${draft.sub_style === k ? 'on' : ''}" data-k="${k}"><em>${(CAP[k] || [k, esc(k)])[1]}</em></button>`).join('');
  p.innerHTML = `<div class="row" style="align-items:center"><label class="chk"><span class="switch"><input type="checkbox" id="e_sub" ${draft.subtitles ? 'checked' : ''}><span></span></span>Captions</label></div>
    <div class="capstyles chips capsty" id="e_styles" style="${draft.subtitles ? '' : 'opacity:.4;pointer-events:none'}">${styleChips()}</div>
    <div id="capWrap" style="${draft.subtitles ? '' : 'opacity:.4;pointer-events:none'}">
      <div class="row" style="align-items:center;justify-content:space-between;margin:14px 0 6px"><b>Caption text <span class="pill idle" id="capBadge">AI-generated</span></b><button class="ghost sm" id="capReset" type="button" hidden>Reset to AI</button></div>
      <div class="caplines" id="capLines"><p class="hint">Loading captions…</p></div>
      <p class="hint">Edit any line to fix a word or write your own. Timing is spread evenly across each line.</p>
    </div>
    <h2 style="margin-top:20px">Text on video</h2><p class="hint" style="margin-top:-6px">Hooks and titles. Add as many as you like.</p>
    <div id="ovs"></div><div class="row"><button class="s" id="addov" type="button">${icon('plus', 'sm')}Add text</button>${hasHook ? `<button class="s" id="aihook" type="button">${icon('sparkles', 'sm')}Use AI hook</button>` : ''}</div>`;
  const bindChips = () => $$('#e_styles .chip').forEach(c => c.onclick = () => { draft.sub_style = c.dataset.k; $('#e_styles').innerHTML = styleChips(); bindChips(); refreshDirty(); });
  bindChips();
  $('#e_sub').onchange = (e) => {
    draft.subtitles = e.target.checked;
    $('#e_styles').style.cssText = $('#capWrap').style.cssText = e.target.checked ? '' : 'opacity:.4;pointer-events:none';
  };
  let base = null;
  const renderLines = () => {
    const lines = draft.captions || base || [], box = $('#capLines'); if (!box) return;
    $('#capBadge').textContent = draft.captions ? 'Edited' : 'AI-generated'; $('#capBadge').className = 'pill ' + (draft.captions ? 'run' : 'idle');
    $('#capReset').hidden = !draft.captions;
    box.innerHTML = lines.length ? '' : '<p class="hint">No speech found in this range.</p>';
    lines.forEach((l, i) => {
      const r = document.createElement('div'); r.className = 'capline';
      r.innerHTML = `<span class="t">${mmss(Math.max(0, l.start - draft.start))}</span><input type="text" value="${esc(l.text)}" aria-label="Caption line ${i + 1}">`;
      r.querySelector('input').oninput = (e) => {
        if (!draft.captions) draft.captions = clone(base);
        draft.captions[i].text = e.target.value; $('#capBadge').textContent = 'Edited'; $('#capBadge').className = 'pill run'; $('#capReset').hidden = false; refreshDirty();
      };
      box.appendChild(r);
    });
  };
  edCtx.reloadCaps = () => {
    if (draft.captions) return;
    api(`/api/jobs/${edCtx.jid}/captions?start=${draft.start}&end=${draft.end}`).then(l => { base = l; renderLines(); }).catch(() => { base = []; renderLines(); });
  };
  edCtx.reloadCaps();
  $('#capReset').onclick = () => { draft.captions = null; edCtx.reloadCaps(); renderLines(); refreshDirty(); };
  $('#addov').onclick = () => { draft.overlays.push({ text: 'Your text', start: 0, end: 3, x: 0.5, y: 0.15, size: 0.05, color: '#ffffff' }); drawOv(); refreshDirty(); };
  const ah = $('#aihook');
  if (ah) ah.onclick = () => {
    draft.overlays = draft.overlays.filter(o => !o.hook);
    draft.overlays.unshift({ text: edCtx.c.rating.hook_text, start: 0, end: 3.5, x: 0.5, y: 0.14, size: 0.05, color: '#FFFFFF', hook: true });
    drawOv(); refreshDirty();
  };
  drawOv();
}
function drawOv() {
  const box = $('#ovs'); box.innerHTML = draft.overlays.length ? '' : '<p class="hint">No text yet. Add a hook, a title or a call to action.</p>';
  draft.overlays.forEach((o, i) => {
    const d = document.createElement('div'); d.className = 'ovrow';
    d.innerHTML = `${o.hook ? '<span class="pill run full" style="justify-self:start">AI hook</span>' : ''}<input type="text" class="full" value="${esc(o.text)}" data-k="text" aria-label="Overlay text">
      <div class="sl full">
        <label>Left ↔ right<input type="range" min="0.05" max="0.95" step="0.01" value="${o.x}" data-k="x"></label>
        <label>Top ↕ bottom<input type="range" min="0.03" max="0.97" step="0.01" value="${o.y}" data-k="y"></label>
        <label>Size<input type="range" min="0.02" max="0.12" step="0.005" value="${o.size}" data-k="size"></label>
        <label>Color<input type="color" value="${o.color}" data-k="color"></label>
        <label>Shows from (s)<input type="number" step="0.5" min="0" value="${o.start}" data-k="start"></label>
        <label>until (s)<input type="number" step="0.5" min="0" value="${o.end}" data-k="end"></label>
      </div><button class="s danger sm" type="button">${icon('trash', 'sm')}Remove</button>`;
    d.querySelectorAll('[data-k]').forEach(inp => inp.oninput = () => { const k = inp.dataset.k; o[k] = ['text', 'color'].includes(k) ? inp.value : +inp.value; });
    d.querySelector('button').onclick = () => { draft.overlays.splice(i, 1); drawOv(); refreshDirty(); };
    box.appendChild(d);
  });
}
function buildTrimTab() {
  const p = $('[data-p=trim]');
  const len = () => `Clip length: ${(draft.end - draft.start).toFixed(1)}s`;
  p.innerHTML = `<div class="row"><label>Start (s)<input type="number" step="0.1" id="e_s" value="${draft.start}" style="width:110px"></label>
    <label>End (s)<input type="number" step="0.1" id="e_e" value="${draft.end}" style="width:110px"></label>
    <div class="field"><span>Quality</span><div class="seg" id="e_r" style="margin:0">${meta.resolutions.map(r => `<button type="button" data-v="${r}" class="${draft.resolution === r ? 'on' : ''}">${r}</button>`).join('')}</div></div></div>
    <p class="hint" id="e_len">${len()}</p><p class="hint">Changing start or end re-renders with the new cut. Captions follow automatically.</p>`;
  $('#e_s').onchange = (e) => { draft.start = +e.target.value; $('#e_len').textContent = len(); };
  $('#e_e').onchange = (e) => { draft.end = +e.target.value; $('#e_len').textContent = len(); };
  $$('#e_r button').forEach(b => b.onclick = () => { draft.resolution = b.dataset.v; $$('#e_r button').forEach(x => x.classList.toggle('on', x === b)); refreshDirty(); });
}

async function applyChanges() {
  const { jid, cid } = edCtx;
  if (draft.end - draft.start < 3) return toast('A clip must be at least 3 seconds long.', { type: 'warn' });
  const ab = $('#apply'); ab.classList.add('busy'); ab.disabled = true; $('#astate').dataset.msg = ''; $('#astate').textContent = 'Rendering…';
  $('#mvid').innerHTML = '<div class="vph"><div class="skel" style="position:absolute;inset:0;border-radius:14px"></div><span style="position:relative">Rendering…</span></div>';
  $('#mvid .vph').style.position = 'relative';
  try { await send(`/api/jobs/${jid}/clips/${cid}`, payload(), 'PATCH'); }
  catch (e) { ab.classList.remove('busy'); refreshDirty(); return toast(e.message, { type: 'bad' }); }
  clearInterval(applyPoll);
  applyPoll = setInterval(async () => {
    let j; try { j = await api('/api/jobs/' + jid); } catch { return; }
    const c = j.clips.find(x => x.id === cid); if (!edCtx || !c) return clearInterval(applyPoll);
    if (c.status === 'rendering') { $('#astate').textContent = `Rendering… ${c.progress || 0}%`; return; }
    clearInterval(applyPoll); curJob = j; edCtx.c = c; snap0 = JSON.stringify(payload());
    ab.classList.remove('busy'); $('#astate').dataset.msg = c.status === 'ready' ? '✓ Updated' : '';
    $('#mvid').innerHTML = c.status === 'error' ? `<div class="vph err">${esc(c.error)}</div>` : videoHTML(jid, c);
    const dl = $('#dl'); if (dl) dl.href = `/media/${jid}/clips/${cid}.mp4?v=${c.version}`;
    refreshDirty(); toast(c.status === 'ready' ? 'Clip updated' : 'Render failed: ' + c.error, { type: c.status === 'ready' ? 'ok' : 'bad' });
  }, 1500);
}

/* ---------- publishing ---------- */
let pubMode = null;
async function drawPub() {
  clearInterval(pubTimer);
  const box = $('[data-p=pub]'); if (!box || !edCtx) return;
  const { jid, cid } = edCtx;
  if (!accts.length) await loadAccts();
  const [st, j, web] = await Promise.all([api('/api/publish/youtube/status'), api('/api/jobs/' + jid), api('/api/publish/web/status').catch(() => ({ ready: false }))]);
  const c = j.clips.find(x => x.id === cid), y = (c.publish || {}).youtube || {};
  if (!pubMode) pubMode = st.connected ? 'api' : 'web';
  if (pubMode === 'web' && !web.ready && st.connected) pubMode = 'api';
  const keep = ['p_t', 'p_d', 'p_p', 'p_acct'].map(id => $('#' + id) ? $('#' + id).value : null);
  const form = (btn) => `<label>Title<input type="text" id="p_t" maxlength="100" value="${esc(keep[0] ?? c.title)}"></label>
      <label style="margin-top:10px">Description<span class="row" style="gap:8px;align-items:center"><input type="text" id="p_d" value="${esc(keep[1] ?? (c.rating ? (c.rating.description || c.rating.caption) + ' ' + (c.rating.hashtags || []).map(t => '#' + t).join(' ') : ''))}"><button class="s sm" id="p_gen" type="button">${icon('refresh', 'sm')}New description</button></span></label>
      ${pubMode === 'web' ? `<label style="margin-top:10px">Channel<span class="row" style="gap:8px;align-items:center"><select id="p_acct" class="acct">${acctOpts(keep[3] || (j.options || {}).account || S.account)}</select><button class="s sm" id="p_manage" type="button">Manage</button></span></label><label class="chk" style="margin-top:12px"><span class="switch"><input type="checkbox" id="p_hl" ${S.hideLikes ? 'checked' : ''}><span></span></span>Hide like count</label>` : ''}
      <div class="row" style="margin-top:12px"><label>Visibility<select id="p_p">${['private', 'unlisted', 'public'].map(v => `<option ${(keep[2] || (pubMode === 'web' ? 'public' : 'private')) === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>${btn}</div>`;
  const uploading = y.status === 'uploading';
  let h = `<div class="seg" id="pmode" style="margin:0 0 14px"><button type="button" data-v="web" class="${pubMode === 'web' ? 'on' : ''}">Browser upload</button><button type="button" data-v="api" class="${pubMode === 'api' ? 'on' : ''}">YouTube API</button></div>`;
  if (pubMode === 'web') {
    if (!web.ready) h += `<div class="banner warn">${icon('alert')}<div><b>Browser upload isn't ready</b>${!web.playwright ? 'Run <code>.venv\\Scripts\\python -m pip install playwright</code> and restart the app.' : 'Chrome or Edge was not found on this PC.'}</div></div>`;
    else h += `<p class="hint" style="margin-top:0">Opens a real Chrome window and clicks through YouTube Studio for you. No quota or audit limits. The first time, sign in to Google in that window (your password never touches this app). Keep the window open while it uploads.</p>`
      + form(`<button class="p" id="p_goweb" type="button" ${uploading ? 'disabled' : ''}>${icon('upload', 'sm')}${y.status === 'done' ? 'Upload again' : 'Upload via browser'}</button>`);
  } else if (!st.client_secret) h += `<div class="banner info">${icon('alert')}<div><b>YouTube API isn't set up</b>Save your Google OAuth file as <code>data/client_secret.json</code> (steps are in the README), or use Browser upload.</div></div>`;
  else if (!st.connected) h += `<button class="p" id="p_conn" type="button">${icon('link', 'sm')}Connect YouTube</button> <span class="mut" id="p_msg"></span>`;
  else h += form(`<button class="p" id="p_go" type="button" ${uploading ? 'disabled' : ''}>${icon('upload', 'sm')}${y.status === 'done' ? 'Upload again' : 'Upload to YouTube'}</button>`);
  if (uploading) h += `<div class="bar run" style="margin:12px 0 4px"><i style="width:${y.method === 'browser' ? 100 : (y.progress || 0)}%"></i></div><div class="row" style="align-items:center"><p class="hint" style="margin:0">${y.note ? esc(y.note) : `Uploading… ${y.progress || 0}%`}</p><button class="s sm" id="p_retry" type="button">${icon('refresh', 'sm')}Stuck? Restart</button><button class="s sm danger" id="p_stop" type="button">${icon('x', 'sm')}Stop uploading</button></div>`;
  if (y.status === 'done') h += `<div class="banner info" style="margin-top:12px">${icon('check')}<div><b>Uploaded${y.account_name ? ' to ' + esc(y.account_name) : ''} (${esc(y.privacy)})${y.likes_hidden === true ? ' · like count hidden' : y.likes_hidden === false ? ' · could not hide the like count, set it in Studio' : ''}</b><a href="${esc(y.url)}" target="_blank" rel="noopener">${esc(y.url)}</a></div></div>`;
  if (y.status === 'error') h += `<div class="errbox" style="margin-top:12px"><div><b>Upload failed</b><br>${esc(y.error)}</div><button class="s" id="p_retry" type="button">${icon('refresh', 'sm')}Try again</button></div>`;
  h += '<p class="hint">Instagram and TikTok are coming next. Uploads use the last rendered version of the clip.</p>';
  box.innerHTML = h;
  $$('#pmode button').forEach(b => b.onclick = () => { pubMode = b.dataset.v; drawPub(); });
  const pc = $('#p_conn'); if (pc) pc.onclick = () => { $('#p_msg').textContent = 'Finish signing in on the Google page that opened…'; busy(pc, async () => { try { await send('/api/publish/youtube/connect', {}); toast('YouTube connected', { type: 'ok' }); loadStatus(); drawPub(); } catch (e) { $('#p_msg').textContent = e.message; } }); };
  const pgen = $('#p_gen'); if (pgen) pgen.onclick = () => busy(pgen, async () => { try { const r = await send(`/api/jobs/${jid}/clips/${cid}/description`, { title: $('#p_t').value, previous: $('#p_d').value }); $('#p_d').value = r.description; } catch (e) { toast(e.message, { type: 'bad' }); } });
  const hl = $('#p_hl'); if (hl) hl.onchange = () => { S.hideLikes = hl.checked; savePrefs(); };
  const body = () => ({ title: $('#p_t').value, description: $('#p_d').value, privacy: $('#p_p').value, hide_likes: hl ? hl.checked : S.hideLikes, account: $('#p_acct') ? $('#p_acct').value : S.account });
  const pac = $('#p_acct'); if (pac) { const v = pac.value; fillAcct(pac, v); S.account = v; } const pmg = $('#p_manage'); if (pmg) pmg.onclick = () => manageChannels().then(drawPub);
  const pg = $('#p_go'); if (pg) pg.onclick = () => busy(pg, async () => { try { await send(`/api/jobs/${jid}/clips/${cid}/publish/youtube`, body()); drawPub(); } catch (e) { toast(e.message, { type: 'bad' }); } });
  const pw = $('#p_goweb'); if (pw) pw.onclick = () => busy(pw, async () => { try { await send(`/api/jobs/${jid}/clips/${cid}/publish/youtube-web`, body()); toast('A browser window will open. Sign in if asked.', { type: 'ok' }); drawPub(); } catch (e) { toast(e.message, { type: 'bad' }); } });
  const ps = $('#p_stop'); if (ps) ps.onclick = () => busy(ps, async () => { try { await send(`/api/jobs/${jid}/clips/${cid}/publish/cancel`, {}); toast('Upload stopped', { type: 'ok', ms: 2500 }); drawPub(); } catch (e) { toast(e.message, { type: 'bad' }); } });
  const rt = $('#p_retry'); if (rt) rt.onclick = () => {
    if (!$('#p_t')) return drawPub();
    const go = pubMode === 'web' ? $('#p_goweb') : $('#p_go');
    // the start button is disabled while uploading: call the API directly so Restart always works
    busy(rt, async () => { try { await send(`/api/jobs/${jid}/clips/${cid}/publish/youtube${pubMode === 'web' ? '-web' : ''}`, body()); toast('Restarted the upload', { type: 'ok', ms: 2500 }); drawPub(); } catch (e) { toast(e.message, { type: 'bad' }); } });
  };
  if (uploading) pubTimer = setTimeout(drawPub, 2000);
}

/* ===================== global job monitor (badge, title, notifications) ===================== */
const prevStatus = {};
let baseTitle = document.title;
async function monitor() {
  if (document.hidden && Object.keys(prevStatus).length) return;
  let js; try { js = await api('/api/jobs'); } catch { return; }
  const first = !Object.keys(prevStatus).length, n = js.filter(running).length;
  js.forEach(j => {
    const was = prevStatus[j.id];
    if (!first && was && ['queued', 'running'].includes(was) && !running(j) && !(currentWatch && currentWatch.id === j.id && !document.hidden)) {
      if (j.status === 'done') toast(`"${j.title}" is ready: ${j.clips.length} clips`, { type: 'ok', ms: 9000, action: { label: 'View', run: () => { location.hash = '#/projects/' + j.id; } } });
      else if (j.status === 'review') toast(`"${j.title}": ${j.clips.length} clips found. Choose which to render.`, { type: 'ok', ms: 9000, action: { label: 'Choose', run: () => { location.hash = '#/projects/' + j.id; } } });
      else if (j.status === 'error') toast(`"${j.title}" failed. Open it to retry.`, { type: 'bad', ms: 9000, action: { label: 'Open', run: () => { location.hash = '#/projects/' + j.id; } } });
    }
    prevStatus[j.id] = j.status;
  });
  api('/api/renders/queue').then(q => renNav(q.total + q.preparing.length)).catch(() => { });
  const badge = $('#navRun'); badge.hidden = !n; badge.textContent = n;
  api('/api/uploads/summary').then(q => {
    upNav({ total: q.total, holds: q.holds.length });
    const sig = q.holds.map(h => h.account + h.t).join();
    if (sig && sig !== upSeenHold) toast('Uploads stopped: ' + q.holds[0].reason, { type: 'bad', ms: 12000, action: { label: 'Open queue', run: () => { location.hash = '#/uploads'; } } });
    upSeenHold = sig;
  }).catch(() => { });
  document.title = n ? `(${n} running) Spark Clipper` : baseTitle;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) monitor(); });

/* ===================== keyboard ===================== */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#modal').hidden && $('#dlgHost').hidden) closeModal();
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !$('#modal').hidden) { const a = $('#apply'); if (a && !a.disabled) a.click(); }
});

/* ===================== boot ===================== */
(async function init() {
  hydrateIcons();
  await Promise.all([loadStatus(), loadLayouts().catch(() => { })]);
  if (!meta.sub_styles.includes(S.style)) S.style = meta.sub_styles[0] || 'bold_yellow';
  buildSettings(); setSource(S.mode); renderLayoutGrid(); updateSum(); goStep(1);
  route();
  const jid = sessionStorage.getItem('spark.createJob');
  if (jid && location.hash === '#/create') {
    api('/api/jobs/' + jid).then(j => { if (!running(j)) { sessionStorage.removeItem('spark.createJob'); return; } goStep(3); $('#s3actions').hidden = false; watch(jid, '#progress'); }).catch(() => sessionStorage.removeItem('spark.createJob'));
  }
  monitor(); setInterval(monitor, 5000);
})();
