/* Layout editor + renderer.
 * computeDraw()/resolveRegion() mirror backend/layouts.py (build_filter) so the preview matches the render. */
(function () {
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function resolveRegion(r, faceX, faceY = 0.4) {
    if (r.crop) return { crop: r.crop, fx: 0.5 };
    const z = Math.max(r.zoom || 1, 1);
    let fx = r.follow_face ? faceX : 0.5, crop = null;
    if (z > 1.001) {
      const cw = 1 / z;
      const x0 = r.follow_face ? clamp(faceX - cw / 2, 0, 1 - cw) : (1 - cw) / 2;
      const y0 = r.follow_face ? clamp(faceY - cw * 0.42, 0, 1 - cw) : (1 - cw) / 2;
      crop = { x: x0, y: y0, w: cw, h: cw };
      fx = r.follow_face ? clamp((faceX - x0) / cw, 0, 1) : 0.5;
    }
    return { crop, fx };
  }

  // Where a region draws from (source px) and to (canvas px). `view` = visible part of the source.
  function computeDraw(r, iw, ih, faceX, faceY, W, H) {
    const { crop, fx } = resolveRegion(r, faceX, faceY);
    let sx = 0, sy = 0, sw = iw, sh = ih;
    if (crop) { sx = crop.x * iw; sy = crop.y * ih; sw = crop.w * iw; sh = crop.h * ih; }
    const rx = r.x * W, ry = r.y * H, rw = r.w * W, rh = r.h * H;
    if (r.fit === 'fit') {
      const s = Math.min(rw / sw, rh / sh), dw = sw * s, dh = sh * s;
      return { view: { x: sx, y: sy, w: sw, h: sh }, dst: { x: rx + (rw - dw) / 2, y: ry + (rh - dh) / 2, w: dw, h: dh } };
    }
    const ra = rw / rh;
    let vw, vh, vx, vy;
    if (sw / sh > ra) { vh = sh; vw = sh * ra; vx = clamp(sx + fx * sw - vw / 2, sx, sx + sw - vw); vy = sy; }
    else { vw = sw; vh = sw / ra; vx = sx; vy = sy + (sh - vh) / 2; }
    return { view: { x: vx, y: vy, w: vw, h: vh }, dst: { x: rx, y: ry, w: rw, h: rh } };
  }

  let _ph = null;
  function placeholder() {
    if (_ph) return _ph;
    const c = document.createElement('canvas'); c.width = 960; c.height = 540;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 960, 540);
    grad.addColorStop(0, '#3a4a8a'); grad.addColorStop(1, '#8a3a5a');
    g.fillStyle = grad; g.fillRect(0, 0, 960, 540);
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2;
    for (let x = 0; x <= 960; x += 120) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 540); g.stroke(); }
    for (let y = 0; y <= 540; y += 90) { g.beginPath(); g.moveTo(0, y); g.lineTo(960, y); g.stroke(); }
    g.fillStyle = '#ffd7a8'; g.beginPath(); g.arc(336, 190, 62, 0, 7); g.fill();
    g.fillStyle = '#2b2f45'; g.beginPath(); g.ellipse(336, 440, 150, 150, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 28px system-ui'; g.fillText('YOUR VIDEO', 24, 44);
    return (_ph = c);
  }
  const PH_FACE = 336 / 960, PH_FACE_Y = 190 / 540;

  function renderLayout(canvas, layout, img, iw, ih, faceX, faceY = 0.4) {
    const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    g.save(); g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const s = Math.max(W / iw, H / ih);
    if (layout.background === 'blur') {
      try { g.filter = `blur(${Math.round(W * 0.035)}px)`; } catch (e) { /* older Safari */ }
      g.drawImage(img, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
      g.filter = 'none';
    }
    for (const r of layout.regions) {
      const d = computeDraw(r, iw, ih, faceX, faceY, W, H);
      g.save(); g.beginPath(); g.rect(r.x * W, r.y * H, r.w * W, r.h * H); g.clip();
      g.drawImage(img, d.view.x, d.view.y, d.view.w, d.view.h, d.dst.x, d.dst.y, d.dst.w, d.dst.h);
      g.restore();
    }
    g.restore();
  }

  function thumb(layout, w = 72) {
    const c = document.createElement('canvas'); c.width = w * 2; c.height = Math.round(w * 2 * 16 / 9);
    c.className = 'thumb';
    const p = placeholder();
    renderLayout(c, layout, p, p.width, p.height, PH_FACE, PH_FACE_Y);
    return c;
  }

  function drag(ev, move, end) {
    ev.preventDefault(); ev.stopPropagation();
    const t = ev.currentTarget, sx = ev.clientX, sy = ev.clientY;
    try { t.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    const mv = (e) => move(e.clientX - sx, e.clientY - sy);
    const up = () => { t.removeEventListener('pointermove', mv); t.removeEventListener('pointerup', up); t.removeEventListener('pointercancel', up); end && end(); };
    t.addEventListener('pointermove', mv); t.addEventListener('pointerup', up); t.addEventListener('pointercancel', up);
  }
  const snap = (v, targets, th = 0.025) => { for (const t of targets) if (Math.abs(v - t) < th) return t; return v; };

  class LayoutEditor {
    /* opts: layout, frameUrl?, faceX?, onChange?(layout), range?{start,end}, frameFor?(t)->url */
    constructor(root, opts) {
      this.root = root; this.o = opts; this.layout = clone(opts.layout); this.sel = 0;
      this.faceX = opts.faceX ?? PH_FACE; this.faceY = opts.faceY ?? PH_FACE_Y; this.img = placeholder(); this.iw = 960; this.ih = 540; this.raf = 0;
      this.build(); this.setFrame(opts.frameUrl); this.redraw();
    }
    $(s) { return this.root.querySelector(s); }
    get region() { return this.layout.regions[this.sel]; }
    getLayout() { return clone(this.layout); }
    setLayout(l) { this.layout = clone(l); this.sel = 0; this.redraw(); this.emit(); }
    setFace(x, y) { this.faceX = x; this.faceY = y ?? this.faceY; this.redraw(); }
    setFaceX(x) { this.setFace(x); }
    emit() { this.o.onChange && this.o.onChange(this.getLayout()); }

    setFrame(url) {
      if (!url) { this.img = placeholder(); this.iw = 960; this.ih = 540; this.srcUrl = this.srcUrl || placeholder().toDataURL(); this.syncSrc(); return; }
      const im = new Image();
      im.onload = () => { this.img = im; this.iw = im.naturalWidth; this.ih = im.naturalHeight; this.srcUrl = url; this.syncSrc(); this.redraw(); };
      im.onerror = () => { this.img = placeholder(); };
      im.src = url;
    }
    syncSrc() { const el = this.$('.le-srcimg'); if (el) { el.src = this.srcUrl || placeholder().toDataURL(); } }

    build() {
      const range = this.o.range;
      this.root.classList.add('le');
      this.root.innerHTML = `
        <div class="le-left">
          <div class="le-stage"><canvas width="540" height="960"></canvas><div class="le-boxes"></div></div>
          <div class="seg le-bg"><button data-v="blur">Blur background</button><button data-v="black">Black background</button></div>
        </div>
        <div class="le-right">
          <div class="le-chips"></div>
          <div class="le-src"><img class="le-srcimg" alt="source frame" draggable="false"><div class="le-crop"><i class="le-h"></i></div></div>
          ${range ? `<label class="le-time">Preview moment<input type="range" min="${range.start}" max="${range.end}" step="0.5" value="${(range.start + range.end) / 2}"></label>` : ''}
          <div class="le-ctl">
            <div class="seg" data-k="mode"><button data-v="auto">Auto</button><button data-v="manual">Manual crop</button></div>
            <div class="seg" data-k="fit"><button data-v="fill">Fill</button><button data-v="fit">Fit whole</button></div>
            <div class="le-auto">
              <label class="chk"><input type="checkbox" class="le-ff"> Follow speaker</label>
              <label class="le-zoom">Zoom <input type="range" class="le-zm" min="1" max="4" step="0.1"><b class="le-zv"></b></label>
            </div>
            <p class="hint le-hint"></p>
            <div class="row"><button class="s le-add">+ Add region</button><button class="s danger le-del">Delete region</button></div>
          </div>
        </div>`;
      this.stage = this.$('.le-stage'); this.cv = this.$('canvas'); this.boxes = this.$('.le-boxes');
      this.src = this.$('.le-src'); this.crop = this.$('.le-crop');

      this.root.querySelectorAll('.le-bg button').forEach(b => b.onclick = () => { this.layout.background = b.dataset.v; this.redraw(); this.emit(); });
      this.root.querySelectorAll('.le-ctl .seg button').forEach(b => b.onclick = () => {
        const k = b.parentElement.dataset.k, v = b.dataset.v, r = this.region;
        if (k === 'mode') v === 'manual' ? this.toManual() : (r.crop = null);
        if (k === 'fit') { r.fit = v; this.fixAspect(); }
        this.redraw(); this.emit();
      });
      this.$('.le-ff').onchange = (e) => { this.region.follow_face = e.target.checked; this.redraw(); this.emit(); };
      this.$('.le-zm').oninput = (e) => { this.region.zoom = +e.target.value; this.redraw(); };
      this.$('.le-zm').onchange = () => this.emit();
      this.$('.le-add').onclick = () => {
        if (this.layout.regions.length >= 6) return;
        this.layout.regions.push({ x: 0.1, y: 0.1, w: 0.5, h: 0.3, fit: 'fill', crop: null, follow_face: true, zoom: 1 });
        this.sel = this.layout.regions.length - 1; this.redraw(); this.emit();
      };
      this.$('.le-del').onclick = () => {
        if (this.layout.regions.length <= 1) return;
        this.layout.regions.splice(this.sel, 1); this.sel = Math.max(0, this.sel - 1); this.redraw(); this.emit();
      };
      const t = this.$('.le-time input');
      if (t) t.onchange = () => this.setFrame(this.o.frameFor(+t.value));

      // crop rectangle on the source frame
      this.crop.addEventListener('pointerdown', (ev) => {
        if (!this.region.crop) this.toManual();
        const r = this.region, o = clone(r.crop), rect = this.src.getBoundingClientRect();
        drag(ev, (dx, dy) => {
          r.crop.x = clamp(o.x + dx / rect.width, 0, 1 - o.w);
          r.crop.y = clamp(o.y + dy / rect.height, 0, 1 - o.h);
          this.schedule();
        }, () => this.emit());
      });
      this.$('.le-h').addEventListener('pointerdown', (ev) => {
        if (!this.region.crop) this.toManual();
        const r = this.region, o = clone(r.crop), rect = this.src.getBoundingClientRect();
        drag(ev, (dx, dy) => {
          let w = clamp(o.w + dx / rect.width, 0.08, 1 - o.x), h;
          if (r.fit === 'fill') {
            h = w * this.iw / (this.regionAspect(r) * this.ih);
            if (o.y + h > 1) { h = 1 - o.y; w = h * this.regionAspect(r) * this.ih / this.iw; }
          } else h = clamp(o.h + dy / rect.height, 0.08, 1 - o.y);
          r.crop.w = w; r.crop.h = h; this.schedule();
        }, () => this.emit());
      });
    }

    regionAspect(r) { return (r.w * 9) / (r.h * 16); } // canvas is 9:16

    toManual() {
      const r = this.region;
      const d = computeDraw(r, this.iw, this.ih, this.faceX, this.faceY, 540, 960).view;
      r.crop ={ x: clamp(d.x / this.iw, 0, 1), y: clamp(d.y / this.ih, 0, 1), w: clamp(d.w / this.iw, 0.05, 1), h: clamp(d.h / this.ih, 0.05, 1) };
    }
    fixAspect(r = this.region) {
      if (!r.crop || r.fit !== 'fill') return;
      const ra = this.regionAspect(r), c = r.crop;
      let h = c.w * this.iw / (ra * this.ih), w = c.w;
      if (c.y + h > 1) { h = 1 - c.y; w = h * ra * this.ih / this.iw; }
      if (c.x + w > 1) { w = 1 - c.x; h = w * this.iw / (ra * this.ih); }
      c.w = w; c.h = h;
    }

    schedule() { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.redraw(); }); }

    redraw() {
      renderLayout(this.cv, this.layout, this.img, this.iw, this.ih, this.faceX, this.faceY);
      // region boxes
      this.boxes.innerHTML = '';
      this.layout.regions.forEach((r, i) => {
        const b = document.createElement('div');
        b.className = 'le-box' + (i === this.sel ? ' on' : '');
        Object.assign(b.style, { left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' });
        b.innerHTML = `<span>${i + 1}</span><i class="le-h"></i>`;
        b.addEventListener('pointerdown', (ev) => {
          this.sel = i; const o = { x: r.x, y: r.y }, rect = this.stage.getBoundingClientRect();
          drag(ev, (dx, dy) => {
            r.x = snap(clamp(o.x + dx / rect.width, 0, 1 - r.w), [0, 1 - r.w, (1 - r.w) / 2]);
            r.y = snap(clamp(o.y + dy / rect.height, 0, 1 - r.h), [0, 1 - r.h, (1 - r.h) / 2]);
            this.schedule();
          }, () => { this.redraw(); this.emit(); });
          this.redraw();
        });
        b.querySelector('.le-h').addEventListener('pointerdown', (ev) => {
          this.sel = i; const o = { w: r.w, h: r.h }, rect = this.stage.getBoundingClientRect();
          drag(ev, (dx, dy) => {
            r.w = snap(clamp(o.w + dx / rect.width, 0.1, 1 - r.x), [1 - r.x, 1]);
            r.h = snap(clamp(o.h + dy / rect.height, 0.08, 1 - r.y), [1 - r.y, 1]);
            this.fixAspect(r); this.schedule();
          }, () => { this.redraw(); this.emit(); });
        });
        this.boxes.appendChild(b);
      });
      // chips
      this.$('.le-chips').innerHTML = this.layout.regions.map((_, i) => `<button class="chip ${i === this.sel ? 'on' : ''}" data-i="${i}">Region ${i + 1}</button>`).join('');
      this.root.querySelectorAll('.le-chips .chip').forEach(c => c.onclick = () => { this.sel = +c.dataset.i; this.redraw(); });
      // controls
      const r = this.region, manual = !!r.crop;
      this.root.querySelectorAll('.le-bg button').forEach(b => b.classList.toggle('on', b.dataset.v === this.layout.background));
      this.root.querySelectorAll('.le-ctl .seg').forEach(s => s.querySelectorAll('button').forEach(b => {
        const v = s.dataset.k === 'mode' ? (manual ? 'manual' : 'auto') : r.fit;
        b.classList.toggle('on', b.dataset.v === v);
      }));
      this.$('.le-auto').style.display = manual ? 'none' : '';
      this.$('.le-ff').checked = !!r.follow_face; this.$('.le-zm').value = r.zoom || 1; this.$('.le-zv').textContent = (r.zoom || 1).toFixed(1) + '×';
      this.$('.le-hint').textContent = manual ? 'Drag the box on the video to choose what shows in this region. Drag the corner to resize.'
        : 'Auto mode. Drag the box on the video to take manual control.';
      this.$('.le-del').disabled = this.layout.regions.length <= 1;
      // crop overlay (manual crop, or the visible window in auto mode)
      const v = computeDraw(r, this.iw, this.ih, this.faceX, this.faceY, 540, 960).view;
      Object.assign(this.crop.style, { left: v.x / this.iw * 100 + '%', top: v.y / this.ih * 100 + '%', width: v.w / this.iw * 100 + '%', height: v.h / this.ih * 100 + '%' });
      this.crop.classList.toggle('manual', manual);
    }
  }

  window.LE = { LayoutEditor, renderLayout, thumb, placeholder, computeDraw, resolveRegion };
})();
