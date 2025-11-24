import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth, storage } from '../api/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, arrayRemove, increment } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import TopBar from '../components/TopBar';

const Circles = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [circles, setCircles] = useState([]);
  const [myCircles, setMyCircles] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Create Form
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('Social');
  const [isPrivate, setIsPrivate] = useState(false);
  const [imageFile, setImageFile] = useState(null);

  const categories = ['Social', 'Science', 'Technology', 'Entertainment', 'Business', 'Lifestyle', 'Art', 'Gaming'];

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => setUser(u));
    const q = query(collection(db, 'circles'), orderBy('memberCount', 'desc'));
    const unsubCircles = onSnapshot(q, (snap) => {
      const allCircles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCircles(allCircles);
    });
    return () => { unsubAuth(); unsubCircles(); };
  }, []);

  useEffect(() => {
    if (user && circles.length > 0) {
      setMyCircles(circles.filter(c => c.members && c.members.includes(user.uid)));
    }
  }, [user, circles]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!user) return alert("Please sign in.");
    setUploading(true);
    
    try {
      let imageURL = `https://ui-avatars.com/api/?name=${name}&background=random`; // Default
      
      if (imageFile) {
        const imgRef = ref(storage, `circles/${Date.now()}_${imageFile.name}`);
        await uploadBytes(imgRef, imageFile);
        imageURL = await getDownloadURL(imgRef);
      }

      await addDoc(collection(db, 'circles'), {
        name,
        description: desc,
        category,
        isPrivate,
        image: imageURL,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        members: [user.uid],
        admins: [user.uid], // Creator is admin
        joinRequests: [],
        memberCount: 1
      });

      setShowCreateModal(false);
      setName(''); setDesc(''); setImageFile(null);
      alert("Circle Created Successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to create circle.");
    } finally {
      setUploading(false);
    }
  };

  const handleJoin = async (circle) => {
    if (!user) return alert("Sign in required.");
    const circleRef = doc(db, 'circles', circle.id);
    
    if (circle.isPrivate) {
      if (circle.joinRequests && circle.joinRequests.includes(user.uid)) {
        alert("Request already sent.");
      } else {
        await updateDoc(circleRef, { joinRequests: arrayUnion(user.uid) });
        alert("Join request sent to admins.");
      }
    } else {
      await updateDoc(circleRef, {
        members: arrayUnion(user.uid),
        memberCount: increment(1)
      });
    }
  };

  return (
    <div className="p-4 md:p-6 w-full max-w-[1400px] mx-auto">
      <div className="hidden md:block"><TopBar /></div>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-black text-dark tracking-tight flex items-center gap-3">
            <i className="fas fa-dot-circle text-primary"></i> Circles
          </h2>
          <p className="text-gray-500 font-medium">Find your tribe. Join the elite.</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="bg-gradient-to-r from-primary to-primary-light text-white px-6 py-3 rounded-full font-bold shadow-lg hover:shadow-primary/30 transition-all flex items-center gap-2">
          <i className="fas fa-plus"></i> Create Circle
        </button>
      </div>

      {/* My Circles */}
      {myCircles.length > 0 && (
        <div className="mb-10">
          <h3 className="text-xl font-bold text-dark mb-4 px-2">My Circles</h3>
          <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
            {myCircles.map(circle => (
              <div key={circle.id} onClick={() => navigate(`/circles/${circle.id}`)} className="flex-shrink-0 w-64 glass-panel rounded-[30px] p-4 hover:scale-105 transition-transform cursor-pointer border border-white/60 relative overflow-hidden group">
                 <div className="absolute inset-0 bg-cover bg-center opacity-20 group-hover:opacity-30 transition-opacity" style={{ backgroundImage: `url(${circle.image})` }}></div>
                 <div className="relative z-10 flex flex-col items-center text-center">
                    <img src={circle.image} className="w-20 h-20 rounded-full border-4 border-white shadow-md mb-3 object-cover" />
                    <h4 className="font-bold text-dark text-lg leading-tight mb-1 truncate w-full">{circle.name}</h4>
                    <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full">{circle.memberCount} Members</span>
                 </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Discover Grid */}
      <h3 className="text-xl font-bold text-dark mb-6 px-2">Discover</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {circles.map(circle => {
          const isMember = user && circle.members && circle.members.includes(user.uid);
          const isRequested = user && circle.joinRequests && circle.joinRequests.includes(user.uid);
          
          return (
            <div key={circle.id} className="glass-panel rounded-[30px] p-6 flex items-center gap-5 hover:shadow-xl transition-all border border-white/50 cursor-pointer" onClick={() => navigate(`/circles/${circle.id}`)}>
               <img src={circle.image} className="w-24 h-24 rounded-full object-cover shadow-lg border-4 border-white/50" />
               <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                     <span className="bg-gray-100 text-[10px] font-bold px-2 py-0.5 rounded-md text-gray-500 mb-1">{circle.category}</span>
                     {circle.isPrivate && <i className="fas fa-lock text-gray-400 text-xs"></i>}
                  </div>
                  <h4 className="font-black text-xl text-dark truncate">{circle.name}</h4>
                  <p className="text-sm text-gray-500 line-clamp-2 mb-4">{circle.description}</p>
                  
                  <div className="flex justify-between items-center">
                     <span className="text-xs font-bold text-gray-400"><i className="fas fa-users mr-1"></i> {circle.memberCount}</span>
                     <button 
                        onClick={(e) => { e.stopPropagation(); if (!isMember && !isRequested) handleJoin(circle); }}
                        className={`text-xs font-bold px-5 py-2 rounded-full transition-colors shadow-sm
                        ${isMember ? 'bg-gray-100 text-gray-400' : isRequested ? 'bg-yellow-100 text-yellow-600' : 'bg-dark text-white hover:bg-primary'}`}
                     >
                       {isMember ? 'Joined' : isRequested ? 'Pending' : 'Join'}
                     </button>
                  </div>
               </div>
            </div>
          );
        })}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[30px] shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#F8FAFD]">
              <h3 className="font-black text-xl text-dark">Create Circle</h3>
              <button onClick={() => setShowCreateModal(false)}><i className="fas fa-times text-gray-400 hover:text-dark"></i></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
               <input type="text" required placeholder="Circle Name" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3" value={name} onChange={e => setName(e.target.value)} />
               <textarea required placeholder="Description" rows="3" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3" value={desc} onChange={e => setDesc(e.target.value)}></textarea>
               
               <div className="grid grid-cols-2 gap-4">
                 <select className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3" value={category} onChange={e => setCategory(e.target.value)}>
                   {categories.map(c => <option key={c} value={c}>{c}</option>)}
                 </select>
                 <div className="flex items-center justify-center bg-gray-50 border border-gray-200 rounded-xl px-4">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 font-bold">
                      <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} /> Private
                    </label>
                 </div>
               </div>

               <div className="border-dashed border-2 border-gray-200 rounded-xl p-4 text-center">
                 <label className="cursor-pointer">
                   <span className="text-primary font-bold text-sm">Upload Cover Image</span>
                   <input type="file" className="hidden" accept="image/*" onChange={e => setImageFile(e.target.files[0])} />
                 </label>
                 {imageFile && <p className="text-xs text-gray-500 mt-2">{imageFile.name}</p>}
               </div>

               <button type="submit" disabled={uploading} className="w-full bg-primary text-white font-bold py-4 rounded-xl hover:bg-primary-dark transition-all shadow-lg">
                 {uploading ? 'Creating...' : 'Launch Circle'}
               </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Circles;