# Système de Reconnexion

## Vue d'ensemble

Le serveur Regicide implémente un système de reconnexion robuste qui permet aux joueurs de reprendre leur partie après une déconnexion (par exemple, écran de mobile qui s'éteint, perte de réseau temporaire, etc.).

## Fonctionnement

### Côté Serveur

1. **Token de reconnexion** : Chaque joueur reçoit un token unique à sa connexion initiale
2. **Délais de reconnexion** :
   - **Phase WAITING** : 60 secondes (sauf si départ volontaire)
   - **Phase DRAFTING/PLAYING/FINISHED** : 120 secondes
3. **État préservé** : La main du joueur, son score, ses cartes en draft, etc. sont tous préservés

### Côté Client

#### 1. Sauvegarder le token de reconnexion

Lors de la première connexion, le serveur envoie un token :

```javascript
room.onMessage("reconnection_token", (message) => {
  // Sauvegarder le token localement (localStorage, AsyncStorage, etc.)
  localStorage.setItem('reconnectionToken', message.token);
  localStorage.setItem('roomId', room.id);
});
```

#### 2. Gérer la déconnexion

Écouter l'événement de déconnexion :

```javascript
room.onLeave((code) => {
  console.log("Disconnected from room", code);
  
  // Si le code n'est pas 1000 (départ volontaire), proposer la reconnexion
  if (code !== 1000) {
    // Afficher un message "Tentative de reconnexion..."
    attemptReconnection();
  }
});
```

#### 3. Se reconnecter

Pour se reconnecter à la même partie :

```javascript
async function attemptReconnection() {
  const reconnectionToken = localStorage.getItem('reconnectionToken');
  const roomId = localStorage.getItem('roomId');
  
  if (!reconnectionToken || !roomId) {
    console.error("No reconnection data found");
    return;
  }
  
  try {
    // Rejoindre la room avec le token de reconnexion
    const room = await client.reconnect(roomId, reconnectionToken);
    
    console.log("Successfully reconnected!");
    
    // L'état du jeu sera automatiquement synchronisé
    // Réattacher les event handlers...
    
  } catch (error) {
    console.error("Failed to reconnect:", error);
    
    // Nettoyer le stockage local
    localStorage.removeItem('reconnectionToken');
    localStorage.removeItem('roomId');
    
    // Retourner au menu principal ou afficher un message d'erreur
  }
}
```

#### 4. Écouter les événements de reconnexion

```javascript
// Quelqu'un s'est reconnecté
room.onMessage("player_reconnected", (message) => {
  console.log(`${message.pseudo} s'est reconnecté`);
  // Mettre à jour l'UI pour montrer que le joueur est de retour
});

// Quelqu'un s'est déconnecté
room.onMessage("player_disconnected", (message) => {
  console.log(`${message.pseudo} s'est déconnecté`);
  // Mettre à jour l'UI pour montrer que le joueur est déconnecté
});
```

## Exemple complet (JavaScript/TypeScript)

```javascript
import { Client } from 'colyseus.js';

class GameClient {
  constructor() {
    this.client = new Client('ws://localhost:2567');
    this.room = null;
    this.reconnectionToken = null;
    this.roomId = null;
  }
  
  async joinOrCreate(options) {
    try {
      this.room = await this.client.joinOrCreate("regicide_room", options);
      this.setupRoomHandlers();
    } catch (error) {
      console.error("Failed to join/create room:", error);
    }
  }
  
  setupRoomHandlers() {
    // Sauvegarder le token
    this.room.onMessage("reconnection_token", (message) => {
      this.reconnectionToken = message.token;
      this.roomId = this.room.id;
      
      // Persister dans le stockage local
      localStorage.setItem('reconnectionToken', this.reconnectionToken);
      localStorage.setItem('roomId', this.roomId);
    });
    
    // Gérer la déconnexion
    this.room.onLeave((code) => {
      console.log("Left room with code:", code);
      
      // 1000 = départ volontaire normal
      if (code !== 1000) {
        this.attemptReconnection();
      }
    });
    
    // Notifications de reconnexion
    this.room.onMessage("player_reconnected", (message) => {
      console.log(`${message.pseudo} reconnected!`);
    });
    
    this.room.onMessage("player_disconnected", (message) => {
      console.log(`${message.pseudo} disconnected during ${message.phase}`);
    });
    
    // Autres handlers de jeu...
  }
  
  async attemptReconnection() {
    const reconnectionToken = localStorage.getItem('reconnectionToken');
    const roomId = localStorage.getItem('roomId');
    
    if (!reconnectionToken || !roomId) {
      console.log("No reconnection data available");
      return false;
    }
    
    try {
      console.log("Attempting to reconnect...");
      
      this.room = await this.client.reconnect(roomId, reconnectionToken);
      
      console.log("Reconnection successful!");
      this.setupRoomHandlers();
      
      return true;
      
    } catch (error) {
      console.error("Reconnection failed:", error);
      
      // Nettoyer
      localStorage.removeItem('reconnectionToken');
      localStorage.removeItem('roomId');
      
      return false;
    }
  }
  
  leaveRoom() {
    if (this.room) {
      // Départ volontaire : nettoyer le token
      localStorage.removeItem('reconnectionToken');
      localStorage.removeItem('roomId');
      
      this.room.leave();
      this.room = null;
    }
  }
}

export default GameClient;
```

## Exemple pour React Native

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';

async function saveReconnectionToken(token, roomId) {
  try {
    await AsyncStorage.setItem('reconnectionToken', token);
    await AsyncStorage.setItem('roomId', roomId);
  } catch (error) {
    console.error("Failed to save reconnection token:", error);
  }
}

async function attemptReconnection() {
  try {
    const reconnectionToken = await AsyncStorage.getItem('reconnectionToken');
    const roomId = await AsyncStorage.getItem('roomId');
    
    if (!reconnectionToken || !roomId) {
      return null;
    }
    
    const room = await client.reconnect(roomId, reconnectionToken);
    return room;
    
  } catch (error) {
    console.error("Reconnection failed:", error);
    
    // Nettoyer
    await AsyncStorage.removeItem('reconnectionToken');
    await AsyncStorage.removeItem('roomId');
    
    return null;
  }
}
```

## Scénarios de reconnexion

### Scénario 1 : Écran de mobile qui s'éteint

1. L'écran s'éteint → WebSocket se ferme
2. Le serveur détecte la déconnexion (pas consented)
3. Le joueur est marqué comme `isConnected = false`
4. Délai de reconnexion de 60-120s démarre
5. L'utilisateur rallume son écran
6. L'app tente automatiquement la reconnexion
7. Le serveur restaure la session avec le même état

### Scénario 2 : Perte de réseau temporaire

1. Connexion réseau perdue
2. Même processus que le scénario 1
3. Quand le réseau revient, reconnexion automatique

### Scénario 3 : Départ volontaire

1. L'utilisateur appuie sur "Quitter"
2. `room.leave()` est appelé (code 1000)
3. Le serveur reçoit `consented = true`
4. En phase WAITING : le joueur est retiré immédiatement
5. En phase de jeu : reconnexion possible mais l'utilisateur a quitté volontairement

## Notes importantes

- **Ne pas confondre** `reconnectionToken` avec `sessionId` :
  - `sessionId` : identifie la connexion WebSocket actuelle (change à chaque reconnexion)
  - `reconnectionToken` : identifie le joueur de manière persistante (reste le même)

- **Sécurité** : Le token de reconnexion est généré côté serveur et doit être stocké de manière sécurisée côté client

- **Timeout** : Si le délai de reconnexion expire, le joueur est définitivement retiré (en WAITING) ou reste déconnecté (en jeu)

## FAQ

**Q : Que se passe-t-il si un joueur ne se reconnecte jamais ?**

R : Après le délai (60 ou 120s), le joueur est considéré comme définitivement parti. En phase WAITING, il est retiré. En phase de jeu, il reste dans l'état mais déconnecté.

**Q : Peut-on se reconnecter après la fin de la partie ?**

R : Oui, pendant 120 secondes après déconnexion, même si la partie est terminée (FINISHED).

**Q : Le token expire-t-il ?**

R : Le token est valide tant que la room existe. Quand la room est détruite, le token devient invalide.

**Q : Peut-on se connecter depuis un autre appareil avec le même token ?**

R : Oui, techniquement c'est possible, mais cela pourrait créer des conflits. Le dernier à se connecter prend la place.
