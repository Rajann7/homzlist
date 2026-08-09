import type { Metadata, Viewport } from "next";
import { getBranding } from "@/lib/branding/service";
import "./globals.css";
import { ThemeScript } from "@/components/theme/ThemeScript";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

/**
 * Brand metadata, from `branding_settings` (Doc1 §12 / Doc7 §181).
 *
 * It was three literals — here, in the manifest and in the feed footer — while
 * the admin's Branding tab wrote rows nothing read. `getBranding` caches for a
 * minute in-process, so this is not a query per render, and the admin screen's
 * own promise to the operator is "within 5 minutes".
 */
export async function generateMetadata(): Promise<Metadata> {
  const { appName, tagline } = await getBranding();
  return {
    title: {
      default: `${appName} — ${tagline}`,
      template: `%s · ${appName}`,
    },
    description:
      `${tagline}. Browse flats, plots and projects from owners, brokers and builders — photos and text only, no spam calls.`,
    applicationName: appName,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "default", title: appName },
    formatDetection: { telephone: false },
    icons: {
      icon: "/icons/icon-192.png",
      apple: "/icons/apple-touch-icon.png",
    },
  };
}

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
            {/* Inside the provider: the registrar raises the "New version —
                Refresh" toast (Doc3 §98), so it needs useToast. */}
            <ServiceWorkerRegistrar />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
