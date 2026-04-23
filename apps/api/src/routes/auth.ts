import bcrypt from "bcryptjs";
import { Prisma, SeasonPhase } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import { randomBytes, randomInt } from "crypto";
import nodemailer from "nodemailer";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { buildTrainingDaysJson, buildWeekdaysJson } from "../lib/athlete-programs.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { createAccessToken, getConfiguredGoogleClientIds, verifyGoogleIdToken } from "../lib/auth.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const athleteRegistrationSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  displayName: z.string().trim().optional(),
  sport: z.string().trim().optional(),
  trainsSport: z.boolean().default(false),
  sportTrainingDays: z.array(z.number().int().min(0).max(6)).optional(),
  seasonPhase: z.nativeEnum(SeasonPhase).default(SeasonPhase.OFF_SEASON),
  availableWeekdays: z.array(z.number().int().min(0).max(6)).optional(),
  notes: z.string().trim().optional(),
});

export const authRouter = Router();

authRouter.post("/register/athlete", async (req: Request, res: Response) => {
  try {
    const payload = athleteRegistrationSchema.parse(req.body);
    const email = payload.email.toLowerCase();
    const passwordHash = await bcrypt.hash(payload.password, 10);

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      res.status(409).json({ message: "Ya existe una cuenta con este email" });
      return;
    }

    const user = await prisma.user.create({
      data: {
        email,
        firstName: payload.firstName ?? null,
        lastName: payload.lastName ?? null,
        passwordHash,
      },
      include: {
        memberships: {
          select: {
            role: true,
            teamId: true,
          },
        },
      },
    });

    const athleteProfile = await prisma.athleteProfile.create({
      data: {
        userId: user.id,
        displayName: payload.displayName ?? payload.firstName ?? email,
        sport: payload.sport ?? null,
        trainsSport: payload.trainsSport,
        seasonPhase: payload.seasonPhase,
        weeklyAvailability: buildWeekdaysJson(payload.availableWeekdays),
        sportTrainingDays: buildTrainingDaysJson(payload.trainsSport ? payload.sportTrainingDays : undefined),
        notes: payload.notes ?? null,
      },
      select: {
        id: true,
        displayName: true,
        sport: true,
        trainsSport: true,
        seasonPhase: true,
        weeklyAvailability: true,
        sportTrainingDays: true,
        notes: true,
      },
    });

    const token = createAccessToken({
      sub: user.id,
      email: user.email,
      platformRole: user.platformRole,
      teamRoles: user.memberships.map((membership) => membership.role),
    });

    res.status(201).json({
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        platformRole: user.platformRole,
        teamRoles: user.memberships.map((membership) => membership.role),
      },
      athleteProfile,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid payload", issues: error.issues });
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ message: "Ya existe una cuenta con este email" });
      return;
    }

    console.error("Athlete registration failed", error);
    res.status(500).json({ message: "Athlete registration failed" });
  }
});

authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const credentials = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: credentials.email.toLowerCase() },
      include: {
        memberships: {
          select: {
            role: true,
            teamId: true,
          },
        },
      },
    });

    if (!user?.passwordHash) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const isPasswordValid = await bcrypt.compare(credentials.password, user.passwordHash);

    if (!isPasswordValid) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const token = createAccessToken({
      sub: user.id,
      email: user.email,
      platformRole: user.platformRole,
      teamRoles: user.memberships.map((membership) => membership.role),
    });

    res.json({
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        platformRole: user.platformRole,
        teamRoles: user.memberships.map((membership) => membership.role),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid payload", issues: error.issues });
      return;
    }

    console.error("Login failed", error);
    res.status(500).json({ message: "Login failed" });
  }
});

authRouter.get("/me", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.auth?.sub;

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            team: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        platformRole: user.platformRole,
        memberships: user.memberships,
      },
    });
  } catch (error) {
    console.error("Failed to fetch current user", error);
    res.status(500).json({ message: "Failed to fetch current user" });
  }
});

// ── Google OAuth ─────────────────────────────────────────────────────────────

const googleSchema = z.object({ idToken: z.string().min(1) });

authRouter.post("/google", async (req: Request, res: Response) => {
  try {
    const { idToken } = googleSchema.parse(req.body);
    const googlePayload = await verifyGoogleIdToken(idToken);

    const email = googlePayload.email.toLowerCase();

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email },
      include: { memberships: { select: { role: true } } },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          firstName: googlePayload.firstName,
          lastName: googlePayload.lastName,
          avatarUrl: googlePayload.picture,
          oauthProvider: "google",
          oauthProviderId: googlePayload.googleSub,
          athleteProfile: {
            create: {
              displayName: `${googlePayload.firstName ?? ""} ${googlePayload.lastName ?? ""}`.trim() || email,
            },
          },
        },
        include: { memberships: { select: { role: true } } },
      });
    } else if (!user.oauthProviderId) {
      // Existing password account — link Google
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          oauthProvider: "google",
          oauthProviderId: googlePayload.googleSub,
          avatarUrl: user.avatarUrl ?? googlePayload.picture,
        },
        include: { memberships: { select: { role: true } } },
      });
    }

    const token = createAccessToken({
      sub: user.id,
      email: user.email,
      platformRole: user.platformRole,
      teamRoles: user.memberships.map((m) => m.role),
    });

    res.json({
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        platformRole: user.platformRole,
        teamRoles: user.memberships.map((m) => m.role),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid payload", issues: error.issues });
      return;
    }
    console.error("Google auth failed", error);
    const diagnosticRequested = req.header("x-auth-debug") === "1";
    const detail = error instanceof Error ? error.message : "Unknown Google auth error";

    res.status(401).json({
      message: "Google authentication failed",
      ...(diagnosticRequested ? {
        detail,
        configuredClientIds: getConfiguredGoogleClientIds(),
      } : {}),
    });
  }
});

// ── Forgot password ───────────────────────────────────────────────────────────

const forgotPasswordSchema = z.object({ email: z.string().email() });

authRouter.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    // Always respond 200 to prevent email enumeration
    if (!user || !user.passwordHash) {
      res.json({ message: "Si existe una cuenta, recibirás un email con instrucciones." });
      return;
    }

    const token = randomBytes(32).toString("hex");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_EXPIRES_MINUTES * 60 * 1000);

    // Invalidate previous tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, code, expiresAt },
    });

    const resetUrl = `${env.WEB_URL}/reset-password?token=${token}`;
    const deepLink = `jump30cm-game://reset-password?token=${token}`;
    const resetMessageText = `Usa este código para restablecer tu contraseña: ${code}\n\nAbre este enlace en la app:\n${deepLink}\n\nO desde el navegador:\n${resetUrl}\n\nEl código y el enlace expiran en ${env.PASSWORD_RESET_EXPIRES_MINUTES} minutos.`;
    const resetMessageHtml = `<div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;"><p>Usa este código para restablecer tu contraseña:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:12px 0 20px;">${code}</p><p><a href="${deepLink}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#f2b544;color:#0a1628;text-decoration:none;font-weight:700;">Restablecer contraseña</a></p><p>Si prefieres, también puedes abrir este enlace en el navegador:<br><a href="${resetUrl}">${resetUrl}</a></p><p>El código y el enlace expiran en ${env.PASSWORD_RESET_EXPIRES_MINUTES} minutos.</p></div>`;

    const logResetFallback = () => {
      console.info(`[DEV] Password reset token for ${email}: ${token}`);
      console.info(`[DEV] Password reset code for ${email}: ${code}`);
      console.info(`[DEV] Password reset deep link for ${email}: ${deepLink}`);
      console.info(`[DEV] Password reset web URL for ${email}: ${resetUrl}`);
    };

    if (env.SMTP_HOST && env.SMTP_USER) {
      const transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
        tls: env.SMTP_TLS_SERVERNAME ? { servername: env.SMTP_TLS_SERVERNAME } : undefined,
      });

      try {
        await transporter.sendMail({
          from: env.SMTP_FROM,
          to: user.email,
          subject: "Restablecer contraseña — 3m30cm",
          text: resetMessageText,
          html: resetMessageHtml,
        });
      } catch (mailError) {
        if (env.NODE_ENV !== "production") {
          console.warn("SMTP send failed in non-production, using log fallback", mailError);
          logResetFallback();
        } else {
          throw mailError;
        }
      }
    } else {
      // Dev fallback: log the token
      logResetFallback();
    }

    res.json({ message: "Si existe una cuenta, recibirás un email con instrucciones." });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid payload", issues: error.issues });
      return;
    }
    console.error("Forgot password failed", error);
    res.status(500).json({ message: "Forgot password failed" });
  }
});

// ── Reset password (from email link) ─────────────────────────────────────────

const resetPasswordSchema = z.object({
  token: z.string().min(1).optional(),
  email: z.string().email().optional(),
  code: z.string().regex(/^\d{6}$/).optional(),
  newPassword: z.string().min(8),
}).refine((payload) => Boolean(payload.token) || Boolean(payload.email && payload.code), {
  message: "Token or email and code are required",
  path: ["token"],
});

authRouter.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { token, email, code, newPassword } = resetPasswordSchema.parse(req.body);
    const normalizedEmail = email?.toLowerCase();

    if (!token && (!normalizedEmail || !code)) {
      res.status(400).json({ message: "Email y código son obligatorios cuando no se usa token." });
      return;
    }

    const record = token
      ? await prisma.passwordResetToken.findUnique({ where: { token } })
      : await prisma.passwordResetToken.findFirst({
        where: {
          code: code as string,
          usedAt: null,
          expiresAt: { gte: new Date() },
          user: { is: { email: normalizedEmail as string } },
        },
        orderBy: { createdAt: "desc" },
      });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      res.status(400).json({ message: "El enlace o el código son inválidos o han expirado." });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);

    res.json({ message: "Contraseña actualizada correctamente." });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid payload", issues: error.issues });
      return;
    }
    console.error("Reset password failed", error);
    res.status(500).json({ message: "Reset password failed" });
  }
});

// ── Change password (authenticated) ──────────────────────────────────────────

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

authRouter.patch("/change-password", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) { res.status(401).json({ message: "Authentication required" }); return; }

    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });

    if (!user?.passwordHash) {
      res.status(400).json({ message: "Esta cuenta no tiene contraseña configurada (OAuth)." });
      return;
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      res.status(401).json({ message: "La contraseña actual es incorrecta." });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    res.json({ message: "Contraseña actualizada correctamente." });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid payload", issues: error.issues });
      return;
    }
    console.error("Change password failed", error);
    res.status(500).json({ message: "Change password failed" });
  }
});
