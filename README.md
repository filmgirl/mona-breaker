# Mona Breaker

A 3D brick breaker starring Mona the Octocat. Bounce commits off the paddle,
break the contribution graph, squash bugs, and merge the pull request.

## Play

Play online at **<https://filmgirl.github.io/mona-breaker/>**, or in the
[Commit Cabinet](https://filmgirl.github.io/arcade/).

It can also be installed as an app: use **Install** in Chrome or Edge's address
bar, or **Share → Add to Home Screen** on iPhone and iPad. The app uses the same
pixel Mona icon as the favicon. It is not offline-capable: there is no service
worker, so it still loads the game from GitHub Pages and needs a connection.

Or run the local preview server with Node.js 22 or newer. There is nothing to
install or build for the game itself:

```sh
npm start
```

Then visit <http://127.0.0.1:4179/>. Use `PORT=4180 npm start` for another port.
The server is loopback-only and serves only the published files. Opening
`index.html` as a `file://` URL does not work because browsers block module
scripts there.

## Controls

| Action | Control |
| --- | --- |
| Move the paddle | Mouse, ← / →, or A / D. On touch screens, drag across the board |
| Launch the ball | Space, click, or tap |
| Pause / resume | P or Escape, or the Ⅱ button. Space also resumes |
| Mute all audio | M |
| Start / new game | Enter or the Start button; New game resets to level 1 |
| Theme, music, effects | Separate buttons in the header |

Space and the arrow keys never scroll the page, even when a button has focus.
The game pauses when its window or tab loses focus, including when you use the
cabinet's toolbar.

## Rules

- Commit bricks use contribution-graph greens. Darker squares need more hits
  (one to four). Breaking a commit scores 25 points per hit point.
- Striped **merge conflicts** are unbreakable and do not count toward merging.
- Break every commit to merge the level's pull request. You get 500 points plus
  100 per remaining life, then the next repository loads.
- You have three lives. Dropping every ball costs a life and clears effects.
- Power-ups fall from marked bricks (and occasionally from ordinary commits):
  - **Copilot**: two extra balls (six at most) and 10 seconds of auto-aim,
    which nudges bounces toward the nearest remaining commit.
  - **Dependabot**: a 15-second shield under the paddle. It saves one dropped
    ball and patches any bug you catch (+100).
  - **Actions**: 8 seconds of automatic twin lasers that break commits and zap
    bugs (+100).
- **Bug bricks** release a bug when broken. Catching one without a shield causes
  a regression: the paddle shrinks for 8 seconds.
- Six repositories (`hello-world`, `octo-paddle`, `dependabot-garden`,
  `merge-conflict`, `actions-runner`, `release-train`) repeat with tougher
  commits and a faster ball.
- Your best score, theme, and audio preferences are stored in this browser's
  local storage when available. There are no accounts, telemetry, or online
  leaderboards.
- With `prefers-reduced-motion`, camera shake, particles, bobbing, and token
  wobble are off. Gameplay speed is unchanged.

## Develop

```sh
npm ci                # Playwright only; the game has no runtime dependencies
npm test              # Node tests for the simulation
npm start
```

The favicon and app icons (`assets/favicon.svg`, `assets/*.png`) are generated
from one 16x16 pixel map in `scripts/icons.mjs`. Edit the map, then run
`npm run icons`; a test fails if the committed icons drift from the map.

`src/engine.js` is a DOM-free simulation, so the rules are unit tested in Node.
Three.js r180 is vendored in `vendor/` exactly as published on npm; there is no
bundler, transpiler, or CDN request.

## Cabinet compatibility

The Playwright suite runs the real [Commit Cabinet](https://github.com/filmgirl/arcade)
at a pinned commit with the staged game on the same origin, like GitHub Pages:

```sh
npm ci
npx playwright install chromium webkit
npm run cabinet:setup
npm run build
npm run test:cabinet
```

`npm run build` only copies the published files into `_site/`. The harness
serves the cabinet at `/arcade/` and `_site/` at `/mona-breaker/`, and rewrites
only the Mona Breaker catalog entry (adding a fixture entry if the pinned
cabinet predates it). Sibling games are replaced with a local stub. It asserts
cabinet files and served game bytes, iframe focus on mouse and keyboard launch,
Space staying in the game without scrolling, a nonblank WebGL board, arrows/A-D,
P/Escape pause, M mute, in-game buttons, help dialog, reload/return/switch
cleanup, reduced motion, and touch tap/drag with no horizontal overflow at
320px and 390px. For manual inspection, run `npm run cabinet:serve` and open
<http://127.0.0.1:4264/arcade/>.

Limitations: this is headless Chromium (desktop and Pixel 7 emulation) and
WebKit (iPhone 13 emulation), not physical devices or Firefox. WebKit drag uses
synthetic touch pointer events. Audio output is not checked audibly.

## Deploy

Pushes to `main` run **Cabinet compatibility**. Only if it passes does the
deploy job publish the tested `_site/` artifact to GitHub Pages and confirm the
published `index.html` digest. Pull requests and forks never deploy. Pages must
use **GitHub Actions** as its source (Settings → Pages).

## Source layout

| File | Purpose |
| --- | --- |
| `index.html`, `style.css` | Interface, themes, and responsive layout |
| `manifest.webmanifest` | Web app manifest for installing the game |
| `src/engine.js` | Physics, bricks, power-ups, bugs, lives, and levels |
| `src/main.js` | Three.js rendering, input, HUD, audio, and storage |
| `src/music.js` | Original synthesized Web Audio chiptune |
| `vendor/` | Three.js r180 module build and its MIT license |
| `scripts/` | Preview server, site staging, icon generator, and cabinet harness |
| `tests/` | Node engine tests and the Playwright cabinet suite |

## Credits

An unofficial fan game, not a GitHub product. Not affiliated with or endorsed
by GitHub.

- Mona is drawn procedurally with Three.js primitives, following
  [Mona's Merge Maze](https://github.com/filmgirl/mona-maze). The pixel Octocat
  favicon and app icons (`assets/favicon.svg`, `assets/*.png`) are drawn for
  this project. The Octocat design
  is copyright GitHub, Inc. and subject to
  [GitHub's artwork terms](https://octodex.github.com/faq/).
- GitHub mark: [Primer Octicons](https://github.com/primer/octicons), under its
  [MIT license](assets/Octicons-LICENSE.txt).
- [Three.js](https://threejs.org/): [MIT license](vendor/three-LICENSE.txt).
- Icons, bricks, bugs, and the soundtrack are original to this project and drawn
  or synthesized at runtime. No external fonts, images, or audio are downloaded.
