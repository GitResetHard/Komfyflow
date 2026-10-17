import type { Metadata } from "next";
import "./globals.css";
import { PlatformProvider, Shell } from "@/components/platform";
export const metadata: Metadata = {
  title: "Komfyflow — A good workflow changes everything.",
  description:
    "Discover, understand, and share ComfyUI workflows. A community-built home for creative systems.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <PlatformProvider>
          <Shell>{children}</Shell>
        </PlatformProvider>
      </body>
    </html>
  );
}
