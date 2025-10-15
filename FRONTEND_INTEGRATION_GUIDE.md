# Guide d'intégration Frontend - Regicide Backend (Colyseus)

## 📋 Vue d'ensemble du projet

**Regicide** est un jeu de cartes stratégique multijoueur (3-4 joueurs) où les joueurs construisent une pyramide de cartes pour maximiser les points de leur famille secrète. Le backend est développé avec **Colyseus** (WebSocket temps réel) et est **100% fonctionnel**.

### 🎯 Objectif du jeu

- Chaque joueur reçoit un **Roi secret** qui détermine sa famille (♥ ♦ ♣ ♠)
- Les joueurs placent/remplacent des cartes sur une **pyramide 4x3x2x1** (10 emplacements)
- À la fin, seules les cartes de **votre famille** comptent pour vos points
- Multiplicateurs par rangée : Rang 1 = ×1, Rang 2 = ×2, Rang 3 = ×3, Rang 4 = ×4

---

## 🔌 Configuration de connexion

### Installation côté frontend

```bash
npm install colyseus.js
```

### Connexion au serveur

```javascript
import { Client } from "colyseus.js";

const client = new Client("ws://localhost:2567"); // ou votre URL de prod

// Rejoindre/créer une room
const room = await client.joinOrCreate(
  "regicide",
  {
    playerCount: 4, // 3 ou 4, selon le nombre de joueurs
    isPrivate: false, // true pour room privée
    roomCode: null, // code pour room privée
  },
  {
    pseudo: "MonPseudo", // nom du joueur, stocké ou local ou session Storage
  }
);
```

---

## 🎮 Phases de jeu et états

### États de la room (`room.state.phase`)

```javascript
// Phase d'attente des joueurs
"waiting"; // En attente de 3-4 joueurs prêts

// Phase de draft (distribution des cartes)
"drafting"; // Les joueurs choisissent leurs cartes par paquets

// Phase de jeu principal
"playing"; // Tour par tour, placement/remplacement de cartes

// Fin de partie
"finished"; // Calcul des scores, affichage du gagnant
```

---

## 📤 Messages à envoyer au serveur

### Phase d'attente

```javascript
// Marquer le joueur comme prêt
room.send("player_ready");

// Annuler le ready
room.send("player_not_ready");
```

### Phase de draft

```javascript
// Choisir des cartes dans le paquet reçu
room.send("draft_cards", {
  cardIds: ["card_id_1", "card_id_2"], // Tableau d'IDs des cartes choisies
  // 3 joueurs: 2 cartes au premier tour, puis 1
  // 4 joueurs: toujours 1 carte
});
```

### Phase de jeu

```javascript
// Placer une carte sur un emplacement vide
room.send("play_card", {
  cardId: "unique_card_id",
  action: "place",
  target: {
    row: 1, // 1-4 (1=base, 4=sommet)
    col: 0, // 0-3 pour row1, 0-2 pour row2, etc.
  },
});

// Remplacer une carte existante
room.send("play_card", {
  cardId: "unique_card_id",
  action: "replace",
  target: {
    row: 2,
    col: 1,
  },
});

// Utiliser un pouvoir spécial (Dame ou Valet)
room.send("play_card", {
  cardId: "queen_card_id",
  action: "special_power",
  target: {
    row: 1,
    col: 0,
    baseAction: "place", // ou "replace"

    // Pour la Dame uniquement (échange 2 cartes)
    exchangeTargets: [
      { row: 1, col: 0 },
      { row: 2, col: 1 },
    ],
  },
});

room.send("play_card", {
  cardId: "jack_card_id",
  action: "special_power",
  target: {
    row: 1,
    col: 0,
    baseAction: "place",

    // Pour le Valet uniquement (échange avec un joueur)
    giveCardId: "card_to_give_id",
    targetPlayerId: "other_player_session_id",
  },
});
```

### Chat

```javascript
room.send("chat_message", {
  text: "Mon message",
});
```

---

## 📥 Messages reçus du serveur

### Phase d'attente

```javascript
room.onMessage("waiting_for_players", (data) => {
  // data = { readyCount: 2, totalCount: 3, minRequired: 3, maxAllowed: 4 }
});

room.onMessage("player_ready_update", (data) => {
  // data = { playerSessionId: "abc", pseudo: "Player1", isReady: true, readyCount: 2, totalPlayers: 3 }
});
```

### Phase de draft

```javascript
room.onMessage("draft_started", (data) => {
  // data = { round: 1, cardsPerPack: 4, pickCount: 2, totalRounds: 3 }
});

room.onMessage("draft_pack_received", (data) => {
  // data = { round: 1, pickCount: 2 }
  // Nouveau paquet disponible dans room.state.players[myIndex].draftPack
});

room.onMessage("draft_complete", (data) => {
  // data = { message: "Phase de draft terminée...", currentPlayer: "session_id" }
});
```

### Phase de jeu

```javascript
room.onMessage("turn_changed", (data) => {
  // data = { currentPlayerSessionId: "abc", currentPseudo: "Player1", turn: 5 }
});

room.onMessage("card_placed", (data) => {
  // data = {
  //   playerSessionId: "abc",
  //   pseudo: "Player1",
  //   card: { id: "...", value: 7, suit: "hearts", type: "number" },
  //   position: { row: 1, col: 2 }
  // }
});

room.onMessage("card_replaced", (data) => {
  // data = {
  //   playerSessionId: "abc",
  //   pseudo: "Player1",
  //   newCard: { id: "...", value: 10, suit: "spades", type: "number" },
  //   replacedCard: { id: "...", value: 5, suit: "hearts", type: "number" },
  //   position: { row: 2, col: 1 }
  // }
});

room.onMessage("queen_power_used", (data) => {
  // data = {
  //   playerSessionId: "abc",
  //   pseudo: "Player1",
  //   exchangedPositions: [{ row: 1, col: 0 }, { row: 2, col: 1 }]
  // }
});

room.onMessage("jack_power_used", (data) => {
  // data = {
  //   playerSessionId: "abc",
  //   pseudo: "Player1",
  //   targetPlayerSessionId: "def",
  //   targetPseudo: "Player2"
  // }
});
```

### Fin de partie

```javascript
room.onMessage("game_finished", (data) => {
  // data = {
  //   winner: { sessionId: "abc", pseudo: "Player1", score: 87 },
  //   finalScores: [
  //     { sessionId: "abc", pseudo: "Player1", score: 87, secretKing: { suit: "hearts", value: 13 } },
  //     { sessionId: "def", pseudo: "Player2", score: 45, secretKing: { suit: "spades", value: 13 } }
  //   ]
  // }
});

room.onMessage("game_ended", (data) => {
  // data = { reason: "Pas assez de joueurs connectés" }
});
```

### Chat

```javascript
room.onMessage("chat_message", (data) => {
  // data = { from: "Player1", message: "Salut!", timestamp: 1699123456789 }
});
```

### Erreurs

```javascript
room.onMessage("error", (data) => {
  // data = { code: "NOT_YOUR_TURN", message: "Ce n'est pas votre tour" }
});
```

---

## 🗂️ Structure des données d'état

### État global de la room (`room.state`)

```javascript
{
  phase: "waiting" | "drafting" | "playing" | "finished",
  players: ArraySchema<Player>,      // Liste des joueurs
  currentPlayerIndex: number,        // Index du joueur actuel (en phase "playing")
  pyramid: Pyramid,                  // État de la pyramide
  discardPile: ArraySchema<Card>,    // Cartes défaussées
  turn: number,                      // Numéro du tour
  gameOptions: string,               // JSON des options de partie
  winner: string,                    // sessionId du gagnant (phase "finished")
  createdAt: number,                 // Timestamp création
  lastActivity: number               // Timestamp dernière activité
}
```

### Structure Player

```javascript
{
  sessionId: string,           // Identifiant unique du joueur
  pseudo: string,              // Nom d'affichage
  hand: ArraySchema<Card>,     // Cartes en main (masquées pour les autres)
  secretKing: Card,            // Roi secret (masqué jusqu'à révélation)
  score: number,               // Score final
  isReady: boolean,            // Prêt à commencer (phase "waiting")
  isConnected: boolean,        // Connecté ou non
  handCount: number,           // Nombre de cartes en main (visible pour tous)
  draftPack: ArraySchema<Card>, // Paquet en cours de draft
  hasPicked: boolean           // A choisi ses cartes ce tour de draft
}
```

### Structure Card

```javascript
{
  id: string,          // Identifiant unique
  value: number,       // 1-13 (As=1, Valet=11, Dame=12, Roi=13)
  suit: string,        // "hearts" | "diamonds" | "clubs" | "spades"
  type: string,        // "ace" | "number" | "jack" | "queen" | "king"
  row: number,         // Position sur pyramide (0=pas placée, 1-4=rangée)
  col: number,         // Colonne sur pyramide
  isVisible: boolean   // Visible ou masquée (pour rois secrets)
}
```

### Structure Pyramid

```javascript
{
  row1: ArraySchema<Card>,  // 4 emplacements (base)
  row2: ArraySchema<Card>,  // 3 emplacements
  row3: ArraySchema<Card>,  // 2 emplacements
  row4: ArraySchema<Card>,  // 1 emplacement (sommet)
  totalCards: number,       // Nombre total de cartes placées
  emptySlots: number        // Emplacements vides restants
}
```

---

## 🎯 Règles de jeu importantes

### Placement des cartes

```javascript
// Rangée 1 (base) : placement libre sur emplacement vide
// Rangées 2-4 : doit avoir un support de la même famille
//
// Exemple: Pour placer une carte à row=2, col=0
// Il faut qu'il y ait une carte de la même famille en :
// - row=1, col=0 (support gauche) OU
// - row=1, col=1 (support droit)
```

### Hiérarchie de remplacement

```javascript
// As (1) > Valet (11), Dame (12), Roi (13)  [cycle spécial]
// As (1) < 2, 3, 4, 5, 6, 7, 8, 9, 10      [As faible vs nombres]
// Nombres : valeur >= pour remplacer (10 remplace 7, pas l'inverse)
// Valet (11) remplace : As, 2-10, Valet
// Dame (12) remplace : As, 2-11, Dame
// Roi (13) remplace : tout
```

### Pouvoirs spéciaux

```javascript
// Dame : Échange la position de 2 cartes sur le plateau
// Valet : Donne une carte à un adversaire, pioche une de sa main au hasard
// As : Hiérarchie spéciale (voir ci-dessus)
// Roi : Aucun pouvoir spécial
```

### Calcul des scores

```javascript
// Seules les cartes de votre famille (suit du roi secret) comptent
// Score = Σ(valeur_carte × multiplicateur_rangée)
// Multiplicateurs : Row 1 = ×1, Row 2 = ×2, Row 3 = ×3, Row 4 = ×4
//
// Exemple: Roi♥ secret, cartes ♥ placées:
// - 7♥ en row1 → 7×1 = 7 points
// - As♥ en row4 → 1×4 = 4 points
// Total = 11 points
```

---

## 🚀 Recommandations d'interface

### Écrans nécessaires

1. **Lobby** : Liste des joueurs, bouton Ready, chat
2. **Draft** : Affichage du paquet, sélection des cartes
3. **Jeu principal** : Pyramide + main du joueur + infos tour
4. **Fin de partie** : Scores finaux, rois révélés

### États UI à gérer

```javascript
// État local recommandé
{
  mySessionId: string,           // Pour identifier ses propres cartes
  selectedCard: Card | null,     // Carte sélectionnée pour jouer
  validMoves: Position[],        // Coups valides calculés côté client
  isDragging: boolean,           // Pour drag & drop
  selectedTargets: Position[],   // Pour pouvoirs spéciaux (Dame/Valet)
}
```

### Exemples d'interaction

```javascript
// Détecter si c'est mon tour
const isMyTurn =
  room.state.players[room.state.currentPlayerIndex]?.sessionId === mySessionId;

// Obtenir ma main
const myPlayer = room.state.players.find((p) => p.sessionId === mySessionId);
const myHand = myPlayer?.hand || [];

// Vérifier si une position est valide pour placement
function canPlaceAt(card, row, col) {
  // Logique côté client pour valider avant envoi
  // (le serveur validera de nouveau)
}
```

---

## 🔧 Debugging et monitoring

### URLs utiles

- **Playground** : `http://localhost:2567/` (dev uniquement)
- **Monitor** : `http://localhost:2567/monitor` (toujours disponible)
- **Test endpoint** : `http://localhost:2567/hello_world`

### Logs serveur

Le serveur log tous les événements importants. Surveillez la console pour debug.

---

## ✅ Checklist d'intégration

- [ ] Installation de `colyseus.js`
- [ ] Connexion WebSocket fonctionnelle
- [ ] Gestion des 4 phases de jeu
- [ ] Interface de placement/remplacement des cartes
- [ ] Système de drag & drop ou clic pour jouer
- [ ] Gestion des pouvoirs spéciaux (Dame/Valet)
- [ ] Affichage temps réel des autres joueurs
- [ ] Interface de draft avec sélection multiple
- [ ] Écran de fin avec scores détaillés
- [ ] Gestion des erreurs et reconnexion
- [ ] Tests avec plusieurs clients simultanés

Le backend est **100% fonctionnel** et testé. Toutes les règles de Regicide sont implémentées correctement ! 🎉
