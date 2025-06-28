// voice_webrtc.js
// WebRTC voice logic for real-time voice streaming in channels
// Uses Socket.IO for signaling and the provided TURN server for ICE

const TURN_CONFIG = {
  iceServers: [
    {
      urls: 'turn:relay1.expressturn.com:3480',
      username: '000000002066459095',
      credential: 'nnidWPj5Cn1hOWAqPwhdjtnRbC4='
    },
    { urls: 'stun:stun.l.google.com:19302' } // Fallback for local testing
  ]
};

let localStream = null;
let peers = {}; // userId -> RTCPeerConnection
let currentChannelId = null;
let currentServerId = null;
let myUserId = null;
let isMuted = false;
let isDeafened = false;

// --- Capture mic audio ---
async function getLocalStream() {
  if (localStream) return localStream;
  try {
    console.log('[WebRTC] Requesting mic access...');
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    console.log('[WebRTC] Mic access granted');
    return localStream;
  } catch (err) {
    alert('Microphone access denied or unavailable.');
    console.error('[WebRTC] getUserMedia error:', err);
    throw err;
  }
}

// --- Join voice channel (start streaming) ---
async function joinVoiceChannel(serverId, channelId, userId, socket) {
  currentChannelId = channelId;
  currentServerId = serverId;
  myUserId = userId;
  const stream = await getLocalStream();
  // Tell server we want to connect to all peers in this channel
  socket.emit('voice-webrtc-join', { serverId, channelId, userId });
  isMuted = false;
  isDeafened = false;
}

// --- Handle signaling from server ---
function handleVoiceSignal(socket) {
  socket.on('voice-webrtc-signal', async ({ from, type, data }) => {
    console.log('[WebRTC] Signal received:', { from, type, data });
    if (from === myUserId) return;
    if (type === 'join') {
      // New peer joined, create a connection to them
      await createPeerConnection(from, socket, true);
      return;
    }
    if (!peers[from]) {
      await createPeerConnection(from, socket, false);
    }
    const pc = peers[from];
    if (type === 'offer') {
      console.log('[WebRTC] Received offer from', from);
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('voice-webrtc-signal', { to: from, from: myUserId, type: 'answer', data: answer });
      console.log('[WebRTC] Sent answer to', from);
    } else if (type === 'answer') {
      console.log('[WebRTC] Received answer from', from);
      await pc.setRemoteDescription(new RTCSessionDescription(data));
    } else if (type === 'candidate') {
      console.log('[WebRTC] Received candidate from', from);
      if (data) await pc.addIceCandidate(new RTCIceCandidate(data));
    } else if (type === 'leave') {
      console.log('[WebRTC] Peer left:', from);
      if (peers[from]) {
        peers[from].close();
        delete peers[from];
        const audio = document.getElementById('voice-audio-' + from);
        if (audio) audio.remove();
      }
    }
  });
}

// --- Create peer connection ---
async function createPeerConnection(peerId, socket, isInitiator) {
  if (peers[peerId]) return peers[peerId];
  const pc = new RTCPeerConnection(TURN_CONFIG);
  peers[peerId] = pc;
  const stream = await getLocalStream();
  stream.getTracks().forEach(track => pc.addTrack(track, stream));
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('[WebRTC] Sending candidate to', peerId);
      socket.emit('voice-webrtc-signal', { to: peerId, from: myUserId, type: 'candidate', data: event.candidate });
    }
  };
  pc.ontrack = (event) => {
    let audio = document.getElementById('voice-audio-' + peerId);
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'voice-audio-' + peerId;
      audio.autoplay = true;
      audio.style.display = 'none';
      document.body.appendChild(audio);
    }
    audio.srcObject = event.streams[0];
    setTimeout(updateRemoteAudioMute, 0);
    console.log('[WebRTC] Remote audio stream attached for', peerId);
  };
  pc.onconnectionstatechange = () => {
    console.log('[WebRTC] Peer connection state with', peerId, ':', pc.connectionState);
  };
  // Initiator logic: always let the peer who receives the join create the offer
  if (isInitiator) {
    console.log('[WebRTC] Creating offer for', peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('voice-webrtc-signal', { to: peerId, from: myUserId, type: 'offer', data: offer });
    console.log('[WebRTC] Sent offer to', peerId);
  }
  return pc;
}

// --- Leave voice channel (cleanup) ---
function leaveVoiceChannel(socket) {
  Object.entries(peers).forEach(([peerId, pc]) => {
    pc.close();
    delete peers[peerId];
    const audio = document.getElementById('voice-audio-' + peerId);
    if (audio) audio.remove();
    console.log('[WebRTC] Closed connection and removed audio for', peerId);
  });
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
    console.log('[WebRTC] Stopped local stream');
  }
  socket.emit('voice-webrtc-leave', { serverId: currentServerId, channelId: currentChannelId, userId: myUserId });
  currentChannelId = null;
  currentServerId = null;
  myUserId = null;
  isMuted = false;
  isDeafened = false;
}

// --- Mute/unmute local mic ---
function setMute(mute) {
  isMuted = mute;
  if (localStream) {
    localStream.getAudioTracks().forEach(track => track.enabled = !mute);
  }
}

// --- Deafen/undeafen (mute/unmute all remote audio) ---
function setDeafen(deafen) {
  isDeafened = deafen;
  document.querySelectorAll('[id^="voice-audio-"]').forEach(audio => {
    audio.muted = deafen;
  });
}

// --- Update remote audio mute on new streams ---
function updateRemoteAudioMute() {
  document.querySelectorAll('[id^="voice-audio-"]').forEach(audio => {
    audio.muted = isDeafened;
  });
}

// --- Exported functions ---
window.voiceWebRTC = {
  joinVoiceChannel,
  leaveVoiceChannel,
  handleVoiceSignal,
  setMute,
  setDeafen
}; 