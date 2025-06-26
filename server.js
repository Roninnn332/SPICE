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

// Track voice participants in memory (optional reset on restart)
const voiceParticipants = {}; // key = roomId, value = Set of users

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

  socket.on('voice_join', ({ serverId, channelId, user }) => {
    const roomId = `voice-${serverId}-${channelId}`;
    socket.join(roomId);
    socket.voiceRoomId = roomId;
    socket.userInfo = user;

    if (!voiceParticipants[roomId]) {
      voiceParticipants[roomId] = new Set();
    }
    voiceParticipants[roomId].add(JSON.stringify(user));

    const participants = Array.from(voiceParticipants[roomId]);

    // Send full list to EVERYONE in the room (including the joiner)
    io.to(roomId).emit('voice_user_joined', participants);

    // Debug log: show usernames
    try {
      const names = participants.map(u => JSON.parse(u).username);
      console.log(`[voice_join] ${user.username} joined. Participants now:`, names);
    } catch (e) {
      console.log(`[voice_join] ${user.username} joined. Participants now:`, participants);
    }
  });

  socket.on('voice_leave', () => {
    const roomId = socket.voiceRoomId;
    const user = socket.userInfo;
    if (roomId && user && voiceParticipants[roomId]) {
      voiceParticipants[roomId].delete(JSON.stringify(user));
      // Debug logging
      console.log(`[voice_leave] roomId: ${roomId}, user:`, user);
      console.log(`[voice_leave] participants:`, Array.from(voiceParticipants[roomId]));
      io.to(roomId).emit('voice_user_joined', Array.from(voiceParticipants[roomId]));
    }
    socket.leave(roomId);
    delete socket.voiceRoomId;
  });

  socket.on('disconnect', () => {
    if (socket.voiceRoomId && socket.userInfo) {
      const roomId = socket.voiceRoomId;
      voiceParticipants[roomId]?.delete(JSON.stringify(socket.userInfo));
      // Debug logging
      console.log(`[disconnect] roomId: ${roomId}, user:`, socket.userInfo);
      console.log(`[disconnect] participants:`, Array.from(voiceParticipants[roomId]));
      io.to(roomId).emit('voice_user_joined', Array.from(voiceParticipants[roomId]));
    }
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