import type { Role } from "@prisma/client";
import jwt from "jsonwebtoken";
import type { JwtPayload, Secret, SignOptions } from "jsonwebtoken";

import { env } from "../config/env.js";

const { sign, verify } = jwt;

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
