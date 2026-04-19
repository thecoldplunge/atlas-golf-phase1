import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Golf Course Designer',
  description: '2D top-down golf course designer',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full min-h-full bg-gray-900 text-gray-100">{children}</body>
    </html>
  );
}
