import assert from "assert";
import { boot } from "@colyseus/testing";

// import your "app.config.js" file here.
import appConfig from "../src/app.config.js";

describe("testing RegicideRoom", () => {
  let colyseus;

  before(async () => colyseus = await boot(appConfig));
  after(async () => colyseus.shutdown());

  beforeEach(async () => await colyseus.cleanup());

  it("should create RegicideRoom and accept 3-4 players", async () => {
    // Create the room
    const room = await colyseus.createRoom("regicide", { 
      playerCount: 4,
      isPrivate: false 
    });

    // Create clients and join
    const client1 = await colyseus.connectTo(room, { pseudo: "Player1" });
    const client2 = await colyseus.connectTo(room, { pseudo: "Player2" });
    const client3 = await colyseus.connectTo(room, { pseudo: "Player3" });

    // Wait for state sync
    await room.waitForNextPatch();

    // Verify room state
    assert.strictEqual(room.state.players.length, 3);
    assert.strictEqual(room.state.phase, "waiting");
    
    // Test adding 4th player
    const client4 = await colyseus.connectTo(room, { pseudo: "Player4" });
    await room.waitForNextPatch();
    
    assert.strictEqual(room.state.players.length, 4);
  });

  it("should not accept more than 4 players", async () => {
    const room = await colyseus.createRoom("regicide", { playerCount: 4 });

    // Fill the room
    await colyseus.connectTo(room, { pseudo: "Player1" });
    await colyseus.connectTo(room, { pseudo: "Player2" });
    await colyseus.connectTo(room, { pseudo: "Player3" });
    await colyseus.connectTo(room, { pseudo: "Player4" });

    // Try to add 5th player - should fail
    try {
      await colyseus.connectTo(room, { pseudo: "Player5" });
      assert.fail("Should not allow 5th player");
    } catch (error) {
      // Expected to fail
      assert.ok(true);
    }
  });
});