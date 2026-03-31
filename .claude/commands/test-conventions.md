# Skill : Conventions de test — Claudicator

Référence statique à charger avant d'écrire tout test dans ce projet.

## Stack de test

| Outil | Rôle |
|-------|------|
| **Vitest** | Runner de tests (natif Vite, compatible SvelteKit) |
| **@testing-library/svelte** | Tests de composants Svelte |
| **jsdom** | Environnement DOM simulé |
| **vi** | Mocks, spies, fakes (API intégrée Vitest) |

## Structure des fichiers

```
src/
  lib/
    components/
      MonComposant.svelte
      MonComposant.test.ts       ← test composant, colocalisé
    server/
      services/
        monService.ts
        monService.test.ts       ← test unitaire, colocalisé
  routes/
    api/
      mon-endpoint/
        +server.ts
        server.test.ts           ← test d'endpoint, colocalisé
```

- Nommage : `*.test.ts` (pas `*.spec.ts`)

> **Contrainte SvelteKit** : dans `src/routes/`, le préfixe `+` est **réservé** par le framework
> (`+page.svelte`, `+server.ts`, `+layout.ts`…). Un fichier nommé `+server.test.ts` déclenche
> l'erreur _"Files prefixed with + are reserved"_ au démarrage de Vite.
> → Les tests de routes sont nommés **`server.test.ts`** (sans `+`), pas `+server.test.ts`.
- Colocalisé avec le fichier source (pas de dossier `__tests__/` séparé)

## Lancer les tests

```bash
# Suite complète
npm test

# Fichier ciblé
npm test -- src/lib/server/services/monService.test.ts

# Watch mode
npm run test:watch
```

## Anatomie d'un test unitaire (service)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { maFonction } from './monService'

describe('maFonction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retourne X quand Y', () => {
    const result = maFonction(input)
    expect(result).toEqual(expected)
  })
})
```

## Anatomie d'un test de composant Svelte

```ts
import { render, screen } from '@testing-library/svelte'
import { describe, it, expect } from 'vitest'
import MonComposant from './MonComposant.svelte'

describe('MonComposant', () => {
  it('affiche le titre', () => {
    render(MonComposant, { props: { titre: 'Hello' } })
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
```

## Mocking

```ts
// Mock d'un module entier
vi.mock('$lib/server/services/github', () => ({
  getIssue: vi.fn().mockResolvedValue({ number: 1, title: 'Test' })
}))

// Spy sur une fonction
const spy = vi.spyOn(monModule, 'maFonction')
```

## Règles TDD dans ce projet

- Le test doit échouer avant l'implémentation (RED confirmé)
- Ne tester que le contrat public — pas les détails d'implémentation
- Un `describe` par fonction/composant, un `it` par comportement observable
- Les mocks de modules serveur (`$lib/server/`) sont systématiques dans les tests de routes
- Ne pas tester `+page.svelte` directement — tester les services qu'ils consomment
