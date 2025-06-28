// voice_webrtc.js
// WebRTC voice logic for real-time voice streaming in channels
// Uses Socket.IO for signaling and the provided TURN server for ICE

import RNNoise from 'https://cdn.jsdelivr.net/npm/@jitsi/rnnoise-wasm@0.2.1/dist/rnnoise.js';

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

// --- RNNoise WASM Integration ---
let rnnoiseModule = null;
let denoisedStream = null;

async function loadRNNoise() {
  if (rnnoiseModule) return rnnoiseModule;
  rnnoiseModule = await RNNoise();
  return rnnoiseModule;
}

async function getLocalStream() {
  if (denoisedStream) return denoisedStream;
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
    const micStream = await navigator.mediaDevices.getUserMedia(constraints);
    await loadRNNoise();
    // Use AudioWorklet if available, else fallback to ScriptProcessorNode
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(micStream);
    let processor;
    let outputStream;
    if (window.MediaStreamTrackGenerator) {
      // Modern browsers: use MediaStreamTrackGenerator
      const generator = new window.MediaStreamTrackGenerator({ kind: 'audio' });
      const writer = generator.writable.getWriter();
      const workletUrl = 'rnnoise-worklet.js'; // You need to provide this file
      await audioCtx.audioWorklet.addModule(workletUrl);
      const rnnoiseNode = new AudioWorkletNode(audioCtx, 'rnnoise-worklet');
      source.connect(rnnoiseNode).connect(audioCtx.destination);
      rnnoiseNode.port.onmessage = async (event) => {
        if (event.data && event.data.audioBuffer) {
          await writer.write(event.data.audioBuffer);
        }
      };
      outputStream = new MediaStream([generator]);
    } else {
      // Fallback: ScriptProcessorNode (deprecated, but works)
      processor = audioCtx.createScriptProcessor(512, 1, 1);
      source.connect(processor);
      processor.connect(audioCtx.destination);
      const dest = audioCtx.createMediaStreamDestination();
      processor.connect(dest);
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const denoised = rnnoiseModule.process(input);
        e.outputBuffer.getChannelData(0).set(denoised);
      };
      outputStream = dest.stream;
    }
    denoisedStream = outputStream;
    console.log('[WebRTC] Mic access granted (RNNoise denoised)');
    return denoisedStream;
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
      // UI warning if not connected in 10s
      setTimeout(() => {
        if (!peers[from] || peers[from].connectionState !== 'connected') {
          let warn = document.getElementById('voice-signal-warn-' + from);
          if (!warn) {
            warn = document.createElement('div');
            warn.id = 'voice-signal-warn-' + from;
            warn.style.position = 'fixed';
            warn.style.bottom = '40px';
            warn.style.right = (8 + 120 * Object.keys(peers).indexOf(from)) + 'px';
            warn.style.background = '#c00';
            warn.style.color = '#fff';
            warn.style.padding = '6px 14px';
            warn.style.borderRadius = '6px';
            warn.style.zIndex = 9999;
            warn.style.fontSize = '15px';
            warn.textContent = 'Voice connection to ' + from + ' not established!';
            document.body.appendChild(warn);
          }
        }
      }, 10000);
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
      let warn = document.getElementById('voice-signal-warn-' + from);
      if (warn) warn.remove();
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