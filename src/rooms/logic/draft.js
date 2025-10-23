import { ArraySchema } from "@colyseus/schema";
import { CardService } from "../../services/CardService.js";
import { GAME_PHASES, CARD_TYPES } from "../../utils/GameConstants.js";
import { initializePyramid } from "./pyramid.js";

export function setupCards(room) {
  console.log("Setting up cards for", room.state.players.length, "players");
  const fullDeck = CardService.createDeck();
  const kings = fullDeck.filter(card => card.type === CARD_TYPES.KING);
  const nonKingCards = fullDeck.filter(card => card.type !== CARD_TYPES.KING);
  distributeSecretKings(room, kings);
  const shuffledCards = CardService.shuffleDeck([...nonKingCards]);
  initializePyramid(room);
  room.draftCards = shuffledCards;
  room.draftRound = 1;
  room.draftDirection = -1;
  console.log("Cards setup complete. Draft cards ready:", shuffledCards.length);
}

export function distributeSecretKings(room, kings) {
  const playerCount = room.state.players.length;
  const shuffledKings = CardService.shuffleDeck([...kings]);
  room.state.players.forEach((player, index) => {
    const king = shuffledKings[index];
    king.isVisible = false;
    player.secretKing = king;
    player.hand.push(king);
    player.handCount = player.hand.length;
    console.log(`${player.pseudo} received secret king of ${king.suit} (added to hand)`);
  });
  if (playerCount === 3) {
    const unusedKing = shuffledKings[3];
    const gameOptions = JSON.parse(room.state.gameOptions);
    gameOptions.excludedSuit = unusedKing.suit;
    room.state.gameOptions = JSON.stringify(gameOptions);
    console.log(`Excluded suit for 3-player game: ${unusedKing.suit}`);
  }
}

export function startDraftPhase(room) {
  console.log("Starting draft phase...");
  const playerCount = room.state.players.length;
  const cardsPerPack = playerCount === 3 ? 3 : 4; // 3 cartes pour 3 joueurs, 4 pour 4 joueurs
  const totalCardsNeeded = playerCount === 3 ? 16 * 3 : 12 * 4; // 16 cartes pour 3 joueurs, 12 pour 4 joueurs
  const packsPerRound = playerCount;
  const totalRounds = Math.ceil(totalCardsNeeded / (packsPerRound * cardsPerPack));
  // Expose total rounds and current round for clients
  room.state.totalDraftRounds = totalRounds;
  room.state.draftRound = room.draftRound;
  console.log(`Draft: ${totalRounds} rounds, ${cardsPerPack} cards per pack`);
  createDraftPacks(room);
  distributeDraftPacks(room);
  room.broadcast("draft_started", {
    round: room.draftRound,
    cardsPerPack: cardsPerPack,
    pickCount: 1, // Toujours 1 carte à choisir
    totalRounds: totalRounds
  });
}

export function createDraftPacks(room) {
  const playerCount = room.state.players.length;
  const cardsPerPack = playerCount === 3 ? 3 : 4; // 3 cartes pour 3 joueurs, 4 pour 4 joueurs
  
  room.draftPacks = [];
  for (let i = 0; i < playerCount; i++) {
    const pack = [];
    for (let j = 0; j < cardsPerPack; j++) {
      if (room.draftCards.length > 0) {
        pack.push(room.draftCards.pop());
      }
    }
    room.draftPacks.push(pack);
  }
  console.log(`Created ${room.draftPacks.length} draft packs for round ${room.draftRound}`);
}

export function distributeDraftPacks(room) {
  room.state.players.forEach((player, index) => {
    if (room.draftPacks[index]) {
      player.draftPack.splice(0, player.draftPack.length);
      room.draftPacks[index].forEach(card => {
        player.draftPack.push(card);
      });
      console.log(`Distributed pack to ${player.pseudo}: ${room.draftPacks[index].length} cards`);
    }
  });
  room.broadcast("draft_pack_received", {
    round: room.draftRound,
    pickCount: 1 // Toujours 1 carte à choisir
  });
}

export function handleLastDraftRound(room) {
  console.log("Handling last draft round for 3 players - automatic distribution");
  
  // Mélanger les 3 cartes restantes
  const lastCards = CardService.shuffleDeck([...room.draftCards]);
  
  // Distribuer automatiquement 1 carte à chaque joueur
  room.state.players.forEach((player, index) => {
    if (lastCards[index]) {
      player.hand.push(lastCards[index]);
      player.handCount = player.hand.length;
      console.log(`${player.pseudo} automatically received last card: ${lastCards[index].value} of ${lastCards[index].suit}`);
    }
  });
  
  // Vider le deck
  room.draftCards = [];
  
  // Notifier les joueurs que le dernier tour est automatique
  room.broadcast("last_draft_round_complete", {
    message: "Dernier tour : chaque joueur a reçu 1 carte automatiquement"
  });
  
  // Finaliser le draft immédiatement
  finalizeDraft(room);
}

export function handleDraftCards(room, client, message) {
  console.log("Draft cards:", client.sessionId, message);
  if (room.state.phase !== GAME_PHASES.DRAFTING) {
    client.send("error", { code: "NOT_DRAFTING_PHASE", message: "La phase de draft n'est pas active" });
    return;
  }
  const player = getPlayerBySessionId(room, client.sessionId);
  if (!player) {
    client.send("error", { code: "PLAYER_NOT_FOUND", message: "Joueur non trouvé" });
    return;
  }
  if (player.hasPicked) {
    client.send("error", { code: "ALREADY_PICKED", message: "Vous avez déjà choisi vos cartes ce tour" });
    return;
  }
  if (!message.cardIds || !Array.isArray(message.cardIds)) {
    client.send("error", { code: "INVALID_CARD_SELECTION", message: "Sélection de cartes invalide" });
    return;
  }
  const playerCount = room.state.players.length;
  const isFirstPick = player.draftPack.length === 4 || player.draftPack.length === 3;
  const expectedPickCount = getExpectedPickCount(playerCount, isFirstPick);
  if (message.cardIds.length !== expectedPickCount) {
    client.send("error", { code: "WRONG_PICK_COUNT", message: `Vous devez choisir exactement ${expectedPickCount} carte(s)` });
    return;
  }
  const playerPack = Array.from(player.draftPack);
  const selectedCards = [];
  for (const cardId of message.cardIds) {
    const card = playerPack.find(c => c.id === cardId);
    if (!card) {
      client.send("error", { code: "CARD_NOT_IN_PACK", message: "Carte non disponible dans votre paquet" });
      return;
    }
    selectedCards.push(card);
  }
  processDraftSelection(room, player, selectedCards, playerPack);
}

export function getExpectedPickCount(playerCount, isFirstPick) {
  // Toujours 1 carte à choisir, quel que soit le nombre de joueurs
  return 1;
}

export function processDraftSelection(room, player, selectedCards, playerPack) {
  console.log(`${player.pseudo} picked ${selectedCards.length} cards`);
  selectedCards.forEach(card => {
    player.hand.push(card);
  });
  const remainingCards = playerPack.filter(card => !selectedCards.some(selected => selected.id === card.id));
  room.pendingRemainingCards.set(player.sessionId, remainingCards);
  player.hasPicked = true;
  player.handCount = player.hand.length;
  player.draftPack.splice(0, player.draftPack.length);
  console.log(`${player.pseudo} now has ${player.hand.length} cards in final hand, ${remainingCards.length} cards pending redistribution`);
  checkAllPlayersHavePicked(room);
}

export function checkAllPlayersHavePicked(room) {
  const connectedPlayers = room.state.players.filter(p => p.isConnected);
  const playersWithDraftPacks = connectedPlayers.filter(p => p.draftPack.length > 0);
  const playersWhoNeedToPick = playersWithDraftPacks.filter(p => !p.hasPicked);
  const playersWithPendingCards = room.pendingRemainingCards.size;
  console.log(`Pick check: ${playersWhoNeedToPick.length} players still need to pick from ${playersWithDraftPacks.length} players with cards`);
  console.log(`Players with packs: ${playersWithDraftPacks.map(p => p.pseudo).join(', ')}`);
  console.log(`Players who need to pick: ${playersWhoNeedToPick.map(p => p.pseudo).join(', ')}`);
  console.log(`Players with pending cards: ${playersWithPendingCards}`);
  if (playersWhoNeedToPick.length === 0 && playersWithPendingCards > 0) {
    console.log("All players have picked and there are pending cards! Redistributing...");
    redistributeRemainingCards(room);
    return;
  }
  if (playersWithDraftPacks.length === 0 && playersWithPendingCards === 0) {
    console.log("No more cards anywhere, checking if round is complete...");
    checkDraftRoundComplete(room);
  }
}

export function redistributeRemainingCards(room) {
  console.log("Redistributing cards based on pending selections...");
  const connectedPlayers = room.state.players.filter(p => p.isConnected);
  const playersWithPendingCards = connectedPlayers.filter(p => room.pendingRemainingCards.has(p.sessionId));
  console.log(`Players with pending cards: ${playersWithPendingCards.length}/${connectedPlayers.length}`);
  if (playersWithPendingCards.length !== connectedPlayers.length) {
    console.log("Not all players have pending cards yet, waiting...");
    return;
  }
  let cardsRedistributed = false;
  connectedPlayers.forEach((player, index) => {
    const remainingCards = room.pendingRemainingCards.get(player.sessionId);
    console.log(`Processing player ${player.pseudo} (index ${index})`);
    if (remainingCards && remainingCards.length > 0) {
      cardsRedistributed = true;
      const nextPlayerIndex = (index + room.draftDirection + connectedPlayers.length) % connectedPlayers.length;
      const nextPlayer = connectedPlayers[nextPlayerIndex];
      console.log(`Player order for redistribution:`);
      connectedPlayers.forEach((p, i) => {
        console.log(`  Index ${i}: ${p.pseudo} (${p.sessionId})`);
      });
      console.log(`${player.pseudo} (index ${index}) gives cards to ${nextPlayer.pseudo} (index ${nextPlayerIndex})`);
      console.log(`Direction: ${room.draftDirection}, calculation: (${index} + ${room.draftDirection} + ${connectedPlayers.length}) % ${connectedPlayers.length} = ${nextPlayerIndex}`);
      if (!nextPlayer.draftPack) {
        nextPlayer.draftPack = new ArraySchema();
      }
      nextPlayer.draftPack.splice(0, nextPlayer.draftPack.length);
      remainingCards.forEach(card => {
        nextPlayer.draftPack.push(card);
      });
      nextPlayer.hasPicked = false;
      console.log(`Redistributed ${remainingCards.length} cards from ${player.pseudo} to ${nextPlayer.pseudo}`);
      const nextClient = room.clients.find(c => c.sessionId === nextPlayer.sessionId);
      if (nextClient) {
        nextClient.send("draft_pack_received", {
          round: room.draftRound,
          cardsCount: remainingCards.length,
          pickCount: 1 // Toujours 1 carte
        });
      }
    }
  });
  room.pendingRemainingCards.clear();
  if (cardsRedistributed) {
    console.log("Redistribution complete, players can now pick again");
  } else {
    console.log("No cards to redistribute, checking if round is complete");
    checkDraftRoundComplete(room);
  }
}

export function passDraftPack(room, fromPlayer, remainingCards) {
  const playerIndex = room.state.players.findIndex(p => p.sessionId === fromPlayer.sessionId);
  const nextPlayerIndex = (playerIndex + room.draftDirection + room.state.players.length) % room.state.players.length;
  const nextPlayer = room.state.players[nextPlayerIndex];
  if (!nextPlayer.draftPack) {
    nextPlayer.draftPack = new ArraySchema();
  }
  nextPlayer.draftPack.splice(0, nextPlayer.draftPack.length);
  remainingCards.forEach(card => {
    nextPlayer.draftPack.push(card);
  });
  nextPlayer.hasPicked = false;
  console.log(`Pack passed from ${fromPlayer.pseudo} to ${nextPlayer.pseudo} (${remainingCards.length} cards)`);
  const nextClient = room.clients.find(c => c.sessionId === nextPlayer.sessionId);
  if (nextClient) {
    nextClient.send("draft_pack_received", {
      round: room.draftRound,
      cardsCount: remainingCards.length,
      pickCount: 1 // Toujours 1 carte
    });
  }
}

export function checkDraftRoundComplete(room) {
  const playersWithCards = room.state.players.filter(p => p.draftPack.length > 0);
  const playersWhoCanPick = room.state.players.filter(p => p.draftPack.length > 0 && !p.hasPicked);
  console.log(`Draft round check: ${playersWithCards.length} players with cards, ${playersWhoCanPick.length} can still pick`);
  const playersWithPendingCards = room.pendingRemainingCards.size;
  console.log(`Pending cards from ${playersWithPendingCards} players`);
  if (playersWithCards.length === 0 && playersWithPendingCards === 0) {
    console.log("Draft round truly complete - no cards left anywhere");
    completeDraftRound(room);
  } else {
    console.log("Draft round continues - cards still in circulation");
  }
}

export function completeDraftRound(room) {
  console.log(`Draft round ${room.draftRound} complete`);
  room.state.players.forEach(player => {
    player.hasPicked = false;
    player.draftPack.splice(0, player.draftPack.length);
  });
  room.pendingRemainingCards.clear();
  
  // Pour 3 joueurs : vérifier s'il reste exactement 3 cartes pour le dernier tour
  const playerCount = room.state.players.length;
  if (playerCount === 3 && room.draftCards.length === 3) {
    console.log("Last draft round detected - 3 cards remaining");
    handleLastDraftRound(room);
    return;
  }
  
  if (isDraftComplete(room)) {
    finalizeDraft(room);
  } else {
    startNextDraftRound(room);
  }
}

export function isDraftComplete(room) {
  const playerCount = room.state.players.length;
  // 3 joueurs : 16 cartes draftées + 1 Roi = 17 cartes
  // 4 joueurs : 12 cartes draftées + 1 Roi = 13 cartes
  const targetHandSize = playerCount === 3 ? 17 : 13;
  
  console.log(`Draft completion check:`);
  room.state.players.forEach(player => {
    console.log(`  ${player.pseudo}: ${player.hand.length} cards (target: ${targetHandSize})`);
  });
  console.log(`  Cards remaining in deck: ${room.draftCards.length}`);
  
  const allPlayersHaveEnoughCards = room.state.players.every(player => player.hand.length >= targetHandSize);
  const cardsPerPack = playerCount === 3 ? 3 : 4;
  const noMoreCards = room.draftCards.length < (playerCount * cardsPerPack);
  
  console.log(`  All players have enough cards: ${allPlayersHaveEnoughCards}`);
  console.log(`  No more cards for complete packs: ${noMoreCards}`);
  
  return allPlayersHaveEnoughCards || noMoreCards;
}

export function startNextDraftRound(room) {
  room.draftRound++;
  console.log(`Starting draft round ${room.draftRound}`);
  createDraftPacks(room);
  distributeDraftPacks(room);
}

export function finalizeDraft(room) {
  console.log("Draft phase complete! Verifying final hand counts...");
  
  const playerCount = room.state.players.length;
  const expectedHandSize = playerCount === 3 ? 17 : 13;
  
  // Vérifier que chaque joueur a le bon nombre de cartes
  let allPlayersValid = true;
  room.state.players.forEach(player => {
    const actualHandSize = player.hand.length;
    console.log(`${player.pseudo} final hand: ${actualHandSize} cards (expected: ${expectedHandSize})`);
    
    if (actualHandSize !== expectedHandSize) {
      console.error(`⚠️ WARNING: ${player.pseudo} has ${actualHandSize} cards instead of ${expectedHandSize}!`);
      allPlayersValid = false;
    }
  });
  
  if (!allPlayersValid) {
    console.error("⚠️ Draft completed with incorrect hand sizes!");
  } else {
    console.log("✓ All players have the correct number of cards");
  }
  
  room.state.phase = GAME_PHASES.PLAYING;
  room.state.currentPlayerIndex = 0;
  room.state.discardPile = new ArraySchema();
  room.broadcast("draft_complete", {
    message: "Phase de draft terminée, la partie commence !",
    currentPlayer: room.state.players[0]?.sessionId
  });
  console.log("Game phase started! Current player:", room.state.players[0]?.pseudo);
}

export function skipToPlayingPhase(room) {
  console.log("DEBUG MODE: Skipping to playing phase with random hands");
  const playerCount = room.state.players.length;
  const cardsToAdd = playerCount === 3 ? 16 : 12; // 16 pour 3 joueurs, 12 pour 4 joueurs
  
  room.state.players.forEach(player => {
    for (let i = 0; i < cardsToAdd && room.draftCards.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * room.draftCards.length);
      const card = room.draftCards.splice(randomIndex, 1)[0];
      player.hand.push(card);
    }
    player.handCount = player.hand.length;
    console.log(`DEBUG: ${player.pseudo} has ${player.hand.length} cards (including secret king)`);
  });
  room.state.phase = GAME_PHASES.PLAYING;
  room.state.currentPlayerIndex = 0;
  room.state.turn = 1;
  room.state.discardPile = new ArraySchema();
  if (room.state.players.length > 0) {
    room.broadcast("draft_complete", {
      message: "DEBUG MODE: Phase de draft sautée, la partie commence !",
      currentPlayer: room.state.players[0].sessionId
    });
    console.log("DEBUG: Game phase started! Current player:", room.state.players[0].pseudo);
  } else {
    console.log("DEBUG: No players available for game start notification");
  }
}

function getPlayerBySessionId(room, sessionId) {
  return room.state.players.find(p => p.sessionId === sessionId);
}
