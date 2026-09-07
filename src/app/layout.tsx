import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "门店婚恋会员管理后台",
  description: "线下相亲门店内部运营后台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
