import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/shell/app-shell";
import { BRAND } from "@/lib/brand";
import { getAllSettings } from "@/server/settings/store";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: BRAND,
  description: "Personal AI operating environment",
};

// Settings come from the database on every request, so nothing here is prerendered.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const settings = getAllSettings();
  return (
    // "dark" is hardcoded, not a toggle: JARVIS has one theme, defined directly
    // on :root in globals.css. The class only activates shadcn's dark: variants.
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider delayDuration={200}>
          <AppShell settings={settings}>{children}</AppShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
