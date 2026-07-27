import { useState } from 'react';
import { GameProvider } from './contexts/GameContext';
import { useGame } from './hooks/useGame';
import { useOpponentRolling } from './hooks/useOpponentRolling';
import { useTelegramSession } from './telegram/useTelegramSession';
import { getWebApp, haptic } from './telegram/webApp';
import BoardScene from './components/three/BoardScene';
import GameControls from './components/GameControls';
import TurnBanner from './components/TurnBanner';
import { canEndTurn } from './utils/gameLogic';
import type { Player } from './types/game';
import './App.css';
import './TelegramApp.css';

/**
 * The Mini App shell.
 *
 * The chat is the lobby, so there is no join form and no room code here - a
 * player arrives already seated, or with nothing to do but watch. What is left
 * is the board itself, which is the same 3D scene the web app renders.
 */

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="tg-notice">
      <h1 className="tg-notice-title">{title}</h1>
      <p className="tg-notice-body">{body}</p>
    </div>
  );
}

function Splash() {
  return (
    <div className="tg-notice">
      <div className="tg-spinner" aria-label="Loading" />
    </div>
  );
}

function SoloMenu({ onStart }: { onStart: (botCount: number) => void }) {
  const [botCount, setBotCount] = useState(3);

  return (
    <div className="tg-notice">
      <h1 className="tg-notice-title">Ludo</h1>
      <p className="tg-notice-body">Play against bots, or add the bot to a group chat to play with friends.</p>

      <div className="tg-solo-picker">
        <span className="tg-solo-label">Opponents</span>
        <div className="tg-solo-options">
          {[1, 2, 3].map((count) => (
            <button
              key={count}
              type="button"
              className={`tg-solo-option${botCount === count ? ' is-selected' : ''}`}
              onClick={() => {
                setBotCount(count);
                haptic('light');
              }}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="tg-primary-btn" onClick={() => onStart(botCount)}>
        Start game
      </button>
    </div>
  );
}

/** Compact horizontal player strip - the sidebar does not fit a phone. */
function PlayerStrip({
  players,
  currentPlayerIndex,
  youId,
}: {
  players: Player[];
  currentPlayerIndex: number;
  youId: string | null;
}) {
  return (
    <div className="tg-player-strip">
      {players.map((player, index) => {
        const finished = player.tokens.filter((t) => t.isFinished).length;
        return (
          <div
            key={player.id}
            className={`tg-player-chip player-${player.color}${index === currentPlayerIndex ? ' is-turn' : ''}`}
          >
            <span className="tg-player-dot" />
            <span className="tg-player-name">
              {player.id === youId ? 'You' : player.nickname}
            </span>
            <span className="tg-player-progress">{finished}/4</span>
          </div>
        );
      })}
    </div>
  );
}

function WaitingInChat({ players }: { players: Player[] }) {
  return (
    <div className="tg-notice">
      <h1 className="tg-notice-title">Waiting to start</h1>
      <p className="tg-notice-body">
        {players.length === 1
          ? 'You are the only player so far. Head back to the chat to invite others.'
          : 'Everyone joins from the chat. The host starts the game there.'}
      </p>

      <div className="tg-waiting-list">
        {players.map((player) => (
          <div key={player.id} className={`tg-player-chip player-${player.color}`}>
            <span className="tg-player-dot" />
            <span className="tg-player-name">{player.nickname}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="tg-primary-btn"
        onClick={() => getWebApp()?.close?.()}
      >
        Back to chat
      </button>
    </div>
  );
}

/** The board. `readOnly` covers a verified user who holds no seat. */
function TelegramBoard({ readOnly }: { readOnly: boolean }) {
  const { state, rollDice, moveToken, endTurn } = useGame();
  const opponentRolling = useOpponentRolling(
    state.room?.hasRolledDice ?? false,
    state.room?.isPlayerTurn ?? false
  );

  if (!state.room) {
    return <Splash />;
  }

  const room = state.room;

  if (room.gameState === 'waiting') {
    return <WaitingInChat players={room.players} />;
  }

  if (room.gameState === 'finished') {
    const youWon = room.winner?.id === state.currentPlayerId;
    return (
      <div className="tg-notice">
        <h1 className="tg-notice-title">{youWon ? 'You win! 🏆' : 'Game over'}</h1>
        <p className="tg-notice-body">
          {room.winner ? `${room.winner.nickname} wins.` : 'The game has ended.'}
        </p>
        <button
          type="button"
          className="tg-primary-btn"
          onClick={() => getWebApp()?.close?.()}
        >
          Back to chat
        </button>
      </div>
    );
  }

  const handleTokenClick = (playerId: string, tokenId: number) => {
    if (readOnly) return;
    if (playerId === state.currentPlayerId && room.isPlayerTurn) {
      haptic('medium');
      moveToken(tokenId);
    }
  };

  const handleRollDice = () => {
    if (readOnly) return;
    if (room.isPlayerTurn && !room.hasRolledDice) {
      haptic('light');
      rollDice();
    }
  };

  const handleEndTurn = () => {
    if (readOnly || !room.currentPlayer) return;
    if (canEndTurn(room.players, room.currentPlayer, room.diceValue, room.hasRolledDice)) {
      endTurn();
    }
  };

  return (
    <div className={`tg-game turn-${room.currentPlayer?.color || 'red'}`}>
      <PlayerStrip
        players={room.players}
        currentPlayerIndex={room.currentPlayerIndex}
        youId={state.currentPlayerId}
      />

      <div className="tg-board-stage">
        {room.currentPlayer && (
          <TurnBanner
            key={room.currentPlayer.id}
            playerName={room.currentPlayer.nickname}
            color={room.currentPlayer.color}
            isYou={room.currentPlayer.id === state.currentPlayerId}
          />
        )}
        <BoardScene
          players={room.players}
          currentPlayerColor={room.currentPlayer?.color || null}
          validMoves={state.validMoves}
          onTokenClick={handleTokenClick}
          diceValue={room.diceValue}
          isRollingDice={state.isRollingDice || opponentRolling}
          activeCorner={room.currentPlayer?.color || null}
        />
      </div>

      {readOnly ? (
        <div className="tg-spectating">Watching — you don't have a seat in this game.</div>
      ) : (
        <GameControls
          hasRolledDice={room.hasRolledDice}
          isPlayerTurn={room.isPlayerTurn}
          isRollingDice={state.isRollingDice}
          diceValue={room.diceValue}
          validMoves={state.validMoves}
          canEndTurn={
            room.currentPlayer
              ? canEndTurn(room.players, room.currentPlayer, room.diceValue, room.hasRolledDice)
              : false
          }
          onRollDice={handleRollDice}
          onEndTurn={handleEndTurn}
          onStartGame={() => {}}
          onMoveToken={(tokenId) => moveToken(tokenId)}
          gameState="playing"
          isRoomCreator={false}
          canStartGame={false}
          currentPlayerColor={room.currentPlayer?.color}
        />
      )}

      {state.error && <div className="error-banner">{state.error}</div>}
    </div>
  );
}

export default function TelegramApp() {
  const { state, startSolo } = useTelegramSession();

  switch (state.status) {
    case 'loading':
      return <Splash />;

    case 'unavailable':
      return <Notice title="Ludo" body={state.reason} />;

    case 'error':
      return <Notice title="Something went wrong" body={state.message} />;

    case 'menu':
      return <SoloMenu onStart={startSolo} />;

    case 'seated':
      return (
        <GameProvider session={state.session}>
          <TelegramBoard readOnly={false} />
        </GameProvider>
      );

    case 'spectating':
      return (
        <GameProvider session={state.session}>
          <TelegramBoard readOnly />
        </GameProvider>
      );
  }
}
