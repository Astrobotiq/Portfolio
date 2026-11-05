import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// Release gate. Expected to fail until the owner supplies the CV, the QA
// company name, and decides on docs/superpowers. Not part of `npm test`.
const root = new URL('../../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');

test('the CV PDF exists', () => {
  assert.ok(existsSync(new URL('assets/Eren-Koselerli-CV.pdf', root)), 'assets/Eren-Koselerli-CV.pdf is missing');
});

test('the .cv link points at the PDF with a download attribute', () => {
  const tag = html.match(/<a\b[^>]*class="[^"]*\bcv\b[^"]*"[^>]*>/)?.[0] ?? '';
  assert.match(tag, /href="assets\/Eren-Koselerli-CV\.pdf"/);
  assert.match(tag, /\sdownload(?=[\s>=])/);
});

test('docs/superpowers is not shipped', () => {
  assert.equal(existsSync(new URL('docs/superpowers', root)), false, 'docs/superpowers still exists');
});

test('the QA experience line names a company', () => {
  const items = [...html.matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1].trim());
  const line = items.find((text) => /^QA\b/.test(text));
  assert.ok(line, 'no QA experience line found');
  assert.notEqual(line, 'QA, Ankara, August-October 2026', 'QA line has no company name');
});
