# Product Hunt launch — Roster

**Name:** Roster

**Tagline (60 chars):** Self-hosted member directory. Pay once, own your roster.

**Description (260 chars):**
Roster is a self-hosted member directory for associations, alumni groups and clubs. Profiles with custom fields, search & filters, chapters, CSV import/export, renewal tracking and magic-link self-editing. $19 once — no per-member monthly platform fees.

**Full description:**
Membership platforms charge per-member monthly fees to host what is essentially a searchable spreadsheet. Roster replaces that with a $19 one-time purchase you run yourself.

- Member profiles: photo, bio, status, join & renewal dates
- Custom fields per org (industry, tier, LinkedIn, class year — text/select/URL)
- Search across everything, filter by status/chapter/field, card or table view
- Chapters with member counts (auto-created on import)
- Bulk CSV import/export — unknown columns become custom fields automatically
- Magic-link self-serve editing: members keep their own profiles current
- Renewal tracking + optional SMTP reminders
- Public or private directory, one toggle
- Runs as a desktop app (Electron) or on a $5 VPS (Docker included)

100% local data. SQLite file you can back up with `cp`. MIT-licensed source.

**Maker first comment:**
Hi PH 👋 I run a few community groups and got a quote for membership-management software that was more per month than our whole hosting budget for the year — to store names, emails and a "class of" field. So I built Roster: the searchable directory part of those platforms, self-hosted, with the two features that actually matter in practice — bulk CSV import (your data is already in a spreadsheet, let's be honest) and magic links so members fix their own outdated job titles instead of emailing you. $19 once. Happy to answer anything!

**Gallery shots:**
1. Directory card view, dark UI, search bar active with results filtered ("designer")
2. Member profile edit modal showing custom fields (Membership tier select, LinkedIn URL)
3. CSV import modal with a pasted spreadsheet and "Imported 240, updated 0, skipped 2" result
4. Member-facing magic-link edit page on mobile width
5. Settings panel: public/private toggle + renewals-due-in-30-days list
