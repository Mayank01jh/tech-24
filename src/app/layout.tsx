import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tech24 - What Changed in Tech Over the Last 24 Hours',
  description: 'AI-curated, structured, and scored technology news portal. Discover what happened in research, development, products, and trends with 3-bullet takeaways.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
