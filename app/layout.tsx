import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
const baseHref = `${basePath}/`;

export const metadata: Metadata = {
  title: 'CodeBolt · Learn. Code. Build.',
  description: 'CodeBolt is a hands-on learning space with interactive SQL lessons, Python practice, projects and coding tools.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <base href={baseHref} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#ffffff" />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
