<script lang="ts">
    import { onDestroy } from "svelte";

    export let symbol: { name: string; dir: string };

    let container: HTMLDivElement | null = null;
    let editor: any = null;
    let loading = true;
    let notFound = false;
    let currentName = "";

    async function loadMonaco(): Promise<void> {
        if ((window as any).monaco) return;
        await new Promise<void>((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs/loader.js";
            s.onload = () => {
                (window as any).require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs" } });
                (window as any).require(["vs/editor/editor.main"], () => resolve());
            };
            s.onerror = () => reject(new Error("Monaco CDN failed"));
            document.head.appendChild(s);
        });
    }

    async function init(sym: typeof symbol) {
        if (editor) { editor.dispose(); editor = null; }
        loading = true;
        notFound = false;
        currentName = sym.name;

        let snippet = "";
        try {
            const res = await fetch(`/api/symbol?key=${encodeURIComponent(sym.name)}`);
            if (!res.ok) { notFound = true; loading = false; return; }
            const data = await res.json();
            snippet = data.snippet ?? "";
        } catch { notFound = true; loading = false; return; }

        loading = false;
        if (!container || currentName !== sym.name) return;

        try {
            await loadMonaco();
            const monaco = (window as any).monaco;
            if (!container || currentName !== sym.name) return;
            editor = monaco.editor.create(container, {
                value: snippet,
                language: "typescript",
                readOnly: true,
                theme: "vs-dark",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                lineNumbers: "on",
                renderLineHighlight: "none",
                overviewRulerLanes: 0,
                folding: false,
                glyphMargin: false,
                lineDecorationsWidth: 4,
                lineNumbersMinChars: 3,
                scrollbar: { vertical: "auto", horizontal: "hidden" },
            });
        } catch { /* Monaco unavailable — fallback pre is shown */ }
    }

    $: init(symbol);

    onDestroy(() => { if (editor) editor.dispose(); });
</script>

<div class="ccv">
    <div class="ccv-header">
        <span class="ccv-dir">{symbol.dir}/</span>
        <span class="ccv-sym">{symbol.name.split(".").at(-1)}</span>
        <span class="ccv-full">{symbol.name}</span>
    </div>
    {#if loading}
        <div class="ccv-state">…</div>
    {:else if notFound}
        <div class="ccv-state ccv-err">Symbole introuvable</div>
    {:else}
        <div class="ccv-editor" bind:this={container}></div>
    {/if}
</div>

<style>
.ccv {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
}
.ccv-header {
    flex-shrink: 0;
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    padding: 0.35rem 0.75rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-panel);
    font-family: 'JetBrains Mono', monospace;
    overflow: hidden;
}
.ccv-dir {
    font-size: 0.58rem;
    color: #444;
    flex-shrink: 0;
}
.ccv-sym {
    font-size: 0.65rem;
    color: #9181f9;
    flex-shrink: 0;
}
.ccv-full {
    font-size: 0.52rem;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
}
.ccv-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.65rem;
    font-family: 'JetBrains Mono', monospace;
    color: #333;
    font-style: italic;
}
.ccv-err { color: #5a2a2a; }
.ccv-editor {
    flex: 1;
    min-height: 0;
}
</style>
