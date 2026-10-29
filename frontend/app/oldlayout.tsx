import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/src/components/Providers";
import { Toaster } from "sonner";
import PageLoader from "@/src/components/PageLoader";

export const metadata: Metadata = {
  title: "Lead Finder Agent",
  description: "Production-ready Lead Finder Agent",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <PageLoader />
        <Providers>
          {children}
          <Toaster position="top-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
