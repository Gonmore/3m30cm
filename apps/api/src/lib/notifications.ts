import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";

export async function notifyUsers(
  userIds: string[],
  input: { type: string; title: string; body?: string | null; data?: Prisma.InputJsonValue },
) {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (!unique.length) return;
  await prisma.userNotification.createMany({
    data: unique.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      ...(input.data !== undefined ? { data: input.data } : {}),
      read: false,
    })),
  });
}

export async function notifySuperAdmins(input: { type: string; title: string; body?: string | null; data?: Prisma.InputJsonValue }) {
  const admins = await prisma.user.findMany({ where: { platformRole: "SUPERADMIN" }, select: { id: true } });
  await notifyUsers(admins.map((a) => a.id), input);
}
