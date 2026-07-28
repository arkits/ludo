# Ludo Multiplayer Web App

A real-time multiplayer Ludo game built with React and Convex.

## Features

- Real-time multiplayer gameplay (2-4 players)
- Room-based system with password protection
- Anonymous play with nicknames
- Classic Ludo rules implementation
- Responsive UI with animations

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Convex (real-time database and backend)
- **State Management**: React Context API + Convex React hooks
- **Styling**: CSS Modules

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm (v9 or higher)

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Set up Convex:
   - Create a Convex account at [convex.dev](https://convex.dev)
   - Run `npx convex dev` to initialize your Convex project
   - This will create a `.env.local` file with your `VITE_CONVEX_URL`

### Running the Application

1. Start the Convex backend (in one terminal):
```bash
npx convex dev
```

2. Start the development server (in another terminal):
```bash
npm run dev
```

The application will run on `http://localhost:5173`

**Note**: Make sure you have set up your Convex project and have the `VITE_CONVEX_URL` environment variable configured.

## Telegram Mini App (optional)

The game can also run as a [Telegram Mini App](https://core.telegram.org/bots/webapps):
a bot posts a lobby message in a group chat, members join by tapping buttons in
that message, and the game itself opens in Telegram's Mini App container. A solo
mode against bots is available from the bot's menu button.

Telegram matches are separate from web rooms — they never get a room code, and
a web player cannot join one. Player identity comes from Telegram's signed
`initData` rather than the anonymous localStorage id the web app uses.

Served from `telegram.html`, a second Vite entry, so web visitors never download
the Telegram SDK. Design notes:
[docs/superpowers/specs/2026-07-27-telegram-mini-app-design.md](docs/superpowers/specs/2026-07-27-telegram-mini-app-design.md).

### Setup

1. Create a bot with [@BotFather](https://t.me/botfather) (`/newbot`), then
   `/newapp` to create a direct-link Mini App pointing at
   `https://<your-domain>/telegram.html`. Note the short name you choose — it
   must match `TELEGRAM_APP_SHORT_NAME` below, since together they form the
   `t.me/<bot>/<short-name>` link the "Open board" button uses.
2. Configure the Convex deployment:

```bash
npx convex env set TELEGRAM_BOT_TOKEN <token-from-botfather>
```

```bash
npx convex env set TELEGRAM_BOT_USERNAME <bot-username-without-@>
```

```bash
npx convex env set TELEGRAM_APP_SHORT_NAME <mini-app-short-name>
```

```bash
npx convex env set TELEGRAM_WEBHOOK_SECRET <any-random-string>
```

3. Point Telegram at the webhook. Convex serves HTTP actions on a public
   `.convex.site` URL, so no tunnel is needed even in development:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" -d "url=https://<deployment>.convex.site/telegram/webhook" -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" -d 'allowed_updates=["message","callback_query","inline_query","chosen_inline_result"]'
```

`allowed_updates` is a replace, not a merge — omitting `inline_query` or
`chosen_inline_result` silently disables inline mode.

4. In BotFather, enable `/setjoingroups` so the bot can be added to groups.
   Privacy mode can stay on — commands and callback queries both reach the bot
   regardless.
5. For inline mode (starting a game without adding the bot to the chat), enable
   both `/setinline` (any placeholder text) and **`/setinlinefeedback`**. The
   second one is not optional: without it Telegram never sends
   `chosen_inline_result`, so the bot never learns the `inline_message_id` and
   the game it just created would be unreachable.

### Ways to start a game

| | How | Turn pings |
| --- | --- | --- |
| Group | Add the bot, send `/ludo` | Yes |
| Any chat | Type `@yourbot ` and pick the result | **No** |
| Solo | `/play`, or the bot's menu button | n/a |

Inline mode posts the game as a message from *you*, so the bot is never added
to the chat. The trade-off is structural: an inline message carries no chat id,
so the bot can edit that message forever but can never send a new one into the
chat. Those games still show a live status board and still hand a stalled seat
to the AI — they just cannot ping anyone first.

## How to Play

1. **Create a Room**: Enter your nickname and optionally set a password
2. **Join a Room**: Enter the room ID, your nickname, and password if required
3. **Start the Game**: The room creator can start the game when 2+ players have joined
4. **Play**: Roll the dice, move your tokens, and be the first to get all 4 tokens home!

## Game Rules

- Roll a 6 to move a token from home to the board
- Rolling a 6 gives you an extra turn
- Landing on an opponent's token sends it back to their home
- Safe zones (star squares) protect tokens from capture
- First player to get all 4 tokens home wins

## Project Structure

```
ludo/
├── src/             # React frontend source
│   ├── components/  # UI components
│   ├── contexts/    # React contexts
│   ├── hooks/       # Custom hooks
│   ├── types/       # TypeScript types
│   └── utils/       # Utility functions
├── convex/          # Convex backend functions
│   ├── game.ts      # Game state management
│   ├── gameLogic.ts # Game logic
│   ├── rooms.ts     # Room management
│   ├── password.ts  # Password utilities
│   └── schema.ts    # Database schema
├── package.json
└── README.md
```

## Development

### Building for Production

Build the application:
```bash
npm run build
```

This will compile TypeScript and build the Vite bundle for production.

### Linting

Lint the codebase:
```bash
npm run lint
```

### Deploying

1. Deploy your Convex backend:
```bash
npx convex deploy
```

2. Build and deploy your frontend to your preferred hosting platform (Vercel, Netlify, etc.)

## License

MIT

