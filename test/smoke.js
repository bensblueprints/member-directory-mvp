// Roster smoke test — boots the real server on an offset port with a temp DB,
// exercises auth, chapters, custom fields, CSV import/export, directory
// search/filter, magic-link self-editing and renewal expiry — with exact
// number assertions. Kills ONLY the spawned server child.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 5467; // offset from the app's 5367 so parallel builds don't collide
const ADMIN_PASSWORD = 'smoke-test-password';
const DB_PATH = path.join(__dirname, 'smoke.db');
const BASE = `http://127.0.0.1:${TEST_PORT}`;

for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

let serverProc = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, tries = 40, delay = 250) {
  for (let i = 0; i < tries; i++) {
    try { const v = await fn(); if (v) return v; } catch { /* retry */ }
    await sleep(delay);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

let cookie = '';
async function api(pathname, options = {}) {
  const res = await fetch(BASE + pathname, {
    ...options,
    headers: {
      'Content-Type': options.csv ? 'text/csv' : 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...options.headers
    },
    body: options.csv ? options.csv : options.body ? JSON.stringify(options.body) : undefined
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { _raw: text }; }
  return { status: res.status, data, text };
}

async function main() {
  console.log('1. Booting Roster on port', TEST_PORT, 'with temp DB');
  serverProc = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(TEST_PORT), ADMIN_PASSWORD, DB_PATH },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProc.stdout.on('data', (d) => process.stdout.write(`   [server] ${d}`));
  serverProc.stderr.on('data', (d) => process.stderr.write(`   [server] ${d}`));
  await waitFor(async () => (await api('/api/health')).data.ok, 'server health');

  console.log('2. Auth: private directory 401s, wrong password 401s, login works');
  cookie = '';
  const priv = await api('/api/directory');
  assert.strictEqual(priv.status, 401, 'private directory must 401 for anonymous visitors');
  const bad = await api('/api/login', { method: 'POST', body: { password: 'nope' } });
  assert.strictEqual(bad.status, 401, 'wrong password must 401');
  cookie = '';
  const membersUnauthed = await api('/api/members');
  assert.strictEqual(membersUnauthed.status, 401, 'admin member list must require auth');
  const good = await api('/api/login', { method: 'POST', body: { password: ADMIN_PASSWORD } });
  assert.strictEqual(good.status, 200, 'login must succeed');

  console.log('3. Chapters + custom field definitions');
  const ch = await api('/api/chapters', { method: 'POST', body: { name: 'London' } });
  assert.strictEqual(ch.status, 201, 'chapter create must 201');
  const dup = await api('/api/chapters', { method: 'POST', body: { name: 'London' } });
  assert.strictEqual(dup.status, 409, 'duplicate chapter must 409');
  const fld = await api('/api/fields', {
    method: 'POST',
    body: { key: 'tier', label: 'Membership tier', type: 'select', options: ['Gold', 'Silver'] }
  });
  assert.strictEqual(fld.status, 201, 'field def create must 201');
  assert.deepStrictEqual(fld.data.options, ['Gold', 'Silver'], 'select field must round-trip its options');

  console.log('4. Member create + validation');
  const m1 = await api('/api/members', {
    method: 'POST',
    body: {
      name: 'Ada Lovelace', email: 'ada@example.com', bio: 'First programmer',
      chapter_id: ch.data.id, custom_fields: { tier: 'Gold' },
      renewal_date: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
    }
  });
  assert.strictEqual(m1.status, 201, 'member create must 201');
  const dupEmail = await api('/api/members', { method: 'POST', body: { name: 'Ada 2', email: 'ADA@example.com' } });
  assert.strictEqual(dupEmail.status, 409, 'duplicate email (case-insensitive) must 409');

  console.log('5. CSV import — quoted commas, auto chapter + auto custom field, exact counts');
  const csv = [
    'name,email,status,chapter,industry',
    'Grace Hopper,grace@example.com,active,Boston,"Computing, Naval"',
    'Alan Turing,alan@example.com,pending,London,Mathematics',
    'Lapsed Larry,larry@example.com,lapsed,,Sales'
  ].join('\n');
  const imp = await api('/api/members/import', { method: 'POST', csv });
  assert.strictEqual(imp.status, 200, 'import must 200');
  assert.strictEqual(imp.data.imported, 3, `import must report exactly 3 imported (got ${imp.data.imported})`);
  assert.strictEqual(imp.data.updated, 0, 'import must report 0 updated');
  const all = await api('/api/members');
  assert.strictEqual(all.data.length, 4, `must have exactly 4 members after import (got ${all.data.length})`);
  const grace = all.data.find((m) => m.email === 'grace@example.com');
  assert.strictEqual(grace.custom_fields.industry, 'Computing, Naval', 'quoted CSV field with comma must survive import');
  const fieldsNow = await api('/api/fields');
  assert.ok(fieldsNow.data.some((f) => f.key === 'industry'), 'unknown CSV column must auto-create a field def');
  const chaptersNow = await api('/api/chapters');
  assert.strictEqual(chaptersNow.data.length, 2, 'import must auto-create the Boston chapter (2 chapters total)');

  // re-import same CSV → updates, not duplicates
  const imp2 = await api('/api/members/import', { method: 'POST', csv });
  assert.strictEqual(imp2.data.updated, 3, 're-import must update 3, not duplicate');
  assert.strictEqual((await api('/api/members')).data.length, 4, 'member count must stay 4 after re-import');

  console.log('6. Directory search + filters — exact result counts');
  const searchAda = await api('/api/directory?q=lovelace');
  assert.strictEqual(searchAda.data.length, 1, 'search "lovelace" must return exactly 1');
  assert.strictEqual(searchAda.data[0].email, 'ada@example.com');
  const searchCustom = await api('/api/directory?q=naval');
  assert.strictEqual(searchCustom.data.length, 1, 'search must reach into custom field values');
  const london = await api(`/api/directory?chapter_id=${ch.data.id}`);
  assert.strictEqual(london.data.length, 2, 'London chapter filter must return exactly 2 (Ada + Alan)');
  const lapsed = await api('/api/directory?status=lapsed');
  assert.strictEqual(lapsed.data.length, 1, 'status=lapsed filter must return exactly 1');
  const tierGold = await api('/api/directory?field_key=tier&field_value=gold');
  assert.strictEqual(tierGold.data.length, 1, 'custom-field exact filter must return exactly 1');

  console.log('7. Public vs private directory — non-admin sees active members only');
  await api('/api/settings', { method: 'PUT', body: { directory_public: '1' } });
  const savedCookie = cookie;
  cookie = '';
  const pub = await api('/api/directory');
  assert.strictEqual(pub.status, 200, 'public directory must 200 without auth');
  assert.strictEqual(pub.data.length, 2, `public view must hide pending+lapsed (expect 2 active, got ${pub.data.length})`);
  assert.ok(!('renewal_date' in pub.data[0]), 'public payload must not leak renewal_date');

  console.log('8. Magic-link self-serve edit (token read from SQLite — no SMTP)');
  const req1 = await api('/api/magic-link', { method: 'POST', body: { email: 'ada@example.com' } });
  assert.strictEqual(req1.status, 200);
  const probe = await api('/api/magic-link', { method: 'POST', body: { email: 'stranger@example.com' } });
  assert.strictEqual(probe.status, 200, 'magic-link must not reveal whether an email is a member');
  const Database = require('better-sqlite3');
  const db = new Database(DB_PATH, { readonly: true });
  const tokenRow = db.prepare(
    'SELECT t.token FROM magic_tokens t JOIN members m ON m.id = t.member_id WHERE m.email = ? ORDER BY t.id DESC'
  ).get('ada@example.com');
  assert.ok(tokenRow, 'magic token row must land in SQLite');
  assert.strictEqual(
    db.prepare('SELECT COUNT(*) n FROM magic_tokens').get().n, 1,
    'no token may be created for a non-member email'
  );
  const self = await api(`/api/self/${tokenRow.token}`);
  assert.strictEqual(self.status, 200, 'magic token must grant self access');
  assert.strictEqual(self.data.email, 'ada@example.com');
  const upd = await api(`/api/self/${tokenRow.token}`, {
    method: 'PUT',
    body: { bio: 'Analyst. Metaphysician. Founder of scientific computing.', custom_fields: { tier: 'Gold', industry: 'Mathematics' } }
  });
  assert.strictEqual(upd.status, 200, 'self-update must 200');
  const bioInDb = db.prepare('SELECT bio, status FROM members WHERE email = ?').get('ada@example.com');
  assert.strictEqual(bioInDb.bio, 'Analyst. Metaphysician. Founder of scientific computing.', 'self-edit must persist to SQLite');
  const hack = await api(`/api/self/${tokenRow.token}`, { method: 'PUT', body: { status: 'lapsed' } });
  assert.strictEqual(hack.status, 200);
  assert.strictEqual(db.prepare('SELECT status FROM members WHERE email = ?').get('ada@example.com').status, 'active',
    'self-edit must NOT be able to change membership status');
  const badToken = await api('/api/self/deadbeef');
  assert.strictEqual(badToken.status, 401, 'bad magic token must 401');

  console.log('9. Renewal expiry list — exact counts');
  cookie = savedCookie;
  const expiring = await api('/api/expiring?days=30');
  assert.strictEqual(expiring.status, 200);
  assert.strictEqual(expiring.data.length, 1, `exactly 1 member renews within 30 days (got ${expiring.data.length})`);
  assert.strictEqual(expiring.data[0].email, 'ada@example.com');
  const remind = await api('/api/expiring/remind', { method: 'POST', body: { days: 30 } });
  assert.strictEqual(remind.status, 200);
  assert.strictEqual(remind.data.smtp_configured, false, 'no SMTP configured → remind must be a safe no-op');
  assert.strictEqual(remind.data.count, 1, 'remind must target exactly 1 member');
  assert.strictEqual(remind.data.results[0].result, 'skipped', 'without SMTP the reminder must be skipped, not errored');

  console.log('10. CSV export round-trip');
  const res = await fetch(`${BASE}/api/members/export.csv`, { headers: { Cookie: cookie } });
  assert.strictEqual(res.status, 200, 'export must 200');
  assert.ok(res.headers.get('content-type').includes('text/csv'), 'export must be text/csv');
  const exported = await res.text();
  const lines = exported.trim().split(/\r?\n/);
  assert.strictEqual(lines.length, 5, `export must have header + 4 rows (got ${lines.length})`);
  assert.ok(lines[0].startsWith('name,email,status,chapter'), 'export header shape');
  assert.ok(exported.includes('"Computing, Naval"'), 'export must quote fields containing commas');

  db.close();
  console.log('\n✅ All Roster smoke tests passed');
}

async function cleanup(code) {
  if (serverProc && !serverProc.killed) serverProc.kill(); // only OUR child
  await sleep(300);
  for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* windows lock */ }
  }
  process.exit(code);
}

main()
  .then(() => cleanup(0))
  .catch(async (err) => {
    console.error('\n❌ Smoke test failed:', err.message);
    await cleanup(1);
  });
