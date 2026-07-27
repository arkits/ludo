/**
 * Convex functions read deployment configuration from `process.env`, but this
 * project typechecks `convex/` alongside `src/` under a DOM lib (see
 * tsconfig.app.json), which has no Node globals. Declaring just the shape we
 * use keeps `@types/node` out of the front-end type space.
 */
declare const process: {
  env: Record<string, string | undefined>;
};
