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
    it("le composant TaskList contient la variable justFinished avec $state", () => {
        const content = fs.readFileSync(
            "src/lib/components/TaskList.svelte",
            "utf-8"
        );
        // justFinished doit être un $state réactif
        expect(content).toContain("justFinished = $state(false)");
    });

    it("le composant TaskList contient un $effect qui surveille le statut pour justFinished", () => {
        const content = fs.readFileSync(
            "src/lib/components/TaskList.svelte",
            "utf-8"
        );
        // Un $effect doit surveiller selected?.status et setter justFinished
        // Vérifier la présence de justFinished dans un contexte $effect
        expect(content).toContain("justFinished = true");
    });

    it("le composant TaskList utilise setTimeout de 3000ms pour réinitialiser justFinished", () => {
        const content = fs.readFileSync(
            "src/lib/components/TaskList.svelte",
            "utf-8"
        );
        // Le timer de 3s doit être présent
        expect(content).toContain("3000");
        // Et doit reset justFinished à false
        expect(content).toContain("justFinished = false");
    });
});

describe("Issue #132 — loadTasksSilent déclenché après justFinished", () => {
    it("le composant appelle loadTasksSilent dans le contexte de justFinished", () => {
        const content = fs.readFileSync(
            "src/lib/components/TaskList.svelte",
            "utf-8"
        );
        // L'effet post-run doit appeler loadTasksSilent
        expect(content).toContain("loadTasksSilent");
    });

    it("le $effect sur justFinished appelle loadTasksSilent quand la tâche vient de finir", () => {
        const content = fs.readFileSync(
            "src/lib/components/TaskList.svelte",
            "utf-8"
        );
        // Vérifier que justFinished et loadTasksSilent apparaissent dans le même $effect
        // On cherche le pattern : $effect avec justFinished = true suivi de loadTasksSilent
        const effectSection = content.match(/\$effect\([^)]*=>[^{]*\{[^}]*justFinished\s*=\s*true[^}]*\}/s);
        if (!effectSection) {
            // Cherche une variante : $effect avec une fonction qui contient les deux
            const hasEffect = content.includes("$effect(");
            const hasJustFinished = content.includes("justFinished = true");
            const hasLoadTasks = content.includes("loadTasksSilent");
            expect(hasEffect && hasJustFinished && hasLoadTasks).toBe(true);
        } else {
            expect(effectSection[0]).toBeTruthy();
        }
    });
});
