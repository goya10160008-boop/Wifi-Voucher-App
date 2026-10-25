import type { Metadata, Viewport } from "next";
import { DM_Mono, DM_Sans } from "next/font/google";
import "./globals.css";

// next/font downloads and self-hosts these at build time: no font CDN at runtime.
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-dm-mono", display: "swap" });

export const metadata: Metadata = {
  title: "A&B WiFi Vouchers",
  appleWebApp: { capable: true, title: "WiFi Vouchers", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-icon.png" },
};

export const viewport: Viewport = { themeColor: "#166534" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
