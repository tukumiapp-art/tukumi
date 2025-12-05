import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { db, auth } from '../api/firebase';
import { 
  collection, query, where, orderBy, onSnapshot, 
  doc, updateDoc, arrayUnion, arrayRemove, increment, 
  addDoc, serverTimestamp, limit, getDoc 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// --- MemberAvatar Component (Fetches User Details & Renders Verified Badge) ---
const MemberAvatar = ({ uid, size = "md", className = "" }) => {
    const [userData, setUserData] = useState(null);
    
    useEffect(() => {
        // Fetch user data for the avatar (Name, Photo, isVerified)
        getDoc(doc(db, 'users', uid)).then(s => {
            if(s.exists()) setUserData(s.data());
            else setUserData({ displayName: 'User', photoURL: null, isVerified: false });
        });
    }, [uid]);

    // Define sizes for the avatar
    const s = { 
        sm: "w-8 h-8 text-xs", 
        md: "w-10 h-10 text-sm", 
        lg: "w-12 h-12 text-base", 
        xl: "w-16 h-16 text-xl" 
    }; 
    
    // Determine the URL, using ui-avatars.com as a reliable fallback
    const url = userData?.photoURL || `https://ui-avatars.com/api/?name=${userData?.displayName || 'User'}&background=random`;

    if (!userData) return <div className={`${s[size]} bg-gray-200 rounded-full animate-pulse ${className}`}></div>;

    return (
        <div className="relative inline-block">
            <img src={url} className={`${s[size]} rounded-full object-cover border border-gray-200 ${className}`} alt="avatar" />
            {/* Renders the verified badge if the user is verified */}
            {userData.isVerified && (
                <div className="absolute -bottom-1 -right-1 bg-blue-500 text-white text-[8px] w-3 h-3 flex items-center justify-center rounded-full border border-white">
                    <i className="fas fa-check"></i>
                </div>
            )}
        </div>
    );
};

// --- CommentsList Component (Fixed Scrolling) ---
const CommentsList = ({ postId, user, isDesktop }) => {
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [userProfile, setUserProfile] = useState(null);
    
    // 1. Add ref for the comments scroll container
    const commentsContainerRef = useRef(null); 

    // Fetch current user's profile for verification status when posting
    useEffect(() => {
        if(user) {
          getDoc(doc(db, 'users', user.uid)).then(s => s.exists() && setUserProfile(s.data()));
        } else {
          setUserProfile(null);
        }
    }, [user]);

    // Fetch comments in real-time
    useEffect(() => { 
      if(!postId) return; 
      return onSnapshot(query(collection(db, 'posts', postId, 'comments'), orderBy('timestamp', 'asc')), snap => setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })))); 
    }, [postId]);
    
    // 2. Auto-scroll to the bottom when comments update
    useEffect(() => {
        if (commentsContainerRef.current) {
            commentsContainerRef.current.scrollTop = commentsContainerRef.current.scrollHeight;
        }
    }, [comments]);
    
    // Comment submission logic
    const handleSend = async () => { 
        if (!newComment.trim() || !user) return; 
        
        await addDoc(collection(db, 'posts', postId, 'comments'), { 
            text: newComment, 
            uid: user.uid, 
            userName: user.displayName, 
            userAvatar: user.photoURL, 
            isVerified: userProfile?.isVerified || false, 
            timestamp: serverTimestamp() 
        }); 
        
        await updateDoc(doc(db, 'posts', postId), { comments: increment(1) }); 
        setNewComment(''); 
        // Auto-scroll happens via the useEffect dependency on `comments` state update
    };

    // Toggle Nav Visibility for mobile keyboard focus
    const toggleNav = (visible) => window.dispatchEvent(new CustomEvent('toggle-nav', { detail: { visible } }));

    return (
        <div className={`flex flex-col h-full ${isDesktop ? 'bg-white' : ''}`}>
            {/* 3. Attach ref and keep large padding. */}
            <div ref={commentsContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar pb-2"> 
                {comments.length === 0 && <p className="text-center text-gray-400 text-sm mt-10">No comments yet.</p>}
                {comments.map(c => (
                    <div key={c.id} className="flex gap-3 items-start">
                        <MemberAvatar uid={c.uid} size="sm" /> 
                        <div className="bg-gray-50 p-2 px-3 rounded-2xl rounded-tl-none">
                            <p className="text-xs font-bold text-dark flex items-center gap-1">
                                {c.userName} 
                            </p>
                            <p className="text-sm text-gray-700">{c.text}</p>
                        </div>
                    </div>
                ))}
            </div>
            
            {/* Input bar */}
            <div className={`p-4 border-t border-gray-100 bg-white absolute bottom-0 w-full ${!isDesktop ? 'pb-16' : ''}`}>
                <div className="flex gap-2 items-center">
                    <input 
                        value={newComment} 
                        onChange={e => setNewComment(e.target.value)} 
                        placeholder="Add a comment..." 
                        className="flex-1 bg-gray-100 border-none rounded-full px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50" 
                        onKeyDown={e => e.key === 'Enter' && handleSend()} 
                        onFocus={() => toggleNav(false)} 
                        onBlur={() => setTimeout(() => toggleNav(true), 200)} 
                    />
                    <button onClick={handleSend} className="text-primary font-bold text-sm px-2">Post</button>
                </div>
            </div>
        </div>
    );
};

// --- Watch Component (Main component) ---
const Watch = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // State
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const [showMobileComments, setShowMobileComments] = useState(null);
  const [showDesktopComments, setShowDesktopComments] = useState(false);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth > 1024);
  const [activeVideo, setActiveVideo] = useState(null);
  
  // Filter State
  const [category, setCategory] = useState('For You');
  const [showFilter, setShowFilter] = useState(false); 
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const containerRef = useRef(null);
  const categories = ['For You', 'Trending', 'Music', 'Gaming', 'Comedy', 'Tech', 'Sports', 'Food', 'Dance'];

  useEffect(() => {
      const handleResize = () => setIsDesktop(window.innerWidth > 1024);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 1. Load Videos
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u));
    const q = query(collection(db, 'posts'), where('mediaType', '==', 'video'), orderBy('timestamp', 'desc'), limit(50));
    const unsubV = onSnapshot(q, snap => {
        const vidData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setVideos(vidData);
        setLoading(false);
    });
    return () => { unsub(); unsubV(); };
  }, []); 

  // 2. Handle "Start at specific video" from Feed
  useEffect(() => {
      if (videos.length > 0 && location.state?.startVideoId) {
          const startId = location.state.startVideoId;
          const index = videos.findIndex(v => v.id === startId);
          if (index !== -1) {
              setActiveVideoIndex(index);
              setTimeout(() => {
                  if (containerRef.current) {
                      containerRef.current.scrollTo({ top: index * window.innerHeight, behavior: 'instant' }); 
                  }
              }, 100);
          }
      }
  }, [videos, location.state]); 

  // --- FILTER LOGIC ---
  const getFilteredVideos = () => {
      let filtered = [...videos];
      if (searchQuery) {
          filtered = filtered.filter(v => v.text?.toLowerCase().includes(searchQuery.toLowerCase()) || v.userName?.toLowerCase().includes(searchQuery.toLowerCase()));
      } else if (category === 'Trending') {
          filtered.sort((a, b) => (b.likes || 0) - (a.likes || 0));
      } else if (category !== 'For You') {
          filtered = filtered.filter(v => v.category === category || v.text?.toLowerCase().includes(`#${category.toLowerCase()}`));
      }
      return filtered;
  };

  const displayedVideos = getFilteredVideos();

  // Mobile Auto-Scroll Logic
  useEffect(() => {
      if (isDesktop || displayedVideos.length === 0) return;
      const handleScroll = () => {
          if (!containerRef.current) return;
          const index = Math.round(containerRef.current.scrollTop / window.innerHeight);
          if (index !== activeVideoIndex && index < displayedVideos.length) setActiveVideoIndex(index);
      };
      const container = containerRef.current;
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
  }, [displayedVideos, isDesktop, activeVideoIndex]);

  // ACTIONS
  const handleLike = async (vid) => {
      if (!user) return alert("Sign in");
      const target = vid || activeVideo;
      const ref = doc(db, 'posts', target.id);
      if (target.likedBy?.includes(user.uid)) await updateDoc(ref, { likes: increment(-1), likedBy: arrayRemove(user.uid) });
      else await updateDoc(ref, { likes: increment(1), likedBy: arrayUnion(user.uid) });
  };

  const handleShare = async (video) => {
      const url = `${window.location.origin}/post/${video.id}`;
      if (navigator.share) {
          try { await navigator.share({ title: 'Tukumi Watch', text: video.text, url }); } catch(e) {}
      } else {
          navigator.clipboard.writeText(url);
          alert("Link copied!");
      }
  };

  const openDesktopPlayer = (video) => { setActiveVideo(video); setShowDesktopComments(false); };
  const closeDesktopPlayer = () => { setActiveVideo(null); };

  // --- MOBILE VIDEO ITEM ---
  const MobileVideoItem = ({ video, isActive }) => {
      const localRef = useRef(null); 
      const [progress, setProgress] = useState(0);

      useEffect(() => {
          if (isActive) {
              if (localRef.current) {
                  localRef.current.currentTime = 0; 
                  localRef.current.play().catch(()=>{});
              }
          } else { 
              if (localRef.current) localRef.current.pause(); 
          }
      }, [isActive]);
      
      const isLiked = video.likedBy?.includes(user?.uid);

      const handleTimeUpdate = () => {
          if (localRef.current) {
              const p = (localRef.current.currentTime / localRef.current.duration) * 100;
              setProgress(isNaN(p) ? 0 : p);
          }
      };

      const handleSeek = (e) => {
          if (localRef.current) {
              const time = (e.target.value / 100) * localRef.current.duration;
              localRef.current.currentTime = time;
              setProgress(e.target.value);
          }
      };

      return (
        <div className="snap-start h-[100vh] w-full relative flex items-center justify-center bg-black overflow-hidden shrink-0 py-20 px-0">
            <div className="w-full h-full relative md:rounded-[35px] overflow-hidden shadow-2xl border-y md:border border-white/10 bg-gray-900">
                <video 
                    ref={localRef} 
                    src={video.mediaURL} 
                    className="w-full h-full object-contain bg-black" 
                    loop 
                    playsInline 
                    onClick={(e) => e.target.paused ? e.target.play() : e.target.pause()} 
                    onTimeUpdate={handleTimeUpdate}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/60 pointer-events-none"></div>

                {/* Right Side Actions */}
                <div className="absolute right-3 bottom-24 flex flex-col gap-6 items-center z-20 pointer-events-auto">
                    <div className="relative" onClick={() => navigate(`/profile/${video.uid}`)}>
                        <MemberAvatar uid={video.uid} size="md" className="border-2 border-white shadow-md" />
                    </div>
                    <button onClick={() => handleLike(video)} className="flex flex-col items-center gap-1">
                        <div className={`w-12 h-12 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-2xl transition-all ${isLiked ? 'text-primary' : 'text-white'}`}>
                            <i className={`${isLiked ? 'fas' : 'far'} fa-heart drop-shadow-md`}></i>
                        </div>
                        <span className="text-white text-[10px] font-bold drop-shadow-md">{video.likes}</span>
                    </button>
                    <button onClick={() => setShowMobileComments(video.id)} className="flex flex-col items-center gap-1">
                        <div className="w-12 h-12 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white text-2xl">
                            <i className="fas fa-comment-dots drop-shadow-md"></i>
                        </div>
                        <span className="text-white text-[10px] font-bold drop-shadow-md">{video.comments}</span>
                    </button>
                    <button onClick={() => handleShare(video)} className="flex flex-col items-center gap-1">
                        <div className="w-12 h-12 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white text-2xl">
                            <i className="fas fa-share drop-shadow-md"></i>
                        </div>
                        <span className="text-white text-[10px] font-bold drop-shadow-md">Share</span>
                    </button>
                </div>

                {/* Bottom Info */}
                <div className="absolute bottom-8 left-5 right-20 z-10 text-left text-white pointer-events-auto">
                    <h3 className="font-black text-xl shadow-black drop-shadow-md mb-1 cursor-pointer" onClick={() => navigate(`/profile/${video.uid}`)}>@{video.userName}</h3>
                    <p className="text-sm opacity-95 line-clamp-2 font-medium leading-relaxed text-shadow">{video.text}</p>
                    <div className="flex items-center gap-2 mt-2 opacity-80 pointer-events-none">
                        <i className="fas fa-music text-xs"></i>
                        <p className="text-xs font-bold">{category} • Tukumi</p>
                    </div>
                </div>

                {/* Video Scrubber (Navigation) */}
                <div className="absolute bottom-0 left-0 w-full z-40 px-0 pb-0" onClick={(e) => e.stopPropagation()}>
                    <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={progress} 
                        onChange={handleSeek}
                        className="w-full h-1 bg-white/30 appearance-none cursor-pointer accent-primary hover:h-2 transition-all"
                        style={{ background: `linear-gradient(to right, #008080 ${progress}%, rgba(255,255,255,0.3) ${progress}%)` }}
                    />
                </div>
            </div>
        </div>
      );
  };

  // --- DESKTOP RENDER ---
  if (isDesktop) {
      return (
          <div className="min-h-screen bg-[#f0f4f8] p-8 pl-10">
              {/* Header/Title and Filters */}
              <div className="flex justify-between items-center mb-6">
                  <h1 className="text-3xl font-black text-dark flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-tr from-primary to-gold rounded-xl flex items-center justify-center text-white"><i className="fas fa-play"></i></div>
                      Tukumi Watch
                  </h1>
                  {/* Filter Buttons */}
                  <div className="flex gap-3">
                      <button onClick={() => setShowSearch(!showSearch)} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-500 hover:text-dark transition-all shadow-md"><i className="fas fa-search"></i></button>
                      <div className="relative">
                          <button onClick={() => setShowFilter(!showFilter)} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-500 hover:text-dark transition-all shadow-md"><i className="fas fa-sliders-h"></i></button>
                          {showFilter && (
                              <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl p-2 shadow-2xl border border-gray-100 flex flex-col gap-1 w-40 animate-scale-in text-dark origin-top-right z-10">
                                  {categories.map(cat => (
                                      <button key={cat} onClick={() => { setCategory(cat); setShowFilter(false); }} className={`text-left px-3 py-2 rounded-xl text-sm font-bold transition-all ${category === cat ? 'bg-primary text-white' : 'hover:bg-gray-100 text-dark'}`}>{cat}</button>
                                  ))}
                              </div>
                          )}
                      </div>
                  </div>
              </div>
              {/* Search Bar */}
              {showSearch && (
                  <div className="mb-6 animate-fade-in">
                      <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search videos by caption or user name..." className="w-full bg-white border border-gray-200 rounded-xl px-5 py-3 text-lg outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm" />
                  </div>
              )}

              {/* Video Grid */}
              {loading ? <div className="flex h-[300px] items-center justify-center"><div className="w-8 h-8 border-4 border-gray-300 border-t-primary rounded-full animate-spin"></div></div> : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {displayedVideos.map(video => (
                        <div key={video.id} onClick={() => openDesktopPlayer(video)} className="bg-white rounded-[24px] overflow-hidden shadow-sm cursor-pointer group hover:shadow-xl transition-all duration-300">
                            <div className="aspect-[9/16] bg-black relative">
                                <video src={video.mediaURL} className="w-full h-full object-contain opacity-90 group-hover:opacity-100 transition-opacity" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-4">
                                    <h3 className="text-white font-bold text-lg leading-tight line-clamp-2">{video.text}</h3>
                                    <p className="text-white/80 text-sm mt-1 flex items-center gap-2">@{video.userName} <span className="text-xs">• {video.likes} likes</span></p>
                                </div>
                            </div>
                        </div>
                    ))}
                    {displayedVideos.length === 0 && <p className="col-span-4 text-center text-gray-400 mt-10">No videos found for this filter/search.</p>}
                </div>
              )}

              {/* Desktop Player Modal */}
              {activeVideo && (
                  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8 animate-fade-in" onClick={closeDesktopPlayer}>
                      <div className="flex w-full max-w-6xl h-[85vh] bg-white rounded-[35px] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                          {/* Video Side */}
                          <div className="flex-1 min-w-0 bg-gray-900 flex items-center justify-center relative">
                              <video src={activeVideo.mediaURL} controls autoPlay className="max-w-full max-h-full object-contain" />
                              <button onClick={closeDesktopPlayer} className="absolute top-4 left-4 w-10 h-10 bg-black/40 backdrop-blur-md rounded-full text-white text-xl flex items-center justify-center hover:bg-black/60 transition-colors"><i className="fas fa-times"></i></button>
                              
                              <div className="absolute right-4 bottom-4 flex flex-col gap-4 items-center z-10 text-white">
                                  <div className="relative" onClick={() => navigate(`/profile/${activeVideo.uid}`)}>
                                      {/* REPLACED: Avatar with MemberAvatar (passing uid) */}
                                      <MemberAvatar uid={activeVideo.uid} size="md" className="border-2 border-white shadow-md" />
                                  </div>
                                  <button onClick={() => handleLike(activeVideo)} className="flex flex-col items-center gap-1">
                                      <div className={`w-12 h-12 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-2xl transition-all ${activeVideo.likedBy?.includes(user?.uid) ? 'text-primary' : 'text-white'}`}>
                                          <i className={`${activeVideo.likedBy?.includes(user?.uid) ? 'fas' : 'far'} fa-heart`}></i>
                                      </div>
                                      <span className="text-[10px] font-bold drop-shadow-md">{activeVideo.likes}</span>
                                  </button>
                                  <button onClick={() => setShowDesktopComments(!showDesktopComments)} className="flex flex-col items-center gap-1">
                                      <div className="w-12 h-12 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white text-2xl">
                                          <i className="fas fa-comment-dots"></i>
                                      </div>
                                      <span className="text-[10px] font-bold drop-shadow-md">{activeVideo.comments}</span>
                                  </button>
                                  <button onClick={() => handleShare(activeVideo)} className="flex flex-col items-center gap-1">
                                      <div className="w-12 h-12 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white text-2xl">
                                          <i className="fas fa-share"></i>
                                      </div>
                                      <span className="text-[10px] font-bold drop-shadow-md">Share</span>
                                  </button>
                              </div>
                          </div>
                          
                          {/* Comments Side */}
                          <div className={`w-[400px] flex flex-col border-l transition-all duration-300 ${showDesktopComments ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                              <CommentsList postId={activeVideo.id} user={user} isDesktop={true} />
                          </div>
                      </div>
                  </div>
              )}
          </div>
      );
  }

  // --- MOBILE RENDER ---
  return (
    <div className="fixed inset-0 bg-black text-white z-0 w-full h-full overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-30 p-4 pt-safe-top flex justify-between items-start pointer-events-none">
          <button onClick={() => navigate(-1)} className="pointer-events-auto bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/10 hover:bg-white/10 transition-all">
             <i className="fas fa-arrow-left text-white text-sm"></i>
             <span className="font-bold text-xs">Back</span>
          </button>
          <div className="pointer-events-auto flex flex-col items-end gap-2">
              <button onClick={() => setShowFilter(!showFilter)} className="w-10 h-10 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/10 border border-white/10 shadow-lg transition-all">
                  <i className="fas fa-sliders-h"></i>
              </button>
              {showFilter && (
                  <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-2 shadow-2xl border border-white/20 flex flex-col gap-1 w-40 animate-scale-in text-dark origin-top-right">
                      {categories.map(cat => (
                          <button key={cat} onClick={() => { setCategory(cat); setShowFilter(false); setActiveVideoIndex(0); }} className={`text-left px-3 py-2 rounded-xl text-sm font-bold transition-all ${category === cat ? 'bg-primary text-white' : 'hover:bg-gray-100 text-dark'}`}>{cat}</button>
                      ))}
                  </div>
              )}
          </div>
      </div>

      {loading ? <div className="flex h-full items-center justify-center"><div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div></div> : (
          <div ref={containerRef} className="h-full overflow-y-scroll snap-y snap-mandatory no-scrollbar" onScroll={(e) => {
              const index = Math.round(e.target.scrollTop / window.innerHeight);
              if (index !== activeVideoIndex && index < displayedVideos.length) setActiveVideoIndex(index);
          }}>
              {displayedVideos.map((video, i) => (
                  <MobileVideoItem key={video.id} video={video} isActive={i === activeVideoIndex} />
              ))}
          </div>
      )}
      
      {showMobileComments && (
          <div className="fixed inset-0 z-50">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowMobileComments(null)}></div>
              <div className="absolute bottom-0 w-full h-[80vh] bg-white rounded-t-[35px] flex flex-col animate-slide-up text-dark shadow-2xl overflow-hidden pb-safe">
                  <div className="p-4 border-b flex justify-between items-center"><span className="font-bold text-lg">Comments</span><button onClick={() => setShowMobileComments(null)} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center"><i className="fas fa-times"></i></button></div>
                  <CommentsList postId={showMobileComments} user={user} isDesktop={false} />
              </div>
          </div>
      )}
    </div>
  );
};
export default Watch;