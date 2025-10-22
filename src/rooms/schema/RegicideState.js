import { Schema, ArraySchema, defineTypes } from "@colyseus/schema";
import { Player } from "./Player.js";
import { Pyramid } from "./Pyramid.js";
import { Card } from "./Card.js";

export class RegicideState extends Schema {
  constructor() {
    super();

    // Collections: il faut les instancier
    this.players = new ArraySchema();
    this.discardPile = new ArraySchema();
    this.pyramid = new Pyramid();

    // Valeurs par défaut
    this.phase = "waiting";           // "waiting", "drafting", "playing", "finished"
    this.currentPlayerIndex = 0;
    this.turn = 0;
    this.draftRound = 0;
    this.totalDraftRounds = 0;
    this.gameOptions = "{}";     // JSON string pour les options
    this.winner = "";          // sessionId du gagnant
    this.createdAt = 0;
    this.lastActivity = 0;
  }
}

defineTypes(RegicideState, {
  // Phase de jeu
  phase: "string",           // "waiting", "drafting", "playing", "finished"
  
  // Joueurs
  players: [Player],
  currentPlayerIndex: "number",
  
  // Plateau de jeu
  pyramid: Pyramid,
  discardPile: [Card],
  
  // Métadonnées
  turn: "number",
  draftRound: "number",
  totalDraftRounds: "number",
  gameOptions: "string",     // JSON string pour les options
  winner: "string",          // sessionId du gagnant
  
  // Timing
  createdAt: "number",
  lastActivity: "number"
});
