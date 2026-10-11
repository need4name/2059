# 2059

Mobile-first cyberpunk roguelike (React + Vite + Zustand, Express server). See `replit.md` for game rules and architecture.

## Working agreements

- **Commit and push straight to `main`.** No feature branches or pull requests unless asked.
- The owner prefers plain, everyday language in explanations.

## Story

- The game is tied to the owner's universe notes (not in the repo; the repo is public, so don't commit lore digests). The player is a stray signal in grey-market brain chips; death means "host lost" and the signal jumps hosts. Minds can be extracted but never put back, so never write "backed up" or "restored".
- Makers: Helix (defensive, no weapons), Volkov (operator limbs), Tianxia (labour), Kizuna (MIL/neural), Crown (luxury/restorative), CBN (cartel grafts, cost health), IOA (grey firmware), PARSU (materials), Patchwork (salvage).

## Design preferences

- Soft, rounded UI. Avoid hard square boxes, heavy borders and walls of ALL-CAPS letter-spaced text.
- Don't use Chakra Petch or JetBrains Mono (rejected). Current fonts: Sora for headings, Manrope for everything else.
- Shared UI pieces live in `client/src/components/game/hud.tsx`; screens in `client/src/components/game/screens/`.

## Hosting

- Live game: https://need4name.github.io/2059/ (GitHub Pages, served from the `gh-pages` branch).
- `.github/workflows/pages.yml` rebuilds and republishes on every push to `main`. Don't edit `gh-pages` by hand.
- Asset paths must stay relative or use `import.meta.env.BASE_URL`, because the game lives under `/2059/`.

## Commands

- `npm run dev` — game on http://localhost:5000
- `npx tsc --noEmit` — typecheck (keep at 0 errors)
- `npm run build` — production build
- `npm run build:pages` — build for GitHub Pages (base `/2059/`)
