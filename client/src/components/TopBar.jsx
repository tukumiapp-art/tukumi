import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../api/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth'; // Added signOut
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import SearchModal from './SearchModal';
import SettingsModal from './SettingsModal'; // Import the new modal

const TopBar = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [showMenu, setShowMenu] = useState(false); 
  const [showSettings, setShowSettings] = useState(false); // State for settings

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
  const notificationSound = useRef(new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3'));
  const prevNotifCount = useRef(0);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Notifications Listener
        const qNotifs = query(collection(db, 'notifications'), where('recipientId', '==', currentUser.uid), where('isRead', '==', false));
        const unsubNotifs = onSnapshot(qNotifs, (snapshot) => {
            const count = snapshot.docs.length;
            if (count > prevNotifCount.current) notificationSound.current.play().catch(() => {});
            setUnreadNotifCount(count);
            prevNotifCount.current = count;
        });
        return () => unsubNotifs();
      } else setUser(null);
    });
    
    const handleClickOutside = (e) => { if (!e.target.closest('.app-menu-container')) setShowMenu(false); };
    document.addEventListener('click', handleClickOutside);
    return () => { unsubAuth(); document.removeEventListener('click', handleClickOutside); };
  }, []);

  const handleSignOut = async () => {
      if(window.confirm("Sign out of Tukumi?")) {
          await signOut(auth);
          window.location.reload();
      }
  };

  return (
    <>
        <div className="flex justify-between items-center bg-white rounded-[24px] p-4 md:p-5 shadow-sm mb-6 relative z-[50]">
          
          <div className="flex items-center">
            <div className="text-2xl md:text-3xl mr-3 md:mr-4 animate-gentle-float">{hour < 18 ? '🌤️' : '🌙'}</div>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-[#2C3E50] leading-tight">
                  {greeting}, <span className="hidden md:inline">{user?.displayName?.split(' ')[0] || 'Friend'}!</span>
                  <span className="md:hidden">{user?.displayName?.split(' ')[0] || 'Friend'}</span>
              </h2>
            </div>
          </div>

          <div className="flex gap-2 md:gap-3">
            {/* SEARCH */}
            <div onClick={() => setShowSearch(true)} className="w-10 h-10 rounded-full bg-[#F8FAFD] flex items-center justify-center cursor-pointer hover:shadow-md transition-all text-[#2C3E50] hover:scale-105">
               <i className="fas fa-search text-lg"></i>
            </div>

            {/* NOTIFICATIONS */}
            <div onClick={() => navigate('/notifications')} className="w-10 h-10 rounded-full bg-[#F8FAFD] flex items-center justify-center cursor-pointer hover:shadow-md transition-all text-[#2C3E50] hover:scale-105 relative">
                <i className="fas fa-bell text-lg"></i>
                {unreadNotifCount > 0 && <span className="absolute top-0 right-0 bg-accent text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full border-2 border-white animate-bounce-in">{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</span>}
            </div>
            
            {/* APP MENU (REPLACED MESSAGES ICON) */}
            <div className="relative app-menu-container">
                <div onClick={() => setShowMenu(!showMenu)} className={`w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-gold text-white flex items-center justify-center cursor-pointer hover:shadow-md transition-all hover:scale-105 ${showMenu ? 'ring-4 ring-primary/20' : ''}`}>
                  <i className="fas fa-bars text-lg"></i>
                </div>

                {/* DROPDOWN MENU */}
                {showMenu && (
                    <div className="absolute right-0 top-14 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-fade-in z-[100]">
                        <div className="p-3 border-b border-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider bg-gray-50/50">Menu</div>
                        <div className="flex flex-col p-2 space-y-1">
                            <button onClick={() => { navigate('/explore'); setShowMenu(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 rounded-xl text-dark font-bold text-sm transition-colors text-left">
                                <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center"><i className="fas fa-compass text-sm"></i></div> Explore
                            </button>
                            <button onClick={() => { navigate('/business'); setShowMenu(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 rounded-xl text-dark font-bold text-sm transition-colors text-left">
                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center"><i className="fas fa-briefcase text-sm"></i></div> Business
                            </button>
                            <button onClick={() => { setShowSettings(true); setShowMenu(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 rounded-xl text-dark font-bold text-sm transition-colors text-left">
                                <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center"><i className="fas fa-cog text-sm"></i></div> Settings
                            </button>
                            <div className="h-px bg-gray-100 my-1"></div>
                            <button onClick={handleSignOut} className="flex items-center gap-3 px-4 py-3 hover:bg-red-50 rounded-xl text-red-500 font-bold text-sm transition-colors text-left">
                                <div className="w-8 h-8 rounded-full bg-red-100 text-red-500 flex items-center justify-center"><i className="fas fa-sign-out-alt text-sm"></i></div> Sign Out
                            </button>
                        </div>
                    </div>
                )}
            </div>

          </div>
        </div>

        {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
        {showSettings && user && <SettingsModal user={user} onClose={() => setShowSettings(false)} />}
    </>
  );
};

export default TopBar;