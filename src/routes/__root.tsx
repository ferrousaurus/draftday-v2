import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeadContent, Outlet, Scripts, createRootRoute, useNavigate } from '@tanstack/react-router';
import { MantineProvider } from '@mantine/core';
import { useEffect } from 'react';
import { loadFile, loadPlayers } from '../lib/storage.ts';
import { usePlayersStore, useSettingsStore } from '../lib/store.ts';
import type { AppSettings } from '../lib/types.ts';
import { BOARD_SEARCH_DEFAULTS } from '../lib/board-search.ts';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const Route = createRootRoute({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        charSet: 'utf8',
      },
      {
        content: 'width=device-width, initial-scale=1',
        name: 'viewport',
      },
      {
        title: 'Draft Day',
      },
    ],
  }),
});

function RootComponent() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <MantineProvider defaultColorScheme="auto">
          <QueryClientProvider client={queryClient}>
            <BootRestore />
            <Outlet />
          </QueryClientProvider>
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  );
}

function waitForHydration(): Promise<AppSettings> {
  return new Promise((resolve) => {
    if (useSettingsStore.persist.hasHydrated()) {
      resolve(useSettingsStore.getState().settings);
      return;
    }
    useSettingsStore.persist.onFinishHydration(() => resolve(useSettingsStore.getState().settings));
  });
}

/** Restore flow (§7): with file + players + settings, navigate straight to /board. */
function BootRestore() {
  const navigate = useNavigate({ from: '/' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [settings, file, players] = await Promise.all([waitForHydration(), loadFile(), loadPlayers()]);
      if (cancelled) return;
      if (players !== null) usePlayersStore.getState().setPlayers(players);
      if (players !== null && file !== null && window.location.pathname === '/') {
        void navigate({ to: '/board', search: BOARD_SEARCH_DEFAULTS });
      }
      void settings;
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return null;
}
