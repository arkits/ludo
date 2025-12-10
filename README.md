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

