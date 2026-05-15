// server/index.js
const { Server } = require("colyseus");
const { createServer } = require("http");
const express = require("express");
const cors = require("cors");
const { BattleRoom } = require("./rooms/BattleRoom"); // <-- Importamos a sala

const port = process.env.PORT || 2567;
const app = express();

app.use(cors());
app.use(express.json());

const gameServer = new Server({
  server: createServer(app)
});

// Registra a sala no servidor com o nome "battle"
gameServer.define("battle", BattleRoom);

gameServer.listen(port).then(() => {
  console.log(`⚔️ Servidor FOG WAR online! Escutando na porta ${port}`);
});