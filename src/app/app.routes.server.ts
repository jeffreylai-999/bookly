import { RenderMode, ServerRoute } from '@angular/ssr';

/** Cookie-based auth needs a live request — no prerender in v1 (design §2). */
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
