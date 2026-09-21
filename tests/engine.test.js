import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, LEVELS, COLS, FIELD, PADDLE, BALL, SHIELD_Y, buildBricks, levelInfo, ballSpeed, START_LIVES } from '../src/engine.js';

const run = (game, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) game.update(1 / 60); };
const freeBall = (game, props) => {
  game.status = 'playing';
  game.balls = [{ ...game.makeBall(false), ...props }];
  return game.balls[0];
};

test('every level layout is valid and has breakable commits', () => {
  LEVELS.forEach((level, index) => {
    for (const row of level.rows) assert.equal(row.length, COLS, `${level.repo} row width`);
    const bricks = buildBricks(index + 1);
    assert.ok(bricks.some(b => b.kind !== 'conflict'), `${level.repo} has breakable bricks`);
    for (const b of bricks) {
      assert.ok(b.x - b.w / 2 >= -FIELD.width / 2 && b.x + b.w / 2 <= FIELD.width / 2);
      assert.ok(b.y < FIELD.height && b.y > PADDLE.y + 4);
    }
  });
});

test('later cycles rename the repository and toughen commits', () => {
  const again = levelInfo(LEVELS.length + 1);
  assert.equal(again.repo, `${LEVELS[0].repo}-v2`);
  const first = buildBricks(1).filter(b => b.kind === 'commit');
  const second = buildBricks(LEVELS.length + 1).filter(b => b.kind === 'commit');
  assert.ok(second.reduce((s, b) => s + b.hp, 0) > first.reduce((s, b) => s + b.hp, 0));
  assert.ok(ballSpeed(20) <= 13.2);
});

test('ball waits on the paddle until launch, then travels upward', () => {
  const game = new Game({ seed: 3 });
  assert.equal(game.status, 'ready');
  run(game, 0.5);
  assert.equal(game.balls[0].attached, true);
  assert.equal(game.launch(), true);
  assert.equal(game.status, 'playing');
  const y = game.balls[0].y;
  run(game, 0.2);
  assert.ok(game.balls[0].y > y);
});

test('keyboard axis and pointer target move the paddle within the walls', () => {
  const game = new Game();
  game.start();
  game.input.axis = 1;
  run(game, 3);
  assert.equal(game.paddle.x, FIELD.width / 2 - PADDLE.width / 2);
  game.input.axis = 0;
  game.input.targetX = -2;
  run(game, 1);
  assert.ok(Math.abs(game.paddle.x + 2) < 1e-6);
  assert.ok(Math.abs(game.balls[0].x - (game.paddle.x + game.balls[0].offset)) < 1e-6);
});

test('paddle bounce angle follows where the ball lands', () => {
  const game = new Game();
  const ball = freeBall(game, { x: game.paddle.x + 1.2, y: PADDLE.y + 0.6, vx: 0, vy: -8 });
  run(game, 0.1);
  assert.ok(ball.vy > 0 && ball.vx > 0, 'right edge sends the ball right');
});

test('walls reflect the ball', () => {
  const game = new Game();
  const ball = freeBall(game, { x: FIELD.width / 2 - 0.3, y: 6, vx: 8, vy: 4 });
  game.update(0.05);
  assert.ok(ball.vx < 0);
});

test('breaking commits scores and clearing a level advances with a bonus', () => {
  const events = [];
  const game = new Game({ onEvent: (type) => events.push(type) });
  for (const brick of game.bricks) if (brick.kind !== 'conflict') { brick.alive = false; }
  const target = game.bricks.find(b => b.kind === 'commit');
  target.alive = true; target.hp = 1;
  freeBall(game, { x: target.x, y: target.y - 1, vx: 0, vy: 9 });
  run(game, 0.3);
  assert.equal(target.alive, false);
  assert.equal(game.status, 'cleared');
  assert.ok(game.score >= 25 + 500);
  run(game, 3);
  assert.equal(game.level, 2);
  assert.equal(game.status, 'serving');
  assert.ok(events.includes('cleared') && events.includes('level'));
});

test('multi-hit commits and conflicts', () => {
  const game = new Game({ level: 4 });
  const conflict = game.bricks.find(b => b.kind === 'conflict');
  game.hitBrick(conflict);
  assert.equal(conflict.alive, true);
  const tough = game.bricks.find(b => b.maxHp === 4);
  game.hitBrick(tough);
  assert.equal(tough.alive, true);
  assert.equal(tough.hp, 3);
});

test('losing every ball costs a life and ends the run at zero', () => {
  const game = new Game();
  freeBall(game, { x: 0, y: 0.2, vx: 0, vy: -9 });
  game.paddle.x = 5;
  run(game, 0.5);
  assert.equal(game.lives, START_LIVES - 1);
  assert.equal(game.status, 'serving');
  assert.equal(game.balls[0].attached, true);
  game.lives = 1;
  freeBall(game, { x: 0, y: 0.2, vx: 0, vy: -9 });
  game.paddle.x = 5;
  run(game, 0.5);
  assert.equal(game.status, 'over');
});

test('Dependabot shield saves one fall', () => {
  const game = new Game();
  game.applyPower('dependabot');
  assert.equal(game.shield, true);
  const ball = freeBall(game, { x: -5, y: SHIELD_Y + 0.6, vx: 0, vy: -9 });
  game.paddle.x = 5;
  run(game, 0.2);
  assert.ok(ball.vy > 0);
  assert.equal(game.shield, false);
  assert.equal(game.lives, START_LIVES);
});

test('Copilot splits balls and nudges aim', () => {
  const game = new Game();
  freeBall(game, { x: 0, y: 6, vx: 2, vy: 7 });
  game.applyPower('copilot');
  assert.equal(game.balls.length, 3);
  for (const b of game.balls) assert.ok(b.vy > 0);
  assert.ok(game.effects.copilot > 0);
  for (let i = 0; i < 5; i++) game.applyPower('copilot');
  assert.ok(game.balls.length <= BALL.maxBalls);
});

test('Actions lasers fire while active and damage bricks', () => {
  const game = new Game();
  game.status = 'playing';
  game.balls = [{ ...game.makeBall(false), x: -6, y: 17, vx: 0, vy: 0.1 }];
  game.applyPower('actions');
  const before = game.bricks.reduce((s, b) => s + (b.alive ? b.hp : 0), 0);
  run(game, 1.5);
  const after = game.bricks.reduce((s, b) => s + (b.alive ? b.hp : 0), 0);
  assert.ok(after < before);
});

test('bugs shrink the paddle unless the shield patches them', () => {
  const game = new Game();
  game.status = 'playing';
  game.balls = [{ ...game.makeBall(false), x: -6, y: 15, vx: 0, vy: 0.1 }];
  game.bugs.push({ id: 99, x: game.paddle.x, baseX: game.paddle.x, y: PADDLE.y + 0.3, age: 0 });
  run(game, 0.2);
  assert.ok(game.effects.regression > 0);
  run(game, 1);
  assert.ok(game.paddle.width < PADDLE.width);
  game.effects.regression = 0;
  game.applyPower('dependabot');
  const score = game.score;
  game.bugs.push({ id: 100, x: game.paddle.x, baseX: game.paddle.x, y: PADDLE.y + 0.3, age: 0 });
  run(game, 0.2);
  assert.equal(game.effects.regression, 0);
  assert.ok(game.score >= score + 100);
});

test('pause freezes the simulation and resumes the previous state', () => {
  const game = new Game();
  game.launch();
  assert.equal(game.pause(), true);
  assert.equal(game.status, 'paused');
  const y = game.balls[0].y;
  run(game, 1);
  assert.equal(game.balls[0].y, y);
  game.pause();
  assert.equal(game.status, 'playing');
});

test('ball never settles into a horizontal loop', () => {
  const game = new Game();
  const ball = freeBall(game, { x: 0, y: 6, vx: 10, vy: 0.01 });
  game.update(1 / 60);
  assert.ok(Math.abs(ball.vy) > 1);
});

test('long seeded autoplay stays inside the board and progresses', () => {
  const game = new Game({ seed: 42 });
  game.launch();
  for (let i = 0; i < 60 * 180; i++) {
    const lowest = game.balls.filter(b => !b.attached).sort((a, b) => a.y - b.y)[0];
    game.input.targetX = lowest ? lowest.x : 0;
    if (game.status === 'serving') game.launch();
    game.update(1 / 60);
    for (const b of game.balls) {
      assert.ok(Math.abs(b.x) <= FIELD.width / 2 + 1e-6);
      assert.ok(b.y <= FIELD.height + 1e-6);
      assert.ok(Number.isFinite(b.vx) && Number.isFinite(b.vy));
    }
    if (game.status === 'over') break;
  }
  assert.ok(game.level > 1 || game.remaining < game.breakableCount, 'made progress');
});
