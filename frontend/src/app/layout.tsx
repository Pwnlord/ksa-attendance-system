import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kora Sales Academy Attendance",
  description: "Simple, secure attendance for Kora Sales Academy.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
