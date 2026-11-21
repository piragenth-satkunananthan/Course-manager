import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { connection } from "next/server";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-jakarta" });

export const metadata: Metadata = { title: "Course-manager" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection(); // render per request, so Next.js applies the CSP nonce from src/proxy.ts
  return (
    <html lang="en" className={jakarta.variable}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
