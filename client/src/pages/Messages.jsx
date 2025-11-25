import React, { useState, useEffect, useRef } from 'react';
import { db, auth, storage } from '../api/firebase';
import { 
  collection, query, where, orderBy, onSnapshot, 
  addDoc, serverTimestamp, doc, updateDoc, increment, 
  deleteDoc, getDoc, arrayUnion, arrayRemove 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import { useLocation, useNavigate } from 'react-router-dom';
import CallOverlay from '../components/CallOverlay'; 

// --- CHAT DETAILS COMPONENT ---
const ChatDetails = ({ chat, messages, onClose, onBlock, onUnblock, onMute, isMuted, onDelete, isBlocked, navigate }) => {
    const [view, setView] = useState('menu'); 
    const [searchTerm, setSearchTerm] = useState('');
    const mediaMessages = messages.filter(m => m.mediaType === 'image' || m.mediaType === 'video');
    const foundMessages = searchTerm ? messages.filter(m => m.text.toLowerCase().includes(searchTerm.toLowerCase())) : [];

    return (
        <div className="absolute inset-y-0 right-0 w-full md:w-80 bg-white shadow-2xl z-[50] flex flex-col animate-slide-in border-l border-gray-100">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#F8FAFD]">
                {view === 'menu' ? <h3 className="font-black text-lg text-dark">Details</h3> : <button onClick={() => setView('menu')} className="font-bold text-gray-500 flex items-center gap-2"><i className="fas fa-arrow-left"></i> Back</button>}
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-white text-gray-400 hover:text-dark flex items-center justify-center shadow-sm"><i className="fas fa-times"></i></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
                {view === 'menu' && (
                    <div className="space-y-6">
                        <div className="text-center cursor-pointer" onClick={() => !chat.isGroup && navigate(`/profile/${chat.otherUser.uid}`)}>
                            <div className="flex justify-center mb-4"><img src={!chat.isGroup ? chat.otherUser?.photoURL : "https://via.placeholder.com/100"} className="w-24 h-24 rounded-[2rem] object-cover shadow-lg border-4 border-white" /></div>
                            <h2 className="text-2xl font-black text-dark">{chat.isGroup ? chat.groupName : chat.otherUser?.displayName}</h2>
                            <p className="text-primary font-bold text-sm">View Profile</p>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <button onClick={onMute} className={`flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-100 ${isMuted ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-600'}`}><i className={`fas ${isMuted ? 'fa-bell-slash' : 'fa-bell'}`}></i><span className="text-[10px] font-bold">{isMuted ? 'Unmute' : 'Mute'}</span></button>
                            <button onClick={() => setView('search')} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gray-50 hover:bg-gray-100"><i className="fas fa-search text-gray-500"></i><span className="text-[10px] font-bold text-gray-600">Search</span></button>
                            <button onClick={() => setView('media')} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gray-50 hover:bg-gray-100"><i className="fas fa-images text-gray-500"></i><span className="text-[10px] font-bold text-gray-600">Media</span></button>
                        </div>
                        <div className="border-t border-gray-100 pt-6 space-y-3">
                            {isBlocked ? <button onClick={onUnblock} className="w-full py-3 rounded-xl bg-gray-100 text-dark font-bold hover:bg-gray-200">Unblock User</button> : <button onClick={onBlock} className="w-full py-3 rounded-xl bg-red-50 text-red-500 font-bold hover:bg-red-100">Block User</button>}
                            <button onClick={onDelete} className="w-full py-3 rounded-xl border-2 border-red-100 text-red-500 font-bold hover:bg-white">Clear Chat</button>
                        </div>
                    </div>
                )}
                {view === 'media' && <div><h4 className="font-bold text-dark mb-4">Shared Media ({mediaMessages.length})</h4><div className="grid grid-cols-3 gap-2">{mediaMessages.map(m => (<div key={m.id} className="aspect-square rounded-lg overflow-hidden bg-gray-100">{m.mediaType === 'video' ? <video src={m.mediaURL} className="w-full h-full object-cover" /> : <img src={m.mediaURL} className="w-full h-full object-cover" />}</div>))}</div></div>}
                {view === 'search' && <div><input autoFocus placeholder="Search..." className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4 text-sm font-bold outline-none focus:border-primary" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /><div className="space-y-3">{foundMessages.map(m => (<div key={m.id} className="p-3 bg-gray-50 rounded-xl text-sm"><p className="text-gray-800">{m.text}</p><p className="text-[10px] text-gray-400 mt-1">{m.timestamp?.seconds ? new Date(m.timestamp.seconds * 1000).toLocaleDateString() : ''}</p></div>))}</div></div>}
            </div>
        </div>
    );
};

const Messages = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null); 
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [activeCall, setActiveCall] = useState(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth > 768);
  const scrollRef = useRef();

  useEffect(() => {
      const handleResize = () => setIsDesktop(window.innerWidth > 768);
      window.addEventListener('resize', handleResize);
      return () => {
          window.removeEventListener('resize', handleResize);
          sessionStorage.removeItem('activeChatId');
      };
  }, []);

  useEffect(() => {
      if (activeChat) sessionStorage.setItem('activeChatId', activeChat.id);
      else sessionStorage.removeItem('activeChatId');
  }, [activeChat]);

  const toggleNav = (show) => {
      window.dispatchEvent(new CustomEvent('toggle-nav', { detail: { visible: show } }));
  };

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
        setUser(u);
        if(u) {
            onSnapshot(doc(db, 'users', u.uid), (docSnap) => { if(docSnap.exists()) setProfile(docSnap.data()); });
            if (location.state?.incomingCallData) { setActiveCall({ ...location.state.incomingCallData, status: 'connected' }); toggleNav(false); }
        }
    });
    if (user) {
        const q = query(collection(db, 'conversations'), where('participants', 'array-contains', user.uid), orderBy('updatedAt', 'desc'));
        const unsub = onSnapshot(q, snap => setConversations(snap.docs.map(d => ({ id: d.id, ...d.data(), otherUser: !d.data().isGroup ? d.data().users.find(u => u.uid !== user.uid) : null }))));
        return () => unsub();
    }
    return () => unsubAuth();
  }, [user]);

  useEffect(() => {
      if (!activeChat) return;
      if (activeChat.unreadCounts?.[user.uid] > 0) updateDoc(doc(db, 'conversations', activeChat.id), { [`unreadCounts.${user.uid}`]: 0 });
      const q = query(collection(db, `conversations/${activeChat.id}/messages`), orderBy('timestamp', 'asc'));
      const unsub = onSnapshot(q, snap => {
          setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      });
      return () => unsub();
  }, [activeChat]);

  const sendMessage = async () => {
      if (!activeChat || !newMessage.trim()) return;
      if (profile?.blockedUsers?.includes(activeChat.otherUser?.uid)) return alert("You blocked this user.");
      await addDoc(collection(db, `conversations/${activeChat.id}/messages`), { text: newMessage, type: 'text', senderId: user.uid, senderName: user.displayName, timestamp: serverTimestamp() });
      const unreadUpdates = {}; activeChat.participants.forEach(uid => { if (uid !== user.uid) unreadUpdates[`unreadCounts.${uid}`] = increment(1); });
      await updateDoc(doc(db, 'conversations', activeChat.id), { lastMessage: newMessage, updatedAt: serverTimestamp(), ...unreadUpdates });
      setNewMessage('');
  };
  
  const handleMute = async () => {
      if (!activeChat) return;
      const userRef = doc(db, 'users', user.uid);
      if (profile?.mutedChats?.includes(activeChat.id)) await updateDoc(userRef, { mutedChats: arrayRemove(activeChat.id) });
      else await updateDoc(userRef, { mutedChats: arrayUnion(activeChat.id) });
  };

  const startCall = async(t) => { toggleNav(false); const ref = await addDoc(collection(db, 'calls'), { callerId: user.uid, callerName: user.displayName, callerAvatar: user.photoURL, receiverId: activeChat.otherUser.uid, receiverAvatar: activeChat.otherUser.photoURL, type: t, status: 'calling', timestamp: serverTimestamp() }); setActiveCall({ id: ref.id, callerId: user.uid, callerName: user.displayName, callerAvatar: user.photoURL, type: t, status: 'calling', receiverAvatar: activeChat.otherUser.photoURL }); };
  const handleDelete = async() => { if(confirm("Clear chat?")) { await deleteDoc(doc(db, 'conversations', activeChat.id)); setActiveChat(null); setIsMobileChatOpen(false); setShowDetails(false); } };
  const handleBlock = async() => { if(confirm("Block?")) { await updateDoc(doc(db, 'users', user.uid), { blockedUsers: arrayUnion(activeChat.otherUser.uid) }); } };
  const handleUnblock = async() => { await updateDoc(doc(db, 'users', user.uid), { blockedUsers: arrayRemove(activeChat.otherUser.uid) }); };

  return (
    <div className="fixed inset-0 md:static md:h-[calc(100vh-40px)] w-full max-w-[1600px] mx-auto flex gap-6 bg-[#f0f4f8] md:bg-transparent z-[50]">
      
      {/* LIST VIEW */}
      <div className={`${isMobileChatOpen ? 'hidden' : 'flex'} w-full md:w-[350px] flex-col h-full md:glass-panel md:rounded-[30px] bg-white/80 overflow-hidden border border-white/50 shadow-sm`}>
         <div className="p-6 border-b border-gray-100 bg-white/50 backdrop-blur-md"><h2 className="text-2xl font-black text-dark">Messages</h2></div>
         <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {conversations.map(c => (
                <div key={c.id} onClick={() => { setActiveChat(c); setIsMobileChatOpen(true); }} className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all ${activeChat?.id === c.id ? 'bg-white shadow-md border-l-4 border-primary' : 'hover:bg-white/50'}`}>
                    <img src={!c.isGroup ? c.otherUser?.photoURL : "https://via.placeholder.com/50"} className="w-12 h-12 rounded-full object-cover shadow-sm" />
                    <div className="flex-1 min-w-0"><div className="flex justify-between"><h4 className="font-bold text-dark truncate text-sm">{c.isGroup ? c.groupName : c.otherUser?.displayName}</h4></div><p className={`text-xs truncate ${c.unreadCounts?.[user?.uid] ? 'font-bold text-dark' : 'text-gray-500'}`}>{c.lastMessage}</p></div>
                    {c.unreadCounts?.[user?.uid] > 0 && <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center text-white text-[10px] font-bold">{c.unreadCounts[user.uid]}</div>}
                </div>
            ))}
         </div>
      </div>

      {/* CHAT VIEW */}
      <div className={`${!isMobileChatOpen ? 'hidden' : 'flex'} fixed inset-0 md:static z-[60] md:z-auto flex-col flex-1 h-full bg-[#f0f4f8] md:glass-panel md:rounded-[30px] overflow-hidden shadow-xl md:border border-white/50`}>
         {activeChat ? (
             <>
                {/* Header */}
                <div className="p-3 md:p-4 border-b border-white/50 bg-white/80 backdrop-blur-xl flex justify-between items-center shadow-sm z-20">
                    <div className="flex items-center gap-3">
                        <button onClick={() => { setIsMobileChatOpen(false); toggleNav(true); setActiveChat(null); }} className="md:hidden w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm text-dark"><i className="fas fa-arrow-left"></i></button>
                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setShowDetails(true)}><img src={!activeChat.isGroup ? activeChat.otherUser?.photoURL : "https://via.placeholder.com/50"} className="w-10 h-10 rounded-full object-cover border border-white shadow-sm" /><div><h3 className="font-bold text-dark text-sm md:text-base">{activeChat.isGroup ? activeChat.groupName : activeChat.otherUser?.displayName}</h3><p className="text-[10px] font-bold text-green-600 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> Online</p></div></div>
                    </div>
                    <div className="flex gap-2"><button onClick={() => startCall('audio')} className="w-9 h-9 rounded-xl bg-gray-50 hover:bg-primary hover:text-white transition-colors"><i className="fas fa-phone-alt text-sm"></i></button><button onClick={() => startCall('video')} className="w-9 h-9 rounded-xl bg-gray-50 hover:bg-primary hover:text-white transition-colors"><i className="fas fa-video text-sm"></i></button><button onClick={() => setShowDetails(true)} className="w-9 h-9 rounded-xl bg-gray-50 hover:bg-dark hover:text-white transition-colors"><i className="fas fa-info text-sm"></i></button></div>
                </div>

                {/* Messages Area - INCREASED PADDING TO pb-36 */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-36 md:pb-4 bg-[#f0f4f8]/50">
                    {messages.map(msg => (<div key={msg.id} className={`flex ${msg.senderId === user.uid ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${msg.senderId === user.uid ? 'bg-primary text-white rounded-br-none' : 'bg-white text-dark border border-gray-100 rounded-bl-none'}`}>{msg.text}</div></div>))}
                    <div ref={scrollRef} />
                </div>

                {/* Input Area - Higher default position */}
                <div className={`p-3 bg-white/95 backdrop-blur-xl border-t border-white/50 z-30 w-full transition-all duration-300 ${isDesktop ? 'absolute bottom-0' : (inputFocused ? 'fixed bottom-0' : 'fixed bottom-[80px]')}`}>
                    <div className="flex gap-2 items-center bg-gray-50 border border-gray-200 rounded-[20px] p-1.5 shadow-inner">
                        <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)} onFocus={() => { setInputFocused(true); if(!isDesktop) toggleNav(false); }} onBlur={() => { setInputFocused(false); if(!isDesktop) setTimeout(() => toggleNav(true), 100); }} placeholder="Message..." rows="1" className="flex-1 bg-transparent border-none outline-none py-2.5 px-3 text-dark text-sm font-medium resize-none max-h-32" />
                        <button onClick={sendMessage} disabled={!newMessage.trim()} className="w-9 h-9 bg-dark text-white rounded-full flex items-center justify-center disabled:opacity-50 hover:bg-primary transition-colors"><i className="fas fa-paper-plane text-xs"></i></button>
                    </div>
                </div>

                {showDetails && <ChatDetails chat={activeChat} messages={messages} onClose={() => setShowDetails(false)} onDelete={handleDelete} onBlock={handleBlock} onUnblock={handleUnblock} onMute={handleMute} isMuted={profile?.mutedChats?.includes(activeChat.id)} isBlocked={profile?.blockedUsers?.includes(activeChat.otherUser?.uid)} navigate={navigate} />}
             </>
         ) : <div className="hidden md:flex flex-1 flex-col items-center justify-center text-gray-400 bg-gray-50/50"><div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4"><i className="fas fa-paper-plane text-3xl text-gray-300"></i></div><p>Select a conversation to start chatting</p></div>}
      </div>
      {activeCall && <CallOverlay callData={activeCall} currentUser={user} onClose={() => setActiveCall(null)} onMinimize={() => {}} />}
    </div>
  );
};
export default Messages;