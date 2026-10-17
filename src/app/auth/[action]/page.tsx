import { redirect } from "next/navigation";
export default async function AuthAction({
  params,
  searchParams,
}: {
  params: Promise<{ action: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { action } = await params;
  const { token } = await searchParams;
  const mode = ["verify", "reset", "recover", "register", "login"].includes(
    action,
  )
    ? action
    : "login";
  redirect(
    `/auth?mode=${mode}${token ? `&token=${encodeURIComponent(token)}` : ""}`,
  );
}
