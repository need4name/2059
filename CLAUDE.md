# 2059

Mobile-first cyberpunk roguelike (React + Vite + Zustand, Express server). See `replit.md` for game rules and architecture.

## Working agreements

- **Commit and push straight to `main`.** No feature branches or pull requests unless asked.
- The owner prefers plain, everyday language in explanations.

## Design preferences

- Soft, rounded UI. Avoid hard square boxes, heavy borders and walls of ALL-CAPS letter-spaced text.
- Don't use Chakra Petch or JetBrains Mono (rejected). Current fonts: Sora for headings, Manrope for everything else.
- Shared UI pieces live in `client/src/components/game/hud.tsx`; screens in `client/src/components/game/screens/`.

## Commands

- `npm run dev` — game on http://localhost:5000
- `npx tsc --noEmit` — typecheck (keep at 0 errors)
- `npm run build` — production build
