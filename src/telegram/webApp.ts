/**
 * Typed access to the Telegram Mini App container.
 *
 * The SDK is loaded by a plain <script> tag in telegram.html, so it is present
 * on `window` before React mounts. Every field is optional here because older
 * Telegram clients ship older versions of the API, and a missing method must
 * degrade rather than throw.
 */

export interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

export interface TelegramSafeAreaInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface TelegramInitDataUnsafe {
  user?: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  start_param?: string;
  chat_type?: string;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: TelegramInitDataUnsafe;
  themeParams: TelegramThemeParams;
  colorScheme?: "light" | "dark";
  viewportHeight?: number;
  viewportStableHeight?: number;
  contentSafeAreaInset?: TelegramSafeAreaInset;
  safeAreaInset?: TelegramSafeAreaInset;
  ready(): void;
  expand?(): void;
  close?(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  onEvent?(event: string, handler: () => void): void;
  offEvent?(event: string, handler: () => void): void;
  BackButton?: {
    show(): void;
    hide(): void;
    onClick(handler: () => void): void;
    offClick(handler: () => void): void;
  };
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

/** The tabletop the web app is played on - see --wood-dark in src/index.css. */
const WOOD = "#3d2817";

/**
 * Push the tabletop colour into Telegram's own chrome.
 *
 * The board is a wood-and-cardboard scene in both light and dark clients, so
 * it deliberately does not follow themeParams - a navy Telegram header above a
 * brown table looks like two apps stacked. Matching the header and the
 * pull-to-close backdrop instead makes the Mini App feel like one surface.
 */
function applyChrome(webApp: TelegramWebApp): void {
  webApp.setHeaderColor?.(WOOD);
  webApp.setBackgroundColor?.(WOOD);
}

/**
 * Publish the safe-area insets as CSS variables. The board is a full-bleed 3D
 * scene, so it needs to know how much of the viewport the Telegram header and
 * the device's own chrome are covering.
 */
function applySafeArea(webApp: TelegramWebApp): void {
  const root = document.documentElement;
  const content = webApp.contentSafeAreaInset;
  const device = webApp.safeAreaInset;

  const top = (content?.top ?? 0) + (device?.top ?? 0);
  const bottom = (content?.bottom ?? 0) + (device?.bottom ?? 0);

  root.style.setProperty("--tg-safe-top", `${top}px`);
  root.style.setProperty("--tg-safe-bottom", `${bottom}px`);
}

/**
 * Put the container into the state a full-screen 3D board needs, and return a
 * cleanup function.
 *
 * `disableVerticalSwipes` is the load-bearing call here: without it, dragging
 * vertically anywhere on the board is interpreted by Telegram as a
 * dismiss gesture and closes the Mini App mid-game.
 */
export function setupWebApp(webApp: TelegramWebApp): () => void {
  webApp.ready();
  webApp.expand?.();
  webApp.disableVerticalSwipes?.();

  applyChrome(webApp);
  applySafeArea(webApp);

  // Telegram resets its chrome colours when the user switches theme mid-session.
  const onThemeChanged = () => applyChrome(webApp);
  const onViewportChanged = () => applySafeArea(webApp);

  webApp.onEvent?.("themeChanged", onThemeChanged);
  webApp.onEvent?.("viewportChanged", onViewportChanged);
  webApp.onEvent?.("safeAreaChanged", onViewportChanged);
  webApp.onEvent?.("contentSafeAreaChanged", onViewportChanged);

  return () => {
    webApp.offEvent?.("themeChanged", onThemeChanged);
    webApp.offEvent?.("viewportChanged", onViewportChanged);
    webApp.offEvent?.("safeAreaChanged", onViewportChanged);
    webApp.offEvent?.("contentSafeAreaChanged", onViewportChanged);
  };
}

export function haptic(type: "light" | "medium" | "heavy"): void {
  getWebApp()?.HapticFeedback?.impactOccurred(type);
}
