<script lang="ts">
    import { issueAnalysis } from "$lib/stores/agent";

    let { frame, roadmapId }: {
        frame: number;
        roadmapId: string | null;
    } = $props();

    const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

    let chatMessage = $state("");

    async function sendChat() {
        if (!chatMessage.trim() || $issueAnalysis.chatRunning) return;
        const msg = chatMessage.trim();
        chatMessage = "";
        issueAnalysis.update(s => ({ ...s, chatRunning: true, logs: [] }));
        try {
            const res = await fetch("/api/issues/roadmap/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: msg, roadmapId: roadmapId ?? undefined })
            });
            if (!res.ok || !res.body) { issueAnalysis.update(s => ({ ...s, chatRunning: false })); return; }
            const reader = res.body.getReader();
            const dec = new TextDecoder();
            const newAgentLines: string[] = [];
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
                        const entry = JSON.parse(part.slice(5).trim());
                        issueAnalysis.update(s => ({ ...s, logs: [...s.logs, entry] }));
                        if (entry.type === "agent") newAgentLines.push(entry.line);
                    } catch { /* ignore */ }
                }
            }
            if (newAgentLines.length > 0) {
                issueAnalysis.update(s => ({ ...s, result: newAgentLines.join("\n"), chatRunning: false }));
            } else {
                issueAnalysis.update(s => ({ ...s, chatRunning: false }));
            }
        } catch {
            issueAnalysis.update(s => ({ ...s, chatRunning: false }));
        }
    }

    function onChatKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
    }
</script>

<div class="chat-console" class:chat-running={$issueAnalysis.chatRunning}>
    <textarea
        bind:value={chatMessage}
        placeholder="Instruction pour l'agent roadmap…"
        disabled={$issueAnalysis.chatRunning}
        onkeydown={onChatKeydown}
        rows="2"
    ></textarea>
    <button
        class="chat-send"
        onclick={sendChat}
        disabled={$issueAnalysis.chatRunning || !chatMessage.trim()}
    >{$issueAnalysis.chatRunning ? FRAMES[frame] : "→"}</button>
</div>

<style>
.chat-console {
    display: flex;
    align-items: flex-end;
    gap: 0.4rem;
    padding: 0.4rem 0.8rem;
    border-top: 1px solid var(--border);
    background: var(--bg-panel);
    flex-shrink: 0;
}
.chat-console.chat-running { opacity: 0.6; }
.chat-console textarea {
    flex: 1;
    background: var(--bg-deep);
    border: 1px solid var(--border-strong);
    border-radius: 3px;
    color: var(--text-primary);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    padding: 0.3rem 0.5rem;
    resize: none;
    outline: none;
    line-height: 1.5;
    transition: border-color 0.15s;
}
.chat-console textarea:focus { border-color: var(--accent); }
.chat-console textarea::placeholder { color: var(--border-strong); }
.chat-send {
    background: #1a1040;
    border: 1px solid #4a3a8a;
    color: #9181f9;
    font-size: 0.75rem;
    padding: 0.3rem 0.65rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    flex-shrink: 0;
    align-self: flex-end;
    transition: background 0.15s;
    min-width: 2.2rem;
    text-align: center;
}
.chat-send:hover:not(:disabled) { background: #251850; }
.chat-send:disabled { opacity: 0.4; cursor: default; }
</style>
