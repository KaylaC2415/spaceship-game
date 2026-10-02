// =====================================================
// SETTINGS — numbers you can tweak
// (Positions and sizes come from the Figma frame.)
// =====================================================
const GAME_WIDTH = 402;
const GAME_HEIGHT = 874;

const PLAYER_WIDTH = 101 * 0.8;
const PLAYER_HEIGHT = 102 * 0.8;
const PLAYER_START_X = (GAME_WIDTH - PLAYER_WIDTH) / 2;   // centered at the current size
const PLAYER_Y = 688;         // Figma "Player" y
const PLAYER_SPEED = 300;     // pixels per second

const BULLET_WIDTH = 4;
const BULLET_HEIGHT = 12;
const BULLET_SPEED = 600;     // pixels per second

const MONSTER_SPEED = 80;     // pixels per second
const SECONDS_BETWEEN_MONSTERS = 1.5;

// Stamina is measured in percentage points (0–100).
const STAMINA = {
  costPerShot: 10,
  rechargeSeconds: 5,       // time from empty to full, after the delay
  rechargeDelaySeconds: 0.3,
  green: '#85B700',
  yellow: '#F3D55B',
  red: '#D75A4A',
};

// Silhouette outlines in the original SVG coordinates. Decorative exhaust is excluded.
const PLAYER_OUTLINE = [
  [50, 1], [56, 6], [99, 75], [99, 90], [79, 86],
  [79, 93], [69, 93], [69, 86], [60, 83], [60, 89],
  [40, 89], [40, 83], [31, 85], [31, 93], [21, 93],
  [21, 87], [1, 90], [1, 75], [44, 6],
];
// Three separate pieces preserve the transparent gaps between the meteor trails.
const METEOR_OUTLINES = [
  [[3,19],[6,22],[6,30],[8,35],[12,36],[16,35],[18,30],[18,14],
   [21,11],[24,14],[24,65],[22,71],[17,76],[12,77],[6,75],[1,70],[0,65],[0,22]],
  [[35,5],[39,9],[39,18],[41,23],[46,24],[50,22],[52,18],[52,5],
   [56,1],[60,5],[60,70],[58,77],[52,83],[46,85],[38,83],[32,77],[30,70],[30,9]],
  [[71,8],[76,12],[76,30],[77,33],[79,33],[82,30],[82,20],
   [85,17],[88,20],[88,55],[85,62],[78,65],[71,63],[67,57],[67,12]],
];

// Visual effects only. Distances are game pixels; durations are milliseconds.
const FEEL = {
  recoilPx: 3,
  recoilMs: 110,
  muzzleWidthPx: 9,
  muzzleHeightPx: 13,
  muzzleMs: 65,
  hitBrightness: 8,
  hitKnockbackPx: 3,
  hitMs: 100,
  deathScale: 1.13,
  deathMs: 150,
  shakePx: 2,
  shakeMs: 150,
};

// Everything that falls from the top. One is picked at random each time.
const MONSTER_TYPES = [
  { image: 'assets/monster-green.svg',  hp: 1, width: 88, height: 70 },
  { image: 'assets/monster-blue.svg',   hp: 2, width: 88, height: 70 },
  { image: 'assets/monster-purple.svg', hp: 3, width: 88, height: 70 },
  // Meteor: can't be destroyed. Avoid it — touching it ends the game.
  { image: 'assets/meteor.svg', hp: Infinity, width: 88 * 0.8, height: 85 * 0.8, isMeteor: true },
];


// =====================================================
// ELEMENTS from index.html
// =====================================================
const gameEl = document.getElementById('game');
const playerEl = document.getElementById('player');
const timerTextEl = document.getElementById('timer-text');
const gameOverEl = document.getElementById('game-over');
const finalTimeEl = document.getElementById('final-time');
const pauseOverlayEl = document.getElementById('pause-overlay');
const staminaRingEl = document.getElementById('stamina-ring');


// =====================================================
// GAME STATE — everything that changes while playing
// =====================================================
let stamina = 100;
let rechargeDelayRemaining = 0;
let playerX = PLAYER_START_X;
let bullets = [];      // each bullet: { el, x, y, width, height }
let monsters = [];     // each monster or meteor: { el, x, y, width, height, hp, isMeteor }
let secondsUntilNextMonster = 0;
let elapsedTime = 0;
let isPaused = false;
let isPausedByPlayer = false; // true after pressing P
let frameId = null;
let lastFrameTime = 0;
let isRunning = false;

const keys = new Set();
const activeEffects = new Set();
const effectByElement = new WeakMap();
const transientElements = new Set();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');


// =====================================================
// START / RESTART
// =====================================================
function startGame() {
  clearEffects();
  // Remove anything left over from the last round
  bullets.forEach(b => b.el.remove());
  monsters.forEach(m => m.el.remove());
  bullets = [];
  monsters = [];

  playerX = PLAYER_START_X;
  secondsUntilNextMonster = 0;
  keys.clear();
  elapsedTime = 0;
  lastFrameTime = performance.now();
  isPaused = document.hidden || !document.hasFocus();
  cancelAnimationFrame(frameId);
  isRunning = true;

  timerTextEl.textContent = '0m 0s';
  gameOverEl.hidden = true;
  isPausedByPlayer = false;
  pauseOverlayEl.hidden = true;
  rechargeDelayRemaining = 0;
  setStamina(100);
  playerEl.style.width = PLAYER_WIDTH + 'px';
  playerEl.style.height = PLAYER_HEIGHT + 'px';
  placeElement(playerEl, playerX, PLAYER_Y);

  frameId = requestAnimationFrame(gameLoop);
}


// =====================================================
// GAME LOOP — runs about 60 times per second
// =====================================================
function gameLoop(now) {
  if (!isRunning) return;

  if (isPaused || isPausedByPlayer) {
    frameId = requestAnimationFrame(gameLoop);
    return;
  }

  // How many seconds passed since the last frame (e.g. 0.016)
  const dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  movePlayer(dt);
  moveBullets(dt);
  spawnMonsters(dt);
  moveMonsters(dt);
  let lossAt = checkBulletHits();
  if (lossAt === null && meteorHitPlayer()) lossAt = 1;
  elapsedTime += dt * 1000 * (lossAt ?? 1);
  rechargeStamina(dt * (lossAt ?? 1));
  updateTimer();

  if (lossAt !== null) {
    endGame();
    return;
  }

  frameId = requestAnimationFrame(gameLoop);
}


// =====================================================
// PLAYER
// =====================================================
function movePlayer(dt) {
  if (keys.has('ArrowLeft') || keys.has('KeyA'))  playerX -= PLAYER_SPEED * dt;
  if (keys.has('ArrowRight') || keys.has('KeyD')) playerX += PLAYER_SPEED * dt;

  // Allow movement beyond either horizontal edge to dodge meteors.

  placeElement(playerEl, playerX, PLAYER_Y);
}

function shoot() {
  if (!isRunning || isPaused || isPausedByPlayer || stamina + 1e-9 < STAMINA.costPerShot) return;
  setStamina(stamina - STAMINA.costPerShot);
  rechargeDelayRemaining = STAMINA.rechargeDelaySeconds;
  showShotEffect();
  const el = document.createElement('div');
  el.className = 'bullet';
  gameEl.appendChild(el);

  placeElement(el, playerX + PLAYER_WIDTH / 2 - BULLET_WIDTH / 2, PLAYER_Y);
  bullets.push({
    el,
    x: playerX + PLAYER_WIDTH / 2 - BULLET_WIDTH / 2, // center of the ship
    y: PLAYER_Y,
    width: BULLET_WIDTH,
    height: BULLET_HEIGHT,
  });
}


// =====================================================
// BULLETS
// =====================================================
function moveBullets(dt) {
  bullets.forEach(b => {
    b.previousY = b.y;
    b.y -= BULLET_SPEED * dt;
    placeElement(b.el, b.x, b.y);
  });


}


// =====================================================
// MONSTERS
// =====================================================
function spawnMonsters(dt) {
  secondsUntilNextMonster -= dt;
  if (secondsUntilNextMonster > 0) return;

  secondsUntilNextMonster = SECONDS_BETWEEN_MONSTERS;

  const type = MONSTER_TYPES[Math.floor(Math.random() * MONSTER_TYPES.length)];

  const el = document.createElement('img');
  el.className = 'monster';
  el.src = type.image;
  el.style.width = type.width + 'px';
  el.style.height = type.height + 'px';
  el.alt = '';
  gameEl.appendChild(el);

  monsters.push({
    el,
    x: Math.random() * (GAME_WIDTH - type.width), // random x at the top
    y: -type.height,                              // start just above the screen
    width: type.width,
    height: type.height,
    hp: type.hp,
    isMeteor: type.isMeteor === true,
  });
}

function moveMonsters(dt) {
  monsters.forEach(m => {
    m.previousY = m.y;
    m.y += MONSTER_SPEED * dt;
    placeElement(m.el, m.x, m.y);
  });
}

// Process contacts in travel order, including the instant a monster hits bottom.
function checkBulletHits() {
  const events = [];
  bullets.forEach(b => {
    monsters.forEach(m => {
      if (m.isMeteor) return; // bullets fly through meteors
      if (b.x >= m.x + m.width || b.x + b.width <= m.x) return;
      const distance = b.previousY - (m.previousY + m.height);
      const travel = (b.previousY - b.y) + (m.y - m.previousY);
      const alreadyTouching = distance <= 0 && b.previousY + b.height >= m.previousY;
      const at = alreadyTouching ? 0 : distance / travel;
      if ((alreadyTouching || distance > 0) && at >= 0 && at <= 1) {
        events.push({ at, b, m });
      }
    });
  });
  monsters.forEach(m => {
    if (m.isMeteor) return; // a meteor reaching the bottom is fine
    if (m.y + m.height >= GAME_HEIGHT) {
      const at = Math.max(0, (GAME_HEIGHT - m.height - m.previousY) / (m.y - m.previousY));
      events.push({ at, m });
    }
  });
  // Reaching the bottom takes priority over a hit at exactly the same instant.
  events.sort((a, b) => a.at - b.at || Number(!!a.b) - Number(!!b.b));
  let lossAt = null;
  for (const event of events) {
    if (event.m.hp <= 0) continue;
    if (!event.b) {
      lossAt = event.at;
      break;
    }
    if (!event.b.used) {
      event.b.used = true;
      event.m.hp -= 1;
      if (event.m.hp > 0) showHitEffect(event.m.el);
    }
  }

  // Check the whole travel path before removing offscreen bullets.
  bullets = bullets.filter(b => {
    if (b.used || b.y + b.height < 0) {
      b.el.remove();
      return false;
    }
    return true;
  });
  monsters = monsters.filter(m => {
    if (m.hp <= 0 || m.y > GAME_HEIGHT) { // destroyed, or a meteor that left the screen
      if (m.hp <= 0) showDeathEffect(m.el);
      else m.el.remove();
      return false;
    }
    return true;
  });
  return lossAt;
}

// Broad rectangle check first, then compare actual silhouette outlines.
function meteorHitPlayer() {
  const player = { x: playerX, y: PLAYER_Y, width: PLAYER_WIDTH, height: PLAYER_HEIGHT };
  const shipOutline = worldOutline(PLAYER_OUTLINE, player, 101, 102);
  return monsters.some(m => m.isMeteor && isTouching(m, player) &&
    METEOR_OUTLINES.some(outline => outlinesOverlap(
      shipOutline, worldOutline(outline, m, 88, 85))));
}

function worldOutline(points, object, svgWidth, svgHeight) {
  return points.map(([x, y]) => [
    object.x + x * object.width / svgWidth,
    object.y + y * object.height / svgHeight,
  ]);
}

// Supports concave outlines, so empty corners and gaps stay non-colliding.
function outlinesOverlap(a, b) {
  const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const onSegment = (p, q, r) => Math.abs(cross(p, q, r)) < 1e-8 &&
    r[0] >= Math.min(p[0], q[0]) && r[0] <= Math.max(p[0], q[0]) &&
    r[1] >= Math.min(p[1], q[1]) && r[1] <= Math.max(p[1], q[1]);
  for (let i = 0; i < a.length; i++) {
    const p = a[i], q = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const r = b[j], s = b[(j + 1) % b.length];
      const c1 = cross(p, q, r), c2 = cross(p, q, s);
      const c3 = cross(r, s, p), c4 = cross(r, s, q);
      if ((c1 * c2 < 0 && c3 * c4 < 0) ||
          onSegment(p, q, r) || onSegment(p, q, s) ||
          onSegment(r, s, p) || onSegment(r, s, q)) return true;
    }
  }
  const inside = (point, polygon) => {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [x1, y1] = polygon[i], [x2, y2] = polygon[j];
      if ((y1 > point[1]) !== (y2 > point[1]) &&
          point[0] < (x2 - x1) * (point[1] - y1) / (y2 - y1) + x1) result = !result;
    }
    return result;
  };
  return inside(a[0], b) || inside(b[0], a);
}


// =====================================================
// STAMINA — trim the existing ring; no extra UI
// =====================================================
function setStamina(amount) {
  stamina = Math.max(0, Math.min(100, amount));
  staminaRingEl.style.strokeDashoffset = 100 - stamina;
  staminaRingEl.style.stroke = stamina >= 60 ? STAMINA.green :
    stamina >= 25 ? STAMINA.yellow : STAMINA.red;
}

function rechargeStamina(dt) {
  const rechargeTime = Math.max(0, dt - rechargeDelayRemaining);
  rechargeDelayRemaining = Math.max(0, rechargeDelayRemaining - dt);
  setStamina(stamina + rechargeTime * 100 / STAMINA.rechargeSeconds);
}


// =====================================================
// TIMER & GAME OVER
// =====================================================
function updateTimer() {
  timerTextEl.textContent = formatTime(elapsedTime);
}

function endGame() {
  isRunning = false;
  finalTimeEl.textContent = formatTime(elapsedTime);
  gameOverEl.hidden = false;
  showGameOverEffect();
}

// 75000 milliseconds -> "1m 15s"
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}


// =====================================================
// SHORT VISUAL EFFECTS — never change hitboxes, HP, or movement
// =====================================================
function playEffect(el, keyframes, duration, onFinish) {
  const previous = effectByElement.get(el);
  if (previous) {
    previous.cancel();
    activeEffects.delete(previous);
  }
  const animation = el.animate(keyframes, {
    duration: reducedMotion.matches ? 1 : duration,
    easing: 'ease-out',
  });
  effectByElement.set(el, animation);
  activeEffects.add(animation);
  animation.onfinish = () => {
    activeEffects.delete(animation);
    if (effectByElement.get(el) === animation) effectByElement.delete(el);
    if (onFinish) onFinish();
  };
}

function clearEffects() {
  activeEffects.forEach(animation => animation.cancel());
  activeEffects.clear();
  transientElements.forEach(el => el.remove());
  transientElements.clear();
}

function showShotEffect() {
  playEffect(playerEl, [
    { transform: 'translateY(0)' },
    { transform: `translateY(${FEEL.recoilPx}px)`, offset: 0.25 },
    { transform: 'translateY(0)' },
  ], FEEL.recoilMs);

  const flash = document.createElement('div');
  flash.className = 'muzzle-flash';
  flash.setAttribute('aria-hidden', 'true');
  flash.style.width = FEEL.muzzleWidthPx + 'px';
  flash.style.height = FEEL.muzzleHeightPx + 'px';
  placeElement(flash, playerX + PLAYER_WIDTH / 2 - FEEL.muzzleWidthPx / 2,
    PLAYER_Y - FEEL.muzzleHeightPx / 2);
  gameEl.appendChild(flash);
  transientElements.add(flash);
  playEffect(flash, [
    { opacity: 0.9, transform: 'scale(1)' },
    { opacity: 0, transform: 'scale(0.65)' },
  ], FEEL.muzzleMs, () => {
    flash.remove();
    transientElements.delete(flash);
  });
}

function showHitEffect(el) {
  playEffect(el, [
    { filter: `brightness(${FEEL.hitBrightness})`, transform: 'translateY(0)' },
    { filter: `brightness(${FEEL.hitBrightness})`, transform: `translateY(-${FEEL.hitKnockbackPx}px)`, offset: 0.2 },
    { filter: 'brightness(1)', transform: 'translateY(0)' },
  ], FEEL.hitMs);
}

function showDeathEffect(el) {
  // Removed from the monster array immediately; this image is only an afterimage.
  transientElements.add(el);
  el.style.pointerEvents = 'none';
  playEffect(el, [
    { opacity: 1, filter: `brightness(${FEEL.hitBrightness})`, transform: 'scale(1) translateY(0)' },
    { opacity: 1, filter: 'brightness(1)', transform: `translateY(-${FEEL.hitKnockbackPx}px) scale(${FEEL.deathScale})`, offset: 0.35 },
    { opacity: 0, filter: 'brightness(1)', transform: `translateY(-${FEEL.hitKnockbackPx}px) scale(${FEEL.deathScale})` },
  ], FEEL.deathMs, () => {
    el.remove();
    transientElements.delete(el);
  });
}

function showGameOverEffect() {
  // Individual translate preserves the responsive scale set by fitToScreen().
  const d = FEEL.shakePx;
  playEffect(gameEl, [
    { translate: '0 0' },
    { translate: `${-d}px 0`, offset: 0.2 },
    { translate: `${d}px ${d / 2}px`, offset: 0.4 },
    { translate: `${-d / 2}px 0`, offset: 0.65 },
    { translate: '0 0' },
  ], FEEL.shakeMs);
}


// =====================================================
// HELPERS
// =====================================================

// Move an element to x/y inside the game area
function placeElement(el, x, y) {
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}

// Do two rectangles overlap?
function isTouching(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

// Shrink the game if the browser window is shorter than 874px
function fitToScreen() {
  const scale = Math.min(1, window.innerHeight / GAME_HEIGHT);
  gameEl.style.transform = `scale(${scale})`;
}


// =====================================================
// KEYBOARD & BUTTONS
// =====================================================
const movementKeys = new Set(['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD']);

document.addEventListener('keydown', e => {
  // Game over screen: Space restarts
  if (!isRunning) {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) startGame();
    }
    return;
  }

  // P pauses / resumes
  if (e.code === 'KeyP') {
    if (!e.repeat) togglePause();
    return;
  }

  if (isPaused || isPausedByPlayer) return;
  if (movementKeys.has(e.code)) {
    e.preventDefault();
    keys.add(e.code);
  }
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) shoot(); // one bullet per press
  }
});

document.addEventListener('keyup', e => {
  keys.delete(e.code);
});

function updatePauseState() {
  const shouldPause = document.hidden || !document.hasFocus();
  keys.clear();
  if (shouldPause !== isPaused) {
    isPaused = shouldPause;
    lastFrameTime = performance.now();
  }
}

window.addEventListener('blur', updatePauseState);
window.addEventListener('focus', updatePauseState);
document.addEventListener('visibilitychange', updatePauseState);

// Pause or resume when the player presses P
function togglePause() {
  isPausedByPlayer = !isPausedByPlayer;
  keys.clear();
  lastFrameTime = performance.now(); // don't count paused time
  pauseOverlayEl.hidden = !isPausedByPlayer;
}

window.addEventListener('resize', fitToScreen);


// Go!
fitToScreen();
startGame();
