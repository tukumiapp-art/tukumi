import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../api/firebase';
import {
  collection, query, where, orderBy, onSnapshot,
  updateDoc, doc, writeBatch, arrayUnion, deleteDoc
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import TopBar from '../components/TopBar';

// Helper for Avatar
const InitialsAvatar = ({ name, url }) => {
    const initials = name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
    if (url && !url.includes('via.placeholder')) return <img src={url} className="w-12 h-12 rounded-full object-cover border border-gray-200" alt={name} />;
    return <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-primary-light text-white flex items-center justify-center font-bold text-sm shadow-sm">{initials}</div>;
};

const Notifications = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        const q = query(collection(db, 'notifications'), where('recipientId', '==', u.uid), orderBy('timestamp', 'desc'));
        return onSnapshot(q, (snap) => {
            setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
      } else navigate('/');
    });
    return () => unsub();
  }, [navigate]);

  const handleAcceptInvite = async (e, notif) => {
      e.stopPropagation();
      try {
          const member = { uid: user.uid, name: user.displayName, avatar: user.photoURL, role: notif.role, email: user.email };
          await updateDoc(doc(db, 'business_pages', notif.pageId), { team: arrayUnion(member), teamIds: arrayUnion(user.uid) });
          await deleteDoc(doc(db, 'notifications', notif.id));
          navigate(`/business/${notif.pageId}`);
      } catch (err) { alert("Failed to accept."); }
  };

  const handleNotificationClick = async (notif) => {
      // 1. Mark as Read
      if (!notif.isRead) {
          await updateDoc(doc(db, 'notifications', notif.id), { isRead: true });
      }

      // 2. Navigate based on Type
      if (notif.type === 'team_invite') return; // Handled by buttons

      // POST INTERACTIONS -> Post Details
      if (['like', 'comment', 'mention'].includes(notif.type)) {
          // Ensure targetId exists (it is the Post ID)
          if (notif.targetId) {
            navigate(`/post/${notif.targetId}`);
          } else {
            console.error("Notification missing targetId", notif);
          }
          return;
      }

      // MARKETPLACE -> Product Details
      if (['review', 'question', 'answer'].includes(notif.type)) {
          navigate(`/product/${notif.targetId}`, { state: { activeTab: notif.type === 'review' ? 'reviews' : 'qa' } });
          return;
      }

      // PROFILE -> User Profile
      if (['follow', 'circle_join'].includes(notif.type)) {
          navigate(`/profile/${notif.senderId}`);
          return;
      }

      // BUSINESS -> Business Page
      if (['follow_business'].includes(notif.type)) {
          navigate(`/business/${notif.targetId}`);
          return;
      }

      // Default
      navigate('/');
  };

  const handleClearAll = async () => {
      if (!confirm("Clear all?")) return;
      const batch = writeBatch(db);
      notifications.forEach(n => batch.delete(doc(db, 'notifications', n.id)));
      await batch.commit();
  };

  if (loading) return <div className="p-10 text-center text-gray-500">Loading...</div>;

  return (
    <div className="p-4 md:p-6 w-full max-w-[1000px] mx-auto pb-24">
        <div className="hidden md:block"><TopBar /></div>
        
        <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="md:hidden w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-dark"><i className="fas fa-arrow-left"></i></button>
                <h1 className="text-2xl font-black text-dark">Notifications</h1>
            </div>
            {notifications.length > 0 && <button onClick={handleClearAll} className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg">Clear all</button>}
        </div>

        <div className="space-y-3">
            {notifications.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl"><i className="far fa-bell"></i></div>
                    <p>No notifications yet.</p>
                </div>
            ) : (
                notifications.map(notif => (
                <div key={notif.id} onClick={() => handleNotificationClick(notif)} className={`flex gap-4 p-4 rounded-2xl cursor-pointer transition-all border ${!notif.isRead ? 'bg-white border-primary/20 shadow-sm' : 'bg-gray-50/50 border-transparent'}`}>
                    <InitialsAvatar name={notif.senderName} url={notif.senderAvatar} />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 leading-snug">
                            <span className="font-bold">{notif.senderName}</span> 
                            {notif.type === 'like' && ' liked your post.'}
                            {notif.type === 'comment' && ' commented on your post.'}
                            {notif.type === 'follow' && ' started following you.'}
                            {/* Fallback for custom messages */}
                            {!['like','comment','follow'].includes(notif.type) && ` ${notif.message}`}
                        </p>
                        
                        {notif.type === 'team_invite' && (
                            <div className="flex gap-2 mt-2">
                                <button onClick={(e) => handleAcceptInvite(e, notif)} className="bg-primary text-white px-4 py-1.5 rounded-lg text-xs font-bold">Accept</button>
                            </div>
                        )}
                        
                        <span className="text-[10px] text-gray-400 mt-1 block">
                            {notif.timestamp?.seconds ? new Date(notif.timestamp.seconds * 1000).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : 'Just now'}
                        </span>
                    </div>
                    {!notif.isRead && <div className="w-2.5 h-2.5 bg-primary rounded-full mt-1 shrink-0"></div>}
                </div>
            )))}
        </div>
    </div>
  );
};

export default Notifications;