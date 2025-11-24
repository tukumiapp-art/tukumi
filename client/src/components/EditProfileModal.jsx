import React, { useState } from 'react';
import { db, storage } from '../api/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const EditProfileModal = ({ user, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    displayName: user.displayName || '',
    bio: user.bio || '',
    profession: user.profession || '',
    location: user.location || '',
    handle: user.handle || ''
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      let photoURL = user.photoURL;
      let coverPhotoURL = user.coverPhotoURL;

      // Upload Profile Photo
      if (photoFile) {
        const photoRef = ref(storage, `users/${user.uid}/profile_${Date.now()}`);
        await uploadBytes(photoRef, photoFile);
        photoURL = await getDownloadURL(photoRef);
      }

      // Upload Cover Photo
      if (coverFile) {
        const coverRef = ref(storage, `users/${user.uid}/cover_${Date.now()}`);
        await uploadBytes(coverRef, coverFile);
        coverPhotoURL = await getDownloadURL(coverRef);
      }

      // Update Firestore
      await updateDoc(doc(db, 'users', user.uid), {
        ...formData,
        photoURL,
        coverPhotoURL
      });

      onSave(); // Refresh parent data
      onClose(); // Close modal
    } catch (error) {
      console.error("Error updating profile:", error);
      alert("Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-[30px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#F8FAFD]">
          <h3 className="font-black text-xl text-dark">Edit Profile</h3>
          <button onClick={onClose}><i className="fas fa-times text-gray-400 hover:text-dark"></i></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Images */}
          <div className="space-y-4">
             <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center">
                <p className="text-xs font-bold text-gray-500 mb-2">Profile Photo</p>
                <input type="file" onChange={e => setPhotoFile(e.target.files[0])} className="text-sm" />
             </div>
             <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center">
                <p className="text-xs font-bold text-gray-500 mb-2">Cover Photo</p>
                <input type="file" onChange={e => setCoverFile(e.target.files[0])} className="text-sm" />
             </div>
          </div>

          {/* Fields */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Display Name</label>
              <input className="w-full bg-gray-50 p-3 rounded-xl font-bold" value={formData.displayName} onChange={e => setFormData({...formData, displayName: e.target.value})} />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Bio</label>
              <textarea rows="3" className="w-full bg-gray-50 p-3 rounded-xl" value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})}></textarea>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Profession</label>
                  <input className="w-full bg-gray-50 p-3 rounded-xl" value={formData.profession} onChange={e => setFormData({...formData, profession: e.target.value})} />
               </div>
               <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Location</label>
                  <input className="w-full bg-gray-50 p-3 rounded-xl" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
               </div>
            </div>
          </div>

        </div>

        <div className="p-6 border-t border-gray-100 bg-white">
          <button onClick={handleSave} disabled={loading} className="w-full bg-dark text-white font-bold py-4 rounded-xl hover:bg-primary transition-all shadow-lg">
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default EditProfileModal;