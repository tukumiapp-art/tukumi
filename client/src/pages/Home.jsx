import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth, storage } from '../api/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  collection, query, orderBy, onSnapshot, 
  addDoc, deleteDoc, updateDoc, doc, 
  serverTimestamp, increment, arrayUnion, arrayRemove 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import TopBar from '../components/TopBar';
import SearchModal from '../components/SearchModal'; 

// --- Configuration Constants ---
const DEFAULT_AVATAR = "https://via.placeholder.com/150/000000/FFFFFF?text=A";

// --- 1. UPDATED POST TEXT EXPANDER (Smart Truncation) ---
const PostTextExpander = ({ text, hasMedia }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Dynamic Limit: 2 lines if media exists, 6 lines if text-only
  const MAX_LINES = hasMedia ? 2 : 6; 
  
  const lines = text.split('\n');
  const isTruncated = lines.length > MAX_LINES || text.length > (hasMedia ? 100 : 300);

  const displayedText = isExpanded || !isTruncated
    ? text
    : lines.slice(0, MAX_LINES).join('\n').slice(0, hasMedia ? 100 : 300) + '...';

  return (
    <div className="text-gray-800 mb-3 text-[15px] leading-relaxed whitespace-pre-wrap transition-all">
      {displayedText}
      {isTruncated && (
        <button 
          onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
          className="text-primary font-bold ml-1 hover:underline focus:outline-none text-sm"
        >
          {isExpanded ? 'Show Less' : 'Read More'}
        </button>
      )}
    </div>
  );
};

// --- 2. UPDATED COMMENTS LIST (Threading & Navigation) ---
const CommentsList = ({ postId, user, setCommentText, setActiveCommentBox, setReplyingToId }) => {
  const navigate = useNavigate();
  const [comments, setComments] = useState([]);
  const [expandedThreads, setExpandedThreads] = useState({});

  useEffect(() => {
    if (!postId) return;
    const q = query(collection(db, 'posts', postId, 'comments'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [postId]);

  // Grouping Logic for Threading
  const rootComments = comments.filter(c => !c.parentId);
  const getReplies = (parentId) => comments.filter(c => c.parentId === parentId);

  const handleReplyClick = (c) => {
      setCommentText(`@${c.userName} `);
      setActiveCommentBox(postId);
      setReplyingToId(c.parentId || c.id); // Reply to parent or keep threading
  };

  const toggleThread = (id) => setExpandedThreads(p => ({...p, [id]: !p[id]}));

  const CommentItem = ({ c, isReply }) => (
      <div className={`flex gap-3 items-start text-sm mb-3 ${isReply ? 'ml-10 mt-2' : ''}`}>
          <img 
              src={c.userAvatar || DEFAULT_AVATAR} 
              className="w-8 h-8 rounded-full object-cover flex-shrink-0 cursor-pointer border border-gray-200" 
              alt={c.userName}
              onClick={() => navigate(`/profile/${c.uid}`)}
          />
          <div className="flex-1">
              <div className="bg-gray-50 px-3 py-2 rounded-2xl rounded-tl-none inline-block border border-gray-100">
                  <span 
                      className="font-bold text-xs block text-dark cursor-pointer hover:underline mb-0.5"
                      onClick={() => navigate(`/profile/${c.uid}`)}
                  >
                      {c.userName}
                  </span>
                  <p className="text-gray-700 leading-snug">{c.text}</p>
              </div>
              <div className="flex items-center gap-3 mt-1 ml-1">
                  <span className="text-[10px] text-gray-400">{c.timestamp?.seconds ? new Date(c.timestamp.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now'}</span>
                  <button 
                      onClick={() => handleReplyClick(c)} 
                      className="text-[10px] font-bold text-gray-500 hover:text-primary transition-colors"
                  >
                      Reply
                  </button>
              </div>
          </div>
      </div>
  );

  return (
    <div className="mt-4 pt-2 border-t border-gray-50">
      <div className="max-h-[350px] overflow-y-auto custom-scrollbar px-1"> 
          {comments.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No comments yet. Start the conversation!</p>}
          
          {rootComments.map(root => {
              const replies = getReplies(root.id);
              return (
                <div key={root.id}>
                    <CommentItem c={root} isReply={false} />
                    {replies.length > 0 && (
                        <div className="ml-12 mb-2">
                             <button onClick={() => toggleThread(root.id)} className="text-xs text-primary font-bold flex items-center gap-2 mb-2">
                                 <div className="w-4 h-px bg-primary"></div> {expandedThreads[root.id] ? 'Hide replies' : `View ${replies.length} replies`}
                             </button>
                             {expandedThreads[root.id] && replies.map(r => <CommentItem key={r.id} c={r} isReply={true} />)}
                        </div>
                    )}
                </div>
              )
          })}
      </div>
    </div>
  );
};

const Home = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  
  // Post/Composer State
  const [newPostText, setNewPostText] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef(null);
  
  // Interaction States
  const [activeCommentBox, setActiveCommentBox] = useState(null);
  const [commentText, setCommentText] = useState(''); 
  const [replyingToId, setReplyingToId] = useState(null); // For Threading

  const [activeMenuPostId, setActiveMenuPostId] = useState(null);
  const [fullscreenMedia, setFullscreenMedia] = useState(null); 
  
  // Report State
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportingPostId, setReportingPostId] = useState(null);
  
  const tukumiEmojis = ['💎', '👑', '⚜️', '🦁', '🎩', '🥂', '🏛️', '🦅', '✨'];

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (authUser) => {
      if (authUser) {
        const unsubProfile = onSnapshot(doc(db, 'users', authUser.uid), (docSnap) => {
          if (docSnap.exists()) setUser({ uid: authUser.uid, ...docSnap.data() }); else setUser(authUser);
        });
        return () => unsubProfile();
      } else setUser(null);
    });
    
    const q = query(collection(db, 'posts'), orderBy('timestamp', 'desc'));
    const unsubPosts = onSnapshot(q, (snap) => setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    
    const handleClickOutside = (e) => { 
      if (!e.target.closest('.post-menu-container')) setActiveMenuPostId(null); 
      if (!e.target.closest('.emoji-picker-container')) setShowEmojiPicker(false); 
    };
    document.addEventListener('click', handleClickOutside);
    
    return () => { unsubAuth(); unsubPosts(); document.removeEventListener('click', handleClickOutside); };
  }, []);

  // --- ACTIONS ---

  const handlePost = async () => {
    if ((!newPostText.trim() && !mediaFile) || !user) return;
    setIsPosting(true);
    try {
      let downloadURL = null;
      if (mediaFile) {
        const storageRef = ref(storage, `posts/${user.uid}/${Date.now()}_${mediaFile.name}`);
        await uploadBytes(storageRef, mediaFile);
        downloadURL = await getDownloadURL(storageRef);
      }
      await addDoc(collection(db, 'posts'), {
        text: newPostText, uid: user.uid, userName: user.displayName || "Aristocrat", userAvatar: user.photoURL,
        mediaURL: downloadURL, mediaType: mediaType, timestamp: serverTimestamp(), likes: 0, likedBy: [], comments: 0, isPrivate: false
      });
      setNewPostText(''); setMediaFile(null); setMediaPreview(null);
    } catch (e) { console.error(e); } finally { setIsPosting(false); }
  };

  const handleLike = async (post) => {
    if (!user) return alert("Sign in.");
    const postRef = doc(db, 'posts', post.id);
    const isLiked = post.likedBy && post.likedBy.includes(user.uid);
    
    if (isLiked) { 
        await updateDoc(postRef, { likes: increment(-1), likedBy: arrayRemove(user.uid) }); 
    } else { 
        await updateDoc(postRef, { likes: increment(1), likedBy: arrayUnion(user.uid) }); 
        if (post.uid !== user.uid) {
            await addDoc(collection(db, 'notifications'), {
                recipientId: post.uid, senderId: user.uid, senderName: user.displayName, senderAvatar: user.photoURL,
                type: 'like', targetId: post.id, timestamp: serverTimestamp(), isRead: false
            });
        }
    }
  };

  const submitComment = async (postId) => {
    if (!commentText.trim() || !user) return;
    try {
      await addDoc(collection(db, 'posts', postId, 'comments'), {
        text: commentText, 
        uid: user.uid, 
        userName: user.displayName, 
        userAvatar: user.photoURL, 
        parentId: replyingToId, // Save parent ID for threading
        timestamp: serverTimestamp()
      });
      await updateDoc(doc(db, 'posts', postId), { comments: increment(1) });
      
      const post = posts.find(p => p.id === postId);
      if (post && post.uid !== user.uid) {
          await addDoc(collection(db, 'notifications'), {
              recipientId: post.uid, senderId: user.uid, senderName: user.displayName, senderAvatar: user.photoURL,
              type: 'comment', targetId: postId, timestamp: serverTimestamp(), isRead: false
          });
      }

      setCommentText(''); 
      setReplyingToId(null); // Reset threading
    } catch (e) { console.error("Comment failed", e); }
  };
  
  const handleSavePost = async (post) => {
      if (!user) return alert("Sign in to save.");
      await updateDoc(doc(db, 'users', user.uid), { savedPosts: arrayUnion(post.id) });
      alert("Post saved!");
      setActiveMenuPostId(null);
  };

  const handleSubmitReport = async (reason) => {
      if (!reportingPostId || !user) return;
      await addDoc(collection(db, 'reports'), { 
          targetId: reportingPostId, type: 'post', reporter: user.uid, reason, timestamp: serverTimestamp() 
      });
      alert("Report submitted.");
      setReportModalOpen(false);
      setReportingPostId(null);
  };
  
  const handleTogglePrivate = async (post) => { await updateDoc(doc(db, 'posts', post.id), { isPrivate: !post.isPrivate }); setActiveMenuPostId(null); };
  const handleDelete = async (id) => { if (window.confirm("Are you sure you want to delete this post?")) await deleteDoc(doc(db, 'posts', id)); };
  const handleFileSelect = (e) => { 
    const file = e.target.files[0]; 
    if (!file) return; 
    setMediaFile(file); 
    setMediaType(file.type.startsWith('video/') ? 'video' : 'image'); 
    setMediaPreview(URL.createObjectURL(file)); 
  };
  
  const toggleCommentBox = (postId) => { 
    if (activeCommentBox === postId) setActiveCommentBox(null); 
    else { 
      setActiveCommentBox(postId); 
      setCommentText(''); 
      setReplyingToId(null);
    } 
  };

  const handleShare = async (post) => { 
    const url = `${window.location.origin}/post/${post.id}`;
    if (navigator.share) { navigator.share({ title: post.userName, text: post.text, url: url }); } 
    else { navigator.clipboard.writeText(url).then(() => { alert("Link copied!"); }); }
  };

  const goToProfile = (uid) => { navigate(`/profile/${uid}`); };

  const TrendingSidebar = () => (
    <div className="glass-panel rounded-[30px] p-6">
      <h3 className="font-bold text-dark mb-6">Trending</h3>
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 mb-4 last:mb-0 cursor-pointer group">
          <span className="text-3xl font-black text-gray-200 group-hover:text-primary/30">0{i}</span>
          <div><p className="font-bold text-dark text-sm group-hover:text-primary">#TukumiLife</p><p className="text-xs text-gray-400">12.5K posts</p></div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-4 md:p-6 w-full max-w-[1200px] mx-auto">
      <TopBar />
      
      {/* --- HEADER (Simplified for Mobile: Search is in TopBar now) --- */}
      <div className="flex justify-between items-center mb-8">
        <div>
            <h2 className="text-3xl font-black text-dark tracking-tight">The Feed</h2>
            <p className="text-gray-500 font-medium">Curated for you</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <div className="flex-1 w-full min-w-0 space-y-8">
          
          {/* Composer */}
          <div className="glass-panel rounded-[30px] p-2 z-20 relative">
            <div className="bg-white/60 rounded-[24px] p-5 backdrop-blur-sm">
              <div className="flex gap-4">
                <img src={user?.photoURL || DEFAULT_AVATAR} className="w-12 h-12 rounded-2xl object-cover" alt="User Avatar" />
                <div className="flex-1">
                  <textarea placeholder="Share your thoughts..." className="w-full bg-transparent border-none outline-none text-lg resize-none mt-2 placeholder-gray-400" rows="2" value={newPostText} onChange={(e) => setNewPostText(e.target.value)}></textarea>
                  {mediaPreview && (
                    <div className="relative mt-2 inline-block group">
                      {mediaType === 'video' ? <video src={mediaPreview} controls className="h-32 rounded-xl bg-black" /> : <img src={mediaPreview} className="h-32 rounded-xl" />}
                      <button onClick={() => { setMediaFile(null); setMediaPreview(null); }} className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center"><i className="fas fa-times text-xs"></i></button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200/50 relative">
                <div className="flex gap-1 items-center">
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" onChange={handleFileSelect} />
                  <button onClick={() => fileInputRef.current.click()} className="w-9 h-9 rounded-xl hover:bg-primary/10 text-primary flex items-center justify-center"><i className="fas fa-image"></i></button>
                  <div className="relative emoji-picker-container">
                    <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="w-9 h-9 rounded-xl hover:bg-primary/10 text-primary flex items-center justify-center"><i className="far fa-smile"></i></button>
                    {showEmojiPicker && <div className="absolute top-full left-0 mt-2 bg-white/95 backdrop-blur-xl p-3 rounded-2xl shadow-xl border border-white/50 grid grid-cols-5 gap-2 z-30 animate-fade-in w-64">{tukumiEmojis.map(em => <button key={em} onClick={() => { setNewPostText(prev => prev + em); setShowEmojiPicker(false); }} className="text-2xl hover:scale-125 transition-transform">{em}</button>)}</div>}
                  </div>
                </div>
                <button onClick={handlePost} disabled={isPosting || (!newPostText.trim() && !mediaFile)} className="bg-gradient-to-r from-primary to-primary-dark text-white px-6 py-2.5 rounded-xl font-bold hover:shadow-lg transition-all shadow-primary/20 disabled:opacity-50">{isPosting ? 'Publishing...' : 'Tukumi'}</button>
              </div>
            </div>
          </div>
          
          {/* Posts */}
          {posts.map((post) => {
            const isLikedByMe = user && post.likedBy && post.likedBy.includes(user.uid);
            if (post.isPrivate && post.uid !== user?.uid) return null; 
            return (
              <div key={post.id} className="glass-panel rounded-[30px] p-6 hover:shadow-xl transition-all duration-300 border border-white/60">
                <div className="flex justify-between items-start mb-5">
                  <div className="flex items-center gap-4 cursor-pointer group" onClick={() => goToProfile(post.uid)}>
                    <img src={post.userAvatar || DEFAULT_AVATAR} className="w-12 h-12 rounded-2xl object-cover" alt="User Avatar" />
                    <div>
                      <h4 className="font-bold text-dark text-lg leading-tight flex items-center gap-2 group-hover:text-primary">
                        {post.userName}
                        {post.isPrivate && <i className="fas fa-lock text-xs text-gray-400 ml-1"></i>}
                      </h4>
                      <p className="text-xs text-gray-500 font-medium">{post.timestamp?.seconds ? new Date(post.timestamp.seconds * 1000).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : 'Just now'}</p>
                    </div>
                  </div>
                  <div className="relative post-menu-container">
                    <button onClick={() => setActiveMenuPostId(activeMenuPostId === post.id ? null : post.id)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400"><i className="fas fa-ellipsis-h"></i></button>
                    {activeMenuPostId === post.id && (
                      <div className="absolute right-0 top-full mt-2 w-48 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/50 overflow-hidden z-20 py-1 animate-fade-in">
                        {user?.uid === post.uid ? (
                          <>
                            <button onClick={() => handleTogglePrivate(post)} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"><i className={`fas ${post.isPrivate ? 'fa-globe' : 'fa-lock'} text-gray-500 w-4`}></i> {post.isPrivate ? 'Make Public' : 'Make Private'}</button>
                            <button onClick={() => handleDelete(post.id)} className="w-full text-left px-4 py-2.5 text-sm text-accent hover:bg-red-50 font-bold flex items-center gap-3"><i className="fas fa-trash w-4"></i> Delete</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => handleSavePost(post)} className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"><i className="far fa-bookmark w-4 text-center"></i> Save Post</button>
                            <button onClick={() => { setReportingPostId(post.id); setReportModalOpen(true); setActiveMenuPostId(null); }} className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"><i className="fas fa-flag w-4 text-center"></i> Report</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                <PostTextExpander text={post.text} hasMedia={!!post.mediaURL} /> 

                {post.mediaURL && (
                  <div className="rounded-[24px] overflow-hidden mb-5 shadow-md border border-white/50 cursor-pointer group relative" onClick={() => setFullscreenMedia({ url: post.mediaURL, type: post.mediaType })}>
                    {post.mediaType === 'video' ? <video src={post.mediaURL} controls className="w-full max-h-[500px] bg-black object-contain" /> : <img src={post.mediaURL} className="w-full max-h-[500px] object-cover transition-transform duration-700 group-hover:scale-105" alt="Post Media" />}
                  </div>
                )}
                
                <div className="flex items-center gap-3 pt-2 border-t border-gray-100/50">
                    <button onClick={() => handleLike(post)} className={`h-10 px-5 rounded-xl border flex items-center gap-2 transition-all group shadow-sm ${isLikedByMe ? 'bg-accent/10 border-accent/20 text-accent' : 'bg-white/50 border-white text-gray-600 hover:text-accent hover:bg-white'}`}><i className={`${isLikedByMe ? 'fas' : 'far'} fa-heart group-hover:scale-110`}></i><span className="font-bold text-sm">{post.likes || 0}</span></button>
                    <button onClick={() => toggleCommentBox(post.id)} className="h-10 px-5 rounded-xl bg-white/50 border border-white flex items-center gap-2 text-gray-600 hover:text-primary hover:bg-white transition-all group shadow-sm"><i className="far fa-comment group-hover:scale-110 transition-transform"></i><span className="font-bold text-sm">{post.comments || 0}</span></button>
                    <button onClick={() => handleShare(post)} className="h-10 w-10 rounded-xl bg-white/50 border border-white flex items-center justify-center text-gray-600 hover:text-dark hover:bg-white ml-auto transition-all shadow-sm"><i className="far fa-share-square"></i></button>
                </div>
                
                {activeCommentBox === post.id && (
                  <div className="mt-4 animate-fade-in">
                    <CommentsList 
                        postId={post.id} 
                        user={user} 
                        setCommentText={setCommentText} 
                        setActiveCommentBox={setActiveCommentBox}
                        setReplyingToId={setReplyingToId}
                    />

                    <div className="flex gap-2 mt-4">
                        <input type="text" placeholder="Write a comment..." className="flex-1 bg-white/80 border border-white/50 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-inner" value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitComment(post.id)} autoFocus />
                        <button onClick={() => submitComment(post.id)} disabled={!commentText.trim()} className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shadow-md hover:bg-primary-dark transition-colors disabled:opacity-50"><i className="fas fa-paper-plane text-xs"></i></button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        <div className="hidden lg:block w-[340px] space-y-6 sticky top-6"><TrendingSidebar /></div>
      </div>
      
      {fullscreenMedia && (<div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 cursor-pointer" onClick={() => setFullscreenMedia(null)}>{fullscreenMedia.type === 'video' ? <video src={fullscreenMedia.url} controls autoPlay className="max-w-full max-h-full" onClick={e => e.stopPropagation()} /> : <img src={fullscreenMedia.url} alt="Fullscreen Media" className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />}<button onClick={() => setFullscreenMedia(null)} className="absolute top-4 right-4 text-white text-3xl">&times;</button></div>)}
      {reportModalOpen && (<div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center animate-fade-in p-4"><div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl"><div className="text-center mb-4"><div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3 text-red-500 text-xl"><i className="fas fa-flag"></i></div><h3 className="text-xl font-bold text-gray-900">Report Post</h3></div><div className="space-y-2 mb-6">{['Spam or Fraud', 'Harassment', 'Violence', 'False Information'].map(reason => (<button key={reason} onClick={() => handleSubmitReport(reason)} className="w-full text-left p-3 rounded-xl bg-gray-50 hover:bg-red-50 hover:text-red-600 text-gray-700 font-medium transition-colors">{reason}</button>))}</div><button onClick={() => setReportModalOpen(false)} className="w-full py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">Cancel</button></div></div>)}
    </div>
  );
};
 
export default Home;