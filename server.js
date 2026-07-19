const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "*", // Permite conexiones desde tu GitHub Pages
    methods: ["GET", "POST"]
  }
});

let danielSocketId = null;
let giselSocketId = null;

io.on('connection', (socket) => {
  console.log('Dispositivo conectado:', socket.id);

  socket.on('register', (username) => {
    if (username === 'daniel') {
      danielSocketId = socket.id;
      console.log("Daniel registrado");
    } else if (username === 'gisel') {
      giselSocketId = socket.id;
      console.log("Gisel registrada");
    }
  });

  socket.on('relay-signaling', ({ target, payload }) => {
    const targetId = (target === 'daniel') ? danielSocketId : giselSocketId;
    if (targetId) {
      io.to(targetId).emit('signaling-message', { payload });
    }
  });

  socket.on('disconnect', () => {
    if (socket.id === danielSocketId) {
      danielSocketId = null;
      console.log("Daniel se ha desconectado");
    }
    if (socket.id === giselSocketId) {
      giselSocketId = null;
      console.log("Gisel se ha desconectado");
    }
  });
});

// Render asigna dinámicamente un puerto mediante la variable de entorno PORT
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Servidor de señalización corriendo en el puerto ${PORT}`);
});
