import { Schema, ArraySchema, defineTypes } from "@colyseus/schema";
import { Card } from "./Card.js";

export class Pyramid extends Schema {
  constructor() {
    super();

    // Collections: il faut les instancier
    this.row1 = new ArraySchema();  // 4 emplacements
    this.row2 = new ArraySchema();  // 3 emplacements  
    this.row3 = new ArraySchema();  // 2 emplacements
    this.row4 = new ArraySchema();  // 1 emplacement
    
    // Métadonnées utiles - valeurs par défaut
    this.totalCards = 0;
    this.emptySlots = 10;
  }
}

defineTypes(Pyramid, {
  // Chaque rangée est un ArraySchema de cartes
  row1: [Card],  // 4 emplacements
  row2: [Card],  // 3 emplacements  
  row3: [Card],  // 2 emplacements
  row4: [Card],  // 1 emplacement
  
  // Métadonnées utiles
  totalCards: "number",
  emptySlots: "number"
});