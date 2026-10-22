import type { APIRoute } from 'astro';
import { designCss } from '../loaders/design';

/** The design library plus every preset theme, served as one stylesheet. */
export const GET: APIRoute = () => {
  const { library, themes } = designCss();
  return new Response(`${library}\n${themes}`, { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
};
