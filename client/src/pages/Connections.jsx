import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, auth } from '../api/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import TopBar from '../components/TopBar';

const Connections = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('followers'); // 'followers' or 'following'
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [targetUser, setTargetUser] = useState(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) navigate('/');
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Get Target User Info
        const userSnap = await getDoc(doc(db, 'users', id));
        if (userSnap.exists()) {
           setTargetUser(userSnap.data());
        }

        // 2. Get Connections (Followers or Following)
        // Note: 'followers' collection contains docs where ID is the follower's UID
        const colRef = collection(db, 'users', id, activeTab); 
        const snap = await getDocs(colRef);
        
        const userPromises = snap.docs.map(async (item) => {
            const uid = item.id; // The ID of the document is the UID of the user
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (userDoc.exists()) return userDoc.data();
            return null;
        });

        const usersData = await Promise.all(userPromises);
        setPeople(usersData.filter(u => u !== null));

      } catch (error) {
        console.error("Error fetching connections:", error);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchData();
  }, [id, activeTab]);

  return (
    <div className="p-4 md:p-6 w-full max-w-[1000px] mx-auto">
      <div className="hidden md:block"><TopBar /></div>
      
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate(-1)} className="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center text-dark hover:bg-gray-50">
            <i className="fas fa-arrow-left"></i>
          </button>
          <div>
            <h2 className="text-2xl font-black text-dark">{targetUser?.displayName || 'User'}</h2>
            <p className="text-gray-500 text-sm">@{targetUser?.handle || 'username'}</p>
          </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-gray-100 mb-6 max-w-md">
         <button 
            onClick={() => setActiveTab('followers')} 
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'followers' ? 'bg-dark text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
         >
            Followers
         </button>
         <button 
            onClick={() => setActiveTab('following')} 
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'following' ? 'bg-dark text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
         >
            Following
         </button>
      </div>

      {/* List */}
      <div className="bg-white rounded-[30px] shadow-sm min-h-[500px] p-6">
         {loading ? (
             <div className="text-center py-20 text-gray-400">Loading...</div>
         ) : people.length === 0 ? (
             <div className="text-center py-20">
                 <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300 text-2xl">
                    <i className="fas fa-users-slash"></i>
                 </div>
                 <p className="text-gray-500 font-bold">No {activeTab} found.</p>
             </div>
         ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {people.map(person => (
                     <div key={person.uid} onClick={() => navigate(`/profile/${person.uid}`)} className="flex items-center gap-4 p-4 rounded-2xl border border-gray-50 hover:bg-gray-50 hover:border-gray-200 cursor-pointer transition-all group">
                         <img src={person.photoURL || "https://via.placeholder.com/150"} className="w-14 h-14 rounded-xl object-cover shadow-sm" alt={person.displayName} />
                         <div className="flex-1 min-w-0">
                             <h4 className="font-bold text-dark truncate">{person.displayName}</h4>
                             <p className="text-xs text-gray-500 font-bold">@{person.handle}</p>
                             {person.profession && <p className="text-xs text-primary mt-1 truncate"><i className="fas fa-briefcase mr-1"></i> {person.profession}</p>}
                         </div>
                         <button className="w-10 h-10 rounded-full bg-white border border-gray-100 text-gray-400 flex items-center justify-center group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-colors shadow-sm">
                             <i className="fas fa-angle-right"></i>
                         </button>
                     </div>
                 ))}
             </div>
         )}
      </div>
    </div>
  );
};

export default Connections;