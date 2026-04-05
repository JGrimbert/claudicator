<script lang="ts">
    import { afterUpdate } from "svelte";
    import { extractMermaid, textWithoutMermaid } from "../issues/IssueAnalysis.helpers";
    import type { Group } from "../issues/IssueAnalysis.helpers";

    let { result, groups, hoveredIssueNumber, hasInvalidated, onRegenerate, openIssue }: {
        result: string;
        groups: Group[];
        hoveredIssueNumber: number | null;
        hasInvalidated: boolean;
        onRegenerate: () => void;
        openIssue: (n: number) => void;
    } = $props();

    let mermaidDiv: HTMLDivElement | null = null;
    let mermaidRendered = false;
    let highlightedGroup: string | null = null;

    afterUpdate(() => {
        if (result && mermaidDiv && !mermaidRendered) {
            renderMermaid();
        }
        highlightHoveredChips(hoveredIssueNumber);
    });

    function highlightHoveredChips(n: number | null) {
        if (!mermaidDiv) return;
        for (const chip of Array.from(mermaidDiv.querySelectorAll(".mermaid-issue-chip"))) {
            const el = chip as HTMLElement;
            if (n !== null && el.dataset.issue === String(n)) {
                el.style.background = "#162030";
                el.style.borderColor = "#3a6a9a";
                el.style.color = "#7cb8ff";
            } else {
                el.style.background = "";
                el.style.borderColor = "";
                el.style.color = "";
            }
        }
    }

    function scrollToGroup(name: string) {
        highlightedGroup = name;
        const idx = groups.findIndex(g => g.name === name);
        if (idx >= 0) {
            document.getElementById(`group-card-${idx}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        setTimeout(() => { if (highlightedGroup === name) highlightedGroup = null; }, 1800);
    }

    async function renderMermaid() {
        const mermaidCode = extractMermaid(result ?? "");
        if (!mermaidCode || !mermaidDiv) return;
        mermaidRendered = true;
        try {
            let mermaid: any = (window as any).mermaid;
            if (!mermaid) {
                await new Promise<void>((resolve, reject) => {
                    const s = document.createElement("script");
                    s.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
                    s.onload = () => resolve();
                    s.onerror = reject;
                    document.head.appendChild(s);
                });
                mermaid = (window as any).mermaid;
                mermaid.initialize({
                    startOnLoad: false,
                    theme: "base",
                    themeVariables: {
                        background:          "#0c0c16",
                        mainBkg:             "#12121a",
                        primaryColor:        "#12121a",
                        primaryTextColor:    "#888",
                        primaryBorderColor:  "#1e1e2e",
                        lineColor:           "#2a2a3a",
                        secondaryColor:      "#0c0c16",
                        tertiaryColor:       "#0c0c16",
                        edgeLabelBackground: "#0c0c16",
                        titleColor:          "#555",
                        fontFamily:          "'JetBrains Mono', monospace",
                        fontSize:            "11px",
                    }
                });
            }
            const { svg } = await mermaid.render("analysis-diagram", mermaidCode);
            if (mermaidDiv) {
                mermaidDiv.innerHTML = svg;
                const svgEl = mermaidDiv.querySelector("svg");
                if (svgEl) {
                    svgEl.removeAttribute("height");
                    svgEl.style.width = "100%";
                    svgEl.style.height = "auto";
                }
                attachMermaidClicks();
            }
        } catch {
            mermaidRendered = false;
            if (mermaidDiv) mermaidDiv.innerHTML = `<pre class="mermaid-fallback">${extractMermaid(result)}</pre>`;
        }
    }

    function attachMermaidClicks() {
        if (!mermaidDiv) return;

        for (const rect of Array.from(mermaidDiv.querySelectorAll(".node rect"))) {
            (rect as SVGRectElement).setAttribute("rx", "4");
            (rect as SVGRectElement).setAttribute("ry", "4");
        }

        const svgElem = mermaidDiv.querySelector("svg");
        if (svgElem) {
            const arrowColor = getComputedStyle(document.documentElement)
                .getPropertyValue("--border-strong").trim() || "#3a3a5a";
            for (const marker of Array.from(svgElem.querySelectorAll("marker"))) {
                const mw = parseFloat(marker.getAttribute("markerWidth") ?? "10");
                const mh = parseFloat(marker.getAttribute("markerHeight") ?? "10");
                marker.setAttribute("markerWidth",  String(Math.round(mw * 0.6)));
                marker.setAttribute("markerHeight", String(Math.round(mh * 0.6)));
                for (const shape of Array.from(marker.querySelectorAll("path, polygon")) as SVGElement[]) {
                    shape.setAttribute("fill",         arrowColor);
                    shape.setAttribute("stroke",       arrowColor);
                    shape.setAttribute("stroke-width", "1.5");
                }
            }
        }

        for (const nodeLabel of Array.from(mermaidDiv.querySelectorAll(".nodeLabel"))) {
            if (!/#\d+/.test(nodeLabel.innerHTML)) continue;
            nodeLabel.innerHTML = nodeLabel.innerHTML.replace(/#(\d+)/g, (_, n) =>
                `<span class="mermaid-issue-chip" data-issue="${n}">#${n}</span>`
            );
            for (const chip of Array.from(nodeLabel.querySelectorAll(".mermaid-issue-chip"))) {
                const n = Number((chip as HTMLElement).dataset.issue);
                chip.addEventListener("click", (e) => { e.stopPropagation(); openIssue(n); });
            }
            const wrapper = nodeLabel.closest("div") as HTMLElement | null;
            if (wrapper) {
                wrapper.style.display = "block";
                wrapper.style.width = "100%";
                wrapper.style.textAlign = "center";
            }
        }

        requestAnimationFrame(() => {
            if (!mermaidDiv) return;
            for (const fo of Array.from(mermaidDiv.querySelectorAll(".node foreignObject"))) {
                fo.setAttribute("height", "500");
                fo.setAttribute("width",  "500");
                fo.setAttribute("overflow", "visible");
            }
            requestAnimationFrame(() => {
                if (!mermaidDiv) return;
                const svgEl = mermaidDiv.querySelector("svg") as SVGSVGElement | null;
                const ctm   = svgEl?.getScreenCTM();
                const scaleX = ctm ? ctm.a : 1;
                const scaleY = ctm ? ctm.d : 1;
                for (const node of Array.from(mermaidDiv.querySelectorAll(".node"))) {
                    const fo    = node.querySelector("foreignObject");
                    const rect  = node.querySelector("rect");
                    const nodeLabel = node.querySelector(".nodeLabel") as HTMLElement | null;
                    if (!fo || !rect || !nodeLabel) continue;
                    const bb = nodeLabel.getBoundingClientRect();
                    if (!bb.height) continue;
                    const padH = 28, padW = 24;
                    const newH = bb.height / scaleY + padH;
                    const newW = bb.width  / scaleX + padW;
                    const oldH = parseFloat(rect.getAttribute("height") ?? "0");
                    const oldW = parseFloat(rect.getAttribute("width")  ?? "0");
                    const oldY = parseFloat(rect.getAttribute("y") ?? "0");
                    const oldX = parseFloat(rect.getAttribute("x") ?? "0");
                    rect.setAttribute("height", String(newH));
                    rect.setAttribute("y",      String(oldY - (newH - oldH) / 2));
                    if (newW > oldW) {
                        rect.setAttribute("width", String(newW));
                        rect.setAttribute("x",     String(oldX - (newW - oldW) / 2));
                    }
                    const finalW = Math.max(newW, oldW);
                    fo.setAttribute("height", String(newH));
                    fo.setAttribute("width",  String(finalW));
                    const labelG = fo.closest("g.label") as SVGGElement | null;
                    if (labelG) {
                        labelG.setAttribute("transform", `translate(${-finalW / 2}, ${-newH / 2})`);
                    }
                }

                requestAnimationFrame(() => {
                    if (!mermaidDiv) return;
                    const retract = 6;
                    for (const path of Array.from(
                        mermaidDiv.querySelectorAll(".flowchart-link, .edgePath path")
                    ) as SVGPathElement[]) {
                        if ((path as any)._retracted) continue;
                        (path as any)._retracted = true;
                        const totalLen = path.getTotalLength();
                        if (totalLen <= retract + 6) continue;
                        const newEnd = path.getPointAtLength(totalLen - retract);
                        const prev   = path.getPointAtLength(totalLen - retract - 4);
                        const d = path.getAttribute("d") ?? "";
                        path.setAttribute("d",
                            `${d} L${prev.x.toFixed(2)},${prev.y.toFixed(2)} L${newEnd.x.toFixed(2)},${newEnd.y.toFixed(2)}`
                        );
                    }
                });
            });
        });

        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const node of Array.from(mermaidDiv.querySelectorAll(".node"))) {
            const text = (node.textContent ?? "").trim();
            if (/#\d+/.test(text)) continue;
            const normText = norm(text);
            const matching = groups.find(g => {
                const n = norm(g.name);
                return normText.includes(n) || n.includes(normText);
            });
            if (matching) {
                (node as HTMLElement).style.cursor = "pointer";
                node.addEventListener("click", () => scrollToGroup(matching.name));
                addHover(node as HTMLElement);
            }
        }
    }

    function addHover(node: HTMLElement) {
        const shape = node.querySelector("rect, circle, polygon") as SVGElement | null;
        if (!shape) return;
        node.addEventListener("mouseenter", () => shape.setAttribute("stroke", "#2a4a6a"));
        node.addEventListener("mouseleave", () => shape.setAttribute("stroke", "#1a2a40"));
    }
</script>

{#if hasInvalidated}
    <div class="invalidation-banner">
        <span class="inv-icon">⚠</span>
        Cette roadmap contient des issues fermées.
        <button class="btn-regen" onclick={onRegenerate}>Régénérer la roadmap</button>
    </div>
{/if}

{#if extractMermaid(result)}
    <div class="mermaid-section">
        <div class="mermaid-container" bind:this={mermaidDiv}>
            <span class="hint">Rendu du diagramme…</span>
        </div>
    </div>
{:else}
    <pre class="result-text">{textWithoutMermaid(result)}</pre>
{/if}

<style>
.mermaid-section {
    width: 100%;
}
.mermaid-container {
    padding: 0.8rem;
    overflow-x: auto;
    min-height: 80px;
}
.mermaid-container :global(svg) {
    display: block;
    width: 100%;
    height: auto;
    margin: 3em auto;
}
.mermaid-container :global(.node rect) {
    fill: var(--bg-panel) !important;
    stroke: var(--border) !important;
    stroke-width: 1px !important;
}
.mermaid-container :global(.node foreignObject div) {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    height: 100% !important;
    text-align: center !important;
}
.mermaid-container :global(.nodeLabel) {
    color: var(--accent-hover) !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 0.65rem !important;
    line-height: 1.6 !important;
    text-align: center !important;
}
.mermaid-container :global(.node text) {
    fill: var(--accent-hover) !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 11px !important;
}
.mermaid-container :global(.mermaid-issue-chip) {
    color: #4a9eff !important;
    background: #0a1020 !important;
    border: 1px solid #1a2a40 !important;
    border-radius: 3px !important;
    padding: 0.05rem 0.3rem !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 0.6rem !important;
    cursor: pointer !important;
    display: inline-block !important;
    line-height: 1.4 !important;
    margin-top: 0.5rem !important;
    transition: color 0.12s, border-color 0.12s !important;
}
.mermaid-container :global(.mermaid-issue-chip:hover) {
    color: #7cb8ff !important;
    border-color: #2a4a6a !important;
}
.mermaid-container :global(.flowchart-link),
.mermaid-container :global(.edge-pattern-solid),
.mermaid-container :global(.edgePath path) {
    stroke-dasharray: 4 3 !important;
    stroke: var(--border-strong) !important;
    stroke-width: 1px !important;
}
.mermaid-container :global(.arrowheadPath),
.mermaid-container :global([id$="pointEnd"] path),
.mermaid-container :global([id$="pointStart"] path) {
    fill: var(--border-strong) !important;
    stroke: var(--border-strong) !important;
    stroke-width: 1.5px !important;
    opacity: 0.8 !important;
}
.mermaid-container :global(.node circle),
.mermaid-container :global(.node polygon) {
    fill: var(--bg-panel) !important;
    stroke: var(--border) !important;
    stroke-width: 1px !important;
}
.mermaid-fallback {
    font-size: 0.65rem;
    color: #555;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
}
.result-text {
    font-size: 0.7rem;
    color: #bbb;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
}
.invalidation-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.6rem;
    color: #c87a20;
    background: #120a00;
    border: 1px solid #3a1e00;
    border-radius: 3px;
    padding: 0.35rem 0.6rem;
    margin-bottom: 0.4rem;
    flex-shrink: 0;
}
.inv-icon { font-size: 0.75rem; }
.btn-regen {
    margin-left: auto;
    font-size: 0.58rem;
    color: #c87a20;
    background: none;
    border: 1px solid #4a2a00;
    border-radius: 3px;
    padding: 0.15rem 0.5rem;
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s;
}
.btn-regen:hover { color: cornsilk; border-color: #8a5a00; }
</style>
