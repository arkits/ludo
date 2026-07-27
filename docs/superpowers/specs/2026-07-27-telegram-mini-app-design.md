# Telegram Mini App support for Ludo

**Date:** 2026-07-27
**Status:** Implemented. Deviations from the original design are noted inline
under "Changes during implementation".

## Summary

Add a Telegram-native way to play Ludo: a bot posts a lobby message in a group
chat, members join by tapping buttons in that message, and the game itself runs
in a Telegram Mini App that reuses the existing 3D board. A solo mode against
the existing bot AI is available from the bot's menu button.

Telegram play and web play are separate worlds. They share storage and the rules
engine, but not lobbies: a Telegram match never gets a room code, and a web
player cannot join one.

## Goals

- Play Ludo with a Telegram group: the chat is the lobby.
- Play solo against bots from a private chat with the bot.
- Reuse the existing rules engine and 3D renderer without forking them.
- Authenticated player identity, so turn ownership cannot be spoofed.
- Keep chat noise near zero during an actively played game.

## Non-goals

Explicitly out of scope for this spec:

- Persistent cross-match stats or leaderboards
- Telegram inline mode
- Telegram Stars / payments
- Localization
- Rematch button
- Spectator *features* (chat, spectator list, join-as-spectator). A read-only
  board for non-seated users falls out of `claimSeat` returning no token, but
  nothing is built on top of it.
- The legacy Games platform (`sendGame` / `setGameScore`) — see below

## Platform choice: Mini Apps, not the Games platform

Telegram offers two surfaces for HTML5 games.

| | Games (`sendGame` + `callback_game`) | Mini Apps |
| --- | --- | --- |
| Identity in the page | None. Opens in a plain in-app browser. | `initData`, HMAC-signed with the bot token |
| Container APIs | `TelegramGameProxy` only (`shareScore`, `initParams`) | Theme, viewport, safe-area, BackButton, `expand()` |
| Native scoreboard | Yes (`setGameScore`) | No |
| Status | Legacy | Successor platform |

We use **Mini Apps**. The Games platform's only real advantage is its per-chat
high-score board, and that is a poor fit for Ludo: `setGameScore` takes a single
number, while Ludo's natural statistic is a win count. Meanwhile the Games
platform's plain in-app browser gives no theme integration, no viewport API and
no safe-area insets, all of which matter for the full-screen 3D board.

The Games platform's missing identity is solvable (the bot can mint its own
signed URL token in `answerCallbackQuery`), so this is a choice about container
quality and fit, not about security.

## Architecture

One repository, one Convex deployment. Telegram support is a second entry
surface, not a fork.

**Reused unchanged:** `convex/gameLogic.ts` (pure rules engine),
`convex/validators.ts`, `src/components/three/*`, `src/utils/*`.

**Modified existing files** (small, additive):

- `convex/schema.ts` — the optional fields below
- `convex/rooms.ts` — one guard in `joinRoom` rejecting Telegram matches
- `convex/game.ts` — extract the duplicated turn-advance patch into a single
  `advanceTurn()` helper, then hook the Telegram stamp there (see below)
- `vite.config.ts` — second Rollup input, workbox precache exclusion

**New backend files:**

```
convex/http.ts               POST /telegram/webhook via httpRouter
convex/telegram/verify.ts    initData HMAC verification — pure, unit-testable
convex/telegram/api.ts       thin Bot API client
convex/telegram/webhook.ts   update router: /ludo, callback_query dispatch
convex/telegram/match.ts     lobby mutations/actions for Telegram matches
convex/telegram/notify.ts    internal actions: status-board edits, idle escalation
```

Telegram lobby logic deliberately does **not** go into `convex/rooms.ts`. That
file is already 686 lines, and its concerns — room codes, bcrypt passwords,
anonymous localStorage identity — are exactly the concerns Telegram play does
not have. Threading `if (isTelegram)` through it would degrade both paths.

**New front-end files:**

```
telegram.html                second Vite entry; the BotFather Web App URL
src/telegram-main.tsx
src/TelegramApp.tsx          reuses BoardScene, PlayerPanel, GameControls,
                             TurnBanner, MoveHistory
```

A separate entry rather than runtime detection: web users never download
`telegram-web-app.js`, there is no `if (isTelegram)` branching inside shared
components, and the boundary matches the "separate worlds" decision.

## Data model

Reuse the existing `rooms` and `players` tables rather than adding parallel
Telegram tables. "Separate worlds" is a statement about lobbies, not storage.
Reusing the tables means `rollDiceMutation`, `moveTokenMutation`, `endTurn` and
`botPlay` work for Telegram matches with no changes at all.

Additive optional fields only (no migration required):

```ts
rooms: {
  // ...existing fields
  telegram: v.optional(v.object({
    chatId: v.number(),
    chatType: v.union(v.literal("private"), v.literal("group"),
                      v.literal("supergroup")),
    lobbyMessageId: v.number(),   // also the live status board after start
    statusEditedAt: v.optional(v.number()),
  })),
  turnStartedAt: v.optional(v.number()),
}

players: {
  // ...existing fields
  telegramUserId: v.optional(v.number()),
}
```

The presence of `rooms.telegram` *is* the marker of a Telegram match.

**Separation is enforced by one guard:** `joinRoom` in `convex/rooms.ts` rejects
any room whose `telegram` field is set. Telegram matches are created without a
password and their `roomId` is never surfaced in chat, so there is nothing for a
web player to type in; the guard is defence in depth.

Add index `players.by_roomId_and_telegramUserId` for seat lookup during
`claimSeat`.

## Identity

Rather than teaching every existing mutation to speak `initData`, the Mini App
performs a single exchange at open time.

`claimSeat({ initData, matchId })` is a Convex **action** that:

1. Verifies the `initData` HMAC signature against `TELEGRAM_BOT_TOKEN`
2. Checks `auth_date` freshness (reject if older than 15 minutes — `initData` is
   minted when the app opens, so the window can be tight)
3. Looks up the seat by `telegramUserId` within `matchId`
4. If the seat is currently `isBot: true` (it stalled out), flips it back to
   `isBot: false`
5. Returns that seat's `authToken`

If the verified user holds no seat in that match — a group member who opens the
board without joining, or opens it after the game already started — `claimSeat`
returns `{ seated: false }` rather than an error. The Mini App then renders the
board read-only, with a note pointing back to the chat. This is spectating by
omission, not a spectator feature: it falls out of returning no token, and
requires no extra machinery.

From there the front end uses the **existing** mutation paths verbatim.
`isAuthorized()` in `convex/validators.ts` does not change. Telegram identity is
proven cryptographically at the door, and the already-built per-seat token
carries it for the rest of the session.

It is an `action` rather than a `mutation` specifically because Web Crypto is
guaranteed available in the action runtime; Convex mutations run in a
deterministic environment that should not be relied on for `crypto.subtle`.

## Flows

### Group lobby

`/ludo` in a group creates a room (`gameState: "waiting"`, `telegram.chatId`
set, no password, `maxPlayers: 4`) and posts one message:

```
🎲 Ludo — 2/4
🔴 Archit  🔵 Sam

[ Join ]  [ Leave ]
[ + Bot ] [ Start ]
[ 🎮 Open board ]
```

- `Join`, `Leave`, `+ Bot`, `Start` are `callback_data` buttons handled entirely
  in the webhook. Nobody has to open the app to join.
- `Open board` is a `url` button to `t.me/<bot>/play?startapp=<matchId>`.
  A `url` button is required here because `web_app`-type inline keyboard buttons
  only work in private chats.
- Every callback edits the same message in place to refresh the roster.
- On `Start`, that same message becomes the live status board. No second message
  is ever posted.

`Start` and `+ Bot` require `callback_query.from.id` to match
`players[0].telegramUserId` (the host). `Join` and `Leave` are open to any chat
member.

### Live status board and turn pings

Every turn advance stamps `rooms.turnStartedAt = Date.now()` and schedules
`checkIdle(roomId, expectedTurnStartedAt)` at +60s.

`convex/game.ts` currently advances the turn in four places — `applyRollToRoom`
(third six), `applyMoveAndAdvance`, `endTurn`, and `botPlay`'s no-valid-moves
branch — each patching `currentPlayerIndex`, `hasRolledDice`, `diceValue` and
`consecutiveSixes` by hand. Extract that into a single `advanceTurn(ctx, room,
players, nextIndex)` helper and hook the Telegram stamp there, so there is
exactly one place a turn can change. This refactor is a prerequisite, not an
optional cleanup: four independent hook sites would be a standing source of
missed pings.

- **`checkIdle`** — if `turnStartedAt` still equals `expectedTurnStartedAt`, the
  turn has not moved. Send a real ping message (`@alice, your turn`) and schedule
  `checkStalled` at +60s. Telegram users do not necessarily have a username, so
  the ping uses a `text_mention` entity carrying the numeric user ID rather than
  an `@handle` in the text — this works for every user and needs no username.
- **`checkStalled`** — if still matching, patch the seat `isBot: true`, clear its
  `authToken`, and schedule `internal.game.botPlay`.
- **Reclaim** — `claimSeat` flips the seat back to `isBot: false` and returns a
  fresh `authToken`.

The `turnStartedAt` fingerprint is the entire concurrency story: stale timers
self-invalidate by comparison, so nothing needs cancelling. And `botPlay`
already returns early unless the current seat is `isBot`
(`convex/game.ts:368`), so a player reclaiming their seat mid-flight turns any
pending scheduled `botPlay` into a silent no-op. No new cancellation machinery
is needed.

Because edits do not generate notifications, an actively played game produces
zero chat noise. Only genuine stalls ping.

Status-board edits are throttled via `telegram.statusEditedAt` with a 3-second
floor; a suppressed edit schedules a trailing one so the board never ends up
stale. `editMessageText` returning `message is not modified` is treated as
success — Telegram returns a 400 rather than a no-op for identical text.

### Solo

Solo needs no chat coordination, so it gets none. The bot's menu button
(`setChatMenuButton`) opens the Mini App directly, and `/play` in a private chat
posts the same button as a fallback. `createSoloMatch({ initData, botCount })`
builds the room from inside the app.

No lobby message, no status board, no pings: `chatType === "private"`
short-circuits `notify.ts` entirely.

## Mini App front end

`telegram.html` loads `https://telegram.org/js/telegram-web-app.js` as a
non-module script in `<head>`, before the app bundle. Vite is configured with
multiple `rollupOptions.input` entries.

Boot sequence in `TelegramApp`:

1. `WebApp.ready()`
2. `WebApp.expand()`
3. `WebApp.disableVerticalSwipes()` — load-bearing. Without it, a vertical drag
   on the 3D board closes the Mini App.
4. `themeParams` mapped onto CSS custom properties; set `backgroundColor`
5. `contentSafeAreaInset` fed into the camera view-offset added in 684e5cf
6. `BackButton` wired to leave the match
7. `matchId` read from `initDataUnsafe.start_param`, then `claimSeat`

`Lobby` and `WaitingRoom` are replaced by a thin "waiting in chat" screen — the
chat is the lobby, so the Mini App has nothing to add there.

**PWA:** `telegram.html` is excluded from the workbox precache glob and does not
register the service worker. A stale service worker inside the Telegram webview
is very hard to clear because users have no hard-refresh.

## Security

- **Webhook authentication.** `setWebhook` is called with a `secret_token`. The
  endpoint constant-time compares the `X-Telegram-Bot-Api-Secret-Token` header
  and returns 401 on mismatch.
- **initData verification.** Secret key is `HMAC_SHA256(bot_token, "WebAppData")`;
  the expected hash is `HMAC_SHA256(data_check_string, secret_key)` where
  `data_check_string` is the alphabetically sorted `key=value` pairs (excluding
  `hash`) joined by `\n`. Compared in constant time. `auth_date` freshness
  enforced at 15 minutes.
- **Bot token.** Stored only in Convex env (`npx convex env set
  TELEGRAM_BOT_TOKEN ...`). Never bundled into the front end.
- **Callback authorization.** `callback_query.from.id` is authenticated by
  Telegram and trusted for Join/Leave. Start and `+ Bot` additionally check
  host ownership.
- **`answerCallbackQuery` is always called**, including on error paths, or the
  client's button spins indefinitely.
- **Rate limiting.** `claimSeat` is rate-limited per Telegram user ID.
- **Logging.** `initData` and the bot token are never logged.

## Testing

- **`convex/telegram/verify.test.ts`** — `verify.ts` is pure, so it table-tests
  against a fixture `initData` signed with a dummy token: valid, tampered field,
  wrong hash, missing hash, stale `auth_date`.
- **Webhook dispatch** — the update router takes the Bot API client as a
  parameter, so tests drive fixture `Update` JSON objects with a stub client and
  hit no network.
- **Idle escalation** — extracted as a pure `nextIdleAction(room, now)` returning
  a discriminated union (`"wait" | "ping" | "handoff"`), table-tested.
- **Existing suites** — `gameLogic.test.ts`, `tokenPath.test.ts`,
  `worldCoords.test.ts` must continue to pass; the rules engine is untouched.

All tests use vitest, matching the existing pattern.

**Manual testing:** Convex serves HTTP actions on a public
`https://<deployment>.convex.site` URL, so a BotFather test bot can point
straight at the dev deployment. No ngrok or tunnel is needed.

## Changes during implementation

Everything above was built as designed, with these additions:

- **`convex/roomId.ts`** — room-ID generation was private to `rooms.ts`.
  Telegram matches need it too, so it was extracted rather than duplicated,
  where the two copies could drift on format or collision handling.
- **`convex/telegram/hooks.ts`** — the turn-change bookkeeping is shared by
  `game.ts` (ordinary turns) and `match.ts` (the first turn of a match), so it
  lives in its own module rather than inside either. It also short-circuits on
  `chatType === "private"`: a solo match has no message to edit and nobody kept
  waiting, so scheduling those two functions per turn would be pure waste.
- **`convex/telegram/config.ts`** — env reads collected in one place instead of
  scattered `process.env` lookups.
- **`convex/env.d.ts`** — `convex/` is typechecked alongside `src/` under a DOM
  lib (tsconfig.app.json), which has no Node globals. Declaring just
  `process.env` keeps `@types/node` out of the front-end type space.
- **Status board shows per-player progress** (`2/4 home`) rather than a move
  counter. `moveHistory` is capped at 50 entries, so a counter derived from it
  would silently start lying in a long game.
- **Solo matches resume.** `createSoloMatch` returns the player's existing
  unfinished solo match if there is one, so closing and reopening the Mini App
  continues the game instead of discarding it.
- **Public actions carry explicit return type annotations.** A Convex action
  that calls a mutation in its own module otherwise infers a circular type
  through the generated api.
- **`registerSW` moved into `src/main.tsx`** with `injectRegister: null`.
  vite-plugin-pwa injects its registration into *every* HTML entry, which would
  have given the Mini App a service worker. `navigateFallbackDenylist` was also
  needed, or the SPA fallback would answer `/telegram.html` with the precached
  `index.html` shell.

## Verification performed

- `npx vitest run` — 108 tests pass, 61 of them new (initData verification,
  idle escalation, message rendering, update routing).
- `npx tsc -b` and `npm run build` clean; both entries emit.
- `npm run lint` — 0 errors (4 pre-existing warnings in `convex/_generated/`).
- `dist/sw.js` confirmed to exclude `telegram.html` from precache and to carry
  the navigate-fallback denylist.
- End-to-end against the dev deployment with a throwaway bot token and
  correctly-signed `initData`: solo match created, seat claimed, board mounted
  with all four seats. An unsigned payload was rejected with
  "Bot token is not configured", confirming the failure path surfaces to the
  UI. The throwaway token was removed afterwards.

Not verified: the bot half needs a real BotFather token and a public webhook,
so group lobby, turn pings and idle handoff have unit coverage but have not
been exercised against live Telegram.

## Setup checklist

1. `/newbot` in BotFather → bot token
2. `/newapp` → direct-link Mini App, Web App URL set to
   `https://<domain>/telegram.html`. The short name chosen here must match
   `TELEGRAM_APP_SHORT_NAME` below; the two form the `t.me/<bot>/<short-name>`
   link behind "Open board".
3. `setChatMenuButton` → opens the Mini App (for solo)
4. Set the four Convex environment variables:

   ```
   npx convex env set TELEGRAM_BOT_TOKEN      <token from BotFather>
   npx convex env set TELEGRAM_BOT_USERNAME   <bot username, no @>
   npx convex env set TELEGRAM_APP_SHORT_NAME <short name from /newapp>
   npx convex env set TELEGRAM_WEBHOOK_SECRET <any random string>
   ```

   `TELEGRAM_BOT_USERNAME` and `TELEGRAM_APP_SHORT_NAME` build the "Open board"
   link. Neither has a default, and `isConfigured()` requires both: a guessed
   short name yields a link that looks valid and silently goes nowhere. The
   webhook returns 503 until all of them are set.
5. `setWebhook` → `https://<deployment>.convex.site/telegram/webhook` with
   `secret_token`
6. `/setjoingroups` enabled, and either disable privacy mode via
   `/setprivacy` or make the bot an admin - otherwise it never sees `/ludo` in
   a group
