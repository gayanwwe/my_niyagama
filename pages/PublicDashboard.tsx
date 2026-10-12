import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactPlayer from 'react-player';
import { api } from '../service/api';
import { Icons } from '../constants';
import { format } from 'date-fns';

const Player = ReactPlayer as any;

const PublicDashboard = () => {
  const [data, setData] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedOutputId, setSelectedOutputId] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileVideoRef = useRef<HTMLVideoElement>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isLiveMuted, setIsLiveMuted] = useState(true);
  const [liveFrameSrc, setLiveFrameSrc] = useState<string | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const viewerIdRef = useRef<string>(Math.random().toString(36).substring(2, 10));
  const liveSocketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current.requestFullscreen().catch(err => {
        console.error("Error enabling fullscreen:", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  useEffect(() => {
    if (data?.settings?.video_source !== 'LIVE') {
      setIsLiveActive(false);
      setWsStatus('disconnected');
      if (liveSocketRef.current) {
        try { liveSocketRef.current.close(); } catch(e) {}
        liveSocketRef.current = null;
      }
      if (peerConnectionRef.current) {
        try { peerConnectionRef.current.close(); } catch(e) {}
        peerConnectionRef.current = null;
      }
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let pollingIntervalId: any = null;
    let framePollIntervalId: any = null;
    let isDestroyed = false;
    let fallbackToPolling = false;
    const viewerId = viewerIdRef.current;

    const cleanupPC = () => {
      if (peerConnectionRef.current) {
        try { peerConnectionRef.current.close(); } catch(e) {}
        peerConnectionRef.current = null;
      }
    };

    const initPeerConnection = () => {
      cleanupPC();
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignalingMessage({
            type: 'candidate',
            target: 'broadcaster',
            candidate: event.candidate
          });
        }
      };

      pc.ontrack = (event) => {
        console.log("[Viewer WebRTC] Remote media track received!", event.streams[0], event.track);
        if (liveVideoRef.current) {
          let stream = event.streams[0];
          if (!stream) {
            // Find existing or create new stream container to bind separate tracks
            const existing = liveVideoRef.current.srcObject;
            if (existing instanceof MediaStream) {
              stream = existing;
            } else {
              stream = new MediaStream();
            }
            stream.addTrack(event.track);
          }
          liveVideoRef.current.srcObject = stream;
          setIsLiveActive(true);
          liveVideoRef.current.play().catch(e => {
            console.warn("[Viewer WebRTC] Video autoplay caught, remaining muted:", e);
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log("[Viewer WebRTC] Connection state change:", pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          console.warn("[Viewer WebRTC] Connection state degraded.");
        }
      };
    };

    const sendSignalingMessage = async (msg: any) => {
      if (isDestroyed) return;
      const payload = { ...msg, sender: viewerId };
      if (!fallbackToPolling && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
      } else {
        try {
          await fetch('/api/live-signaling/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } catch (e) {
          console.error("[Viewer WebRTC] Failed to send polling signal:", e);
        }
      }
    };

    const handleSignalingMessage = async (msg: any) => {
      if (isDestroyed) return;
      if (!peerConnectionRef.current) {
        initPeerConnection();
      }
      const pc = peerConnectionRef.current!;

      if (msg.type === 'offer') {
        console.log("[Viewer WebRTC] SDP Offer received. Handshaking...");
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignalingMessage({
            type: 'answer',
            target: 'broadcaster',
            sdp: answer
          });
        } catch (err) {
          console.error("[Viewer WebRTC] Offer processing failed:", err);
        }
      } else if (msg.type === 'candidate' && msg.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch (err) {
          console.error("[Viewer WebRTC] IceCandidate add failed:", err);
        }
      } else if (msg.type === 'ended') {
        console.log("[Viewer WebRTC] Streaming ended by broadcaster.");
        setIsLiveActive(false);
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = null;
        }
        cleanupPC();
      }
    };

    const startPollingFallback = async () => {
      if (fallbackToPolling || isDestroyed) return;
      fallbackToPolling = true;
      setWsStatus('connecting');
      console.log("[Viewer WebRTC] falling back to REST-signaling polling loop...");

      try {
        await fetch('/api/live-signaling/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'viewer', id: viewerId })
        });
        setWsStatus('connected');
        initPeerConnection();
      } catch (e) {
        console.error("Signaling fallback registration failed:", e);
      }

      pollingIntervalId = setInterval(async () => {
        if (isDestroyed || document.hidden) return;
        try {
          const res = await fetch(`/api/live-signaling/poll?id=${viewerId}&role=viewer`);
          const data = await res.json();
          if (data && data.messages) {
            for (const msg of data.messages) {
              await handleSignalingMessage(msg);
            }
          }
        } catch (e) {
          console.error("Polling error:", e);
        }
      }, 1500);

      // Poll lightweight stream status check to detect when feed goes live
      framePollIntervalId = setInterval(async () => {
        if (isDestroyed || document.hidden) return;
        try {
          const res = await fetch('/api/live-stream/status');
          if (res.status === 200) {
            const result = await res.json();
            if (result && result.isLive) {
              if (!isLiveActive) {
                // Instantly point image source to the high frame-rate native MJPEG stream
                setLiveFrameSrc(`/api/live-stream/mjpeg?t=${result.timestamp}`);
                setIsLiveActive(true);
              }
            } else {
              if (isLiveActive) {
                setIsLiveActive(false);
                setLiveFrameSrc(null);
              }
            }
          }
        } catch (e) {
          console.error("Error polling live stream status:", e);
        }
      }, 3000);
    };

    const connectWS = () => {
      if (isDestroyed || fallbackToPolling) return;
      setWsStatus('connecting');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socketUrl = `${protocol}//${window.location.host}/api/live-stream?role=viewer&viewerId=${viewerId}`;

      console.log(`[Viewer WS] Connecting WebRTC signaling: ${socketUrl}`);
      try {
        socket = new WebSocket(socketUrl);
        liveSocketRef.current = socket;

        const connectionTimeout = setTimeout(() => {
          if (socket && socket.readyState !== WebSocket.OPEN && !fallbackToPolling) {
            console.log("[Viewer WS] Connection taking too long (6s). Transitioning to polling...");
            try { socket.close(); } catch(e) {}
            startPollingFallback();
          }
        }, 6000);

        socket.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log("[Viewer WS] WebRTC signaling socket connected!");
          setWsStatus('connected');
          if (socket) {
            socket.binaryType = 'blob';
          }
          initPeerConnection();
        };

        socket.onmessage = async (event) => {
          if (event.data instanceof Blob) {
            const objUrl = URL.createObjectURL(event.data);
            setLiveFrameSrc((prev) => {
              if (prev && prev.startsWith('blob:')) {
                URL.revokeObjectURL(prev);
              }
              return objUrl;
            });
            setIsLiveActive(true);
          } else {
            try {
              const data = JSON.parse(event.data);
              await handleSignalingMessage(data);
            } catch(err) {
              console.error("Error parsing WS signaling frame:", err);
            }
          }
        };

        socket.onerror = (err) => {
          console.error("[Viewer WS] Signaling failure. Swapping to polling fallback:", err);
          clearTimeout(connectionTimeout);
          startPollingFallback();
        };

        socket.onclose = () => {
          console.log("[Viewer WS] Signaling closed.");
          if (!isDestroyed && !fallbackToPolling) {
            reconnectTimeout = setTimeout(connectWS, 3000);
          }
        };
      } catch (err) {
        console.error("WS error:", err);
        startPollingFallback();
      }
    };

    connectWS();

    return () => {
      isDestroyed = true;
      if (socket) {
        try { socket.close(); } catch(e) {}
      }
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (pollingIntervalId) clearInterval(pollingIntervalId);
      if (framePollIntervalId) clearInterval(framePollIntervalId);
      cleanupPC();
      setIsLiveActive(false);
      setLiveFrameSrc((prev) => {
        if (prev && prev.startsWith('blob:')) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = null;
      }
    };
  }, [data?.settings?.video_source, loading]);

  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
    }
  }, [videoStream]);

  // Handle sink ID changes for routing audio to HDMI
  useEffect(() => {
    const setSink = async (el: HTMLMediaElement | null) => {
      if (el && 'setSinkId' in el && selectedOutputId) {
        try {
          await (el as any).setSinkId(selectedOutputId);
          console.log(`Audio routed to ${selectedOutputId}`);
        } catch (err) {
          console.error("Failed to set audio sink:", err);
        }
      }
    };
    setSink(videoRef.current);
    setSink(fileVideoRef.current);
  }, [selectedOutputId]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await api.getPublicDashboardData();
        setData(result);
        setLoading(false);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
        setError("Failed to load dashboard data. Retrying...");
      }
    };

    fetchData();
    const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000);

    return () => {
      clearInterval(timeInterval);
    };
  }, []);

  // Dedicated conditional setup for HDMI Capture Source to avoid unsolicited camera asks
  useEffect(() => {
    if (loading || data?.settings?.video_source !== 'HDMI') {
      if (videoStream) {
        videoStream.getTracks().forEach(t => t.stop());
        setVideoStream(null);
      }
      return;
    }

    let isEffectDestroyed = false;

    const setupDevices = async () => {
      try {
        console.log("[Lobby Dashboard] Initializing HDMI intake on request...");
        // Request permission only on active demand
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          .then(s => s.getTracks().forEach(t => t.stop()))
          .catch(() => {});

        if (isEffectDestroyed) return;

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        const audioOutputsList = devices.filter(d => d.kind === 'audiooutput');
        
        setAudioOutputs(audioOutputsList);

        // Auto-select HDMI if found in outputs
        const hdmiOutput = audioOutputsList.find(d => 
          d.label.toLowerCase().includes('hdmi') || 
          d.label.toLowerCase().includes('tv') ||
          d.label.toLowerCase().includes('display')
        );
        if (hdmiOutput) {
          setSelectedOutputId(hdmiOutput.deviceId);
        }

        const captureCard = videoDevices.find(d => 
          d.label.toLowerCase().includes('hdmi') || 
          d.label.toLowerCase().includes('capture') ||
          d.label.toLowerCase().includes('video') ||
          d.label.toLowerCase().includes('grabber') ||
          d.label.toLowerCase().includes('cam link') ||
          d.label.toLowerCase().includes('source')
        );

        const targetDevice = captureCard || videoDevices[videoDevices.length - 1];

        if (targetDevice && !isEffectDestroyed) {
          const audioCapture = audioInputs.find(d => 
            d.label.toLowerCase().includes(targetDevice.label.toLowerCase()) ||
            d.label.toLowerCase().includes('hdmi') ||
            d.label.toLowerCase().includes('capture')
          );

          const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
              deviceId: { exact: targetDevice.deviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 }
            },
            audio: audioCapture ? { deviceId: { exact: audioCapture.deviceId } } : true
          });
          
          if (!isEffectDestroyed) {
            setVideoStream(stream);
          } else {
            stream.getTracks().forEach(t => t.stop());
          }
        }
      } catch (err) {
        console.error("Failed to setup HDMI capture devices gracefully:", err);
      }
    };

    setupDevices();

    return () => {
      isEffectDestroyed = true;
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [data?.settings?.video_source, loading]);

  // Separate effect for periodical data refresh
  useEffect(() => {
    if (loading) return;

    const intervalMs = (data?.settings?.refresh_interval || 60) * 1000;
    
    const interval = setInterval(async () => {
      try {
        const result = await api.getPublicDashboardData();
        setData(result);
      } catch (err) {
        console.error("Interval fetch failed:", err);
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [data?.settings?.refresh_interval, loading]);

  // Expired slot ETAs are applied by the server's presence sweep. This used to
  // run here on a one-second tick, calling an authenticated endpoint from a
  // screen that has no credentials: every call returned 401, the ETA was never
  // cleared, so the condition stayed true and it retried indefinitely while the
  // displayed status never changed.

  const ADMIN_ROLES = [
    { id: 'ds', code: 'DS', sinhala: 'ප්‍රාදේශීය ලේකම්', english: 'Divisional Secretary', tamil: 'கோட்டச் செயலாளர்' },
    { id: 'ads', code: 'ADS', sinhala: 'සහකා​ර ප්‍රාදේශීය ලේකම්', english: 'Assistant Divisional Secretary', tamil: 'உதவி கோட்டச் செயலாளர்' },
    { id: 'acc', code: 'Accountant', sinhala: 'ගණකාධිකාරී', english: 'Accountant', tamil: 'கணக்காளர்' },
    { id: 'ao', code: 'AO', sinhala: 'පරිපාලන නිලධාරී', english: 'Administrative Officer', tamil: 'நிர்வாக அதிகாரி' },
    { id: 'adp', code: 'ADP', sinhala: 'සහකා​ර සැලසුම් අධ්‍යක්ෂ', english: 'Assistant Director of Planning', tamil: 'திட்டமிடல் உதவி இயக்குநர்' },
    { id: 'agn', code: 'AGN', sinhala: 'පරිපාලන ග්‍රාම නිලධාරී', english: 'Administrative Grama Niladari', tamil: 'நிர்வாக கிராம அதிகாரி' }
  ];

  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);

  useEffect(() => {
    if (!data?.events || data.events.length <= 1) return;

    const currentEvent = data.events[currentEventIndex];
    const eventDate = currentEvent?.event_date ? new Date(currentEvent.event_date) : null;
    const isToday = eventDate && format(eventDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
    
    const duration = isToday ? 30000 : 15000;

    const timer = setTimeout(() => {
      setCurrentEventIndex((prev) => (prev + 1) % data.events.length);
    }, duration);

    return () => clearTimeout(timer);
  }, [currentEventIndex, data?.events]);

  const handleVideoEnded = () => {
    if (data?.videos && data.videos.length > 1) {
      setCurrentVideoIndex((prev) => (prev + 1) % data.videos.length);
    }
  };

  useEffect(() => {
    if (data?.settings?.video_playlist_skip) {
      handleVideoEnded();
    }
  }, [data?.settings?.video_playlist_skip]);

  if (loading && !data) {
    return (
      <div className="h-screen w-screen bg-[#050505] flex items-center justify-center text-white">
        <div className="text-center">
          <Icons.Clock className="w-12 h-12 animate-pulse mx-auto mb-4 text-purple-500" />
          <p className="text-xl font-medium tracking-widest uppercase">Initializing Pulse Core...</p>
        </div>
      </div>
    );
  }

  const activeAlert = data?.emergency_alerts?.find((a: any) => a.is_active);

  return (
    <div className={`h-screen w-screen ${theme === 'dark' ? 'bg-[#050505] text-white' : 'bg-[#f0f2f5] text-slate-900'} overflow-hidden flex flex-col font-sans selection:bg-purple-500/30 transition-colors duration-500`}>
      {/* Theme Toggle Overlay */}
      <button 
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        className="fixed bottom-16 right-6 z-[110] p-4 bg-white/10 backdrop-blur-xl rounded-full border border-white/10 hover:bg-white/20 transition-all shadow-2xl"
      >
        {theme === 'light' ? '🌙' : '☀️'}
      </button>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden p-2 flex gap-2">
        {/* Left Column: Officer Availability (Full Height) - Optimized width for Sinhala names */}
        <section className={`flex-[1.5] ${theme === 'dark' ? 'bg-[#0c0c0c] border-white/5' : 'bg-white border-slate-200'} border rounded-3xl p-4 flex flex-col overflow-hidden shadow-2xl shrink-0`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-xl font-black tracking-tight flex items-center gap-3 ${theme === 'dark' ? 'text-purple-400' : 'text-[#1877F2]'}`}>
              Officer Availability
              <Icons.Community className="w-5 h-5 opacity-50" />
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar flex flex-col gap-1.5">
            {data?.slots?.map((slot: any) => {
              const roleLabels: any = {
                ds: { sinhala: 'ප්‍රාදේශීය ලේකම්', english: 'Divisional Secretary', tamil: 'பொதுச் செயலாளர்' },
                ads: { sinhala: 'සහකා​ර ප්‍රාදේශීය ලේකම්', english: 'Assistant Div. Secretary', tamil: 'உதவி கோட்டச் செயலாளர்' },
                acc: { sinhala: 'ගණකාධිකාරී', english: 'Accountant', tamil: 'கணக்காளர்' },
                ao: { sinhala: 'පරිපාලන නිලධාරී', english: 'Administrative Officer', tamil: 'நிர்வாக அதிகாரி' },
                adp: { sinhala: 'සහකා​ර සැලසුම් අධ්‍යක්ෂ', english: 'Assistant Director of Planning', tamil: 'திட்டமிடல் உதவி இயக்குநர்' },
                agn: { sinhala: 'පරිපාලන ග්‍රාම නිලධාරී', english: 'Admin. Grama Niladari', tamil: 'நிර්வாக கிராம அதிகாரி' }
              };
              const langData = roleLabels[slot.slot_id] || { english: slot.slot_id, sinhala: '', tamil: '' };
              
              const status = (slot.status || 'OUT').toUpperCase();
              let statusColor = 'bg-[#ef4444]';
              let shadowColor = 'rgba(239, 68, 68, 0.6)';
              let statusTextDisplay = 'OUT';

              if (status === 'AVAILABLE' || status === 'IN') {
                statusColor = 'bg-[#22c55e]';
                shadowColor = 'rgba(34, 197, 94, 0.6)';
                statusTextDisplay = 'IN';
              } else if (status === 'MEETING' || status === 'BUSY') {
                statusColor = 'bg-[#eab308]';
                shadowColor = 'rgba(234, 179, 8, 0.6)';
                statusTextDisplay = 'BUSY';
              } else if (status === 'FIELD') {
                statusColor = 'bg-[#3b82f6]';
                shadowColor = 'rgba(59, 130, 246, 0.6)';
                statusTextDisplay = 'FIELD';
              }

              // Countdown Logic for ETA
              const renderETA = () => {
                if (!slot.eta) return null;
                
                const timeStr = slot.eta.toUpperCase().replace('.', ':');
                const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/);
                const relativeMatch = timeStr.match(/(\d+)\s*(MIN|M|MINUTES)/);
                
                let targetDate: Date | null = null;
                if (timeMatch) {
                  const [_, hoursStr, minutesStr, ampm] = timeMatch;
                  let hours = parseInt(hoursStr);
                  const minutes = parseInt(minutesStr);
                  if (ampm === 'PM' && hours < 12) hours += 12;
                  if (ampm === 'AM' && hours === 12) hours = 0;
                  targetDate = new Date();
                  targetDate.setHours(hours, minutes, 0, 0);
                } else if (relativeMatch && slot.updated_at) {
                  const mins = parseInt(relativeMatch[1]);
                  targetDate = new Date(new Date(slot.updated_at).getTime() + mins * 60000);
                }
                
                if (targetDate) {
                  const diff = targetDate.getTime() - currentTime.getTime();
                  if (diff > 0) {
                    const h = Math.floor(diff / 3600000);
                    const m = Math.floor((diff % 3600000) / 60000);
                    const s = Math.floor((diff % 60000) / 1000);
                    const countdownStr = h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
                    
                    return (
                        <div className="flex flex-col items-center animate-in fade-in zoom-in duration-700">
                           <div className="flex items-center gap-1 px-3 py-1.5 bg-[#1877F2] rounded-full shadow-xl shadow-blue-500/30 border border-white/20">
                             <div className="w-1.5 h-1.5 rounded-full bg-white opacity-80 animate-pulse" />
                             <span className="text-[13pt] font-black text-white tracking-tighter tabular-nums leading-none">{countdownStr}</span>
                           </div>
                        </div>
                    );
                  }
                  
                  // Countdown finished - return null to hide the ETA
                  return null;
                }

                // If it contains "BACK IN" but we couldn't parse a target date (e.g. invalid format)
                // and it's likely a stale entry, we'll hide it if requested.
                // However, if it's just a general note, it will fall through to display the string.
                if (slot.eta.toUpperCase().includes('BACK IN') || slot.eta.toUpperCase().includes('OFF IN')) {
                  return null;
                }
                
                return (
                  <div className="px-3 py-1 bg-black/5 rounded-full border border-black/5">
                    <span className="text-[8pt] font-black text-slate-400 uppercase tracking-widest">{slot.eta}</span>
                  </div>
                );
              };

              return (
                <div key={slot.slot_id} className={`${theme === 'dark' ? 'bg-[#111111] border-white/5' : 'bg-white border-slate-100'} border rounded-3xl px-6 py-2 flex items-center justify-between transition-all flex-1 min-h-[115px] shadow-sm relative overflow-visible`}>
                  <div className="flex flex-col gap-0 min-w-0 flex-1">
                    <h3 className={`text-[30pt] font-black leading-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'} tracking-tight whitespace-nowrap`}>
                      {langData.sinhala || slot.officer_post || 'Post'}
                    </h3>
                    <h4 className={`text-[15pt] font-bold leading-tight ${theme === 'dark' ? 'text-white/80' : 'text-slate-600'} truncate uppercase tracking-widest mt-0.5`}>
                      {langData.english}
                    </h4>
                    <p className={`text-[12pt] font-medium leading-tight ${theme === 'dark' ? 'text-white/40' : 'text-slate-400'} truncate mt-0.5`}>
                      {langData.tamil}
                    </p>
                    {slot.name && (
                      <p className={`text-[14pt] font-black tracking-widest uppercase mt-1 ${status === 'AVAILABLE' || status === 'IN' ? 'text-green-500' : 'text-slate-400'}`}>
                        {slot.name}
                      </p>
                    )}
                  </div>

                  <div className="flex-1 flex justify-center items-center">
                    {renderETA()}
                  </div>
                  
                  <div className="shrink-0 ml-4 flex flex-col items-center justify-center relative w-24 h-full min-h-[90px]">
                    <div 
                      style={{ boxShadow: `0 0 30px ${shadowColor}` }}
                      className={`w-20 h-20 rounded-full ${statusColor} border-4 border-black/10 flex items-center justify-center animate-pulse transition-all duration-700 z-10`}
                    >
                      <span className="text-[15pt] font-black text-white leading-none tracking-tighter uppercase whitespace-nowrap">
                        {statusTextDisplay}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right Column: Video Feed & Bottom Tiles */}
        <div className="flex-[2.5] flex flex-col gap-2 overflow-hidden">
          {/* Video Feed (16:9 aspect) */}
          <section ref={playerContainerRef} className={`w-full aspect-video ${theme === 'dark' ? 'bg-[#0c0c0c] border-white/5' : 'bg-white border-slate-200'} border rounded-3xl overflow-hidden relative group shadow-2xl shrink-0 ${isFullscreen ? 'fixed inset-0 z-[9999] rounded-none border-none' : ''}`}>
            {data?.settings?.video_source === 'LIVE' ? (
              isLiveActive ? (
                <div className="w-full h-full relative bg-black">
                  <img
                    src={liveFrameSrc || undefined}
                    className="w-full h-full object-cover bg-black"
                    alt="Live Broadcast Feed"
                  />
                  <div className="absolute top-4 left-6 px-3 py-1 bg-red-600 text-white text-[8px] font-black uppercase tracking-widest rounded-md shadow-lg flex items-center gap-1.5 animate-pulse">
                    <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                    Live Broadcast
                  </div>
                </div>
              ) : (
                <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center gap-3 text-white p-6">
                  <Icons.Radio className="w-16 h-16 text-slate-600 animate-pulse" />
                  <p className="text-xs font-black uppercase tracking-widest text-[#94a3b8]">Waiting for Live Broadcast...</p>
                  <p className="text-[10px] text-slate-500 max-w-sm text-center">No active live transmitter found. Ensure the control center has started broadcasting.</p>
                </div>
              )
            ) : data?.settings?.video_source === 'HDMI' && videoStream ? (
              <div className="w-full h-full relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-4 left-6 px-3 py-1 bg-emerald-500 text-white text-[8px] font-black uppercase tracking-widest rounded-md shadow-lg">
                  HDMI Source Active
                </div>
              </div>
            ) : data?.settings?.video_source === 'FILE' && data?.videos?.length > 0 ? (
                <div className="w-full h-full relative bg-black">
                  <video
                    ref={fileVideoRef}
                    key={data.videos[currentVideoIndex % data.videos.length]?.video_url || data.videos[currentVideoIndex % data.videos.length]?.url}
                    autoPlay
                    onEnded={handleVideoEnded}
                    playsInline
                    className="w-full h-full object-contain"
                  >
                    <source 
                      src={data.videos[currentVideoIndex % data.videos.length]?.video_url || data.videos[currentVideoIndex % data.videos.length]?.url} 
                    />
                    Your browser does not support the video tag.
                  </video>
                  <div className="absolute top-4 left-6 px-3 py-1 bg-blue-600/80 backdrop-blur-sm text-white text-[8px] font-black uppercase tracking-widest rounded-md shadow-lg z-20">
                    Playlist: {currentVideoIndex + 1} / {data.videos.length}
                  </div>
                </div>
            ) : data?.videos?.length > 0 ? (
              <Player
                url={data.videos[currentVideoIndex % data.videos.length]?.video_url || data.videos[currentVideoIndex % data.videos.length]?.url}
                playing
                onEnded={handleVideoEnded}
                width="100%"
                height="100%"
                config={{
                  youtube: {
                    playerVars: { 
                      controls: 0, 
                      modestbranding: 1,
                      rel: 0
                    }
                  }
                }}
                className="opacity-80 group-hover:opacity-100 transition-opacity duration-700"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-purple-900/20 to-black flex items-center justify-center">
                <Icons.Video className="w-20 h-20 text-purple-500/20 animate-pulse" />
              </div>
            )}

            {/* Video Player Fullscreen Toggle Overlay Button */}
            <button
              onClick={toggleFullscreen}
              className="absolute bottom-4 right-4 z-[110] p-2.5 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 text-white/90 hover:text-white hover:bg-black/80 hover:scale-[1.05] active:scale-95 transition-all shadow-xl font-black text-[9px] tracking-widest flex items-center gap-2 uppercase cursor-pointer"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Player"}
            >
              {isFullscreen ? (
                <>
                  <Icons.Minimize className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Minimize</span>
                </>
              ) : (
                <>
                  <Icons.Maximize className="w-3.5 h-3.5 text-blue-400" />
                  <span>Full Screen</span>
                </>
              )}
            </button>

            {/* Audio Output Selector Overlay */}
            {audioOutputs.length > 1 && (
              <div className="absolute bottom-4 right-6 z-[110] flex flex-col items-end gap-2">
                 <div className="flex bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-2 overflow-hidden shadow-2xl">
                    {audioOutputs.map(output => (
                       <button
                         key={output.deviceId}
                         onClick={() => setSelectedOutputId(output.deviceId)}
                         title={output.label}
                         className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${selectedOutputId === output.deviceId ? 'bg-blue-600 text-white' : 'text-white/60 hover:bg-white/10'}`}
                       >
                         {output.label.toLowerCase().includes('hdmi') ? '📺 HDMI' : output.label.toLowerCase().includes('speaker') ? '💻 Laptop' : output.label.slice(0, 15)}
                       </button>
                    ))}
                 </div>
                 <p className="text-[7px] font-black text-white/40 uppercase tracking-[0.2em] mr-2">Playback Source</p>
              </div>
            )}

            {/* Clock Overlay */}
            <div className="absolute top-4 right-6 text-right z-10 p-4 bg-black/20 backdrop-blur-md rounded-2xl border border-white/10">
              <div className={`text-xl font-black uppercase tracking-widest ${theme === 'dark' ? 'text-white/80' : 'text-slate-200'} mb-1`}>
                {format(currentTime, 'yyyy MMMM dd')}
              </div>
              <div className={`text-4xl font-black tracking-tighter ${theme === 'dark' ? 'text-white' : 'text-white'} drop-shadow-2xl`}>
                {format(currentTime, 'HH:mm')}
                <span className="text-xl ml-2 opacity-50">{format(currentTime, 'a')}</span>
              </div>
            </div>

            {/* Video Overlays removed */}
          </section>

          {/* Bottom Tiles Area (Fills space) */}
          <div className="flex-1 flex gap-2 min-h-0 overflow-hidden">
            {/* Birthday Celebration (3:4 Portrait Ratio) */}
            <section className={`flex-[3] aspect-[3/4] ${theme === 'dark' ? 'bg-[#0c0c0c] border-white/5' : 'bg-white border-slate-200'} border rounded-3xl p-6 flex flex-col justify-center shadow-xl group relative overflow-hidden shrink-0`}>
              {data?.settings?.birthday_image_url ? (
                <div className="absolute inset-0 z-0">
                  <img src={data.settings.birthday_image_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
              ) : (
                <>
                  <div className={`absolute inset-0 ${theme === 'dark' ? 'bg-gradient-to-br from-pink-600/5 to-transparent' : 'bg-gradient-to-br from-pink-50 to-transparent'} pointer-events-none`} />
                  <div className="flex items-center gap-4 mb-4 relative z-10">
                    <div className="w-12 h-12 bg-pink-600 rounded-2xl flex items-center justify-center shadow-lg shadow-pink-600/20 group-hover:rotate-12 transition-transform">
                      <Icons.Gift className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h4 className={`text-base font-black tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Birthday</h4>
                      <p className="text-[10px] font-black uppercase tracking-widest text-pink-500">Celebration</p>
                    </div>
                  </div>
                  <div className="relative z-10">
                    {data?.birthdays?.length > 0 ? (
                      <>
                        <h3 className={`text-xl font-black tracking-tight mb-2 ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>{data.birthdays[0].name}</h3>
                        <p className={`text-xs ${theme === 'dark' ? 'text-white/40' : 'text-slate-400'} leading-relaxed`}>Wishing you a wonderful day!</p>
                      </>
                    ) : (
                      <p className={`text-xs ${theme === 'dark' ? 'text-white/40' : 'text-slate-400'} leading-relaxed italic`}>No birthdays today</p>
                    )}
                  </div>
                </>
              )}
            </section>

            {/* Events (4:3 Landscape Ratio) */}
            <section className={`flex-[4] aspect-[4/3] ${theme === 'dark' ? 'bg-[#0c0c0c] border-white/5' : 'bg-white border-slate-200'} border rounded-3xl p-6 flex flex-col shadow-xl group hover:border-purple-500/30 transition-all relative overflow-hidden shrink-0`}>
              {data?.events?.length > 0 && data.events[currentEventIndex % data.events.length].image_url ? (
                <div className="absolute inset-0 z-0">
                  <img src={data.events[currentEventIndex % data.events.length].image_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
              ) : (
                <>
                  <div className={`absolute inset-0 ${theme === 'dark' ? 'bg-gradient-to-br from-purple-600/10 to-transparent' : 'bg-gradient-to-br from-purple-50 to-transparent'} opacity-50`} />
                  
                  <div className="relative z-10 h-full flex flex-col">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="px-2 py-0.5 bg-purple-600/20 text-purple-400 rounded-md text-[9px] font-black uppercase tracking-widest border border-purple-500/20">
                        {data?.events?.length > 0 && 
                         format(new Date(data.events[currentEventIndex % data.events.length].event_date), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') 
                         ? 'Today Special' : 'Upcoming Event'}
                      </span>
                      {data?.events?.length > 0 && data.events[currentEventIndex % data.events.length].event_date && (
                        <span className={`text-[9px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-white/40' : 'text-slate-400'}`}>
                          {format(new Date(data.events[currentEventIndex % data.events.length].event_date), 'MMM dd')}
                        </span>
                      )}
                    </div>
                    <div className="mt-auto">
                      <h3 className={`text-2xl font-black tracking-tight mb-2 group-hover:text-purple-400 transition-colors ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                        {data?.events?.length > 0 ? data.events[currentEventIndex % data.events.length].title : 'No Upcoming Events'}
                      </h3>
                      <p className={`text-xs ${theme === 'dark' ? 'text-white/60' : 'text-slate-500'} leading-tight mb-4 line-clamp-2`}>
                        {data?.events?.length > 0 ? data.events[currentEventIndex % data.events.length].location : 'Stay tuned for our next scheduled activities.'}
                      </p>
                      <button className="text-[10px] font-black uppercase tracking-[0.3em] text-purple-500 flex items-center gap-2 group/btn">
                        View Calendar
                        <Icons.ArrowRight className="w-3 h-3 group-hover/btn:translate-x-2 transition-transform" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </main>

      {/* Footer Alert Bar (Notices & Guidelines) */}
      <footer className={`h-12 ${theme === 'dark' ? 'bg-[#080808] border-white/5' : 'bg-slate-900 border-slate-800'} border-t flex items-center overflow-hidden relative shrink-0`}>
        <div className="bg-purple-600 h-full px-8 flex items-center gap-3 z-10 shadow-2xl">
          <Icons.Info className="w-4 h-4 text-white animate-pulse" />
          <span className="text-[15pt] font-black uppercase tracking-[0.3em] text-yellow-400">Notice</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="whitespace-nowrap animate-marquee flex items-center h-full">
            {data?.notices?.length > 0 ? (
              data.notices.map((notice: any, idx: number) => (
                <React.Fragment key={notice.id}>
                  <span className="text-[15pt] font-black uppercase tracking-[0.2em] px-12 text-yellow-400">
                    {notice.content}
                  </span>
                  <div className="w-2 h-2 rounded-full bg-white/10" />
                </React.Fragment>
              ))
            ) : (
              <span className="text-[17pt] font-black uppercase tracking-[0.2em] px-12 text-yellow-400">
                Welcome to Cinematic Pulse. Please follow all safety guidelines and protocols.
              </span>
            )}
            {/* Duplicate for infinite scroll */}
            {data?.notices?.length > 0 ? (
              data.notices.map((notice: any, idx: number) => (
                <React.Fragment key={`dup-${notice.id}`}>
                  <span className="text-[15pt] font-black uppercase tracking-[0.2em] px-12 text-yellow-400">
                    {notice.content}
                  </span>
                  <div className="w-2 h-2 rounded-full bg-white/10" />
                </React.Fragment>
              ))
            ) : (
              <span className="text-[15pt] font-black uppercase tracking-[0.2em] px-12 text-yellow-400">
                Welcome to Cinematic Pulse. Please follow all safety guidelines and protocols.
              </span>
            )}
          </div>
        </div>
      </footer>

      {/* Emergency Alert Overlay (Existing Logic) */}
      <AnimatePresence>
        {activeAlert && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-red-600/90 backdrop-blur-2xl p-10"
          >
            <div className="text-center max-w-4xl text-white">
              <Icons.AlertTriangle className="w-48 h-48 mx-auto mb-12 animate-pulse" />
              <h1 className="text-8xl font-black uppercase tracking-tighter mb-8">Emergency Protocol</h1>
              <p className="text-5xl font-bold mb-12 leading-tight">{activeAlert.message}</p>
              {activeAlert.instructions && (
                <div className="bg-white/10 border border-white/20 p-10 rounded-[3rem] text-3xl font-medium backdrop-blur-md">
                  {activeAlert.instructions}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.1);
        }
      `}</style>
    </div>
  );
};

export default PublicDashboard;
