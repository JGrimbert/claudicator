export type Group = { name: string; issues: number[]; dependsOn: string[]; summary: string };

/** Parse les groupes depuis le texte Markdown de l'analyse */
export function parseGroups(text: string): Group[] {
    const groups: Group[] = [];
    const blocks = text.split(/(?=### Groupe \d)/);
    for (const block of blocks) {
        const nameMatch = block.match(/### Groupe \d+ — (.+)/);
        if (!nameMatch) continue;
        const name = nameMatch[1].trim();
        const issueMatch = block.match(/Issues\s*:\s*((?:#\d+(?:,\s*)?)+)/);
        const issues = issueMatch
            ? [...issueMatch[1].matchAll(/#(\d+)/g)].map(m => parseInt(m[1]))
            : [];
        const depMatch = block.match(/Dépend de\s*:\s*(.+)/);
        const dependsOn = depMatch
            ? depMatch[1].split(/[,;]/).map(s => s.trim()).filter(Boolean)
            : [];
        const summaryMatch = block.match(/Résumé\s*:\s*(.+)/);
        const summary = summaryMatch ? summaryMatch[1].trim() : "";
        if (name && issues.length > 0) groups.push({ name, issues, dependsOn, summary });
    }
    return groups;
}

/** Extrait le bloc mermaid du résultat Markdown */
export function extractMermaid(text: string): string | null {
    const match = text.match(/```mermaid\s*([\s\S]*?)```/);
    return match ? match[1].trim() : null;
}

/** Retourne le texte sans le bloc mermaid ni les sections Groupe (pour affichage dans <pre>) */
export function textWithoutMermaid(text: string): string {
    const clean = text
        .replace(/```mermaid[\s\S]*?```/g, "")
        .replace(/###\s+Groupe\s+\d+[\s\S]*/g, "")
        .trim();
    return clean || "Aucun contenu textuel. Relancez l'analyse pour générer un diagramme.";
}
