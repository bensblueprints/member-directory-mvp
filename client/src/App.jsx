import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Search, LayoutGrid, Table2, Lock, LogOut, Settings2, Upload, Download,
  Plus, Pencil, Trash2, X, Mail, CalendarClock, Building2, Tags, ChevronDown, Check
} from 'lucide-react';
import { api } from './api.js';

const STATUS_STYLES = {
  active: 'bg-emerald-950 text-emerald-300 border border-emerald-900/60',
  lapsed: 'bg-red-950 text-red-300 border border-red-900/60',
  pending: 'bg-amber-950 text-amber-300 border border-amber-900/60'
};

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const fn = () => setHash(window.location.hash);
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return hash;
}

function Avatar({ member, size = 'w-12 h-12' }) {
  if (member.photo_url) {
    return <img src={member.photo_url} alt={member.name} className={`${size} rounded-full object-cover bg-zinc-800`} />;
  }
  const initials = member.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={`${size} rounded-full bg-indigo-950 border border-indigo-900/60 flex items-center justify-center text-indigo-300 font-semibold`}>
      {initials}
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto py-10 px-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <motion.div className={`card w-full ${wide ? 'max-w-2xl' : 'max-w-md'} p-6`}
          initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
            <button className="text-zinc-500 hover:text-zinc-300" onClick={onClose}><X size={18} /></button>
          </div>
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function MemberCard({ m, fields, chapters, isAdmin, onEdit }) {
  const chapter = chapters.find((c) => c.id === m.chapter_id);
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5 flex flex-col gap-3">
      <div className="flex items-start gap-4">
        <Avatar member={m} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-zinc-100 truncate">{m.name}</div>
          <div className="text-xs text-zinc-500 truncate">{m.email}</div>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            <span className={`chip ${STATUS_STYLES[m.status] || ''}`}>{m.status}</span>
            {chapter && <span className="chip bg-zinc-900 text-zinc-400 border border-zinc-800">{chapter.name}</span>}
          </div>
        </div>
        {isAdmin && (
          <button className="text-zinc-600 hover:text-indigo-400" onClick={() => onEdit(m)}><Pencil size={15} /></button>
        )}
      </div>
      {m.bio && <p className="text-sm text-zinc-400 line-clamp-3">{m.bio}</p>}
      {fields.filter((f) => f.show_in_card && m.custom_fields?.[f.key]).length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs border-t border-zinc-900 pt-3">
          {fields.filter((f) => f.show_in_card && m.custom_fields?.[f.key]).map((f) => (
            <div key={f.key} className="min-w-0">
              <div className="text-zinc-600">{f.label}</div>
              {f.type === 'url'
                ? <a href={m.custom_fields[f.key]} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline truncate block">{m.custom_fields[f.key].replace(/^https?:\/\//, '')}</a>
                : <div className="text-zinc-300 truncate">{m.custom_fields[f.key]}</div>}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function MemberForm({ initial, fields, chapters, onSave, onDelete, saving }) {
  const [form, setForm] = useState(() => ({
    name: '', email: '', photo_url: '', bio: '', status: 'active', chapter_id: '',
    renewal_date: '', custom_fields: {}, ...initial,
    chapter_id: initial?.chapter_id || '', renewal_date: initial?.renewal_date || ''
  }));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setCustom = (k, v) => setForm((f) => ({ ...f, custom_fields: { ...f.custom_fields, [k]: v } }));
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSave({ ...form, chapter_id: form.chapter_id || null }); }}>
      <div className="grid grid-cols-2 gap-3">
        <input className="input" placeholder="Full name *" value={form.name} onChange={(e) => set('name', e.target.value)} required />
        <input className="input" type="email" placeholder="Email *" value={form.email} onChange={(e) => set('email', e.target.value)} required />
      </div>
      <input className="input" placeholder="Photo URL" value={form.photo_url} onChange={(e) => set('photo_url', e.target.value)} />
      <textarea className="input" rows={3} placeholder="Bio" value={form.bio} onChange={(e) => set('bio', e.target.value)} />
      <div className="grid grid-cols-3 gap-3">
        <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
          <option value="active">Active</option><option value="pending">Pending</option><option value="lapsed">Lapsed</option>
        </select>
        <select className="input" value={form.chapter_id} onChange={(e) => set('chapter_id', e.target.value)}>
          <option value="">No chapter</option>
          {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="input" type="date" value={form.renewal_date || ''} onChange={(e) => set('renewal_date', e.target.value)} title="Renewal date" />
      </div>
      {fields.length > 0 && (
        <div className="grid grid-cols-2 gap-3 border-t border-zinc-900 pt-3">
          {fields.map((f) => f.type === 'select' ? (
            <select key={f.key} className="input" value={form.custom_fields[f.key] || ''} onChange={(e) => setCustom(f.key, e.target.value)}>
              <option value="">{f.label}…</option>
              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input key={f.key} className="input" placeholder={f.label} value={form.custom_fields[f.key] || ''} onChange={(e) => setCustom(f.key, e.target.value)} />
          ))}
        </div>
      )}
      <div className="flex justify-between pt-2">
        {onDelete ? <button type="button" className="btn btn-danger" onClick={onDelete}><Trash2 size={15} /> Delete</button> : <span />}
        <button className="btn btn-primary" disabled={saving}><Check size={15} /> {saving ? 'Saving…' : 'Save member'}</button>
      </div>
    </form>
  );
}

function SelfEdit({ token }) {
  const [member, setMember] = useState(null);
  const [fields, setFields] = useState([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    Promise.all([api(`/api/self/${token}`), api('/api/fields')])
      .then(([m, f]) => { setMember(m); setFields(f); })
      .catch((e) => setError(e.message));
  }, [token]);
  if (error) return <div className="max-w-md mx-auto mt-24 card p-8 text-center text-red-400">{error}</div>;
  if (!member) return <div className="max-w-md mx-auto mt-24 text-center text-zinc-500">Loading…</div>;
  return (
    <div className="max-w-xl mx-auto mt-12 px-4">
      <div className="card p-6">
        <h1 className="text-lg font-semibold mb-1">Edit your profile</h1>
        <p className="text-sm text-zinc-500 mb-5">{member.email}</p>
        {saved && <div className="mb-4 rounded-lg bg-emerald-950 border border-emerald-900/60 text-emerald-300 text-sm px-3 py-2">Profile saved — thank you!</div>}
        <MemberForm
          initial={member} fields={fields} chapters={[]}
          onSave={async (form) => {
            try {
              const m = await api(`/api/self/${token}`, { method: 'PUT', body: { name: form.name, photo_url: form.photo_url, bio: form.bio, custom_fields: form.custom_fields } });
              setMember(m); setSaved(true);
            } catch (e) { setError(e.message); }
          }}
        />
      </div>
    </div>
  );
}

export default function App() {
  const hash = useHashRoute();
  const [config, setConfig] = useState(null);
  const [members, setMembers] = useState([]);
  const [fields, setFields] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [dirLocked, setDirLocked] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [view, setView] = useState('cards');
  const [modal, setModal] = useState(null); // 'login' | 'member' | 'import' | 'fields' | 'settings' | 'magic'
  const [editing, setEditing] = useState(null);
  const [password, setPassword] = useState('');
  const [magicEmail, setMagicEmail] = useState('');
  const [magicSent, setMagicSent] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [err, setErr] = useState('');

  const isAdmin = config?.is_admin;

  const loadConfig = useCallback(() => api('/api/config').then(setConfig), []);
  const loadAll = useCallback(async () => {
    const [f, c] = await Promise.all([api('/api/fields'), api('/api/chapters')]);
    setFields(f); setChapters(c);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (status) params.set('status', status);
      if (chapterId) params.set('chapter_id', chapterId);
      setMembers(await api(`/api/directory?${params}`));
      setDirLocked(false);
    } catch (e) {
      if (e.status === 401) { setDirLocked(true); setMembers([]); }
    }
  }, [q, status, chapterId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => { if (config) loadAll(); }, [config, loadAll]);

  const selfMatch = hash.match(/^#\/me\/([a-f0-9]+)/);
  if (selfMatch) return <SelfEdit token={selfMatch[1]} />;

  async function login(e) {
    e.preventDefault(); setErr('');
    try {
      await api('/api/login', { method: 'POST', body: { password } });
      setPassword(''); setModal(null); await loadConfig();
    } catch { setErr('Wrong password'); }
  }

  async function saveMember(form) {
    setErr('');
    try {
      if (editing?.id) await api(`/api/members/${editing.id}`, { method: 'PUT', body: form });
      else await api('/api/members', { method: 'POST', body: form });
      setModal(null); setEditing(null); await loadAll();
    } catch (e) { setErr(e.message); }
  }

  return (
    <div className="min-h-screen">
      {/* header */}
      <header className="sticky top-0 z-40 backdrop-blur bg-zinc-950/80 border-b border-zinc-900">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <Users size={20} className="text-indigo-400" />
          <span className="font-semibold text-zinc-100">{config?.org_name || 'Roster'}</span>
          <span className="text-xs text-zinc-600 hidden sm:block">member directory</span>
          <div className="flex-1" />
          {!isAdmin && (
            <button className="btn btn-ghost text-xs" onClick={() => { setMagicSent(false); setModal('magic'); }}>
              <Mail size={14} /> Edit my profile
            </button>
          )}
          {isAdmin ? (
            <>
              <button className="btn btn-ghost text-xs" onClick={() => { setEditing(null); setModal('member'); }}><Plus size={14} /> Member</button>
              <button className="btn btn-ghost text-xs" onClick={() => setModal('fields')}><Tags size={14} /> Fields</button>
              <button className="btn btn-ghost text-xs" onClick={() => { setImportResult(null); setCsvText(''); setModal('import'); }}><Upload size={14} /> Import</button>
              <a className="btn btn-ghost text-xs" href="/api/members/export.csv"><Download size={14} /> Export</a>
              <button className="btn btn-ghost text-xs" onClick={() => setModal('settings')}><Settings2 size={14} /></button>
              <button className="btn btn-ghost text-xs" onClick={async () => { await api('/api/logout', { method: 'POST' }); loadConfig(); }}><LogOut size={14} /></button>
            </>
          ) : (
            <button className="btn btn-ghost text-xs" onClick={() => setModal('login')}><Lock size={14} /> Admin</button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* search + filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-56">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input className="input pl-9" placeholder="Search name, email, bio, any field…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {isAdmin && (
            <select className="input w-36" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option><option value="active">Active</option>
              <option value="pending">Pending</option><option value="lapsed">Lapsed</option>
            </select>
          )}
          <select className="input w-44" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
            <option value="">All chapters</option>
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.member_count})</option>)}
          </select>
          <div className="flex rounded-lg border border-zinc-800 overflow-hidden">
            <button className={`px-3 ${view === 'cards' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'}`} onClick={() => setView('cards')}><LayoutGrid size={15} /></button>
            <button className={`px-3 ${view === 'table' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'}`} onClick={() => setView('table')}><Table2 size={15} /></button>
          </div>
        </div>

        {dirLocked ? (
          <div className="card p-12 text-center">
            <Lock className="mx-auto text-zinc-700 mb-3" size={28} />
            <p className="text-zinc-400">This directory is private.</p>
            <p className="text-sm text-zinc-600 mt-1">Sign in as admin, or ask your organization for access.</p>
          </div>
        ) : view === 'cards' ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {members.map((m) => (
              <MemberCard key={m.id} m={m} fields={fields} chapters={chapters} isAdmin={isAdmin}
                onEdit={(mm) => { setEditing(mm); setModal('member'); }} />
            ))}
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-900">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Chapter</th>
                  {fields.filter((f) => f.show_in_card).map((f) => <th key={f.key} className="px-4 py-3 font-medium">{f.label}</th>)}
                  {isAdmin && <th className="px-4 py-3 font-medium">Renewal</th>}
                  {isAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-zinc-900/60 hover:bg-zinc-900/40">
                    <td className="px-4 py-2.5 text-zinc-200 font-medium whitespace-nowrap">{m.name}</td>
                    <td className="px-4 py-2.5 text-zinc-500">{m.email}</td>
                    <td className="px-4 py-2.5"><span className={`chip ${STATUS_STYLES[m.status] || ''}`}>{m.status}</span></td>
                    <td className="px-4 py-2.5 text-zinc-400">{chapters.find((c) => c.id === m.chapter_id)?.name || '—'}</td>
                    {fields.filter((f) => f.show_in_card).map((f) => <td key={f.key} className="px-4 py-2.5 text-zinc-400">{m.custom_fields?.[f.key] || '—'}</td>)}
                    {isAdmin && <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap">{m.renewal_date || '—'}</td>}
                    {isAdmin && <td className="px-2"><button className="text-zinc-600 hover:text-indigo-400" onClick={() => { setEditing(m); setModal('member'); }}><Pencil size={14} /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!dirLocked && members.length === 0 && (
          <div className="text-center text-zinc-600 py-16">No members match. {isAdmin && 'Add one or import a CSV.'}</div>
        )}
      </main>

      {/* modals */}
      {modal === 'login' && (
        <Modal title="Admin sign in" onClose={() => setModal(null)}>
          <form onSubmit={login} className="space-y-3">
            <input className="input" type="password" placeholder="Admin password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            {err && <p className="text-sm text-red-400">{err}</p>}
            <button className="btn btn-primary w-full justify-center">Sign in</button>
          </form>
        </Modal>
      )}

      {modal === 'magic' && (
        <Modal title="Edit my profile" onClose={() => setModal(null)}>
          {magicSent ? (
            <p className="text-sm text-zinc-400">If that email belongs to a member, an edit link is on its way. (If this install has no SMTP configured, ask your admin — the link also appears in the server log.)</p>
          ) : (
            <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); await api('/api/magic-link', { method: 'POST', body: { email: magicEmail } }); setMagicSent(true); }}>
              <p className="text-sm text-zinc-500">Enter your member email and we'll send you a magic link to edit your own profile — no password needed.</p>
              <input className="input" type="email" placeholder="you@example.com" value={magicEmail} onChange={(e) => setMagicEmail(e.target.value)} required autoFocus />
              <button className="btn btn-primary w-full justify-center"><Mail size={15} /> Send magic link</button>
            </form>
          )}
        </Modal>
      )}

      {modal === 'member' && (
        <Modal title={editing ? `Edit ${editing.name}` : 'Add member'} onClose={() => { setModal(null); setEditing(null); }} wide>
          {err && <p className="text-sm text-red-400 mb-3">{err}</p>}
          <MemberForm initial={editing || undefined} fields={fields} chapters={chapters} onSave={saveMember}
            onDelete={editing ? async () => { await api(`/api/members/${editing.id}`, { method: 'DELETE' }); setModal(null); setEditing(null); loadAll(); } : null} />
        </Modal>
      )}

      {modal === 'import' && (
        <Modal title="Import members from CSV" onClose={() => setModal(null)} wide>
          <p className="text-sm text-zinc-500 mb-3">
            Header row required: <code className="text-zinc-300">name,email</code> plus optional
            <code className="text-zinc-300"> status, chapter, renewal_date, bio, photo_url</code> — any other column becomes a custom field automatically. Existing emails are updated, not duplicated.
          </p>
          <input type="file" accept=".csv,text/csv" className="mb-3 text-sm text-zinc-400"
            onChange={(e) => { const f = e.target.files[0]; if (f) f.text().then(setCsvText); }} />
          <textarea className="input font-mono text-xs" rows={8} placeholder={'name,email,chapter,industry\nAda Lovelace,ada@example.com,London,Computing'} value={csvText} onChange={(e) => setCsvText(e.target.value)} />
          {importResult && (
            <p className="text-sm text-emerald-400 mt-2">Imported {importResult.imported}, updated {importResult.updated}, skipped {importResult.skipped}.</p>
          )}
          <div className="flex justify-end mt-3">
            <button className="btn btn-primary" onClick={async () => {
              const r = await api('/api/members/import', { method: 'POST', body: csvText, raw: true });
              setImportResult(r); loadAll();
            }}><Upload size={15} /> Import</button>
          </div>
        </Modal>
      )}

      {modal === 'fields' && (
        <FieldsModal fields={fields} chapters={chapters} onClose={() => setModal(null)} reload={loadAll} />
      )}

      {modal === 'settings' && (
        <SettingsModal onClose={() => setModal(null)} reload={() => { loadConfig(); loadAll(); }} />
      )}
    </div>
  );
}

function FieldsModal({ fields, chapters, onClose, reload }) {
  const [key, setKey] = useState(''); const [label, setLabel] = useState('');
  const [type, setType] = useState('text'); const [options, setOptions] = useState('');
  const [chapterName, setChapterName] = useState('');
  return (
    <Modal title="Custom fields & chapters" onClose={onClose} wide>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-medium text-zinc-300 mb-2 flex items-center gap-2"><Tags size={14} /> Custom fields</h3>
          <div className="space-y-1.5 mb-3">
            {fields.map((f) => (
              <div key={f.id} className="flex items-center justify-between text-sm bg-zinc-900 rounded-lg px-3 py-2">
                <span className="text-zinc-300">{f.label} <span className="text-zinc-600 text-xs">({f.key} · {f.type})</span></span>
                <button className="text-zinc-600 hover:text-red-400" onClick={async () => { await api(`/api/fields/${f.id}`, { method: 'DELETE' }); reload(); }}><Trash2 size={14} /></button>
              </div>
            ))}
            {fields.length === 0 && <p className="text-xs text-zinc-600">No custom fields yet — add "Industry", "Membership tier", "LinkedIn"…</p>}
          </div>
          <form className="space-y-2" onSubmit={async (e) => {
            e.preventDefault();
            await api('/api/fields', { method: 'POST', body: { key, label, type, options: options.split(',').map((s) => s.trim()).filter(Boolean) } });
            setKey(''); setLabel(''); setOptions(''); reload();
          }}>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="key (e.g. industry)" value={key} onChange={(e) => setKey(e.target.value)} required />
              <input className="input" placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="text">Text</option><option value="select">Select</option><option value="url">URL</option>
              </select>
              {type === 'select' && <input className="input" placeholder="Options, comma-separated" value={options} onChange={(e) => setOptions(e.target.value)} />}
            </div>
            <button className="btn btn-primary w-full justify-center text-xs"><Plus size={14} /> Add field</button>
          </form>
        </div>
        <div>
          <h3 className="text-sm font-medium text-zinc-300 mb-2 flex items-center gap-2"><Building2 size={14} /> Chapters</h3>
          <div className="space-y-1.5 mb-3">
            {chapters.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm bg-zinc-900 rounded-lg px-3 py-2">
                <span className="text-zinc-300">{c.name} <span className="text-zinc-600 text-xs">({c.member_count} members)</span></span>
                <button className="text-zinc-600 hover:text-red-400" onClick={async () => { await api(`/api/chapters/${c.id}`, { method: 'DELETE' }); reload(); }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); await api('/api/chapters', { method: 'POST', body: { name: chapterName } }); setChapterName(''); reload(); }}>
            <input className="input" placeholder="New chapter name" value={chapterName} onChange={(e) => setChapterName(e.target.value)} required />
            <button className="btn btn-primary"><Plus size={14} /></button>
          </form>
        </div>
      </div>
    </Modal>
  );
}

function SettingsModal({ onClose, reload }) {
  const [s, setS] = useState(null);
  const [expiring, setExpiring] = useState([]);
  const [remindResult, setRemindResult] = useState(null);
  useEffect(() => {
    api('/api/settings').then(setS);
    api('/api/expiring?days=30').then(setExpiring);
  }, []);
  if (!s) return null;
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  return (
    <Modal title="Settings" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-zinc-400">Organization name
            <input className="input mt-1" value={s.org_name} onChange={(e) => set('org_name', e.target.value)} />
          </label>
          <label className="text-sm text-zinc-400">Directory visibility
            <select className="input mt-1" value={s.directory_public} onChange={(e) => set('directory_public', e.target.value)}>
              <option value="0">Private (admin only)</option>
              <option value="1">Public (anyone can browse)</option>
            </select>
          </label>
        </div>
        <label className="text-sm text-zinc-400 block">Public base URL (used in magic-link emails)
          <input className="input mt-1" placeholder="https://directory.yourorg.com" value={s.base_url} onChange={(e) => set('base_url', e.target.value)} />
        </label>
        <details className="text-sm text-zinc-400">
          <summary className="cursor-pointer flex items-center gap-1">SMTP (optional — for magic links & renewal reminders) <ChevronDown size={14} /></summary>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <input className="input" placeholder="SMTP host" value={s.smtp_host} onChange={(e) => set('smtp_host', e.target.value)} />
            <input className="input" placeholder="Port" value={s.smtp_port} onChange={(e) => set('smtp_port', e.target.value)} />
            <input className="input" placeholder="User" value={s.smtp_user} onChange={(e) => set('smtp_user', e.target.value)} />
            <input className="input" type="password" placeholder="Password" value={s.smtp_pass} onChange={(e) => set('smtp_pass', e.target.value)} />
            <input className="input col-span-2" placeholder="From address" value={s.smtp_from} onChange={(e) => set('smtp_from', e.target.value)} />
          </div>
        </details>
        <div className="border-t border-zinc-900 pt-3">
          <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-2"><CalendarClock size={14} /> Renewals due in the next 30 days ({expiring.length})</h3>
          {expiring.slice(0, 6).map((m) => (
            <div key={m.id} className="text-xs text-zinc-500 flex justify-between py-0.5">
              <span>{m.name}</span><span className={m.expired ? 'text-red-400' : ''}>{m.renewal_date}{m.expired ? ' (expired)' : ''}</span>
            </div>
          ))}
          {expiring.length > 0 && (
            <button className="btn btn-ghost text-xs mt-2" onClick={async () => setRemindResult(await api('/api/expiring/remind', { method: 'POST', body: { days: 30 } }))}>
              <Mail size={13} /> Send renewal reminders
            </button>
          )}
          {remindResult && (
            <p className="text-xs mt-2 text-zinc-500">
              {remindResult.smtp_configured ? `Sent to ${remindResult.count} member(s).` : 'SMTP is not configured — no emails sent. Configure SMTP above first.'}
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <button className="btn btn-primary" onClick={async () => { await api('/api/settings', { method: 'PUT', body: s }); reload(); onClose(); }}><Check size={15} /> Save settings</button>
        </div>
      </div>
    </Modal>
  );
}
