import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Mac",
  description: "A desktop whose apps are written the moment you open them.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
