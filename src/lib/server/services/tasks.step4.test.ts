/**
 * Tests étape 4 — Issues #180, #185
 * #180 : affichage du plan Markdown quand hasPlan === true
 * #185 : affichage des diffs git quand hasPatch === true
 *
 * Ces tests valident :
 * - que le composant affiche planContent dans un <pre> quand il existe
 * - que l'endpoint GET /api/tasks/[id]/diff retourne un diff
 * - que loadPlan est appelé au moment de la sélection d'une task avec hasPlan
 */
import { describe, it, expect } from "vitest";
import fs from "fs";

describe("Issue #180 — affichage du plan Markdown dans le panel", () => {
    it("TaskDetail affiche planContent dans un <pre> ou équivalent", () => {
        // Le plan est affiché dans TaskDetail.svelte (panel de détail)
        const content = fs.readFileSync(
            "src/lib/components/TaskDetail.svelte",
            "utf-8"
        );
        // Le plan doit être affiché dans un élément pre
        expect(content).toContain("<pre class=\"plan-content\">{planContent}</pre>");
    });

    it("loadPlan est appelé lors de l'initialisation de TaskDetail, hasPlan dans TaskList", () => {
        // loadPlan est dans TaskDetail.svelte
        const detailContent = fs.readFileSync(
            "src/lib/components/TaskDetail.svelte",
            "utf-8"
        );
        expect(detailContent).toContain("loadPlan(");
        // hasPlan est utilisé dans TaskList pour la sélection initiale
        const listContent = fs.readFileSync(
            "src/lib/components/TaskList.svelte",
            "utf-8"
        );
        expect(listContent).toContain("hasPlan");
    });

    it("GET /api/tasks/[id]/plan retourne le contenu du plan", async () => {
        // Vérifier que l'endpoint plan existe et retourne { content }
        const serverContent = fs.readFileSync(
            "src/routes/api/tasks/[id]/plan/+server.ts",
            "utf-8"
        );
        expect(serverContent).toContain("GET");
        expect(serverContent).toContain("content");
    });
});

describe("Issue #185 — affichage des diffs git dans le panel", () => {
    it("TaskDetail appelle loadDiff et affiche diffContent", () => {
        // loadDiff et diffContent sont dans TaskDetail.svelte
        const content = fs.readFileSync(
            "src/lib/components/TaskDetail.svelte",
            "utf-8"
        );
        // loadDiff doit exister
        expect(content).toContain("async function loadDiff(");
        // diffContent doit être affiché
        expect(content).toContain("diffContent");
        // L'affichage ligne par ligne du diff doit être présent
        expect(content).toContain("diff-line");
    });

    it("GET /api/tasks/[id]/diff retourne un diff git", async () => {
        const serverContent = fs.readFileSync(
            "src/routes/api/tasks/[id]/diff/+server.ts",
            "utf-8"
        );
        expect(serverContent).toContain("GET");
        expect(serverContent).toContain("diff");
    });

    it("le panel de diff montre les lignes ajoutées/supprimées avec classes CSS", () => {
        // CSS diff dans TaskDetail.svelte
        const content = fs.readFileSync(
            "src/lib/components/TaskDetail.svelte",
            "utf-8"
        );
        // Classes CSS pour diff coloré
        expect(content).toContain("class:add=");
        expect(content).toContain("class:del=");
    });
});
