import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../api/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { 
    collection, query, where, onSnapshot, 
    updateDoc, doc, writeBatch, arrayUnion, deleteDoc 
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

// --- Helper: Creates Avatar or Initials Placeholder (NO DEMO PHOTO) ---
const InitialsAvatar = ({ name, url }) => {
    const initials = name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
    const hasValidImage = url && !url.includes('via.placeholder') && !url.includes('ui-avatars');
    
    if (hasValidImage) {
        return <img src={url} className="w-10 h-10 rounded-full object-cover border border-gray-100" alt={name} />;
    }
    return (
        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-primary-light text-white flex items-center justify-center font-bold text-xs shadow-sm">
            {initials}
        </div>
    );
};

const NotificationDropdown = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    
    const notificationSound = useRef(new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3'));
    const prevNotifCount = useRef(0);

    useEffect(() => {
        const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                const qNotifs = query(collection(db, 'notifications'), where('recipientId', '==', currentUser.uid));
                const unsubNotifs = onSnapshot(qNotifs, (snapshot) => {
                    let newNotifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    newNotifs.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
                    
                    if (newNotifs.length > prevNotifCount.current && !newNotifs[0]?.isRead) {
                        notificationSound.current.play().catch(e => console.log("Audio play failed"));
                    }
                    setNotifications(newNotifs);
                    prevNotifCount.current = newNotifs.length;
                });
                return () => unsubNotifs();
            }
        });

        const handleClickOutside = (e) => {
            if (!e.target.closest('.notification-container')) setShowDropdown(false);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    // Actions
    const handleAcceptInvite = async (e, notif) => {
        e.stopPropagation();
        if (!user) return;
        try {
            const newMember = { uid: user.uid, name: user.displayName || user.email, avatar: user.photoURL, role: notif.role, email: user.email };
            await updateDoc(doc(db, 'business_pages', notif.pageId), { team: arrayUnion(newMember), teamIds: arrayUnion(user.uid) });
            await deleteDoc(doc(db, 'notifications', notif.id));
            alert(`Joined ${notif.pageName} successfully!`);
            navigate(`/business/${notif.pageId}`);
            setShowDropdown(false);
        } catch (err) { alert("Failed to accept."); }
    };

    const handleDeclineInvite = async (e, notif) => {
        e.stopPropagation();
        try { await deleteDoc(doc(db, 'notifications', notif.id)); } catch (err) {}
    };

    const handleNotificationClick = async (notif) => {
        if (notif.type === 'team_invite') return;
        await updateDoc(doc(db, 'notifications', notif.id), { isRead: true });
        setShowDropdown(false);
        if (notif.type === 'follow' || notif.type === 'circle_join') navigate(`/profile/${notif.senderId}`);
        else if (notif.type === 'review' || notif.type === 'question') navigate(`/product/${notif.targetId}`);
        else if (notif.type === 'follow_business') navigate(`/business/${notif.targetId}`);
        else navigate('/'); 
    };

    const handleClearAll = async () => {
        const batch = writeBatch(db);
        notifications.forEach(n => batch.delete(doc(db, 'notifications', n.id)));
        await batch.commit();
    };

    const unreadNotifCount = notifications.filter(n => !n.isRead).length;
    if (!user) return null;

    return (
        <div className="relative notification-container z-50">
            <div onClick={() => setShowDropdown(!showDropdown)} className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all relative ${showDropdown ? 'bg-primary text-white shadow-lg' : 'bg-[#F8FAFD] text-[#2C3E50] hover:shadow-md hover:scale-105'}`}>
                <i className="fas fa-bell text-lg"></i>
                {unreadNotifCount > 0 && <span className="absolute top-0 right-0 bg-accent text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full border-2 border-white animate-bounce-in">{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</span>}
            </div>

            {showDropdown && (
                <>
                    {/* MOBILE: Fixed Center Position */}
                    <div className="md:hidden fixed top-20 left-4 right-4 bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] border border-gray-100 overflow-hidden animate-fade-in z-[101]">
                        <div className="p-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                            <h3 className="font-bold text-dark">Notifications</h3>
                            {notifications.length > 0 && <button onClick={handleClearAll} className="text-xs text-gray-400 hover:text-red-500">Clear All</button>}
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto">
                            <NotificationList notifications={notifications} handleNotificationClick={handleNotificationClick} handleAcceptInvite={handleAcceptInvite} handleDeclineInvite={handleDeclineInvite} />
                        </div>
                    </div>

                    {/* DESKTOP: Absolute Right Position */}
                    <div className="hidden md:block absolute top-14 right-0 w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-fade-in z-[101]">
                        <div className="p-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                            <h3 className="font-bold text-dark">Notifications</h3>
                            {notifications.length > 0 && <button onClick={handleClearAll} className="text-xs text-gray-400 hover:text-red-500">Clear All</button>}
                        </div>
                        <div className="max-h-80 overflow-y-auto">
                            <NotificationList notifications={notifications} handleNotificationClick={handleNotificationClick} handleAcceptInvite={handleAcceptInvite} handleDeclineInvite={handleDeclineInvite} />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

const NotificationList = ({ notifications, handleNotificationClick, handleAcceptInvite, handleDeclineInvite }) => (
    <>
        {notifications.length > 0 ? notifications.map(notif => (
            <div key={notif.id} onClick={() => handleNotificationClick(notif)} className={`p-4 flex gap-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${!notif.isRead ? 'bg-blue-50/30' : ''}`}>
                <InitialsAvatar name={notif.senderName} url={notif.senderAvatar} />
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 leading-tight break-words">
                        <span className="font-bold">{notif.senderName}</span> 
                        {notif.type === 'team_invite' && ` invited you to join ${notif.pageName} as ${notif.role}.`}
                        {notif.type === 'review' && ` ${notif.message || 'reviewed your product.'}`}
                        {notif.type === 'question' && ` ${notif.message || 'asked a question.'}`}
                        {notif.type === 'follow_business' && ` ${notif.message}`}
                        {notif.type === 'like' && ' liked your post.'}
                        {notif.type === 'comment' && ' commented on your post.'}
                        {notif.type === 'follow' && ' started following you.'}
                    </p>
                    {notif.type === 'team_invite' && (
                        <div className="flex gap-2 mt-2">
                            <button onClick={(e) => handleAcceptInvite(e, notif)} className="bg-primary text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-primary-dark shadow-sm">Accept</button>
                            <button onClick={(e) => handleDeclineInvite(e, notif)} className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-xs font-bold hover:bg-gray-200">Decline</button>
                        </div>
                    )}
                    <p className="text-xs text-gray-400 mt-1">{notif.timestamp?.seconds ? new Date(notif.timestamp.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now'}</p>
                </div>
                {!notif.isRead && notif.type !== 'team_invite' && <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>}
            </div>
        )) : <div className="p-8 text-center text-gray-400"><i className="far fa-bell-slash text-2xl mb-2"></i><p className="text-sm">No notifications.</p></div>}
    </>
);

export default NotificationDropdown;