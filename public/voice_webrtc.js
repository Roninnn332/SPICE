// voice_webrtc.js
// WebRTC voice logic for real-time voice streaming in channels
// Uses Socket.IO for signaling and the provided TURN server for ICE

const TURN_CONFIG = {
  iceServers: [
    {
      urls: 'turn:relay1.expressturn.com:3480',
      username: '000000002066459095',
      credential: 'nnidWPj5Cn1hOWAqPwhdjtnRbC4='
    }
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
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    return localStream;
  } catch (err) {
    alert('Microphone access denied or unavailable.');
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
    if (from === myUserId) return;
    if (!peers[from]) {
      await createPeerConnection(from, socket);
    }
    const pc = peers[from];
    if (type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('voice-webrtc-signal', { to: from, from: myUserId, type: 'answer', data: answer });
    } else if (type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data));
    } else if (type === 'candidate') {
      if (data) await pc.addIceCandidate(new RTCIceCandidate(data));
    }
  });
}

// --- Create peer connection ---
async function createPeerConnection(peerId, socket) {
  const pc = new RTCPeerConnection(TURN_CONFIG);
  peers[peerId] = pc;
  const stream = await getLocalStream();
  stream.getTracks().forEach(track => pc.addTrack(track, stream));
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('voice-webrtc-signal', { to: peerId, from: myUserId, type: 'candidate', data: event.candidate });
    }
  };
  pc.ontrack = (event) => {
    // Play remote audio
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
  };
  // If we are the initiator, create offer
  if (myUserId < peerId) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('voice-webrtc-signal', { to: peerId, from: myUserId, type: 'offer', data: offer });
  }
  return pc;
}

// --- Leave voice channel (cleanup) ---
function leaveVoiceChannel(socket) {
  Object.values(peers).forEach(pc => pc.close());
  peers = {};
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  // Remove remote audio elements
  document.querySelectorAll('[id^="voice-audio-"]').forEach(el => el.remove());
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