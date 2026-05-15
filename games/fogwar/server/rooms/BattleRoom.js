// server/rooms/BattleRoom.js
const { Room } = require("colyseus");
const { GameState, Player } = require("./GameState");

class BattleRoom extends Room {
  onCreate(options) {
    this.maxClients = 4;
    // Define o estado inicial da sala usando nosso Schema
    this.setState(new GameState());

    console.log("⚔️ Sala de Batalha criada!");

    // Aqui receberemos os comandos do cliente (andar, atirar, etc)
    this.onMessage("move", (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (player && player.alive) {
        // Atualizaremos a física aqui depois
      }
    });
  }

onJoin(client, options) {
    // Usamos o || para garantir que se o nome não vier, o código não quebre
    const playerName = options.name || "Convidado";
    const playerChar = options.char || "soldier";

    console.log(`Jogador ${playerName} (${client.sessionId}) entrou!`);
    
    const newPlayer = new Player();
    newPlayer.char = playerChar;
    newPlayer.x = 200; 
    newPlayer.y = 200;
    
    this.state.players.set(client.sessionId, newPlayer);
  }

  onLeave(client, consented) {
    console.log(`Jogador ${client.sessionId} saiu da sala.`);
    this.state.players.delete(client.sessionId);
  }

  onDispose() {
    console.log("Sala destruída (todos os jogadores saíram).");
  }
}

module.exports = { BattleRoom };