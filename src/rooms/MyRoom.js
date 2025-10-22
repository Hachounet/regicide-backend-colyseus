import { Room } from "@colyseus/core";
import { RegicideState } from "./schema/RegicideState.js";
import { Player } from "./schema/Player.js";
import { Pyramid } from "./schema/Pyramid.js";
import { Card } from "./schema/Card.js";
import { CardService } from "../services/CardService.js";
import { GAME_PHASES, SUITS, CARD_TYPES, PYRAMID_STRUCTURE } from "../utils/GameConstants.js";
import { ArraySchema } from "@colyseus/schema";
// Logique modularisée
import {
  setupMessageHandlers as setupLobbyHandlers,
  checkInactivity as lobbyCheckInactivity,
  kickNotReadyPlayers as lobbyKickNotReadyPlayers
} from "./logic/lobby.js";
import {
  setupCards as draftSetupCards,
  startDraftPhase as draftStartDraftPhase,
  handleDraftCards as draftHandleDraftCards,
  skipToPlayingPhase as draftSkipToPlayingPhase
} from "./logic/draft.js";
import { handlePlayCard as gameplayHandlePlayCard, checkGameEnd, endGameAndCalculateScores, canPlayerPlay } from "./logic/gameplay.js";

export class RegicideRoom extends Room {
  maxClients = 4;
  minClients = 3;
  state = new RegicideState();
  
  // Variables pour le draft
  draftCards = [];        // Cartes disponibles pour le draft
  draftRound = 0;         // Tour de draft actuel
  draftDirection = -1;    // Direction du passage des cartes (-1 = sens anti-horaire/vers la gauche, 1 = sens horaire/vers la droite)
  draftPacks = [];        // Paquets de cartes en cours de draft
  pendingRemainingCards = new Map(); // Stockage temporaire des cartes restantes par joueur

  onCreate (options) {
    console.log("RegicideRoom created with options:", options);
    
    // Initialiser l'état du jeu
    this.state.phase = GAME_PHASES.WAITING;
    this.state.currentPlayerIndex = 0;
    this.state.turn = 0;
    this.state.gameOptions = JSON.stringify({
      playerCount: options.playerCount || 4,
      isPrivate: options.isPrivate || false,
      roomCode: options.roomCode || null
    });
    this.state.createdAt = Date.now();
    this.state.lastActivity = Date.now();

  // Messages handlers
  this.setupMessageHandlers();

    // Timer pour nettoyer les rooms inactives
    this.setSimulationInterval(() => lobbyCheckInactivity(this), 30000); // 30s

    // Timer pour retirer les joueurs non ready après 60s
    this.setSimulationInterval(() => lobbyKickNotReadyPlayers(this), 5000); // vérif toutes les 5s
  }

  onJoin (client, options) {
    console.log(client.sessionId, "joined RegicideRoom!");
    
    // Créer le joueur
    const player = new Player();
    player.sessionId = client.sessionId;
    player.pseudo = options.pseudo || `Player${this.state.players.length + 1}`;
    player.isConnected = true;
    player.isReady = false;
    player.score = 0;
    player.handCount = 0;
    player.hasPicked = false;
    player.joinedAt = Date.now();

    // Ajouter à l'état
    this.state.players.push(player);
    this.state.lastActivity = Date.now();

    // Vérifier si on peut démarrer la partie
    this.checkGameStart();
  }

  onLeave (client, consented) {
    console.log(client.sessionId, "left RegicideRoom!");
    
    const playerIndex = this.state.players.findIndex(p => p.sessionId === client.sessionId);
    if (playerIndex !== -1) {
      if (this.state.phase === GAME_PHASES.WAITING) {
        // En attente : retirer le joueur (ready ou non)
        this.state.players.splice(playerIndex, 1);
        this.state.lastActivity = Date.now();
        // On peut accepter un nouveau joueur à la place
      } else {
        // En jeu : marquer comme déconnecté
        this.state.players[playerIndex].isConnected = false;
        // Vérifier si la partie peut continuer
        this.checkGameContinuation();
      }
    }
  }

  onDispose() {
    console.log("RegicideRoom", this.roomId, "disposing...");
  }

  // ==========================================
  // CONFIGURATION DES MESSAGE HANDLERS
  // ==========================================

  setupMessageHandlers() {
    // Lobby (ready/not ready + chat)
    setupLobbyHandlers(this);

    // Jouer une carte (gameplay)
    this.onMessage("play_card", (client, message) => {
      gameplayHandlePlayCard(this, client, message);
    });

    // Utiliser un pouvoir spécial (placeholder)
    this.onMessage("use_special_power", (client, message) => {
      this.handleSpecialPower(client, message);
    });

    // Échange de cartes (draft)
    this.onMessage("draft_cards", (client, message) => {
      draftHandleDraftCards(this, client, message);
    });

    // Passer son tour
    this.onMessage("pass_turn", (client, message) => {
      // Vérifier que la partie est en cours
      if (this.state.phase !== GAME_PHASES.PLAYING) {
        client.send("error", { code: "GAME_NOT_PLAYING", message: "La partie n'est pas en cours" });
        return;
      }
      // Vérifier que c'est le tour du joueur
      if (!this.isPlayerTurn(client.sessionId)) {
        client.send("error", { code: "NOT_YOUR_TURN", message: "Ce n'est pas votre tour" });
        return;
      }
      // Vérifier s'il ne peut vraiment rien jouer
      const player = this.getPlayerBySessionId(client.sessionId);
      if (!player) {
        client.send("error", { code: "PLAYER_NOT_FOUND", message: "Joueur non trouvé" });
        return;
      }
      if (canPlayerPlay(this, player)) {
        client.send("error", { code: "CAN_STILL_PLAY", message: "Vous pouvez encore jouer une carte" });
        return;
      }
      // Passer au joueur suivant
      this.nextPlayer();
      // Vérifier la fin de partie après le passage
      checkGameEnd(this);
    });
  }

  // ==========================================
  // CYCLE DE VIE DU JEU
  // ==========================================

  checkGameStart() {
    if (this.state.phase !== GAME_PHASES.WAITING) return;

    const connectedPlayers = this.getConnectedPlayersCount();
    const readyPlayers = this.getReadyPlayersCount();
    const gameOptions = JSON.parse(this.state.gameOptions);
    const targetPlayerCount = gameOptions.playerCount;

    // Démarrer uniquement si on a exactement le bon nombre de joueurs et tous sont prêts
    if (connectedPlayers === targetPlayerCount && readyPlayers === connectedPlayers) {
      // Randomiser le joueur de départ
      this.state.currentPlayerIndex = Math.floor(Math.random() * this.state.players.length);
      console.log(`Tous les joueurs sont prêts ! Joueur de départ randomisé : ${this.state.players[this.state.currentPlayerIndex].pseudo}`);
      this.startGame();
    } else {
      // Informer les joueurs du statut
      this.broadcast("waiting_for_players", {
        readyCount: readyPlayers,
        totalCount: connectedPlayers,
        targetCount: targetPlayerCount,
        minRequired: this.minClients,
        maxAllowed: this.maxClients
      });
    }
  }
  // Timeout pour retirer les joueurs non ready après 60s
  kickNotReadyPlayers() {
    if (this.state.phase !== GAME_PHASES.WAITING) return;
    const now = Date.now();
    // On retire les joueurs non ready depuis plus de 60s
    this.state.players = this.state.players.filter(player => {
      if (!player.isReady && now - player.joinedAt > 60000) {
        console.log(`Joueur ${player.pseudo} retiré pour inactivité (non ready > 60s)`);
        return false;
      }
      return true;
    });
  }

  startGame() {
    console.log("Starting Regicide game with", this.state.players.length, "players");
    
  // Créer et distribuer les cartes
  draftSetupCards(this);
    
    // Mode debug : skip draft et aller directement au jeu
    if (this.skipDraft) {
      console.log("DEBUG MODE: Skipping draft phase, going directly to PLAYING");
      draftSkipToPlayingPhase(this);
    } else {
      this.state.phase = GAME_PHASES.DRAFTING;
      this.state.turn = 1;
      // Démarrer le draft
      draftStartDraftPhase(this);
    }
  }

  checkGameContinuation() {
    const connectedPlayers = this.state.players.filter(p => p.isConnected).length;
    
    if (connectedPlayers < 2) {
      // Pas assez de joueurs, terminer la partie
      this.endGame("Pas assez de joueurs connectés");
    }
  }

  checkInactivity() {
    // délégué au module lobby (timer déjà branché), conservé pour compat
    // laissé vide intentionnellement
  }

  // ==========================================
  // HELPERS
  // ==========================================

  getPlayerPseudo(sessionId) {
    const player = this.state.players.find(p => p.sessionId === sessionId);
    return player ? player.pseudo : "Unknown";
  }

  getCurrentPlayer() {
    return this.state.players[this.state.currentPlayerIndex];
  }

  isPlayerTurn(sessionId) {
    const currentPlayer = this.getCurrentPlayer();
    return currentPlayer && currentPlayer.sessionId === sessionId;
  }

  getConnectedPlayersCount() {
    return this.state.players.filter(p => p.isConnected).length;
  }

  getReadyPlayersCount() {
    return this.state.players.filter(p => p.isReady && p.isConnected).length;
  }

  getPlayerBySessionId(sessionId) {
    return this.state.players.find(p => p.sessionId === sessionId);
  }

  // ==========================================
  // PLACEHOLDERS POUR LES PROCHAINES PHASES
  // ==========================================

  setupCards() {
    console.log("Setting up cards for", this.state.players.length, "players");
    
    // 1. Créer le deck complet
    const fullDeck = CardService.createDeck();
    
    // 2. Séparer les Rois du reste
    const kings = fullDeck.filter(card => card.type === CARD_TYPES.KING);
    const nonKingCards = fullDeck.filter(card => card.type !== CARD_TYPES.KING);
    
    // 3. Distribuer les Rois secrets
    this.distributeSecretKings(kings);
    
    // 4. Préparer les cartes pour le draft
    const shuffledCards = CardService.shuffleDeck([...nonKingCards]);
    
    // 5. Initialiser la pyramide vide
    this.initializePyramid();
    
    // 6. Stocker les cartes pour le draft
    this.draftCards = shuffledCards;
    this.draftRound = 1;
    this.draftDirection = -1; // -1 = vers la gauche, 1 = vers la droite
    
    console.log("Cards setup complete. Draft cards ready:", shuffledCards.length);
  }

  distributeSecretKings(kings) {
    const playerCount = this.state.players.length;
    const shuffledKings = CardService.shuffleDeck([...kings]);
    
    // Distribuer les rois directement dans les mains des joueurs
    this.state.players.forEach((player, index) => {
      const king = shuffledKings[index];
      king.isVisible = false; // Masquer le roi secret
      player.secretKing = king;
      
      // Ajouter le roi directement dans la main du joueur
      player.hand.push(king);
      player.handCount = player.hand.length;
      
      console.log(`${player.pseudo} received secret king of ${king.suit} (added to hand)`);
    });
    
    // Pour 3 joueurs : marquer la famille non utilisée
    if (playerCount === 3) {
      const unusedKing = shuffledKings[3];
      const gameOptions = JSON.parse(this.state.gameOptions);
      gameOptions.excludedSuit = unusedKing.suit;
      this.state.gameOptions = JSON.stringify(gameOptions);
      
      console.log(`Excluded suit for 3-player game: ${unusedKing.suit}`);
    }
  }

  initializePyramid() {
    this.state.pyramid = new Pyramid();
    
    // Remplir avec des emplacements vides (Card avec isEmpty=true)
    for (let i = 0; i < PYRAMID_STRUCTURE.ROW1; i++) {
      const emptyCard = new Card();
      emptyCard.isEmpty = true;
      emptyCard.id = `empty_${i}`;
      this.state.pyramid.row1.push(emptyCard);
    }
    for (let i = 0; i < PYRAMID_STRUCTURE.ROW2; i++) {
      const emptyCard = new Card();
      emptyCard.isEmpty = true;
      emptyCard.id = `empty_r2_${i}`;
      this.state.pyramid.row2.push(emptyCard);
    }
    for (let i = 0; i < PYRAMID_STRUCTURE.ROW3; i++) {
      const emptyCard = new Card();
      emptyCard.isEmpty = true;
      emptyCard.id = `empty_r3_${i}`;
      this.state.pyramid.row3.push(emptyCard);
    }
    for (let i = 0; i < PYRAMID_STRUCTURE.ROW4; i++) {
      const emptyCard = new Card();
      emptyCard.isEmpty = true;
      emptyCard.id = `empty_r4_${i}`;
      this.state.pyramid.row4.push(emptyCard);
    }
    
    this.state.pyramid.totalCards = 0;
    this.state.pyramid.emptySlots = 10; // 4+3+2+1
    
    console.log("Pyramid initialized with empty slots");
  }

  startDraftPhase() {
    console.log("Starting draft phase...");
    
    const playerCount = this.state.players.length;
    const cardsPerPack = 4;
    
    // Calculer le nombre de tours de draft nécessaires
    const totalCardsNeeded = playerCount === 3 ? 12 * 3 : 12 * 4; // 12 cartes par joueur
    const packsPerRound = playerCount;
    const totalRounds = Math.ceil(totalCardsNeeded / (packsPerRound * cardsPerPack));
    
    console.log(`Draft: ${totalRounds} rounds, ${cardsPerPack} cards per pack`);
    
    // Créer les premiers paquets de draft
    this.createDraftPacks();
    
    // Distribuer les premiers paquets
    this.distributeDraftPacks();
    
    // Notifier les joueurs
    this.broadcast("draft_started", {
      round: this.draftRound,
      cardsPerPack: cardsPerPack,
      pickCount: playerCount === 3 ? 2 : 1, // 3 joueurs = 2 cartes, 4 joueurs = 1 carte
      totalRounds: totalRounds
    });
  }

  createDraftPacks() {
    const playerCount = this.state.players.length;
    const cardsPerPack = 4;
    
    // Créer un paquet pour chaque joueur
    this.draftPacks = [];
    for (let i = 0; i < playerCount; i++) {
      const pack = [];
      for (let j = 0; j < cardsPerPack; j++) {
        if (this.draftCards.length > 0) {
          pack.push(this.draftCards.pop());
        }
      }
      this.draftPacks.push(pack);
    }
    
    console.log(`Created ${this.draftPacks.length} draft packs for round ${this.draftRound}`);
  }

  distributeDraftPacks() {
    this.state.players.forEach((player, index) => {
      if (this.draftPacks[index]) {
        // Ajouter les cartes à la main temporaire du joueur (pour le draft)
        player.draftPack.clear();
        this.draftPacks[index].forEach(card => {
          player.draftPack.push(card);
        });
        
        console.log(`Distributed pack to ${player.pseudo}: ${this.draftPacks[index].length} cards`);
      }
    });
    
    // Notifier les joueurs qu'ils peuvent choisir
    this.broadcast("draft_pack_received", {
      round: this.draftRound,
      pickCount: this.state.players.length === 3 ? 2 : 1
    });
  }

  handlePlayerReady(client, message) {
    console.log("Player ready:", client.sessionId);
    
    // Vérifier que la partie est en phase d'attente
    if (this.state.phase !== GAME_PHASES.WAITING) {
      client.send("error", { 
        code: "GAME_ALREADY_STARTED", 
        message: "La partie a déjà commencé" 
      });
      return;
    }

    // Trouver le joueur
    const player = this.state.players.find(p => p.sessionId === client.sessionId);
    if (!player) {
      client.send("error", { 
        code: "PLAYER_NOT_FOUND", 
        message: "Joueur non trouvé" 
      });
      return;
    }

    // Vérifier qu'il n'est pas déjà prêt
    if (player.isReady) {
      client.send("error", { 
        code: "ALREADY_READY", 
        message: "Vous êtes déjà prêt" 
      });
      return;
    }

    // Marquer le joueur comme prêt
    player.isReady = true;
    this.state.lastActivity = Date.now();

    // Notifier tous les joueurs
    this.broadcast("player_ready_update", {
      playerSessionId: client.sessionId,
      pseudo: player.pseudo,
      isReady: true,
      readyCount: this.state.players.filter(p => p.isReady && p.isConnected).length,
      totalPlayers: this.state.players.filter(p => p.isConnected).length
    });

    console.log(`${player.pseudo} is ready! (${this.getReadyPlayersCount()}/${this.getConnectedPlayersCount()})`);

    // Vérifier si on peut démarrer la partie
    this.checkGameStart();
  }

  handlePlayerNotReady(client, message) {
    console.log("Player not ready:", client.sessionId);
    
    // Vérifier que la partie est en phase d'attente
    if (this.state.phase !== GAME_PHASES.WAITING) {
      client.send("error", { 
        code: "GAME_ALREADY_STARTED", 
        message: "La partie a déjà commencé" 
      });
      return;
    }

    // Trouver le joueur
    const player = this.getPlayerBySessionId(client.sessionId);
    if (!player) {
      client.send("error", { 
        code: "PLAYER_NOT_FOUND", 
        message: "Joueur non trouvé" 
      });
      return;
    }

    // Vérifier qu'il était prêt
    if (!player.isReady) {
      client.send("error", { 
        code: "NOT_READY", 
        message: "Vous n'étiez pas prêt" 
      });
      return;
    }

    // Marquer le joueur comme non prêt
    player.isReady = false;
    this.state.lastActivity = Date.now();

    // Notifier tous les joueurs
    this.broadcast("player_ready_update", {
      playerSessionId: client.sessionId,
      pseudo: player.pseudo,
      isReady: false,
      readyCount: this.getReadyPlayersCount(),
      totalPlayers: this.getConnectedPlayersCount()
    });

    console.log(`${player.pseudo} is no longer ready (${this.getReadyPlayersCount()}/${this.getConnectedPlayersCount()})`);
  }

  handlePlayCard(client, message) {
    console.log("Play card:", client.sessionId, message);
    
    // 1. Validations de base
    if (this.state.phase !== GAME_PHASES.PLAYING) {
      client.send("error", { 
        code: "GAME_NOT_PLAYING", 
        message: "La partie n'est pas en cours" 
      });
      return;
    }

    // Vérifier que c'est le tour du joueur
    if (!this.isPlayerTurn(client.sessionId)) {
      client.send("error", { 
        code: "NOT_YOUR_TURN", 
        message: "Ce n'est pas votre tour" 
      });
      return;
    }

    const player = this.getPlayerBySessionId(client.sessionId);
    if (!player) {
      client.send("error", { 
        code: "PLAYER_NOT_FOUND", 
        message: "Joueur non trouvé" 
      });
      return;
    }

    // Valider le message
    if (!message.cardId || !message.action || !message.target) {
      client.send("error", { 
        code: "INVALID_PLAY_MESSAGE", 
        message: "Message de jeu invalide" 
      });
      return;
    }

    // Vérifier que la carte est dans la main du joueur
    const cardToPlay = player.hand.find(card => card.id === message.cardId);
    if (!cardToPlay) {
      client.send("error", { 
        code: "CARD_NOT_IN_HAND", 
        message: "Cette carte n'est pas dans votre main" 
      });
      return;
    }

    // 2. Traiter l'action selon le type
    let actionResult = false;
    
    try {
      switch (message.action) {
        case "place":
          actionResult = this.handlePlaceCard(cardToPlay, message.target, player);
          break;
        case "replace":
          actionResult = this.handleReplaceCard(cardToPlay, message.target, player);
          break;
        case "special_power":
          actionResult = this.handleSpecialPowerCard(cardToPlay, message.target, player);
          break;
        default:
          client.send("error", { 
            code: "INVALID_ACTION", 
            message: "Action invalide" 
          });
          return;
      }
    } catch (error) {
      console.error("Error handling play card:", error);
      client.send("error", { 
        code: "PLAY_CARD_ERROR", 
        message: "Erreur lors du jeu de la carte" 
      });
      return;
    }

    // 3. Si l'action a réussi, finaliser le tour
    if (actionResult) {
      this.finalizePlayerTurn(player, cardToPlay);
    }
  }

  handleSpecialPower(client, message) {
    // TODO: Implémenter dans Phase 3
    console.log("Special power:", client.sessionId, message);
  }

  handleDraftCards(client, message) {
    console.log("Draft cards:", client.sessionId, message);
    
    // Vérifier qu'on est en phase de draft
    if (this.state.phase !== GAME_PHASES.DRAFTING) {
      client.send("error", { 
        code: "NOT_DRAFTING_PHASE", 
        message: "La phase de draft n'est pas active" 
      });
      return;
    }

    const player = this.getPlayerBySessionId(client.sessionId);
    if (!player) {
      client.send("error", { 
        code: "PLAYER_NOT_FOUND", 
        message: "Joueur non trouvé" 
      });
      return;
    }

    // Vérifier qu'il n'a pas déjà choisi
    if (player.hasPicked) {
      client.send("error", { 
        code: "ALREADY_PICKED", 
        message: "Vous avez déjà choisi vos cartes ce tour" 
      });
      return;
    }

    // Valider le message
    if (!message.cardIds || !Array.isArray(message.cardIds)) {
      client.send("error", { 
        code: "INVALID_CARD_SELECTION", 
        message: "Sélection de cartes invalide" 
      });
      return;
    }

    // Déterminer le nombre de cartes à choisir
    const playerCount = this.state.players.length;
    const isFirstPick = player.draftPack.length === 4;
    const expectedPickCount = this.getExpectedPickCount(playerCount, isFirstPick);
    
    // Vérifier le nombre de cartes sélectionnées
    if (message.cardIds.length !== expectedPickCount) {
      client.send("error", { 
        code: "WRONG_PICK_COUNT", 
        message: `Vous devez choisir exactement ${expectedPickCount} carte(s)` 
      });
      return;
    }

    // Vérifier que les cartes sont dans le paquet du joueur
    const playerPack = Array.from(player.draftPack);
    const selectedCards = [];
    
    for (const cardId of message.cardIds) {
      const card = playerPack.find(c => c.id === cardId);
      if (!card) {
        client.send("error", { 
          code: "CARD_NOT_IN_PACK", 
          message: "Carte non disponible dans votre paquet" 
        });
        return;
      }
      selectedCards.push(card);
    }

    // Traiter la sélection
    this.processDraftSelection(player, selectedCards, playerPack);
  }

  getExpectedPickCount(playerCount, isFirstPick) {
    if (playerCount === 3) {
      return isFirstPick ? 2 : 1; // Premier tour: 2, puis 1
    } else {
      return 1; // 4 joueurs: toujours 1
    }
  }

  processDraftSelection(player, selectedCards, playerPack) {
    console.log(`${player.pseudo} picked ${selectedCards.length} cards`);
    
    // Ajouter les cartes choisies directement à la main définitive du joueur
    selectedCards.forEach(card => {
      player.hand.push(card);
    });
    
    // Créer le paquet restant (cartes non choisies)
    const remainingCards = playerPack.filter(card => 
      !selectedCards.some(selected => selected.id === card.id)
    );
    
    // Stocker les cartes restantes temporairement
    this.pendingRemainingCards.set(player.sessionId, remainingCards);
    
    // Marquer le joueur comme ayant choisi
    player.hasPicked = true;
    player.handCount = player.hand.length;
    
    // Vider le paquet de draft du joueur
    player.draftPack.clear();
    
    console.log(`${player.pseudo} now has ${player.hand.length} cards in final hand, ${remainingCards.length} cards pending redistribution`);
    
    // Vérifier si tous les joueurs ont choisi leurs cartes pour ce tour
    this.checkAllPlayersHavePicked();
  }

  checkAllPlayersHavePicked() {
    // Vérifier si tous les joueurs connectés qui ont des cartes à drafter ont choisi
    const connectedPlayers = this.state.players.filter(p => p.isConnected);
    const playersWithDraftPacks = connectedPlayers.filter(p => p.draftPack.length > 0);
    const playersWhoNeedToPick = playersWithDraftPacks.filter(p => !p.hasPicked);
    const playersWithPendingCards = this.pendingRemainingCards.size;
    
    console.log(`Pick check: ${playersWhoNeedToPick.length} players still need to pick from ${playersWithDraftPacks.length} players with cards`);
    console.log(`Players with packs: ${playersWithDraftPacks.map(p => p.pseudo).join(', ')}`);
    console.log(`Players who need to pick: ${playersWhoNeedToPick.map(p => p.pseudo).join(', ')}`);
    console.log(`Players with pending cards: ${playersWithPendingCards}`);
    
    // Si tous les joueurs qui avaient des cartes ont choisi ET qu'il y a des cartes en attente
    if (playersWhoNeedToPick.length === 0 && playersWithPendingCards > 0) {
      console.log("All players have picked and there are pending cards! Redistributing...");
      this.redistributeRemainingCards();
      return; // Important: ne pas vérifier la fin du round ici
    }
    
    // Si personne n'a plus de cartes à drafter ET aucune carte en attente, vérifier si le round est terminé
    if (playersWithDraftPacks.length === 0 && playersWithPendingCards === 0) {
      console.log("No more cards anywhere, checking if round is complete...");
      this.checkDraftRoundComplete();
    }
  }

  redistributeRemainingCards() {
    console.log("Redistributing cards based on pending selections...");
    
    const connectedPlayers = this.state.players.filter(p => p.isConnected);
    
    // Vérifier que tous les joueurs connectés ont bien leurs cartes en attente
    const playersWithPendingCards = connectedPlayers.filter(p => 
      this.pendingRemainingCards.has(p.sessionId)
    );
    
    console.log(`Players with pending cards: ${playersWithPendingCards.length}/${connectedPlayers.length}`);
    
    // Ne redistribuer que si tous les joueurs connectés ont des cartes en attente
    if (playersWithPendingCards.length !== connectedPlayers.length) {
      console.log("Not all players have pending cards yet, waiting...");
      return;
    }
    
    let cardsRedistributed = false;
    
    // Redistribuer les cartes restantes selon la direction du draft
    connectedPlayers.forEach((player, index) => {
      const remainingCards = this.pendingRemainingCards.get(player.sessionId);
      
      console.log(`Processing player ${player.pseudo} (index ${index})`);
      
      if (remainingCards && remainingCards.length > 0) {
        cardsRedistributed = true;
        
        // Calculer le joueur suivant selon la direction
        // Direction -1 = vers la gauche (index précédent)
        // Direction 1 = vers la droite (index suivant)
        const nextPlayerIndex = (index + this.draftDirection + connectedPlayers.length) % connectedPlayers.length;
        const nextPlayer = connectedPlayers[nextPlayerIndex];
        
        console.log(`Player order for redistribution:`);
        connectedPlayers.forEach((p, i) => {
          console.log(`  Index ${i}: ${p.pseudo} (${p.sessionId})`);
        });
        console.log(`${player.pseudo} (index ${index}) gives cards to ${nextPlayer.pseudo} (index ${nextPlayerIndex})`);
        console.log(`Direction: ${this.draftDirection}, calculation: (${index} + ${this.draftDirection} + ${connectedPlayers.length}) % ${connectedPlayers.length} = ${nextPlayerIndex}`);
        
        // Donner les cartes restantes au joueur suivant
        if (!nextPlayer.draftPack) {
          nextPlayer.draftPack = new ArraySchema();
        }
        
        nextPlayer.draftPack.clear();
        remainingCards.forEach(card => {
          nextPlayer.draftPack.push(card);
        });
        
        // Réinitialiser le statut du joueur suivant
        nextPlayer.hasPicked = false;
        
        console.log(`Redistributed ${remainingCards.length} cards from ${player.pseudo} to ${nextPlayer.pseudo}`);
        
        // Notifier le joueur suivant
        const nextClient = this.clients.find(c => c.sessionId === nextPlayer.sessionId);
        if (nextClient) {
          nextClient.send("draft_pack_received", {
            round: this.draftRound,
            cardsCount: remainingCards.length,
            pickCount: this.getExpectedPickCount(this.state.players.length, remainingCards.length === 4)
          });
        }
      }
    });
    
    // Nettoyer les cartes en attente
    this.pendingRemainingCards.clear();
    
    if (cardsRedistributed) {
      console.log("Redistribution complete, players can now pick again");
    } else {
      console.log("No cards to redistribute, checking if round is complete");
      this.checkDraftRoundComplete();
    }
  }

  passDraftPack(fromPlayer, remainingCards) {
    const playerIndex = this.state.players.findIndex(p => p.sessionId === fromPlayer.sessionId);
    // Direction -1 = vers la gauche (index précédent), Direction 1 = vers la droite (index suivant)
    const nextPlayerIndex = (playerIndex + this.draftDirection + this.state.players.length) % this.state.players.length;
    const nextPlayer = this.state.players[nextPlayerIndex];
    
    // Donner le paquet restant au voisin
    if (!nextPlayer.draftPack) {
      nextPlayer.draftPack = new ArraySchema();
    }
    
    nextPlayer.draftPack.clear();
    remainingCards.forEach(card => {
      nextPlayer.draftPack.push(card);
    });
    
    // Réinitialiser le statut du voisin s'il doit choisir
    nextPlayer.hasPicked = false;
    
    console.log(`Pack passed from ${fromPlayer.pseudo} to ${nextPlayer.pseudo} (${remainingCards.length} cards)`);
    
    // Notifier le joueur suivant
    const nextClient = this.clients.find(c => c.sessionId === nextPlayer.sessionId);
    if (nextClient) {
      nextClient.send("draft_pack_received", {
        round: this.draftRound,
        cardsCount: remainingCards.length,
        pickCount: this.getExpectedPickCount(this.state.players.length, remainingCards.length === 4)
      });
    }
  }

  checkDraftRoundComplete() {
    // Vérifier si tous les joueurs ont terminé leurs paquets (plus de cartes en draft)
    const playersWithCards = this.state.players.filter(p => p.draftPack.length > 0);
    const playersWhoCanPick = this.state.players.filter(p => p.draftPack.length > 0 && !p.hasPicked);
    
    console.log(`Draft round check: ${playersWithCards.length} players with cards, ${playersWhoCanPick.length} can still pick`);
    
    // Le round n'est terminé que si :
    // 1. Plus personne n'a de cartes ET
    // 2. Plus personne n'a de cartes en attente de redistribution
    const playersWithPendingCards = this.pendingRemainingCards.size;
    
    console.log(`Pending cards from ${playersWithPendingCards} players`);
    
    if (playersWithCards.length === 0 && playersWithPendingCards === 0) {
      // Maintenant le tour de draft est vraiment terminé
      console.log("Draft round truly complete - no cards left anywhere");
      this.completeDraftRound();
    } else {
      console.log("Draft round continues - cards still in circulation");
    }
  }

  completeDraftRound() {
    console.log(`Draft round ${this.draftRound} complete`);
    
    // Réinitialiser les statuts pour le prochain tour
    this.state.players.forEach(player => {
      player.hasPicked = false;
      player.draftPack.clear();
    });
    
    // Nettoyer les cartes en attente de redistribution
    this.pendingRemainingCards.clear();
    
    // Vérifier si le draft est terminé
    if (this.isDraftComplete()) {
      this.finalizeDraft();
    } else {
      // Préparer le tour suivant
      this.startNextDraftRound();
    }
  }

  isDraftComplete() {
    const playerCount = this.state.players.length;
    const targetHandSize = 13; // 12 cartes draftées + 1 roi = 13 cartes total
    
    console.log(`Draft completion check:`);
    this.state.players.forEach(player => {
      console.log(`  ${player.pseudo}: ${player.hand.length} cards (target: ${targetHandSize})`);
    });
    console.log(`  Cards remaining in deck: ${this.draftCards.length}`);
    
    // Vérifier si tous les joueurs ont 13 cartes (12 draftées + 1 roi)
    const allPlayersHaveEnoughCards = this.state.players.every(player => 
      player.hand.length >= targetHandSize
    );
    
    // Ou si on n'a plus de cartes à distribuer ET qu'on ne peut plus faire de paquets complets
    const noMoreCards = this.draftCards.length < (playerCount * 4);
    
    console.log(`  All players have enough cards: ${allPlayersHaveEnoughCards}`);
    console.log(`  No more cards for complete packs: ${noMoreCards}`);
    
    return allPlayersHaveEnoughCards || noMoreCards;
  }

  startNextDraftRound() {
    this.draftRound++;
    
    // Changer la direction du draft (optionnel, selon les règles)
    // this.draftDirection *= -1;
    
    console.log(`Starting draft round ${this.draftRound}`);
    
    // Créer de nouveaux paquets
    this.createDraftPacks();
    
    // Les distribuer
    this.distributeDraftPacks();
  }

  finalizeDraft() {
    console.log("Draft phase complete! All players have their full hands...");
    
    // Afficher les mains finales
    this.state.players.forEach(player => {
      console.log(`${player.pseudo} final hand: ${player.hand.length} cards (including secret king)`);
    });
    
    // Passer à la phase de jeu
    this.state.phase = GAME_PHASES.PLAYING;
    this.state.currentPlayerIndex = 0; // Commencer par le premier joueur
    
    // Initialiser la défausse
    this.state.discardPile = new ArraySchema();
    
    // Notifier tous les joueurs
    this.broadcast("draft_complete", {
      message: "Phase de draft terminée, la partie commence !",
      currentPlayer: this.state.players[0].sessionId
    });
    
    console.log("Game phase started! Current player:", this.state.players[0].pseudo);
  }

  // Mode debug : skip draft et distribuer des cartes aléatoires
  skipToPlayingPhase() {
    console.log("DEBUG MODE: Skipping to playing phase with random hands");
    
    // Distribuer 12 cartes aléatoires à chaque joueur (en plus du roi secret)
    this.state.players.forEach(player => {
      const cardsToAdd = 12;
      for (let i = 0; i < cardsToAdd && this.draftCards.length > 0; i++) {
        const randomIndex = Math.floor(Math.random() * this.draftCards.length);
        const card = this.draftCards.splice(randomIndex, 1)[0];
        player.hand.push(card);
      }
      player.handCount = player.hand.length;
      console.log(`DEBUG: ${player.pseudo} has ${player.hand.length} cards (including secret king)`);
    });
    
    // Passer directement à la phase de jeu
    this.state.phase = GAME_PHASES.PLAYING;
    this.state.currentPlayerIndex = 0;
    this.state.turn = 1;
    
    // Initialiser la défausse
    this.state.discardPile = new ArraySchema();
    
    // Notifier tous les joueurs
    if (this.state.players.length > 0) {
      this.broadcast("draft_complete", {
        message: "DEBUG MODE: Phase de draft sautée, la partie commence !",
        currentPlayer: this.state.players[0].sessionId
      });
      
      console.log("DEBUG: Game phase started! Current player:", this.state.players[0].pseudo);
    } else {
      console.log("DEBUG: No players available for game start notification");
    }
  }

  // ==========================================
  // GESTION DE LA PYRAMIDE
  // ==========================================

  getCardAt(row, col) {
    if (row < 1 || row > 4) return null;
    
    const rowArray = this.getPyramidRow(row);
    if (!rowArray || col < 0 || col >= rowArray.length) return null;
    
    return rowArray[col] || null;
  }

  setCardAt(row, col, card) {
    if (row < 1 || row > 4) return false;
    
    const rowArray = this.getPyramidRow(row);
    if (!rowArray || col < 0 || col >= rowArray.length) return false;
    
    const existingCard = rowArray[col];
    const wasEmpty = !existingCard || existingCard.isEmpty;
    rowArray[col] = card;
    
    // Mettre à jour la position de la carte
    if (card) {
      card.row = row;
      card.col = col;
    }
    
    // Mettre à jour les compteurs
    if (wasEmpty && card) {
      this.state.pyramid.totalCards++;
      this.state.pyramid.emptySlots--;
    } else if (!wasEmpty && !card) {
      this.state.pyramid.totalCards--;
      this.state.pyramid.emptySlots++;
    }
    
    return true;
  }

  getPyramidRow(row) {
    switch (row) {
      case 1: return this.state.pyramid.row1;
      case 2: return this.state.pyramid.row2;
      case 3: return this.state.pyramid.row3;
      case 4: return this.state.pyramid.row4;
      default: return null;
    }
  }

  isValidPosition(row, col) {
    const rowArray = this.getPyramidRow(row);
    
    if (!rowArray || col < 0 || col >= rowArray.length) {
      return false;
    }
    
    // Vérifier si l'emplacement est vide (carte avec isEmpty=true)
    const cardAtPosition = rowArray[col];
    const isEmpty = cardAtPosition && cardAtPosition.isEmpty;
    return isEmpty;
  }

  // ==========================================
  // ACTIONS DE JEU
  // ==========================================

  handlePlaceCard(card, target, player) {
    const { row, col } = target;
    
    // Vérifier que la position est valide
    if (!this.isValidPosition(row, col)) {
      player.sessionId && this.clients.find(c => c.sessionId === player.sessionId)?.send("error", {
        code: "INVALID_POSITION",
        message: "Position invalide sur la pyramide"
      });
      return false;
    }

    // Vérifier que l'emplacement est vide (pas de carte ou carte vide)
    const existingCard = this.getCardAt(row, col);
    if (existingCard && !existingCard.isEmpty) {
      player.sessionId && this.clients.find(c => c.sessionId === player.sessionId)?.send("error", {
        code: "POSITION_OCCUPIED",
        message: "Cet emplacement est déjà occupé"
      });
      return false;
    }

    // Vérifier les contraintes de placement selon la rangée
    if (!this.canPlaceCardAt(card, row, col)) {
      player.sessionId && this.clients.find(c => c.sessionId === player.sessionId)?.send("error", {
        code: "INVALID_PLACEMENT",
        message: "Placement invalide selon les règles"
      });
      return false;
    }

    // Placer la carte
    this.setCardAt(row, col, card);
    
    console.log(`${player.pseudo} placed ${card.value} of ${card.suit} at (${row},${col})`);
    
    // Notifier tous les joueurs
    this.broadcast("card_placed", {
      playerSessionId: player.sessionId,
      pseudo: player.pseudo,
      card: {
        id: card.id,
        value: card.value,
        suit: card.suit,
        type: card.type
      },
      position: { row, col }
    });

    return true;
  }

  canPlaceCardAt(card, row, col) {
    // Row 1 (base) : placement libre sur emplacement vide
    if (row === 1) {
      return true;
    }
    // Rows supérieurs : support requis UNIQUEMENT lors du placement sur un emplacement vide
    const leftSupportCol = col;
    const rightSupportCol = col + 1;
    const leftSupport = this.getCardAt(row - 1, leftSupportCol);
    const rightSupport = this.getCardAt(row - 1, rightSupportCol);
    const hasValidSupport =
      (leftSupport && !leftSupport.isEmpty && leftSupport.suit === card.suit) ||
      (rightSupport && !rightSupport.isEmpty && rightSupport.suit === card.suit);
    return hasValidSupport;
  }

  handleReplaceCard(card, target, player) {
    const { row, col } = target;
    // Vérifier que la position existe dans la pyramide
    const rowArray = this.getPyramidRow(row);
    if (!rowArray || col < 0 || col >= rowArray.length) {
      player.sessionId && this.clients.find(c => c.sessionId === player.sessionId)?.send("error", {
        code: "INVALID_POSITION",
        message: "Position invalide sur la pyramide"
      });
      return false;
    }
    // Vérifier qu'il y a une carte à remplacer (et qu'elle n'est pas vide)
    const existingCard = this.getCardAt(row, col);
    if (!existingCard || existingCard.isEmpty) {
      player.sessionId && this.clients.find(c => c.sessionId === player.sessionId)?.send("error", {
        code: "NO_CARD_TO_REPLACE",
        message: "Aucune carte à remplacer à cette position"
      });
      return false;
    }
    // Remplacement :
    // Row 1 : juste vérifier que la valeur de la carte est égale ou supérieure
    if (row === 1 && card.value < existingCard.value) {
      player.sessionId && this.clients.find(c => c.sessionId === player.sessionId)?.send("error", {
        code: "CANNOT_REPLACE_CARD",
        message: "La valeur doit être égale ou supérieure pour remplacer sur la base"
      });
      return false;
    }
    // Vérifier que le remplacement est autorisé selon la hiérarchie (autres rows)
    if (row > 1 && !CardService.canReplaceCard(card, existingCard)) {
      player.sessionId && this.clients.find(c => c.sessionId === player.sessionId)?.send("error", {
        code: "CANNOT_REPLACE_CARD",
        message: "Cette carte ne peut pas remplacer la carte existante"
      });
      return false;
    }
    // Ajouter la carte remplacée à la défausse
    this.state.discardPile.push(existingCard);
    // Placer la nouvelle carte
    this.setCardAt(row, col, card);
    console.log(`${player.pseudo} replaced ${existingCard.value} of ${existingCard.suit} with ${card.value} of ${card.suit} at (${row},${col})`);
    // Notifier tous les joueurs
    this.broadcast("card_replaced", {
      playerSessionId: player.sessionId,
      pseudo: player.pseudo,
      newCard: {
        id: card.id,
        value: card.value,
        suit: card.suit,
        type: card.type
      },
      replacedCard: {
        id: existingCard.id,
        value: existingCard.value,
        suit: existingCard.suit,
        type: existingCard.type
      },
      position: { row, col }
    });
    return true;
  }

  handleSpecialPowerCard(card, target, player) {
    // D'abord placer ou remplacer la carte selon l'action de base
    let placementSuccess = false;
    
    if (target.baseAction === "place") {
      placementSuccess = this.handlePlaceCard(card, target, player);
    } else if (target.baseAction === "replace") {
      placementSuccess = this.handleReplaceCard(card, target, player);
    } else {
      player.sessionId && this.clients.find(c => c.sessionId === player.sessionId)?.send("error", {
        code: "INVALID_BASE_ACTION",
        message: "Action de base invalide pour le pouvoir spécial"
      });
      return false;
    }

    // Si le placement a échoué, pas de pouvoir spécial
    if (!placementSuccess) {
      return false;
    }

    // Activer le pouvoir spécial selon le type de carte
    switch (card.type) {
      case CARD_TYPES.QUEEN:
        return this.handleQueenPower(target, player);
      case CARD_TYPES.JACK:
        return this.handleJackPower(target, player);
      case CARD_TYPES.ACE:
        // L'As a une hiérarchie spéciale mais pas de pouvoir additionnel
        console.log(`${player.pseudo} played an Ace with special hierarchy`);
        return true;
      case CARD_TYPES.KING:
        // Le Roi n'a pas de pouvoir spécial
        console.log(`${player.pseudo} played a King (no special power)`);
        return true;
      default:
        player.sessionId && this.clients.find(c => c.sessionId === player.sessionId)?.send("error", {
          code: "NOT_SPECIAL_CARD",
          message: "Cette carte n'a pas de pouvoir spécial"
        });
        return false;
    }
  }

  handleQueenPower(target, player) {
    // Dame : Échange la position de 2 cartes sur le plateau
    if (!target.exchangeTargets || target.exchangeTargets.length !== 2) {
      player.sessionId && this.clients.find(c => c.sessionId === player.sessionId)?.send("error", {
        code: "INVALID_QUEEN_TARGETS",
        message: "La Dame nécessite exactement 2 cartes à échanger"
      });
      return false;
    }
    const pos1 = target.exchangeTargets[0];
    const pos2 = target.exchangeTargets[1];
    const card1 = this.getCardAt(pos1.row, pos1.col);
    const card2 = this.getCardAt(pos2.row, pos2.col);
    // Vérifier que les deux cartes existent et ne sont pas vides
    if (!card1 || !card2 || card1.isEmpty || card2.isEmpty) {
      player.sessionId && this.clients.find(c => c.sessionId === player.sessionId)?.send("error", {
        code: "INVALID_EXCHANGE_CARDS",
        message: "Les deux positions doivent contenir des cartes valides"
      });
      return false;
    }
    // On n'échange pas la Dame elle-même
    // Échanger les cartes (pas de vérification de support, pas de redéclenchement de pouvoirs)
    this.setCardAt(pos1.row, pos1.col, card2);
    this.setCardAt(pos2.row, pos2.col, card1);
    console.log(`${player.pseudo} used Queen power: exchanged ${card1.value} of ${card1.suit} at (${pos1.row},${pos1.col}) with ${card2.value} of ${card2.suit} at (${pos2.row},${pos2.col})`);
    // Notifier tous les joueurs
    this.broadcast("queen_power_used", {
      playerSessionId: player.sessionId,
      pseudo: player.pseudo,
      exchangedPositions: [pos1, pos2]
    });
    return true;
  }

  handleJackPower(target, player) {
    // Valet : Fonctionnement précis
    if (!target.giveCardId || !target.targetPlayerId) {
      player.sessionId && this.clients.find(c => c.sessionId === player.sessionId)?.send("error", {
        code: "INVALID_JACK_TARGETS",
        message: "Le Valet nécessite une carte à donner et un joueur cible"
      });
      return false;
    }
    const targetPlayer = this.getPlayerBySessionId(target.targetPlayerId);
    if (!targetPlayer) {
      player.sessionId && this.clients.find(c => c.sessionId === player.sessionId)?.send("error", {
        code: "TARGET_PLAYER_NOT_FOUND",
        message: "Joueur cible non trouvé"
      });
      return false;
    }
    const cardToGive = player.hand.find(c => c.id === target.giveCardId);
    if (!cardToGive) {
      player.sessionId && this.clients.find(c => c.sessionId === player.sessionId)?.send("error", {
        code: "CARD_TO_GIVE_NOT_FOUND",
        message: "Carte à donner non trouvée dans votre main"
      });
      return false;
    }
    if (targetPlayer.hand.length === 0) {
      player.sessionId && this.clients.find(c => c.sessionId === player.sessionId)?.send("error", {
        code: "TARGET_HAND_EMPTY",
        message: "Le joueur cible n'a pas de cartes"
      });
      return false;
    }
    // Retirer la carte à donner de la main du joueur A
    const cardIndex = player.hand.findIndex(c => c.id === target.giveCardId);
    player.hand.splice(cardIndex, 1);
    // Ajouter la carte à la main du joueur B
    targetPlayer.hand.push(cardToGive);
    // Piocher une carte au hasard dans la main du joueur B (qui ne peut pas être celle qui vient d'être reçue)
    const possibleCards = targetPlayer.hand.filter(c => c.id !== cardToGive.id);
    if (possibleCards.length === 0) {
      // Si B n'a plus que la carte reçue, rien à échanger
      return true;
    }
    const randomIndex = Math.floor(Math.random() * possibleCards.length);
    const receivedCard = possibleCards[randomIndex];
    // Retirer la carte au hasard de la main de B
    const receivedCardIndex = targetPlayer.hand.findIndex(c => c.id === receivedCard.id);
    targetPlayer.hand.splice(receivedCardIndex, 1);
    // Ajouter la carte à la main du joueur A
    player.hand.push(receivedCard);
    // Mettre à jour les compteurs
    player.handCount = player.hand.length;
    targetPlayer.handCount = targetPlayer.hand.length;
    console.log(`${player.pseudo} used Jack power: gave card to ${targetPlayer.pseudo} and received a random card`);
    // Notifier tous les joueurs
    this.broadcast("jack_power_used", {
      playerSessionId: player.sessionId,
      pseudo: player.pseudo,
      targetPlayerSessionId: targetPlayer.sessionId,
      targetPseudo: targetPlayer.pseudo
    });
    return true;
  }

  // ==========================================
  // GESTION DES TOURS ET FIN DE PARTIE
  // ==========================================

  finalizePlayerTurn(player, playedCard) {
    // Retirer la carte de la main du joueur
    const cardIndex = player.hand.findIndex(c => c.id === playedCard.id);
    if (cardIndex !== -1) {
      player.hand.splice(cardIndex, 1);
      player.handCount = player.hand.length;
    }

    console.log(`${player.pseudo} played a card. Remaining cards: ${player.hand.length}`);

    // Mettre à jour l'activité
    this.state.lastActivity = Date.now();

    // Vérifier les conditions de fin de partie (sauf en mode test)
    if (!this.testMode && checkGameEnd(this)) {
      return; // Partie terminée
    }

    // Passer au joueur suivant
    this.nextPlayer();
  }

  nextPlayer() {
    const connectedPlayers = this.state.players.filter(p => p.isConnected);
    
    if (connectedPlayers.length === 0) {
      this.endGame("Aucun joueur connecté");
      return;
    }

    // Trouver le prochain joueur connecté
    let attempts = 0;
    do {
      this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.state.players.length;
      attempts++;
    } while (!this.state.players[this.state.currentPlayerIndex].isConnected && attempts < this.state.players.length);

    this.state.turn++;
    
    const currentPlayer = this.getCurrentPlayer();
    console.log(`Turn ${this.state.turn}: ${currentPlayer.pseudo}'s turn`);

    // Notifier tous les joueurs du changement de tour
    this.broadcast("turn_changed", {
      currentPlayerSessionId: currentPlayer.sessionId,
      currentPseudo: currentPlayer.pseudo,
      turn: this.state.turn
    });
  }

  // Les fonctions checkGameEnd, canPlayerPlay, endGameAndCalculateScores et calculatePlayerScore
  // sont maintenant importées depuis gameplay.js pour éviter la duplication de code

  endGame(reason) {
    this.state.phase = GAME_PHASES.FINISHED;
    console.log("Game ended:", reason);
    
    this.broadcast("game_ended", { reason });
  }

}
