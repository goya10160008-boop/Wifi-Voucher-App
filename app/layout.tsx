import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A&B WiFi Vouchers",
  appleWebApp: { capable: true, title: "WiFi Vouchers", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-icon.png" },
};

export const viewport: Viewport = { themeColor: "#1d4ed8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
