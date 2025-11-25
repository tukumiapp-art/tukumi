import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { db, auth } from '../api/firebase';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, increment, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import TopBar from '../components/TopBar';

// --- REUSED COMMENT COMPONENT ---
const CommentsList = ({ postId, highlightCommentId }) => {
  const [comments, setComments] = useState([]);
  useEffect(() => {
    const q = query(collection(db, 'posts', postId, 'comments'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [postId]);

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
      {comments.map(c => (
        <div key={c.id} className={`flex gap-3 ${c.id === highlightCommentId ? 'bg-yellow-50 p-2 rounded-lg border border-yellow-100 transition-all duration-1000' : ''}`}>
          <img src={c.userAvatar || "https://via.placeholder.com/150"} className="w-8 h-8 rounded-full object-cover" />
          <div className="bg-gray-50 p-3 rounded-2xl rounded-tl-none">
             <p className="text-xs font-bold text-dark">{c.userName}</p>
             <p className="text-sm text-gray-700">{c.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

const PostDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [post, setPost] = useState(null);
  const [user, setUser] = useState(null);
  const [commentText, setCommentText] = useState('');
  
  // Check if we need to highlight a specific comment (passed from notification)
  const highlightCommentId = location.state?.commentId;

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => setUser(u));
    const unsubPost = onSnapshot(doc(db, 'posts', id), (docSnap) => {
      if (docSnap.exists()) setPost({ id: docSnap.id, ...docSnap.data() });
      else setPost(null);
    });
    return () => { unsubAuth(); unsubPost(); };
  }, [id]);

  const handleLike = async () => {
    if (!user) return;
    const postRef = doc(db, 'posts', id);
    const isLiked = post.likedBy?.includes(user.uid);
    if (isLiked) await updateDoc(postRef, { likes: increment(-1), likedBy: arrayRemove(user.uid) });
    else await updateDoc(postRef, { likes: increment(1), likedBy: arrayUnion(user.uid) });
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !user) return;
    await addDoc(collection(db, 'posts', id, 'comments'), {
        text: commentText, uid: user.uid, userName: user.displayName, 
        userAvatar: user.photoURL, timestamp: serverTimestamp()
    });
    await updateDoc(doc(db, 'posts', id), { comments: increment(1) });
    setCommentText('');
  };

  if (!post) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="p-4 md:p-6 w-full max-w-[1000px] mx-auto">
      <TopBar />
      <button onClick={() => navigate(-1)} className="mb-4 font-bold text-gray-500 flex items-center gap-2"><i className="fas fa-arrow-left"></i> Back</button>
      
      <div className="bg-white rounded-[30px] p-6 shadow-lg border border-gray-100">
         {/* Post Header */}
         <div className="flex items-center gap-4 mb-4 cursor-pointer" onClick={() => navigate(`/profile/${post.uid}`)}>
            <img src={post.userAvatar} className="w-12 h-12 rounded-full object-cover border" />
            <div>
               <h3 className="font-black text-dark text-lg">{post.userName}</h3>
               <p className="text-xs text-gray-400">{post.timestamp?.seconds ? new Date(post.timestamp.seconds * 1000).toLocaleString() : ''}</p>
            </div>
         </div>

         {/* Content */}
         <p className="text-gray-800 text-lg mb-4 whitespace-pre-wrap">{post.text}</p>
         {post.mediaURL && (
            <div className="rounded-2xl overflow-hidden mb-6 bg-black">
               {post.mediaType === 'video' ? (
                 <video src={post.mediaURL} controls className="w-full max-h-[600px] object-contain" />
               ) : (
                 <img src={post.mediaURL} className="w-full max-h-[600px] object-contain mx-auto" />
               )}
            </div>
         )}

         {/* Actions */}
         <div className="flex gap-6 pt-4 border-t border-gray-100 mb-6">
            <button onClick={handleLike} className={`flex items-center gap-2 font-bold ${post.likedBy?.includes(user?.uid) ? 'text-red-500' : 'text-gray-500'}`}>
               <i className="fas fa-heart text-xl"></i> {post.likes}
            </button>
            <div className="flex items-center gap-2 font-bold text-gray-500">
               <i className="far fa-comment text-xl"></i> {post.comments}
            </div>
         </div>

         {/* Comment Input */}
         <div className="flex gap-2 mb-6">
            <input value={commentText} onChange={e => setCommentText(e.target.value)} className="flex-1 bg-gray-50 border rounded-xl px-4 py-3" placeholder="Write a comment..." />
            <button onClick={handleSubmitComment} className="bg-dark text-white w-12 rounded-xl"><i className="fas fa-paper-plane"></i></button>
         </div>

         {/* Comments List */}
         <h3 className="font-bold text-lg mb-2">Comments</h3>
         <CommentsList postId={id} highlightCommentId={highlightCommentId} />
      </div>
    </div>
  );
};

export default PostDetails;