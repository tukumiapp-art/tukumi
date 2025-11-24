import React, { useState, useEffect } from 'react';
import { db, auth, storage } from '../api/firebase';
import { 
  collection, addDoc, serverTimestamp, query, where, onSnapshot 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';

const BusinessHub = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [myPages, setMyPages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // --- CREATE PAGE STATE ---
  const [logoFile, setLogoFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'Retail & E-commerce',
    description: '',
    email: '',
    phone: '',
    website: '',
    address: '',
  });

  const businessCategories = [
    'Retail & E-commerce', 'Technology & Software', 'Professional Services',
    'Food & Beverage', 'Health & Wellness', 'Education & Training',
    'Real Estate & Construction', 'Arts & Entertainment', 'Automotive',
    'Travel & Hospitality', 'Manufacturing & Industrial', 'Fashion & Lifestyle',
    'Legal & Finance', 'Agriculture', 'Non-Profit'
  ];

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const q = query(collection(db, 'business_pages'), where('teamIds', 'array-contains', currentUser.uid));
        const unsubPages = onSnapshot(q, (snap) => {
          setMyPages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsubPages();
      } else {
        setUser(null);
        setMyPages([]);
      }
    });
    return () => unsubAuth();
  }, []);

  const handleCreatePage = async (e) => {
    e.preventDefault();
    if (!user) return alert("Sign in required.");
    if (!formData.name || !logoFile) return alert("Name and Logo are required.");

    setLoading(true);
    try {
      let logoURL = null, coverURL = null;
      if (logoFile) {
        const logoRef = ref(storage, `business/${user.uid}/${Date.now()}_logo`);
        await uploadBytes(logoRef, logoFile);
        logoURL = await getDownloadURL(logoRef);
      }
      if (coverFile) {
        const coverRef = ref(storage, `business/${user.uid}/${Date.now()}_cover`);
        await uploadBytes(coverRef, coverFile);
        coverURL = await getDownloadURL(coverRef);
      }

      const newPage = {
        ...formData,
        ownerId: user.uid,
        teamIds: [user.uid],
        team: [{ uid: user.uid, name: user.displayName, role: 'Admin', avatar: user.photoURL }],
        logo: logoURL,
        coverImage: coverURL || "https://images.unsplash.com/photo-1497366216548-37526070297c",
        isVerified: false,
        followers: 0,
        rating: 0,
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'business_pages'), newPage);
      setShowCreateModal(false);
      // Open the new page immediately
      navigate(`/business/${docRef.id}`);
    } catch (err) {
      console.error(err);
      alert("Failed to create page.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 w-full max-w-[1400px] mx-auto">
      <div className="hidden md:block"><TopBar /></div>
      
      <div className="bg-white rounded-[30px] shadow-sm min-h-[80vh] overflow-hidden">
          {/* Hero */}
          <div className="h-60 bg-gradient-to-r from-dark to-gray-900 flex items-center justify-between p-10 text-white relative overflow-hidden">
              <div className="relative z-10">
                  <h1 className="text-4xl font-black mb-2">Business Hub</h1>
                  <p className="text-white/70">Manage your empire.</p>
              </div>
              {/* Floating Create Button in Hero */}
              <button 
                onClick={() => setShowCreateModal(true)} 
                className="relative z-10 bg-primary hover:bg-primary-light text-white px-6 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2 transition-all"
              >
                <i className="fas fa-plus-circle"></i> Create Page
              </button>
          </div>

          <div className="p-8">
              <h3 className="text-xl font-bold text-dark mb-6">Your Businesses</h3>
              
              {myPages.length === 0 ? (
                  <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-3xl">
                      <i className="fas fa-briefcase text-4xl text-gray-300 mb-4"></i>
                      <p className="text-gray-500 mb-4">You haven't created any business pages yet.</p>
                      <button onClick={() => setShowCreateModal(true)} className="text-primary font-bold">Create one now</button>
                  </div>
              ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {myPages.map(page => (
                          <div key={page.id} onClick={() => navigate(`/business/${page.id}`)} className="bg-white border border-gray-100 rounded-[24px] overflow-hidden shadow-sm hover:shadow-xl transition-all group cursor-pointer">
                              <div className="h-24 bg-gray-200 relative">
                                  <img src={page.coverImage} className="w-full h-full object-cover" />
                                  <div className="absolute -bottom-8 left-6 w-16 h-16 rounded-xl bg-white p-1 shadow-md">
                                      <img src={page.logo} className="w-full h-full rounded-lg object-cover" />
                                  </div>
                              </div>
                              <div className="pt-10 p-6">
                                  <h3 className="font-bold text-dark text-lg mb-1 flex items-center gap-2">
                                      {page.name} {page.isVerified && <i className="fas fa-check-circle text-blue-500 text-xs"></i>}
                                  </h3>
                                  <p className="text-xs text-gray-500 font-bold uppercase mb-4">{page.category}</p>
                                  <button className="w-full bg-gray-50 text-dark font-bold py-2 rounded-lg hover:bg-dark hover:text-white transition-colors text-sm">Manage Page</button>
                              </div>
                          </div>
                      ))}
                  </div>
              )}
          </div>
      </div>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4 animate-fade-in">
            <div className="bg-white w-full max-w-2xl rounded-[30px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#F8FAFD]">
                    <h3 className="font-black text-xl text-dark">Create Business Page</h3>
                    <button onClick={() => setShowCreateModal(false)}><i className="fas fa-times text-gray-400 hover:text-dark"></i></button>
                </div>
                <form onSubmit={handleCreatePage} className="p-6 space-y-6 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Business Name</label><input required className="w-full bg-gray-50 p-3 rounded-xl font-bold outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Category</label><select className="w-full bg-gray-50 p-3 rounded-xl outline-none" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>{businessCategories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                    </div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">Description</label><textarea required rows="3" className="w-full bg-gray-50 p-3 rounded-xl outline-none" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}></textarea></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Email</label><input type="email" className="w-full bg-gray-50 p-3 rounded-xl outline-none" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Website</label><input type="url" className="w-full bg-gray-50 p-3 rounded-xl outline-none" value={formData.website} onChange={e => setFormData({...formData, website: e.target.value})} /></div>
                    </div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">Logo</label><input type="file" required accept="image/*" onChange={e => setLogoFile(e.target.files[0])} /></div>
                    <button type="submit" disabled={loading} className="w-full bg-dark text-white font-bold py-4 rounded-xl hover:bg-primary transition-all">{loading ? 'Creating...' : 'Launch Page'}</button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default BusinessHub;