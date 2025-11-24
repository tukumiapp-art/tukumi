import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../api/firebase';
import { 
  collection, query, where, orderBy, onSnapshot, 
  doc, updateDoc, arrayUnion, arrayRemove, increment, 
  addDoc, serverTimestamp 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import TopBar from '../components/TopBar';

// --- HELPER: Avatar (Consistent with other pages) ---
const Avatar = ({ src, name, size = "md", className = "" }) => {
  const initials = name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
  const sizeClasses = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-12 h-12 text-base", xl: "w-16 h-16 text-xl" };
  
  // Check for placeholder or null
  const isValidSrc = src && !src.includes('via.placeholder');
  
  if (isValidSrc) {
    return <img src={src} className={`${sizeClasses[size]} rounded-full object-cover border border-gray-200 ${className}`} alt={name} />;
  }
  
  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-tr from-primary to-primary-light text-white flex items-center justify-center font-bold shadow-inner ${className}`}>
      {initials}
    </div>
  );
};

// --- COMPONENT: Comment Section ---
const WatchComments = ({ postId, user }) => {
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'posts', postId, 'comments'), orderBy('timestamp', 'asc'));
        const unsub = onSnapshot(q, snap => {
            setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, [postId]);

    const handleSend = async () => {
        if (!newComment.trim() || !user) return;
        await addDoc(collection(db, 'posts', postId, 'comments'), {
            text: newComment,
            uid: user.uid,
            userName: user.displayName,
            userAvatar: user.photoURL,
            timestamp: serverTimestamp()
        });
        await updateDoc(doc(db, 'posts', postId), { comments: increment(1) });
        setNewComment('');
    };

    return (
        <div className="bg-gray-50 p-4 rounded-xl mt-4 animate-fade-in">
            <div className="max-h-60 overflow-y-auto space-y-3 mb-4 pr-2 custom-scrollbar">
                {comments.length === 0 && <p className="text-center text-gray-400 text-sm">No comments yet.</p>}
                {comments.map(c => (
                    <div key={c.id} className="flex gap-3 items-start">
                        <Avatar src={c.userAvatar} name={c.userName} size="sm" />
                        <div className="bg-white p-2 rounded-lg rounded-tl-none shadow-sm border border-gray-100 flex-1">
                            <p className="text-xs font-bold text-dark">{c.userName}</p>
                            <p className="text-sm text-gray-700">{c.text}</p>
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex gap-2">
                <input 
                    value={newComment} 
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="Write a comment..." 
                    className="flex-1 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm outline-none focus:border-primary"
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                />
                <button onClick={handleSend} disabled={!newComment.trim()} className="w-9 h-9 bg-primary text-white rounded-full flex items-center justify-center shadow-md hover:scale-105 transition-transform disabled:opacity-50">
                    <i className="fas fa-paper-plane text-xs"></i>
                </button>
            </div>
        </div>
    );
};

const Watch = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCommentId, setActiveCommentId] = useState(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => setUser(u));

    // Query specifically for VIDEO posts
    const q = query(
        collection(db, 'posts'), 
        where('mediaType', '==', 'video'), 
        orderBy('timestamp', 'desc')
    );

    const unsubVideos = onSnapshot(q, (snap) => {
        const videoData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setVideos(videoData);
        setLoading(false);
    });

    return () => { unsubAuth(); unsubVideos(); };
  }, []);

  // --- ACTIONS ---
  const handleLike = async (post) => {
      if (!user) return alert("Please sign in to like.");
      const postRef = doc(db, 'posts', post.id);
      const isLiked = post.likedBy && post.likedBy.includes(user.uid);
      
      if (isLiked) {
          await updateDoc(postRef, { likes: increment(-1), likedBy: arrayRemove(user.uid) });
      } else {
          await updateDoc(postRef, { likes: increment(1), likedBy: arrayUnion(user.uid) });
      }
  };

  const handleShare = (post) => {
      const url = `${window.location.origin}/post/${post.id}`; 
      if (navigator.share) {
          navigator.share({ title: 'Check out this video on Tukumi', text: post.text, url });
      } else {
          navigator.clipboard.writeText(url);
          alert("Link copied to clipboard!");
      }
  };

  const toggleComments = (postId) => {
      setActiveCommentId(activeCommentId === postId ? null : postId);
  };

  return (
    <div className="p-4 md:p-6 w-full max-w-[1000px] mx-auto">
      <div className="hidden md:block"><TopBar /></div>
      
      <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center text-white shadow-lg shadow-red-500/30">
              <i className="fas fa-play text-xl ml-1"></i>
          </div>
          <div>
              <h2 className="text-3xl font-black text-dark tracking-tight">Watch</h2>
              <p className="text-gray-500 font-medium">Trending videos for you</p>
          </div>
      </div>

      {loading ? (
          <div className="text-center py-20 text-gray-400 animate-pulse">Loading Videos...</div>
      ) : (
          <div className="space-y-8">
              {videos.length === 0 ? (
                  <div className="text-center py-20 bg-white rounded-[30px] shadow-sm">
                      <i className="fas fa-video-slash text-4xl text-gray-300 mb-4"></i>
                      <p className="text-gray-500 font-bold">No videos uploaded yet.</p>
                      <p className="text-sm text-gray-400">Be the first to upload a video in the Feed!</p>
                  </div>
              ) : (
                  videos.map(video => {
                      const isLiked = user && video.likedBy && video.likedBy.includes(user.uid);
                      
                      return (
                          <div key={video.id} className="bg-white rounded-[30px] overflow-hidden shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                              
                              {/* Header */}
                              <div className="p-4 flex items-center justify-between">
                                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/profile/${video.uid}`)}>
                                      <Avatar src={video.userAvatar} name={video.userName} />
                                      <div>
                                          <h4 className="font-bold text-dark text-sm">{video.userName}</h4>
                                          <p className="text-xs text-gray-400">
                                              {video.timestamp?.seconds ? new Date(video.timestamp.seconds * 1000).toLocaleDateString() : 'Just now'}
                                          </p>
                                      </div>
                                  </div>
                                  <button className="text-gray-400 hover:text-dark"><i className="fas fa-ellipsis-h"></i></button>
                              </div>

                              {/* Video Player */}
                              <div className="bg-black relative group">
                                  <video 
                                      src={video.mediaURL} 
                                      className="w-full max-h-[600px] object-contain mx-auto" 
                                      controls 
                                      loop
                                      playsInline
                                  />
                              </div>

                              {/* Caption */}
                              {video.text && (
                                  <div className="px-6 pt-4">
                                      <p className="text-gray-800 text-sm leading-relaxed">{video.text}</p>
                                  </div>
                              )}

                              {/* Action Bar */}
                              <div className="p-4 px-6 flex items-center justify-between border-t border-gray-50 mt-2">
                                  <div className="flex gap-6">
                                      {/* LOVE */}
                                      <button 
                                          onClick={() => handleLike(video)} 
                                          className={`flex items-center gap-2 font-bold transition-colors ${isLiked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}
                                      >
                                          <i className={`${isLiked ? 'fas' : 'far'} fa-heart text-xl`}></i>
                                          <span>{video.likes || 0}</span>
                                      </button>

                                      {/* COMMENT */}
                                      <button 
                                          onClick={() => toggleComments(video.id)} 
                                          className="flex items-center gap-2 font-bold text-gray-500 hover:text-primary transition-colors"
                                      >
                                          <i className="far fa-comment text-xl"></i>
                                          <span>{video.comments || 0}</span>
                                      </button>

                                      {/* SHARE */}
                                      <button 
                                          onClick={() => handleShare(video)} 
                                          className="flex items-center gap-2 font-bold text-gray-500 hover:text-dark transition-colors"
                                      >
                                          <i className="far fa-share-square text-xl"></i>
                                      </button>
                                  </div>
                              </div>

                              {/* Comments Section */}
                              {activeCommentId === video.id && (
                                  <div className="px-4 pb-4">
                                      <WatchComments postId={video.id} user={user} />
                                  </div>
                              )}
                          </div>
                      );
                  })
              )}
          </div>
      )}
    </div>
  );
};

export default Watch;