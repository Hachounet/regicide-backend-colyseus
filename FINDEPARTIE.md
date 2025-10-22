# FIN DE PARTIE - REGICIDE

Ce document explique le déroulement de la fin de partie côté backend et les messages envoyés au frontend pour permettre l'affichage des résultats.

## 1. Détection de la fin de partie

### Cas 1 : Toutes les mains sont vides

- Dès que tous les joueurs n'ont plus de cartes en main, la partie se termine automatiquement.
- Le backend calcule les scores et envoie le message `game_finished` à tous les clients.

### Cas 2 : Un seul joueur peut encore jouer

- À chaque fin de tour, le backend vérifie combien de joueurs peuvent encore jouer (fonction `canPlayerPlay`).
- Si un seul joueur peut jouer (tous les autres sont bloqués ou n'ont plus de cartes), la partie continue jusqu'à ce que ce joueur joue sa dernière action ou passe son tour.
- Dès que ce dernier joueur ne peut plus jouer, la partie se termine automatiquement.
- Le backend calcule les scores et envoie le message `game_finished` à tous les clients.

## 2. Message envoyé au frontend

Le backend envoie le message :

```
game_finished {
  winner: { sessionId, pseudo, score },
  finalScores: [
    { sessionId, pseudo, score, secretKing: { suit, value } },
    ...
  ]
}
```

- `winner` : informations sur le gagnant (pseudo, score, sessionId)
- `finalScores` : tableau de tous les joueurs avec leur score et leur roi secret

## 3. Ce que doit faire le frontend

- Afficher un écran de résultats dès réception du message `game_finished`.
- Afficher le classement des joueurs (trié par score décroissant).
- Mettre en avant le gagnant (badge, couleur, etc.).
- Afficher pour chaque joueur : pseudo, score, roi secret (valeur + couleur).
- Indiquer le joueur local ("Vous").
- (Optionnel) Afficher un message si la partie s'est terminée car tous les joueurs étaient bloqués.

## 4. Cas particuliers

- Si égalité, le backend peut envoyer plusieurs gagnants (à adapter si besoin).
- Si la partie se termine par déconnexion de tous les joueurs, le message `game_ended` est envoyé avec une raison, mais il n'y a pas de scores.

## 5. Exemple d'affichage

| #   | Pseudo | Score | Roi secret |         |
| --- | ------ | ----- | ---------- | ------- |
| 1   | fafa   | 94    | 13 ♥       | Gagnant |
| 2   | dada   | 70    | 10 ♠       |         |
| 3   | c      | 61    | 12 ♦       | Vous    |
| 4   | d      | 13    | 11 ♣       |         |

## 6. Référence code

- Voir les fonctions `checkGameEnd`, `endGameAndCalculateScores`, et le message `game_finished` dans `gameplay.js` et `MyRoom.js`.

---

Ce document est à destination des développeurs frontend pour l'intégration de l'écran de fin de partie et l'affichage des résultats.
