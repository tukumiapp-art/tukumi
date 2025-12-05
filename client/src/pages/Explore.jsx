import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../api/firebase';
import { collection, query, limit, getDocs } from 'firebase/firestore';
import TopBar from '../components/TopBar';

const Explore = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // "Funny" Gradients
  const gradients = [
      'from-[#FF9A9E] to-[#FECFEF]',
      'from-[#a18cd1] to-[#fbc2eb]',
      'from-[#84fab0] to-[#8fd3f4]',
      'from-[#e0c3fc] to-[#8ec5fc]',
      'from-[#ffecd2] to-[#fcb69f]',
      'from-[#ff9a9e] to-[#fecfef]',
      'from-[#f6d365] to-[#fda085]',
      'from-[#a8edea] to-[#fed6e3]'
  ];

  useEffect(() => {
     const fetchUsers = async () => {
         try {
             // Fetch a batch of users (in a real app, use pagination or random selection)
             const q = query(collection(db, 'users'), limit(20));
             const snap = await getDocs(q);
             const currentUser = auth.currentUser?.uid;
             
             const fetchedUsers = snap.docs
                .map(d => d.data())
                .filter(u => u.uid !== currentUser); // Exclude self

             setUsers(fetchedUsers);
         } catch (e) {
             console.error(e);
         } finally {
             setLoading(false);
         }
     };
     fetchUsers();
  }, []);

  return (
    <div className="p-4 md:p-6 w-full max-w-[1400px] mx-auto">
      <div className="hidden md:block"><TopBar /></div>
      
      <div className="mb-8 text-center md:text-left">
        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 mb-2 animate-pulse">
            Explore Tukumi
        </h1>
        <p className="text-gray-500 font-bold">Discover interesting people & colorful souls.</p>
      </div>

      {loading ? (
          /* Updated Skeleton for 3-column mobile grid */
          <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6">
              {[1,2,3,4,5,6].map(n => <div key={n} className="h-40 md:h-64 bg-gray-100 rounded-2xl md:rounded-[30px] animate-pulse"></div>)}
          </div>
      ) : (
          /* Updated Grid: grid-cols-3 for mobile, gap-3 for tighter spacing */
          <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6">
              {users.map((user, index) => {
                  // Pick a random gradient based on index
                  const gradient = gradients[index % gradients.length];
                  
                  return (
                      <div 
                        key={user.uid} 
                        onClick={() => navigate(`/profile/${user.uid}`)}
                        className={`relative h-44 md:h-80 rounded-2xl md:rounded-[35px] p-2 md:p-6 flex flex-col items-center justify-between shadow-md md:shadow-xl hover:shadow-2xl hover:scale-105 transition-all cursor-pointer overflow-hidden group bg-gradient-to-br ${gradient}`}
                      >
                          {/* Floating Shapes Decoration - Scaled down */}
                          <div className="absolute top-[-10px] md:top-[-20px] right-[-10px] md:right-[-20px] w-12 md:w-24 h-12 md:h-24 bg-white/20 rounded-full blur-xl"></div>
                          <div className="absolute bottom-[-10px] md:bottom-[-20px] left-[-10px] md:left-[-20px] w-16 md:w-32 h-16 md:h-32 bg-white/20 rounded-full blur-xl"></div>

                          {/* Avatar - Smaller on mobile */}
                          <div className="relative z-10 bg-white p-0.5 md:p-1 rounded-full shadow-lg mt-2 md:mt-4">
                              <img 
                                src={user.photoURL || "https://via.placeholder.com/150"} 
                                className="w-12 h-12 md:w-24 md:h-24 rounded-full object-cover border-2 md:border-4 border-white" 
                                alt={user.displayName} 
                              />
                          </div>

                          {/* Text Info - Smaller font sizes for mobile */}
                          <div className="relative z-10 text-center mb-1 md:mb-4 w-full">
                              <h3 className="font-black text-dark text-[10px] md:text-xl mb-0.5 md:mb-1 drop-shadow-sm truncate w-full px-1">{user.displayName}</h3>
                              <p className="text-dark/60 font-bold text-[8px] md:text-sm uppercase tracking-wider truncate w-full px-1">@{user.handle}</p>
                              
                              <div className="mt-1 md:mt-3 bg-white/40 backdrop-blur-md rounded-lg md:rounded-xl px-2 md:px-4 py-0.5 md:py-2 text-[7px] md:text-xs font-bold text-dark/80 shadow-sm inline-block max-w-full truncate">
                                  {user.profession || "Creator"}
                              </div>
                          </div>

                          {/* Button hidden on mobile to save space */}
                          <button className="hidden md:block w-full bg-white text-dark font-bold py-3 rounded-2xl shadow-lg opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                              View Profile
                          </button>
                      </div>
                  );
              })}
          </div>
      )}
      
      {users.length === 0 && !loading && (
          <div className="text-center py-20 text-gray-400">No users found to explore.</div>
      )}
    </div>
  );
};

export default Explore;