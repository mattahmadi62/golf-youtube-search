import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "CaddieReel — Find golf videos by course",
    template: "%s · CaddieReel",
  },
  description:
    "Search every golf YouTube video by the course where it was filmed. CaddieReel reads titles, descriptions, and captions across the biggest channels so you can find videos at Pebble, Bandon, St Andrews and 250+ more.",
  openGraph: {
    title: "CaddieReel — Find golf videos by course",
    description:
      "Search every golf YouTube video by the course where it was filmed.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
