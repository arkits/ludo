import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import bcrypt from "bcryptjs";

/**
 * Hash a password (server-side)
 */
export const hashPassword = internalMutation({
  args: {
    password: v.string(),
  },
  returns: v.string(),
  handler: async (_ctx, args) => {
    return bcrypt.hashSync(args.password, 10);
  },
});

/**
 * Verify a password (server-side)
 */
export const verifyPassword = internalMutation({
  args: {
    password: v.string(),
    hash: v.string(),
  },
  returns: v.boolean(),
  handler: async (_ctx, args) => {
    return bcrypt.compareSync(args.password, args.hash);
  },
});
