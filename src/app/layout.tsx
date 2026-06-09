import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TenantProvider } from "@/lib/tenant/provider";
import { AppHeader } from "@/components/app-header";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";

// Plus Jakarta Sans — modern geometric-humanist sans, highly legible for both
// UI and certificate copy. Feeds the theme's --font-sans (body + headings).
const sans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Monospace for tabular figures / run data.
const mono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Energy Cal",
  description:
    "Field-first proving and meter management for custody-transfer measurement.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TenantProvider>
            <UnsavedChangesGuard />
            <AppHeader />
            <div className="flex-1">{children}</div>
          </TenantProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
