const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core.js');

test('Shared clamp helper is available to GymPath import and validation', () => {
  assert.equal(typeof core.clamp, 'function');
  assert.equal(core.clamp(3, 1, 5), 3);
  assert.equal(core.clamp(-1, 1, 5), 1);
  assert.equal(core.clamp(100, 1, 5), 5);
});
