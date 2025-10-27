import { Schema, ArraySchema, defineTypes } from "@colyseus/schema";
import { Card } from "./Card.js";

export class Player extends Schema {
  constructor() {
    super();

    // Collections: il faut les instancier
    this.hand = new ArraySchema();
    this.draftPack = new ArraySchema();

    // Valeurs par défaut 
    this.score = 0;
    this.isReady = false;
    this.isConnected = true;
    this.handCount = 0;
    this.hasPicked = false;
    this.reconnectionToken = "";

    // sessionId, pseudo, secretKing seront définis au moment opportun
  }
}

defineTypes(Player, {
  sessionId: "string",
  pseudo: "string",
  hand: [Card],
  secretKing: Card,
  score: "number",
  isReady: "boolean",
  isConnected: "boolean",
  handCount: "number",
  draftPack: [Card],
  hasPicked: "boolean",
  reconnectionToken: "string",
});