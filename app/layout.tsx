import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StockerView",
  description: "StockerView market research terminal for live market data, news, futures, macro, and ticker analysis."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
