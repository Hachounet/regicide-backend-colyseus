import { Room } from "@colyseus/core";
import { RegicideState } from "./schema/RegicideState.js";
import { Player } from "./schema/Player.js";
import { Pyramid } from "./schema/Pyramid.js";
import { CardService } from "../services/CardService.js";
import { GAME_PHASES, SUITS, CARD_TYPES, PYRAMID_STRUCTURE } from "../utils/GameConstants.js";
import { ArraySchema } from "@colyseus/schema";

export class RegicideRoom extends Room {
  maxClients = 4;
  minClients = 3;
  state = new RegicideState();
  
  // Variables pour le draft
  draftCards = [];        // Cartes disponibles pour le draft
  draftRound = 0;         // Tour de draft actuel
  draftDirection = 1;     // Direction du passage des cartes
  draftPacks = [];        // Paquets de cartes en cours de draft

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
    this.setSimulationInterval(() => this.checkInactivity(), 30000); // 30s
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
        // En attente : supprimer le joueur
        this.state.players.splice(playerIndex, 1);
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
    // Joueur prêt à commencer
    this.onMessage("player_ready", (client, message) => {
      this.handlePlayerReady(client, message);
    });

    // Joueur plus prêt (annuler ready)
    this.onMessage("player_not_ready", (client, message) => {
      this.handlePlayerNotReady(client, message);
    });

    // Jouer une carte
    this.onMessage("play_card", (client, message) => {
      this.handlePlayCard(client, message);
    });

    // Utiliser un pouvoir spécial
    this.onMessage("use_special_power", (client, message) => {
      this.handleSpecialPower(client, message);
    });

    // Échange de cartes (draft)
    this.onMessage("draft_cards", (client, message) => {
      this.handleDraftCards(client, message);
    });

    // Chat/communication
    this.onMessage("chat_message", (client, message) => {
      this.broadcast("chat_message", {
        from: this.getPlayerPseudo(client.sessionId),
        message: message.text,
        timestamp: Date.now()
      });
    });
  }

  // ==========================================
  // CYCLE DE VIE DU JEU
  // ==========================================

  checkGameStart() {
    if (this.state.phase !== GAME_PHASES.WAITING) return;

    const connectedPlayers = this.getConnectedPlayersCount();
    const readyPlayers = this.getReadyPlayersCount();

    console.log(`Game start check: ${readyPlayers}/${connectedPlayers} players ready`);

    // Démarrer si 3-4 joueurs connectés et tous prêts
    if (connectedPlayers >= this.minClients && 
        connectedPlayers <= this.maxClients && 
        readyPlayers === connectedPlayers) {
      
      console.log("All players ready! Starting game...");
      this.startGame();
    } else {
      // Informer les joueurs du statut
      this.broadcast("waiting_for_players", {
        readyCount: readyPlayers,
        totalCount: connectedPlayers,
        minRequired: this.minClients,
        maxAllowed: this.maxClients
      });
    }
  }

  startGame() {
    console.log("Starting Regicide game with", this.state.players.length, "players");
    
    this.state.phase = GAME_PHASES.DRAFTING;
    this.state.turn = 1;
    
    // Créer et distribuer les cartes
    this.setupCards();
    
    // Démarrer le draft
    this.startDraftPhase();
  }

  checkGameContinuation() {
    const connectedPlayers = this.state.players.filter(p => p.isConnected).length;
    
    if (connectedPlayers < 2) {
      // Pas assez de joueurs, terminer la partie
      this.endGame("Pas assez de joueurs connectés");
    }
  }

  checkInactivity() {
    const inactiveTime = Date.now() - this.state.lastActivity;
    const maxInactiveTime = 30 * 60 * 1000; // 30 minutes

    if (inactiveTime > maxInactiveTime && this.state.phase === GAME_PHASES.WAITING) {
      console.log("Room inactive, disposing...");
      this.disconnect();
    }
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
    this.draftDirection = 1; // 1 = vers la gauche, -1 = vers la droite
    
    console.log("Cards setup complete. Draft cards ready:", shuffledCards.length);
  }

  distributeSecretKings(kings) {
    const playerCount = this.state.players.length;
    const shuffledKings = CardService.shuffleDeck([...kings]);
    
    // Distribuer les rois
    this.state.players.forEach((player, index) => {
      const king = shuffledKings[index];
      king.isVisible = false; // Masquer le roi secret
      player.secretKing = king;
      
      console.log(`${player.pseudo} received secret king of ${king.suit}`);
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
    
    // Remplir avec des emplacements vides (null)
    for (let i = 0; i < PYRAMID_STRUCTURE.ROW1; i++) {
      this.state.pyramid.row1.push(null);
    }
    for (let i = 0; i < PYRAMID_STRUCTURE.ROW2; i++) {
      this.state.pyramid.row2.push(null);
    }
    for (let i = 0; i < PYRAMID_STRUCTURE.ROW3; i++) {
      this.state.pyramid.row3.push(null);
    }
    for (let i = 0; i < PYRAMID_STRUCTURE.ROW4; i++) {
      this.state.pyramid.row4.push(null);
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
    
    // Ajouter les cartes choisies à la main du joueur
    selectedCards.forEach(card => {
      player.hand.push(card);
    });
    
    // Créer le paquet restant (cartes non choisies)
    const remainingCards = playerPack.filter(card => 
      !selectedCards.some(selected => selected.id === card.id)
    );
    
    // Marquer le joueur comme ayant choisi
    player.hasPicked = true;
    player.handCount = player.hand.length;
    
    // Vider le paquet de draft du joueur
    player.draftPack.clear();
    
    console.log(`${player.pseudo} now has ${player.hand.length} cards, ${remainingCards.length} cards remaining in pack`);
    
    // Passer le paquet restant au voisin de gauche (si il reste des cartes)
    if (remainingCards.length > 0) {
      this.passDraftPack(player, remainingCards);
    }
    
    // Vérifier si tous les joueurs ont choisi leurs cartes pour ce tour
    this.checkDraftRoundComplete();
  }

  passDraftPack(fromPlayer, remainingCards) {
    const playerIndex = this.state.players.findIndex(p => p.sessionId === fromPlayer.sessionId);
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
    
    console.log(`Draft check: ${playersWithCards.length} players with cards, ${playersWhoCanPick.length} can still pick`);
    
    if (playersWhoCanPick.length === 0) {
      // Tour de draft terminé
      this.completeDraftRound();
    }
  }

  completeDraftRound() {
    console.log(`Draft round ${this.draftRound} complete`);
    
    // Réinitialiser les statuts pour le prochain tour
    this.state.players.forEach(player => {
      player.hasPicked = false;
      player.draftPack.clear();
    });
    
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
    const targetHandSize = 12; // 12 cartes par joueur (sans compter le roi)
    
    // Vérifier si tous les joueurs ont 12 cartes
    const allPlayersHaveEnoughCards = this.state.players.every(player => 
      player.hand.length >= targetHandSize
    );
    
    // Ou si on n'a plus de cartes à distribuer
    const noMoreCards = this.draftCards.length === 0;
    
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
    console.log("Draft phase complete! Adding secret kings to hands...");
    
    // Ajouter les rois secrets aux mains des joueurs
    this.state.players.forEach(player => {
      if (player.secretKing) {
        player.hand.push(player.secretKing);
        player.handCount = player.hand.length;
        console.log(`${player.pseudo} final hand: ${player.hand.length} cards (including secret king)`);
      }
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
    
    const wasEmpty = !rowArray[col];
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
    return rowArray && col >= 0 && col < rowArray.length;
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

    // Vérifier que l'emplacement est vide
    const existingCard = this.getCardAt(row, col);
    if (existingCard) {
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
    // Rangée 1 (base) : placement libre
    if (row === 1) {
      return true;
    }

    // Rangées 2-4 : doit avoir un support de la même famille
    const leftSupportCol = col;
    const rightSupportCol = col + 1;
    
    const leftSupport = this.getCardAt(row - 1, leftSupportCol);
    const rightSupport = this.getCardAt(row - 1, rightSupportCol);

    // Au moins un support doit être de la même famille
    const hasValidSupport = 
      (leftSupport && leftSupport.suit === card.suit) ||
      (rightSupport && rightSupport.suit === card.suit);

    return hasValidSupport;
  }

  handleReplaceCard(card, target, player) {
    const { row, col } = target;
    
    // Vérifier que la position est valide
    if (!this.isValidPosition(row, col)) {
      player.sessionId && this.clients.find(c => c.sessionId === player.sessionId)?.send("error", {
        code: "INVALID_POSITION",
        message: "Position invalide sur la pyramide"
      });
      return false;
    }

    // Vérifier qu'il y a une carte à remplacer
    const existingCard = this.getCardAt(row, col);
    if (!existingCard) {
      player.sessionId && this.clients.find(c => c.sessionId === player.sessionId)?.send("error", {
        code: "NO_CARD_TO_REPLACE",
        message: "Aucune carte à remplacer à cette position"
      });
      return false;
    }

    // Vérifier que le remplacement est autorisé selon la hiérarchie
    if (!CardService.canReplaceCard(card, existingCard)) {
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

    if (!card1 || !card2) {
      player.sessionId && this.clients.find(c => c.sessionId === player.sessionId)?.send("error", {
        code: "INVALID_EXCHANGE_CARDS",
        message: "Les deux positions doivent contenir des cartes"
      });
      return false;
    }

    // Échanger les cartes
    this.setCardAt(pos1.row, pos1.col, card2);
    this.setCardAt(pos2.row, pos2.col, card1);

    console.log(`${player.pseudo} used Queen power: exchanged cards at (${pos1.row},${pos1.col}) and (${pos2.row},${pos2.col})`);

    // Notifier tous les joueurs
    this.broadcast("queen_power_used", {
      playerSessionId: player.sessionId,
      pseudo: player.pseudo,
      exchangedPositions: [pos1, pos2]
    });

    return true;
  }

  handleJackPower(target, player) {
    // Valet : Donner une carte à un autre joueur et en piocher une dans sa main au hasard
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

    // Retirer la carte de la main du joueur actuel
    const cardIndex = player.hand.findIndex(c => c.id === target.giveCardId);
    player.hand.splice(cardIndex, 1);

    // Piocher une carte au hasard de la main du joueur cible
    const randomIndex = Math.floor(Math.random() * targetPlayer.hand.length);
    const receivedCard = targetPlayer.hand[randomIndex];
    targetPlayer.hand.splice(randomIndex, 1);

    // Échanger les cartes
    targetPlayer.hand.push(cardToGive);
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

    // Vérifier les conditions de fin de partie
    if (this.checkGameEnd()) {
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

  checkGameEnd() {
    // 1. Vérifier si tous les joueurs ont vidé leur main
    const allHandsEmpty = this.state.players.every(p => p.hand.length === 0);
    
    if (allHandsEmpty) {
      console.log("Game ending: all players have empty hands");
      this.endGameAndCalculateScores();
      return true;
    }

    // 2. Vérifier si un seul joueur peut encore jouer
    const playersWhoCanPlay = this.state.players.filter(p => 
      p.isConnected && p.hand.length > 0 && this.canPlayerPlay(p)
    );

    if (playersWhoCanPlay.length <= 1) {
      console.log("Game ending: only one player can play");
      this.endGameAndCalculateScores();
      return true;
    }

    return false;
  }

  canPlayerPlay(player) {
    // Vérifier si le joueur a au moins une carte jouable
    return player.hand.some(card => {
      // Vérifier s'il peut placer la carte quelque part
      for (let row = 1; row <= 4; row++) {
        const rowArray = this.getPyramidRow(row);
        if (!rowArray) continue;
        
        for (let col = 0; col < rowArray.length; col++) {
          const existingCard = this.getCardAt(row, col);
          
          // Peut placer sur emplacement vide
          if (!existingCard && this.canPlaceCardAt(card, row, col)) {
            return true;
          }
          
          // Peut remplacer une carte existante
          if (existingCard && CardService.canReplaceCard(card, existingCard)) {
            return true;
          }
        }
      }
      return false;
    });
  }

  endGameAndCalculateScores() {
    console.log("Calculating final scores...");
    
    // Calculer les scores de chaque joueur
    this.state.players.forEach(player => {
      player.score = this.calculatePlayerScore(player);
      console.log(`${player.pseudo} final score: ${player.score}`);
    });

    // Déterminer le gagnant
    const winner = this.state.players.reduce((prev, current) => 
      (prev.score > current.score) ? prev : current
    );

    this.state.winner = winner.sessionId;
    this.state.phase = GAME_PHASES.FINISHED;

    console.log(`Game finished! Winner: ${winner.pseudo} with ${winner.score} points`);

    // Notifier tous les joueurs
    this.broadcast("game_finished", {
      winner: {
        sessionId: winner.sessionId,
        pseudo: winner.pseudo,
        score: winner.score
      },
      finalScores: this.state.players.map(p => ({
        sessionId: p.sessionId,
        pseudo: p.pseudo,
        score: p.score,
        secretKing: {
          suit: p.secretKing.suit,
          value: p.secretKing.value
        }
      }))
    });
  }

  calculatePlayerScore(player) {
    if (!player.secretKing) return 0;

    const playerSuit = player.secretKing.suit;
    let totalScore = 0;

    // Parcourir toute la pyramide et compter les points
    for (let row = 1; row <= 4; row++) {
      const rowArray = this.getPyramidRow(row);
      if (!rowArray) continue;

      const multiplier = row; // Row 1 = ×1, Row 2 = ×2, etc.

      for (let col = 0; col < rowArray.length; col++) {
        const card = this.getCardAt(row, col);
        
        if (card && card.suit === playerSuit) {
          // Ajouter la valeur de la carte × multiplicateur de rangée
          totalScore += card.value * multiplier;
        }
      }
    }

    // Pour 3 joueurs : vérifier la famille exclue
    const gameOptions = JSON.parse(this.state.gameOptions);
    if (gameOptions.excludedSuit === playerSuit) {
      console.log(`${player.pseudo}'s suit (${playerSuit}) is excluded in 3-player game`);
      return 0;
    }

    return totalScore;
  }

  endGame(reason) {
    this.state.phase = GAME_PHASES.FINISHED;
    console.log("Game ended:", reason);
    
    this.broadcast("game_ended", { reason });
  }

}
