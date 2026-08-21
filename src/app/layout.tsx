import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/app-shell";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { DEFAULT_LANG, LANG_COOKIE, isLang } from "@/lib/i18n/messages";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Finance Platform",
  description:
    "Reconcile and file the monthly finance close. Trustworthy totals, no manual retyping.",
};

// Render per-request so the language cookie is honored on the server (no static prerender).
export const dynamic = "force-dynamic";

// Impeccable direction contract — emitted as a real HTML comment (JSX comments
// are stripped at compile), first child of <body>, greppable in the built output.
const DIRECTION_CONTRACT = `<!--
  IMPECCABLE DIRECTION CONTRACT · seed f32dc34a · mode operate
  THESIS: The app is a well-kept accountant's filing ledger, not a dashboard; it refuses the metric-card grid and shows its work so the numbers earn trust.
  OWN-WORLD: Warm ledger-paper ground, warm near-black ink, hairline rules; workhorse sans for chrome, tabular mono for every figure. Color speaks only as status: reconciled green, discrepancy amber, error red. Filing tabs divide the two features.
  STORY: Veronica drops in an export, sees the correct total with its work shown, trusts it, and exports a clean workbook, and the close takes minutes.
  FIRST VIEWPORT: A ruled ledger sheet under feature tabs; a single upload rule invites the file; after upload the total sits large in tabular mono with a status tick, the counted rows ruled beneath it.
  FORM: Tabbed filing ledger, grounded candidate 5 of 7; seed f32dc34a.
  FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
-->`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const cookieLang = cookieStore.get(LANG_COOKIE)?.value;
  const initialLang = isLang(cookieLang) ? cookieLang : DEFAULT_LANG;

  return (
    <html
      lang={initialLang}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <div hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        <LanguageProvider initialLang={initialLang}>
          <TooltipProvider delay={200}>
            <AppShell>{children}</AppShell>
          </TooltipProvider>
        </LanguageProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
