<script lang="ts">
    import { onDestroy, tick } from "svelte";

    export let filePath: string;
    export let symbolKeys: string[] = [];

    let container: HTMLDivElement | null = null;
    let editor: any = null;
    let loading = true;
    let notFound = false;
    let currentPath = "";

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

    async function init(fp: string) {
        if (editor) { editor.dispose(); editor = null; }
        loading = true;
        notFound = false;
        currentPath = fp;

        let content = "";
        try {
            const res = await fetch(`/api/file?path=${encodeURIComponent(fp)}`);
            if (!res.ok) { notFound = true; loading = false; return; }
            const data = await res.json();
            content = data.content ?? "";
        } catch { notFound = true; loading = false; return; }

        loading = false;
        await tick();
        if (!container || currentPath !== fp) return;

        try {
            await loadMonaco();
            const monaco = (window as any).monaco;
            if (!container || currentPath !== fp) return;

            const lang = fp.endsWith(".svelte") ? "html"
                       : fp.endsWith(".ts")     ? "typescript"
                       : fp.endsWith(".js") || fp.endsWith(".cjs") ? "javascript"
                       : "plaintext";

            editor = monaco.editor.create(container, {
                value: content,
                language: lang,
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
                scrollbar: { vertical: "hidden", horizontal: "hidden", alwaysConsumeMouseWheel: false },
            });

            const applyHeight = () => {
                if (!editor || !container) return;
                const h = editor.getContentHeight();
                container.style.height = h + "px";
                editor.layout({ width: container.clientWidth, height: h });
            };
            editor.onDidContentSizeChange(applyHeight);
            applyHeight();
        } catch { /* Monaco unavailable */ }
    }

    $: init(filePath);

    onDestroy(() => { if (editor) editor.dispose(); });

    $: shortName = filePath.split("/").pop() ?? filePath;
    $: dir = filePath.split("/").slice(-2, -1)[0] ?? "";
</script>

<div class="fcv">
    <div class="fcv-header">
        <span class="fcv-dir">{dir}/</span>
        <span class="fcv-sym">{shortName}</span>
        <span class="fcv-full">{filePath}</span>
        {#if symbolKeys.length > 0}
            <span class="fcv-badge">{symbolKeys.length}</span>
        {/if}
    </div>
    {#if loading}
        <div class="fcv-state">…</div>
    {:else if notFound}
        <div class="fcv-state fcv-err">Fichier introuvable</div>
    {:else}
        <div class="fcv-editor" bind:this={container}></div>
    {/if}
</div>

<style>
.fcv {
    display: flex;
    flex-direction: column;
    overflow: visible;
}
.fcv-header {
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
.fcv-dir  { font-size: 0.58rem; color: #444; flex-shrink: 0; }
.fcv-sym  { font-size: 0.65rem; color: #9181f9; flex-shrink: 0; }
.fcv-full {
    font-size: 0.52rem;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
}
.fcv-badge {
    margin-left: auto;
    flex-shrink: 0;
    font-size: 0.52rem;
    font-family: 'JetBrains Mono', monospace;
    color: #3a7f8f;
    background: rgba(58,127,143,0.12);
    border-radius: 3px;
    padding: 0.1rem 0.35rem;
}
.fcv-state {
    padding: 0.75rem;
    font-size: 0.65rem;
    font-family: 'JetBrains Mono', monospace;
    color: #333;
    font-style: italic;
}
.fcv-err { color: #5a2a2a; }
.fcv-editor { flex: none; }
</style>
