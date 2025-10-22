
import { RegicideRoom } from '../src/rooms/MyRoom.js';
import { Player } from '../src/rooms/schema/Player.js';
import { Card } from '../src/rooms/schema/Card.js';
import { CARD_TYPES, SUITS } from '../src/utils/GameConstants.js';

function createCard(value, suit, type) {
  const card = new Card();
  card.id = `${suit}_${value}_${type}`;
  card.value = value;
  card.suit = suit;
  card.type = type;
  card.isEmpty = false;
  return card;
}

function log(msg) { console.log('TEST:', msg); }

async function runTest() {
  // 1. Créer la room
  const room = new RegicideRoom();
  room.onCreate({ playerCount: 4 });
  log('Room créée');

  // 2. Ajouter 4 joueurs
  for (let i = 0; i < 4; i++) {
    room.onJoin({ sessionId: `p${i+1}` }, { pseudo: `Joueur${i+1}` });
  }
  log('4 joueurs ajoutés');

  // 3. Les coche ready
  for (let i = 0; i < 4; i++) {
    room.handlePlayerReady({ sessionId: `p${i+1}` }, {});
  }
  log('Tous les joueurs sont prêts');

  // 4. Phase draft : mains prédéfinies
  // Joueur 1 : 1 Dame, 1 Valet, 2, 3, 4
  // Joueur 2 : 2, 3, 4, 5, 6
  // Joueur 3 : 2, 3, 4, 5, 6
  // Joueur 4 : 2, 3, 4, 5, 6
  const dame = createCard(12, SUITS.HEARTS, CARD_TYPES.QUEEN);
  const valet = createCard(11, SUITS.CLUBS, CARD_TYPES.JACK);
  const c2 = createCard(2, SUITS.HEARTS, CARD_TYPES.NUMBER);
  const c3 = createCard(3, SUITS.SPADES, CARD_TYPES.NUMBER);
  const c4 = createCard(4, SUITS.CLUBS, CARD_TYPES.NUMBER);
  const c5 = createCard(5, SUITS.HEARTS, CARD_TYPES.NUMBER);
  const c6 = createCard(6, SUITS.DIAMONDS, CARD_TYPES.NUMBER);

  // Joueur 1
  const p1 = room.state.players[0];
  p1.hand.clear();
  p1.hand.push(dame);
  p1.hand.push(valet);
  p1.hand.push(c2);
  p1.hand.push(c3);
  p1.hand.push(c4);
  p1.handCount = p1.hand.length;

  // Joueur 2
  const p2 = room.state.players[1];
  p2.hand.clear();
  p2.hand.push(createCard(2, SUITS.HEARTS, CARD_TYPES.NUMBER));
  p2.hand.push(createCard(3, SUITS.SPADES, CARD_TYPES.NUMBER));
  p2.hand.push(createCard(4, SUITS.CLUBS, CARD_TYPES.NUMBER));
  p2.hand.push(createCard(5, SUITS.HEARTS, CARD_TYPES.NUMBER));
  p2.hand.push(createCard(6, SUITS.DIAMONDS, CARD_TYPES.NUMBER));
  p2.handCount = p2.hand.length;

  // Joueur 3
  const p3 = room.state.players[2];
  p3.hand.clear();
  p3.hand.push(createCard(2, SUITS.HEARTS, CARD_TYPES.NUMBER));
  p3.hand.push(createCard(3, SUITS.SPADES, CARD_TYPES.NUMBER));
  p3.hand.push(createCard(4, SUITS.CLUBS, CARD_TYPES.NUMBER));
  p3.hand.push(createCard(5, SUITS.HEARTS, CARD_TYPES.NUMBER));
  p3.hand.push(createCard(6, SUITS.DIAMONDS, CARD_TYPES.NUMBER));
  p3.handCount = p3.hand.length;

  // Joueur 4
  const p4 = room.state.players[3];
  p4.hand.clear();
  p4.hand.push(createCard(2, SUITS.HEARTS, CARD_TYPES.NUMBER));
  p4.hand.push(createCard(3, SUITS.SPADES, CARD_TYPES.NUMBER));
  p4.hand.push(createCard(4, SUITS.CLUBS, CARD_TYPES.NUMBER));
  p4.hand.push(createCard(5, SUITS.HEARTS, CARD_TYPES.NUMBER));
  p4.hand.push(createCard(6, SUITS.DIAMONDS, CARD_TYPES.NUMBER));
  p4.handCount = p4.hand.length;

  log('Mains prédéfinies distribuées');

  // Joueur 1 joue Row 1 - emplacement 1 une carte coeur (c2)
  let result = room.handlePlaceCard(p1.hand[2], { row: 1, col: 0 }, p1);
  log('J1 place Row1 col0 (coeur) : ' + (result ? 'OK' : 'ECHEC'));

  // Joueur 2 joue Row 1 - emplacement 2 une carte pique (3 de pique)
  result = room.handlePlaceCard(p2.hand[1], { row: 1, col: 1 }, p2);
  log('J2 place Row1 col1 (pique) : ' + (result ? 'OK' : 'ECHEC'));

  // Joueur 3 joue Row 2 - emplacement 1 une carte trèfle (4 de trèfle) (doit échouer)
  result = room.handlePlaceCard(p3.hand[2], { row: 2, col: 0 }, p3);
  log('J3 place Row2 col0 (trèfle, sans support) : ' + (result ? 'OK' : 'ECHEC'));

  // Joueur 4 joue Row 2 - emplacement 1 une carte coeur (5 de coeur) (doit fonctionner)
  result = room.handlePlaceCard(p4.hand[3], { row: 2, col: 0 }, p4);
  log('J4 place Row2 col0 (coeur, support OK) : ' + (result ? 'OK' : 'ECHEC'));

  log('Test terminé');
}

runTest();
