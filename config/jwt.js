import jwt from "jsonwebtoken";

export const JWT_COOKIE_NAME = "studiospace_access";
export const JWT_LIFETIME_SECONDS = 15 * 60;

const issuer = "studiospace-server";
const audience = "studiospace-private-api";

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 64) {
    throw new Error(
      "JWT_SECRET must contain at least 64 characters. Generate a random secret."
    );
  }

  return secret;
}

export function jwtCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api",
  };
}

export function createAccessToken(userId, sessionId) {
  return jwt.sign(
    {
      sid: sessionId,
    },
    getJwtSecret(),
    {
      algorithm: "HS256",
      subject: userId,
      issuer,
      audience,
      expiresIn: JWT_LIFETIME_SECONDS,
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret(), {
    algorithms: ["HS256"],
    issuer,
    audience,
    maxAge: JWT_LIFETIME_SECONDS,
  });
}