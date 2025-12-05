import React, { useState, useEffect, useRef } from 'react';
import { db, auth, storage } from '../api/firebase';
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, serverTimestamp, doc, updateDoc, increment,
  getDocs, getDoc, deleteDoc, arrayUnion, arrayRemove, writeBatch, setDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCall } from '../context/CallContext';

const ShinobiMessenger = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { startCall, setViewingChatId } = useCall(); 

  // --- STATE ---
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  
  // Interaction State
  const [editingMessage, setEditingMessage] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  
  // UI State
  const [currentSidebar, setCurrentSidebar] = useState('Shinobi'); 
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showSidebarMenu, setShowSidebarMenu] = useState(false); 
  const [sidebarSearch, setSidebarSearch] = useState(''); 
  const [chatSearch, setChatSearch] = useState(''); 
  const [isSearchingChat, setIsSearchingChat] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');

  // Voice Recording
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const audioChunksRef = useRef([]);
  const recordingStartTimeRef = useRef(null);

  // Modals & Context
  const [contextMenu, setContextMenu] = useState(null); // Chat List Context
  const [messageMenu, setMessageMenu] = useState(null); // Message Context
  
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showCreateGuildModal, setShowCreateGuildModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showAddToGuildSelector, setShowAddToGuildSelector] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  
  const [userToAddFromContext, setUserToAddFromContext] = useState(null);
  const [fullScreenMedia, setFullScreenMedia] = useState(null);
  
  const [allUsers, setAllUsers] = useState([]);
  const scrollRef = useRef();
  const mediaSectionRef = useRef(); 
  const typingTimeoutRef = useRef(null);
  
  // --- HELPER: CLEAN USER ---
  const cleanUser = (u) => ({
      uid: u.uid,
      displayName: u.displayName || 'User',
      photoURL: u.photoURL || null,
      email: u.email || null
  });

  // --- INIT ---
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => { 
        if (!u) navigate('/login'); 
        else {
            const unsubDb = onSnapshot(doc(db, 'users', u.uid), (snap) => {
                if(snap.exists()) setUser({ uid: u.uid, ...snap.data() });
                else setUser(cleanUser(u));
            });
            return () => unsubDb();
        }
    });
    return () => unsubAuth();
  }, [navigate]);

  // --- MARK MESSAGES AS SEEN ---
  useEffect(() => {
      if (!activeChat || !user || messages.length === 0) return;

      const unseenMessages = messages.filter(m => 
          m.senderId !== user.uid && 
          (!m.seenBy || !m.seenBy.includes(user.uid))
      );

      if (unseenMessages.length > 0) {
          const batch = writeBatch(db);
          unseenMessages.forEach(msg => {
              const ref = doc(db, `conversations/${activeChat.id}/messages`, msg.id);
              batch.update(ref, { seenBy: arrayUnion(user.uid) });
          });
          const convoRef = doc(db, 'conversations', activeChat.id);
          batch.update(convoRef, { [`unreadCounts.${user.uid}`]: 0 });
          batch.commit().catch(console.error);
      }
  }, [messages, activeChat, user]);

  // --- TYPING INDICATOR LISTENER ---
  useEffect(() => {
      if (!activeChat?.id) return;
      const unsub = onSnapshot(doc(db, 'conversations', activeChat.id), (docSnap) => {
          if (docSnap.exists()) {
              const data = docSnap.data();
              const typingMap = data.typing || {};
              const typers = Object.keys(typingMap).filter(uid => uid !== user?.uid && typingMap[uid]);
              const typerNames = typers.map(uid => {
                  const u = data.users?.find(user => user.uid === uid);
                  return u ? u.displayName.split(' ')[0] : 'Someone';
              });
              setTypingUsers(typerNames);
          }
      });
      return () => unsub();
  }, [activeChat, user]);

  // --- ACTIONS ---
  const openChat = (chatData) => {
      setActiveChat(chatData);
      setIsMobileChatOpen(true);
      setShowDetails(false);
      setReplyingTo(null);
      setNewMessage('');
      setChatSearch('');
      setIsSearchingChat(false);
      window.dispatchEvent(new CustomEvent('toggle-nav', { detail: { visible: false } }));
  };

  const handleUserClick = async (otherUserId) => {
    if (otherUserId === user?.uid) { navigate('/profile'); return; }
    
    const existing = conversations.find(c => !c.isGroup && c.participants.includes(otherUserId));
    if (existing) { 
        openChat(existing);
        return; 
    }

    try {
        const q = query(collection(db, 'conversations'), where('participants', 'array-contains', user.uid));
        const snapshot = await getDocs(q);
        const found = snapshot.docs.find(doc => {
            const data = doc.data();
            return !data.isGroup && data.participants.includes(otherUserId);
        });

        if (found) {
             const data = found.data();
             let otherUser = null;
             if (data.users) otherUser = data.users.find(u => u.uid === otherUserId);
             openChat({ id: found.id, ...data, otherUser });
        } else {
             const uDoc = await getDoc(doc(db, 'users', otherUserId));
             const otherData = uDoc.exists() ? uDoc.data() : { displayName: 'User', uid: otherUserId };
             
             const newRef = await addDoc(collection(db, 'conversations'), {
                 participants: [user.uid, otherUserId],
                 users: [cleanUser(user), cleanUser(otherData)],
                 isGroup: false, 
                 updatedAt: serverTimestamp(),
                 unreadCounts: { [user.uid]: 0, [otherUserId]: 0 }
             });
             openChat({ 
                 id: newRef.id, 
                 participants: [user.uid, otherUserId], 
                 users: [cleanUser(user), cleanUser(otherData)], 
                 isGroup: false, 
                 otherUser: { uid: otherUserId, ...otherData } 
             });
        }
    } catch(e) { console.error("Chat Error", e); }
  };

  // --- NAVIGATION & GLOBAL LISTENERS ---
  useEffect(() => {
    if (user) {
        if (location.state?.startChatWith?.uid) {
            handleUserClick(location.state.startChatWith.uid);
            window.history.replaceState({}, document.title);
        } else if (location.state?.activeConversationId) {
            const found = conversations.find(c => c.id === location.state.activeConversationId);
            if(found) { openChat(found); }
            window.history.replaceState({}, document.title);
        }
    }
  }, [user, location.state, conversations.length]); 

  useEffect(() => {
    if (activeChat) {
        setViewingChatId(activeChat.id);
        const interval = setInterval(() => {
             window.dispatchEvent(new CustomEvent('toggle-nav', { detail: { visible: false } }));
        }, 500);
        return () => {
            clearInterval(interval);
            setViewingChatId(null);
            window.dispatchEvent(new CustomEvent('toggle-nav', { detail: { visible: true } }));
        };
    } else {
        setViewingChatId(null);
        window.dispatchEvent(new CustomEvent('toggle-nav', { detail: { visible: true } }));
    }
  }, [activeChat]);

  // --- DATA FETCHING ---
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, 'conversations'), where('participants', 'array-contains', user.uid), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
        setConversations(snap.docs.map((d) => {
          const data = d.data();
          let otherUser = null;
          if (!data.isGroup) {
            const otherUserId = data.participants.find(id => id !== user.uid);
            if (data.users) otherUser = data.users.find(u => u.uid === otherUserId);
            if (!otherUser) otherUser = { uid: otherUserId, displayName: 'User', photoURL: null };
          }
          return { id: d.id, ...data, otherUser };
        }));
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!activeChat?.id) return;
    const q = query(collection(db, `conversations/${activeChat.id}/messages`), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, async (snap) => {
        const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setMessages(msgs);
        setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => unsub();
  }, [activeChat]);

  useEffect(() => {
    if(!user) return;
    const fetchUsers = async () => {
        try {
            const snap = await getDocs(collection(db, 'users'));
            setAllUsers(snap.docs.map(d => ({uid: d.id, ...d.data()})).filter(u => u.uid !== user.uid));
        } catch (e) {}
    };
    fetchUsers();
  }, [user]);

  // --- TYPING HANDLER ---
  const handleTyping = () => {
      if (!activeChat) return;
      if (!isTyping) {
          setIsTyping(true);
          updateDoc(doc(db, 'conversations', activeChat.id), { [`typing.${user.uid}`]: true }).catch(()=>{});
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
          setIsTyping(false);
          updateDoc(doc(db, 'conversations', activeChat.id), { [`typing.${user.uid}`]: false }).catch(()=>{});
      }, 2000);
  };

  // --- MESSAGE FUNCTIONS ---
  const sendMessage = async (content = '', type = 'text', fileObj = null, targetChatId = null) => {
    const chatId = targetChatId || activeChat?.id;
    if (!chatId) return;
    if (!content.trim() && !fileObj) return;

    if (editingMessage && !targetChatId) {
        try {
            await updateDoc(doc(db, `conversations/${chatId}/messages`, editingMessage.id), {
                text: content,
                isEdited: true
            });
            setEditingMessage(null);
            setNewMessage('');
        } catch (e) { alert("Update failed"); }
        return;
    }

    let mediaURL = null;
    let fileSize = null;
    let fileName = null;

    if (fileObj) {
      if (fileObj.size > 50 * 1024 * 1024) { alert("File too large! Max 50MB."); return; }
      try {
        const ext = type === 'audio' ? 'mp4' : fileObj.name.split('.').pop();
        fileName = fileObj.name;
        fileSize = (fileObj.size / 1024 / 1024).toFixed(2) + ' MB';
        const storageRef = ref(storage, `chat/${chatId}/${Date.now()}_${type}.${ext}`);
        await uploadBytes(storageRef, fileObj);
        mediaURL = await getDownloadURL(storageRef);
      } catch (e) { alert("Upload failed"); return; }
    }

    const messageData = {
      text: type === 'text' ? content : '', 
      mediaURL, 
      mediaType: type,
      fileName,
      fileSize,
      senderId: user.uid, 
      senderName: user.displayName, 
      timestamp: serverTimestamp(), 
      seenBy: [user.uid],
      replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text, sender: replyingTo.senderName } : null
    };

    try {
        await addDoc(collection(db, `conversations/${chatId}/messages`), messageData);
        
        const updateData = {
            lastMessage: type === 'text' ? content : `Sent a ${type}`, 
            lastMessageSenderId: user.uid, 
            lastSenderId: user.uid, 
            updatedAt: serverTimestamp()
        };
        
        const chatDoc = conversations.find(c => c.id === chatId) || activeChat;
        if (chatDoc) {
            chatDoc.participants.forEach(pid => {
                if (pid !== user.uid) {
                    updateData[`unreadCounts.${pid}`] = increment(1);
                }
            });
        }

        await updateDoc(doc(db, 'conversations', chatId), updateData);
        
        if (!targetChatId) {
            setNewMessage(''); 
            setShowAttachMenu(false);
            setReplyingTo(null);
        }
    } catch(e) {
        console.error("Send failed", e);
    }
  };

  const handleForwardMessage = (msg) => {
      setForwardingMessage(msg);
      setShowForwardModal(true);
      setMessageMenu(null);
  };

  const confirmForward = async (targetChat) => {
      const content = forwardingMessage.text;
      const type = forwardingMessage.mediaType || 'text';
      
      if (forwardingMessage.mediaURL) {
           const messageData = {
              text: content,
              mediaURL: forwardingMessage.mediaURL,
              mediaType: forwardingMessage.mediaType,
              fileName: forwardingMessage.fileName || null,
              fileSize: forwardingMessage.fileSize || null,
              senderId: user.uid,
              senderName: user.displayName,
              timestamp: serverTimestamp(),
              seenBy: [user.uid],
              isForwarded: true
           };
           await addDoc(collection(db, `conversations/${targetChat.id}/messages`), messageData);
           await updateDoc(doc(db, 'conversations', targetChat.id), {
                lastMessage: `Forwarded ${type}`,
                lastSenderId: user.uid,
                updatedAt: serverTimestamp(),
                [`unreadCounts.${targetChat.otherUser?.uid || 'group'}`]: increment(1) 
           });
      } else {
          await sendMessage(content, 'text', null, targetChat.id);
      }
      
      setShowForwardModal(false);
      setForwardingMessage(null);
      alert("Message forwarded!");
  };

  const handleFileSelect = (e, type) => {
    const file = e.target.files[0];
    if (file) sendMessage('', type, file);
  };

  const handleDeleteMessage = async (msgId) => {
      if(!confirm("Delete this message?")) return;
      try {
          await deleteDoc(doc(db, `conversations/${activeChat.id}/messages`, msgId));
          setMessageMenu(null);
      } catch(e) { alert("Failed to delete"); }
  };

  const startRecording = async (e) => {
    if(e) e.preventDefault();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let options = { mimeType: 'audio/webm' };
      if (MediaRecorder.isTypeSupported('audio/mp4')) { options = { mimeType: 'audio/mp4' }; }

      const recorder = new MediaRecorder(stream, options);
      setMediaRecorder(recorder);
      audioChunksRef.current = [];
      recordingStartTimeRef.current = Date.now();
      
      recorder.ondataavailable = (e) => { if(e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        if (Date.now() - recordingStartTimeRef.current < 1000) return;
        const type = options.mimeType;
        const audioBlob = new Blob(audioChunksRef.current, { type });
        sendMessage('', 'audio', new File([audioBlob], "voice_msg", { type }));
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      setIsRecording(true);
    } catch (err) { alert("Microphone access denied."); }
  };

  const stopRecording = (e) => {
    if(e) e.preventDefault();
    if (mediaRecorder && isRecording) { mediaRecorder.stop(); setIsRecording(false); }
  };

  // --- GUILD & ADMIN FEATURES ---
  const createNewGuild = async (name, selectedIds) => {
    try {
        const initialParticipants = [user.uid, ...selectedIds];
        const participantUsers = await Promise.all(initialParticipants.map(async (uid) => {
            const docRef = await getDoc(doc(db, 'users', uid));
            if (docRef.exists()) return cleanUser({ uid, ...docRef.data() });
            return { uid, displayName: 'User' };
        }));

        const guildData = {
            groupName: name,
            groupPhoto: null,
            isGroup: true,
            guildMasterId: user.uid,
            participants: initialParticipants,
            users: participantUsers,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastMessage: 'Guild created',
            unreadCounts: {}
        };
        initialParticipants.forEach(uid => guildData.unreadCounts[uid] = 0);
        const ref = await addDoc(collection(db, 'conversations'), guildData);
        setShowCreateGuildModal(false);
        openChat({ id: ref.id, ...guildData });
    } catch (e) { alert("Failed to create guild"); }
  };

  const handleGuildPhotoUpload = async (e) => {
      const file = e.target.files[0];
      if (!file || !activeChat.isGroup) return;
      try {
          const refS = ref(storage, `guild_photos/${activeChat.id}/${Date.now()}_${file.name}`);
          await uploadBytes(refS, file);
          const url = await getDownloadURL(refS);
          await updateDoc(doc(db, 'conversations', activeChat.id), { groupPhoto: url });
          setActiveChat(prev => ({ ...prev, groupPhoto: url }));
      } catch (e) { alert("Failed to upload photo"); }
  };

  const handleRenameGuild = async () => {
      if(!activeChat.isGroup || activeChat.guildMasterId !== user.uid) return;
      const newName = prompt("Enter new guild name:", activeChat.groupName);
      if(newName && newName.trim() !== "") {
          try {
              await updateDoc(doc(db, 'conversations', activeChat.id), { groupName: newName });
              setActiveChat(prev => ({ ...prev, groupName: newName }));
          } catch(e) { alert("Failed to rename."); }
      }
  };

  const handleLeaveGuild = async () => {
      if(!activeChat.isGroup) return;
      if(!confirm("Are you sure you want to leave this guild?")) return;
      try {
          const userObj = activeChat.users.find(u => u.uid === user.uid);
          await updateDoc(doc(db, 'conversations', activeChat.id), {
              participants: arrayRemove(user.uid),
              users: arrayRemove(userObj)
          });
          setActiveChat(null);
          setIsMobileChatOpen(false);
      } catch(e) { alert("Failed to leave."); }
  };

  const handleAddMembers = async (selectedIds) => {
      // Use userToAddFromContext if available (from Context Menu add) or selectedIds
      const idsToAdd = userToAddFromContext ? [userToAddFromContext] : selectedIds;
      if (!idsToAdd || idsToAdd.length === 0) return;

      const newUsers = await Promise.all(idsToAdd.map(async uid => {
          const s = await getDoc(doc(db, 'users', uid));
          return cleanUser({ uid, ...(s.data() || {}) });
      }));
      await updateDoc(doc(db, 'conversations', activeChat.id), {
          participants: arrayUnion(...idsToAdd),
          users: arrayUnion(...newUsers)
      });
      setShowAddMemberModal(false);
      setUserToAddFromContext(null); // Clear context selection
  };

  const handleRemoveMember = async (uid) => {
      if(!confirm("Remove this user?")) return;
      const uObj = activeChat.users.find(u => u.uid === uid);
      await updateDoc(doc(db, 'conversations', activeChat.id), {
          participants: arrayRemove(uid),
          users: arrayRemove(uObj)
      });
  };

  const handleBlockUser = async () => {
      if(!activeChat || activeChat.isGroup) return;
      const blockedList = user?.blockedUsers || [];
      const isBlocked = blockedList.includes(activeChat.otherUser.uid);
      try {
          if (isBlocked) {
              await updateDoc(doc(db, 'users', user.uid), { blockedUsers: arrayRemove(activeChat.otherUser.uid) });
              alert("User unblocked.");
          } else {
              await updateDoc(doc(db, 'users', user.uid), { blockedUsers: arrayUnion(activeChat.otherUser.uid) });
              alert("User blocked.");
              // Don't close chat, just update UI
          }
      } catch(e) { console.error(e); alert("Action failed."); }
  };

  const submitReport = async (reason) => {
      try {
          await addDoc(collection(db, 'reports'), {
              reporterId: user.uid,
              targetId: activeChat.isGroup ? activeChat.id : activeChat.otherUser.uid,
              type: activeChat.isGroup ? 'guild' : 'user',
              reason: reason,
              timestamp: serverTimestamp()
          });
          alert("Report submitted."); setShowReportModal(false);
      } catch(e) { alert("Report failed."); }
  };

  const deleteChat = async (chatId) => {
    if (!confirm('Delete conversation?')) return;
    try { await deleteDoc(doc(db, 'conversations', chatId)); setContextMenu(null); setActiveChat(null); } catch (e) {}
  };

  const toggleMuteChat = async (chatId) => { 
      const chat = conversations.find(c => c.id === chatId);
      const isMuted = chat?.mutedBy?.[user.uid];
      try { await updateDoc(doc(db, 'conversations', chatId), { [`mutedBy.${user.uid}`]: !isMuted }); } catch (err) {}
  };

  // --- COMPONENTS ---
  const Avatar = ({ src, name, size='md', isGuild=false, onClick, canEdit=false }) => {
    const sizeCls = size==='xl'?'w-24 h-24 text-3xl':'w-12 h-12 text-sm';
    return (
        <div onClick={onClick} className={`${sizeCls} rounded-full bg-gray-200 overflow-hidden flex-shrink-0 border border-gray-100 flex items-center justify-center relative ${onClick ? 'cursor-pointer' : ''} group`}>
            {src ? <img src={src} className="w-full h-full object-cover" /> : <span className="font-bold text-gray-500 uppercase">{name?.[0]}</span>}
            {canEdit && (
                  <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity z-10">
                      <i className="fas fa-camera text-white text-xl"></i>
                      <input type="file" className="hidden" accept="image/*" onChange={handleGuildPhotoUpload} />
                  </label>
              )}
        </div>
    );
  };

  const formatTime = (ts) => ts?.toDate ? ts.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';

  const ConversationItem = ({ chat }) => {
      const handleContext = (e) => { e.preventDefault(); setContextMenu({ chat }); };
      const unreadCount = chat.unreadCounts?.[user?.uid] || 0;
      const isMuted = chat.mutedBy?.[user?.uid];

      return (
          <div 
            onClick={() => openChat(chat)}
            onContextMenu={handleContext}
            className={`flex items-center gap-3 p-3 mb-1 rounded-xl cursor-pointer transition-all select-none ${activeChat?.id === chat.id ? 'bg-blue-50 border-blue-100' : 'hover:bg-gray-50 border-transparent'} border`}
          >
              <Avatar src={chat.isGroup ? chat.groupPhoto : chat.otherUser?.photoURL} name={chat.isGroup ? chat.groupName : chat.otherUser?.displayName} isGuild={chat.isGroup} />
              <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                      <h4 className="font-bold text-sm truncate text-gray-800">{chat.isGroup ? chat.groupName : chat.otherUser?.displayName}</h4>
                      <div className="flex items-center gap-1">
                          {isMuted && <i className="fas fa-volume-mute text-[10px] text-gray-400"></i>}
                          <span className="text-[10px] text-gray-400">{chat.updatedAt ? formatTime(chat.updatedAt) : ''}</span>
                      </div>
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${unreadCount > 0 ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
                      {chat.typing?.[chat.otherUser?.uid] ? <span className="text-green-600 animate-pulse">Typing...</span> : (chat.lastMessage || 'Start chatting')}
                  </p>
              </div>
              {unreadCount > 0 && <div className="w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shadow-md animate-pulse">{unreadCount}</div>}
          </div>
      );
  };

  const MessageBubble = ({ msg }) => {
      const isMe = msg.senderId === user?.uid;
      const isSeen = msg.seenBy && msg.seenBy.length > 1; 
      const bubbleClass = isMe ? (isSeen ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white' : 'bg-teal-600 text-white') : 'bg-white text-gray-800 border border-gray-100';
      
      const handleLongPress = () => setMessageMenu(msg);

      return (
          <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-4 group select-none`} onContextMenu={(e)=>{e.preventDefault(); handleLongPress()}}>
             <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl shadow-sm text-sm relative ${bubbleClass} ${isMe?'rounded-br-none':'rounded-bl-none'}`}>
                {msg.replyTo && (
                    <div className={`mb-2 p-2 rounded-lg text-xs border-l-4 ${isMe ? 'bg-white/20 border-white/50 text-white' : 'bg-gray-100 border-gray-300 text-gray-600'}`}>
                        <span className="font-bold block">{msg.replyTo.sender}</span>
                        <span className="truncate block opacity-80">{msg.replyTo.text}</span>
                    </div>
                )}
                {msg.mediaURL && (
                    <div className="mb-2">
                        {msg.mediaType === 'audio' ? <audio src={msg.mediaURL} controls className="max-w-[200px]" /> :
                         msg.mediaType === 'video' ? <video src={msg.mediaURL} controls className="rounded-lg max-w-full max-h-60" /> :
                         msg.mediaType === 'file' ? (
                             <div className="flex items-center gap-2 bg-black/10 p-2 rounded-lg cursor-pointer hover:bg-black/20" onClick={()=>window.open(msg.mediaURL)}>
                                 <i className="fas fa-file-alt text-2xl"></i>
                                 <div><p className="font-bold text-xs truncate w-32">{msg.fileName || 'Document'}</p><p className="text-[10px]">{msg.fileSize}</p></div>
                             </div>
                         ) :
                         <img src={msg.mediaURL} className="rounded-lg max-w-full max-h-60 cursor-pointer hover:opacity-90" onClick={()=>setFullScreenMedia(msg.mediaURL)} />}
                    </div>
                )}
                
                <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                
                <div className={`flex items-center justify-end gap-1 mt-1 text-[9px] ${isMe ? 'text-blue-100' : 'text-gray-400'}`}>
                    <span>{formatTime(msg.timestamp)}</span>
                    {msg.isForwarded && <span><i className="fas fa-share"></i></span>}
                    {isMe && (
                        <span title={isSeen ? "Seen" : "Sent"}>
                             {isSeen ? <i className="fas fa-check-double text-blue-200"></i> : <i className="fas fa-check"></i>}
                        </span>
                    )}
                </div>
             </div>
          </div>
      );
  };

  const isBlocked = !activeChat?.isGroup && user?.blockedUsers?.includes(activeChat?.otherUser?.uid);
  const isChatMuted = activeChat?.mutedBy?.[user?.uid];

  return (
    <div className="fixed top-0 left-0 w-full h-full bg-[#f0f4f8] flex overflow-hidden pt-[env(safe-area-inset-top)] md:left-[300px] md:w-[calc(100%-300px)]">
      
      {/* 1. SIDEBAR (Chat List) */}
      <div className={`${activeChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 flex-col bg-white border-r border-gray-100 h-full shrink-0 z-20`}>
        <div className="p-5 border-b border-gray-50">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-3xl font-black bg-gradient-to-r from-teal-400 via-blue-500 to-purple-600 bg-clip-text text-transparent tracking-wider">SHINOBI</h1>
                <div className="relative">
                    <button onClick={() => setShowSidebarMenu(!showSidebarMenu)} className="w-9 h-9 bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200 flex items-center justify-center"><i className="fas fa-plus"></i></button>
                    {showSidebarMenu && (
                        <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowSidebarMenu(false)}></div>
                        <div className="absolute right-0 top-10 bg-white shadow-xl rounded-xl p-2 z-40 w-48 border border-gray-100 flex flex-col gap-1 animate-fade-in">
                            <button onClick={()=>{setShowNewChatModal(true); setShowSidebarMenu(false)}} className="text-left px-3 py-2 hover:bg-gray-50 rounded-lg text-sm font-bold text-gray-700 flex items-center gap-2"><i className="fas fa-comment text-blue-500"></i> New Chat</button>
                            <button onClick={()=>{setShowCreateGuildModal(true); setShowSidebarMenu(false)}} className="text-left px-3 py-2 hover:bg-gray-50 rounded-lg text-sm font-bold text-gray-700 flex items-center gap-2"><i className="fas fa-users text-orange-500"></i> Create Guild</button>
                        </div>
                        </>
                    )}
                </div>
            </div>
            
            <div className="flex bg-gray-100 p-1 rounded-xl mb-3">
                <button onClick={()=>setCurrentSidebar('Shinobi')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${currentSidebar==='Shinobi'?'bg-white shadow-sm text-gray-900':'text-gray-500'}`}>Messages</button>
                <button onClick={()=>setCurrentSidebar('Guild')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${currentSidebar==='Guild'?'bg-white shadow-sm text-gray-900':'text-gray-500'}`}>Guilds</button>
            </div>

            <div className="relative group">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                <input type="text" placeholder="Search..." className="w-full bg-gray-50 pl-9 pr-4 py-2.5 rounded-xl outline-none text-sm focus:ring-2 focus:ring-blue-100 transition-all" value={sidebarSearch} onChange={e=>setSidebarSearch(e.target.value)} />
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            {conversations
                .filter(c => (currentSidebar === 'Shinobi' ? !c.isGroup : c.isGroup))
                .filter(c => (c.isGroup ? c.groupName : (c.otherUser?.displayName || 'User'))?.toLowerCase().includes(sidebarSearch.toLowerCase()))
                .map(chat => <ConversationItem key={chat.id} chat={chat} />)}
        </div>
      </div>

      {/* 2. CHAT AREA */}
      <div className={`${!activeChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#f8fafc] relative min-w-0 h-full overflow-hidden`}>
        {activeChat ? (
          <>
            {/* HEADER */}
            <div className="h-16 bg-white/95 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-4 z-30 shrink-0 shadow-sm sticky top-0">
                <div className="flex items-center gap-3 min-w-0">
                    <button onClick={() => { setActiveChat(null); setIsMobileChatOpen(false); }} className="md:hidden w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"><i className="fas fa-arrow-left text-sm"></i></button>
                    <Avatar 
                        src={activeChat.isGroup ? activeChat.groupPhoto : activeChat.otherUser?.photoURL} 
                        name={activeChat.isGroup ? activeChat.groupName : activeChat.otherUser?.displayName} 
                        onClick={() => setShowDetails(!showDetails)}
                    />
                    <div className="min-w-0 cursor-pointer" onClick={() => setShowDetails(!showDetails)}>
                        <h3 className="font-bold text-gray-800 truncate">{activeChat.isGroup ? activeChat.groupName : activeChat.otherUser?.displayName}</h3>
                        <p className="text-xs text-blue-600 font-bold">
                            {typingUsers.length > 0 ? `${typingUsers.join(', ')} typing...` : 'Online'}
                        </p>
                    </div>
                </div>
                
                <div className="flex gap-2 shrink-0">
                    {isSearchingChat ? (
                        <div className="flex items-center bg-gray-100 rounded-xl px-2 animate-scale-in">
                            <input autoFocus type="text" placeholder="Find..." className="bg-transparent border-none outline-none text-xs w-24 py-2" value={chatSearch} onChange={e=>setChatSearch(e.target.value)} />
                            <button onClick={()=>{setIsSearchingChat(false); setChatSearch('')}} className="text-gray-400 hover:text-gray-600 px-2"><i className="fas fa-times"></i></button>
                        </div>
                    ) : !activeChat.isGroup && (
                        <>
                            <button onClick={() => startCall(activeChat.otherUser.uid, activeChat.otherUser.displayName, activeChat.otherUser.photoURL, 'audio', activeChat.id)} className="h-9 w-9 rounded-xl bg-white border border-gray-200 text-gray-500 hover:text-blue-600 hover:shadow-md flex items-center justify-center"><i className="fas fa-phone"></i></button>
                            <button onClick={() => startCall(activeChat.otherUser.uid, activeChat.otherUser.displayName, activeChat.otherUser.photoURL, 'video', activeChat.id)} className="h-9 w-9 rounded-xl bg-white border border-gray-200 text-gray-500 hover:text-blue-600 hover:shadow-md flex items-center justify-center"><i className="fas fa-video"></i></button>
                        </>
                    )}
                    <button onClick={() => setShowDetails(!showDetails)} className={`h-9 w-9 rounded-xl border transition-all flex items-center justify-center ${showDetails ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-500 hover:text-blue-600 hover:shadow-md'}`}><i className="fas fa-info-circle"></i></button>
                </div>
            </div>

            {/* MESSAGES LIST */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-[#f8fafc] w-full"> 
                {messages.filter(m => !chatSearch || (m.text||'').toLowerCase().includes(chatSearch.toLowerCase())).map((msg, i) => {
                    const prevMsg = messages[i-1];
                    const isNewDay = !prevMsg || new Date(msg.timestamp?.seconds*1000).toDateString() !== new Date(prevMsg.timestamp?.seconds*1000).toDateString();
                    return (
                        <React.Fragment key={msg.id}>
                            {isNewDay && (
                                <div className="flex justify-center my-4"><span className="bg-gray-200 text-gray-500 text-[10px] px-3 py-1 rounded-full font-bold">{new Date(msg.timestamp?.seconds*1000).toLocaleDateString()}</span></div>
                            )}
                            <MessageBubble msg={msg} />
                        </React.Fragment>
                    );
                })}
                <div ref={scrollRef}></div>
            </div>

            {/* INPUT */}
            <div className="w-full bg-[#f8fafc] p-2 shrink-0 border-t border-gray-100 z-20 mt-auto">
               {isBlocked ? (
                   <div className="bg-gray-100 text-gray-500 text-center py-4 rounded-xl font-bold border border-gray-200">
                       You blocked this user. <button onClick={handleBlockUser} className="text-blue-600 underline hover:text-blue-800 ml-2">Unblock</button>
                   </div>
               ) : (
                   <>
                       {replyingTo && (
                           <div className="flex justify-between items-center bg-blue-50 p-2 rounded-t-xl text-xs text-blue-800 border-b border-blue-100 mx-2 animate-slide-up">
                               <span className="truncate">Replying to <b>{replyingTo.senderName}</b>: {replyingTo.text.substring(0, 30)}...</span>
                               <button onClick={()=>setReplyingTo(null)} className="text-blue-500 hover:text-blue-700"><i className="fas fa-times"></i></button>
                           </div>
                       )}
                       <div className={`bg-white p-1.5 rounded-full shadow-lg border border-gray-100 flex items-end gap-2 pl-2 ${editingMessage ? 'ring-2 ring-blue-400' : ''}`}>
                         <div className="relative">
                            <button onClick={() => setShowAttachMenu(!showAttachMenu)} className="w-9 h-9 rounded-full bg-gray-50 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-all flex items-center justify-center shrink-0 mb-0.5">
                                <i className="fas fa-plus text-lg"></i>
                            </button>
                            {showAttachMenu && (
                                <>
                                <div className="fixed inset-0 z-30" onClick={() => setShowAttachMenu(false)}></div>
                                <div className="absolute bottom-12 left-0 bg-white shadow-xl rounded-2xl p-2 flex flex-col gap-2 z-40 w-12 animate-fade-in-up">
                                    {['image','video','file'].map(type => (
                                        <label key={type} className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center hover:bg-blue-50 cursor-pointer text-gray-600 hover:text-blue-600">
                                            <i className={`fas fa-${type === 'image' ? 'image' : type === 'video' ? 'video' : 'file'}`}></i>
                                            <input type="file" accept={type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : '*/*'} className="hidden" onChange={(e) => handleFileSelect(e, type)} />
                                        </label>
                                    ))}
                                </div>
                                </>
                            )}
                         </div>

                         <textarea 
                            value={newMessage} 
                            onChange={e => { setNewMessage(e.target.value); handleTyping(); }} 
                            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage(newMessage))}
                            placeholder={editingMessage ? "Editing message..." : "Type a message..."} 
                            className="flex-1 bg-transparent border-none outline-none text-gray-700 py-2.5 px-1 max-h-24 resize-none placeholder-gray-400 text-sm"
                            rows={1}
                         />
                         
                         {newMessage.trim() ? (
                             <button onClick={() => sendMessage(newMessage)} className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md hover:scale-105 transition-all shrink-0 mb-0.5 mr-0.5"><i className={`fas ${editingMessage ? 'fa-check' : 'fa-paper-plane'} text-xs`}></i></button>
                         ) : (
                             <button onMouseDown={startRecording} onMouseUp={stopRecording} onTouchStart={startRecording} onTouchEnd={stopRecording} className={`w-9 h-9 rounded-full flex items-center justify-center shadow-md transition-all shrink-0 mb-0.5 mr-0.5 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-blue-600 text-white'}`}><i className="fas fa-microphone text-xs"></i></button>
                         )}
                         
                         {editingMessage && (
                             <button onClick={() => { setEditingMessage(null); setNewMessage(''); }} className="text-xs text-red-500 font-bold absolute top-[-20px] right-4 bg-white px-2 rounded shadow">Cancel</button>
                         )}
                       </div>
                   </>
               )}
            </div>
          </>
        ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-[#f8fafc]">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4"><i className="fas fa-comments text-3xl text-gray-300"></i></div>
                <p>Select a conversation</p>
            </div>
        )}
      </div>

      {/* 3. DETAILS SIDEBAR */}
      {showDetails && activeChat && (
        <div className="absolute inset-y-0 right-0 w-80 bg-white shadow-2xl z-40 transform transition-transform duration-300 ease-in-out border-l border-gray-100 overflow-y-auto h-full pt-safe pt-12">
           <div className="p-6">
             <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-lg text-gray-800">Details</h3>
                <button onClick={() => setShowDetails(false)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"><i className="fas fa-times"></i></button>
             </div>

             <div className="flex flex-col items-center mb-8">
                <Avatar 
                    src={activeChat.isGroup ? activeChat.groupPhoto : activeChat.otherUser?.photoURL} 
                    name={activeChat.isGroup ? activeChat.groupName : activeChat.otherUser?.displayName} 
                    size="xl" 
                    canEdit={activeChat.isGroup && activeChat.guildMasterId === user.uid}
                />
                <div className="flex flex-col items-center mt-3">
                    <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-gray-900 text-center">{activeChat.isGroup ? activeChat.groupName : activeChat.otherUser?.displayName}</h2>
                        {activeChat.isGroup && activeChat.guildMasterId === user.uid && <button onClick={handleRenameGuild} className="text-gray-400 hover:text-blue-500"><i className="fas fa-edit"></i></button>}
                    </div>
                </div>
             </div>

             <div className="grid grid-cols-3 gap-3 mb-6">
                <button onClick={()=>toggleMuteChat(activeChat.id)} className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-colors ${isChatMuted ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                    <i className={`fas ${isChatMuted ? 'fa-volume-mute' : 'fa-bell'}`}></i>
                    <span className="text-[10px] font-bold">{isChatMuted ? 'Muted' : 'Mute'}</span>
                </button>
                <button onClick={()=>{setIsSearchingChat(true); setShowDetails(false); setChatSearch('')}} className="flex flex-col items-center gap-2 p-3 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors"><i className="fas fa-search"></i><span className="text-[10px] font-bold">Search</span></button>
                <button onClick={()=>{mediaSectionRef.current?.scrollIntoView({behavior:'smooth'})}} className="flex flex-col items-center gap-2 p-3 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors"><i className="fas fa-image"></i><span className="text-[10px] font-bold">Media</span></button>
             </div>

             {/* GUILD ADMIN SECTION */}
             {activeChat.isGroup && (
                 <div className="mb-6">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Members ({activeChat.participants.length})</h4>
                    
                    {/* Member Search */}
                    <input type="text" placeholder="Search members..." className="w-full bg-gray-50 p-2 rounded-lg text-sm mb-3 border border-gray-100 outline-none" value={memberSearchQuery} onChange={e => setMemberSearchQuery(e.target.value)} />

                    {activeChat.guildMasterId === user.uid && (
                        <div className="space-y-2 mb-3">
                            <label className="w-full flex items-center justify-between p-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 cursor-pointer transition-colors">
                                <span className="text-sm font-bold">Change Group Photo</span>
                                <i className="fas fa-camera"></i>
                                <input type="file" className="hidden" accept="image/*" onChange={handleGuildPhotoUpload} />
                            </label>
                            <button onClick={()=>setShowAddMemberModal(true)} className="w-full flex items-center justify-between p-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600">
                                <span className="text-sm font-bold">Add Members</span>
                                <i className="fas fa-plus"></i>
                            </button>
                        </div>
                    )}
                    
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                        {activeChat.users?.filter(u => u.uid !== user.uid && u.displayName.toLowerCase().includes(memberSearchQuery.toLowerCase())).map(u => (
                            <div key={u.uid} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <Avatar src={u.photoURL} name={u.displayName} size="sm" />
                                    <span className="text-sm font-medium text-gray-700">{u.displayName}</span>
                                </div>
                                {activeChat.guildMasterId === user.uid && <button onClick={()=>handleRemoveMember(u.uid)} className="text-red-500 text-xs font-bold bg-red-50 px-2 py-1 rounded hover:bg-red-100">Remove</button>}
                            </div>
                        ))}
                    </div>
                    {/* Leave Button for everyone (except sole owner if that logic was enforced, but allowing here) */}
                    <button onClick={handleLeaveGuild} className="w-full mt-3 p-3 text-red-500 bg-red-50 rounded-xl font-bold text-sm hover:bg-red-100 transition">Leave Guild</button>
                 </div>
             )}

             <div ref={mediaSectionRef} className="mb-6">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Recent Media</h4>
                <div className="grid grid-cols-3 gap-2">
                    {messages.filter(m => m.mediaURL && ['image','video'].includes(m.mediaType)).slice(0, 6).map(m => (
                        <img key={m.id} src={m.mediaURL} className="aspect-square object-cover rounded-lg bg-gray-100 cursor-pointer" onClick={()=>setFullScreenMedia(m.mediaURL)} />
                    ))}
                </div>
             </div>
             
             {!activeChat.isGroup && (
                 <>
                    <button onClick={handleBlockUser} className="w-full p-3 rounded-xl bg-red-50 text-red-500 font-bold text-sm mt-4 hover:bg-red-100 transition">Block User</button>
                    <button onClick={() => setShowReportModal(true)} className="w-full p-3 rounded-xl bg-gray-100 text-gray-500 font-bold text-sm mt-2 hover:bg-gray-200 transition">Report User</button>
                 </>
             )}
             {activeChat.isGroup && <button onClick={() => setShowReportModal(true)} className="w-full p-3 rounded-xl bg-gray-100 text-gray-500 font-bold text-sm mt-2 hover:bg-gray-200 transition">Report Guild</button>}
           </div>
        </div>
      )}

      {/* MODALS */}
      {messageMenu && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={() => setMessageMenu(null)}>
            <div className="bg-white rounded-2xl w-full max-w-xs overflow-hidden shadow-xl animate-scale-in" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setReplyingTo(messageMenu); setMessageMenu(null); }} className="w-full p-4 text-left hover:bg-gray-50 flex items-center gap-3 font-medium border-b border-gray-50"><i className="fas fa-reply text-gray-500"></i> Reply</button>
                <button onClick={() => handleForwardMessage(messageMenu)} className="w-full p-4 text-left hover:bg-gray-50 flex items-center gap-3 font-medium border-b border-gray-50"><i className="fas fa-share text-gray-500"></i> Forward</button>
                {messageMenu.senderId === user.uid && <button onClick={() => { setEditingMessage(messageMenu); setNewMessage(messageMenu.text); setMessageMenu(null); }} className="w-full p-4 text-left hover:bg-gray-50 flex items-center gap-3 font-medium border-b border-gray-50"><i className="fas fa-edit text-blue-500"></i> Edit</button>}
                <button onClick={() => handleDeleteMessage(messageMenu.id)} className="w-full p-4 text-left hover:bg-gray-50 flex items-center gap-3 font-medium text-red-500"><i className="fas fa-trash"></i> Delete</button>
            </div>
        </div>
      )}

      {showForwardModal && (
          <div className="fixed inset-0 bg-black/60 z-[10000] flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-scale-in">
                  <h3 className="font-bold text-lg mb-4">Forward to...</h3>
                  <div className="max-h-60 overflow-y-auto custom-scrollbar">
                      {conversations.map(c => (
                          <div key={c.id} onClick={() => confirmForward(c)} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl cursor-pointer">
                              <Avatar src={c.isGroup ? c.groupPhoto : c.otherUser?.photoURL} name={c.isGroup ? c.groupName : c.otherUser?.displayName} />
                              <span className="font-medium">{c.isGroup ? c.groupName : c.otherUser?.displayName}</span>
                          </div>
                      ))}
                  </div>
                  <button onClick={() => setShowForwardModal(false)} className="mt-4 w-full py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-xl">Cancel</button>
              </div>
          </div>
      )}

      {fullScreenMedia && (
          <div className="fixed inset-0 bg-black/90 z-[10001] flex items-center justify-center p-4" onClick={() => setFullScreenMedia(null)}>
              <img src={fullScreenMedia} className="max-w-full max-h-full object-contain" />
              <button className="absolute top-4 right-4 text-white text-3xl">&times;</button>
          </div>
      )}

      {/* CONTEXT MENU (Chat List) */}
      {contextMenu && (
        <div className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center" onClick={() => setContextMenu(null)}>
            <div className="bg-white rounded-2xl shadow-2xl p-2 w-64 animate-scale-in" onClick={e => e.stopPropagation()}>
                <div className="p-3 border-b border-gray-100 mb-1 font-bold text-gray-700 text-center truncate">{contextMenu.chat.isGroup ? contextMenu.chat.groupName : contextMenu.chat.otherUser.displayName}</div>
                
                <button onClick={() => { toggleMuteChat(contextMenu.chat.id); setContextMenu(null); }} className="w-full text-left p-3 hover:bg-gray-50 rounded-xl font-medium flex items-center gap-3 text-gray-700">
                    <i className={`fas ${contextMenu.chat.mutedBy?.[user?.uid] ? 'fa-volume-up' : 'fa-volume-mute'} w-5`}></i> 
                    {contextMenu.chat.mutedBy?.[user?.uid] ? 'Unmute' : 'Mute'}
                </button>
                
                {!contextMenu.chat.isGroup && (
                    <button onClick={() => { setUserToAddFromContext(contextMenu.chat.otherUser.uid); setShowAddToGuildSelector(true); setContextMenu(null); }} className="w-full text-left p-3 hover:bg-purple-50 rounded-xl font-medium flex items-center gap-3 text-purple-600">
                        <i className="fas fa-user-plus w-5"></i> Add to Guild
                    </button>
                )}
                
                <button onClick={() => { deleteChat(contextMenu.chat.id); setContextMenu(null); }} className="w-full text-left p-3 hover:bg-red-50 rounded-xl font-medium flex items-center gap-3 text-red-500">
                    <i className="fas fa-trash w-5"></i> Delete
                </button>
                
                <button onClick={() => setContextMenu(null)} className="w-full p-3 text-center text-gray-400 font-bold border-t mt-2">Cancel</button>
            </div>
        </div>
      )}

      {/* NEW CHAT MODAL */}
      {showNewChatModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-fade-in">
                  <h3 className="font-bold text-lg mb-4">Start New Chat</h3>
                  <div className="max-h-60 overflow-y-auto custom-scrollbar">
                      {allUsers.map(u => (
                          <div key={u.uid} onClick={()=>{handleUserClick(u.uid); setShowNewChatModal(false);}} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl cursor-pointer">
                              <Avatar src={u.photoURL} name={u.displayName} />
                              <span className="font-medium">{u.displayName}</span>
                          </div>
                      ))}
                  </div>
                  <button onClick={()=>setShowNewChatModal(false)} className="mt-4 w-full py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-xl">Cancel</button>
              </div>
          </div>
      )}

      {/* REPORT MODAL */}
      {showReportModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-fade-in">
                  <h3 className="font-bold text-lg mb-4 text-red-500">Report Content</h3>
                  <div className="space-y-2">
                      {['Spam or Fraud', 'Harassment', 'Inappropriate Content', 'Impersonation', 'Other'].map(r => (
                          <button key={r} onClick={()=>submitReport(r)} className="w-full text-left p-3 bg-gray-50 rounded-xl hover:bg-red-50 hover:text-red-600 font-medium transition-colors">
                              {r}
                          </button>
                      ))}
                  </div>
                  <button onClick={()=>setShowReportModal(false)} className="mt-4 w-full py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-xl">Cancel</button>
              </div>
          </div>
      )}

      {/* CREATE GUILD MODAL */}
      {showCreateGuildModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                  <h3 className="font-bold text-lg mb-4">Create Guild</h3>
                  <input id="guildNameInput" type="text" placeholder="Guild Name" className="w-full bg-gray-100 p-3 rounded-xl mb-4 outline-none focus:ring-2 focus:ring-blue-100" />
                  <div className="max-h-40 overflow-y-auto mb-4 custom-scrollbar">
                      {allUsers.map(u => (
                          <label key={u.uid} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                              <input type="checkbox" className="accent-teal-600" value={u.uid} />
                              <Avatar src={u.photoURL} name={u.displayName} size="sm" />
                              <span className="text-sm font-medium">{u.displayName}</span>
                          </label>
                      ))}
                  </div>
                  <button onClick={() => {
                      const name = document.getElementById('guildNameInput').value;
                      const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
                      const selectedIds = Array.from(checkboxes).map(c => c.value);
                      if(name && selectedIds.length > 0) createNewGuild(name, selectedIds);
                  }} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700">Create</button>
                  <button onClick={()=>setShowCreateGuildModal(false)} className="mt-2 w-full py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-xl">Cancel</button>
              </div>
          </div>
      )}

      {/* SELECT GUILD TO ADD USER TO */}
      {showAddToGuildSelector && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm animate-scale-in">
                  <h3 className="font-bold mb-4">Select Guild</h3>
                  <div className="max-h-60 overflow-y-auto custom-scrollbar">
                      {conversations.filter(c => c.isGroup && c.guildMasterId === user.uid).length > 0 ? (
                          conversations.filter(c => c.isGroup && c.guildMasterId === user.uid).map(g => (
                              <div key={g.id} onClick={()=>{handleAddMembers([userToAddFromContext]); setShowAddToGuildSelector(false);}} className="p-3 hover:bg-blue-50 rounded-xl cursor-pointer font-medium border-b border-gray-50 last:border-0 flex items-center gap-3">
                                  <Avatar src={g.groupPhoto} name={g.groupName} size="sm" />
                                  {g.groupName}
                              </div>
                          ))
                      ) : <p className="text-gray-400 text-sm text-center py-4">You don't own any guilds.</p>}
                  </div>
                  <button onClick={() => setShowAddToGuildSelector(false)} className="mt-4 w-full py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-xl">Cancel</button>
              </div>
          </div>
      )}

      {/* ADD MEMBER TO GUILD MODAL */}
      {showAddMemberModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                  <h3 className="font-bold text-lg mb-4">Add Members</h3>
                  <div className="max-h-60 overflow-y-auto custom-scrollbar">
                      {allUsers.filter(u => !activeChat?.participants?.includes(u.uid)).map(u => (
                          <label key={u.uid} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                              <input type="checkbox" className="add-member-check accent-teal-600" value={u.uid} />
                              <Avatar src={u.photoURL} name={u.displayName} size="sm" />
                              <span className="text-sm font-medium">{u.displayName}</span>
                          </label>
                      ))}
                  </div>
                  <button onClick={() => {
                      const checkboxes = document.querySelectorAll('.add-member-check:checked');
                      const selectedIds = Array.from(checkboxes).map(c => c.value);
                      if(selectedIds.length > 0) handleAddMembers(selectedIds);
                  }} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold mt-4">Add Selected</button>
                  <button onClick={()=>setShowAddMemberModal(false)} className="mt-2 w-full py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-xl">Cancel</button>
              </div>
          </div>
      )}

    </div>
  );
};

export default ShinobiMessenger;