# API Reference - Messages et Événements

## 📋 Messages envoyés par le client

### `player_ready`

**Phase**: `waiting`  
**Payload**: Aucun  
**Description**: Marque le joueur comme prêt à commencer la partie

### `player_not_ready`

**Phase**: `waiting`  
**Payload**: Aucun  
**Description**: Annule le statut "prêt" du joueur

### `draft_cards`

**Phase**: `drafting`  
**Payload**:

```javascript
{
  cardIds: ["card_id_1", "card_id_2"]; // Array d'IDs des cartes choisies dans le paquet
}
```

**Description**: Sélectionne les cartes lors du draft

### `play_card`

**Phase**: `playing`  
**Payload (placement)**:

```javascript
{
  cardId: "unique_card_id",
  action: "place",
  target: {
    row: 1,  // 1-4
    col: 0   // 0-3 selon la rangée
  }
}
```

**Payload (remplacement)**:

```javascript
{
  cardId: "unique_card_id",
  action: "replace",
  target: {
    row: 2,
    col: 1
  }
}
```

**Payload (pouvoir Dame)**:

```javascript
{
  cardId: "queen_card_id",
  action: "special_power",
  target: {
    row: 1,
    col: 0,
    baseAction: "place", // ou "replace"
    exchangeTargets: [
      { row: 1, col: 0 },
      { row: 2, col: 1 }
    ]
  }
}
```

**Payload (pouvoir Valet)**:

```javascript
{
  cardId: "jack_card_id",
  action: "special_power",
  target: {
    row: 1,
    col: 0,
    baseAction: "place", // ou "replace"
    giveCardId: "card_to_give_id",
    targetPlayerId: "other_player_session_id"
  }
}
```

### `chat_message`

**Phase**: Toutes  
**Payload**:

```javascript
{
  text: "Mon message";
}
```

---

## 📨 Messages reçus du serveur

### `waiting_for_players`

**Phase**: `waiting`  
**Payload**:

```javascript
{
  readyCount: 2,
  totalCount: 3,
  minRequired: 3,
  maxAllowed: 4
}
```

### `player_ready_update`

**Phase**: `waiting`  
**Payload**:

```javascript
{
  playerSessionId: "abc123",
  pseudo: "Player1",
  isReady: true,
  readyCount: 2,
  totalPlayers: 3
}
```

### `draft_started`

**Phase**: `drafting`  
**Payload**:

```javascript
{
  round: 1,
  cardsPerPack: 4,
  pickCount: 2,
  totalRounds: 3
}
```

### `draft_pack_received`

**Phase**: `drafting`  
**Payload**:

```javascript
{
  round: 1,
  pickCount: 2,
  cardsCount: 4  // optionnel
}
```

### `draft_complete`

**Phase**: `drafting` → `playing`  
**Payload**:

```javascript
{
  message: "Phase de draft terminée, la partie commence !",
  currentPlayer: "abc123"  // sessionId
}
```

### `turn_changed`

**Phase**: `playing`  
**Payload**:

```javascript
{
  currentPlayerSessionId: "abc123",
  currentPseudo: "Player1",
  turn: 5
}
```

### `card_placed`

**Phase**: `playing`  
**Payload**:

```javascript
{
  playerSessionId: "abc123",
  pseudo: "Player1",
  card: {
    id: "hearts_7_123456",
    value: 7,
    suit: "hearts",
    type: "number"
  },
  position: {
    row: 1,
    col: 2
  }
}
```

### `card_replaced`

**Phase**: `playing`  
**Payload**:

```javascript
{
  playerSessionId: "abc123",
  pseudo: "Player1",
  newCard: {
    id: "spades_10_789012",
    value: 10,
    suit: "spades",
    type: "number"
  },
  replacedCard: {
    id: "hearts_5_345678",
    value: 5,
    suit: "hearts",
    type: "number"
  },
  position: {
    row: 2,
    col: 1
  }
}
```

### `queen_power_used`

**Phase**: `playing`  
**Payload**:

```javascript
{
  playerSessionId: "abc123",
  pseudo: "Player1",
  exchangedPositions: [
    { row: 1, col: 0 },
    { row: 2, col: 1 }
  ]
}
```

### `jack_power_used`

**Phase**: `playing`  
**Payload**:

```javascript
{
  playerSessionId: "abc123",
  pseudo: "Player1",
  targetPlayerSessionId: "def456",
  targetPseudo: "Player2"
}
```

### `game_finished`

**Phase**: `playing` → `finished`  
**Payload**:

```javascript
{
  winner: {
    sessionId: "abc123",
    pseudo: "Player1",
    score: 87
  },
  finalScores: [
    {
      sessionId: "abc123",
      pseudo: "Player1",
      score: 87,
      secretKing: {
        suit: "hearts",
        value: 13
      }
    },
    {
      sessionId: "def456",
      pseudo: "Player2",
      score: 45,
      secretKing: {
        suit: "spades",
        value: 13
      }
    }
  ]
}
```

### `game_ended`

**Phase**: Toutes → `finished`  
**Payload**:

```javascript
{
  reason: "Pas assez de joueurs connectés";
}
```

### `chat_message`

**Phase**: Toutes  
**Payload**:

```javascript
{
  from: "Player1",
  message: "Salut tout le monde !",
  timestamp: 1699123456789
}
```

### `error`

**Phase**: Toutes  
**Payload**:

```javascript
{
  code: "NOT_YOUR_TURN",
  message: "Ce n'est pas votre tour"
}
```

---

## 🚨 Codes d'erreur

| Code                      | Description                                                       |
| ------------------------- | ----------------------------------------------------------------- |
| `GAME_ALREADY_STARTED`    | Tentative d'action en phase d'attente alors que le jeu a commencé |
| `GAME_NOT_PLAYING`        | Tentative de jouer une carte hors phase de jeu                    |
| `NOT_YOUR_TURN`           | Tentative de jouer hors de son tour                               |
| `PLAYER_NOT_FOUND`        | Joueur non trouvé                                                 |
| `ALREADY_READY`           | Déjà marqué comme prêt                                            |
| `NOT_READY`               | Tentative d'annuler ready alors qu'on n'était pas prêt            |
| `NOT_DRAFTING_PHASE`      | Action de draft hors phase de draft                               |
| `ALREADY_PICKED`          | Déjà choisi ses cartes ce tour de draft                           |
| `INVALID_CARD_SELECTION`  | Sélection de cartes invalide                                      |
| `WRONG_PICK_COUNT`        | Mauvais nombre de cartes sélectionnées                            |
| `CARD_NOT_IN_PACK`        | Carte non disponible dans le paquet                               |
| `CARD_NOT_IN_HAND`        | Carte non présente dans la main                                   |
| `INVALID_POSITION`        | Position invalide sur la pyramide                                 |
| `POSITION_OCCUPIED`       | Emplacement déjà occupé                                           |
| `INVALID_PLACEMENT`       | Placement non autorisé par les règles                             |
| `NO_CARD_TO_REPLACE`      | Aucune carte à remplacer                                          |
| `CANNOT_REPLACE_CARD`     | Remplacement non autorisé par la hiérarchie                       |
| `INVALID_QUEEN_TARGETS`   | Cibles invalides pour le pouvoir Dame                             |
| `INVALID_JACK_TARGETS`    | Cibles invalides pour le pouvoir Valet                            |
| `TARGET_PLAYER_NOT_FOUND` | Joueur cible non trouvé                                           |
| `CARD_TO_GIVE_NOT_FOUND`  | Carte à donner non trouvée                                        |
| `TARGET_HAND_EMPTY`       | Main du joueur cible vide                                         |
