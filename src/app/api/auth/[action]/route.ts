import { z } from "zod";
import { db } from "@/lib/server/db";
import { body, handler, json } from "@/lib/server/api";
import {
  currentUser,
  requireUser,
  createSession,
  destroySession,
  issueAuthToken,
  safeUser,
} from "@/lib/server/auth";
import {
  hashPassword,
  verifyPassword,
  hashToken,
  HttpError,
  rateLimit,
  clientIp,
} from "@/lib/server/security";
const password = z.string().min(12).max(128);
const register = z.object({
  username: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9_]+$/)
    .transform((s) => s.toLowerCase()),
  email: z
    .string()
    .email()
    .max(191)
    .transform((s) => s.toLowerCase()),
  password,
});
export const GET = handler(async (request) => {
  if (new URL(request.url).pathname.endsWith("/me"))
    return json({ user: await currentUser() });
  throw new HttpError(404, "Not found.");
});
export const PATCH = handler(async (request) => {
  if (!new URL(request.url).pathname.endsWith("/me"))
    throw new HttpError(404, "Not found.");
  const user = await requireUser();
  const input = z
    .object({
      displayName: z.string().trim().min(1).max(100).optional(),
      bio: z.string().max(2000).optional(),
      adultOptIn: z.boolean().optional(),
    })
    .strict()
    .parse(await body(request));
  return json({
    user: await db.user.update({
      where: { id: user.id },
      data: input,
      select: safeUser,
    }),
  });
});
export const POST = handler(async (request) => {
  const action = new URL(request.url).pathname.split("/").pop();
  await rateLimit(`auth:${clientIp(request)}`, 30, 15 * 60_000);
  if (action === "logout") {
    await destroySession();
    return json({ ok: true });
  }
  if (action === "register") {
    const input = register.parse(await body(request));
    const user = await db.user.create({
      data: {
        username: input.username,
        email: input.email,
        passwordHash: await hashPassword(input.password),
        displayName: input.username,
      },
      select: safeUser,
    });
    await createSession(user.id);
    let emailSent = true;
    try {
      await issueAuthToken(user.id, user.email, "verify");
    } catch {
      emailSent = false;
    }
    return json(
      {
        user,
        emailSent,
        message: emailSent
          ? "Check your email to verify your account."
          : "Account created. Verification email is temporarily unavailable.",
      },
      201,
    );
  }
  if (action === "login") {
    const input = z
      .object({
        identifier: z.string().max(191),
        password: z.string().max(128),
      })
      .parse(await body(request));
    const identifier = input.identifier.toLowerCase();
    await rateLimit(`login:${identifier}`, 10, 15 * 60_000);
    const user = await db.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
    });
    const valid = await verifyPassword(
      input.password,
      user?.passwordHash ||
        "scrypt:00000000000000000000000000000000:" + "0".repeat(128),
    );
    if (!user || !valid)
      throw new HttpError(
        401,
        "Email, username or password is incorrect.",
        "INVALID_CREDENTIALS",
      );
    await destroySession();
    await createSession(user.id);
    return json({ user: await currentUser() });
  }
  if (action === "recover") {
    const { email } = z
      .object({
        email: z
          .string()
          .email()
          .transform((s) => s.toLowerCase()),
      })
      .parse(await body(request));
    await rateLimit(`recover:${email}`, 3, 3600_000);
    const user = await db.user.findUnique({ where: { email } });
    if (user)
      try {
        await issueAuthToken(user.id, user.email, "reset");
      } catch (error) {
        console.error("Recovery email unavailable");
      }
    return json({
      ok: true,
      message: "If that email has an account, a reset link has been sent.",
    });
  }
  if (action === "resend") {
    const user = await requireUser();
    await rateLimit(`resend:${user.id}`, 3, 3600_000);
    if (!user.verified) await issueAuthToken(user.id, user.email, "verify");
    return json({ ok: true });
  }
  if (action === "verify" || action === "reset") {
    const input = z
      .object({
        token: z.string().min(20).max(200),
        password: password.optional(),
      })
      .parse(await body(request));
    if (action === "reset" && !input.password)
      throw new HttpError(400, "A new password is required.");
    const token = await db.authToken.findUnique({
      where: { tokenHash: hashToken(input.token) },
    });
    if (!token || token.purpose !== action || token.expiresAt < new Date())
      throw new HttpError(
        400,
        "This link is invalid or expired.",
        "INVALID_TOKEN",
      );
    const passwordHash =
      action === "reset" ? await hashPassword(input.password!) : undefined;
    await db.$transaction(async (tx) => {
      const consumed = await tx.authToken.deleteMany({
        where: { id: token.id },
      });
      if (consumed.count !== 1)
        throw new HttpError(400, "This link has already been used.");
      await tx.user.update({
        where: { id: token.userId },
        data: action === "verify" ? { verified: true } : { passwordHash },
      });
      if (action === "reset")
        await tx.session.deleteMany({ where: { userId: token.userId } });
    });
    return json({ ok: true });
  }
  throw new HttpError(404, "Not found.");
});
