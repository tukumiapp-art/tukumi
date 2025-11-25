import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../api/firebase';
import {
  collection, query, where, orderBy, onSnapshot,
  updateDoc, doc, writeBatch, arrayUnion, deleteDoc
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import TopBar from '../components/TopBar';

// --- Helper: Avatar ---
const InitialsAvatar = ({ name, url }) => {
    const initials = name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
    const hasValidImage = url && !url.includes('via.placeholder') && !url.includes('ui-avatars');

    if (hasValidImage) {
        return <img src={url} className="w-12 h-12 rounded-full object-cover border border-gray-200" alt={name} />;
    }
    return (
        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-primary-light text-white flex items-center justify-center font-bold text-sm shadow-sm">
            {initials}
        </div>
    );
};

const Notifications = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);

        const q = query(
            collection(db, 'notifications'),
            where('recipientId', '==', currentUser.uid),
            orderBy('timestamp', 'desc')
        );

        const unsubNotifs = onSnapshot(q, (snapshot) => {
            const notifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setNotifications(notifs);
            setLoading(false);
        });

        return () => unsubNotifs();
      } else {
          navigate('/');
      }
    });
    return () => unsubAuth();
  }, [navigate]);

  // --- Handlers ---

  const handleAcceptInvite = async (e, notif) => {
      e.stopPropagation();
      if (!user) return;
      try {
          const newMember = {
              uid: user.uid,
              name: user.displayName || user.email,
              avatar: user.photoURL,
              role: notif.role,
              email: user.email
          };

          await updateDoc(doc(db, 'business_pages', notif.pageId), {
              team: arrayUnion(newMember),
              teamIds: arrayUnion(user.uid)
          });

          await deleteDoc(doc(db, 'notifications', notif.id));
          alert(`Joined ${notif.pageName} successfully!`);
          navigate(`/business/${notif.pageId}`);
      } catch (err) {
          console.error("Accept error:", err);
          alert("Failed to accept. You might already be a member.");
      }
  };

  const handleDeclineInvite = async (e, notif) => {
      e.stopPropagation();
      try { await deleteDoc(doc(db, 'notifications', notif.id)); } catch (err) { console.error(err); }
  };

  // --- UPDATED HANDLER WITH SMART NAVIGATION ---
  const handleNotificationClick = async (notif) => {
      if (notif.type === 'team_invite') return; // Handled by buttons

      // 1. Mark as read
      if (!notif.isRead) {
          await updateDoc(doc(db, 'notifications', notif.id), { isRead: true });
      }

      // NOTE: Removed setShowDropdown(false) since this is the full page component.

      // 2. SMART NAVIGATION
      switch (notif.type) {
          case 'like':
          case 'mention':
              // Go to the specific post
              navigate(`/post/${notif.targetId}`);
              break;

          case 'comment':
              // Go to post and pass comment ID to highlight it (optional feature)
              navigate(`/post/${notif.targetId}`, { state: { commentId: notif.commentId } });
              break;

          case 'review':
              // Go to product and open Reviews tab
              navigate(`/product/${notif.targetId}`, { state: { activeTab: 'reviews' } });
              break;

          case 'question':
          case 'answer':
              // Go to product and open Q&A tab
              navigate(`/product/${notif.targetId}`, { state: { activeTab: 'qa' } });
              break;

          case 'follow':
          case 'circle_join':
              // Go to User Profile
              navigate(`/profile/${notif.senderId}`);
              break;

          case 'follow_business':
              // Go to Business Page
              navigate(`/business/${notif.targetId}`);
              break;

          default:
              navigate('/');
      }
  };


  const handleClearAll = async () => {
      if (!confirm("Clear all notifications?")) return;
      const batch = writeBatch(db);
      notifications.forEach(n => batch.delete(doc(db, 'notifications', n.id)));
      await batch.commit();
  };

  const handleMarkAllRead = async () => {
      const batch = writeBatch(db);
      notifications.forEach(n => {
          if (!n.isRead) batch.update(doc(db, 'notifications', n.id), { isRead: true });
      });
      await batch.commit();
  };

  if (loading) return <div className="p-10 text-center text-gray-500">Loading notifications...</div>;

  return (
    <div className="p-4 md:p-6 w-full max-w-[1000px] mx-auto pb-24">
        <div className="hidden md:block"><TopBar /></div>

        <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="md:hidden w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-dark"><i className="fas fa-arrow-left"></i></button>
                <h1 className="text-2xl font-black text-dark">Notifications</h1>
                {notifications.length > 0 && <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">{notifications.filter(n => !n.isRead).length} New</span>}
            </div>
            {notifications.length > 0 && (
                <div className="flex gap-2">
                    <button onClick={handleMarkAllRead} className="text-xs font-bold text-primary hover:bg-primary/10 px-3 py-2 rounded-lg transition-colors">Mark all read</button>
                    <button onClick={handleClearAll} className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors">Clear all</button>
                </div>
            )}
        </div>

        <div className="space-y-3">
            {notifications.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[30px] shadow-sm border border-dashed border-gray-200">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300 text-3xl">
                        <i className="far fa-bell-slash"></i>
                    </div>
                    <h3 className="font-bold text-gray-500">No notifications yet</h3>
                    <p className="text-sm text-gray-400 mt-1">When you get notifications, they'll show up here.</p>
                </div>
            ) : (
                notifications.map(notif => (
                    <div
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={`relative group flex gap-4 p-4 rounded-2xl cursor-pointer transition-all border
                        ${!notif.isRead ? 'bg-white border-primary/20 shadow-sm' : 'bg-gray-50/50 border-transparent hover:bg-white hover:shadow-sm'}`}
                    >
                        <InitialsAvatar name={notif.senderName} url={notif.senderAvatar} />

                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                                <p className="text-sm text-gray-800 leading-snug pr-8">
                                    <span className="font-bold text-dark">{notif.senderName}</span>
                                    <span className="text-gray-600">
                                        {notif.type === 'team_invite' && ` invited you to join ${notif.pageName} as ${notif.role}.`}
                                        {notif.type === 'review' && ` ${notif.message || 'reviewed your product.'}`}
                                        {notif.type === 'question' && ` ${notif.message || 'asked a question.'}`}
                                        {notif.type === 'answer' && ` ${notif.message || 'answered your question.'}`}
                                        {notif.type === 'follow_business' && ` ${notif.message}`}
                                        {notif.type === 'like' && ' liked your post.'}
                                        {notif.type === 'comment' && ' commented on your post.'}
                                        {notif.type === 'follow' && ' started following you.'}
                                        {notif.type === 'mention' && ' mentioned you.'}
                                    </span>
                                </p>
                                <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap flex-shrink-0">
                                    {notif.timestamp?.seconds ? new Date(notif.timestamp.seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                                </span>
                            </div>

                            {/* Action Buttons for Team Invites */}
                            {notif.type === 'team_invite' && (
                                <div className="flex gap-3 mt-3">
                                    <button
                                        onClick={(e) => handleAcceptInvite(e, notif)}
                                        className="bg-primary text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md hover:bg-primary-dark transition-all"
                                    >
                                        Accept Invite
                                    </button>
                                    <button
                                        onClick={(e) => handleDeclineInvite(e, notif)}
                                        className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-gray-50 transition-all"
                                    >
                                        Decline
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Unread Indicator */}
                        {!notif.isRead && (
                            <div className="absolute top-1/2 right-4 -translate-y-1/2 w-2.5 h-2.5 bg-primary rounded-full"></div>
                        )}
                    </div>
                ))
            )}
        </div>
    </div>
  );
};

export default Notifications;