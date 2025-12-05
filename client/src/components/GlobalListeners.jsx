import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../api/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { useCall } from '../context/CallContext';

const GlobalListeners = () => {
  const navigate = useNavigate();
  
  // 1. GET viewingChatId TO BLOCK NOTIFICATIONS
  const { incomingCall, answerCall, declineCall, viewingChatId } = useCall(); 

  const [user, setUser] = useState(null);
  const [messageNotification, setMessageNotification] = useState(null);

  const messageSound = useRef(null);
  const ringtone = useRef(null);
  const notifiedMessageIds = useRef(new Set());

  useEffect(() => {
    messageSound.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2346/2346-preview.mp3');
    ringtone.current = new Audio('https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3');
    if (ringtone.current) {
      ringtone.current.loop = true;
      ringtone.current.volume = 0.8;
    }

    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const qMsgs = query(
          collection(db, 'conversations'),
          where('participants', 'array-contains', currentUser.uid),
          orderBy('updatedAt', 'desc'),
          limit(5)
        );

        const unsubMsgs = onSnapshot(qMsgs, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'modified' || change.type === 'added') {
                const data = change.doc.data();
                const isRecent = data.updatedAt?.seconds > (Date.now() / 1000) - 5;
                const senderId = data.lastSenderId || data.lastMessageSenderId;
                const isFromOther = senderId && senderId !== currentUser.uid;
                
                const uniqueId = change.doc.id + '_' + data.updatedAt?.seconds;
                const alreadyNotified = notifiedMessageIds.current.has(uniqueId);

                // --- CRITICAL FIX: DO NOT PLAY IF VIEWING THIS CHAT ---
                const isViewingThisChat = viewingChatId === change.doc.id;

                if (isRecent && isFromOther && !alreadyNotified && !isViewingThisChat) {
                  notifiedMessageIds.current.add(uniqueId);

                  const sender = data.users?.find(u => u.uid !== currentUser.uid);
                  setMessageNotification({
                    id: change.doc.id,
                    senderName: sender?.displayName || 'Someone',
                    senderAvatar: sender?.photoURL,
                    text: data.lastMessage
                  });
                  
                  if (messageSound.current) {
                    messageSound.current.currentTime = 0;
                    messageSound.current.play().catch(() => {});
                  }

                  setTimeout(() => setMessageNotification(null), 4000);
                }
              }
            });
          });
        return () => unsubMsgs();
      }
    });

    return () => {
      if (ringtone.current) {
        ringtone.current.pause();
        ringtone.current.currentTime = 0;
      }
    };
  }, [viewingChatId]); // Re-run when viewingChatId changes

  useEffect(() => {
    if (incomingCall) {
        if (ringtone.current && ringtone.current.paused) {
            ringtone.current.currentTime = 0;
            ringtone.current.play().catch(() => {});
        }
    } else {
        if (ringtone.current) {
            ringtone.current.pause();
            ringtone.current.currentTime = 0;
        }
    }
  }, [incomingCall]);

  const handleAnswer = () => {
    if (incomingCall) {
        answerCall(incomingCall);
        navigate('/messages');
    }
  };

  return (
    <div className="fixed z-[9999] pointer-events-none inset-0 flex flex-col items-center pt-4 px-4">
      {incomingCall && (
        <div className="pointer-events-auto bg-gray-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl w-full max-w-sm flex items-center gap-4 animate-slide-down border border-white/10">
           <div className="relative">
             <img src={incomingCall.callerAvatar || "https://via.placeholder.com/50"} className="w-14 h-14 rounded-full border-2 border-green-500 animate-pulse object-cover" />
             <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1"><i className="fas fa-phone text-xs"></i></div>
           </div>
           <div className="flex-1 min-w-0">
             <h4 className="font-bold text-lg truncate">{incomingCall.callerName}</h4>
             <p className="text-xs text-gray-300 flex items-center gap-1">{incomingCall.type === 'video' ? 'Video Call' : 'Audio Call'}...</p>
           </div>
           <div className="flex gap-3">
             <button onClick={declineCall} className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center"><i className="fas fa-times"></i></button>
             <button onClick={handleAnswer} className="w-10 h-10 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center animate-bounce"><i className="fas fa-phone"></i></button>
           </div>
        </div>
      )}

      {messageNotification && !incomingCall && (
        <div onClick={() => { navigate('/messages', { state: { activeConversationId: messageNotification.id } }); setMessageNotification(null); }} className="pointer-events-auto mt-4 bg-white/90 backdrop-blur-xl p-3 rounded-2xl shadow-lg border border-gray-100 flex items-center gap-3 w-full max-w-sm cursor-pointer hover:scale-105 transition-all animate-fade-in-up">
            <img src={messageNotification.senderAvatar || "https://via.placeholder.com/40"} className="w-10 h-10 rounded-full object-cover" />
            <div className="flex-1 min-w-0">
                <h5 className="font-black text-dark text-sm">{messageNotification.senderName}</h5>
                <p className="text-gray-600 text-xs truncate">{messageNotification.text}</p>
            </div>
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
        </div>
      )}
    </div>
  );
};

export default GlobalListeners;