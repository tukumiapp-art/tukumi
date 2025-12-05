import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, auth, storage } from '../api/firebase';
import { 
  doc, getDoc, updateDoc, collection, addDoc, query, where, onSnapshot, 
  serverTimestamp, arrayUnion, arrayRemove, getDocs, deleteDoc, orderBy, limit
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import TopBar from '../components/TopBar';
// import BoostModal from '../components/BoostModal'; // REMOVED: No longer needed here
import VerificationModal from '../components/VerificationModal'; // Ensure imported

// --- HELPER: Avatar ---
const Avatar = ({ src, name, size = "md", className = "" }) => {
  const initials = name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
  const sizeClasses = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-14 h-14 text-base", xl: "w-32 h-32 text-4xl" };
  const isPlaceholder = src && src.includes('via.placeholder.com');
  if (src && !isPlaceholder) return <img src={src} className={`${sizeClasses[size]} rounded-full object-cover border border-gray-200 ${className}`} alt={name} />;
  return <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-tr from-primary to-primary-light text-white flex items-center justify-center font-bold shadow-inner ${className}`}>{initials}</div>;
};

const BusinessPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('products'); 
  const [myRole, setMyRole] = useState(null); 
  
  // Data
  const [products, setProducts] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [selectedProductCategory, setSelectedProductCategory] = useState('All');

  // Forms
  const [showProductModal, setShowProductModal] = useState(false);
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [currentProductId, setCurrentProductId] = useState(null);
  const [productUploading, setProductUploading] = useState(false);
  const [newItem, setNewItem] = useState({ 
    title: '', price: '', currency: 'BDT', condition: 'New', description: '', 
    category: 'Digital Products', location: 'Dhaka', address: '', stock: 1, 
    shippingType: 'Shop Pickup', returnPolicy: 'No Return' 
  });
  const [mediaFiles, setMediaFiles] = useState([]); 
  const [existingMedia, setExistingMedia] = useState([]);

  // Edit Page & Team
  const [showEditPageModal, setShowEditPageModal] = useState(false);
  const [editPageData, setEditPageData] = useState({});
  const [editPageFiles, setEditPageFiles] = useState({ logo: null, cover: null });
  const [pageUpdating, setPageUpdating] = useState(false);
  const [teamSearchTerm, setTeamSearchTerm] = useState('');
  const [teamSearchResults, setTeamSearchResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newMemberRole, setNewMemberRole] = useState('Support');
  // const [showBoostModal, setShowBoostModal] = useState(false); // REMOVED
  // const [boostTarget, setBoostTarget] = useState(null); // REMOVED
  const [activeMenuId, setActiveMenuId] = useState(null);
  
  // NEW: Verification State
  const [showVerifyModal, setShowVerifyModal] = useState(false); 

  // Constants for dropdowns
  const categories = ['Food & Beverage', 'Digital Products', 'Fashion & Apparel', 'Electronics & Gadgets', 'Home & Garden', 'Handmade & Crafts', 'Vehicles & Parts', 'Sports', 'Books', 'Baby & Kids', 'Beauty & Health', 'Real Estate', 'Services'];
  const shippingOptions = ['Shop Pickup', 'Free Shipping', 'Collection Point', 'Local Delivery'];
  const returnPolicyOptions = ['No Return', '7 Days Return', '15 Days Return', '30 Days Return'];
  const conditionOptions = ['New', 'Used', 'Like New', 'Refurbished', 'For Parts'];

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (id) loadPageData(id, u);
    });
    const handleClickOutside = (e) => { 
        if(e.target.closest('.menu-trigger') || e.target.closest('.search-results')) return;
        setActiveMenuId(null); 
    };
    document.addEventListener('click', handleClickOutside);
    return () => { unsubAuth(); document.removeEventListener('click', handleClickOutside); };
  }, [id]);

  const loadPageData = (pageId, currentUser) => {
    // 1. Page Data
    const unsubPage = onSnapshot(doc(db, 'business_pages', pageId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setPage({ id: docSnap.id, ...data });
        setEditPageData(data); 
        if (currentUser) {
            const member = data.team?.find(m => m.uid === currentUser.uid);
            setMyRole(member ? member.role : (data.ownerId === currentUser.uid ? 'Admin' : null));
        }
        setLoading(false);
      }
    });

    // 2. Products
    const qProducts = query(collection(db, 'marketplace'), where('sellerId', '==', pageId));
    const unsubProducts = onSnapshot(qProducts, (snap) => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    
    // 3. Inbox
    const qInbox = query(collection(db, 'conversations'), where('participants', 'array-contains', pageId));
    const unsubInbox = onSnapshot(qInbox, (snap) => {
        const chats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const filteredChats = chats.filter(chat => chat.users.some(u => u.uid !== pageId));
        
        setInbox(filteredChats);
        const totalUnread = filteredChats.reduce((sum, chat) => sum + (chat.unreadCounts?.[pageId] || 0), 0);
        setUnreadMsgCount(totalUnread);
    });

    // 4. Page Notifications (Reviews/Questions)
    const qNotifs = query(collection(db, 'notifications'), where('businessId', '==', pageId), orderBy('timestamp', 'desc'));
    const unsubNotifs = onSnapshot(qNotifs, (snap) => {
        setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubPage(); unsubProducts(); unsubInbox(); unsubNotifs(); };
  };

  // --- TEAM SEARCH (FIXED CASE SENSITIVITY) ---
  const handleTeamSearch = async (term) => {
      setTeamSearchTerm(term);
      setSelectedUser(null);
      if (term.length < 2) { setTeamSearchResults([]); return; }

      const q = query(collection(db, 'users'), where('displayName', '>=', ''), limit(50)); 
      const snap = await getDocs(q);
      
      const lowerTerm = term.toLowerCase();
      const results = snap.docs
          .map(d => ({ uid: d.id, ...d.data() }))
          .filter(u => 
              (u.displayName && u.displayName.toLowerCase().includes(lowerTerm)) || 
              (u.handle && u.handle.toLowerCase().includes(lowerTerm)) ||
              (u.email && u.email.toLowerCase().includes(lowerTerm))
          )
          .slice(0, 5); 

      setTeamSearchResults(results);
  };

  const handleInviteMember = async () => {
      if (!selectedUser) return;
      if (page.team?.some(m => m.uid === selectedUser.uid) || page.ownerId === selectedUser.uid) return alert("User is already a member or owner.");

      await addDoc(collection(db, 'notifications'), {
            recipientId: selectedUser.uid,
            senderId: user.uid, 
            senderName: page.name,
            senderAvatar: page.logo,
            type: 'team_invite',
            pageId: id, 
            pageName: page.name,
            role: newMemberRole, 
            timestamp: serverTimestamp(),
            isRead: false
      });
      alert(`Invite sent to ${selectedUser.displayName || selectedUser.email}!`);
      setSelectedUser(null);
      setTeamSearchTerm('');
      setTeamSearchResults([]);
  };

  // --- PAGE NOTIFICATION ACTIONS ---
  const handleNotificationAction = async (notif) => {
      await updateDoc(doc(db, 'notifications', notif.id), { isRead: true });
      if (notif.targetId) {
          navigate(`/product/${notif.targetId}`);
      }
  };

  // --- Existing Handlers ---
  const handleFollowPage = async () => { if (!user) return alert("Please sign in."); const pageRef = doc(db, 'business_pages', id); const isFollowing = page.followersList?.includes(user.uid); if (isFollowing) await updateDoc(pageRef, { followers: (page.followers || 1) - 1, followersList: arrayRemove(user.uid) }); else { await updateDoc(pageRef, { followers: (page.followers || 0) + 1, followersList: arrayUnion(user.uid) }); if (page.ownerId !== user.uid) await addDoc(collection(db, 'notifications'), { recipientId: page.ownerId, senderId: user.uid, senderName: user.displayName, senderAvatar: user.photoURL, type: 'follow_business', targetId: id, message: `started following your business ${page.name}`, timestamp: serverTimestamp(), isRead: false }); } };
  const handleToggleSold = async (p) => { try { await updateDoc(doc(db, 'marketplace', p.id), { sold: !p.sold }); setActiveMenuId(null); } catch (e) { console.error(e); } };
  
  // Handlers for Product Modal
  const openAddProduct = () => { setIsEditingProduct(false); setNewItem({ title: '', price: '', currency: 'BDT', condition: 'New', description: '', category: 'Digital Products', location: 'Dhaka', address: '', stock: 1, shippingType: 'Shop Pickup', returnPolicy: 'No Return' }); setMediaFiles([]); setExistingMedia([]); setShowProductModal(true); };
  const openEditProduct = (p) => { setIsEditingProduct(true); setCurrentProductId(p.id); setNewItem({ ...p }); 
      const existing = Array.isArray(p.media) ? p.media : (p.image ? [{ url: p.image, type: 'image' }] : []);
      setExistingMedia(existing); 
      setMediaFiles([]); 
      setShowProductModal(true); 
      setActiveMenuId(null); 
  };
  const handleDeleteProduct = async (p) => { if(confirm("Are you sure you want to delete this product?")) { await deleteDoc(doc(db, 'marketplace', p.id)); setActiveMenuId(null); } };
  
  // Product Save Logic - UPDATED
  const handleSaveProduct = async () => { 
    if (mediaFiles.length === 0 && existingMedia.length === 0) return alert("Image required."); 
    setProductUploading(true); 
    try { 
      const newMedia = await Promise.all(mediaFiles.map(async (file) => { 
        const refS = ref(storage, `business/${id}/products/${Date.now()}_${file.name}`); 
        await uploadBytes(refS, file); 
        return { url: await getDownloadURL(refS), type: file.type.startsWith('video') ? 'video' : 'image' }; 
      })); 
      
      const finalMedia = [...existingMedia.map(m => typeof m === 'string' ? { url: m, type: 'image' } : m), ...newMedia]; 
      
      const data = { 
        ...newItem, 
        price: Number(newItem.price), 
        stock: Number(newItem.stock), 
        media: finalMedia, 
        image: finalMedia[0]?.url, 
        sellerId: id, 
        sellerName: page.name, 
        sellerAvatar: page.logo,
        sellerVerified: page.isVerified || false, // <--- SAVING VERIFIED STATUS
        isBusiness: true, 
        timestamp: serverTimestamp() 
      }; 
      
      if (isEditingProduct) await updateDoc(doc(db, 'marketplace', currentProductId), data); 
      else await addDoc(collection(db, 'marketplace'), { ...data, boost: null, reviews: [], questions: [], sold: false }); 
      
      setShowProductModal(false); 
    } catch (err) { 
      console.error("Product Save Failed:", err);
      alert("Failed to save product. Check console for details."); 
    } finally { 
      setProductUploading(false); 
    } 
  };
  
  const handleUpdatePage = async () => { setPageUpdating(true); try { let l=page.logo, c=page.coverImage; if(editPageFiles.logo){const r=ref(storage, `business/${id}/logo_${Date.now()}`);await uploadBytes(r,editPageFiles.logo);l=await getDownloadURL(r);} if(editPageFiles.cover){const r=ref(storage, `business/${id}/cover_${Date.now()}`);await uploadBytes(r,editPageFiles.cover);c=await getDownloadURL(r);} await updateDoc(doc(db,'business_pages',id),{...editPageData,logo:l,coverImage:c}); alert("Updated!"); setShowEditPageModal(false); } catch(e){console.error(e); alert("Error updating page.");} finally{setPageUpdating(false);} };
  const handleRemoveTeam = async (m) => { if(confirm(`Remove ${m.name}?`)) await updateDoc(doc(db,'business_pages',id),{team:arrayRemove(m),teamIds:arrayRemove(m.uid)}); };
  // --- End Existing Handlers ---


  if (loading) return <div className="p-20 text-center">Loading...</div>;
  const canEdit = ['Admin', 'Editor'].includes(myRole);
  const isAdmin = myRole === 'Admin';
  const isTeam = !!myRole;
  const isFollowing = user && page.followersList?.includes(user.uid);
  const filteredProducts = products.filter(p => selectedProductCategory === 'All' || p.category === selectedProductCategory);

  return (
    <div className="p-0 md:p-6 w-full max-w-[1400px] mx-auto pb-24">
        <div className="hidden md:block"><TopBar /></div>
        
        {/* HEADER - ADDED BORDER FOR VERIFIED STATUS */}
        <div className={`bg-white md:rounded-[30px] shadow-sm mb-6 relative group overflow-hidden ${page.isVerified ? 'border-2 border-gold shadow-gold/20' : ''}`}>
            <div className="h-48 md:h-72 bg-gray-200 relative group">
                <img src={page.coverImage} className="w-full h-full object-cover" alt="Business cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                {isAdmin && <button onClick={() => setShowEditPageModal(true)} className="absolute top-4 right-4 bg-white/20 backdrop-blur-md text-white px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition hover:bg-white/40"><i className="fas fa-pen"></i> Edit Page</button>}
            </div>
            
            <div className="px-6 md:px-10 pb-6 -mt-16 relative z-10 flex flex-col md:flex-row items-end gap-6">
                 <div className="w-32 h-32 bg-white rounded-2xl p-1 shadow-xl flex-shrink-0"><img src={page.logo} className="w-full h-full rounded-xl object-cover" alt="Business logo" /></div>
                 
                 <div className="flex-1 text-center md:text-left mb-2">
                     {/* VERIFIED BADGE */}
                     <h1 className={`text-3xl font-black text-dark flex items-center justify-center md:justify-start`}>
                        {page.name} 
                        {page.isVerified && <i className="fas fa-check-circle text-gold text-2xl ml-2" title="Verified Business"></i>}
                     </h1>
                     <p className="text-gray-500 font-bold text-sm">{page.category} <span className="text-primary mx-2">{page.followers || 0} Followers</span></p>
                 </div>
                 
                 <div className="flex gap-3 mb-2 justify-center w-full md:w-auto">
                     {isTeam ? (
                         <>
                             {/* NEW: VERIFY BUTTON */}
                             {isAdmin && !page.isVerified && (
                                 <button 
                                    onClick={() => setShowVerifyModal(true)}
                                    className="bg-blue-500 text-white px-5 py-3 rounded-xl font-bold shadow-lg hover:bg-blue-600 transition flex items-center gap-2"
                                 >
                                     <i className="fas fa-check-circle"></i> Verify Page
                                 </button>
                             )}
                             
                             {/* UPDATED BOOST BUTTON: Navigates to /boost */}
                             {isAdmin && (
                                <button 
                                    onClick={() => navigate('/boost', { state: { targetId: id, targetType: 'page', targetName: page.name } })} 
                                    className="bg-gold text-white px-5 py-3 rounded-xl font-bold shadow-lg hover:bg-yellow-600 transition"
                                >
                                    <i className="fas fa-rocket mr-2"></i> Boost
                                </button>
                             )}
                             <button onClick={() => navigate('/messages', { state: { asBusiness: true, businessId: id } })} className="bg-dark text-white px-5 py-3 rounded-xl font-bold shadow-lg hover:bg-gray-700 transition"><i className="fas fa-inbox mr-2"></i> Inbox</button>
                         </>
                     ) : (
                         <>
                             <button onClick={handleFollowPage} className={`px-6 py-3 rounded-xl font-bold shadow-lg transition-all ${isFollowing ? 'bg-white text-dark border hover:bg-gray-50' : 'bg-primary text-white hover:bg-primary-dark'}`}>{isFollowing ? 'Following' : 'Follow Shop'}</button>
                             <button onClick={() => navigate('/messages', { state: { startChatWith: { uid: page.id, displayName: page.name, photoURL: page.logo, isBusiness: true } } })} className="bg-gray-100 text-dark px-4 py-3 rounded-xl font-bold hover:bg-gray-200 transition"><i className="fas fa-comment-alt"></i></button>
                         </>
                     )}
                 </div>
            </div>
            {/* Tabs Navigation */}
            <div className="flex border-t border-gray-100 px-6 gap-8 overflow-x-auto no-scrollbar mt-4">
               <button onClick={() => setActiveTab('products')} className={`py-4 font-bold capitalize border-b-4 transition-all ${activeTab === 'products' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-dark'}`}>Products</button>
               {isTeam && ( 
                   <>
                       <button onClick={() => setActiveTab('inbox')} className={`py-4 font-bold capitalize border-b-4 transition-all flex items-center gap-2 ${activeTab === 'inbox' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-dark'}`}>
                           Inbox {unreadMsgCount > 0 && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">{unreadMsgCount}</span>}
                       </button>
                       
                       <button onClick={() => setActiveTab('notifications')} className={`py-4 font-bold capitalize border-b-4 flex items-center gap-2 ${activeTab === 'notifications' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-dark'}`}>
                           Notifications {notifications.length > 0 && <span className="bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full">{notifications.length}</span>}
                       </button>
                       
                       <button onClick={() => setActiveTab('team')} className={`py-4 font-bold capitalize border-b-4 ${activeTab === 'team' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-dark'}`}>Team</button>
                       {isAdmin && <button onClick={() => setActiveTab('growth')} className={`py-4 font-bold capitalize border-b-4 flex items-center gap-2 ${activeTab === 'growth' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-dark'}`}><i className="fas fa-chart-line"></i> Growth</button>}
                   </>
               )}
            </div>
        </div>

        {/* CONTENT GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
                
                {/* PRODUCTS TAB */}
                {activeTab === 'products' && (
                    <div className="space-y-6">
                         <div className="bg-white p-6 rounded-[24px] shadow-sm border border-gray-50"><h3 className="font-bold text-xl mb-2 text-dark">About</h3><p className="text-gray-600 text-sm whitespace-pre-wrap">{page.description}</p></div>
                         <div className="flex flex-col md:flex-row justify-between items-center mb-4">
                            <h3 className="font-bold text-xl text-dark">Inventory ({filteredProducts.length})</h3>
                            <div className="flex gap-3 items-center">
                                <select value={selectedProductCategory} onChange={e => setSelectedProductCategory(e.target.value)} className="bg-gray-100 p-3 rounded-xl font-bold text-sm border border-gray-200"><option value="All">All</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
                                {canEdit && <button onClick={openAddProduct} className="bg-dark text-white px-4 py-3 rounded-xl font-bold text-sm flex items-center gap-1 hover:bg-primary transition"><i className="fas fa-plus"></i> Add</button>}
                            </div>
                         </div>
                         <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            {filteredProducts.map(p => (
                                <div key={p.id} className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 relative group">
                                    <div onClick={() => navigate(`/product/${p.id}`)} className="cursor-pointer">
                                        <div className="relative rounded-xl overflow-hidden mb-3 aspect-square">
                                            {p.media?.[0]?.type === 'video' ? <video src={p.media[0].url} className="w-full h-full object-cover" controls /> : <img src={p.image} className="w-full h-full object-cover" alt={p.title} />}
                                            {p.sold && <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-white font-black text-lg">SOLD OUT</div>}
                                        </div>
                                        <h4 className="font-bold text-sm text-dark truncate">{p.title}</h4>
                                        <p className="text-primary font-black text-sm">{p.currency === 'BDT' ? '৳' : p.currency} {p.price}</p>
                                    </div>
                                    {canEdit && (
                                        <div className="absolute top-3 right-3">
                                            <button onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === p.id ? null : p.id); }} className="menu-trigger w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow-sm text-dark hover:bg-white transition"><i className="fas fa-ellipsis-v"></i></button>
                                            {activeMenuId === p.id && (
                                                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl z-50 overflow-hidden p-1 border border-gray-100">
                                                    <button onClick={() => openEditProduct(p)} className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-gray-50 rounded-lg">Edit</button>
                                                    <button onClick={() => handleToggleSold(p)} className={`w-full text-left px-3 py-2 text-xs font-bold hover:bg-gray-50 rounded-lg flex items-center gap-2 ${p.sold ? 'text-green-600' : 'text-red-600'}`}>
                                                        <i className={`fas ${p.sold ? 'fa-check' : 'fa-times'}`}></i> {p.sold ? 'Mark Available' : 'Mark Sold'}
                                                    </button>
                                                    <button onClick={() => handleDeleteProduct(p)} className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-red-50 text-red-500 rounded-lg">Delete</button>
                                                    {/* NEW: BOOST PRODUCT BUTTON */}
                                                    <button 
                                                        onClick={() => navigate('/boost', { state: { targetId: p.id, targetType: 'product', targetName: p.title } })} 
                                                        className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-yellow-50 text-gold rounded-lg flex items-center gap-2"
                                                    >
                                                        <i className="fas fa-rocket"></i> Boost Product
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                         </div>
                         {filteredProducts.length === 0 && (
                             <div className="p-10 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                 <p className="font-bold">No products found in {selectedProductCategory === 'All' ? 'inventory' : selectedProductCategory}.</p>
                             </div>
                         )}
                    </div>
                )}

                {/* INBOX TAB */}
                {activeTab === 'inbox' && isTeam && (
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                        <h3 className="text-lg font-bold mb-4 border-b pb-2 flex justify-between">Business Inbox {unreadMsgCount > 0 && <span className="text-red-500 text-xs flex items-center gap-1"><i className="fas fa-envelope"></i> {unreadMsgCount} new</span>}</h3>
                        {inbox.length === 0 ? <p className="text-gray-400">No messages yet.</p> : (<div className="space-y-3">{inbox.map(chat => { const customer = chat.users.find(u => u.uid !== page.id) || { displayName: 'Customer', photoURL: null }; const isUnread = chat.unreadCounts?.[page.id] > 0; return (<div key={chat.id} onClick={() => navigate('/messages', { state: { activeConversationId: chat.id, asBusiness: true, businessId: id, businessName: page.name } })} className={`flex justify-between items-center p-4 rounded-2xl cursor-pointer border transition-all ${isUnread ? 'bg-gradient-to-r from-[#E0F2F1] to-white border-primary/30 shadow-sm scale-[1.01]' : 'bg-white hover:bg-gray-50 border-gray-100'}`}><div className="flex items-center gap-4"><Avatar src={customer.photoURL} name={customer.displayName} size="md" /><div><h4 className={`text-sm ${isUnread ? 'font-black' : 'font-bold'}`}>{customer.displayName}</h4><p className={`text-xs truncate w-48 ${isUnread ? 'font-bold text-dark' : 'text-gray-500'}`}>{chat.lastMessage}</p></div></div><div className="text-right"><span className="text-[10px] text-gray-400 block">{chat.updatedAt?.seconds ? new Date(chat.updatedAt.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}</span>{isUnread && <span className="inline-block bg-primary text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full mt-1">New</span>}</div></div>); })}</div>)}
                    </div>
                )}

                {/* --- NOTIFICATIONS TAB --- */}
                {activeTab === 'notifications' && isTeam && (
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                        <h3 className="text-lg font-bold mb-4 text-dark">Page Activity (Reviews & Questions)</h3>
                        {notifications.length === 0 ? (
                            <div className="text-center py-10 text-gray-400">No new activity.</div>
                        ) : (
                            <div className="space-y-3">
                                {notifications.map(notif => {
                                    const productItem = products.find(p => p.id === notif.targetId);
                                    return (
                                        <div key={notif.id} onClick={() => handleNotificationAction(notif)} className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors border border-gray-100">
                                            <Avatar src={notif.senderAvatar} name={notif.senderName} />
                                            <div className="flex-1">
                                                <p className="text-sm text-gray-800 leading-tight">
                                                    <span className="font-bold">{notif.senderName}</span> 
                                                    {notif.type === 'review' && ' wrote a review on '}
                                                    {notif.type === 'question' && ' asked a question about '}
                                                    <span className="text-primary font-bold">{productItem?.title || 'a product'}</span>:
                                                </p>
                                                <p className="text-gray-600 italic text-sm mt-1">"{notif.message}"</p>
                                                <p className="text-xs text-gray-400 mt-1">{notif.timestamp?.seconds ? new Date(notif.timestamp.seconds * 1000).toLocaleString() : 'Just now'}</p>
                                            </div>
                                            <button 
                                                className="bg-primary text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-primary-dark transition-all flex-shrink-0"
                                                onClick={(e) => { e.stopPropagation(); handleNotificationAction(notif); }}
                                            >
                                                <i className="fas fa-reply mr-1"></i> View/Reply
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* TEAM TAB (With Updated Search) */}
                {activeTab === 'team' && isTeam && (
                    <div className="bg-white p-6 rounded-[24px] shadow-sm border border-gray-100">
                        <h3 className="font-bold text-xl text-dark mb-6">Team</h3>
                        
                        {/* Member List */}
                        <div className="space-y-4">
                            {/* OWNER */}
                            <div key={page.ownerId} className="flex items-center justify-between p-4 bg-yellow-50 rounded-2xl border border-yellow-100">
                                <div className="flex items-center gap-4">
                                    <Avatar src={page.logo} name={page.name} size="md" />
                                    <div>
                                        <p className="font-bold">{page.name} (Owner)</p>
                                        <p className="text-xs text-gray-500">{page.email || 'N/A'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-primary font-bold text-sm ml-2">Admin/Owner</span>
                                </div>
                            </div>
                            
                            {/* Team Members */}
                            {page.team?.filter(m => m.uid !== page.ownerId).map(member => (
                                <div key={member.uid} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <div className="flex items-center gap-4">
                                        <Avatar src={member.avatar} name={member.name} size="md" />
                                        <div>
                                            <p className="font-bold">{member.name}</p>
                                            <p className="text-xs text-gray-500">{member.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${member.role === 'Admin' ? 'bg-red-100 text-red-700' : member.role === 'Editor' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                                            {member.role}
                                        </span>
                                        {isAdmin && (
                                            <button onClick={() => handleRemoveTeam(member)} className="text-red-500 hover:bg-red-50 p-2 rounded-full transition">
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {page.team?.filter(m => m.uid !== page.ownerId).length === 0 && page.ownerId && <p className="text-gray-400 text-center py-4">No team members yet (only owner listed).</p>}
                        </div>

                        {/* Add Member Form (Admin only) */}
                        {isAdmin && (<div className="mt-8 pt-6 border-t border-gray-100">
                            <h4 className="font-bold text-dark mb-4">Invite New Member</h4>
                            
                            <div className="relative mb-3">
                                <input 
                                    placeholder="Search (Name, @handle, Email)..." 
                                    value={teamSearchTerm} 
                                    onChange={e => handleTeamSearch(e.target.value)} 
                                    className="w-full bg-gray-50 p-3 rounded-xl font-bold text-sm border border-gray-200 focus:border-primary focus:ring-primary" 
                                />
                                {/* Search Results Dropdown */}
                                {teamSearchResults.length > 0 && !selectedUser && (
                                    <div className="search-results absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 max-h-40 overflow-y-auto p-2">
                                        {teamSearchResults.map(u => (
                                            <div key={u.uid} onClick={() => { setSelectedUser(u); setTeamSearchTerm(u.displayName || u.email); setTeamSearchResults([]); }} className="p-2 hover:bg-gray-50 rounded-lg cursor-pointer flex items-center gap-3">
                                                <Avatar src={u.photoURL} name={u.displayName} size="sm" />
                                                <div className="flex-1"><p className="font-bold text-sm">{u.displayName}</p><p className="text-xs text-gray-400">{u.email}</p></div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3 items-center">
                                <select value={newMemberRole} onChange={e => setNewMemberRole(e.target.value)} className="bg-gray-50 p-3 rounded-xl font-bold text-sm border border-gray-200 flex-1">
                                    <option value="Support">Support</option>
                                    <option value="Editor">Editor</option>
                                    <option value="Viewer">Viewer</option>
                                </select>
                                <button onClick={handleInviteMember} disabled={!selectedUser} className="bg-dark text-white px-6 py-3 rounded-xl font-bold hover:bg-primary transition disabled:opacity-50">
                                    Send Invite
                                </button>
                            </div>
                            
                            {selectedUser && (
                                <div className="flex items-center justify-between bg-green-50 p-3 rounded-xl border border-green-100 mt-3 text-sm">
                                    <div className="flex items-center gap-3">
                                        <Avatar src={selectedUser.photoURL} name={selectedUser.displayName} size="sm" />
                                        <span className="font-bold text-green-800">Selected: {selectedUser.displayName || selectedUser.email}</span>
                                    </div>
                                    <button onClick={() => setSelectedUser(null)} className="text-red-500 hover:text-red-700"><i className="fas fa-times"></i> Clear</button>
                                </div>
                            )}
                        </div>)}
                    </div>
                )}

                {/* GROWTH DASHBOARD */}
                {activeTab === 'growth' && isAdmin && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-50"><div className="text-gray-400 text-xs font-bold uppercase mb-1">Followers</div><div className="text-2xl font-black text-dark">{page.followers || 0}</div></div>
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-50"><div className="text-gray-400 text-xs font-bold uppercase mb-1">Leads</div><div className="text-2xl font-black text-dark">{inbox.length}</div></div>
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-50"><div className="text-gray-400 text-xs font-bold uppercase mb-1">Inventory</div><div className="text-2xl font-black text-dark">{products.length}</div></div>
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-50"><div className="text-gray-400 text-xs font-bold uppercase mb-1">Rating</div><div className="text-2xl font-black text-dark">{page.rating?.toFixed(1) || 'N/A'}</div></div>
                        </div>
                        <div className="bg-gradient-to-br from-dark to-gray-900 p-6 rounded-[24px] text-white shadow-lg">
                            <h3 className="font-bold text-lg mb-2">Boost Sales</h3>
                            <p className="text-sm mb-4 text-gray-300">Promote your business page to reach thousands of potential customers in your area.</p>
                            {/* UPDATED BOOST BUTTON: Navigates to /boost */}
                            <button 
                                onClick={() => navigate('/boost', { state: { targetId: id, targetType: 'page', targetName: page.name } })} 
                                className="w-full bg-white text-dark font-bold py-3 rounded-xl hover:bg-gold transition-colors"
                            >
                                <i className="fas fa-rocket mr-2"></i> Promote Page
                            </button>
                        </div>
                    </div>
                )}
            </div>
            
            {/* SIDEBAR */}
            <div className="space-y-6">
                <div className="bg-white p-6 rounded-[24px] shadow-sm border border-gray-50">
                    <h3 className="font-bold text-dark mb-4 border-b border-gray-100 pb-2">Contact & Info</h3>
                    <div className="space-y-4 text-sm">
                        {page.address && <p><i className="fas fa-map-pin mr-2 text-gray-400"></i> {page.address}</p>}
                        {page.email && <p><i className="fas fa-envelope mr-2 text-gray-400"></i> {page.email}</p>}
                        {page.phone && <p><i className="fas fa-phone mr-2 text-gray-400"></i> {page.phone}</p>}
                        {page.website && <p><i className="fas fa-globe mr-2 text-gray-400"></i> <a href={page.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{page.website}</a></p>}
                    </div>
                </div>
            </div>
        </div>

        {/* --- MODALS --- */}
        
        {/* EDIT PAGE MODAL */}
        {showEditPageModal && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
                <div className="bg-white w-full max-w-2xl rounded-[30px] flex flex-col max-h-[90vh]">
                    <div className="p-6 border-b flex justify-between"><h3 className="font-bold text-xl">Edit Page Info</h3><button onClick={()=>setShowEditPageModal(false)} className="text-gray-500 hover:text-red-500 text-2xl"><i className="fas fa-times"></i></button></div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <label className="block">Logo <input type="file" onChange={e=>setEditPageFiles({...editPageFiles,logo:e.target.files[0]})} className="block w-full text-sm text-gray-500"/></label>
                            <label className="block">Cover <input type="file" onChange={e=>setEditPageFiles({...editPageFiles,cover:e.target.files[0]})} className="block w-full text-sm text-gray-500"/></label>
                        </div>
                        <input value={editPageData.name || ''} onChange={e=>setEditPageData({...editPageData,name:e.target.value})} placeholder="Name" className="w-full border p-3 rounded-xl"/>
                        <textarea value={editPageData.description || ''} onChange={e=>setEditPageData({...editPageData,description:e.target.value})} placeholder="Description" className="w-full border p-3 rounded-xl h-24"/>
                        <input value={editPageData.address || ''} onChange={e=>setEditPageData({...editPageData,address:e.target.value})} placeholder="Address" className="w-full border p-3 rounded-xl"/>
                        <input value={editPageData.website || ''} onChange={e=>setEditPageData({...editPageData,website:e.target.value})} placeholder="Website" className="w-full border p-3 rounded-xl"/>
                        <input value={editPageData.email || ''} onChange={e=>setEditPageData({...editPageData,email:e.target.value})} placeholder="Email" className="w-full border p-3 rounded-xl"/>
                        <input value={editPageData.phone || ''} onChange={e=>setEditPageData({...editPageData,phone:e.target.value})} placeholder="Phone" className="w-full border p-3 rounded-xl"/>
                    </div>
                    <div className="p-6 border-t">
                        <button onClick={handleUpdatePage} disabled={pageUpdating} className="w-full bg-primary text-white p-3 rounded-xl font-bold hover:bg-primary-dark transition disabled:opacity-50">
                            {pageUpdating ? <i className="fas fa-spinner fa-spin"></i> : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        
        {/* PRODUCT MODAL */}
        {showProductModal && (<div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
            <div className="bg-white w-full max-w-lg rounded-[30px] p-6 max-h-[90vh] overflow-y-auto">
                <h3 className="font-bold text-xl mb-4">{isEditingProduct ? 'Edit Product' : 'Add Product'}</h3>
                
                <input value={newItem.title} onChange={e=>setNewItem({...newItem,title:e.target.value})} placeholder="Title" className="w-full border p-3 rounded-xl mb-2"/>
                
                <div className="grid grid-cols-3 gap-4 mb-2">
                    <input value={newItem.price} onChange={e=>setNewItem({...newItem,price:e.target.value})} placeholder="Price" type="number" className="w-full border p-3 rounded-xl"/>
                    <input value={newItem.stock} onChange={e=>setNewItem({...newItem,stock:e.target.value})} placeholder="Stock" type="number" className="w-full border p-3 rounded-xl"/>
                    <select value={newItem.currency} onChange={e=>setNewItem({...newItem,currency:e.target.value})} className="w-full border p-3 rounded-xl">
                        <option value="BDT">BDT</option>
                        <option value="USD">USD</option>
                    </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-2">
                    <select value={newItem.category} onChange={e=>setNewItem({...newItem,category:e.target.value})} className="w-full border p-3 rounded-xl">
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={newItem.condition} onChange={e=>setNewItem({...newItem,condition:e.target.value})} className="w-full border p-3 rounded-xl">
                        {conditionOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                
                <input value={newItem.location} onChange={e=>setNewItem({...newItem,location:e.target.value})} placeholder="City/Location" className="w-full border p-3 rounded-xl mb-2"/>
                <input value={newItem.address} onChange={e=>setNewItem({...newItem,address:e.target.value})} placeholder="Full Address / Pickup Point" className="w-full border p-3 rounded-xl mb-2"/>

                <div className="grid grid-cols-2 gap-4 mb-2">
                    <select value={newItem.shippingType} onChange={e=>setNewItem({...newItem,shippingType:e.target.value})} className="w-full border p-3 rounded-xl">
                        {shippingOptions.map(o=><option key={o}>{o}</option>)}
                    </select>
                    <select value={newItem.returnPolicy} onChange={e=>setNewItem({...newItem,returnPolicy:e.target.value})} className="w-full border p-3 rounded-xl">
                        {returnPolicyOptions.map(o=><option key={o}>{o}</option>)}
                    </select>
                </div>

                <textarea value={newItem.description} onChange={e=>setNewItem({...newItem,description:e.target.value})} placeholder="Description" className="w-full border p-3 rounded-xl h-24 mb-2"/>
                
                <label className="block mb-4">Media (Images/Videos) <input type="file" multiple onChange={e=>setMediaFiles([...mediaFiles,...Array.from(e.target.files)])} className="block w-full text-sm text-gray-500"/></label>
                
                <div className="mb-4 flex flex-wrap gap-2">
                    {[...existingMedia, ...mediaFiles.map(f => ({ url: URL.createObjectURL(f), file: f, isNew: true }))].map((media, index) => (
                        <div key={index} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-300">
                            {media.type === 'video' ? (
                                <video src={media.url} className="w-full h-full object-cover" />
                            ) : (
                                <img src={media.url} className="w-full h-full object-cover" alt="product media"/>
                            )}
                            <button 
                                onClick={() => { 
                                    if (media.isNew) setMediaFiles(mediaFiles.filter(f => f !== media.file)); 
                                    else setExistingMedia(existingMedia.filter((_, i) => i !== index)); 
                                }} 
                                className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-4 h-4 text-[8px] flex items-center justify-center">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                    ))}
                </div>
                
                <button onClick={handleSaveProduct} disabled={productUploading} className="w-full bg-primary text-white p-3 rounded-xl font-bold hover:bg-primary-dark transition disabled:opacity-50">
                    {productUploading ? <i className="fas fa-spinner fa-spin"></i> : (isEditingProduct ? 'Update Product' : 'Publish Product')}
                </button>
                <button onClick={()=>setShowProductModal(false)} className="w-full mt-2 text-gray-500 p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition">Cancel</button>
            </div>
        </div>)}
        
        {/* BOOST MODAL - REMOVED, now navigation is used */}
        {/* {showBoostModal && boostTarget && <BoostModal target={boostTarget} onClose={() => setShowBoostModal(false)} onBoost={handleBoost} />} */}

        {/* NEW: VERIFICATION MODAL */}
        {showVerifyModal && (
            <VerificationModal 
                onClose={() => setShowVerifyModal(false)} 
                target={{ id: page.id, type: 'business', name: page.name }} 
            />
        )}
    </div>
  );
};

export default BusinessPage;