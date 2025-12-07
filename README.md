# Ludo Multiplayer Web App

A real-time multiplayer Ludo game built with React and Node.js/Socket.io.

## Features

- Real-time multiplayer gameplay (2-4 players)
- Room-based system with password protection
- Anonymous play with nicknames
- Classic Ludo rules implementation
- Responsive UI with animations

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express + Socket.io
- **State Management**: React Context API
- **Styling**: CSS Modules

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm (v9 or higher)

### Installation

1. Clone the repository
2. Install all dependencies (this is a monorepo using npm workspaces):

```bash
npm install
```

This will install dependencies for both `client` and `server` workspaces.

### Running the Application

**Option 1: Run both client and server together**

```bash
npm run dev
```

This starts both the server and client concurrently. Note: On Windows, you may need to run them separately (see Option 2).

**Option 2: Run separately**

Start the server:
```bash
npm run dev:server
# or
cd server && npm run dev
```

The server will run on `http://localhost:3001`

Start the client (in a new terminal):
```bash
npm run dev:client
# or
cd client && npm run dev
```

The client will run on `http://localhost:5173`

3. Open your browser and navigate to `http://localhost:5173`

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

This is a monorepo using npm workspaces:

```
ludo/
├── client/          # React frontend workspace
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── contexts/    # React contexts
│   │   ├── hooks/       # Custom hooks
│   │   ├── types/       # TypeScript types
│   │   └── utils/       # Utility functions
│   └── package.json
├── server/          # Node.js backend workspace
│   ├── src/
│   │   ├── models/      # Data models
│   │   ├── game/         # Game logic
│   │   ├── socket/       # Socket.io handlers
│   │   └── server.ts     # Server entry point
│   └── package.json
├── package.json     # Root workspace configuration
└── README.md
```

## Development

### Building for Production

Build all workspaces:
```bash
npm run build
```

Build specific workspace:
```bash
npm run build:client
npm run build:server
```

Or build from within the workspace:
```bash
cd client && npm run build
cd server && npm run build
```

### Linting

Lint all workspaces:
```bash
npm run lint
```

Lint specific workspace:
```bash
cd client && npm run lint
cd server && npm run lint
```

### Workspace Scripts

Run scripts in specific workspaces:
```bash
# Run script in client workspace
npm run <script> --workspace=client

# Run script in server workspace
npm run <script> --workspace=server

# Run script in all workspaces
npm run <script> --workspaces
```

## License

MIT

