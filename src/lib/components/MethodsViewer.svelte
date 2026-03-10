<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";

    export let taskId: string;

    interface MethodSnippet {
        key: string;
        file: string;
        startLine: number;
        endLine: number;
        snippet: string;
        signature: string;
        role: string | null;
        description: string | null;
    }

    let methods: MethodSnippet[] = [];
    let loading = true;
    let error: string | null = null;
    let selected: MethodSnippet | null = null;
    let editorContainer: HTMLDivElement | null = null;
    let editor: any = null;
    let monacoLoaded = false;
    let monacoError = false;

    $: grouped = (() => {
        const groups: Record<string, MethodSnippet[]> = {};
        for (const m of methods) {
            const cls = m.key.includes(".") ? m.key.split(".")[0] : m.key;
            if (!groups[cls]) groups[cls] = [];
            groups[cls].push(m);
        }
        return groups;
    })();

    function getLanguage(file: string): string {
        if (file.endsWith(".ts") || file.endsWith(".tsx")) return "typescript";
        if (file.endsWith(".js") || file.endsWith(".jsx")) return "javascript";
        if (file.endsWith(".py")) return "python";
        if (file.endsWith(".java")) return "java";
        if (file.endsWith(".go")) return "go";
        if (file.endsWith(".cs")) return "csharp";
        return "javascript";
    }

    async function loadMonaco(): Promise<void> {
        if ((window as any).monaco) return;
        await new Promise<void>((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs/loader.js";
            s.onload = () => {
                (window as any).require.config({
                    paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs" }
                });
                (window as any).require(["vs/editor/editor.main"], () => resolve());
            };
            s.onerror = () => reject(new Error("Monaco CDN inaccessible"));
            document.head.appendChild(s);
        });
    }

    function initEditor() {
        if (!editorContainer || !(window as any).monaco || !selected) return;
        editor = (window as any).monaco.editor.create(editorContainer, {
            value: selected.snippet,
            language: getLanguage(selected.file),
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
    }

    function selectMethod(m: MethodSnippet) {
        selected = m;
        if (!editor) return;
        const monaco = (window as any).monaco;
        const model = editor.getModel();
        if (model) monaco.editor.setModelLanguage(model, getLanguage(m.file));
        editor.setValue(m.snippet);
        editor.revealLine(1);
    }

    onMount(async () => {
        try {
            const res = await fetch(`/api/tasks/${taskId}/methods`);
            const data = await res.json();
            if (data.error) { error = data.error; return; }
            methods = data.methods ?? [];
            if (methods.length) selected = methods[0];
        } catch (e: any) {
            error = e.message ?? "Erreur réseau";
            return;
        } finally {
            loading = false;
        }

        if (!methods.length) return;

        try {
            await loadMonaco();
            monacoLoaded = true;
            await tick();
            initEditor();
        } catch {
            monacoError = true;
        }
    });

    onDestroy(() => {
        editor?.dispose();
    });
</script>

<div class="mv">
    <div class="mv-header">
        <span class="mv-label">Symboles concernés</span>
        {#if !loading && !error}
            <span class="mv-count">{methods.length} méthode{methods.length > 1 ? "s" : ""}</span>
        {/if}
    </div>

    {#if loading}
        <div class="mv-state">Chargement…</div>
    {:else if error}
        <div class="mv-state mv-error">{error}</div>
    {:else if methods.length === 0}
        <div class="mv-state">Aucun symbole correspondant trouvé.</div>
    {:else}
        <div class="mv-body">
            <!-- Liste méthodes -->
            <div class="mv-list">
                {#each Object.entries(grouped) as [cls, items]}
                    <div class="mv-group">
                        <div class="mv-cls">{cls}</div>
                        {#each items as m}
                            <button
                                class="mv-method"
                                class:active={selected?.key === m.key}
                                onclick={() => selectMethod(m)}
                                title={m.description ?? m.key}
                            >
                                <span class="mv-sig">.{m.key.includes(".") ? m.key.split(".").slice(1).join(".") : m.key}</span>
                                {#if m.role}
                                    <span class="mv-role">{m.role}</span>
                                {/if}
                            </button>
                        {/each}
                    </div>
                {/each}
            </div>

            <!-- Zone éditeur -->
            <div class="mv-editor-area">
                {#if selected}
                    <div class="mv-file-hint">{selected.file}:{selected.startLine}</div>
                {/if}
                {#if monacoLoaded && !monacoError}
                    <div class="mv-editor" bind:this={editorContainer}></div>
                {:else}
                    <pre class="mv-fallback">{selected?.snippet ?? ""}</pre>
                {/if}
            </div>
        </div>
    {/if}
</div>

<style>
.mv {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #05050f;
    font-family: 'JetBrains Mono', monospace;
    border-top: 1px solid #141414;
}
.mv-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem 1rem;
    border-bottom: 1px solid #141414;
    flex-shrink: 0;
    background: #07070f;
}
.mv-label {
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #333;
    flex: 1;
}
.mv-count {
    font-size: 0.55rem;
    color: #2a2a4a;
    font-style: italic;
}
.mv-state {
    padding: 0.8rem 1rem;
    font-size: 0.65rem;
    color: #333;
    font-style: italic;
}
.mv-error { color: #7a3a2a; }
.mv-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}
/* ── Liste méthodes ── */
.mv-list {
    width: 160px;
    flex-shrink: 0;
    overflow-y: auto;
    border-right: 1px solid #141414;
    background: #06060f;
    padding: 0.3rem 0;
}
.mv-list::-webkit-scrollbar { width: 3px; }
.mv-list::-webkit-scrollbar-thumb { background: #1a1a2a; }
.mv-group { margin-bottom: 0.4rem; }
.mv-cls {
    font-size: 0.57rem;
    color: #2a2a4a;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 0.25rem 0.6rem 0.1rem;
}
.mv-method {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    width: 100%;
    background: none;
    border: none;
    padding: 0.22rem 0.6rem;
    cursor: pointer;
    text-align: left;
    font-family: 'JetBrains Mono', monospace;
    transition: background 0.1s;
}
.mv-method:hover { background: #0d0d1a; }
.mv-method.active { background: #0e0b1a; }
.mv-sig {
    font-size: 0.6rem;
    color: #555;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.mv-method.active .mv-sig { color: #9181f9; }
.mv-role {
    font-size: 0.5rem;
    color: #2a2a4a;
    flex-shrink: 0;
    font-style: italic;
}
/* ── Zone éditeur ── */
.mv-editor-area {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.mv-file-hint {
    font-size: 0.55rem;
    color: #2a2a3a;
    padding: 0.2rem 0.6rem;
    border-bottom: 1px solid #0e0e1a;
    flex-shrink: 0;
    font-style: italic;
    background: #06060f;
}
.mv-editor {
    flex: 1;
    min-height: 0;
}
.mv-fallback {
    flex: 1;
    min-height: 0;
    overflow: auto;
    margin: 0;
    padding: 0.6rem 0.8rem;
    font-size: 0.65rem;
    color: #777;
    line-height: 1.55;
    white-space: pre;
    background: #07070f;
    font-family: 'JetBrains Mono', monospace;
}
.mv-fallback::-webkit-scrollbar { width: 3px; height: 3px; }
.mv-fallback::-webkit-scrollbar-thumb { background: #1a1a2a; }
</style>
