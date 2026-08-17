import type { Metadata } from 'next';
import { Geist, Geist_Mono, Instrument_Serif, Nunito } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });
const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
});
const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-landing',
  weight: ['400', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'StockRápido — Sistema para kioscos',
  description:
    'Un solo sistema para cobrar, ordenar el stock y no saltar entre plataformas. Hecho por desarrolladores reales, abierto a sugerencias y actualizaciones.',
  icons: {
    icon: [{ url: '/brand/icon.svg', type: 'image/svg+xml' }],
    shortcut: '/brand/icon.svg',
    apple: '/brand/icon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${instrument.variable} ${nunito.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sr-theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','dark')}})();`,
          }}
        />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
