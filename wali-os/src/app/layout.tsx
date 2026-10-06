import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

// Body/UI: Inter 400-600. Headings, titles, numbers, buttons: Inter Tight 700-900.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"], weight: ["700", "800", "900"] });

export const metadata: Metadata = {
  title: { default: "Wali OS", template: "%s · Wali OS" },
  description: "Internal operating system for a global growth consulting business.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7fbfd" } /* --brand-bg */,
    { media: "(prefers-color-scheme: dark)", color: "#0a2342" } /* --brand-deep-2 */,
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${interTight.variable} antialiased`}>
      <body className="min-h-svh font-sans">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            {children}
            <Toaster position="bottom-right" richColors closeButton />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
