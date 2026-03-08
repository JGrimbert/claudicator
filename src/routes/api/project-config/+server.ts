import { json } from "@sveltejs/kit";
import {
    getProjectConfig,
    setProjectConfig,
    GLOBAL_IGNORE_DIRS,
} from "$lib/server/services/project-config";

export async function GET() {
    return json({ ...getProjectConfig(), globalIgnoreDirs: GLOBAL_IGNORE_DIRS });
}

export async function PATCH({ request }) {
    try {
        const body = await request.json();
        const updated = setProjectConfig(body);
        return json(updated);
    } catch (err: any) {
        return json({ error: err.message }, { status: 400 });
    }
}
