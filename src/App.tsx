import { useGame } from './hooks/useGame';
import { useOpponentRolling } from './hooks/useOpponentRolling';
import Lobby from './components/Lobby';
import BoardScene from './components/three/BoardScene';
import PlayerPanel from './components/PlayerPanel';
import GameControls from './components/GameControls';
import WaitingRoom from './components/WaitingRoom';
import MoveHistory from './components/MoveHistory';
import TurnBanner from './components/TurnBanner';
import ScreenTransition from './components/ScreenTransition';
import { canEndTurn } from './utils/gameLogic';
import './App.css';

function App() {
  const { state, createRoom, joinRoom, leaveRoom, startGame, rollDice, moveToken, endTurn, updatePlayer, addBot, removeBot } = useGame();
  const opponentRolling = useOpponentRolling(
    state.room?.hasRolledDice ?? false,
    state.room?.isPlayerTurn ?? false
  );

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
        <ScreenTransition screenKey="lobby">
          <Lobby onCreateRoom={createRoom} onJoinRoom={joinRoom} />
        </ScreenTransition>
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
            <div className="brand-lockup">
              <h1 className="logo logo-link" onClick={handleLogoClick}>Ludo</h1>
              <span className="brand-edition">Tabletop</span>
            </div>
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

        <ScreenTransition screenKey={state.room.gameState}>
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
          <div className={`game-play turn-${state.room.currentPlayer?.color || 'red'}`}>
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
              {state.room.currentPlayer && (
                <div
                  key={state.room.currentPlayer.id}
                  className={`turn-marquee player-${state.room.currentPlayer.color}`}
                  role="status"
                  aria-live="polite"
                >
                  <span className="turn-marquee-dot" />
                  <span className="turn-marquee-label">Now playing</span>
                  <strong>{state.room.currentPlayer.nickname}</strong>
                  {state.room.currentPlayer.id === state.currentPlayerId && <span className="turn-you">Your turn</span>}
                </div>
              )}
              <div className="board-stage">
                {state.room.currentPlayer && (
                  <TurnBanner
                    key={state.room.currentPlayer.id}
                    playerName={state.room.currentPlayer.nickname}
                    color={state.room.currentPlayer.color}
                    isYou={state.room.currentPlayer.id === state.currentPlayerId}
                  />
                )}
                <BoardScene
                  players={state.room.players}
                  currentPlayerColor={state.room.currentPlayer?.color || null}
                  validMoves={validMoves}
                  onTokenClick={handleTokenClick}
                  diceValue={state.room.diceValue}
                  isRollingDice={state.isRollingDice || opponentRolling}
                  activeCorner={state.room.currentPlayer?.color || null}
                />
              </div>
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
                currentPlayerColor={state.room.currentPlayer?.color}
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
        </ScreenTransition>
      </div>
    </div>
  );
}

export default App;
