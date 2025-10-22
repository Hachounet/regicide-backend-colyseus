# Flux de données - Fin de partie

## Vue d'ensemble

Ce document explique comment les données circulent entre le backend et le frontend lors de la fin d'une partie de Regicide.

---

## 1. Déclenchement de la fin de partie (Backend)

### Conditions de fin

La partie se termine dans deux cas :

1. **Toutes les mains sont vides** : `room.state.players.every(p => p.hand.length === 0)`
2. **Un seul joueur peut encore jouer** : `playersWhoCanPlay.length <= 1`

### Fonction de détection

📁 `src/rooms/logic/gameplay.js` → `checkGameEnd(room)`

```javascript
export function checkGameEnd(room) {
  const allHandsEmpty = room.state.players.every((p) => p.hand.length === 0);
  if (allHandsEmpty) {
    console.log("Game ending: all players have empty hands");
    endGameAndCalculateScores(room);
    return true;
  }

  const playersWhoCanPlay = room.state.players.filter(
    (p) => p.isConnected && p.hand.length > 0 && canPlayerPlay(room, p)
  );
  if (playersWhoCanPlay.length <= 1) {
    console.log("Game ending: only one player can play");
    endGameAndCalculateScores(room);
    return true;
  }

  return false;
}
```

---

## 2. Calcul des scores et broadcast (Backend)

### Fonction de calcul

📁 `src/rooms/logic/gameplay.js` → `endGameAndCalculateScores(room)`

**Étapes :**

1. Calculer le score de chaque joueur
2. Déterminer le gagnant (score le plus élevé)
3. Mettre à jour l'état : `room.state.phase = GAME_PHASES.FINISHED`
4. **Broadcaster le message `game_finished`**

### Structure du message envoyé

```javascript
room.broadcast("game_finished", {
  winner: {
    sessionId: string, // ID du gagnant
    pseudo: string, // Pseudo du gagnant
    score: number, // Score du gagnant
  },
  finalScores: [
    {
      sessionId: string, // ID du joueur
      pseudo: string, // Pseudo du joueur
      score: number, // Score final
      secretKing: {
        suit: string, // 'hearts', 'spades', 'diamonds', 'clubs'
        value: number, // 13 pour les rois
      },
    },
    // ... pour tous les joueurs
  ],
});
```

### Calcul du score individuel

```javascript
export function calculatePlayerScore(room, player) {
  if (!player.secretKing) return 0;

  const playerSuit = player.secretKing.suit;
  let totalScore = 0;

  // Parcourir la pyramide
  for (let row = 1; row <= 4; row++) {
    const multiplier = row; // Rangée 1 = x1, Rangée 4 = x4
    for (let col = 0; col < rowLength; col++) {
      const card = getCardAt(room, row, col);
      if (card && card.suit === playerSuit) {
        totalScore += card.value * multiplier;
      }
    }
  }

  // Cas spécial : famille exclue en partie à 3 joueurs
  const gameOptions = JSON.parse(room.state.gameOptions);
  if (gameOptions.excludedSuit === playerSuit) {
    return 0;
  }

  return totalScore;
}
```

---

## 3. Réception et mise à jour du store (Frontend)

### Hook de connexion

📁 `front/hooks/useGameConnection.js` (ou similaire)

```javascript
room.onMessage("game_finished", (data) => {
  console.log("🏆 Fin de partie reçue:", data);

  setGameState((prev) => ({
    ...(prev || {}),
    phase: "finished",
    winner: data.winner.sessionId,
    finalScores: data.finalScores,
    winnerDetails: data.winner,
  }));
});
```

### Store Zustand

📁 `front/stores/gameStore.js`

**État mis à jour :**

```javascript
{
  gameState: {
    phase: 'finished',              // Change la vue affichée
    winner: string,                 // sessionId du gagnant
    finalScores: Array<PlayerScore>, // Tableau des scores
    winnerDetails: WinnerInfo       // Détails du gagnant
  }
}
```

**Fonction de mise à jour :**

```javascript
setGameState: (stateOrUpdater) => {
  if (typeof stateOrUpdater === "function") {
    set((prev) => ({ gameState: stateOrUpdater(prev.gameState) }));
  } else {
    set({ gameState: stateOrUpdater });
  }
};
```

---

## 4. Affichage des résultats (Frontend)

### Composant ResultsScreen

📁 `front/ResultsScreen.jsx`

**Données lues du store :**

```javascript
const { gameState, mySessionId } = useGameStore();
const winnerId = gameState?.winner;
const scores = gameState?.finalScores || [];
```

**Affichage :**

- 📊 Tableau trié par score (décroissant)
- 🏆 Badge "Gagnant" sur le vainqueur
- 👤 Badge "Vous" sur le joueur local
- 👑 Roi secret de chaque joueur (couleur + valeur)
- 🔢 Scores finaux

**Mock de développement :**
Si `gameState.finalScores` est vide, le composant utilise des données mock pour faciliter le développement.

---

## 5. Diagramme de flux

```
┌─────────────────────────────────────────────────────────────┐
│ BACKEND (Colyseus)                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. checkGameEnd()                                          │
│     ↓                                                       │
│  2. endGameAndCalculateScores()                             │
│     ├─ calculatePlayerScore() pour chaque joueur           │
│     ├─ Déterminer le gagnant                               │
│     └─ room.broadcast('game_finished', { ... })            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                           ↓
                    WebSocket Message
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND (React)                                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  3. room.onMessage('game_finished', ...)                    │
│     ↓                                                       │
│  4. setGameState({ phase: 'finished', ... })                │
│     ↓                                                       │
│  5. ResultsScreen.jsx affiche :                             │
│     - Tableau des scores                                    │
│     - Gagnant surligné                                      │
│     - Rois secrets                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Points de vérification

### ✅ Backend

- [ ] `endGameAndCalculateScores()` est appelé quand la partie se termine
- [ ] Le message `game_finished` contient `winner` et `finalScores`
- [ ] Chaque score contient : `sessionId`, `pseudo`, `score`, `secretKing`
- [ ] Les scores sont calculés correctement selon la pyramide

### ✅ Frontend

- [ ] Le handler `room.onMessage('game_finished', ...)` est enregistré
- [ ] `setGameState` accepte une fonction pour la fusion d'état
- [ ] `ResultsScreen` lit `gameState.finalScores` et `gameState.winner`
- [ ] L'affichage trie les joueurs par score décroissant
- [ ] Le gagnant et le joueur local sont surlignés

---

## 7. Debugging

### Logs backend à vérifier

```
"Game ending: all players have empty hands" OU "Game ending: only one player can play"
"Calculating final scores..."
"[Pseudo] final score: [score]"
"Game finished! Winner: [pseudo] with [score] points"
```

### Logs frontend à vérifier

```
"🏆 Fin de partie reçue:", { winner: {...}, finalScores: [...] }
```

### Commandes utiles

```bash
# Backend
npm run start

# Frontend (dans un autre terminal)
npm run dev
```

---

## 8. Améliorations futures

- [ ] Animation de transition vers l'écran de résultats
- [ ] Affichage de la pyramide finale avec les scores par famille
- [ ] Bouton "Rejouer" pour lancer une nouvelle partie
- [ ] Sauvegarde de l'historique des parties

---

**Dernière mise à jour :** 22 octobre 2025
