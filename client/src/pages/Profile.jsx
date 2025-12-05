import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import EditProfileModal from '../components/EditProfileModal';
import BoostModal from '../components/BoostModal';
import VerificationModal from '../components/VerificationModal';
import { db, auth } from '../api/firebase';
import { 
  doc, collection, query, where, orderBy, onSnapshot, 
  updateDoc, increment, arrayUnion, arrayRemove, addDoc, serverTimestamp, deleteDoc,
  getDoc, writeBatch 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// --- CONSTANTS (Copied from Home.jsx) ---
const DEFAULT_AVATAR = "https://ui-avatars.com/api/?name=User&background=random";

// --- HELPER: Threaded Comments List ---
const ProfilePostComments = ({ postId, currentUser, onReply }) => {
    const navigate = useNavigate();
    const [comments, setComments] = useState([]);

    useEffect(() => {
        // Fetch comments ordered by timestamp
        const q = query(collection(db, 'posts', postId, 'comments'), orderBy('timestamp', 'asc'));
        const unsub = onSnapshot(q, snap => {
            const rawComments = snap.docs.map(d => ({id: d.id, ...d.data()}));
            setComments(rawComments);
        });
        return () => unsub();
    }, [postId]);

    if (comments.length === 0) return null;

    // Filter root comments and create a function to get replies
    const rootComments = comments.filter(c => !c.parentId);
    const getReplies = (parentId) => comments.filter(c => c.parentId === parentId);

    const CommentItem = ({ c, isReply }) => (
        <div className={`flex gap-3 items-start text-sm mb-3 ${isReply ? 'ml-10' : ''}`}>
            {/* FIXED: Uses DEFAULT_AVATAR logic from Home.jsx */}
            <img 
                src={c.userAvatar || DEFAULT_AVATAR} 
                className="w-8 h-8 rounded-full object-cover flex-shrink-0 cursor-pointer border border-gray-100" 
                alt={c.userName} 
                onClick={() => navigate(`/profile/${c.uid}`)} 
                onError={(e) => { e.target.src = DEFAULT_AVATAR; }}
            />
            <div className="flex-1">
                <div className="bg-gray-50 px-3 py-2 rounded-2xl rounded-tl-none inline-block border border-gray-100">
                    <span 
                        className="font-bold text-xs block text-dark cursor-pointer hover:underline flex items-center gap-1"
                        onClick={() => navigate(`/profile/${c.uid}`)}
                    >
                        {c.userName}
                        {/* Verified badge only shows if the specific comment author isVerified */}
                        {c.isVerified && <i className="fas fa-check-circle text-blue-500 text-[10px]" title="Verified Commenter"></i>}
                    </span>
                    <p className="text-gray-700 leading-tight">{c.text}</p>
                </div>
                {!isReply && (
                    <button 
                        onClick={() => onReply(c.id, c.userName)} 
                        className="text-[10px] font-bold text-gray-500 ml-2 mt-1 hover:text-primary"
                    >
                        Reply
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div className="mt-3 px-2 max-h-60 overflow-y-auto custom-scrollbar">
            {rootComments.map(root => (
                <div key={root.id}>
                    <CommentItem c={root} isReply={false} />
                    {getReplies(root.id).map(reply => (
                        <CommentItem key={reply.id} c={reply} isReply={true} />
                    ))}
                </div>
            ))}
        </div>
    );
};

// --- MAIN PROFILE COMPONENT ---
const Profile = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // Data States
  const [profileData, setProfileData] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null); // FIXED: Added to track YOUR status
  const [posts, setPosts] = useState([]);
  
  // UI States
  const [isOwner, setIsOwner] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentUid, setCurrentUid] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loadingFollow, setLoadingFollow] = useState(false);
  
  // Interaction States
  const [activeCommentBox, setActiveCommentBox] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [replyingToId, setReplyingToId] = useState(null); 
  const [fullscreenMedia, setFullscreenMedia] = useState(null);
  const [activeMenuPostId, setActiveMenuPostId] = useState(null);
  const [editingPostId, setEditingPostId] = useState(null);
  const [editText, setEditText] = useState('');
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportingPostId, setReportingPostId] = useState(null);

  // Boost & Verification States
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  useEffect(() => {
    // 1. Authentication Listener
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUid(user.uid);
        
        // FIXED: Fetch CURRENT user's data (to know if *I* am verified when I comment)
        const unsubCurrentUser = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
            if (docSnap.exists()) {
                setCurrentUserData(docSnap.data());
            }
        });

        const targetId = id || user.uid; 
        setIsOwner(targetId === user.uid);
        loadProfileAndPosts(targetId);
        if (targetId !== user.uid) checkIfFollowing(targetId, user.uid);

        return () => unsubCurrentUser(); // Cleanup listener
      } else if (id) {
          loadProfileAndPosts(id);
      }
    });
    
    // 2. Click Outside Listener for Post Menu
    const handleClickOutside = (e) => { 
        if (!e.target.closest('.post-menu-container')) setActiveMenuPostId(null); 
    };
    document.addEventListener('click', handleClickOutside);

    return () => { 
        unsubAuth(); 
        document.removeEventListener('click', handleClickOutside); 
    };
  }, [id]);

  const loadProfileAndPosts = (targetId) => {
    // Load Profile Data (Real-time listener)
    const unsubProfile = onSnapshot(doc(db, 'users', targetId), (docSnap) => {
      if (docSnap.exists()) {
        setProfileData(docSnap.data());
      } else if (targetId === auth.currentUser?.uid) {
          // Fallback for new user without data in Firestore
          setProfileData({ 
            displayName: auth.currentUser.displayName, 
            handle: 'user', 
            photoURL: auth.currentUser.photoURL, 
            coverPhotoURL: null, 
            bio: "New user", 
            followers: 0, 
            following: 0,
            followersList: [], 
            followingList: []
          });
      } else { 
          setProfileData(null); 
      }
    });

    // Load Posts (Real-time listener)
    const postsRef = collection(db, 'posts');
    const q = query(postsRef, where("uid", "==", targetId), orderBy("timestamp", "desc"));
    const unsubPosts = onSnapshot(q, (snapshot) => {
        setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubProfile(); unsubPosts(); };
  };

  // Follow Logic
  const checkIfFollowing = async (targetId, myId) => { 
      const docRef = doc(db, 'users', targetId, 'followers', myId); 
      const docSnap = await getDoc(docRef); 
      setIsFollowing(docSnap.exists()); 
  };
  
  const handleFollow = async () => { 
    if (!currentUid || loadingFollow) return; 
    setLoadingFollow(true); 
    const targetId = id || currentUid; 
    
    try { 
        const batch = writeBatch(db); 
        const targetUserRef = doc(db, 'users', targetId); 
        const myUserRef = doc(db, 'users', currentUid); 
        const followerRef = doc(db, 'users', targetId, 'followers', currentUid); 
        const followingRef = doc(db, 'users', currentUid, 'following', targetId); 
        
        if (isFollowing) { 
            batch.delete(followerRef); 
            batch.delete(followingRef); 
            batch.update(targetUserRef, { followers: increment(-1), followersList: arrayRemove(currentUid) }); 
            batch.update(myUserRef, { following: increment(-1), followingList: arrayRemove(targetId) }); 
            setIsFollowing(false); 
        } else { 
            batch.set(followerRef, { timestamp: serverTimestamp() }); 
            batch.set(followingRef, { timestamp: serverTimestamp() }); 
            batch.update(targetUserRef, { followers: increment(1), followersList: arrayUnion(currentUid) }); 
            batch.update(myUserRef, { following: increment(1), followingList: arrayUnion(targetId) }); 
            setIsFollowing(true); 
            
            if (targetId !== currentUid) {
                await addDoc(collection(db, 'notifications'), { 
                    recipientId: targetId, 
                    senderId: currentUid, 
                    senderName: auth.currentUser.displayName, 
                    senderAvatar: auth.currentUser.photoURL, 
                    type: 'follow', 
                    targetId: currentUid, 
                    timestamp: serverTimestamp(), 
                    isRead: false 
                }); 
            }
        } 
        await batch.commit(); 
    } catch (err) { 
        console.error("Follow error:", err); 
    } finally { 
        setLoadingFollow(false); 
    } 
  };
  
  // --- SMART AMIGO STATUS LOGIC ---
  const isMutual = profileData?.followingList?.includes(currentUid) && isFollowing;
  
  const getFriendLabel = () => {
      const g = profileData?.gender;
      if (g === 'Male') return 'Amigo';
      if (g === 'Female') return 'Amiga';
      return 'Amigos';
  };
  const friendLabel = getFriendLabel();

  const handleMessage = () => { 
      if (!currentUid) return console.error("Please sign in."); 
      navigate('/messages', { state: { startChatWith: { ...profileData, uid: id || currentUid } } }); 
  };

  const handleBoostProfile = async (campaignData) => {
      await addDoc(collection(db, 'boost_requests'), { ...campaignData, requesterId: currentUid, timestamp: serverTimestamp() });
      alert("Profile promotion requested!");
      setShowBoostModal(false);
  };

  // Post Interactions
  const handleLike = async (post) => { 
      if (!currentUid) return console.error("Sign in."); 
      const postRef = doc(db, 'posts', post.id); 
      const isLiked = post.likedBy && post.likedBy.includes(currentUid); 
      
      if (isLiked) {
          await updateDoc(postRef, { likes: increment(-1), likedBy: arrayRemove(currentUid) });
      } else {
          await updateDoc(postRef, { likes: increment(1), likedBy: arrayUnion(currentUid) });
      }
  };
  
  const toggleCommentBox = (postId) => { 
      if (!currentUid) return console.error("Sign in to comment."); 
      if (activeCommentBox === postId) setActiveCommentBox(null); 
      else { setActiveCommentBox(postId); setCommentText(''); setReplyingToId(null); } 
  };
  
  const handleReply = (parentId, userName) => {
      setReplyingToId(parentId);
      setCommentText(`@${userName} `);
      document.querySelector(`#comment-input-${activeCommentBox}`)?.focus();
  };

  const submitComment = async (postId) => {
    if (!commentText.trim() || !currentUid) return;
    
    // FIXED: Use currentUserData for verification and avatar logic
    // We default to `false` if currentUserData isn't loaded yet to avoid the "everyone verified" bug
    await addDoc(collection(db, 'posts', postId, 'comments'), { 
        text: commentText, 
        uid: currentUid, 
        userName: currentUserData?.displayName || auth.currentUser.displayName, 
        userAvatar: currentUserData?.photoURL || auth.currentUser.photoURL || DEFAULT_AVATAR, 
        isVerified: currentUserData?.isVerified || false, // <--- THE KEY FIX
        parentId: replyingToId,
        timestamp: serverTimestamp() 
    });
    
    await updateDoc(doc(db, 'posts', postId), { comments: increment(1) });
    setCommentText(''); setReplyingToId(null);
  };
  
  const handleShare = async (post) => { 
      const url = `${window.location.origin}/post/${post.id}`; 
      if (navigator.clipboard) { 
          navigator.clipboard.writeText(url).then(() => alert('Link copied!')); 
      }
  };
  
  const handleDelete = async (pid) => { 
      if (window.confirm("Delete this post?")) { 
          await deleteDoc(doc(db, 'posts', pid));
      }
  };
  
  const handleTogglePrivate = async (post) => { 
      await updateDoc(doc(db, 'posts', post.id), { isPrivate: !post.isPrivate }); 
      setActiveMenuPostId(null); 
  };
  
  const handleSubmitReport = async (reason) => { 
      if (!reportingPostId || !currentUid) return; 
      await addDoc(collection(db, 'reports'), { 
          targetId: reportingPostId, 
          type: 'post', 
          reporter: currentUid, 
          reason, 
          timestamp: serverTimestamp() 
      }); 
      setReportModalOpen(false); 
      setReportingPostId(null); 
  };
  
  const startEditing = (post) => { 
      setEditingPostId(post.id); 
      setEditText(post.text); 
      setActiveMenuPostId(null); 
  };
  
  const saveEdit = async (pid) => { 
      if(!editText.trim()) return; 
      await updateDoc(doc(db, 'posts', pid), { text: editText }); 
      setEditingPostId(null); 
  };

  if (!profileData) return <div className="p-10 text-center text-gray-500">Loading profile...</div>;

  return (
    <div className="p-2 md:p-6 w-full max-w-[1400px] mx-auto pb-24">
      <div className="hidden md:block"><TopBar /></div>
      
      {/* Header Card */}
      <div className="bg-white rounded-[30px] shadow-sm overflow-hidden mb-8 relative group transition-all hover:shadow-md">
        {/* Cover Photo */}
        <div className={`h-48 md:h-80 w-full bg-gray-200 bg-cover bg-center relative ${profileData.isVerified ? 'ring-b-4 ring-blue-500' : ''}`} style={{ backgroundImage: `url(${profileData.coverPhotoURL || 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809'})` }}>
            {profileData.isVerified && <div className="absolute inset-0 bg-gradient-to-t from-blue-900/30 to-transparent"></div>}
        </div>
        
        <div className="px-6 md:px-10 pb-8 relative">
          <div className="flex flex-col md:flex-row justify-between items-end -mt-16 md:-mt-20 mb-6">
            
            {/* Avatar - Uses DEFAULT_AVATAR Logic */}
            <div className="relative mx-auto md:mx-0">
              <div className={`w-32 h-32 md:w-44 md:h-44 rounded-[2rem] p-1 bg-white shadow-2xl ${profileData.isVerified ? 'ring-4 ring-offset-4 ring-blue-500/50' : ''}`}>
                 <img 
                    src={profileData.photoURL || DEFAULT_AVATAR} 
                    className="w-full h-full rounded-[1.8rem] object-cover" 
                    alt={`${profileData.displayName} avatar`}
                    onError={(e) => { e.target.src = DEFAULT_AVATAR; }}
                 />
              </div>
            </div>
            
            {/* Action Buttons & Stats */}
            <div className="flex flex-col items-center w-full md:w-auto mt-4 md:mt-0 md:mb-4 gap-3">
               {/* Stats */}
               <div className="flex items-center gap-6 bg-white/90 backdrop-blur-md px-6 py-3 rounded-2xl shadow-sm border border-gray-100">
                 <div className="text-center"><span className="block font-black text-lg text-dark">{posts.length}</span><span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Posts</span></div>
                 <div className="w-px h-8 bg-gray-200"></div>
                 <div className="text-center cursor-pointer hover:opacity-70 transition-opacity" onClick={() => navigate(`/profile/${id || currentUid}/connections`)}><span className="block font-black text-lg text-dark">{profileData.followers || 0}</span><span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Followers</span></div>
                 <div className="w-px h-8 bg-gray-200"></div>
                 <div className="text-center cursor-pointer hover:opacity-70 transition-opacity" onClick={() => navigate(`/profile/${id || currentUid}/connections`)}><span className="block font-black text-lg text-dark">{profileData.following || 0}</span><span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Following</span></div>
               </div>
               
               <div className="flex gap-2">
                   {isOwner ? (
                    // --- OWNER ACTIONS ---
                    <>
                        <button onClick={() => setShowEditModal(true)} className="bg-gray-100 text-dark border border-gray-200 px-6 py-2 rounded-2xl font-bold hover:bg-gray-200 transition-all">Edit Profile</button>
                        
                        <button 
                            onClick={() => setShowBoostModal(true)}
                            className="w-10 h-10 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 text-white shadow-md hover:shadow-lg hover:scale-105 transition-all flex items-center justify-center"
                            title="Promote Profile"
                        >
                            <i className="fas fa-rocket"></i>
                        </button>

                        {!profileData.isVerified && (
                            <button 
                                onClick={() => setShowVerifyModal(true)}
                                className="w-10 h-10 rounded-2xl bg-blue-500 text-white shadow-md hover:bg-blue-600 hover:scale-105 transition-all flex items-center justify-center"
                                title="Get Verified"
                            >
                                <i className="fas fa-check-circle"></i>
                            </button>
                        )}
                    </>
                   ) : (
                    // --- VISITOR ACTIONS ---
                    <>
                       {/* DYNAMIC FOLLOW BUTTON */}
                       <button 
                           onClick={handleFollow} 
                           disabled={loadingFollow} 
                           className={`px-6 py-2 rounded-2xl font-bold shadow-md transition-all flex items-center gap-2 
                           ${isMutual 
                               ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-pink-500/30 border-none transform hover:scale-105' // Amigo Style
                               : isFollowing 
                                    ? 'bg-white text-dark border hover:bg-gray-100' // Following Style
                                    : 'bg-primary text-white hover:bg-primary-dark' // Follow Style
                           }`}
                       >
                           {loadingFollow ? <i className="fas fa-spinner fa-spin"></i> : (isMutual ? <><i className="fas fa-check"></i> {friendLabel}</> : isFollowing ? 'Following' : 'Follow')}
                       </button>

                       {/* GLOWING MESSAGE BUTTON FOR FRIENDS */}
                       <button 
                           onClick={handleMessage} 
                           className={`bg-white text-primary border px-4 py-2 rounded-2xl font-bold shadow-md transition-all 
                           ${isMutual ? 'animate-pulse ring-2 ring-primary/50 shadow-primary/30 border-primary' : 'hover:bg-primary-light/10'}`}
                           title="Send Message"
                       >
                           <i className="fas fa-comment-alt text-xl"></i>
                       </button>
                    </>
                   )}
               </div>
            </div>
          </div>
          
          {/* Profile Details */}
          <div className="text-center md:text-left">
            <h1 className={`text-3xl font-black mb-1 flex items-center justify-center md:justify-start gap-2 ${profileData.isVerified ? 'text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-blue-500' : 'text-dark'}`}>
                {profileData.displayName}
                {profileData.isVerified && <i className="fas fa-check-circle text-blue-500 text-2xl" title="Verified Account"></i>}
            </h1>
            <p className="text-primary font-bold text-sm mb-4">@{profileData.handle || 'user'}</p>
            <p className="text-gray-600 leading-relaxed text-lg">{profileData.bio}</p>
            
            <div className="flex flex-wrap gap-3 mt-4 justify-center md:justify-start">
                {profileData.profession && <span className="px-4 py-2 rounded-xl bg-[#F8FAFD] text-gray-600 text-sm font-bold flex items-center gap-2 border border-gray-100"><i className="fas fa-briefcase text-primary"></i> {profileData.profession}</span>}
                {profileData.location && <span className="px-4 py-2 rounded-xl bg-[#F8FAFD] text-gray-600 text-sm font-bold flex items-center gap-2 border border-gray-100"><i className="fas fa-map-marker-alt text-primary"></i> {profileData.location}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Posts Section */}
      <div className="flex flex-col gap-6">
          {posts.length === 0 && (
             <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-3xl">
                 <p className="text-gray-400 font-bold">No posts yet.</p>
             </div>
          )}
          
          {posts.map((post) => {
              const isLikedByMe = post.likedBy && post.likedBy.includes(currentUid);
              const isPostOwner = currentUid === post.uid;
              if (post.isPrivate && !isPostOwner) return null;

              const isVerified = profileData.isVerified;

              return (
               <div key={post.id} className={`bg-white rounded-[24px] p-6 shadow-sm border relative ${isVerified ? 'border-blue-100' : 'border-gray-100'}`}>
                 {post.isPromoted && (
                    <div className="absolute top-4 right-16 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-100 px-2 py-1 rounded">
                        Promoted
                    </div>
                 )}

                 {/* Post Header */}
                 <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <img 
                                src={post.userAvatar || DEFAULT_AVATAR} 
                                className={`w-12 h-12 rounded-2xl object-cover ${isVerified ? 'ring-2 ring-blue-400' : ''}`} 
                                alt={`${post.userName} avatar`} 
                                onError={(e) => { e.target.src = DEFAULT_AVATAR; }}
                            />
                        </div>
                        <div>
                            <h4 className="font-bold text-dark text-lg flex items-center gap-1">
                                {post.userName} 
                                {isVerified && <i className="fas fa-check-circle text-blue-500 text-sm"></i>}
                                {post.isPrivate && <i className="fas fa-lock text-xs text-gray-400 ml-2" title="Private Post"></i>}
                            </h4>
                            <p className="text-xs text-gray-400 font-bold">{post.timestamp?.seconds ? new Date(post.timestamp.seconds * 1000).toLocaleDateString() : 'Just now'}</p>
                        </div>
                    </div>
                    
                    <div className="relative post-menu-container">
                        <button onClick={() => setActiveMenuPostId(activeMenuPostId === post.id ? null : post.id)} className="text-gray-300 hover:text-dark p-2 transition-colors"><i className="fas fa-ellipsis-h"></i></button>
                        {activeMenuPostId === post.id && (
                            <div className="absolute right-0 top-8 w-40 bg-white rounded-xl shadow-xl z-10 overflow-hidden border">
                               {isPostOwner ? (<>
                                  <button onClick={() => handleTogglePrivate(post)} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">{post.isPrivate ? 'Make Public' : 'Make Private'}</button>
                                  <button onClick={() => startEditing(post)} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">Edit</button>
                                  <button onClick={() => handleDelete(post.id)} className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 text-red-500">Delete</button>
                               </>) : (
                                  <button onClick={() => { setReportingPostId(post.id); setReportModalOpen(true); setActiveMenuPostId(null); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-red-500">Report</button>
                               )}
                            </div>
                        )}
                    </div>
                 </div>

                 {/* Post Content */}
                 {editingPostId === post.id ? (
                    <div className="mb-4">
                        <textarea 
                            value={editText} 
                            onChange={(e) => setEditText(e.target.value)} 
                            className="w-full p-3 bg-gray-50 rounded-xl border focus:border-primary focus:outline-none transition-colors" 
                            rows="4"
                        />
                        <button onClick={() => saveEdit(post.id)} className="mt-2 bg-primary text-white px-4 py-2 rounded-xl font-bold hover:bg-primary-dark transition-colors">Save Edit</button>
                    </div>
                 ) : (
                    <p className="text-gray-800 mb-4 whitespace-pre-wrap">{post.text}</p>
                 )}
                 
                 {post.mediaURL && (
                    <div 
                        className="rounded-2xl overflow-hidden mb-4 shadow-sm cursor-pointer transition-all hover:opacity-90" 
                        onClick={() => setFullscreenMedia({ url: post.mediaURL, type: post.mediaType })}
                    >
                        {post.mediaType === 'video' ? (
                            <video src={post.mediaURL} controls className="w-full max-h-[500px] bg-black" />
                        ) : (
                            <img src={post.mediaURL} className="w-full max-h-[500px] object-cover" alt="Post Media" />
                        )}
                    </div>
                 )}
                 
                 {/* Post Footer/Actions */}
                 <div className="flex gap-6 text-gray-500 font-bold text-sm pt-2 border-t border-gray-100/50 items-center">
                    <button onClick={() => handleLike(post)} className={`flex items-center gap-2 transition-colors ${isLikedByMe ? 'text-red-500' : 'hover:text-red-500'}`}>
                        <i className={`${isLikedByMe ? 'fas' : 'far'} fa-heart text-lg`}></i> {post.likes || 0}
                    </button>
                    <button onClick={() => toggleCommentBox(post.id)} className="flex items-center gap-2 hover:text-primary transition-colors">
                        <i className="far fa-comment text-lg"></i> {post.comments || 0}
                    </button>
                    <button onClick={() => handleShare(post)} className="ml-auto hover:text-dark transition-colors">
                        <i className="far fa-share-square text-lg"></i>
                    </button>
                 </div>

                 {/* Comment Box */}
                 {activeCommentBox === post.id && (
                     <div className="mt-4 animate-fade-in">
                         <ProfilePostComments 
                            postId={post.id} 
                            currentUser={auth.currentUser} 
                            onReply={handleReply} 
                         />
                         <div className="flex gap-2 mt-3">
                             <input 
                                 id={`comment-input-${post.id}`}
                                 type="text" 
                                 placeholder={replyingToId ? `Replying to comment...` : "Write a comment..."} 
                                 className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary transition-colors" 
                                 value={commentText} 
                                 onChange={(e) => setCommentText(e.target.value)} 
                                 onKeyDown={(e) => e.key === 'Enter' && submitComment(post.id)} 
                                 autoFocus 
                             />
                             <button onClick={() => submitComment(post.id)} className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shadow-md hover:bg-primary-dark transition-colors disabled:opacity-50" disabled={!commentText.trim()}>
                                 <i className="fas fa-paper-plane text-xs"></i>
                             </button>
                         </div>
                     </div>
                 )}
               </div>
              )
          })}
      </div>

      {/* MODALS */}
      {showEditModal && profileData && (
          <EditProfileModal 
              user={profileData} 
              onClose={() => setShowEditModal(false)} 
              onSave={() => loadProfileAndPosts(currentUid)} 
          />
      )}

      {showBoostModal && (
          <BoostModal 
              target={{ id: currentUid, type: 'profile', name: profileData.displayName }} 
              onClose={() => setShowBoostModal(false)} 
              onBoost={handleBoostProfile} 
          />
      )}

      {showVerifyModal && (
          <VerificationModal 
              onClose={() => setShowVerifyModal(false)} 
          />
      )}
      
      {/* FULLSCREEN MEDIA MODAL */}
      {fullscreenMedia && (
          <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 transition-opacity duration-300" onClick={() => setFullscreenMedia(null)}>
              <button onClick={() => setFullscreenMedia(null)} className="absolute top-4 right-4 text-white text-3xl z-[101]">&times;</button>
              {fullscreenMedia.type === 'video' ? <video src={fullscreenMedia.url} controls autoPlay className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} /> : <img src={fullscreenMedia.url} alt="Fullscreen Media" className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />}
          </div>
      )}
      
      {/* REPORT MODAL */}
      {reportModalOpen && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center animate-fade-in p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                  <div className="text-center mb-4">
                      <h3 className="text-xl font-bold text-gray-900">Report Post</h3>
                  </div>
                  <div className="space-y-2 mb-6">
                      {['Spam or Fraud', 'Harassment', 'Violence', 'False Information', 'Inappropriate Content'].map(reason => (
                          <button key={reason} onClick={() => handleSubmitReport(reason)} className="w-full text-left p-3 rounded-xl bg-gray-50 hover:bg-red-50 hover:text-red-600 text-gray-700 font-medium transition-colors">{reason}</button>
                      ))}
                  </div>
                  <button onClick={() => setReportModalOpen(false)} className="w-full py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">Cancel</button>
              </div>
          </div>
      )}
    </div>
  );
};

export default Profile;