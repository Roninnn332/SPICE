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

// --- Voice Channel Presence ---
// Key: voice room string (e.g., 'voice-server-123-channel-456')
// Value: Set of user objects ({ userId, username, avatar_url })
const voiceChannelUsers = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a room for each user (userId sent from client)
  socket.on('join', (userId) => {
    socket.join(userId);
    socket.userId = userId;
    console.log(`User ${userId} joined their room.`);
  });

  // --- CHANNEL CHAT LOGIC ---
  // Store voice channel users globally
  // Key: voice room string (e.g., 'voice-server-123-channel-456')
  // Value: Set of user objects ({ userId, username, avatar_url })
  function getVoiceRoom(serverId, channelId) {
    return `voice-server-${serverId}-channel-${channelId}`;
  }

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
  socket.on('voice_join', ({ serverId, channelId, user }) => {
    const room = getVoiceRoom(serverId, channelId);
    socket.join(room);
    socket.voiceRoom = room; // Store the voice room this socket is in
    socket.voiceUser = user; // Store the user object associated with this socket for voice

    // Add user to the Set for this channel
    if (!voiceChannelUsers.has(room)) {
      voiceChannelUsers.set(room, new Set());
    }
    const usersSet = voiceChannelUsers.get(room);

    // Remove any previous entry for this user to avoid duplicates if they rejoin
    for (let existingUser of usersSet) {
      if (existingUser.userId === user.userId) {
        usersSet.delete(existingUser);
        break;
      }
    }
    usersSet.add(user);

    // Broadcast the updated list of users in this voice channel to everyone in that room
    const userList = Array.from(usersSet);
    io.to(room).emit('voice_state', userList);
    console.log(`User ${user.username} joined voice channel ${room}. Current users:`, userList.map(u => u.username));
  });

  socket.on('voice_leave', ({ serverId, channelId, userId }) => {
    const room = getVoiceRoom(serverId, channelId);
    socket.leave(room);

    if (voiceChannelUsers.has(room)) {
      const usersSet = voiceChannelUsers.get(room);
      // Remove the specific user from the set
      for (let existingUser of usersSet) {
        if (existingUser.userId === userId) {
          usersSet.delete(existingUser);
          break;
        }
      }
      // Broadcast the updated list
      io.to(room).emit('voice_state', Array.from(usersSet));
      console.log(`User ${userId} left voice channel ${room}. Current users:`, Array.from(usersSet).map(u => u.username));
    }

    // Clean up socket's voice state
    if (socket.voiceRoom === room) {
      delete socket.voiceRoom;
      delete socket.voiceUser;
    }
  });

  socket.on('request_voice_state', ({ serverId, channelId }) => {
    const room = getVoiceRoom(serverId, channelId);
    if (voiceChannelUsers.has(room)) {
      io.to(socket.id).emit('voice_state', Array.from(voiceChannelUsers.get(room)));
    } else {
      io.to(socket.id).emit('voice_state', []);
    }
  });


  socket.on('disconnect', () => {
    // Remove user from all channels they were in
    if (socket.voiceRoom && voiceChannelUsers.has(socket.voiceRoom)) {
      const usersSet = voiceChannelUsers.get(socket.voiceRoom);
      const userId = socket.voiceUser && socket.voiceUser.userId;
      if (userId) {
        for (const u of usersSet) {
          if (u.userId === userId) {
            usersSet.delete(u);
            break;
          }
        }
        // Broadcast the updated list to the channel users if any users remain
        io.to(socket.voiceRoom).emit('voice_state', Array.from(usersSet));
        console.log(`User ${userId} disconnected from voice channel ${socket.voiceRoom}. Current users:`, Array.from(usersSet).map(u => u.username));
      }
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