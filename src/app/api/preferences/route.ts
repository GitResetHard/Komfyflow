import { cookies } from "next/headers";
import { z } from "zod";
import { handler, body, json } from "@/lib/server/api";
import { currentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { signPreference } from "@/lib/server/security";
export const POST = handler(async (request) => {
  const { adultOptIn } = z
    .object({ adultOptIn: z.boolean() })
    .parse(await body(request));
  const user = await currentUser();
  if (user)
    await db.user.update({ where: { id: user.id }, data: { adultOptIn } });
  else
    (await cookies()).set("kf_adult", signPreference(adultOptIn), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 365 * 86400,
    });
  return json({ adultOptIn });
});
