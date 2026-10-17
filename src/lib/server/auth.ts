import { cookies } from "next/headers";
import { db } from "./db";
import {
  hashToken,
  randomToken,
  HttpError,
  verifyPreference,
} from "./security";
export const safeUser = {
  id: true,
  username: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  verified: true,
  adultOptIn: true,
} as const;
const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
export async function currentUser() {
  const token = (await cookies()).get("kf_session")?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: safeUser } },
  });
  return session && session.expiresAt > new Date() ? session.user : null;
}
export async function viewer() {
  const user = await currentUser();
  return {
    user,
    id: user?.id,
    adultOptIn:
      user?.adultOptIn ??
      verifyPreference((await cookies()).get("kf_adult")?.value),
  };
}
export async function requireUser() {
  const user = await currentUser();
  if (!user)
    throw new HttpError(401, "Please sign in to continue.", "AUTH_REQUIRED");
  return user;
}
export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 30 * 86400_000);
  await db.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });
  (await cookies()).set("kf_session", token, {
    ...options,
    expires: expiresAt,
  });
}
export async function destroySession() {
  const cookie = await cookies();
  const token = cookie.get("kf_session")?.value;
  if (token)
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  cookie.delete("kf_session");
}
export async function sendAuthEmail(
  email: string,
  purpose: "verify" | "reset",
  token: string,
) {
  const link = `${process.env.APP_URL || "http://localhost:3000"}/auth/${purpose}?token=${encodeURIComponent(token)}`;
  if (process.env.MAIL_WEBHOOK_URL) {
    const response = await fetch(process.env.MAIL_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MAIL_WEBHOOK_TOKEN || ""}`,
      },
      body: JSON.stringify({ to: email, template: purpose, link }),
    });
    if (!response.ok) throw new Error("Email delivery failed");
  } else if (process.env.NODE_ENV !== "production") {
    console.info(`[development email] ${purpose}: ${link}`);
  } else throw new Error("Transactional email is not configured");
}
export async function issueAuthToken(
  userId: string,
  email: string,
  purpose: "verify" | "reset",
) {
  const token = randomToken();
  await db.authToken.deleteMany({ where: { userId, purpose } });
  await db.authToken.create({
    data: {
      userId,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(
        Date.now() + (purpose === "reset" ? 3600_000 : 86400_000),
      ),
    },
  });
  await sendAuthEmail(email, purpose, token);
}
