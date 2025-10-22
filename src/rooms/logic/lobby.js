import { GAME_PHASES } from "../../utils/GameConstants.js";

export function setupMessageHandlers(room) {
  room.onMessage("player_ready", (client, message) => {
    handlePlayerReady(room, client, message);
  });

  room.onMessage("player_not_ready", (client, message) => {
    handlePlayerNotReady(room, client, message);
  });

  // Chat/communication
  room.onMessage("chat_message", (client, message) => {
    room.broadcast("chat_message", {
      from: getPlayerPseudo(room, client.sessionId),
      message: message.text,
      timestamp: Date.now()
    });
  });
}

export function handlePlayerReady(room, client, message) {
  console.log("Player ready:", client.sessionId);
  if (room.state.phase !== GAME_PHASES.WAITING) {
    client.send("error", { code: "GAME_ALREADY_STARTED", message: "La partie a déjà commencé" });
    return;
  }
  const player = room.state.players.find(p => p.sessionId === client.sessionId);
  if (!player) {
    client.send("error", { code: "PLAYER_NOT_FOUND", message: "Joueur non trouvé" });
    return;
  }
  if (player.isReady) {
    client.send("error", { code: "ALREADY_READY", message: "Vous êtes déjà prêt" });
    return;
  }
  player.isReady = true;
  room.state.lastActivity = Date.now();
  room.broadcast("player_ready_update", {
    playerSessionId: client.sessionId,
    pseudo: player.pseudo,
    isReady: true,
    readyCount: room.state.players.filter(p => p.isReady && p.isConnected).length,
    totalPlayers: room.state.players.filter(p => p.isConnected).length
  });
  console.log(`${player.pseudo} is ready! (${getReadyPlayersCount(room)}/${getConnectedPlayersCount(room)})`);
  checkGameStart(room);
}

export function handlePlayerNotReady(room, client, message) {
  console.log("Player not ready:", client.sessionId);
  if (room.state.phase !== GAME_PHASES.WAITING) {
    client.send("error", { code: "GAME_ALREADY_STARTED", message: "La partie a déjà commencé" });
    return;
  }
  const player = getPlayerBySessionId(room, client.sessionId);
  if (!player) {
    client.send("error", { code: "PLAYER_NOT_FOUND", message: "Joueur non trouvé" });
    return;
  }
  if (!player.isReady) {
    client.send("error", { code: "NOT_READY", message: "Vous n'étiez pas prêt" });
    return;
  }
  player.isReady = false;
  room.state.lastActivity = Date.now();
  room.broadcast("player_ready_update", {
    playerSessionId: client.sessionId,
    pseudo: player.pseudo,
    isReady: false,
    readyCount: getReadyPlayersCount(room),
    totalPlayers: getConnectedPlayersCount(room)
  });
  console.log(`${player.pseudo} is no longer ready (${getReadyPlayersCount(room)}/${getConnectedPlayersCount(room)})`);
}

export function checkGameStart(room) {
  if (room.state.phase !== GAME_PHASES.WAITING) return;
  const connectedPlayers = getConnectedPlayersCount(room);
  const readyPlayers = getReadyPlayersCount(room);
  const gameOptions = JSON.parse(room.state.gameOptions);
  const targetPlayerCount = gameOptions.playerCount;
  if (connectedPlayers === targetPlayerCount && readyPlayers === connectedPlayers) {
    room.state.currentPlayerIndex = Math.floor(Math.random() * room.state.players.length);
    console.log(`Tous les joueurs sont prêts ! Joueur de départ randomisé : ${room.state.players[room.state.currentPlayerIndex].pseudo}`);
    room.startGame();
  } else {
    room.broadcast("waiting_for_players", {
      readyCount: readyPlayers,
      totalCount: connectedPlayers,
      targetCount: targetPlayerCount,
      minRequired: room.minClients,
      maxAllowed: room.maxClients
    });
  }
}

export function getPlayerPseudo(room, sessionId) {
  const player = room.state.players.find(p => p.sessionId === sessionId);
  return player ? player.pseudo : "Unknown";
}

export function getConnectedPlayersCount(room) {
  return room.state.players.filter(p => p.isConnected).length;
}

export function getReadyPlayersCount(room) {
  return room.state.players.filter(p => p.isReady && p.isConnected).length;
}

export function getPlayerBySessionId(room, sessionId) {
  return room.state.players.find(p => p.sessionId === sessionId);
}

export function kickNotReadyPlayers(room) {
  if (room.state.phase !== GAME_PHASES.WAITING) return;
  const now = Date.now();
  // IMPORTANT: ne pas remplacer l'ArraySchema par un tableau JS
  for (let i = room.state.players.length - 1; i >= 0; i--) {
    const player = room.state.players[i];
    if (!player.isReady && now - player.joinedAt > 60000) {
      console.log(`Joueur ${player.pseudo} retiré pour inactivité (non ready > 60s)`);
      room.state.players.splice(i, 1);
    }
  }
}

export function checkInactivity(room) {
  const inactiveTime = Date.now() - room.state.lastActivity;
  const maxInactiveTime = 30 * 60 * 1000; // 30 minutes
  if (inactiveTime > maxInactiveTime && room.state.phase === GAME_PHASES.WAITING) {
    console.log("Room inactive, disposing...");
    room.disconnect();
  }
}
