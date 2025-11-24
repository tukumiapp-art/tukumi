import React, { useState, useEffect, useRef } from 'react';
import { db, auth, storage } from '../api/firebase';
import { 
  collection, query, where, orderBy, onSnapshot, 
  addDoc, serverTimestamp, doc, updateDoc, increment, 
  getDocs, setDoc, limit, arrayUnion 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import { useLocation, useNavigate } from 'react-router-dom';

// --- COMPONENTS ---

// 1. Avatar
const Avatar = ({ src, name, size = "md", className = "", isGroup = false }) => {
  const initials = name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
  const sizeClasses = { sm: "w-8 h-8 text-xs", md: "w-12 h-12 text-sm", lg: "w-16 h-16 text-lg", xl: "w-32 h-32 text-4xl" };
  
  return (
    <div className={`relative flex-shrink-0 ${className}`}>
        {src ? (
            <img src={src} className={`${sizeClasses[size]} rounded-[1.5rem] object-cover border-2 border-white shadow-sm`} alt={name} />
        ) : (
            <div className={`${sizeClasses[size]} rounded-[1.5rem] bg-gradient-to-br ${isGroup ? 'from-purple-500 to-indigo-600' : 'from-primary to-primary-light'} text-white flex items-center justify-center font-black shadow-inner`}>
                {isGroup ? <i className="fas fa-users"></i> : initials}
            </div>
        )}
    </div>
  );
};

// 2. Create Entourage (Group) Modal
const CreateEntourageModal = ({ onClose, onCreate, currentUserId }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState([]);
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [groupName, setGroupName] = useState('');

    useEffect(() => {
        if (searchTerm.length < 2) return;
        const fetchUsers = async () => {
            const q = query(collection(db, 'users'), where('displayName', '>=', searchTerm), limit(5));
            const snap = await getDocs(q);
            setResults(snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.uid !== currentUserId));
        };
        const timer = setTimeout(fetchUsers, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const handleCreate = () => {
        if (!groupName || selectedUsers.length === 0) return;
        onCreate(groupName, selectedUsers);
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in">
            <div className="bg-white w-full max-w-md rounded-[30px] p-6 shadow-2xl">
                <h3 className="text-2xl font-black text-dark mb-1">Form an Entourage</h3>
                <p className="text-gray-500 text-sm mb-6">Create a private circle.</p>
                
                <input 
                    className="w-full bg-gray-50 p-4 rounded-xl font-bold mb-4 border border-transparent focus:border-primary outline-none" 
                    placeholder="Entourage Name (e.g. The Elites)"
                    value={groupName}
                    onChange={e => setGroupName(e.target.value)}
                />

                <div className="mb-4">
                    <input 
                        className="w-full bg-gray-50 p-3 rounded-xl text-sm mb-2" 
                        placeholder="Search people to add..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2 mb-2">
                        {selectedUsers.map(u => (
                            <span key={u.uid} className="bg-primary/10 text-primary text-xs font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                                {u.displayName} <button onClick={() => setSelectedUsers(selectedUsers.filter(s => s.uid !== u.uid))}><i className="fas fa-times"></i></button>
                            </span>
                        ))}
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                        {results.map(u => (
                            <div key={u.uid} onClick={() => { if(!selectedUsers.find(s=>s.uid===u.uid)) setSelectedUsers([...selectedUsers, u]); setSearchTerm(''); setResults([]); }} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                                <Avatar src={u.photoURL} name={u.displayName} size="sm" />
                                <span className="text-sm font-bold text-dark">{u.displayName}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50">Cancel</button>
                    <button onClick={handleCreate} disabled={!groupName || selectedUsers.length === 0} className="flex-1 bg-dark text-white py-3 rounded-xl font-bold hover:bg-primary disabled:opacity-50 transition-colors">Create</button>
                </div>
            </div>
        </div>
    );
};

// 3. Chat Details Sidebar (The "Info" Panel)
const ChatDetails = ({ chat, onClose, media, onBlock, onMute, onSearchClick }) => (
    <div className="absolute inset-y-0 right-0 w-full md:w-80 bg-white shadow-2xl z-[50] flex flex-col animate-slide-in border-l border-gray-100">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#F8FAFD]">
            <h3 className="font-black text-lg text-dark">Details</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white text-gray-400 hover:text-dark flex items-center justify-center shadow-sm transition-all"><i className="fas fa-times"></i></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Profile Info */}
            <div className="text-center">
                <div className="flex justify-center mb-4">
                    <Avatar src={!chat.isGroup ? chat.otherUser?.photoURL : null} name={chat.isGroup ? chat.groupName : chat.otherUser?.displayName} size="xl" isGroup={chat.isGroup} />
                </div>
                <h2 className="text-2xl font-black text-dark">{chat.isGroup ? chat.groupName : chat.otherUser?.displayName}</h2>
                <p className="text-gray-500 font-bold text-sm mt-1">{chat.isGroup ? `${chat.users.length} Members` : 'Aristocrat'}</p>
            </div>

            {/* Actions */}
            <div className="flex justify-center gap-4">
                <button onClick={onMute} className="flex flex-col items-center gap-2 text-gray-500 hover:text-dark transition-colors group">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-xl group-hover:bg-gray-200"><i className="fas fa-bell-slash"></i></div>
                    <span className="text-xs font-bold">Mute</span>
                </button>
                <button onClick={onSearchClick} className="flex flex-col items-center gap-2 text-gray-500 hover:text-dark transition-colors group">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-xl group-hover:bg-gray-200"><i className="fas fa-search"></i></div>
                    <span className="text-xs font-bold">Search</span>
                </button>
                <button onClick={onBlock} className="flex flex-col items-center gap-2 text-red-500 hover:text-red-700 transition-colors group">
                    <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-xl group-hover:bg-red-100"><i className="fas fa-ban"></i></div>
                    <span className="text-xs font-bold">Block</span>
                </button>
            </div>

            {/* Shared Media */}
            <div>
                <h4 className="font-bold text-dark mb-4 flex justify-between items-center">Shared Media <span className="text-gray-400 text-xs">{media.length}</span></h4>
                <div className="grid grid-cols-3 gap-2">
                    {media.slice(0, 6).map(m => (
                        <div key={m.id} className="aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                            {m.mediaType === 'video' ? <video src={m.mediaURL} className="w-full h-full object-cover" /> : <img src={m.mediaURL} className="w-full h-full object-cover" />}
                        </div>
                    ))}
                    {media.length === 0 && <p className="col-span-3 text-center text-xs text-gray-400 py-4">No media shared yet.</p>}
                </div>
            </div>
        </div>
    </div>
);

// 4. Voice Recorder Component
const VoiceRecorder = ({ onSend, onCancel }) => {
    const [recording, setRecording] = useState(false);
    const [timer, setTimer] = useState(0);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const timerIntervalRef = useRef(null);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];
            
            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data);
            };

            mediaRecorderRef.current.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], "voice_note.webm", { type: 'audio/webm' });
                onSend(audioFile);
                stream.getTracks().forEach(t => t.stop());
            };

            mediaRecorderRef.current.start();
            setRecording(true);
            setTimer(0);
            timerIntervalRef.current = setInterval(() => setTimer(t => t + 1), 1000);
        } catch (e) {
            alert("Microphone access denied.");
            onCancel();
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && recording) {
            mediaRecorderRef.current.stop();
            clearInterval(timerIntervalRef.current);
            setRecording(false);
        }
    };

    const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

    return (
        <div className="flex items-center gap-4 w-full animate-fade-in bg-red-50 p-2 rounded-[20px]">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse ml-2"></div>
            <span className="text-red-500 font-bold font-mono text-sm">{recording ? formatTime(timer) : 'Ready'}</span>
            {timer > 50 && <span className="text-[10px] text-red-600 font-bold animate-bounce">Limit: 60s</span>}
            <div className="flex-1"></div>
            {!recording ? (
                <button onClick={startRecording} className="bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-bold">Record</button>
            ) : (
                <button onClick={stopRecording} className="bg-white border border-red-200 text-red-500 px-4 py-2 rounded-xl text-xs font-bold">Send</button>
            )}
            <button onClick={() => { stopRecording(); onCancel(); }} className="w-8 h-8 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center"><i className="fas fa-times"></i></button>
        </div>
    );
};

// --- MAIN PAGE ---

const Messages = () => {
  const location = useLocation();
  const [user, setUser] = useState(null);
  
  // Data
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  
  // UI State
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showEntourageModal, setShowEntourageModal] = useState(false);
  const [activeCall, setActiveCall] = useState(null); 
  const [uploading, setUploading] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);

  // Refs
  const scrollRef = useRef();
  const localVideoRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);

  const isBusinessMode = location.state?.asBusiness;
  const currentIdentityId = isBusinessMode && location.state?.businessId ? location.state.businessId : user?.uid;

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => { setUser(u); });
    if (currentIdentityId) {
        const q = query(collection(db, 'conversations'), where('participants', 'array-contains', currentIdentityId), orderBy('updatedAt', 'desc'));
        const unsubConvos = onSnapshot(q, (snap) => {
            setConversations(snap.docs.map(d => {
                const data = d.data();
                const otherUser = !data.isGroup ? data.users.find(u => u.uid !== currentIdentityId) : null;
                return { id: d.id, ...data, otherUser };
            }));
        });
        return () => { unsubAuth(); unsubConvos(); };
    }
    return () => unsubAuth();
  }, [currentIdentityId]);

  useEffect(() => {
      if (user && location.state?.startChatWith) {
          startConversation(location.state.startChatWith);
          window.history.replaceState({}, document.title);
      }
  }, [user, location.state]);

  useEffect(() => {
      if (!activeChat) return;
      const q = query(collection(db, `conversations/${activeChat.id}/messages`), orderBy('timestamp', 'asc'));
      const unsubMsgs = onSnapshot(q, (snap) => {
          setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      });
      return () => unsubMsgs();
  }, [activeChat]);

  // --- ACTIONS ---

  const startConversation = async (targetUser) => {
      const chatId = [user.uid, targetUser.uid].sort().join('_');
      const existing = conversations.find(c => c.id === chatId);
      if (existing) { setActiveChat(existing); setIsMobileChatOpen(true); return; }

      const chatData = {
          participants: [user.uid, targetUser.uid],
          users: [
              { uid: user.uid, displayName: user.displayName, photoURL: user.photoURL },
              { uid: targetUser.uid, displayName: targetUser.displayName, photoURL: targetUser.photoURL }
          ],
          updatedAt: serverTimestamp(),
          isGroup: false
      };
      await setDoc(doc(db, 'conversations', chatId), chatData, { merge: true });
      setActiveChat({ id: chatId, ...chatData, otherUser: targetUser });
      setIsMobileChatOpen(true);
  };

  const createEntourage = async (name, members) => {
      const allMembers = [...members, { uid: user.uid, displayName: user.displayName, photoURL: user.photoURL }];
      const memberIds = allMembers.map(m => m.uid);
      
      const chatRef = await addDoc(collection(db, 'conversations'), {
          groupName: name,
          isGroup: true,
          adminId: user.uid,
          participants: memberIds,
          users: allMembers,
          updatedAt: serverTimestamp(),
          lastMessage: `${user.displayName} formed the entourage.`
      });
      
      setShowEntourageModal(false);
      setActiveChat({ id: chatRef.id, isGroup: true, groupName: name, users: allMembers });
      setIsMobileChatOpen(true);
  };

  const sendMessage = async (content, type = 'text', fileObj = null) => {
      if (!activeChat) return;
      if (fileObj && fileObj.size > 5 * 1024 * 1024) return alert("File too large. Limit is 5MB.");

      let url = null;
      if (fileObj) {
          setUploading(true);
          try {
              const storageRef = ref(storage, `chat/${activeChat.id}/${Date.now()}_${fileObj.name}`);
              await uploadBytes(storageRef, fileObj);
              url = await getDownloadURL(storageRef);
          } catch (e) { console.error(e); return; } finally { setUploading(false); }
      }

      await addDoc(collection(db, `conversations/${activeChat.id}/messages`), {
          text: type === 'text' ? content : '',
          mediaURL: url,
          mediaType: type,
          senderId: currentIdentityId,
          senderName: user.displayName,
          timestamp: serverTimestamp()
      });

      await updateDoc(doc(db, 'conversations', activeChat.id), {
          lastMessage: type === 'text' ? content : `Sent a ${type}`,
          lastMessageSenderId: currentIdentityId,
          updatedAt: serverTimestamp()
      });
      
      setNewMessage('');
      setShowAttachMenu(false);
      setShowVoiceRecorder(false);
  };

  const handleFileSelect = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const type = file.type.startsWith('image') ? 'image' : file.type.startsWith('video') ? 'video' : 'file';
      sendMessage(null, type, file);
  };

  // --- CALLING ---
  const initiateCall = async (type) => {
      if (!activeChat) return;
      setActiveCall({ type, status: 'calling' });
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
          setLocalStream(stream);
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;
          
          // SIGNAL FIREBASE (Triggers GlobalListeners on other side)
          const receiverId = !activeChat.isGroup ? activeChat.otherUser.uid : activeChat.users.find(u=>u.uid!==currentIdentityId).uid; // For groups, just calling first other person for now (simple)
          
          await addDoc(collection(db, 'calls'), {
              callerId: user.uid,
              callerName: user.displayName,
              callerAvatar: user.photoURL,
              receiverId: receiverId,
              conversationId: activeChat.id,
              type: type,
              status: 'ringing',
              timestamp: serverTimestamp()
          });

      } catch (err) {
          alert("Permission denied for Call.");
          endCall();
      }
  };

  const endCall = () => {
      if (localStream) localStream.getTracks().forEach(t => t.stop());
      setLocalStream(null);
      setActiveCall(null);
  };

  // --- SIDEBAR ACTIONS ---
  const handleBlock = async () => {
      if(confirm("Block this user?")) {
          await updateDoc(doc(db, 'users', user.uid), { blockedUsers: arrayUnion(activeChat.otherUser.uid) });
          setShowDetails(false);
          alert("User blocked.");
      }
  };

  const handleMute = async () => {
      await updateDoc(doc(db, 'users', user.uid), { mutedChats: arrayUnion(activeChat.id) });
      alert("Notifications muted for this chat.");
  };

  // Filter Messages for Search
  const filteredMessages = messages.filter(m => !isSearchActive || (m.text && m.text.toLowerCase().includes(chatSearchQuery.toLowerCase())));

  return (
    <div className="fixed inset-0 md:static md:h-[calc(100vh-40px)] w-full max-w-[1600px] mx-auto flex gap-6 bg-[#f0f4f8] md:bg-transparent z-[50]">
      
      {/* === LEFT: LIST === */}
      <div className={`${isMobileChatOpen ? 'hidden' : 'flex'} w-full md:w-[400px] flex-col h-full md:glass-panel md:rounded-[35px] overflow-hidden bg-white md:bg-white/80 shrink-0`}>
        <div className="p-6 pt-12 md:pt-8 border-b border-gray-100 bg-white/50 backdrop-blur-md sticky top-0 z-10">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-black text-dark tracking-tight">Messages</h2>
                <button onClick={() => setShowEntourageModal(true)} className="w-12 h-12 rounded-full bg-dark text-white flex items-center justify-center hover:bg-primary shadow-lg transition-all hover:rotate-90">
                    <i className="fas fa-plus text-lg"></i>
                </button>
            </div>
            <div className="relative group">
                <i className="fas fa-search absolute left-4 top-3.5 text-gray-400"></i>
                <input type="text" placeholder="Search conversations..." className="w-full bg-gray-50 border-none rounded-2xl pl-12 pr-4 py-3 text-sm font-bold text-dark focus:ring-2 focus:ring-primary/20 transition-all" />
            </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 pb-20 md:pb-2">
            {conversations.map(chat => {
                const unread = chat.unreadCounts?.[currentIdentityId] || 0;
                const name = chat.isGroup ? chat.groupName : chat.otherUser?.displayName;
                return (
                    <div key={chat.id} onClick={() => { setActiveChat(chat); setIsMobileChatOpen(true); }} className={`flex items-center gap-4 p-4 rounded-[20px] cursor-pointer transition-all ${activeChat?.id === chat.id ? 'bg-white shadow-lg scale-[1.02]' : 'hover:bg-white/60'}`}>
                        <Avatar src={!chat.isGroup ? chat.otherUser?.photoURL : null} name={name} size="md" isGroup={chat.isGroup} />
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-1">
                                <h4 className={`text-base truncate ${unread ? 'font-black' : 'font-bold text-gray-700'}`}>{name}</h4>
                                <span className="text-[10px] text-gray-400 font-bold">{chat.updatedAt?.seconds ? new Date(chat.updatedAt.seconds*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : ''}</span>
                            </div>
                            <p className={`text-sm truncate ${unread ? 'font-bold text-dark' : 'text-gray-500'}`}>{chat.lastMessage}</p>
                        </div>
                    </div>
                );
            })}
        </div>
      </div>

      {/* === RIGHT: CHAT AREA === */}
      <div className={`${!isMobileChatOpen ? 'hidden' : 'flex'} fixed inset-0 md:static z-[60] md:z-auto flex-col flex-1 h-full bg-[#f0f4f8] md:glass-panel md:rounded-[35px] overflow-hidden shadow-2xl`}>
        {activeChat ? (
            <>
                {/* HEADER */}
                <div className="p-4 pt-safe-top md:p-6 border-b border-white/50 bg-white/80 backdrop-blur-xl flex justify-between items-center shadow-sm z-20">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setIsMobileChatOpen(false)} className="md:hidden w-10 h-10 flex items-center justify-center bg-white rounded-full shadow-sm text-dark"><i className="fas fa-arrow-left"></i></button>
                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setShowDetails(true)}>
                            <Avatar src={!activeChat.isGroup ? activeChat.otherUser?.photoURL : null} name={activeChat.isGroup ? activeChat.groupName : activeChat.otherUser?.displayName} isGroup={activeChat.isGroup} />
                            <div>
                                <h3 className="font-black text-dark text-lg leading-tight">{activeChat.isGroup ? activeChat.groupName : activeChat.otherUser?.displayName}</h3>
                                <p className="text-xs font-bold text-primary">{activeChat.isGroup ? `${activeChat.users.length} Members` : 'Active Now'}</p>
                            </div>
                        </div>
                    </div>
                    
                    {isSearchActive ? (
                        <div className="flex items-center gap-2 flex-1 justify-end animate-slide-in">
                            <input autoFocus className="bg-gray-50 rounded-full px-4 py-2 text-sm" placeholder="Search chat..." value={chatSearchQuery} onChange={e => setChatSearchQuery(e.target.value)} />
                            <button onClick={() => { setIsSearchActive(false); setChatSearchQuery(''); }} className="text-gray-500"><i className="fas fa-times"></i></button>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <button onClick={() => initiateCall('audio')} className="w-12 h-12 rounded-2xl bg-gray-50 text-dark hover:bg-primary hover:text-white transition-all flex items-center justify-center shadow-sm"><i className="fas fa-phone-alt"></i></button>
                            <button onClick={() => initiateCall('video')} className="w-12 h-12 rounded-2xl bg-gray-50 text-dark hover:bg-primary hover:text-white transition-all flex items-center justify-center shadow-sm"><i className="fas fa-video"></i></button>
                            <button onClick={() => setShowDetails(true)} className="w-12 h-12 rounded-2xl bg-gray-50 text-dark hover:bg-dark hover:text-white transition-all flex items-center justify-center shadow-sm"><i className="fas fa-info"></i></button>
                        </div>
                    )}
                </div>

                {/* MESSAGES LIST */}
                <div className={`flex-1 overflow-y-auto p-4 md:p-8 space-y-6 bg-[#f0f4f8] md:bg-transparent relative transition-all ${inputFocused ? 'pb-4' : 'pb-24 md:pb-4'}`}>
                    {filteredMessages.map((msg, i) => {
                        const isMe = msg.senderId === currentIdentityId;
                        return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                                <div className={`max-w-[75%] px-5 py-3.5 rounded-[20px] text-[15px] shadow-sm backdrop-blur-sm break-words ${isMe ? 'bg-gradient-to-br from-primary to-primary-dark text-white rounded-br-none' : 'bg-white text-dark border border-gray-100 rounded-bl-none'}`}>
                                    {msg.mediaType === 'audio' && <audio src={msg.mediaURL} controls className="max-w-[200px] h-8" />}
                                    {msg.mediaType === 'image' && <img src={msg.mediaURL} className="rounded-lg mb-2 max-h-60 object-cover" />}
                                    {msg.text && <p>{msg.text}</p>}
                                </div>
                            </div>
                        );
                    })}
                    <div ref={scrollRef} className="h-4"></div>
                </div>

                {/* INPUT AREA */}
                <div className={`p-3 md:p-4 bg-white/95 backdrop-blur-xl border-t border-white/50 pb-safe-bottom relative z-30 transition-all duration-300 ${inputFocused ? 'mb-0' : 'mb-[65px] md:mb-0'}`}>
                    {showVoiceRecorder ? (
                        <VoiceRecorder onSend={(file) => sendMessage(null, 'audio', file)} onCancel={() => setShowVoiceRecorder(false)} />
                    ) : (
                        <div className="flex gap-2 items-end bg-gray-50 border border-gray-200 rounded-[24px] p-2 shadow-inner relative">
                            <div className="relative">
                                <button onClick={() => setShowAttachMenu(!showAttachMenu)} className={`w-10 h-10 rounded-full transition-all flex items-center justify-center ${showAttachMenu ? 'bg-dark text-white rotate-45' : 'text-gray-400 hover:bg-white'}`}><i className="fas fa-plus text-xl"></i></button>
                                {showAttachMenu && (
                                    <div className="absolute bottom-14 left-0 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 flex flex-col gap-2 animate-scale-in min-w-[140px] z-50">
                                        <button onClick={() => setShowVoiceRecorder(true)} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-xl text-sm font-bold text-dark"><i className="fas fa-microphone text-primary w-5"></i> Voice Note</button>
                                        <label className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-xl text-sm font-bold text-dark cursor-pointer"><i className="fas fa-image text-purple-500 w-5"></i> Media <input type="file" className="hidden" accept="image/*,video/*" onChange={handleFileSelect} /></label>
                                        <label className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-xl text-sm font-bold text-dark cursor-pointer"><i className="fas fa-paperclip text-blue-500 w-5"></i> File <input type="file" className="hidden" onChange={handleFileSelect} /></label>
                                    </div>
                                )}
                            </div>
                            <textarea value={newMessage} onFocus={() => setInputFocused(true)} onBlur={() => setTimeout(() => setInputFocused(false), 200)} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(newMessage); } }} placeholder="Type a message..." rows="1" className="flex-1 bg-transparent border-none outline-none py-3 text-dark font-medium resize-none max-h-32" />
                            <button disabled={!newMessage.trim() && !uploading} onClick={() => sendMessage(newMessage)} className="w-12 h-10 bg-dark text-white rounded-[18px] shadow-lg hover:bg-primary transition-all disabled:opacity-50 flex items-center justify-center">{uploading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>}</button>
                        </div>
                    )}
                </div>

                {/* DETAILS PANEL */}
                {showDetails && <ChatDetails chat={activeChat} media={messages.filter(m=>['image','video'].includes(m.mediaType))} onClose={() => setShowDetails(false)} onBlock={handleBlock} onMute={handleMute} onSearchClick={() => { setShowDetails(false); setIsSearchActive(true); }} />}
            </>
        ) : (
            <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center bg-white/50">
                <div className="w-24 h-24 bg-gradient-to-tr from-primary/20 to-gold/20 rounded-full flex items-center justify-center mb-6 animate-pulse"><i className="fas fa-comments text-4xl text-primary"></i></div>
                <h3 className="text-2xl font-black text-dark mb-2">Welcome to Messages</h3>
                <p className="text-gray-500">Select a chat or start a new Entourage to connect.</p>
                <button onClick={() => setShowEntourageModal(true)} className="mt-8 bg-dark text-white px-8 py-3 rounded-xl font-bold hover:bg-primary transition-all shadow-lg">Start New Chat</button>
            </div>
        )}
      </div>

      {/* CINEMATIC CALL OVERLAY */}
      {activeCall && (
          <div className="fixed inset-0 z-[200] bg-[#0F172A] flex flex-col animate-fade-in">
              <div className="absolute inset-0 opacity-30 bg-cover bg-center" style={{ backgroundImage: `url(${activeChat.isGroup ? 'https://via.placeholder.com/800' : activeChat.otherUser?.photoURL || "https://images.unsplash.com/photo-1534528741775-53994a69daeb"})` }}></div>
              <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80"></div>
              <div className="relative flex-1 flex flex-col items-center justify-center p-10">
                  <div className="relative mb-8">
                      <div className="absolute inset-0 bg-primary/30 rounded-full animate-ping"></div>
                      <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping animation-delay-200"></div>
                      <div className="relative z-10">
                          <Avatar src={!activeChat.isGroup ? activeChat.otherUser?.photoURL : null} name={activeChat.isGroup ? activeChat.groupName : activeChat.otherUser?.displayName} size="xl" className="shadow-2xl shadow-primary/50 border-4 border-white/10" isGroup={activeChat.isGroup} />
                      </div>
                  </div>
                  <h2 className="text-4xl md:text-5xl font-black text-white mb-2 text-center tracking-tight">{activeChat.isGroup ? activeChat.groupName : activeChat.otherUser?.displayName}</h2>
                  <p className="text-primary-light font-bold text-lg uppercase tracking-widest animate-pulse">{activeCall.status}...</p>
                  {activeCall.type === 'video' && <div className="mt-8 w-48 h-72 bg-black rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20"><video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" /></div>}
              </div>
              <div className="relative pb-12 pt-8 flex justify-center gap-8">
                  <button className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md text-white hover:bg-white hover:text-dark transition-all flex items-center justify-center"><i className="fas fa-microphone-slash text-xl"></i></button>
                  <button className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md text-white hover:bg-white hover:text-dark transition-all flex items-center justify-center"><i className="fas fa-video-slash text-xl"></i></button>
                  <button onClick={endCall} className="w-20 h-20 rounded-full bg-red-500 text-white shadow-xl shadow-red-500/40 hover:scale-110 transition-transform flex items-center justify-center"><i className="fas fa-phone-slash text-3xl"></i></button>
              </div>
          </div>
      )}

      {showEntourageModal && <CreateEntourageModal onClose={() => setShowEntourageModal(false)} onCreate={createEntourage} currentUserId={user?.uid} />}
    </div>
  );
};

export default Messages;