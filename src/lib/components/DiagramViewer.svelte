<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";

    type M = { sig: string; role: string | null; described: boolean; description: string | null; isPrivate: boolean };
    type Node = {
        name: string;
        extendsClass: string | null;
        depth: number;
        prefix: string;
        isLast: boolean;
        file: string | null;
        role: string | null;
        description: string | null;
        methods: M[];
    };

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

    let summary: { total: number; described: number } | null = null;
    let tree:    Node[] = [];
    let error    = "";
    let loading  = true;
    let expanded = new Set<string>();

    // Monaco state
    let selectedMethod: { nodeName: string; sig: string; key: string } | null = null;
    let snippetData: MethodSnippet | null = null;
    let snippetLoading = false;
    let snippetError: string | null = null;
    let editorContainer: HTMLDivElement | null = null;
    let editor: any = null;
    let monacoReady = false;
    let monacoFailed = false;

    const RC: Record<string, string> = {
        entry:    "#f7c948",
        core:     "#9181f9",
        service:  "#4caf50",
        flow:     "#38bdf8",
        bridge:   "#fb923c",
        helper:   "#6da86d",
        adapter:  "#a78060",
        internal: "#444",
    };
    const rc  = (r: string | null) => RC[r ?? ""] ?? "#3a3a4a";
    const pct = (n: number, d: number) => d > 0 ? Math.round(n / d * 100) : 0;

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
                (window as any).require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs" } });
                (window as any).require(["vs/editor/editor.main"], () => resolve());
            };
            s.onerror = () => reject();
            document.head.appendChild(s);
        });
    }

    function initEditor(snippet: MethodSnippet) {
        if (!editorContainer) return;
        const monaco = (window as any).monaco;
        if (editor) {
            const model = editor.getModel();
            if (model) monaco.editor.setModelLanguage(model, getLanguage(snippet.file));
            editor.setValue(snippet.snippet);
            editor.revealLine(1);
        } else {
            editor = monaco.editor.create(editorContainer, {
                value: snippet.snippet,
                language: getLanguage(snippet.file),
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
    }

    async function selectMethodSnippet(nodeName: string, m: M) {
        const key = `${nodeName}.${m.sig.split("(")[0].trim()}`;
        selectedMethod = { nodeName, sig: m.sig, key };
        snippetData = null;
        snippetError = null;
        snippetLoading = true;

        try {
            const res = await fetch(`/api/cartography/snippet?key=${encodeURIComponent(key)}`);
            const data = await res.json();
            if (data.error) { snippetError = data.error; return; }
            snippetData = data;
        } catch (e: any) {
            snippetError = e.message ?? "Erreur réseau";
            return;
        } finally {
            snippetLoading = false;
        }

        if (!snippetData) return;

        if (!monacoReady && !monacoFailed) {
            try {
                await loadMonaco();
                monacoReady = true;
            } catch {
                monacoFailed = true;
            }
        }

        await tick();
        if (monacoReady && snippetData) initEditor(snippetData);
    }

    function closeSnippet() {
        selectedMethod = null;
        snippetData = null;
        editor?.dispose();
        editor = null;
    }

    onDestroy(() => { editor?.dispose(); });

    // ── Agent de commentaire ───────────────────────────────────────────────
    let commentRunning = false;
    let commentLogs: string[] = [];
    let commentDone = false;
    let undescribedCount = 0;

    async function loadUndescribedCount() {
        try {
            const res = await fetch("/api/cartography/comment");
            if (res.ok) { undescribedCount = (await res.json()).undescribed ?? 0; }
        } catch { /* silencieux */ }
    }

    async function startCommentAgent(limit = 500) {
        if (commentRunning) return;
        commentRunning = true;
        commentLogs = [];
        commentDone = false;
        try {
            const res = await fetch("/api/cartography/comment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ limit }),
            });
            if (!res.ok || !res.body) { commentRunning = false; return; }
            const reader = res.body.getReader();
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
                        const { line } = JSON.parse(part.slice(5).trim());
                        commentLogs = [...commentLogs, line].slice(-12);
                    } catch { /* ignore */ }
                }
            }
            commentDone = true;
            await loadUndescribedCount();
            await load(); // recharger le diagramme avec les nouvelles descriptions
        } finally {
            commentRunning = false;
        }
    }

    onMount(async () => { await load(); await loadUndescribedCount(); });

    async function load() {
        loading = true; error = "";
        try {
            const res  = await fetch("/api/cartography/diagram");
            const body = await res.json();
            if (body.error) { error = body.error; return; }
            summary = body.summary;
            tree    = body.tree;
            // Start with inheritance roots expanded, leaves collapsed
            expanded = new Set(tree.filter(n => n.depth === 0 && hasChildren(n)).map(n => n.name));
        } catch (e: any) { error = e.message; }
        finally { loading = false; }
    }

    function hasChildren(node: Node) {
        const idx = tree.indexOf(node);
        return idx < tree.length - 1 && tree[idx + 1].depth > node.depth;
    }

    function toggle(name: string) {
        const n = new Set(expanded);
        n.has(name) ? n.delete(name) : n.add(name);
        expanded = n;
    }

    // A node is visible if all its ancestors are expanded
    function isVisible(node: Node, idx: number): boolean {
        if (node.depth === 0) return true;
        // Walk backwards to find ancestors
        let ancestorDepth = node.depth - 1;
        for (let i = idx - 1; i >= 0; i--) {
            if (tree[i].depth === ancestorDepth) {
                if (!expanded.has(tree[i].name)) return false;
                if (ancestorDepth === 0) return true;
                ancestorDepth--;
            }
        }
        return true;
    }

</script>

<div class="dv">
    {#if loading}
        <div class="dv-hint">Chargement…</div>
    {:else if error}
        <div class="dv-hint err">{error}</div>
    {:else if summary}


        <!-- ── Tree ────────────────────────────────────────────────────── -->
        <div class="dv-tree">
            {#each tree as node, idx}
                {#if isVisible(node, idx)}
                    {@const hasMethods = node.methods.length > 0}
                    {@const hasKids    = hasChildren(node)}
                    {@const isOpen     = expanded.has(node.name)}
                    {@const color      = rc(node.role)}
                    {@const covPct     = node.methods.length > 0 ? pct(node.methods.filter(m => m.described).length, node.methods.length) : null}

                    <!-- Class row -->
                    <div class="dv-row" class:has-methods={hasMethods} class:has-kids={hasKids}>
                        <!-- Tree prefix (connectors) -->
                        <span class="dv-prefix">{node.prefix}</span>

                        <!-- Expand toggle -->
                        {#if hasKids || hasMethods}
                            <button class="dv-toggle" onclick={() => toggle(node.name)} title={isOpen ? "Réduire" : "Développer"}>
                                {isOpen ? "▾" : "▸"}
                            </button>
                        {:else}
                            <span class="dv-toggle-ph"></span>
                        {/if}

                        <!-- Class name (colored by role) -->
                        <span class="dv-cls-name" style="color:{color}">{node.name}</span>

                        <!-- extends badge -->
                        {#if node.extendsClass}
                            <span class="dv-extends">extends {node.extendsClass}</span>
                        {/if}

                        <!-- Role pill -->
                        {#if node.role && node.role !== 'internal'}
                            <span class="dv-role" style="--c:{color}">{node.role}</span>
                        {/if}

                        <!-- Coverage dots -->
                        {#if covPct !== null}
                            <span class="dv-cov">
                                {#each node.methods.slice(0, 8) as m}
                                    <span class="dv-dot" style="background:{m.described ? rc(m.role) : 'transparent'}; border-color:{rc(m.role)}"></span>
                                {/each}
                                {#if node.methods.length > 8}<span class="dv-more">+{node.methods.length - 8}</span>{/if}
                            </span>
                        {/if}

                        <!-- Description if any -->
                        {#if node.description}
                            <span class="dv-desc">{node.description}</span>
                        {/if}
                    </div>

                    <!-- Methods list (when expanded) -->
                    {#if isOpen && hasMethods}
                        {@const methodIndent = node.prefix + (node.isLast ? "    " : "│   ")}
                        <div class="dv-methods-block">
                            {#each node.methods as m}
                                {@const isActive = selectedMethod?.nodeName === node.name && selectedMethod?.sig === m.sig}
                                <div
                                    class="dv-mrow"
                                    class:priv={m.isPrivate}
                                    class:active={isActive}
                                    title={m.description ?? ""}
                                    role="button"
                                    tabindex="0"
                                    onclick={() => selectMethodSnippet(node.name, m)}
                                    onkeydown={(e) => e.key === "Enter" && selectMethodSnippet(node.name, m)}
                                >
                                    <span class="dv-mpfx">{methodIndent}</span>
                                    <span class="dv-mdot" style="background:{m.described ? rc(m.role) : 'transparent'}; border-color:{rc(m.role)}"></span>
                                    <span class="dv-msig" class:described={m.described}>{m.sig}</span>
                                    {#if m.role && m.role !== 'internal' && m.role !== 'helper'}
                                        <span class="dv-mrole" style="color:{rc(m.role)}">{m.role}</span>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    {/if}
                {/if}
            {/each}
        </div>

        <!-- ── Agent commentaire ────────────────────────────────── -->
        {#if commentRunning || undescribedCount > 0 || commentDone}
            <div class="dv-comment-bar">
                {#if commentRunning}
                    <span class="dv-comment-status">⠿ En cours…</span>
                    <div class="dv-comment-log">
                        <div class="dv-clog-line">{commentLogs[commentLogs.length - 1] ?? ""}</div>
                    </div>
                {:else if commentDone}
                    <span class="dv-comment-status ok">✓ {commentLogs[commentLogs.length - 1] ?? "Terminé"}</span>
                    {#if undescribedCount > 0}
                        <span class="dv-comment-count">{undescribedCount} restantes</span>
                        <button class="dv-comment-btn" onclick={() => startCommentAgent()}>Relancer</button>
                    {/if}
                {:else}
                    <span class="dv-comment-count">{undescribedCount} méthode{undescribedCount > 1 ? "s" : ""} sans description</span>
                    <button class="dv-comment-btn" onclick={() => startCommentAgent()}>
                        Commenter avec Claude
                    </button>
                {/if}
            </div>
        {/if}

        <!-- ── Role legend ───────────────────────────────────────── -->
        <div class="dv-legend">
            {#each Object.entries(RC).filter(([r]) => r !== 'internal') as [role, color]}
                <span class="dv-leg-item" style="--c:{color}">
                    <span class="dv-leg-dot"></span>{role}
                </span>
            {/each}
        </div>

        <!-- ── Monaco snippet panel ──────────────────────────────── -->
        {#if selectedMethod}
            <div class="dv-snippet">
                <div class="dv-snippet-header">
                    {#if snippetData}
                        <span class="dv-snippet-file">{snippetData.file}:{snippetData.startLine}</span>
                        <span class="dv-snippet-sig">{snippetData.signature}</span>
                    {:else if snippetLoading}
                        <span class="dv-snippet-file">Chargement…</span>
                    {:else if snippetError}
                        <span class="dv-snippet-file dv-snippet-err">{snippetError}</span>
                    {/if}
                    <button class="dv-snippet-close" onclick={closeSnippet} title="Fermer">✕</button>
                </div>
                {#if monacoFailed && snippetData}
                    <pre class="dv-pre">{snippetData.snippet}</pre>
                {:else}
                    <div class="dv-monaco" bind:this={editorContainer}></div>
                {/if}
            </div>
        {/if}
    {/if}
</div>

<style>
.dv {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    font-family: 'JetBrains Mono', monospace;
    background: var(--bg-deep);
    color: #777;
}


/* ── Agent commentaire ── */
.dv-comment-bar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.28rem 0.9rem;
    border-top: 1px solid var(--border);
    background: var(--bg-panel);
    flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
    min-height: 1.8rem;
}
.dv-comment-count {
    font-size: 0.57rem;
    color: #555;
    flex: 1;
}
.dv-comment-status {
    font-size: 0.57rem;
    color: #555;
    font-style: italic;
}
.dv-comment-status.ok { color: #4caf50; font-style: normal; }
.dv-comment-log {
    flex: 1;
    overflow: hidden;
    font-size: 0.54rem;
    color: #3a3a5a;
}
.dv-clog-line {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.dv-comment-btn {
    background: #1a1040;
    border: 1px solid #4a3a8a;
    color: #9181f9;
    font-size: 0.57rem;
    padding: 0.12rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background 0.15s;
}
.dv-comment-btn:hover { background: #251850; }

/* Role legend (footer) */
.dv-legend {
    flex-shrink: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.4rem 0.9rem;
    border-top: 1px solid var(--border);
    background: var(--bg-deep);
}
.dv-leg-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.55rem;
    color: var(--c, #555);
    opacity: 0.7;
}
.dv-leg-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--c, #555);
}

/* ── Tree ────────────────────────────────────────────────── */
.dv-tree {
    flex: 1;
    overflow-y: auto;
    padding: 0.3rem 0 1rem;
}
.dv-tree::-webkit-scrollbar { width: 3px; }
.dv-tree::-webkit-scrollbar-track { background: transparent; }
.dv-tree::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 2px; }

/* Class row */
.dv-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.08rem 0.75rem 0.08rem 0;
    line-height: 1.6;
    transition: background 0.08s;
}
.dv-row:hover { background: var(--bg-panel); }

.dv-prefix {
    white-space: pre;
    font-size: 0.62rem;
    color: #1e1e30;
    flex-shrink: 0;
    user-select: none;
}
.dv-toggle {
    background: none;
    border: none;
    color: #2a2a3a;
    font-size: 0.6rem;
    cursor: pointer;
    padding: 0;
    width: 14px;
    text-align: center;
    flex-shrink: 0;
    line-height: 1;
    transition: color 0.1s;
}
.dv-toggle:hover { color: var(--accent-hover); }
.dv-toggle-ph { width: 14px; flex-shrink: 0; }

.dv-cls-name {
    font-size: 0.68rem;
    font-weight: 600;
    flex-shrink: 0;
    letter-spacing: 0.01em;
}
.dv-extends {
    font-size: 0.56rem;
    color: #252535;
    flex-shrink: 0;
    font-style: italic;
}
.dv-role {
    font-size: 0.52rem;
    color: var(--c, #555);
    border: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
    padding: 0.02rem 0.3rem;
    border-radius: 10px;
    flex-shrink: 0;
    letter-spacing: 0.04em;
}

/* Coverage dots */
.dv-cov {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    margin-left: 0.2rem;
}
.dv-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    border: 1px solid #333;
    flex-shrink: 0;
}
.dv-more {
    font-size: 0.48rem;
    color: #333;
    margin-left: 1px;
}
.dv-desc {
    font-size: 0.56rem;
    color: #2e2e3e;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
    font-style: italic;
    padding-left: 0.3rem;
}

/* Methods block */
.dv-methods-block {
    background: var(--bg-deep);
    border-bottom: 1px solid var(--border);
}
.dv-mrow {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.04rem 0.75rem 0.04rem 0;
    transition: background 0.06s;
}
.dv-mrow:hover { background: var(--bg-panel); }
.dv-mrow.priv { opacity: 0.35; }
.dv-mpfx {
    white-space: pre;
    font-size: 0.62rem;
    color: #141420;
    flex-shrink: 0;
    user-select: none;
}
.dv-mdot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    border: 1px solid var(--border-strong);
    flex-shrink: 0;
}
.dv-msig {
    font-size: 0.6rem;
    color: #3a3a50;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.dv-msig.described { color: #666; }
.dv-mrole {
    font-size: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
    opacity: 0.7;
}

.dv-hint { padding: 1rem; color: #222; font-size: 0.72rem; }
.dv-hint.err { color: #7a2020; }

/* ── Méthode active ──────────────────────────────────────── */
.dv-mrow {
    cursor: pointer;
}
.dv-mrow.active {
    background: var(--bg-subtle);
}
.dv-mrow.active .dv-msig {
    color: var(--accent-hover);
}

/* ── Panneau snippet Monaco ──────────────────────────────── */
.dv-snippet {
    flex-shrink: 0;
    height: 260px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    background: var(--bg-deep);
}
.dv-snippet-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.2rem 0.6rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--bg-panel);
}
.dv-snippet-file {
    font-size: 0.55rem;
    color: #2a2a4a;
    font-style: italic;
    flex-shrink: 0;
}
.dv-snippet-sig {
    font-size: 0.6rem;
    color: #444;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.dv-snippet-err { color: #7a2a2a; }
.dv-snippet-close {
    margin-left: auto;
    background: none;
    border: none;
    color: #2a2a3a;
    font-size: 0.65rem;
    cursor: pointer;
    padding: 0 0.2rem;
    line-height: 1;
    transition: color 0.1s;
}
.dv-snippet-close:hover { color: var(--accent-hover); }
.dv-monaco {
    flex: 1;
    min-height: 0;
}
.dv-pre {
    flex: 1;
    min-height: 0;
    overflow: auto;
    margin: 0;
    padding: 0.6rem 0.8rem;
    font-size: 0.65rem;
    color: #777;
    line-height: 1.55;
    white-space: pre;
    background: var(--bg-deep);
    font-family: 'JetBrains Mono', monospace;
}
.dv-pre::-webkit-scrollbar { width: 3px; height: 3px; }
.dv-pre::-webkit-scrollbar-thumb { background: var(--scrollbar); }
</style>
