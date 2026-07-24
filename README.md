[![Netlify Status](https://api.netlify.com/api/v1/badges/5d9e92c5-364e-4e7d-9a30-fe6609b8eb17/deploy-status)](https://app.netlify.com/projects/rotaractpulse/deploys)

# Pulse · Live Room Q&A

Live rooms where attendees ask questions and upvote the ones that matter.  
**Production site:** https://pulse.rsamdio.org · **Owned by Rotaract South Asia MDIO (RSAMDIO)**

Built on a **narrow Firebase hybrid**: Firestore is the write/ACL source of truth; RTDB serves cheap live-room reads.

Firebase web config is committed in `src/lib/firebase/config.ts` (client keys are public; Auth + security rules protect data). CLI project: `.firebaserc`.

## Features

- Google sign-in
- Roles: organizer / attendee (Firestore `organizers/{uid}` docs; first signed-in user bootstraps if empty)
- Room access modes: **public**, **allowlist**, **join_code**, **hybrid**
- Optional **anonymous rooms** (authors shown as Anonymous)
- Live question board with upvotes (toggle on/off; one vote per person)
- Organizer moderation: delete questions, mark answered
- Organizer controls: lock new questions, view-only, allowlist, join-code rotate, delete room, **CSV export**

## Architecture

```
Client mutations → Cloud Functions → Firestore (truth)
                                 → RTDB mirror (room meta, questions, access bits, userVotes)
Client live reads → RTDB only
Organizer secrets (allowlist / join hashes) → Firestore + Callables only
Organizers → Firestore `organizers/{uid}` (document id = Auth uid)
```

## Production setup

1. Firebase project **rotaractpulse** — Auth (Google), Firestore, RTDB + Functions (`asia-southeast1`).
2. Authorized domains: `pulse.rsamdio.org` (and Netlify domain if used).
3. Web config already in `src/lib/firebase/config.ts`; CLI default in `.firebaserc`.
4. Deploy backend:

```bash
npm run functions:build
firebase deploy --only firestore,database,functions
```

5. Deploy the Next.js app to Netlify (no Firebase env vars needed) and point the domain to **pulse.rsamdio.org**.

## Local setup

```bash
npm install
cd functions && npm install && cd ..
npm run dev
```

Against emulators: set `useFirebaseEmulators = true` in `src/lib/firebase/config.ts`, then run `npm run emulators` and `npm run dev`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Next.js app |
| `npm run build` | Production Next build |
| `npm run emulators` | Auth, Firestore, RTDB, Functions emulators |
| `npm run functions:build` | Compile Cloud Functions |
| `npm run test` | Unit tests |

## Routes

- `/` — sign in
- `/join` — join with a 6-digit code
- `/rooms` — accessible rooms
- `/rooms/new` — create (organizer)
- `/rooms/[id]` — live room
- `/rooms/[id]/join` — room-specific code gate
- `/rooms/[id]/manage` — organizer controls
- `/terms` · `/privacy` — legal
- `/sitemap.xml` · `/robots.txt` — SEO

## Data model

**Room id === slug** (`rooms/{slug}`, `questions/{slug}/…`, RTDB `rooms/{slug}/…`).

### Firestore

| Path | Purpose |
|---|---|
| `users/{uid}` | Profile |
| `organizers/{uid}` | Organizer role |
| `rooms/{slug}` | Room truth |
| `roomAllowlists/{slug}/emails/{email}` | Allowlist |
| `roomMembers/{slug}/members/{uid}` | Membership |
| `questions/{slug}/items/{qid}` | Questions |
| `votes/{slug}/questions/{qid}/users/{uid}` | Votes |
| `joinCodes/{code}` | Code → room slug |

### RTDB

| Path | Purpose |
|---|---|
| `rooms/{slug}/meta` | Live flags |
| `rooms/{slug}/questions/{qid}` | Live board |
| `access/{uid}/{slug}` | Membership bit |
| `userVotes/{uid}/{slug}/{qid}` | Vote flags |
| `publicRoomIndex/{slug}` | Public discovery |
