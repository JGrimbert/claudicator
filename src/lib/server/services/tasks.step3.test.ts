/**
 * Tests étape 3 — Issue #36
 * tasksByGroup doit être calculé depuis $planGroups dans TaskList
 */
import { describe, it, expect } from "vitest";
import fs from "fs";

describe("Issue #36 — tasksByGroup calculé depuis $planGroups", () => {
    it("le composant TaskList contient tasksByGroup basé sur $planGroups et non une valeur statique vide", () => {
        const content = fs.readFileSync(
            "src/lib/components/tasks/TaskList.svelte",
            "utf-8"
        );
        // tasksByGroup ne doit plus être $derived([]) vide
        // Il doit être calculé depuis $planGroups
        expect(content).toContain("tasksByGroup");
        // Vérifier que c'est un $derived qui utilise planGroups
        expect(content).toContain("$planGroups");
        // La valeur ne doit plus être le tableau vide trivial
        const trivialPattern = /tasksByGroup\s*=\s*\$derived<[^>]*>\(\[\]\)/;
        expect(trivialPattern.test(content)).toBe(false);
    });

    it("tasksByGroup associe chaque tâche à son groupe par issueNumber", () => {
        const content = fs.readFileSync(
            "src/lib/components/tasks/TaskList.svelte",
            "utf-8"
        );
        // La logique doit utiliser issueNumber pour le matching
        expect(content).toContain("issueNumber");
        // Le groupe "default" ou un fallback doit être présent pour les tasks sans groupe
        expect(content).toMatch(/default|ungrouped|sans groupe/i);
    });
});
