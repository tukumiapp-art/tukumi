import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../api/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  collection, query, where, onSnapshot, orderBy, 
  updateDoc, doc, writeBatch, deleteDoc 
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

const TopBar = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  
  // Sound Refs
  const notificationSound = useRef(new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3'));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
  const prevNotifCount = useRef(0);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);

        // 1. Listen for NOTIFICATIONS
        const qNotifs = query(
          collection(db, 'notifications'), 
          where('recipientId', '==', currentUser.uid),
          orderBy('timestamp', 'desc')
        );

        const unsubNotifs = onSnapshot(qNotifs, (snapshot) => {
          const newNotifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          
          if (newNotifs.length > prevNotifCount.current && !newNotifs[0]?.isRead) {
              notificationSound.current.play().catch(e => console.log("Audio play failed", e));
          }
          
          setNotifications(newNotifs);
          prevNotifCount.current = newNotifs.length;
        });

        // 2. Listen for MESSAGES (Unread Count)
        const qMsgs = query(
          collection(db, 'conversations'), 
          where('participants', 'array-contains', currentUser.uid)
        );

        const unsubMsgs = onSnapshot(qMsgs, (snapshot) => {
          let total = 0;
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.unreadCounts && data.unreadCounts[currentUser.uid]) {
              total += data.unreadCounts[currentUser.uid];
            }
          });
          setUnreadMsgCount(total);
        });

        return () => { unsubNotifs(); unsubMsgs(); };
      } else {
        setUser(null);
      }
    });

    // Close dropdown on click outside
    const handleClickOutside = (e) => {
        if (!e.target.closest('.notification-container')) setShowDropdown(false);
    };
    document.addEventListener('click', handleClickOutside);

    return () => { unsubAuth(); document.removeEventListener('click', handleClickOutside); };
  }, []);

  const handleNotificationClick = async (notif) => {
    // 1. Mark as read in DB
    await updateDoc(doc(db, 'notifications', notif.id), { isRead: true });
    
    // 2. Navigate to Exact Place
    setShowDropdown(false);

    if (notif.type === 'follow' || notif.type === 'circle_join') {
        navigate(`/profile/${notif.senderId}`);
    } else if (notif.type === 'like' || notif.type === 'comment' || notif.type === 'mention') {
        navigate('/'); 
    }
  };

  const handleClearAll = async () => {
      // Create a batch to delete all read notifications efficiently
      const batch = writeBatch(db);
      notifications.forEach(n => batch.delete(doc(db, 'notifications', n.id)));
      await batch.commit();
  };

  const unreadNotifCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="flex justify-between items-center bg-white rounded-[24px] p-5 shadow-sm mb-6 relative z-[100]">
      {/* Greeting Section */}
      <div className="flex items-center">
        <div className="text-3xl mr-4 animate-gentle-float">{hour < 18 ? '🌤️' : '🌙'}</div>
        <div>
          <h2 className="text-xl font-bold text-[#2C3E50]">{greeting}, {user?.displayName?.split(' ')[0] || 'Aristocrat'}!</h2>
          <p className="text-sm text-gray-500">What's new in your world?</p>
        </div>
      </div>

      {/* Icons */}
      <div className="flex gap-3">
        
        {/* SEARCH ICON */}
        <div className="w-10 h-10 rounded-full bg-[#F8FAFD] flex items-center justify-center cursor-pointer hover:shadow-md transition-all text-[#2C3E50] hover:scale-105">
           <i className="fas fa-search text-lg"></i>
        </div>

        {/* NOTIFICATIONS BELL (Active and Responsive) */}
        <div className="relative notification-container">
            <div 
                onClick={() => setShowDropdown(!showDropdown)}
                role="button" 
                tabIndex="0"
                className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all relative
                ${showDropdown ? 'bg-primary text-white shadow-lg' : 'bg-[#F8FAFD] text-[#2C3E50] hover:shadow-md hover:scale-105'}`}
            >
                <i className="fas fa-bell text-lg"></i>
                {unreadNotifCount > 0 && (
                    <span className="absolute top-0 right-0 bg-accent text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full border-2 border-white animate-bounce-in">
                        {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                    </span>
                )}
            </div>

            {/* DROPDOWN MENU */}
            {showDropdown && (
                <div className="absolute right-0 top-14 w-80 md:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-fade-in z-[101]">
                    <div className="p-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                        <h3 className="font-bold text-dark">Notifications</h3>
                        {notifications.length > 0 && <button onClick={handleClearAll} className="text-xs text-gray-400 hover:text-red-500">Clear All</button>}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                        {notifications.length > 0 ? notifications.map(notif => (
                            <div 
                                key={notif.id} 
                                onClick={() => handleNotificationClick(notif)}
                                className={`p-4 flex gap-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${!notif.isRead ? 'bg-blue-50/30' : ''}`}
                            >
                                <img src={notif.senderAvatar || "https://i.pravatar.cc/150?img=1"} className="w-10 h-10 rounded-full object-cover" />
                                <div className="flex-1">
                                    <p className="text-sm text-gray-800 leading-tight">
                                        <span className="font-bold">{notif.senderName}</span> 
                                        {notif.type === 'like' && ' liked your post.'}
                                        {notif.type === 'comment' && ' commented on your post.'}
                                        {notif.type === 'follow' && ' started following you.'}
                                        {notif.type === 'circle_join' && ' joined your circle.'}
                                        {notif.type === 'mention' && ' mentioned you.'}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        {notif.timestamp?.seconds ? new Date(notif.timestamp.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now'}
                                    </p>
                                </div>
                                {!notif.isRead && <div className="w-2 h-2 bg-primary rounded-full mt-2"></div>}
                            </div>
                        )) : (
                            <div className="p-8 text-center text-gray-400">
                                <i className="far fa-bell-slash text-2xl mb-2"></i>
                                <p className="text-sm">No notifications yet.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
        
        {/* MESSAGES ICON (Real-Time Badge) */}
        <div 
          onClick={() => navigate('/messages')}
          className="w-10 h-10 rounded-full bg-gradient-to-br from-purple to-[#8E44AD] text-white flex items-center justify-center cursor-pointer hover:shadow-md transition-all relative hover:scale-105"
        >
          <i className="fas fa-comment-dots text-lg"></i>
          {unreadMsgCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full border-2 border-white animate-bounce-in">
              {unreadMsgCount > 9 ? '9+' : unreadMsgCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default TopBar;