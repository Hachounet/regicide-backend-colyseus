console.log("Testing imports...");

try {
  console.log("1. Testing Card import...");
  const { Card } = await import('./src/rooms/schema/Card.js');
  console.log("Card imported successfully");
  
  console.log("2. Testing Player import...");
  const { Player } = await import('./src/rooms/schema/Player.js');
  console.log("Player imported successfully");
  
  console.log("3. Testing Pyramid import...");
  const { Pyramid } = await import('./src/rooms/schema/Pyramid.js');
  console.log("Pyramid imported successfully");
  
  console.log("4. Testing RegicideState import...");
  const { RegicideState } = await import('./src/rooms/schema/RegicideState.js');
  console.log("RegicideState imported successfully");
  
  console.log("5. Testing CardService import...");
  const { CardService } = await import('./src/services/CardService.js');
  console.log("CardService imported successfully");
  
  console.log("6. Testing GameConstants import...");
  const constants = await import('./src/utils/GameConstants.js');
  console.log("GameConstants imported successfully");
  
  console.log("7. Testing MyRoom import...");
  const { RegicideRoom } = await import('./src/rooms/MyRoom.js');
  console.log("MyRoom imported successfully");
  
  console.log("All imports successful!");
  
} catch (error) {
  console.error("Import failed:", error.message);
  console.error("Stack:", error.stack);
}
