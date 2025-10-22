import { ArraySchema } from "@colyseus/schema";
import { CardService } from "../../services/CardService.js";
import { GAME_PHASES, CARD_TYPES } from "../../utils/GameConstants.js";
import { getCardAt, setCardAt, isValidPosition, getPyramidRow } from "./pyramid.js";

export function handlePlayCard(room, client, message) {
  console.log("Play card:", client.sessionId, message);
  if (room.state.phase !== GAME_PHASES.PLAYING) {
    client.send("error", { code: "GAME_NOT_PLAYING", message: "La partie n'est pas en cours" });
    return;
  }
  if (!isPlayerTurn(room, client.sessionId)) {
    client.send("error", { code: "NOT_YOUR_TURN", message: "Ce n'est pas votre tour" });
    return;
  }
  const player = getPlayerBySessionId(room, client.sessionId);
  if (!player) {
    client.send("error", { code: "PLAYER_NOT_FOUND", message: "Joueur non trouvé" });
    return;
  }
  if (!message.cardId || !message.action || !message.target) {
    client.send("error", { code: "INVALID_PLAY_MESSAGE", message: "Message de jeu invalide" });
    return;
  }
  const cardToPlay = player.hand.find(card => card.id === message.cardId);
  if (!cardToPlay) {
    client.send("error", { code: "CARD_NOT_IN_HAND", message: "Cette carte n'est pas dans votre main" });
    return;
  }
  let actionResult = false;
  try {
    switch (message.action) {
      case "place":
        actionResult = handlePlaceCard(room, cardToPlay, message.target, player);
        break;
      case "replace":
        actionResult = handleReplaceCard(room, cardToPlay, message.target, player);
        break;
      case "special_power":
        actionResult = handleSpecialPowerCard(room, cardToPlay, message.target, player);
        break;
      default:
        client.send("error", { code: "INVALID_ACTION", message: "Action invalide" });
        return;
    }
  } catch (error) {
    console.error("Error handling play card:", error);
    client.send("error", { code: "PLAY_CARD_ERROR", message: "Erreur lors du jeu de la carte" });
    return;
  }
  if (actionResult) {
    finalizePlayerTurn(room, player, cardToPlay);
  }
}

export function handlePlaceCard(room, card, target, player) {
  const { row, col } = target;
  if (!isValidPosition(room, row, col)) {
    player.sessionId && room.clients.find(c => c.sessionId === player.sessionId)?.send("error", { code: "INVALID_POSITION", message: "Position invalide sur la pyramide" });
    return false;
  }
  const existingCard = getCardAt(room, row, col);
  if (existingCard && !existingCard.isEmpty) {
    player.sessionId && room.clients.find(c => c.sessionId === player.sessionId)?.send("error", { code: "POSITION_OCCUPIED", message: "Cet emplacement est déjà occupé" });
    return false;
  }
  if (!canPlaceCardAt(room, card, row, col)) {
    player.sessionId && room.clients.find(c => c.sessionId === player.sessionId)?.send("error", { code: "INVALID_PLACEMENT", message: "Placement invalide selon les règles" });
    return false;
  }
  setCardAt(room, row, col, card);
  console.log(`${player.pseudo} placed ${card.value} of ${card.suit} at (${row},${col})`);
  room.broadcast("card_placed", {
    playerSessionId: player.sessionId,
    pseudo: player.pseudo,
    card: { id: card.id, value: card.value, suit: card.suit, type: card.type },
    position: { row, col }
  });
  return true;
}

export function canPlaceCardAt(room, card, row, col) {
  if (row === 1) {
    return true;
  }
  const leftSupportCol = col;
  const rightSupportCol = col + 1;
  const leftSupport = getCardAt(room, row - 1, leftSupportCol);
  const rightSupport = getCardAt(room, row - 1, rightSupportCol);
  const hasValidSupport =
    (leftSupport && !leftSupport.isEmpty && leftSupport.suit === card.suit) ||
    (rightSupport && !rightSupport.isEmpty && rightSupport.suit === card.suit);
  return hasValidSupport;
}

export function handleReplaceCard(room, card, target, player) {
  const { row, col } = target;
  const rowArray = getPyramidRow(room, row);
  if (!rowArray || col < 0 || col >= rowArray.length) {
    player.sessionId && room.clients.find(c => c.sessionId === player.sessionId)?.send("error", { code: "INVALID_POSITION", message: "Position invalide sur la pyramide" });
    return false;
  }
  const existingCard = getCardAt(room, row, col);
  if (!existingCard || existingCard.isEmpty) {
    player.sessionId && room.clients.find(c => c.sessionId === player.sessionId)?.send("error", { code: "NO_CARD_TO_REPLACE", message: "Aucune carte à remplacer à cette position" });
    return false;
  }
  if (row === 1 && card.value < existingCard.value) {
    player.sessionId && room.clients.find(c => c.sessionId === player.sessionId)?.send("error", { code: "CANNOT_REPLACE_CARD", message: "La valeur doit être égale ou supérieure pour remplacer sur la base" });
    return false;
  }
  if (row > 1 && !CardService.canReplaceCard(card, existingCard)) {
    player.sessionId && room.clients.find(c => c.sessionId === player.sessionId)?.send("error", { code: "CANNOT_REPLACE_CARD", message: "Cette carte ne peut pas remplacer la carte existante" });
    return false;
  }
  room.state.discardPile.push(existingCard);
  setCardAt(room, row, col, card);
  console.log(`${player.pseudo} replaced ${existingCard.value} of ${existingCard.suit} with ${card.value} of ${card.suit} at (${row},${col})`);
  room.broadcast("card_replaced", {
    playerSessionId: player.sessionId,
    pseudo: player.pseudo,
    newCard: { id: card.id, value: card.value, suit: card.suit, type: card.type },
    replacedCard: { id: existingCard.id, value: existingCard.value, suit: existingCard.suit, type: existingCard.type },
    position: { row, col }
  });
  return true;
}

export function handleSpecialPowerCard(room, card, target, player) {
  let placementSuccess = false;
  if (target.baseAction === "place") {
    placementSuccess = handlePlaceCard(room, card, target, player);
  } else if (target.baseAction === "replace") {
    placementSuccess = handleReplaceCard(room, card, target, player);
  } else {
    player.sessionId && room.clients.find(c => c.sessionId === player.sessionId)?.send("error", { code: "INVALID_BASE_ACTION", message: "Action de base invalide pour le pouvoir spécial" });
    return false;
  }
  if (!placementSuccess) {
    return false;
  }
  switch (card.type) {
    case CARD_TYPES.QUEEN:
      return handleQueenPower(room, target, player);
    case CARD_TYPES.JACK:
      return handleJackPower(room, target, player);
    case CARD_TYPES.ACE:
      console.log(`${player.pseudo} played an Ace with special hierarchy`);
      return true;
    case CARD_TYPES.KING:
      console.log(`${player.pseudo} played a King (no special power)`);
      return true;
    default:
      player.sessionId && room.clients.find(c => c.sessionId === player.sessionId)?.send("error", { code: "NOT_SPECIAL_CARD", message: "Cette carte n'a pas de pouvoir spécial" });
      return false;
  }
}

export function handleQueenPower(room, target, player) {
  if (!target.exchangeTargets || target.exchangeTargets.length !== 2) {
    player.sessionId && room.clients.find(c => c.sessionId === player.sessionId)?.send("error", { code: "INVALID_QUEEN_TARGETS", message: "La Dame nécessite exactement 2 cartes à échanger" });
    return false;
  }
  const pos1 = target.exchangeTargets[0];
  const pos2 = target.exchangeTargets[1];
  const card1 = getCardAt(room, pos1.row, pos1.col);
  const card2 = getCardAt(room, pos2.row, pos2.col);
  if (!card1 || !card2 || card1.isEmpty || card2.isEmpty) {
    player.sessionId && room.clients.find(c => c.sessionId === player.sessionId)?.send("error", { code: "INVALID_EXCHANGE_CARDS", message: "Les deux positions doivent contenir des cartes valides" });
    return false;
  }
  setCardAt(room, pos1.row, pos1.col, card2);
  setCardAt(room, pos2.row, pos2.col, card1);
  console.log(`${player.pseudo} used Queen power: exchanged ${card1.value} of ${card1.suit} at (${pos1.row},${pos1.col}) with ${card2.value} of ${card2.suit} at (${pos2.row},${pos2.col})`);
  room.broadcast("queen_power_used", { playerSessionId: player.sessionId, pseudo: player.pseudo, exchangedPositions: [pos1, pos2] });
  return true;
}

export function handleJackPower(room, target, player) {
  if (!target.giveCardId || !target.targetPlayerId) {
    player.sessionId && room.clients.find(c => c.sessionId === player.sessionId)?.send("error", { code: "INVALID_JACK_TARGETS", message: "Le Valet nécessite une carte à donner et un joueur cible" });
    return false;
  }
  const targetPlayer = getPlayerBySessionId(room, target.targetPlayerId);
  if (!targetPlayer) {
    player.sessionId && room.clients.find(c => c.sessionId === player.sessionId)?.send("error", { code: "TARGET_PLAYER_NOT_FOUND", message: "Joueur cible non trouvé" });
    return false;
  }
  const cardToGive = player.hand.find(c => c.id === target.giveCardId);
  if (!cardToGive) {
    player.sessionId && room.clients.find(c => c.sessionId === player.sessionId)?.send("error", { code: "CARD_TO_GIVE_NOT_FOUND", message: "Carte à donner non trouvée dans votre main" });
    return false;
  }
  if (targetPlayer.hand.length === 0) {
    player.sessionId && room.clients.find(c => c.sessionId === player.sessionId)?.send("error", { code: "TARGET_HAND_EMPTY", message: "Le joueur cible n'a pas de cartes" });
    return false;
  }
  const cardIndex = player.hand.findIndex(c => c.id === target.giveCardId);
  player.hand.splice(cardIndex, 1);
  targetPlayer.hand.push(cardToGive);
  const possibleCards = targetPlayer.hand.filter(c => c.id !== cardToGive.id);
  if (possibleCards.length === 0) {
    return true;
  }
  const randomIndex = Math.floor(Math.random() * possibleCards.length);
  const receivedCard = possibleCards[randomIndex];
  const receivedCardIndex = targetPlayer.hand.findIndex(c => c.id === receivedCard.id);
  targetPlayer.hand.splice(receivedCardIndex, 1);
  player.hand.push(receivedCard);
  player.handCount = player.hand.length;
  targetPlayer.handCount = targetPlayer.hand.length;
  console.log(`${player.pseudo} used Jack power: gave card to ${targetPlayer.pseudo} and received a random card`);
  room.broadcast("jack_power_used", {
    playerSessionId: player.sessionId,
    pseudo: player.pseudo,
    targetPlayerSessionId: targetPlayer.sessionId,
    targetPseudo: targetPlayer.pseudo
  });
  return true;
}

export function finalizePlayerTurn(room, player, playedCard) {
  const cardIndex = player.hand.findIndex(c => c.id === playedCard.id);
  if (cardIndex !== -1) {
    player.hand.splice(cardIndex, 1);
    player.handCount = player.hand.length;
  }
  console.log(`${player.pseudo} played a card. Remaining cards: ${player.hand.length}`);
  room.state.lastActivity = Date.now();
  if (!room.testMode && checkGameEnd(room)) {
    return;
  }
  nextPlayer(room);
}

export function isPlayerTurn(room, sessionId) {
  const currentPlayer = room.state.players[room.state.currentPlayerIndex];
  return currentPlayer && currentPlayer.sessionId === sessionId;
}

export function nextPlayer(room) {
  const connectedPlayers = room.state.players.filter(p => p.isConnected);
  if (connectedPlayers.length === 0) {
    endGame(room, "Aucun joueur connecté");
    return;
  }
  let attempts = 0;
  do {
    room.state.currentPlayerIndex = (room.state.currentPlayerIndex + 1) % room.state.players.length;
    attempts++;
  } while (!room.state.players[room.state.currentPlayerIndex].isConnected && attempts < room.state.players.length);
  room.state.turn++;
  const currentPlayer = room.state.players[room.state.currentPlayerIndex];
  console.log(`Turn ${room.state.turn}: ${currentPlayer.pseudo}'s turn`);
  room.broadcast("turn_changed", {
    currentPlayerSessionId: currentPlayer.sessionId,
    currentPseudo: currentPlayer.pseudo,
    turn: room.state.turn
  });
}

export function checkGameEnd(room) {
  const allHandsEmpty = room.state.players.every(p => p.hand.length === 0);
  if (allHandsEmpty) {
    console.log("Game ending: all players have empty hands");
    endGameAndCalculateScores(room);
    return true;
  }
  const playersWhoCanPlay = room.state.players.filter(p => p.isConnected && p.hand.length > 0 && canPlayerPlay(room, p));
  if (playersWhoCanPlay.length <= 1) {
    console.log("Game ending: only one player can play");
    endGameAndCalculateScores(room);
    return true;
  }
  return false;
}

export function canPlayerPlay(room, player) {
  return player.hand.some(card => {
    for (let row = 1; row <= 4; row++) {
      const rowArray = getPyramidRow(room, row);
      if (!rowArray) continue;
      for (let col = 0; col < rowArray.length; col++) {
        const existingCard = getCardAt(room, row, col);
        if ((!existingCard || existingCard.isEmpty) && canPlaceCardAt(room, card, row, col)) {
          return true;
        }
        if (existingCard && !existingCard.isEmpty && CardService.canReplaceCard(card, existingCard)) {
          return true;
        }
      }
    }
    return false;
  });
}

export function endGameAndCalculateScores(room) {
  console.log("Calculating final scores...");
  room.state.players.forEach(player => {
    if (player) {
      player.score = calculatePlayerScore(room, player);
      console.log(`${player.pseudo} final score: ${player.score}`);
    }
  });
  const validPlayers = Array.from(room.state.players).filter(p => p && typeof p.score === 'number');
  if (validPlayers.length === 0) {
    console.log("No valid players to determine winner");
    room.state.phase = GAME_PHASES.FINISHED;
    return;
  }
  const winner = validPlayers.reduce((prev, current) => (prev.score > current.score) ? prev : current);
  room.state.winner = winner.sessionId;
  room.state.phase = GAME_PHASES.FINISHED;
  console.log(`Game finished! Winner: ${winner.pseudo} with ${winner.score} points`);
  room.broadcast("game_finished", {
    winner: { sessionId: winner.sessionId, pseudo: winner.pseudo, score: winner.score },
    finalScores: room.state.players.map(p => ({
      sessionId: p.sessionId,
      pseudo: p.pseudo,
      score: p.score,
      secretKing: { suit: p.secretKing.suit, value: p.secretKing.value }
    }))
  });
}

export function calculatePlayerScore(room, player) {
  if (!player.secretKing) return 0;
  const playerSuit = player.secretKing.suit;
  let totalScore = 0;
  for (let row = 1; row <= 4; row++) {
    const rowArray = getPyramidRow(room, row);
    if (!rowArray) continue;
    const multiplier = row;
    for (let col = 0; col < rowArray.length; col++) {
      const card = getCardAt(room, row, col);
      if (card && card.suit === playerSuit) {
        totalScore += card.value * multiplier;
      }
    }
  }
  const gameOptions = JSON.parse(room.state.gameOptions);
  if (gameOptions.excludedSuit === playerSuit) {
    console.log(`${player.pseudo}'s suit (${playerSuit}) is excluded in 3-player game`);
    return 0;
  }
  return totalScore;
}

export function endGame(room, reason) {
  room.state.phase = GAME_PHASES.FINISHED;
  console.log("Game ended:", reason);
  room.broadcast("game_ended", { reason });
}

function getPlayerBySessionId(room, sessionId) {
  return room.state.players.find(p => p.sessionId === sessionId);
}
