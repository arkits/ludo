import { useGame } from './hooks/useGame';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import PlayerPanel from './components/PlayerPanel';
import GameControls from './components/GameControls';
import WaitingRoom from './components/WaitingRoom';
import { canEndTurn } from './utils/gameLogic';
import './App.css';

function App() {
  const { state, createRoom, joinRoom, leaveRoom, startGame, rollDice, moveToken, endTurn } = useGame();
  const githubUrl = 'https://github.com/arkits/ludo';

  const handleTokenClick = (playerId: string, tokenId: number) => {
    if (playerId === state.currentPlayerId && state.room?.isPlayerTurn) {
      moveToken(tokenId);
    }
  };

  const handleRollDice = () => {
    if (state.room?.isPlayerTurn && !state.room.hasRolledDice) {
      rollDice();
    }
  };

  const handleEndTurn = () => {
    if (state.room && state.room.currentPlayer) {
      const canEnd = canEndTurn(
        state.room.currentPlayer,
        state.room.diceValue,
        state.room.hasRolledDice
      );
      if (canEnd) {
        endTurn();
      }
    }
  };

  const handleStartGame = () => {
    startGame();
  };

  // Show lobby if not in a room
  if (!state.room) {
    return (
      <div className="app">
        <header className="brand-bar paper-shell torn-paper">
          <div className="logo-stack">
            <div className="logo-wordmark">ludo</div>
            <p className="logo-subline">Old-school board energy, online rooms.</p>
          </div>
          <div className="brand-actions">
            <span className="brand-tag">Create a room and invite with one link.</span>
            <a className="brand-link" href={githubUrl} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
        </header>

        <main className="home-grid">
          <section className="hero-card paper-shell torn-paper">
            <p className="eyebrow">Gather · Roll · Race</p>
            <h1>Play the classic Ludo board with friends, anywhere.</h1>
            <p className="hero-copy">
              Start a table in seconds, share a room link, and keep every move in sync.
              Zero sign-ups—just pick a nickname and roll.
            </p>
            <div className="hero-pills">
              <span>No accounts needed</span>
              <span>Shareable room links</span>
              <span>Classic rules & colors</span>
            </div>
          </section>

          <Lobby onCreateRoom={createRoom} onJoinRoom={joinRoom} />
        </main>

        {state.error && (
          <div className="error-banner">
            {state.error}
          </div>
        )}

        <footer className="app-footer">
          <span>Made for cozy, competitive nights in.</span>
          <a href={githubUrl} target="_blank" rel="noreferrer">
            View on GitHub
          </a>
        </footer>
      </div>
    );
  }

  // Use valid moves from state (calculated in context)
  const validMoves = state.validMoves;

  return (
    <div className="app">
      {state.error && (
        <div className="error-banner">
          {state.error}
        </div>
      )}

      <div className="game-container paper-shell torn-paper">
        <div className="game-header">
          <div className="logo-stack">
            <div className="logo-wordmark">ludo</div>
            <p className="logo-subline">Room vibes · keep the pieces moving</p>
          </div>
          <div className="room-info">
            <span className="room-chip">Room {state.room.roomId}</span>
            <button 
              className="copy-link-btn-header" 
              onClick={() => {
                if (state.room) {
                  const url = new URL(window.location.href);
                  url.searchParams.set('room', state.room.roomId);
                  navigator.clipboard.writeText(url.toString()).then(() => {
                    const button = document.querySelector('.copy-link-btn-header') as HTMLButtonElement;
                    if (button) {
                      const originalText = button.textContent;
                      button.textContent = 'Copied!';
                      setTimeout(() => {
                        button.textContent = originalText;
                      }, 2000);
                    }
                  });
                }
              }}
              title="Copy room link"
            >
              Copy Link
            </button>
            <button onClick={leaveRoom} className="leave-room-btn">Leave Room</button>
          </div>
        </div>

        {state.room.gameState === 'waiting' && (
          <WaitingRoom
            room={state.room}
            currentPlayerId={state.currentPlayerId}
            onStartGame={handleStartGame}
          />
        )}

        {state.room.gameState === 'playing' && (
          <div className="game-play">
            <div className="game-sidebar">
              <div className="players-list">
                {state.room.players.map((player) => (
                  <PlayerPanel
                    key={player.id}
                    player={player}
                    isCurrentTurn={
                      state.room?.players[state.room.currentPlayerIndex]?.id === player.id
                    }
                    isYou={player.id === state.currentPlayerId}
                  />
                ))}
              </div>
            </div>

            <div className="game-main">
              <GameBoard
                players={state.room.players}
                currentPlayerColor={state.room.currentPlayer?.color || null}
                validMoves={validMoves}
                onTokenClick={handleTokenClick}
              />
              <GameControls
                diceValue={state.room.diceValue}
                hasRolledDice={state.room.hasRolledDice}
                isPlayerTurn={state.room.isPlayerTurn}
                isRollingDice={state.isRollingDice}
                canEndTurn={
                  state.room.currentPlayer
                    ? canEndTurn(
                        state.room.currentPlayer,
                        state.room.diceValue,
                        state.room.hasRolledDice
                      )
                    : false
                }
                onRollDice={handleRollDice}
                onEndTurn={handleEndTurn}
                onStartGame={() => {}}
                gameState="playing"
                isRoomCreator={false}
                canStartGame={false}
              />
            </div>
          </div>
        )}

        {state.room.gameState === 'finished' && state.room.winner && (
          <div className="game-finished-screen">
            <h2>Game Finished!</h2>
            <div className="winner-announcement">
              <p>Winner: {state.room.winner.nickname}</p>
              <div className={`winner-color player-${state.room.winner.color}`}>
                <div className="player-color-indicator" />
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="app-footer app-footer-floating">
        <span>Need the repo?</span>
        <a href={githubUrl} target="_blank" rel="noreferrer">
          View on GitHub
        </a>
      </footer>
    </div>
  );
}

export default App;
