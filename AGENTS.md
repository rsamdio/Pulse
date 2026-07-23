<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Pulse — agent notes

**Pulse** is a live room Q&A product owned by **Rotaract South Asia MDIO (RSAMDIO)**.  
Production URL: `https://pulse.rsamdio.org`

## Stack

- **Web:** Next.js 16 (App Router) + React 19 + Tailwind 4 · Netlify
- **Backend:** Firebase Auth (Google), Firestore, RTDB, Cloud Functions (`asia-southeast1`)
- **Pattern:** Client mutations → Callables → Firestore (truth) → RTDB mirror; live reads from RTDB only

## Product model

- **Rooms** (not events): `rooms/{slug}`, `roomAllowlists`, `roomMembers`, RTDB `rooms/{slug}`, `publicRoomIndex`
- Access modes: `public` | `allowlist` | `join_code` | `hybrid`
- Flags: `questionsLocked`, `viewOnly`, `anonymous`
- Roles: `organizers/{uid}` · first signed-in user can bootstrap as organizer
- Callables use `roomId` (e.g. `createRoom`, `listAccessibleRooms`, `getRoomAccess`, `deleteRoom`)

## Key paths

| Area | Location |
|---|---|
| App routes | `src/app/` (`/`, `/join`, `/rooms`, `/terms`, `/privacy`) |
| UI components | `src/components/` |
| Client API | `src/lib/api.ts` |
| Types | `src/lib/types.ts` |
| Live room hook | `src/lib/hooks/useRoom.ts` |
| Functions | `functions/src/index.ts`, `mirror.ts`, `logic.ts` |
| Rules | `firestore.rules`, `database.rules.json` |

## Branding / SEO

- Product name in UI: **Pulse** (logo: `/rsamdio.webp`)
- Copyright: **© YEAR RSAMDIO**
- Meta/OG titles include Rotaract South Asia MDIO; do **not** put MDIO text in header/footer UI
- `metadataBase`: `https://pulse.rsamdio.org` · assets `/og.png`, favicons in `src/app/` + `public/`
- Sitemap/robots: public pages only; `/rooms` is `noindex`

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
