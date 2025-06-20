// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Socket.IO DM logic
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a room for each user (userId sent from client)
  socket.on('join', (userId) => {
    socket.join(userId);
    socket.userId = userId;
    console.log(`User ${userId} joined their room.`);
  });

  // Handle sending a DM
  socket.on('dm', async ({ to, from, message, timestamp, media_url = null, media_type = null, file_name = null }) => {
    // Save to Supabase
    const { error } = await supabase.from('messages').insert([
      { sender_id: from, receiver_id: to, content: message, timestamp, media_url, media_type, file_name }
    ]);
    if (error) console.error('Supabase insert error:', error);
    // Emit to recipient's room
    io.to(to).emit('dm', { from, message, timestamp, media_url, media_type, file_name });
    // Optionally, emit to sender for echo
    socket.emit('dm', { from, message, timestamp, media_url, media_type, file_name });
  });

  // Handle pinning a DM message globally
  socket.on('pin', async (pinData) => {
    // Save to Supabase (already done on client, but safe to upsert here too)
    await supabase.from('pins').upsert([pinData]);
    // Broadcast to both users in the DM
    const { dm_id } = pinData;
    const [user1, user2] = dm_id.split('-');
    io.to(user1).emit('pin', pinData);
    io.to(user2).emit('pin', pinData);
  });

  // Handle deleting a DM message globally
  socket.on('delete', async ({ dm_id, timestamp }) => {
    // Remove from Supabase
    await supabase.from('messages').delete().eq('timestamp', timestamp).eq('dm_id', dm_id);
    // Broadcast to both users in the DM
    const [user1, user2] = dm_id.split('-');
    io.to(user1).emit('delete', timestamp);
    io.to(user2).emit('delete', timestamp);
  });

  // --- Server/Group Chat Logic ---
  socket.on('join-room', (room) => {
    socket.join(room);
    socket.currentRoom = room;
    console.log(`Socket ${socket.id} joined room ${room}`);
  });
  socket.on('leave-room', (room) => {
    socket.leave(room);
    if (socket.currentRoom === room) delete socket.currentRoom;
    console.log(`Socket ${socket.id} left room ${room}`);
  });
  socket.on('server-message', async (msg) => {
    // Save to Supabase
    const { error } = await supabase.from('channel_messages').insert([{
      server_id: msg.server_id,
      channel_id: msg.channel_id,
      user_id: msg.user_id,
      content: msg.content,
      timestamp: msg.timestamp
    }]);
    if (error) console.error('Supabase insert error:', error);
    // Broadcast to all users in the room except sender
    if (msg.room) {
      socket.to(msg.room).emit('server-message', msg);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// API endpoint to fetch message history between two users
app.get('/messages', async (req, res) => {
  const { user1, user2 } = req.query;
  if (!user1 || !user2) return res.status(400).json({ error: 'Missing user IDs' });
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`)
    .order('timestamp', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 