import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { Nav } from "@/components/shared/Nav";
import "./globals.css";

// IBM Plex over the default Geist/Arial stack: real enterprise/engineering
// character (IBM's own industrial heritage) that reads deliberately in a
// warehouse/SAP-adjacent tool, and a matching mono for material numbers,
// PO references, and delivery IDs — not on the "every AI UI" shortlist
// (Inter/Roboto/Geist/etc.) either.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "ArgusAI",
  description: "Voice-driven warehouse goods receipt",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-foreground">
        <Nav />
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
