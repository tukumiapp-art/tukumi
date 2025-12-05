import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth, storage } from '../api/firebase';
import { 
  collection, query, orderBy, onSnapshot, 
  addDoc, serverTimestamp, doc, updateDoc, arrayUnion, deleteDoc, arrayRemove 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import TopBar from '../components/TopBar';

const Marketplace = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // --- VIEW STATE ---
  const [viewMode, setViewMode] = useState('browse'); // 'browse' or 'selling'
  const [category, setCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [savedProducts, setSavedProducts] = useState([]);

  // --- FORM STATE ---
  const [showSellModal, setShowSellModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentEditItem, setCurrentEditItem] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  const [newItem, setNewItem] = useState({
    title: '', price: '', currency: 'BDT', condition: 'New',
    description: '', category: 'Digital Products',
    location: 'Dhaka', address: '', stock: 1,
    shippingType: 'Shop Pickup', returnPolicy: 'No Return'
  });

  // Multiple Media State
  const [mediaFiles, setMediaFiles] = useState([]); 
  const [existingMedia, setExistingMedia] = useState([]); 
  const [activeMenuId, setActiveMenuId] = useState(null);

  const categories = [
    'All', 'Food & Beverage', 'Digital Products', 'Fashion & Apparel', 'Electronics & Gadgets', 
    'Home & Garden', 'Handmade & Crafts', 'Vehicles & Parts', 'Sports', 
    'Books', 'Baby & Kids', 'Beauty & Health', 'Real Estate', 'Services'
  ];
  
  const shippingOptions = ['Shop Pickup', 'Free Shipping', 'Collection Point', 'Local Delivery'];
  const returnPolicyOptions = ['No Return', '7 Days Return', '15 Days Return', '30 Days Return'];

  // --- DATA FETCHING ---
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (u) {
            const userRef = doc(db, 'users', u.uid);
            const unsubSaved = onSnapshot(userRef, (snap) => {
                if (snap.exists()) setSavedProducts(snap.data().savedProducts || []);
            });
            return () => unsubSaved();
        } else {
            setSavedProducts([]);
        }
    });

    const q = query(collection(db, 'marketplace'), orderBy('timestamp', 'desc'));
    const unsubItems = onSnapshot(q, (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    
    const handleClickOutside = (e) => {
        if (!e.target.closest('.menu-trigger')) setActiveMenuId(null);
    };
    document.addEventListener('click', handleClickOutside);

    return () => { unsubAuth(); unsubItems(); document.removeEventListener('click', handleClickOutside); };
  }, []);

  // --- HANDLERS (Create/Edit/Delete) ---
  const resetForm = () => {
    setNewItem({
        title: '', price: '', currency: 'BDT', condition: 'New',
        description: '', category: 'Digital Products',
        location: 'Dhaka', address: '', stock: 1, shippingType: 'Shop Pickup', returnPolicy: 'No Return'
    });
    setMediaFiles([]);
    setExistingMedia([]);
    setIsEditing(false);
    setCurrentEditItem(null);
  }

  const handleList = async (e) => {
    e.preventDefault();
    if (!user) return alert("Sign in required.");
    if (mediaFiles.length === 0 && existingMedia.length === 0) return alert("At least one photo/video required.");
    if (Number(newItem.price) <= 0) return alert("Price must be greater than zero.");

    setUploading(true);
    try {
        const newMediaUrls = await Promise.all(mediaFiles.map(async (file) => {
             const storageRef = ref(storage, `marketplace/${user.uid}/${Date.now()}_${file.name}`);
             await uploadBytes(storageRef, file);
             const url = await getDownloadURL(storageRef);
             return { url, type: file.type.startsWith('video') ? 'video' : 'image' };
        }));

        const formattedExisting = existingMedia.map(m => typeof m === 'string' ? { url: m, type: 'image' } : m);
        const finalMedia = [...formattedExisting, ...newMediaUrls];
        
        const dataToSave = {
            ...newItem,
            image: finalMedia[0]?.url || null, 
            media: finalMedia, 
            price: Number(newItem.price),
            boost: null, 
        };

        if (isEditing && currentEditItem) {
            await updateDoc(doc(db, 'marketplace', currentEditItem.id), dataToSave);
            alert("Item Updated Successfully!");
        } else {
            await addDoc(collection(db, 'marketplace'), {
                ...dataToSave,
                sellerId: user.uid,
                sellerName: user.displayName,
                sellerAvatar: user.photoURL,
                sellerVerified: user.isVerified || false, 
                timestamp: serverTimestamp(),
                sold: false, 
                reviews: [],
                questions: []
            });
            alert("Item Listed Successfully!");
            setViewMode('selling');
        }

        setShowSellModal(false);
        resetForm();
    } catch (err) { 
        console.error("Listing Error:", err); 
        alert(`Failed to ${isEditing ? 'update' : 'list'} item.`);
    } finally { setUploading(false); }
  };

  const handleEdit = (item) => {
    setNewItem({
        title: item.title,
        price: item.price.toString(), 
        currency: item.currency || 'BDT',
        condition: item.condition || 'New',
        description: item.description,
        category: item.category,
        location: item.location || 'Dhaka',
        address: item.address || '',
        stock: item.stock || 1,
        shippingType: item.shippingType || 'Shop Pickup',
        returnPolicy: item.returnPolicy || 'No Return',
    });
    const mediaList = Array.isArray(item.media) ? item.media : (item.image ? [{url: item.image, type: 'image'}] : []);
    setExistingMedia(mediaList);
    setMediaFiles([]);
    setCurrentEditItem(item);
    setIsEditing(true);
    setShowSellModal(true);
    setActiveMenuId(null);
  }

  const handleDelete = async (item) => {
    if (!user || !window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    try {
        await deleteDoc(doc(db, 'marketplace', item.id));
        alert("Product deleted.");
    } catch (error) { console.error(error); alert("Failed to delete."); }
  }

  const handleToggleSold = async (item) => {
    await updateDoc(doc(db, 'marketplace', item.id), { sold: !item.sold });
    setActiveMenuId(null);
  };

  const handleSave = async (e, item) => {
      e.stopPropagation(); 
      if(!user) return alert("Sign in to save.");
      const isCurrentlySaved = savedProducts.includes(item.id);
      const updateArray = isCurrentlySaved ? arrayRemove(item.id) : arrayUnion(item.id);
      await updateDoc(doc(db, 'users', user.uid), { savedProducts: updateArray });
  };

  const getDisplayedItems = () => {
      let filtered = items;
      if (viewMode === 'selling') {
          if (!user) return [];
          filtered = filtered.filter(item => item.sellerId === user.uid);
      } else {
          filtered = filtered.filter(item => 
            (category === 'All' || item.category === category) &&
            item.title.toLowerCase().includes(searchTerm.toLowerCase())
          );
      }
      return filtered;
  };

  const displayedItems = getDisplayedItems();

  return (
    <div className="p-4 md:p-6 w-full max-w-[1400px] mx-auto">
      <div className="hidden md:block"><TopBar /></div>
      
      {/* Header - Responsive */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
        <div>
          <h2 className="text-3xl font-black text-dark tracking-tight flex items-center gap-2">
            <i className="fas fa-store text-primary"></i> Marketplace
          </h2>
          <p className="text-gray-500 font-medium text-sm md:text-base">Buy & Sell everything.</p>
        </div>
        <div className="flex gap-2 md:gap-3 flex-wrap w-full md:w-auto">
            <button onClick={() => navigate('/business')} className="flex-1 md:flex-none bg-white border border-gray-200 text-dark px-4 py-2.5 rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm text-xs md:text-sm">
                <i className="fas fa-briefcase mr-2"></i> Business
            </button>
            <button onClick={() => navigate('/saved-items')} className="flex-1 md:flex-none bg-white border border-gray-200 text-dark px-4 py-2.5 rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm text-xs md:text-sm">
                <i className="far fa-heart mr-2"></i> Saved
            </button>
            <button onClick={() => setViewMode(viewMode === 'selling' ? 'browse' : 'selling')} className={`flex-1 md:flex-none px-4 py-2.5 rounded-xl font-bold transition-all shadow-sm text-xs md:text-sm flex items-center justify-center gap-2 ${viewMode === 'selling' ? 'bg-dark text-white' : 'bg-white border border-gray-200 text-dark hover:bg-gray-50'}`}>
                <i className="fas fa-box-open"></i> {viewMode === 'selling' ? 'Market' : 'My Items'}
            </button>
            <button onClick={() => { resetForm(); setShowSellModal(true); }} className="flex-1 md:flex-none bg-gradient-to-r from-primary to-primary-dark text-white px-5 py-2.5 rounded-xl font-bold shadow-lg hover:shadow-primary/30 transition-all text-xs md:text-sm flex items-center justify-center gap-2">
                <i className="fas fa-plus"></i> Sell
            </button>
        </div>
      </div>

      <hr className="mb-6 border-gray-200"/>

      {viewMode === 'browse' && (
          <div className="mb-6 flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                  <i className="fas fa-search absolute left-4 top-3.5 text-gray-400"></i>
                  <input type="text" placeholder="Search items..." className="w-full bg-white border-none rounded-xl pl-10 pr-4 py-3 shadow-sm focus:ring-2 focus:ring-primary/20" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <select 
                value={category} 
                onChange={(e) => setCategory(e.target.value)}
                className="bg-white font-bold text-dark px-4 py-3 rounded-xl shadow-sm outline-none appearance-none border-r-8 border-transparent cursor-pointer w-full md:w-auto"
              >
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
          </div>
      )}

      {viewMode === 'selling' && (
          <div className="mb-6 flex items-center gap-2">
              <h3 className="text-xl font-bold text-dark">Your Active Listings</h3>
              <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold">{displayedItems.length} Items</span>
          </div>
      )}

      {loading ? <div className="text-center py-20 text-gray-400">Loading Market...</div> : (
          <>
            {displayedItems.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[30px] border border-dashed border-gray-200">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400 text-2xl">
                        <i className={`fas ${viewMode === 'selling' ? 'fa-box-open' : 'fa-search'}`}></i>
                    </div>
                    <h3 className="font-bold text-gray-500 text-lg">
                        {viewMode === 'selling' ? "You haven't listed anything yet." : "No items found."}
                    </h3>
                    {viewMode === 'selling' && (
                        <button onClick={() => { resetForm(); setShowSellModal(true); }} className="mt-4 text-primary font-bold hover:underline">Start Selling Now</button>
                    )}
                </div>
            ) : (
                /* --- MOBILE OPTIMIZED GRID (2 Columns) --- */
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6">
                    {displayedItems.map(item => {
                        const isSeller = user && user.uid === item.sellerId;
                        const isSaved = savedProducts.includes(item.id);
                        const isVerified = item.sellerVerified; 

                        return (
                            <div 
                                key={item.id} 
                                className={`rounded-2xl md:rounded-[24px] shadow-sm hover:shadow-xl transition-all relative group p-2 md:p-3 border 
                                ${isVerified 
                                    ? 'bg-gradient-to-br from-white to-yellow-50 border-yellow-400 shadow-yellow-200/50 ring-1 ring-yellow-400/50' 
                                    : 'bg-white border-gray-50'}`}
                            >
                                <div onClick={() => navigate(`/product/${item.id}`)} className="cursor-pointer">
                                    {/* Image Container - Smaller on Mobile */}
                                    <div className="h-40 md:h-56 rounded-xl overflow-hidden relative mb-2 md:mb-3">
                                        {item.media?.[0]?.type === 'video' ? (
                                            <video src={item.media[0].url} className="w-full h-full object-cover" />
                                        ) : (
                                            <img src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                        )}
                                        
                                        {/* Badge: Verified */}
                                        {isVerified && (
                                            <div className="absolute top-2 left-2 bg-yellow-100/90 backdrop-blur-md px-1.5 py-0.5 rounded-md flex items-center gap-1 shadow-md border border-yellow-500 z-10">
                                                <i className="fas fa-certificate text-yellow-600 text-[8px] md:text-xs"></i>
                                                <span className="text-[8px] md:text-[10px] font-black text-yellow-800 uppercase tracking-wider">Verified</span>
                                            </div>
                                        )}

                                        {/* Badge: Sold */}
                                        {item.sold && (
                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                                <span className="text-white text-xl md:text-3xl font-black rotate-[-15deg] border-2 md:border-4 border-white px-2 md:px-4 py-1 md:py-2 rounded-lg">SOLD</span>
                                            </div>
                                        )}
                                        
                                        {/* Badge: Sponsored */}
                                        {item.boost && <span className="absolute top-2 right-2 bg-gradient-to-r from-gold to-yellow-400 text-white text-[8px] md:text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider shadow-sm">Ad</span>}
                                        
                                        {/* Price Tag */}
                                        <span className="absolute bottom-2 right-2 bg-white/90 backdrop-blur-md text-dark font-black px-2 py-0.5 md:px-3 md:py-1 rounded-lg shadow-sm text-xs md:text-sm">
                                            {item.currency === 'BDT' ? '৳' : item.currency} {Number(item.price).toLocaleString()}
                                        </span>
                                    </div>
                                    
                                    {/* Title */}
                                    <h3 className="font-bold text-dark text-sm md:text-lg leading-tight line-clamp-1 mb-1">{item.title}</h3>
                                    
                                    {/* Metadata (Location / Shipping) */}
                                    <div className='flex flex-col md:flex-row md:items-center justify-between text-[10px] md:text-xs text-gray-400 mb-2 md:mb-3 gap-0.5 md:gap-0'>
                                        <span className="flex items-center gap-1 font-medium truncate"><i className="fas fa-map-marker-alt"></i> {item.location}</span>
                                        <span className="flex items-center gap-1 font-medium text-primary truncate"><i className="fas fa-truck"></i> {item.shippingType || 'N/A'}</span>
                                    </div>

                                    {/* Seller Row */}
                                    <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs font-bold text-gray-600 pt-2 md:pt-3 border-t border-gray-200">
                                        {item.sellerAvatar && (
                                            <img src={item.sellerAvatar} alt={item.sellerName} className={`w-5 h-5 md:w-6 md:h-6 rounded-full object-cover ${isVerified ? 'border border-yellow-400' : ''}`} />
                                        )}
                                        <span className="flex items-center gap-1 truncate max-w-[80px] md:max-w-none">
                                            {item.sellerName}
                                            {isVerified && <i className="fas fa-check-circle text-yellow-500 text-[10px] md:text-[12px]" title="Verified"></i>}
                                        </span>
                                    </div>
                                </div>

                                {/* 3-Dot Menu / Save */}
                                <div className="absolute top-3 right-3 z-20">
                                    {isSeller ? (
                                        <>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === item.id ? null : item.id); }}
                                                className="menu-trigger w-7 h-7 md:w-8 md:h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-500 hover:text-dark transition-all shadow-md"
                                            >
                                                <i className="fas fa-ellipsis-v text-xs"></i>
                                            </button>
                                            
                                            {activeMenuId === item.id && (
                                                <div className="absolute right-0 top-full mt-2 w-40 md:w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 text-xs md:text-sm font-medium z-30 animate-fade-in">
                                                    <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }} className="flex items-center gap-2 w-full px-3 md:px-4 py-2 md:py-3 text-dark hover:bg-gray-50">
                                                        <i className="fas fa-edit text-blue-500 w-3 md:w-4"></i> Edit
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleToggleSold(item); }} className="flex items-center gap-2 w-full px-3 md:px-4 py-2 md:py-3 text-dark hover:bg-gray-50">
                                                        <i className={`fas ${item.sold ? 'fa-check-circle text-green-500' : 'fa-times-circle text-gray-500'} w-3 md:w-4`}></i> {item.sold ? 'Available' : 'Sold'}
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(item); }} className="flex items-center gap-2 w-full px-3 md:px-4 py-2 md:py-3 text-red-600 hover:bg-red-50">
                                                        <i className="fas fa-trash-alt w-3 md:w-4"></i> Delete
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <button 
                                            onClick={(e) => handleSave(e, item)} 
                                            className="w-7 h-7 md:w-8 md:h-8 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center transition-all shadow-sm"
                                        >
                                            <i className={`${isSaved ? 'fas text-red-500' : 'far text-gray-500 hover:text-red-500'} fa-heart text-sm`}></i>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
          </>
      )}

      {/* 📝 Sell/Edit Modal */}
      {showSellModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-fade-in">
            <div className="bg-white w-full max-w-lg rounded-[30px] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b flex justify-between items-center bg-[#F8FAFD]">
                    <h3 className="font-black text-xl text-dark">{isEditing ? 'Edit Listing' : 'Sell Item'}</h3>
                    <button onClick={() => { setShowSellModal(false); resetForm(); }}><i className="fas fa-times text-gray-400 hover:text-dark text-xl"></i></button>
                </div>
                <form onSubmit={handleList} className="p-6 space-y-4">
                    {/* ... (Keep form inputs the same as before) ... */}
                    <input required className="w-full bg-gray-50 p-3 rounded-xl font-bold text-sm" placeholder="Product Title" value={newItem.title} onChange={e => setNewItem({...newItem, title: e.target.value})} />
                    <input className="w-full bg-gray-50 p-3 rounded-xl font-bold text-sm" placeholder="Product Address / Pickup Point" value={newItem.address} onChange={e => setNewItem({...newItem, address: e.target.value})} />

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex gap-2">
                            <select className="bg-gray-50 rounded-xl px-2 font-bold text-sm" value={newItem.currency} onChange={e => setNewItem({...newItem, currency: e.target.value})}>
                                <option value="BDT">BDT ৳</option><option value="USD">USD $</option><option value="EUR">EUR €</option>
                            </select>
                            <input required type="number" min="0" step="0.01" className="w-full bg-gray-50 p-3 rounded-xl font-bold text-sm" placeholder="Price" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                        </div>
                        <input className="bg-gray-50 p-3 rounded-xl font-bold text-sm" placeholder="City/Area" value={newItem.location} onChange={e => setNewItem({...newItem, location: e.target.value})} />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <select className="w-full bg-gray-50 p-3 rounded-xl font-bold text-sm" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                            {categories.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <select className="w-full bg-gray-50 p-3 rounded-xl font-bold text-sm" value={newItem.condition} onChange={e => setNewItem({...newItem, condition: e.target.value})}>
                            <option>New</option><option>Used</option><option>Refurbished</option><option>Fresh</option><option>Frozen</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                         <select className="w-full bg-gray-50 p-3 rounded-xl font-bold text-sm" value={newItem.shippingType} onChange={e => setNewItem({...newItem, shippingType: e.target.value})}>
                            {shippingOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                         <select className="w-full bg-gray-50 p-3 rounded-xl font-bold text-sm" value={newItem.returnPolicy} onChange={e => setNewItem({...newItem, returnPolicy: e.target.value})}>
                            {returnPolicyOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>

                    <textarea required rows="3" className="w-full bg-gray-50 p-3 rounded-xl text-sm" placeholder="Detailed product description..." value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})}></textarea>
                    
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:bg-gray-50 transition-colors cursor-pointer">
                        <label className="cursor-pointer block">
                            <i className="fas fa-cloud-upload-alt text-3xl text-gray-300 mb-2"></i>
                            <p className="text-sm font-bold text-gray-500">Select Photos & Videos (Max 5)</p>
                            <input 
                                type="file" 
                                multiple 
                                accept="image/*,video/*" 
                                className="hidden" 
                                onChange={e => {
                                    const newFiles = Array.from(e.target.files).slice(0, 5 - existingMedia.length - mediaFiles.length);
                                    setMediaFiles(prev => [...prev, ...newFiles]);
                                }} 
                            />
                        </label>
                        
                        <div className="flex gap-2 overflow-x-auto mt-4 pb-2">
                            {existingMedia.map((m, i) => (
                                <div key={'ex'+i} className="w-16 h-16 flex-shrink-0 relative rounded-lg overflow-hidden border shadow-sm">
                                    {m.type === 'video' ? <div className="w-full h-full bg-black flex items-center justify-center text-white"><i className="fas fa-video"></i></div> : <img src={m.url} className="w-full h-full object-cover" alt="preview" />}
                                    <button type="button" onClick={() => setExistingMedia(existingMedia.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-red-500 text-white w-4 h-4 text-[10px] flex items-center justify-center rounded-full"><i className="fas fa-times"></i></button>
                                </div>
                            ))}
                            {mediaFiles.map((f, i) => (
                                <div key={'new'+i} className="w-16 h-16 flex-shrink-0 relative rounded-lg overflow-hidden border shadow-sm">
                                    <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center text-[8px] text-gray-600 break-all p-1">
                                        <i className={`fas ${f.type.startsWith('video') ? 'fa-video' : 'fa-image'} text-sm mb-1 text-primary`}></i>
                                        {f.name.slice(0, 10) + '...'}
                                    </div>
                                    <button type="button" onClick={() => setMediaFiles(mediaFiles.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-red-500 text-white w-4 h-4 text-[10px] flex items-center justify-center"><i className="fas fa-times"></i></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button type="submit" disabled={uploading} className="w-full bg-dark text-white font-bold py-4 rounded-xl hover:bg-primary transition-all shadow-lg">
                        {uploading ? `${isEditing ? 'Updating' : 'Listing'}...` : (isEditing ? 'Save Changes' : 'Publish Listing')}
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default Marketplace;