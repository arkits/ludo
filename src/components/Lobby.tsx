import { useState, useEffect } from 'react';
import './Lobby.css';

interface LobbyProps {
  onCreateRoom: (nickname: string, password?: string) => void;
  onJoinRoom: (roomId: string, nickname: string, password?: string) => void;
}

type ActionType = 'create' | 'join' | null;

export default function Lobby({ onCreateRoom, onJoinRoom }: LobbyProps) {
  // Check URL for room ID and localStorage for nickname
  const urlParams = new URLSearchParams(window.location.search);
  const roomIdFromUrl = urlParams.get('room');
  const storedNickname = localStorage.getItem('ludo_nickname');
  const storedPassword = roomIdFromUrl ? localStorage.getItem(`ludo_password_${roomIdFromUrl.toUpperCase()}`) : null;

  // Auto-select join if room ID is in URL
  const [action, setAction] = useState<ActionType>(roomIdFromUrl ? 'join' : null);
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
      <div className="lobby-content">
        <div className="lobby-container">
          {/* Logo */}
          <div className="logo-section">
            <h1 className="logo">Ludo</h1>
            <div className="logo-subtitle">Classic Board Game</div>
          </div>
          
          {/* Description */}
          <p className="lobby-description">
            The timeless race-to-home game! Roll the dice, move your tokens, and be the first to get all four pieces home. Play with 2-4 friends online.
          </p>
          
          {/* Game features */}
          <div className="features-row">
            <div className="feature">
              <span className="feature-icon">🎲</span>
              <span className="feature-text">Roll & Move</span>
            </div>
            <div className="feature">
              <span className="feature-icon">👥</span>
              <span className="feature-text">2-4 Players</span>
            </div>
            <div className="feature">
              <span className="feature-icon">🌐</span>
              <span className="feature-text">Play Online</span>
            </div>
          </div>
          
          {!action ? (
            <div className="lobby-actions">
              <button 
                className="lobby-action-btn lobby-action-btn-create"
                onClick={() => setAction('create')}
              >
                <span className="btn-icon">🏠</span>
                Create Room
              </button>
              <div className="lobby-divider">
                <span>or</span>
              </div>
              <button 
                className="lobby-action-btn lobby-action-btn-join"
                onClick={() => setAction('join')}
              >
                <span className="btn-icon">🚪</span>
                Join Room
              </button>
            </div>
          ) : (
            <div className="lobby-form-wrapper">
              {action === 'create' && (
                <div className="lobby-form-section">
                  <div className="lobby-form-header">
                    <h2>Create a New Room</h2>
                    <button 
                      className="lobby-back-btn"
                      onClick={() => setAction(null)}
                      type="button"
                    >
                      ← Back
                    </button>
                  </div>
                  <form onSubmit={handleCreateRoom}>
                    <div className="input-group">
                      <label htmlFor="create-nickname">Your Name</label>
                      <input
                        id="create-nickname"
                        type="text"
                        placeholder="Enter your nickname"
                        value={createNickname}
                        onChange={(e) => setCreateNickname(e.target.value)}
                        required
                        maxLength={20}
                        autoFocus
                      />
                    </div>
                    <div className="input-group">
                      <label htmlFor="create-password">Room Password <span className="optional">(optional)</span></label>
                      <input
                        id="create-password"
                        type="password"
                        placeholder="Set a password for private games"
                        value={createPassword}
                        onChange={(e) => setCreatePassword(e.target.value)}
                        maxLength={20}
                      />
                    </div>
                    <button type="submit" className="submit-btn">
                      Create Room
                    </button>
                  </form>
                </div>
              )}

              {action === 'join' && (
                <div className="lobby-form-section">
                  <div className="lobby-form-header">
                    <h2>Join a Room</h2>
                    <button 
                      className="lobby-back-btn"
                      onClick={() => setAction(null)}
                      type="button"
                    >
                      ← Back
                    </button>
                  </div>
                  <form onSubmit={handleJoinRoom}>
                    <div className="input-group">
                      <label htmlFor="join-room">Room Code</label>
                      <input
                        id="join-room"
                        type="text"
                        placeholder="Enter 6-character code"
                        value={joinRoomId}
                        onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                        required
                        maxLength={6}
                        className="room-code-input"
                        autoFocus
                      />
                    </div>
                    <div className="input-group">
                      <label htmlFor="join-nickname">Your Name</label>
                      <input
                        id="join-nickname"
                        type="text"
                        placeholder="Enter your nickname"
                        value={joinNickname}
                        onChange={(e) => setJoinNickname(e.target.value)}
                        required
                        maxLength={20}
                      />
                    </div>
                    <div className="input-group">
                      <label htmlFor="join-password">Password <span className="optional">(if required)</span></label>
                      <input
                        id="join-password"
                        type="password"
                        placeholder="Enter room password"
                        value={joinPassword}
                        onChange={(e) => setJoinPassword(e.target.value)}
                        maxLength={20}
                      />
                    </div>
                    <button type="submit" className="submit-btn">
                      Join Room
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <footer className="lobby-footer">
          <div className="footer-content">
            <span className="footer-text">Made with ♥ for board game lovers</span>
            <a 
              href="https://github.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="github-link"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              GitHub
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
