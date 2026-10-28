# 2059

Mobile-first cyberpunk roguelike (React + Vite + Zustand, Express server). `docs/DESIGN.md` is the design bible: every game rule and number, kept in step with the code. `replit.md` covers architecture.

## Working agreements

- **Commit and push straight to `main`.** No feature branches or pull requests unless asked.
- The owner prefers plain, everyday language in explanations.

## Story

- The game is tied to the owner's universe notes (not in the repo; the repo is public, so don't commit lore digests). The player is a stray signal in grey-market brain chips; death means "host lost" and the signal jumps hosts. Minds can be extracted but never put back, so never write "backed up" or "restored".
- A host death restarts the chapter at its entry room, as another corpse reanimating.
- Tell it like Dark Souls: never explain the world. No narrator, no faction intros, no glossary. The world only shows in what's lying around (implant descriptions, room text, enemy lines, journal fragments). The story is the signal finding out what it is; each chapter asks it one question about itself. The owner's notes are the hidden truth: everything shown must agree with them, and most of it is never said.
- Room text: about two sentences per room to start; tweak as we go. Chapter goals are placeholders until the story is written.
- Makers: Helix (defensive, no weapons), Volkov (operator limbs), Tianxia (labour), Kizuna (MIL/neural), Crown (luxury/restorative), CBN (cartel grafts, cost health), IOA (grey firmware), PARSU (materials), Patchwork (salvage).

## Design preferences

- Soft, rounded UI. Avoid hard square boxes, heavy borders and walls of ALL-CAPS letter-spaced text.
- Don't use Chakra Petch or JetBrains Mono (rejected). Current fonts: Sora for headings, Manrope for everything else.
- Fight rules live in `client/src/lib/engine/fight.ts` as pure functions (state in, state + events out). The combat store only handles timing, sound and inventory. Put new rules in the engine and test them in `tests/fight.test.ts`.
- Art is pixel art, always (board, tiles, hazards, models). Chapter one's rafts are lashed-together plastic, not wood.
- On the board, visual variety must carry information. The floor stays plain; only things that matter to play (units, cover, hazards, reach, telegraphs) stand out.
- Shared UI pieces live in `client/src/components/game/hud.tsx`; screens in `client/src/components/game/screens/`.

## Content

- Items, weapons and enemies live in `client/src/content/*.json`, not in code. Add or change content there; `npm run check:content` rejects bad entries. Item order matters for seeded runs, so add new entries at the end.

## Saves

- Every persisted store writes into one versioned save (`client/src/lib/save.ts`, key `2059-save`) through `saveStorage`. A new persisted store must use `storage: createJSONStorage(() => saveStorage)` and be added to `SAVE_PARTS`. When a save's shape changes, bump `SAVE_VERSION` and add a step to `MIGRATIONS`.

## Randomness

- Anything that affects play uses `random()` from `client/src/lib/engine/rng.ts`, never `Math.random()`. Each run has a seed and each fight is seeded from it, so runs can be replayed. Ids and visual effects may use `Math.random()`.

## Hosting

- Live game: https://need4name.github.io/2059/ (GitHub Pages, served from the `gh-pages` branch).
- `.github/workflows/pages.yml` rebuilds and republishes on every push to `main`. Don't edit `gh-pages` by hand.
- Asset paths must stay relative or use `import.meta.env.BASE_URL`, because the game lives under `/2059/`.
- Offline play: `client/public/sw.js` caches the game after the first visit (production builds only). Bump its `CACHE` name if its caching rules change. Fonts are bundled from `@fontsource`, not loaded from Google.

## Commands

- `npm run dev` — game on http://localhost:5000
- `npx tsc --noEmit` — typecheck (keep at 0 errors)
- `npm test` — rule tests (Node's built-in runner, files in `tests/`)
- `npm run sim` — balance simulator report (seeded, same result every run); `npm run sim -- --check` fails if a number leaves its range
- `npm run check:content` — checks the content files (shapes, allowed values, ids, cross-references)
- `npm run verify` — typecheck + content check + tests + simulator check; the publish workflow runs this before deploying
- `npm run build` — production build
- `npm run build:pages` — build for GitHub Pages (base `/2059/`)
