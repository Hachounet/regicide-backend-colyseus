import { Schema, defineTypes } from "@colyseus/schema";

export class Card extends Schema {
  constructor() {
    super();

    // Valeurs par défaut
    this.row = 0;        // Position pyramide (0 = pas placée)
    this.col = 0;
    this.isVisible = true;  // Pour masquer les rois secrets

    // id, value, suit, type seront définis au moment opportun
  }
}

defineTypes(Card, {
  id: "string",
  value: "number",      // 1-13
  suit: "string",       // "hearts", "diamonds", "clubs", "spades"
  type: "string",       // "ace", "number", "jack", "queen", "king"
  row: "number",        // Position pyramide (0 = pas placée)
  col: "number",
  isVisible: "boolean"  // Pour masquer les rois secrets
});