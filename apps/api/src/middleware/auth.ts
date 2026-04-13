import type { Role } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";

import { verifyAccessToken, type AuthTokenPayload } from "../lib/auth.js";

export interface AuthenticatedRequest extends Request {
  auth?: AuthTokenPayload;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const token = authorization.slice("Bearer ".length).trim();

  try {
    req.auth = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function requireRole(allowedRoles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const userRoles = new Set<Role>([
      ...(req.auth.platformRole ? [req.auth.platformRole] : []),
      ...req.auth.teamRoles,
    ]);

    const hasAccess = allowedRoles.some((role) => userRoles.has(role));

    if (!hasAccess) {
      res.status(403).json({ message: "Insufficient permissions" });
      return;
    }

    next();
  };
}
