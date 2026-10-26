import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const CAMS = [
  ['chase', '追尾'],
  ['cinema', '电影'],
  ['orbit', '自由'],
  ['pov', '鹈鹕视角'],
];
const QUIPS = ['嘎！', '这条鱼是我的！', '风好舒服～', '看我单手骑！', '叮铃铃～', '前方有鱼！', '再来一条！', '我的嘴就是网兜', '环岛第一名'];
const CATCH_QUIPS = ['好吃！', '嗷呜～', '一口一条！', '完美接住！', '嘎嘎嘎！'];

export function createUI({ G, rig, audio, camera, renderer, composer, path, pelican }) {
  const toastEl = $('toast'), bubble = $('bubble'), combo = $('combo');
  let camIdx = 0, toastT = 0, bubbleT = 0, nextQuip = 6, comboT = 0, shotPending = false, laps = 0;
  const proj = new THREE.Vector3();

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    toastT = 2.2;
  }
  function say(msg, t = 2.4) {
    bubble.textContent = msg;
    bubble.hidden = false;
    bubbleT = t;
  }
  function setCam(i) {
    camIdx = (i + CAMS.length) % CAMS.length;
    rig.setMode(CAMS[camIdx][0]);
    $('cam-name').textContent = CAMS[camIdx][1];
    toast(`镜头：${CAMS[camIdx][1]}${CAMS[camIdx][0] === 'orbit' ? '（拖动旋转，滚轮缩放）' : ''}`);
  }
  function setAuto(on) {
    G.auto = on;
    $('btn-auto').setAttribute('aria-pressed', String(on));
    $('btn-auto').textContent = on ? '🤖 自动' : '🕹️ 手动';
  }
  function bell() {
    audio.bell();
    say('叮铃铃～', 1.4);
  }
  function screenshot() { shotPending = true; }
  function togglePhoto() {
    document.body.classList.toggle('photo');
    if (document.body.classList.contains('photo')) toast('按 H 恢复界面');
  }

  // Keyboard
  const KEYMAP = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'go', ArrowUp: 'go', KeyS: 'brake', ArrowDown: 'brake' };
  function press(k, v) {
    if (G.input[k] === v) return;
    G.input[k] = v;
    if (v && G.auto && G.started) { setAuto(false); toast('已切换为手动驾驶（P 恢复自动）'); }
  }
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const k = KEYMAP[e.code];
    if (k) { press(k, 1); e.preventDefault(); return; }
    if (e.repeat) return;
    if (e.code === 'Space') { bell(); e.preventDefault(); }
    else if (e.code === 'KeyC') setCam(camIdx + 1);
    else if (e.code === 'KeyP') { setAuto(!G.auto); toast(G.auto ? '自动驾驶：开' : '自动驾驶：关'); }
    else if (e.code === 'KeyT') { G.todFast = !G.todFast; G.todAuto = true; toast(G.todFast ? '时间快进中...' : '时间正常流动'); }
    else if (e.code === 'KeyH') togglePhoto();
    else if (e.code === 'KeyF') screenshot();
    else if (e.code === 'KeyM') $('btn-music').click();
  });
  addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) press(k, 0); });
  addEventListener('blur', () => { for (const k in G.input) G.input[k] = 0; });

  // Touch buttons
  for (const b of document.querySelectorAll('#touch button')) {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); press(k, 1); };
    const off = (e) => { e.preventDefault(); press(k, 0); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
  }

  $('btn-cam').onclick = () => setCam(camIdx + 1);
  $('btn-auto').onclick = () => setAuto(!G.auto);
  $('btn-bell').onclick = bell;
  $('btn-shot').onclick = screenshot;
  $('btn-hide').onclick = togglePhoto;
  $('btn-music').onclick = (e) => {
    const on = !audio.musicOn;
    audio.setMusic(on);
    e.currentTarget.setAttribute('aria-pressed', String(on));
  };
  $('btn-sfx').onclick = (e) => {
    const on = !audio.sfxOn;
    audio.setSfx(on);
    e.currentTarget.setAttribute('aria-pressed', String(on));
  };
  const tod = $('tod');
  tod.addEventListener('input', () => { G.tod = +tod.value; G.todAuto = false; G.todFast = false; });
  tod.addEventListener('change', () => { G.todAuto = true; });
  rig.onCut = () => {};

  // Minimap: static road outline plus live markers
  const mm = $('minimap'), mctx = mm.getContext('2d');
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < path.S; i++) {
    minX = Math.min(minX, path.px[i]); maxX = Math.max(maxX, path.px[i]);
    minZ = Math.min(minZ, path.pz[i]); maxZ = Math.max(maxZ, path.pz[i]);
  }
  const span = Math.max(maxX - minX, maxZ - minZ) * 1.15, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const toMap = (x, z) => [((x - cx) / span + 0.5) * mm.width, ((z - cz) / span + 0.5) * mm.height];
  const base = document.createElement('canvas');
  base.width = mm.width; base.height = mm.height;
  {
    const g = base.getContext('2d');
    g.fillStyle = 'rgba(120,180,90,0.35)';
    g.beginPath();
    g.arc(mm.width / 2, mm.height / 2, mm.width * 0.47, 0, 7);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 3;
    g.beginPath();
    for (let i = 0; i <= path.S; i += 4) {
      const [x, y] = toMap(path.px[i % path.S], path.pz[i % path.S]);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    g.stroke();
  }
  let mmT = 0;
  function drawMinimap(B, fishList) {
    mctx.clearRect(0, 0, mm.width, mm.height);
    mctx.drawImage(base, 0, 0);
    mctx.fillStyle = '#ffd166';
    for (const f of fishList) {
      if (f.state !== 'idle') continue;
      const [x, y] = toMap(f.mesh.position.x, f.mesh.position.z);
      mctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    const [x, y] = toMap(B.pos.x, B.pos.z);
    const a = Math.atan2(B.fwd.z, B.fwd.x);
    mctx.save();
    mctx.translate(x, y);
    mctx.rotate(a);
    mctx.fillStyle = '#ff6b4a';
    mctx.strokeStyle = '#fff';
    mctx.lineWidth = 2;
    mctx.beginPath();
    mctx.moveTo(9, 0); mctx.lineTo(-6, 6); mctx.lineTo(-3, 0); mctx.lineTo(-6, -6); mctx.closePath();
    mctx.fill(); mctx.stroke();
    mctx.restore();
  }

  function project(world, el, dy = 0) {
    proj.copy(world).project(camera);
    if (proj.z > 1) { el.style.opacity = '0'; return false; }
    el.style.opacity = '';
    el.style.left = `${(proj.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-proj.y * 0.5 + 0.5) * innerHeight + dy}px`;
    return true;
  }

  const headW = new THREE.Vector3();
  let fishList = [];
  return {
    setFish(list) { fishList = list; },
    showIntro(onStart) {
      $('intro').hidden = false;
      const btn = $('start');
      btn.focus();
      btn.onclick = () => {
        audio.init();
        $('intro').hidden = true;
        $('hud').hidden = false;
        setCam(0);
        onStart();
        setTimeout(() => say('出发咯！嘎～'), 600);
      };
    },
    lap() {
      laps++;
      audio.fanfare();
      toast(`完成第 ${laps} 圈！🏁`);
    },
    onCatch(pos, n) {
      const el = document.createElement('div');
      el.className = 'pop';
      el.textContent = n > 1 ? `+${n} 连击!` : '+1 🐟';
      $('pops').appendChild(el);
      project(pos, el);
      setTimeout(() => el.remove(), 1100);
      if (n > 1) {
        combo.textContent = `连击 ×${n}`;
        combo.classList.add('show');
        comboT = 2.5;
      }
      if (Math.random() < 0.35) say(CATCH_QUIPS[(Math.random() * CATCH_QUIPS.length) | 0], 1.6);
    },
    update(dt, B) {
      $('speed').textContent = Math.round(B.speed * 3.6);
      $('score').textContent = G.score;
      $('dist').textContent = (G.dist / 1000).toFixed(2);
      const h = Math.floor(G.tod), m = Math.floor((G.tod - h) * 60);
      $('clock').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      if (G.todAuto && document.activeElement !== tod) tod.value = G.tod.toFixed(2);
      if (toastT > 0 && (toastT -= dt) <= 0) toastEl.classList.remove('show');
      if (comboT > 0 && (comboT -= dt) <= 0) combo.classList.remove('show');
      if (G.started) {
        nextQuip -= dt;
        if (nextQuip < 0) { nextQuip = 12 + Math.random() * 14; say(QUIPS[(Math.random() * QUIPS.length) | 0]); }
      }
      if (bubbleT > 0) {
        bubbleT -= dt;
        pelican.head.getWorldPosition(headW);
        headW.y += 0.35;
        const visible = rig.mode !== 'pov' && project(headW, bubble);
        bubble.hidden = bubbleT <= 0 || !visible;
      }
      if ((mmT += dt) > 0.1) { mmT = 0; drawMinimap(B, fishList); }
    },
    afterRender() {
      if (!shotPending) return;
      shotPending = false;
      renderer.domElement.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `pelican-ride-${Date.now()}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast('截图已保存 📸');
      }, 'image/png');
    },
    toast,
  };
}
