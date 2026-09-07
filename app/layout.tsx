import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { APP_CONFIG } from "../config/app.config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_CONFIG.appName, template: `%s · ${APP_CONFIG.appName}` },
  description: "Личная семейная книга рецептов, фотографий и тёплых воспоминаний.",
  applicationName: APP_CONFIG.appName,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: APP_CONFIG.appName, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  other: { "mobile-web-app-capable": "yes" },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    shortcut: "/favicon.svg",
    apple: "/icons/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" style={{ "--primary": APP_CONFIG.theme.primary, "--wine": APP_CONFIG.theme.primary, "--wine-dark": APP_CONFIG.theme.primaryDark, "--paper": APP_CONFIG.theme.paper, "--foreground": APP_CONFIG.theme.ink, "--gold": APP_CONFIG.theme.accent } as CSSProperties}>
      <head><meta name="theme-color" content={APP_CONFIG.theme.primary} /></head>
      <body>{children}</body>
    </html>
  );
}
