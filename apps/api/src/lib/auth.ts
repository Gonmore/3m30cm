import type { Role } from "@prisma/client";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import type { JwtPayload, Secret, SignOptions } from "jsonwebtoken";

import { env } from "../config/env.js";

const { sign, verify } = jwt;

function parseGoogleClientIds(value?: string) {
  if (!value) {
    return [] as string[];
  }

  return value
    .split(",")
    .map((clientId) => clientId.trim())
    .filter(Boolean);
}

export function getConfiguredGoogleClientIds() {
  return [
    ...parseGoogleClientIds(env.GOOGLE_CLIENT_ID_WEB),
    ...parseGoogleClientIds(env.GOOGLE_CLIENT_ID_ANDROID),
    ...parseGoogleClientIds(env.GOOGLE_CLIENT_ID_IOS),
  ];
}

export interface AuthTokenPayload extends JwtPayload {
  sub: string;
  email: string;
  platformRole: Role | null;
  teamRoles: Role[];
}

export function createAccessToken(payload: AuthTokenPayload) {
  const expiresIn = env.JWT_ACCESS_EXPIRES_IN as NonNullable<SignOptions["expiresIn"]>;

  return sign(payload, env.JWT_ACCESS_SECRET as Secret, { expiresIn });
}

export function verifyAccessToken(token: string) {
  const decoded = verify(token, env.JWT_ACCESS_SECRET as Secret);

  if (typeof decoded === "string") {
    throw new Error("Invalid token payload");
  }

  return decoded as AuthTokenPayload;
}

/**
 * Verifies a Google ID token issued to any of the configured client IDs.
 * Returns the payload (sub, email, name, picture) or throws if invalid.
 */
export async function verifyGoogleIdToken(idToken: string) {
  const clientIds = getConfiguredGoogleClientIds();

  if (clientIds.length === 0) {
    throw new Error("No Google client IDs configured");
  }

  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({ idToken, audience: clientIds });
  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email) {
    throw new Error("Invalid Google ID token payload");
  }

  return {
    googleSub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified ?? false,
    firstName: payload.given_name ?? null,
    lastName: payload.family_name ?? null,
    picture: payload.picture ?? null,
  };
}
