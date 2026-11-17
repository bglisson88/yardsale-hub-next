const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');

test('firebase.json is the only repository-approved Firebase deployment configuration', () => {
  const configs = fs.readdirSync(ROOT)
    .filter(file => file === 'firebase.json' || /^firebase\..+\.json$/.test(file))
    .sort();
  assert.deepEqual(configs, ['firebase.json']);

  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
  assert.equal(config.firestore.rules, 'firestore.rules');
  assert.equal(config.storage.rules, 'storage.rules');
});

test('retired event-freeze rules are absent from active test and deployment commands', () => {
  const rootPackage = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const functionsPackage = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'functions', 'package.json'), 'utf8'),
  );
  const scripts = {
    ...rootPackage.scripts,
    ...functionsPackage.scripts,
  };
  for (const command of Object.values(scripts)) {
    assert.doesNotMatch(command, /event[-_]freeze/i);
    assert.doesNotMatch(command, /firebase\.[^ ]*freeze/i);
  }

  const workflowDirectory = path.join(ROOT, '.github', 'workflows');
  for (const file of fs.readdirSync(workflowDirectory)) {
    if (!/\.(?:yml|yaml)$/.test(file)) continue;
    const workflow = fs.readFileSync(path.join(workflowDirectory, file), 'utf8');
    assert.doesNotMatch(workflow, /event[-_]freeze/i);
    assert.doesNotMatch(workflow, /firebase\.[^ ]*freeze/i);
  }

  assert.equal(
    fs.existsSync(path.join(ROOT, 'tests', 'event-write-freeze.rules.test.cjs')),
    false,
  );
});
