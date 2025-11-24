import React, { useState, useEffect } from 'react';
import { db, auth } from '../api/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';

const SavedItems = () => {
  const navigate = useNavigate();
  const [savedProducts, setSavedProducts] = useState([]);
  const [savedPosts, setSavedPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('products'); // 'products' or 'posts'

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            
            // 1. Fetch Products
            const savedProductIds = data.savedProducts || [];
            const products = await Promise.all(savedProductIds.map(async (id) => {
                const pSnap = await getDoc(doc(db, 'marketplace', id));
                return pSnap.exists() ? { id: pSnap.id, ...pSnap.data() } : null;
            }));
            setSavedProducts(products.filter(p => p !== null));

            // 2. Fetch Posts
            const savedPostIds = data.savedPosts || [];
            const posts = await Promise.all(savedPostIds.map(async (id) => {
                const pSnap = await getDoc(doc(db, 'posts', id));
                return pSnap.exists() ? { id: pSnap.id, ...pSnap.data() } : null;
            }));
            setSavedPosts(posts.filter(p => p !== null));
        }
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  return (
    <div className="p-4 md:p-6 w-full max-w-[1400px] mx-auto">
        <TopBar />
        
        <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-500"><i className="fas fa-bookmark"></i></div>
            <h1 className="text-3xl font-black text-dark">Saved Items</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-gray-200 mb-8">
            <button 
                onClick={() => setActiveTab('products')} 
                className={`pb-4 font-bold text-sm transition-all border-b-2 ${activeTab === 'products' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-dark'}`}
            >
                Products ({savedProducts.length})
            </button>
            <button 
                onClick={() => setActiveTab('posts')} 
                className={`pb-4 font-bold text-sm transition-all border-b-2 ${activeTab === 'posts' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-dark'}`}
            >
                Posts ({savedPosts.length})
            </button>
        </div>

        {loading ? <div>Loading...</div> : (
            <>
                {/* PRODUCTS GRID */}
                {activeTab === 'products' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {savedProducts.map(item => (
                            <div key={item.id} onClick={() => navigate(`/product/${item.id}`)} className="bg-white rounded-[24px] overflow-hidden shadow-sm cursor-pointer group hover:shadow-lg transition-all">
                                <div className="h-48 overflow-hidden">
                                    <img src={item.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt={item.title} />
                                </div>
                                <div className="p-4">
                                    <h3 className="font-bold text-dark truncate">{item.title}</h3>
                                    <p className="text-primary font-black text-sm mt-1">{item.currency === 'BDT' ? '৳' : item.currency} {item.price}</p>
                                </div>
                            </div>
                        ))}
                        {savedProducts.length === 0 && <div className="col-span-full text-center py-20 text-gray-400">No saved products.</div>}
                    </div>
                )}

                {/* POSTS LIST */}
                {activeTab === 'posts' && (
                    <div className="space-y-4 max-w-3xl">
                        {savedPosts.map(post => (
                            <div key={post.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex gap-4 items-start cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/profile/${post.uid}`)}>
                                {post.mediaURL ? (
                                    <div className="w-24 h-24 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden">
                                        {post.mediaType === 'video' ? (
                                            <div className="w-full h-full flex items-center justify-center bg-black text-white"><i className="fas fa-play"></i></div>
                                        ) : (
                                            <img src={post.mediaURL} className="w-full h-full object-cover" alt="Post media" />
                                        )}
                                    </div>
                                ) : (
                                    <div className="w-24 h-24 rounded-xl bg-primary/5 flex-shrink-0 flex items-center justify-center text-primary text-2xl">
                                        <i className="fas fa-quote-right"></i>
                                    </div>
                                )}
                                
                                <div className="flex-1 min-w-0 py-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <img src={post.userAvatar || "https://via.placeholder.com/50"} className="w-5 h-5 rounded-full" alt={post.userName} />
                                        <span className="text-xs font-bold text-gray-500">{post.userName}</span>
                                        <span className="text-xs text-gray-300">• {post.timestamp?.seconds ? new Date(post.timestamp.seconds * 1000).toLocaleDateString() : ''}</span>
                                    </div>
                                    <p className="text-dark font-medium line-clamp-2 text-sm">{post.text}</p>
                                    <div className="mt-3 flex gap-4 text-xs font-bold text-gray-400">
                                        <span><i className="fas fa-heart mr-1"></i> {post.likes || 0}</span>
                                        <span><i className="fas fa-comment mr-1"></i> {post.comments || 0}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {savedPosts.length === 0 && <div className="text-center py-20 text-gray-400">No saved posts.</div>}
                    </div>
                )}
            </>
        )}
    </div>
  );
};
export default SavedItems;