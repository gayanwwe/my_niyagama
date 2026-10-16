import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../service/api.ts';
import { Icons } from '../constants.tsx';
import type { 
  DashboardNotice, 
  DashboardEvent, 
  DashboardVideo, 
  DashboardEmergencyAlert, 
  DashboardSettings,
  Officer
} from '../types.ts';
import { format } from 'date-fns';

interface PublicDashboardControlProps {
  user: Officer;
  lang: 'EN' | 'SI';
}

const PublicDashboardControl: React.FC<PublicDashboardControlProps> = ({ user, lang }) => {
  const [activeTab, setActiveTab] = useState<'notices' | 'events' | 'videos' | 'alerts' | 'settings' | 'officers' | 'live'>(() => {
    const hashParts = window.location.hash.split('?');
    const searchParams = new URLSearchParams(hashParts[1] || window.location.search);
    const tabParam = searchParams.get('tab');
    if (tabParam === 'live') return 'live';
    if (tabParam === 'notices' || tabParam === 'events' || tabParam === 'videos' || tabParam === 'alerts' || tabParam === 'settings' || tabParam === 'officers') {
      return tabParam as any;
    }
    return 'notices';
  });
  const [notices, setNotices] = useState<DashboardNotice[]>([]);
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [videos, setVideos] = useState<DashboardVideo[]>([]);
  const [alerts, setAlerts] = useState<DashboardEmergencyAlert[]>([]);
  const [settings, setSettings] = useState<DashboardSettings | null>(null);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [noticeForm, setNoticeForm] = useState({ content: '' });
  const [eventForm, setEventForm] = useState({ title: '', event_date: '', event_time: '', location: '', image_url: '' });
  /** null when no upload is running; 0-100 while one is. */
  const [imageUploadPercent, setImageUploadPercent] = useState<number | null>(null);
  /** The image shown full size over the page, or null. */
  const [previewImage, setPreviewImage] = useState<{ url: string; title?: string } | null>(null);
  const [videoForm, setVideoForm] = useState({ video_url: '' });
  const [alertForm, setAlertForm] = useState({ message: '' });

  // --- Advanced Live Studio States ---
  const [isRigMode, setIsRigMode] = useState(false);
  const [isCameraInitialized, setIsCameraInitialized] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [streamQuality, setStreamQuality] = useState<'1080p' | '720p' | '480p'>('720p');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);

  // Custom filters & layout parameters
  const [digitalZoom, setDigitalZoom] = useState(1);
  const [isMirrored, setIsMirrored] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [videoFilters, setVideoFilters] = useState({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    grayscale: 0,
  });

  // Track constraints and hardware capabilities
  const [videoTrack, setVideoTrack] = useState<MediaStreamTrack | null>(null);
  const [hasZoom, setHasZoom] = useState(false);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 10, step: 0.1 });
  const [zoomValue, setZoomValue] = useState(1);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchValue, setTorchValue] = useState(false);

  // Mute & Pause
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoPaused, setIsVideoPaused] = useState(false);

  // Audio level and diagnostics
  const [audioLevel, setAudioLevel] = useState(0); // 0 to 100
  const [micGain, setMicGain] = useState(1.0);
  const [broadcastUptime, setBroadcastUptime] = useState(0);
  const [bytesSent, setBytesSent] = useState(0);
  const [wsControlStatus, setWsControlStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [studioLogs, setStudioLogs] = useState<string[]>([]);

  // Refs for audio analyser and encoders
  const localPreviewVideoRef = React.useRef<HTMLVideoElement>(null);
  const broadcasterSocketRef = React.useRef<WebSocket | null>(null);
  const localStreamRef = React.useRef<MediaStream | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const gainNodeRef = React.useRef<GainNode | null>(null);
  const uptimeIntervalRef = React.useRef<any>(null);
  const peerConnectionsRef = React.useRef<Map<string, RTCPeerConnection>>(new Map());
  const pollingIntervalRef = React.useRef<any>(null);
  const isSocketIntentionalCloseRef = React.useRef<boolean>(false);
  const frameCaptureIntervalRef = React.useRef<any>(null);

  // The broadcast surface is no longer open: pushing frames, registering as the
  // host and speaking as the broadcaster all require a display operator token.
  const authToken = () => localStorage.getItem('niyagama_token') || '';
  const authHeaders = () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken()}` });

  const addStudioLog = (message: string) => {
    setStudioLogs(prev => [
      `[${new Date().toLocaleTimeString()}] ${message}`,
      ...prev.slice(0, 19)
    ]);
  };

  // 1. Core Media Stream Spun up & Setup
  const initializeStudioFeed = async (camId?: string, micId?: string, forceFacing?: 'user' | 'environment') => {
    setBroadcastError(null);
    try {
      addStudioLog("Initializing studio hardware modules...");
      
      // Stop previous streams cleanly
      const oldStream = localStream || localStreamRef.current;
      if (oldStream) {
        try { oldStream.getTracks().forEach(t => t.stop()); } catch(e) {}
      }
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch(e) {}
      }

      const activeFacing = forceFacing || facingMode;
      const constraints: MediaStreamConstraints = {
        video: camId 
          ? { deviceId: { exact: camId } } 
          : { facingMode: activeFacing },
        audio: micId ? { deviceId: { exact: micId } } : true
      };

      // Set responsive height and width base on quality select
      const widthMap = { '1080p': 1920, '720p': 1280, '480p': 640 };
      const heightMap = { '1080p': 1080, '720p': 720, '480p': 480 };
      const targetW = widthMap[streamQuality];
      const targetH = heightMap[streamQuality];

      if (typeof constraints.video === 'object') {
        const vObj = constraints.video as any;
        vObj.width = { ideal: targetW };
        vObj.height = { ideal: targetH };
        vObj.frameRate = { ideal: 24 };
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      localStreamRef.current = stream;
      setIsCameraInitialized(true);
      addStudioLog("Media stream captured successfully.");

      // Enumerate available equipment after giving access (gesture approved)
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter(d => d.kind === 'videoinput');
      const audioInputs = allDevices.filter(d => d.kind === 'audioinput');
      setDevices(videoInputs);
      setMicDevices(audioInputs);

      // Track active camera configurations
      const activeVideoTrack = stream.getVideoTracks()[0];
      if (activeVideoTrack) {
        setVideoTrack(activeVideoTrack);
        setIsVideoPaused(!activeVideoTrack.enabled);
        
        const settingsObj = activeVideoTrack.getSettings?.();
        if (settingsObj) {
          if (settingsObj.deviceId && !camId) setSelectedDeviceId(settingsObj.deviceId);
          if (settingsObj.facingMode) setFacingMode(settingsObj.facingMode as any);
        }

        // Hardware details: Zoom
        const capabilities = activeVideoTrack.getCapabilities?.() as any;
        if (capabilities && capabilities.zoom) {
          setHasZoom(true);
          setZoomRange({
            min: capabilities.zoom.min || 1,
            max: capabilities.zoom.max || 10,
            step: capabilities.zoom.step || 0.1
          });
          setZoomValue((settingsObj as any)?.zoom || 1);
          addStudioLog("Hardware zoom features detected & connected.");
        } else {
          setHasZoom(false);
        }

        // Hardware details: Torch (Physical Flashlight)
        if (capabilities && 'torch' in capabilities) {
          setHasTorch(true);
          setTorchValue((settingsObj as any)?.torch || false);
        } else {
          setHasTorch(false);
        }
      }

      // Track active audio configurations
      const activeAudioTrack = stream.getAudioTracks()[0];
      if (activeAudioTrack) {
        setIsMicMuted(!activeAudioTrack.enabled);
        const settingsObj = activeAudioTrack.getSettings?.();
        if (settingsObj && settingsObj.deviceId && !micId) {
          setSelectedMicId(settingsObj.deviceId);
        }
      }

      // Bind to active local element
      setTimeout(() => {
        if (localPreviewVideoRef.current) {
          localPreviewVideoRef.current.srcObject = stream;
        }
      }, 200);

      // Web Audio Analysis for LED dB Meter
      setupAudioAnalysis(stream);

      return stream;

    } catch (err: any) {
      console.error("Studio stream initiation error:", err);
      addStudioLog(`Hardware Error: ${err.message || 'Access blocked'}`);
      if (err.name === 'NotAllowedError') {
        setBroadcastError("System blocked camera/mic. Please enable browser permissions or check system privacy controls.");
      } else {
        setBroadcastError(err.message || "Failed to start camera feed. Ensure hardware is connected.");
      }
    }
  };

  const setupAudioAnalysis = (stream: MediaStream) => {
    if (stream.getAudioTracks().length === 0) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const sourceNode = audioCtx.createMediaStreamSource(stream);
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = micGain;
      gainNodeRef.current = gainNode;

      sourceNode.connect(gainNode);
      gainNode.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let animationFrameId: number;

      const analyze = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const mapped = Math.min(100, Math.round((avg / 140) * 100));
        setAudioLevel(mapped);
        animationFrameId = requestAnimationFrame(analyze);
      };

      analyze();

      return () => {
        cancelAnimationFrame(animationFrameId);
      };
    } catch(err) {
      console.error("Web Audio analyser setup crash:", err);
    }
  };

  // Toggle mic/video tracks in real time
  const toggleMicMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicMuted(!audioTrack.enabled);
        addStudioLog(audioTrack.enabled ? "Microphone voice channel unmuted" : "Microphone voice channel muted");
      }
    }
  };

  const toggleVideoFreeze = () => {
    if (localStream) {
      const liveVideoTrack = localStream.getVideoTracks()[0];
      if (liveVideoTrack) {
        liveVideoTrack.enabled = !liveVideoTrack.enabled;
        setIsVideoPaused(!liveVideoTrack.enabled);
        addStudioLog(liveVideoTrack.enabled ? "Video camera feed running" : "Video camera feed frozen (mute frame)");
      }
    }
  };

  // Adjust native hardware zoom or apply fallback digital scale
  const handleHardwareZoomChange = async (val: number) => {
    setZoomValue(val);
    if (videoTrack && hasZoom) {
      try {
        await videoTrack.applyConstraints({
          advanced: [{ zoom: val } as any]
        });
      } catch (err) {
        console.warn("Unable to enforce native zoom:", err);
      }
    }
  };

  // Toggle camera flashlight
  const toggleTorchLight = async () => {
    if (videoTrack && hasTorch) {
      try {
        const nextTorch = !torchValue;
        await videoTrack.applyConstraints({
          advanced: [{ torch: nextTorch } as any]
        });
        setTorchValue(nextTorch);
        addStudioLog(nextTorch ? "On-lens hardware flashlight activated" : "On-lens hardware flashlight turned off");
      } catch (err) {
        console.warn("Unable to toggle torch:", err);
      }
    }
  };

  // 2. Main Broadcast Transmission Handlers with WS Reconnect
  const startBroadcast = async () => {
    let activeStream = localStreamRef.current;
    if (!activeStream) {
      activeStream = await initializeStudioFeed();
    }
    if (!activeStream) {
      setBroadcastError("Please open the camera first before going Live.");
      return;
    }

    setBroadcastError(null);
    setBytesSent(0);
    setWsControlStatus('connecting');
    addStudioLog("Initiating stream server handshake...");
    isSocketIntentionalCloseRef.current = false;

    let reconnectAttempts = 0;
    const maxReconnects = 5;
    let ws: WebSocket | null = null;
    let fallbackToPolling = false;

    const sendSignalingMessage = async (msg: any) => {
      const payload = { ...msg, sender: 'broadcaster' };
      if (!fallbackToPolling && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      } else {
        try {
          await fetch('/api/live-signaling/send', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(payload)
          });
        } catch (e) {
          console.error("[Broadcaster WebRTC] Polling transmission crashed:", e);
        }
      }
    };

    const createSpectatorConnection = async (vId: string) => {
      console.log(`[Broadcaster WebRTC] Creating peer connection for spectator: ${vId}`);
      if (peerConnectionsRef.current.has(vId)) {
        try { peerConnectionsRef.current.get(vId)!.close(); } catch(e) {}
        peerConnectionsRef.current.delete(vId);
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionsRef.current.set(vId, pc);

      const currentStream = localStreamRef.current;
      if (currentStream) {
        currentStream.getTracks().forEach(track => {
          pc.addTrack(track, currentStream);
          console.log(`[Broadcaster WebRTC] Added track ${track.kind} to viewer ${vId}`);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignalingMessage({
            type: 'candidate',
            target: vId,
            candidate: event.candidate
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`[Broadcaster WebRTC] Connection state for spectator ${vId}:`, pc.connectionState);
        if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
          try { pc.close(); } catch(e) {}
          peerConnectionsRef.current.delete(vId);
          addStudioLog(`Spectator session disconnected: ${vId}`);
        }
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignalingMessage({
          type: 'offer',
          target: vId,
          sdp: pc.localDescription
        });
        addStudioLog(`WebRTC Channel opened with viewer: ${vId.slice(0, 6)}...`);
      } catch (err) {
        console.error(`[Broadcaster WebRTC] SDP offer creation crash for viewer: ${vId}`, err);
      }
    };

    const handleSignalingMessage = async (msg: any) => {
      if (msg.type === 'register-viewer' && msg.viewerId) {
        createSpectatorConnection(msg.viewerId);
      } else if (msg.type === 'answer' && msg.sender) {
        const pc = peerConnectionsRef.current.get(msg.sender);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            addStudioLog(`Handshake completed with viewer: ${msg.sender.slice(0, 6)}...`);
          } catch (e) {
            console.error(`[Broadcaster WebRTC] Error setting local answer for viewer: ${msg.sender}`, e);
          }
        }
      } else if (msg.type === 'candidate' && msg.sender && msg.candidate) {
        const pc = peerConnectionsRef.current.get(msg.sender);
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (e) {
            console.error(`[Broadcaster WebRTC] Error adding IceCandidate from viewer: ${msg.sender}`, e);
          }
        }
      } else if (msg.type === 'viewer-left' && msg.viewerId) {
        const pc = peerConnectionsRef.current.get(msg.viewerId);
        if (pc) {
          try { pc.close(); } catch(e) {}
          peerConnectionsRef.current.delete(msg.viewerId);
          addStudioLog(`Spectator discrete session closed: ${msg.viewerId}`);
        }
      }
    };

    const startPollingFallback = async () => {
      if (fallbackToPolling) return;
      fallbackToPolling = true;
      setWsControlStatus('connected');
      addStudioLog("Swapped to HTTP Polling signaling fallback engine.");

      try {
        await fetch('/api/live-signaling/register', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ role: 'broadcaster', id: 'broadcaster' })
        });
      } catch(e) {
        console.error("Signaling fallback registration failed:", e);
      }

      pollingIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/live-signaling/poll?id=broadcaster&role=broadcaster`);
          const data = await res.json();
          if (data && data.messages) {
            for (const msg of data.messages) {
              await handleSignalingMessage(msg);
            }
          }
        } catch (e) {
          console.error("Polling error:", e);
        }
      }, 1000);
    };

    const establishSocketAndRecorder = () => {
      if (isSocketIntentionalCloseRef.current || fallbackToPolling) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socketUrl = `${protocol}//${window.location.host}/api/live-stream?role=broadcaster&token=${encodeURIComponent(authToken())}`;
      
      ws = new WebSocket(socketUrl);
      broadcasterSocketRef.current = ws;

      const connectionTimeout = setTimeout(() => {
        if (ws && ws.readyState !== WebSocket.OPEN && !fallbackToPolling) {
          console.log("[Broadcaster WS] WebSocket setup timed out (6s). Swapping to Polling signaling...");
          try { ws.close(); } catch(e) {}
          startPollingFallback();
        }
      }, 6000);

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        setWsControlStatus('connected');
        reconnectAttempts = 0;
        addStudioLog("Live connection established with streaming gateway.");
        setIsBroadcasting(true);

        sendSignalingMessage({ type: 'register-host' });
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          await handleSignalingMessage(msg);
        } catch(e) {
          console.error("[Broadcaster WS] Error parsing signaling message:", e);
        }
      };

      ws.onerror = (err) => {
        console.error("Broadcaster WebSocket failure:", err);
        clearTimeout(connectionTimeout);
        startPollingFallback();
      };

      ws.onclose = () => {
        setWsControlStatus('disconnected');
        if (!isSocketIntentionalCloseRef.current && !fallbackToPolling) {
          if (reconnectAttempts < maxReconnects) {
            reconnectAttempts++;
            addStudioLog(`Reconnecting to stream server (${reconnectAttempts}/${maxReconnects})...`);
            setTimeout(establishSocketAndRecorder, 3000);
          } else {
            setBroadcastError("Continuous signal drops. Swapping to polling control.");
            startPollingFallback();
          }
        }
      };
    };

    establishSocketAndRecorder();
    setIsBroadcasting(true);

    // Ticker Loop for Capturing & Streaming Frames (Binary or REST Fallback)
    if (frameCaptureIntervalRef.current) {
      clearInterval(frameCaptureIntervalRef.current);
    }
    const canvas = document.createElement('canvas');
    let lastPostTime = 0;
    frameCaptureIntervalRef.current = setInterval(() => {
      const videoEl = localPreviewVideoRef.current;
      if (!videoEl || videoEl.readyState < 2) return;

      const width = 640;
      const height = 360;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoEl, 0, 0, width, height);

        const socket = broadcasterSocketRef.current;
        if (!fallbackToPolling && socket && socket.readyState === WebSocket.OPEN) {
          try {
            canvas.toBlob((blob) => {
              if (blob && socket && socket.readyState === WebSocket.OPEN) {
                socket.send(blob);
                setBytesSent(prev => prev + blob.size);
              }
            }, 'image/jpeg', 0.6);
          } catch (e) {
            console.error("Error creating or sending frame blob:", e);
          }
        } else {
          // Send via HTTP REST fallback POST, throttled to prevent server overload
          const now = Date.now();
          if (now - lastPostTime < 130) return;
          lastPostTime = now;

          try {
            const frameBase64 = canvas.toDataURL('image/jpeg', 0.55);
            fetch('/api/live-stream/frame', {
              method: 'POST',
              headers: authHeaders(),
              body: JSON.stringify({ frame: frameBase64 })
            }).catch(() => {});
            setBytesSent(prev => prev + frameBase64.length);
          } catch (e) {
            console.error("Error sending frame via polling fallback:", e);
          }
        }
      }
    }, 66);
  };

  const stopBroadcast = () => {
    addStudioLog("Stopping streaming and releasing channels.");
    isSocketIntentionalCloseRef.current = true;

    peerConnectionsRef.current.forEach((pc, vId) => {
      try {
        fetch('/api/live-signaling/send', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ sender: 'broadcaster', target: vId, type: 'ended' })
        }).catch(() => {});
        pc.close();
      } catch(e) {}
    });
    peerConnectionsRef.current.clear();

    if (broadcasterSocketRef.current) {
      try {
        broadcasterSocketRef.current.send(JSON.stringify({ type: 'ended' }));
      } catch(e) {}
      try { broadcasterSocketRef.current.close(); } catch (e) {}
      broadcasterSocketRef.current = null;
    }

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    if (frameCaptureIntervalRef.current) {
      clearInterval(frameCaptureIntervalRef.current);
      frameCaptureIntervalRef.current = null;
    }

    setIsBroadcasting(false);
    setWsControlStatus('disconnected');
  };

  // Handle uptime and telemetry
  useEffect(() => {
    if (isBroadcasting) {
      setBroadcastUptime(0);
      uptimeIntervalRef.current = setInterval(() => {
        setBroadcastUptime(prev => prev + 1);
      }, 1000);
    } else {
      if (uptimeIntervalRef.current) {
        clearInterval(uptimeIntervalRef.current);
      }
      setBroadcastUptime(0);
    }
    return () => {
      if (uptimeIntervalRef.current) {
        clearInterval(uptimeIntervalRef.current);
      }
    };
  }, [isBroadcasting]);

  useEffect(() => {
    return () => {
      stopBroadcast();
      const currentStream = localStreamRef.current;
      if (currentStream) {
        try { currentStream.getTracks().forEach(t => t.stop()); } catch(e) {}
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (settings?.video_source !== 'LIVE') {
      stopBroadcast();
    }
  }, [settings?.video_source]);

  useEffect(() => {
    if (localStream && localPreviewVideoRef.current) {
      localPreviewVideoRef.current.srcObject = localStream;
    }
  }, [isRigMode, localStream]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [n, e, v, a, s, o, sl] = await Promise.all([
        api.getDashboardNotices(),
        api.getDashboardEvents(),
        api.getDashboardVideos(),
        api.getEmergencyAlerts(),
        api.getDashboardSettings(),
        api.getDashboardOfficers(),
        api.getDashboardSlots()
      ]);
      setNotices(n);
      setEvents(e);
      setVideos(v);
      setAlerts(a);
      setSettings(s);
      setOfficers(o);
      setSlots(sl);
    } catch (err) {
      console.error("Failed to fetch dashboard data", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipVideo = async () => {
    try {
      setIsSaving(true);
      await api.updateDashboardSettings({ video_playlist_skip: Date.now().toString() });
      await fetchData();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleMoveVideo = async (index: number, direction: 'up' | 'down') => {
    const newVideos = [...videos];
    if (direction === 'up' && index > 0) {
      [newVideos[index - 1], newVideos[index]] = [newVideos[index], newVideos[index - 1]];
    } else if (direction === 'down' && index < videos.length - 1) {
      [newVideos[index + 1], newVideos[index]] = [newVideos[index], newVideos[index + 1]];
    } else {
      return;
    }
    
    setVideos(newVideos);
    try {
      await api.reorderVideos(newVideos.map(v => v.id));
    } catch (error) {
      console.error(error);
      fetchData(); // Reset on error
    }
  };

  const handleUpdateSlot = async (slotId: string, data: any) => {
    try {
      setIsSaving(true);
      
      // Auto-format ETA if it's numeric
      if (data.eta && /^\d+$/.test(data.eta.trim())) {
        const mins = parseInt(data.eta.trim());
        const status = data.status || slots.find(s => s.slot_id === slotId)?.status;
        let prefix = "BACK IN";
        if (status === 'AVAILABLE') prefix = "OFF IN";
        else if (status === 'FIELD') prefix = "FIELD FOR";
        
        const timeStr = mins >= 60 ? `${Math.floor(mins/60)}H ${mins%60 > 0 ? (mins%60 + 'M') : ''}` : `${mins} MIN`;
        data.eta = `${prefix} ${timeStr}`;
      }

      await api.updateDashboardSlot(slotId, data);
      await fetchData();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noticeForm.content) return;
    setIsSaving(true);
    try {
      await api.createDashboardNotice({ ...noticeForm, is_active: true });
      setNoticeForm({ content: '' });
      fetchData();
    } catch (err) {
      alert("Failed to create notice");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleNotice = async (notice: DashboardNotice) => {
    try {
      await api.updateDashboardNotice(notice.id, { is_active: !notice.is_active });
      fetchData();
    } catch (err) {
      alert("Failed to update notice");
    }
  };

  const handleDeleteNotice = async (id: string | number) => {
    if (!confirm("Are you sure?")) return;
    try {
      await api.deleteDashboardNotice(id);
      fetchData();
    } catch (err) {
      alert("Failed to delete notice");
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.createDashboardEvent({ ...eventForm, is_active: true });
      setEventForm({ title: '', event_date: '', event_time: '', location: '', image_url: '' });
      fetchData();
    } catch (err) {
      alert("Failed to create event");
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'event' | 'birthday' | 'cover') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsSaving(true);
    setImageUploadPercent(0);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64String = reader.result as string;
        const { url } = await api.uploadImageWithProgress(
          base64String,
          file.name,
          setImageUploadPercent,
        );
        
        if (type === 'event') {
          setEventForm(prev => ({ ...prev, image_url: url }));
        } else if (type === 'birthday' && settings) {
          setSettings(prev => prev ? ({ ...prev, birthday_image_url: url }) : null);
        } else if (type === 'cover' && settings) {
          setSettings(prev => prev ? ({ ...prev, default_cover_pic: url }) : null);
        }
      } catch (err: any) {
        alert(err?.message || 'Failed to upload image');
      } finally {
        setIsSaving(false);
        setImageUploadPercent(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check file size (limit to 2.5GB as requested)
    const MAX_SIZE = 2.5 * 1024 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert("Video file is too large. Max 2.5GB.");
      return;
    }

    setIsSaving(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64String = reader.result as string;
        const { url } = await api.uploadVideoFile(base64String, file.name);
        setVideoForm(prev => ({ ...prev, video_url: url }));
      } catch (err) {
        alert("Failed to upload video");
      } finally {
        setIsSaving(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateOfficerStatus = async (officerId: string | number, status: string, eta?: string) => {
    // Optimistic update
    const previousOfficers = [...officers];
    const updatedOfficers = officers.map(off => 
      off.id === officerId ? { ...off, dashboard_status: status, eta: eta || null } : off
    );
    setOfficers(updatedOfficers as Officer[]);

    try {
      await api.updateOfficerDashboardStatus(officerId, status, eta);
      // Optional: re-fetch to ensure sync with server
      fetchData();
    } catch (err) {
      alert("Failed to update officer status");
      // Revert if failed
      setOfficers(previousOfficers);
    }
  };

  const handleDeleteEvent = async (id: string | number) => {
    if (!confirm("Are you sure?")) return;
    try {
      await api.deleteDashboardEvent(id);
      fetchData();
    } catch (err) {
      alert("Failed to delete event");
    }
  };

  const handleCreateVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.createDashboardVideo({ ...videoForm, is_active: true });
      setVideoForm({ video_url: '' });
      fetchData();
    } catch (err) {
      alert("Failed to create video");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteVideo = async (id: string | number) => {
    if (!confirm("Are you sure?")) return;
    try {
      await api.deleteDashboardVideo(id);
      fetchData();
    } catch (err) {
      alert("Failed to delete video");
    }
  };

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.createEmergencyAlert({ ...alertForm, is_active: true });
      setAlertForm({ message: '' });
      fetchData();
    } catch (err) {
      alert("Failed to create alert");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleAlert = async (alertItem: DashboardEmergencyAlert) => {
    try {
      await api.updateEmergencyAlert(alertItem.id, { is_active: !alertItem.is_active });
      fetchData();
    } catch (err) {
      alert("Failed to update alert");
    }
  };

  const handleDeleteAlert = async (id: string | number) => {
    if (!confirm("Are you sure?")) return;
    try {
      await api.deleteEmergencyAlert(id);
      fetchData();
    } catch (err) {
      alert("Failed to delete alert");
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setIsSaving(true);
    try {
      await api.updateDashboardSettings(settings);
      alert("Settings updated");
    } catch (err) {
      alert("Failed to update settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-12 h-12 border-4 border-[#1877F2] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (activeTab === 'live' && isRigMode) {
    // 8-LED Dot Meter level matching
    const ledDotsCount = 8;
    const activeDots = Math.round((audioLevel / 100) * ledDotsCount);

    return (
      <div className="fixed inset-0 bg-slate-950 z-[9999] flex flex-col items-stretch justify-between text-white select-none overflow-hidden font-sans">
        {/* RAW PREVIEW BACKGROUND */}
        <div className="absolute inset-0 z-0 bg-black">
          <video
            ref={localPreviewVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover transition-all"
            style={{
              transform: `scaleX(${isMirrored ? -1 : 1}) scale(${digitalZoom})`,
              filter: `brightness(${videoFilters.brightness}%) contrast(${videoFilters.contrast}%) saturate(${videoFilters.saturation}%) grayscale(${videoFilters.grayscale}%)`
            }}
          />
          
          {/* Alignment Grid Overlay */}
          {showGrid && (
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none z-10 opacity-40">
              <div className="border-r border-b border-white/30"></div>
              <div className="border-r border-b border-white/30"></div>
              <div className="border-b border-white/30"></div>
              <div className="border-r border-b border-white/30"></div>
              <div className="border-r border-b border-white/30"></div>
              <div className="border-b border-white/30"></div>
              <div className="border-r border-white/30"></div>
              <div className="border-r border-white/30"></div>
              <div></div>
            </div>
          )}
        </div>

        {/* TOP STATUS BAR */}
        <div className="absolute top-0 inset-x-0 bg-slate-950/75 backdrop-blur-md border-b border-white/10 p-4 shrink-0 z-20 flex items-center justify-between landscape:p-2 landscape:py-1.5 shadow-md">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsRigMode(false)}
              className="bg-red-600/90 hover:bg-red-700 active:scale-95 text-white p-2.5 rounded-2xl flex items-center gap-2 font-black uppercase text-[9px] tracking-widest border border-white/10 shadow-lg cursor-pointer transition-all shrink-0 landscape:p-1.5 landscape:rounded-xl landscape:text-[7.5px]"
            >
              ← Leave Rig
            </button>
            <div className="flex flex-col">
              <span className="font-mono text-[8px] text-slate-400 font-extrabold uppercase tracking-widest landscape:text-[6px]">Smartphone Lens Host</span>
              <span className="text-[12px] font-black uppercase tracking-wider text-white landscape:text-[10px]">Lobby Live Feed</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline landscape:hidden font-mono text-[8px] text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded font-black uppercase tracking-widest">
              Tip: Rotate Landscape for 16:9
            </span>
            <div className={`px-2.5 py-1.5 landscape:py-1 landscape:px-2 rounded-xl font-mono text-[9px] landscape:text-[7.5px] font-black uppercase tracking-widest border flex items-center gap-1.5 ${
              isBroadcasting 
                ? 'bg-red-500/25 border-red-500/40 text-red-300 animate-pulse' 
                : 'bg-black/45 border-white/10 text-slate-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isBroadcasting ? 'bg-red-500' : 'bg-slate-500'}`}></span>
              {isBroadcasting ? 'Broadcasting LIVE' : 'Standby / Pre-check'}
            </div>
          </div>
        </div>

        {/* LEFT LENS CALIBRATION PANEL */}
        <div className="absolute left-4 top-24 bottom-24 w-15 md:w-16 bg-slate-950/70 backdrop-blur-md rounded-3xl border border-white/10 p-3.5 z-20 flex flex-col items-center justify-between shadow-2xl overflow-y-auto no-scrollbar gap-4 landscape:left-2 landscape:top-12 landscape:bottom-14 landscape:w-12 landscape:p-1 landscape:py-2 landscape:gap-1.5 landscape:rounded-xl">
          <div className="flex flex-col items-center gap-2.5 landscape:gap-1 text-center">
            <span className="font-mono text-[8px] landscape:text-[6px] font-black text-slate-400 uppercase tracking-widest">Zoom</span>
            <button
              type="button"
              onClick={() => setDigitalZoom(p => Math.min(p + 0.2, 4))}
              className="w-10 h-10 md:w-11 md:h-11 bg-white/10 hover:bg-white/20 active:scale-90 text-white rounded-2xl flex items-center justify-center font-black text-lg transition-all border border-white/10 cursor-pointer landscape:w-7 landscape:h-7 landscape:rounded-lg landscape:text-xs"
              title="Zoom In"
            >
              ＋
            </button>
            <span className="font-mono text-[10px] landscape:text-[8px] font-black text-emerald-400 block py-1 landscape:py-0">{digitalZoom.toFixed(1)}x</span>
            <button
              type="button"
              onClick={() => setDigitalZoom(p => Math.max(p - 0.2, 1))}
              className="w-10 h-10 md:w-11 md:h-11 bg-white/10 hover:bg-white/20 active:scale-90 text-white rounded-2xl flex items-center justify-center font-black text-md transition-all border border-white/10 cursor-pointer landscape:w-7 landscape:h-7 landscape:rounded-lg landscape:text-xs"
              title="Zoom Out"
            >
              －
            </button>
          </div>

          <div className="flex flex-col items-center gap-3 landscape:gap-1">
            <span className="font-mono text-[8px] landscape:text-[5px] font-black text-slate-400 uppercase tracking-widest text-center">Presets</span>
            <button
              type="button"
              onClick={() => setDigitalZoom(1)}
              className="w-9 h-6 text-[8px] font-mono font-black border border-white/15 bg-white/5 hover:bg-white/10 active:scale-[92%] transition-all rounded landscape:w-8 landscape:h-5 landscape:text-[7px]"
            >
              1.0x
            </button>
            <button
              type="button"
              onClick={() => setDigitalZoom(2)}
              className="w-9 h-6 text-[8px] font-mono font-black border border-white/15 bg-white/5 hover:bg-white/10 active:scale-[92%] transition-all rounded landscape:w-8 landscape:h-5 landscape:text-[7px]"
            >
              2.0x
            </button>
            <button
              type="button"
              onClick={() => setDigitalZoom(3.5)}
              className="w-9 h-6 text-[8px] font-mono font-black border border-white/15 bg-white/5 hover:bg-white/10 active:scale-[92%] transition-all rounded landscape:w-8 landscape:h-5 landscape:text-[7px]"
            >
              3.5x
            </button>
          </div>

          <div className="flex flex-col items-center gap-3 landscape:gap-1.5">
            {hasTorch && (
              <button
                type="button"
                onClick={async () => {
                  if (videoTrack) {
                    try {
                      const nextTorchValue = !torchValue;
                      await videoTrack.applyConstraints({
                        advanced: [{ torch: nextTorchValue } as any]
                      });
                      setTorchValue(nextTorchValue);
                      addStudioLog(nextTorchValue ? "Torch light activated." : "Torch light turned off.");
                    } catch (e: any) {
                      addStudioLog(`Torch Fail: ${e.message}`);
                    }
                  } else {
                    addStudioLog("No video track found for torch constraints.");
                  }
                }}
                className={`w-10 h-10 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center justify-center border transition-all cursor-pointer landscape:w-7 landscape:h-7 landscape:rounded-lg ${
                  torchValue ? 'border-yellow-400 text-yellow-300 bg-yellow-400/10' : 'border-white/10 text-white'
                }`}
                title="Toggle Physical Torch"
              >
                🔦
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
                setFacingMode(nextFacing);
                initializeStudioFeed(undefined, selectedMicId, nextFacing);
                addStudioLog(`Switched lens facing: ${nextFacing}`);
              }}
              className="w-10 h-10 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-2xl flex items-center justify-center transition-all border border-white/10 cursor-pointer landscape:w-7 landscape:h-7 landscape:rounded-lg"
              title="Switch Lens front/back"
            >
              🔄
            </button>
          </div>
        </div>

        {/* RIGHT VIDEO ADJUSTMENT PANEL */}
        <div className="absolute right-4 top-24 bottom-24 w-15 md:w-16 bg-slate-950/70 backdrop-blur-md rounded-3xl border border-white/10 p-3.5 z-20 flex flex-col items-center justify-between shadow-2xl overflow-y-auto no-scrollbar gap-4 landscape:right-2 landscape:top-12 landscape:bottom-14 landscape:w-12 landscape:p-1 landscape:py-2 landscape:gap-1.5 landscape:rounded-xl">
          <div className="flex flex-col items-center gap-2.5 landscape:gap-1.5 text-center">
            <span className="font-mono text-[7px] landscape:text-[5.5px] font-black text-slate-400 uppercase tracking-widest text-center">Exposure</span>
            <button
              type="button"
              onClick={() => setVideoFilters(prev => ({ ...prev, brightness: 100, contrast: 100 }))}
              className={`w-10 py-1 text-[8px] font-bold tracking-tighter uppercase transition-colors rounded-lg border landscape:w-8 landscape:text-[6.5px] landscape:py-0.5 ${
                videoFilters.brightness === 100 
                  ? 'border-indigo-400 bg-indigo-500/25 text-indigo-300' 
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/15'
              }`}
            >
              Normal
            </button>
            <button
              type="button"
              onClick={() => setVideoFilters(prev => ({ ...prev, brightness: 130, contrast: 120 }))}
              className={`w-10 py-1 text-[8px] font-bold tracking-tighter uppercase transition-colors rounded-lg border landscape:w-8 landscape:text-[6.5px] landscape:py-0.5 ${
                videoFilters.brightness === 130 
                  ? 'border-indigo-400 bg-indigo-500/25 text-indigo-300' 
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/15'
              }`}
            >
              Shadow
            </button>
            <button
              type="button"
              onClick={() => setVideoFilters(prev => ({ ...prev, brightness: 80, contrast: 90 }))}
              className={`w-10 py-1 text-[8px] font-bold tracking-tighter uppercase transition-colors rounded-lg border landscape:w-8 landscape:text-[6.5px] landscape:py-0.5 ${
                videoFilters.brightness === 80 
                  ? 'border-indigo-400 bg-indigo-500/25 text-indigo-300' 
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/15'
              }`}
            >
              Bright
            </button>
            <button
              type="button"
              onClick={() => setVideoFilters(prev => ({ ...prev, grayscale: prev.grayscale === 100 ? 0 : 100 }))}
              className={`w-10 py-1 text-[8px] font-bold tracking-tighter uppercase transition-colors rounded-lg border landscape:w-8 landscape:text-[6.5px] landscape:py-0.5 ${
                videoFilters.grayscale === 100 
                  ? 'border-indigo-400 bg-indigo-500/25 text-indigo-300' 
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/15'
              }`}
            >
              {videoFilters.grayscale === 100 ? 'Retro' : 'Color'}
            </button>
          </div>

          <div className="flex flex-col items-center gap-3 landscape:gap-1 text-center">
            <span className="font-mono text-[7px] landscape:text-[5.5px] font-black text-slate-400 uppercase tracking-widest text-center">Quality</span>
            {(['1080p', '720p', '480p'] as const).map(q => (
              <button
                type="button"
                key={q}
                onClick={() => {
                  setStreamQuality(q);
                  addStudioLog(`Quality changed to ${q}`);
                }}
                className={`py-1 w-10 text-[8px] font-black tracking-wider uppercase transition-all rounded border landscape:w-8 landscape:text-[6.5px] landscape:py-0.5 ${
                  streamQuality === q 
                    ? 'border-indigo-500 bg-indigo-500/20 text-white' 
                    : 'border-white/10 text-slate-400 hover:bg-white/5'
                }`}
              >
                {q}
              </button>
            ))}
          </div>

          <div className="flex flex-col items-center gap-3 landscape:gap-1.5">
            <button
              type="button"
              onClick={() => setIsMirrored(!isMirrored)}
              className={`w-10 h-10 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center justify-center border transition-all cursor-pointer landscape:w-7 landscape:h-7 landscape:rounded-lg ${
                isMirrored ? 'border-indigo-400 text-indigo-300 bg-indigo-400/15' : 'border-white/10 text-white'
              }`}
              title="Mirror Mode toggle"
            >
              ↔
            </button>
            <button
              type="button"
              onClick={() => setShowGrid(!showGrid)}
              className={`w-10 h-10 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center justify-center border transition-all cursor-pointer landscape:w-7 landscape:h-7 landscape:rounded-lg ${
                showGrid ? 'border-indigo-400 text-indigo-300 bg-indigo-400/15' : 'border-white/10 text-white'
              }`}
              title="Thirds Grid Overlay toggle"
            >
              #
            </button>
          </div>
        </div>

        {/* BOTTOM DASHBOARD CONTROL DECK */}
        <div className="absolute bottom-4 inset-x-4 h-20 md:h-22 bg-slate-950/75 backdrop-blur-md rounded-3xl border border-white/10 p-3 z-20 flex items-center justify-between shadow-3xl gap-4 landscape:bottom-1.5 landscape:inset-x-2 landscape:h-12 landscape:p-1.5 landscape:px-2.5 landscape:rounded-xl">
          <div className="flex items-center gap-3 shrink-1 min-w-0 landscape:gap-2">
            <div className="flex flex-col gap-1 shrink-0 landscape:gap-0.5">
              <span className="font-mono text-[7px] landscape:text-[5px] font-black text-slate-400 uppercase tracking-widest leading-none">VUMETER</span>
              <div className="flex gap-1 landscape:gap-0.5">
                {Array.from({ length: 8 }).map((_, idx) => {
                  const isActive = idx < activeDots;
                  let colorClass = 'bg-slate-800';
                  if (isActive) {
                    if (idx < 4) colorClass = 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]';
                    else if (idx < 6) colorClass = 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]';
                    else colorClass = 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]';
                  }
                  return (
                    <div 
                      key={idx} 
                      className={`w-2 h-2 rounded-full transition-all duration-75 landscape:w-1 landscape:h-1.5 ${colorClass}`} 
                    />
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 landscape:gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (localStream) {
                    const audioTrack = localStream.getAudioTracks()[0];
                    if (audioTrack) {
                      audioTrack.enabled = !audioTrack.enabled;
                      setIsMicMuted(!audioTrack.enabled);
                      addStudioLog(`Audio stream toggled: ${audioTrack.enabled ? 'Live' : 'Muted'}`);
                    }
                  }
                }}
                className={`p-2 rounded-xl border flex items-center gap-1.5 cursor-pointer text-xs font-bold transition-colors landscape:p-1 landscape:px-2 landscape:text-[8px] landscape:rounded-lg ${
                  isMicMuted ? 'bg-red-500/25 border-red-500/40 text-red-300' : 'bg-white/10 hover:bg-white/15 border-white/10 text-white'
                }`}
                title="Toggle Mic Mute"
              >
                🎙️ {isMicMuted ? 'Muted' : 'Voice On'}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (localStream) {
                    const videoTrackTrack = localStream.getVideoTracks()[0];
                    if (videoTrackTrack) {
                      videoTrackTrack.enabled = !videoTrackTrack.enabled;
                      setIsVideoPaused(!videoTrackTrack.enabled);
                      addStudioLog(`Video stream state: ${videoTrackTrack.enabled ? 'Transmitting' : 'Black Standby'}`);
                    }
                  }
                }}
                className={`p-2 rounded-xl border flex items-center gap-1.5 cursor-pointer text-xs font-bold transition-colors landscape:p-1 landscape:px-2 landscape:text-[8px] landscape:rounded-lg ${
                  isVideoPaused ? 'bg-red-500/25 border-red-500/40 text-red-300' : 'bg-white/10 hover:bg-white/15 border-white/10 text-white'
                }`}
                title="Toggle Video pause"
              >
                🎥 {isVideoPaused ? 'Frozen' : 'Lenses Live'}
              </button>
            </div>
          </div>

          <div className="hidden md:flex flex-col flex-1 shrink min-w-0 bg-black/40 border border-white/5 rounded-2xl px-4 py-2 font-mono text-[9px] text-slate-400 justify-center gap-0.5">
            <span className="text-emerald-400 font-extrabold uppercase tracking-widest text-[8px]">Network Event Ticker:</span>
            <div className="truncate whitespace-nowrap">
              {studioLogs[0] || "[Idle] Stream server pre-check clear. Equipment standby."}
            </div>
          </div>

          <div className="shrink-0 flex items-center">
            {isBroadcasting ? (
              <button
                type="button"
                onClick={stopBroadcast}
                className="px-5 py-3.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-xl shadow-red-500/20 border-0 flex items-center gap-2 cursor-pointer transition-all landscape:px-3 landscape:py-1.5 landscape:text-[8.5px] landscape:rounded-lg"
              >
                <span className="w-2.5 h-2.5 bg-white rounded-full animate-ping shrink-0 landscape:w-1.5 landscape:h-1.5" />
                <span>Stop Broadcast</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  if (settings?.video_source !== 'LIVE') {
                    try {
                      addStudioLog("Syncing Lobby display source reference to LIVE stream...");
                      await api.updateDashboardSettings({ video_source: 'LIVE' });
                      fetchData();
                    } catch(e) {
                      console.warn("Lobby sync fail, proceeding broadcast capture:", e);
                    }
                  }
                  startBroadcast();
                }}
                className="px-6 py-3.5 bg-gradient-to-r from-red-600 to-rose-600 hover:brightness-110 active:scale-95 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-xl shadow-red-500/15 border-0 flex items-center gap-2 cursor-pointer transition-all landscape:px-3 landscape:py-1.5 landscape:text-[8.5px] landscape:rounded-lg"
              >
                <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse landscape:w-1.5 landscape:h-1.5" />
                <span>Go Live</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Public Dashboard Control</h1>
          <p className="text-slate-500 font-bold mt-1">Manage content for the lobby information display</p>
          <div className="mt-4">
            <a 
              href="#/public-dashboard" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all"
            >
              <Icons.Gallery size={14} />
              View Live Dashboard
            </a>
          </div>
        </div>
        <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100 overflow-x-auto no-scrollbar">
          {(['notices', 'events', 'videos', 'alerts', 'settings', 'live', 'officers'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab ? 'bg-[#1877F2] text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
            >
              {tab === 'live' ? 'Live Studio 🎥' : tab}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="w-full"
        >
          {activeTab === 'live' ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
              {/* Live Studio Header and State banner */}
              <div className="bg-gradient-to-r from-red-700 via-red-600 to-rose-600 p-8 md:p-12 rounded-[3.5rem] shadow-2xl shadow-red-500/15 text-white relative overflow-hidden group">
                <div className="absolute -right-20 -top-20 w-96 h-96 bg-white/10 rounded-full blur-[100px] group-hover:scale-125 transition-transform duration-[2s]" />
                <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-red-400/25 rounded-full blur-[80px]" />
                
                <div className="relative z-10 flex flex-col lg:flex-row items-center gap-8 md:gap-10">
                  <div className="w-24 h-24 bg-white/15 backdrop-blur-3xl rounded-[2.5rem] flex items-center justify-center border border-white/25 shadow-2xl shrink-0 group-hover:scale-105 transition-all duration-500">
                    <Icons.Radio size={44} className={isBroadcasting ? 'text-white animate-pulse' : 'text-red-100'} />
                  </div>
                  <div className="text-center lg:text-left flex-1 space-y-2">
                    <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3">
                      <span className="px-3 py-1 bg-white/20 text-white rounded-full font-black text-[9px] uppercase tracking-widest border border-white/10">
                        Niyagama TV Network
                      </span>
                      {isBroadcasting && (
                        <span className="px-3 py-1 bg-red-500 text-white rounded-full font-black text-[9px] uppercase tracking-widest animate-pulse flex items-center gap-1 border border-red-400">
                          <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                          Broadcasting Live
                        </span>
                      )}
                    </div>
                    <h3 className="text-3xl md:text-4xl font-black uppercase tracking-wider">Live Broadcast Control</h3>
                    <p className="text-red-50 font-medium max-w-2xl text-base opacity-90 leading-relaxed">
                      Stream events directly from the main hall or regional workspace to the citizen dashboard in real-time. Use smartphone lenses, zoom parameters, and audio meters.
                    </p>
                  </div>

                  {/* Quick telemetry indicators */}
                  {isBroadcasting && (
                    <div className="shrink-0 bg-black/30 backdrop-blur-xl px-6 py-5 rounded-3xl border border-white/15 flex flex-col gap-2 font-mono text-xs">
                      <div className="flex justify-between gap-6">
                        <span className="text-red-300 font-bold">UPTIME:</span>
                        <span className="text-white font-black">
                          {Math.floor(broadcastUptime / 60)}m {broadcastUptime % 60}s
                        </span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span className="text-red-300 font-bold">UPLOADED:</span>
                        <span className="text-white font-black">
                          {(bytesSent / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span className="text-red-300 font-bold">SIGNAL:</span>
                        <span className="text-emerald-400 font-black uppercase flex items-center gap-1.5">
                          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping"></span>
                          {wsControlStatus}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {broadcastError && (
                <div className="p-5 bg-red-100/80 border border-red-200 text-red-800 rounded-3xl font-bold text-sm shadow-sm flex items-center gap-3">
                  <Icons.AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                  <span className="flex-1">{broadcastError}</span>
                  <button type="button" onClick={() => setBroadcastError(null)} className="px-3 py-1.5 bg-red-200/50 hover:bg-red-200 rounded-xl text-xs">Dismiss</button>
                </div>
              )}

              {/* Main Workspace split */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* 1. Large TV Monitor Display (Column Span 7) */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="bg-black text-slate-400 rounded-[2.5rem] border border-slate-900 shadow-2xl relative overflow-hidden aspect-video flex items-center justify-center">
                    
                    {/* Raw Video Camera Element */}
                    <video
                      ref={localPreviewVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover transition-transform"
                      style={{
                        transform: `scaleX(${isMirrored ? -1 : 1}) scale(${digitalZoom})`,
                        filter: `brightness(${videoFilters.brightness}%) contrast(${videoFilters.contrast}%) saturate(${videoFilters.saturation}%) grayscale(${videoFilters.grayscale}%)`
                      }}
                    />

                    {/* Overlay Grid lines for layout setup */}
                    {showGrid && (
                      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                        <div className="border-r border-b border-white/20"></div>
                        <div className="border-r border-b border-white/20"></div>
                        <div className="border-b border-white/20"></div>
                        <div className="border-r border-b border-white/20"></div>
                        <div className="border-r border-b border-white/20"></div>
                        <div className="border-b border-white/20"></div>
                        <div className="border-r border-white/20"></div>
                        <div className="border-r border-white/20"></div>
                        <div></div>
                      </div>
                    )}

                    {/* Status Labels on Canvas */}
                    <div className="absolute top-4 left-4 flex gap-2">
                      <span className="px-2.5 py-1 bg-black/60 backdrop-blur-md text-white rounded font-mono text-[9px] font-black uppercase tracking-widest border border-white/10">
                        MONITOR 01: PGM OUT
                      </span>
                      {isBroadcasting && (
                        <span className="px-2.5 py-1 bg-red-600 text-white rounded font-mono text-[9px] font-black uppercase tracking-widest animate-pulse border border-red-500">
                          TRANSMITTING
                        </span>
                      )}
                    </div>

                    <div className="absolute top-4 right-4 flex flex-col gap-2 pointer-events-none text-right">
                      <span className="px-2.5 py-1 bg-black/60 backdrop-blur-md text-slate-200 rounded font-mono text-[9px] font-bold">
                        {streamQuality} @ 24FPS
                      </span>
                    </div>

                    {/* Mute and Standby Big Banner overlays inside video frame */}
                    {isVideoPaused && (
                      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 transition-all duration-300">
                        <Icons.VideoOff className="w-16 h-16 text-red-500 stroke-[1.5] mb-4 animate-bounce" />
                        <h4 className="text-white text-lg font-black uppercase tracking-wider">Video Stream Standby</h4>
                        <p className="text-slate-400 text-xs max-w-xs mt-1">
                          You have paused the optical output. Viewers are receiving a broadcast standby slate.
                        </p>
                      </div>
                    )}

                    {isMicMuted && !isVideoPaused && (
                      <div className="absolute bottom-4 left-4 px-3 py-1 bg-red-600/90 backdrop-blur-md rounded text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
                        <span className="w-2 h-2 bg-white rounded-full"></span>
                        Microphone Silenced
                      </div>
                    )}

                    {/* Live Audio dB level meter floating on bottom right */}
                    {isCameraInitialized && !isVideoPaused && (
                      <div className="absolute bottom-4 right-4 bg-black/75 backdrop-blur-md p-3 rounded-2xl border border-white/10 w-44 space-y-1">
                        <div className="flex justify-between items-center text-[8px] font-mono font-bold text-slate-400">
                          <span>AUDIO IN LEVEL:</span>
                          <span className={audioLevel > 80 ? 'text-red-400' : 'text-emerald-400'}>
                            {isMicMuted ? 'MUTED' : `${audioLevel}%`}
                          </span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden flex gap-0.5">
                          {isMicMuted ? (
                            <div className="w-full bg-slate-700 h-full"></div>
                          ) : (
                            <>
                              <div className="flex-1 bg-emerald-500 h-full transition-all duration-100" style={{ opacity: audioLevel > 5 ? 1 : 0.2 }}></div>
                              <div className="flex-1 bg-emerald-500 h-full transition-all duration-100" style={{ opacity: audioLevel > 25 ? 1 : 0.2 }}></div>
                              <div className="flex-1 bg-emerald-500 h-full transition-all duration-100" style={{ opacity: audioLevel > 45 ? 1 : 0.2 }}></div>
                              <div className="flex-1 bg-yellow-400 h-full transition-all duration-100" style={{ opacity: audioLevel > 65 ? 1 : 0.2 }}></div>
                              <div className="flex-1 bg-yellow-400 h-full transition-all duration-100" style={{ opacity: audioLevel > 80 ? 1 : 0.2 }}></div>
                              <div className="flex-1 bg-red-500 h-full transition-all duration-100" style={{ opacity: audioLevel > 90 ? 1 : 0.2 }}></div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Active Studio Quick controls row */}
                  <div className="bg-slate-900 p-4 rounded-3xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!isCameraInitialized}
                        onClick={toggleVideoFreeze}
                        className={`p-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all border-0 cursor-pointer ${
                          isVideoPaused 
                            ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg' 
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                        } disabled:opacity-45`}
                        title="Resume or Standby optical output"
                      >
                        {isVideoPaused ? <Icons.Play size={15} /> : <Icons.VideoOff size={15} />}
                        <span>{isVideoPaused ? 'Resume Video' : 'Standby Screen'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={!isCameraInitialized}
                        onClick={toggleMicMute}
                        className={`p-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all border-0 cursor-pointer ${
                          isMicMuted 
                            ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg' 
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                        } disabled:opacity-45`}
                        title="Mute or Unmute audio connection"
                      >
                        <span className="w-2 h-2 rounded-full bg-red-400"></span>
                        <span>{isMicMuted ? 'Unmute Audio' : 'Mute Mic'}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {hasTorch && (
                        <button
                          type="button"
                          onClick={toggleTorchLight}
                          className={`p-3.5 rounded-2xl text-xs font-bold transition-all border-0 cursor-pointer flex items-center gap-1.5 ${
                            torchValue ? 'bg-amber-500 text-black font-black' : 'bg-slate-800 text-slate-300'
                          }`}
                          title="Flashlight Toggle (Smartphone Only)"
                        >
                          ⚡ Torch
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setIsMirrored(!isMirrored)}
                        className={`p-3.5 rounded-2xl text-xs font-bold transition-all border-0 cursor-pointer ${
                          isMirrored ? 'bg-indigo-600 text-white font-black' : 'bg-slate-800 text-slate-300'
                        }`}
                        title="Mirror video source"
                      >
                        ↔ Mirror
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowGrid(!showGrid)}
                        className={`p-3.5 rounded-2xl text-xs font-bold transition-all border-0 cursor-pointer ${
                          showGrid ? 'bg-indigo-600 text-white font-black' : 'bg-slate-800 text-slate-300'
                        }`}
                        title="Toggle thirds grid overlay"
                      >
                        # Alignment Grid
                      </button>
                    </div>
                  </div>

                  {/* Real-time Diagnostics Terminal logs */}
                  <div className="bg-slate-950 rounded-3xl p-5 border border-slate-900 space-y-2 font-mono">
                    <p className="text-[10px] uppercase font-black tracking-widest text-indigo-400">🚨 Studio Event Log Console</p>
                    <div className="h-28 overflow-y-auto space-y-1.5 text-[9px] text-slate-400">
                      {studioLogs.length === 0 ? (
                        <p className="text-slate-600 italic">No events generated. Equipment safe on standby.</p>
                      ) : (
                        studioLogs.map((log, idx) => (
                          <div key={idx} className="flex gap-2">
                            <span className="text-indigo-500">▶</span>
                            <span>{log}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Right Column Equipment Control Panel (Column Span 5) */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Smartphone Camera Integrator QR & Rig Link */}
                  <div className="bg-gradient-to-br from-indigo-900 via-[#1877F2] to-blue-800 text-white rounded-[2.5rem] p-6 shadow-xl relative overflow-hidden group">
                    <div className="absolute right-0 top-0 w-32 h-32 bg-white/5 rounded-full blur-xl pointer-events-none" />
                    <div className="relative z-10 space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="p-1 px-2 bg-indigo-500/30 rounded-full text-[10px] uppercase tracking-widest font-black border border-white/10 shrink-0">
                          Mobile Integration
                        </span>
                      </div>
                      <h4 className="text-sm font-black uppercase tracking-wider">
                        📱 Smartphone Host Camera
                      </h4>
                      <p className="text-[10px] text-indigo-100 leading-relaxed">
                        Authorize, calibrate filters, adjust digital zoom, and control flashlight directly from your mobile device as the primary studio camera rig.
                      </p>

                      <div className="flex flex-col sm:flex-row items-center gap-4 bg-black/20 p-4 rounded-3xl border border-white/5">
                        <div className="bg-white p-2 rounded-2xl shadow-md shrink-0">
                          <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(window.location.origin + window.location.pathname + '#/admin/dashboard-control?tab=live')}`} 
                            alt="QR Link" 
                            className="w-24 h-24 select-none pointer-events-none"
                          />
                        </div>
                        <div className="text-center sm:text-left space-y-1">
                          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Scan QR Code</p>
                          <p className="text-[9px] text-indigo-100 font-medium">Scan with your smartphone camera to connect instantly, then enter full Rig Mode.</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          if (!isCameraInitialized) {
                            addStudioLog("Initializing smartphone hardware feed for Rig Mode...");
                            await initializeStudioFeed();
                          }
                          setIsRigMode(true);
                        }}
                        className="w-full py-4 bg-white text-indigo-950 hover:bg-slate-100 font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-xl transition-all border-0 flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01]"
                      >
                        Launch Interactive Camera Rig View 🎥
                      </button>
                    </div>
                  </div>

                  {/* Status checklist and trigger broadcast */}
                  <div className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-100 space-y-5">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                      Studio Equipment Intake Selector
                    </h4>

                    {!isCameraInitialized ? (
                      <div className="p-5 bg-gradient-to-br from-indigo-50 to-blue-50/50 rounded-3xl border border-indigo-100 space-y-4">
                        <div className="space-y-1">
                          <p className="text-xs font-black text-indigo-900 uppercase">Initialize Studio System</p>
                          <p className="text-[10px] text-slate-500">To prevent unsolicited camera pop-ups, authorize lens and microphone integration by launching the studio intake module.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => initializeStudioFeed()}
                          className="w-full py-4 bg-indigo-600 hover:bg-slate-900 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-xl transition-all border-0 clickable cursor-pointer hover:scale-[1.01]"
                        >
                          Initialize Camera & Mic
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Selected Camera */}
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block ml-1">Camera Sensor / Lenses</label>
                          <select
                            value={selectedDeviceId}
                            onChange={e => {
                              setSelectedDeviceId(e.target.value);
                              initializeStudioFeed(e.target.value, selectedMicId);
                            }}
                            className="w-full p-3.5 bg-slate-50 border border-slate-200 font-bold text-xs rounded-xl outline-none focus:border-indigo-400"
                          >
                            <option value="">Default Front/Back lens</option>
                            {devices.map(dev => (
                              <option key={dev.deviceId} value={dev.deviceId}>
                                📷 {dev.label || `LENS AT ${dev.deviceId.slice(0, 6)}`}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Selected Microphone */}
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block ml-1">Voice Channels / Mic source</label>
                          <select
                            value={selectedMicId}
                            onChange={e => {
                              setSelectedMicId(e.target.value);
                              initializeStudioFeed(selectedDeviceId, e.target.value);
                            }}
                            className="w-full p-3.5 bg-slate-50 border border-slate-200 font-bold text-xs rounded-xl outline-none focus:border-indigo-400"
                          >
                            <option value="">Default System Microphone</option>
                            {micDevices.map(mic => (
                              <option key={mic.deviceId} value={mic.deviceId}>
                                🎙️ {mic.label || `AUDIO SOURCE AT ${mic.deviceId.slice(0, 6)}`}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Stream Resolution options */}
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block ml-1">Transmission Quality</label>
                          <div className="grid grid-cols-3 gap-2">
                            {(['1080p', '720p', '480p'] as const).map(quality => (
                              <button
                                type="button"
                                key={quality}
                                onClick={() => {
                                  setStreamQuality(quality);
                                  addStudioLog(`Target stream size altered to ${quality}`);
                                }}
                                className={`py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all border ${
                                  streamQuality === quality 
                                    ? 'bg-slate-900 border-slate-900 text-white font-bold' 
                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                }`}
                              >
                                {quality}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Toggle Front vs Back layout quick mobile toggle */}
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
                              setFacingMode(nextFacing);
                              initializeStudioFeed(undefined, selectedMicId, nextFacing);
                              addStudioLog(`Smartphone feed switched to ${nextFacing} lens`);
                            }}
                            className="flex-1 py-3 bg-slate-50 text-slate-700 hover:bg-slate-100 rounded-xl font-bold uppercase text-[9px] tracking-wider border border-slate-200 flex items-center justify-center gap-1.5"
                          >
                            🔄 Switch Front/Back Lens
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => {
                              initializeStudioFeed(selectedDeviceId, selectedMicId);
                              addStudioLog("Rebounded active camera hardware.");
                            }}
                            className="px-4 py-3 bg-slate-50 text-slate-500 hover:bg-slate-100 rounded-xl border border-slate-200"
                            title="Re-fetch feeds"
                          >
                            <Icons.RefreshCw size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Slide controls for zoom & color adjustments */}
                  {isCameraInitialized && (
                    <div className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-100 space-y-5">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                        Lens Zoom & Post-Production Slider
                      </h4>

                      {/* Zoom control slider */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
                          <span>Camera Zoom</span>
                          <span className="text-slate-800 font-black">{digitalZoom.toFixed(1)}x</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="4"
                          step="0.1"
                          value={digitalZoom}
                          onChange={e => {
                            const val = parseFloat(e.target.value);
                            setDigitalZoom(val);
                            handleHardwareZoomChange(val);
                          }}
                          className="w-full accent-indigo-600 h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between gap-1 text-[8px] font-bold text-slate-500">
                          <button type="button" onClick={() => { setDigitalZoom(1); handleHardwareZoomChange(1); }} className="px-2 py-0.5 bg-slate-50 rounded-md border border-slate-200 hover:bg-slate-100">1x Wide</button>
                          <button type="button" onClick={() => { setDigitalZoom(1.5); handleHardwareZoomChange(1.5); }} className="px-2 py-0.5 bg-slate-50 rounded-md border border-slate-200 hover:bg-slate-100">1.5x Lens</button>
                          <button type="button" onClick={() => { setDigitalZoom(2); handleHardwareZoomChange(2); }} className="px-2 py-0.5 bg-slate-50 rounded-md border border-slate-200 hover:bg-slate-100">2x Lens</button>
                          <button type="button" onClick={() => { setDigitalZoom(3); handleHardwareZoomChange(3); }} className="px-2 py-0.5 bg-slate-50 rounded-md border border-slate-200 hover:bg-slate-100">3x Tele</button>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 space-y-4">
                        {/* Brightness filter */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] font-black uppercase text-slate-400">
                            <span>Image Contrast & exposure Brightness</span>
                            <span className="text-slate-800">{videoFilters.brightness}%</span>
                          </div>
                          <input
                            type="range"
                            min="50"
                            max="150"
                            value={videoFilters.brightness}
                            onChange={e => setVideoFilters({ ...videoFilters, brightness: parseInt(e.target.value) })}
                            className="w-full accent-indigo-600 h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Contrast filter */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] font-black uppercase text-slate-400">
                            <span>Optical Contrast Intensity</span>
                            <span className="text-slate-800">{videoFilters.contrast}%</span>
                          </div>
                          <input
                            type="range"
                            min="50"
                            max="150"
                            value={videoFilters.contrast}
                            onChange={e => setVideoFilters({ ...videoFilters, contrast: parseInt(e.target.value) })}
                            className="w-full accent-indigo-600 h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Saturation filter */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] font-black uppercase text-slate-400">
                            <span>Saturation Levels (Color depth)</span>
                            <span className="text-slate-800">{videoFilters.saturation}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="200"
                            value={videoFilters.saturation}
                            onChange={e => setVideoFilters({ ...videoFilters, saturation: parseInt(e.target.value) })}
                            className="w-full accent-indigo-600 h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Reset Styles */}
                        <button
                          type="button"
                          onClick={() => {
                            setVideoFilters({ brightness: 100, contrast: 100, saturation: 100, grayscale: 0 });
                            setDigitalZoom(1);
                            addStudioLog("Cleared studio video properties, rebound layout default filters.");
                          }}
                          className="w-full py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-wider border border-slate-200"
                        >
                          Reset Filters
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Transmission Launch trigger block */}
                  <div className="bg-slate-900 text-white rounded-[2.5rem] p-6 shadow-xl border border-slate-800 space-y-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <Icons.Radio size={16} className={isBroadcasting ? 'text-red-400 animate-pulse' : 'text-slate-400'} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">PGM Broadcast Center</span>
                      </div>
                      <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded font-mono text-[9px]">
                        OUTPUT: {settings?.video_source === 'LIVE' ? 'ACTIVE LOBBY FEED' : 'LOBBY STANDBY'}
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Transmit local chunks stream block. When started, this chunk buffer encodes and propagates to the network. Keep tab open to maintain direct feed.
                    </p>

                    <div className="pt-2">
                      {isBroadcasting ? (
                        <button
                          type="button"
                          onClick={stopBroadcast}
                          className="w-full py-4.5 bg-red-600 hover:bg-red-700 text-white font-extrabold uppercase text-[11px] tracking-widest rounded-2xl shadow-xl transition-all border-0 flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <span className="w-2.5 h-2.5 bg-white rounded-full animate-ping"></span>
                          <span>STAY LIVE / STOP SIGNAL</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            // Check if video source is not configured as LIVE, automatically update on start
                            if (settings?.video_source !== 'LIVE') {
                              try {
                                addStudioLog("Syncing Lobby display source reference to LIVE stream...");
                                await api.updateDashboardSettings({ video_source: 'LIVE' });
                                fetchData();
                              } catch(e) {
                                console.warn("Lobby sync fail, proceeding broadcast capture:", e);
                              }
                            }
                            startBroadcast();
                          }}
                          className="w-full py-4.5 bg-gradient-to-r from-red-600 to-rose-600 hover:brightness-110 text-white font-extrabold uppercase text-[11px] tracking-widest rounded-2xl shadow-xl transition-all border-0 flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Icons.Radio size={14} className="animate-pulse" />
                          <span>START LIVE BROADCAST</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'officers' ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
               <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 p-12 rounded-[4rem] shadow-2xl shadow-blue-500/30 text-white relative overflow-hidden group">
                <div className="absolute -right-20 -top-20 w-96 h-96 bg-white/10 rounded-full blur-[100px] group-hover:scale-150 transition-transform duration-[2s]" />
                <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-blue-400/20 rounded-full blur-[80px]" />
                <div className="relative z-10 flex flex-col lg:flex-row items-center gap-10">
                  <div className="w-28 h-28 bg-white/20 backdrop-blur-2xl rounded-[3rem] flex items-center justify-center border border-white/30 shadow-2xl group-hover:rotate-6 transition-transform duration-500">
                    <Icons.Community size={56} />
                  </div>
                  <div className="text-center lg:text-left flex-1">
                    <h3 className="text-4xl font-black uppercase tracking-[0.1em] mb-4">Slots Management</h3>
                    <p className="text-blue-50 font-bold max-w-3xl text-xl opacity-90 leading-relaxed">
                      Strategically manage executive availability for the public dashboard. 
                      Changes made here synchronize instantly to the lobby displays, ensuring transparency for all citizens.
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-4 bg-white/10 backdrop-blur-md px-8 py-4 rounded-3xl border border-white/10">
                    <div className="w-4 h-4 bg-emerald-400 rounded-full animate-blink shadow-[0_0_12px_#34d399]" />
                    <span className="text-xs font-black uppercase tracking-widest">Live Sync Active</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                {['ds', 'ads', 'acc', 'ao', 'adp', 'agn'].map(slug => {
                  const slot = slots.find(s => s.slot_id === slug) || { slot_id: slug };
                  const roleLabel = {
                    ds: 'Divisional Secretary',
                    ads: 'Additional Div. Sec',
                    acc: 'Accountant',
                    ao: 'Admin Officer',
                    adp: 'Addl. Director Planning',
                    agn: 'Admin Grama Niladari'
                  }[slug as keyof typeof roleLabel];

                  const statusColors: any = {
                    'Available': 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/40',
                    'In': 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/40',
                    'Out': 'bg-gradient-to-br from-rose-400 to-rose-600 shadow-rose-500/40',
                    'Busy': 'bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-500/40',
                    'Meeting': 'bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-500/40',
                    'Field': 'bg-gradient-to-br from-blue-400 to-blue-600 shadow-blue-500/40'
                  };

                  return (
                    <motion.div 
                      key={slug} 
                      whileHover={{ y: -10 }}
                      className="bg-white p-12 rounded-[4rem] shadow-xl border border-slate-100 space-y-10 hover:shadow-2xl hover:shadow-slate-200/60 transition-all duration-500 group relative"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-[#1877F2] rounded-full" />
                            <span className="text-[12px] font-black uppercase tracking-[0.4em] text-[#1877F2] opacity-40">Core Position</span>
                          </div>
                          <h3 className="font-black text-2xl text-slate-900 tracking-tight leading-tight group-hover:text-[#1877F2] transition-colors">{roleLabel}</h3>
                        </div>
                        <div className={`shrink-0 w-20 h-20 rounded-[2.5rem] flex items-center justify-center text-white shadow-2xl ${statusColors[slot.status || 'Available'] || 'bg-slate-400'} group-hover:scale-110 group-hover:rotate-3 transition-all duration-500`}>
                          <div className="w-5 h-5 bg-white/30 rounded-full animate-ping absolute" />
                          <div className="w-5 h-5 bg-white rounded-full relative z-10" />
                        </div>
                      </div>

                      <div className="space-y-8">
                        <div className="space-y-3">
                          <label className="text-[12px] font-black uppercase tracking-widest text-slate-400 ml-1">Assigned Executive</label>
                          <div className="relative">
                            <select 
                              value={slot.officer_id || ''} 
                              onChange={(e) => handleUpdateSlot(slug, { officer_id: e.target.value === '' ? null : e.target.value })}
                              className="w-full pl-8 pr-12 py-6 bg-slate-50 border-2 border-transparent rounded-[2rem] text-sm font-black appearance-none focus:bg-white focus:border-blue-200 outline-none transition-all cursor-pointer shadow-inner"
                            >
                              <option value="">Vacant / Not Set</option>
                              {officers.map(off => (
                                <option key={off.id} value={off.id}>{off.name}</option>
                              ))}
                            </select>
                            <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                              <Icons.ChevronDown width={24} height={24} />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          {['Available', 'Out', 'Busy', 'Field'].map(st => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => handleUpdateSlot(slug, { status: st })}
                              className={`py-5 rounded-[1.5rem] text-[11px] font-black uppercase tracking-widest transition-all ${
                                (slot.status === st || (st === 'Available' && !slot.status)) ? 'bg-[#1877F2] text-white shadow-2xl shadow-blue-500/30 ring-4 ring-blue-500/10' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 shadow-inner'
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>

                        <div className="space-y-5 pt-6 border-t border-slate-50">
                          <div className="relative group/input">
                            <div className="absolute left-6 top-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-slate-300 group-focus-within/input:text-blue-500 transition-colors shadow-sm">
                              <Icons.Clock size={20} />
                            </div>
                            <input 
                              type="text" 
                              placeholder="Expected Back Time (e.g. 2:30 PM)" 
                              defaultValue={slot.eta || ''}
                              onBlur={(e) => handleUpdateSlot(slug, { eta: e.target.value })}
                              className="w-full pl-20 pr-8 py-5 bg-slate-50 border-2 border-transparent rounded-[1.8rem] text-[12px] font-black outline-none focus:bg-white focus:border-blue-200 transition-all placeholder:text-slate-300 shadow-inner"
                            />
                          </div>
                          <div className="relative group/input">
                            <div className="absolute left-6 top-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-slate-300 group-focus-within/input:text-blue-500 transition-colors shadow-sm">
                              <Icons.User size={20} />
                            </div>
                            <input 
                              type="text" 
                              placeholder="Status Remark (e.g. Official Meeting)" 
                              defaultValue={slot.remarks || ''}
                              onBlur={(e) => handleUpdateSlot(slug, { remarks: e.target.value })}
                              className="w-full pl-20 pr-8 py-5 bg-slate-50 border-2 border-transparent rounded-[1.8rem] text-[12px] font-black outline-none focus:bg-white focus:border-blue-200 transition-all placeholder:text-slate-300 shadow-inner"
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Form Section */}
              <div className="lg:col-span-1">
                <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100 sticky top-24">
                  <h2 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-[#1877F2]">
                      <Icons.Settings size={20} />
                    </div>
                    Add New {activeTab.slice(0, -1)}
                  </h2>

              {activeTab === 'notices' && (
                <form onSubmit={handleCreateNotice} className="space-y-4">
                  <textarea
                    placeholder="Notice content..."
                    className="w-full p-5 bg-slate-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-blue-100 focus:bg-white transition-all min-h-[150px]"
                    value={noticeForm.content}
                    onChange={e => setNoticeForm({ content: e.target.value })}
                  />
                  <button disabled={isSaving} className="w-full py-4 bg-[#1877F2] text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
                    {isSaving ? 'Saving...' : 'Publish Notice'}
                  </button>
                </form>
              )}

              {activeTab === 'events' && (
                <form onSubmit={handleCreateEvent} className="space-y-4">
                  <input
                    placeholder="Event Title"
                    className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none border-2 border-transparent focus:border-blue-100 focus:bg-white transition-all"
                    value={eventForm.title}
                    onChange={e => setEventForm({ ...eventForm, title: e.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="date"
                      className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none border-2 border-transparent focus:border-blue-100 focus:bg-white transition-all"
                      value={eventForm.event_date}
                      onChange={e => setEventForm({ ...eventForm, event_date: e.target.value })}
                    />
                    <input
                      type="time"
                      className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none border-2 border-transparent focus:border-blue-100 focus:bg-white transition-all"
                      value={eventForm.event_time}
                      onChange={e => setEventForm({ ...eventForm, event_time: e.target.value })}
                    />
                  </div>
                  <input
                    placeholder="Location"
                    className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none border-2 border-transparent focus:border-blue-100 focus:bg-white transition-all"
                    value={eventForm.location}
                    onChange={e => setEventForm({ ...eventForm, location: e.target.value })}
                  />
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Event Image (Designed JPG)</label>

                    {/* A 48px thumbnail told you an image existed, not what it
                        was. The lobby screen shows it full-bleed, so the
                        preview is shown at the shape it will appear in. */}
                    {eventForm.image_url && (
                      <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 group">
                        <img
                          src={eventForm.image_url}
                          className="w-full aspect-video object-cover"
                          alt="Event image preview"
                        />
                        <div className="absolute top-2 right-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewImage({ url: eventForm.image_url, title: eventForm.title || 'Event image' })}
                            className="px-3 py-2 min-h-[36px] bg-white/90 backdrop-blur rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-700 shadow"
                          >
                            Full size
                          </button>
                          <button
                            type="button"
                            onClick={() => setEventForm(prev => ({ ...prev, image_url: '' }))}
                            className="px-3 py-2 min-h-[36px] bg-white/90 backdrop-blur rounded-xl text-[9px] font-black uppercase tracking-widest text-rose-600 shadow"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )}

                    <input
                      type="file"
                      accept="image/jpeg,image/jpg"
                      onChange={(e) => handleImageUpload(e, 'event')}
                      className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                    />

                    {imageUploadPercent !== null && (
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Uploading</span>
                          <span className="text-[11px] font-black text-blue-600 tabular-nums">{imageUploadPercent}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full bg-blue-600 rounded-full transition-[width] duration-150"
                            style={{ width: `${imageUploadPercent}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <button disabled={isSaving} className="w-full py-4 bg-[#1877F2] text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
                    {isSaving ? 'Saving...' : 'Add Event'}
                  </button>
                </form>
              )}

              {activeTab === 'videos' && (
                <form onSubmit={handleCreateVideo} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Video Source</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button 
                        type="button" 
                        onClick={() => setVideoForm({ ...videoForm, video_url: '' })}
                        className={`flex-1 py-2 text-[9px] font-black uppercase tracking-tighter rounded-lg transition-all ${!videoForm.video_url.startsWith('/uploads') ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
                      >
                        URL / YouTube
                      </button>
                      <button 
                         type="button"
                         onClick={() => {}} // Just visual toggle if needed, or trigger file input
                         className={`flex-1 py-2 text-[9px] font-black uppercase tracking-tighter rounded-lg transition-all ${videoForm.video_url.startsWith('/uploads') ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
                      >
                        File Upload
                      </button>
                    </div>
                  </div>

                  {!videoForm.video_url.startsWith('/uploads') ? (
                    <input
                      placeholder="Video URL (YouTube/Direct)"
                      className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none border-2 border-transparent focus:border-blue-100 focus:bg-white transition-all"
                      value={videoForm.video_url}
                      onChange={e => setVideoForm({ video_url: e.target.value })}
                    />
                  ) : (
                    <div className="p-4 bg-blue-50 border-2 border-blue-100 rounded-xl flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-700 truncate max-w-[150px]">{videoForm.video_url}</span>
                      <button type="button" onClick={() => setVideoForm({ video_url: '' })} className="text-[10px] font-black text-red-500 uppercase">Clear</button>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Upload Local Video (MP4)</label>
                    <input
                      type="file"
                      accept="video/mp4,video/x-m4v,video/*"
                      onChange={handleVideoUpload}
                      className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      disabled={isSaving || videos.length === 0} 
                      onClick={handleSkipVideo}
                      className="flex-1 py-4 bg-purple-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-purple-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Icons.Play size={14} /> Skip / Play Next
                    </button>
                    <button disabled={isSaving} className="flex-[2] py-4 bg-[#1877F2] text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
                      {isSaving ? 'Processing...' : 'Add Video to Queue'}
                    </button>
                  </div>
                </form>
              )}

              {activeTab === 'alerts' && (
                <form onSubmit={handleCreateAlert} className="space-y-4">
                  <textarea
                    placeholder="Emergency Message..."
                    className="w-full p-5 bg-red-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-red-100 focus:bg-white transition-all min-h-[120px] text-red-600"
                    value={alertForm.message}
                    onChange={e => setAlertForm({ message: e.target.value })}
                  />
                  <button disabled={isSaving} className="w-full py-4 bg-red-500 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-red-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
                    {isSaving ? 'Saving...' : 'Broadcast Alert'}
                  </button>
                </form>
              )}

              {activeTab === 'settings' && settings && (
                <form onSubmit={handleUpdateSettings} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Video Source</label>
                    <select
                      className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none border-2 border-transparent focus:border-blue-100 focus:bg-white transition-all"
                      value={settings.video_source || 'URL'}
                      onChange={e => setSettings({ ...settings, video_source: e.target.value as any })}
                    >
                      <option value="URL">URL/YouTube/Playlist</option>
                      <option value="FILE">Uploaded High-Res Video</option>
                      <option value="HDMI">HDMI Capture Card</option>
                      <option value="LIVE">Live Broadcast</option>
                    </select>
                  </div>

                  {settings.video_source === 'LIVE' && (
                    <div className="p-4 bg-red-50/50 border border-red-100/60 rounded-2xl flex items-center gap-3">
                      <Icons.Broadcast className="w-5 h-5 text-red-500 animate-pulse shrink-0" />
                      <div className="flex-1">
                        <p className="text-[11px] font-bold text-slate-700">Live Source Selected</p>
                        <p className="text-[9px] text-slate-500">Go to the dedicated <button type="button" onClick={() => setActiveTab('live')} className="text-blue-500 font-bold underline hover:text-blue-600 outline-none">Live Studio</button> tab at the top of this workspace to open the TV Broadcast Control Center.</p>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Birthday Section Image (JPG)</label>
                    <div className="flex items-center gap-4">
                      {settings.birthday_image_url && (
                        <button
                          type="button"
                          onClick={() => setPreviewImage({ url: settings.birthday_image_url as string, title: 'Birthday billboard image' })}
                          title="View full size"
                          className="w-12 h-12 rounded-lg overflow-hidden border flex-none hover:ring-4 hover:ring-blue-100 transition-all"
                        >
                          <img src={settings.birthday_image_url} className="w-full h-full object-cover" alt="Birthday billboard preview" />
                        </button>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg"
                        onChange={(e) => handleImageUpload(e, 'birthday')}
                        className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Default Profile Cover Picture (JPG)</label>
                    <div className="flex items-center gap-4">
                      {settings.default_cover_pic && (
                        <img src={settings.default_cover_pic} className="w-12 h-12 rounded-lg object-cover border" alt="preview" />
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg"
                        onChange={(e) => handleImageUpload(e, 'cover')}
                        className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Refresh Interval (Seconds)</label>
                    <input
                      type="number"
                      className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none border-2 border-transparent focus:border-blue-100 focus:bg-white transition-all"
                      value={settings.refresh_interval ?? 30}
                      onChange={e => setSettings({ ...settings, refresh_interval: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Scrolling Speed (Pixels/Frame)</label>
                    <input
                      type="number"
                      className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none border-2 border-transparent focus:border-blue-100 focus:bg-white transition-all"
                      value={settings.scrolling_speed ?? 2}
                      onChange={e => setSettings({ ...settings, scrolling_speed: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <button disabled={isSaving} className="w-full py-4 bg-[#1877F2] text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
                    {isSaving ? 'Saving...' : 'Update Settings'}
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* List Section */}
          <div className="lg:col-span-2 space-y-4">
            {activeTab === 'notices' && notices.map(notice => (
              <div key={notice.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="font-bold text-slate-700 leading-relaxed">{notice.content}</p>
                  <div className="flex items-center gap-3 mt-3">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${notice.is_active ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
                      {notice.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleToggleNotice(notice)} className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-blue-50 hover:text-[#1877F2] transition-all">
                    <Icons.Clock size={16} />
                  </button>
                  <button onClick={() => handleDeleteNotice(notice.id)} className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all">
                    <Icons.AlertTriangle size={16} />
                  </button>
                </div>
              </div>
            ))}

            {activeTab === 'events' && events.map(event => (
              <div key={event.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  {/* The image is what the lobby screen actually shows, and the
                      list never displayed it - so there was no way to tell
                      which event had one, or what had been uploaded. */}
                  {event.image_url ? (
                    <button
                      type="button"
                      onClick={() => setPreviewImage({ url: event.image_url as string, title: event.title })}
                      title="View full size"
                      className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-200 flex-none hover:ring-4 hover:ring-blue-100 transition-all"
                    >
                      <img src={event.image_url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ) : (
                    <div className="w-14 h-14 bg-blue-50 rounded-2xl flex flex-col items-center justify-center text-[#1877F2] flex-none">
                      {event.event_date ? (
                        <>
                          <span className="text-[10px] font-black uppercase tracking-tighter">{format(new Date(event.event_date), 'MMM')}</span>
                          <span className="text-xl font-black leading-none">{format(new Date(event.event_date), 'dd')}</span>
                        </>
                      ) : (
                        <Icons.Gallery size={24} className="opacity-40" />
                      )}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-black text-slate-900 truncate">{event.title}</h3>
                    <div className="flex items-center gap-4 mt-1 text-[11px] font-bold text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1.5"><Icons.Clock size={12} /> {event.event_time}</span>
                      <span className="flex items-center gap-1.5"><Icons.Map size={12} /> {event.location}</span>
                      {!event.image_url && (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-[9px] font-black uppercase tracking-widest">
                          No image
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={() => handleDeleteEvent(event.id)} className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all">
                  <Icons.AlertTriangle size={16} />
                </button>
              </div>
            ))}

            {activeTab === 'videos' && videos.map((video, index) => (
              <div key={video.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 overflow-hidden">
                  <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 flex-none font-black">
                    #{index + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-700 truncate">{video.video_url}</p>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sequence #{index + 1}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-1">
                    <button 
                      disabled={index === 0}
                      onClick={() => handleMoveVideo(index, 'up')}
                      className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30 transition-all"
                    >
                      <Icons.TrendingUp size={14} className="rotate-180" />
                    </button>
                    <button 
                      disabled={index === videos.length - 1}
                      onClick={() => handleMoveVideo(index, 'down')}
                      className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30 transition-all"
                    >
                      <Icons.TrendingUp size={14} />
                    </button>
                  </div>
                  <button onClick={() => handleDeleteVideo(video.id)} className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all">
                    <Icons.Trash size={18} />
                  </button>
                </div>
              </div>
            ))}

            {activeTab === 'alerts' && alerts.map(alertItem => (
              <div key={alertItem.id} className={`p-6 rounded-[2rem] shadow-sm border flex items-start justify-between gap-4 transition-all ${alertItem.is_active ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100 opacity-60'}`}>
                <div className="flex-1">
                  <p className={`font-black leading-relaxed ${alertItem.is_active ? 'text-red-600' : 'text-slate-500'}`}>{alertItem.message}</p>
                  <div className="flex items-center gap-3 mt-3">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${alertItem.is_active ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {alertItem.is_active ? 'Broadcasting' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleToggleAlert(alertItem)} className={`p-3 rounded-xl transition-all ${alertItem.is_active ? 'bg-white text-red-600 shadow-sm' : 'bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-600'}`}>
                    <Icons.AlertTriangle size={16} />
                  </button>
                  <button onClick={() => handleDeleteAlert(alertItem.id)} className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all">
                    <Icons.AlertTriangle size={16} />
                  </button>
                </div>
              </div>
            ))}

            {activeTab === 'settings' && (
              <div className="bg-blue-50 p-10 rounded-[3rem] border border-blue-100 flex flex-col items-center text-center space-y-6">
                <div className="w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center text-[#1877F2]">
                  <Icons.Settings size={40} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Dashboard Configuration</h3>
                  <p className="text-slate-500 font-bold mt-2 max-w-md mx-auto">These settings control the behavior of the public display screen. Changes are applied in real-time.</p>
                </div>
              </div>
            )}

            {((activeTab === 'notices' && notices.length === 0) || 
               (activeTab === 'events' && events.length === 0) || 
               (activeTab === 'videos' && videos.length === 0) || 
               (activeTab === 'alerts' && alerts.length === 0)) && (
              <div className="bg-slate-50 p-20 rounded-[3rem] border border-dashed border-slate-200 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-slate-300 mb-4">
                  <Icons.Info size={32} />
                </div>
                <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">No {activeTab} found</p>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  </AnimatePresence>

    {/* Full-size preview. The lobby screen shows these images across a whole
        wall, so judging one from a thumbnail is guesswork. */}
    {previewImage && (
      <div
        onClick={() => setPreviewImage(null)}
        className="fixed inset-0 z-[300] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-10"
      >
        <div onClick={(e) => e.stopPropagation()} className="max-w-4xl w-full">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-white font-black uppercase tracking-widest text-[11px] truncate">
              {previewImage.title || 'Image'}
            </p>
            <button
              onClick={() => setPreviewImage(null)}
              className="shrink-0 w-10 h-10 min-h-[40px] bg-white/10 hover:bg-white/20 text-white rounded-xl font-black"
              aria-label="Close preview"
            >✕</button>
          </div>
          <img
            src={previewImage.url}
            alt={previewImage.title || ''}
            className="w-full max-h-[75vh] object-contain rounded-2xl bg-slate-950"
          />
        </div>
      </div>
    )}
    </div>
  );
};

export default PublicDashboardControl;
