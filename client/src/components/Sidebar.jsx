import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../api/firebase'; 
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';

const Sidebar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const isActive = (path) => location.pathname === path || (path !== '/' && location.pathname.startsWith(path + '/'));
    
    const [userData, setUserData] = useState({ 
        displayName: '', 
        handle: '', 
        photoURL: null 
    });
    const [isAdmin, setIsAdmin] = useState(false);
    const [unreadMsgCount, setUnreadMsgCount] = useState(0);
    
    // NEW: State to track if the main profile image failed to load
    const [imgError, setImgError] = useState(false);

    // 1. User Profile & Admin Check
    useEffect(() => {
        const unsubAuth = onAuthStateChanged(auth, (user) => {
            if (user) {
                const initialData = {
                    displayName: user.displayName || 'Aristocrat',
                    handle: user.email ? user.email.split('@')[0] : 'user-handle',
                    photoURL: user.photoURL
                };
                setUserData(initialData);
                // Reset error state when user changes
                setImgError(false);

                const unsubDb = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setUserData(prev => ({
                            ...prev,
                            ...data,
                            // Keep auth photo if DB photo is missing
                            photoURL: data.photoURL || prev.photoURL 
                        }));
                        setIsAdmin(data.isAdmin || false);
                    }
                });
                return () => unsubDb();
            } else {
                setUserData({ displayName: '', handle: '', photoURL: null });
                setIsAdmin(false);
                setUnreadMsgCount(0);
            }
        });
        return () => unsubAuth();
    }, []);

    // 2. Unread Messages Listener
    useEffect(() => {
        const user = auth.currentUser;
        if (!user) return;

        const q = query(
            collection(db, 'conversations'),
            where('participants', 'array-contains', user.uid)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            let count = 0;
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.unreadCounts && data.unreadCounts[user.uid]) {
                    count += data.unreadCounts[user.uid];
                }
            });
            setUnreadMsgCount(count);
        }, (error) => {
            console.log("Sidebar chat listener:", error.code); 
        });

        return () => unsubscribe();
    }, [userData.handle]); 

    const handleSignOut = async () => {
        try {
            await signOut(auth);
            navigate('/auth'); 
        } catch (error) {
            console.error("Error signing out", error);
        }
    };

    const NavItem = ({ to, icon, label, badge }) => (
        <div 
            onClick={() => navigate(to)}
            className={`group flex items-center p-3 my-2 rounded-2xl cursor-pointer transition-all duration-200 font-medium
            ${isActive(to) && to !== '/' 
                ? 'bg-primary text-white shadow-lg shadow-primary/30 translate-x-2' 
                : isActive(to) && to === '/' && location.pathname === '/'
                ? 'bg-primary text-white shadow-lg shadow-primary/30 translate-x-2'
                : 'text-gray-600 hover:bg-white hover:text-primary hover:translate-x-1'}`}
        >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mr-3 transition-all
                ${isActive(to) ? 'bg-white/20' : 'bg-white shadow-sm group-hover:shadow-md'}`}>
                <i className={`fas ${icon} text-lg`}></i>
            </div>
            <span className="tracking-wide">{label}</span>
            {badge > 0 && <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-sm">{badge > 99 ? '99+' : badge}</span>}
        </div>
    );

    return (
        <div className="hidden md:flex flex-col w-[280px] h-[calc(100vh-40px)] fixed top-5 left-5 z-50">
            
            <div className="glass-panel flex-1 rounded-[30px] p-6 flex flex-col overflow-y-auto no-scrollbar">
                
                {/* Logo */}
                <div className="flex items-center gap-3 mb-10 pl-2 cursor-pointer" onClick={() => navigate('/')}>
                    <div className="w-10 h-10 bg-gradient-to-tr from-primary to-gold rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 relative">
                        <i className="fas fa-cube text-white text-lg transform -rotate-12"></i>
                    </div>
                    <h1 className="text-2xl font-black tracking-tighter text-dark">TUKUMI</h1>
                </div>

                {/* Profile Card */}
                <div onClick={() => navigate('/profile')} className="mb-8 p-3 bg-white/60 rounded-2xl border border-white flex items-center gap-3 cursor-pointer hover:shadow-md transition-all group">
                    <div className="w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden bg-gray-200 border border-white shadow-sm group-hover:scale-105 transition-transform flex items-center justify-center">
                        {/* FIXED IMAGE LOGIC:
                           1. If we have a URL and no error, try to show image.
                           2. If image fails (onError), setImgError(true).
                           3. If no URL or error, show the gray box with user icon (Facebook Style).
                        */}
                        {userData.photoURL && !imgError ? (
                            <img 
                                src={userData.photoURL} 
                                onError={() => setImgError(true)} 
                                className="w-full h-full object-cover" 
                                alt="Profile" 
                            />
                        ) : (
                            <i className="fas fa-user text-gray-400 text-lg"></i>
                        )}
                    </div>
                    <div className="min-w-0">
                        <h4 className="font-bold text-sm text-dark truncate">{userData.displayName || 'User'}</h4>
                        <p className="text-[10px] text-primary font-bold uppercase tracking-wider">View Profile</p>
                    </div>
                </div>

                {/* Menu */}
                <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-bold mb-3 pl-4">Menu</p>
                    
                    <NavItem to="/" icon="fa-home" label="Feed" />
                    <NavItem to="/explore" icon="fa-compass" label="Explore" />
                    <NavItem to="/circles" icon="fa-dot-circle" label="Circles" />
                    <NavItem to="/dating" icon="fa-heart" label="Dating" />
                    <NavItem to="/watch" icon="fa-play" label="Watch" />
                    <NavItem to="/marketplace" icon="fa-store" label="Market" />
                    
                    <NavItem to="/messages" icon="fa-comment-dots" label="Shinobi" badge={unreadMsgCount} />
                    
                    {isAdmin && <NavItem to="/admin" icon="fa-shield-alt" label="Admin Panel" />}
                    <NavItem to="/boost" icon="fa-rocket" label="Boost" />
                </div>

                {/* Footer */}
                <div className="mt-auto pt-6 space-y-3">
                    <button 
                        onClick={handleSignOut} 
                        className="w-full flex items-center justify-center gap-2 p-3 rounded-xl text-gray-500 hover:bg-red-50 hover:text-red-500 transition-all font-bold text-sm"
                    >
                        <i className="fas fa-sign-out-alt"></i> Sign Out
                    </button>
                </div>

            </div>
        </div>
    );
};

export default Sidebar;