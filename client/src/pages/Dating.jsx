import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../api/firebase';
import { 
  collection, query, where, getDocs, doc, updateDoc, 
  serverTimestamp, setDoc, getDoc, addDoc, arrayUnion 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import TopBar from '../components/TopBar';
import DatingFilterModal from '../components/DatingFilterModal';

// --- STYLES & HELPERS ---
const cardStyle = (index) => ({
    zIndex: 10 - index,
    transform: `scale(${1 - index * 0.05}) translateY(${index * 20}px)`,
    opacity: 1 - index * 0.2,
    transition: 'all 0.5s cubic-bezier(0.23, 1, 0.32, 1)'
});

const MYSTERY_NAMES = [
    "Star Gazer", "Night Owl", "Coffee Lover", "Dream Chaser", "Music Soul", 
    "Ocean Child", "Mountain Hiker", "City Light", "Book Worm", "Artistic Spirit",
    "Tech Wizard", "Foodie", "Adventure Seeker", "Late Bloomer", "Kind Heart"
];

const QUICK_MESSAGES = [
    "You have a great vibe! ✨", 
    "Hi! I'd love to get to know you. 👋", 
    "Your profile made me smile. 😊", 
    "Hey! We have similar interests."
];

const Dating = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // --- MODES & UI ---
  const [isBlindDate, setIsBlindDate] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchedUser, setMatchedUser] = useState(null);
  
  // --- MESSAGING ON LIKE ---
  const [showLikeModal, setShowLikeModal] = useState(false);
  const [customMessage, setCustomMessage] = useState("");
  const [pendingCandidate, setPendingCandidate] = useState(null); // Who are we liking?

  // --- EDIT HEADLINE ---
  const [isEditingHeadline, setIsEditingHeadline] = useState(false);
  const [newHeadline, setNewHeadline] = useState("");

  // Filters
  const [filters, setFilters] = useState({
      gender: 'Everyone',
      ageRange: [18, 50],
      location: '',
      profession: '',
      goal: 'Long-term'
  });

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const userData = userSnap.data();
            setProfile(userData);
            setNewHeadline(userData.datingHeadline || ""); // Load existing headline
            
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

        // Assign random Mystery Names to candidates for this session
        allUsers = allUsers.map(u => ({
            ...u,
            mysteryName: MYSTERY_NAMES[Math.floor(Math.random() * MYSTERY_NAMES.length)]
        }));

        setCandidates(allUsers.sort(() => 0.5 - Math.random()));
    } catch (error) { console.error("Error:", error); } finally { setLoading(false); }
  };

  // --- ACTIONS ---

  // 1. PREPARE LIKE (Open Modal)
  const initLike = () => {
      if (candidates.length === 0) return;
      setPendingCandidate(candidates[0]);
      setCustomMessage(""); // Reset
      setShowLikeModal(true);
  };

  // 2. EXECUTE LIKE (With or Without Message)
  const confirmLike = async (message = null) => {
      const candidate = pendingCandidate;
      setShowLikeModal(false);
      setCandidates(prev => prev.slice(1)); // Remove card

      // Record Swipe
      const swipeId = `${user.uid}_${candidate.id}`;
      await setDoc(doc(db, 'dating_swipes', swipeId), {
          from: user.uid, to: candidate.id, type: 'like', timestamp: serverTimestamp(), message: message
      });

      // Send Message if provided (Directly to inbox request or notification)
      if (message) {
          // Check for existing chat first or create new 'request'
          const chatId = [user.uid, candidate.id].sort().join('_');
          const chatRef = doc(db, 'conversations', chatId);
          
          // Create conversation if not exists
          await setDoc(chatRef, {
              participants: [user.uid, candidate.id],
              users: [
                  { uid: user.uid, displayName: profile.displayName, photoURL: profile.photoURL },
                  { uid: candidate.id, displayName: candidate.displayName, photoURL: candidate.photoURL }
              ],
              lastMessage: message,
              isMatch: false, // Not a full match yet until they reply/like back
              updatedAt: serverTimestamp()
          }, { merge: true });

          // Add the message
          await addDoc(collection(db, `conversations/${chatId}/messages`), {
              text: message, senderId: user.uid, timestamp: serverTimestamp()
          });
      }

      // Check Match (Mutual Like)
      const reverseSwipeRef = doc(db, 'dating_swipes', `${candidate.id}_${user.uid}`);
      const reverseSnap = await getDoc(reverseSwipeRef);
      if (reverseSnap.exists() && ['like', 'superlike'].includes(reverseSnap.data().type)) {
          handleMatch(candidate);
      }
  };

  // 3. STAR / SUPER LIKE (No Text, Just Interest)
  const handleStar = async () => {
      if (candidates.length === 0) return;
      const candidate = candidates[0];
      setCandidates(prev => prev.slice(1));

      const swipeId = `${user.uid}_${candidate.id}`;
      await setDoc(doc(db, 'dating_swipes', swipeId), {
          from: user.uid, to: candidate.id, type: 'superlike', timestamp: serverTimestamp()
      });

      // Send "Interested" Notification
      await addDoc(collection(db, 'notifications'), {
          recipientId: candidate.id,
          senderId: user.uid,
          senderName: isBlindDate ? "Mystery Admirer" : profile.displayName,
          senderAvatar: isBlindDate ? null : profile.photoURL,
          type: 'dating_interest',
          message: "is interested in you! ⭐",
          timestamp: serverTimestamp(),
          isRead: false
      });

      // Save to Saved Profiles (Bookmark)
      await updateDoc(doc(db, 'users', user.uid), {
          savedProfiles: arrayUnion(candidate.id)
      });
  };

  // 4. PASS
  const handlePass = async () => {
      if (candidates.length === 0) return;
      const candidate = candidates[0];
      setCandidates(prev => prev.slice(1));
      await setDoc(doc(db, 'dating_swipes', `${user.uid}_${candidate.id}`), {
          from: user.uid, to: candidate.id, type: 'pass', timestamp: serverTimestamp()
      });
  };

  const handleMatch = async (candidate) => {
      setMatchedUser(candidate);
      setShowMatchModal(true);
      const chatId = [user.uid, candidate.id].sort().join('_');
      await updateDoc(doc(db, 'conversations', chatId), { isMatch: true }); // Upgrade chat to Match
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

  if (loading) return <div className="flex h-screen items-center justify-center"><div className="w-16 h-16 bg-pink-100 rounded-full animate-ping"></div></div>;

  if (!profile?.isDatingActive) {
      return (
        <div className="p-6 w-full max-w-[1400px] mx-auto min-h-screen flex flex-col items-center justify-center bg-white">
            <TopBar />
            <div className="text-center max-w-md animate-fade-in">
                <div className="w-32 h-32 bg-gradient-to-tr from-pink-500 to-red-500 rounded-[40px] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-pink-200 rotate-3">
                    <i className="fas fa-heart text-6xl text-white"></i>
                </div>
                <h1 className="text-5xl font-black text-dark mb-4 tracking-tighter">Tukumi Dating</h1>
                <button onClick={activateDating} className="w-full bg-dark text-white py-5 rounded-2xl font-bold text-lg shadow-xl hover:bg-pink-600 transition-all">Create Dating Profile</button>
            </div>
        </div>
      );
  }

  return (
    <div className="p-4 md:p-6 w-full max-w-[1400px] mx-auto pb-28 relative min-h-screen bg-[#fff0f5]">
        <div className="hidden md:block"><TopBar /></div>
        
        {/* HEADER & TOGGLES */}
        <div className="flex flex-col gap-4 mb-6 px-2">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4 bg-white p-1.5 rounded-2xl shadow-sm border border-pink-100">
                    <button onClick={() => setIsBlindDate(false)} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${!isBlindDate ? 'bg-pink-500 text-white shadow-md' : 'text-gray-400 hover:bg-gray-50'}`}>Classic</button>
                    <button onClick={() => setIsBlindDate(true)} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${isBlindDate ? 'bg-dark text-white shadow-md' : 'text-gray-400 hover:bg-gray-50'}`}><i className="fas fa-mask"></i> Blind Date</button>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setIsEditingHeadline(true)} className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-pink-100 flex items-center justify-center text-gray-500 hover:text-pink-500 hover:scale-105 transition-transform"><i className="fas fa-pen"></i></button>
                    <button onClick={() => setShowFilterModal(true)} className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-pink-100 flex items-center justify-center text-pink-500 hover:scale-105 transition-transform"><i className="fas fa-sliders-h text-lg"></i></button>
                </div>
            </div>

            {/* HEADLINE EDITOR */}
            {isEditingHeadline ? (
                <div className="bg-white p-4 rounded-2xl shadow-sm animate-fade-in flex gap-2">
                    <input 
                        value={newHeadline} 
                        onChange={e => setNewHeadline(e.target.value)} 
                        placeholder="Write a catchy headline..." 
                        className="flex-1 bg-gray-50 rounded-xl px-4 outline-none border focus:border-pink-300 text-sm font-bold"
                        maxLength={50}
                    />
                    <button onClick={saveHeadline} className="bg-pink-500 text-white px-4 py-2 rounded-xl font-bold text-xs">Save</button>
                </div>
            ) : profile.datingHeadline && (
                <div className="text-center text-gray-500 text-sm font-bold italic bg-white/50 py-2 rounded-xl">
                    "{profile.datingHeadline}"
                </div>
            )}
        </div>

        {/* --- MAIN CARD STACK --- */}
        <div className="relative w-full max-w-sm md:max-w-md mx-auto h-[60vh] mt-4 perspective-1000">
            {candidates.length > 0 ? (
                candidates.slice(0, 3).map((candidate, index) => (
                    <div key={candidate.id} style={cardStyle(index)} className={`absolute inset-0 w-full h-full bg-white rounded-[35px] shadow-2xl overflow-hidden border-4 border-white select-none`}>
                        
                        {/* IMAGE LAYER */}
                        <div className="absolute inset-0 bg-gray-200">
                            <img 
                                src={candidate.photoURL || "https://images.unsplash.com/photo-1534528741775-53994a69daeb"} 
                                className={`w-full h-full object-cover transition-all duration-700 ${isBlindDate ? 'blur-2xl scale-125 brightness-50' : ''}`} 
                                alt="Candidate" 
                            />
                            {isBlindDate && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-24 h-24 rounded-full border-2 border-white/30 flex items-center justify-center bg-white/10 backdrop-blur-md shadow-lg animate-pulse">
                                        <i className="fas fa-user-secret text-5xl text-white/80"></i>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* CONTENT LAYER */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent flex flex-col justify-end p-8 text-white">
                            <div className="transform translate-y-2 transition-transform group-hover:translate-y-0">
                                <div className="flex items-end gap-3 mb-2">
                                    <h2 className="text-4xl font-black tracking-tight shadow-black drop-shadow-md">
                                        {isBlindDate ? candidate.mysteryName : candidate.displayName.split(' ')[0]}
                                    </h2>
                                    <span className="text-2xl font-medium opacity-90 mb-1">{candidate.age || 24}</span>
                                </div>

                                {/* Custom Headline Display */}
                                {candidate.datingHeadline && (
                                    <p className="text-pink-300 font-bold text-sm mb-3 italic">"{candidate.datingHeadline}"</p>
                                )}

                                <div className="flex flex-wrap gap-2 mb-4">
                                    {candidate.profession && <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-bold border border-white/10"><i className="fas fa-briefcase mr-1"></i> {candidate.profession}</span>}
                                    {candidate.location && <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-bold border border-white/10"><i className="fas fa-map-marker-alt mr-1"></i> {candidate.location}</span>}
                                    {candidate.gender && <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-bold border border-white/10">{candidate.gender}</span>}
                                </div>

                                {candidate.bio && <p className="text-white/80 text-sm leading-relaxed line-clamp-2 mb-4 opacity-90">"{candidate.bio}"</p>}
                            </div>
                        </div>
                    </div>
                ))
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-white rounded-[35px] shadow-xl border-4 border-white">
                    <div className="w-20 h-20 bg-pink-50 rounded-full flex items-center justify-center text-pink-300 mb-4"><i className="fas fa-search text-3xl"></i></div>
                    <h3 className="text-2xl font-black text-dark">No more profiles</h3>
                    <button onClick={() => setShowFilterModal(true)} className="mt-6 text-pink-500 font-bold hover:underline">Edit Filters</button>
                </div>
            )}
        </div>

        {/* --- ACTION BUTTONS --- */}
        {candidates.length > 0 && (
            <div className="flex justify-center items-center gap-6 mt-8">
                <button onClick={handlePass} className="w-16 h-16 bg-white rounded-full shadow-xl text-gray-400 text-2xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 hover:scale-110 transition-all"><i className="fas fa-times"></i></button>
                <button onClick={handleStar} className="w-12 h-12 bg-white rounded-full shadow-lg text-yellow-400 text-lg flex items-center justify-center hover:bg-yellow-50 hover:scale-110 transition-all transform -translate-y-2"><i className="fas fa-star"></i></button>
                <button onClick={initLike} className="w-16 h-16 bg-gradient-to-tr from-pink-500 to-red-500 rounded-full shadow-xl shadow-pink-500/40 text-white text-3xl flex items-center justify-center hover:scale-110 transition-all"><i className="fas fa-heart"></i></button>
            </div>
        )}

        {/* --- LIKE WITH MESSAGE MODAL --- */}
        {showLikeModal && pendingCandidate && (
            <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white w-full max-w-sm rounded-[30px] p-6 text-center shadow-2xl">
                    <img src={pendingCandidate.photoURL} className={`w-20 h-20 rounded-full mx-auto mb-4 object-cover border-4 border-pink-100 ${isBlindDate ? 'blur-md' : ''}`} />
                    <h3 className="text-xl font-black text-dark mb-1">Like {isBlindDate ? pendingCandidate.mysteryName : pendingCandidate.displayName}?</h3>
                    <p className="text-gray-500 text-sm mb-6">Make your move memorable.</p>
                    
                    {/* Custom Input */}
                    <textarea 
                        value={customMessage} 
                        onChange={e => setCustomMessage(e.target.value)} 
                        placeholder="Say something nice..." 
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm mb-4 focus:ring-2 focus:ring-pink-200 outline-none resize-none" 
                        rows="2"
                    ></textarea>

                    {/* Quick Picks */}
                    <div className="flex flex-wrap gap-2 justify-center mb-6">
                        {QUICK_MESSAGES.map((msg, i) => (
                            <button key={i} onClick={() => setCustomMessage(msg)} className="text-[10px] bg-pink-50 text-pink-600 px-3 py-1 rounded-full hover:bg-pink-100 font-bold border border-pink-100">{msg}</button>
                        ))}
                    </div>

                    <div className="flex gap-3">
                        <button onClick={() => confirmLike(null)} className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50">Just Like</button>
                        <button onClick={() => confirmLike(customMessage)} className="flex-1 bg-pink-500 text-white py-3 rounded-xl font-bold hover:bg-pink-600 shadow-lg shadow-pink-200">Send & Like</button>
                    </div>
                </div>
            </div>
        )}

        {/* --- MATCH MODAL --- */}
        {showMatchModal && matchedUser && (
            <div className="fixed inset-0 z-[10000] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 animate-pop-in text-center">
                <div className="relative w-full max-w-md">
                    <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-yellow-400 italic mb-12 transform -rotate-6">It's a Match!</h1>
                    <div className="flex items-center justify-center gap-4 mb-12">
                        <div className="w-28 h-28 rounded-full border-4 border-white shadow-[0_0_30px_rgba(255,255,255,0.3)] overflow-hidden transform -translate-x-4"><img src={profile.photoURL} className="w-full h-full object-cover" /></div>
                        <div className="w-12 h-12 rounded-full bg-white text-pink-500 flex items-center justify-center text-xl absolute z-10 shadow-lg"><i className="fas fa-heart"></i></div>
                        <div className="w-28 h-28 rounded-full border-4 border-white shadow-[0_0_30px_rgba(255,255,255,0.3)] overflow-hidden transform translate-x-4"><img src={matchedUser.photoURL} className="w-full h-full object-cover" /></div>
                    </div>
                    <p className="text-white/90 text-xl font-medium mb-8">You and <span className="font-bold text-white">{matchedUser.displayName}</span> like each other.</p>
                    <div className="space-y-4">
                        <button onClick={() => navigate('/messages', { state: { startChatWith: matchedUser } })} className="w-full bg-white text-pink-600 font-black text-lg py-4 rounded-2xl shadow-xl hover:scale-105 transition-transform flex items-center justify-center gap-2"><i className="fas fa-comment-alt"></i> Say Hello</button>
                        <button onClick={() => setShowMatchModal(false)} className="w-full bg-white/10 text-white font-bold py-4 rounded-2xl hover:bg-white/20 transition-colors">Keep Swiping</button>
                    </div>
                </div>
            </div>
        )}

        {showFilterModal && <DatingFilterModal currentFilters={filters} onClose={() => setShowFilterModal(false)} onApply={(newFilters) => { setFilters(newFilters); loadCandidates(user.uid, newFilters); }} />}
    </div>
  );
};

export default Dating;