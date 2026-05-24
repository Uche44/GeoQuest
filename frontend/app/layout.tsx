import type { Metadata } from "next";
import { Syne, DM_Mono, Fraunces } from "next/font/google";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "GeoQuest — Location Discovery & Rewards",
  description: "A real-world exploration and rewards platform built on Celo.",
  other: {
    "talentapp:project_verification": "884eb34da30efdd19941cc6201b9737974292dda4c0cfd6f71cce64f775b57350aae525984cd58ab530a6f0be45a21a0d42017c556cea0162c33f39eeb2a698d"
  }
};



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${dmMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink font-sans">{children}</body>
    </html>
  );
}

