import { Card } from "../rooms/schema/Card.js";
import { SUITS, CARD_TYPES } from "../utils/GameConstants.js";

export class CardService {
  
  static createDeck() {
    const deck = [];
    const suits = Object.values(SUITS);
    
    suits.forEach(suit => {
      // As
      deck.push(this.createCard(1, suit, CARD_TYPES.ACE));
      
      // Nombres 2-10
      for(let value = 2; value <= 10; value++) {
        deck.push(this.createCard(value, suit, CARD_TYPES.NUMBER));
      }
      
      // Têtes
      deck.push(this.createCard(11, suit, CARD_TYPES.JACK));
      deck.push(this.createCard(12, suit, CARD_TYPES.QUEEN));
      deck.push(this.createCard(13, suit, CARD_TYPES.KING));
    });
    
    return deck;
  }
  
  static createCard(value, suit, type) {
    const card = new Card();
    card.id = `${suit}_${value}_${Date.now()}_${Math.random()}`;
    card.value = value;
    card.suit = suit;
    card.type = type;
    card.row = 0;  // Non placée
    card.col = 0;
    card.isVisible = true;
    return card;
  }
  
  static shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }
  
  static canReplaceCard(newCard, existingCard) {
    // Validation des paramètres
    if (!newCard || !existingCard || !newCard.type || !existingCard.type) {
      return false;
    }
    
    const { ACE, NUMBER, JACK, QUEEN, KING } = CARD_TYPES;
    
    // Validation des types de cartes valides
    const validTypes = [ACE, NUMBER, JACK, QUEEN, KING];
    if (!validTypes.includes(newCard.type) || !validTypes.includes(existingCard.type)) {
      return false;
    }
    
    // Cas spécial : As peut remplacer Valet/Dame/Roi (cycle des règles)
    if (newCard.type === ACE && [JACK, QUEEN, KING].includes(existingCard.type)) {
      return true;
    }
    
    // As vs As : possible
    if (newCard.type === ACE && existingCard.type === ACE) {
      return true;
    }
    
    // As vs Nombres : As est toujours battu par les nombres
    if (newCard.type === ACE && existingCard.type === NUMBER) {
      return false;
    }
    
    // Tout (sauf As) bat As
    if (existingCard.type === ACE && newCard.type !== ACE) {
      return true;
    }
    
    // Nombres vs Nombres : valeur >= pour remplacer (2 bat 2 et 1, 3 bat 3,2,1 etc.)
    if (newCard.type === NUMBER && existingCard.type === NUMBER) {
      return newCard.value >= existingCard.value;
    }
    
    // Valet remplace : As à Valet (As=1, 2-10, Valet=11)
    if (newCard.type === JACK) {
      return existingCard.type === ACE || 
             existingCard.type === NUMBER || 
             existingCard.type === JACK;
    }
    
    // Dame remplace : As à Dame (As=1, 2-10, Valet=11, Dame=12)
    if (newCard.type === QUEEN) {
      return existingCard.type === ACE || 
             existingCard.type === NUMBER || 
             existingCard.type === JACK || 
             existingCard.type === QUEEN;
    }
    
    // Roi remplace : As à Roi (tout)
    if (newCard.type === KING) {
      return true;
    }
    
    // Nombres vs Têtes : nombres ne peuvent pas remplacer les têtes
    if (newCard.type === NUMBER && [JACK, QUEEN, KING].includes(existingCard.type)) {
      return false;
    }
    
    // Par défaut : non autorisé
    return false;
  }
}