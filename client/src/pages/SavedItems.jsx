import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../api/firebase';
import { doc, getDoc, updateDoc, arrayRemove } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import TopBar from '../components/TopBar';

const SavedItems = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('posts'); // 'posts' or 'products'
  
  const [savedPosts, setSavedPosts] = useState([]);
  const [savedProducts, setSavedProducts] = useState([]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await fetchSavedItems(currentUser.uid);
      } else {
        setLoading(false);
      }
    });
    return () => unsubAuth();
  }, []);

  const fetchSavedItems = async (uid) => {
    try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            const postIds = userData.savedPosts || [];
            const productIds = userData.savedProducts || [];

            // Fetch Posts
            if (postIds.length > 0) {
                const postPromises = postIds.map(id => getDoc(doc(db, 'posts', id)));
                const postSnaps = await Promise.all(postPromises);
                setSavedPosts(postSnaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() })));
            } else {
                setSavedPosts([]);
            }

            // Fetch Products
            if (productIds.length > 0) {
                const prodPromises = productIds.map(id => getDoc(doc(db, 'marketplace', id)));
                const prodSnaps = await Promise.all(prodPromises);
                setSavedProducts(prodSnaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() })));
            } else {
                setSavedProducts([]);
            }
        }
    } catch (e) {
        console.error("Error fetching saved items:", e);
    } finally {
        setLoading(false);
    }
  };

  const handleUnsave = async (e, collectionName, itemId) => {
      e.stopPropagation();
      if (!confirm("Remove from saved?")) return;
      
      try {
          const field = collectionName === 'posts' ? 'savedPosts' : 'savedProducts';
          await updateDoc(doc(db, 'users', user.uid), {
              [field]: arrayRemove(itemId)
          });
          
          // UI Update
          if (collectionName === 'posts') {
              setSavedPosts(prev => prev.filter(i => i.id !== itemId));
          } else {
              setSavedProducts(prev => prev.filter(i => i.id !== itemId));
          }
      } catch (err) {
          console.error("Error unsaving:", err);
      }
  };

  if (loading) return <div className="p-10 text-center text-gray-400">Loading saved items...</div>;

  return (
    <div className="p-4 md:p-6 w-full max-w-[1000px] mx-auto pb-24">
      <div className="hidden md:block"><TopBar /></div>
      
      <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="md:hidden w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-dark">
            <i className="fas fa-arrow-left"></i>
          </button>
          <h1 className="text-2xl font-black text-dark">Saved Collection</h1>
      </div>

      {/* Tabs */}
      <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-gray-100 mb-6 max-w-md">
         <button onClick={() => setActiveTab('posts')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'posts' ? 'bg-dark text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>
            Posts & Videos
         </button>
         <button onClick={() => setActiveTab('products')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'products' ? 'bg-dark text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>
            Products
         </button>
      </div>

      {/* Content */}
      <div className="space-y-4">
          {activeTab === 'posts' && (
              savedPosts.length === 0 ? (
                  <div className="text-center py-20 text-gray-400">No saved posts yet.</div>
              ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {savedPosts.map(post => (
                          <div key={post.id} onClick={() => navigate(`/post/${post.id}`)} className="bg-white rounded-[20px] p-3 shadow-sm border border-gray-50 cursor-pointer group hover:shadow-md transition-all">
                              {post.mediaURL ? (
                                  <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 relative mb-3">
                                      {post.mediaType === 'video' ? <video src={post.mediaURL} className="w-full h-full object-cover" /> : <img src={post.mediaURL} className="w-full h-full object-cover" />}
                                      <div className="absolute top-2 right-2">
                                          <button onClick={(e) => handleUnsave(e, 'posts', post.id)} className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center text-red-500 shadow-sm hover:bg-red-50"><i className="fas fa-trash text-xs"></i></button>
                                      </div>
                                      {post.mediaType === 'video' && <div className="absolute inset-0 flex items-center justify-center"><i className="fas fa-play text-white text-3xl drop-shadow-lg"></i></div>}
                                  </div>
                              ) : (
                                  <div className="aspect-square rounded-xl bg-gray-50 p-4 flex items-center justify-center text-center text-xs text-gray-500 relative mb-3">
                                      "{post.text.slice(0, 100)}..."
                                      <button onClick={(e) => handleUnsave(e, 'posts', post.id)} className="absolute top-2 right-2 w-8 h-8 bg-white rounded-full flex items-center justify-center text-red-500 shadow-sm"><i className="fas fa-trash text-xs"></i></button>
                                  </div>
                              )}
                              <h4 className="font-bold text-sm text-dark truncate px-1">{post.userName}</h4>
                              <p className="text-xs text-gray-400 px-1 truncate">{post.text}</p>
                          </div>
                      ))}
                  </div>
              )
          )}

          {activeTab === 'products' && (
              savedProducts.length === 0 ? (
                  <div className="text-center py-20 text-gray-400">No saved products yet.</div>
              ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {savedProducts.map(prod => (
                          <div key={prod.id} onClick={() => navigate(`/product/${prod.id}`)} className="bg-white rounded-[20px] p-3 shadow-sm border border-gray-50 cursor-pointer group hover:shadow-md transition-all">
                              <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 relative mb-3">
                                  <img src={prod.image} className="w-full h-full object-cover" alt={prod.title} />
                                  <button onClick={(e) => handleUnsave(e, 'marketplace', prod.id)} className="absolute top-2 right-2 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center text-red-500 shadow-sm hover:bg-red-50"><i className="fas fa-trash text-xs"></i></button>
                              </div>
                              <h4 className="font-bold text-sm text-dark truncate px-1">{prod.title}</h4>
                              <p className="text-primary font-black text-xs px-1">{prod.currency} {prod.price}</p>
                          </div>
                      ))}
                  </div>
              )
          )}
      </div>
    </div>
  );
};

export default SavedItems;