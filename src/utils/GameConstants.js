export const SUITS = {
  HEARTS: "hearts",
  DIAMONDS: "diamonds", 
  CLUBS: "clubs",
  SPADES: "spades"
};

export const CARD_TYPES = {
  ACE: "ace",
  NUMBER: "number",
  JACK: "jack", 
  QUEEN: "queen",
  KING: "king"
};

export const GAME_PHASES = {
  WAITING: "waiting",
  DRAFTING: "drafting",
  PLAYING: "playing",
  FINISHED: "finished"
};

export const PYRAMID_STRUCTURE = {
  ROW1: 4,  // Base
  ROW2: 3,
  ROW3: 2, 
  ROW4: 1   // Sommet
};

export const SCORING_MULTIPLIERS = {
  ROW1: 1,
  ROW2: 2,
  ROW3: 3,
  ROW4: 4
};

// Hiérarchie des cartes pour remplacement
export const CARD_HIERARCHY = {
  ace: 1,      // As faible contre nombres
  jack: 11,
  queen: 12,
  king: 13,
  // Mais As > Têtes dans certains cas
};

// Messages du jeu
export const GAME_MESSAGES = {
  PLAYER_READY: "player_ready",
  PLAYER_NOT_READY: "player_not_ready",
  PLAYER_READY_UPDATE: "player_ready_update",
  WAITING_FOR_PLAYERS: "waiting_for_players",
  DRAFT_STARTED: "draft_started",
  DRAFT_PACK_RECEIVED: "draft_pack_received",
  DRAFT_COMPLETE: "draft_complete",
  CARD_PLACED: "card_placed",
  CARD_REPLACED: "card_replaced",
  QUEEN_POWER_USED: "queen_power_used",
  JACK_POWER_USED: "jack_power_used",
  TURN_CHANGED: "turn_changed",
  GAME_FINISHED: "game_finished",
  PLAY_CARD: "play_card",
  USE_SPECIAL_POWER: "use_special_power",
  DRAFT_CARDS: "draft_cards",
  CHAT_MESSAGE: "chat_message",
  GAME_ENDED: "game_ended"
};

// Erreurs du jeu
export const GAME_ERRORS = {
  NOT_YOUR_TURN: "not_your_turn",
  INVALID_PLACEMENT: "invalid_placement", 
  CARD_NOT_IN_HAND: "card_not_in_hand",
  GAME_NOT_STARTED: "game_not_started",
  GAME_NOT_PLAYING: "game_not_playing",
  GAME_ALREADY_STARTED: "game_already_started",
  NOT_DRAFTING_PHASE: "not_drafting_phase",
  ALREADY_PICKED: "already_picked",
  INVALID_CARD_SELECTION: "invalid_card_selection",
  WRONG_PICK_COUNT: "wrong_pick_count",
  CARD_NOT_IN_PACK: "card_not_in_pack",
  INVALID_PLAY_MESSAGE: "invalid_play_message",
  INVALID_ACTION: "invalid_action",
  PLAY_CARD_ERROR: "play_card_error",
  INVALID_POSITION: "invalid_position",
  POSITION_OCCUPIED: "position_occupied",
  NO_CARD_TO_REPLACE: "no_card_to_replace",
  CANNOT_REPLACE_CARD: "cannot_replace_card",
  INVALID_BASE_ACTION: "invalid_base_action",
  NOT_SPECIAL_CARD: "not_special_card",
  INVALID_QUEEN_TARGETS: "invalid_queen_targets",
  INVALID_EXCHANGE_CARDS: "invalid_exchange_cards",
  INVALID_JACK_TARGETS: "invalid_jack_targets",
  TARGET_PLAYER_NOT_FOUND: "target_player_not_found",
  CARD_TO_GIVE_NOT_FOUND: "card_to_give_not_found",
  TARGET_HAND_EMPTY: "target_hand_empty",
  ROOM_FULL: "room_full",
  PLAYER_NOT_FOUND: "player_not_found",
  ALREADY_READY: "already_ready",
  NOT_READY: "not_ready"
};
