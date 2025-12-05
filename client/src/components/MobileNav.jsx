import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../api/firebase'; 
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore'; 

const MobileNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = (path) => location.pathname === path;
  
  const [isVisible, setIsVisible] = useState(true);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0); 
  
  // --- LOGO INTERACTION REFS ---
  const pressTimer = useRef(null);
  const isLongPress = useRef(false);
  const lastTapTime = useRef(0); 

  // Long Press Logic
  const handlePressStart = () => { 
      isLongPress.current = false; 
      pressTimer.current = setTimeout(() => { 
          isLongPress.current = true; 
          handleSignOut(); 
      }, 3000); 
  };
  
  const handlePressEnd = () => { 
      clearTimeout(pressTimer.current); 
  };

  const handleSignOut = async () => { 
      if (navigator.vibrate) navigator.vibrate(200); 
      if (window.confirm("Do you want to sign out?")) { 
          try { await signOut(auth); } catch (e) { console.error(e); } 
      } 
  };

  const handleCentralClick = (e) => { 
      if (isLongPress.current) return; 

      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTapTime.current;

      if (tapLength < 300 && tapLength > 0) {
          // Double Tap
          window.scrollTo({ top: 0, behavior: 'smooth' });
          if (navigator.vibrate) navigator.vibrate(50); 
      } else {
          // Single Tap
          if (location.pathname !== '/') {
              navigate('/');
          }
      }
      lastTapTime.current = currentTime;
  };

  // --- UPDATED: Listen for Unread Messages in 'conversations' ---
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
        if (currentUser) {
            // FIXED: Changed 'chats' to 'conversations' to match database
            const qMsgs = query(
                collection(db, 'conversations'), 
                where('participants', 'array-contains', currentUser.uid)
            );
            
            const unsubMsgs = onSnapshot(qMsgs, (snapshot) => {
                let total = 0;
                snapshot.docs.forEach(doc => { 
                    const data = doc.data(); 
                    // FIXED: Changed to 'unreadCounts' (plural)
                    if (data.unreadCounts && data.unreadCounts[currentUser.uid]) {
                        total += data.unreadCounts[currentUser.uid];
                    }
                });
                setUnreadMsgCount(total);
            }, (error) => {
                console.error("MobileNav error:", error);
            });
            return () => unsubMsgs();
        }
    });
    return () => unsubAuth();
  }, []);

  // Keyboard hiding logic
  useEffect(() => {
    const handleFocusIn = (e) => { if (['input', 'textarea'].includes(e.target.tagName.toLowerCase()) || e.target.isContentEditable) setIsVisible(false); };
    const handleFocusOut = () => { setTimeout(() => { if (!['input', 'textarea'].includes(document.activeElement.tagName.toLowerCase())) setIsVisible(true); }, 200); };
    const handleToggleNav = (e) => setIsVisible(e.detail.visible);
    
    document.addEventListener('focusin', handleFocusIn); 
    document.addEventListener('focusout', handleFocusOut); 
    window.addEventListener('toggle-nav', handleToggleNav);
    setIsVisible(true);
    
    return () => { 
        document.removeEventListener('focusin', handleFocusIn); 
        document.removeEventListener('focusout', handleFocusOut); 
        window.removeEventListener('toggle-nav', handleToggleNav); 
    };
  }, [location.pathname]);

  const NavItem = ({ to, icon, activeColor = 'text-primary', badgeCount = 0 }) => (
    <button onClick={() => navigate(to)} className={`relative flex flex-col items-center justify-center w-full h-full transition-all duration-200 ${isActive(to) ? `${activeColor} -translate-y-1` : 'text-gray-400 hover:text-gray-600'}`}>
      <span className={`text-xl mb-1 ${isActive(to) ? 'drop-shadow-sm scale-110' : ''}`}><i className={`fas ${icon}`}></i></span>
      {isActive(to) && <span className={`absolute bottom-2 w-1 h-1 rounded-full ${isActive(to) && to === '/dating' ? 'bg-pink-500' : 'bg-primary'}`}></span>}
      {badgeCount > 0 && <span className="absolute top-2 right-3 bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-[16px] flex items-center justify-center rounded-full border-2 border-white animate-bounce-in">{badgeCount > 9 ? '9+' : badgeCount}</span>}
    </button>
  );

  return (
    <div className={`md:hidden fixed bottom-0 left-0 right-0 z-[90] transition-transform duration-300 ease-in-out ${isVisible ? 'translate-y-0' : 'translate-y-full'}`}>
      <div className="h-[65px] bg-white/95 backdrop-blur-xl border-t border-gray-200 flex justify-between items-center shadow-[0_-5px_20px_rgba(0,0,0,0.05)] px-1 pb-safe">
        <NavItem to="/dating" icon="fa-heart" activeColor="text-pink-500" />
        <NavItem to="/circles" icon="fa-dot-circle" />
        
        {/* Messages with Red Badge */}
        <NavItem to="/messages" icon="fa-comment-dots" badgeCount={unreadMsgCount} />

        <div className="relative -top-6 mx-1">
          <button 
            onMouseDown={handlePressStart} 
            onMouseUp={handlePressEnd} 
            onTouchStart={handlePressStart} 
            onTouchEnd={handlePressEnd} 
            onClick={handleCentralClick} 
            className="w-14 h-14 bg-gradient-to-tr from-primary to-gold rounded-2xl flex items-center justify-center text-white shadow-lg shadow-primary/40 border-4 border-white transform active:scale-95 transition-transform select-none"
          >
            <i className="fas fa-cube text-2xl"></i>
          </button>
        </div>

        <NavItem to="/watch" icon="fa-play" />
        <NavItem to="/marketplace" icon="fa-store" />
        <NavItem to="/profile" icon="fa-user" />
      </div>
    </div>
  );
};

export default MobileNav;