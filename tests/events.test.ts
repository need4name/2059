import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../client/src/lib/engine/map';
import * as E from '../client/src/lib/engine/events';

const at = (room: string) => ({ ...M.newMapState('indian-ocean'), room });

test('an event waits only once its room is won, and once per host', () => {
  let s = at('shacks');
  assert.equal(E.eventHere(s), null, 'not while the fight waits');
  s = M.clearRoom(s);
  assert.equal(E.eventHere(s), E.EVENTS.dice);
  s = E.spendEvent(s);
  assert.equal(E.eventHere(s), null, 'used up for this host');
  s = M.newHost(s);
  s = M.clearRoom({ ...s, room: 'shacks' });
  assert.equal(E.eventHere(s), E.EVENTS.dice, 'a new host finds it waiting again');
});

test('the scar lasts the host, not the signal', () => {
  let s = E.scar(at('hull'), 10);
  s = E.scar(s, 6);
  assert.equal(s.scar, 16);
  assert.equal(M.newHost(s).scar, 0);
});

test('giving a part takes the weakest one carried, worn ones only if nothing is carried', () => {
  const part = (id: string, attackBonus: number) => ({ id, name: id, type: 'augmentation', rarity: 'common', attackBonus }) as any;
  const power = (i: any) => i.attackBonus;
  assert.equal(E.partToGive([part('a', 5), part('b', 2)], [part('w', 1)], power)?.id, 'b');
  assert.equal(E.partToGive([], [part('w', 9), part('v', 3)], power)?.id, 'v');
  assert.equal(E.partToGive([{ id: 's', type: 'consumable' } as any], [], power), null, 'stims are not parts');
  assert.equal(E.partToGive([{ ...part('sig', 1), signature: true }], [], power), null, 'signature parts are not given away');
});

test('a choice you cannot pay for says why', () => {
  assert.equal(E.cantChoose(E.EVENTS.dice.choices[0], 10, true), 'Not enough credits');
  assert.equal(E.cantChoose(E.EVENTS.dice.choices[0], 30, true), null);
  assert.equal(E.cantChoose(E.EVENTS.swap.choices[0], 0, false), 'Nothing to give');
  assert.equal(E.gradeUp('rare'), 'epic');
  assert.equal(E.gradeUp('legendary'), 'legendary');
});
