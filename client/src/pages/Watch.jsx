import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../api/firebase';
import { 
  collection, query, where, orderBy, onSnapshot, 
  doc, updateDoc, arrayUnion, arrayRemove, increment, 
  addDoc, serverTimestamp, getDoc, writeBatch
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// --- HELPER: Avatar ---
const Avatar = ({ src, name, size = "md", className = "" }) => {
  const initials = name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
  const sizeClasses = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-12 h-12 text-base", xl: "w-16 h-16 text-xl" };
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

// --- COMPONENT: Smart Video Player ---
const VideoItem = ({ video, isActive, toggleComments, handleLike, handleShare, handleFollow, isLiked, isFollowing }) => {
    const videoRef = useRef(null);

    useEffect(() => {
        if (isActive) {
            videoRef.current?.play().catch(() => {}); 
        } else {
            videoRef.current?.pause(); 
            if(videoRef.current) videoRef.current.currentTime = 0; 
        }
    }, [isActive]);

    return (
        <div className="snap-start h-[100vh] w-full relative flex items-center justify-center bg-black overflow-hidden shrink-0">
            {/* Video */}
            <video 
                ref={videoRef}
                src={video.mediaURL} 
                className="w-full h-full object-cover opacity-100" 
                loop
                playsInline
                onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current.pause()}
            />

            {/* Overlay Gradient */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60 pointer-events-none"></div>

            {/* Right Side Actions */}
            <div className="absolute right-4 bottom-24 flex flex-col gap-6 items-center z-20">
                {/* Avatar & Follow */}
                <div className="relative group">
                    <Avatar src={video.userAvatar} name={video.userName} size="md" className="border-2 border-white shadow-lg" />
                    {!isFollowing && (
                        <button onClick={() => handleFollow(video.uid)} className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-red-500 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] shadow-md hover:scale-110 transition-transform">
                            <i className="fas fa-plus"></i>
                        </button>
                    )}
                    {isFollowing && (
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-green-500 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] shadow-md animate-scale-in">
                            <i className="fas fa-check"></i>
                        </div>
                    )}
                </div>

                <button onClick={() => handleLike(video)} className="flex flex-col items-center gap-1 group">
                    <div className={`w-12 h-12 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-2xl transition-all ${isLiked ? 'text-red-500' : 'text-white group-hover:scale-110'}`}>
                        <i className={`${isLiked ? 'fas' : 'far'} fa-heart shadow-sm`}></i>
                    </div>
                    <span className="text-white text-xs font-bold drop-shadow-md">{video.likes || 0}</span>
                </button>

                <button onClick={() => toggleComments(video.id)} className="flex flex-col items-center gap-1 group">
                    <div className="w-12 h-12 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white text-2xl transition-all group-hover:scale-110">
                        <i className="fas fa-comment-dots shadow-sm"></i>
                    </div>
                    <span className="text-white text-xs font-bold drop-shadow-md">{video.comments || 0}</span>
                </button>

                <button onClick={() => handleShare(video)} className="flex flex-col items-center gap-1 group">
                    <div className="w-12 h-12 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white text-2xl transition-all group-hover:scale-110">
                        <i className="fas fa-share shadow-sm"></i>
                    </div>
                    <span className="text-white text-xs font-bold drop-shadow-md">Share</span>
                </button>
            </div>

            {/* Bottom Info */}
            <div className="absolute bottom-8 left-4 right-16 z-10 text-white text-left">
                <h3 className="font-black text-lg shadow-black drop-shadow-md flex items-center gap-2">
                    @{video.userName.replace(/\s+/g, '').toLowerCase()} 
                </h3>
                <p className="text-sm opacity-95 mt-2 line-clamp-2 leading-relaxed font-medium drop-shadow-md">
                    {video.text} <span className="text-blue-300 font-bold">#{video.category || 'viral'}</span>
                </p>
                <div className="flex items-center gap-2 mt-3 text-xs font-bold opacity-90">
                    <i className="fas fa-music"></i>
                    <div className="w-40 overflow-hidden"><p className="whitespace-nowrap animate-marquee">Original Sound - {video.userName} • Tukumi Music</p></div>
                </div>
            </div>
        </div>
    );
};

// --- COMPONENT: Watch Comments ---
const WatchComments = ({ postId, user, onClose }) => {
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [replyingTo, setReplyingTo] = useState(null);

    useEffect(() => {
        const q = query(collection(db, 'posts', postId, 'comments'), orderBy('timestamp', 'asc'));
        const unsub = onSnapshot(q, snap => setComments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => unsub();
    }, [postId]);

    const handleSend = async () => {
        if (!newComment.trim() || !user) return;
        await addDoc(collection(db, 'posts', postId, 'comments'), { 
            text: newComment, uid: user.uid, userName: user.displayName, 
            userAvatar: user.photoURL, parentId: replyingTo?.id || null, timestamp: serverTimestamp() 
        });
        await updateDoc(doc(db, 'posts', postId), { comments: increment(1) });
        setNewComment(''); setReplyingTo(null);
    };

    const rootComments = comments.filter(c => !c.parentId);
    const getReplies = (pid) => comments.filter(c => c.parentId === pid);

    return (
        <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[30px] shadow-2xl z-50 h-[65vh] flex flex-col animate-slide-up">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                <h4 className="font-black text-dark">Comments <span className="text-gray-400 text-sm font-normal">({comments.length})</span></h4>
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"><i className="fas fa-times"></i></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar pb-20">
                {rootComments.map(c => (
                    <div key={c.id} className="space-y-2">
                        <div className="flex gap-3">
                            <Avatar src={c.userAvatar} name={c.userName} size="sm" />
                            <div className="flex-1">
                                <div className="bg-gray-50 p-2 px-3 rounded-2xl rounded-tl-none inline-block">
                                    <p className="text-xs font-bold text-dark">{c.userName}</p>
                                    <p className="text-sm text-gray-700">{c.text}</p>
                                </div>
                                <button onClick={() => { setReplyingTo({ id: c.id, name: c.userName }); setNewComment(`@${c.userName} `); }} className="text-[10px] font-bold text-gray-400 ml-2 hover:text-primary block mt-1">Reply</button>
                            </div>
                        </div>
                        {getReplies(c.id).map(r => (
                            <div key={r.id} className="flex gap-3 ml-10">
                                <Avatar src={r.userAvatar} name={r.userName} size="sm" className="w-6 h-6" />
                                <div className="bg-gray-50 p-2 px-3 rounded-2xl rounded-tl-none inline-block">
                                    <p className="text-xs font-bold text-dark">{r.userName}</p>
                                    <p className="text-sm text-gray-700">{r.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
            <div className="p-4 border-t border-gray-100 bg-white absolute bottom-0 w-full rounded-t-none rounded-b-[30px]">
                {replyingTo && <div className="flex justify-between text-xs text-gray-400 mb-2 bg-gray-50 p-2 rounded-lg"><span>Replying to <b>{replyingTo.name}</b></span><button onClick={() => { setReplyingTo(null); setNewComment(''); }}><i className="fas fa-times"></i></button></div>}
                <div className="flex gap-2">
                    <input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Add a comment..." className="flex-1 bg-gray-100 border-none rounded-full px-5 py-3 text-sm outline-none" onKeyDown={e => e.key === 'Enter' && handleSend()} />
                    <button onClick={handleSend} disabled={!newComment.trim()} className="w-11 h-11 bg-primary text-white rounded-full flex items-center justify-center shadow-lg disabled:opacity-50"><i className="fas fa-paper-plane"></i></button>
                </div>
            </div>
        </div>
    );
};

// --- MAIN PAGE ---
const Watch = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [followingList, setFollowingList] = useState([]); // Track who I follow
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeVideoId, setActiveVideoId] = useState(null);
  const [showComments, setShowComments] = useState(null);
  
  // Filtering
  const [category, setCategory] = useState('For You');
  const [showFilter, setShowFilter] = useState(false);

  const observer = useRef(null);
  const categories = ['For You', 'Trending', 'Music', 'Gaming', 'Comedy', 'Tech', 'Sports', 'Dance', 'Food'];

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (u) {
            // Listen to my profile to get following list
            const userRef = doc(db, 'users', u.uid);
            const unsubUser = onSnapshot(userRef, (snap) => {
                if (snap.exists()) {
                    // Assuming 'following' is just a count, we need the subcollection or array
                    // For simplicity in this schema, let's assume we check a subcollection 'following' manually or add an array 'followingIds'
                    // Implementing a simpler array check for the Follow button UI:
                    // We will check the 'following' subcollection IDs.
                    // Actually, let's stick to the standard way:
                    // We need to fetch who I follow to show the green checkmark.
                    // Since that might be heavy, we will just fetch it once or rely on a simpler 'followingIds' array if we added one.
                    // Let's assume we create/maintain a 'followingIds' array in the user doc for easy UI checks.
                    // If not, we'd have to query the subcollection.
                    // I'll implement the subcollection query for the current video author on demand? 
                    // No, let's maintain a local list of followed IDs for the session.
                }
            });
            
            // Load following IDs (simplified for UI)
            const qFollow = collection(db, 'users', u.uid, 'following');
            getDocs(qFollow).then(snap => {
                setFollowingList(snap.docs.map(d => d.id));
            });
        }
    });

    // Video Query
    const q = query(collection(db, 'posts'), where('mediaType', '==', 'video'), orderBy('timestamp', 'desc'));
    const unsubVideos = onSnapshot(q, (snap) => {
        const videoData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setVideos(videoData);
        if (videoData.length > 0 && !activeVideoId) setActiveVideoId(videoData[0].id);
        setLoading(false);
    });

    return () => { unsubAuth(); unsubVideos(); };
  }, []);

  // Auto-Play Logic
  useEffect(() => {
      const options = { root: null, rootMargin: '0px', threshold: 0.6 }; 
      observer.current = new IntersectionObserver((entries) => {
          entries.forEach((entry) => { if (entry.isIntersecting) setActiveVideoId(entry.target.getAttribute('data-id')); });
      }, options);
      const elements = document.querySelectorAll('.video-snap-item');
      elements.forEach(el => observer.current.observe(el));
      return () => { if (observer.current) observer.current.disconnect(); };
  }, [videos, category]);

  const getFilteredVideos = () => {
      let filtered = [...videos];
      if (category === 'Trending') filtered.sort((a, b) => (b.likes || 0) - (a.likes || 0));
      else if (category !== 'For You') {
          filtered = filtered.filter(v => v.category === category || v.text?.toLowerCase().includes(`#${category.toLowerCase()}`));
      }
      return filtered;
  };

  const displayedVideos = getFilteredVideos();

  // ACTIONS
  const handleLike = async (post) => {
      if (!user) return alert("Sign in to like");
      const postRef = doc(db, 'posts', post.id);
      const isLiked = post.likedBy && post.likedBy.includes(user.uid);
      if (isLiked) await updateDoc(postRef, { likes: increment(-1), likedBy: arrayRemove(user.uid) });
      else await updateDoc(postRef, { likes: increment(1), likedBy: arrayUnion(user.uid) });
  };

  const handleShare = (post) => {
      navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`);
      alert("Link copied!");
  };

  const handleFollow = async (creatorId) => {
      if (!user) return alert("Sign in to follow");
      if (creatorId === user.uid) return; // Can't follow self

      const batch = writeBatch(db);
      const myRef = doc(db, 'users', user.uid);
      const creatorRef = doc(db, 'users', creatorId);
      
      // Add to my following subcollection
      const myFollowingRef = doc(db, 'users', user.uid, 'following', creatorId);
      batch.set(myFollowingRef, { timestamp: serverTimestamp() });
      
      // Add to creator's followers subcollection
      const creatorFollowerRef = doc(db, 'users', creatorId, 'followers', user.uid);
      batch.set(creatorFollowerRef, { timestamp: serverTimestamp() });

      // Update counts
      batch.update(myRef, { following: increment(1) });
      batch.update(creatorRef, { followers: increment(1) });

      await batch.commit();
      setFollowingList(prev => [...prev, creatorId]); // Optimistic UI update
  };

  return (
    <div className="fixed inset-0 bg-black text-white z-0 w-full max-w-[1400px] mx-auto overflow-hidden">
      
      {/* FLOATING HEADER (FILTER ICON) */}
      <div className="absolute top-0 left-0 right-0 z-30 p-4 flex justify-between items-start pointer-events-none">
          {/* App Logo */}
          <div className="pointer-events-auto bg-white/10 backdrop-blur-md p-2 rounded-xl shadow-lg border border-white/10">
             <div className="w-8 h-8 bg-gradient-to-tr from-primary to-gold rounded-lg flex items-center justify-center">
                 <i className="fas fa-cube text-white text-xs"></i>
             </div>
          </div>

          {/* Filter Button */}
          <div className="pointer-events-auto flex flex-col items-end gap-2">
              <button onClick={() => setShowFilter(!showFilter)} className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/20 shadow-lg border border-white/10 transition-all">
                  <i className="fas fa-sliders-h"></i>
              </button>
              
              {/* CATEGORY POPUP */}
              {showFilter && (
                  <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-3 shadow-2xl border border-white/20 flex flex-col gap-2 w-40 animate-scale-in origin-top-right text-dark">
                      <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-2">Select Feed</h4>
                      {categories.map(cat => (
                          <button 
                            key={cat} 
                            onClick={() => { setCategory(cat); setShowFilter(false); }}
                            className={`text-left px-3 py-2 rounded-xl text-sm font-bold transition-all ${category === cat ? 'bg-primary text-white' : 'hover:bg-gray-100 text-dark'}`}
                          >
                              {cat}
                          </button>
                      ))}
                  </div>
              )}
          </div>
      </div>

      {/* FEED */}
      {loading ? <div className="flex h-full items-center justify-center"><div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div></div> : (
          <div className="h-full overflow-y-scroll snap-y snap-mandatory no-scrollbar">
              {displayedVideos.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500">
                      <i className="fas fa-video-slash text-4xl mb-2 opacity-50"></i>
                      <p>No videos in {category}</p>
                  </div>
              ) : (
                  displayedVideos.map(video => (
                      <div key={video.id} data-id={video.id} className="video-snap-item h-full snap-start">
                          <VideoItem 
                              video={video} 
                              isActive={activeVideoId === video.id}
                              isLiked={user && video.likedBy?.includes(user.uid)}
                              isFollowing={followingList.includes(video.uid)}
                              toggleComments={setShowComments}
                              handleLike={handleLike}
                              handleShare={handleShare}
                              handleFollow={handleFollow}
                          />
                      </div>
                  ))
              )}
          </div>
      )}

      {showComments && <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setShowComments(null)}></div>}
      {showComments && <WatchComments postId={showComments} user={user} onClose={() => setShowComments(null)} />}
    </div>
  );
};

export default Watch;