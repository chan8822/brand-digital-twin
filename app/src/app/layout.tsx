import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Brand Digital Twin OS",
  description: "Profit on Ad Spend — the truth ROAS hides.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-text-primary antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
