import type { Metadata, Viewport } from "next";
import { Cinzel_Decorative, Fredoka, Geist, Geist_Mono, Outfit } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], weight: ["400", "600", "700", "800"] });
// Home page only. Quiz prompts stay on Outfit; the builder and player stay on Geist.
const pageSans = Fredoka({ variable: "--font-page", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const pageDisplay = Cinzel_Decorative({
  variable: "--font-fancy",
  subsets: ["latin"],
  weight: "900",
});

export const metadata: Metadata = {
  title: "Quiz Simulator",
  description: "Build quizzes with images and themes, then run them solo or on the big screen.",
  applicationName: "Quiz Simulator",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Quiz Sim",
    // The stage is dark, so a translucent bar keeps the notch area from banding.
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#05060c",
  // Installed full-screen, the stage should reach into the safe areas.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} ${pageSans.variable} ${pageDisplay.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
