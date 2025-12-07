import { useState, useEffect } from 'react';
import './Lobby.css';

interface LobbyProps {
  onCreateRoom: (nickname: string, password?: string) => void;
  onJoinRoom: (roomId: string, nickname: string, password?: string) => void;
}

export default function Lobby({ onCreateRoom, onJoinRoom }: LobbyProps) {
  // Check URL for room ID and localStorage for nickname
  const urlParams = new URLSearchParams(window.location.search);
  const roomIdFromUrl = urlParams.get('room');
  const storedNickname = localStorage.getItem('ludo_nickname');
  const storedPassword = roomIdFromUrl ? localStorage.getItem(`ludo_password_${roomIdFromUrl.toUpperCase()}`) : null;

  const [createNickname, setCreateNickname] = useState(storedNickname || '');
  const [createPassword, setCreatePassword] = useState('');
  const [joinRoomId, setJoinRoomId] = useState(roomIdFromUrl?.toUpperCase() || '');
  const [joinNickname, setJoinNickname] = useState(storedNickname || '');
  const [joinPassword, setJoinPassword] = useState(storedPassword || '');

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (createNickname.trim()) {
      onCreateRoom(createNickname.trim(), createPassword.trim() || undefined);
    }
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinRoomId.trim() && joinNickname.trim()) {
      onJoinRoom(joinRoomId.trim().toUpperCase(), joinNickname.trim(), joinPassword.trim() || undefined);
    }
  };

  // Auto-fill form if room ID is in URL
  useEffect(() => {
    if (roomIdFromUrl && storedNickname) {
      // Form is already pre-filled, but we could auto-submit if desired
      // For now, user needs to click join button
    }
  }, [roomIdFromUrl, storedNickname]);

  return (
    <div className="lobby">
      <div className="lobby-container">
        <h1>Ludo Online</h1>
        
        <div className="lobby-forms">
          <div className="lobby-form-section">
            <h2>Create Room</h2>
            <form onSubmit={handleCreateRoom}>
              <input
                type="text"
                placeholder="Your nickname"
                value={createNickname}
                onChange={(e) => setCreateNickname(e.target.value)}
                required
                maxLength={20}
              />
              <input
                type="password"
                placeholder="Room password (optional)"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                maxLength={20}
              />
              <button type="submit">Create Room</button>
            </form>
          </div>

          <div className="lobby-divider">
            <span>OR</span>
          </div>

          <div className="lobby-form-section">
            <h2>Join Room</h2>
            <form onSubmit={handleJoinRoom}>
              <input
                type="text"
                placeholder="Room ID"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                required
                maxLength={6}
                style={{ textTransform: 'uppercase' }}
              />
              <input
                type="text"
                placeholder="Your nickname"
                value={joinNickname}
                onChange={(e) => setJoinNickname(e.target.value)}
                required
                maxLength={20}
              />
              <input
                type="password"
                placeholder="Room password (if required)"
                value={joinPassword}
                onChange={(e) => setJoinPassword(e.target.value)}
                maxLength={20}
              />
              <button type="submit">Join Room</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

