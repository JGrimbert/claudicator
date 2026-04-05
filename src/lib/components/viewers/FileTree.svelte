<script lang="ts">
    type TreeNode = { children: Record<string, TreeNode> };

    let { paths }: { paths: string[] } = $props();

    function buildTree(paths: string[]): TreeNode {
        const root: TreeNode = { children: {} };
        for (const path of paths) {
            const parts = path.split('/').filter(Boolean);
            let node = root;
            for (const part of parts) {
                node.children[part] ??= { children: {} };
                node = node.children[part];
            }
        }
        return root;
    }

    const tree = $derived(buildTree(paths));
    let collapsed = $state(new Set<string>());

    function toggle(path: string) {
        const next = new Set(collapsed);
        next.has(path) ? next.delete(path) : next.add(path);
        collapsed = next;
    }

    function sortEntries(entries: [string, TreeNode][]): [string, TreeNode][] {
        return entries.sort(([aName, aNode], [bName, bNode]) => {
            const aIsDir = Object.keys(aNode.children).length > 0;
            const bIsDir = Object.keys(bNode.children).length > 0;
            if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
            return aName.localeCompare(bName);
        });
    }
</script>

{#snippet renderNode(n: TreeNode, depth: number, prefix: string)}
    {#each sortEntries(Object.entries(n.children)) as [name, child]}
        {@const fullPath = prefix ? `${prefix}/${name}` : name}
        {@const isDir = Object.keys(child.children).length > 0}
        {#if isDir}
            {@const open = !collapsed.has(fullPath)}
            <button
                class="tree-dir"
                style:padding-left="{depth * 10 + 4}px"
                onclick={() => toggle(fullPath)}
            >
                <span class="arrow">{open ? '▾' : '▶'}</span>
                <span class="dname">{name}</span>
            </button>
            {#if open}
                {@render renderNode(child, depth + 1, fullPath)}
            {/if}
        {:else}
            <div class="tree-file" style:padding-left="{depth * 10 + 16}px">{name}</div>
        {/if}
    {/each}
{/snippet}

{@render renderNode(tree, 0, '')}

<style>
.tree-dir {
    all: unset;
    display: flex;
    align-items: center;
    gap: 3px;
    width: 100%;
    box-sizing: border-box;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    line-height: 1.7;
}
.tree-dir:hover .dname { color: #888; }
.arrow {
    color: #333;
    width: 10px;
    flex-shrink: 0;
    font-size: 0.5rem;
}
.dname { color: #4a4a6a; }
.tree-file {
    color: #2a2a3a;
    line-height: 1.7;
    font-size: 0.56rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.tree-file:hover { color: #555; }
</style>
