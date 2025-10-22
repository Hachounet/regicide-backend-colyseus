import { ArraySchema } from "@colyseus/schema";
import { Pyramid } from "../schema/Pyramid.js";
import { Card } from "../schema/Card.js";
import { PYRAMID_STRUCTURE } from "../../utils/GameConstants.js";

// Pyramid initialization and manipulation helpers

export function initializePyramid(room) {
  room.state.pyramid = new Pyramid();

  for (let i = 0; i < PYRAMID_STRUCTURE.ROW1; i++) {
    const emptyCard = new Card();
    emptyCard.isEmpty = true;
    emptyCard.id = `empty_${i}`;
    room.state.pyramid.row1.push(emptyCard);
  }
  for (let i = 0; i < PYRAMID_STRUCTURE.ROW2; i++) {
    const emptyCard = new Card();
    emptyCard.isEmpty = true;
    emptyCard.id = `empty_r2_${i}`;
    room.state.pyramid.row2.push(emptyCard);
  }
  for (let i = 0; i < PYRAMID_STRUCTURE.ROW3; i++) {
    const emptyCard = new Card();
    emptyCard.isEmpty = true;
    emptyCard.id = `empty_r3_${i}`;
    room.state.pyramid.row3.push(emptyCard);
  }
  for (let i = 0; i < PYRAMID_STRUCTURE.ROW4; i++) {
    const emptyCard = new Card();
    emptyCard.isEmpty = true;
    emptyCard.id = `empty_r4_${i}`;
    room.state.pyramid.row4.push(emptyCard);
  }

  room.state.pyramid.totalCards = 0;
  room.state.pyramid.emptySlots = 10; // 4+3+2+1

  console.log("Pyramid initialized with empty slots");
}

export function getPyramidRow(room, row) {
  switch (row) {
    case 1: return room.state.pyramid.row1;
    case 2: return room.state.pyramid.row2;
    case 3: return room.state.pyramid.row3;
    case 4: return room.state.pyramid.row4;
    default: return null;
  }
}

export function getCardAt(room, row, col) {
  if (row < 1 || row > 4) return null;
  const rowArray = getPyramidRow(room, row);
  if (!rowArray || col < 0 || col >= rowArray.length) return null;
  return rowArray[col] || null;
}

export function setCardAt(room, row, col, card) {
  if (row < 1 || row > 4) return false;
  const rowArray = getPyramidRow(room, row);
  if (!rowArray || col < 0 || col >= rowArray.length) return false;

  const existingCard = rowArray[col];
  const wasEmpty = !existingCard || existingCard.isEmpty;
  rowArray[col] = card;

  if (card) {
    card.row = row;
    card.col = col;
  }

  if (wasEmpty && card) {
    room.state.pyramid.totalCards++;
    room.state.pyramid.emptySlots--;
  } else if (!wasEmpty && !card) {
    room.state.pyramid.totalCards--;
    room.state.pyramid.emptySlots++;
  }
  return true;
}

export function isValidPosition(room, row, col) {
  const rowArray = getPyramidRow(room, row);
  if (!rowArray || col < 0 || col >= rowArray.length) {
    return false;
  }
  const cardAtPosition = rowArray[col];
  const isEmpty = cardAtPosition && cardAtPosition.isEmpty;
  return isEmpty;
}
