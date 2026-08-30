import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { AppShell } from '@/components/app-shell';
import { ToastProvider } from '@/components/ui';
import { SWUpdater } from '@/components/sw-updater';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata = {
  title: 'Stash — save anything, come back to it',
  description: 'Open-source, self-hosted save-for-later. Links, videos, recipes, workouts — organized for you with your own AI key.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Stash' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#faf6f0',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-cream text-ink antialiased dark:bg-night dark:text-night-ink">
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <AppShell>{children}</AppShell>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
        <SWUpdater />
      </body>
    </html>
  );
}