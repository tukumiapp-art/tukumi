import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { db, auth } from '../api/firebase'; 
import { 
  collection, addDoc, doc, updateDoc, onSnapshot, query, where, orderBy, limit, serverTimestamp 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const CallContext = createContext();

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used within a CallProvider');
  return context;
};

export const CallProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  
  // NEW: TRACK WHICH CHAT IS OPEN TO STOP NOTIFICATIONS
  const [viewingChatId, setViewingChatId] = useState(null);

  const startTimeRef = useRef(null); 
  const ringtoneRef = useRef(null);

  useEffect(() => {
    ringtoneRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    ringtoneRef.current.loop = true;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => { unsubscribeAuth(); stopRingtone(); };
  }, []);

  const playRingtone = async () => {
    try { if (ringtoneRef.current) { ringtoneRef.current.currentTime = 0; await ringtoneRef.current.play(); } } 
    catch (error) { console.warn("Autoplay prevented:", error); }
  };

  const stopRingtone = () => {
    if (ringtoneRef.current) { ringtoneRef.current.pause(); ringtoneRef.current.currentTime = 0; }
  };

  const logCallMessage = async (conversationId, message, type = 'system') => {
      if (!conversationId) return;
      try {
          await addDoc(collection(db, `conversations/${conversationId}/messages`), {
              text: message,
              senderId: user?.uid || 'system',
              senderName: 'System',
              type: type,
              timestamp: serverTimestamp(),
              status: 'sent'
          });
          await updateDoc(doc(db, 'conversations', conversationId), {
              lastMessage: message,
              updatedAt: serverTimestamp()
          });
      } catch (e) { console.error("Log error:", e); }
  };

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'calls'),
      where('receiverId', '==', user.uid),
      where('status', '==', 'ringing'),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const callData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
          const callTime = callData.timestamp?.toDate().getTime();
          const now = Date.now();
          
          if (callTime && (now - callTime > 30000)) { 
              updateDoc(doc(db, 'calls', callData.id), { status: 'missed' });
              return; 
          }

          if (!activeCall && !incomingCall) {
              setIncomingCall(callData);
              playRingtone();
          }
        } else {
          if (incomingCall) {
              setIncomingCall(null);
              stopRingtone();
          }
        }
      }, (error) => console.error("Call Listener Error:", error)
    );
    return () => { unsubscribe(); stopRingtone(); };
  }, [user, activeCall]); 

  const startCall = async (recipientId, recipientName, recipientAvatar, type = 'video', conversationId) => {
    if (!user) return;
    try {
      const safeConversationId = conversationId || null;
      const callDoc = await addDoc(collection(db, 'calls'), {
        callerId: user.uid,
        callerName: user.displayName || 'Unknown',
        callerAvatar: user.photoURL || null,
        receiverId: recipientId,
        receiverName: recipientName,
        receiverAvatar: recipientAvatar,
        conversationId: safeConversationId,
        type,
        status: 'ringing',
        timestamp: serverTimestamp(),
        offer: null, answer: null
      });
      
      startTimeRef.current = Date.now();
      setActiveCall({ id: callDoc.id, isCaller: true, otherUser: { name: recipientName, avatar: recipientAvatar }, type, conversationId: safeConversationId });
    } catch (error) { 
        console.error("Error starting call:", error); 
        alert("Could not connect call. Check internet connection.");
    }
  };

  const answerCall = () => {
    if (!incomingCall) return;
    stopRingtone();
    startTimeRef.current = Date.now();
    setActiveCall({ 
        id: incomingCall.id, isCaller: false, 
        otherUser: { name: incomingCall.callerName, avatar: incomingCall.callerAvatar }, 
        type: incomingCall.type,
        conversationId: incomingCall.conversationId 
    });
    setIncomingCall(null);
  };

  const declineCall = async () => {
    if (!incomingCall) return;
    stopRingtone();
    try {
        await updateDoc(doc(db, 'calls', incomingCall.id), { status: 'rejected' });
        if (incomingCall.conversationId) {
            await logCallMessage(incomingCall.conversationId, `🚫 Call declined (Busy)`);
        }
    } catch (e) { console.error(e); }
    setIncomingCall(null);
  };

  const endActiveCall = async () => {
      if (!activeCall) return;
      let durationStr = "";
      if (startTimeRef.current) {
          const diff = Math.floor((Date.now() - startTimeRef.current) / 1000);
          const mins = Math.floor(diff / 60);
          const secs = diff % 60;
          durationStr = ` (${mins}:${secs.toString().padStart(2, '0')})`;
      }
      const msg = `📞 Call ended${durationStr}`;
      try { 
        await updateDoc(doc(db, 'calls', activeCall.id), { status: 'ended' }); 
        if (activeCall.conversationId) {
            await logCallMessage(activeCall.conversationId, msg);
        }
      } catch(e) {}
      setActiveCall(null);
      setIsMinimized(false);
      startTimeRef.current = null;
  };

  return (
    <CallContext.Provider value={{ 
        user, activeCall, setActiveCall, incomingCall, startCall, answerCall, declineCall, endActiveCall, 
        isMinimized, setIsMinimized,
        viewingChatId, setViewingChatId // EXPORTED TO FIX NOTIFICATIONS
    }}>
      {children}
    </CallContext.Provider>
  );
};

export default CallProvider;