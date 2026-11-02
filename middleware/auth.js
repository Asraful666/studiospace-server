import { fromNodeHeaders } from "better-auth/node";
import {
  JWT_COOKIE_NAME,
  jwtCookieOptions,
  verifyAccessToken,
} from "../config/jwt.js";

// Better Auth session validation.
// Also used when issuing a new JWT.
export function requireSession(auth) {
  return async (req, res, next) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });

      if (!session?.user || !session?.session) {
        res.clearCookie(JWT_COOKIE_NAME, jwtCookieOptions());

        return res.status(401).json({
          success: false,
          message: "Please log in to continue.",
        });
      }

      req.user = session.user;
      req.authSession = session.session;

      next();
    } catch (error) {
      next(error);
    }
  };
}

// Require BOTH a current session and a matching signed JWT.
export function requireApiAuth(auth) {
  const checkSession = requireSession(auth);

  return (req, res, next) => {
    return checkSession(req, res, () => {
      const token = req.cookies?.[JWT_COOKIE_NAME];

      if (typeof token !== "string" || !token) {
        return res.status(401).json({
          success: false,
          message: "Access token is missing. Please refresh and try again.",
        });
      }

      let payload;

      try {
        payload = verifyAccessToken(token);
      } catch (error) {
        const tokenErrors = [
          "TokenExpiredError",
          "JsonWebTokenError",
          "NotBeforeError",
        ];

        if (!tokenErrors.includes(error.name)) {
          return next(error);
        }

        res.clearCookie(JWT_COOKIE_NAME, jwtCookieOptions());

        return res.status(401).json({
          success: false,
          message: "Access token is invalid or expired.",
        });
      }

      if (
        typeof payload !== "object" ||
        payload === null ||
        payload.sub !== req.user.id ||
        payload.sid !== req.authSession.id
      ) {
        res.clearCookie(JWT_COOKIE_NAME, jwtCookieOptions());

        return res.status(401).json({
          success: false,
          message: "Access token does not match your current session.",
        });
      }

      req.accessToken = payload;
      next();
    });
  };
}

export function requireTrustedOrigin(req, res, next) {
  const trustedOrigin =
    process.env.CLIENT_ORIGIN || "http://localhost:3000";

  if (req.get("origin") !== trustedOrigin) {
    return res.status(403).json({
      success: false,
      message: "Request origin is not allowed.",
    });
  }

  next();
}