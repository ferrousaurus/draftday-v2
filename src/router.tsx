import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen.ts';

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
  });

  return router;
}

// Route-typed hooks (`useRouter`, `useNavigate`, …) resolve through the
// registered router instance. Module augmentation requires `interface` merging,
// which `type` cannot express — the rule is disabled for this declaration.
/* eslint-disable typescript/consistent-type-definitions */
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
/* eslint-enable typescript/consistent-type-definitions */
