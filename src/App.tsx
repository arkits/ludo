import { useGame } from './hooks/useGame';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import PlayerPanel from './components/PlayerPanel';
import GameControls from './components/GameControls';
import WaitingRoom from './components/WaitingRoom';
import MoveHistory from './components/MoveHistory';
import { canEndTurn } from './utils/gameLogic';
import './App.css';

function App() {
  const { state, createRoom, joinRoom, leaveRoom, startGame, rollDice, moveToken, endTurn, updatePlayer, addBot, removeBot } = useGame();

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

  const handleLogoClick = () => {
    // Leave room if in one
    if (state.room) {
      leaveRoom();
    }
    // Clear URL parameters
    window.history.pushState({}, '', window.location.pathname);
  };

  // Show lobby if not in a room
  if (!state.room) {
    return (
      <div className="app">
        <Lobby onCreateRoom={createRoom} onJoinRoom={joinRoom} />
        {state.error && (
          <div className="error-banner">
            {state.error}
          </div>
        )}
      </div>
    );
  }

  // Show game if in room

  // Use valid moves from state (calculated in context)
  const validMoves = state.validMoves;

  return (
    <div className="app">
      {state.error && (
        <div className="error-banner">
          {state.error}
        </div>
      )}

      <div className="game-container">
        {state.room.gameState !== 'waiting' && (
          <div className="game-header">
            <h1 className="logo logo-link" onClick={handleLogoClick}>Ludo</h1>
            <div className="room-info">
              <span>Room: {state.room.roomId}</span>
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
        )}

        {state.room.gameState === 'waiting' && (
          <WaitingRoom
            room={state.room}
            currentPlayerId={state.currentPlayerId}
            onStartGame={handleStartGame}
            onUpdatePlayer={updatePlayer}
            onLeaveRoom={leaveRoom}
            onAddBot={addBot}
            onRemoveBot={removeBot}
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
              <MoveHistory history={state.room.moveHistory} />
            </div>

            <div className="game-main">
              <GameBoard
                players={state.room.players}
                currentPlayerColor={state.room.currentPlayer?.color || null}
                validMoves={validMoves}
                onTokenClick={handleTokenClick}
              >
              </GameBoard>
              <GameControls
                hasRolledDice={state.room.hasRolledDice}
                isPlayerTurn={state.room.isPlayerTurn}
                isRollingDice={state.isRollingDice}
                diceValue={state.room.diceValue}
                validMoves={validMoves}
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
                onStartGame={() => { }}
                onMoveToken={(tokenId) => moveToken(tokenId)}
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
    </div>
  );
}

export default App;
