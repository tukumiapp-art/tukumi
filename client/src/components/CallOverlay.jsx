import React, { useState, useEffect, useRef } from 'react';
import { db } from '../api/firebase';
import { doc, updateDoc, onSnapshot, collection, addDoc } from 'firebase/firestore';
import { useCall } from '../context/CallContext';
import { 
    Mic, MicOff, Video, VideoOff, PhoneOff, Minimize2, Maximize2, Volume2, Volume1 
} from 'lucide-react';

const servers = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
  ],
  iceCandidatePoolSize: 10,
};

const CallOverlay = () => {
  const { activeCall, endActiveCall, isMinimized, setIsMinimized } = useCall();
  
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true); 
  const [callStatus, setCallStatus] = useState('Connecting...');
  const [error, setError] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pc = useRef(null);
  const candidateQueue = useRef([]);

  useEffect(() => {
    if (!activeCall) return;

    let unsubscribeCallDoc = null;
    let unsubscribeCandidates = null;

    const startWebRTC = async () => {
      try {
        pc.current = new RTCPeerConnection(servers);

        pc.current.oniceconnectionstatechange = () => {
            if (pc.current.iceConnectionState === 'connected' || pc.current.iceConnectionState === 'completed') {
                setCallStatus('Connected');
            } else if (pc.current.iceConnectionState === 'disconnected') {
                setCallStatus('Reconnecting...');
            } else if (pc.current.iceConnectionState === 'failed') {
                setCallStatus('Connection Failed');
                setTimeout(endCall, 2000);
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: activeCall.type === 'video',
          audio: true,
        });
        setLocalStream(stream);
        
        stream.getTracks().forEach((track) => pc.current.addTrack(track, stream));

        pc.current.ontrack = (event) => {
            if(event.streams && event.streams[0]) {
              setRemoteStream(event.streams[0]);
              setCallStatus('Connected');
            }
        };

        const callDocRef = doc(db, 'calls', activeCall.id);
        const candidatesCol = collection(callDocRef, 'candidates');

        pc.current.onicecandidate = (event) => {
          if (event.candidate) {
            addDoc(candidatesCol, {
                ...event.candidate.toJSON(),
                senderId: activeCall.isCaller ? 'caller' : 'callee'
            });
          }
        };

        if (activeCall.isCaller) {
          const offer = await pc.current.createOffer();
          await pc.current.setLocalDescription(offer);
          
          await updateDoc(callDocRef, { 
              offer: { type: offer.type, sdp: offer.sdp },
              status: 'calling'
          });

          unsubscribeCallDoc = onSnapshot(callDocRef, async (snapshot) => {
              const data = snapshot.data();
              if (!pc.current || !data) return;

              if (!pc.current.currentRemoteDescription && data.answer) {
                const answer = new RTCSessionDescription(data.answer);
                await pc.current.setRemoteDescription(answer);
                processCandidateQueue();
              }
              if (data.status === 'ended' || data.status === 'rejected') {
                handleCleanup();
              }
            });

        } else {
          unsubscribeCallDoc = onSnapshot(callDocRef, async (snapshot) => {
              const data = snapshot.data();
              if (!pc.current || !data) return;

              if (data.status === 'ended') { handleCleanup(); return; }

              if (!pc.current.currentRemoteDescription && data.offer) {
                const offer = new RTCSessionDescription(data.offer);
                await pc.current.setRemoteDescription(offer);
                processCandidateQueue();
                
                const answer = await pc.current.createAnswer();
                await pc.current.setLocalDescription(answer);
                
                await updateDoc(callDocRef, { answer: { type: answer.type, sdp: answer.sdp } });
              }
            });
        }

        unsubscribeCandidates = onSnapshot(collection(callDocRef, 'candidates'), (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const data = change.doc.data();
                const targetSender = activeCall.isCaller ? 'callee' : 'caller';
                if (data.senderId === targetSender) {
                    const candidate = new RTCIceCandidate(data);
                    if (pc.current.remoteDescription) {
                        pc.current.addIceCandidate(candidate).catch(e => console.warn("Candidate Error", e));
                    } else {
                        candidateQueue.current.push(candidate);
                    }
                }
              }
            });
          });

      } catch (error) {
        console.error("WebRTC error:", error);
        setError("Connection failed.");
        setTimeout(() => handleCleanup(), 3000);
      }
    };

    const processCandidateQueue = () => {
        if (!pc.current) return;
        candidateQueue.current.forEach((cand) => {
            pc.current.addIceCandidate(cand).catch(e => console.warn("Queue Error", e));
        });
        candidateQueue.current = [];
    };

    startWebRTC();

    return () => {
        if(unsubscribeCallDoc) unsubscribeCallDoc();
        if(unsubscribeCandidates) unsubscribeCandidates();
        handleCleanup();
    };
  }, [activeCall]);

  const handleCleanup = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (pc.current) {
      pc.current.close();
      pc.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    endActiveCall();
  };

  const endCall = async () => {
    try { await updateDoc(doc(db, 'calls', activeCall.id), { status: 'ended' }); } catch(e){ }
    handleCleanup();
  };

  // --- FIXED MUTE FUNCTION ---
  const toggleMute = () => {
      if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            // Toggle enabled state for all audio tracks
            audioTracks.forEach(t => {
                t.enabled = !t.enabled;
            });
            // Update UI state based on the first track's new state
            // If we just disabled it (muted), enabled will be false.
            // isMuted should be true if enabled is false.
            setIsMuted(!audioTracks[0].enabled);
        } else {
            console.warn("No audio tracks found to mute.");
        }
      }
  };

  const toggleVideo = () => {
      if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        videoTracks.forEach(t => t.enabled = !t.enabled);
        setIsVideoEnabled(!isVideoEnabled);
      }
  };

  const toggleSpeaker = async () => {
      const videoEl = remoteVideoRef.current;
      if (!videoEl || typeof videoEl.setSinkId !== 'function') {
          // Fallback for browsers that don't support setSinkId
          setIsSpeakerOn(!isSpeakerOn);
          return;
      }
      try {
          // Empty string usually resets to default system audio
          const sinkId = isSpeakerOn ? '' : 'default'; 
          await videoEl.setSinkId(sinkId);
          setIsSpeakerOn(!isSpeakerOn);
      } catch (err) { 
          console.error("Speaker toggle failed", err); 
      }
  };

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream, isMinimized, isVideoEnabled]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream, isMinimized]);

  if (!activeCall) return null;

  if (isMinimized) {
    return (
        <div className="fixed top-20 right-4 w-36 h-52 bg-gray-900 rounded-xl shadow-2xl z-[9999] overflow-hidden border border-white/20 cursor-move">
            {remoteStream ? (
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-800 text-white text-xs">Connecting...</div>
            )}
            <button onClick={() => setIsMinimized(false)} className="absolute inset-0 z-10"></button>
        </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-[#1a1a1a] flex flex-col items-center justify-center">
      {error && <div className="absolute top-4 bg-red-500 text-white px-6 py-2 rounded-full z-50">{error}</div>}

      <div className="absolute inset-0 w-full h-full">
        {remoteStream ? (
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
        ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900">
                <img src={activeCall.otherUser?.avatar || "https://via.placeholder.com/150"} className="w-32 h-32 rounded-full border-4 border-white/10 animate-pulse object-cover mb-4" />
                <h2 className="text-white text-2xl font-bold">{activeCall.otherUser?.name}</h2>
                <p className="text-gray-400 mt-2">{callStatus}</p>
            </div>
        )}
      </div>

      {activeCall.type === 'video' && localStream && (
          <div className="absolute top-6 right-6 w-32 h-48 bg-black rounded-xl overflow-hidden shadow-lg border border-white/20 z-20">
            {isVideoEnabled ? (
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
            ) : <div className="w-full h-full bg-gray-800 flex items-center justify-center"><VideoOff className="text-gray-500" /></div>}
          </div>
      )}

      <div className="absolute bottom-10 flex items-center gap-6 p-4 px-8 bg-black/60 backdrop-blur-xl rounded-full border border-white/10 z-30">
        <button onClick={toggleSpeaker} className={`p-4 rounded-full ${isSpeakerOn ? 'bg-white text-black' : 'bg-gray-700 text-white'}`}>{isSpeakerOn ? <Volume2 size={24} /> : <Volume1 size={24} />}</button>
        
        {/* Mute Button with Color Change */}
        <button onClick={toggleMute} className={`p-4 rounded-full ${isMuted ? 'bg-red-500 text-white' : 'bg-white text-black'}`}>
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
        
        {activeCall.type === 'video' && <button onClick={toggleVideo} className={`p-4 rounded-full ${!isVideoEnabled ? 'bg-white text-black' : 'bg-gray-700 text-white'}`}>{!isVideoEnabled ? <VideoOff size={24} /> : <Video size={24} />}</button>}
        
        <button onClick={endCall} className="p-5 rounded-full bg-red-600 text-white shadow-lg"><PhoneOff size={32} /></button>
        <button onClick={() => setIsMinimized(true)} className="p-4 rounded-full bg-gray-700 text-white"><Minimize2 size={24} /></button>
      </div>
    </div>
  );
};

export default CallOverlay;