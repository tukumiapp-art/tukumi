import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../api/firebase';
import { 
  collection, query, where, orderBy, onSnapshot, 
  doc, updateDoc, arrayUnion, arrayRemove, increment, 
  addDoc, serverTimestamp, getDocs 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// --- HELPER: Avatar ---
const Avatar = ({ src, name, size = "md", className = "" }) => {
  const s = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-12 h-12 text-base", xl: "w-16 h-16 text-xl" };
  const isValidSrc = src && !src.includes('via.placeholder');
  return isValidSrc ? 
    <img src={src} className={`${s[size]} rounded-full object-cover border border-gray-200 ${className}`} alt={name} /> : 
    <div className={`${s[size]} rounded-full bg-gradient-to-tr from-primary to-primary-light text-white flex items-center justify-center font-bold shadow-inner ${className}`}>{name?.[0]}</div>;
};

// --- COMPONENT: Comments List ---
const CommentsList = ({ postId, user }) => {
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    useEffect(() => { if(!postId) return; return onSnapshot(query(collection(db, 'posts', postId, 'comments'), orderBy('timestamp', 'asc')), snap => setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })))); }, [postId]);
    
    const handleSend = async () => { 
        if (!newComment.trim() || !user) return; 
        await addDoc(collection(db, 'posts', postId, 'comments'), { text: newComment, uid: user.uid, userName: user.displayName, userAvatar: user.photoURL, timestamp: serverTimestamp() }); 
        await updateDoc(doc(db, 'posts', postId), { comments: increment(1) }); 
        setNewComment(''); 
    };

    return (
        <div className="flex flex-col h-full bg-white text-dark">
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {comments.length === 0 && <p className="text-center text-gray-400 text-sm mt-4">No comments yet.</p>}
                {comments.map(c => (<div key={c.id} className="flex gap-3"><Avatar src={c.userAvatar} name={c.userName} size="sm" /><div className="bg-gray-50 p-2 px-3 rounded-2xl rounded-tl-none"><p className="text-xs font-bold text-dark">{c.userName}</p><p className="text-sm text-gray-700">{c.text}</p></div></div>))}
            </div>
            <div className="p-4 border-t border-gray-100 bg-white"><div className="flex gap-2"><input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Add a comment..." className="flex-1 bg-gray-100 border-none rounded-full px-4 py-2 text-sm outline-none" onKeyDown={e => e.key === 'Enter' && handleSend()} /><button onClick={handleSend} className="text-primary font-bold text-sm">Post</button></div></div>
        </div>
    );
};

// --- MAIN WATCH PAGE ---
const Watch = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // State
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const [showMobileComments, setShowMobileComments] = useState(null);
  const [showDesktopComments, setShowDesktopComments] = useState(false);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth > 1024); // Higher breakpoint for "Laptop" feel
  const [activeVideo, setActiveVideo] = useState(null); // For Desktop Modal
  
  // Filter State
  const [category, setCategory] = useState('For You');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const categories = ['For You', 'Trending', 'Music', 'Gaming', 'Comedy', 'Tech', 'Sports'];

  useEffect(() => {
      const handleResize = () => setIsDesktop(window.innerWidth > 1024);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u));
    const unsubV = onSnapshot(query(collection(db, 'posts'), where('mediaType', '==', 'video'), orderBy('timestamp', 'desc')), snap => {
        setVideos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
    });
    return () => { unsub(); unsubV(); };
  }, []);

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

  const openDesktopPlayer = (video) => {
      setActiveVideo(video);
      setShowDesktopComments(false); // Reset
  };

  const closeDesktopPlayer = () => {
      setActiveVideo(null);
  };

  // --- DESKTOP: GRID + CINEMA MODAL ---
  if (isDesktop) {
      return (
          <div className="min-h-screen bg-[#f0f4f8] p-8 pl-10">
              <h1 className="text-3xl font-black text-dark mb-6 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-tr from-primary to-gold rounded-xl flex items-center justify-center text-white"><i className="fas fa-play"></i></div>
                  Tukumi Watch
              </h1>

              {/* Category Bar */}
              <div className="flex gap-3 mb-8 overflow-x-auto pb-2">
                  {categories.map(cat => (
                      <button key={cat} onClick={() => setCategory(cat)} className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${category === cat ? 'bg-dark text-white' : 'bg-white text-gray-500 hover:bg-gray-200'}`}>{cat}</button>
                  ))}
              </div>

              {/* Video Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {displayedVideos.map(video => (
                      <div key={video.id} onClick={() => openDesktopPlayer(video)} className="bg-white rounded-[24px] overflow-hidden shadow-sm cursor-pointer group hover:shadow-xl transition-all duration-300">
                          <div className="aspect-[9/16] bg-black relative">
                              <video src={video.mediaURL} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white"><i className="fas fa-play"></i></div>
                              </div>
                              <div className="absolute bottom-2 left-2 text-white text-xs font-bold flex items-center gap-1"><i className="fas fa-heart"></i> {video.likes}</div>
                          </div>
                          <div className="p-4">
                              <h4 className="font-bold text-dark truncate">{video.text}</h4>
                              <div className="flex items-center gap-2 mt-2">
                                  <Avatar src={video.userAvatar} size="sm" />
                                  <span className="text-xs text-gray-500 font-bold">{video.userName}</span>
                              </div>
                          </div>
                      </div>
                  ))}
              </div>

              {/* Desktop Player Modal */}
              {activeVideo && (
                  <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-10">
                      <button onClick={closeDesktopPlayer} className="absolute top-6 left-6 w-12 h-12 bg-white/10 rounded-full text-white flex items-center justify-center hover:bg-white/20 z-50"><i className="fas fa-arrow-left"></i></button>
                      
                      <div className="flex w-full max-w-6xl h-[85vh] bg-black rounded-[30px] overflow-hidden border border-white/10 shadow-2xl relative">
                          {/* Video Area */}
                          <div className={`relative flex-1 flex items-center justify-center bg-black transition-all duration-300 ${showDesktopComments ? 'w-2/3' : 'w-full'}`}>
                              <video src={activeVideo.mediaURL} className="w-full h-full object-contain" controls autoPlay loop />
                              
                              {/* Right-Side Actions (Floating) */}
                              <div className="absolute right-6 bottom-20 flex flex-col gap-4">
                                  <button onClick={() => handleLike(activeVideo)} className={`w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-2xl transition-all ${activeVideo.likedBy?.includes(user?.uid) ? 'text-red-500' : 'text-white'}`}><i className="fas fa-heart"></i></button>
                                  <button onClick={() => setShowDesktopComments(!showDesktopComments)} className={`w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-2xl text-white transition-all ${showDesktopComments ? 'bg-primary' : ''}`}><i className="fas fa-comment-dots"></i></button>
                              </div>
                              
                              {/* Info Overlay */}
                              <div className="absolute bottom-6 left-6 text-white max-w-lg">
                                  <h2 className="text-2xl font-black mb-2">{activeVideo.userName}</h2>
                                  <p className="text-lg opacity-90">{activeVideo.text}</p>
                              </div>
                          </div>

                          {/* Sidebar (Comments) - Toggleable */}
                          {showDesktopComments && (
                              <div className="w-[350px] bg-white border-l border-gray-200 flex flex-col animate-slide-in">
                                  <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                                      <h3 className="font-bold text-dark">Comments</h3>
                                      <button onClick={() => setShowDesktopComments(false)} className="text-gray-400 hover:text-dark"><i className="fas fa-times"></i></button>
                                  </div>
                                  <CommentsList postId={activeVideo.id} user={user} isDesktop={true} />
                              </div>
                          )}
                      </div>
                  </div>
              )}
          </div>
      );
  }

  // --- MOBILE RENDER (Snap Scroll "Beans") ---
  return (
    <div className="fixed inset-0 bg-black text-white z-0 w-full h-full overflow-hidden">
      {/* Mobile Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-30 p-4 pt-safe-top flex justify-between items-start pointer-events-none">
          <div className="pointer-events-auto bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/10">
             <div className="w-6 h-6 bg-gradient-to-tr from-primary to-gold rounded-full flex items-center justify-center"><i className="fas fa-play text-white text-[8px]"></i></div>
             <span className="font-bold text-xs">Watch</span>
          </div>
          <div className="pointer-events-auto flex flex-col items-end gap-2">
              <button onClick={() => setShowSearch(!showSearch)} className="w-10 h-10 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/10 border border-white/10"><i className="fas fa-search"></i></button>
              {showSearch && <input autoFocus className="bg-white/90 text-dark px-4 py-2 rounded-xl text-sm w-48 shadow-lg outline-none animate-scale-in origin-top-right" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />}
              
              {/* Simple Category Dropdown */}
              <div className="bg-black/40 backdrop-blur-md rounded-xl p-1 border border-white/10 flex flex-col gap-1 mt-2">
                  {categories.slice(0, 4).map(cat => (
                      <button key={cat} onClick={() => setCategory(cat)} className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all ${category === cat ? 'bg-white text-black' : 'text-white hover:bg-white/10'}`}>{cat}</button>
                  ))}
              </div>
          </div>
      </div>

      {loading ? <div className="flex h-full items-center justify-center"><div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div></div> : (
          <div ref={containerRef} className="h-full overflow-y-scroll snap-y snap-mandatory no-scrollbar">
              {displayedVideos.map((video, i) => (
                  <div key={video.id} className="snap-start h-[100vh] w-full relative flex items-center justify-center py-12">
                      {/* Video Container: "Bean" Shape with Padding */}
                      <div className="w-full h-full relative rounded-[35px] overflow-hidden shadow-2xl border border-white/10 bg-gray-900 mx-2">
                          <video 
                              src={video.mediaURL} 
                              className="w-full h-full object-cover" 
                              loop 
                              playsInline 
                              ref={i === activeVideoIndex ? videoRef : null}
                              onClick={(e) => e.target.paused ? e.target.play() : e.target.pause()} 
                          />
                          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/60 pointer-events-none"></div>

                          {/* Right Side Actions - CENTERED */}
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-6 items-center z-20 pointer-events-auto">
                              <div className="relative">
                                  <Avatar src={video.userAvatar} name={video.userName} size="md" className="border-2 border-white shadow-lg" />
                                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-red-500 w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] shadow-md"><i className="fas fa-plus"></i></div>
                              </div>
                              <button onClick={() => handleLike(video)} className="flex flex-col items-center gap-1"><i className={`text-2xl ${video.likedBy?.includes(user?.uid) ? 'fas text-red-500' : 'fas text-white'} fa-heart drop-shadow-md`}></i><span className="text-white text-[10px] font-bold">{video.likes}</span></button>
                              <button onClick={() => setShowMobileComments(video.id)} className="flex flex-col items-center gap-1"><i className="fas fa-comment-dots text-2xl text-white drop-shadow-md"></i><span className="text-white text-[10px] font-bold">{video.comments}</span></button>
                              <button onClick={() => {}} className="flex flex-col items-center gap-1"><i className="fas fa-share text-2xl text-white drop-shadow-md"></i><span className="text-white text-[10px] font-bold">Share</span></button>
                          </div>

                          {/* Bottom Info */}
                          <div className="absolute bottom-6 left-4 right-16 z-10 text-left text-white pointer-events-none">
                              <h3 className="font-black text-lg shadow-black drop-shadow-md mb-1">@{video.userName}</h3>
                              <p className="text-xs opacity-90 line-clamp-2 font-medium leading-relaxed shadow-black drop-shadow-md">{video.text}</p>
                          </div>
                      </div>
                  </div>
              ))}
          </div>
      )}

      {showMobileComments && (
          <div className="fixed inset-0 z-50">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowMobileComments(null)}></div>
              <div className="absolute bottom-0 w-full h-[60vh] bg-white rounded-t-[30px] flex flex-col animate-slide-up text-dark shadow-2xl overflow-hidden">
                  <div className="p-4 border-b flex justify-between items-center"><span className="font-bold text-lg">Comments</span><button onClick={() => setShowMobileComments(null)} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center"><i className="fas fa-times"></i></button></div>
                  <CommentsList postId={showMobileComments} user={user} isDesktop={false} />
              </div>
          </div>
      )}
    </div>
  );
};

export default Watch;