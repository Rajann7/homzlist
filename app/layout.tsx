import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeScript } from "@/components/theme/ThemeScript";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

// Brand: HomzList placeholder (admin-changeable later — Doc1 §12).
export const metadata: Metadata = {
  title: {
    default: "HomzList — Properties without spam calls",
    template: "%s · HomzList",
  },
  description:
    "Instagram-style real estate listings. Browse flats, plots, and projects. Photos and text only — no spam calls.",
  applicationName: "HomzList",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "HomzList" },
  formatDetection: { telephone: false },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // prevent zoom-jank on inputs; app is a native-feel PWA
  userScalable: false,
  viewportFit: "cover", // enable env(safe-area-inset-*) on notched devices
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Set the theme before paint to avoid a flash of the wrong mode. */}
        <ThemeScript />
      </head>
      <body className="bg-page text-ink-primary font-sans antialiased">
        <ThemeProvider>
          <ToastProvider>
            {children}
            <InstallPrompt />
          </ToastProvider>
        </ThemeProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
