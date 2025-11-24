import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, auth, storage } from '../api/firebase';
import { 
  doc, getDoc, collection, query, orderBy, onSnapshot, 
  addDoc, serverTimestamp, updateDoc, arrayUnion, arrayRemove, 
  increment, deleteDoc 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import TopBar from '../components/TopBar';

// --- HELPER: Fetches User Details for Member List ---
const MemberRow = ({ uid, isAdminView, onRemove }) => {
    const [member, setMember] = useState(null);

    useEffect(() => {
        const fetchMember = async () => {
            const docRef = doc(db, 'users', uid);
            const snap = await getDoc(docRef);
            if (snap.exists()) setMember(snap.data());
            else setMember({ displayName: 'Unknown User', photoURL: null });
        };
        fetchMember();
    }, [uid]);

    if (!member) return <div className="p-3 text-xs text-gray-400">Loading...</div>;

    return (
        <div className="flex justify-between items-center p-3 bg-white/60 rounded-xl border border-white/50 mb-2">
            <div className="flex items-center gap-3">
                <img src={member.photoURL || "https://via.placeholder.com/40"} className="w-8 h-8 rounded-full object-cover" alt={member.displayName} />
                <span className="text-sm font-bold text-gray-700">{member.displayName}</span>
            </div>
            {isAdminView && (
                <button onClick={() => onRemove(uid)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg text-xs font-bold">
                    Remove
                </button>
            )}
        </div>
    );
};

const CircleDetails = () => {
  const { circleId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [circle, setCircle] = useState(null);
  const [posts, setPosts] = useState([]);
  const [activeTab, setActiveTab] = useState('feed'); // feed, members, requests, settings, report
  
  // Posting
  const [newPost, setNewPost] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [isPosting, setIsPosting] = useState(false);

  // Admin Actions
  const [editName, setEditName] = useState('');
  const [editCover, setEditCover] = useState(null);

  // Report
  const [reportReason, setReportReason] = useState('');

  // Interaction States
  const [activeMenuPostId, setActiveMenuPostId] = useState(null);
  const [editingPostId, setEditingPostId] = useState(null);
  const [editText, setEditText] = useState('');
  const [activeCommentBox, setActiveCommentBox] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [fullscreenMedia, setFullscreenMedia] = useState(null);
  
  // Circle Menu State
  const [showCircleMenu, setShowCircleMenu] = useState(false);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (authUser) => {
      if (authUser) {
        const unsubUser = onSnapshot(doc(db, 'users', authUser.uid), (docSnap) => {
           if (docSnap.exists()) setUser({ uid: authUser.uid, ...docSnap.data() });
           else setUser(authUser);
        });
        return () => unsubUser();
      } else setUser(null);
    });
    
    const unsubCircle = onSnapshot(doc(db, 'circles', circleId), (docSnap) => {
      if (docSnap.exists()) {
        setCircle({ id: docSnap.id, ...docSnap.data() });
        setEditName(docSnap.data().name);
      } else {
        navigate('/circles');
      }
    });

    const q = query(collection(db, `circles/${circleId}/posts`), orderBy('timestamp', 'desc'));
    const unsubPosts = onSnapshot(q, (snap) => setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    const handleClickOutside = (e) => {
      if (!e.target.closest('.post-menu-container')) setActiveMenuPostId(null);
      if (!e.target.closest('.circle-menu-container')) setShowCircleMenu(false);
    };
    document.addEventListener('click', handleClickOutside);

    return () => { unsubCircle(); unsubPosts(); document.removeEventListener('click', handleClickOutside); };
  }, [circleId, navigate]);

  if (!circle) return <div className="p-10 text-center">Loading Circle...</div>;

  const isMember = user && circle.members && circle.members.includes(user.uid);
  const isAdmin = user && circle.admins && circle.admins.includes(user.uid);
  const isOwner = user && circle.createdBy === user.uid;
  const isRequested = user && circle.joinRequests && circle.joinRequests.includes(user.uid);

  // --- JOIN HANDLER (FIXED) ---
  const handleJoin = async () => {
    if (!user) return alert("Sign in required.");
    const circleRef = doc(db, 'circles', circleId);
    
    if (circle.isPrivate) {
      if (isRequested) return alert("Request already sent.");
      await updateDoc(circleRef, { joinRequests: arrayUnion(user.uid) });
      alert("Join request sent to admins.");
    } else {
      await updateDoc(circleRef, {
        members: arrayUnion(user.uid),
        memberCount: increment(1)
      });
      alert("Welcome to the Circle!");
    }
  };

  // --- POST ACTIONS ---
  const handlePost = async () => {
    if ((!newPost.trim() && !mediaFile) || !user) return;
    setIsPosting(true);
    try {
      let mediaURL = null, mediaType = null;
      if (mediaFile) {
        const storageRef = ref(storage, `circles/${circleId}/posts/${Date.now()}_${mediaFile.name}`);
        await uploadBytes(storageRef, mediaFile);
        mediaURL = await getDownloadURL(storageRef);
        mediaType = mediaFile.type.startsWith('video/') ? 'video' : 'image';
      }
      await addDoc(collection(db, `circles/${circleId}/posts`), {
        text: newPost, uid: user.uid, userName: user.displayName, userAvatar: user.photoURL || null, 
        mediaURL, mediaType, timestamp: serverTimestamp(), likes: 0, comments: 0, likedBy: []
      });
      setNewPost(''); setMediaFile(null);
    } catch (err) { console.error("Post error:", err); } finally { setIsPosting(false); }
  };

  // Admin Actions
  const handleKick = async (memberId) => {
    if (!confirm("Remove this member?")) return;
    await updateDoc(doc(db, 'circles', circleId), { members: arrayRemove(memberId), admins: arrayRemove(memberId), memberCount: increment(-1) });
  };
  const handleLeaveCircle = async () => { 
      if (isOwner) return alert("Owner cannot leave."); 
      if (confirm("Are you sure you want to leave?")) { 
          await updateDoc(doc(db, 'circles', circleId), { members: arrayRemove(user.uid), admins: arrayRemove(user.uid), memberCount: increment(-1) }); 
          navigate('/circles'); 
      }
  };
  const handleDeleteCircle = async () => { if (confirm("Delete permanently?")) { await deleteDoc(doc(db, 'circles', circleId)); navigate('/circles'); }};
  const handleUpdateCircle = async () => { try { let newImage = circle.image; if (editCover) { const imgRef = ref(storage, `circles/${circleId}/cover_${Date.now()}`); await uploadBytes(imgRef, editCover); newImage = await getDownloadURL(imgRef); } await updateDoc(doc(db, 'circles', circleId), { name: editName, image: newImage }); alert("Updated!"); setEditCover(null); } catch (err) { console.error(err); }};
  const handleReportCircle = async () => { if (!reportReason) return alert("Select reason"); await addDoc(collection(db, 'reports'), { targetId: circleId, type: 'circle', reporter: user.uid, reason: reportReason, timestamp: serverTimestamp() }); alert("Reported."); setReportReason(''); };
  
  // Post Interactions
  const handleLike = async (post) => {
    if (!user) return alert("Sign in required.");
    const postRef = doc(db, `circles/${circleId}/posts`, post.id);
    const isLiked = post.likedBy && post.likedBy.includes(user.uid);
    if (isLiked) await updateDoc(postRef, { likes: increment(-1), likedBy: arrayRemove(user.uid) });
    else await updateDoc(postRef, { likes: increment(1), likedBy: arrayUnion(user.uid) });
  };
  const toggleCommentBox = (postId) => { if (activeCommentBox === postId) setActiveCommentBox(null); else { setActiveCommentBox(postId); setCommentText(''); } };
  const submitComment = async (postId) => {
    if (!commentText.trim() || !user) return;
    await addDoc(collection(db, `circles/${circleId}/posts/${postId}/comments`), { text: commentText, uid: user.uid, userName: user.displayName, userAvatar: user.photoURL, timestamp: serverTimestamp() });
    await updateDoc(doc(db, `circles/${circleId}/posts`, postId), { comments: increment(1) });
    setCommentText(''); setActiveCommentBox(null);
  };
  const handleShare = (post) => {
      const shareData = { title: `Post in ${circle.name}`, text: post.text, url: window.location.href };
      if (navigator.share) navigator.share(shareData);
      else { navigator.clipboard.writeText(window.location.href); alert("Link copied!"); }
  };
  const handleDeletePost = async (postId) => { if (confirm("Delete post?")) await deleteDoc(doc(db, `circles/${circleId}/posts`, postId)); };
  const startEditing = (post) => { setEditingPostId(post.id); setEditText(post.text); setActiveMenuPostId(null); };
  const saveEdit = async (postId) => { await updateDoc(doc(db, `circles/${circleId}/posts`, postId), { text: editText }); setEditingPostId(null); };
  const handleReportPost = async (postId) => { await addDoc(collection(db, 'reports'), { postId, circleId, reporter: user.uid, reason: 'Flagged in Circle', timestamp: serverTimestamp() }); alert("Post reported."); setActiveMenuPostId(null); };

  return (
    <div className="p-4 md:p-6 w-full max-w-[1400px] mx-auto">
      <div className="hidden md:block"><TopBar /></div>
      <button onClick={() => navigate('/circles')} className="mb-4 text-sm text-gray-500 hover:text-primary font-bold flex items-center gap-2">
        <i className="fas fa-arrow-left"></i> Back to Circles
      </button>

      {/* HERO SECTION */}
      <div className="bg-white rounded-[30px] shadow-sm overflow-hidden mb-8 relative">
        <div className="h-60 w-full bg-gray-200 bg-cover bg-center" style={{ backgroundImage: `url(${circle.image})` }}>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
          <div className="absolute bottom-0 left-0 p-8 text-white w-full">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <span className="bg-primary px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">{circle.category || 'Social'}</span>
                        {circle.isPrivate && <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-bold"><i className="fas fa-lock mr-1"></i> Private</span>}
                    </div>
                    <h1 className="text-4xl font-black mb-2">{circle.name}</h1>
                    <p className="text-white/80 max-w-2xl text-sm">{circle.description}</p>
                </div>
                
                {/* ACTION BUTTONS */}
                <div className="flex items-center gap-3">
                    {!isMember ? (
                        <button 
                            onClick={handleJoin} 
                            className={`px-6 py-2 rounded-xl font-bold text-sm shadow-lg transition-all ${isRequested ? 'bg-yellow-100 text-yellow-700' : 'bg-white text-dark hover:bg-primary hover:text-white'}`}
                            disabled={isRequested}
                        >
                            {isRequested ? 'Request Pending' : 'Join Circle'}
                        </button>
                    ) : (
                        // CIRCLE MENU (3-Dots for Member Actions)
                        <div className="relative circle-menu-container">
                            <button onClick={() => setShowCircleMenu(!showCircleMenu)} className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white hover:text-dark transition-all">
                                <i className="fas fa-cog text-lg"></i>
                            </button>
                            
                            {showCircleMenu && (
                                <div className="absolute right-0 bottom-12 w-48 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-fade-in p-1">
                                    {isAdmin && <button onClick={() => { setActiveTab('settings'); setShowCircleMenu(false); }} className="w-full text-left px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 rounded-lg flex items-center gap-2"><i className="fas fa-sliders-h text-primary"></i> Settings</button>}
                                    {!isOwner && <button onClick={() => { handleLeaveCircle(); setShowCircleMenu(false); }} className="w-full text-left px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-50 rounded-lg flex items-center gap-2"><i className="fas fa-sign-out-alt"></i> Leave Circle</button>}
                                    {!isAdmin && <button onClick={() => { setActiveTab('report'); setShowCircleMenu(false); }} className="w-full text-left px-4 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-lg flex items-center gap-2"><i className="fas fa-flag"></i> Report</button>}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
          </div>
        </div>
        
        {/* Stats Bar */}
        <div className="px-8 py-4 flex gap-8 text-sm font-bold text-gray-500 border-b border-gray-100">
           <span><i className="fas fa-users mr-2"></i>{circle.memberCount} Members</span>
           <span><i className="fas fa-layer-group mr-2"></i>{posts.length} Posts</span>
           <span><i className="fas fa-user-shield mr-2"></i>{circle.admins?.length || 1} Admins</span>
        </div>
      </div>

      {/* Tabs */}
      {isMember && (
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            <button onClick={() => setActiveTab('feed')} className={`px-6 py-2 font-bold text-sm rounded-full transition-colors ${activeTab === 'feed' ? 'bg-dark text-white' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>Feed</button>
            <button onClick={() => setActiveTab('members')} className={`px-6 py-2 font-bold text-sm rounded-full transition-colors ${activeTab === 'members' ? 'bg-dark text-white' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>Members</button>
            {isAdmin && circle.isPrivate && <button onClick={() => setActiveTab('requests')} className={`px-6 py-2 font-bold text-sm rounded-full transition-colors ${activeTab === 'requests' ? 'bg-dark text-white' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>Requests {circle.joinRequests?.length > 0 && <span className="ml-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{circle.joinRequests.length}</span>}</button>}
          </div>
      )}

      {/* Content Area */}
      <div className="flex flex-col lg:flex-row gap-8">
         <div className="flex-1">
            
            {/* FEED TAB */}
            {activeTab === 'feed' && (
               isMember ? (
                   <div className="space-y-6">
                     {/* Composer */}
                     <div className="glass-panel rounded-[24px] p-4">
                        <textarea value={newPost} onChange={e => setNewPost(e.target.value)} placeholder={`Post something to ${circle.name}...`} className="w-full bg-white/60 rounded-xl p-4 outline-none resize-none text-sm focus:ring-2 focus:ring-primary/20" rows="3"></textarea>
                        <div className="flex justify-between items-center mt-3">
                            <div className="flex gap-2">
                                <label className="cursor-pointer w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 hover:bg-primary/10 hover:text-primary"><i className="fas fa-image"></i><input type="file" className="hidden" accept="image/*,video/*" onChange={e => setMediaFile(e.target.files[0])} /></label>
                                {mediaFile && <span className="text-xs text-primary self-center truncate max-w-[100px]">{mediaFile.name}</span>}
                            </div>
                            <button onClick={handlePost} disabled={isPosting} className="bg-dark text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-primary shadow-lg disabled:opacity-50">{isPosting ? 'Posting...' : 'Post'}</button>
                        </div>
                     </div>

                     {/* Posts */}
                     {posts.map(post => {
                       const isLikedByMe = post.likedBy && post.likedBy.includes(user.uid);
                       return (
                       <div key={post.id} className="glass-panel rounded-[24px] p-6 border border-white/60 relative">
                          <div className="flex justify-between items-start mb-4">
                             <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigate(`/profile/${post.uid}`)}>
                                 <img src={post.userAvatar || "https://via.placeholder.com/40"} className="w-10 h-10 rounded-full border border-gray-200 object-cover" />
                                 <div><h4 className="font-bold text-dark text-sm group-hover:text-primary">{post.userName}</h4><p className="text-xs text-gray-400">{post.timestamp?.seconds ? new Date(post.timestamp.seconds * 1000).toLocaleDateString() : 'Just now'}</p></div>
                             </div>
                             <div className="relative post-menu-container">
                                <button onClick={() => setActiveMenuPostId(activeMenuPostId === post.id ? null : post.id)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400"><i className="fas fa-ellipsis-h"></i></button>
                                {activeMenuPostId === post.id && (
                                  <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded-xl shadow-xl border border-gray-100 z-20 overflow-hidden py-1">
                                    {(user?.uid === post.uid || isAdmin) ? (
                                      <><button onClick={() => handleDeletePost(post.id)} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 font-bold">Delete</button></>
                                    ) : (<button onClick={() => handleReportPost(post.id)} className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50">Report</button>)}
                                  </div>
                                )}
                             </div>
                          </div>
                          <p className="text-gray-800 mb-4 leading-relaxed">{post.text}</p>
                          {post.mediaURL && (<div className="rounded-xl overflow-hidden mb-4 shadow-sm cursor-pointer" onClick={() => setFullscreenMedia({ url: post.mediaURL, type: post.mediaType })}>{post.mediaType === 'video' ? <video src={post.mediaURL} controls className="w-full max-h-[400px] bg-black" /> : <img src={post.mediaURL} className="w-full max-h-[400px] object-cover" />}</div>)}
                          
                          <div className="flex items-center gap-3 pt-2 border-t border-gray-100/50">
                             <button onClick={() => handleLike(post)} className={`h-10 px-5 rounded-xl border flex items-center gap-2 transition-all ${isLikedByMe ? 'bg-accent/10 border-accent/20 text-accent' : 'bg-white/50 border-white text-gray-600'}`}><i className={`${isLikedByMe ? 'fas' : 'far'} fa-heart`}></i> <span className="font-bold text-sm">{post.likes || 0}</span></button>
                             <button onClick={() => toggleCommentBox(post.id)} className="h-10 px-5 rounded-xl bg-white/50 border border-white flex items-center gap-2 text-gray-600"><i className="far fa-comment"></i> <span className="font-bold text-sm">{post.comments || 0}</span></button>
                             <button onClick={() => handleShare(post)} className="h-10 w-10 rounded-xl bg-white/50 border border-white flex items-center justify-center text-gray-600 ml-auto"><i className="far fa-share-square"></i></button>
                          </div>

                          {activeCommentBox === post.id && (<div className="mt-4 flex gap-2"><input type="text" placeholder="Write a comment..." className="flex-1 bg-white/80 border border-white/50 rounded-xl px-4 py-2 text-sm focus:outline-none" value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitComment(post.id)} autoFocus /><button onClick={() => submitComment(post.id)} className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shadow-md"><i className="fas fa-paper-plane text-xs"></i></button></div>)}
                       </div>
                     )})}
                   </div>
               ) : (
                   <div className="text-center py-20 text-gray-400 bg-white rounded-[30px] shadow-sm"><i className="fas fa-lock text-4xl mb-4 text-gray-300"></i><h3 className="text-lg font-bold text-dark">Private Content</h3><p>Join this circle to view posts.</p></div>
               )
            )}

            {/* MEMBERS TAB (UPDATED VISIBILITY) */}
            {activeTab === 'members' && isMember && (
                <div className="glass-panel rounded-[24px] p-6">
                    <h3 className="font-bold text-dark mb-4 flex justify-between items-center">
                        Members 
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">{circle.memberCount}</span>
                    </h3>
                    
                    {isAdmin ? (
                        // ADMIN VIEW: Show List
                        <div className="space-y-1">
                            {circle.members.map(memberId => (
                                <MemberRow key={memberId} uid={memberId} isAdminView={true} onRemove={handleKick} />
                            ))}
                        </div>
                    ) : (
                        // REGULAR VIEW: Hide List
                        <div className="text-center py-10 bg-gray-50/50 rounded-xl border border-gray-100">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-400 text-2xl">
                                <i className="fas fa-users"></i>
                            </div>
                            <h4 className="font-bold text-dark">Total Members: {circle.memberCount}</h4>
                            <p className="text-xs text-gray-500 mt-1">Only admins can view the full member list.</p>
                        </div>
                    )}
                </div>
            )}
            
            {/* SETTINGS/REPORT TABS */}
            {activeTab === 'settings' && isAdmin && (
                <div className="glass-panel rounded-[24px] p-6 space-y-6"><div><h3 className="font-bold text-dark mb-2">Edit Details</h3><div className="space-y-3"><input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm" placeholder="Circle Name" /><div className="flex gap-2 items-center"><input type="file" onChange={e => setEditCover(e.target.files[0])} className="text-sm text-gray-500" /><button onClick={handleUpdateCircle} className="bg-dark text-white px-4 py-2 rounded-lg text-xs font-bold">Save Changes</button></div></div></div><div className="pt-6 border-t border-gray-200"><h3 className="font-bold text-red-500 mb-2">Danger Zone</h3><button onClick={handleDeleteCircle} className="w-full bg-red-50 text-red-500 border border-red-200 py-3 rounded-xl font-bold text-sm hover:bg-red-100">Delete Circle Permanently</button></div></div>
            )}
            {activeTab === 'report' && !isAdmin && (
                <div className="glass-panel rounded-[24px] p-6"><h3 className="font-bold text-dark mb-4">Report Circle</h3><textarea className="w-full bg-gray-50 p-3 rounded-xl text-sm mb-3 border border-gray-200" rows="3" placeholder="Reason..." value={reportReason} onChange={e => setReportReason(e.target.value)}></textarea><button onClick={handleReportCircle} className="w-full bg-red-500 text-white py-3 rounded-xl font-bold text-sm hover:bg-red-600">Submit Report</button></div>
            )}
         </div>
      </div>
      
      {fullscreenMedia && (<div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex items-center justify-center" onClick={() => setFullscreenMedia(null)}><img src={fullscreenMedia.url} className="max-w-full max-h-full object-contain" /></div>)}
    </div>
  );
};

export default CircleDetails;