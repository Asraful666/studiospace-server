import express from "express";
import {
  requireSession,
  requireTrustedOrigin,
} from "../middleware/auth.js";
import {
  JWT_COOKIE_NAME,
  JWT_LIFETIME_SECONDS,
  createAccessToken,
  getJwtSecret,
  jwtCookieOptions,
} from "../config/jwt.js";

export function createTokenRouter(auth) {
  // Fail at startup if JWT configuration is missing.
  getJwtSecret();

  const router = express.Router();

  router.post(
    "/",
    requireTrustedOrigin,
    requireSession(auth),
    (req, res, next) => {
      try {
        const token = createAccessToken(
          req.user.id,
          req.authSession.id
        );

        res.cookie(JWT_COOKIE_NAME, token, {
          ...jwtCookieOptions(),
          maxAge: JWT_LIFETIME_SECONDS * 1000,
        });

        res.set("Cache-Control", "no-store");

        // The JWT is sent only as an HTTPOnly cookie.
        res.json({
          success: true,
          message: "API access is ready.",
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}