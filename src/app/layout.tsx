import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drilling Bonus System",
  description: "Modular bonus calculation system for drilling site employees",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
