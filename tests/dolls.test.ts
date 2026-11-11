import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paintDoll, FRAMES, type DollSpec } from '../client/src/lib/rendering/dolls';
import { FIRMWARE_FRAME, partsOf, foeDoll, allyDoll } from '../client/src/lib/rendering/dollSpecs';
import { FIGURES } from '../client/src/lib/rendering/figures';
import { ITEMS_2059 } from '../client/src/lib/combat/items2059';

const filled = (spec: DollSpec, state: any = 'idle', frame = 0) => paintDoll(spec, state, frame).c.flat().filter(Boolean).length;

test('every body and every character paints, in every pose', () => {
  for (const frame of Object.keys(FRAMES) as (keyof typeof FRAMES)[]) for (const state of ['idle', 'walk', 'attack', 'defend', 'hurt'])
    assert.ok(filled({ frame, team: 'you' }, state, 2) > 100, `${frame} ${state}`);
  for (const id of Object.keys(FIGURES)) assert.ok(filled(foeDoll({ name: id } as any)) > 100, id);
  assert.ok(filled(allyDoll('bale')) > 100);
});

test('every firmware wakes in its own body', () => {
  const frames = Object.values(FIRMWARE_FRAME);
  assert.equal(new Set(frames).size, frames.length);
});

test('fitted implants show on the body, and a rarer one shows more', () => {
  const arm = ITEMS_2059.find(i => i.slot === 'right_arm')!;
  const bare = paintDoll({ frame: 'enforcer', team: 'you' }, 'idle', 0);
  const fitted = paintDoll({ frame: 'enforcer', team: 'you', parts: partsOf([{ ...arm, rarity: 'common' }]) }, 'idle', 0);
  const grand = paintDoll({ frame: 'enforcer', team: 'you', parts: partsOf([{ ...arm, rarity: 'legendary' }], () => 3) }, 'idle', 0);
  assert.notDeepEqual(bare.c, fitted.c);
  assert.notDeepEqual(fitted.c, grand.c);
  assert.ok(grand.glow.length > fitted.glow.length, 'legendary parts glow');
});

test('the King loses his parts from his body as they come off', () => {
  const king = { name: 'Patchwork King' } as any;
  assert.notDeepEqual(paintDoll(foeDoll(king, ['plate', 'hook', 'crown']), 'idle', 0).c, paintDoll(foeDoll(king, ['crown']), 'idle', 0).c);
});
