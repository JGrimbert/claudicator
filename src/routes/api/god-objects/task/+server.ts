import { json } from "@sveltejs/kit";
import path from "path";
import fs from "fs";
import { createTask, getTasksDir } from "$lib/server/services/tasks";

function generateRefactorPlan(file: string, lines: number): string {
    const basename = path.basename(file);
    return `# Refactoring architectural : ${basename}

## Fichier cible
\`${file}\` — **${lines} lignes**

---

## Mission

Ce fichier est un **god object** : il cumule trop de responsabilités, ce qui nuit à sa lisibilité, sa testabilité et sa maintenabilité. L'objectif est de le **décomposer en modules cohérents** en appliquant les principes d'architecture logicielle.

---

## Phase 1 — Audit

Lis attentivement le fichier et réponds à ces questions :

### Responsabilités (SRP — Single Responsibility Principle)
- Quelles sont les **responsabilités distinctes** du fichier ? (ex : gestion d'état, rendu UI, logique métier, appels API, utilitaires…)
- Y a-t-il des blocs qui pourraient "vivre seuls" sans dépendre du reste ?

### Couplage
- Quels sont les couplages **afférents** (qui dépendent de ce fichier) et **efférents** (dont ce fichier dépend) ?
- Y a-t-il des dépendances directes à des détails d'implémentation qui devraient passer par une abstraction ?
- Applique le **DIP** (Dependency Inversion Principle) : les modules de haut niveau ne doivent pas dépendre des modules de bas niveau.

### Cohésion
- Les méthodes/fonctions d'un même bloc travaillent-elles sur les **mêmes données** ?
- Y a-t-il des groupes de fonctions qui s'ignorent mutuellement → signe de **faible cohésion** → à extraire.
- Viser une **cohésion fonctionnelle** (chaque module fait une seule chose bien définie).

---

## Phase 2 — Conception du découpage

Propose une architecture modulaire en t'appuyant sur les patterns GoF et SOLID pertinents :

### Patterns GoF à considérer
- **Strategy** : si plusieurs comportements interchangeables coexistent dans le fichier
- **Observer / Event Emitter** : si le fichier réagit à de nombreux événements distincts → extraire les handlers
- **Command** : si des actions utilisateur sont nombreuses et complexes → encapsuler chaque action
- **Facade** : si le fichier expose une interface complexe à ses consommateurs → créer une façade légère
- **State** : si la logique varie fortement selon un état interne (machine d'état implicite)
- **Composite** : si la structure UI est hiérarchique et répétitive

### Règles de découpage
- **Un fichier = une responsabilité** (SRP strict)
- **OCP** (Open/Closed) : les nouveaux comportements s'ajoutent sans modifier l'existant
- Interfaces explicites entre modules (pas de state partagé implicitement)
- Nommage expressif : le nom du fichier doit décrire exactement ce qu'il fait

---

## Phase 3 — Implémentation

1. Crée les nouveaux fichiers selon l'architecture proposée
2. Déplace le code concerné **sans le réécrire** — préserver le comportement exact
3. Remplace les usages dans \`${file}\` par des imports vers les nouveaux modules
4. Vérifie que tous les appels existants continuent de fonctionner
5. Le fichier original doit être réduit à **moins de 400 lignes** après refactoring

---

## Contraintes absolues
- **Zéro régression** : comportement externe identique avant/après
- Pas de réécriture de logique métier — uniquement du déplacement
- Pas d'abstraction prématurée : n'extrais que ce qui est clairement distinct
- Chaque nouveau fichier doit être **testable indépendamment**
`;
}

/** Crée une tâche de refactoring avec plan d'architecture pré-rempli */
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

    // Utilise getTasksDir() pour gérer correctement les projets nommés
    const dir = getTasksDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
        path.join(dir, `${task.id}.plan.md`),
        generateRefactorPlan(file as string, lines as number),
        "utf-8"
    );

    return json(task, { status: 201 });
}
