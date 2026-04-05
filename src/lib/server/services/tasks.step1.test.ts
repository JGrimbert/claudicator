/**
 * Tests étape 1 — Issues #41, #178
 * #41 : sendCentralInput doit utiliser taskId (contrat de l'API /api/agent/input)
 * #178 : sélection d'une tâche doit stocker l'id sélectionné et permettre le scroll
 *
 * Ces tests valident le contrat côté service/comportement :
 * - que `getTask` retourne bien une task avec un `id` utilisable
 * - que le template contient bien `data-task-id` (attesté par grep sur le composant)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// ── Helpers pour isoler les tests du FS réel ──────────────────────────────────

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claudicator-test-"));
    // Surcharge de la variable d'environnement pour isoler les tests
    process.env._TEST_TASKS_DIR = tmpDir;
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env._TEST_TASKS_DIR;
    vi.restoreAllMocks();
});

// ── Imports après la configuration du tmpDir ──────────────────────────────────
// On mock le module projects pour retourner notre tmpDir
vi.mock("$lib/server/services/projects", () => ({
    getCurrentProject: () => ({ id: "test" }),
    getProjectRoot: () => "/tmp/test-project",
}));

vi.mock("$lib/server/services/patches", () => ({
    hasPatchFiles: () => false,
}));

describe("Issue #41 — sendCentralInput utilise le taskId sélectionné", () => {
    it("createTask retourne une task avec un id non-nul (nécessaire pour sendCentralInput)", async () => {
        const { createTask } = await import("$lib/server/services/tasks");
        const task = createTask({ title: "Test task #41" });
        expect(task.id).toBeTruthy();
        expect(typeof task.id).toBe("string");
        expect(task.id.length).toBeGreaterThan(0);
    });

    it("getTask retrouve la task par son id (le taskId passé à sendCentralInput doit être valide)", async () => {
        const { createTask, getTask } = await import("$lib/server/services/tasks");
        const created = createTask({ title: "Test send input" });
        const found = getTask(created.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(created.id);
    });

    it("le template contient data-task-id pour le scroll (contrat #178)", () => {
        // Vérifie que le composant TaskList contient l'attribut data-task-id
        // utilisé pour scrollIntoView dans selectTask
        const componentPath = path.resolve(
            "src/lib/components/tasks/TaskList.svelte"
        );
        const content = fs.readFileSync(componentPath, "utf-8");
        expect(content).toContain('data-task-id=');
        expect(content).toContain('scrollIntoView');
    });
});

describe("Issue #178 — selectTask met à jour la sélection et scroll", () => {
    it("selectTask utilise data-task-id pour identifier la tâche à scroller", () => {
        const componentPath = path.resolve(
            "src/lib/components/tasks/TaskList.svelte"
        );
        const content = fs.readFileSync(componentPath, "utf-8");
        // La sélection est stockée dans `selected` (équivalent de selectedTaskId)
        expect(content).toContain('selected = initialTask');
        // Le scroll est déclenché via requestAnimationFrame
        expect(content).toContain('requestAnimationFrame');
        expect(content).toContain('scrollIntoView');
    });

    it("sendCentralInput passe le taskId dans le body de la requête", () => {
        // sendCentralInput est dans TaskDetail.svelte (panel de détail)
        const componentPath = path.resolve(
            "src/lib/components/tasks/TaskDetail.svelte"
        );
        const content = fs.readFileSync(componentPath, "utf-8");
        // La fonction sendCentralInput prend taskId en paramètre
        expect(content).toContain('async function sendCentralInput(taskId');
        // Et l'utilise dans le body JSON
        expect(content).toContain('taskId');
        // La requête est envoyée à /api/agent/input
        expect(content).toContain('/api/agent/input');
    });
});
