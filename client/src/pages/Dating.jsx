import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../api/firebase';
import { 
  collection, query, where, getDocs, doc, updateDoc, 
  serverTimestamp, setDoc, getDoc 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import TopBar from '../components/TopBar';
import DatingFilterModal from '../components/DatingFilterModal';

// --- HELPER: Avatar ---
const Avatar = ({ src, name, size = "md", className = "" }) => {
  const initials = name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
  const sizeClasses = { sm: "w-8 h-8 text-xs", md: "w-12 h-12 text-sm", lg: "w-16 h-16 text-xl", xl: "w-32 h-32 text-4xl" };
  if (src && !src.includes('via.placeholder')) return <img src={src} className={`${sizeClasses[size]} rounded-full object-cover border-2 border-white shadow-md ${className}`} alt={name} />;
  return <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-tr from-pink-500 to-red-500 text-white flex items-center justify-center font-bold shadow-md ${className}`}>{initials}</div>;
};

const Dating = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Match Modal State
  const [matchedUser, setMatchedUser] = useState(null);

  // Filter State
  const [showFilterModal, setShowFilterModal] = useState(false);
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
        const querySnapshot = await getDocs(q);
        let allUsers = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        allUsers = allUsers.filter(u => {
            if (u.id === myUid) return false;
            if (activeFilters.gender !== 'Everyone') {
                const targetGender = activeFilters.gender === 'Men' ? 'Male' : 'Female';
                if (u.gender !== targetGender) return false;
            }
            let age = u.age || 25; 
            if (u.birthday) {
                const birthDate = new Date(u.birthday);
                const diff = Date.now() - birthDate.getTime();
                age = Math.abs(new Date(diff).getUTCFullYear() - 1970);
            }
            if (age < activeFilters.ageRange[0] || age > activeFilters.ageRange[1]) return false;
            if (activeFilters.location && (!u.location || !u.location.toLowerCase().includes(activeFilters.location.toLowerCase()))) return false;
            if (activeFilters.profession && (!u.profession || !u.profession.toLowerCase().includes(activeFilters.profession.toLowerCase()))) return false;
            return true;
        });
        setCandidates(allUsers);
        setCurrentIndex(0);
    } catch (error) { console.error("Error loading candidates:", error); } finally { setLoading(false); }
  };

  const activateDating = async () => {
      if (!user) return;
      setLoading(true);
      await updateDoc(doc(db, 'users', user.uid), { isDatingActive: true });
      setProfile({ ...profile, isDatingActive: true });
      loadCandidates(user.uid, filters);
  };

  // --- NEW FUNCTION: Deactivate Dating ---
  const deactivateDating = async () => {
      if (!user) return;
      if (window.confirm("Are you sure? Your dating profile will be hidden from others.")) {
          setLoading(true);
          await updateDoc(doc(db, 'users', user.uid), { isDatingActive: false });
          setProfile({ ...profile, isDatingActive: false });
          setShowFilterModal(false); // Close modal
          setLoading(false);
      }
  };

  const handleSwipe = async (direction, candidate) => {
      const swipeData = { from: user.uid, to: candidate.id, type: direction, timestamp: serverTimestamp() };
      await setDoc(doc(db, 'dating_swipes', `${user.uid}_${candidate.id}`), swipeData);
      if (direction === 'like') {
          const reverseSwipeRef = doc(db, 'dating_swipes', `${candidate.id}_${user.uid}`);
          const reverseSnap = await getDoc(reverseSwipeRef);
          if (reverseSnap.exists() && reverseSnap.data().type === 'like') handleMatch(candidate);
      }
      setCurrentIndex(prev => prev + 1);
  };

  const handleMatch = async (candidate) => {
      setMatchedUser(candidate);
      const chatId = [user.uid, candidate.id].sort().join('_');
      await setDoc(doc(db, 'conversations', chatId), {
          participants: [user.uid, candidate.id],
          users: [
              { uid: user.uid, displayName: profile.displayName, photoURL: profile.photoURL },
              { uid: candidate.id, displayName: candidate.displayName, photoURL: candidate.photoURL }
          ],
          lastMessage: "It's a Match! Say hello! 👋",
          updatedAt: serverTimestamp(),
          isMatch: true 
      }, { merge: true });
  };

  if (loading) return <div className="flex h-screen items-center justify-center text-pink-500 font-bold animate-pulse">Updating Dating Profile...</div>;

  if (!profile?.isDatingActive) {
      return (
        <div className="p-4 md:p-6 w-full max-w-[1400px] mx-auto">
            <div className="hidden md:block"><TopBar /></div>
            <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-8 bg-white rounded-[40px] shadow-sm border border-pink-100 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-pink-50 to-transparent opacity-50 pointer-events-none"></div>
                <div className="relative z-10 animate-fade-in max-w-lg">
                    <div className="w-24 h-24 bg-gradient-to-tr from-pink-500 to-red-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-pink-200 rotate-3">
                        <i className="fas fa-heart text-5xl text-white drop-shadow-md"></i>
                    </div>
                    <h1 className="text-4xl font-black text-dark mb-4">Tukumi Dating</h1>
                    <p className="text-gray-500 text-lg mb-8">Join the exclusive circle. Activate dating to find matches.</p>
                    <button onClick={activateDating} className="bg-gradient-to-r from-pink-500 to-red-500 text-white px-10 py-4 rounded-2xl font-bold shadow-lg hover:scale-105 transition-transform">Start Dating</button>
                </div>
            </div>
        </div>
      );
  }

  return (
    <div className="p-0 md:p-6 w-full max-w-[1400px] mx-auto pb-24 relative">
        <div className="hidden md:block"><TopBar /></div>
        
        <div className="flex justify-between items-center px-6 py-4 md:px-0 mb-4">
            <div className="flex items-center gap-2 text-pink-600">
                <i className="fas fa-fire text-2xl"></i>
                <span className="font-black text-xl tracking-tight">Discover</span>
            </div>
            <button 
                onClick={() => setShowFilterModal(true)} 
                className="w-10 h-10 bg-white rounded-xl shadow-sm border border-gray-100 text-gray-500 flex items-center justify-center hover:text-pink-500 hover:border-pink-200 transition-all"
            >
                <i className="fas fa-sliders-h text-lg"></i>
            </button>
        </div>

        <div className="flex flex-col items-center max-w-md mx-auto min-h-[60vh] justify-center">
            {currentIndex < candidates.length ? (
                <div className="w-full aspect-[3/4] bg-white rounded-[30px] shadow-2xl overflow-hidden relative group border-4 border-white animate-pop-in">
                    <img 
                        src={candidates[currentIndex].photoURL || "https://images.unsplash.com/photo-1534528741775-53994a69daeb"} 
                        className="w-full h-full object-cover" 
                        alt={candidates[currentIndex].displayName}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-6">
                        <h2 className="text-3xl font-black text-white flex items-center gap-2">
                            {candidates[currentIndex].displayName}, <span className="text-2xl font-normal opacity-90">{candidates[currentIndex].age || 24}</span>
                        </h2>
                        <p className="text-white/90 font-medium mt-1 flex items-center gap-2"><i className="fas fa-briefcase text-pink-400"></i> {candidates[currentIndex].profession || 'Undisclosed'}</p>
                        {candidates[currentIndex].location && <p className="text-white/70 text-sm mt-1 flex items-center gap-2"><i className="fas fa-map-marker-alt"></i> {candidates[currentIndex].location}</p>}
                    </div>
                </div>
            ) : (
                <div className="text-center p-10">
                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300 text-4xl animate-pulse"><i className="fas fa-search"></i></div>
                    <h2 className="text-2xl font-bold text-dark">No more matches</h2>
                    <p className="text-gray-500 mt-2 mb-6">Try adjusting your filters to see more people.</p>
                    <button onClick={() => setShowFilterModal(true)} className="text-pink-500 font-bold hover:underline">Change Filters</button>
                </div>
            )}

            {currentIndex < candidates.length && (
                <div className="flex items-center gap-6 mt-8">
                    <button onClick={() => handleSwipe('pass', candidates[currentIndex])} className="w-16 h-16 rounded-full bg-white text-gray-400 shadow-lg flex items-center justify-center text-2xl transition-all hover:bg-red-50 hover:text-red-500 hover:scale-110"><i className="fas fa-times"></i></button>
                    <button className="w-12 h-12 rounded-full bg-white text-blue-400 shadow-md flex items-center justify-center text-lg"><i className="fas fa-star"></i></button>
                    <button onClick={() => handleSwipe('like', candidates[currentIndex])} className="w-16 h-16 rounded-full bg-gradient-to-tr from-pink-500 to-red-500 text-white shadow-xl shadow-pink-500/30 flex items-center justify-center text-2xl transition-all hover:scale-110"><i className="fas fa-heart"></i></button>
                </div>
            )}
        </div>

        {matchedUser && (
            <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-4 animate-pop-in">
                <div className="text-center">
                    <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-yellow-500 mb-8 italic transform -rotate-6">It's a Match!</h1>
                    <div className="flex items-center justify-center gap-6 mb-10">
                        <div className="w-24 h-24 rounded-full border-4 border-white shadow-2xl overflow-hidden"><img src={profile.photoURL} className="w-full h-full object-cover" /></div>
                        <div className="w-24 h-24 rounded-full border-4 border-white shadow-2xl overflow-hidden"><img src={matchedUser.photoURL} className="w-full h-full object-cover" /></div>
                    </div>
                    <p className="text-white/80 text-lg mb-8">You and {matchedUser.displayName} liked each other.</p>
                    <div className="space-y-3 w-full max-w-xs mx-auto">
                        <button onClick={() => navigate('/messages', { state: { startChatWith: matchedUser } })} className="w-full bg-white text-pink-600 font-bold py-4 rounded-xl shadow-lg hover:bg-gray-50 transition-all">Message Now</button>
                        <button onClick={() => setMatchedUser(null)} className="w-full bg-transparent border-2 border-white text-white font-bold py-4 rounded-xl hover:bg-white/10 transition-all">Keep Swiping</button>
                    </div>
                </div>
            </div>
        )}

        {showFilterModal && (
            <DatingFilterModal 
                currentFilters={filters} 
                onClose={() => setShowFilterModal(false)} 
                onApply={(newFilters) => {
                    setFilters(newFilters);
                    loadCandidates(user.uid, newFilters);
                }}
                onDeactivate={deactivateDating} // <--- PASSING THE FUNCTION HERE
            />
        )}
    </div>
  );
};

export default Dating;