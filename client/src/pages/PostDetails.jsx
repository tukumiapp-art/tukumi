import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { db, auth } from '../api/firebase';
import { 
  doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, increment, 
  collection, query, orderBy, addDoc, serverTimestamp, deleteDoc 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import TopBar from '../components/TopBar';

const DEFAULT_AVATAR = "https://via.placeholder.com/150/000000/FFFFFF?text=A";

// --- Post Text Expander Component ---
const PostTextExpander = ({ text, hasMedia }) => {
  const [isExpanded, setIsExpanded] = useState(false);
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

// --- Comments List Component ---
const CommentsList = ({ postId, user, setCommentText, setReplyingToId }) => {
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

  const rootComments = comments.filter(c => !c.parentId);
  const getReplies = (parentId) => comments.filter(c => c.parentId === parentId);

  const handleReplyClick = (c) => {
      setCommentText(`@${c.userName} `);
      setReplyingToId(c.parentId || c.id);
      // Scroll to input
      document.getElementById('comment-input-main')?.focus();
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
      <div className="max-h-[500px] overflow-y-auto custom-scrollbar px-1"> 
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

const PostDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [post, setPost] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Interactions
  const [commentText, setCommentText] = useState('');
  const [replyingToId, setReplyingToId] = useState(null);
  const [fullscreenMedia, setFullscreenMedia] = useState(null);
  const [activeMenu, setActiveMenu] = useState(false);

  // Check for commentId in navigation state (from notification click)
  const initialCommentId = location.state?.commentId;

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => setUser(u));
    
    // Subscribe to the specific post
    const unsubPost = onSnapshot(doc(db, 'posts', id), (docSnap) => {
      if (docSnap.exists()) {
        setPost({ id: docSnap.id, ...docSnap.data() });
      } else {
        setPost(null);
      }
      setLoading(false);
    });

    return () => { unsubAuth(); unsubPost(); };
  }, [id]);

  const handleLike = async () => {
    if (!user) return alert("Sign in required.");
    const postRef = doc(db, 'posts', id);
    const isLiked = post.likedBy && post.likedBy.includes(user.uid);

    if (isLiked) {
        await updateDoc(postRef, { likes: increment(-1), likedBy: arrayRemove(user.uid) });
    } else {
        await updateDoc(postRef, { likes: increment(1), likedBy: arrayUnion(user.uid) });
        if (post.uid !== user.uid) {
            await addDoc(collection(db, 'notifications'), {
                recipientId: post.uid, senderId: user.uid, senderName: user.displayName, senderAvatar: user.photoURL,
                type: 'like', targetId: id, timestamp: serverTimestamp(), isRead: false
            });
        }
    }
  };

  const submitComment = async () => {
    if (!commentText.trim() || !user) return;
    try {
      await addDoc(collection(db, 'posts', id, 'comments'), {
        text: commentText,
        uid: user.uid,
        userName: user.displayName,
        userAvatar: user.photoURL,
        parentId: replyingToId,
        timestamp: serverTimestamp()
      });
      await updateDoc(doc(db, 'posts', id), { comments: increment(1) });

      if (post.uid !== user.uid) {
          await addDoc(collection(db, 'notifications'), {
              recipientId: post.uid, senderId: user.uid, senderName: user.displayName, senderAvatar: user.photoURL,
              type: 'comment', targetId: id, timestamp: serverTimestamp(), isRead: false
          });
      }

      setCommentText('');
      setReplyingToId(null);
    } catch (e) {
      console.error("Comment failed", e);
    }
  };

  const handleDelete = async () => {
      if(window.confirm("Delete this post?")) {
          await deleteDoc(doc(db, 'posts', id));
          navigate('/');
      }
  };

  const handleShare = () => {
      const url = window.location.href;
      if (navigator.share) {
          navigator.share({ title: post.userName, text: post.text, url: url });
      } else {
          navigator.clipboard.writeText(url).then(() => alert("Link copied!"));
      }
  };

  if (loading) return <div className="p-20 text-center text-gray-500">Loading Post...</div>;
  if (!post) return <div className="p-20 text-center text-gray-500">Post not found or deleted.</div>;

  const isLikedByMe = user && post.likedBy && post.likedBy.includes(user.uid);

  return (
    <div className="p-4 md:p-6 w-full max-w-[1000px] mx-auto">
      <div className="hidden md:block"><TopBar /></div>
      
      <button onClick={() => navigate(-1)} className="mb-4 text-gray-500 font-bold flex items-center gap-2 hover:text-dark transition-colors">
          <i className="fas fa-arrow-left"></i> Back
      </button>

      <div className="glass-panel rounded-[30px] p-6 hover:shadow-xl transition-all duration-300 border border-white/60 relative">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-5">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => navigate(`/profile/${post.uid}`)}>
            <img src={post.userAvatar || DEFAULT_AVATAR} className="w-12 h-12 rounded-2xl object-cover" alt="User" />
            <div>
              <h4 className="font-bold text-dark text-lg leading-tight flex items-center gap-2">
                {post.userName}
                {post.isPrivate && <i className="fas fa-lock text-xs text-gray-400 ml-1"></i>}
              </h4>
              <p className="text-xs text-gray-500 font-medium">
                 {post.timestamp?.seconds ? new Date(post.timestamp.seconds * 1000).toLocaleString() : 'Just now'}
              </p>
            </div>
          </div>

          <div className="relative">
              <button onClick={() => setActiveMenu(!activeMenu)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400">
                  <i className="fas fa-ellipsis-h"></i>
              </button>
              {activeMenu && (
                  <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded-xl shadow-xl border border-gray-100 z-20 overflow-hidden py-1">
                      {user?.uid === post.uid ? (
                          <button onClick={handleDelete} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 font-bold">Delete</button>
                      ) : (
                          <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Report</button>
                      )}
                  </div>
              )}
          </div>
        </div>

        {/* Content */}
        <PostTextExpander text={post.text} hasMedia={!!post.mediaURL} />

        {post.mediaURL && (
          <div className="rounded-[24px] overflow-hidden mb-5 shadow-md border border-white/50 cursor-pointer bg-black" onClick={() => setFullscreenMedia({ url: post.mediaURL, type: post.mediaType })}>
            {post.mediaType === 'video' ? (
                <video src={post.mediaURL} controls className="w-full max-h-[600px] object-contain mx-auto" />
            ) : (
                <img src={post.mediaURL} className="w-full max-h-[600px] object-contain mx-auto" alt="Post Media" />
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2 border-t border-gray-100/50">
            <button onClick={handleLike} className={`h-10 px-5 rounded-xl border flex items-center gap-2 transition-all ${isLikedByMe ? 'bg-accent/10 border-accent/20 text-accent' : 'bg-white/50 border-white text-gray-600 hover:text-accent'}`}>
                <i className={`${isLikedByMe ? 'fas' : 'far'} fa-heart text-lg`}></i>
                <span className="font-bold text-sm">{post.likes || 0}</span>
            </button>
            <div className="h-10 px-5 rounded-xl bg-white/50 border border-white flex items-center gap-2 text-primary">
                <i className="fas fa-comment text-lg"></i>
                <span className="font-bold text-sm">{post.comments || 0}</span>
            </div>
            <button onClick={handleShare} className="h-10 w-10 rounded-xl bg-white/50 border border-white flex items-center justify-center text-gray-600 hover:text-dark ml-auto">
                <i className="far fa-share-square text-lg"></i>
            </button>
        </div>

        {/* Comments Section - Always Visible on Details Page */}
        <div className="mt-4">
            <CommentsList 
                postId={id} 
                user={user} 
                setCommentText={setCommentText} 
                setReplyingToId={setReplyingToId}
            />
            
            <div className="flex gap-2 mt-4 sticky bottom-0 bg-white/95 p-2 rounded-xl border border-gray-100 shadow-sm z-10">
                <input 
                    id="comment-input-main"
                    type="text" 
                    placeholder={replyingToId ? "Write a reply..." : "Write a comment..."}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                />
                <button 
                    onClick={submitComment} 
                    disabled={!commentText.trim()} 
                    className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shadow-md hover:bg-primary-dark transition-colors disabled:opacity-50"
                >
                    <i className="fas fa-paper-plane text-xs"></i>
                </button>
            </div>
        </div>

      </div>

      {/* Fullscreen Media Modal */}
      {fullscreenMedia && (
          <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 cursor-pointer" onClick={() => setFullscreenMedia(null)}>
              <button className="absolute top-4 right-4 text-white text-3xl">&times;</button>
              {fullscreenMedia.type === 'video' ? (
                  <video src={fullscreenMedia.url} controls autoPlay className="max-w-full max-h-full" onClick={e => e.stopPropagation()} />
              ) : (
                  <img src={fullscreenMedia.url} alt="Fullscreen" className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />
              )}
          </div>
      )}
    </div>
  );
};

export default PostDetails;