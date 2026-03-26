import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RepoBrain",
  description: "Codebase intelligence — understand any codebase as if you wrote it",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
