import type { Metadata } from 'next';
import { NavBar } from '@/components/nav-bar';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '面经整理',
    template: '%s | 面经整理',
  },
  description:
    '上传面经截图，AI 自动识别公司、岗位和面试内容，智能清洗冗余信息，只留干货。',
  keywords: [
    '面经',
    '面试经验',
    'AI识别',
    '面经清洗',
    '面试准备',
    '求职',
  ],
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`antialiased`}>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
