import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../api/firebase';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';

const SearchModal = ({ onClose }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // all, people, business, products, circles, videos
  const [results, setResults] = useState({ 
      people: [], 
      business: [], 
      products: [], 
      circles: [], 
      videos: [] 
  });
  const [loading, setLoading] = useState(false);

  // Debounce search
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchTerm.trim().length > 1) {
        performSearch();
      } else {
        setResults({ people: [], business: [], products: [], circles: [], videos: [] });
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const performSearch = async () => {
    setLoading(true);
    const term = searchTerm.toLowerCase();
    const isHandleSearch = term.startsWith('@');
    const cleanTerm = isHandleSearch ? term.substring(1) : term;
    
    // Helper for prefix search (case-sensitive in Firestore, so this is basic)
    const prefixQuery = (ref, field, value) => query(
        ref, 
        where(field, '>=', value), 
        where(field, '<=', value + '\uf8ff'),
        limit(5)
    );

    let newResults = { people: [], business: [], products: [], circles: [], videos: [] };

    try {
      // 1. SEARCH PEOPLE
      if (isHandleSearch) {
        const qUsers = prefixQuery(collection(db, 'users'), 'handle', cleanTerm);
        const snap = await getDocs(qUsers);
        newResults.people = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } else {
        const qUsers = prefixQuery(collection(db, 'users'), 'displayName', searchTerm);
        const snap = await getDocs(qUsers);
        newResults.people = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      if (!isHandleSearch) {
          // 2. SEARCH BUSINESS PAGES
          const qBiz = prefixQuery(collection(db, 'business_pages'), 'name', searchTerm);
          const snapBiz = await getDocs(qBiz);
          newResults.business = snapBiz.docs.map(d => ({ id: d.id, ...d.data() }));

          // 3. SEARCH PRODUCTS
          const qProd = prefixQuery(collection(db, 'marketplace'), 'title', searchTerm);
          const snapProd = await getDocs(qProd);
          newResults.products = snapProd.docs.map(d => ({ id: d.id, ...d.data() }));

          // 4. SEARCH CIRCLES
          const qCircles = prefixQuery(collection(db, 'circles'), 'name', searchTerm);
          const snapCircles = await getDocs(qCircles);
          newResults.circles = snapCircles.docs.map(d => ({ id: d.id, ...d.data() }));

          // 5. SEARCH VIDEOS (Client-side filter for demo)
          const qVideos = query(collection(db, 'posts'), where('mediaType', '==', 'video'), orderBy('timestamp', 'desc'), limit(20));
          const snapVideos = await getDocs(qVideos);
          newResults.videos = snapVideos.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(v => v.text?.toLowerCase().includes(term));
      }

      setResults(newResults);

    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (path) => {
      navigate(path);
      onClose();
  };

  return (
    <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-start justify-center z-[9999] p-4 pt-20 animate-fade-in cursor-pointer"
        onClick={onClose} /* <--- CLICK OUTSIDE TO CLOSE */
    >
      <div 
        className="bg-white w-full max-w-3xl rounded-[30px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] cursor-default"
        onClick={(e) => e.stopPropagation()} /* <--- PREVENT CLOSING WHEN CLICKING INSIDE */
      >
        
        {/* Header & Input */}
        <div className="p-4 border-b border-gray-100 bg-[#F8FAFD]">
            <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-gray-200 shadow-sm focus-within:ring-2 ring-primary/20 transition-all">
                <i className="fas fa-search text-gray-400 text-xl ml-2"></i>
                <input 
                    autoFocus
                    type="text" 
                    placeholder="Search Products, Business, People..." 
                    className="flex-1 bg-transparent outline-none text-lg font-medium text-dark placeholder-gray-400"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && <button onClick={() => setSearchTerm('')} className="text-gray-400 hover:text-dark"><i className="fas fa-times-circle"></i></button>}
            </div>
            
            {/* Tabs */}
            <div className="flex gap-6 mt-4 px-2 overflow-x-auto no-scrollbar">
                {['all', 'products', 'business', 'people', 'circles', 'videos'].map(tab => (
                    <button 
                        key={tab} 
                        onClick={() => setActiveTab(tab)}
                        className={`pb-2 font-bold text-sm capitalize border-b-2 transition-all whitespace-nowrap ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-dark'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-4 bg-white min-h-[300px]">
            {loading ? (
                <div className="text-center py-10 text-gray-400"><i className="fas fa-circle-notch fa-spin text-2xl"></i><p className="mt-2 text-xs font-bold">Searching...</p></div>
            ) : (searchTerm.length < 2) ? (
                <div className="text-center py-20 text-gray-300">
                    <i className="fas fa-search text-4xl mb-4"></i>
                    <p>Find products, businesses, or friends.</p>
                </div>
            ) : (
                <div className="space-y-8">
                    
                    {/* --- PRODUCTS RESULTS --- */}
                    {(activeTab === 'all' || activeTab === 'products') && results.products.length > 0 && (
                        <section>
                            <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-wider">Products</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {results.products.map(p => (
                                    <div key={p.id} onClick={() => handleNavigate(`/product/${p.id}`)} className="bg-white border border-gray-100 rounded-xl p-2 cursor-pointer hover:shadow-md transition-all flex flex-col">
                                        <img src={p.image} className="w-full h-24 object-cover rounded-lg mb-2 bg-gray-100" alt={p.title} />
                                        <h5 className="font-bold text-sm text-dark truncate">{p.title}</h5>
                                        <p className="text-primary font-black text-xs">{p.currency === 'BDT' ? '৳' : p.currency}{p.price}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* --- BUSINESS RESULTS --- */}
                    {(activeTab === 'all' || activeTab === 'business') && results.business.length > 0 && (
                        <section>
                            <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-wider">Businesses</h4>
                            <div className="space-y-2">
                                {results.business.map(biz => (
                                    <div key={biz.id} onClick={() => handleNavigate(`/business/${biz.id}`)} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-2xl cursor-pointer transition-colors border border-transparent hover:border-gray-100">
                                        <img src={biz.logo} className="w-12 h-12 rounded-xl object-cover shadow-sm" alt={biz.name} />
                                        <div className="flex-1">
                                            <h5 className="font-bold text-dark flex items-center gap-1">
                                                {biz.name} 
                                                {biz.isVerified && <i className="fas fa-check-circle text-blue-500 text-xs"></i>}
                                            </h5>
                                            <p className="text-xs text-gray-500 font-bold">{biz.category}</p>
                                        </div>
                                        <button className="text-xs bg-white border border-gray-200 px-3 py-1 rounded-full font-bold hover:bg-dark hover:text-white transition-colors">Visit</button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* --- PEOPLE RESULTS --- */}
                    {(activeTab === 'all' || activeTab === 'people') && results.people.length > 0 && (
                        <section>
                            <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-wider">People</h4>
                            <div className="space-y-2">
                                {results.people.map(user => (
                                    <div key={user.id} onClick={() => handleNavigate(`/profile/${user.id}`)} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-2xl cursor-pointer transition-colors">
                                        <img src={user.photoURL || "https://via.placeholder.com/150"} className="w-10 h-10 rounded-full object-cover border border-gray-100" alt={user.displayName} />
                                        <div>
                                            <h5 className="font-bold text-dark text-sm">{user.displayName}</h5>
                                            <p className="text-xs text-gray-500 font-bold">@{user.handle || 'user'}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* --- CIRCLES RESULTS --- */}
                    {(activeTab === 'all' || activeTab === 'circles') && results.circles.length > 0 && (
                        <section>
                            <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-wider">Circles</h4>
                            <div className="space-y-2">
                                {results.circles.map(circle => (
                                    <div key={circle.id} onClick={() => handleNavigate(`/circles/${circle.id}`)} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-2xl cursor-pointer transition-colors">
                                        <img src={circle.image} className="w-10 h-10 rounded-xl object-cover" alt={circle.name} />
                                        <div>
                                            <h5 className="font-bold text-dark text-sm">{circle.name}</h5>
                                            <p className="text-xs text-gray-500">{circle.memberCount || 0} Members</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* --- VIDEOS RESULTS --- */}
                    {(activeTab === 'all' || activeTab === 'videos') && results.videos.length > 0 && (
                        <section>
                            <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-wider">Videos</h4>
                            <div className="grid grid-cols-2 gap-3">
                                {results.videos.map(video => (
                                    <div key={video.id} onClick={() => handleNavigate(`/watch`)} className="relative rounded-xl overflow-hidden aspect-video cursor-pointer group bg-black">
                                        <video src={video.mediaURL} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="w-8 h-8 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white"><i className="fas fa-play text-xs"></i></div>
                                        </div>
                                        <p className="absolute bottom-2 left-2 text-white text-[10px] font-bold truncate w-11/12 shadow-black drop-shadow-md">{video.text}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* NO RESULTS STATE */}
                    {Object.values(results).every(arr => arr.length === 0) && (
                        <div className="text-center py-10 text-gray-400">
                            <i className="far fa-folder-open text-2xl mb-2"></i>
                            <p>No results found for "{searchTerm}"</p>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 text-center">
            <button onClick={onClose} className="text-gray-500 font-bold text-sm hover:text-dark">Close Search</button>
        </div>

      </div>
    </div>
  );
};

export default SearchModal;