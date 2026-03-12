<script lang="ts">
    import { onMount } from "svelte";
    import { createEventDispatcher } from "svelte";

    const dispatch = createEventDispatcher();

    type Config = {
        extraIgnoreDirs: string[];
        commentOnlyKeywords: string[];
        globalIgnoreDirs?: string[];
    };

    let config: Config = { extraIgnoreDirs: [], commentOnlyKeywords: [] };
    let globalDirs: string[] = [];
    let loading = true;
    let saving = false;
    let saveMsg = "";

    let newDir = "";
    let newKeyword = "";

    onMount(loadConfig);

    async function loadConfig() {
        loading = true;
        try {
            const res = await fetch("/api/project-config");
            if (res.ok) {
                const data = await res.json();
                globalDirs = data.globalIgnoreDirs ?? [];
                config = { extraIgnoreDirs: data.extraIgnoreDirs ?? [], commentOnlyKeywords: data.commentOnlyKeywords ?? [] };
            }
        } catch { /* ignore */ }
        loading = false;
    }

    async function save() {
        saving = true;
        saveMsg = "";
        try {
            const res = await fetch("/api/project-config", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ extraIgnoreDirs: config.extraIgnoreDirs, commentOnlyKeywords: config.commentOnlyKeywords })
            });
            if (res.ok) saveMsg = "✓ sauvegardé";
            else { const d = await res.json(); saveMsg = d.error ?? "erreur"; }
        } catch (e: any) {
            saveMsg = e.message;
        }
        saving = false;
        setTimeout(() => { saveMsg = ""; }, 2000);
    }

    function addDir() {
        const v = newDir.trim();
        if (!v || config.extraIgnoreDirs.includes(v)) return;
        config.extraIgnoreDirs = [...config.extraIgnoreDirs, v];
        newDir = "";
        save();
    }

    function removeDir(d: string) {
        config.extraIgnoreDirs = config.extraIgnoreDirs.filter(x => x !== d);
        save();
    }

    function addKeyword() {
        const v = newKeyword.trim().toLowerCase();
        if (!v || config.commentOnlyKeywords.includes(v)) return;
        config.commentOnlyKeywords = [...config.commentOnlyKeywords, v];
        newKeyword = "";
        save();
    }

    function removeKeyword(k: string) {
        config.commentOnlyKeywords = config.commentOnlyKeywords.filter(x => x !== k);
        save();
    }

    function onDirKey(e: KeyboardEvent) {
        if (e.key === "Enter") addDir();
    }
    function onKwKey(e: KeyboardEvent) {
        if (e.key === "Enter") addKeyword();
    }
</script>

<div class="settings-panel">
    {#if loading}
        <span class="hint">Chargement…</span>
    {:else}
        <!-- Dossiers globaux ignorés (lecture seule) -->
        <div class="section">
            <div class="section-title">Dossiers ignorés (global)</div>
            <div class="tag-row readonly">
                {#each globalDirs as d}
                    <span class="tag dim">{d}</span>
                {/each}
            </div>
        </div>

        <!-- Dossiers ignorés supplémentaires pour ce projet -->
        <div class="section">
            <div class="section-title">Dossiers ignorés (ce projet)</div>
            <div class="tag-row">
                {#each config.extraIgnoreDirs as d}
                    <span class="tag">
                        {d}
                        <button class="tag-rm" on:click={() => removeDir(d)}>×</button>
                    </span>
                {/each}
                {#if config.extraIgnoreDirs.length === 0}
                    <span class="empty-hint">aucun</span>
                {/if}
            </div>
            <div class="add-row">
                <input
                    class="mini-input"
                    placeholder="ex: .svelte-kit"
                    bind:value={newDir}
                    on:keydown={onDirKey}
                />
                <button class="mini-btn" on:click={addDir} disabled={!newDir.trim()}>+</button>
            </div>
        </div>

        <!-- Mots-clés filtre commentaires -->
        <div class="section">
            <div class="section-title">
                Filtre commentaires
                <span class="section-hint">— seules les lignes en commentaire sont retournées</span>
            </div>
            <div class="tag-row">
                {#each config.commentOnlyKeywords as k}
                    <span class="tag kw">
                        {k}
                        <button class="tag-rm" on:click={() => removeKeyword(k)}>×</button>
                    </span>
                {/each}
            </div>
            <div class="add-row">
                <input
                    class="mini-input"
                    placeholder="ex: todo"
                    bind:value={newKeyword}
                    on:keydown={onKwKey}
                />
                <button class="mini-btn" on:click={addKeyword} disabled={!newKeyword.trim()}>+</button>
            </div>
        </div>

        <!-- .claudignore info -->
        <div class="section claudignore-info">
            <div class="section-title">.claudignore</div>
            <p class="hint">
                Créez un fichier <code>.claudignore</code> à la racine du projet pour exclure
                des dossiers ou fichiers supplémentaires. Format : un nom de dossier par ligne
                (les lignes <code>#</code> sont des commentaires).
            </p>
        </div>

        {#if saveMsg}
            <div class="save-msg" class:ok={saveMsg.startsWith("✓")}>{saveMsg}</div>
        {/if}
    {/if}
</div>

<style>
.settings-panel {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0.5rem 0;
    min-width: 320px;
    max-width: 400px;
}
.section {
    padding: 0.45rem 0.8rem;
    border-bottom: 1px solid var(--border);
}
.section:last-child { border-bottom: none; }
.section-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.35rem;
}
.section-hint {
    font-size: 0.6rem;
    color: #3a3a4a;
    text-transform: none;
    letter-spacing: 0;
}
.tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-bottom: 0.35rem;
}
.tag-row.readonly { margin-bottom: 0; }
.tag {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    background: var(--bg-subtle);
    border: 1px solid var(--border-strong);
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.62rem;
    color: #8888aa;
    padding: 0.1rem 0.35rem;
}
.tag.dim { background: var(--bg-panel); border-color: var(--border); color: #3a3a5a; }
.tag.kw { color: #f7c948; border-color: #3a3520; background: #1a1a0e; }
.tag-rm {
    background: none;
    border: none;
    color: #444;
    cursor: pointer;
    font-size: 0.7rem;
    padding: 0;
    line-height: 1;
    margin-left: 0.1rem;
}
.tag-rm:hover { color: #f44336; }
.empty-hint {
    font-size: 0.6rem;
    color: #333;
    font-style: italic;
    font-family: 'JetBrains Mono', monospace;
}
.add-row {
    display: flex;
    gap: 0.3rem;
    align-items: center;
}
.mini-input {
    flex: 1;
    min-width: 0;
    background: var(--bg-deep);
    border: 1px solid var(--border-strong);
    border-radius: 3px;
    color: #aaa;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    padding: 0.18rem 0.4rem;
    outline: none;
}
.mini-input:focus { border-color: var(--accent); }
.mini-input::placeholder { color: var(--border-strong); }
.mini-btn {
    background: none;
    border: 1px solid var(--border-strong);
    color: #555;
    font-size: 0.8rem;
    width: 20px;
    height: 20px;
    border-radius: 3px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    flex-shrink: 0;
}
.mini-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-hover); }
.mini-btn:disabled { opacity: 0.25; cursor: default; }
.claudignore-info p { margin: 0; }
.hint {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.62rem;
    color: #3a3a5a;
    line-height: 1.5;
}
.hint code { color: #6a6a8a; }
.save-msg {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.62rem;
    color: #f44336;
    padding: 0 0.8rem 0.3rem;
}
.save-msg.ok { color: #4caf50; }
</style>
