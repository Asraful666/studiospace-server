import "dotenv/config";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import {
  createAuthMiddleware,
  APIError,
} from "better-auth/api";

export function createAuth(db, client) {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  const clientOrigin = process.env.CLIENT_ORIGIN;

  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters.");
  }

  if (!baseURL || !clientOrigin) {
    throw new Error("BETTER_AUTH_URL and CLIENT_ORIGIN are required.");
  }

  return betterAuth({
    appName: "StudioSpace",

    baseURL,
    basePath: "/api/auth",
    secret,

    trustedOrigins: [clientOrigin],
    socialProviders: {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    prompt: "select_account",
  },
},

    database: mongodbAdapter(db, {
      client,
    }),

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
      maxPasswordLength: 128,
      requireEmailVerification: false,
      autoSignIn: false,
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;

        const password = ctx.body?.password;

        if (
          typeof password !== "string" ||
          password.length < 6 ||
          password.length > 128 ||
          !/[A-Z]/.test(password) ||
          !/[a-z]/.test(password)
        ) {
          throw new APIError("BAD_REQUEST", {
            message:
              "Password must be 6–128 characters and include uppercase and lowercase letters.",
          });
        }

        const name = ctx.body?.name;

        if (
          typeof name !== "string" ||
          !name.trim() ||
          name.trim().length > 100
        ) {
          throw new APIError("BAD_REQUEST", {
            message: "Please provide a name between 1 and 100 characters.",
          });
        }
      }),
    },
  });
}