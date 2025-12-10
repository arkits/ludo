import { useState } from 'react';
import type { GameRoom, PlayerColor } from '../types/game';
import './WaitingRoom.css';

interface WaitingRoomProps {
  room: GameRoom;
  currentPlayerId: string | null;
  onStartGame: () => void;
  onUpdatePlayer: (nickname?: string, color?: PlayerColor) => void;
  onLeaveRoom: () => void;
  onAddBot: () => void;
  onRemoveBot: (botPlayerId: string) => void;
}

const COLORS: { value: PlayerColor; label: string }[] = [
  { value: 'red', label: 'Red' },
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'yellow', label: 'Yellow' },
];

export default function WaitingRoom({ 
  room, 
  currentPlayerId, 
  onStartGame, 
  onUpdatePlayer,
  onLeaveRoom,
  onAddBot,
  onRemoveBot
}: WaitingRoomProps) {
  const isRoomCreator = room.players[0]?.id === currentPlayerId;
  const canStart = room.gameState === 'waiting' && room.players.length >= 2;
  const currentPlayer = room.players.find(p => p.id === currentPlayerId);
  const canAddBot = room.players.length < room.maxPlayers;
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(currentPlayer?.nickname || '');
  const [copied, setCopied] = useState(false);

  const takenColors = room.players
    .filter(p => p.id !== currentPlayerId)
    .map(p => p.color);

  const copyRoomLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', room.roomId);
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback
      const input = document.createElement('input');
      input.value = url.toString();
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSaveName = () => {
    if (editName.trim() && editName.trim() !== currentPlayer?.nickname) {
      onUpdatePlayer(editName.trim(), undefined);
    }
    setIsEditing(false);
  };

  const handleColorChange = (color: PlayerColor) => {
    onUpdatePlayer(undefined, color);
  };

  return (
    <div className="waiting-room">
      {/* Header Section */}
      <div className="wr-header">
        <h2>Waiting Room</h2>
        <button className="wr-leave-btn" onClick={onLeaveRoom}>
          Leave Room
        </button>
      </div>

      {/* Room Code Card */}
      <div className="wr-room-card">
        <div className="wr-room-code-label">Room Code</div>
        <div className="wr-room-code">{room.roomId}</div>
        <button 
          className={`wr-copy-btn ${copied ? 'copied' : ''}`} 
          onClick={copyRoomLink}
        >
          {copied ? '✓ Copied!' : 'Copy Invite Link'}
        </button>
      </div>

      {/* Your Settings Card */}
      {currentPlayer && (
        <div className="wr-settings-card">
          <h3>Your Settings</h3>
          
          {/* Name Edit */}
          <div className="wr-setting-row">
            <label>Name</label>
            {isEditing ? (
              <div className="wr-name-edit">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={20}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') {
                      setEditName(currentPlayer.nickname);
                      setIsEditing(false);
                    }
                  }}
                />
                <button className="wr-save-btn" onClick={handleSaveName}>Save</button>
                <button 
                  className="wr-cancel-btn" 
                  onClick={() => {
                    setEditName(currentPlayer.nickname);
                    setIsEditing(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="wr-name-display">
                <span>{currentPlayer.nickname}</span>
                <button className="wr-edit-btn" onClick={() => setIsEditing(true)}>
                  Edit
                </button>
              </div>
            )}
          </div>

          {/* Color Selection */}
          <div className="wr-setting-row">
            <label>Color</label>
            <div className="wr-color-options">
              {COLORS.map((color) => {
                const isTaken = takenColors.includes(color.value);
                const isSelected = currentPlayer.color === color.value;
                return (
                  <button
                    key={color.value}
                    className={`wr-color-btn wr-color-${color.value} ${isSelected ? 'selected' : ''} ${isTaken ? 'taken' : ''}`}
                    onClick={() => !isTaken && handleColorChange(color.value)}
                    disabled={isTaken}
                    title={isTaken ? `${color.label} is taken` : color.label}
                  >
                    {isSelected && <span className="wr-check">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Players List */}
      <div className="wr-players-card">
        <h3>Players ({room.players.length}/{room.maxPlayers})</h3>
        <div className="wr-players-list">
          {room.players.map((player, index) => (
            <div 
              key={player.id} 
              className={`wr-player-item ${player.id === currentPlayerId ? 'is-you' : ''} ${player.isBot ? 'is-bot' : ''}`}
            >
              <div className={`wr-player-color wr-color-${player.color}`} />
              <span className="wr-player-name">
                {player.nickname}
                {player.id === currentPlayerId && <span className="wr-you-tag">You</span>}
                {index === 0 && <span className="wr-host-tag">Host</span>}
                {player.isBot && <span className="wr-bot-tag">Bot</span>}
              </span>
              {/* Remove bot button (only for host) */}
              {isRoomCreator && player.isBot && (
                <button 
                  className="wr-remove-bot-btn"
                  onClick={() => onRemoveBot(player.id)}
                  title="Remove bot"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          
          {/* Empty slots */}
          {Array.from({ length: room.maxPlayers - room.players.length }).map((_, i) => (
            <div key={`empty-${i}`} className="wr-player-item empty">
              <div className="wr-player-color empty" />
              <span className="wr-player-name">Waiting for player...</span>
            </div>
          ))}
        </div>
        
        {/* Add Bot button (only for host) */}
        {isRoomCreator && canAddBot && (
          <button className="wr-add-bot-btn" onClick={onAddBot}>
            + Add Bot
          </button>
        )}
      </div>

      {/* Status & Actions */}
      <div className="wr-actions">
        {room.players.length < 2 ? (
          <div className="wr-status">
            Waiting for at least one more player to join...
          </div>
        ) : isRoomCreator ? (
          <button 
            className="wr-start-btn" 
            onClick={onStartGame}
            disabled={!canStart}
          >
            Start Game
          </button>
        ) : (
          <div className="wr-status">
            Waiting for host to start the game...
          </div>
        )}
      </div>
    </div>
  );
}
