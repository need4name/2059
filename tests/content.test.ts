import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkContent } from '../scripts/check-content';

test('content files pass every check', () => {
  assert.deepEqual(checkContent(), []);
});
