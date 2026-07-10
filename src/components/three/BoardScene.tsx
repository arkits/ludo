import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import type { PlayerColor } from '../../types/game';
import Board3D from './Board';
import CameraRig from './CameraRig';
import Pawn from './Pawn';
import Dice3D from './Dice3D';
import { TOKEN_COLORS } from './boardModel';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface ScenePlayer {
  id: string;
  nickname: string;
  color: PlayerColor;
  tokens: Array<{ id: number; position: number; isHome: boolean; isFinished: boolean }>;
}

export interface BoardSceneProps {
  players: ScenePlayer[];
  currentPlayerColor: PlayerColor | null;
  validMoves: number[];
  onTokenClick: (playerId: string, tokenId: number) => void;
  diceValue: number;
  isRollingDice: boolean;
  activeCorner: PlayerColor | null;
}

function webglAvailable(): boolean {
  const canvas = document.createElement('canvas');
  return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
}

export default function BoardScene(props: BoardSceneProps) {
  const reducedMotion = useReducedMotion();
  const hasWebgl = useMemo(() => webglAvailable(), []);
  const rim = props.activeCorner ? TOKEN_COLORS[props.activeCorner].main : '#ffffff';

  if (!hasWebgl) {
    return (
      <div className="webgl-error">
        This game needs WebGL — please update your browser.
      </div>
    );
  }

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      style={{ touchAction: 'none' }}
      camera={{ fov: 36, position: [0, 14, 12], near: 0.1, far: 100 }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-bias={-0.0002}
        shadow-normalBias={0.05}
      />
      {/* Rim light tinted to the active player */}
      <pointLight position={[0, 6, -12]} intensity={0.5} color={rim} />
      <Board3D />
      {props.players.map((player) =>
        player.tokens.map((token) => (
          <Pawn
            key={`${player.id}-${token.id}`}
            token={token}
            color={player.color}
            playerId={player.id}
            isValidMove={
              props.validMoves.includes(token.id) && player.color === props.currentPlayerColor
            }
            isCurrentPlayer={player.color === props.currentPlayerColor}
            reducedMotion={reducedMotion}
            onClick={props.onTokenClick}
          />
        ))
      )}
      <Dice3D value={props.diceValue} isRolling={props.isRollingDice} reducedMotion={reducedMotion} />
      <ContactShadows position={[0, -0.64, 0]} opacity={0.45} scale={24} blur={2.2} far={4} />
      <CameraRig activeCorner={props.activeCorner} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
