import * as THREE from '../vendor/three.module.min.js';
import { Game, FIELD, PADDLE, BALL, SHIELD_Y, POWERS, REGRESSION_SECONDS } from './engine.js';
import { Chiptune } from './music.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const canvas = $('scene');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const STORAGE = { best: 'mona-breaker-best', theme: 'mona-breaker-theme', audio: 'mona-breaker-audio' };

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } },
};

let best = Number(store.get(STORAGE.best)) || 0;
let audioPrefs = { music: true, sfx: true };
try { audioPrefs = { ...audioPrefs, ...JSON.parse(store.get(STORAGE.audio) || '{}') }; } catch { /* default */ }

// ---------- palette ----------
let C = {};
function readPalette() {
  const style = getComputedStyle(document.documentElement);
  const names = ['bg', 'surface', 'surface-soft', 'ink', 'muted', 'lavender', 'lavender-edge', 'lavender-deep', 'mint', 'mint-edge',
    'coral', 'coral-edge', 'commit-1', 'commit-2', 'commit-3', 'commit-4', 'conflict', 'floor', 'floor-dot', 'ball', 'border'];
  const out = {};
  for (const name of names) out[name] = style.getPropertyValue(`--${name}`).trim() || '#ff00ff';
  return out;
}
const isDark = () => document.documentElement.dataset.theme === 'dark';

// ---------- three.js setup ----------
let renderer, scene, camera, hemi, sun, board, dynamic;
const toScene = (x, y, h = 0) => new THREE.Vector3(x, h, FIELD.height / 2 - y);
const disposables = new Set();
const track = (thing) => { disposables.add(thing); return thing; };

function mat(color, extra = {}) {
  return track(new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.02, ...extra }));
}
function lineMat() { return track(new THREE.LineBasicMaterial({ color: C.ink, transparent: true, opacity: isDark() ? 0.55 : 0.85 })); }

const geo = {};
function sharedGeometry() {
  geo.sphere = new THREE.SphereGeometry(1, 20, 14);
  geo.ball = new THREE.SphereGeometry(BALL.radius, 24, 16);
  geo.cyl = new THREE.CylinderGeometry(1, 1, 1, 20);
  geo.box = new THREE.BoxGeometry(1, 1, 1);
  geo.boxEdges = new THREE.EdgesGeometry(geo.box);
  geo.token = new THREE.CylinderGeometry(0.42, 0.42, 0.16, 28);
  geo.laser = new THREE.BoxGeometry(0.08, 0.08, 0.5);
  geo.spark = new THREE.BoxGeometry(0.12, 0.12, 0.12);
}

function outlinedBox(w, h, d, material, parent) {
  const mesh = new THREE.Mesh(geo.box, material);
  mesh.scale.set(w, h, d);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const edges = new THREE.LineSegments(geo.boxEdges, lineMat());
  mesh.add(edges);
  parent?.add(mesh);
  return mesh;
}
function sphere(parent, x, y, z, sx, sy, sz, material) {
  const mesh = new THREE.Mesh(geo.sphere, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function tube(parent, points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const mesh = new THREE.Mesh(track(new THREE.TubeGeometry(curve, 14, radius, 8, false)), material);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// Canvas-drawn icons keep every graphic original and self-contained.
function iconTexture(kind, background) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = background;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = C.ink;
  g.fillStyle = C.ink;
  g.lineWidth = 8;
  g.lineJoin = g.lineCap = 'round';
  const round = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  if (kind === 'copilot') {
    round(22, 34, 84, 64, 26); g.fillStyle = C.surface; g.fill(); g.stroke();
    g.beginPath(); g.arc(46, 62, 12, 0, Math.PI * 2); g.moveTo(94, 62); g.arc(82, 62, 12, 0, Math.PI * 2); g.stroke();
    g.fillStyle = C.ink; g.fillRect(44, 82, 8, 8); g.fillRect(76, 82, 8, 8);
  } else if (kind === 'dependabot') {
    g.beginPath(); g.moveTo(64, 18); g.lineTo(104, 32); g.lineTo(100, 70); g.quadraticCurveTo(92, 98, 64, 112);
    g.quadraticCurveTo(36, 98, 28, 70); g.lineTo(24, 32); g.closePath(); g.fillStyle = C.surface; g.fill(); g.stroke();
    g.beginPath(); g.moveTo(46, 64); g.lineTo(60, 78); g.lineTo(84, 50); g.stroke();
  } else if (kind === 'actions') {
    g.beginPath(); g.arc(64, 64, 42, 0, Math.PI * 2); g.fillStyle = C.surface; g.fill(); g.stroke();
    g.beginPath(); g.moveTo(54, 44); g.lineTo(84, 64); g.lineTo(54, 84); g.closePath(); g.fillStyle = C.ink; g.fill();
  } else if (kind === 'bug') {
    g.lineWidth = 7;
    for (const y of [50, 66, 82]) { g.beginPath(); g.moveTo(28, y - 6); g.lineTo(100, y + 6); g.moveTo(100, y - 6); g.lineTo(28, y + 6); g.stroke(); }
    g.beginPath(); g.ellipse(64, 68, 22, 28, 0, 0, Math.PI * 2); g.fillStyle = C.surface; g.fill(); g.stroke();
    g.beginPath(); g.arc(64, 36, 13, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(64, 44); g.lineTo(64, 94); g.stroke();
  } else if (kind === 'conflict') {
    g.font = '800 34px ui-monospace, Consolas, monospace';
    g.textAlign = 'center';
    g.fillText('<<<', 64, 52); g.fillText('>>>', 64, 104);
    g.fillRect(24, 64, 80, 7);
  }
  const texture = track(new THREE.CanvasTexture(c));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function labelTexture(title, sub) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = C.surface; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = C.ink;
  g.font = '800 52px "Mona Sans", "Segoe UI", -apple-system, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(`⑂ ${title}`, 34, 50);
  g.fillStyle = C.muted;
  g.font = '600 30px ui-monospace, Consolas, monospace';
  g.fillText(sub, 38, 100);
  const texture = track(new THREE.CanvasTexture(c));
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = C.floor; g.fillRect(0, 0, 256, 256);
  g.fillStyle = C['floor-dot'];
  for (let x = 16; x < 256; x += 32) for (let y = 16; y < 256; y += 32) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
  const texture = track(new THREE.CanvasTexture(c));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(FIELD.width / 2, FIELD.height / 2);
  return texture;
}

// Mona: a procedural Octocat-inspired figure (same approach as Mona's Merge Maze).
function makeMona() {
  const group = new THREE.Group();
  const ink = mat(isDark() ? C['surface-soft'] : C.ink);
  const face = mat(isDark() ? C.ink : C.surface);
  const rose = mat(C.coral);
  sphere(group, 0, 0.26, 0, 0.22, 0.24, 0.18, ink);
  sphere(group, 0, 0.67, 0, 0.39, 0.32, 0.28, ink);
  sphere(group, 0, 0.59, -0.225, 0.29, 0.2, 0.075, face);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(track(new THREE.ConeGeometry(0.17, 0.34, 3)), ink);
    ear.position.set(side * 0.27, 0.96, -0.015);
    ear.rotation.set(0, Math.PI, side * -0.3);
    ear.castShadow = true;
    group.add(ear);
    sphere(group, side * 0.115, 0.64, -0.296, 0.035, 0.061, 0.018, ink);
    sphere(group, side * 0.11, 0.665, -0.311, 0.011, 0.014, 0.006, face);
    sphere(group, side * 0.21, 0.54, -0.283, 0.04, 0.016, 0.008, rose);
    tube(group, [[side * 0.17, 0.2, 0.03], [side * 0.4, 0.18, 0.14], [side * 0.49, 0.25, 0.05], [side * 0.48, 0.31, -0.03]], 0.06, ink);
    tube(group, [[side * 0.12, 0.13, -0.03], [side * 0.2, 0.055, -0.2], [side * 0.29, 0.07, -0.29]], 0.065, ink);
  }
  sphere(group, 0, 0.56, -0.31, 0.025, 0.018, 0.015, rose);
  tube(group, [[-0.055, 0.512, -0.294], [0, 0.488, -0.302], [0.055, 0.512, -0.294]], 0.008, ink);
  sphere(group, 0, 0.075, 0.21, 0.075, 0.065, 0.19, ink);
  return group;
}

function makeBug() {
  const group = new THREE.Group();
  const shell = mat(C['coral-edge']);
  const ink = mat(C.ink);
  sphere(group, 0, 0.2, 0, 0.26, 0.17, 0.32, shell);
  sphere(group, 0, 0.2, -0.34, 0.14, 0.12, 0.12, ink);
  for (const side of [-1, 1]) {
    for (const z of [-0.14, 0.04, 0.2]) tube(group, [[side * 0.2, 0.16, z], [side * 0.38, 0.12, z + 0.03], [side * 0.44, 0.02, z + 0.06]], 0.025, ink);
    tube(group, [[side * 0.05, 0.28, -0.42], [side * 0.14, 0.42, -0.56]], 0.018, ink);
    sphere(group, side * 0.12, 0.34, 0.05, 0.05, 0.03, 0.05, ink);
  }
  const line = new THREE.Mesh(geo.box, ink);
  line.scale.set(0.02, 0.02, 0.6); line.position.set(0, 0.37, 0.02);
  group.add(line);
  return group;
}

function makeToken(type) {
  const colors = { copilot: C.lavender, dependabot: C.mint, actions: C.coral };
  const face = mat('#ffffff', { map: iconTexture(type, colors[type]) });
  const rim = mat(colors[type]);
  const token = new THREE.Mesh(geo.token, [rim, face, face]);
  token.rotation.x = Math.PI / 2;
  const group = new THREE.Group();
  const holder = new THREE.Group();
  holder.rotation.x = -0.85;
  holder.add(token);
  group.add(holder);
  group.userData.spin = holder;
  token.castShadow = true;
  return group;
}

let brickMats, brickMeshes, monaMesh, paddleGroup, paddleParts, shieldMesh, backLabel;
const pools = { balls: new Map(), items: new Map(), bugs: new Map(), lasers: new Map() };
let sparks = [];

function disposeAll() {
  for (const thing of disposables) thing.dispose?.();
  disposables.clear();
  for (const pool of Object.values(pools)) pool.clear();
  sparks = [];
}

function buildWorld() {
  if (board) scene.remove(board);
  if (dynamic) scene.remove(dynamic);
  disposeAll();
  C = readPalette();
  scene.background = new THREE.Color(C.bg);
  hemi.color.set(isDark() ? '#d9d0ee' : '#fffaf0');
  hemi.groundColor.set(isDark() ? '#2a2633' : '#c9c1b2');
  hemi.intensity = isDark() ? 1.55 : 1.9;
  sun.intensity = isDark() ? 1.5 : 1.9;

  board = new THREE.Group();
  dynamic = new THREE.Group();
  scene.add(board, dynamic);

  const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(FIELD.width, FIELD.height + 1.2)), mat('#ffffff', { map: floorTexture(), roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -0.6 + 0.6);
  floor.receiveShadow = true;
  board.add(floor);
  const base = outlinedBox(FIELD.width + 1.4, 0.5, FIELD.height + 2.2, mat(C['surface-soft']), board);
  base.position.set(0, -0.26, 0.4);

  const rail = mat(C.lavender);
  const railH = 0.6;
  const left = outlinedBox(0.5, railH, FIELD.height + 1.8, rail, board);
  left.position.set(-FIELD.width / 2 - 0.25, railH / 2, 0.3);
  const right = outlinedBox(0.5, railH, FIELD.height + 1.8, rail, board);
  right.position.set(FIELD.width / 2 + 0.25, railH / 2, 0.3);
  const back = outlinedBox(FIELD.width + 1, railH, 0.5, rail, board);
  back.position.set(0, railH / 2, -FIELD.height / 2 - 0.25);

  backLabel = new THREE.Mesh(track(new THREE.PlaneGeometry(7.2, 0.9)), track(new THREE.MeshBasicMaterial({ map: labelTexture(game.info.repo, game.info.branch), toneMapped: false })));
  backLabel.position.set(0, 1.18, -FIELD.height / 2 - 0.45);
  backLabel.rotation.x = -0.35;
  const frame = outlinedBox(7.4, 1.1, 0.1, mat(C.surface), board);
  frame.position.set(0, 1.18, -FIELD.height / 2 - 0.52);
  frame.rotation.x = -0.35;
  board.add(backLabel);

  // Danger line under the paddle.
  const drop = new THREE.Mesh(geo.box, mat(C.coral, { transparent: true, opacity: 0.55 }));
  drop.scale.set(FIELD.width, 0.02, 0.1);
  drop.position.copy(toScene(0, 0.05, 0.02));
  board.add(drop);

  brickMats = {
    commit: [1, 2, 3, 4].map(n => mat(C[`commit-${n}`])),
    conflict: [mat(C.conflict), mat(C.conflict), mat('#ffffff', { map: iconTexture('conflict', C.conflict) }), mat(C.conflict), mat(C.conflict), mat(C.conflict)],
    bug: iconBrick('bug', C.coral),
    copilot: iconBrick('copilot', C.lavender),
    dependabot: iconBrick('dependabot', C.mint),
    actions: iconBrick('actions', C.coral),
  };
  brickMeshes = new Map();
  for (const brick of game.bricks) {
    const mesh = outlinedBox(brick.w, 0.5, brick.d, brickMaterial(brick), board);
    mesh.position.copy(toScene(brick.x, brick.y, 0.25));
    mesh.visible = brick.alive;
    brickMeshes.set(brick.id, mesh);
  }

  paddleGroup = new THREE.Group();
  const paddleMat = mat(C['lavender-edge'], { roughness: 0.45 });
  const capMat = mat(C['lavender-deep'], { roughness: 0.45 });
  const center = new THREE.Mesh(geo.cyl, paddleMat);
  center.rotation.z = Math.PI / 2;
  center.castShadow = true;
  const caps = [-1, 1].map(() => { const cap = new THREE.Mesh(geo.sphere, capMat); cap.scale.setScalar(PADDLE.depth / 2); cap.castShadow = true; return cap; });
  const stripe = new THREE.Mesh(geo.box, mat(C.mint));
  paddleGroup.add(center, ...caps, stripe);
  paddleParts = { center, caps, stripe };
  dynamic.add(paddleGroup);

  monaMesh = new THREE.Group();
  const mona = makeMona();
  mona.rotation.x = 0.5;
  monaMesh.add(mona);
  monaMesh.scale.setScalar(1.15);
  dynamic.add(monaMesh);

  shieldMesh = new THREE.Mesh(geo.box, mat(C.mint, { transparent: true, opacity: 0.8, emissive: C.mint, emissiveIntensity: 0.25 }));
  shieldMesh.scale.set(FIELD.width, 0.14, 0.14);
  shieldMesh.position.copy(toScene(0, SHIELD_Y, 0.1));
  dynamic.add(shieldMesh);

  sun.shadow.needsUpdate = true;
}

function iconBrick(kind, color) {
  const side = mat(color);
  return [side, side, mat('#ffffff', { map: iconTexture(kind, color) }), side, side, side];
}
function brickMaterial(brick) {
  if (brick.kind === 'conflict') return brickMats.conflict;
  if (brick.kind === 'bug') return brickMats.bug;
  if (brick.drop) return brickMats[brick.drop];
  return brickMats.commit[Math.max(0, Math.min(3, brick.hp - 1))];
}

function fitCamera() {
  const width = stage.clientWidth || 1;
  const height = stage.clientHeight || 1;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  const portrait = camera.aspect < 0.95;
  camera.fov = portrait ? 46 : 38;
  const pitch = THREE.MathUtils.degToRad(portrait ? 66 : 56);
  const target = new THREE.Vector3(0, 0, portrait ? 0.4 : 0.9);
  const corners = [];
  for (const x of [-FIELD.width / 2 - 0.5, FIELD.width / 2 + 0.5]) {
    for (const z of [-FIELD.height / 2 - 0.9, FIELD.height / 2 + 0.3]) for (const y of [0, 1.2]) corners.push(new THREE.Vector3(x, y, z));
  }
  const place = (distance) => {
    camera.position.set(0, Math.sin(pitch) * distance, Math.cos(pitch) * distance).add(target);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    return corners.every(c => { const p = c.clone().project(camera); return Math.abs(p.x) <= 0.96 && Math.abs(p.y) <= 0.95 && p.z < 1; });
  };
  let lo = 5, hi = 90;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (place(mid)) hi = mid; else lo = mid; }
  place(hi);
  cameraBase.copy(camera.position);
}
const cameraBase = new THREE.Vector3();
let shake = 0;

// ---------- game + UI ----------
let game;
let dirtyWorld = false;
const announce = (text) => { $('announcer').textContent = text; };

function onEvent(type, data = {}) {
  switch (type) {
    case 'wall': sfx.tone(330, 0.05, 'triangle', 0.08); break;
    case 'paddle': sfx.tone(440, 0.07, 'square', 0.06, 660); break;
    case 'launch': sfx.tone(520, 0.12, 'square', 0.06, 880); break;
    case 'hit': sfx.tone(600, 0.05, 'square', 0.05); refreshBrick(data.brick); break;
    case 'conflict': sfx.tone(160, 0.08, 'sawtooth', 0.05); break;
    case 'brick':
      sfx.tone(760 + data.brick.maxHp * 80, 0.09, 'square', 0.06, 1200);
      refreshBrick(data.brick);
      burst(data.brick);
      break;
    case 'power': sfx.arpeggio([660, 880, 1100], 0.06); announce(`${POWERS[data.type].name}: ${POWERS[data.type].detail}.`); break;
    case 'laser': sfx.tone(1400, 0.04, 'sawtooth', 0.025, 900); break;
    case 'shield': sfx.arpeggio([520, 780], 0.07); announce('Dependabot saved the ball.'); break;
    case 'regression': sfx.tone(220, 0.25, 'sawtooth', 0.06, 110); announce(`Regression! Paddle shortened for ${REGRESSION_SECONDS} seconds.`); break;
    case 'bug-patched': case 'bug-zapped': sfx.tone(900, 0.06, 'triangle', 0.07, 1300); break;
    case 'drop': sfx.tone(300, 0.2, 'triangle', 0.07, 120); break;
    case 'life': if (!reducedMotion) shake = 0.35; if (data.lives > 0) announce(`Ball lost. ${data.lives} ${data.lives === 1 ? 'life' : 'lives'} left.`); break;
    case 'cleared':
      sfx.arpeggio([523, 659, 784, 1047], 0.09);
      saveBest();
      showMessage('PULL REQUEST MERGED', `Merged #${data.level}.`, `“${data.pr}” is in main. Next repository loading…`, null);
      announce(`Level ${data.level} cleared. Pull request merged.`);
      break;
    case 'level':
      dirtyWorld = true;
      music?.setLevel(data.level);
      hideMessage();
      announce(`Level ${data.level}: ${game.info.repo}. Press Space or tap to launch.`);
      break;
    case 'over':
      sfx.arpeggio([392, 330, 262, 196], 0.14);
      saveBest();
      music?.setPlaying(false);
      showMessage('BUILD FAILED', 'Out of lives.', `Final score ${pad(game.score)}. Best ${pad(best)}.`, 'New game');
      break;
    default: break;
  }
}

function refreshBrick(brick) {
  const mesh = brickMeshes?.get(brick.id);
  if (!mesh) return;
  mesh.visible = brick.alive;
  if (brick.alive) mesh.material = brickMaterial(brick);
  sun.shadow.needsUpdate = true;
}

function burst(brick) {
  if (reducedMotion) return;
  const color = brick.kind === 'bug' ? C.coral : brick.drop ? C.lavender : C[`commit-${Math.min(4, brick.maxHp)}`];
  const material = new THREE.MeshBasicMaterial({ color, transparent: true });
  for (let i = 0; i < 10; i++) {
    const mesh = new THREE.Mesh(geo.spark, material);
    mesh.position.copy(toScene(brick.x + (Math.random() - 0.5) * brick.w, brick.y, 0.3));
    const v = new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 3, (Math.random() - 0.5) * 3);
    dynamic.add(mesh);
    sparks.push({ mesh, v, life: 0.6, material });
  }
}

const pad = (n) => String(Math.floor(n)).padStart(5, '0');
function saveBest() {
  if (game.score > best) { best = game.score; store.set(STORAGE.best, String(best)); }
}

function showMessage(kicker, title, detail, action) {
  $('message-kicker').textContent = kicker;
  $('message-title').textContent = title;
  $('message-detail').textContent = detail;
  const button = $('primary');
  button.hidden = !action;
  if (action) button.firstChild.textContent = `${action} `;
  $('message').hidden = false;
}
function hideMessage() { $('message').hidden = true; }

let lastHud = '';
function updateHud() {
  const status = game.status;
  stage.dataset.status = status;
  stage.dataset.level = String(game.level);
  stage.dataset.balls = String(game.balls.length);
  stage.dataset.paddleX = game.paddle.x.toFixed(2);
  stage.dataset.ballY = (game.balls[0]?.y ?? 0).toFixed(2);
  const total = game.breakableCount;
  const remaining = game.remaining;
  const done = total ? Math.round(((total - remaining) / total) * 100) : 0;
  const key = [game.score, best, game.level, game.lives, remaining, status, game.info.repo,
    ...Object.values(game.effects).map(v => Math.ceil(v * 10)), game.shield].join('|');
  if (key === lastHud) return;
  lastHud = key;
  $('score').textContent = pad(game.score);
  $('best').textContent = pad(Math.max(best, game.score));
  $('level').textContent = String(game.level).padStart(2, '0');
  $('lives').textContent = '♥'.repeat(game.lives) || '–';
  $('lives').setAttribute('aria-label', `${game.lives} ${game.lives === 1 ? 'life' : 'lives'}`);
  $('repo-name').textContent = game.info.repo;
  $('branch').textContent = game.info.branch;
  $('remaining').textContent = String(remaining);
  $('progress-fill').style.width = `${done}%`;
  $('percentage').textContent = `${done}%`;
  for (const type of ['copilot', 'dependabot', 'actions', 'regression']) {
    const el = $(`fx-${type}`);
    const active = type === 'dependabot' ? game.shield : game.effects[type] > 0;
    el.dataset.active = String(active);
    el.querySelector('b').textContent = active ? `${game.effects[type].toFixed(1)}s` : '--';
  }
  $('serve-hint').hidden = status !== 'serving';
  $('pause').disabled = !['serving', 'playing', 'paused', 'cleared'].includes(status);
  $('pause').textContent = status === 'paused' ? '▶' : 'Ⅱ';
  $('pause').setAttribute('aria-label', status === 'paused' ? 'Resume game' : 'Pause game');
}

function focusStage() { stage.focus({ preventScroll: true }); }

function startGame() {
  activateAudio();
  if (game.status === 'over' || game.status === 'cleared') {
    newGame();
  }
  if (game.status === 'ready') game.start();
  hideMessage();
  music?.setLevel(game.level);
  music?.setPlaying(true);
  focusStage();
  announce(`Level ${game.level}: ${game.info.repo}. Press Space or tap to launch.`);
}

function newGame() {
  saveBest();
  game.seed = crypto.getRandomValues(new Uint32Array(1))[0];
  game.newGame(1);
  game.start();
  dirtyWorld = true;
  hideMessage();
  music?.setLevel(1);
  music?.setPlaying(true);
}

function launchOrStart() {
  activateAudio();
  const status = game.status;
  if (status === 'ready' || status === 'over') { startGame(); if (status === 'ready') game.launch(); return; }
  if (status === 'paused') { togglePause(); return; }
  if (status === 'serving') game.launch();
}

function togglePause() {
  if (!game.pause()) return;
  if (game.status === 'paused') {
    music?.setPlaying(false);
    showMessage('TAKE A BREATHER', 'Paused.', 'Your commits aren’t going anywhere.', 'Resume');
    announce('Paused.');
  } else {
    music?.setPlaying(true);
    if (game.status === 'cleared') showMessage('PULL REQUEST MERGED', `Merged #${game.level}.`, `“${game.info.pr}” is in main. Next repository loading…`, null);
    else hideMessage();
    announce('Resumed.');
  }
  lastHud = '';
}
function autoPause() {
  if (['serving', 'playing', 'cleared'].includes(game?.status)) togglePause();
}

// ---------- audio ----------
let audio = null, music = null, sfxGain = null;
function activateAudio() {
  if (!audio) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audio = new Ctx();
    sfxGain = audio.createGain();
    sfxGain.gain.value = 0.9;
    sfxGain.connect(audio.destination);
    music = new Chiptune(audio);
    music.setEnabled(audioPrefs.music);
    music.setLevel(game.level);
    audio.addEventListener('statechange', () => music.sync());
  }
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  music.setPlaying(['serving', 'playing', 'cleared'].includes(game.status));
}
const sfx = {
  tone(freq, length, type = 'square', level = 0.06, slideTo = null) {
    if (!audio || !audioPrefs.sfx || audio.state !== 'running') return;
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + length);
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(sfxGain);
    osc.start(t);
    osc.stop(t + length + 0.02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  },
  arpeggio(freqs, gap) {
    freqs.forEach((f, i) => setTimeout(() => sfx.tone(f, gap * 1.6, 'square', 0.05), i * gap * 1000));
  },
};
function syncAudioButtons() {
  $('music').setAttribute('aria-pressed', String(audioPrefs.music));
  $('music').textContent = audioPrefs.music ? 'Music on' : 'Music off';
  $('sound').setAttribute('aria-pressed', String(audioPrefs.sfx));
  $('sound').textContent = audioPrefs.sfx ? 'SFX on' : 'SFX off';
  music?.setEnabled(audioPrefs.music);
  store.set(STORAGE.audio, JSON.stringify(audioPrefs));
}
function toggleAllAudio() {
  const next = !(audioPrefs.music || audioPrefs.sfx);
  audioPrefs = { music: next, sfx: next };
  if (next) activateAudio();
  syncAudioButtons();
  announce(next ? 'Audio on.' : 'Audio muted.');
}

// ---------- input ----------
const held = new Set();
function updateAxis() {
  game.input.axis = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
  if (game.input.axis) game.input.targetX = null;
}
const KEY_DIR = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
document.addEventListener('keydown', (e) => {
  if ($('help-dialog').open || e.ctrlKey || e.metaKey || e.altKey || !game) return;
  const dir = KEY_DIR[e.code] ?? ({ a: 'left', A: 'left', d: 'right', D: 'right' })[e.key];
  if (dir) { e.preventDefault(); held.add(dir); updateAxis(); return; }
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') { e.preventDefault(); return; }
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    if (!e.repeat) launchOrStart();
    return;
  }
  if (e.key === 'Enter' && e.target.tagName !== 'BUTTON' && !e.repeat) { e.preventDefault(); launchOrStart(); return; }
  if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && !e.repeat) { e.preventDefault(); togglePause(); return; }
  if ((e.key === 'm' || e.key === 'M') && !e.repeat) { e.preventDefault(); toggleAllAudio(); }
});
// Buttons activate on Space keyup; keep Space for the game even when a button has focus.
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && !$('help-dialog').open) e.preventDefault();
  const dir = KEY_DIR[e.code] ?? ({ a: 'left', A: 'left', d: 'right', D: 'right' })[e.key];
  if (dir) { held.delete(dir); updateAxis(); }
});
window.addEventListener('blur', () => { held.clear(); if (game) { updateAxis(); autoPause(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
window.addEventListener('pagehide', () => { if (game) saveBest(); music?.setPlaying(false); });

const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.25);
const hit = new THREE.Vector3();
function pointerToX(event) {
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(plane, hit) ? hit.x : null;
}
let press = null;
canvas.addEventListener('pointermove', (e) => {
  if (!game || game.input.axis) return;
  if (e.pointerType !== 'mouse' && !press) return;
  const x = pointerToX(e);
  if (x !== null) game.input.targetX = x;
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) press.moved = true;
});
canvas.addEventListener('pointerdown', (e) => {
  if (!game) return;
  e.preventDefault();
  focusStage();
  activateAudio();
  press = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, id: e.pointerId };
  try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already released */ }
  if (e.pointerType !== 'mouse' && ['serving', 'playing'].includes(game.status)) {
    const x = pointerToX(e);
    if (x !== null) game.input.targetX = x;
  }
});
const endPress = (e) => {
  if (!press || e.pointerId !== press.id) return;
  const tap = !press.moved && performance.now() - press.t < 450;
  press = null;
  if (e.type === 'pointerup' && (tap || e.pointerType === 'mouse')) launchOrStart();
};
canvas.addEventListener('pointerup', endPress);
canvas.addEventListener('pointercancel', endPress);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
stage.addEventListener('wheel', () => {}, { passive: true });

$('primary').addEventListener('click', () => {
  if (game.status === 'paused') { togglePause(); focusStage(); return; }
  startGame();
});
$('new-game').addEventListener('click', () => { newGame(); activateAudio(); focusStage(); });
$('pause').addEventListener('click', () => { togglePause(); focusStage(); });
$('music').addEventListener('click', () => { audioPrefs.music = !audioPrefs.music; if (audioPrefs.music) activateAudio(); syncAudioButtons(); });
$('sound').addEventListener('click', () => { audioPrefs.sfx = !audioPrefs.sfx; if (audioPrefs.sfx) activateAudio(); syncAudioButtons(); });
$('theme').addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  if (!store.set(STORAGE.theme, next)) announce('Theme changed for this visit; browser storage is unavailable.');
  syncThemeButton();
  dirtyWorld = true;
});
function syncThemeButton() {
  $('theme').setAttribute('aria-pressed', String(isDark()));
  $('theme').textContent = isDark() ? 'Light mode' : 'Dark mode';
  // Keep the browser/installed-app title bar in step with the in-game theme.
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.content = isDark() ? '#25232f' : '#f7f4e9';
}
let pausedForHelp = false;
$('help').addEventListener('click', () => {
  pausedForHelp = ['serving', 'playing', 'cleared'].includes(game?.status);
  if (pausedForHelp) togglePause();
  $('help-dialog').showModal();
});
$('close-help').addEventListener('click', () => $('help-dialog').close());
$('got-it').addEventListener('click', () => $('help-dialog').close());
$('help-dialog').addEventListener('close', () => {
  if (pausedForHelp && game.status === 'paused') togglePause();
  pausedForHelp = false;
  focusStage();
});

// ---------- per-frame sync ----------
function syncPool(pool, list, create) {
  const seen = new Set();
  for (const entity of list) {
    seen.add(entity.id);
    let mesh = pool.get(entity.id);
    if (!mesh) { mesh = create(entity); dynamic.add(mesh); pool.set(entity.id, mesh); }
  }
  for (const [id, mesh] of pool) if (!seen.has(id)) { dynamic.remove(mesh); pool.delete(id); }
}

let ballMat, laserMat;
function syncScene(time, dt) {
  if (dirtyWorld) {
    dirtyWorld = false;
    buildWorld();
    ballMat = mat(C.ball, { roughness: 0.3, emissive: C.ball, emissiveIntensity: isDark() ? 0.35 : 0.08 });
    laserMat = mat(C['coral-edge'], { emissive: C.coral, emissiveIntensity: 0.9 });
    lastHud = '';
  }
  const px = game.paddle.x;
  const halfBody = Math.max(0.05, game.paddle.width / 2 - PADDLE.depth / 2);
  const p = toScene(px, PADDLE.y, PADDLE.depth / 2);
  paddleGroup.position.copy(p);
  paddleParts.center.scale.set(PADDLE.depth / 2, halfBody * 2, PADDLE.depth / 2);
  paddleParts.caps[0].position.set(-halfBody, 0, 0);
  paddleParts.caps[1].position.set(halfBody, 0, 0);
  paddleParts.stripe.scale.set(halfBody * 1.4, 0.05, 0.05);
  paddleParts.stripe.position.set(0, PADDLE.depth / 2, 0);

  monaMesh.position.copy(toScene(px, PADDLE.y - 1.1, 0));
  // Mona faces the player and glances toward the ball.
  const target = game.balls.find(b => !b.attached) ?? game.balls[0];
  let yaw = Math.PI;
  if (target) yaw = Math.PI - Math.atan2(target.x - px, Math.max(0.8, target.y - PADDLE.y)) * 0.5;
  monaMesh.rotation.y = reducedMotion ? yaw : THREE.MathUtils.lerp(monaMesh.rotation.y, yaw, 1 - Math.exp(-dt * 10));
  monaMesh.position.y = reducedMotion || game.status !== 'playing' ? 0 : Math.abs(Math.sin(time * 9)) * 0.05;

  shieldMesh.visible = game.shield;
  if (game.shield && !reducedMotion) shieldMesh.material.opacity = 0.6 + Math.sin(time * 6) * 0.2;

  syncPool(pools.balls, game.balls, () => { const m = new THREE.Mesh(geo.ball, ballMat); m.castShadow = true; return m; });
  for (const ball of game.balls) pools.balls.get(ball.id).position.copy(toScene(ball.x, ball.y, BALL.radius + 0.02));

  syncPool(pools.items, game.items, (item) => makeToken(item.type));
  for (const item of game.items) {
    const mesh = pools.items.get(item.id);
    mesh.position.copy(toScene(item.x, item.y, 0.55));
    if (!reducedMotion) mesh.userData.spin.rotation.z = Math.sin(time * 3 + item.id) * 0.45;
  }
  syncPool(pools.bugs, game.bugs, () => makeBug());
  for (const bug of game.bugs) {
    const mesh = pools.bugs.get(bug.id);
    mesh.position.copy(toScene(bug.x, bug.y, 0.05));
    mesh.rotation.y = reducedMotion ? Math.PI : Math.PI + Math.cos(bug.age * 2.6) * 0.5;
  }
  syncPool(pools.lasers, game.lasers, () => new THREE.Mesh(geo.laser, laserMat));
  for (const laser of game.lasers) pools.lasers.get(laser.id).position.copy(toScene(laser.x, laser.y, 0.4));

  sparks = sparks.filter(s => {
    s.life -= dt;
    if (s.life <= 0) { dynamic.remove(s.mesh); return false; }
    s.v.y -= 12 * dt;
    s.mesh.position.addScaledVector(s.v, dt);
    s.material.opacity = Math.min(1, s.life * 2);
    return true;
  });

  if (shake > 0) {
    shake = Math.max(0, shake - dt);
    camera.position.copy(cameraBase).add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
  } else camera.position.copy(cameraBase);
}

let previous = performance.now();
function frame(now) {
  const dt = Math.min((now - previous) / 1000 || 0, 0.1);
  previous = now;
  if (!document.hidden) {
    game.update(dt);
    syncScene(reducedMotion ? 0 : now / 1000, dt);
    updateHud();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

function init() {
  syncThemeButton();
  syncAudioButtons();
  $('best').textContent = pad(best);
  game = new Game({ seed: crypto.getRandomValues(new Uint32Array(1))[0], onEvent });
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    console.warn('WebGL is unavailable.', error);
    const notice = document.createElement('div');
    notice.className = 'error-notice';
    notice.setAttribute('role', 'alert');
    notice.textContent = 'Mona Breaker needs WebGL. Enable hardware acceleration in your browser settings, then reload this page.';
    stage.append(notice);
    stage.dataset.status = 'error';
    $('message').hidden = true;
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  hemi = new THREE.HemisphereLight('#fffaf0', '#c9c1b2', 1.9);
  sun = new THREE.DirectionalLight('#ffffff', 1.9);
  sun.position.set(-6, 16, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 12, bottom: -12, near: 1, far: 50 });
  sun.shadow.bias = -0.0008;
  scene.add(hemi, sun);
  sharedGeometry();
  dirtyWorld = true;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    autoPause();
    announce('The 3D view was interrupted. Reload the page to continue.');
  });
  new ResizeObserver(() => fitCamera()).observe(stage);
  fitCamera();
  $('primary').disabled = false;
  $('new-game').disabled = false;
  stage.dataset.status = game.status;
  requestAnimationFrame(frame);
}
init();
