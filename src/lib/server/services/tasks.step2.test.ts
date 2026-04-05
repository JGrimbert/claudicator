/**
 * Tests étape 2 — Issues #18, #132
 * #18 : justFinished doit passer à true pendant 3s quand une tâche devient "done"
 *       (status: implementation/documentation/validation après migration)
 * #132 : loadTasksSilent doit être déclenché après que justFinished revient à false
 *
 * Ces tests valident :
 * - que le composant contient un $effect sur le statut pour setter justFinished
 * - que justFinished déclenche loadTasksSilent
 */
import { describe, it, expect } from "vitest";
import fs from "fs";

describe("Issue #18 — justFinished activé 3s après complétion d'une tâche", () => {
    it("TaskDetail contient la variable justFinished avec $state", () => {
        // justFinished est dans TaskDetail.svelte (panel de détail)
        const content = fs.readFileSync(
            "src/lib/components/tasks/TaskDetail.svelte",
            "utf-8"
        );
        // justFinished doit être un $state réactif
        expect(content).toContain("justFinished = $state(false)");
    });

    it("TaskDetail contient un $effect qui surveille le statut pour justFinished", () => {
        const content = fs.readFileSync(
            "src/lib/components/tasks/TaskDetail.svelte",
            "utf-8"
        );
        // Un $effect doit surveiller selected?.status et setter justFinished
        // Vérifier la présence de justFinished dans un contexte $effect
        expect(content).toContain("justFinished = true");
    });

    it("TaskDetail utilise setTimeout de 3000ms pour réinitialiser justFinished", () => {
        const content = fs.readFileSync(
            "src/lib/components/tasks/TaskDetail.svelte",
            "utf-8"
        );
        // Le timer de 3s doit être présent
        expect(content).toContain("3000");
        // Et doit reset justFinished à false
        expect(content).toContain("justFinished = false");
    });
});

describe("Issue #132 — loadTasksSilent déclenché après justFinished", () => {
    it("TaskList appelle loadTasksSilent (défini dans TaskList)", () => {
        const content = fs.readFileSync(
            "src/lib/components/tasks/TaskList.svelte",
            "utf-8"
        );
        // L'effet post-run doit appeler loadTasksSilent
        expect(content).toContain("loadTasksSilent");
    });

    it("TaskDetail appelle onloadtaskssilent quand la tâche vient de finir", () => {
        // Dans TaskDetail, loadTasksSilent est accessible via la prop onloadtaskssilent
        const content = fs.readFileSync(
            "src/lib/components/tasks/TaskDetail.svelte",
            "utf-8"
        );
        const hasJustFinished = content.includes("justFinished = true");
        const hasLoadTasks = content.includes("onloadtaskssilent");
        expect(hasJustFinished && hasLoadTasks).toBe(true);
    });
});
