import { fromNodeHeaders } from "better-auth/node";

export function requireSession(auth) {
  return async function sessionMiddleware(req, res, next) {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });

      if (!session?.user) {
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

export function requireTrustedOrigin(req, res, next) {
  const origin = req.get("origin");

  if (origin !== process.env.CLIENT_ORIGIN) {
    return res.status(403).json({
      success: false,
      message: "Request origin is not allowed.",
    });
  }

  next();
}