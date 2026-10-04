import type { Metadata } from "next";
import { Inter, Noto_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ChannelScopeProvider } from "@/lib/channel-scope-context";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const notoSans = Noto_Sans({ subsets: ["latin"], variable: "--font-status" });

export const metadata: Metadata = {
  title: "OBM Commerce Hub",
  description: "Central admin panel for OBM's storefronts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${notoSans.variable} font-sans antialiased`}>
        <AuthProvider>
          <ChannelScopeProvider>{children}</ChannelScopeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
