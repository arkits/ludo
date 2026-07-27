import { useCallback, useEffect, useRef, useState } from 'react';
import { useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { getWebApp, setupWebApp } from './webApp';
import type { GameSession } from '../contexts/GameContext';

/**
 * Turns a Mini App launch into a playable seat.
 *
 * Identity comes from `initData`, which Telegram signs with the bot token.
 * The server verifies that signature and hands back the seat's auth token, so
 * from here on the Telegram client uses exactly the same mutations as the web
 * app - see convex/telegram/match.ts.
 */

export type TelegramSessionState =
  | { status: 'loading' }
  /** Not running inside Telegram - someone opened the URL in a browser. */
  | { status: 'unavailable'; reason: string }
  /** Launched with no match id: offer a solo game. */
  | { status: 'menu' }
  | { status: 'seated'; session: GameSession; reclaimed: boolean }
  /** Verified, but holds no seat in this match: read-only board. */
  | { status: 'spectating'; session: GameSession; reason: string }
  | { status: 'error'; message: string };

/** A spectator needs a room to watch but no credentials to act with. */
function spectatorSession(roomId: string): GameSession {
  return { playerId: '', authToken: '', roomId };
}

/**
 * How the launch resolves is knowable before the first render: telegram.html
 * loads the SDK in a blocking <script>, so `window.Telegram.WebApp` is already
 * populated. Only the seat claim itself is asynchronous.
 */
function initialSessionState(): TelegramSessionState {
  const webApp = getWebApp();

  // initData is absent both outside Telegram and when the page is opened
  // without a real Mini App launch. Either way there is nothing to verify.
  if (!webApp?.initData) {
    return { status: 'unavailable', reason: 'Open this from Telegram to play.' };
  }

  if (!webApp.initDataUnsafe?.start_param) {
    return { status: 'menu' };
  }

  return { status: 'loading' };
}

export function useTelegramSession() {
  const [state, setState] = useState<TelegramSessionState>(initialSessionState);
  const claimSeat = useAction(api.telegram.match.claimSeat);
  const createSoloMatch = useAction(api.telegram.match.createSoloMatch);

  // React mounts effects twice in development; claiming once is enough, and a
  // second claim would race the first.
  const claimedRef = useRef(false);

  useEffect(() => {
    const webApp = getWebApp();
    if (!webApp) return;

    const teardown = setupWebApp(webApp);

    const matchId = webApp.initDataUnsafe?.start_param;
    if (!webApp.initData || !matchId) return teardown;

    if (claimedRef.current) return teardown;
    claimedRef.current = true;

    claimSeat({ initData: webApp.initData, matchId })
      .then((result) => {
        if (result.seated) {
          setState({
            status: 'seated',
            reclaimed: result.reclaimed,
            session: {
              playerId: result.playerId,
              authToken: result.authToken,
              roomId: result.roomId,
            },
          });
        } else {
          setState({
            status: 'spectating',
            session: spectatorSession(result.roomId),
            reason: result.reason,
          });
        }
      })
      .catch((error: unknown) => {
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Could not open the game.',
        });
      });

    return teardown;
  }, [claimSeat]);

  const startSolo = useCallback(
    async (botCount: number) => {
      const webApp = getWebApp();
      if (!webApp?.initData) return;

      setState({ status: 'loading' });

      try {
        const result = await createSoloMatch({
          initData: webApp.initData,
          botCount,
        });

        if (!result.ok) {
          setState({ status: 'error', message: result.reason });
          return;
        }

        setState({
          status: 'seated',
          reclaimed: false,
          session: {
            playerId: result.playerId,
            authToken: result.authToken,
            roomId: result.roomId,
          },
        });
      } catch (error: unknown) {
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Could not start the game.',
        });
      }
    },
    [createSoloMatch]
  );

  return { state, startSolo };
}
