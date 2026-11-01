// Checks on the release workflow that a unit test can pin down without running GitHub Actions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const release = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');

test('a manual Release run publishes only from main', () => {
  // The release job, from its key to the end of the file (it is the last job).
  const job = release.slice(release.indexOf('\n  release:'));
  assert.match(job, /^\s{4}if: github\.ref == 'refs\/heads\/main'$/m);
});

test('the release still waits for Lint, Validate and HACS Validation', () => {
  const job = release.slice(release.indexOf('\n  release:'));
  assert.match(job, /needs: \[lint, validate, hacs\]/);
});
