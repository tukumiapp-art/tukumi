import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../api/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy, limit } from 'firebase/firestore';

const GlobalListeners = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [messageNotification, setMessageNotification] = useState(null);
  const ringtone = useRef(new Audio('https://assets.mixkit.co/sfx/preview/mixkit-marimba-ringtone-1359.mp3'));
  const messageSound = useRef(new Audio('https://assets.mixkit.co/sfx/preview/mixkit-message-pop-alert-2354.mp3'));

  useEffect(() => {
    ringtone.current.loop = true;
    ringtone.current.load();
    messageSound.current.load();
    const enableAudio = () => { ringtone.current.play().then(() => { ringtone.current.pause(); ringtone.current.currentTime = 0; }).catch(() => {}); document.removeEventListener('click', enableAudio); };
    document.addEventListener('click', enableAudio);

    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Calls
        const qCalls = query(collection(db, 'calls'), where('receiverId', '==', currentUser.uid), orderBy('timestamp', 'desc'), limit(1));
        const unsubCalls = onSnapshot(qCalls, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            const call = { id: change.doc.id, ...change.doc.data() };
            if (change.type === 'added' && (call.status === 'calling' || call.status === 'ringing')) {
                setIncomingCall(call);
                ringtone.current.play().catch(() => {});
                if (call.status === 'calling') updateDoc(doc(db, 'calls', call.id), { status: 'ringing' });
            }
            if (change.type === 'modified') {
                if (call.status === 'ended' || call.status === 'rejected' || call.status === 'connected') {
                    setIncomingCall(null);
                    ringtone.current.pause();
                    ringtone.current.currentTime = 0;
                }
            }
          });
        });

        // Messages - WITH THE FIX
        const qMsgs = query(collection(db, 'conversations'), where('participants', 'array-contains', currentUser.uid), orderBy('updatedAt', 'desc'), limit(1));
        const unsubMsgs = onSnapshot(qMsgs, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const data = change.doc.data();
                if (change.type === 'modified' && data.lastMessageSenderId !== currentUser.uid) {
                    // CHECK: Is this chat currently open?
                    const activeChatId = sessionStorage.getItem('activeChatId');
                    if (activeChatId === change.doc.id) {
                        return; // STOP! User is looking at this chat.
                    }

                    if (data.updatedAt?.seconds > Date.now()/1000 - 5) {
                        messageSound.current.play().catch(()=>{});
                        const sender = data.users.find(u => u.uid !== currentUser.uid);
                        setMessageNotification({ id: change.doc.id, senderName: sender?.displayName || 'Chat', senderAvatar: sender?.photoURL, text: data.lastMessage });
                        setTimeout(() => setMessageNotification(null), 4000);
                    }
                }
            });
        });
        return () => { unsubCalls(); unsubMsgs(); };
      }
    });
    return () => { unsubAuth(); ringtone.current.pause(); document.removeEventListener('click', enableAudio); };
  }, []);

  const handleAnswer = async () => {
      if (!incomingCall) return;
      ringtone.current.pause();
      await updateDoc(doc(db, 'calls', incomingCall.id), { status: 'connected' });
      window.dispatchEvent(new CustomEvent('toggle-nav', { detail: { visible: false } }));
      navigate('/messages', { state: { activeConversationId: incomingCall.conversationId, incomingCallData: { ...incomingCall, status: 'connected' } } });
      setIncomingCall(null);
  };
  const handleDecline = async () => { ringtone.current.pause(); await updateDoc(doc(db, 'calls', incomingCall.id), { status: 'rejected' }); setIncomingCall(null); };
  const handleMessageClick = () => { navigate('/messages', { state: { activeConversationId: messageNotification.id } }); setMessageNotification(null); };

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none flex flex-col items-center pt-4 px-4">
      {incomingCall && (
        <div className="pointer-events-auto w-full max-w-sm bg-dark/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-slide-down border border-white/10">
           <div className="relative"><img src={incomingCall.callerAvatar || "https://via.placeholder.com/50"} className="w-14 h-14 rounded-full border-2 border-green-500 animate-pulse" /><div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1"><i className="fas fa-phone text-xs"></i></div></div>
           <div className="flex-1 min-w-0"><h4 className="font-bold text-lg truncate">{incomingCall.callerName}</h4><p className="text-xs text-gray-300 flex items-center gap-1"><i className={`fas ${incomingCall.type === 'video' ? 'fa-video' : 'fa-phone-alt'}`}></i> Incoming {incomingCall.type} call...</p></div>
           <div className="flex gap-3"><button onClick={handleDecline} className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-transform hover:scale-110"><i className="fas fa-times"></i></button><button onClick={handleAnswer} className="w-10 h-10 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-transform hover:scale-110 animate-bounce"><i className="fas fa-phone"></i></button></div>
        </div>
      )}
      {messageNotification && !incomingCall && (
        <div onClick={handleMessageClick} className="pointer-events-auto mt-2 bg-white/90 backdrop-blur-xl p-3 rounded-2xl shadow-lg border border-gray-100 flex items-center gap-3 w-full max-w-sm cursor-pointer animate-fade-in-up">
            <img src={messageNotification.senderAvatar} className="w-10 h-10 rounded-full object-cover" /><div className="flex-1 min-w-0"><h5 className="font-black text-dark text-sm">{messageNotification.senderName}</h5><p className="text-gray-600 text-xs truncate">{messageNotification.text}</p></div><div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-[10px] text-white font-bold">1</div>
        </div>
      )}
    </div>
  );
};
export default GlobalListeners;