import { Client } from "colyseus.js";
import { cli } from "@colyseus/loadtest";

export async function main(options) {
    const client = new Client(options.endpoint);
    const room = await client.joinOrCreate("regicide", {
        playerCount: 4,
        isPrivate: false
    }, {
        pseudo: `TestPlayer${Math.floor(Math.random() * 1000)}`
    });

    console.log("joined RegicideRoom successfully!", room.sessionId);

    // Simulate player ready after random delay
    setTimeout(() => {
        room.send("player_ready");
        console.log("Player ready sent");
    }, Math.random() * 2000 + 500);

    room.onMessage("game_ended", (payload) => {
        console.log("Game ended:", payload);
    });

    room.onMessage("chat_message", (payload) => {
        console.log("Chat:", payload.from, ":", payload.message);
    });

    room.onStateChange((state) => {
        console.log("State change - Phase:", state.phase, "Players:", state.players.length);
    });

    room.onLeave((code) => {
        console.log("Left room with code:", code);
    });
}

cli(main);
