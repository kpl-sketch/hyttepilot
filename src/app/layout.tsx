import type { Metadata } from "next";
import "@fontsource-variable/schibsted-grotesk";
import "./globals.css";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description: "Hyttene i vennekretsen din, samlet ett sted. Bare for inviterte.",
  // Piloten er lukket og skal ikke dukke opp i søk.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nb" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
