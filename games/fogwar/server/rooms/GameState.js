// server/rooms/GameState.js
const schema = require('@colyseus/schema');
const { Schema, MapSchema } = schema;

class Player extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.angle = 0;
    this.char = 'soldier';
    this.team = 0;
    this.alive = true;
  }
}
// O defineTypes avisa o Colyseus o que deve ser enviado para os jogadores
schema.defineTypes(Player, {
  x: "number",
  y: "number",
  hp: "number",
  maxHp: "number",
  angle: "number",
  char: "string",
  team: "number",
  alive: "boolean"
});

class GameState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
  }
}
schema.defineTypes(GameState, {
  players: { map: Player }
});

module.exports = { GameState, Player };