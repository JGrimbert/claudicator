<script lang="ts">
    import { onMount } from "svelte";

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

    let summary: { total: number; described: number } | null = null;
    let tree:    Node[] = [];
    let error    = "";
    let loading  = true;
    let expanded = new Set<string>();
    let copied   = false;

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

    onMount(load);

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

    async function copyJSDocPrompt() {
        const byFile: Record<string, string[]> = {};
        for (const node of tree) {
            for (const m of node.methods) {
                if (!m.described && node.file) {
                    const f = node.file;
                    if (!byFile[f]) byFile[f] = [];
                    byFile[f].push(m.sig);
                }
            }
        }
        if (!summary) return;
        const undocCount = summary.total - summary.described;
        const sections = Object.entries(byFile).sort()
            .map(([f, sigs]) => `${f}\n${sigs.map(s => `  - ${s}`).join("\n")}`)
            .join("\n\n");

        const prompt =
`TASK
Documenter les méthodes non annotées avec JSDoc in-situ dans src/prima.

CONTEXTE
${undocCount}/${summary.total} méthodes sans documentation JSDoc.
Roles : entry, core, service, flow, bridge, helper, adapter, internal

MÉTHODES À DOCUMENTER
${sections}

INSTRUCTIONS
Ajouter un commentaire JSDoc directement au-dessus de chaque déclaration :

/**
 * @role [entry|core|service|...]
 * @description Brève description du comportement métier (1-2 phrases).
 * @param {type} nom - Description
 * @returns {type} Valeur retournée
 */

Règles : ne jamais modifier le corps des méthodes.`;

        await navigator.clipboard.writeText(prompt);
        copied = true;
        setTimeout(() => { copied = false; }, 2000);
    }
</script>

<div class="dv">
    {#if loading}
        <div class="dv-hint">Chargement…</div>
    {:else if error}
        <div class="dv-hint err">{error}</div>
    {:else if summary}

        <!-- ── Header ──────────────────────────────────────────────────── -->
        <div class="dv-header">
            <div class="dv-stat-row">
                <button class="dv-copy-btn" onclick={copyJSDocPrompt}>
                    {copied ? "✓" : "JSDoc prompt →"}
                </button>
            </div>
            <div class="dv-prog">
                <div class="dv-prog-fill" style="width:{pct(summary.described, summary.total)}%"></div>
            </div>

            <!-- Role legend -->
            <div class="dv-legend">
                {#each Object.entries(RC).filter(([r]) => r !== 'internal') as [role, color]}
                    <span class="dv-leg-item" style="--c:{color}">
                        <span class="dv-leg-dot"></span>{role}
                    </span>
                {/each}
            </div>
        </div>

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
                                <div class="dv-mrow" class:priv={m.isPrivate} title={m.description ?? ""}>
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
    {/if}
</div>

<style>
.dv {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    font-family: 'JetBrains Mono', monospace;
    background: #06060e;
    color: #777;
}

/* ── Header ─────────────────────────────────────────────── */
.dv-header {
    flex-shrink: 0;
    padding: 0.5rem 0.9rem;
    background: #08081a;
    border-bottom: 1px solid #141422;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
}
.dv-stat-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: wrap;
}
.dv-num  { font-size: 0.78rem; font-weight: 600; color: #9181f9; }
.dv-lbl  { font-size: 0.56rem; color: #2a2a3a; text-transform: uppercase; letter-spacing: 0.08em; }
.dv-sep  { color: #1a1a2a; font-size: 0.6rem; }

.dv-copy-btn {
    margin-left: auto;
    background: none;
    border: 1px solid #252535;
    color: #444;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.58rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    letter-spacing: 0.03em;
    transition: color 0.1s, border-color 0.1s;
}
.dv-copy-btn:hover { color: #9181f9; border-color: #4a3a8a; }

.dv-prog {
    height: 2px;
    background: #0f0f22;
    border-radius: 1px;
    overflow: hidden;
}
.dv-prog-fill {
    height: 100%;
    background: linear-gradient(90deg, #2a1a5e, #9181f9);
    border-radius: 1px;
    transition: width 0.4s ease;
}

/* Role legend */
.dv-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding-top: 0.1rem;
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
.dv-tree::-webkit-scrollbar-thumb { background: #1a1a2a; border-radius: 2px; }

/* Class row */
.dv-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.08rem 0.75rem 0.08rem 0;
    line-height: 1.6;
    transition: background 0.08s;
}
.dv-row:hover { background: #0b0b1c; }

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
.dv-toggle:hover { color: #9181f9; }
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
    background: #060610;
    border-bottom: 1px solid #0e0e1a;
}
.dv-mrow {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.04rem 0.75rem 0.04rem 0;
    transition: background 0.06s;
}
.dv-mrow:hover { background: #0c0c1e; }
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
    border: 1px solid #2a2a3a;
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
</style>
