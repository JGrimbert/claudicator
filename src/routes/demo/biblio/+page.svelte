<script lang="ts">
  type Pattern = {
    id: string;
    code: string;
    fr: string;
    en: string;
    family: 'creation' | 'structural' | 'behavioral';
    role: string;
    intent: string;
    participants: string[];
    whenToUse: string[];
    pros: string[];
    cons: string[];
    links: string[];
  };

  const PATTERNS: Pattern[] = [
    // ── Création ──────────────────────────────────────────────────────────
    {
      id: 'factory-method', code: 'C1', fr: 'Fabrique', en: 'Factory Method', family: 'creation',
      role: 'Déléguer la création d\'objets à des sous-classes',
      intent: 'Définit une interface pour créer un objet, mais laisse les sous-classes décider quelle classe instancier.',
      participants: ['Creator', 'ConcreteCreator', 'Product', 'ConcreteProduct'],
      whenToUse: ['Quand la classe ne connaît pas à l\'avance le type d\'objets à créer', 'Quand on veut que les sous-classes spécifient les objets créés'],
      pros: ['Évite le couplage fort entre créateur et produits concrets', 'Principe de responsabilité unique', 'Principe ouvert/fermé'],
      cons: ['Multiplication des sous-classes'],
      links: ['abstract-factory', 'builder', 'prototype', 'template-method'],
    },
    {
      id: 'abstract-factory', code: 'C2', fr: 'Fabrique abstraite', en: 'Abstract Factory', family: 'creation',
      role: 'Créer des familles d\'objets liés sans spécifier leurs classes',
      intent: 'Fournit une interface pour créer des familles d\'objets liés ou dépendants sans spécifier leurs classes concrètes.',
      participants: ['AbstractFactory', 'ConcreteFactory', 'AbstractProduct', 'ConcreteProduct', 'Client'],
      whenToUse: ['Quand le code doit fonctionner avec plusieurs familles de produits', 'Quand les produits d\'une même famille doivent être compatibles'],
      pros: ['Compatibilité garantie entre produits d\'une même famille', 'Principe ouvert/fermé', 'Principe de responsabilité unique'],
      cons: ['Complexité accrue à l\'ajout de nouveaux produits'],
      links: ['factory-method', 'prototype', 'singleton'],
    },
    {
      id: 'builder', code: 'C3', fr: 'Monteur', en: 'Builder', family: 'creation',
      role: 'Construire des objets complexes étape par étape',
      intent: 'Permet de construire des objets complexes étape par étape, en séparant la construction de la représentation.',
      participants: ['Builder', 'ConcreteBuilder', 'Director', 'Product'],
      whenToUse: ['Pour créer différentes représentations d\'un même objet', 'Quand la construction nécessite de nombreuses étapes'],
      pros: ['Construction étape par étape, réutilisation et différentes représentations', 'Principe de responsabilité unique'],
      cons: ['Complexité accrue car plusieurs nouvelles classes'],
      links: ['factory-method', 'composite', 'prototype'],
    },
    {
      id: 'prototype', code: 'C4', fr: 'Prototype', en: 'Prototype', family: 'creation',
      role: 'Cloner des objets existants',
      intent: 'Permet de copier des objets existants sans rendre le code dépendant de leurs classes.',
      participants: ['Prototype', 'ConcretePrototype', 'Client'],
      whenToUse: ['Quand le code ne doit pas dépendre des classes concrètes à copier', 'Quand les sous-classes ne diffèrent que par leur initialisation'],
      pros: ['Clonage sans couplage à la classe concrète', 'Élimination du code d\'initialisation répétitif'],
      cons: ['Clonage d\'objets avec références circulaires peut être difficile'],
      links: ['abstract-factory', 'command', 'composite', 'decorator'],
    },
    {
      id: 'singleton', code: 'C5', fr: 'Singleton', en: 'Singleton', family: 'creation',
      role: 'Garantir une instance unique',
      intent: 'Garantit qu\'une classe n\'a qu\'une seule instance et fournit un point d\'accès global à celle-ci.',
      participants: ['Singleton'],
      whenToUse: ['Quand exactement une instance d\'une classe est nécessaire', 'Pour un accès global strictement contrôlé'],
      pros: ['Instance unique garantie', 'Point d\'accès global'],
      cons: ['Viole le principe de responsabilité unique', 'Masque les mauvaises conceptions', 'Difficile à tester'],
      links: ['abstract-factory', 'facade', 'flyweight'],
    },

    // ── Structurel ────────────────────────────────────────────────────────
    {
      id: 'adapter', code: 'S1', fr: 'Adaptateur', en: 'Adapter', family: 'structural',
      role: 'Faire collaborer des interfaces incompatibles',
      intent: 'Permet à des objets avec des interfaces incompatibles de collaborer en convertissant l\'interface d\'un objet pour qu\'elle corresponde à celle attendue.',
      participants: ['Target', 'Adapter', 'Adaptee', 'Client'],
      whenToUse: ['Pour utiliser une classe existante dont l\'interface est incompatible', 'Pour créer une classe réutilisable avec des interfaces inconnues'],
      pros: ['Principe de responsabilité unique', 'Principe ouvert/fermé'],
      cons: ['Complexité accrue car doubles classes et interfaces'],
      links: ['bridge', 'decorator', 'proxy'],
    },
    {
      id: 'bridge', code: 'S2', fr: 'Pont', en: 'Bridge', family: 'structural',
      role: 'Séparer abstraction et implémentation',
      intent: 'Sépare une abstraction de son implémentation pour que les deux puissent varier indépendamment.',
      participants: ['Abstraction', 'RefinedAbstraction', 'Implementation', 'ConcreteImplementation'],
      whenToUse: ['Pour diviser une classe monolithique ayant plusieurs variantes', 'Pour changer l\'implémentation au moment de l\'exécution'],
      pros: ['Plateformes indépendantes', 'Principle ouvert/fermé', 'Principe de responsabilité unique'],
      cons: ['Complexité accrue sur des classes très cohésives'],
      links: ['abstract-factory', 'adapter', 'strategy'],
    },
    {
      id: 'composite', code: 'S3', fr: 'Composite', en: 'Composite', family: 'structural',
      role: 'Traiter objets simples et complexes uniformément (arbre)',
      intent: 'Compose des objets en structures arborescentes, puis travaille avec ces structures comme si ce sont des objets individuels.',
      participants: ['Component', 'Leaf', 'Composite', 'Client'],
      whenToUse: ['Pour implémenter une structure d\'objets arborescente', 'Quand le code client doit traiter uniformément feuilles et nœuds'],
      pros: ['Structures arborescentes complexes facilement manipulées', 'Principe ouvert/fermé'],
      cons: ['Difficile de fournir une interface commune quand les composants diffèrent trop'],
      links: ['builder', 'iterator', 'visitor', 'decorator', 'flyweight'],
    },
    {
      id: 'decorator', code: 'S4', fr: 'Décorateur', en: 'Decorator', family: 'structural',
      role: 'Ajouter des comportements dynamiquement',
      intent: 'Attache dynamiquement des comportements supplémentaires à un objet en les plaçant dans des objets enveloppants.',
      participants: ['Component', 'ConcreteComponent', 'BaseDecorator', 'ConcreteDecorator'],
      whenToUse: ['Pour ajouter des comportements sans casser le code existant', 'Quand l\'héritage est impossible (classe final) ou peu pratique'],
      pros: ['Extension sans sous-classe', 'Responsabilités ajoutées/retirées dynamiquement', 'Combinaison de comportements'],
      cons: ['Ordre des enveloppements important', 'Difficile à configurer initialement'],
      links: ['adapter', 'composite', 'prototype', 'chain-of-responsibility'],
    },
    {
      id: 'facade', code: 'S5', fr: 'Façade', en: 'Facade', family: 'structural',
      role: 'Interface simplifiée sur un sous-système complexe',
      intent: 'Fournit une interface simplifiée à une bibliothèque, un framework ou tout autre ensemble complexe de classes.',
      participants: ['Facade', 'Subsystem classes', 'Client'],
      whenToUse: ['Pour fournir une interface simple à un sous-système complexe', 'Pour décomposer un sous-système en couches'],
      pros: ['Isolation du code des sous-systèmes complexes'],
      cons: ['Peut devenir un objet divin couplé à toutes les classes'],
      links: ['abstract-factory', 'mediator', 'singleton'],
    },
    {
      id: 'flyweight', code: 'S6', fr: 'Poids mouche', en: 'Flyweight', family: 'structural',
      role: 'Partager les parties communes d\'état pour économiser la RAM',
      intent: 'Partage des parties communes d\'état entre de multiples objets au lieu de conserver toutes les données dans chaque objet.',
      participants: ['FlyweightFactory', 'Flyweight', 'ConcreteFlyweight', 'UnsharedConcreteFlyweight', 'Client'],
      whenToUse: ['Quand l\'application doit gérer un grand nombre d\'objets similaires', 'Quand les objets consomment trop de RAM'],
      pros: ['Économies importantes de RAM'],
      cons: ['CPU au lieu de RAM : recalcul du contexte', 'Code complexifié'],
      links: ['composite', 'singleton'],
    },
    {
      id: 'proxy', code: 'S7', fr: 'Procuration', en: 'Proxy', family: 'structural',
      role: 'Substitut/représentant d\'un autre objet',
      intent: 'Fournit un substitut ou un espace réservé pour un autre objet afin de contrôler l\'accès.',
      participants: ['ServiceInterface', 'Service', 'Proxy', 'Client'],
      whenToUse: ['Initialisation paresseuse (proxy virtuel)', 'Contrôle d\'accès (proxy de protection)', 'Cache des résultats', 'Journalisation'],
      pros: ['Contrôle de l\'objet service sans que les clients le sachent', 'Cycle de vie de l\'objet service géré', 'Principe ouvert/fermé'],
      cons: ['Réponse retardée', 'Code complexifié'],
      links: ['adapter', 'decorator'],
    },

    // ── Comportemental ────────────────────────────────────────────────────
    {
      id: 'chain-of-responsibility', code: 'B1', fr: 'Chaîne de responsabilité', en: 'Chain of Responsibility', family: 'behavioral',
      role: 'Passer une requête le long d\'une chaîne de handlers',
      intent: 'Permet de passer des requêtes le long d\'une chaîne de handlers, chacun décidant de traiter la requête ou de la passer.',
      participants: ['Handler', 'BaseHandler', 'ConcreteHandler', 'Client'],
      whenToUse: ['Quand le programme traite différents types de requêtes de manières différentes mais inconnues à l\'avance', 'Pour exécuter des handlers dans un ordre précis'],
      pros: ['Ordre de traitement contrôlé', 'Principe de responsabilité unique', 'Principe ouvert/fermé'],
      cons: ['Certaines requêtes peuvent ne pas être traitées'],
      links: ['command', 'decorator', 'composite', 'mediator'],
    },
    {
      id: 'command', code: 'B2', fr: 'Commande', en: 'Command', family: 'behavioral',
      role: 'Encapsuler une requête comme un objet',
      intent: 'Transforme une requête en objet autonome contenant toutes les informations sur la requête.',
      participants: ['Invoker', 'Command', 'ConcreteCommand', 'Receiver', 'Client'],
      whenToUse: ['Pour paramétrer des objets avec des opérations', 'Pour différer ou mettre en file une opération', 'Pour implémenter les opérations reversibles (undo/redo)'],
      pros: ['Principe de responsabilité unique', 'Principe ouvert/fermé', 'Undo/Redo', 'Opérations différées'],
      cons: ['Complexité accrue par une couche supplémentaire'],
      links: ['chain-of-responsibility', 'memento', 'strategy', 'prototype', 'observer'],
    },
    {
      id: 'iterator', code: 'B3', fr: 'Itérateur', en: 'Iterator', family: 'behavioral',
      role: 'Parcourir une collection sans exposer sa structure',
      intent: 'Permet de parcourir séquentiellement les éléments d\'une collection sans exposer sa représentation interne.',
      participants: ['Iterator', 'ConcreteIterator', 'IterableCollection', 'ConcreteCollection'],
      whenToUse: ['Quand la collection a une structure complexe à cacher au client', 'Pour réduire la duplication de code de parcours', 'Quand différents algorithmes de parcours sont nécessaires'],
      pros: ['Principe de responsabilité unique', 'Principe ouvert/fermé', 'Itération parallèle'],
      cons: ['Inutile si l\'application ne travaille qu\'avec des collections simples', 'Moins efficace que des parcours spécialisés'],
      links: ['composite', 'factory-method', 'memento', 'visitor'],
    },
    {
      id: 'mediator', code: 'B4', fr: 'Médiateur', en: 'Mediator', family: 'behavioral',
      role: 'Réduire les dépendances chaotiques entre objets',
      intent: 'Réduit les dépendances chaotiques entre objets en les forçant à collaborer uniquement via un objet médiateur.',
      participants: ['Mediator', 'ConcreteMediator', 'Component'],
      whenToUse: ['Quand des classes sont trop couplées et difficiles à modifier indépendamment', 'Quand l\'héritage est impossible pour la réutilisation dans d\'autres contextes'],
      pros: ['Principe de responsabilité unique', 'Principe ouvert/fermé', 'Réduction du couplage entre composants'],
      cons: ['Peut devenir un objet divin'],
      links: ['chain-of-responsibility', 'facade', 'observer', 'command'],
    },
    {
      id: 'memento', code: 'B5', fr: 'Mémento', en: 'Memento', family: 'behavioral',
      role: 'Sauvegarder et restaurer l\'état d\'un objet',
      intent: 'Permet de sauvegarder et de restaurer l\'état précédent d\'un objet sans révéler les détails de son implémentation.',
      participants: ['Originator', 'Memento', 'Caretaker'],
      whenToUse: ['Pour créer des instantanés de l\'état d\'un objet afin de le restaurer', 'Quand l\'accès direct aux attributs viole l\'encapsulation'],
      pros: ['Instantanés sans violation de l\'encapsulation', 'Simplification du code de l\'originator'],
      cons: ['Consommation importante de RAM si les mementos sont fréquents', 'Caretakers doivent connaître le cycle de vie'],
      links: ['command', 'iterator', 'prototype'],
    },
    {
      id: 'observer', code: 'B6', fr: 'Observateur', en: 'Observer', family: 'behavioral',
      role: 'Mécanisme de souscription/notification',
      intent: 'Définit un mécanisme d\'abonnement pour notifier plusieurs objets des événements survenant sur l\'objet qu\'ils observent.',
      participants: ['Publisher', 'Subscriber', 'ConcreteSubscriber'],
      whenToUse: ['Quand des changements sur un objet peuvent nécessiter des changements sur d\'autres objets', 'Quand certains objets doivent observer d\'autres temporairement'],
      pros: ['Principe ouvert/fermé', 'Relations entre objets établies à l\'exécution'],
      cons: ['Notification dans un ordre non déterminé'],
      links: ['chain-of-responsibility', 'mediator', 'command'],
    },
    {
      id: 'state', code: 'B7', fr: 'État', en: 'State', family: 'behavioral',
      role: 'Modifier le comportement selon l\'état interne',
      intent: 'Permet à un objet de modifier son comportement quand son état interne change — l\'objet semble changer de classe.',
      participants: ['Context', 'State', 'ConcreteState'],
      whenToUse: ['Quand un objet doit changer de comportement selon son état', 'Quand les transitions d\'état ont des règles complexes'],
      pros: ['Principe de responsabilité unique', 'Principe ouvert/fermé', 'Simplification du contexte'],
      cons: ['Peut être excessif si peu d\'états ou si les états changent rarement'],
      links: ['bridge', 'strategy', 'singleton'],
    },
    {
      id: 'strategy', code: 'B8', fr: 'Stratégie', en: 'Strategy', family: 'behavioral',
      role: 'Définir une famille d\'algorithmes interchangeables',
      intent: 'Définit une famille d\'algorithmes, les encapsule, et les rend interchangeables — l\'algorithme varie indépendamment des clients.',
      participants: ['Context', 'Strategy', 'ConcreteStrategy'],
      whenToUse: ['Pour utiliser différentes variantes d\'un algorithme dans un objet', 'Pour isoler la logique métier d\'une classe des implémentations algorithmiques'],
      pros: ['Algorithmes échangés à l\'exécution', 'Isolation des détails d\'implémentation', 'Principe ouvert/fermé'],
      cons: ['Inutile si peu d\'algorithmes qui changent rarement', 'Les clients doivent connaître les différences entre stratégies'],
      links: ['bridge', 'command', 'state', 'template-method', 'decorator'],
    },
    {
      id: 'template-method', code: 'B9', fr: 'Patron de méthode', en: 'Template Method', family: 'behavioral',
      role: 'Squelette d\'algorithme avec étapes redéfinissables',
      intent: 'Définit le squelette d\'un algorithme dans la superclasse mais laisse les sous-classes redéfinir certaines étapes sans changer sa structure.',
      participants: ['AbstractClass', 'ConcreteClass'],
      whenToUse: ['Pour permettre aux sous-classes d\'étendre seulement certaines étapes d\'un algorithme', 'Quand plusieurs classes ont des algorithmes presque identiques'],
      pros: ['Moins de duplication de code', 'Remplacement sécurisé'],
      cons: ['Limitation par le squelette fourni', 'Violation du principe de substitution de Liskov'],
      links: ['factory-method', 'strategy'],
    },
    {
      id: 'visitor', code: 'B10', fr: 'Visiteur', en: 'Visitor', family: 'behavioral',
      role: 'Opérations sur éléments d\'une structure sans les modifier',
      intent: 'Sépare les algorithmes des objets sur lesquels ils opèrent — permet d\'ajouter de nouveaux comportements sans modifier les classes.',
      participants: ['Visitor', 'ConcreteVisitor', 'Element', 'ConcreteElement', 'ObjectStructure'],
      whenToUse: ['Pour effectuer une opération sur tous les éléments d\'une structure d\'objets complexe', 'Pour nettoyer la logique métier d\'une classe de comportements auxiliaires'],
      pros: ['Principe ouvert/fermé', 'Principe de responsabilité unique', 'Accumulation d\'informations sur plusieurs objets'],
      cons: ['Mise à jour de tous les visiteurs à chaque ajout de classe', 'Manque d\'accès aux membres privés'],
      links: ['command', 'composite', 'iterator'],
    },
    {
      id: 'interpreter', code: 'B11', fr: 'Interpréteur', en: 'Interpreter', family: 'behavioral',
      role: 'Définir une grammaire et interpréteur pour un langage',
      intent: 'Définit une représentation de la grammaire d\'un langage simple, ainsi qu\'un interpréteur qui utilise cette représentation pour traiter les phrases.',
      participants: ['AbstractExpression', 'TerminalExpression', 'NonterminalExpression', 'Context', 'Client'],
      whenToUse: ['Pour des grammaires simples à interpréter', 'Quand l\'efficacité n\'est pas la préoccupation principale'],
      pros: ['Facilité de changer et d\'étendre la grammaire', 'Implémentation de la grammaire simple'],
      cons: ['Grammaires complexes difficiles à maintenir', 'Peut nécessiter beaucoup de classes'],
      links: ['composite', 'flyweight', 'iterator', 'visitor'],
    },
  ];

  const BY_FAMILY = {
    creation:    { label: 'Création',        patterns: PATTERNS.filter(p => p.family === 'creation') },
    structural:  { label: 'Structurel',      patterns: PATTERNS.filter(p => p.family === 'structural') },
    behavioral:  { label: 'Comportemental',  patterns: PATTERNS.filter(p => p.family === 'behavioral') },
  } as const;

  const BY_ID = Object.fromEntries(PATTERNS.map(p => [p.id, p]));

  let selected = $state<Pattern | null>(null);
  let filter = $state('');

  const filtered = $derived(
    !filter.trim()
      ? PATTERNS
      : PATTERNS.filter(p =>
          p.fr.toLowerCase().includes(filter.toLowerCase()) ||
          p.en.toLowerCase().includes(filter.toLowerCase()) ||
          p.role.toLowerCase().includes(filter.toLowerCase())
        )
  );

  function familyColor(family: Pattern['family']) {
    if (family === 'creation') return '#7c6af7';
    if (family === 'structural') return '#4a9eff';
    return '#4adfaa';
  }
</script>

<div class="page">
  <header class="hd">
    <div class="hd-title">
      <span class="hd-badge">jgr-biblio</span>
      <h1>Design Patterns GoF</h1>
      <span class="hd-sub">23 patrons · refactoring.guru</span>
    </div>
    <div class="hd-stats">
      {#each Object.values(BY_FAMILY) as fam}
        <div class="hd-stat">
          <span class="hd-stat-n">{fam.patterns.length}</span>
          <span class="hd-stat-l">{fam.label}</span>
        </div>
      {/each}
    </div>
  </header>

  <div class="layout">
    <!-- Liste ─────────────────────────────────────────────────────── -->
    <div class="panel panel-list">
      <div class="search-wrap">
        <input class="search" placeholder="Filtrer…" bind:value={filter} />
        {#if filter}<button class="search-clear" onclick={() => filter = ''}>✕</button>{/if}
      </div>
      <div class="list">
        {#each Object.values(BY_FAMILY) as fam}
          {#if fam.patterns.some(p => filtered.includes(p))}
            <div class="family-label" style="color:{familyColor(fam.patterns[0].family)}">{fam.label}</div>
            {#each fam.patterns.filter(p => filtered.includes(p)) as p}
              <button
                class="pat-row"
                class:active={selected?.id === p.id}
                onclick={() => selected = selected?.id === p.id ? null : p}
              >
                <span class="pat-code">{p.code}</span>
                <div class="pat-names">
                  <span class="pat-fr">{p.fr}</span>
                  <span class="pat-en">{p.en}</span>
                </div>
              </button>
            {/each}
          {/if}
        {/each}
      </div>
    </div>

    <!-- Détail ──────────────────────────────────────────────────────── -->
    <div class="panel panel-detail">
      {#if selected}
        <div class="detail">
          <div class="det-header">
            <span class="det-code" style="color:{familyColor(selected.family)}">{selected.code}</span>
            <div>
              <h2 class="det-fr">{selected.fr}</h2>
              <span class="det-en">{selected.en}</span>
            </div>
            <span class="det-family" style="border-color:{familyColor(selected.family)};color:{familyColor(selected.family)}">{selected.family}</span>
          </div>

          <p class="det-intent">{selected.intent}</p>

          <div class="det-sections">
            <section>
              <h3>Participants</h3>
              <div class="chips">
                {#each selected.participants as p}
                  <span class="chip chip-part">{p}</span>
                {/each}
              </div>
            </section>

            <section>
              <h3>Quand l'utiliser</h3>
              <ul>
                {#each selected.whenToUse as w}<li>{w}</li>{/each}
              </ul>
            </section>

            <div class="pro-con">
              <section>
                <h3>Pour</h3>
                <ul class="pro">
                  {#each selected.pros as p}<li>{p}</li>{/each}
                </ul>
              </section>
              <section>
                <h3>Contre</h3>
                <ul class="con">
                  {#each selected.cons as c}<li>{c}</li>{/each}
                </ul>
              </section>
            </div>

            <section>
              <h3>Relations</h3>
              <div class="chips">
                {#each selected.links as l}
                  {#if BY_ID[l]}
                    <button class="chip chip-link" onclick={() => selected = BY_ID[l]}>
                      <span class="chip-code">{BY_ID[l].code}</span> {BY_ID[l].fr}
                    </button>
                  {/if}
                {/each}
              </div>
            </section>
          </div>
        </div>
      {:else}
        <div class="placeholder">
          <div class="placeholder-grid">
            {#each PATTERNS as p}
              <button
                class="pg-node"
                style="border-color:{familyColor(p.family)}"
                onclick={() => selected = p}
                title="{p.fr} — {p.role}"
              >
                <span class="pg-code" style="color:{familyColor(p.family)}">{p.code}</span>
                <span class="pg-fr">{p.fr}</span>
              </button>
            {/each}
          </div>
          <p class="placeholder-hint">Sélectionner un patron pour voir sa fiche</p>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-deep, #0c0c16);
  color: var(--text-primary, #ccc);
  font-family: 'Inter', sans-serif;
  overflow: hidden;
}
.hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.65rem 1.2rem;
  border-bottom: 1px solid var(--border, #1e1e2e);
  flex-shrink: 0;
  background: var(--bg-panel, #12121a);
}
.hd-title { display: flex; align-items: baseline; gap: 0.8rem; }
.hd-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.55rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #7c6af7;
  border: 1px solid #7c6af7;
  padding: 0.1rem 0.4rem;
  border-radius: 2px;
}
h1 { font-size: 0.9rem; font-weight: 600; color: #ddd; }
.hd-sub { font-size: 0.65rem; color: var(--text-muted, #555); }
.hd-stats { display: flex; gap: 1.5rem; }
.hd-stat { display: flex; flex-direction: column; align-items: center; }
.hd-stat-n { font-family: 'JetBrains Mono', monospace; font-size: 1rem; color: #aaa; }
.hd-stat-l { font-size: 0.55rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted, #555); }

.layout { display: flex; flex: 1; min-height: 0; }

.panel { display: flex; flex-direction: column; min-height: 0; }
.panel-list { width: 240px; flex-shrink: 0; border-right: 1px solid var(--border, #1e1e2e); background: var(--bg-panel, #12121a); }
.panel-detail { flex: 1; overflow-y: auto; }

.search-wrap { display: flex; align-items: center; border-bottom: 1px solid var(--border, #1e1e2e); flex-shrink: 0; }
.search {
  flex: 1; background: transparent; border: none; outline: none;
  color: var(--text-muted, #555); font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem; padding: 0.35rem 0.6rem;
}
.search::placeholder { color: var(--border-strong, #2a2a3a); }
.search-clear { background: none; border: none; color: #444; cursor: pointer; padding: 0 0.4rem; font-size: 0.65rem; }
.search-clear:hover { color: #888; }

.list { flex: 1; overflow-y: auto; padding: 0.3rem 0; }
.list::-webkit-scrollbar { width: 3px; }
.list::-webkit-scrollbar-track { background: transparent; }
.list::-webkit-scrollbar-thumb { background: var(--border, #1e1e2e); border-radius: 2px; }

.family-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 0.5rem 0.8rem 0.2rem;
  opacity: 0.7;
}
.pat-row {
  display: flex; align-items: center; gap: 0.6rem;
  width: 100%; background: none; border: none;
  padding: 0.3rem 0.8rem; cursor: pointer;
  text-align: left; transition: background 0.1s;
}
.pat-row:hover { background: var(--bg-subtle, #1a1a28); }
.pat-row.active { background: var(--bg-subtle, #1a1a28); }
.pat-code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.55rem; color: var(--text-muted, #555);
  min-width: 2rem; text-align: right;
}
.pat-row.active .pat-code { color: #9181f9; }
.pat-names { display: flex; flex-direction: column; }
.pat-fr { font-size: 0.72rem; color: #bbb; }
.pat-en { font-size: 0.58rem; color: var(--text-muted, #555); font-family: 'JetBrains Mono', monospace; }
.pat-row.active .pat-fr { color: #ddd; }

/* Détail */
.detail { padding: 1.5rem; max-width: 720px; }
.det-header { display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 1rem; }
.det-code { font-family: 'JetBrains Mono', monospace; font-size: 1.4rem; font-weight: 700; }
.det-fr { font-size: 1.1rem; font-weight: 600; color: #ddd; margin-bottom: 0.15rem; }
.det-en { font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; color: var(--text-muted, #555); }
.det-family {
  margin-left: auto; border: 1px solid; border-radius: 2px;
  font-family: 'JetBrains Mono', monospace; font-size: 0.5rem;
  text-transform: uppercase; letter-spacing: 0.1em;
  padding: 0.2rem 0.5rem; white-space: nowrap;
}
.det-intent { font-size: 0.8rem; line-height: 1.5; color: #aaa; margin-bottom: 1.5rem; }

.det-sections { display: flex; flex-direction: column; gap: 1.2rem; }
.det-sections section h3 {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.55rem; text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--text-muted, #555); margin-bottom: 0.5rem;
}
.det-sections ul { padding-left: 1.1rem; }
.det-sections li { font-size: 0.75rem; color: #999; line-height: 1.5; margin-bottom: 0.2rem; }
.pro li { color: #4adfaa; }
.con li { color: #f97070; }

.pro-con { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

.chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.chip {
  font-family: 'JetBrains Mono', monospace; font-size: 0.6rem;
  padding: 0.2rem 0.5rem; border-radius: 2px;
  border: 1px solid var(--border-strong, #2a2a3a);
}
.chip-part { color: var(--text-secondary, #888); background: none; }
.chip-link {
  background: none; cursor: pointer; color: #888;
  display: flex; align-items: center; gap: 0.3rem;
  transition: color 0.1s, border-color 0.1s;
}
.chip-link:hover { color: #9181f9; border-color: #7c6af7; }
.chip-code { color: var(--text-muted, #555); }
.chip-link:hover .chip-code { color: #9181f9; }

/* Placeholder grid */
.placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 1.5rem; }
.placeholder-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.5rem; padding: 1rem; }
.pg-node {
  background: none; border: 1px solid; border-radius: 3px;
  padding: 0.4rem 0.5rem; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 0.2rem;
  transition: background 0.1s;
}
.pg-node:hover { background: var(--bg-subtle, #1a1a28); }
.pg-code { font-family: 'JetBrains Mono', monospace; font-size: 0.55rem; font-weight: 700; }
.pg-fr { font-size: 0.58rem; color: #888; text-align: center; }
.placeholder-hint { font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; color: var(--text-muted, #555); }

.panel-detail::-webkit-scrollbar { width: 4px; }
.panel-detail::-webkit-scrollbar-track { background: transparent; }
.panel-detail::-webkit-scrollbar-thumb { background: var(--border, #1e1e2e); border-radius: 2px; }
</style>
