# Boss Farm RPG

## Overview

Boss Farm RPG is a near-future cyberpunk roguelike where players augment their body with cybernetic implants to battle increasingly difficult bosses. Players start as a Wanderer, die, and unlock classes (Melee/Ranged) through a rebirth system. Combat uses a tactical grid with turn-based mechanics. The core progression loop is: fight bosses → collect cybernetic implants → install augmentations → get stronger → die → rebirth with class selection → repeat.

**Theme:** Near-future cyberpunk with body augmentation
**Core Mechanic:** Roguelike rebirth progression with permanent class unlocks

## Current Rules (Oct 2026)

- **Turn flow:** an action locks input until it resolves. Every delayed step checks a `fightId`, so leaving or finishing a fight cancels anything still pending.
- **Loot:** granted in the store the moment a boss dies (`handleBossDefeated`), not by a screen. Fights 10, 14 and 18 show Victory, then the Arms Market.
- **Arenas:** `lib/combat/grid.ts` builds battlefields (void tiles are impassable and not drawn, and the generator guarantees a path to the boss). It also handles pathfinding for boss movement and player move range.
- **Hazards:** a combatant standing on a hazard at the end of its turn takes its damage. Bosses route around hazards.
- **Heavy attacks:** telegraphed one turn ahead; the orange tiles show where it lands. Stepping out dodges it.
- **Overheat (100 heat):** movement locked. Move-range tree upgrades apply to tile taps.
- **Classes:** start Unclassified. Dying at threat level 11+ unlocks Enforcer/Operative permanently; after that every death lets you pick a profile.
- **Death:** clears implants, credits, weapons, loadout extras and upgrade trees. Keeps reboot count and class unlock.
- **Saving:** combat, inventory, loadout and trees persist to localStorage (`2059-*` keys). Reloading mid-fight returns to base.
- **UI:** screens live in `client/src/components/game/screens/`, shared pieces in `hud.tsx`. Dev builds show a Dev button on the base screen for test tools.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React with TypeScript for UI components
- Vite as the build tool and development server
- TailwindCSS for styling with a custom design system
- Radix UI for accessible component primitives
- Zustand for client-side state management

**State Management:**
- Zustand stores manage game state in isolated domains:
  - `useCombat`: Handles combat phases, character stats, boss encounters, combat actions, and rebirth progression
  - `useInventory`: Manages player inventory, 10 equipped augmentation slots, and credits (gold)
  - `useAudio`: Controls sound effects and background music
- State is organized by feature domain rather than global state, allowing for better code organization and performance

**UI Component Structure:**
- Shadcn/ui component library provides the base design system
- Custom game components built on top:
  - `GameUI`: Main overlay handling all game phases and user interactions
  - `CombatScene`: Canvas-based rendering for combat visualization
  - `ClassSelector`: Character class selection interface
  - `Inventory`: Equipment and item management
  - `TileGrid`: Tactical grid movement system

**Rendering Approach:**
- Canvas-based 2D rendering for combat scenes using pixel art style
- Custom sprite drawing functions in `client/src/lib/rendering/sprites.ts`
- HTML Canvas API for performant character animations and visual effects
- Damage numbers and animations rendered directly on canvas

### Backend Architecture

**Server Framework:**
- Express.js for HTTP server and API routing
- TypeScript throughout the stack for type safety
- Development mode uses Vite middleware for HMR
- Production mode serves static build files

**API Design:**
- RESTful API structure with routes prefixed with `/api`
- Routes registered in `server/routes.ts`
- Currently minimal backend - game logic runs client-side
- Storage interface pattern (`IStorage`) prepared for future database integration

**Session Management:**
- Infrastructure in place for session-based authentication
- Uses `connect-pg-simple` for PostgreSQL session storage
- Not actively implemented in current game version

### Data Storage Solutions

**Database:**
- Drizzle ORM configured for PostgreSQL
- Neon serverless database driver (`@neondatabase/serverless`)
- Schema defined in `shared/schema.ts` with Zod validation
- Current schema includes basic user model (username/password)
- Database migrations managed through Drizzle Kit

**Client-Side Storage:**
- Local storage utilities in `client/src/lib/utils.ts`
- Used for persisting game preferences and progress
- Inventory and game state stored in Zustand (in-memory during session)

**Storage Pattern:**
- `MemStorage` class provides in-memory storage for development
- Interface-based design (`IStorage`) allows swapping implementations
- Prepared for database-backed storage without changing consumer code

### Game Logic Architecture

**Combat System:**
- Turn-based combat with distinct phases: menu, player movement, player turn, enemy turn, victory, defeat
- Character classes have unique stats and special abilities defined in `CLASS_DEFINITIONS`
- Elemental damage system with weaknesses and resistances
- Boss difficulty scales with level progression

**Augmentation System:**
- Cybernetic implants replace traditional weapons/armor
- 10 body slots: brain, ears, eyes, nose, lungs, left_arm, right_arm, left_leg, right_leg, misc
- Five rarity tiers: common, uncommon, rare, epic, legendary
- Each implant provides attack, defense, and/or HP bonuses
- Consumables are healing stims
- Currently uses placeholder items (PLACEHOLDER_[SLOT]_[RARITY])

**Loot System:**
- Item pools defined by rarity with weighted random selection
- Loot drops are cybernetic implants and stims
- Loot calculation scales with boss level

**Movement System:**
- Grid-based tactical positioning (5x3 default grid)
- Players can move one tile in any direction (including diagonals) per turn
- Distance affects combat mechanics and strategy

**Progression System:**
- XP-based leveling system with exponential XP requirements
- XP earned from defeating bosses (scales with boss level)
- Level-up awards skill points for spending in the skill tree
- Character stats (HP, Attack, Defense) modified by skill bonuses

**Skill Tree System:**
- CURRENTLY DISABLED: Skill tree UI is hidden and all bonuses return zero
- Underlying code still exists but is inactive (getTotalSkillBonus returns empty bonuses)
- Note: Skill tree code still exists but is inactive (getTotalSkillBonus returns empty bonuses)

## External Dependencies

### Database
- **Neon PostgreSQL**: Serverless PostgreSQL database
- **Drizzle ORM**: Type-safe ORM with schema validation
- Connection via `DATABASE_URL` environment variable
- Currently schema supports user authentication foundation

### UI Libraries
- **Radix UI**: Comprehensive accessible component primitives (accordion, dialog, dropdown, etc.)
- **Tailwind CSS**: Utility-first CSS framework with custom design tokens
- **Shadcn/ui**: Pre-built component library built on Radix and Tailwind
- **Lucide React**: Icon library for UI elements

### Development Tools
- **Vite**: Fast development server with HMR
- **TypeScript**: Type safety across full stack
- **ESBuild**: Fast JavaScript/TypeScript bundler for production
- **TSX**: TypeScript execution for development scripts

### Graphics and Audio
- **React Three Fiber**: 3D rendering (installed, available for future enhancements)
- **Three.js ecosystem**: @react-three/drei and @react-three/postprocessing for 3D effects
- **GLSL shader support**: Via vite-plugin-glsl for custom visual effects
- HTML5 Audio API for game sounds (background music, hit effects, success sounds)

### State and Data Management
- **Zustand**: Lightweight state management
- **TanStack Query**: Server state management and caching (configured but minimal usage)
- **Zod**: Schema validation for data models
- **date-fns**: Date manipulation utilities

### Session Management
- **connect-pg-simple**: PostgreSQL session store for Express
- **express-session**: Session middleware (infrastructure present)