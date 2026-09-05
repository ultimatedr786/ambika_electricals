import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/shared/providers";

export const metadata: Metadata = {
  title: {
    default: "Ambika Electricals Rewards — Powered by Rewardly",
    template: "%s · Ambika Electricals Rewards",
  },
  description:
    "Earn reward points on every electrical purchase at Ambika Electricals — LED lighting, switches, wires, MCBs, fans and accessories. Redeem points for products, discounts and member offers.",
  applicationName: "Ambika Electricals Rewards",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Ambika Electricals Rewards",
    description: "A loyalty and rewards programme built for an electrical retailer.",
    siteName: "Ambika Electricals Rewards",
    type: "website",
  },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f1a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
