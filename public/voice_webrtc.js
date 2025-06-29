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
let handleSignalSetup = false;
let signalingTimeouts = {};

// --- Capture mic audio ---
async function getLocalStream() {
  if (localStream) return localStream;
  try {
    console.log('[WebRTC] Requesting mic access...');
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000,
        sampleSize: 16
      },
      video: false
    };
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
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
  socket.emit('voice-webrtc-join', { serverId, channelId, userId });
  isMuted = false;
  isDeafened = false;
  // Wait 500ms to ensure server mapping is ready
  await new Promise(res => setTimeout(res, 500));
}

// --- Handle signaling from server ---
function handleVoiceSignal(socket) {
  if (handleSignalSetup) return;
  handleSignalSetup = true;
  socket.on('voice-webrtc-signal', async ({ from, type, data }) => {
    console.log('[WebRTC] Signal received:', { from, type, data });
    if (from === myUserId) return;
    if (type === 'join') {
      await createPeerConnection(from, socket, true);
      // Fallback: if no offer/answer in 5s, retry
      if (signalingTimeouts[from]) clearTimeout(signalingTimeouts[from]);
      signalingTimeouts[from] = setTimeout(() => {
        if (!peers[from] || peers[from].connectionState !== 'connected') {
          console.warn('[WebRTC] No offer/answer after join, retrying signaling with', from);
          createPeerConnection(from, socket, true);
        }
      }, 5000);
      return;
    }
    if (!peers[from]) {
      await createPeerConnection(from, socket, false);
    }
    const pc = peers[from];
    if (type === 'offer') {
      if (signalingTimeouts[from]) clearTimeout(signalingTimeouts[from]);
      console.log('[WebRTC] Received offer from', from);
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('voice-webrtc-signal', { to: from, from: myUserId, type: 'answer', data: answer });
      console.log('[WebRTC] Sent answer to', from);
    } else if (type === 'answer') {
      if (signalingTimeouts[from]) clearTimeout(signalingTimeouts[from]);
      console.log('[WebRTC] Received answer from', from);
      await pc.setRemoteDescription(new RTCSessionDescription(data));
    } else if (type === 'candidate') {
      console.log('[WebRTC] Received candidate from', from);
      if (data) await pc.addIceCandidate(new RTCIceCandidate(data));
    } else if (type === 'leave') {
      if (signalingTimeouts[from]) clearTimeout(signalingTimeouts[from]);
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
    audio.muted = false;
    audio.play().catch(err => console.warn('Audio play blocked:', err));
    if (event.track) {
      console.log('[WebRTC] Remote audio track settings:', event.track.getSettings());
    }
    setTimeout(updateRemoteAudioMute, 0);
    console.log('[WebRTC] Remote audio stream attached for', peerId);
  };
  pc.onconnectionstatechange = () => {
    console.log('[WebRTC] Peer connection state with', peerId, ':', pc.connectionState);
    updateConnectionStateUI(peerId, pc.connectionState);
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      // Try ICE restart
      if (isInitiator) {
        pc.createOffer({ iceRestart: true }).then(offer => {
          pc.setLocalDescription(offer);
          socket.emit('voice-webrtc-signal', { to: peerId, from: myUserId, type: 'offer', data: offer });
          console.log('[WebRTC] ICE restart offer sent to', peerId);
        });
      }
    }
  };
  if (isInitiator) {
    console.log('[WebRTC] Creating offer for', peerId);
    let offer = await pc.createOffer();
    // Prefer Opus, set minptime/ptime for low latency, and set audio bandwidth
    let updatedSdp = offer.sdp.replace('useinbandfec=1', 'useinbandfec=1; minptime=10; ptime=10');
    updatedSdp = updatedSdp.replace(/a=mid:audio\r\n/, 'a=mid:audio\r\nb=AS:128\r\n');
    await pc.setLocalDescription({ type: 'offer', sdp: updatedSdp });
    socket.emit('voice-webrtc-signal', { to: peerId, from: myUserId, type: 'offer', data: { type: 'offer', sdp: updatedSdp } });
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

// Add UI indicator for connection state
function updateConnectionStateUI(peerId, state) {
  let el = document.getElementById('voice-conn-state-' + peerId);
  if (!el) {
    el = document.createElement('div');
    el.id = 'voice-conn-state-' + peerId;
    el.style.position = 'fixed';
    el.style.bottom = '8px';
    el.style.right = (8 + 120 * Object.keys(peers).indexOf(peerId)) + 'px';
    el.style.background = '#222';
    el.style.color = '#fff';
    el.style.padding = '4px 10px';
    el.style.borderRadius = '6px';
    el.style.zIndex = 9999;
    el.style.fontSize = '14px';
    document.body.appendChild(el);
  }
  el.textContent = 'Peer ' + peerId + ': ' + state;
}

// --- Exported functions ---
window.voiceWebRTC = {
  joinVoiceChannel,
  leaveVoiceChannel,
  handleVoiceSignal,
  setMute,
  setDeafen
}; 