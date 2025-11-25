import React, { useState, useEffect, useRef } from 'react';
import { db } from '../api/firebase';
import { doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';

const CallOverlay = ({ callData, currentUser, onClose, onMinimize }) => {
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideo, setIsVideo] = useState(callData.type === 'video');
  const [videoRequest, setVideoRequest] = useState(null); // 'incoming' or 'outgoing'
  const [status, setStatus] = useState(callData.status || 'calling');
  
  // Streams
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);

  // --- 1. Call Duration Timer ---
  useEffect(() => {
    let interval;
    if (status === 'connected') {
      interval = setInterval(() => setDuration(d => d + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [status]);

  // --- 2. Listen for Call Updates (Video Requests) ---
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'calls', callData.id), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setStatus(data.status);
        
        // Handle Video Request
        if (data.videoRequestedBy && data.videoRequestedBy !== currentUser.uid && !isVideo) {
            setVideoRequest('incoming');
        }
        if (data.type === 'video' && !isVideo) {
            // Switch to video if accepted
            enableVideo();
        }
        if (data.status === 'ended' || data.status === 'rejected') {
            handleEndCall(false); // Do not update DB again if status is already 'ended'
        }
      }
    });
    return () => unsub();
  }, [isVideo]); // Added isVideo dependency to correctly re-evaluate the video request logic

  // --- 3. Media Handling ---
  useEffect(() => {
    const startMedia = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: true, 
                video: isVideo 
            });
            setLocalStream(stream);
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            // In a real WebRTC app, you would attach the remote stream here
        } catch (e) {
            console.error("Media Error", e);
        }
    };
    startMedia();
    return () => {
        if (localStream) localStream.getTracks().forEach(t => t.stop());
    };
  }, [isVideo]); // Re-run if video toggles

  // --- Actions ---
  const formatTime = (s) => {
    const mins = Math.floor(s / 60).toString().padStart(2, '0');
    const secs = (s % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const handleEndCall = async (updateDB = true) => { // Added updateDB parameter
      if (localStream) localStream.getTracks().forEach(t => t.stop());
      
      // Update DB only if I'm the one clicking end (or if status isn't already 'ended')
      if (updateDB && status !== 'ended') {
          await updateDoc(doc(db, 'calls', callData.id), { status: 'ended', endedAt: serverTimestamp() });
      }

      // --- ADDED: SHOW NAV BAR AGAIN ---
      window.dispatchEvent(new CustomEvent('toggle-nav', { detail: { visible: true } }));
      
      onClose();
  };

  const requestVideo = async () => {
      setVideoRequest('outgoing');
      await updateDoc(doc(db, 'calls', callData.id), { videoRequestedBy: currentUser.uid });
  };

  const acceptVideo = async () => {
      await updateDoc(doc(db, 'calls', callData.id), { type: 'video', videoRequestedBy: null });
      enableVideo();
      setVideoRequest(null);
  };

  const enableVideo = () => {
      setIsVideo(true);
      // Actual track switching logic would go here for WebRTC
  };

  const otherUser = callData.callerId === currentUser.uid 
    ? { name: 'Recipient', avatar: callData.receiverAvatar } // In real app, pass full user object
    : { name: callData.callerName, avatar: callData.callerAvatar };

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-900 flex flex-col text-white overflow-hidden animate-fade-in">
        
        {/* BACKGROUND (Blurred Avatar) */}
        <div className="absolute inset-0 z-0 opacity-30">
            <img src={otherUser.avatar || "https://via.placeholder.com/500"} className="w-full h-full object-cover blur-3xl scale-110" alt="background avatar" />
        </div>

        {/* HEADER */}
        <div className="relative z-10 pt-12 px-6 flex justify-between items-start">
            <button onClick={onMinimize} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center"><i className="fas fa-chevron-down"></i></button>
            <div className="text-center">
                <h2 className="text-2xl font-black tracking-wide">{otherUser.name}</h2>
                <p className="text-primary-light font-bold uppercase tracking-widest text-sm mt-1 animate-pulse">
                    {status === 'calling' ? 'Calling...' : status === 'ringing' ? 'Ringing...' : formatTime(duration)}
                </p>
            </div>
            <div className="w-10"></div> 
        </div>

        {/* MAIN CONTENT (Video / Avatar) */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
            {isVideo ? (
                <div className="w-full h-full relative">
                    {/* Remote Video (Simulated) */}
                    <div className="w-full h-full bg-black flex items-center justify-center">
                        <span className="text-gray-500">Remote Video Stream</span>
                    </div>
                    {/* Local Video (PIP) */}
                    <div className="absolute top-4 right-4 w-32 h-48 bg-gray-800 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20">
                        <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                    </div>
                </div>
            ) : (
                <div className="relative">
                    {/* Pulsing Rings */}
                    <div className="absolute inset-0 bg-white/10 rounded-full animate-ping duration-[2000ms]"></div>
                    <div className="absolute inset-0 bg-white/5 rounded-full animate-ping delay-500 duration-[2000ms]"></div>
                    <img src={otherUser.avatar || "https://via.placeholder.com/150"} className="w-40 h-40 rounded-full object-cover border-4 border-white/20 shadow-2xl relative z-20" alt="user avatar" />
                </div>
            )}

            {/* INCOMING VIDEO REQUEST ALERT */}
            {videoRequest === 'incoming' && (
                <div className="absolute bottom-40 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 flex items-center gap-4 animate-bounce-in">
                    <div>
                        <p className="font-bold text-sm">Switch to Video Call?</p>
                        <p className="text-xs text-gray-300">Request from {otherUser.name}</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setVideoRequest(null)} className="w-8 h-8 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center"><i className="fas fa-times"></i></button>
                        <button onClick={acceptVideo} className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center"><i className="fas fa-video"></i></button>
                    </div>
                </div>
            )}
        </div>

        {/* BOTTOM CONTROLS */}
        <div className="relative z-20 pb-12 px-8">
            <div className="flex justify-center items-center gap-6 md:gap-10 bg-black/20 backdrop-blur-xl p-6 rounded-[40px] border border-white/10 shadow-2xl">
                
                {/* MUTE */}
                <button onClick={() => setIsMuted(!isMuted)} className={`w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all ${isMuted ? 'bg-white text-dark' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                    <i className={`fas ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                </button>

                {/* END CALL */}
                <button onClick={() => handleEndCall(true)} className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center text-3xl shadow-red-500/50 shadow-lg hover:scale-105 transition-transform">
                    <i className="fas fa-phone-slash"></i>
                </button>

                {/* VIDEO TOGGLE */}
                <button onClick={isVideo ? () => setIsVideo(false) : requestVideo} className={`w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all ${isVideo ? 'bg-white text-dark' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                    <i className={`fas ${isVideo ? 'fa-video' : 'fa-video-slash'}`}></i>
                </button>

            </div>
        </div>
    </div>
  );
};

export default CallOverlay;