<script lang="ts">
    import { onDestroy } from "svelte";
    import FileCodeView from "./FileCodeView.svelte";

    export let issueNum: number;
    export let symbols: { key: string; dir: string; file?: string }[];

    // file path → liste des clés de symboles dans ce fichier
    let fileGroups: { file: string; keys: string[] }[] = [];
    let resolving = false;
    let _lastSymbols: typeof symbols | null = null;

    async function resolveFiles(syms: typeof symbols) {
        if (syms === _lastSymbols) return;
        _lastSymbols = syms;
        if (syms.length === 0) { fileGroups = []; return; }

        resolving = true;

        // Résoudre les chemins manquants en parallèle
        const resolved: Record<string, string> = {};
        for (const s of syms) {
            if (s.file) resolved[s.key] = s.file;
        }

        const missing = syms.filter(s => !s.file);
        await Promise.all(missing.map(async (s) => {
            try {
                const res = await fetch(`/api/symbol?key=${encodeURIComponent(s.key)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.file) resolved[s.key] = data.file;
                }
            } catch { /* ignoré */ }
        }));

        // Grouper par fichier en respectant l'ordre des symboles
        const order: string[] = [];
        const groups = new Map<string, string[]>();
        for (const s of syms) {
            const f = resolved[s.key];
            if (!f) continue;
            if (!groups.has(f)) { groups.set(f, []); order.push(f); }
            groups.get(f)!.push(s.key);
        }

        fileGroups = order.map(f => ({ file: f, keys: groups.get(f)! }));
        resolving = false;
    }

    $: resolveFiles(symbols);
</script>

<div class="coalv">
    <div class="coalv-bar">
        <span class="coalv-issue">#{issueNum}</span>
        <span class="coalv-sep">·</span>
        <span class="coalv-count">
            {#if resolving && fileGroups.length === 0}
                résolution…
            {:else}
                {fileGroups.length} fichier{fileGroups.length !== 1 ? 's' : ''} · {symbols.length} symboles
            {/if}
        </span>
    </div>
    <div class="coalv-scroll">
        {#each fileGroups as fg (fg.file)}
            <div class="coalv-slot">
                <FileCodeView filePath={fg.file} symbolKeys={fg.keys} />
            </div>
        {/each}
    </div>
</div>

<style>
.coalv {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}
.coalv-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.75rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-panel);
    font-family: 'JetBrains Mono', monospace;
}
.coalv-issue { font-size: 0.62rem; color: #3a7f8f; font-weight: 600; }
.coalv-sep   { font-size: 0.55rem; color: #2a2a2a; }
.coalv-count { font-size: 0.55rem; color: #333; }
.coalv-scroll {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}
.coalv-scroll::-webkit-scrollbar { width: 4px; }
.coalv-scroll::-webkit-scrollbar-track { background: transparent; }
.coalv-scroll::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }
.coalv-slot {
    flex-shrink: 0;
    border-bottom: 1px solid #1a1a1a;
}
</style>
