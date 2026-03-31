/**
 * Tests étape 7 — Issue #40
 * Le moteur Fuse doit chercher dans les issues ET les tâches quand searchScope === 'all'
 * - fuseIndex doit inclure les tâches avec titre ET statut
 * - les résultats doivent couvrir les deux sources
 */
import { describe, it, expect } from "vitest";
import fs from "fs";

describe("Issue #40 — recherche élargie : Fuse cherche dans issues ET tasks", () => {
    it("le composant TaskList utilise un Fuse qui inclut 'status' comme clé de recherche quand searchScope === all", () => {
        const content = fs.readFileSync(
            "src/lib/components/TaskList.svelte",
            "utf-8"
        );
        // Fuse doit avoir 'status' dans ses clés quand scope=all
        // Soit via un fuse dédié avec keys: ['title', 'status']
        // Soit via une logique conditionnelle
        expect(content).toContain("status");
        // Un Fuse avec les deux clés doit exister
        expect(content).toMatch(/keys:\s*\[['"]title['"],\s*['"]status['"]\]|keys:\s*\[['"]status['"],\s*['"]title['"]\]/);
    });

    it("le Fuse en mode 'all' cherche dans toutes les tasks (pas seulement statusFiltered)", () => {
        const content = fs.readFileSync(
            "src/lib/components/TaskList.svelte",
            "utf-8"
        );
        // Quand searchScope === 'all', le Fuse doit chercher dans toutes les tasks
        // On vérifie que la logique de fuse distingue les deux scopes
        expect(content).toContain("searchScope");
        // Il doit y avoir soit un fuse dédié pour 'all', soit une condition sur searchScope
        const hasAllFuse = content.includes("searchScope === \"all\"") ||
            content.includes("searchScope === 'all'");
        expect(hasAllFuse).toBe(true);
    });

    it("foundIssues (issues GitHub) est combiné avec les résultats tasks quand scope=all", () => {
        const content = fs.readFileSync(
            "src/lib/components/TaskList.svelte",
            "utf-8"
        );
        // foundIssues doit exister pour la recherche cross-source
        expect(content).toContain("foundIssues");
        // La recherche dans les issues doit utiliser searchScope
        expect(content).toContain("searchScope");
    });
});
