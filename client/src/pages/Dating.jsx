import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../api/firebase';
import { 
  collection, query, where, getDocs, doc, updateDoc, 
  serverTimestamp, setDoc, getDoc, addDoc, arrayUnion 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import TopBar from '../components/TopBar';
import DatingFilterModal from '../components/DatingFilterModal';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';

// --- CONSTANTS ---
const MYSTERY_NAMES = [
    "Star Gazer", "Night Owl", "Coffee Lover", "Dream Chaser", "Music Soul", 
    "Ocean Child", "Mountain Hiker", "City Light", "Book Worm", "Artistic Spirit"
];

const QUICK_MESSAGES = [
    "You have a great vibe! ✨", 
    "Hi! I'd love to get to know you. 👋", 
    "Your profile made me smile. 😊", 
    "We seem to have a lot in common!"
];

// --- SWIPEABLE CARD COMPONENT ---
const SwipeCard = ({ candidate, index, isBlindDate, onSwipe }) => {
    // Motion values for drag physics
    const x = useMotionValue(0);
    const rotate = useTransform(x, [-200, 200], [-18, 18]); // Rotate card while dragging
    const opacityLike = useTransform(x, [20, 150], [0, 1]); // Show "LIKE" text
    const opacityNope = useTransform(x, [-20, -150], [0, 1]); // Show "NOPE" text
    const scale = useTransform(x, [-200, 0, 200], [1.05, 1, 1.05]);

    // Handle Drag End
    const handleDragEnd = (event, info) => {
        const threshold = 100; // Drag distance required to trigger swipe
        if (info.offset.x > threshold) {
            onSwipe('right', candidate); // Swiped Right (Like)
        } else if (info.offset.x < -threshold) {
            onSwipe('left', candidate); // Swiped Left (Pass)
        }
    };

    return (
        <motion.div
            style={{ 
                x, 
                rotate, 
                scale,
                zIndex: 50 - index, 
                position: 'absolute',
                top: 0, bottom: 0, left: 0, right: 0
            }}
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ 
                scale: 1 - index * 0.04, 
                y: index * 15, 
                opacity: 1 - index * 0.2,
                filter: index > 0 ? 'blur(2px)' : 'none'
            }}
            exit={{ 
                x: x.get() < 0 ? -500 : 500, 
                opacity: 0, 
                transition: { duration: 0.2 } 
            }}
            drag={index === 0 ? "x" : false} // Only top card is draggable
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={handleDragEnd}
            whileDrag={{ cursor: 'grabbing' }}
            className="w-full h-full rounded-[35px] shadow-2xl bg-white overflow-hidden cursor-grab origin-bottom touch-none border-4 border-white"
        >
            {/* "LIKE" / "NOPE" STAMPS ON DRAG */}
            {index === 0 && (
                <>
                    <motion.div style={{ opacity: opacityLike }} className="absolute top-8 left-8 z-50 border-4 border-green-500 text-green-500 font-black text-4xl px-4 py-2 rounded-xl transform -rotate-12 bg-black/20 backdrop-blur-sm">
                        LIKE
                    </motion.div>
                    <motion.div style={{ opacity: opacityNope }} className="absolute top-8 right-8 z-50 border-4 border-red-500 text-red-500 font-black text-4xl px-4 py-2 rounded-xl transform rotate-12 bg-black/20 backdrop-blur-sm">
                        NOPE
                    </motion.div>
                </>
            )}

            {/* IMAGE LAYER */}
            <div className="absolute inset-0 bg-gray-900 pointer-events-none">
                <img 
                    src={candidate.photoURL || "https://images.unsplash.com/photo-1534528741775-53994a69daeb"} 
                    className={`w-full h-full object-cover pointer-events-none ${isBlindDate ? 'blur-xl scale-110 opacity-70' : ''}`} 
                    alt="Candidate" 
                />
                
                {isBlindDate && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20">
                        <div className="w-24 h-24 bg-white/10 backdrop-blur-md rounded-full border border-white/30 flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.2)]">
                            <i className="fas fa-user-secret text-5xl text-white"></i>
                        </div>
                    </div>
                )}
            </div>

            {/* TEXT CONTENT LAYER */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent flex flex-col justify-end p-8 text-white pointer-events-none">
                <div className="flex items-end gap-3 mb-2">
                    <h2 className="text-4xl font-black tracking-tighter drop-shadow-lg">
                        {isBlindDate ? candidate.mysteryName : candidate.displayName.split(' ')[0]}
                    </h2>
                    <span className="text-xl font-bold opacity-90 mb-1 bg-white/20 px-2 rounded-lg backdrop-blur-md">{candidate.age || 24}</span>
                </div>

                {candidate.datingHeadline && (
                    <p className="text-pink-300 font-bold text-sm mb-4 italic shadow-black drop-shadow-md">"{candidate.datingHeadline}"</p>
                )}

                <div className="flex flex-wrap gap-2 mb-4">
                    {candidate.profession && <span className="bg-black/30 backdrop-blur px-3 py-1 rounded-full text-xs font-bold border border-white/20">{candidate.profession}</span>}
                    {candidate.location && <span className="bg-black/30 backdrop-blur px-3 py-1 rounded-full text-xs font-bold border border-white/20">{candidate.location}</span>}
                </div>
            </div>
        </motion.div>
    );
};

// --- MAIN COMPONENT ---
const Dating = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modes & UI
  const [isBlindDate, setIsBlindDate] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchedUser, setMatchedUser] = useState(null);
  
  // Messaging
  const [showLikeModal, setShowLikeModal] = useState(false);
  const [customMessage, setCustomMessage] = useState("");
  const [pendingCandidate, setPendingCandidate] = useState(null);

  // Edit Headline
  const [isEditingHeadline, setIsEditingHeadline] = useState(false);
  const [newHeadline, setNewHeadline] = useState("");

  const [filters, setFilters] = useState({
      gender: 'Everyone', ageRange: [18, 50], location: '', profession: '', goal: 'Long-term'
  });

  // --- INITIALIZATION (Same as before) ---
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const userData = userSnap.data();
            setProfile(userData);
            setNewHeadline(userData.datingHeadline || "");
            
            if (userData.isDatingActive) {
                const defaultInterest = userData.gender === 'Male' ? 'Women' : userData.gender === 'Female' ? 'Men' : 'Everyone';
                setFilters(prev => ({ ...prev, gender: defaultInterest }));
                loadCandidates(currentUser.uid, { ...filters, gender: defaultInterest });
            } else {
                setLoading(false);
            }
        }
      }
    });
    return () => unsubAuth();
  }, []);

  const loadCandidates = async (myUid, activeFilters) => {
    setLoading(true);
    try {
        const q = query(collection(db, 'users'), where('isDatingActive', '==', true));
        const snap = await getDocs(q);
        let allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        allUsers = allUsers.filter(u => {
            if (u.id === myUid) return false;
            if (activeFilters.gender !== 'Everyone') {
                const target = activeFilters.gender === 'Men' ? 'Male' : 'Female';
                if (u.gender !== target) return false;
            }
            let age = u.age || 24; 
            if (age < activeFilters.ageRange[0] || age > activeFilters.ageRange[1]) return false;
            return true;
        });

        allUsers = allUsers.map(u => ({
            ...u,
            mysteryName: MYSTERY_NAMES[Math.floor(Math.random() * MYSTERY_NAMES.length)]
        }));

        setCandidates(allUsers.sort(() => 0.5 - Math.random()));
    } catch (error) { console.error("Error:", error); } finally { setLoading(false); }
  };

  // --- HANDLERS ---

  // Called by SwipeCard when dragged far enough
  const handleSwipe = (direction, candidate) => {
      setCandidates(prev => prev.slice(1)); // Remove card from stack
      
      if (direction === 'right') {
          // Temporarily set pending and init like process
          setPendingCandidate(candidate);
          // If simply swiping, we default to "Just Like" logic immediately or open modal?
          // For Tinder style, usually swipe right = instant like. 
          // Let's do instant like for flow, but maybe trigger modal for Super Like button.
          confirmLike(null, candidate);
      } else {
          handlePass(candidate);
      }
  };

  const confirmLike = async (message = null, specificCandidate = null) => {
      const candidate = specificCandidate || pendingCandidate;
      setShowLikeModal(false);
      
      // Safety check if already removed via swipe
      if (!specificCandidate) setCandidates(prev => prev.filter(c => c.id !== candidate.id));

      const swipeId = `${user.uid}_${candidate.id}`;
      await setDoc(doc(db, 'dating_swipes', swipeId), {
          from: user.uid, to: candidate.id, type: 'like', timestamp: serverTimestamp(), message: message
      });

      if (message) {
          const chatId = [user.uid, candidate.id].sort().join('_');
          await setDoc(doc(db, 'conversations', chatId), {
              participants: [user.uid, candidate.id],
              users: [
                  { uid: user.uid, displayName: profile.displayName, photoURL: profile.photoURL },
                  { uid: candidate.id, displayName: candidate.displayName, photoURL: candidate.photoURL }
              ],
              lastMessage: message, isMatch: false, updatedAt: serverTimestamp()
          }, { merge: true });

          await addDoc(collection(db, `conversations/${chatId}/messages`), {
              text: message, senderId: user.uid, timestamp: serverTimestamp()
          });
      }

      // Match Check
      const reverseSwipeRef = doc(db, 'dating_swipes', `${candidate.id}_${user.uid}`);
      const reverseSnap = await getDoc(reverseSwipeRef);
      if (reverseSnap.exists() && ['like', 'superlike'].includes(reverseSnap.data().type)) {
          handleMatch(candidate);
      }
  };

  const handleStar = async () => {
      if (candidates.length === 0) return;
      const candidate = candidates[0];
      setCandidates(prev => prev.slice(1));

      const swipeId = `${user.uid}_${candidate.id}`;
      await setDoc(doc(db, 'dating_swipes', swipeId), {
          from: user.uid, to: candidate.id, type: 'superlike', timestamp: serverTimestamp()
      });

      await addDoc(collection(db, 'notifications'), {
          recipientId: candidate.id, senderId: user.uid,
          senderName: isBlindDate ? "Mystery Admirer" : profile.displayName,
          senderAvatar: isBlindDate ? null : profile.photoURL,
          type: 'dating_interest', message: "super liked you! 🌟",
          timestamp: serverTimestamp(), isRead: false
      });
  };

  const handlePass = async (candidate) => {
      // If called via button, remove from state manually. Swipe handles it automatically.
      if (!candidate) {
          if (candidates.length === 0) return;
          candidate = candidates[0];
          setCandidates(prev => prev.slice(1));
      }
      
      await setDoc(doc(db, 'dating_swipes', `${user.uid}_${candidate.id}`), {
          from: user.uid, to: candidate.id, type: 'pass', timestamp: serverTimestamp()
      });
  };

  const handleMatch = async (candidate) => {
      setMatchedUser(candidate);
      setShowMatchModal(true);
      const chatId = [user.uid, candidate.id].sort().join('_');
      await updateDoc(doc(db, 'conversations', chatId), { isMatch: true });
  };

  const saveHeadline = async () => {
      if (!user) return;
      await updateDoc(doc(db, 'users', user.uid), { datingHeadline: newHeadline });
      setProfile(prev => ({ ...prev, datingHeadline: newHeadline }));
      setIsEditingHeadline(false);
  };
  
  const activateDating = async () => {
      await updateDoc(doc(db, 'users', user.uid), { isDatingActive: true });
      window.location.reload();
  };

  if (loading) return <div className="flex h-screen items-center justify-center bg-gray-900"><div className="w-16 h-16 border-t-4 border-pink-500 rounded-full animate-spin"></div></div>;

  if (!profile?.isDatingActive) return (
      <div className="p-6 min-h-screen flex flex-col items-center justify-center bg-gray-900">
          <TopBar />
          <h1 className="text-4xl font-bold text-white mb-4">Dating Profile Inactive</h1>
          <button onClick={activateDating} className="bg-pink-500 text-white px-8 py-3 rounded-full font-bold">Activate Now</button>
      </div>
  );

  return (
    <div className="p-4 md:p-6 w-full max-w-[1400px] mx-auto pb-28 relative min-h-screen bg-gradient-to-br from-gray-50 to-gray-200 overflow-hidden">
        <div className="hidden md:block"><TopBar /></div>
        
        {/* HEADER */}
        <div className="flex flex-col gap-4 mb-8 px-2 z-10 relative">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 bg-white/80 backdrop-blur-md p-1.5 rounded-2xl shadow-sm border border-white/50">
                    <button onClick={() => setIsBlindDate(false)} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${!isBlindDate ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md' : 'text-gray-400 hover:bg-gray-100'}`}>Classic</button>
                    <button onClick={() => setIsBlindDate(true)} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${isBlindDate ? 'bg-black text-white shadow-md' : 'text-gray-400 hover:bg-gray-100'}`}><i className="fas fa-user-secret"></i> Blind</button>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => setIsEditingHeadline(true)} className="w-11 h-11 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center text-gray-500 hover:text-pink-600 hover:scale-105 transition-all"><i className="fas fa-pen"></i></button>
                    <button onClick={() => setShowFilterModal(true)} className="w-11 h-11 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center text-gray-500 hover:text-purple-600 hover:scale-105 transition-all"><i className="fas fa-sliders-h"></i></button>
                </div>
            </div>

            {isEditingHeadline ? (
                <div className="bg-white/80 backdrop-blur p-4 rounded-2xl shadow-sm flex gap-2 border border-pink-100">
                    <input value={newHeadline} onChange={e => setNewHeadline(e.target.value)} placeholder="Headline..." className="flex-1 bg-transparent px-2 outline-none text-sm font-bold text-gray-800" maxLength={50} autoFocus />
                    <button onClick={saveHeadline} className="bg-black text-white px-4 py-2 rounded-lg font-bold text-xs">Save</button>
                </div>
            ) : profile.datingHeadline && (
                <div className="text-center text-gray-600 text-sm font-bold italic">"{profile.datingHeadline}"</div>
            )}
        </div>

        {/* --- SWIPE STACK CONTAINER --- */}
        <div className="relative w-full max-w-sm md:max-w-md mx-auto h-[62vh] perspective-1000">
            <AnimatePresence>
                {candidates.length > 0 ? (
                    // We render specific cards. Reverse map so 0 index is visually on top (z-index handled in component)
                    candidates.slice(0, 3).map((candidate, index) => (
                        <SwipeCard 
                            key={candidate.id}
                            candidate={candidate}
                            index={index}
                            isBlindDate={isBlindDate}
                            onSwipe={handleSwipe}
                        />
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-white/80 backdrop-blur-xl rounded-[35px] border border-white shadow-xl">
                        <div className="w-20 h-20 bg-pink-100 rounded-full flex items-center justify-center text-pink-400 mb-4 animate-pulse"><i className="fas fa-search text-3xl"></i></div>
                        <h3 className="text-xl font-bold text-gray-800">Searching...</h3>
                        <p className="text-gray-500 text-sm mt-2">Try adjusting your filters.</p>
                        <button onClick={() => setShowFilterModal(true)} className="mt-6 bg-black text-white px-6 py-3 rounded-xl font-bold text-sm">Filters</button>
                    </div>
                )}
            </AnimatePresence>
        </div>

        {/* --- ACTION BUTTONS --- */}
        {candidates.length > 0 && (
            <div className="flex justify-center items-center gap-6 mt-8 z-20 relative">
                <button onClick={() => handlePass()} className="w-16 h-16 bg-white rounded-full shadow-lg border border-gray-100 text-gray-400 text-2xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 hover:scale-110 active:scale-95 transition-all"><i className="fas fa-times"></i></button>
                <button onClick={handleStar} className="w-12 h-12 bg-white rounded-full shadow-md border border-gray-100 text-blue-400 text-lg flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 hover:scale-110 active:scale-95 transition-all transform -translate-y-3"><i className="fas fa-star"></i></button>
                {/* Clicking Heart triggers Modal for message, Swiping Right triggers instant like */}
                <button onClick={() => { setPendingCandidate(candidates[0]); setShowLikeModal(true); }} className="w-16 h-16 bg-gradient-to-tr from-pink-500 to-rose-600 rounded-full shadow-lg shadow-pink-500/30 text-white text-3xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all"><i className="fas fa-heart"></i></button>
            </div>
        )}

        {/* --- LIKE & MESSAGE MODAL (Manual Click) --- */}
        {showLikeModal && pendingCandidate && (
            <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white w-full max-w-sm rounded-[30px] p-6 shadow-2xl">
                    <h3 className="text-lg font-black text-center mb-4">Message {isBlindDate ? pendingCandidate.mysteryName : pendingCandidate.displayName}</h3>
                    <textarea value={customMessage} onChange={e => setCustomMessage(e.target.value)} placeholder="Say something nice..." className="w-full bg-gray-50 rounded-2xl p-4 text-sm mb-4 outline-none resize-none font-medium" rows="3"></textarea>
                    <div className="flex gap-3">
                        <button onClick={() => confirmLike(null)} className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50">Just Like</button>
                        <button onClick={() => confirmLike(customMessage)} className="flex-1 bg-pink-500 text-white py-3 rounded-xl font-bold hover:shadow-lg">Send</button>
                    </div>
                </div>
            </div>
        )}

        {/* --- MATCH MODAL --- */}
        {showMatchModal && matchedUser && (
            <div className="fixed inset-0 z-[10000] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 animate-pop-in text-center">
                <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400 italic mb-8">MATCH!</h1>
                <div className="flex items-center gap-4 mb-8">
                    <img src={profile.photoURL} className="w-24 h-24 rounded-full border-4 border-white" />
                    <img src={matchedUser.photoURL} className="w-24 h-24 rounded-full border-4 border-white" />
                </div>
                <button onClick={() => navigate('/messages', { state: { startChatWith: matchedUser } })} className="bg-white text-black px-8 py-4 rounded-full font-bold shadow-xl mb-4">Chat Now</button>
                <button onClick={() => setShowMatchModal(false)} className="text-white/70 font-bold">Keep Swiping</button>
            </div>
        )}

        {showFilterModal && <DatingFilterModal currentFilters={filters} onClose={() => setShowFilterModal(false)} onApply={(newFilters) => { setFilters(newFilters); loadCandidates(user.uid, newFilters); }} />}
    </div>
  );
};

export default Dating;