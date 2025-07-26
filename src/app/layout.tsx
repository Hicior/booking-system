import type { Metadata } from "next";
import "./globals.css";
import { Navigation } from "@/components/Navigation";
import { ToastProvider } from "@/components/ui";

export const metadata: Metadata = {
  title: "System Rezerwacji - Pub Mentzen",
  description: "System rezerwacji dla pracowników Pubu Mentzen",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning={true}>
        <ToastProvider>
          <Navigation />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
