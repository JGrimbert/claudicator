import { json } from "@sveltejs/kit";
import path from "path";
import fs from "fs";
import { createTask } from "$lib/server/services/tasks";

function taskPlanPath(taskId: string) {
    return `.agent/tasks/${taskId}.plan.md`;
}

function generateRefactorPlan(file: string, lines: number): string {
    const basename = path.basename(file);
    return `# Refactoring architectural : ${basename}

## Contexte
Le fichier \`${file}\` fait **${lines} lignes** — il dépasse le seuil acceptable et doit être modularisé.

## Objectif
Analyser les responsabilités de ce fichier et le découper en modules cohérents et réutilisables, sans modifier le comportement externe.

## Travail attendu

### 1. Audit des responsabilités
- Identifier les blocs logiques distincts (state, UI, event handlers, utilities…)
- Lister les dépendances internes et externes

### 2. Proposition d'architecture
- Proposer les sous-composants/modules avec leurs interfaces
- Justifier chaque découpage

### 3. Implémentation
- Créer les nouveaux fichiers
- Déplacer le code concerné
- Mettre à jour les imports dans les fichiers existants
- Vérifier que le comportement reste identique

## Contraintes
- Préserver 100% du comportement existant
- Un seul composant par responsabilité
- Interfaces propres entre modules (pas d'export de state interne)

## Fichier cible
\`${file}\` (${lines} lignes)
`;
}

/** Crée une tâche de refactoring avec plan pré-rempli pour un fichier donné */
export async function POST({ request }) {
    const body = await request.json().catch(() => ({}));
    const { file, lines } = body;

    if (!file || typeof lines !== "number") {
        return json({ error: "file et lines requis" }, { status: 400 });
    }

    const basename = path.basename(file as string);
    const task = createTask({
        title: `Refactoring: ${basename} (${lines} lignes)`,
        status: "implementation",
    });

    const planPath = taskPlanPath(task.id);
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, generateRefactorPlan(file as string, lines as number), "utf-8");

    return json(task, { status: 201 });
}
