const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const { openDb, genToken, getSettings, setSettings } = require('./db');
const { parseCsv, stringifyCsv } = require('./csv');
const { sendMail, smtpConfigured } = require('./mail');

const SESSION_COOKIE = 'roster_session';
const MAGIC_TTL_MS = 1000 * 60 * 60 * 24; // magic links valid for 24h

function createApp({ dbPath, adminPassword, autologinToken = null } = {}) {
  const db = openDb(dbPath);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '10mb' }));
  app.locals.db = db;

  const findMember = db.prepare('SELECT * FROM members WHERE id = ?');
  const findMemberByEmail = db.prepare('SELECT * FROM members WHERE email = ? COLLATE NOCASE');

  function requireAuth(req, res, next) {
    const token = req.cookies[SESSION_COOKIE];
    if (token && db.prepare('SELECT id FROM sessions WHERE token = ?').get(token)) return next();
    res.status(401).json({ error: 'unauthorized' });
  }

  function isAdmin(req) {
    const token = req.cookies[SESSION_COOKIE];
    return Boolean(token && db.prepare('SELECT id FROM sessions WHERE token = ?').get(token));
  }

  function createSession(res) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, created_at) VALUES (?, ?)').run(token, Date.now());
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax' });
  }

  function serializeMember(m, { forAdmin = false } = {}) {
    let custom = {};
    try { custom = JSON.parse(m.custom_fields_json || '{}'); } catch { /* ignore */ }
    const out = {
      id: m.id, name: m.name, email: m.email, photo_url: m.photo_url, bio: m.bio,
      custom_fields: custom, status: m.status, chapter_id: m.chapter_id,
      joined_at: m.joined_at
    };
    if (forAdmin) {
      out.renewal_date = m.renewal_date;
      out.reminder_sent_at = m.reminder_sent_at;
      out.created_at = m.created_at;
    }
    return out;
  }

  // ── health / config ────────────────────────────────────────────────────────
  app.get('/api/health', (req, res) => res.json({ ok: true, app: 'roster' }));

  app.get('/api/config', (req, res) => {
    const s = getSettings(db);
    res.json({
      org_name: s.org_name,
      directory_public: s.directory_public === '1',
      is_admin: isAdmin(req)
    });
  });

  // ── auth ───────────────────────────────────────────────────────────────────
  app.post('/api/login', (req, res) => {
    if ((req.body || {}).password !== adminPassword) return res.status(401).json({ error: 'wrong password' });
    createSession(res);
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });

  // Desktop mode auto-login (Electron passes a one-shot token).
  app.get('/auth/auto', (req, res) => {
    if (autologinToken && req.query.token === autologinToken) createSession(res);
    res.redirect('/');
  });

  app.get('/api/me', requireAuth, (req, res) => res.json({ ok: true }));

  // ── chapters ───────────────────────────────────────────────────────────────
  app.get('/api/chapters', (req, res) => {
    const rows = db.prepare(`
      SELECT c.*, (SELECT COUNT(*) FROM members m WHERE m.chapter_id = c.id) AS member_count
      FROM chapters c ORDER BY c.name
    `).all();
    res.json(rows);
  });

  app.post('/api/chapters', requireAuth, (req, res) => {
    const name = String((req.body || {}).name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    try {
      const info = db.prepare('INSERT INTO chapters (name) VALUES (?)').run(name);
      res.status(201).json(db.prepare('SELECT * FROM chapters WHERE id = ?').get(info.lastInsertRowid));
    } catch {
      res.status(409).json({ error: 'chapter already exists' });
    }
  });

  app.delete('/api/chapters/:id', requireAuth, (req, res) => {
    db.prepare('UPDATE members SET chapter_id = NULL WHERE chapter_id = ?').run(req.params.id);
    db.prepare('DELETE FROM chapters WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ── custom field definitions ───────────────────────────────────────────────
  app.get('/api/fields', (req, res) => {
    const rows = db.prepare('SELECT * FROM field_defs ORDER BY sort, id').all()
      .map((f) => ({ ...f, options: JSON.parse(f.options_json || '[]') }));
    res.json(rows);
  });

  app.post('/api/fields', requireAuth, (req, res) => {
    const b = req.body || {};
    const key = String(b.key || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const label = String(b.label || '').trim();
    if (!key || !label) return res.status(400).json({ error: 'key and label are required' });
    const type = ['text', 'select', 'url'].includes(b.type) ? b.type : 'text';
    const options = Array.isArray(b.options) ? b.options.map(String) : [];
    try {
      const info = db.prepare(
        'INSERT INTO field_defs (key, label, type, options_json, show_in_card, sort) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(key, label, type, JSON.stringify(options), b.show_in_card === false ? 0 : 1, Number(b.sort) || 0);
      const row = db.prepare('SELECT * FROM field_defs WHERE id = ?').get(info.lastInsertRowid);
      res.status(201).json({ ...row, options: JSON.parse(row.options_json) });
    } catch {
      res.status(409).json({ error: 'field key already exists' });
    }
  });

  app.delete('/api/fields/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM field_defs WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ── directory (search + filter) ────────────────────────────────────────────
  app.get('/api/directory', (req, res) => {
    const s = getSettings(db);
    if (s.directory_public !== '1' && !isAdmin(req)) {
      return res.status(401).json({ error: 'directory is private' });
    }
    const q = String(req.query.q || '').trim().toLowerCase();
    const status = String(req.query.status || '').trim();
    const chapterId = Number(req.query.chapter_id) || null;
    const fieldKey = String(req.query.field_key || '').trim();
    const fieldValue = String(req.query.field_value || '').trim().toLowerCase();

    let rows = db.prepare('SELECT * FROM members ORDER BY name COLLATE NOCASE').all();
    if (status) rows = rows.filter((m) => m.status === status);
    else if (!isAdmin(req)) rows = rows.filter((m) => m.status === 'active');
    if (chapterId) rows = rows.filter((m) => m.chapter_id === chapterId);
    const parsed = rows.map((m) => serializeMember(m, { forAdmin: isAdmin(req) }));
    let out = parsed;
    if (q) {
      out = out.filter((m) => {
        const hay = [m.name, m.email, m.bio, ...Object.values(m.custom_fields || {})]
          .join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    if (fieldKey && fieldValue) {
      out = out.filter((m) => String((m.custom_fields || {})[fieldKey] || '').toLowerCase() === fieldValue);
    }
    res.json(out);
  });

  // ── members CRUD (admin) ───────────────────────────────────────────────────
  function memberInput(b) {
    return {
      name: String(b.name || '').trim(),
      email: String(b.email || '').trim().toLowerCase(),
      photo_url: String(b.photo_url || '').trim(),
      bio: String(b.bio || '').trim(),
      custom_fields_json: JSON.stringify(b.custom_fields && typeof b.custom_fields === 'object' ? b.custom_fields : {}),
      status: ['active', 'lapsed', 'pending'].includes(b.status) ? b.status : 'active',
      joined_at: b.joined_at ? Number(b.joined_at) : Date.now(),
      renewal_date: b.renewal_date ? String(b.renewal_date).slice(0, 10) : null,
      chapter_id: b.chapter_id ? Number(b.chapter_id) : null
    };
  }

  app.get('/api/members', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM members ORDER BY name COLLATE NOCASE').all();
    res.json(rows.map((m) => serializeMember(m, { forAdmin: true })));
  });

  app.post('/api/members', requireAuth, (req, res) => {
    const v = memberInput(req.body || {});
    if (!v.name || !v.email) return res.status(400).json({ error: 'name and email are required' });
    try {
      const info = db.prepare(`
        INSERT INTO members (name, email, photo_url, bio, custom_fields_json, status, joined_at, renewal_date, chapter_id, created_at)
        VALUES (@name, @email, @photo_url, @bio, @custom_fields_json, @status, @joined_at, @renewal_date, @chapter_id, @created_at)
      `).run({ ...v, created_at: Date.now() });
      res.status(201).json(serializeMember(findMember.get(info.lastInsertRowid), { forAdmin: true }));
    } catch {
      res.status(409).json({ error: 'a member with that email already exists' });
    }
  });

  app.put('/api/members/:id', requireAuth, (req, res) => {
    const m = findMember.get(req.params.id);
    if (!m) return res.status(404).json({ error: 'not found' });
    const existing = serializeMember(m, { forAdmin: true });
    const v = memberInput({ ...existing, custom_fields: existing.custom_fields, ...(req.body || {}) });
    if (!v.name || !v.email) return res.status(400).json({ error: 'name and email are required' });
    db.prepare(`
      UPDATE members SET name=@name, email=@email, photo_url=@photo_url, bio=@bio,
        custom_fields_json=@custom_fields_json, status=@status, joined_at=@joined_at,
        renewal_date=@renewal_date, chapter_id=@chapter_id WHERE id=@id
    `).run({ ...v, id: m.id });
    res.json(serializeMember(findMember.get(m.id), { forAdmin: true }));
  });

  app.delete('/api/members/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM magic_tokens WHERE member_id = ?').run(req.params.id);
    db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ── CSV import / export ────────────────────────────────────────────────────
  // Import columns: name,email[,status][,chapter][,renewal_date][,bio][,photo_url][,<custom keys...>]
  app.post('/api/members/import', requireAuth, (req, res) => {
    const text = typeof req.body === 'string' ? req.body : String((req.body || {}).csv || '');
    const rows = parseCsv(text);
    if (rows.length < 2) return res.status(400).json({ error: 'CSV needs a header row and at least one data row' });
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idx = (k) => header.indexOf(k);
    if (idx('name') === -1 || idx('email') === -1) {
      return res.status(400).json({ error: 'CSV must include name and email columns' });
    }
    const known = new Set(['name', 'email', 'status', 'chapter', 'renewal_date', 'bio', 'photo_url']);
    const customKeys = header.filter((h) => !known.has(h));
    const fieldKeys = new Set(db.prepare('SELECT key FROM field_defs').all().map((f) => f.key));

    let imported = 0, updated = 0, skipped = 0;
    const tx = db.transaction(() => {
      for (const row of rows.slice(1)) {
        const get = (k) => (idx(k) >= 0 ? String(row[idx(k)] || '').trim() : '');
        const name = get('name');
        const email = get('email').toLowerCase();
        if (!name || !email) { skipped++; continue; }
        let chapter_id = null;
        const chapterName = get('chapter');
        if (chapterName) {
          const existing = db.prepare('SELECT id FROM chapters WHERE name = ? COLLATE NOCASE').get(chapterName);
          chapter_id = existing ? existing.id : db.prepare('INSERT INTO chapters (name) VALUES (?)').run(chapterName).lastInsertRowid;
        }
        const custom = {};
        for (const k of customKeys) {
          const val = String(row[header.indexOf(k)] || '').trim();
          if (val) {
            custom[k] = val;
            if (!fieldKeys.has(k)) {
              db.prepare('INSERT INTO field_defs (key, label, type, options_json) VALUES (?, ?, ?, ?)')
                .run(k, k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), 'text', '[]');
              fieldKeys.add(k);
            }
          }
        }
        const v = {
          name, email,
          photo_url: get('photo_url'),
          bio: get('bio'),
          custom_fields_json: JSON.stringify(custom),
          status: ['active', 'lapsed', 'pending'].includes(get('status')) ? get('status') : 'active',
          renewal_date: get('renewal_date') || null,
          chapter_id
        };
        const existing = findMemberByEmail.get(email);
        if (existing) {
          db.prepare(`
            UPDATE members SET name=@name, photo_url=@photo_url, bio=@bio, custom_fields_json=@custom_fields_json,
              status=@status, renewal_date=@renewal_date, chapter_id=@chapter_id WHERE id=@id
          `).run({ ...v, id: existing.id });
          updated++;
        } else {
          db.prepare(`
            INSERT INTO members (name, email, photo_url, bio, custom_fields_json, status, joined_at, renewal_date, chapter_id, created_at)
            VALUES (@name, @email, @photo_url, @bio, @custom_fields_json, @status, @joined_at, @renewal_date, @chapter_id, @created_at)
          `).run({ ...v, joined_at: Date.now(), created_at: Date.now() });
          imported++;
        }
      }
    });
    tx();
    res.json({ ok: true, imported, updated, skipped });
  });

  app.get('/api/members/export.csv', requireAuth, (req, res) => {
    const fields = db.prepare('SELECT key FROM field_defs ORDER BY sort, id').all().map((f) => f.key);
    const chapters = new Map(db.prepare('SELECT id, name FROM chapters').all().map((c) => [c.id, c.name]));
    const rows = db.prepare('SELECT * FROM members ORDER BY name COLLATE NOCASE').all();
    const header = ['name', 'email', 'status', 'chapter', 'renewal_date', 'bio', 'photo_url', ...fields];
    const out = [header];
    for (const m of rows) {
      let custom = {};
      try { custom = JSON.parse(m.custom_fields_json || '{}'); } catch { /* ignore */ }
      out.push([
        m.name, m.email, m.status, chapters.get(m.chapter_id) || '', m.renewal_date || '',
        m.bio || '', m.photo_url || '', ...fields.map((k) => custom[k] || '')
      ]);
    }
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="roster-members.csv"');
    res.send(stringifyCsv(out));
  });

  // ── magic-link self-serve profile editing ──────────────────────────────────
  app.post('/api/magic-link', (req, res) => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email is required' });
    const member = findMemberByEmail.get(email);
    // Always answer OK so the endpoint can't be used to probe membership.
    if (!member) return res.json({ ok: true });
    const token = genToken(24);
    db.prepare('INSERT INTO magic_tokens (member_id, token, created_at) VALUES (?, ?, ?)')
      .run(member.id, token, Date.now());
    const s = getSettings(db);
    const base = s.base_url || `http://localhost:${process.env.PORT || 5367}`;
    const link = `${base}/#/me/${token}`;
    sendMail(s, member.email, `${s.org_name} — edit your member profile`,
      `Hi ${member.name},\n\nUse this link (valid 24h) to update your directory profile:\n${link}\n`)
      .then((r) => { if (r === 'skipped') console.log(`[magic-link] SMTP not configured — link for ${email}: ${link}`); })
      .catch((e) => console.warn('[magic-link] email failed:', e.message));
    res.json({ ok: true });
  });

  function memberForToken(token) {
    const row = db.prepare('SELECT * FROM magic_tokens WHERE token = ?').get(String(token || ''));
    if (!row) return null;
    if (Date.now() - row.created_at > MAGIC_TTL_MS) return null;
    return findMember.get(row.member_id) || null;
  }

  app.get('/api/self/:token', (req, res) => {
    const m = memberForToken(req.params.token);
    if (!m) return res.status(401).json({ error: 'invalid or expired link' });
    res.json(serializeMember(m));
  });

  app.put('/api/self/:token', (req, res) => {
    const m = memberForToken(req.params.token);
    if (!m) return res.status(401).json({ error: 'invalid or expired link' });
    const b = req.body || {};
    // Members may edit their own display fields — never status/renewal/chapter.
    const patch = {
      name: b.name !== undefined ? String(b.name).trim() || m.name : m.name,
      photo_url: b.photo_url !== undefined ? String(b.photo_url).trim() : m.photo_url,
      bio: b.bio !== undefined ? String(b.bio).trim() : m.bio,
      custom_fields_json: b.custom_fields && typeof b.custom_fields === 'object'
        ? JSON.stringify(b.custom_fields) : m.custom_fields_json
    };
    db.prepare('UPDATE members SET name=@name, photo_url=@photo_url, bio=@bio, custom_fields_json=@custom_fields_json WHERE id=@id')
      .run({ ...patch, id: m.id });
    db.prepare('UPDATE magic_tokens SET used_at = ? WHERE token = ?').run(Date.now(), req.params.token);
    res.json(serializeMember(findMember.get(m.id)));
  });

  // ── renewals / expiry reminders ────────────────────────────────────────────
  app.get('/api/expiring', requireAuth, (req, res) => {
    const days = Math.max(0, Number(req.query.days) || 30);
    const today = new Date().toISOString().slice(0, 10);
    const limit = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const rows = db.prepare(`
      SELECT * FROM members
      WHERE renewal_date IS NOT NULL AND renewal_date != '' AND renewal_date <= ? AND status != 'lapsed'
      ORDER BY renewal_date
    `).all(limit);
    res.json(rows.map((m) => ({
      ...serializeMember(m, { forAdmin: true }),
      expired: m.renewal_date < today
    })));
  });

  app.post('/api/expiring/remind', requireAuth, async (req, res) => {
    const s = getSettings(db);
    const days = Math.max(0, Number((req.body || {}).days) || 30);
    const limit = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const rows = db.prepare(`
      SELECT * FROM members
      WHERE renewal_date IS NOT NULL AND renewal_date != '' AND renewal_date <= ? AND status != 'lapsed'
    `).all(limit);
    const results = [];
    for (const m of rows) {
      try {
        const r = await sendMail(s, m.email, `${s.org_name} — your membership renewal is due`,
          `Hi ${m.name},\n\nYour ${s.org_name} membership renewal date is ${m.renewal_date}. Please renew to stay in the directory.\n`);
        if (r === 'sent') db.prepare('UPDATE members SET reminder_sent_at = ? WHERE id = ?').run(Date.now(), m.id);
        results.push({ id: m.id, email: m.email, result: r });
      } catch (e) {
        results.push({ id: m.id, email: m.email, result: 'error', error: e.message });
      }
    }
    res.json({ ok: true, smtp_configured: smtpConfigured(s), count: rows.length, results });
  });

  // ── settings ───────────────────────────────────────────────────────────────
  app.get('/api/settings', requireAuth, (req, res) => {
    const s = getSettings(db);
    res.json({ ...s, smtp_pass: s.smtp_pass ? '********' : '' });
  });

  app.put('/api/settings', requireAuth, (req, res) => {
    const body = { ...(req.body || {}) };
    if (body.smtp_pass === '********') delete body.smtp_pass;
    setSettings(db, body);
    const s = getSettings(db);
    res.json({ ...s, smtp_pass: s.smtp_pass ? '********' : '' });
  });

  // ── static frontend ────────────────────────────────────────────────────────
  const dist = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/auth')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  return app;
}

module.exports = { createApp };
