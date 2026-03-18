/**
 * /api/roadmap-js
 *
 * GET → sert le JS d'interaction de la roadmap (pan/zoom, activate, storage listener)
 *       servi dynamiquement depuis roadmap-visualizer.cjs — pas besoin de régénérer le HTML.
 */
import { createRequire } from 'module';
import type { RequestHandler } from './$types';

const LC_PATH  = process.env.LC_PATH ?? 'C:/lolve-cartography';
const _require = createRequire(import.meta.url);
const MOD_PATH = `${LC_PATH}/lib/roadmap-visualizer.cjs`;

export const GET: RequestHandler = () => {
    try {
        delete _require.cache[_require.resolve(MOD_PATH)];
    } catch { /* pas encore chargé */ }

    const { getInteractionJS } = _require(MOD_PATH);
    const js = getInteractionJS();

    return new Response(js, {
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
    });
};
