import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../api/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { 
  collection, query, where, onSnapshot, orderBy, 
  updateDoc, doc, writeBatch, deleteDoc 
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import SearchModal from './SearchModal';
import SettingsModal from './SettingsModal'; 

const TopBar = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [showMenu, setShowMenu] = useState(false); 
  const [showSettings, setShowSettings] = useState(false); 

  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  
  const notificationSound = useRef(new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3'));
  const prevNotifCount = useRef(0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);

        // 1. Notifications
        const qNotifs = query(
          collection(db, 'notifications'), 
          where('recipientId', '==', currentUser.uid),
          orderBy('timestamp', 'desc')
        );

        const unsubNotifs = onSnapshot(qNotifs, (snapshot) => {
          const newNotifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          // Play sound only if there's a new unread notification
          if (newNotifs.length > prevNotifCount.current && !newNotifs[0]?.isRead) {
              notificationSound.current.play().catch(() => {});
          }
          setNotifications(newNotifs);
          prevNotifCount.current = newNotifs.length;
        });

        // 2. Message Count
        const qMsgs = query(collection(db, 'conversations'), where('participants', 'array-contains', currentUser.uid));
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
      } else setUser(null);
    });

    const handleScroll = () => {
        const currentScrollY = window.scrollY;
        if (currentScrollY < 10) setIsVisible(true);
        else if (currentScrollY > lastScrollY.current) setIsVisible(false);
        else setIsVisible(true);
        lastScrollY.current = currentScrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    const handleClickOutside = (e) => { 
        if (!e.target.closest('.notification-container')) setShowDropdown(false);
        if (!e.target.closest('.app-menu-container')) setShowMenu(false); 
    };
    document.addEventListener('click', handleClickOutside);

    return () => { 
        document.removeEventListener('click', handleClickOutside); 
        window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // --- NEW HANDLER: Mark all read when opening ---
  const handleToggleNotifications = async () => {
    const willOpen = !showDropdown;
    setShowDropdown(willOpen);

    if (willOpen) {
      // Identify unread notifications
      const unreadItems = notifications.filter(n => !n.isRead);
      if (unreadItems.length > 0) {
        try {
          // Batch update all unread to read
          const batch = writeBatch(db);
          unreadItems.forEach(n => {
            const ref = doc(db, 'notifications', n.id);
            batch.update(ref, { isRead: true });
          });
          await batch.commit();
        } catch (e) {
          console.error("Error marking notifications as read:", e);
        }
      }
    }
  };

  const handleNotificationClick = async (notif) => {
    // Just in case one slipped through, ensure it's marked read
    if (!notif.isRead) {
       updateDoc(doc(db, 'notifications', notif.id), { isRead: true });
    }
    
    setShowDropdown(false);

    // --- NAVIGATION LOGIC ---
    switch (notif.type) {
        case 'like':
        case 'comment':
        case 'mention':
            navigate(`/post/${notif.targetId}`, { state: { commentId: notif.commentId } });
            break;
        
        case 'follow':
        case 'circle_join':
            navigate(`/profile/${notif.senderId}`);
            break;
            
        case 'review':
        case 'question':
        case 'answer':
            const tab = notif.type === 'review' ? 'reviews' : 'qa';
            navigate(`/product/${notif.targetId}`, { state: { activeTab: tab } });
            break;

        case 'follow_business':
            navigate(`/business/${notif.targetId}`);
            break;
            
        default:
            navigate('/'); 
    }
  };

  const handleClearAll = async () => {
      const batch = writeBatch(db);
      notifications.forEach(n => batch.delete(doc(db, 'notifications', n.id)));
      await batch.commit();
  };

  const handleSignOut = async () => {
      if(window.confirm("Sign out?")) { await signOut(auth); window.location.reload(); }
  };

  const unreadNotifCount = notifications.filter(n => !n.isRead).length;

  return (
    <>
        <div className={`sticky top-0 md:relative z-[40] transition-transform duration-300 ease-in-out ${isVisible ? 'translate-y-0' : '-translate-y-[120%]'}`}>
            <div className="flex justify-between items-center bg-white/95 backdrop-blur-md md:bg-white rounded-b-[24px] md:rounded-[24px] p-4 md:p-5 shadow-sm mb-6 border-b border-gray-100 md:border-none">
            
            <div className="flex items-center">
                <div className="text-2xl md:text-3xl mr-3 md:mr-4 animate-gentle-float">{hour < 18 ? '🌤️' : '🌙'}</div>
                <div>
                <h2 className="text-lg md:text-xl font-bold text-[#2C3E50] leading-tight">
                    {greeting}, <span className="hidden md:inline">{user?.displayName?.split(' ')[0] || 'Friend'}!</span>
                </h2>
                </div>
            </div>

            <div className="flex gap-2 md:gap-3">
                <div onClick={() => setShowSearch(true)} className="w-10 h-10 rounded-full bg-[#F8FAFD] flex items-center justify-center cursor-pointer hover:shadow-md transition-all text-[#2C3E50]">
                   <i className="fas fa-search text-lg"></i>
                </div>

                {/* NOTIFICATIONS BELL */}
                <div className="relative notification-container">
                    <div 
                        onClick={handleToggleNotifications} 
                        className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all relative ${showDropdown ? 'bg-primary text-white shadow-lg' : 'bg-[#F8FAFD] text-[#2C3E50] hover:shadow-md'}`}
                    >
                        <i className="fas fa-bell text-lg"></i>
                        {unreadNotifCount > 0 && (
                            <span className="absolute top-0 right-0 bg-accent text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full border-2 border-white animate-bounce-in">
                                {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                            </span>
                        )}
                    </div>

                    {showDropdown && (
                        <div className="absolute right-0 top-14 w-80 md:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-fade-in z-[101]">
                            <div className="p-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                                <h3 className="font-bold text-dark">Notifications</h3>
                                {notifications.length > 0 && <button onClick={handleClearAll} className="text-xs text-gray-400 hover:text-red-500">Clear All</button>}
                            </div>
                            <div className="max-h-80 overflow-y-auto custom-scrollbar">
                                {notifications.length > 0 ? notifications.map(notif => (
                                    <div key={notif.id} onClick={() => handleNotificationClick(notif)} className={`p-4 flex gap-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${!notif.isRead ? 'bg-blue-50/30' : ''}`}>
                                        <img src={notif.senderAvatar || "https://via.placeholder.com/150"} className="w-10 h-10 rounded-full object-cover border border-white shadow-sm" />
                                        <div className="flex-1">
                                            <p className="text-sm text-gray-800 leading-tight">
                                                <span className="font-bold">{notif.senderName}</span> 
                                                {notif.type === 'like' && ' liked your post.'}
                                                {notif.type === 'comment' && ' commented on your post.'}
                                                {notif.type === 'follow' && ' started following you.'}
                                                {notif.type === 'mention' && ' mentioned you.'}
                                                {notif.type === 'review' && ' reviewed your product.'}
                                                {notif.type === 'team_invite' && ' invited you to a team.'}
                                                {!['like','comment','follow','mention','review','team_invite'].includes(notif.type) && ` ${notif.message}`}
                                            </p>
                                            <p className="text-xs text-gray-400 mt-1">{notif.timestamp?.seconds ? new Date(notif.timestamp.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now'}</p>
                                        </div>
                                        {/* Dot removed here because they are marked read on open, but you can keep it conditionally if db update is slow */}
                                        {!notif.isRead && <div className="w-2 h-2 bg-primary rounded-full mt-2 shrink-0"></div>}
                                    </div>
                                )) : <div className="p-8 text-center text-gray-400"><i className="far fa-bell-slash text-2xl mb-2"></i><p className="text-sm">No notifications.</p></div>}
                            </div>
                        </div>
                    )}
                </div>
                
                <div onClick={() => setShowMenu(!showMenu)} className="relative app-menu-container w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-gold text-white flex items-center justify-center cursor-pointer hover:shadow-md">
                    <i className="fas fa-bars text-lg"></i>
                    {showMenu && (
                        <div className="absolute right-0 top-14 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-fade-in z-[100] text-dark">
                            <div className="p-3 border-b border-gray-50 text-xs font-bold text-gray-400 uppercase bg-gray-50/50">Menu</div>
                            <div className="flex flex-col p-2 space-y-1">
                                <button onClick={() => { navigate('/explore'); setShowMenu(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 rounded-xl text-sm font-bold"><i className="fas fa-compass text-purple-500 w-6"></i> Explore</button>
                                <button onClick={() => { navigate('/business'); setShowMenu(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 rounded-xl text-sm font-bold"><i className="fas fa-briefcase text-blue-500 w-6"></i> Business</button>
                                <button onClick={() => { setShowSettings(true); setShowMenu(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 rounded-xl text-sm font-bold"><i className="fas fa-cog text-gray-500 w-6"></i> Settings</button>
                                <div className="h-px bg-gray-100 my-1"></div>
                                <button onClick={handleSignOut} className="flex items-center gap-3 px-4 py-3 hover:bg-red-50 rounded-xl text-sm font-bold text-red-500"><i className="fas fa-sign-out-alt w-6"></i> Sign Out</button>
                            </div>
                        </div>
                    )}
                </div>

            </div>
            </div>
        </div>
        {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
        {showSettings && user && <SettingsModal user={user} onClose={() => setShowSettings(false)} />}
    </>
  );
};

export default TopBar;