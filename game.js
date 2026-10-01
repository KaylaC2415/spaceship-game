// =====================================================
// SETTINGS — numbers you can tweak
// (Positions and sizes come from the Figma frame.)
// =====================================================
const GAME_WIDTH = 402;
const GAME_HEIGHT = 874;

const PLAYER_WIDTH = 74;
const PLAYER_START_X = 164;   // Figma "Player" x
const PLAYER_Y = 653;         // Figma "Player" y
const PLAYER_SPEED = 300;     // pixels per second

const BULLET_WIDTH = 4;
const BULLET_HEIGHT = 12;
const BULLET_SPEED = 600;     // pixels per second

const MONSTER_WIDTH = 88;
const MONSTER_HEIGHT = 70;
const MONSTER_SPEED = 80;     // pixels per second
const SECONDS_BETWEEN_MONSTERS = 1.5;

const MONSTER_TYPES = [
  { image: 'assets/monster-green.svg',  hp: 1 },
  { image: 'assets/monster-blue.svg',   hp: 2 },
  { image: 'assets/monster-purple.svg', hp: 3 },
];


// =====================================================
// ELEMENTS from index.html
// =====================================================
const gameEl = document.getElementById('game');
const playerEl = document.getElementById('player');
const timerTextEl = document.getElementById('timer-text');
const gameOverEl = document.getElementById('game-over');
const finalTimeEl = document.getElementById('final-time');
const restartButton = document.getElementById('restart-button');


// =====================================================
// GAME STATE — everything that changes while playing
// =====================================================
let playerX = PLAYER_START_X;
let bullets = [];      // each bullet: { el, x, y, width, height }
let monsters = [];     // each monster: { el, x, y, width, height, hp }
let secondsUntilNextMonster = 0;
let startTime = 0;
let lastFrameTime = 0;
let isRunning = false;

const keys = { left: false, right: false };


// =====================================================
// START / RESTART
// =====================================================
function startGame() {
  // Remove anything left over from the last round
  bullets.forEach(b => b.el.remove());
  monsters.forEach(m => m.el.remove());
  bullets = [];
  monsters = [];

  playerX = PLAYER_START_X;
  secondsUntilNextMonster = 0;
  startTime = performance.now();
  lastFrameTime = startTime;
  isRunning = true;

  timerTextEl.textContent = '0m 0s';
  gameOverEl.hidden = true;
  placeElement(playerEl, playerX, PLAYER_Y);

  requestAnimationFrame(gameLoop);
}


// =====================================================
// GAME LOOP — runs about 60 times per second
// =====================================================
function gameLoop(now) {
  if (!isRunning) return;

  // How many seconds passed since the last frame (e.g. 0.016)
  const dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  movePlayer(dt);
  moveBullets(dt);
  spawnMonsters(dt);
  moveMonsters(dt);
  checkBulletHits();
  updateTimer(now);

  if (monsterPassedPlayer()) {
    endGame(now);
    return;
  }

  requestAnimationFrame(gameLoop);
}


// =====================================================
// PLAYER
// =====================================================
function movePlayer(dt) {
  if (keys.left)  playerX -= PLAYER_SPEED * dt;
  if (keys.right) playerX += PLAYER_SPEED * dt;

  // Keep the spaceship inside the game area
  playerX = Math.max(0, Math.min(playerX, GAME_WIDTH - PLAYER_WIDTH));

  placeElement(playerEl, playerX, PLAYER_Y);
}

function shoot() {
  const el = document.createElement('div');
  el.className = 'bullet';
  gameEl.appendChild(el);

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
    b.y -= BULLET_SPEED * dt;
    placeElement(b.el, b.x, b.y);
  });

  // Remove bullets that flew off the top
  bullets = bullets.filter(b => {
    if (b.y + b.height < 0) {
      b.el.remove();
      return false;
    }
    return true;
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
  el.alt = '';
  gameEl.appendChild(el);

  monsters.push({
    el,
    x: Math.random() * (GAME_WIDTH - MONSTER_WIDTH), // random x at the top
    y: -MONSTER_HEIGHT,                              // start just above the screen
    width: MONSTER_WIDTH,
    height: MONSTER_HEIGHT,
    hp: type.hp,
  });
}

function moveMonsters(dt) {
  monsters.forEach(m => {
    m.y += MONSTER_SPEED * dt;
    placeElement(m.el, m.x, m.y);
  });
}

function checkBulletHits() {
  bullets.forEach(b => {
    monsters.forEach(m => {
      if (!b.used && m.hp > 0 && isTouching(b, m)) {
        b.used = true;  // a bullet can only hit once
        m.hp -= 1;      // each bullet removes 1 HP
      }
    });
  });

  // Remove used bullets
  bullets = bullets.filter(b => {
    if (b.used) {
      b.el.remove();
      return false;
    }
    return true;
  });

  // Remove monsters with 0 HP
  monsters = monsters.filter(m => {
    if (m.hp <= 0) {
      m.el.remove();
      return false;
    }
    return true;
  });
}

// Lose when a monster's top edge moves below the spaceship's y (653)
function monsterPassedPlayer() {
  return monsters.some(m => m.y > PLAYER_Y);
}


// =====================================================
// TIMER & GAME OVER
// =====================================================
function updateTimer(now) {
  timerTextEl.textContent = formatTime(now - startTime);
}

function endGame(now) {
  isRunning = false;
  finalTimeEl.textContent = formatTime(now - startTime);
  gameOverEl.hidden = false;
}

// 75000 milliseconds -> "1m 15s"
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
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
document.addEventListener('keydown', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;

  if (e.code === 'Space') {
    e.preventDefault(); // stop the page from scrolling / pressing buttons
    if (isRunning && !e.repeat) shoot(); // one bullet per press
  }
});

document.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
});

restartButton.addEventListener('click', () => {
  restartButton.blur(); // so Space doesn't "click" Restart again
  startGame();
});

window.addEventListener('resize', fitToScreen);


// Go!
fitToScreen();
startGame();
