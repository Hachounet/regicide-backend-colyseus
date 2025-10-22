# Spécification des messages frontend → backend

## Jouer une carte (placement ou remplacement)

**Message type** : `play_card`

```json
{
  "cardId": "<id de la carte dans la main>",
  "action": "place" | "replace" | "special_power",
  "target": {
    "row": <numéro de la rangée>,
    "col": <numéro de la colonne>
    // Pour special_power, voir plus bas
  }
}
```

- `action: "place"` : placer une carte sur un emplacement vide
- `action: "replace"` : remplacer une carte existante
- `action: "special_power"` : jouer une carte à pouvoir (Dame, Valet, etc.)

## Jouer un pouvoir spécial (Dame, Valet)

**Message type** : `play_card` (avec `action: "special_power"`)

### Dame (Queen)

```json
{
  "cardId": "<id de la Dame>",
  "action": "special_power",
  "target": {
    "baseAction": "place" | "replace",
    "row": <rangée>,
    "col": <colonne>,
    "exchangeTargets": [
      { "row": <rangée1>, "col": <colonne1> },
      { "row": <rangée2>, "col": <colonne2> }
    ]
  }
}
```

- `baseAction` : "place" ou "replace" selon si la Dame est posée sur un emplacement vide ou en remplacement
- `exchangeTargets` : les deux positions à échanger (hors Dame elle-même)

### Valet (Jack)

```json
{
  "cardId": "<id du Valet>",
  "action": "special_power",
  "target": {
    "baseAction": "place" | "replace",
    "row": <rangée>,
    "col": <colonne>,
    "giveCardId": "<id d'une carte de la main>",
    "targetPlayerId": "<sessionId du joueur cible>"
  }
}
```

- `giveCardId` : carte à donner au joueur cible
- `targetPlayerId` : sessionId du joueur qui va recevoir la carte

**Remarques** :

- Les positions de la pyramide commencent à 1 (row: 1 à 4, col: 0 à n)
- Les ids de carte sont ceux reçus dans la main du joueur
- Pour les pouvoirs, le frontend doit demander à l'utilisateur les infos nécessaires (positions à échanger, joueur cible, etc.)
