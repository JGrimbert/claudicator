<script lang="ts">
    import { clusterFocusedSymbol } from "$lib/stores/agent";
    import type { SkillCandidate, ClusterSkill, SkillProposal } from "./PlanPanel.helpers";

    let {
        skillCandidates,
        clustersLoaded,
        historyLoaded,
        clusterSkillsList,
        skillProposals,
        skillsGenerating,
        skillsError,
        ongenerateSkills,
    }: {
        skillCandidates:   SkillCandidate[];
        clustersLoaded:    boolean;
        historyLoaded:     boolean;
        clusterSkillsList: ClusterSkill[];
        skillProposals:    SkillProposal[];
        skillsGenerating:  boolean;
        skillsError:       string;
        ongenerateSkills:  () => void;
    } = $props();

    let skillCandExpanded = $state(new Set<number>());

    function toggleSkillCand(i: number) {
        const next = new Set(skillCandExpanded);
        if (next.has(i)) next.delete(i); else next.add(i);
        skillCandExpanded = next;
    }
</script>

<!-- ── Candidats ── -->
{#if !clustersLoaded && !historyLoaded}
    <p class="hint">Chargement…</p>
{:else if skillCandidates.length === 0}
    <p class="hint">Aucun candidat détecté</p>
{:else}
    <div class="section-label section-label--coal">TOP {skillCandidates.length} CANDIDATS</div>
    {#each skillCandidates as cand, i}
        {@const open = skillCandExpanded.has(i)}
        <div class="dir-row" class:coal-row={cand.source === "coal"} class:hist-row={cand.source !== "coal"}>
            <button class="dir-head" onclick={() => toggleSkillCand(i)}>
                <span class="cand-rank">#{i + 1}</span>
                <span class="dir-toggle">{open ? "▾" : "▸"}</span>
                <span class="coal-preview">
                    {#each cand.symbols.slice(0, 4) as s, si}
                        <span class:coal-sym-tag={cand.source === "coal"} class:hist-sym-tag={cand.source !== "coal"}>{s.split(".").at(-1)}</span>{#if si < Math.min(cand.symbols.length, 4) - 1}<span class="coal-dot"> · </span>{/if}
                    {/each}
                    {#if cand.symbols.length > 4}<span class="coal-more">+{cand.symbols.length - 4}</span>{/if}
                </span>
                <span class="skill-badge skill-badge--{cand.source === 'coal' ? 'coal' : cand.source === 'hist' ? 'historical' : 'commit'}">{cand.source === "coal" ? "sém" : cand.source === "hist" ? "hist" : "commit"}</span>
                <span class:coal-score={cand.source === "coal"} class:hist-score={cand.source !== "coal"}>{cand.count}× <span class="cand-score">s{cand.score}</span></span>
            </button>
            {#if open}
                <div class="dir-symbols">
                    {#each cand.symbols as sym}
                        <div class="sym-line">
                            <button
                                class="sym-name"
                                class:sym-active={$clusterFocusedSymbol?.name === sym}
                                onclick={() => clusterFocusedSymbol.set({ name: sym, dir: "" })}
                            >{sym.split(".").at(-1)}</button>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/each}
{/if}

<!-- ── Clusters actifs ── -->
{#if clusterSkillsList.length > 0}
    <div class="section-label section-label--cluster">CLUSTERS ACTIFS ({clusterSkillsList.length})</div>
    <div class="skills-list">
        {#each clusterSkillsList as c}
            <div class="skill-row">
                <span class="skill-title">{c.id}</span>
                <span class="skill-badge skill-badge--cluster">cluster</span>
            </div>
        {/each}
    </div>
{/if}

<!-- ── Générer ── -->
<div class="skills-bar">
    <button class="skills-gen-btn" onclick={ongenerateSkills} disabled={skillsGenerating || skillCandidates.length === 0}>
        {skillsGenerating ? "Génération…" : "Générer les skills"}
    </button>
    {#if skillsError}<span class="skills-error">{skillsError}</span>{/if}
</div>

<!-- ── Skills générés ── -->
{#if skillProposals.length > 0}
    <div class="section-label">SKILLS GÉNÉRÉS ({skillProposals.length})</div>
    <div class="skills-list">
        {#each skillProposals as p}
            <div class="skill-row">
                <span class="skill-title">{p.skill}</span>
                <span class="skill-badge skill-badge--{p.source}">{p.source === "coal" ? "sém" : "git"}</span>
                {#if p.description}<span class="skill-desc">{p.description}</span>{/if}
            </div>
        {/each}
    </div>
{/if}

<style>
.section-label {
    padding: 0.5rem 0.6rem 0.2rem;
    font-size: 0.5rem;
    letter-spacing: 0.12em;
    color: #3a7a48;
    font-family: 'JetBrains Mono', monospace;
    text-transform: uppercase;
    border-top: 1px solid #111;
    margin-top: 0.25rem;
}
.section-label:first-child { border-top: none; margin-top: 0; }
.section-label--coal    { color: #3a7f8f; }
.section-label--cluster { color: #6a8f3a; }
.dir-row { border-bottom: 1px solid #111; padding: 0.1rem 0; }
.dir-head {
    all: unset;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.6rem;
    cursor: pointer;
    width: 100%;
    box-sizing: border-box;
    transition: background 0.1s;
}
.dir-head:hover { background: #0d1118; }
.dir-toggle { font-size: 0.55rem; color: #3a7a48; opacity: 0.5; flex-shrink: 0; width: 10px; }
.coal-row .dir-head { background: transparent; }
.coal-row .dir-head:hover { background: #06141a; }
.coal-row .dir-toggle { color: #3a7f8f; }
.hist-row .dir-head:hover { background: #100a14; }
.hist-row .dir-toggle { color: #7a4a7a; opacity: 0.5; }
.coal-preview {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0;
    overflow: hidden;
}
.coal-sym-tag { font-size: 0.58rem; font-family: 'JetBrains Mono', monospace; color: #68c0cc; }
.hist-sym-tag { font-size: 0.58rem; font-family: 'JetBrains Mono', monospace; color: #c090c0; }
.coal-dot    { font-size: 0.5rem; color: #3a7f8f; opacity: 0.5; }
.coal-more   { font-size: 0.5rem; font-family: 'JetBrains Mono', monospace; color: #3a7f8f; margin-left: 0.2rem; }
.coal-score  { font-size: 0.52rem; font-family: 'JetBrains Mono', monospace; color: #3a7f8f; flex-shrink: 0; margin-right: 0.3rem; }
.hist-score  { font-size: 0.52rem; font-family: 'JetBrains Mono', monospace; color: #7a4a7a; flex-shrink: 0; margin-right: 0.3rem; }
.dir-symbols { padding: 0.15rem 0.6rem 0.4rem 1.5rem; border-top: 1px solid #0d0d0d; }
.sym-line { display: flex; align-items: baseline; gap: 0.4rem; padding: 0.12rem 0; }
.sym-name {
    all: unset;
    font-size: 0.58rem;
    font-family: 'JetBrains Mono', monospace;
    color: #5a9a68;
    flex-shrink: 0;
    min-width: 7rem;
    cursor: pointer;
    transition: color 0.1s;
}
.sym-name:hover, .sym-name.sym-active { color: cornsilk; }
.coal-row .sym-name { color: #50a0b0; }
.hist-row .sym-name { color: #b070b0; }
.coal-row .sym-name:hover, .coal-row .sym-name.sym-active { color: cornsilk; }
.hist-row .sym-name:hover, .hist-row .sym-name.sym-active { color: cornsilk; }
/* ── Skills ── */
.skills-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.6rem 0.3rem;
    border-top: 1px solid #111;
}
.skills-gen-btn {
    background: none;
    border: 1px solid #3a7f8f;
    border-radius: 3px;
    color: #5ab0c0;
    font-size: 0.55rem;
    font-family: 'JetBrains Mono', monospace;
    padding: 0.2rem 0.55rem;
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
}
.skills-gen-btn:hover:not(:disabled) { color: cornsilk; border-color: cornsilk; }
.skills-gen-btn:disabled { opacity: 0.5; cursor: default; }
.skills-error { font-size: 0.55rem; font-family: 'JetBrains Mono', monospace; color: #c05050; }
.skills-list { padding: 0.15rem 0; }
.skill-row {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    padding: 0.22rem 0.6rem;
    border-bottom: 1px solid #0a1418;
}
.skill-title { font-size: 0.62rem; font-family: 'JetBrains Mono', monospace; color: #7abf9f; flex-shrink: 0; }
.skill-desc {
    font-size: 0.52rem;
    font-family: 'JetBrains Mono', monospace;
    color: #555;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.skill-badge {
    font-size: 0.45rem;
    font-family: 'JetBrains Mono', monospace;
    border-radius: 2px;
    padding: 0.05rem 0.28rem;
    flex-shrink: 0;
}
.skill-badge--coal       { color: #3a7f8f; background: #040e10; }
.skill-badge--historical { color: #7a4a7a; background: #100a14; }
.skill-badge--commit     { color: #8f7a3a; background: #14100a; }
.skill-badge--cluster    { color: #6a8f3a; background: #0c1404; }
.cand-rank {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.52rem;
    color: #3a3a3a;
    flex-shrink: 0;
    min-width: 1.6rem;
    text-align: right;
}
.cand-score { font-size: 0.48rem; opacity: 0.5; font-family: 'JetBrains Mono', monospace; }
.hint {
    padding: 1rem 0.75rem;
    color: #333;
    font-size: 0.65rem;
    font-style: italic;
    font-family: 'JetBrains Mono', monospace;
}
</style>
