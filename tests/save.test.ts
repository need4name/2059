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
