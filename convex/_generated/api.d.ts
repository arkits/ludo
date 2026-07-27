/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as game from "../game.js";
import type * as gameLogic from "../gameLogic.js";
import type * as http from "../http.js";
import type * as password from "../password.js";
import type * as roomId from "../roomId.js";
import type * as rooms from "../rooms.js";
import type * as telegram_api from "../telegram/api.js";
import type * as telegram_config from "../telegram/config.js";
import type * as telegram_hooks from "../telegram/hooks.js";
import type * as telegram_idle from "../telegram/idle.js";
import type * as telegram_match from "../telegram/match.js";
import type * as telegram_notify from "../telegram/notify.js";
import type * as telegram_render from "../telegram/render.js";
import type * as telegram_verify from "../telegram/verify.js";
import type * as telegram_webhook from "../telegram/webhook.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  game: typeof game;
  gameLogic: typeof gameLogic;
  http: typeof http;
  password: typeof password;
  roomId: typeof roomId;
  rooms: typeof rooms;
  "telegram/api": typeof telegram_api;
  "telegram/config": typeof telegram_config;
  "telegram/hooks": typeof telegram_hooks;
  "telegram/idle": typeof telegram_idle;
  "telegram/match": typeof telegram_match;
  "telegram/notify": typeof telegram_notify;
  "telegram/render": typeof telegram_render;
  "telegram/verify": typeof telegram_verify;
  "telegram/webhook": typeof telegram_webhook;
  validators: typeof validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
