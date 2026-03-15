<script lang="ts">
    import { onMount } from "svelte";
    import FileTree from './FileTree.svelte';

    type SemanticRegion = 'ui' | 'domain' | 'api' | 'infra' | 'store' | 'tests' | 'config';

    type RegionData = { files: string[] };
    type SkillData  = { id: string; label: string; regions: string[]; focus: string; constraints: string[] };

    let regions: Partial<Record<SemanticRegion, RegionData>> = {};
    let skills: Record<string, SkillData> = {};
    let loading = true;
    let error: string | null = null;
    let expandedRegion: SemanticRegion | null = null;

    const REGION_LABELS: Record<SemanticRegion, string> = {
        ui:     'UI / Composants',
        domain: 'Logique Métier',
        api:    'API / Routes',
        infra:  'Infrastructure',
        store:  'Stores',
        tests:  'Tests',
        config: 'Config',
    };

    const REGION_ICONS: Record<SemanticRegion, string> = {
        ui:     '◈',
        domain: '◆',
        api:    '◇',
        infra:  '▣',
        store:  '▤',
        tests:  '▦',
        config: '▧',
    };

    const REGION_ORDER: SemanticRegion[] = ['domain', 'infra', 'api', 'ui', 'store', 'tests', 'config'];

    function skillForRegion(region: SemanticRegion): SkillData | undefined {
        return Object.values(skills).find(s => s.regions.includes(region));
    }

    onMount(async () => {
        try {
            const res = await fetch('/api/atlas');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            regions = data.regions ?? {};
            skills  = data.skills  ?? {};
        } catch (e: any) {
            error = e.message;
        } finally {
            loading = false;
        }
    });

    function toggle(region: SemanticRegion) {
        expandedRegion = expandedRegion === region ? null : region;
    }
</script>

<div class="atlas">
    {#if loading}
        <div class="atlas-loading">chargement…</div>
    {:else if error}
        <div class="atlas-error">{error}</div>
    {:else}
        <div class="regions-grid">
            {#each REGION_ORDER as region}
                {@const data   = regions[region]}
                {@const skill  = skillForRegion(region)}
                {@const count  = data?.files.length ?? 0}
                {@const active = expandedRegion === region}
                <div class="region-card" class:active class:empty={count === 0}>
                    <button class="region-header" onclick={() => toggle(region)} disabled={count === 0}>
                        <span class="region-icon">{REGION_ICONS[region]}</span>
                        <span class="region-name">{REGION_LABELS[region]}</span>
                        <span class="region-count">{count}</span>
                        {#if count > 0}
                            <span class="region-chevron">{active ? '▴' : '▾'}</span>
                        {/if}
                    </button>

                    {#if skill}
                        <div class="region-skill">
                            <span class="skill-label">{skill.label}</span>
                            <span class="skill-focus">{skill.focus}</span>
                        </div>
                    {/if}

                    {#if active && data}
                        <div class="file-tree-wrap">
                            <FileTree paths={data.files.map(f => f.replace(/^src\//, ''))} />
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
.atlas {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    background: var(--bg-panel, #0e0e0e);
    color: #888;
}
.atlas-header {
    padding: 0.5rem 0.8rem;
    border-bottom: 1px solid #1a1a1a;
    flex-shrink: 0;
    display: flex;
    align-items: baseline;
    gap: 0.8rem;
}
.atlas-title {
    color: #555;
    letter-spacing: 0.08em;
    font-size: 0.6rem;
}
.atlas-subtitle {
    color: #2a2a2a;
    font-size: 0.58rem;
    font-style: italic;
}
.atlas-loading, .atlas-error {
    padding: 1rem;
    color: #333;
    font-style: italic;
}
.atlas-error { color: #7a3a3a; }
.regions-grid {
    flex: 1;
    overflow-y: auto;
    padding: 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}
.region-card {
    border: 1px solid #1a1a1a;
    border-radius: 3px;
    background: #0a0a0a;
    transition: border-color 0.15s;
}
.region-card.active { border-color: #2a2a3a; }
.region-card.empty  { opacity: 0.35; }
.region-header {
    all: unset;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    width: 100%;
    padding: 0.3rem 0.5rem;
    cursor: pointer;
    box-sizing: border-box;
}
.region-header:disabled { cursor: default; }
.region-header:not(:disabled):hover .region-name { color: #aaa; }
.region-icon {
    font-size: 0.55rem;
    color: #333;
    flex-shrink: 0;
}
.region-name {
    flex: 1;
    color: #666;
    transition: color 0.1s;
}
.region-card.active .region-name { color: #999; }
.region-count {
    color: #2a2a4a;
    font-size: 0.6rem;
    min-width: 1.5em;
    text-align: right;
}
.region-card.active .region-count { color: #4a4a7a; }
.region-chevron {
    color: #333;
    font-size: 0.55rem;
    flex-shrink: 0;
}
.region-skill {
    padding: 0 0.5rem 0.3rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    border-top: 1px solid #111;
}
.skill-label {
    color: #3a3a5a;
    font-size: 0.58rem;
    margin-top: 0.2rem;
}
.skill-focus {
    color: #252535;
    font-size: 0.56rem;
    font-style: italic;
}
.file-tree-wrap {
    padding: 0.2rem 0.4rem 0.3rem 0.5rem;
    border-top: 1px solid #111;
    max-height: 220px;
    overflow-y: auto;
    font-size: 0.56rem;
}
</style>
