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
const S = Object.assign({}, DEF, _p);
const LEN = { short: [15, 30, 'Short', '15–30s'], standard: [20, 60, 'Standard', '20–60s'], long: [45, 90, 'Long', '45–90s'] };
const KINDS = { auto: ['Auto', 'Let AI decide'], talk: ['Talk & podcasts', 'Opinions, stories'], gaming: ['Gaming & funny', 'Fails, clutch, reactions'] };
const CAP = { bold_yellow: ['Bold yellow', '<em><span style="color:#fff">BIG</span> <span style="color:#ffe500">WORDS</span></em>'], clean_white: ['Clean white', '<em style="color:#fff;font-weight:600;text-transform:none">Clean text</em>'], green_pop: ['Green pop', '<em><span style="color:#fff">POP</span> <span style="color:#00ff66">IN</span></em>'] };
const savePrefs = () => store.set('prefs', { numV: 2, mode: S.mode, num: S.num, len: S.len, res: S.res, subs: S.subs, hook: S.hook, hideLikes: S.hideLikes, upPriv: S.upPriv, account: S.account, content: S.content, style: S.style, layout: S.layout, minScore: S.minScore });
let layouts = [], meta = { sub_styles: [], resolutions: ['720p', '1080p'] }, curJob = null, poll = null, currentWatch = null, custEd = null, pickedFile = null, step = 1;

const opts = () => ({ layout_id: S.layout, subtitles: S.subs, sub_style: S.style, num_clips: S.num, min_len: LEN[S.len][0], max_len: LEN[S.len][1], resolution: S.res, hook_text: S.hook, content: S.content, account: S.account || 'default', min_score: S.minScore, notes: ($('#aboutNote') ? $('#aboutNote').value.trim() : '') });
const layoutName = (id) => (layouts.find(l => l.id === id) || {}).name || id;

/* ===================== routing ===================== */
const PAGES = {
  create: ['Create clips', 'Turn any video into short, shareable clips'],
  projects: ['Projects', 'Everything you have generated'],
  creators: ['Creators', 'Auto-clip new uploads from channels you follow'],
};
function route() {
  const [name = 'create', id] = (location.hash.replace(/^#\/?/, '') || 'create').split('/');
  const page = PAGES[name] ? name : 'create';
  closeModal(true);
  Object.keys(PAGES).forEach(p => { $('#page-' + p).hidden = p !== page; });
  $$('.nav a').forEach(a => a.setAttribute('aria-current', a.dataset.route === page ? 'page' : 'false'));
  $('#pgTitle').textContent = PAGES[page][0]; $('#pgSub').textContent = PAGES[page][1];
  document.title = PAGES[page][0] + ' · Spark Clipper'; $('#pgActions').innerHTML = '';
  clearInterval(poll);
  if (page === 'create' && step >= 3 && step < 4) {
    // coming back to Create: resume live updates for the job being generated (another page may have taken over the poller)
    const cj = sessionStorage.getItem('spark.createJob');
    if (cj) { watch(cj, '#progress'); }
  }
  if (page === 'projects') { id ? showProject(id) : showProjectList(); }
  if (page === 'creators') loadCreators();
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
async function drawAuto() {
  const box = $('#autoBanner'); if (!box) return;
  let a; try { a = await api('/api/auto/status'); } catch { return; }
  if (!a.paused) { box.innerHTML = ''; return; }
  box.innerHTML = a.stops.map(s => `<div class="banner warn">${icon('alert')}<div><b>Full auto upload is paused for "${esc(s.name)}"</b>${esc(s.reason || '')}
    ${s.shot_url ? `<br><a href="${esc(s.shot_url)}" target="_blank" rel="noopener">Open the screenshot taken when it stopped</a>` : ''}
    <span class="mut"> · Fix the cause, then resume. Clips already made stay in their projects (use Upload all).</span></div><button class="s sm x" data-acc="${esc(s.account)}" type="button">Resume</button></div>`).join('');
  box.querySelectorAll('button[data-acc]').forEach(r => r.onclick = () => busy(r, async () => { await send('/api/auto/resume?account=' + encodeURIComponent(r.dataset.acc), {}); toast('Auto upload resumed', { type: 'ok' }); drawAuto(); }));
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
      <button class="s sm" data-in>Sign in</button>${a.id === 'default' ? '' : '<button class="s sm danger" data-del>Remove</button>'}</div>`).join('');
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
$('#s1Manage').onclick = manageChannels;
loadAccts();

function setSource(mode) {
  S.mode = mode; savePrefs();
  $$('#srcSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === mode));
  $('#srcLink').hidden = mode !== 'link'; $('#srcFile').hidden = mode !== 'file'; $('#srcAuto').hidden = mode !== 'auto';
  $('#to2').hidden = mode === 'auto'; $('#autoGo').hidden = mode !== 'auto';
  loadAccts(); $('#autoPriv').value = S.upPriv || 'public'; $('#autoHl').checked = S.hideLikes !== false; checkAuto(); refreshS1();
}
function refreshS1() {
  const ok = S.mode === 'link' ? urlValid : S.mode === 'auto' ? autoUrls().length > 0 : fileOk;
  $('#to2').disabled = !ok; $('#autoGo').disabled = !ok;
  $('#s1hint').textContent = ok ? '' : S.mode === 'link' ? 'Paste a YouTube link to continue.' : S.mode === 'auto' ? 'Paste at least one video link.' : 'Choose a video file to continue.';
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
$('#url').addEventListener('keydown', (e) => { if (e.key === 'Enter' && urlValid) goStep(2); });
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
function goStep(n) {
  step = n;
  ['s1', 's2', 's3'].forEach((id, i) => { $('#' + id).hidden = i + 1 !== Math.min(n, 3); });
  $$('#wiz li').forEach((li, i) => { li.classList.toggle('on', i + 1 === n); li.classList.toggle('done', i + 1 < n); li.querySelector('.n').innerHTML = i + 1 < n ? icon('check', 'sm') : i + 1; });
  if (n === 2) { renderLayoutGrid(); updateSum(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$$('#wiz button').forEach(b => b.onclick = () => { const n = +b.dataset.step; if (n < step) goStep(n); });
$('#to2').onclick = () => goStep(2);
$('#back1').onclick = () => goStep(1);
const updateSum = () => { $('#s2sum').textContent = `${S.num ? S.num + ' clips' : 'AI picks the clips'} · ${LEN[S.len][3]} · ${S.res} · captions ${S.subs ? 'on' : 'off'} · hook ${S.hook ? 'on' : 'off'} · ${layoutName(S.layout)}`; };

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
    <div id="g-err"></div><div id="g-next"></div><div id="g-review"></div>
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
    card.className = 'clip' + (c.ghost ? ' ghost' : '');
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
  const sm = $('#g-next', el); if (sm && sumTxt && !sm.querySelector('.upsum')) sm.insertAdjacentHTML('beforeend', `<div class="banner info upsum">${icon('upload')}<div><b>${esc(sumTxt)}</b>Keep the browser window open. Clips upload one by one.</div></div>`);
  const pz = $('#pzip'); if (pz && sel === '#jobview') { pz.hidden = !j.clips.some(c => c.version > 0); pz.href = `/api/jobs/${j.id}/zip`; }

  const lg = $('#g-log', el), logs = j.log || [], t0 = j.started || j.created;
  const near = lg.scrollHeight - lg.scrollTop - lg.clientHeight < 40;
  if (logs.length < st.logN) { lg.innerHTML = ''; st.logN = 0; }
  logs.slice(st.logN).forEach(l => { const d = document.createElement('div'); d.className = l.level; d.innerHTML = `<span class="t">${mmss(l.t - t0)}</span>${esc(l.msg)}`; lg.appendChild(d); });
  st.logN = logs.length; if (near) lg.scrollTop = lg.scrollHeight;
  $('#g-logbox', el).classList.toggle('live', run);
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
const statusPill = (j) => { const m = { done: ['ok', 'Complete'], error: ['bad', 'Failed'], skipped: ['idle', 'Skipped'], queued: ['run', 'Queued'], running: ['run', 'Working'], review: ['ok', 'Choose clips'] }[j.status] || ['idle', j.status]; return `<span class="pill ${m[0]}">${m[1]}</span>`; };
async function showProjectList() {
  $('#pdetail').hidden = true; $('#plistWrap').hidden = false;
  const list = $('#plist');
  if (!list.children.length) list.innerHTML = Array.from({ length: 3 }, () => '<div class="pcard"><div class="cover skel"></div><div class="pbody"><span class="skel" style="height:14px;border-radius:6px"></span><span class="skel" style="height:14px;width:50%;border-radius:6px"></span></div></div>').join('');
  let js = []; try { js = await api('/api/jobs'); } catch { toast('Couldn\'t load projects.', { type: 'bad' }); }
  const q = $('#pq').value.trim().toLowerCase();
  const vis = js.filter(j => (pFilter === 'all' || (pFilter === 'running' ? running(j) : pFilter === 'done' ? j.status === 'done' : j.status === 'error')) && (!q || (j.title || '').toLowerCase().includes(q)));
  if (!js.length) { list.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="big">${icon('film')}</div><h3>No projects yet</h3><p>Generate your first clips and they'll show up here.</p><a class="btn p" href="#/create">${icon('sparkles', 'sm')}Create clips</a></div>`; return; }
  if (!vis.length) { list.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><h3>No matches</h3><p>Try a different search or filter.</p></div>'; return; }
  list.innerHTML = '';
  vis.forEach(j => {
    const thumbs = j.clips.filter(c => c.version > 0).slice(0, 3);
    const cover = thumbs.length ? `<div class="cover">${thumbs.map(c => `<img loading="lazy" alt="" src="/media/${j.id}/clips/${c.id}.jpg?v=${c.version}">`).join('')}</div>` : `<div class="cover empty">${running(j) ? '<div class="skel" style="position:absolute;inset:0"></div>' : ''}${icon('film')}</div>`;
    const c = document.createElement('div'); c.className = 'pcard'; c.tabIndex = 0; c.setAttribute('role', 'link');
    c.style.position = 'relative';
    c.innerHTML = `${cover}<button class="icon del danger" aria-label="Delete project" title="Delete">${icon('trash', 'sm')}</button><div class="pbody"><b>${esc(j.title || j.id)}</b><div class="pmeta">${statusPill(j)}<span>${j.clips.length} clips</span><span>· ${fmtAgo(j.created)}</span>${j.source === 'watcher' ? '<span class="pill idle">Auto</span>' : ''}</div></div>`;
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
let pqT; $('#pq').addEventListener('input', () => { clearTimeout(pqT); pqT = setTimeout(showProjectList, 150); });
$$('#pfilter button').forEach(b => b.onclick = () => { pFilter = b.dataset.v; $$('#pfilter button').forEach(x => x.classList.toggle('on', x === b)); showProjectList(); });

/* ===================== creators ===================== */
async function loadCreators() {
  const box = $('#clist');
  if (!box.children.length) box.innerHTML = '<div class="ccard"><span class="avatar skel"></span><div class="meta"><span class="skel" style="display:block;height:14px;width:40%;border-radius:6px"></span></div></div>';
  await loadAccts(); $('#cManage').onclick = () => manageChannels().then(loadCreators);
  let cs = []; try { cs = await api('/api/creators'); } catch { toast('Couldn\'t load creators.', { type: 'bad' }); }
  if (!cs.length) { box.innerHTML = `<div class="empty-state"><div class="big">${icon('users')}</div><h3>You're not following anyone yet</h3><p>Follow a YouTube channel and every new video they post gets clipped automatically.</p></div>`; return; }
  box.innerHTML = '';
  cs.forEach(c => {
    const d = document.createElement('div'); d.className = 'ccard';
    d.innerHTML = `<span class="avatar">${esc((c.name || '?')[0].toUpperCase())}</span><div class="meta"><b>${esc(c.name)}</b><span class="mut">${c.options.auto ? 'Full auto → ' + esc((accts.find(a => a.id === (c.options.account || 'default')) || {}).name || 'Main channel') + ' (' + esc(c.options.auto_privacy || 'public') + ')' : 'Clips only, no upload'} · ${esc(layoutName(c.options.layout_id || 'fill'))}</span></div>
      <div class="ctl"><select class="cacct" aria-label="Channel for ${esc(c.name)}">${acctOpts(c.options.account || 'default')}</select><select class="cmode" aria-label="What to do with new videos from ${esc(c.name)}"><option value="off" ${!c.enabled ? 'selected' : ''}>Off</option><option value="clips" ${c.enabled && !c.options.auto ? 'selected' : ''}>Clips only</option><option value="auto" ${c.enabled && c.options.auto ? 'selected' : ''}>Full auto: upload</option></select><button class="ghost icon danger" aria-label="Unfollow ${esc(c.name)}">${icon('trash')}</button></div>`;
    const saveMode = async () => {
      const m = d.querySelector('.cmode').value;
      try {
        await send(`/api/creators/${c.channel_id}/upload`, { auto: m === 'auto', account: d.querySelector('.cacct').value, auto_privacy: c.options.auto_privacy || 'public', hide_likes: c.options.hide_likes !== false }, 'PUT');
        await api(`/api/creators/${c.channel_id}/enabled?enabled=${m !== 'off'}`, { method: 'POST' });
        toast(`${c.name}: ${{ off: 'not watched', clips: 'clips only', auto: 'full auto upload' }[m]}`, { type: 'ok', ms: 2500 });
      } catch (e) { toast(e.message, { type: 'bad' }); }
      loadCreators();
    };
    d.querySelector('.cacct').onchange = saveMode; d.querySelector('.cmode').onchange = saveMode;
    d.style.cursor = 'pointer'; d.title = 'Click to see this creator\'s videos';
    d.onclick = (ev) => { if (!ev.target.closest('select, label, button, input, a')) openCreator(c); };
    d.querySelector('button').onclick = async () => { if (await ask({ title: `Unfollow ${c.name}?`, text: 'Future uploads won\'t be clipped. Existing projects stay.', ok: 'Unfollow', danger: true })) { await api('/api/creators/' + c.channel_id, { method: 'DELETE' }); loadCreators(); } };
    box.appendChild(d);
  });
}
async function openCreator(c) {
  const fmtViews = (n) => n == null ? '' : (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n)) + ' views';
  const mode = c.options.auto ? 'Clip + upload' : 'Clip';
  const acct = (accts.find(a => a.id === (c.options.account || 'default')) || {}).name || 'Main channel';
  return dialog(`<div class="cdetail">
      <div class="cd-head"><span class="avatar">${esc((c.name || '?')[0].toUpperCase())}</span>
        <div><h3>${esc(c.name)}</h3><span class="pill ${c.options.auto ? 'ok' : 'idle'}">${c.options.auto ? 'Full auto → ' + esc(acct) : 'Clips only'}</span></div>
        <button class="ghost icon" data-c aria-label="Close">${icon('x')}</button></div>
      <div class="cd-body">
        <div class="cd-sec"><h4>Already clipped</h4><div class="cl-clipped mut">Loading…</div></div>
        <div class="cd-sec"><h4>Recent videos</h4><div class="cl-vids"></div>
          <button class="s cd-more" data-more hidden>Show more</button><div class="mut cl-msg"></div></div>
      </div></div>`,
    (h, close) => {
      h.querySelector('.dlg').classList.add('wide');
      h.querySelector('[data-c]').onclick = () => close(true);
      const vids = h.querySelector('.cl-vids'), more = h.querySelector('[data-more]'), msg = h.querySelector('.cl-msg');
      let offset = 0; const PAGE = 5, shown = {};
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
          if (c.options.auto && !confirm(`Clip this video and upload the ${S.minScore}+ rated clips to ${acct}?`)) return;
          try { const res = await send(`/api/creators/${c.channel_id}/clip`, { video_id: v.id, title: v.title }); toast('Started. Follow it under Projects.', { type: 'ok', ms: 5000, action: { label: 'View', run: () => { location.hash = '#/projects/' + res.job; } } });
            b.outerHTML = `<a class="s sm btn" href="#/projects/${res.job}">Started · View</a>`; } catch (e) { toast(e.message, { type: 'bad' }); }
        });
        return r;
      };
      const load = async () => {
        more.classList.add('busy'); more.disabled = true; msg.textContent = '';
        try {
          const r = await api(`/api/creators/${c.channel_id}/videos?offset=${offset}&limit=${PAGE}`);
          r.videos.forEach(v => { if (!shown[v.id]) { shown[v.id] = 1; vids.appendChild(row(v)); } });
          offset += PAGE; more.hidden = !r.has_more;
          if (!vids.children.length) msg.textContent = 'No videos found.';
        } catch (e) { msg.textContent = e.message; more.hidden = false; }
        more.classList.remove('busy'); more.disabled = false;
      };
      more.onclick = load; more.hidden = false; load();
    });
}
$('#addc').onclick = (e) => {
  const v = $('#curl').value.trim(), m = $('#curlMsg'); m.innerHTML = '';
  if (!/youtube\.com\/(@|channel\/|c\/|user\/)/.test(v)) { m.innerHTML = '<div class="field-err">Paste a channel link like youtube.com/@channelname</div>'; return; }
  busy(e.currentTarget, async () => {
    try { const au = $('#cAuto').checked; const c = await send('/api/creators', { url: v, ...opts(), account: $('#cAcct').value || 'default', ...(au ? { num_clips: 0, auto: true, auto_privacy: $('#cPriv').value, hide_likes: S.hideLikes !== false } : {}) }); $('#curl').value = ''; toast(`Now following ${c.name}. ${c.options.auto ? 'New videos are clipped and uploaded automatically.' : 'New videos will be clipped automatically.'}`, { type: 'ok' }); loadCreators(); }
    catch (err) { m.innerHTML = `<div class="field-err">${esc(err.message)}</div>`; }
  });
};
$('#curl').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#addc').click(); });
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
  ? `<video src="/media/${jid}/clips/${c.id}.mp4?v=${c.version}" controls playsinline loop ${c.status === 'ready' ? 'autoplay muted' : ''}></video>`
  : `<div class="vph">${c.status === 'error' ? 'Render failed' : 'Rendering…'}</div>`;

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
  const badge = $('#navRun'); badge.hidden = !n; badge.textContent = n;
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
  buildSettings(); setSource(S.mode); goStep(1);
  route();
  const jid = sessionStorage.getItem('spark.createJob');
  if (jid && (location.hash === '' || location.hash === '#/create')) {
    api('/api/jobs/' + jid).then(j => { if (!running(j)) { sessionStorage.removeItem('spark.createJob'); return; } goStep(3); $('#s3actions').hidden = false; watch(jid, '#progress'); }).catch(() => sessionStorage.removeItem('spark.createJob'));
  }
  monitor(); setInterval(monitor, 5000);
})();
