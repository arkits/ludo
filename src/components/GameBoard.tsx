import React from 'react';
import type { PlayerColor } from '../types/game';
import Token from './Token';
import './GameBoard.css';

interface GameBoardProps {
  players: Array<{
    id: string;
    nickname: string;
    color: PlayerColor;
    tokens: Array<{
      id: number;
      position: number;
      isHome: boolean;
      isFinished: boolean;
    }>;
  }>;
  currentPlayerColor: PlayerColor | null;
  validMoves: number[];
  onTokenClick: (playerId: string, tokenId: number) => void;
  children?: React.ReactNode;
}

// Board dimensions for 15x15 grid
const BOARD_SIZE = 600;
const CELL_SIZE = BOARD_SIZE / 15; // 40px per cell
const HOME_BASE_SIZE = CELL_SIZE * 6; // 240px

// Colors matching reference image
const COLORS = {
  red: { main: '#e74c3c', dark: '#c0392b', light: '#f5b7b1' },
  green: { main: '#27ae60', dark: '#1e8449', light: '#a9dfbf' },
  yellow: { main: '#f1c40f', dark: '#d4ac0d', light: '#f9e79f' },
  blue: { main: '#3498db', dark: '#2980b9', light: '#aed6f1' },
};


export default function GameBoard({ players, currentPlayerColor, validMoves, onTokenClick, children }: GameBoardProps) {
  const getPlayerByColor = (color: PlayerColor) => {
    return players.find(p => p.color === color);
  };

  const redPlayer = getPlayerByColor('red');
  const bluePlayer = getPlayerByColor('blue');
  const greenPlayer = getPlayerByColor('green');
  const yellowPlayer = getPlayerByColor('yellow');

  // Render a star shape for safe squares
  const renderStar = (cx: number, cy: number, size: number = 8) => {
    const points: string[] = [];
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 === 0 ? size : size / 2;
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      points.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
    }
    return (
      <polygon
        points={points.join(' ')}
        fill="#ffffff"
        stroke="#333"
        strokeWidth="0.5"
      />
    );
  };

  // Render arrow for starting square
  const renderArrow = (x: number, y: number, direction: 'up' | 'down' | 'left' | 'right', color: string) => {
    const cx = x + CELL_SIZE / 2;
    const cy = y + CELL_SIZE / 2;
    const size = 8;

    let points = '';
    switch (direction) {
      case 'up':
        points = `${cx},${cy - size} ${cx + size},${cy + size} ${cx - size},${cy + size}`;
        break;
      case 'down':
        points = `${cx},${cy + size} ${cx + size},${cy - size} ${cx - size},${cy - size}`;
        break;
      case 'left':
        points = `${cx - size},${cy} ${cx + size},${cy - size} ${cx + size},${cy + size}`;
        break;
      case 'right':
        points = `${cx + size},${cy} ${cx - size},${cy - size} ${cx - size},${cy + size}`;
        break;
    }

    return <polygon points={points} fill={color} stroke="#333" strokeWidth="0.5" />;
  };

  // Render corner home base with circular token positions
  const renderHomeBase = (startX: number, startY: number, color: typeof COLORS.red, colorName: string) => {
    const circleRadius = CELL_SIZE * 1.8;
    const centerX = startX + HOME_BASE_SIZE / 2;
    const centerY = startY + HOME_BASE_SIZE / 2;

    // Token positions in a 2x2 grid inside the circle
    const tokenPositions = [
      { x: centerX - CELL_SIZE * 0.8, y: centerY - CELL_SIZE * 0.8 },
      { x: centerX + CELL_SIZE * 0.8, y: centerY - CELL_SIZE * 0.8 },
      { x: centerX - CELL_SIZE * 0.8, y: centerY + CELL_SIZE * 0.8 },
      { x: centerX + CELL_SIZE * 0.8, y: centerY + CELL_SIZE * 0.8 },
    ];

    return (
      <g key={`home-${colorName}`}>
        {/* Background */}
        <rect
          x={startX}
          y={startY}
          width={HOME_BASE_SIZE}
          height={HOME_BASE_SIZE}
          fill={color.light}
          stroke="#333"
          strokeWidth="2"
        />
        {/* Inner circle */}
        <circle
          cx={centerX}
          cy={centerY}
          r={circleRadius}
          fill="white"
          stroke="#333"
          strokeWidth="2"
        />
        {/* Token position circles */}
        {tokenPositions.map((pos, i) => (
          <circle
            key={`${colorName}-pos-${i}`}
            cx={pos.x}
            cy={pos.y}
            r={CELL_SIZE * 0.4}
            fill={color.main}
            stroke="#333"
            strokeWidth="1.5"
          />
        ))}
      </g>
    );
  };

  // Render the main track squares (3 columns per arm)
  const renderMainTrack = () => {
    const squares: React.ReactNode[] = [];

    // === TOP ARM (above center) ===
    // 3 columns: left (6), middle (7 - red home), right (8)
    for (let row = 0; row < 6; row++) {
      // Left column (col 6) - main track
      const leftX = 6 * CELL_SIZE;
      const leftY = row * CELL_SIZE;
      const isRedStart = row === 1; // Red starts here (col 6, row 1)
      squares.push(
        <rect
          key={`top-left-${row}`}
          x={leftX}
          y={leftY}
          width={CELL_SIZE}
          height={CELL_SIZE}
          fill={isRedStart ? COLORS.red.main : 'white'}
          stroke="#333"
          strokeWidth="1"
        />
      );
      if (isRedStart) {
        squares.push(
          <g key={`top-left-arrow-${row}`}>
            {renderArrow(leftX, leftY, 'right', 'white')}
          </g>
        );
      }

      // Middle column (col 7) - Red home stretch
      if (row > 0) { // Skip row 0 (that's part of the track)
        const midX = 7 * CELL_SIZE;
        const midY = row * CELL_SIZE;
        squares.push(
          <rect
            key={`top-mid-${row}`}
            x={midX}
            y={midY}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill={COLORS.red.main}
            stroke="#333"
            strokeWidth="1"
          />
        );
      }

      // Right column (col 8) - main track
      const rightX = 8 * CELL_SIZE;
      const rightY = row * CELL_SIZE;
      squares.push(
        <rect
          key={`top-right-${row}`}
          x={rightX}
          y={rightY}
          width={CELL_SIZE}
          height={CELL_SIZE}
          fill="white"
          stroke="#333"
          strokeWidth="1"
        />
      );
    }

    // === BOTTOM ARM (below center) ===
    for (let row = 9; row < 15; row++) {
      // Left column (col 6) - main track
      const leftX = 6 * CELL_SIZE;
      const leftY = row * CELL_SIZE;
      squares.push(
        <rect
          key={`bottom-left-${row}`}
          x={leftX}
          y={leftY}
          width={CELL_SIZE}
          height={CELL_SIZE}
          fill="white"
          stroke="#333"
          strokeWidth="1"
        />
      );

      // Middle column (col 7) - Yellow home stretch
      if (row < 14) { // Skip row 14 (that's part of the track)
        const midX = 7 * CELL_SIZE;
        const midY = row * CELL_SIZE;
        squares.push(
          <rect
            key={`bottom-mid-${row}`}
            x={midX}
            y={midY}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill={COLORS.yellow.main}
            stroke="#333"
            strokeWidth="1"
          />
        );
      }

      // Right column (col 8) - main track
      const rightX = 8 * CELL_SIZE;
      const rightY = row * CELL_SIZE;
      const isYellowStart = row === 13; // Yellow starts here (col 8, row 13)
      squares.push(
        <rect
          key={`bottom-right-${row}`}
          x={rightX}
          y={rightY}
          width={CELL_SIZE}
          height={CELL_SIZE}
          fill={isYellowStart ? COLORS.yellow.main : 'white'}
          stroke="#333"
          strokeWidth="1"
        />
      );
      if (isYellowStart) {
        squares.push(
          <g key={`bottom-right-arrow-${row}`}>
            {renderArrow(rightX, rightY, 'left', 'white')}
          </g>
        );
      }
    }

    // === LEFT ARM (left of center) ===
    for (let col = 0; col < 6; col++) {
      // Top row (row 6) - main track
      const topX = col * CELL_SIZE;
      const topY = 6 * CELL_SIZE;
      squares.push(
        <rect
          key={`left-top-${col}`}
          x={topX}
          y={topY}
          width={CELL_SIZE}
          height={CELL_SIZE}
          fill="white"
          stroke="#333"
          strokeWidth="1"
        />
      );

      // Middle row (row 7) - Blue home stretch
      if (col > 0) { // Skip col 0 (that's part of the track)
        const midX = col * CELL_SIZE;
        const midY = 7 * CELL_SIZE;
        squares.push(
          <rect
            key={`left-mid-${col}`}
            x={midX}
            y={midY}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill={COLORS.blue.main}
            stroke="#333"
            strokeWidth="1"
          />
        );
      }

      // Bottom row (row 8) - main track
      const bottomX = col * CELL_SIZE;
      const bottomY = 8 * CELL_SIZE;
      const isBlueStart = col === 1; // Blue starts here (col 1, row 8)
      squares.push(
        <rect
          key={`left-bottom-${col}`}
          x={bottomX}
          y={bottomY}
          width={CELL_SIZE}
          height={CELL_SIZE}
          fill={isBlueStart ? COLORS.blue.main : 'white'}
          stroke="#333"
          strokeWidth="1"
        />
      );
      if (isBlueStart) {
        squares.push(
          <g key={`left-bottom-arrow-${col}`}>
            {renderArrow(bottomX, bottomY, 'up', 'white')}
          </g>
        );
      }
    }

    // === RIGHT ARM (right of center) ===
    for (let col = 9; col < 15; col++) {
      // Top row (row 6) - main track
      const topX = col * CELL_SIZE;
      const topY = 6 * CELL_SIZE;
      const isGreenStart = col === 13; // Green starts here (col 13, row 6)
      squares.push(
        <rect
          key={`right-top-${col}`}
          x={topX}
          y={topY}
          width={CELL_SIZE}
          height={CELL_SIZE}
          fill={isGreenStart ? COLORS.green.main : 'white'}
          stroke="#333"
          strokeWidth="1"
        />
      );
      if (isGreenStart) {
        squares.push(
          <g key={`right-top-arrow-${col}`}>
            {renderArrow(topX, topY, 'down', 'white')}
          </g>
        );
      }

      // Middle row (row 7) - Green home stretch
      if (col < 14) { // Skip col 14 (that's part of the track)
        const midX = col * CELL_SIZE;
        const midY = 7 * CELL_SIZE;
        squares.push(
          <rect
            key={`right-mid-${col}`}
            x={midX}
            y={midY}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill={COLORS.green.main}
            stroke="#333"
            strokeWidth="1"
          />
        );
      }

      // Bottom row (row 8) - main track
      const bottomX = col * CELL_SIZE;
      const bottomY = 8 * CELL_SIZE;
      squares.push(
        <rect
          key={`right-bottom-${col}`}
          x={bottomX}
          y={bottomY}
          width={CELL_SIZE}
          height={CELL_SIZE}
          fill="white"
          stroke="#333"
          strokeWidth="1"
        />
      );
    }


    // Add safe square stars
    // Red safe (col 2, row 6)
    squares.push(
      <g key="safe-red">{renderStar(2 * CELL_SIZE + CELL_SIZE / 2, 6 * CELL_SIZE + CELL_SIZE / 2)}</g>
    );
    // Green safe (col 8, row 2)
    squares.push(
      <g key="safe-green">{renderStar(8 * CELL_SIZE + CELL_SIZE / 2, 2 * CELL_SIZE + CELL_SIZE / 2)}</g>
    );
    // Yellow safe (col 12, row 8)
    squares.push(
      <g key="safe-yellow">{renderStar(12 * CELL_SIZE + CELL_SIZE / 2, 8 * CELL_SIZE + CELL_SIZE / 2)}</g>
    );
    // Blue safe (col 6, row 12)
    squares.push(
      <g key="safe-blue">{renderStar(6 * CELL_SIZE + CELL_SIZE / 2, 12 * CELL_SIZE + CELL_SIZE / 2)}</g>
    );

    return squares;
  };

  // Render center home triangles
  const renderCenterHome = () => {
    const centerX = 7.5 * CELL_SIZE; // Center of the board
    const centerY = 7.5 * CELL_SIZE;

    return (
      <g>
        {/* Background square for center */}
        <rect
          x={6 * CELL_SIZE}
          y={6 * CELL_SIZE}
          width={3 * CELL_SIZE}
          height={3 * CELL_SIZE}
          fill="#f0f0f0"
          stroke="#333"
          strokeWidth="2"
        />

        {/* Top triangle (Red) */}
        <polygon
          points={`${centerX},${centerY} ${6 * CELL_SIZE},${6 * CELL_SIZE} ${9 * CELL_SIZE},${6 * CELL_SIZE}`}
          fill={COLORS.red.main}
          stroke="#333"
          strokeWidth="1"
        />

        {/* Right triangle (Green) */}
        <polygon
          points={`${centerX},${centerY} ${9 * CELL_SIZE},${6 * CELL_SIZE} ${9 * CELL_SIZE},${9 * CELL_SIZE}`}
          fill={COLORS.green.main}
          stroke="#333"
          strokeWidth="1"
        />

        {/* Bottom triangle (Yellow) */}
        <polygon
          points={`${centerX},${centerY} ${9 * CELL_SIZE},${9 * CELL_SIZE} ${6 * CELL_SIZE},${9 * CELL_SIZE}`}
          fill={COLORS.yellow.main}
          stroke="#333"
          strokeWidth="1"
        />

        {/* Left triangle (Blue) */}
        <polygon
          points={`${centerX},${centerY} ${6 * CELL_SIZE},${9 * CELL_SIZE} ${6 * CELL_SIZE},${6 * CELL_SIZE}`}
          fill={COLORS.blue.main}
          stroke="#333"
          strokeWidth="1"
        />
      </g>
    );
  };

  return (
    <div className="game-board">
      <svg viewBox="0 0 600 600" className="board-svg">
        {/* Board background */}
        <rect x="0" y="0" width={BOARD_SIZE} height={BOARD_SIZE} fill="#f5f5dc" stroke="#333" strokeWidth="3" />

        {/* Corner home bases */}
        {renderHomeBase(0, 0, COLORS.red, 'red')}
        {renderHomeBase(BOARD_SIZE - HOME_BASE_SIZE, 0, COLORS.green, 'green')}
        {renderHomeBase(0, BOARD_SIZE - HOME_BASE_SIZE, COLORS.blue, 'blue')}
        {renderHomeBase(BOARD_SIZE - HOME_BASE_SIZE, BOARD_SIZE - HOME_BASE_SIZE, COLORS.yellow, 'yellow')}

        {/* Main track and home columns */}
        {renderMainTrack()}

        {/* Center home area */}
        {renderCenterHome()}
      </svg>

      {/* Tokens */}
      {redPlayer && (
        <div className="tokens-container red-tokens">
          {redPlayer.tokens.map((token) => (
            <Token
              key={token.id}
              token={token}
              color="red"
              playerId={redPlayer.id}
              isValidMove={validMoves.includes(token.id)}
              isCurrentPlayer={currentPlayerColor === 'red'}
              onClick={onTokenClick}
            />
          ))}
        </div>
      )}

      {bluePlayer && (
        <div className="tokens-container blue-tokens">
          {bluePlayer.tokens.map((token) => (
            <Token
              key={token.id}
              token={token}
              color="blue"
              playerId={bluePlayer.id}
              isValidMove={validMoves.includes(token.id)}
              isCurrentPlayer={currentPlayerColor === 'blue'}
              onClick={onTokenClick}
            />
          ))}
        </div>
      )}

      {greenPlayer && (
        <div className="tokens-container green-tokens">
          {greenPlayer.tokens.map((token) => (
            <Token
              key={token.id}
              token={token}
              color="green"
              playerId={greenPlayer.id}
              isValidMove={validMoves.includes(token.id)}
              isCurrentPlayer={currentPlayerColor === 'green'}
              onClick={onTokenClick}
            />
          ))}
        </div>
      )}

      {yellowPlayer && (
        <div className="tokens-container yellow-tokens">
          {yellowPlayer.tokens.map((token) => (
            <Token
              key={token.id}
              token={token}
              color="yellow"
              playerId={yellowPlayer.id}
              isValidMove={validMoves.includes(token.id)}
              isCurrentPlayer={currentPlayerColor === 'yellow'}
              onClick={onTokenClick}
            />
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
