const assert = require('assert');
const makeGame = require('./harness.cjs');

(async () => {
  const g = await makeGame();
  const { run, storage, elements } = g;
  run('freshStart();saveGame()');

  const saveKey = 'drifter_save_v1';
  const original = storage.get(saveKey);
  const input = elements.get('importInput');
  const corruptions = [
    exp => { exp.stash = [null]; },
    exp => { exp.stash = null; },
    exp => { exp.mirrors = 'broken'; },
    exp => { exp.shops = { trader: {} }; },
    exp => { exp.shards = 'broken'; },
    exp => { exp.runes = null; }
  ];
  for (const corrupt of corruptions) {
    const malformed = JSON.parse(original);
    corrupt(malformed.exp);
    const raw = JSON.stringify(malformed);
    input.files = [{ size: Buffer.byteLength(raw), text: async () => raw }];
    await input.onchange({ target: input });
    assert.strictEqual(storage.get(saveKey), original, 'rejected import must preserve the existing save');
    assert.strictEqual(input.value, '', 'file input should be reset after import');
  }

  assert.strictEqual(run('loadSave()'), true, 'the preserved save should still load');
  run("openInv('bag');renderPanel();closeInv()");
  console.log('PASS malformed expedition imports are rejected without replacing playable progress');
})().catch(error => {
  console.error('FAIL malformed stash import', error);
  process.exitCode = 1;
});
