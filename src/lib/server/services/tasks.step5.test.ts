/**
 * Tests étape 5 — Issues #72, #246
 * #72 : la tâche en cours d'exécution doit être surlignée visuellement
 * #246 : le DAG des issues doit être visible dans TaskList
 */
import { describe, it, expect } from "vitest";
import fs from "fs";

describe("Issue #72 — surbrillance de la tâche en cours d'exécution", () => {
    it("le composant TaskList applique une classe CSS sur la task en cours d'exécution", () => {
        const content = fs.readFileSync(
            "src/lib/components/TaskList.svelte",
            "utf-8"
        );
        // Une classe running ou task-running doit être conditionnellement appliquée
        // quand agentRunState.running && agentRunState.taskId === task.id
        expect(content).toMatch(/class:task-running|class:running/);
    });

    it("le CSS définit le style de la classe running/task-running", () => {
        const content = fs.readFileSync(
            "src/lib/components/TaskList.svelte",
            "utf-8"
        );
        // Le CSS doit définir .task-running ou .task-row-wrap.running
        expect(content).toMatch(/\.task-running|task-row-wrap\.running/);
    });
});

describe("Issue #246 — DAG des issues visible dans TaskList", () => {
    it("le composant TaskList contient taskDag comme état réactif", () => {
        const content = fs.readFileSync(
            "src/lib/components/TaskList.svelte",
            "utf-8"
        );
        // taskDag doit être un $state
        expect(content).toContain("taskDag");
        expect(content).toContain("$state");
    });

    it("le composant affiche les nœuds du DAG quand taskDag est défini", () => {
        const content = fs.readFileSync(
            "src/lib/components/TaskList.svelte",
            "utf-8"
        );
        // Le DAG doit s'afficher conditionnellement
        expect(content).toContain("taskDag");
        // La section d'affichage doit exister
        expect(content).toContain("task-dag");
    });

    it("le composant charge le DAG via l'endpoint eval-dag", () => {
        const content = fs.readFileSync(
            "src/lib/components/TaskList.svelte",
            "utf-8"
        );
        // L'endpoint eval-dag doit être appelé pour charger le DAG
        expect(content).toContain("eval-dag");
    });
});
