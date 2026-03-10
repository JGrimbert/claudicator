<script lang="ts">
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
    let monacoLoaded = false;
    let monacoError = false;
    let loadedForTaskId = "";

    $: if (taskId && taskId !== loadedForTaskId) {
        loadedForTaskId = taskId;
        doLoad(taskId);
    }

    $: byFile = (() => {
        const map = new Map<string, MethodSnippet[]>();
        for (const m of methods) {
            const arr = map.get(m.file) ?? [];
            arr.push(m);
            map.set(m.file, arr);
        }
        return [...map.entries()];
    })();

    $: totalChars = methods.reduce((s, m) => s + (m.snippet?.length ?? 0), 0);
    $: totalTokens = Math.round(totalChars / 4);

    function getLanguage(file: string): string {
        if (file.endsWith(".ts") || file.endsWith(".tsx")) return "typescript";
        if (file.endsWith(".js") || file.endsWith(".jsx")) return "javascript";
        if (file.endsWith(".py")) return "python";
        if (file.endsWith(".java")) return "java";
        if (file.endsWith(".go")) return "go";
        if (file.endsWith(".cs")) return "csharp";
        return "javascript";
    }

    function editorHeight(snippet: string): number {
        const lines = snippet.split("\n").length;
        return Math.min(Math.max(lines, 3), 80) * 18;
    }

    function monacoAction(node: HTMLElement, m: MethodSnippet) {
        const monaco = (window as any).monaco;
        const ed = monaco.editor.create(node, {
            value: m.snippet,
            language: getLanguage(m.file),
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
        return {
            destroy() { ed.dispose(); }
        };
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

    async function doLoad(id: string) {
        methods = [];
        loading = true;
        error = null;
        monacoLoaded = false;
        try {
            const res = await fetch(`/api/tasks/${id}/methods`);
            const data = await res.json();
            if (data.error) { error = data.error; return; }
            methods = data.methods ?? [];
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
        } catch {
            monacoError = true;
        }
    }
</script>

<div class="cv">
    <div class="cv-header">
        {#if loading}
            <span class="cv-count">Chargement…</span>
        {:else if error}
            <span class="cv-err">{error}</span>
        {:else if methods.length === 0}
            <span class="cv-count">Aucun symbole</span>
        {:else}
            <span class="cv-count">{methods.length} symbole{methods.length > 1 ? "s" : ""}</span>
            <span class="cv-tokens">~{totalTokens} tokens ({totalChars} cars)</span>
        {/if}
    </div>

    {#if !loading && !error && methods.length > 0}
        <div class="cv-scroll">
            {#each byFile as [file, items] (file)}
                <div class="cv-file-sep">{file}</div>
                {#each items as m (m.key)}
                    <div class="cv-sym-sep">
                        <span class="cv-sym-key">{m.key}</span>
                        {#if m.role}<span class="cv-sym-role">{m.role}</span>{/if}
                        {#if m.description}<span class="cv-sym-desc">{m.description}</span>{/if}
                    </div>
                    {#if monacoLoaded && !monacoError}
                        <div
                            class="cv-editor"
                            style="height: {editorHeight(m.snippet)}px"
                            use:monacoAction={m}
                        ></div>
                    {:else}
                        <pre class="cv-fallback" style="height: {editorHeight(m.snippet)}px">{m.snippet}</pre>
                    {/if}
                {/each}
            {/each}
        </div>
    {/if}
</div>

<style>
.cv {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #05050f;
    font-family: 'JetBrains Mono', monospace;
    overflow: hidden;
}
.cv-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.4rem 1rem;
    border-bottom: 1px solid #141414;
    flex-shrink: 0;
    background: #07070f;
}
.cv-count {
    font-size: 0.58rem;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.1em;
}
.cv-tokens {
    font-size: 0.58rem;
    color: #333;
    font-style: italic;
}
.cv-err {
    font-size: 0.63rem;
    color: #7a3a2a;
}
.cv-scroll {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
}
.cv-scroll::-webkit-scrollbar { width: 4px; }
.cv-scroll::-webkit-scrollbar-thumb { background: #1a1a2a; border-radius: 2px; }
.cv-file-sep {
    padding: 0.3rem 1rem;
    background: #111;
    border-top: 1px solid #1a1a1a;
    border-bottom: 1px solid #1a1a1a;
    font-size: 0.6rem;
    color: #444;
    letter-spacing: 0.06em;
    position: sticky;
    top: 0;
    z-index: 1;
}
.cv-sym-sep {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.25rem 1rem;
    background: #0f0f0f;
    border-bottom: 1px solid #161616;
}
.cv-sym-key {
    font-size: 0.63rem;
    color: #9181f9;
    flex-shrink: 0;
}
.cv-sym-role {
    font-size: 0.55rem;
    color: #3a3a5a;
    font-style: italic;
    flex-shrink: 0;
}
.cv-sym-desc {
    font-size: 0.6rem;
    color: #555;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.cv-editor {
    width: 100%;
    border-bottom: 1px solid #141414;
}
.cv-fallback {
    overflow-x: auto;
    padding: 0.5rem 0.75rem;
    background: #090910;
    border-bottom: 1px solid #141414;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: #bbb;
    white-space: pre;
    margin: 0;
    line-height: 1.5;
    box-sizing: border-box;
}
</style>
