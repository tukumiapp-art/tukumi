import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../api/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  collection, query, where, onSnapshot, 
  doc, updateDoc, orderBy, limit 
} from 'firebase/firestore';

const GlobalListeners = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  
  // --- UI STATE ---
  const [messageNotification, setMessageNotification] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);

  // Sound Refs
  const messageSound = useRef(new Audio('https://assets.mixkit.co/sfx/preview/mixkit-message-pop-alert-2354.mp3'));
  const ringtone = useRef(new Audio('https://assets.mixkit.co/sfx/preview/mixkit-marimba-ringtone-1359.mp3'));

  useEffect(() => {
    // 1. Setup Ringtone Loop
    ringtone.current.loop = true;

    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        // ------------------------------------
        // A. LISTEN FOR INCOMING CALLS
        // ------------------------------------
        // We listen to a 'calls' collection where receiverId == current user
        const qCalls = query(
          collection(db, 'calls'),
          where('receiverId', '==', currentUser.uid),
          where('status', '==', 'ringing'),
          orderBy('timestamp', 'desc'),
          limit(1)
        );

        const unsubCalls = onSnapshot(qCalls, (snapshot) => {
          if (!snapshot.empty) {
            const callData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
            setIncomingCall(callData);
            ringtone.current.play().catch(e => console.log("Audio play failed", e));
          } else {
            setIncomingCall(null);
            ringtone.current.pause();
            ringtone.current.currentTime = 0;
          }
        });

        // ------------------------------------
        // B. LISTEN FOR NEW MESSAGES
        // ------------------------------------
        // We listen to conversations that have been updated recently
        const qMsgs = query(
          collection(db, 'conversations'),
          where('participants', 'array-contains', currentUser.uid),
          orderBy('updatedAt', 'desc'),
          limit(1)
        );

        const unsubMsgs = onSnapshot(qMsgs, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'modified' || change.type === 'added') {
              const data = change.doc.data();
              // Check if message is NEW (within last 5 seconds) and NOT from self
              const isRecent = data.updatedAt?.seconds > (Date.now() / 1000) - 5;
              const isFromOther = data.lastMessageSenderId !== currentUser.uid; // You need to ensure you save senderId in conversations
              
              // Fallback if lastMessageSenderId isn't explicitly saved, check unread count
              const hasUnread = data.unreadCounts?.[currentUser.uid] > 0;

              if (isRecent && hasUnread) {
                // Find sender info
                const sender = data.users.find(u => u.uid !== currentUser.uid);
                
                // Show Notification
                setMessageNotification({
                  id: change.doc.id,
                  senderName: sender?.displayName || 'Someone',
                  senderAvatar: sender?.photoURL,
                  text: data.lastMessage
                });
                
                messageSound.current.play().catch(e => {});

                // Auto hide after 4 seconds
                setTimeout(() => setMessageNotification(null), 4000);
              }
            }
          });
        });

        return () => { unsubCalls(); unsubMsgs(); };
      }
    });

    return () => { unsubAuth(); ringtone.current.pause(); };
  }, []);

  // --- HANDLERS ---
  const handleAnswerCall = () => {
    if (!incomingCall) return;
    ringtone.current.pause();
    // Navigate to messages with call state
    navigate('/messages', { 
        state: { 
            activeConversationId: incomingCall.conversationId,
            incomingCallData: incomingCall 
        } 
    });
    setIncomingCall(null);
  };

  const handleDeclineCall = async () => {
    if (!incomingCall) return;
    ringtone.current.pause();
    // Update DB to stop ringing
    await updateDoc(doc(db, 'calls', incomingCall.id), { status: 'rejected' });
    setIncomingCall(null);
  };

  const handleMessageClick = () => {
    if (messageNotification) {
        navigate('/messages', { state: { activeConversationId: messageNotification.id } });
        setMessageNotification(null);
    }
  };

  return (
    <div className="fixed z-[9999] pointer-events-none inset-0 flex flex-col items-center pt-4 px-4">
      
      {/* 1. INCOMING CALL NOTIFICATION (Top Banner) */}
      {incomingCall && (
        <div className="pointer-events-auto bg-dark/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl w-full max-w-sm flex items-center gap-4 animate-slide-down border border-white/10">
           <div className="relative">
             <img src={incomingCall.callerAvatar || "https://via.placeholder.com/50"} className="w-14 h-14 rounded-full border-2 border-green-500 animate-pulse" alt="Caller" />
             <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1"><i className="fas fa-phone text-xs"></i></div>
           </div>
           <div className="flex-1 min-w-0">
             <h4 className="font-bold text-lg truncate">{incomingCall.callerName}</h4>
             <p className="text-xs text-gray-300 flex items-center gap-1">
                <i className="fas fa-video"></i> {incomingCall.type === 'video' ? 'Video Call' : 'Audio Call'}...
             </p>
           </div>
           <div className="flex gap-3">
             <button onClick={handleDeclineCall} className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-transform hover:scale-110">
               <i className="fas fa-times"></i>
             </button>
             <button onClick={handleAnswerCall} className="w-10 h-10 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-transform hover:scale-110 animate-bounce">
               <i className="fas fa-phone"></i>
             </button>
           </div>
        </div>
      )}

      {/* 2. MESSAGE TOAST (Small Popup) */}
      {messageNotification && !incomingCall && (
        <div 
            onClick={handleMessageClick}
            className="pointer-events-auto mt-4 bg-white/90 backdrop-blur-xl p-3 rounded-2xl shadow-lg border border-gray-100 flex items-center gap-3 w-full max-w-sm cursor-pointer hover:scale-105 transition-all animate-fade-in-up"
        >
            <img src={messageNotification.senderAvatar || "https://via.placeholder.com/40"} className="w-10 h-10 rounded-full object-cover" />
            <div className="flex-1 min-w-0">
                <h5 className="font-black text-dark text-sm">{messageNotification.senderName}</h5>
                <p className="text-gray-600 text-xs truncate">{messageNotification.text}</p>
            </div>
            <div className="w-2 h-2 bg-primary rounded-full"></div>
        </div>
      )}

    </div>
  );
};

export default GlobalListeners;