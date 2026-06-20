import React, { useState, useEffect, useRef } from 'react';
import { 
  db, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit 
} from '../firebase';
import { UserProfile, DirectMessage, Call } from '../types';

interface MessengerProps {
  user: UserProfile | null;
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
  isOnline: boolean;
  targetUserOnOpen?: string | null; // direct messaging username target if opened from profile
}

// Retro digital sound synthesizer using Web Audio API for calls & dialing
class CallAudioSynthesizer {
  private ctx: AudioContext | null = null;
  private intervalRef: any = null;

  playDialing() {
    this.stop();
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playTone = () => {
        if (!this.ctx) return;
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.frequency.value = 350;
        osc2.frequency.value = 440;

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.12, this.ctx.currentTime + 1.1);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.25);

        osc1.start();
        osc2.start();
        osc1.stop(this.ctx.currentTime + 1.4);
        osc2.stop(this.ctx.currentTime + 1.4);
      };

      playTone();
      this.intervalRef = setInterval(playTone, 2400);
    } catch (e) {
      console.log('Audio init failed:', e);
    }
  }

  playInboundRingtone() {
    this.stop();
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playTone = () => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(480, this.ctx.currentTime);
        osc.frequency.setValueAtTime(540, this.ctx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.3, this.ctx.currentTime + 0.05);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.55);

        gain.gain.linearRampToValueAtTime(0.3, this.ctx.currentTime + 0.7);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.25);

        osc.start();
        osc.stop(this.ctx.currentTime + 1.5);
      };

      playTone();
      this.intervalRef = setInterval(playTone, 2000);
    } catch (e) {
      console.log('Audio ringtone failed:', e);
    }
  }

  stop() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
    if (this.ctx) {
      if (this.ctx.state !== 'closed') {
        this.ctx.close();
      }
      this.ctx = null;
    }
  }
}

const callAudio = new CallAudioSynthesizer();

export default function Messenger({
  user,
  isOpen,
  onClose,
  showToast,
  isOnline,
  targetUserOnOpen
}: MessengerProps) {
  // Navigation tabs
  const [activeSubTab, setActiveSubTab] = useState<'chats' | 'calls' | 'settings'>('chats');
  
  // Contacts
  const [searchQuery, setSearchQuery] = useState('');
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [selectedContact, setSelectedContact] = useState<UserProfile | null>(null);

  // Chat conversation
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [typedMessage, setTypedMessage] = useState('');
  
  // Voice Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Call history
  const [callHistory, setCallHistory] = useState<Call[]>([]);

  // WebRTC & Call Signaling states
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  const [callSessionActive, setCallSessionActive] = useState(false);
  const [callMuted, setCallMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [callTimer, setCallTimer] = useState(0);
  const callTimerIntervalRef = useRef<any>(null);

  // WebRTC actual peer objects
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  
  // Native/Simulated audio loop objects
  const customRingtonePlayerRef = useRef<HTMLAudioElement | null>(null);
  const callTimeoutTimerRef = useRef<any>(null);

  // Video element references
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  // Ringtone setting
  const [userRingtone, setUserRingtone] = useState<string>('default'); // 'default' or custom Base64 URL

  // User list monitoring
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const usersList: UserProfile[] = [];
      snap.forEach(d => {
        const u = d.data() as UserProfile;
        if (u.uid !== user.uid) {
          usersList.push(u);
        }
      });
      setAllUsers(usersList);
    });

    // Clean up call synth on unmount
    return () => {
      unsub();
      callAudio.stop();
      if (customRingtonePlayerRef.current) {
        customRingtonePlayerRef.current.pause();
      }
    };
  }, [user]);

  // Load custom setting on init
  useEffect(() => {
    if (!user) return;
    if (user.avatar) { // Use user profile as settings container for simplicity and cache sync
      // @ts-ignore
      setUserRingtone(user.ringtoneUrl || 'default');
    }
  }, [user]);

  // Handle targeting a user on opening from profile
  useEffect(() => {
    if (isOpen && targetUserOnOpen && allUsers.length > 0) {
      const found = allUsers.find(u => u.username === targetUserOnOpen);
      if (found) {
        setSelectedContact(found);
        setActiveSubTab('chats');
      }
    }
  }, [isOpen, targetUserOnOpen, allUsers]);

  // Real-time call signaling listener (Incoming Call watcher)
  useEffect(() => {
    if (!user) return;

    // Monitor calls collection where receiver is this user and call is active
    const callsQuery = query(
      collection(db, 'calls'),
      where('receiverId', '==', user.uid),
      where('status', '==', 'calling')
    );

    const unsubCalls = onSnapshot(callsQuery, (snapshot) => {
      if (!snapshot.empty) {
        // Grab the first active call
        const callDoc = snapshot.docs[0];
        const callData = { id: callDoc.id, ...callDoc.data() } as Call;
        
        // Prevent double prompting if already in a call dialog
        if (!activeCall) {
          setActiveCall(callData);
          setIsIncomingCall(true);
          
          // Trigger ringtone (custom uploaded or retro synthesized)
          // @ts-ignore
          const customTone = callData.ringtone_url || 'default';
          if (customTone && customTone !== 'default') {
            try {
              if (customRingtonePlayerRef.current) {
                customRingtonePlayerRef.current.pause();
              }
              const audioObj = new Audio(customTone);
              audioObj.loop = true;
              audioObj.play().catch(e => {
                console.log('Custom ringtone play failed, falling back to synth:', e);
                callAudio.playInboundRingtone();
              });
              customRingtonePlayerRef.current = audioObj;
            } catch (err) {
              callAudio.playInboundRingtone();
            }
          } else {
            // Retro ringing
            callAudio.playInboundRingtone();
          }

          // Trigger native notification
          if (Notification.permission === 'granted') {
            new Notification('📞 Chamada no JPvano', {
              body: `Ligação de @${callData.callerName}. Clique para atender.`,
              icon: '👑'
            });
          }

          // Timeout auto missed handle in 30 seconds
          if (callTimeoutTimerRef.current) clearTimeout(callTimeoutTimerRef.current);
          callTimeoutTimerRef.current = setTimeout(async () => {
            const currentCallRef = doc(db, 'calls', callDoc.id);
            const checkSnap = await getDoc(currentCallRef);
            if (checkSnap.exists() && checkSnap.data()?.status === 'calling') {
              await updateDoc(currentCallRef, {
                status: 'missed',
                endedAt: Date.now()
              });
              showToast(`📞 Chamada perdida de @${callData.callerName}`);
              closeActiveCallUI();
            }
          }, 30000);
        }
      }
    });

    return () => {
      unsubCalls();
      if (callTimeoutTimerRef.current) clearTimeout(callTimeoutTimerRef.current);
    };
  }, [user, activeCall]);

  // Listen to Outgoing / Active Call status changes real-time
  useEffect(() => {
    if (!user || !activeCall) return;

    const unsubCallSession = onSnapshot(doc(db, 'calls', activeCall.id), async (snapshot) => {
      if (snapshot.exists()) {
        const updatedCall = { id: snapshot.id, ...snapshot.data() } as Call;
        setActiveCall(updatedCall);

        // If call accepted by the receiver
        if (updatedCall.status === 'accepted' && !callSessionActive) {
          callAudio.stop();
          if (callTimeoutTimerRef.current) clearTimeout(callTimeoutTimerRef.current);
          setCallSessionActive(true);
          startCallTimer();
          showToast(`📞 Chamada com @${updatedCall.receiverName} iniciada!`);
          
          // Initiate WebRTC peer handshake on caller side
          if (updatedCall.callerId === user.uid) {
            setupWebRTCOnCaller(updatedCall);
          }
        }

        // If call rejected or ended
        if (['rejected', 'ended', 'missed'].includes(updatedCall.status)) {
          showToast(`🔴 Chamada com @${updatedCall.callerId === user.uid ? updatedCall.receiverName : updatedCall.callerName} terminada.`);
          closeActiveCallUI();
        }

        // Listen for remote answer SDP on caller side
        if (updatedCall.callerId === user.uid && updatedCall.answer && peerConnectionRef.current) {
          const remoteDesc = new RTCSessionDescription(JSON.parse(updatedCall.answer));
          if (peerConnectionRef.current.signalingState !== 'stable') {
            await peerConnectionRef.current.setRemoteDescription(remoteDesc);
          }
        }

        // Listen for candidates updates
        if (updatedCall.receiverId === user.uid && updatedCall.callerCandidates && peerConnectionRef.current) {
          try {
            const candidates = JSON.parse(updatedCall.callerCandidates);
            candidates.forEach((cand: any) => {
              peerConnectionRef.current?.addIceCandidate(new RTCIceCandidate(cand))
                .catch(e => console.log('Candidate add err', e));
            });
          } catch(e) {}
        }

        if (updatedCall.callerId === user.uid && updatedCall.receiverCandidates && peerConnectionRef.current) {
          try {
            const candidates = JSON.parse(updatedCall.receiverCandidates);
            candidates.forEach((cand: any) => {
              peerConnectionRef.current?.addIceCandidate(new RTCIceCandidate(cand))
                .catch(e => console.log('Candidate add err', e));
            });
          } catch(e) {}
        }
      }
    });

    return () => unsubCallSession();
  }, [user, activeCall, callSessionActive]);

  // Load chat messages in real-time when contact selected
  useEffect(() => {
    if (!user || !selectedContact) return;

    // Query messages sent between user & selected contact
    const messagesQuery = query(
      collection(db, 'direct_messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubMessages = onSnapshot(messagesQuery, (snapshot) => {
      const list: DirectMessage[] = [];
      snapshot.forEach(d => {
        const msg = { id: d.id, ...d.data() } as DirectMessage;
        // Client side filter to match direct targets (guarantees order and accuracy)
        const isSelfSender = msg.senderId === user.uid && msg.receiverId === selectedContact.uid;
        const isTargetSender = msg.senderId === selectedContact.uid && msg.receiverId === user.uid;
        if (isSelfSender || isTargetSender) {
          list.push(msg);
          // Auto mark as read
          if (isTargetSender && !msg.read) {
            updateDoc(doc(db, 'direct_messages', msg.id), { read: true });
          }
        }
      });
      setMessages(list);
    });

    return () => unsubMessages();
  }, [user, selectedContact]);

  // Monitor call logs / History in real-time for tab
  useEffect(() => {
    if (!user) return;
    const qHistory = query(
      collection(db, 'calls'),
      orderBy('createdAt', 'desc')
    );

    const unsubHistory = onSnapshot(qHistory, (snapshot) => {
      const logs: Call[] = [];
      snapshot.forEach(d => {
        const c = { id: d.id, ...d.data() } as Call;
        if (c.callerId === user.uid || c.receiverId === user.uid) {
          logs.push(c);
        }
      });
      setCallHistory(logs);
    });

    return () => unsubHistory();
  }, [user]);

  // WebRTC Handshake routines (Simulated WebCam capture + physical setup)
  async function setupWebRTCOnCaller(callObj: Call) {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = pc;

      // Capture camera/audio stream if allowed, or fallback safely
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: true, 
          video: callObj.type === 'video' 
        });
      } catch (err) {
        showToast("⚠️ Não foi possível carregar webcam/microfone. Iniciando fluxo com áudio simulado.");
        // Create generated silent audio stream fallback to prevent crash in browser sandbox
        // @ts-ignore
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const dst = audioCtx.createMediaStreamDestination();
        osc.connect(dst);
        osc.start();
        stream = dst.stream;
      }

      localStreamRef.current = stream;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Trigger local video preview
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      pc.ontrack = (evt) => {
        if (evt.streams && evt.streams[0]) {
          remoteStreamRef.current = evt.streams[0];
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = evt.streams[0];
          }
        }
      };

      // Handle ICE candidates
      const candidatesList: any[] = [];
      pc.onicecandidate = async (e) => {
        if (e.candidate) {
          candidatesList.push(e.candidate.toJSON());
          await updateDoc(doc(db, 'calls', callObj.id), {
            callerCandidates: JSON.stringify(candidatesList)
          });
        }
      };

      // Create Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await updateDoc(doc(db, 'calls', callObj.id), {
        offer: JSON.stringify(offer)
      });

    } catch (e) {
      console.error('Caller WebRTC setup error:', e);
    }
  }

  async function setupWebRTCOnReceiver(callObj: Call) {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = pc;

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: true, 
          video: callObj.type === 'video' 
        });
      } catch (err) {
        // Fallback
        // @ts-ignore
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const dst = audioCtx.createMediaStreamDestination();
        osc.connect(dst);
        osc.start();
        stream = dst.stream;
      }

      localStreamRef.current = stream;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      pc.ontrack = (evt) => {
        if (evt.streams && evt.streams[0]) {
          remoteStreamRef.current = evt.streams[0];
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = evt.streams[0];
          }
        }
      };

      // Gather ICE candidates
      const candidatesList: any[] = [];
      pc.onicecandidate = async (e) => {
        if (e.candidate) {
          candidatesList.push(e.candidate.toJSON());
          await updateDoc(doc(db, 'calls', callObj.id), {
            receiverCandidates: JSON.stringify(candidatesList)
          });
        }
      };

      // Apply Offer
      if (callObj.offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(callObj.offer)));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await updateDoc(doc(db, 'calls', callObj.id), {
          answer: JSON.stringify(answer),
          status: 'accepted',
          startedAt: Date.now()
        });
      }

    } catch (e) {
      console.error('Receiver WebRTC setup error:', e);
    }
  }

  // End active calls and release media devices
  function closeActiveCallUI() {
    callAudio.stop();
    if (callTimeoutTimerRef.current) clearTimeout(callTimeoutTimerRef.current);
    if (customRingtonePlayerRef.current) {
      customRingtonePlayerRef.current.pause();
      customRingtonePlayerRef.current = null;
    }

    // Stop duration counter
    if (callTimerIntervalRef.current) {
      clearInterval(callTimerIntervalRef.current);
      callTimerIntervalRef.current = null;
    }

    // Release camera/audio hardware tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    setActiveCall(null);
    setIsIncomingCall(false);
    setCallSessionActive(false);
    setCallTimer(0);
    setCameraEnabled(true);
    setCallMuted(false);
  }

  // Timer counting for calls
  function startCallTimer() {
    if (callTimerIntervalRef.current) clearInterval(callTimerIntervalRef.current);
    callTimerIntervalRef.current = setInterval(() => {
      setCallTimer(prev => prev + 1);
    }, 1000);
  }

  // Initiate call
  async function handleStartCall(type: 'voice' | 'video') {
    if (!user || !selectedContact) return;
    if (!isOnline) {
      showToast("❌ Você precisa estar online para iniciar chamadas.");
      return;
    }

    try {
      // Prompt camera/audio permission early to reduce connection blockages
      await Notification.requestPermission();

      // play synthesized dial tone on caller side
      callAudio.playDialing();

      const callRef = await addDoc(collection(db, 'calls'), {
        callerId: user.uid,
        callerName: user.username,
        callerAvatar: user.avatar || '',
        receiverId: selectedContact.uid,
        receiverName: selectedContact.username,
        receiverAvatar: selectedContact.avatar || '',
        status: 'calling',
        createdAt: Date.now(),
        type,
        // Include ringtone prefereneces
        // @ts-ignore
        ringtone_url: selectedContact.ringtoneUrl || 'default'
      });

      const callData = {
        id: callRef.id,
        callerId: user.uid,
        callerName: user.username,
        callerAvatar: user.avatar || '',
        receiverId: selectedContact.uid,
        receiverName: selectedContact.username,
        receiverAvatar: selectedContact.avatar || '',
        status: 'calling',
        createdAt: Date.now(),
        type
      } as Call;

      setActiveCall(callData);
      setIsIncomingCall(false);

      // Timeout call after 30s as missed if receiver doesn't answer
      if (callTimeoutTimerRef.current) clearTimeout(callTimeoutTimerRef.current);
      callTimeoutTimerRef.current = setTimeout(async () => {
        await updateDoc(doc(db, 'calls', callRef.id), {
          status: 'missed',
          endedAt: Date.now()
        });
        showToast("📞 Destinatário não atendeu.");
        closeActiveCallUI();
      }, 30000);

    } catch (err) {
      showToast("❌ Erro ao iniciar a ligação.");
      console.error(err);
    }
  }

  // Accept incoming call
  async function handleAcceptCall() {
    if (!activeCall) return;
    callAudio.stop();
    if (customRingtonePlayerRef.current) {
      customRingtonePlayerRef.current.pause();
    }
    if (callTimeoutTimerRef.current) clearTimeout(callTimeoutTimerRef.current);

    setCallSessionActive(true);
    startCallTimer();
    
    // Fire WebRTC receiver
    await setupWebRTCOnReceiver(activeCall);
  }

  // Reject / Decline call
  async function handleRejectCall() {
    if (!activeCall) return;
    try {
      await updateDoc(doc(db, 'calls', activeCall.id), {
        status: 'rejected',
        endedAt: Date.now()
      });
      closeActiveCallUI();
    } catch (e) {
      closeActiveCallUI();
    }
  }

  // End/Hang up call
  async function handleEndCall() {
    if (!activeCall) return;
    try {
      await updateDoc(doc(db, 'calls', activeCall.id), {
        status: 'ended',
        endedAt: Date.now()
      });
      closeActiveCallUI();
    } catch (e) {
      closeActiveCallUI();
    }
  }

  // Toggle audio track (mute)
  function handleToggleMute() {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setCallMuted(!audioTrack.enabled);
      }
    } else {
      setCallMuted(!callMuted);
    }
  }

  // Toggle video track
  function handleToggleCamera() {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setCameraEnabled(videoTrack.enabled);
      }
    } else {
      setCameraEnabled(!cameraEnabled);
    }
  }

  // Send typed message
  async function handleSendMessage() {
    if (!user || !selectedContact || !typedMessage.trim()) return;

    const msgText = typedMessage.trim();
    setTypedMessage('');

    try {
      await addDoc(collection(db, 'direct_messages'), {
        senderId: user.uid,
        senderName: user.username,
        receiverId: selectedContact.uid,
        receiverName: selectedContact.username,
        text: msgText,
        createdAt: Date.now(),
        read: false
      });
    } catch (err) {
      showToast("❌ Falha ao enviar mensagem.");
    }
  }

  // Start Voice Note Recording using MediaRecorder API
  async function handleStartRecording() {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      showToast("❌ Gravação de voz não suportada neste navegador.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Release hardware mic track
        stream.getTracks().forEach(track => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Convert to Base64 to store in Firestore securely
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          if (base64Audio && user && selectedContact) {
            await addDoc(collection(db, 'direct_messages'), {
              senderId: user.uid,
              senderName: user.username,
              receiverId: selectedContact.uid,
              receiverName: selectedContact.username,
              audioUrl: base64Audio,
              duration: recordingSeconds || 3, // fallback to counter seconds
              createdAt: Date.now(),
              read: false
            });
            showToast("🎙️ Mensagem de áudio enviada!");
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      setIsRecording(true);
      setRecordingSeconds(0);
      mediaRecorder.start();

      // Start duration counter timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);

    } catch (err) {
      showToast("⚠️ Permissão de microfone negada. Verifique as configurações de captação de áudio.");
      console.error(err);
    }
  }

  // Stop Recording
  function handleStopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  // Handle personal custom ringtone audio file upload
  function handleUploadRingtone(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      showToast("⚠️ Escolha um arquivo de áudio válido (Ex: .mp3, .wav).");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Url = event.target?.result as string;
      if (base64Url && user) {
        try {
          // Update user settings directamente no documento users para cache
          await updateDoc(doc(db, 'users', user.uid), {
            ringtoneUrl: base64Url
          });
          setUserRingtone(base64Url);
          showToast("🎵 Toque personalizado carregado com sucesso!");
        } catch (err) {
          showToast("❌ Falha ao salvar toque personalizado.");
        }
      }
    };
    reader.readAsDataURL(file);
  }

  // Render format duration (e.g. 01:23)
  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Filter contacts by search query
  const filteredUsers = allUsers.filter(u => {
    const queryStr = searchQuery.toLowerCase();
    return u.username.toLowerCase().includes(queryStr) || 
           `${u.firstName} ${u.lastName}`.toLowerCase().includes(queryStr);
  });

  return (
    <>
      {/* WEB PUSH / REAL-TIME RINGING OVERLAY DIALOGS (Highest Z-index) */}
      {activeCall && (
        <div id="ring-overlay-wrapper" className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-[9999] p-6 text-white text-center animate-fade-in font-sans">
          
          {/* USER AVATAR */}
          <div className="relative mb-8">
            <div className={`w-28 h-28 rounded-full border-4 border-emerald-500 bg-zinc-800 flex items-center justify-center overflow-hidden shadow-2xl relative ${isIncomingCall ? 'animate-pulse' : 'animate-bounce'}`}>
              {isIncomingCall ? (
                activeCall.callerAvatar ? (
                  <img src={activeCall.callerAvatar} alt={activeCall.callerName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-extrabold">{activeCall.callerName.slice(0,2).toUpperCase()}</span>
                )
              ) : (
                activeCall.receiverAvatar ? (
                  <img src={activeCall.receiverAvatar} alt={activeCall.receiverName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-extrabold">{activeCall.receiverName.slice(0,2).toUpperCase()}</span>
                )
              )}
            </div>
            
            {/* Pulsating glowing rings effect (Simulates Whatsapp style radar call) */}
            <div className="absolute inset-0 w-28 h-28 rounded-full bg-emerald-500/25 animate-ping -z-10 mx-auto" />
          </div>

          {/* CALL METADATA */}
          <h2 className="text-2xl font-black mb-1">
            {isIncomingCall ? `@${activeCall.callerName}` : `@${activeCall.receiverName}`}
          </h2>
          <span className="text-xs text-zinc-400 font-extrabold uppercase tracking-widest block mb-10">
            {activeCall.type === 'video' ? '📹 Chamada de Vídeo' : '📞 Chamada de Voz'}
          </span>

          {/* REAL STATE FLAGS */}
          <div className="text-zinc-300 font-medium mb-12 text-sm">
            {!callSessionActive ? (
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-emerald-400 flex items-center gap-1.5 font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                  {isIncomingCall ? 'Chamada recebida...' : 'Discando...'}
                </span>
                <span className="text-xs text-zinc-500">Aguardando resposta no JPvano</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <span className="text-rose-400 font-bold">Chamada em andamento</span>
                <span className="text-2xl font-mono text-white mt-1 select-none font-black">
                  {formatTime(callTimer)}
                </span>
              </div>
            )}
          </div>

          {/* WEBRTC STREAM PREVIEW PANELS */}
          {callSessionActive && (
            <div className="w-full max-w-xl grid grid-cols-2 gap-4 mb-10 h-[190px] text-zinc-500 text-xs">
              
              {/* Local video feed */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden relative flex flex-col items-center justify-center">
                {activeCall.type === 'video' && cameraEnabled ? (
                  <video 
                    ref={localVideoRef} 
                    autoPlay 
                    muted 
                    playsInline 
                    className="w-full h-full object-cover scale-x-[-1]" 
                  />
                ) : (
                  <div className="flex flex-col items-center">
                    <span className="text-2xl mb-1">👤</span>
                    <span>Sua câmera desligada</span>
                  </div>
                )}
                <span className="absolute bottom-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[10px] font-bold text-white">Você {callMuted && '🎤 Mutado'}</span>
              </div>

              {/* Remote video feed or equalizer */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden relative flex flex-col items-center justify-center">
                {activeCall.type === 'video' ? (
                  <video 
                    ref={remoteVideoRef} 
                    autoPlay 
                    playsInline 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center w-full h-full p-4">
                    {/* Pulsating equalizer bars */}
                    <div className="flex items-end justify-center gap-1 mb-2 h-10 select-none">
                      <div className="w-1.5 bg-[#E1306C] rounded-full animate-pulse h-6" style={{ animationDelay: '0.1s' }} />
                      <div className="w-1.5 bg-emerald-500 rounded-full animate-bounce h-9" style={{ animationDelay: '0.2s' }} />
                      <div className="w-1.5 bg-[#E1306C] rounded-full animate-pulse h-4" style={{ animationDelay: '0.3s' }} />
                      <div className="w-1.5 bg-purple-500 rounded-full animate-bounce h-8" style={{ animationDelay: '0.4s' }} />
                      <div className="w-1.5 bg-blue-500 rounded-full animate-pulse h-5" style={{ animationDelay: '0.5s' }} />
                    </div>
                    <span>Conexão Segura P2P JPvano</span>
                  </div>
                )}
                <span className="absolute bottom-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[10px] font-bold text-white">
                  @{isIncomingCall ? activeCall.callerName : activeCall.receiverName}
                </span>
              </div>

            </div>
          )}

          {/* ACTION BUTTONS (Mutes, accept, refuse, hangup) */}
          <div className="flex items-center justify-center gap-6">
            {isIncomingCall && !callSessionActive ? (
              <>
                {/* Accept Call */}
                <button 
                  onClick={handleAcceptCall}
                  className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white text-3xl shadow-xl transition-all cursor-pointer transform hover:scale-110 active:scale-95"
                  title="Atender Chamada"
                >
                  🟢
                </button>
                {/* Reject Call */}
                <button 
                  onClick={handleRejectCall}
                  className="w-16 h-16 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center text-white text-3xl shadow-xl transition-all cursor-pointer transform hover:scale-110 active:scale-95"
                  title="Recusar"
                >
                  🔴
                </button>
              </>
            ) : (
              <>
                {/* Active in-call widgets toggle */}
                {callSessionActive && (
                  <>
                    {/* Microphone Toggle */}
                    <button 
                      onClick={handleToggleMute}
                      className={`w-12 h-12 rounded-full border border-zinc-700 flex items-center justify-center text-lg shadow transition-all cursor-pointer ${callMuted ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-zinc-850 text-white hover:bg-zinc-800'}`}
                      title={callMuted ? 'Desmutar' : 'Mutar'}
                    >
                      {callMuted ? '🔇' : '🎙️'}
                    </button>
                    {/* Video toggle */}
                    {activeCall.type === 'video' && (
                      <button 
                        onClick={handleToggleCamera}
                        className={`w-12 h-12 rounded-full border border-zinc-700 flex items-center justify-center text-lg shadow transition-all cursor-pointer ${!cameraEnabled ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-zinc-850 text-white hover:bg-zinc-800'}`}
                        title={cameraEnabled ? 'Desligar Câmera' : 'Ligar Câmera'}
                      >
                        {cameraEnabled ? '📹' : '❌📹'}
                      </button>
                    )}
                  </>
                )}

                {/* Hang up Outgoing/Active Call */}
                <button 
                  onClick={handleEndCall}
                  className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white text-3xl shadow-2xl transition-all cursor-pointer transform hover:scale-110 active:scale-95"
                  title="Encerrar Ligação"
                >
                  🔴
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* MESSENGER MAIN SLIDE-OUT PANEL */}
      {isOpen && (
        <div 
          id="messenger-drawer-overlay" 
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[5000] flex justify-end animate-fade-in font-sans"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="w-full sm:w-[450px] bg-white h-full shadow-2xl flex flex-col relative select-none animate-slide-left">
            
            {/* CONTAINER HEADER */}
            <div className="border-b border-gray-100 p-4 pb-3 flex items-center justify-between bg-white">
              <div className="flex items-center gap-1.5">
                <span className="text-xl">💬</span>
                <span className="font-['Space_Grotesk'] font-black text-gray-800 text-lg tracking-tight">JPvano Direct</span>
                <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 font-extrabold uppercase px-1.5 rounded">Real-Time</span>
              </div>
              <button 
                onClick={onClose}
                className="w-8 h-8 rounded-full border border-gray-100 hover:bg-gray-50 flex items-center justify-center font-bold text-gray-400 text-sm cursor-pointer transition-colors"
                id="close-messenger-btn"
              >
                ✕
              </button>
            </div>

            {/* TAB SELECTOR HEADER */}
            <div className="flex border-b border-gray-100 justify-evenly bg-gray-50 text-xs font-bold text-gray-500">
              <button 
                onClick={() => { setActiveSubTab('chats'); setSelectedContact(null); }}
                className={`flex-1 py-3 text-center cursor-pointer transition-colors ${activeSubTab === 'chats' ? 'border-b-2 border-black text-black bg-white' : 'hover:bg-gray-100'}`}
              >
                💬 Conversas
              </button>
              <button 
                onClick={() => setActiveSubTab('calls')}
                className={`flex-1 py-3 text-center cursor-pointer transition-colors ${activeSubTab === 'calls' ? 'border-b-2 border-black text-black bg-white' : 'hover:bg-gray-100'}`}
              >
                📞 Chamadas
              </button>
              <button 
                onClick={() => setActiveSubTab('settings')}
                className={`flex-1 py-3 text-center cursor-pointer transition-colors ${activeSubTab === 'settings' ? 'border-b-2 border-black text-black bg-white' : 'hover:bg-gray-100'}`}
              >
                ⚙️ Ajustes Toque
              </button>
            </div>

            {/* LOWER CONTENT AREA */}
            <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
              
              {/* TAB 1: CHATS VIEW */}
              {activeSubTab === 'chats' && !selectedContact && (
                <div id="chats-users-list" className="flex flex-col p-4 gap-4 flex-1">
                  
                  {/* CONTACTS SEARCH BAR */}
                  <div className="flex items-center gap-2 bg-gray-100 border border-gray-150 rounded-xl px-3 py-2 w-full">
                    <span className="text-gray-400 text-sm">🔍</span>
                    <input 
                      type="text" 
                      placeholder="Pesquisar usuários por nome..." 
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="border-none bg-transparent text-xs outline-none w-full text-gray-700"
                    />
                  </div>

                  <strong className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-1">Membros Disponíveis ({filteredUsers.length})</strong>
                  
                  {/* CONTACT LIST CONTAINER */}
                  <div className="flex flex-col gap-2 overflow-y-auto max-h-[480px]">
                    {filteredUsers.map((u) => (
                      <div 
                        key={u.uid} 
                        onClick={() => setSelectedContact(u)}
                        className="p-3 border border-gray-100 rounded-xl flex items-center gap-3 bg-[#FCFCFC] hover:bg-gray-50/70 hover:border-black cursor-pointer transition-all"
                      >
                        {/* Profile avatar with online spot */}
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-zinc-800 border-2 border-white shadow-xs flex items-center justify-center overflow-hidden">
                            {u.avatar ? (
                              <img src={u.avatar} alt={u.username} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-bold text-white">{u.firstName.slice(0,2).toUpperCase()}</span>
                            )}
                          </div>
                          {/* Online badge */}
                          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${isOnline ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <strong className="text-xs text-gray-800 block font-black">@{u.username}</strong>
                          <span className="text-[10px] text-gray-400 font-semibold truncate block">{u.firstName} {u.lastName}</span>
                        </div>
                        
                        <span className="text-xs text-purple-600 font-bold px-2 py-1 bg-purple-50 rounded border border-purple-100">Conversar</span>
                      </div>
                    ))}

                    {filteredUsers.length === 0 && (
                      <div className="text-center py-10 text-xs text-gray-400 font-medium">Nenhum usuário encontrado.</div>
                    )}
                  </div>
                </div>
              )}

              {/* ACTIVE CONVERSATION SHEET */}
              {activeSubTab === 'chats' && selectedContact && (
                <div id="active-chat-wrapper" className="flex-1 flex flex-col min-h-0 bg-gray-50">
                  
                  {/* CONVERSATION TOP BAR */}
                  <div className="bg-white border-b border-gray-150 p-3.5 flex items-center justify-between gap-2.5">
                    <button 
                      onClick={() => setSelectedContact(null)}
                      className="text-xs text-gray-600 font-bold hover:text-black hover:bg-gray-100 px-2.5 py-1 rounded-lg border border-gray-200"
                    >
                      ⬅ Voltar
                    </button>

                    {/* Member profile info */}
                    <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
                      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-white overflow-hidden text-xs font-bold border border-gray-200">
                        {selectedContact.avatar ? (
                          <img src={selectedContact.avatar} alt={selectedContact.username} className="w-full h-full object-cover" />
                        ) : (
                          <span>{selectedContact.firstName.slice(0,1).toUpperCase()}{selectedContact.lastName.slice(0,1).toUpperCase()}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-800 font-black truncate block">@{selectedContact.username}</span>
                    </div>

                    {/* Call and Video triggers */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button 
                        onClick={() => handleStartCall('voice')}
                        title="Chamada de Voz" 
                        className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 flex items-center justify-center font-bold text-sm cursor-pointer"
                      >
                        📞
                      </button>
                      <button 
                        onClick={() => handleStartCall('video')}
                        title="Video Chamada" 
                        className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 flex items-center justify-center font-bold text-xs cursor-pointer"
                      >
                        📹
                      </button>
                    </div>
                  </div>

                  {/* CHAT MESSAGES DISPLAY CARRIER */}
                  <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
                    {messages.map((m) => {
                      const isMe = m.senderId === user?.uid;
                      return (
                        <div 
                          key={m.id} 
                          className={`flex flex-col max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}
                        >
                          <div 
                            className={`p-3.5 rounded-2xl text-xs font-medium border relative gap-2 ${
                              isMe 
                                ? 'bg-black border-zinc-900 text-white rounded-br-none' 
                                : 'bg-white border-gray-200 text-gray-800 rounded-bl-none'
                            }`}
                          >
                            {/* Standard message text */}
                            {m.text && <p className="leading-relaxed break-words">{m.text}</p>}

                            {/* Voice note message player */}
                            {m.audioUrl && (
                              <div className="flex items-center gap-2 min-w-[190px]">
                                <button 
                                  onClick={() => {
                                    const audio = new Audio(m.audioUrl);
                                    audio.play().catch(e => showToast("Falha ao tocar"));
                                  }}
                                  className="w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-600 border-none text-white font-extrabold cursor-pointer flex items-center justify-center shrink-0 shadow-sm"
                                  title="Ouvir Áudio"
                                >
                                  🔊
                                </button>
                                <div className="flex-1 flex flex-col font-mono text-[10px]">
                                  <span className="font-bold opacity-80">🎙️ Áudio Gravado</span>
                                  <span className="opacity-60">{m.duration ? `${m.duration} seg` : 'Voz'}</span>
                                </div>
                              </div>
                            )}
                          </div>
                          
                          {/* Message meta label footer */}
                          <span className="text-[9px] text-gray-400 font-medium select-none mt-1">
                            {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      );
                    })}

                    {messages.length === 0 && (
                      <div className="my-auto py-12 flex flex-col items-center justify-center text-center text-gray-400 text-xs gap-3">
                        <span className="text-3xl">✨</span>
                        <div>
                          <strong className="block font-bold">Inicie um Direct</strong>
                          <span className="text-gray-400">Envie mensagens de texto ou graves notas de voz para @{selectedContact.username}.</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* MESSAGE COMPOSER CONTAINER BAR */}
                  <div className="bg-white border-t border-gray-150 p-3 flex flex-col gap-2">
                    
                    {/* Voice audio note recording HUD */}
                    {isRecording ? (
                      <div className="bg-[#FFF5F5] border border-[#FEE2E2] text-[#991B1B] p-3.5 rounded-xl flex items-center justify-between font-bold text-xs animate-pulse">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                          <span>🎙️ Gravando áudio de voz... ({recordingSeconds}s)</span>
                        </div>
                        <button 
                          onClick={handleStopRecording}
                          className="px-3.5 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg border-none text-[11px] uppercase tracking-wider font-black cursor-pointer shadow-sm"
                        >
                          ⏹ Enviar Áudio
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {/* Audio Note trigger */}
                        <button 
                          onClick={handleStartRecording}
                          className="w-10 h-10 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 flex items-center justify-center text-lg shadow-xs cursor-pointer transition-colors"
                          title="Gravar Mensagem de Áudio"
                        >
                          🎙️
                        </button>

                        {/* Text field input */}
                        <input 
                          type="text" 
                          placeholder={`Escreva para @${selectedContact.username}...`}
                          value={typedMessage}
                          onChange={e => setTypedMessage(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                          className="flex-1 bg-gray-105 border border-gray-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-black placeholder-gray-400"
                        />

                        {/* Send submission button */}
                        <button 
                          onClick={handleSendMessage}
                          disabled={!typedMessage.trim()}
                          className="px-4 py-2 h-10 bg-black hover:bg-zinc-850 text-white text-xs font-bold rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
                        >
                          Enviar
                        </button>
                      </div>
                    )}

                  </div>

                </div>
              )}

              {/* TAB 2: CALL LOGS VIEW */}
              {activeSubTab === 'calls' && (
                <div id="calls-logs-wrapper" className="flex flex-col p-4 gap-3 flex-1">
                  <strong className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400">Logs de Ligações Recentes ({callHistory.length})</strong>
                  
                  <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[500px]">
                    {callHistory.map((call) => {
                      const isOutgoing = call.callerId === user?.uid;
                      const hasMissed = call.status === 'missed';
                      const hasRejected = call.status === 'rejected';

                      return (
                        <div key={call.id} className="p-3 bg-white border border-gray-150 rounded-xl flex items-center justify-between gap-3 shadow-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xl">
                              {call.type === 'video' ? '📹' : '📞'}
                            </span>
                            <div className="min-w-0 text-xs">
                              <span className="font-extrabold text-gray-800 truncate block">
                                {isOutgoing ? `Para: @${call.receiverName}` : `De: @${call.callerName}`}
                              </span>
                              <span className="text-[9px] text-gray-400 block mt-0.5">
                                {new Date(call.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                              </span>
                            </div>
                          </div>

                          <div className="text-right flex flex-col items-end">
                            {/* Call logs states display */}
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                              call.status === 'accepted' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' :
                              call.status === 'missed' ? 'text-rose-700 bg-rose-50 border-rose-150 font-bold animate-pulse' :
                              call.status === 'rejected' ? 'text-amber-750 bg-amber-50 border-amber-200' :
                              'text-zinc-500 bg-zinc-50 border-zinc-200'
                            }`}>
                              {call.status === 'accepted' ? 'Atendida' :
                               call.status === 'missed' ? 'Perdida ⚠️' :
                               call.status === 'rejected' ? 'Recusada' :
                               call.status === 'ended' ? 'Encerrada' : 'Sem Resposta'}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {callHistory.length === 0 && (
                      <div className="text-center py-12 text-xs text-gray-400">Nenhum registro de ligações encontrado.</div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: SETTINGS VIEW */}
              {activeSubTab === 'settings' && (
                <div id="settings-tone-wrapper" className="flex flex-col p-5 gap-5 flex-1">
                  
                  <div className="bg-[#FAFAFA] border border-gray-150 rounded-2xl p-5 flex flex-col gap-4">
                    <div className="pb-2 border-b border-gray-100 mb-1">
                      <strong className="text-xs text-gray-800 block font-extrabold">🎵 Preferências de Ringtone</strong>
                      <p className="text-[11px] text-gray-400 mt-0.5">Selecione o som ideal para alertas e chamadas no JPvano.</p>
                    </div>

                    {/* Standard synthesizer description */}
                    <div className="flex flex-col gap-1 text-xs">
                      <span className="font-extrabold text-gray-700 block">Som Ativo Atualmente:</span>
                      <div className="bg-white border border-gray-200 p-3 rounded-xl font-mono text-[10px] text-gray-500 flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-purple-700">
                          {userRingtone === 'default' ? '🔊 Toque Original (Sintetizador Dual Tone)' : '✨ Toque Personalizado (.MP3 Carregado)'}
                        </span>
                        
                        {/* Test Play tone */}
                        <button 
                          onClick={() => {
                            if (userRingtone !== 'default') {
                              const aud = new Audio(userRingtone);
                              aud.play().catch(() => showToast("Erro tocar"));
                              setTimeout(() => aud.pause(), 4000);
                            } else {
                              callAudio.playInboundRingtone();
                              setTimeout(() => callAudio.stop(), 4000);
                            }
                            showToast("🔊 Testando reprodução por 4s...");
                          }}
                          className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-[9px] font-extrabold uppercase transition-colors"
                        >
                          Testar Toque
                        </button>
                      </div>
                    </div>

                    {/* Custom upload area */}
                    <div className="flex flex-col gap-1.5 mt-2">
                      <label className="text-xs font-black text-gray-500 uppercase tracking-wider block">Fazer Upload de Toque Personalizado</label>
                      <input 
                        type="file" 
                        accept="audio/*"
                        onChange={handleUploadRingtone}
                        className="text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-purple-100 file:text-purple-700 hover:file:bg-purple-200 file:cursor-pointer"
                      />
                      <span className="text-[9px] text-gray-400 mt-1 block">Tamanho sugerido menor que 2MB para otimizar sincronização offline rápido.</span>
                    </div>

                    {/* Fallback back to standard */}
                    {userRingtone !== 'default' && (
                      <button 
                        onClick={async () => {
                          if (user) {
                            await updateDoc(doc(db, 'users', user.uid), {
                              ringtoneUrl: 'default'
                            });
                            setUserRingtone('default');
                            showToast("Toque restaurado para o padrão!");
                          }
                        }}
                        className="mt-2 py-2 bg-gray-150 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition-colors border border-gray-300"
                      >
                        Restaurar Toque Padrão
                      </button>
                    )}
                  </div>

                  {/* INFO SHEET SYSTEM STATUS */}
                  <div className="bg-purple-50/50 border border-purple-100 rounded-2xl p-4 text-xs text-purple-950/70 leading-relaxed font-semibold">
                    <span className="font-extrabold block text-purple-800 mb-1">⚡ Tecnologia WebRTC / P2P JPvano</span>
                    Este sistema utiliza áudio/vídeo ponto a ponto direto e sem canais intermediários, reduzindo a latência a níveis ínfimos! A sincronização é gerenciada em tempo real por canais Firestore.
                  </div>

                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </>
  );
}
