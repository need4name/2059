// Checks every content file before it can ship: shapes, allowed values, unique
// ids and cross-references. `npm run check:content` prints problems and fails;
// tests/content.test.ts runs the same check.
import { z } from 'zod';
import items from '../client/src/content/items.json';
import weapons from '../client/src/content/weapons.json';
import enemies from '../client/src/content/enemies.json';
import { MAKER_INFO } from '../client/src/lib/combat/augments';

const slot = z.enum(['brain', 'ears', 'eyes', 'nose', 'lungs', 'left_arm', 'right_arm', 'left_leg', 'right_leg', 'misc']);
const rarity = z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']);
const pattern = z.enum(['melee', 'melee_long', 'diagonal_cross', 'cone', 'aoe', 'ranged', 'sweep_arc', 'lunge', 'knockback', 'charge']);
const stat = z.number().int().min(-50).max(120).optional();
const text = z.string().trim().min(1);

const action = z.object({
  type: z.enum(['attack', 'defend', 'brace', 'special']),
  name: text,
  description: z.string(),
  damage: z.number().min(0).max(200).optional(),
  healing: z.number().min(0).optional(),
  defenseBoost: z.number().min(0).max(60).optional(),
  heatGenerated: z.number().min(-60).max(60).optional(),
  heatTransfer: z.number().min(-40).max(40).optional(),
  isHeavy: z.boolean().optional(),
  accuracy: z.enum(['precise', 'variable', 'unreliable']).optional(),
  rangeOptimal: z.enum(['close', 'mid', 'far']).optional(),
  physicalRatio: z.number().min(0).max(1).optional(),
  bypassStructuralDefense: z.boolean().optional(),
  attackPattern: pattern.optional(),
  ignoreRange: z.boolean().optional(),
}).strict().refine(a => a.type !== 'attack' || (a.damage ?? 0) > 0, 'an attack needs damage');

const item = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/, 'ids are lower-case letters, digits and _'),
  name: text,
  description: text,
  rarity,
  type: z.enum(['augmentation', 'consumable']),
  slot: slot.optional(),
  attackBonus: stat, defenseBonus: stat, hpBonus: stat, evasionBonus: stat,
  structuralAttackBonus: stat, structuralDefenseBonus: stat,
  passiveEffect: z.enum(['kizuna_coldstart', 'bypass_sdef']).optional(),
  consumableEffect: z.enum(['bio_stim', 'structural_patch', 'heat_flush', 'overclock']).optional(),
  condition: z.enum(['pristine', 'worn', 'degraded', 'corroded']).optional(),
  icon: text,
}).strict();

const weapon = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: text, description: text,
  manufacturer: z.enum(['volkov', 'tianxia', 'cbn', 'ioa']),
  weaponType: z.enum(['pistol', 'revolver', 'shotgun']),
  tier: z.union([z.literal(1), z.literal(2)]),
  upgradeOfId: z.string().optional(),
  price: z.number().int().positive(), sellPrice: z.number().int().positive(), upgradePrice: z.number().int().positive().optional(),
  icon: text,
  combatAction: action,
}).strict();

const enemy = z.object({
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  baseAttack: z.number().int().min(1).max(40), baseDefense: z.number().int().min(0).max(30),
  startingHeat: z.number().int().min(0).max(100),
  statSplit: z.object({ pAtkR: z.number(), sAtkR: z.number(), pDefR: z.number(), sDefR: z.number() }).strict()
    .refine(s => Math.abs(s.pAtkR + s.sAtkR - 1) < 0.01 && Math.abs(s.pDefR + s.sDefR - 1) < 0.01, 'stat splits must add up to 1'),
  dossier: text,
  moves: z.array(action).min(2),
}).strict();

const enemyFile = z.object({
  rotation: z.array(text).min(1),
  specials: z.array(text),
  enemies: z.record(enemy),
  patchworkKing: z.object({ color: z.string(), dossier: text, phases: z.array(z.array(action).min(1)).length(3), monologue: z.array(text).min(4) }).strict(),
}).strict();

export function checkContent(): string[] {
  const problems: string[] = [];
  const report = (where: string, r: z.SafeParseReturnType<unknown, unknown>) => {
    if (!r.success) for (const i of r.error.issues) problems.push(`${where} ${i.path.join('.')}: ${i.message}`);
  };

  // Items
  const ids = new Set<string>();
  (items as unknown[]).forEach((raw, n) => {
    const r = item.safeParse(raw); const id = (raw as { id?: string }).id ?? `#${n}`;
    report(`items.json ${id}`, r);
    if (!r.success) return;
    const it = r.data;
    if (ids.has(it.id)) problems.push(`items.json ${it.id}: duplicate id`);
    ids.add(it.id);
    if (it.type === 'augmentation') {
      if (!it.slot) problems.push(`items.json ${it.id}: implants need a slot`);
      const maker = it.name.match(/^\[([A-Z]+)\]/)?.[1];
      if (!maker || !(maker in MAKER_INFO)) problems.push(`items.json ${it.id}: name must start with a known [MAKER]`);
    } else if (!it.consumableEffect && !it.hpBonus) problems.push(`items.json ${it.id}: a consumable needs an effect`);
  });

  // Weapons
  const wids = new Set((weapons as { id: string }[]).map(w => w.id));
  (weapons as unknown[]).forEach(raw => {
    const r = weapon.safeParse(raw); const id = (raw as { id?: string }).id ?? '?';
    report(`weapons.json ${id}`, r);
    if (r.success && r.data.tier === 2 && !wids.has(r.data.id.replace(/_mk2$|_t2$/, '_t1')) && !(r.data.upgradeOfId && wids.has(r.data.upgradeOfId))) {
      problems.push(`weapons.json ${id}: tier 2 weapon has no tier 1 to upgrade from`);
    }
    if (r.success && r.data.sellPrice >= r.data.price) problems.push(`weapons.json ${id}: sells for more than it costs`);
  });

  // Enemies
  const er = enemyFile.safeParse(enemies);
  report('enemies.json', er);
  if (er.success) {
    for (const n of [...er.data.rotation, ...er.data.specials]) if (!er.data.enemies[n]) problems.push(`enemies.json: "${n}" is listed but not defined`);
    for (const [n, e] of Object.entries(er.data.enemies)) {
      if (e.moves.filter(m => m.isHeavy).length > 1) problems.push(`enemies.json ${n}: keep to one heavy attack`);
      if (!e.moves.some(m => m.type === 'attack' && !m.isHeavy)) problems.push(`enemies.json ${n}: needs a normal attack`);
    }
  }
  return problems;
}

if (process.argv[1]?.endsWith('check-content.ts')) {
  const problems = checkContent();
  if (problems.length) { console.error(problems.map(p => `  - ${p}`).join('\n')); console.error(`${problems.length} content problem(s)`); process.exit(1); }
  console.log(`Content OK: ${(items as unknown[]).length} items, ${(weapons as unknown[]).length} weapons, ${Object.keys(enemies.enemies).length} enemies + the Patchwork King`);
}
