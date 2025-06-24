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

// --- Voice Channel Presence (GLOBAL) ---
const voiceChannelUsers = {}; // Structure: { 'voice-server-X-channel-Y': [{ userId, username, avatar_url }, ...] }

// Socket.IO DM logic
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a room for each user (userId sent from client)
  socket.on('join', (userId) => {
    socket.join(userId);
    socket.userId = userId;
    console.log(`User ${userId} joined their room.`);
  });

  // --- CHANNEL CHAT LOGIC ---
  // Join a channel room
  socket.on('join_channel', ({ serverId, channelId }) => {
    const room = `server-${serverId}-channel-${channelId}`;
    socket.join(room);
    socket.currentChannelRoom = room;
    console.log(`Socket ${socket.id} joined channel room ${room}`);
  });

  // Leave a channel room
  socket.on('leave_channel', ({ serverId, channelId }) => {
    const room = `server-${serverId}-channel-${channelId}`;
    socket.leave(room);
    if (socket.currentChannelRoom === room) delete socket.currentChannelRoom;
    console.log(`Socket ${socket.id} left channel room ${room}`);
  });

  // Handle sending a channel message
  socket.on('channel_message', async ({ serverId, channelId, userId, username, avatar_url, content, timestamp }) => {
    // Save to Supabase
    const { error } = await supabase.from('channel_messages').insert([
      {
        channel_id: channelId,
        user_id: userId,
        content,
        created_at: new Date().toISOString()
      }
    ]);
    if (error) console.error('Supabase insert error (channel_message):', error);
    // Broadcast to all in the channel room
    const room = `server-${serverId}-channel-${channelId}`;
    io.to(room).emit('channel_message', {
      serverId, channelId, userId, username, avatar_url, content, timestamp
    });
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

  // --- Voice Channel Presence ---
  function getVoiceRoom(serverId, channelId) {
    return `voice-server-${serverId}-channel-${channelId}`;
  }

  socket.on('join_voice_channel', ({ serverId, channelId }) => {
    const room = getVoiceRoom(serverId, channelId);
    socket.join(room);
    socket.voiceRoom = room;
    // Always initialize the room array
    if (!voiceChannelUsers[room]) {
      voiceChannelUsers[room] = [];
    }
    // Send current state to the joining user
    socket.emit('voice_state', voiceChannelUsers[room]);
    console.log(`Socket ${socket.id} joined voice channel room ${room}`);
  });

  socket.on('voice_join', ({ serverId, channelId, user }) => {
    const room = getVoiceRoom(serverId, channelId);
    if (!voiceChannelUsers[room]) {
      voiceChannelUsers[room] = [];
    }
    // Set socket.voiceUser for disconnect handling
    socket.voiceUser = {
      userId: user.userId,
      username: user.username,
      avatar_url: user.avatar_url
    };
    // Check if user already exists in the room to prevent duplicates
    const existingIndex = voiceChannelUsers[room].findIndex(u => String(u.userId) === String(user.userId));
    if (existingIndex >= 0) {
      // Update existing user's info
      voiceChannelUsers[room][existingIndex] = socket.voiceUser;
    } else {
      // Add new user
      voiceChannelUsers[room].push(socket.voiceUser);
    }
    // Broadcast the updated state to all in the room
    io.to(room).emit('voice_state', voiceChannelUsers[room]);
    console.log(`Voice state update for room ${room} (JOIN):`, voiceChannelUsers[room]);
  });

  socket.on('voice_leave', ({ serverId, channelId, userId }) => {
    const room = getVoiceRoom(serverId, channelId);
    if (voiceChannelUsers[room]) {
      voiceChannelUsers[room] = voiceChannelUsers[room].filter(u => String(u.userId) !== String(userId));
      io.to(room).emit('voice_state', voiceChannelUsers[room]);
      console.log(`Voice state update for room ${room} (LEAVE):`, voiceChannelUsers[room]);
      // Clean up empty rooms
      if (voiceChannelUsers[room].length === 0) {
        delete voiceChannelUsers[room];
        console.log(`Voice room ${room} is empty and cleaned up.`);
      }
    }
    if (socket.voiceRoom === room) {
      delete socket.voiceRoom;
      delete socket.voiceUser;
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.voiceRoom && socket.voiceUser && socket.voiceUser.userId) {
      const room = socket.voiceRoom;
      const userId = socket.voiceUser.userId;
      if (voiceChannelUsers[room]) {
        voiceChannelUsers[room] = voiceChannelUsers[room].filter(u => String(u.userId) !== String(userId));
        io.to(room).emit('voice_state', voiceChannelUsers[room]);
        console.log(`Voice state update for room ${room} (DISCONNECT):`, voiceChannelUsers[room]);
        if (voiceChannelUsers[room].length === 0) {
          delete voiceChannelUsers[room];
          console.log(`Voice room ${room} is empty and cleaned up on disconnect.`);
        }
      }
    }
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