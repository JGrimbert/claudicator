/**
 * Lit un flux SSE (Server-Sent Events) d'analyse et appelle onLog pour chaque entrée.
 */
export async function readAnalysisStream(
    response: Response,
    onLog: (entry: { type: string; line: string }) => void
): Promise<void> {
    if (!response.body) return;
    const reader = response.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
            if (!part.startsWith("data:")) continue;
            try {
                const entry = JSON.parse(part.slice(5).trim());
                onLog(entry);
            } catch { /* ignore */ }
        }
    }
}
