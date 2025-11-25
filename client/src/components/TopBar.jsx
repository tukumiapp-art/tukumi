import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../api/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import SearchModal from './SearchModal';
import SettingsModal from './SettingsModal'; 

const TopBar = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [showMenu, setShowMenu] = useState(false); 
  const [showSettings, setShowSettings] = useState(false); 

  // --- SMART SCROLL STATES ---
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
  const prevNotifCount = useRef(0);

  useEffect(() => {
    // Auth & Notification Logic
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const qNotifs = query(collection(db, 'notifications'), where('recipientId', '==', currentUser.uid), where('isRead', '==', false));
        const unsubNotifs = onSnapshot(qNotifs, (snapshot) => {
            const count = snapshot.docs.length;
            setUnreadNotifCount(count);
            prevNotifCount.current = count;
        });
        return () => unsubNotifs();
      } else setUser(null);
    });
    
    // --- SCROLL EVENT LISTENER ---
    const handleScroll = () => {
        const currentScrollY = window.scrollY;
        
        if (currentScrollY < 10) {
            // Always show at the very top
            setIsVisible(true);
        } else if (currentScrollY > lastScrollY.current) {
            // Scrolling DOWN -> Hide
            setIsVisible(false);
        } else {
            // Scrolling UP -> Show
            setIsVisible(true);
        }
        lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    const handleClickOutside = (e) => { if (!e.target.closest('.app-menu-container')) setShowMenu(false); };
    document.addEventListener('click', handleClickOutside);
    
    return () => { 
        unsubAuth(); 
        document.removeEventListener('click', handleClickOutside); 
        window.removeEventListener('scroll', handleScroll); // Clean up scroll listener
    };
  }, []);

  const handleSignOut = async () => {
      if(window.confirm("Sign out of Tukumi?")) {
          await signOut(auth);
          window.location.reload();
      }
  };

  return (
    <>
        {/* WRAPPER FOR FIXED/STICKY POSITIONING */}
        <div 
            className={`sticky top-0 md:relative z-[40] transition-transform duration-300 ease-in-out
            ${isVisible ? 'translate-y-0' : '-translate-y-[120%]'}`}
        >
            <div className="flex justify-between items-center bg-white/95 backdrop-blur-md md:bg-white rounded-b-[24px] md:rounded-[24px] p-4 md:p-5 shadow-sm mb-6 border-b border-gray-100 md:border-none">
            
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
                
                {/* APP MENU */}
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
        </div>

        {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
        {showSettings && user && <SettingsModal user={user} onClose={() => setShowSettings(false)} />}
    </>
  );
};

export default TopBar;