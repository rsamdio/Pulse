<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Pulse — agent notes

**Pulse** is a live room product for Q&A and audience engagement (Ask + Engage), owned by **Rotaract South Asia MDIO (RSAMDIO)**.  
Production URL: `https://pulse.rsamdio.org`

## Stack

- **Web:** Next.js 16 (App Router) + React 19 + Tailwind 4 · Netlify
- **Backend:** Firebase Auth (Google), Firestore, RTDB, Cloud Functions (`asia-southeast1`)
- **Pattern:** Client mutations → Callables → Firestore (truth) → RTDB mirror; live reads from RTDB only

## Product model

- **Rooms** (not events): `rooms/{slug}`, `roomAllowlists`, `roomMembers`, RTDB `rooms/{slug}`, `publicRoomIndex`
- Access modes: `public` | `allowlist` | `join_code` | `hybrid`
- Flags: `questionsLocked`, `viewOnly`, `anonymous`
- Roles: `admins/{uid}` (super admin) · `organizers/{uid}` · attendees; first signed-in user bootstraps as admin+organizer
- Callables use `roomId` (e.g. `createRoom`, `listAccessibleRooms`, `getRoomAccess`, `deleteRoom`); `promoteUser`/`demoteUser`/`listAdminDashboard` are admin-only
- Admin UI: `/admin` (noindex) — organizers, all rooms, delete; room Ask/Engage via Open/Manage (admin has organizer powers on every room)
- Room tabs: **Ask** (Q&A board) · **Engage** (MCQ / word cloud / open text; drafts queue with `sortOrder`; timers + auto-advance optional)
- **Present** (noindex): `/rooms/[roomId]/present` — audience-safe projection; share this window only. No Peek/manage chrome
- Engage lifecycle: Reveal ≠ Close; `resultsRevealed`; Hide until closed redacts public tallies; host Peek via `rooms/{slug}/private/engagementResults`
- Engage private RTDB: `rooms/{slug}/private` is a **sibling** of `engagements` (never nest under it — RTDB read rules cascade). Holds Peek tallies + `draftQueue`. Readable by room `organizerId` or `platformAdmins/{uid}`
- Engage control: Firestore `engageControl/{roomId}` mirrored to RTDB `rooms/{slug}/engageControl` (`phase`: idle|live|grace|held). Expiry: host/Present `setTimeout` + Cloud Tasks backstop (no Cloud Scheduler)

## Key paths

| Area | Location |
|---|---|
| App routes | `src/app/` (`/`, `/join`, `/rooms`, `/admin`, `/rooms/[id]/present`, `/terms`, `/privacy`) |
| UI components | `src/components/` (`EngagementPane`, `ManageEngagements`, `PresentClient`, `ManageMembers`, …) |
| Client API | `src/lib/api.ts` |
| Types | `src/lib/types.ts` |
| Live room hook | `src/lib/hooks/useRoom.ts` |
| Engage hooks | `useEngagements`, `useEngageControl`, `usePresentRoom`, `useEngagementExpiry` |
| Functions | `functions/src/index.ts`, `mirror.ts`, `logic.ts` |
| Rules | `firestore.rules`, `database.rules.json` |

## Branding / SEO

- Product name in UI: **Pulse** (logo: `/rsamdio.webp`)
- Copyright: **© YEAR RSAMDIO**
- Meta/OG titles include Rotaract South Asia MDIO; do **not** put MDIO text in **header** UI
- Landing page (`/`) may show RSAMDIO / Rotaract South Asia MDIO in **body** copy; server-rendered for crawlers with Organization / WebSite / WebApplication (+ FAQ) JSON-LD and `areaServed: South Asia`
- `metadataBase`: `https://pulse.rsamdio.org` · OG asset `/og.png` (1200×630) · favicons in `public/`
- Sitemap/robots: public pages only (`/`, `/join`, `/terms`, `/privacy`); `/rooms` and `/admin` are `noindex`

## Conventions

- Prefer **room** terminology in code and copy (not event)
- No em dashes in user-facing copy
- Firebase web config lives in `src/lib/firebase/config.ts` (public; no `.env` for Firebase)
- Project id for CLI: `.firebaserc` (`rotaractpulse`)
- Client must not write Firestore/RTDB directly for mutations (Callables only)

## Commands

```bash
npm run dev
npm run build
npm test
npm run functions:build
npm run emulators
firebase deploy --only firestore,database,functions
```
