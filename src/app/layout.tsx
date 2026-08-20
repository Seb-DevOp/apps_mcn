import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "MCN — The Vault",
  description:
    "Maine Coon Network — The Vault. Return each day, rise through the six ranks of the Guardians, and discover what the Vault is filling with.",
  manifest: "/manifest.webmanifest",
  applicationName: "MCN — The Vault",
  appleWebApp: {
    capable: true,
    title: "MCN Vault",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon-180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#05080f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // The mini-game relies on precise taps; a stray double-tap zoom would ruin a run.
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="vault-backdrop" aria-hidden />
        <div className="vault-grain" aria-hidden />
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
