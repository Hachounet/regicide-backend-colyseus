# Exemples d'implémentation Frontend

## 🔌 Configuration initiale

```javascript
// gameState.js - Structure de l'état du jeu
const createGameState = () => ({
  phase: "waiting", // "waiting" | "drafting" | "playing" | "finished"
  players: [],
  currentPlayerIndex: 0,
  pyramid: null,
  mySessionId: "",
  selectedCard: null,
  validMoves: [],
});

// Structure d'une carte
const createCard = () => ({
  id: "",
  value: 0, // 1-13
  suit: "", // "hearts" | "diamonds" | "clubs" | "spades"
  type: "", // "ace" | "number" | "jack" | "queen" | "king"
  row: 0,
  col: 0,
  isVisible: true,
});

// Structure d'une position
const createPosition = (row, col) => ({ row, col });
```

```javascript
// gameService.js
import { Client } from "colyseus.js";

class GameService {
  constructor() {
    this.client = new Client("ws://localhost:2567");
    this.room = null;
  }

  async joinRoom(pseudo) {
    this.room = await this.client.joinOrCreate(
      "regicide",
      {
        playerCount: 4,
        isPrivate: false,
      },
      { pseudo }
    );

    return this.room;
  }

  // Messages helpers
  setReady() {
    this.room?.send("player_ready");
  }

  setNotReady() {
    this.room?.send("player_not_ready");
  }

  selectDraftCards(cardIds) {
    this.room?.send("draft_cards", { cardIds });
  }

  playCard(cardId, action, target) {
    this.room?.send("play_card", { cardId, action, target });
  }

  sendChatMessage(text) {
    this.room?.send("chat_message", { text });
  }
}

export default GameService;
```

---

## 🎮 Composants React/Vue recommandés

### Lobby Component (React)

```javascript
// Lobby.jsx
import { useState } from "react";

const Lobby = ({ room, gameState }) => {
  const [isReady, setIsReady] = useState(false);
  const myPlayer = gameState.players.find(
    (p) => p.sessionId === gameState.mySessionId
  );

  const toggleReady = () => {
    if (isReady) {
      room.send("player_not_ready");
    } else {
      room.send("player_ready");
    }
    setIsReady(!isReady);
  };

  return (
    <div className="lobby">
      <h2>Lobby - En attente des joueurs</h2>

      <div className="players-list">
        {gameState.players.map((player) => (
          <div
            key={player.sessionId}
            className={`player ${player.isReady ? "ready" : ""}`}
          >
            <span>{player.pseudo}</span>
            {player.isReady && <span className="ready-indicator">✓</span>}
          </div>
        ))}
      </div>

      <button
        onClick={toggleReady}
        className={`ready-btn ${isReady ? "ready" : ""}`}
      >
        {isReady ? "Annuler" : "Prêt !"}
      </button>

      <div className="game-info">
        Joueurs: {gameState.players.filter((p) => p.isConnected).length}/4
        <br />
        Prêts: {gameState.players.filter((p) => p.isReady).length}
      </div>
    </div>
  );
};

export default Lobby;
```

### Draft Component (React)

```javascript
// Draft.jsx
import { useState } from "react";

const Draft = ({ room, gameState }) => {
  const [selectedCards, setSelectedCards] = useState([]);
  const myPlayer = gameState.players.find(
    (p) => p.sessionId === gameState.mySessionId
  );
  const draftPack = myPlayer?.draftPack || [];
  const pickCount =
    gameState.players.length === 3 ? (draftPack.length === 4 ? 2 : 1) : 1;

  const toggleCardSelection = (cardId) => {
    setSelectedCards((prev) => {
      if (prev.includes(cardId)) {
        return prev.filter((id) => id !== cardId);
      } else if (prev.length < pickCount) {
        return [...prev, cardId];
      }
      return prev;
    });
  };

  const confirmSelection = () => {
    if (selectedCards.length === pickCount) {
      room.send("draft_cards", { cardIds: selectedCards });
      setSelectedCards([]);
    }
  };

  return (
    <div className="draft">
      <h2>Phase de Draft</h2>
      <p>Choisissez {pickCount} carte(s)</p>

      <div className="draft-pack">
        {draftPack.map((card) => (
          <div
            key={card.id}
            className={`card ${
              selectedCards.includes(card.id) ? "selected" : ""
            }`}
            onClick={() => toggleCardSelection(card.id)}
          >
            <span className="card-value">{card.value}</span>
            <span className="card-suit">{card.suit}</span>
          </div>
        ))}
      </div>

      <button
        onClick={confirmSelection}
        disabled={selectedCards.length !== pickCount}
        className="confirm-btn"
      >
        Valider ({selectedCards.length}/{pickCount})
      </button>
    </div>
  );
};

export default Draft;
```

### Game Board Component (React)

```javascript
// GameBoard.jsx
import { useState } from "react";
import { getPyramidCardAt, canReplaceCard } from "./gameUtils";
import CardComponent from "./CardComponent";

const GameBoard = ({ room, gameState }) => {
  const [selectedCard, setSelectedCard] = useState(null);
  const [hoveredPosition, setHoveredPosition] = useState(null);

  const isMyTurn =
    gameState.players[gameState.currentPlayerIndex]?.sessionId ===
    gameState.mySessionId;
  const myPlayer = gameState.players.find(
    (p) => p.sessionId === gameState.mySessionId
  );

  const canPlaceAt = (position) => {
    if (!selectedCard || !isMyTurn) return false;

    const existingCard = getPyramidCardAt(gameState.pyramid, position);

    if (!existingCard) {
      // Placement sur case vide
      if (position.row === 1) return true; // Base libre

      // Vérifier supports pour rangées supérieures
      const leftSupport = getPyramidCardAt(gameState.pyramid, {
        row: position.row - 1,
        col: position.col,
      });
      const rightSupport = getPyramidCardAt(gameState.pyramid, {
        row: position.row - 1,
        col: position.col + 1,
      });

      return (
        leftSupport?.suit === selectedCard.suit ||
        rightSupport?.suit === selectedCard.suit
      );
    } else {
      // Remplacement
      return canReplaceCard(selectedCard, existingCard);
    }
  };

  const handleCellClick = (position) => {
    if (!selectedCard || !isMyTurn || !canPlaceAt(position)) return;

    const existingCard = getPyramidCardAt(gameState.pyramid, position);
    const action = existingCard ? "replace" : "place";

    room.send("play_card", {
      cardId: selectedCard.id,
      action,
      target: position,
    });

    setSelectedCard(null);
  };

  return (
    <div className="game-board">
      {/* Pyramide */}
      <div className="pyramid">
        {[4, 3, 2, 1].map((row) => (
          <div key={row} className={`pyramid-row row-${row}`}>
            {Array.from({
              length: row === 1 ? 4 : row === 2 ? 3 : row === 3 ? 2 : 1,
            }).map((_, col) => {
              const position = { row: 5 - row, col }; // Inversion pour affichage
              const card = getPyramidCardAt(gameState.pyramid, position);
              const canPlace = canPlaceAt(position);

              return (
                <div
                  key={col}
                  className={`pyramid-cell ${canPlace ? "valid-move" : ""} ${
                    hoveredPosition?.row === position.row &&
                    hoveredPosition?.col === position.col
                      ? "hovered"
                      : ""
                  }`}
                  onClick={() => handleCellClick(position)}
                  onMouseEnter={() => setHoveredPosition(position)}
                  onMouseLeave={() => setHoveredPosition(null)}
                >
                  {card && <CardComponent card={card} />}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Main du joueur */}
      <div className="player-hand">
        <h3>Votre main ({myPlayer?.handCount} cartes)</h3>
        <div className="hand-cards">
          {myPlayer?.hand.map((card) => (
            <div
              key={card.id}
              className={`card ${
                selectedCard?.id === card.id ? "selected" : ""
              } ${!isMyTurn ? "disabled" : ""}`}
              onClick={() => isMyTurn && setSelectedCard(card)}
            >
              <CardComponent card={card} />
            </div>
          ))}
        </div>
      </div>

      {/* Informations de jeu */}
      <div className="game-info">
        <p>Tour: {gameState.turn}</p>
        <p>
          Joueur actuel:{" "}
          {gameState.players[gameState.currentPlayerIndex]?.pseudo}
        </p>
        {isMyTurn && <p className="my-turn">🎯 C'est votre tour !</p>}
      </div>
    </div>
  );
};

export default GameBoard;
```

---

## 🔧 Fonctions utilitaires

```javascript
// gameUtils.js

export const getPyramidCardAt = (pyramid, position) => {
  const { row, col } = position;

  switch (row) {
    case 1:
      return pyramid.row1[col] || null;
    case 2:
      return pyramid.row2[col] || null;
    case 3:
      return pyramid.row3[col] || null;
    case 4:
      return pyramid.row4[col] || null;
    default:
      return null;
  }
};

export const canReplaceCard = (newCard, existingCard) => {
  // Reproduction de la logique serveur côté client pour UX
  const CARD_TYPES = {
    ACE: "ace",
    NUMBER: "number",
    JACK: "jack",
    QUEEN: "queen",
    KING: "king",
  };

  // As peut remplacer Valet/Dame/Roi
  if (
    newCard.type === CARD_TYPES.ACE &&
    [CARD_TYPES.JACK, CARD_TYPES.QUEEN, CARD_TYPES.KING].includes(
      existingCard.type
    )
  ) {
    return true;
  }

  // As vs As
  if (newCard.type === CARD_TYPES.ACE && existingCard.type === CARD_TYPES.ACE) {
    return true;
  }

  // As vs Nombres : As est battu
  if (
    newCard.type === CARD_TYPES.ACE &&
    existingCard.type === CARD_TYPES.NUMBER
  ) {
    return false;
  }

  // Tout bat As (sauf As)
  if (existingCard.type === CARD_TYPES.ACE && newCard.type !== CARD_TYPES.ACE) {
    return true;
  }

  // Nombres vs Nombres
  if (
    newCard.type === CARD_TYPES.NUMBER &&
    existingCard.type === CARD_TYPES.NUMBER
  ) {
    return newCard.value >= existingCard.value;
  }

  // Têtes
  if (newCard.type === CARD_TYPES.JACK) {
    return [CARD_TYPES.ACE, CARD_TYPES.NUMBER, CARD_TYPES.JACK].includes(
      existingCard.type
    );
  }

  if (newCard.type === CARD_TYPES.QUEEN) {
    return [
      CARD_TYPES.ACE,
      CARD_TYPES.NUMBER,
      CARD_TYPES.JACK,
      CARD_TYPES.QUEEN,
    ].includes(existingCard.type);
  }

  if (newCard.type === CARD_TYPES.KING) {
    return true; // Roi remplace tout
  }

  return false;
};

export const calculateScore = (player, pyramid) => {
  if (!player.secretKing) return 0;

  const playerSuit = player.secretKing.suit;
  let totalScore = 0;

  // Parcourir la pyramide
  for (let row = 1; row <= 4; row++) {
    const multiplier = row;
    let rowCards;

    switch (row) {
      case 1:
        rowCards = pyramid.row1;
        break;
      case 2:
        rowCards = pyramid.row2;
        break;
      case 3:
        rowCards = pyramid.row3;
        break;
      case 4:
        rowCards = pyramid.row4;
        break;
      default:
        continue;
    }

    rowCards.forEach((card) => {
      if (card && card.suit === playerSuit) {
        totalScore += card.value * multiplier;
      }
    });
  }

  return totalScore;
};

export const getValidMoves = (card, pyramid) => {
  const validMoves = [];

  for (let row = 1; row <= 4; row++) {
    const maxCol = row === 1 ? 4 : row === 2 ? 3 : row === 3 ? 2 : 1;

    for (let col = 0; col < maxCol; col++) {
      const position = { row, col };
      const existingCard = getPyramidCardAt(pyramid, position);

      if (!existingCard) {
        // Case vide - vérifier placement
        if (row === 1) {
          validMoves.push(position);
        } else {
          // Vérifier supports
          const leftSupport = getPyramidCardAt(pyramid, { row: row - 1, col });
          const rightSupport = getPyramidCardAt(pyramid, {
            row: row - 1,
            col: col + 1,
          });

          if (
            leftSupport?.suit === card.suit ||
            rightSupport?.suit === card.suit
          ) {
            validMoves.push(position);
          }
        }
      } else {
        // Case occupée - vérifier remplacement
        if (canReplaceCard(card, existingCard)) {
          validMoves.push(position);
        }
      }
    }
  }

  return validMoves;
};

// Utilitaires pour l'affichage des cartes
export const getCardDisplayValue = (card) => {
  switch (card.value) {
    case 1:
      return "A";
    case 11:
      return "J";
    case 12:
      return "Q";
    case 13:
      return "K";
    default:
      return card.value.toString();
  }
};

export const getSuitSymbol = (suit) => {
  switch (suit) {
    case "hearts":
      return "♥";
    case "diamonds":
      return "♦";
    case "clubs":
      return "♣";
    case "spades":
      return "♠";
    default:
      return "";
  }
};

export const getSuitColor = (suit) => {
  return ["hearts", "diamonds"].includes(suit) ? "red" : "black";
};
```

---

## 🎨 Exemples CSS

```css
/* styles.css */

.pyramid {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin: 20px 0;
}

.pyramid-row {
  display: flex;
  gap: 5px;
}

.pyramid-cell {
  width: 80px;
  height: 120px;
  border: 2px dashed #ccc;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.pyramid-cell.valid-move {
  border-color: #4caf50;
  background-color: rgba(76, 175, 80, 0.1);
}

.pyramid-cell.hovered {
  transform: scale(1.05);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.card {
  width: 70px;
  height: 100px;
  border: 1px solid #333;
  border-radius: 6px;
  background: white;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 5px;
  cursor: pointer;
  transition: all 0.2s;
}

.card.selected {
  border-color: #2196f3;
  transform: translateY(-5px);
  box-shadow: 0 4px 8px rgba(33, 150, 243, 0.3);
}

.card.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.card-value {
  font-size: 16px;
  font-weight: bold;
}

.card-suit {
  font-size: 14px;
}

.card-suit.hearts,
.card-suit.diamonds {
  color: red;
}

.card-suit.clubs,
.card-suit.spades {
  color: black;
}

.player-hand {
  margin-top: 30px;
}

.hand-cards {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  justify-content: center;
}

.lobby {
  text-align: center;
  padding: 20px;
}

.players-list {
  margin: 20px 0;
}

.player {
  padding: 10px;
  margin: 5px;
  border: 1px solid #ccc;
  border-radius: 5px;
  display: inline-block;
}

.player.ready {
  border-color: #4caf50;
  background-color: rgba(76, 175, 80, 0.1);
}

.ready-btn {
  padding: 15px 30px;
  font-size: 18px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  background-color: #2196f3;
  color: white;
  transition: background-color 0.2s;
}

.ready-btn.ready {
  background-color: #f44336;
}

.my-turn {
  color: #4caf50;
  font-weight: bold;
  font-size: 18px;
}
```

Ces exemples donnent une base solide pour commencer l'intégration frontend en JavaScript standard. Le backend gère toute la logique métier, le frontend n'a qu'à afficher l'état et envoyer les actions utilisateur ! 🚀

### Exemple d'utilisation avec Vanilla JS

```javascript
// main.js - Exemple d'intégration complète
import GameService from "./gameService.js";
import {
  getPyramidCardAt,
  canReplaceCard,
  getValidMoves,
} from "./gameUtils.js";

class RegicideGame {
  constructor() {
    this.gameService = new GameService();
    this.gameState = {
      phase: "waiting",
      players: [],
      currentPlayerIndex: 0,
      pyramid: null,
      mySessionId: "",
      selectedCard: null,
      validMoves: [],
    };
    this.room = null;
  }

  async init(pseudo) {
    try {
      this.room = await this.gameService.joinRoom(pseudo);
      this.setupEventListeners();
      this.gameState.mySessionId = this.room.sessionId;
      console.log("Connecté à la room !", this.room.sessionId);
    } catch (error) {
      console.error("Erreur de connexion:", error);
    }
  }

  setupEventListeners() {
    // État du jeu
    this.room.onStateChange((state) => {
      this.gameState = { ...this.gameState, ...state };
      this.updateUI();
    });

    // Messages du serveur
    this.room.onMessage("draft_started", (data) => {
      console.log("Draft commencé:", data);
      this.showDraftUI();
    });

    this.room.onMessage("turn_changed", (data) => {
      console.log("Nouveau tour:", data);
      this.updateTurnInfo(data);
    });

    this.room.onMessage("card_placed", (data) => {
      console.log("Carte placée:", data);
      this.updatePyramidDisplay();
    });

    this.room.onMessage("game_finished", (data) => {
      console.log("Partie terminée:", data);
      this.showGameResults(data);
    });

    this.room.onMessage("error", (data) => {
      console.error("Erreur du serveur:", data);
      this.showError(data.message);
    });
  }

  // Méthodes d'interface utilisateur
  updateUI() {
    switch (this.gameState.phase) {
      case "waiting":
        this.showLobby();
        break;
      case "drafting":
        this.showDraftUI();
        break;
      case "playing":
        this.showGameBoard();
        break;
      case "finished":
        this.showGameResults();
        break;
    }
  }

  // Actions du joueur
  toggleReady() {
    if (this.isPlayerReady()) {
      this.room.send("player_not_ready");
    } else {
      this.room.send("player_ready");
    }
  }

  selectDraftCard(cardId) {
    // Logique de sélection pour le draft
    const selectedCards = this.getSelectedDraftCards();
    const pickCount = this.getDraftPickCount();

    if (selectedCards.length === pickCount) {
      this.room.send("draft_cards", { cardIds: selectedCards });
    }
  }

  playCard(cardId, position) {
    const card = this.findCardInHand(cardId);
    const existingCard = getPyramidCardAt(this.gameState.pyramid, position);
    const action = existingCard ? "replace" : "place";

    this.room.send("play_card", {
      cardId,
      action,
      target: position,
    });
  }

  // Méthodes utilitaires
  isPlayerReady() {
    const myPlayer = this.gameState.players.find(
      (p) => p.sessionId === this.gameState.mySessionId
    );
    return myPlayer?.isReady || false;
  }

  isMyTurn() {
    const currentPlayer =
      this.gameState.players[this.gameState.currentPlayerIndex];
    return currentPlayer?.sessionId === this.gameState.mySessionId;
  }

  findCardInHand(cardId) {
    const myPlayer = this.gameState.players.find(
      (p) => p.sessionId === this.gameState.mySessionId
    );
    return myPlayer?.hand.find((card) => card.id === cardId);
  }
}

// Initialisation
const game = new RegicideGame();
game.init("MonPseudo");
```
