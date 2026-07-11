# Launch strategy — Roster

## Target communities

- **r/nonprofit** — angle: "we replaced our membership-management quote with a $19 self-hosted directory"; no self-promo threads on weekdays — post as a cost-saving write-up with the repo linked, disclose you built it.
- **r/selfhosted** — perfect fit; lead with Docker one-liner + SQLite portability. Show the compose file in the post.
- **r/Alumni / university ops Facebook groups** — alumni directory angle; emphasize magic-link self-editing (stale data is their #1 complaint).
- **r/ClubOfficers / fraternity & sorority ops groups** — chapters feature maps 1:1 to their world.
- **Hacker News** — see Show HN below.
- **Indie Hackers** — build-in-public post: "Why membership software costs $100/mo and what it took to replace it in a weekend."

## Show HN draft

**Title:** Show HN: Roster – self-hosted member directory (pay once, no per-member fees)

Membership platforms (Glue Up, Wild Apricot, etc.) price per member per month to host what is mostly a searchable list. Roster is the directory part, self-hosted: Node + SQLite + React, custom fields per org, chapters, full-text search, bulk CSV import/export (unknown columns become custom fields), renewal tracking, and magic-link self-serve editing so members maintain their own profiles.

Design choices HN might care about: single process serving API + built frontend; better-sqlite3 so backup = copying one file; no external auth (session cookie + password, magic links for members); optional SMTP — everything degrades to safe no-ops without it; MIT.

I sell a packaged installer for people who don't want to touch a terminal, but the source is all here.

## SEO keywords

1. glue up alternative
2. member directory software free
3. association management software self hosted
4. alumni directory tool
5. self hosted membership database
6. club member directory app
7. wild apricot alternative one time
8. membership directory with custom fields
9. searchable member directory website
10. member self service profile update

## AppSumo / PitchGround pitch

Roster is a self-hosted member directory that replaces per-member monthly membership platforms with a $19 one-time purchase. Associations, alumni groups and clubs get profiles with unlimited custom fields, chapters, powerful search, bulk CSV import/export, renewal tracking with email reminders, and magic-link self-serve editing that keeps the roster clean without admin work. It deploys with one Docker command or runs as a Windows desktop app, stores everything in a single SQLite file the customer owns, and ships MIT-licensed source — the anti-SaaS deal your audience buys on principle.

## Pricing math

**$19 one-time.** Glue Up-class platforms start around $125/mo — Roster pays for itself in **under 5 days**. Even against Wild Apricot's cheapest tier ($60/mo), it pays for itself in 10 days.
