<script lang="ts">
    import { agentState } from "$lib/stores/agent";

    export let number: number;
    export let strikethrough = false;
    export let variant: "default" | "hist" = "default";

    async function select() {
        agentState.update(s => ({ ...s, status: "loading", plan: null }));
        const res = await fetch(`/api/issue?number=${number}`);
        const full = await res.json();
        agentState.update(s => ({
            ...s, issue: full, status: "idle", navigationStack: [],
            knownSubIssueNumbers: [
                ...new Set([...s.knownSubIssueNumbers, ...(full.subIssues?.map((si: any) => si.number) ?? [])])
            ]
        }));
    }
</script>

<button class="chip" class:chip--struck={strikethrough} class:chip--hist={variant === "hist"} onclick={select}>
    {#if strikethrough}<s>#{number}</s>{:else}#{number}{/if}
</button>

<style>
.chip {
    display: inline-block;
    font-size: 0.6rem;
    font-family: 'JetBrains Mono', monospace;
    color: #5a7a9a;
    background: #0d1e2e;
    border: 1px solid #1a3a5a;
    border-radius: 3px;
    padding: 0.1rem 0.4rem;
    cursor: pointer;
    transition: color 0.1s;
    line-height: 1.4;
}
.chip:hover {
    color: cornsilk;
}
.chip--struck {
    opacity: 0.55;
    color: #7a5a9a;
    border-color: #3a2a5a;
}
.chip--struck s {
    text-decoration-color: #5a3a7a;
}
.chip--hist {
    color: #b070b0;
    background: #160a1a;
    border-color: #4a2a5a;
}
.chip--hist:hover {
    color: #e0b0e0;
}
</style>
