import type { GameRoom } from '../types/game';
import PlayerPanel from './PlayerPanel';
import GameControls from './GameControls';
import './WaitingRoom.css';

interface WaitingRoomProps {
  room: GameRoom;
  currentPlayerId: string | null;
  onStartGame: () => void;
}

export default function WaitingRoom({ room, currentPlayerId, onStartGame }: WaitingRoomProps) {
  const isRoomCreator = room.players[0]?.id === currentPlayerId;
  const canStart = room.gameState === 'waiting' && room.players.length >= 2;

  const copyRoomLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', room.roomId);
    navigator.clipboard.writeText(url.toString()).then(() => {
      // Show a brief success message
      const button = document.querySelector('.copy-link-btn') as HTMLButtonElement;
      if (button) {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.style.background = '#10b981';
        setTimeout(() => {
          button.textContent = originalText;
          button.style.background = '';
        }, 2000);
      }
    }).catch(() => {
      // Fallback: select the text
      const url = new URL(window.location.href);
      url.searchParams.set('room', room.roomId);
      const input = document.createElement('input');
      input.value = url.toString();
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    });
  };

  return (
    <div className="waiting-room">
      <h2>Waiting Room</h2>
      <div className="room-id-section">
        <p className="room-id-display">Room ID: <strong>{room.roomId}</strong></p>
        <button className="copy-link-btn" onClick={copyRoomLink}>
          Copy Link
        </button>
      </div>
      <div className="players-list">
        {room.players.map((player) => (
          <PlayerPanel
            key={player.id}
            player={player}
            isCurrentTurn={false}
            isYou={player.id === currentPlayerId}
          />
        ))}
      </div>
      {room.players.length < 2 && (
        <p className="waiting-message">Waiting for more players to join... ({room.players.length}/{room.maxPlayers})</p>
      )}
      <GameControls
        diceValue={0}
        hasRolledDice={false}
        isPlayerTurn={false}
        isRollingDice={false}
        canEndTurn={false}
        onRollDice={() => {}}
        onEndTurn={() => {}}
        onStartGame={onStartGame}
        gameState="waiting"
        isRoomCreator={isRoomCreator}
        canStartGame={canStart}
      />
    </div>
  );
}

