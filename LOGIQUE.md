# LOGIQUE DU JEU - Regicide Backend (Colyseus)

## Table des matières

1. [Connexion et création d'une room](#1-connexion-et-création-dune-room)
2. [Phase d'attente (WAITING)](#2-phase-dattente-waiting)
3. [Phase Ready/Not Ready](#3-phase-readynot-ready)
4. [Distribution des Rois Secrets](#4-distribution-des-rois-secrets)
5. [Phase de Draft (DRAFTING)](#5-phase-de-draft-drafting)
6. [Phase de jeu (PLAYING)](#6-phase-de-jeu-playing)
7. [Actions de jeu](#7-actions-de-jeu)
8. [Pouvoirs spéciaux](#8-pouvoirs-spéciaux)
9. [Fin de partie](#9-fin-de-partie)
10. [Problèmes potentiels identifiés](#10-problèmes-potentiels-identifiés)

---

## 1. Connexion et création d'une room

### Flux

1. **Création de la room** (`onCreate`)

   - Phase initiale : `GAME_PHASES.WAITING`
   - Configuration : nombre de joueurs (3-4), mode debug, skipDraft
   - Initialisation des variables de draft
   - Setup des message handlers

2. **Connexion d'un joueur** (`onJoin`)
   - Création d'un objet `Player` avec :
     - `sessionId` (unique)
     - `pseudo` (fourni ou généré)
     - `isConnected = true`
     - `isReady = false` (sauf en mode debug)
     - `hand = ArraySchema()`
     - `draftPack = ArraySchema()`
   - Ajout du joueur à `state.players`
   - En mode debug : auto-ready et démarrage automatique

### ⚠️ Problème potentiel #1

- **Ordre de connexion non garanti** : L'ordre dans `state.players` dépend de l'ordre de connexion, pas d'un index prédéfini
- **Impact** : Le premier joueur à jouer sera toujours celui qui s'est connecté en premier
- **Solution recommandée** : Randomiser `currentPlayerIndex` au début du jeu ou permettre aux joueurs de choisir qui commence

---

## 2. Phase d'attente (WAITING)

### Flux

- État : `phase = GAME_PHASES.WAITING`
- Attente de `playerCount` joueurs connectés (configuré à la création)
- Les joueurs peuvent se marquer comme ready/not ready
- La partie ne démarre que si :
  - `connectedPlayers === targetPlayerCount` (exactement le bon nombre)
  - `readyPlayers === connectedPlayers` (tous les joueurs connectés sont prêts)

### ⚠️ Problème potentiel #2

- **Contrainte stricte** : `minClients = 3` et `maxClients = 4` sont définis mais la logique exige un nombre EXACT
- **Impact** : Si un joueur se déconnecte après ready, la partie ne peut plus démarrer
- **Solution recommandée** : Gérer les déconnexions en phase WAITING en retirant le joueur et en permettant un nouveau joueur de le remplacer

---

## 3. Phase Ready/Not Ready

### Message handlers

1. **player_ready** (`handlePlayerReady`)

   - Validations :
     - Phase doit être WAITING
     - Joueur existe
     - Joueur n'est pas déjà ready
   - Action :
     - `player.isReady = true`
     - Broadcast `player_ready_update` à tous
     - Vérification `checkGameStart()`

2. **player_not_ready** (`handlePlayerNotReady`)
   - Validations :
     - Phase doit être WAITING
     - Joueur existe
     - Joueur était ready
   - Action :
     - `player.isReady = false`
     - Broadcast `player_ready_update` à tous

### ⚠️ Problème potentiel #3

- **Pas de timeout** : Aucun mécanisme de timeout si un joueur reste inactif
- **Impact** : Une room peut rester bloquée en WAITING indéfiniment
- **Solution recommandée** : Implémenter un timeout après lequel les joueurs non-ready sont retirés ou un vote pour forcer le démarrage

---

## 4. Distribution des Rois Secrets

### Flux (dans `distributeSecretKings`)

1. Création du deck complet (52 cartes)
2. Séparation Rois / Non-Rois
3. Mélange des Rois (4 cartes)
4. Distribution 1 Roi par joueur :
   - Ajout à `player.secretKing`
   - **IMPORTANT** : Ajout direct à `player.hand` avec `isVisible = false`
   - Mise à jour de `player.handCount`
5. Pour 3 joueurs :
   - Le 4ème Roi détermine la famille exclue
   - Stockage dans `gameOptions.excludedSuit`

### ✅ Logique correcte

- Les Rois sont bien ajoutés directement dans les mains
- La synchronisation devrait fonctionner car `hand` est un ArraySchema

### ⚠️ Problème potentiel #4

- **Visibilité du Roi** : `isVisible = false` mais pas de logique frontend pour masquer la valeur
- **Impact** : Le frontend pourrait afficher le roi secret des autres joueurs
- **Solution recommandée** :
  - Ne pas envoyer les cartes `isVisible = false` des autres joueurs au frontend
  - Ou envoyer uniquement `{ id, isVisible: false }` sans `suit` ni `value`

---

## 5. Phase de Draft (DRAFTING)

### Flux principal (`startDraftPhase`)

#### A. Préparation

1. Calcul du nombre de tours nécessaires :
   - 3 joueurs : 12 cartes × 3 = 36 cartes nécessaires
   - 4 joueurs : 12 cartes × 4 = 48 cartes nécessaires
2. Création des paquets de 4 cartes (`createDraftPacks`)
3. Distribution initiale (`distributeDraftPacks`)

#### B. Tour de draft

1. Chaque joueur reçoit un paquet dans `player.draftPack`
2. Broadcast `draft_pack_received`
3. Joueurs envoient `draft_cards` avec leurs choix :
   - 3 joueurs : **2 cartes au 1er pick, puis 1 carte**
   - 4 joueurs : **1 carte à chaque pick**

#### C. Message handler (`handleDraftCards`)

```javascript
Validations :
- Phase = DRAFTING
- Joueur existe
- !player.hasPicked (pas déjà choisi ce tour)
- message.cardIds est un array
- Nombre de cartes sélectionnées = expectedPickCount
- Toutes les cartes sont dans player.draftPack

Actions :
1. Ajout des cartes choisies à player.hand (définitif)
2. Stockage des cartes restantes dans pendingRemainingCards Map
3. player.hasPicked = true
4. player.draftPack.clear()
5. Appel checkAllPlayersHavePicked()
```

#### D. Redistribution (`redistributeRemainingCards`)

```javascript
Condition de déclenchement :
- Tous les joueurs avec des cartes ont choisi
- Il existe des cartes dans pendingRemainingCards

Logique :
1. Pour chaque joueur avec des cartes en attente :
   - Calcul du joueur suivant selon draftDirection
   - Direction -1 : vers la gauche (index - 1)
   - Direction 1 : vers la droite (index + 1)
   - Transfert des cartes restantes vers nextPlayer.draftPack
   - nextPlayer.hasPicked = false

2. Nettoyage de pendingRemainingCards
3. Broadcast draft_pack_received aux joueurs concernés
```

#### E. Fin du round (`checkDraftRoundComplete`)

```javascript
Conditions :
- Aucun joueur n'a de cartes dans draftPack
- Aucune carte dans pendingRemainingCards

Actions :
- Si draft complet (tous ont 13 cartes) : finalizeDraft()
- Sinon : startNextDraftRound()
```

### ⚠️ Problème potentiel #5 : RACE CONDITION MAJEURE

**Description** : Le système de redistribution utilise une Map `pendingRemainingCards` qui dépend de l'ordre d'exécution

**Scénario problématique** :

```
1. Joueur A choisit → ses cartes vont dans pendingRemainingCards
2. Joueur B choisit → ses cartes vont dans pendingRemainingCards
3. checkAllPlayersHavePicked() se déclenche
4. redistributeRemainingCards() redistribue
5. Joueur C choisit (tard) → mais redistribution déjà faite !
```

**Impact** :

- Cartes perdues ou dupliquées
- Joueurs bloqués sans cartes à drafter
- Incohérence entre les mains des joueurs

**Solution recommandée** :

```javascript
// Option 1 : Attendre TOUS les joueurs avant de redistribuer
checkAllPlayersHavePicked() {
  const connectedPlayers = this.state.players.filter(p => p.isConnected);
  const playersWithPendingCards = Array.from(this.pendingRemainingCards.keys());

  // Redistribuer SEULEMENT si tous les joueurs connectés ont leurs cartes en attente
  if (playersWithPendingCards.length === connectedPlayers.length) {
    this.redistributeRemainingCards();
  }
}

// Option 2 : Système de "round" atomique
// Marquer le round comme "en cours" et interdire les picks tardifs
```

### ⚠️ Problème potentiel #6 : Direction du draft

**Description** : `draftDirection = -1` (toujours vers la gauche) n'alterne jamais

**Règles classiques du draft** :

- Round 1 : vers la gauche
- Round 2 : vers la droite
- Round 3 : vers la gauche
- etc.

**Impact** : Le draft n'est pas équitable (certains joueurs voient toujours les cartes des mêmes voisins)

**Solution recommandée** :

```javascript
startNextDraftRound() {
  this.draftRound++;
  this.draftDirection *= -1; // Décommenter cette ligne !
  // ...
}
```

### ⚠️ Problème potentiel #7 : Picks asymétriques (3 joueurs)

**Implémentation actuelle** :

```javascript
getExpectedPickCount(playerCount, isFirstPick) {
  if (playerCount === 3) {
    return isFirstPick ? 2 : 1; // Premier tour: 2, puis 1
  } else {
    return 1; // 4 joueurs: toujours 1
  }
}
```

**Problème** : `isFirstPick` est déterminé par `player.draftPack.length === 4`

**Scénario problématique** :

```
Round 1 :
- Paquet de 4 → Pick 2 ✓
- Paquet de 2 restant → Pick 1 ✓

Round 2 :
- Paquet de 4 → Pick 2 ✓
- Paquet de 2 restant → Pick 1 ✓
- Paquet de 1 restant → Bloqué ! (trop de picks)
```

**Solution recommandée** :

- Suivre le numéro de pick dans le round plutôt que la taille du paquet
- Ou adapter la logique pour 3 joueurs (paquets de 3 cartes au lieu de 4)

---

## 6. Phase de jeu (PLAYING)

### Démarrage (`finalizeDraft` ou `skipToPlayingPhase`)

1. `state.phase = GAME_PHASES.PLAYING`
2. `state.currentPlayerIndex = 0` (premier joueur)
3. Initialisation de `state.discardPile`
4. Initialisation de la pyramide vide (`initializePyramid`)
5. Broadcast `draft_complete`

### Structure de la pyramide

```
Row 4: [X]          (1 emplacement) - Multiplicateur ×4
Row 3: [X][X]       (2 emplacements) - Multiplicateur ×3
Row 2: [X][X][X]    (3 emplacements) - Multiplicateur ×2
Row 1: [X][X][X][X] (1 emplacements) - Multiplicateur ×1 (base)
```

**Initialisation** : 10 emplacements remplis avec des `Card` ayant `isEmpty = true`

### ⚠️ Problème potentiel #8 : Pyramide inversée

**Description** : Row 1 = base (4 cartes) mais dans une pyramide visuelle, la base devrait être en bas

**Impact** : Confusion entre logique serveur et affichage frontend

**Solution recommandée** :

- Documenter clairement la convention
- Ou inverser la numérotation (Row 1 = sommet, Row 4 = base)

---

## 7. Actions de jeu

### Message handler principal (`handlePlayCard`)

#### Validations globales

```javascript
1. phase === GAME_PHASES.PLAYING
2. isPlayerTurn(client.sessionId) // Bon joueur
3. player existe
4. message.cardId, message.action, message.target existent
5. cardToPlay est dans player.hand
```

#### Types d'actions

### A. Place card (`action = "place"`)

**Handler** : `handlePlaceCard`

**Validations** :

```javascript
1. isValidPosition(row, col) → emplacement existe et isEmpty = true
2. getCardAt(row, col) → pas de carte ou carte vide
3. canPlaceCardAt(card, row, col) → règles de placement respectées
```

**Règles de placement** :

```javascript
canPlaceCardAt(card, row, col) {
  // Row 1 (base) : placement libre
  if (row === 1) return true;

  // Rows 2-4 : nécessite un support de la MÊME FAMILLE
  const leftSupport = getCardAt(row - 1, col);
  const rightSupport = getCardAt(row - 1, col + 1);

  return (leftSupport && leftSupport.suit === card.suit) ||
         (rightSupport && rightSupport.suit === card.suit);
}
```

**Actions** :

- `setCardAt(row, col, card)` → place la carte
- `card.row = row`, `card.col = col`
- `pyramid.totalCards++`, `pyramid.emptySlots--`
- Broadcast `card_placed`

### ⚠️ Problème potentiel #9 : Placement de la base

**Description** : Row 1 permet le placement libre PARTOUT

**Problème** : Aucune contrainte sur la première carte placée dans le jeu

**Questions** :

- Peut-on placer une carte en Row 1 col 3 sans avoir rempli col 0-2 ?
- Faut-il forcer un placement séquentiel à la base ?

**Solution recommandée** : Clarifier les règles du jeu

### B. Replace card (`action = "replace"`)

**Handler** : `handleReplaceCard`

**Validations** :

```javascript
1. Position existe dans la pyramide
2. existingCard existe et n'est pas vide
3. CardService.canReplaceCard(newCard, existingCard) = true
```

**Hiérarchie des cartes** (`CardService.canReplaceCard`) :

```javascript
RÈGLES COMPLEXES :

1. As vs Têtes (JACK/QUEEN/KING) : As GAGNE (cycle)
2. As vs As : OK (égalité)
3. As vs Nombres : As PERD (As est faible)
4. Tout (sauf As) vs As : GAGNE (As est faible)

5. Nombres vs Nombres : value >= (2 bat 2, 3 bat 2 et 3, etc.)
6. Nombres vs Têtes : Nombres PERDENT

7. Valet (11) bat : As, Nombres 2-10, Valet
8. Dame (12) bat : As, Nombres 2-10, Valet, Dame
9. Roi (13) bat : TOUT

10. Têtes ne se battent qu'en égalité ou supériorité :
    - Valet ne bat pas Dame
    - Dame ne bat pas Roi
```

### ⚠️ Problème potentiel #10 : Logique As ambiguë

**Description** : L'As a un double rôle :

- Fort contre les têtes (cycle)
- Faible contre les nombres

**Tests critiques nécessaires** :

```javascript
// Ces cas doivent être testés explicitement
canReplaceCard(As♠, 2♣) → FALSE ✓
canReplaceCard(As♠, Valet♦) → TRUE ✓
canReplaceCard(As♠, Dame♥) → TRUE ✓
canReplaceCard(As♠, Roi♠) → TRUE ✓
canReplaceCard(Valet♣, As♠) → TRUE ✓
canReplaceCard(2♦, As♠) → TRUE ✓
```

**Solution recommandée** : Ajouter des tests unitaires pour `canReplaceCard`

### C. Special power (`action = "special_power"`)

**Handler** : `handleSpecialPowerCard`

**Flux** :

```javascript
1. Effectuer l'action de base (place ou replace)
   → Si échec, arrêter ici
2. Si succès, activer le pouvoir spécial selon card.type
```

**Validation** : `target.baseAction` doit être "place" ou "replace"

---

## 8. Pouvoirs spéciaux

### A. Dame (QUEEN) : Échange de 2 cartes

**Handler** : `handleQueenPower`

**Validations** :

```javascript
1. target.exchangeTargets existe
2. target.exchangeTargets.length === 2
3. Les 2 positions contiennent des cartes valides (non vides)
```

**Action** :

```javascript
1. Récupération de card1 et card2
2. Échange via setCardAt :
   setCardAt(pos1.row, pos1.col, card2)
   setCardAt(pos2.row, pos2.col, card1)
3. Broadcast queen_power_used
```

### ⚠️ Problème potentiel #11 : Échange et contraintes de placement

**Description** : L'échange ne vérifie PAS si les cartes échangées respectent les règles de support

**Exemple problématique** :

```
Row 2: [5♠] [7♦] [3♥]
Row 1: [2♠] [6♠] [8♦] [9♥]

Échange 5♠ (supporté par 2♠) avec 3♥ (supporté par 9♥)
→ Après échange :
Row 2: [3♥] [7♦] [5♠]
Row 1: [2♠] [6♠] [8♦] [9♥]

3♥ n'est plus supporté par 2♠ (différentes familles) !
5♠ n'est plus supporté par 9♥ (différentes familles) !
```

**Impact** : La pyramide devient incohérente

**Solution recommandée** :

```javascript
handleQueenPower(target, player) {
  // ...validation existante...

  // Vérifier que les cartes échangées respectent les règles de support
  if (pos1.row > 1 && !this.wouldHaveValidSupport(card2, pos1)) {
    return error("L'échange violerait les règles de support");
  }
  if (pos2.row > 1 && !this.wouldHaveValidSupport(card1, pos2)) {
    return error("L'échange violerait les règles de support");
  }

  // Procéder à l'échange
}

wouldHaveValidSupport(card, position) {
  const leftSupport = this.getCardAt(position.row - 1, position.col);
  const rightSupport = this.getCardAt(position.row - 1, position.col + 1);

  return (leftSupport && leftSupport.suit === card.suit) ||
         (rightSupport && rightSupport.suit === card.suit);
}
```

### B. Valet (JACK) : Échange avec un autre joueur

**Handler** : `handleJackPower`

**Validations** :

```javascript
1. target.giveCardId existe
2. target.targetPlayerId existe
3. targetPlayer existe
4. cardToGive est dans la main du joueur actuel
5. targetPlayer.hand.length > 0
```

**Action** :

```javascript
1. Pioche ALÉATOIRE d'une carte dans la main du joueur cible
2. Retrait des 2 cartes de leurs mains respectives
3. Ajout croisé :
   - cardToGive → main du joueur cible
   - receivedCard → main du joueur actuel
4. Mise à jour des handCount
5. Broadcast jack_power_used
```

### ✅ Logique correcte

- L'ordre des opérations est bon (pioche avant modification)
- Les handCount sont mis à jour

### ⚠️ Problème potentiel #12 : Timing du pouvoir Valet

**Description** : Le pouvoir s'active APRÈS placement/remplacement de la carte Valet

**Question** : Le joueur peut-il utiliser le pouvoir Valet pour récupérer une carte qu'il vient de jouer ?

**Impact** : Non, car la carte Valet est retirée de la main dans `finalizePlayerTurn` APRÈS le pouvoir

**Clarification nécessaire** : Documenter l'ordre exact d'exécution

### C. As (ACE) : Pas de pouvoir additionnel

**Implémentation** :

```javascript
case CARD_TYPES.ACE:
  console.log(`${player.pseudo} played an Ace with special hierarchy`);
  return true;
```

**Logique** : L'As a une hiérarchie spéciale (gère les têtes) mais pas de pouvoir interactif

### D. Roi (KING) : Pas de pouvoir additionnel

**Implémentation** :

```javascript
case CARD_TYPES.KING:
  console.log(`${player.pseudo} played a King (no special power)`);
  return true;
```

---

## 9. Fin de partie

### Déclenchement (`checkGameEnd`)

**Appelé après chaque tour dans** `finalizePlayerTurn`

**Conditions de fin** :

```javascript
1. Toutes les mains vides :
   state.players.every(p => p.hand.length === 0)

2. Un seul joueur peut encore jouer :
   playersWhoCanPlay.length <= 1
```

### Calcul de "peut jouer" (`canPlayerPlay`)

```javascript
Pour chaque carte dans player.hand :
  Pour chaque position (row, col) de la pyramide :
    Si emplacement vide ET canPlaceCardAt(card, row, col) → TRUE
    Si carte existante ET canReplaceCard(card, existingCard) → TRUE

Si aucune carte jouable → FALSE
```

### Calcul des scores (`calculatePlayerScore`)

**Formule** :

```javascript
Pour chaque carte de la pyramide :
  Si card.suit === player.secretKing.suit :
    score += card.value × row

row = multiplicateur de la rangée (1, 2, 3 ou 4)
```

**Exemple** :

```
Player A : Roi de ♠
Pyramide :
- Row 1 : 2♠, 5♦, 8♠, 9♥ → 2×1 + 8×1 = 10 points
- Row 2 : 3♠, 7♣, 10♠ → 3×2 + 10×2 = 26 points
- Row 3 : As♠, 6♦ → 1×3 = 3 points
- Row 4 : Dame♠ → 12×4 = 48 points

Score total : 10 + 26 + 3 + 48 = 87 points
```

**Cas particulier 3 joueurs** :

```javascript
Si player.secretKing.suit === gameOptions.excludedSuit :
  return 0 (score nul)
```

### ⚠️ Problème potentiel #13 : Famille exclue

**Description** : Un joueur peut se retrouver avec la famille exclue

**Impact** : Ce joueur ne peut PAS gagner (score = 0 automatique)

**Questions** :

- Est-ce intentionnel (malchance) ?
- Faut-il redistribuer les Rois si famille exclue ?

**Solution recommandée** : Clarifier les règles du jeu

### Broadcast final (`game_finished`)

```javascript
{
  winner: { sessionId, pseudo, score },
  finalScores: [
    { sessionId, pseudo, score, secretKing: { suit, value } },
    ...
  ]
}
```

### ⚠️ Problème potentiel #14 : Révélation des Rois secrets

**Description** : Les Rois secrets sont révélés à la fin dans `finalScores`

**Impact** : OK pour la fin de partie, mais attention à ne pas envoyer ces infos pendant le jeu

---

## 10. Problèmes potentiels identifiés

### 🔴 CRITIQUES (Bloquants potentiels)

1. **#5 : Race condition dans le draft**

   - Risque de perte/duplication de cartes
   - **Priorité** : 🔴 HAUTE
   - **Action** : Refactoring du système de redistribution

2. **#11 : Échange de Dame sans validation des supports**

   - Pyramide incohérente
   - **Priorité** : 🔴 HAUTE
   - **Action** : Ajouter validation des supports après échange

3. **#7 : Picks asymétriques pour 3 joueurs**
   - Blocage possible du draft
   - **Priorité** : 🔴 HAUTE
   - **Action** : Tester exhaustivement le cas 3 joueurs

### 🟠 IMPORTANTES (Correctness)

4. **#4 : Visibilité des Rois secrets**

   - Fuite d'information
   - **Priorité** : 🟠 MOYENNE
   - **Action** : Filtrer les données envoyées au frontend

5. **#6 : Direction du draft fixe**

   - Déséquilibre du draft
   - **Priorité** : 🟠 MOYENNE
   - **Action** : Alterner la direction entre les rounds

6. **#10 : Logique As ambiguë**
   - Comportement incertain
   - **Priorité** : 🟠 MOYENNE
   - **Action** : Tests unitaires exhaustifs

### 🟡 MINEURES (UX/Clarifications)

7. **#1 : Ordre des joueurs**

   - Premier joueur = premier connecté
   - **Priorité** : 🟡 BASSE
   - **Action** : Randomiser ou permettre le choix

8. **#2 : Contrainte stricte du nombre de joueurs**

   - Blocage si déconnexion
   - **Priorité** : 🟡 BASSE
   - **Action** : Gérer les déconnexions en phase WAITING

9. **#3 : Pas de timeout en phase WAITING**

   - Room bloquée
   - **Priorité** : 🟡 BASSE
   - **Action** : Implémenter un système de timeout

10. **#8 : Pyramide inversée**

    - Confusion logique/visuel
    - **Priorité** : 🟡 BASSE
    - **Action** : Documentation

11. **#9 : Placement libre à la base**

    - Règles floues
    - **Priorité** : 🟡 BASSE
    - **Action** : Clarification des règles

12. **#12 : Timing du pouvoir Valet**

    - Ordre d'exécution
    - **Priorité** : 🟡 BASSE
    - **Action** : Documentation

13. **#13 : Famille exclue (3 joueurs)**

    - Équité du jeu
    - **Priorité** : 🟡 BASSE
    - **Action** : Clarification des règles

14. **#14 : Révélation des Rois**
    - Timing de l'information
    - **Priorité** : 🟡 BASSE
    - **Action** : Vérifier que ça n'arrive qu'en fin de partie

---

## Recommandations prioritaires

### Avant de reprendre le frontend :

1. ✅ **Fixer le problème #5** (race condition draft)

   - Implémenter un système de "round atomique"
   - Attendre tous les joueurs avant redistribution

2. ✅ **Fixer le problème #11** (échange de Dame)

   - Valider les supports après échange
   - Empêcher les échanges qui violent les règles

3. ✅ **Tester exhaustivement le draft à 3 joueurs**

   - Vérifier les scénarios avec picks 2-1-1-1
   - S'assurer qu'aucune carte n'est perdue

4. ✅ **Écrire des tests unitaires pour `canReplaceCard`**

   - Couvrir tous les cas As/Nombres/Têtes
   - Documenter les règles exactes

5. ✅ **Filtrer les données envoyées au frontend**
   - Ne jamais envoyer les cartes `isVisible=false` des autres joueurs
   - Vérifier tous les broadcasts

### Tests recommandés :

```javascript
// Test 1 : Draft complet 4 joueurs
// - Vérifier que chaque joueur a exactement 13 cartes à la fin
// - Vérifier qu'aucune carte n'est dupliquée

// Test 2 : Draft complet 3 joueurs
// - Vérifier les picks 2-1-1-1
// - Vérifier la famille exclue

// Test 3 : Placement et remplacement
// - Tester tous les cas de canReplaceCard
// - Vérifier les contraintes de support

// Test 4 : Pouvoir Dame
// - Tester un échange qui violerait les supports
// - Vérifier le rejet

// Test 5 : Pouvoir Valet
// - Vérifier l'échange correct des cartes
// - Vérifier les handCount

// Test 6 : Fin de partie
// - Vérifier le calcul des scores
// - Vérifier la gestion de la famille exclue (3 joueurs)
```

---

## Notes pour le développement frontend

### Données à ne PAS afficher :

- `player.secretKing` des autres joueurs (sauf fin de partie)
- `card.suit` et `card.value` si `card.isVisible === false`

### Validations côté client :

- Vérifier `isPlayerTurn` avant d'activer les contrôles
- Vérifier `phase` pour afficher les bons écrans
- Désactiver les actions si `player.hasPicked === true` (draft)

### Messages à gérer :

- `player_ready_update` → Mettre à jour la liste des joueurs prêts
- `draft_pack_received` → Afficher le paquet de draft
- `draft_complete` → Passer à l'écran de jeu
- `card_placed` / `card_replaced` → Mettre à jour la pyramide
- `queen_power_used` / `jack_power_used` → Animations
- `turn_changed` → Mettre à jour le joueur actif
- `game_finished` → Afficher les scores finaux

### État local à maintenir :

- Joueur actuel (`currentPlayerIndex`)
- Main du joueur local uniquement
- État de la pyramide (synchronisé automatiquement)
- Phase du jeu

---

**Document créé le 18 octobre 2025**
**Version 1.0**
