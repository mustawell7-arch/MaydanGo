const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { resolveStaticFilePath } = require('./safe-static-path');

const root = path.resolve('/srv/maydango/static-build');

test('static paths inside the asset root resolve normally', () => {
  assert.equal(
    resolveStaticFilePath(root, '/assets/app.js'),
    path.join(root, 'assets', 'app.js'),
  );
});

test('encoded and plain traversal paths are rejected', () => {
  assert.equal(resolveStaticFilePath(root, '/../private.json'), null);
  assert.equal(resolveStaticFilePath(root, '/%2e%2e/private.json'), null);
  assert.equal(resolveStaticFilePath(root, '/%2e%2e%2fstatic-build-copy/secret'), null);
});

test('malformed escaped paths are rejected', () => {
  assert.equal(resolveStaticFilePath(root, '/assets/%E0%A4%A'), null);
});
