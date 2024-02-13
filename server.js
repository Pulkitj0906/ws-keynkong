require("dotenv").config();
const express = require('express')
const app = express()
const http = require("http");
const server = http.createServer(app);
const socketIo = require("socket.io");
const { MongoClient } = require("mongodb");

const url = process.env.DB_URL;
const client = new MongoClient(url);

const io = socketIo(server, {
  cors: {
    origin: "*",
  },
});

io.use(async (socket, next) => {
  socket.username = socket.handshake.auth.name;

  const monkeyCollection = client.db("jungles").collection("monkeys");
  const monkeyExists = await monkeyCollection.findOne({name: socket.username})
  if(!monkeyExists) {
    console.log('new user')
    await monkeyCollection.insertOne({name: socket.username})
    next();
  }
  else {
    next(new Error('User already exists'))
  }
});

io.on("connection", async (socket) => {
  console.log("client connected with socketId:", socket.username);
  io.to(socket.id).emit('connected')
  try {
    await client.connect();
    console.log("MongoClient connected");
  } catch (e) {
    console.log('MongoClient unable to connect');
  }
  
  socket.on("joinJungle", async (treeId) => {
    try {
      const treeCollection = client.db("jungles").collection("trees");
      const treeExists = await treeCollection.findOne({ treeId: treeId });
      if (treeExists && Object.keys(treeExists).length >= 4) {
        socket.emit("Noti", "Room is full");
      } else {
        socket.join(treeId);
        if (!treeExists) {
          await treeCollection.insertOne({
            treeId: treeId,
            monkey1: socket.username,
          });
        } else {
          await treeCollection.updateOne(
            { treeId: treeId },
            { $set: { monkey2: socket.username } }
          );
          const updatedTree = await treeCollection.findOne({ treeId: treeId });
          io.in(treeId).emit("start", updatedTree);
        }
        console.log(socket.username, "joined the jungle", treeId);
      }
    } catch (e) {
      console.log('Problem in joining the tree');
    }
  });

  socket.on('type', async (d) => {
    const treeCollection = client.db('jungles').collection('trees')
    const currTree = await treeCollection.findOne({$or:[{'monkey1': socket.username}, {'monkey2': socket.username}]})
    if(currTree) {
      const currTreeId = currTree.treeId
      socket.to(currTreeId).emit('update', d)
    }
  })

  socket.on('gameOver', async () => {
    const treeCollection = client.db('jungles').collection('trees')
    const currTree = await treeCollection.findOne({$or:[{'monkey1': socket.username}, {'monkey2': socket.username}]})
    if(currTree) {
      socket.to(currTree.treeId).emit('gameEnd', )
    }
  })

  socket.on("disconnect", () => {
    console.log(socket.username, "disconnected from the server");
  });
});

server.listen(3001, () => {
  console.log("listening on port 3001");
});
