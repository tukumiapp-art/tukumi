import React, { useState, useEffect, useRef, memo, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth, storage } from '../api/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  collection, query, orderBy, onSnapshot, 
  addDoc, deleteDoc, updateDoc, doc, 
  serverTimestamp, increment, arrayUnion, arrayRemove, where, setDoc, getDoc 
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import TopBar from '../components/TopBar';
import BoostModal from '../components/BoostModal'; 
import ProgressiveImage from '../components/ProgressiveImage';

// --- SAFE AVATAR COMPONENT ---
const Avatar = ({ src, alt, className, isVerified, onClick }) => {
    const [imgError, setImgError] = useState(false);
    
    const isInvalidSource = 
        !src || 
        src.includes('via.placeholder.com') || 
        src === "undefined" || 
        src === "null";

    if (isInvalidSource || imgError) {
        return (
            <div 
                onClick={onClick}
                className={`${className} bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-gray-500 relative cursor-pointer shadow-inner`}
            >
                <i className="fas fa-user text-xs opacity-50"></i>
                {isVerified && (
                    <div className="absolute -bottom-1 -right-1 bg-blue-500 text-white text-[8px] w-4 h-4 flex items-center justify-center rounded-full border-2 border-white">
                        <i className="fas fa-check"></i>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="relative inline-block" onClick={onClick}>
            <img 
                src={src} 
                alt={alt || "User"} 
                className={`${className} bg-gray-100 object-cover cursor-pointer`}
                onError={() => setImgError(true)}
                loading="lazy"
            />
            {isVerified && (
                <div className="absolute -bottom-1 -right-1 bg-blue-500 text-white text-[8px] w-4 h-4 flex items-center justify-center rounded-full border-2 border-white">
                    <i className="fas fa-check"></i>
                </div>
            )}
        </div>
    );
};

// --- HELPER: Generate Thumbnail ---
const generateVideoThumbnail = (file) => {
    return new Promise((resolve) => {
        const canvas = document.createElement("canvas");
        const video = document.createElement("video");
        video.autoplay = true;
        video.muted = true;
        video.src = URL.createObjectURL(file);
        
        video.onloadeddata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            video.currentTime = 1; 
        };

        video.onseeked = () => {
            let ctx = canvas.getContext("2d");
            ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
            canvas.toBlob((blob) => {
                URL.revokeObjectURL(video.src);
                resolve(blob);
            }, "image/jpeg", 0.7);
        };
    });
};

const getThumbnailUrl = (post) => {
    if (post.thumbnailURL) return post.thumbnailURL; 
    if (post.mediaType === 'image' && post.mediaURL) {
        try {
            const cleanUrl = post.mediaURL.split('&token=')[0];
            return cleanUrl.replace(/(\.[a-zA-Z0-9]+)(\?alt=media)/, '_200x200$1$2');
        } catch (e) { return null; }
    }
    return null;
};

// --- HELPER: Safe Author Hook ---
const useAuthor = (uid) => {
    const [author, setAuthor] = useState(null);
    useEffect(() => {
        if (!uid || typeof uid !== 'string') return;
        try {
            const unsub = onSnapshot(doc(db, 'users', uid), (docSnap) => {
                if (docSnap.exists()) {
                    setAuthor(docSnap.data());
                }
            }, (error) => console.warn("Author fetch ignored:", error.code));
            return () => unsub();
        } catch (e) { console.warn("Invalid UID"); }
    }, [uid]);
    return author;
};

const FeedSkeleton = () => (
  <div className="glass-panel rounded-[30px] p-6 mb-8 border border-white/40 animate-pulse">
    <div className="flex items-center gap-4 mb-4">
      <div className="w-12 h-12 rounded-2xl bg-gray-200/50"></div>
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200/50 rounded w-1/3"></div>
        <div className="h-3 bg-gray-200/50 rounded w-1/4"></div>
      </div>
    </div>
    <div className="h-4 bg-gray-200/50 rounded w-full mb-2"></div>
    <div className="h-4 bg-gray-200/50 rounded w-3/4 mb-4"></div>
    <div className="w-full h-64 bg-gray-200/50 rounded-[24px]"></div>
  </div>
);

// --- HELPER: Viewer List Modal ---
const ViewersList = ({ viewIds = [], reactions = [], onClose }) => {
    const [viewers, setViewers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchViewers = async () => {
            if (!Array.isArray(viewIds) || viewIds.length === 0) {
                setLoading(false);
                return;
            }
            try {
                const validIds = viewIds.filter(id => typeof id === 'string' && id.trim() !== '');
                if (validIds.length === 0) {
                    setLoading(false);
                    return;
                }
                const userPromises = validIds.map(uid => getDoc(doc(db, 'users', uid)));
                const userSnaps = await Promise.all(userPromises);
                
                const usersData = userSnaps.map(snap => {
                    if (!snap.exists()) return null;
                    const userData = snap.data();
                    const userReaction = reactions.find(r => r.uid === snap.id);
                    const nameToDisplay = userData.displayName || userData.username || "Aristocrat";
                    
                    return {
                        uid: snap.id,
                        displayName: nameToDisplay,
                        photoURL: userData.photoURL,
                        reaction: userReaction ? userReaction.emoji : null
                    };
                }).filter(Boolean);

                setViewers(usersData);
            } catch (error) { 
                console.error("Error fetching viewers:", error); 
            } finally { 
                setLoading(false); 
            }
        };
        fetchViewers();
    }, [viewIds, reactions]);

    return (
        <div className="absolute inset-0 z-[60] bg-black/95 flex flex-col animate-fade-in-up">
            <div className="flex justify-between items-center p-4 border-b border-white/10">
                <h3 className="text-white font-bold text-lg">Views ({viewIds.length})</h3>
                <button onClick={onClose} className="text-white/70 hover:text-white"><i className="fas fa-times text-xl"></i></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {loading ? <p className="text-white/50 text-center">Loading...</p> : viewers.length === 0 ? <p className="text-white/50 text-center">No views yet.</p> : (
                    <div className="space-y-4">
                        {viewers.map(viewer => (
                            <div key={viewer.uid} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Avatar src={viewer.photoURL} className="w-10 h-10 rounded-full border border-white/20 object-cover" alt={viewer.displayName} />
                                    <span className="text-white font-medium text-sm">{viewer.displayName}</span>
                                </div>
                                {viewer.reaction && <span className="text-2xl animate-bounce-short">{viewer.reaction}</span>}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- HELPER: Moment Viewer ---
const MomentViewer = ({ moments, onClose, currentUser }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const [replyText, setReplyText] = useState('');
    const [isSending, setIsSending] = useState(false);
    
    const [isPaused, setIsPaused] = useState(false);
    const [showViewers, setShowViewers] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editCaption, setEditCaption] = useState('');
    
    const currentMoment = moments[currentIndex];
    const isOwner = currentUser?.uid === currentMoment.uid;

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    useEffect(() => {
        if (currentMoment && currentUser && !isOwner) {
            const hasViewed = currentMoment.views?.includes(currentUser.uid);
            if (!hasViewed && typeof currentUser.uid === 'string') {
                updateDoc(doc(db, 'moments', currentMoment.id), { views: arrayUnion(currentUser.uid) }).catch(e => console.warn("Moment view fail", e));
            }
        }
    }, [currentMoment, currentUser, isOwner]);

    useEffect(() => {
        if (showViewers || showMenu || isEditing) return; 
        setProgress(0); 
        const timer = setInterval(() => {
            if (isPaused) return;
            setProgress(old => {
                if (old >= 100) {
                    if (currentIndex < moments.length - 1) {
                        setCurrentIndex(c => c + 1);
                        return 0;
                    } else {
                        clearInterval(timer);
                        onClose();
                        return 100;
                    }
                }
                return old + 1.0; 
            });
        }, 50);
        return () => clearInterval(timer);
    }, [currentIndex, moments.length, onClose, isPaused, showViewers, showMenu, isEditing]);

    const sendReaction = async (emoji) => {
        const feedback = document.createElement('div');
        feedback.textContent = emoji;
        feedback.className = "fixed inset-0 flex items-center justify-center text-8xl animate-ping pointer-events-none z-[2000]";
        document.body.appendChild(feedback);
        setTimeout(() => feedback.remove(), 1000);

        try {
            await updateDoc(doc(db, 'moments', currentMoment.id), {
                reactions: arrayUnion({ uid: currentUser.uid, emoji: emoji, timestamp: Date.now() })
            });
        } catch (e) { console.error("Error reacting:", e); }
    };

    // --- FIX: UPDATED SEND REPLY TO TAG YOUR ID ---
    const sendReply = async (e) => {
        e.preventDefault();
        if (!replyText.trim()) return;
        setIsSending(true);
        try {
            const chatId = [currentUser.uid, currentMoment.uid].sort().join('_');
            const chatRef = doc(db, 'conversations', chatId);
            
            // WE ADD 'lastSenderId' HERE SO NOTIFICATION LOGIC CAN IGNORE IT
            await setDoc(chatRef, {
                participants: [currentUser.uid, currentMoment.uid],
                users: [
                    { uid: currentUser.uid, displayName: currentUser.displayName, photoURL: currentUser.photoURL },
                    { uid: currentMoment.uid, displayName: currentMoment.userName, photoURL: currentMoment.userAvatar }
                ],
                updatedAt: serverTimestamp(),
                isGroup: false,
                lastMessage: `Replied to moment: ${replyText}`,
                lastSenderId: currentUser.uid // <--- ADDED THIS LINE
            }, { merge: true });

            await addDoc(collection(db, `conversations/${chatId}/messages`), {
                text: replyText, senderId: currentUser.uid, type: 'reply', replyToMoment: currentMoment.mediaURL, timestamp: serverTimestamp()
            });
            setReplyText(''); setIsPaused(false);
        } catch (err) { console.error(err); } finally { setIsSending(false); }
    };

    const handleDelete = async () => {
        if (window.confirm("Delete this moment?")) {
            await deleteDoc(doc(db, 'moments', currentMoment.id));
            if (moments.length === 1) onClose(); else { setCurrentIndex(0); setShowMenu(false); }
        }
    };

    const startEdit = () => {
        setEditCaption(currentMoment.caption || '');
        setIsEditing(true);
        setShowMenu(false);
        setIsPaused(true);
    };

    const saveEdit = async () => {
        try {
            await updateDoc(doc(db, 'moments', currentMoment.id), { caption: editCaption });
            setIsEditing(false);
            setIsPaused(false);
        } catch (e) { console.error("Update failed", e); alert("Failed to save."); }
    };

    return (
        <div className="fixed inset-0 z-[99999] bg-black flex flex-col w-screen h-[100dvh] overflow-hidden overscroll-none touch-none">
            {showViewers && <ViewersList viewIds={currentMoment.views || []} reactions={currentMoment.reactions || []} onClose={() => { setShowViewers(false); setIsPaused(false); }} />}
            <div className="absolute top-4 left-4 right-4 flex gap-1 z-30">
                {moments.map((_, idx) => (
                    <div key={idx} className="h-1 bg-white/30 flex-1 rounded-full overflow-hidden">
                        <div className="h-full bg-white transition-all duration-100 ease-linear" style={{ width: idx < currentIndex ? '100%' : idx === currentIndex ? `${progress}%` : '0%' }} />
                    </div>
                ))}
            </div>
            <div className="absolute top-8 left-4 right-4 z-30 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <Avatar src={currentMoment.userAvatar} className="w-10 h-10 rounded-full border-2 border-white/50" alt="User" />
                    <div className="flex flex-col text-left">
                         <span className="text-white font-bold text-sm shadow-black drop-shadow-md">{currentMoment.userName || "Momento User"}</span>
                         <span className="text-white/70 text-[10px]">{currentMoment.timestamp?.seconds ? new Date(currentMoment.timestamp.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now'}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {isOwner && (
                        <button onClick={(e) => { e.stopPropagation(); setShowViewers(true); setIsPaused(true); }} className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-md hover:bg-black/60 transition-colors">
                            <i className="fas fa-eye text-white text-xs"></i>
                            <span className="text-white text-xs font-bold">{currentMoment.views?.length || 0}</span>
                        </button>
                    )}
                    {isOwner && (
                        <div className="relative">
                            <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); setIsPaused(!showMenu); }} className="text-white text-lg w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20">
                                <i className="fas fa-ellipsis-v"></i>
                            </button>
                            {showMenu && (
                                <div className="absolute right-0 top-full mt-2 w-32 bg-white rounded-xl shadow-xl overflow-hidden py-1 z-50 animate-fade-in">
                                    <button onClick={startEdit} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"><i className="fas fa-pen text-xs"></i> Edit</button>
                                    <button onClick={handleDelete} className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"><i className="fas fa-trash text-xs"></i> Delete</button>
                                </div>
                            )}
                        </div>
                    )}
                    <button onClick={onClose} className="text-white text-3xl drop-shadow-md"><i className="fas fa-times"></i></button>
                </div>
            </div>
            <div className="flex-1 relative flex items-center justify-center bg-gray-900">
                 {currentMoment.mediaType === 'video' ? (
                     <video src={currentMoment.mediaURL} autoPlay={!isPaused && !showViewers && !showMenu && !isEditing} muted={false} playsInline className="max-h-full max-w-full object-contain" />
                 ) : (
                     <img src={currentMoment.mediaURL} className="max-h-full max-w-full object-contain" alt="Moment" loading="lazy" decoding="async" />
                 )}
                 {!showViewers && !showMenu && !isEditing && (
                     <>
                        <div className="absolute inset-y-0 left-0 w-1/3 z-20" onClick={(e) => { e.stopPropagation(); if(currentIndex > 0) { setCurrentIndex(c => c - 1); setProgress(0); } }}></div>
                        <div className="absolute inset-y-0 right-0 w-1/3 z-20" onClick={(e) => { e.stopPropagation(); if(currentIndex < moments.length - 1) { setCurrentIndex(c => c + 1); setProgress(0); } else onClose(); }}></div>
                     </>
                 )}
                 <div className="absolute bottom-24 left-0 right-0 px-6 text-center z-40">
                    {isEditing ? (
                        <div className="flex gap-2 animate-fade-in-up">
                            <input autoFocus value={editCaption} onChange={(e) => setEditCaption(e.target.value)} className="flex-1 bg-black/50 text-white border border-white/50 rounded-xl px-4 py-2 backdrop-blur-md outline-none" placeholder="Add a caption..." />
                            <button onClick={saveEdit} className="bg-white text-black px-4 rounded-xl font-bold">Save</button>
                        </div>
                    ) : (
                        currentMoment.caption && <p className="text-white font-medium drop-shadow-md bg-black/30 inline-block px-3 py-1 rounded-xl backdrop-blur-sm">{currentMoment.caption}</p>
                    )}
                 </div>
            </div>
            {!isOwner && !showViewers && (
                <div className="absolute bottom-0 left-0 right-0 p-4 pb-8 bg-gradient-to-t from-black/80 to-transparent z-30 flex flex-col gap-4">
                    {!isPaused && (
                        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 justify-center animate-fade-in">
                            {['🔥','😂','😍','😮','😢','👏'].map(emoji => (
                                <button key={emoji} onClick={() => sendReaction(emoji)} className="text-3xl hover:scale-125 transition-transform active:scale-95">{emoji}</button>
                            ))}
                        </div>
                    )}
                    <form onSubmit={sendReply} className="flex gap-2 items-center">
                        <input value={replyText} onChange={e => setReplyText(e.target.value)} onFocus={() => setIsPaused(true)} onBlur={() => !replyText && setIsPaused(false)} placeholder="Reply to story..." className="flex-1 bg-transparent border border-white/50 rounded-full px-5 py-3 text-white placeholder-white/70 outline-none focus:border-white focus:bg-black/50 transition-all text-sm backdrop-blur-sm z-40" />
                        <button type="submit" disabled={!replyText.trim() || isSending} className="text-white text-xl p-2 hover:text-primary transition-colors disabled:opacity-50 z-40"><i className="fas fa-paper-plane"></i></button>
                    </form>
                </div>
            )}
        </div>
    );
};

// --- MOMENTS BAR ---
const MomentsBar = ({ currentUser, onUpload }) => {
    const [moments, setMoments] = useState([]); 
    const [viewingUserMoments, setViewingUserMoments] = useState(null);
    const [followingIds, setFollowingIds] = useState([]);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (!currentUser || !currentUser.uid) return;
        const qFollow = collection(db, `users/${currentUser.uid}/following`);
        const unsubFollow = onSnapshot(qFollow, (snap) => {
            const ids = snap.docs.map(d => d.id);
            setFollowingIds([...ids, currentUser.uid]); 
        }, (err) => console.log("Following fetch skipped:", err.code));
        return () => unsubFollow();
    }, [currentUser]);

    useEffect(() => {
        if (followingIds.length === 0) return;
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const q = query(collection(db, 'moments'), where('timestamp', '>', yesterday), orderBy('timestamp', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            const rawData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const visibleMoments = rawData.filter(m => followingIds.includes(m.uid));
            const grouped = visibleMoments.reduce((acc, curr) => {
                if (!acc[curr.uid]) acc[curr.uid] = [];
                acc[curr.uid].push(curr);
                return acc;
            }, {});
            const processedGroups = Object.entries(grouped).map(([uid, items]) => ({ 
                uid, items, userAvatar: items[0].userAvatar, userName: items[0].userName, latestTimestamp: items[0].timestamp
            })).sort((a, b) => b.latestTimestamp - a.latestTimestamp);
            setMoments(processedGroups);
        }, (error) => {
             console.warn("Moments fetch failed (likely network/adblock):", error.code);
        });
        return () => unsub();
    }, [followingIds]);

    const handleFile = (e) => { const file = e.target.files[0]; if(file) onUpload(file); };

    const getClockStyle = (timestamp) => {
        if (!timestamp) return {};
        const now = Date.now();
        const posted = timestamp.seconds * 1000;
        const diff = now - posted;
        const twentyFourHours = 24 * 60 * 60 * 1000;
        const percentage = 100 - ((diff / twentyFourHours) * 100);
        return { background: `conic-gradient(#008080 ${percentage}%, #e5e7eb 0)` };
    };

    return (
        <div className="mb-8">
            <h3 className="font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 via-orange-400 to-yellow-500 mb-4 flex items-center gap-2 text-2xl tracking-tighter animate-pulse">
                <i className="fas fa-bolt text-yellow-500 animate-bounce"></i> Momento
            </h3>
            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar px-1">
                <div className="flex-shrink-0 cursor-pointer group relative" onClick={() => fileInputRef.current.click()}>
                    <div className="w-[70px] h-[70px] rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center bg-white group-hover:border-primary transition-all">
                        <i className="fas fa-plus text-gray-400 group-hover:text-primary text-xl"></i>
                    </div>
                    <p className="text-[11px] text-center font-bold text-gray-500 mt-1 group-hover:text-primary">Add Yours</p>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" onChange={handleFile} />
                </div>
                {moments.map(userGroup => {
                    const latestMoment = userGroup.items[0]; 
                    const isMine = userGroup.uid === currentUser?.uid;
                    return (
                        <div key={userGroup.uid} className="flex-shrink-0 cursor-pointer group" onClick={() => setViewingUserMoments(userGroup.items)}>
                            <div className="relative w-[74px] h-[74px] rounded-full flex items-center justify-center p-[2px]" style={getClockStyle(latestMoment.timestamp)}>
                                <div className="w-[68px] h-[68px] bg-white rounded-full flex items-center justify-center overflow-hidden border-2 border-white relative">
                                    {latestMoment.mediaType === 'video' ? <video src={latestMoment.mediaURL} className="w-full h-full object-cover" muted /> : <img src={latestMoment.mediaURL} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt="Preview" loading="lazy" />}
                                </div>
                                <Avatar src={userGroup.userAvatar} className="absolute bottom-0 right-0 w-6 h-6 rounded-full border-2 border-white shadow-sm" alt="Avatar" />
                            </div>
                            <p className="text-[11px] text-center font-bold text-dark mt-1 truncate w-16">{isMine ? 'You' : userGroup.userName.split(' ')[0]}</p>
                        </div>
                    );
                })}
            </div>
            {viewingUserMoments && <MomentViewer moments={viewingUserMoments} currentUser={currentUser} onClose={() => setViewingUserMoments(null)} />}
        </div>
    );
};

// --- VIDEO PLAYER ---
const FeedVideoPlayer = ({ src, poster, isPlaying, onFullscreen, isMuted, toggleMute }) => {
    const videoRef = useRef(null);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        if (videoRef.current) videoRef.current.muted = isMuted;
    }, [isMuted]);

    useEffect(() => {
        if (videoRef.current) {
            if (isPlaying) {
                const playPromise = videoRef.current.play();
                if (playPromise !== undefined) {
                    playPromise.catch(() => {});
                }
            } else {
                videoRef.current.pause();
            }
        }
    }, [isPlaying]);

    const handleTimeUpdate = () => {
        const v = videoRef.current;
        if (v) {
            setCurrentTime(v.currentTime);
            setProgress((v.currentTime / v.duration) * 100);
        }
    };

    const handleLoadedMetadata = () => {
        const v = videoRef.current;
        if (v) setDuration(v.duration);
    };

    const handleSeek = (e) => {
        e.stopPropagation();
        const newTime = (e.target.value / 100) * duration;
        if(videoRef.current) videoRef.current.currentTime = newTime;
        setProgress(e.target.value);
    };
    
    const skip = (amount) => {
        if(videoRef.current) videoRef.current.currentTime += amount;
    };

    const formatTime = (time) => {
        if (!time) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    return (
        <div className="relative w-full bg-black rounded-[24px] overflow-hidden group">
            <video 
                ref={videoRef} 
                src={src} 
                poster={poster}
                className="w-full h-auto max-h-[600px] object-contain bg-black" 
                loop 
                playsInline 
                preload="metadata"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onClick={onFullscreen} 
            />
            
            <button 
                onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                className="absolute top-4 right-4 z-20 w-9 h-9 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-all"
            >
                <i className={`fas ${isMuted ? 'fa-volume-mute' : 'fa-volume-up'} text-xs`}></i>
            </button>

            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex flex-col gap-2 z-20 opacity-100">
                <div className="flex items-center gap-3">
                    <span className="text-white text-[10px] font-medium w-8">{formatTime(currentTime)}</span>
                    <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={progress || 0} 
                        onChange={handleSeek}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                    />
                    <span className="text-white text-[10px] font-medium w-8 text-right">{formatTime(duration)}</span>
                </div>
                
                <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-6 text-white/90">
                        <button onClick={(e) => {e.stopPropagation(); skip(-10)}} className="hover:text-primary transition-colors flex items-center gap-1">
                            <i className="fas fa-undo-alt text-xs"></i><span className="text-[9px] font-bold">10s</span>
                        </button>
                        <button onClick={(e) => {e.stopPropagation(); skip(10)}} className="hover:text-primary transition-colors flex items-center gap-1">
                            <i className="fas fa-redo-alt text-xs"></i><span className="text-[9px] font-bold">10s</span>
                        </button>
                    </div>
                    <button onClick={(e) => {e.stopPropagation(); onFullscreen()}} className="text-white hover:scale-110 transition-transform"><i className="fas fa-expand text-sm"></i></button>
                </div>
            </div>
        </div>
    );
};

// --- HELPER: Post Item Component ---
const PostItem = memo(({ post, user, isLikedByMe, playingPostId, videoContainerRefs, setActiveMenuPostId, activeMenuPostId, setBoostTarget, handleTogglePrivate, handleDelete, handleSavePost, setReportingPostId, setReportModalOpen, setFullscreenMedia, openVideoInWatch, handleLike, toggleCommentBox, handleShare, activeCommentBox, setActiveCommentBox, commentText, setCommentText, replyingToId, setReplyingToId, submitComment, toggleNav, navigate, isGlobalMuted, toggleGlobalMute }) => {
    
    // Pass post.uid safely to useAuthor
    const author = useAuthor(post?.uid);
    const displayAvatar = author?.photoURL || post.userAvatar;
    const displayName = author?.displayName || post.userName || "Aristocrat";
    const isVerified = author?.isVerified || post.isVerified === true;
    
    const thumbnailUrl = getThumbnailUrl(post);
    
    return (
        <div className={`glass-panel rounded-[30px] p-6 hover:shadow-xl transition-all duration-300 border relative ${isVerified ? 'border-blue-100 shadow-blue-50' : 'border-white/60'}`}>
            {post.isPromoted && (<div className="absolute top-4 right-16 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-100 px-2 py-1 rounded">Promoted</div>)}
            
            <div className="flex justify-between items-start mb-5">
              <div className="flex items-center gap-4 cursor-pointer group" onClick={() => navigate(`/profile/${post.uid}`)}>
                <Avatar src={displayAvatar} className={`w-12 h-12 rounded-2xl object-cover ${isVerified ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`} alt="User Avatar" isVerified={isVerified} />
                <div>
                    <h4 className={`font-bold text-lg leading-tight flex items-center gap-1 ${isVerified ? 'text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-400' : 'text-dark group-hover:text-primary'}`}>
                        {displayName}{isVerified && <i className="fas fa-check-circle text-blue-500 text-sm ml-1" title="Verified"></i>}{post.isPrivate && <i className="fas fa-lock text-xs text-gray-400 ml-1"></i>}
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
                                <button onClick={() => { setBoostTarget({ id: post.id, type: 'post', name: 'Your Post' }); setActiveMenuPostId(null); }} className="w-full text-left px-4 py-3 text-sm text-yellow-600 hover:bg-gray-50 font-bold flex items-center gap-2"><i className="fas fa-rocket"></i> Boost Post</button>
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
              <div className="rounded-[24px] overflow-hidden mb-5 shadow-md border border-white/50 group relative" data-id={post.id} data-mediatype={post.mediaType} ref={el => videoContainerRefs.current[post.id] = el}>
                {post.mediaType === 'video' ? (
                    <FeedVideoPlayer 
                        src={post.mediaURL} 
                        poster={thumbnailUrl} 
                        isPlaying={playingPostId === post.id} 
                        onFullscreen={() => openVideoInWatch(post)}
                        isMuted={isGlobalMuted}
                        toggleMute={toggleGlobalMute}
                    />
                ) : (
                    <div className="w-full h-auto cursor-pointer" onClick={() => setFullscreenMedia({ url: post.mediaURL, type: post.mediaType })}>
                        <ProgressiveImage
                            src={post.mediaURL}
                            placeholder={thumbnailUrl} 
                            className="w-full h-auto max-h-[650px] pointer-events-none"
                        />
                    </div>
                )}
              </div>
            )}
            
            <div className="flex items-center gap-3 pt-2 border-t border-gray-100/50">
                <button onClick={() => handleLike(post)} className={`h-10 px-5 rounded-xl border flex items-center gap-2 transition-all group shadow-sm ${isLikedByMe ? 'bg-accent/10 border-accent/20 text-accent' : 'bg-white/50 border-white text-gray-600 hover:text-accent hover:bg-white'}`}>
                    <i className={`${isLikedByMe ? 'fas' : 'far'} fa-heart group-hover:scale-110`}></i><span className="font-bold text-sm">{post.likes || 0}</span>
                </button>
                <button onClick={() => toggleCommentBox(post.id)} className="h-10 px-5 rounded-xl bg-white/50 border border-white flex items-center gap-2 text-gray-600 hover:text-primary hover:bg-white transition-all group shadow-sm">
                    <i className="far fa-comment group-hover:scale-110 transition-transform"></i><span className="font-bold text-sm">{post.comments || 0}</span>
                </button>
                <button onClick={() => handleShare(post)} className="h-10 w-10 rounded-xl bg-white/50 border border-white flex items-center justify-center text-gray-600 hover:text-dark hover:bg-white ml-auto transition-all shadow-sm"><i className="far fa-share-square"></i></button>
            </div>
            
            {activeCommentBox === post.id && (
              <div className="mt-4 animate-fade-in">
                <CommentsList postId={post.id} setCommentText={setCommentText} setActiveCommentBox={setActiveCommentBox} setReplyingToId={setReplyingToId} />
                <div className="flex gap-2 mt-4">
                    <input type="text" placeholder={replyingToId ? "Replying..." : "Write a comment..."} className="flex-1 bg-white/80 border border-white/50 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-inner" value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitComment(post.id)} onFocus={() => toggleNav(false)} onBlur={() => setTimeout(() => toggleNav(true), 200)} autoFocus />
                    <button onClick={() => submitComment(post.id)} disabled={!commentText.trim()} className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shadow-md hover:bg-primary-dark transition-colors disabled:opacity-50"><i className="fas fa-paper-plane text-xs"></i></button>
                </div>
              </div>
            )}
        </div>
    );
});

// --- HELPER: Text Expander ---
const PostTextExpander = ({ text, hasMedia }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const safeText = text || "";
  const MAX_LINES = hasMedia ? 2 : 6; 
  const lines = safeText.split('\n');
  const isTruncated = lines.length > MAX_LINES || safeText.length > (hasMedia ? 100 : 300);
  const displayedText = isExpanded || !isTruncated ? safeText : lines.slice(0, MAX_LINES).join('\n').slice(0, hasMedia ? 100 : 300) + '...';
  
  const renderText = (str) => {
    const parts = str.split(/(#[a-zA-Z0-9_]+)/g);
    return parts.map((part, i) => part.startsWith('#') ? <span key={i} className="text-primary font-bold cursor-pointer hover:underline">{part}</span> : part);
  };

  return (
    <div className="text-gray-800 mb-3 text-[15px] leading-relaxed whitespace-pre-wrap transition-all">
        {renderText(displayedText)}
        {isTruncated && <button onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} className="text-primary font-bold ml-1 hover:underline focus:outline-none text-sm">{isExpanded ? 'Show Less' : 'Read More'}</button>}
    </div>
  );
};

// --- HELPER: Comments List ---
const CommentsList = ({ postId, setCommentText, setActiveCommentBox, setReplyingToId }) => {
  const navigate = useNavigate();
  const [comments, setComments] = useState([]);
  
  useEffect(() => { 
      if (!postId) return; 
      // Firestore query setup
      const q = query(collection(db, 'posts', postId, 'comments'), orderBy('timestamp', 'asc'));
      const unsub = onSnapshot(q, (snap) => {
          setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (err) => {
          console.log("Comments fetch error:", err.code);
      });
      return () => unsub();
  }, [postId]);

  const rootComments = comments.filter(c => !c.parentId);
  const getReplies = (parentId) => comments.filter(c => c.parentId === parentId);
  const handleReplyClick = (c) => { setCommentText(`@${c.userName} `); setActiveCommentBox(postId); setReplyingToId(c.parentId || c.id); };

  const CommentItem = ({ c, isReply }) => (
      <div className={`flex gap-3 items-start text-sm mb-3 ${isReply ? 'ml-10 mt-1' : ''}`}>
          <Avatar src={c.userAvatar} className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-gray-200 cursor-pointer" alt={c.userName} onClick={() => navigate(`/profile/${c.uid}`)} />
          <div className="flex-1">
              <div className="bg-gray-50 px-3 py-2 rounded-2xl rounded-tl-none border border-gray-100 inline-block">
                  <span className="font-bold text-xs block text-dark flex items-center gap-1 cursor-pointer hover:underline mb-0.5" onClick={() => navigate(`/profile/${c.uid}`)}>{c.userName}{c.isVerified && <i className="fas fa-check-circle text-blue-500 text-[10px]" title="Verified"></i>}</span>
                  <p className="text-gray-700 leading-snug">{c.text}</p>
              </div>
              <div className="flex items-center gap-3 mt-1 ml-1">
                  <span className="text-[10px] text-gray-400">{c.timestamp?.seconds ? new Date(c.timestamp.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now'}</span>
                  {!isReply && (<button onClick={() => handleReplyClick(c)} className="text-[10px] font-bold text-gray-500 hover:text-primary transition-colors">Reply</button>)}
              </div>
          </div>
      </div>
  );
  if (comments.length === 0) return <p className="text-xs text-gray-400 text-center py-4">No comments yet.</p>;
  return <div className="mt-4 pt-2 border-t border-gray-50 max-h-[300px] overflow-y-auto custom-scrollbar px-1">{rootComments.map(root => (<div key={root.id}><CommentItem c={root} isReply={false} />{getReplies(root.id).map(reply => (<CommentItem key={reply.id} c={reply} isReply={true} />))}</div>))}</div>;
};

// --- HELPER: Trending Sidebar ---
const TrendingSidebar = ({ posts, onTagClick }) => {
    const trendingTags = useMemo(() => {
        const counts = {};
        posts.forEach(post => {
            if (!post.text) return;
            const matches = post.text.match(/#[a-zA-Z0-9_]+/g);
            if (matches) {
                matches.forEach(tag => {
                    counts[tag] = (counts[tag] || 0) + 1;
                });
            }
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag, count]) => ({ tag, count }));
    }, [posts]);

    if (trendingTags.length === 0) return null;

    return (
        <div className="glass-panel rounded-[30px] p-6 sticky top-6"> 
            <h3 className="font-bold text-dark mb-6 flex items-center gap-2"><i className="fas fa-chart-line text-primary"></i> Trending</h3> 
            {trendingTags.map((item, i) => ( 
                <div key={item.tag} className="flex items-center gap-4 mb-4 last:mb-0 cursor-pointer group" onClick={() => onTagClick(item.tag)}> 
                    <span className="text-3xl font-black text-gray-200 group-hover:text-primary/30">0{i+1}</span> 
                    <div><p className="font-bold text-dark text-sm group-hover:text-primary">{item.tag}</p><p className="text-xs text-gray-400">{item.count} posts</p></div> 
                </div> 
            ))} 
        </div>
    );
};

// --- MAIN HOME COMPONENT ---
const Home = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [playingPostId, setPlayingPostId] = useState(null);
  const [filterTag, setFilterTag] = useState(null); 
  
  // GLOBAL MUTE STATE
  const [isGlobalMuted, setIsGlobalMuted] = useState(true);
  const toggleGlobalMute = useCallback(() => setIsGlobalMuted(prev => !prev), []);

  const [newPostText, setNewPostText] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const [activeCommentBox, setActiveCommentBox] = useState(null);
  const [commentText, setCommentText] = useState(''); 
  const [replyingToId, setReplyingToId] = useState(null);
  const [activeMenuPostId, setActiveMenuPostId] = useState(null);
  const [fullscreenMedia, setFullscreenMedia] = useState(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportingPostId, setReportingPostId] = useState(null);
  const [boostTarget, setBoostTarget] = useState(null); 
  
  const videoContainerRefs = useRef({});
  const observer = useRef(null);

  const toggleNav = (visible) => window.dispatchEvent(new CustomEvent('toggle-nav', { detail: { visible } }));

  // IMPROVED Autoplay Logic
  useEffect(() => {
      const options = { root: null, rootMargin: '0px', threshold: 0.7 };
      
      const handlePlay = (entries) => {
          let maxRatio = 0;
          let bestId = null;

          if (playingPostId) {
             const currentEntry = entries.find(e => e.target.dataset.id === playingPostId);
             if (currentEntry && currentEntry.intersectionRatio < 0.7) {
                 setPlayingPostId(null); 
             }
          }

          entries.forEach(entry => {
              if (entry.target.dataset.mediatype === 'video' && entry.isIntersecting && entry.intersectionRatio > 0.7) {
                  if (entry.intersectionRatio > maxRatio) {
                      maxRatio = entry.intersectionRatio;
                      bestId = entry.target.dataset.id;
                  }
              }
          });
          
          if (bestId) {
              setPlayingPostId(bestId);
          }
      };

      if (!observer.current) {
          observer.current = new IntersectionObserver(handlePlay, options);
      }
      Object.entries(videoContainerRefs.current).forEach(([id, el]) => { if (el) observer.current.observe(el); });
      return () => observer.current.disconnect();
  }, [posts, playingPostId]);

  // Auth & Data Fetching & FIX NO DOCUMENT ERROR
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        // 1. Check if user document exists in Firestore
        const userRef = doc(db, 'users', authUser.uid);
        
        try {
            const userSnap = await getDoc(userRef);
            
            if (!userSnap.exists()) {
                console.log("Creating missing user profile...");
                // FIX: Auto-create the profile to stop "No document to update" error
                await setDoc(userRef, {
                    uid: authUser.uid,
                    displayName: authUser.displayName || authUser.email.split('@')[0],
                    email: authUser.email,
                    photoURL: authUser.photoURL,
                    createdAt: serverTimestamp(),
                    followers: [],
                    following: [],
                    savedPosts: []
                }, { merge: true });
            }
        } catch (e) {
            console.warn("Error checking user doc:", e);
        }

        // 2. Listen to the user document
        const unsubProfile = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
              setUser({ uid: authUser.uid, ...docSnap.data() }); 
          } else {
              setUser({ uid: authUser.uid, ...authUser });
          }
        }, (error) => {
            console.warn("User profile snapshot error:", error.code);
            setUser({ uid: authUser.uid, ...authUser });
        });
        return () => unsubProfile();
      } else {
          setUser(null);
      }
    });
    
    // Add Error Handler to Posts Snapshot
    const q = query(collection(db, 'posts'), orderBy('timestamp', 'desc'));
    const unsubPosts = onSnapshot(q, (snap) => {
        setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoadingPosts(false);
    }, (error) => {
        console.error("Posts snapshot error:", error.message);
        setLoadingPosts(false);
    });
    
    const handleClickOutside = (e) => { if (!e.target.closest('.post-menu-container')) setActiveMenuPostId(null); };
    document.addEventListener('click', handleClickOutside);
    
    return () => { unsubAuth(); unsubPosts(); document.removeEventListener('click', handleClickOutside); };
  }, []);

  const handleUploadMoment = async (file) => {
      if (!user) return alert("Sign in to share moments.");
      setIsPosting(true); 
      try {
          if (file.size > 50 * 1024 * 1024) { setIsPosting(false); return alert("File too large (Max 50MB)"); }
          const refS = ref(storage, `moments/${user.uid}/${Date.now()}_${file.name}`);
          const uploadTask = uploadBytesResumable(refS, file);
          uploadTask.on('state_changed', null, null, async () => {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              const nameToSave = user.displayName || user.email?.split('@')[0] || "Aristocrat";
              await addDoc(collection(db, 'moments'), {
                  uid: user.uid, userName: nameToSave, userAvatar: user.photoURL, mediaURL: url,
                  mediaType: file.type.startsWith('video/') ? 'video' : 'image', timestamp: serverTimestamp(), views: [], reactions: [], caption: ''
              });
              setIsPosting(false); alert("Moment shared!");
          });
      } catch (e) { console.error(e); setIsPosting(false); alert("Error uploading moment."); }
  };

  const handleFileSelect = async (e) => { 
      const file = e.target.files[0]; 
      if (!file) return; 
      if (file.size > 50 * 1024 * 1024) return alert("File is too large. Max size is 50MB."); 
      
      setMediaFile(file); 
      const type = file.type.startsWith('video/') ? 'video' : 'image'; 
      setMediaType(type); 
      setMediaPreview(URL.createObjectURL(file)); 
  };

  const handlePost = async () => {
    if ((!newPostText.trim() && !mediaFile) || !user) return;
    setIsPosting(true);
    setUploadProgress(0);
    try {
      let downloadURL = null;
      let thumbnailURL = null;

      if (mediaFile) {
        const storageRef = ref(storage, `posts/${user.uid}/${Date.now()}_${mediaFile.name}`);
        const uploadTask = uploadBytesResumable(storageRef, mediaFile);
        
        await new Promise((resolve, reject) => {
            uploadTask.on('state_changed', 
                (snapshot) => setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100), 
                reject, 
                async () => { downloadURL = await getDownloadURL(uploadTask.snapshot.ref); resolve(); }
            );
        });

        if (mediaType === 'video') {
            try {
                const thumbBlob = await generateVideoThumbnail(mediaFile);
                if (thumbBlob) {
                    const thumbRef = ref(storage, `thumbnails/${user.uid}/${Date.now()}_thumb.jpg`);
                    await uploadBytesResumable(thumbRef, thumbBlob);
                    thumbnailURL = await getDownloadURL(thumbRef);
                }
            } catch (err) {
                console.error("Error generating thumbnail:", err);
            }
        }
      }

      await addDoc(collection(db, 'posts'), {
        text: newPostText, uid: user.uid, userName: user.displayName || "Aristocrat", userAvatar: user.photoURL, isVerified: user.isVerified || false,
        mediaURL: downloadURL, 
        thumbnailURL: thumbnailURL, 
        mediaType: mediaType, category: 'General', timestamp: serverTimestamp(), likes: 0, likedBy: [], comments: 0, isPrivate: false, isPromoted: false
      });
      
      setNewPostText(''); setMediaFile(null); setMediaPreview(null); setUploadProgress(0);
    } catch (e) { console.error(e); alert("Upload failed."); } finally { setIsPosting(false); }
  };

  const handleLike = async (post) => {
    if (!user) return alert("Sign in.");
    // FIX: Strict null check prevents "indexOf" error
    if (!post || !post.id) return; 
    
    const postRef = doc(db, 'posts', post.id);
    const isLiked = post.likedBy && post.likedBy.includes(user.uid);
    try {
        if (isLiked) { await updateDoc(postRef, { likes: increment(-1), likedBy: arrayRemove(user.uid) }); } 
        else { 
            await updateDoc(postRef, { likes: increment(1), likedBy: arrayUnion(user.uid) }); 
            if (post.uid !== user.uid) {
                const notifId = `like_${post.id}_${user.uid}`;
                await setDoc(doc(db, 'notifications', notifId), { 
                    recipientId: post.uid, 
                    senderId: user.uid, 
                    senderName: user.displayName || 'User', 
                    senderAvatar: user.photoURL, 
                    type: 'like', 
                    targetId: post.id, 
                    timestamp: serverTimestamp(), 
                    isRead: false 
                });
            }
        }
    } catch(e) { console.error(e); }
  };

  const submitComment = async (postId) => {
    if (!commentText.trim() || !user || !postId) return;
    try {
      await addDoc(collection(db, 'posts', postId, 'comments'), { text: commentText, uid: user.uid, userName: user.displayName || "Aristocrat", userAvatar: user.photoURL, isVerified: user.isVerified || false, parentId: replyingToId, timestamp: serverTimestamp() });
      await updateDoc(doc(db, 'posts', postId), { comments: increment(1) });
      setCommentText(''); setReplyingToId(null); toggleNav(true); 
    } catch (e) { console.error("Comment failed", e); }
  };
  
  // --- FIX: UPDATED SAFE HANDLERS ---
  const handleSavePost = async (post) => { 
      if (!user) return alert("Sign in to save.");
      if (!post || !post.id) return;
      
      try {
          // FIX: Use setDoc with merge instead of updateDoc
          await setDoc(doc(db, 'users', user.uid), { 
              savedPosts: arrayUnion(post.id) 
          }, { merge: true });
          
          alert("Post saved!"); 
          setActiveMenuPostId(null); 
      } catch(e) {
          console.error("Save failed:", e);
      }
  };

  const handleSubmitReport = async (reason) => { 
      if (!reportingPostId || !user) return; 
      await addDoc(collection(db, 'reports'), { targetId: reportingPostId, type: 'post', reporter: user.uid, reason, timestamp: serverTimestamp() }); 
      alert("Report submitted."); setReportModalOpen(false); setReportingPostId(null); 
  };
  
  const handleBoost = async (campaignData) => { await addDoc(collection(db, 'boost_requests'), { ...campaignData, requesterId: user.uid, timestamp: serverTimestamp() }); await updateDoc(doc(db, 'posts', campaignData.targetId), { isPromoted: true }); setBoostTarget(null); alert("Boost activated! Your post is now being promoted."); };
  const handleTogglePrivate = async (post) => { if(!post?.id) return; await updateDoc(doc(db, 'posts', post.id), { isPrivate: !post.isPrivate }); setActiveMenuPostId(null); };
  const handleDelete = async (id) => { if(!id) return; if (window.confirm("Are you sure you want to delete this post?")) await deleteDoc(doc(db, 'posts', id)); };
  const handleShare = async (post) => { if(!post?.id) return; const url = `${window.location.origin}/post/${post.id}`; if (navigator.share) { navigator.share({ title: post.userName, text: post.text, url: url }); } else { navigator.clipboard.writeText(url).then(() => { alert("Link copied!"); }); } };
  const toggleCommentBox = (postId) => { if (activeCommentBox === postId) { setActiveCommentBox(null); setReplyingToId(null); } else { setActiveCommentBox(postId); setCommentText(''); setReplyingToId(null); } };
  const openVideoInWatch = (post) => { navigate('/watch', { state: { startVideoId: post.id } }); };

  const filteredPosts = filterTag 
    ? posts.filter(p => p.text?.includes(filterTag))
    : posts;

  return (
    <div className="p-4 md:p-6 w-full max-w-[1200px] mx-auto pb-24">
      <TopBar />
      <MomentsBar currentUser={user} onUpload={handleUploadMoment} />

      <div className="flex justify-between items-center mb-8">
        <div>
            <h2 className="text-3xl font-black text-dark tracking-tight">The Feed</h2>
            <p className="text-gray-500 font-medium">
                {filterTag ? <span>Filtered by <span className="text-primary font-bold">{filterTag}</span> <button onClick={() => setFilterTag(null)} className="ml-2 text-red-500 text-xs hover:underline">(Clear)</button></span> : "Curated for you"}
            </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <div className="flex-1 w-full min-w-0 space-y-8">
          {/* Composer */}
          <div className="glass-panel rounded-[30px] p-2 z-20 relative">
            <div className="bg-white/60 rounded-[24px] p-5 backdrop-blur-sm">
                <div className="flex gap-4">
                    <Avatar src={user?.photoURL} className="w-12 h-12 rounded-2xl object-cover" alt="User Avatar" />
                    <div className="flex-1">
                        <textarea placeholder="Share your thoughts..." className="w-full bg-transparent border-none outline-none text-lg resize-none mt-2 placeholder-gray-400" rows="2" value={newPostText} onChange={(e) => setNewPostText(e.target.value)}></textarea>
                        {mediaPreview && (
                            <div className="relative mt-2 inline-block group">
                                {mediaType === 'video' ? <video src={mediaPreview} controls className="h-32 rounded-xl bg-black" /> : <img src={mediaPreview} className="h-32 rounded-xl" alt="Media Preview" />}
                                <button onClick={() => { setMediaFile(null); setMediaPreview(null); setMediaType(null); }} className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center"><i className="fas fa-times text-xs"></i></button>
                            </div>
                        )}
                        {isPosting && mediaFile && <div className="mt-3 w-full bg-gray-200 rounded-full h-2.5"><div className="bg-primary h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div></div>}
                    </div>
                </div>
                <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200/50 relative">
                    <div className="flex gap-1 items-center">
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" onChange={handleFileSelect} />
                        <button onClick={() => fileInputRef.current.click()} className="w-9 h-9 rounded-xl hover:bg-primary/10 text-primary flex items-center justify-center"><i className="fas fa-image"></i></button>
                    </div>
                    <button onClick={handlePost} disabled={isPosting || (!newPostText.trim() && !mediaFile)} className="bg-gradient-to-r from-primary to-primary-dark text-white px-6 py-2.5 rounded-xl font-bold hover:shadow-lg transition-all shadow-primary/20 disabled:opacity-50">
                        {isPosting ? `Uploading ${Math.round(uploadProgress)}%` : 'Tukumi'}
                    </button>
                </div>
            </div>
          </div>
          
          {/* Post Feed */}
          {loadingPosts ? (
             <>
               <FeedSkeleton />
               <FeedSkeleton />
             </>
          ) : (
             filteredPosts.map(post => {
                 if (post.isPrivate && post.uid !== user?.uid) return null;
                 const isLikedByMe = user && post.likedBy && post.likedBy.includes(user.uid);
                 
                 return (
                    <PostItem 
                        key={post.id}
                        post={post}
                        user={user}
                        isLikedByMe={isLikedByMe}
                        playingPostId={playingPostId}
                        videoContainerRefs={videoContainerRefs}
                        setActiveMenuPostId={setActiveMenuPostId}
                        activeMenuPostId={activeMenuPostId}
                        setBoostTarget={setBoostTarget}
                        handleTogglePrivate={handleTogglePrivate}
                        handleDelete={handleDelete}
                        handleSavePost={handleSavePost}
                        setReportingPostId={setReportingPostId}
                        setReportModalOpen={setReportModalOpen}
                        setFullscreenMedia={setFullscreenMedia}
                        openVideoInWatch={openVideoInWatch}
                        handleLike={handleLike}
                        toggleCommentBox={toggleCommentBox}
                        handleShare={handleShare}
                        activeCommentBox={activeCommentBox}
                        setActiveCommentBox={setActiveCommentBox}
                        commentText={commentText}
                        setCommentText={setCommentText}
                        replyingToId={replyingToId}
                        setReplyingToId={setReplyingToId}
                        submitComment={submitComment}
                        toggleNav={toggleNav}
                        navigate={navigate}
                        isGlobalMuted={isGlobalMuted}
                        toggleGlobalMute={toggleGlobalMute}
                    />
                 );
             })
          )}
        </div>
        
        {/* Dynamic Trending Sidebar */}
        <div className="hidden lg:block w-[340px] space-y-6 sticky top-6">
            <TrendingSidebar posts={posts} onTagClick={setFilterTag} />
        </div>
      </div>
      
      {/* Fullscreen Media Viewer (Z-Index: 5000) */}
      {fullscreenMedia && (
          <div className="fixed inset-0 bg-black z-[5000] flex items-center justify-center p-0 overflow-hidden cursor-pointer" onClick={() => setFullscreenMedia(null)}>
              <img src={fullscreenMedia.url} alt="Fullscreen Media" className="max-w-full max-h-full w-full h-auto object-contain" onClick={e => e.stopPropagation()} />
              <button onClick={() => setFullscreenMedia(null)} className="absolute top-6 right-6 text-white text-4xl drop-shadow-md z-[5001]">&times;</button>
          </div>
      )}
      
      {reportModalOpen && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center animate-fade-in p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                  <div className="text-center mb-4">
                      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3 text-red-500 text-xl"><i className="fas fa-flag"></i></div>
                      <h3 className="text-xl font-bold text-gray-900">Report Post</h3>
                  </div>
                  <div className="space-y-2 mb-6">
                      {['Spam or Fraud', 'Harassment', 'Violence', 'False Information'].map(reason => (
                          <button key={reason} onClick={() => handleSubmitReport(reason)} className="w-full text-left p-3 rounded-xl bg-gray-50 hover:bg-red-50 hover:text-red-600 text-gray-700 font-medium transition-colors">{reason}</button>
                      ))}
                  </div>
                  <button onClick={() => setReportModalOpen(false)} className="w-full py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">Cancel</button>
              </div>
          </div>
      )}
      
      {boostTarget && (<BoostModal target={boostTarget} onClose={() => setBoostTarget(null)} onBoost={handleBoost} />)}
    </div>
  );
};
 
export default Home;