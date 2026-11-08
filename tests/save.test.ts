import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readSave, saveStorage, exportSave, importSave, resetSaveCache, SAVE_KEY, SAVE_VERSION } from '../client/src/lib/save';

const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
};

beforeEach(() => { mem.clear(); resetSaveCache(); });

test('an old six-key save moves into the single save file', () => {
  mem.set('2059-combat', '{"state":{"bossLevel":7},"version":1}');
  mem.set('2059-inventory', '{"state":{"gold":250},"version":1}');
  const save = readSave();
  assert.equal(save.parts['2059-combat'], '{"state":{"bossLevel":7},"version":1}');
  assert.ok(mem.has(SAVE_KEY));
  assert.equal(mem.has('2059-combat'), false, 'old keys are cleared');
});

test('stores read back what they wrote', () => {
  saveStorage.setItem('2059-loadout', '{"state":{"slots":[]},"version":1}');
  resetSaveCache();
  assert.equal(saveStorage.getItem('2059-loadout'), '{"state":{"slots":[]},"version":1}');
});

test('export then import gives back the same save', () => {
  saveStorage.setItem('2059-combat', '{"state":{"bossLevel":12,"note":"ünïcode ✓"},"version":1}');
  const text = exportSave();
  assert.ok(text.startsWith('2059SAVE:'));
  mem.clear(); resetSaveCache();
  assert.deepEqual(importSave(text), { ok: true });
  resetSaveCache();
  assert.equal(saveStorage.getItem('2059-combat'), '{"state":{"bossLevel":12,"note":"ünïcode ✓"},"version":1}');
});

test('bad or future saves are refused with a reason, and nothing is written', () => {
  for (const bad of ['hello', '2059SAVE:!!!notbase64', '2059SAVE:' + btoa('{"game":"other"}')]) {
    const r = importSave(bad);
    assert.equal(r.ok, false);
  }
  const future = '2059SAVE:' + btoa(JSON.stringify({ game: '2059', version: SAVE_VERSION + 1, savedAt: '', parts: {} }));
  const r = importSave(future);
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /newer version/);
  assert.equal(mem.has(SAVE_KEY), false);
});

test('a version 1 save upgrades: allies unlocked by level count as met', () => {
  mem.set(SAVE_KEY, JSON.stringify({ game: '2059', version: 1, savedAt: '', parts: { '2059-allies': '{"state":{"bestCleared":16,"levels":{},"party":["bale"]},"version":1}' } }));
  const save = readSave();
  assert.equal(save.version, SAVE_VERSION);
  const part = JSON.parse(save.parts['2059-allies']);
  assert.deepEqual(part.state.met, ['bale', 'matron']);
  assert.equal(part.state.bestCleared, undefined);
  assert.deepEqual(part.state.party, ['bale']);
  assert.deepEqual(part.state.gear, {}, 'version 3 adds empty ally gear');
  assert.equal(part.version, 3);
});

test('a version 3 save upgrades: its map is in chapter one', () => {
  mem.set(SAVE_KEY, JSON.stringify({ game: '2059', version: 3, savedAt: '', parts: { '2059-map': '{"state":{"room":"deck","cameFrom":null,"cleared":[],"visited":["dock","deck"],"goals":[],"looked":[],"taken":[]},"version":1}' } }));
  const save = readSave();
  assert.equal(save.version, SAVE_VERSION);
  const part = JSON.parse(save.parts['2059-map']);
  assert.equal(part.state.chapter, 'indian-ocean');
  assert.equal(part.state.room, 'deck');
  assert.equal(part.version, 2);
});

test('a save from before hints were removed loses the hints part and keeps the rest', () => {
  mem.set(SAVE_KEY, JSON.stringify({ game: '2059', version: 14, savedAt: '', parts: { '2059-tutorial': '{"state":{"enabled":true}}', '2059-combat': '{"state":{"bossLevel":3},"version":1}' } }));
  const save = readSave();
  assert.equal(save.version, SAVE_VERSION);
  assert.equal(save.parts['2059-tutorial'], undefined);
  assert.ok(save.parts['2059-combat']);
});

test('a save from before part-built guns sells the old guns back', () => {
  const inv = { state: { gold: 50, ownedWeapons: [{ id: 'vk_w_pistol_t1', price: 180 }], equippedWeapon: { id: 'vk_w_pistol_t1', price: 180 } }, version: 1 };
  mem.set(SAVE_KEY, JSON.stringify({ game: '2059', version: 15, savedAt: '', parts: { '2059-inventory': JSON.stringify(inv) } }));
  const st = JSON.parse(readSave().parts['2059-inventory']).state;
  assert.equal(st.gold, 230);
  assert.deepEqual(st.ownedWeapons, []);
  assert.equal(st.equippedWeapon, null);
});

test('a save from before chapter one ended at the King: hosts past him come back, and a beaten King finishes the chapter', () => {
  const map = (st: object) => ({ game: '2059', version: 16, savedAt: '', parts: { '2059-map': JSON.stringify({ state: st, version: 2 }) } });
  mem.set(SAVE_KEY, JSON.stringify(map({ chapter: 'indian-ocean', room: 'foundry', cameFrom: 'smelt', cleared: ['deck', 'port'], visited: ['dock', 'deck', 'port'], goals: ['slab', 'mother'], beaten: ['throne', 'foundry'], lit: ['throne'], corpse: { room: 'reef', item: { id: 'x' } } })));
  const st = JSON.parse(readSave().parts['2059-map']).state;
  assert.equal(st.room, 'weigh', 'it wakes at the server the first boss leaves');
  assert.deepEqual([st.cleared, st.visited, st.goals], [['deck'], ['dock', 'deck'], ['slab']]);
  assert.equal(st.done, true);
  assert.deepEqual([st.beaten, st.lit], [['weigh'], ['weigh']]);
  assert.equal(st.corpse.room, 'dock');
  // Another chapter's map is left alone
  resetSaveCache();
  mem.set(SAVE_KEY, JSON.stringify(map({ chapter: 'deltas', room: 'landing', cleared: ['x'] })));
  assert.deepEqual(JSON.parse(readSave().parts['2059-map']).state.cleared, ['x']);
});

test('a save from before guns stopped growing gives back the points spent on a gun, and forgets what was looked at', () => {
  const inv = { state: { ownedWeapons: [{ id: 'g1', gunParts: { barrel: 'stock', round: 'slug', mods: [] } }], equippedWeapon: null }, version: 1 };
  const trees = { state: { owned: { g1: ['a', 'b'], arm1: ['c'] }, availablePoints: 1, wins: 0 }, version: 0 };
  const map = { state: { chapter: 'deltas', room: 'landing', looked: ['x'], cleared: [] }, version: 2 };
  mem.set(SAVE_KEY, JSON.stringify({ game: '2059', version: 17, savedAt: '', parts: { '2059-inventory': JSON.stringify(inv), '2059-trees': JSON.stringify(trees), '2059-map': JSON.stringify(map) } }));
  const save = readSave();
  const t = JSON.parse(save.parts['2059-trees']).state;
  assert.deepEqual(Object.keys(t.owned), ['arm1']);
  assert.ok(t.availablePoints >= 3, 'two steps of a gun tree come back');
  assert.equal(JSON.parse(save.parts['2059-map']).state.looked, undefined);
});
