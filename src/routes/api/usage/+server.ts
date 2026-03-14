/** Usage — retourne la consommation de tokens du projet (GET) */
import { getProjectUsage } from "$lib/server/services/usage";

/** Retourne l'utilisation courante du projet */
export function GET() {
    const usage = getProjectUsage();
    return new Response(JSON.stringify(usage), {
        headers: { "Content-Type": "application/json" }
    });
}
