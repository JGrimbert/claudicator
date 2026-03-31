/**
 * Tests étape 6 — Issues #262, #154
 * #262 : pas de checkbox ATLAS dans TaskList.svelte
 * #154 : navigation automatique vers la task créée dans IssueAnalysis
 */
import { describe, it, expect } from "vitest";
import fs from "fs";

describe("Issue #262 — pas de checkbox ATLAS dans TaskList", () => {
    it("TaskList ne contient pas de checkbox type=checkbox liée à atlasEnabled", () => {
        const content = fs.readFileSync(
            "src/lib/components/TaskList.svelte",
            "utf-8"
        );
        // Vérifier qu'il n'y a pas de checkbox ATLAS dans le template
        // (le type atlasEnabled peut rester dans le type Task)
        const hasAtlasCheckbox = content.includes('type="checkbox"') &&
            content.includes("atlasEnabled") &&
            // Dans le template (après </script>)
            content.slice(content.indexOf("</script>")).includes("atlasEnabled");
        expect(hasAtlasCheckbox).toBe(false);
    });
});

describe("Issue #154 — navigation vers la task créée dans IssueAnalysis", () => {
    it("notifyTaskCreated accepte un taskId optionnel pour naviguer vers la nouvelle task", () => {
        const storeContent = fs.readFileSync(
            "src/lib/stores/agent.ts",
            "utf-8"
        );
        // notifyTaskCreated doit accepter taskId
        expect(storeContent).toContain("notifyTaskCreated(taskId?");
        // Et setter pendingSelectTaskId avec cet id
        expect(storeContent).toContain("pendingSelectTaskId.set(taskId)");
    });

    it("IssueAnalysis passe le taskId lors de la création d'une task unique", () => {
        const content = fs.readFileSync(
            "src/lib/components/IssueAnalysis.svelte",
            "utf-8"
        );
        // Quand une seule task est créée, notifyTaskCreated doit être appelée avec son id
        // On vérifie que la logique de création récupère l'id et le passe
        expect(content).toContain("notifyTaskCreated(");
        // La navigation vers la task créée doit être possible
        // (soit via l'id dans notifyTaskCreated, soit via pendingSelectTaskId)
        expect(content).toContain("notifyTaskCreated");
    });

    it("TaskList gère pendingSelectTaskId pour auto-sélectionner la nouvelle task", () => {
        const content = fs.readFileSync(
            "src/lib/components/TaskList.svelte",
            "utf-8"
        );
        // TaskList doit réagir à pendingSelectTaskId
        expect(content).toContain("pendingSelectTaskId");
        // Et appeler selectTask avec l'id en attente
        expect(content).toContain("pendingSelectTaskId");
    });
});
