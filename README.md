# 👥 Roster

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**The member directory you buy once and own forever.** A self-hosted, searchable directory for associations, alumni groups, clubs and communities: member profiles with your own custom fields, chapters, search and filtering, bulk CSV import/export, renewal tracking, and magic-link self-serve editing so members keep their own profiles current — without you retyping a spreadsheet.

Membership platforms like Glue Up charge hundreds of dollars a month to host what is, at its core, a searchable list of your members. Roster is **$19 once**, runs on a $5 VPS or your own desktop, and your member data never leaves a machine you control.

![Roster screenshot](docs/screenshot.png)

## ☕ Skip the setup — get the 1-click installer

Don't want to touch a terminal? Grab the packaged Windows installer (and support development):

**→ [Get Roster on Whop](https://whop.com/onetime-suite)** — pay once, own it forever.

## Features

- 🪪 **Member profiles** — photo, contact info, bio, status (active / pending / lapsed), join and renewal dates
- 🧩 **Custom fields per organization** — add "Industry", "Membership tier", "LinkedIn", "Graduation year"… text, select or URL types; they appear on cards, in the table, in search and in CSV round-trips
- 🔎 **Real search & filtering** — full-text search across names, emails, bios and every custom field; filter by status, chapter, or exact custom-field value; card and table views
- 🏛️ **Chapters** — sub-listings for multi-chapter orgs, with member counts, auto-created on CSV import
- 📥 **Bulk CSV import/export** — quoted-field-safe parser, unknown columns become custom fields automatically, existing emails update instead of duplicating
- ✉️ **Magic-link self-serve editing** — members request a link by email and edit their own profile; they can never touch their status, renewal date or chapter
- ⏰ **Renewal tracking** — see everyone due in the next N days and send reminder emails (optional SMTP; without SMTP it's a safe no-op)
- 🌐 **Public or private directory** — flip one setting to make the directory browsable by anyone (active members only, admin-only fields stripped) or keep it locked down
- 🌑 Clean dark UI — React + Tailwind + Framer Motion, admin auth with plain session cookies, zero external auth providers, zero telemetry

## Quick start

```bash
npm i
npm run build   # build the React frontend
npm start       # → http://localhost:5367
```

Default admin password is `admin` — copy `.env.example` to `.env` and change `ADMIN_PASSWORD`.

**Run it as a desktop app, or deploy to a $5 VPS when you need it public:**

- `npm run desktop` — Electron window, same app, data in your user profile, auto-logged-in as admin
- `docker compose up -d` — production deployment with a persistent volume for the SQLite database

## Tech stack

Node 20+ · Express · better-sqlite3 · React 18 · Vite · Tailwind CSS 4 · Framer Motion · Lucide · Electron (desktop mode)

## Roster vs Glue Up

| | **Roster** | Glue Up |
|---|---|---|
| Price | **$19 once** | ~$125+/mo (billed annually, per-module pricing) |
| Member data | On your server, SQLite file you can copy | Their cloud |
| Custom fields | Unlimited, free | Plan-gated |
| Members | Unlimited | Priced per contact tier |
| Self-serve profile edits | ✅ magic links | ✅ |
| CSV import/export | ✅ | ✅ |
| Works offline / desktop | ✅ Electron mode | ❌ |
| Source code | MIT, yours | Proprietary |

One year of Glue Up ≈ **$1,500+**. Roster pays for itself before lunch.

## License

MIT © 2026 Ben (bensblueprints)
