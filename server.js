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
const voiceParticipants = {}; // key = roomId, value = Map of user_id -> user object

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
  socket.on('join_channel', ({ serverId, channelId, userId }) => {
    const room = `server-${serverId}-channel-${channelId}`;
    socket.join(room);
    socket.currentChannelRoom = room;
    // Set these for WebRTC relay
    socket.voiceWebRTCRoomId = `voice-${serverId}-${channelId}`;
    if (userId) socket.voiceWebRTCUserId = userId;
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
        created_at: new Date(Number(timestamp)).toISOString()
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
    // Add micOn and deafenOn state
    const userWithState = {
      ...user,
      micOn: true,
      deafenOn: false
    };
    socket.userInfo = userWithState;
    if (!voiceParticipants[roomId]) {
      voiceParticipants[roomId] = new Map();
    }
    voiceParticipants[roomId].set(String(user.user_id), userWithState);
    const participants = Array.from(voiceParticipants[roomId].values());
    io.to(roomId).emit('voice_user_joined', participants);

    // Debug log: show usernames
    try {
      const names = participants.map(u => u.username);
      console.log(`[voice_join] ${user.username} joined. Participants now:`, names);
    } catch (e) {
      console.log(`[voice_join] ${user.username} joined. Participants now:`, participants);
    }
  });

  // Handle mic/deafen state update
  socket.on('voice_state_update', ({ micOn, deafenOn }) => {
    const roomId = socket.voiceRoomId;
    if (!roomId || !socket.userInfo) return;
    const userId = String(socket.userInfo.user_id);
    if (voiceParticipants[roomId] && voiceParticipants[roomId].has(userId)) {
      const user = voiceParticipants[roomId].get(userId);
      user.micOn = micOn;
      user.deafenOn = deafenOn;
      socket.userInfo.micOn = micOn;
      socket.userInfo.deafenOn = deafenOn;
      // Broadcast updated list
      const participants = Array.from(voiceParticipants[roomId].values());
      io.to(roomId).emit('voice_user_joined', participants);
    }
  });

  socket.on('voice_leave', () => {
    const roomId = socket.voiceRoomId;
    const user = socket.userInfo;
    if (roomId && user && voiceParticipants[roomId]) {
      voiceParticipants[roomId].delete(String(user.user_id));
      // Debug logging
      console.log(`[voice_leave] roomId: ${roomId}, user:`, user);
      console.log(`[voice_leave] participants:`, Array.from(voiceParticipants[roomId].values()));
      io.to(roomId).emit('voice_user_joined', Array.from(voiceParticipants[roomId].values()));
    }
    socket.leave(roomId);
    delete socket.voiceRoomId;
  });

  socket.on('disconnect', () => {
    if (socket.voiceRoomId && socket.userInfo) {
      const roomId = socket.voiceRoomId;
      voiceParticipants[roomId]?.delete(String(socket.userInfo.user_id));
      // Debug logging
      console.log(`[disconnect] roomId: ${roomId}, user:`, socket.userInfo);
      console.log(`[disconnect] participants:`, Array.from(voiceParticipants[roomId]?.values() || []));
      io.to(roomId).emit('voice_user_joined', Array.from(voiceParticipants[roomId]?.values() || []));
    }
    console.log('User disconnected:', socket.id);
  });

  // --- WebRTC Voice Signaling ---
  socket.on('voice-webrtc-join', ({ serverId, channelId, userId }) => {
    const roomId = `voice-${serverId}-${channelId}`;
    socket.join(roomId);
    socket.voiceWebRTCRoomId = roomId;
    socket.voiceWebRTCUserId = userId;
    console.log('[SIGNAL] voice-webrtc-join:', { serverId, channelId, userId, socketId: socket.id });

    // Notify all existing peers (except the new one) that a new peer joined
    socket.to(roomId).emit('voice-webrtc-signal', { from: userId, type: 'join' });

    // Notify the new peer about all existing peers in the room
    for (const [id, s] of Object.entries(io.sockets.sockets)) {
      if (
        s.id !== socket.id &&
        s.voiceWebRTCRoomId === roomId &&
        s.voiceWebRTCUserId // only if they have joined
      ) {
        socket.emit('voice-webrtc-signal', { from: s.voiceWebRTCUserId, type: 'join' });
      }
    }
  });

  socket.on('voice-webrtc-signal', ({ to, from, type, data }) => {
    for (const [id, s] of io.of('/').sockets) {
      if (s.voiceWebRTCUserId === to) {
        s.emit('voice-webrtc-signal', { from, type, data });
        break;
      }
    }
  });

  socket.on('voice-webrtc-leave', ({ serverId, channelId, userId }) => {
    const roomId = `voice-${serverId}-${channelId}`;
    socket.leave(roomId);
    // Notify others in the room that this user left
    socket.to(roomId).emit('voice-webrtc-signal', { from: userId, type: 'leave' });
    console.log('[SIGNAL] voice-webrtc-leave:', { serverId, channelId, userId, socketId: socket.id });
    delete socket.voiceWebRTCRoomId;
    delete socket.voiceWebRTCUserId;
  });

  // --- CHANNEL MESSAGE EDIT ---
  socket.on('channel_message_edit', async ({ serverId, channelId, timestamp, userId, newContent }) => {
    // Only allow editing own messages (or owner, if you want to add that logic)
    // Update in Supabase
    const { error } = await supabase
      .from('channel_messages')
      .update({ content: newContent, edited: true })
      .eq('channel_id', channelId)
      .eq('user_id', userId)
      .eq('created_at', new Date(Number(timestamp)).toISOString());
    if (error) console.error('Supabase update error (channel_message_edit):', error);
    // Broadcast to all in the channel room
    const room = `server-${serverId}-channel-${channelId}`;
    io.to(room).emit('channel_message_edit', {
      serverId, channelId, timestamp, userId, newContent, edited: true
    });
  });

  // --- CHANNEL MESSAGE DELETE ---
  socket.on('channel_message_delete', async ({ serverId, channelId, timestamp, userId }) => {
    // Only allow deleting own messages or if user is owner (add owner check if needed)
    // Delete from Supabase
    const { error } = await supabase
      .from('channel_messages')
      .delete()
      .eq('channel_id', channelId)
      .eq('created_at', new Date(Number(timestamp)).toISOString());
    if (error) console.error('Supabase delete error (channel_message_delete):', error);
    // Broadcast to all in the channel room
    const room = `server-${serverId}-channel-${channelId}`;
    io.to(room).emit('channel_message_delete', {
      serverId, channelId, timestamp, userId
    });
  });

  // --- CHANNEL MESSAGE REPLY ---
  socket.on('channel_message_reply', async ({ serverId, channelId, userId, username, avatar_url, content, timestamp, reply }) => {
    // Save to Supabase (store reply info as JSON if you want, or just as content)
    const { error } = await supabase.from('channel_messages').insert([
      {
        channel_id: channelId,
        user_id: userId,
        content,
        created_at: new Date(Number(timestamp)).toISOString(),
        reply_to: reply?.timestamp || null,
        reply_content: reply?.content || null
      }
    ]);
    if (error) console.error('Supabase insert error (channel_message_reply):', error);
    // Broadcast to all in the channel room
    const room = `server-${serverId}-channel-${channelId}`;
    io.to(room).emit('channel_message_reply', {
      serverId, channelId, userId, username, avatar_url, content, timestamp, reply
    });
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