import React, { useState } from 'react';
import { auth, db } from '../api/firebase';
import { sendPasswordResetEmail, signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import EditProfileModal from './EditProfileModal';

const SettingsModal = ({ user, onClose }) => {
  // 'main' shows the list. 'account', 'privacy', etc. show the specific page.
  const [currentView, setCurrentView] = useState('main'); 
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [loading, setLoading] = useState(false);

  // --- Toggles State ---
  const [settings, setSettings] = useState({
    privateAccount: user.isPrivate || false,
    activeStatus: user.isOnline || true,
    notifications: true,
    darkMode: false,
  });

  // --- Handlers ---
  const handleToggle = async (key) => {
    const newVal = !settings[key];
    setSettings({ ...settings, [key]: newVal });
    try {
        if (key === 'privateAccount') {
            await updateDoc(doc(db, 'users', user.uid), { isPrivate: newVal });
        }
    } catch (e) {
        console.error("Error updating setting:", e);
    }
  };

  const handlePasswordReset = async () => {
    if (!user.email) return alert("No email found.");
    setLoading(true);
    try {
        await sendPasswordResetEmail(auth, user.email);
        alert(`Password reset email sent to ${user.email}`);
    } catch (e) {
        alert("Error sending reset email: " + e.message);
    } finally {
        setLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (window.confirm("Are you sure you want to sign out?")) {
        await signOut(auth);
        window.location.reload();
    }
  };

  // --- Components ---

  // 1. The Main Menu Item Row
  const MenuItem = ({ id, icon, label, color = "text-gray-600", bg = "bg-gray-100" }) => (
    <button 
        onClick={() => setCurrentView(id)} 
        className="w-full bg-white border border-gray-100 p-4 rounded-2xl flex items-center justify-between hover:bg-gray-50 transition-all shadow-sm mb-3 group"
    >
        <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${bg} ${color} group-hover:scale-110 transition-transform`}>
                <i className={`fas ${icon}`}></i>
            </div>
            <span className="font-bold text-dark text-lg">{label}</span>
        </div>
        <i className="fas fa-chevron-right text-gray-300"></i>
    </button>
  );

  // 2. Header for Sub-Pages
  const PageHeader = ({ title }) => (
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
          <button onClick={() => setCurrentView('main')} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
              <i className="fas fa-arrow-left text-gray-600"></i>
          </button>
          <h2 className="text-xl font-black text-dark">{title}</h2>
      </div>
  );

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-fade-in">
        <div className="bg-white w-full max-w-lg rounded-[30px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] relative">
            
            {/* GLOBAL CLOSE BUTTON */}
            <button onClick={onClose} className="absolute top-5 right-5 z-10 text-gray-400 hover:text-dark w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 hover:bg-gray-100 transition-all">
                <i className="fas fa-times text-lg"></i>
            </button>

            <div className="flex-1 overflow-y-auto p-6 md:p-8">
                
                {/* === MAIN MENU VIEW === */}
                {currentView === 'main' && (
                    <div className="animate-slide-in">
                        <h2 className="text-3xl font-black text-dark mb-2">Settings</h2>
                        <p className="text-gray-500 font-bold mb-8">Manage your account & preferences</p>
                        
                        <div className="space-y-1">
                            <MenuItem id="account" icon="fa-user-circle" label="Account" color="text-blue-500" bg="bg-blue-50" />
                            <MenuItem id="privacy" icon="fa-lock" label="Privacy" color="text-purple-500" bg="bg-purple-50" />
                            <MenuItem id="security" icon="fa-shield-alt" label="Security" color="text-green-500" bg="bg-green-50" />
                            <MenuItem id="display" icon="fa-moon" label="Display" color="text-orange-500" bg="bg-orange-50" />
                            <MenuItem id="help" icon="fa-question-circle" label="Help & Support" color="text-cyan-500" bg="bg-cyan-50" />
                        </div>

                        <div className="mt-8 pt-6 border-t border-gray-100">
                            <button onClick={handleSignOut} className="w-full bg-red-50 text-red-500 p-4 rounded-2xl flex items-center justify-center gap-2 font-bold hover:bg-red-100 transition-all">
                                <i className="fas fa-sign-out-alt"></i> Log Out
                            </button>
                        </div>
                    </div>
                )}

                {/* === SUB PAGES === */}

                {/* 1. ACCOUNT PAGE */}
                {currentView === 'account' && (
                    <div className="animate-slide-in">
                        <PageHeader title="Account" />
                        
                        <div className="flex flex-col items-center mb-8">
                            <img src={user.photoURL || "https://via.placeholder.com/150"} className="w-24 h-24 rounded-full object-cover border-4 border-gray-50 mb-3" />
                            <h3 className="text-xl font-bold text-dark">{user.displayName}</h3>
                            <p className="text-gray-500 font-medium">@{user.handle || 'username'}</p>
                            <button onClick={() => setShowEditProfile(true)} className="mt-4 bg-dark text-white px-6 py-2 rounded-xl font-bold text-sm shadow-lg hover:bg-primary transition-all">Edit Profile</button>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-gray-50 p-4 rounded-2xl">
                                <label className="text-xs font-bold text-gray-400 uppercase">Email</label>
                                <p className="font-bold text-dark">{user.email}</p>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-2xl">
                                <label className="text-xs font-bold text-gray-400 uppercase">Member Since</label>
                                <p className="font-bold text-dark">{user.metadata?.creationTime ? new Date(user.metadata.creationTime).toDateString() : 'N/A'}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. PRIVACY PAGE */}
                {currentView === 'privacy' && (
                    <div className="animate-slide-in">
                        <PageHeader title="Privacy" />
                        
                        <div className="space-y-4">
                            <div className="flex justify-between items-center p-4 border border-gray-100 rounded-2xl">
                                <div>
                                    <h5 className="font-bold text-dark text-lg">Private Account</h5>
                                    <p className="text-xs text-gray-500 mt-1">Only followers can see your posts.</p>
                                </div>
                                <div onClick={() => handleToggle('privateAccount')} className={`w-14 h-8 rounded-full cursor-pointer transition-colors relative ${settings.privateAccount ? 'bg-primary' : 'bg-gray-300'}`}>
                                    <div className={`w-6 h-6 bg-white rounded-full absolute top-1 transition-all shadow-sm ${settings.privateAccount ? 'left-7' : 'left-1'}`}></div>
                                </div>
                            </div>

                            <div className="flex justify-between items-center p-4 border border-gray-100 rounded-2xl">
                                <div>
                                    <h5 className="font-bold text-dark text-lg">Active Status</h5>
                                    <p className="text-xs text-gray-500 mt-1">Show when you're online.</p>
                                </div>
                                <div onClick={() => handleToggle('activeStatus')} className={`w-14 h-8 rounded-full cursor-pointer transition-colors relative ${settings.activeStatus ? 'bg-primary' : 'bg-gray-300'}`}>
                                    <div className={`w-6 h-6 bg-white rounded-full absolute top-1 transition-all shadow-sm ${settings.activeStatus ? 'left-7' : 'left-1'}`}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. SECURITY PAGE */}
                {currentView === 'security' && (
                    <div className="animate-slide-in">
                        <PageHeader title="Security" />
                        
                        <div className="p-6 border border-orange-100 bg-orange-50 rounded-3xl text-center">
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-orange-500 text-2xl shadow-sm mx-auto mb-4">
                                <i className="fas fa-key"></i>
                            </div>
                            <h4 className="font-bold text-dark text-lg mb-2">Change Password</h4>
                            <p className="text-sm text-gray-600 mb-6">We'll send you an email to reset your password securely.</p>
                            <button onClick={handlePasswordReset} disabled={loading} className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-orange-600 transition-all">
                                {loading ? 'Sending...' : 'Send Reset Link'}
                            </button>
                        </div>
                    </div>
                )}

                {/* 4. DISPLAY PAGE */}
                {currentView === 'display' && (
                    <div className="animate-slide-in">
                        <PageHeader title="Display" />
                        
                        <div className="flex justify-between items-center p-4 border border-gray-100 rounded-2xl opacity-60">
                            <div>
                                <h5 className="font-bold text-dark text-lg">Dark Mode</h5>
                                <p className="text-xs text-gray-500 mt-1">Coming Soon</p>
                            </div>
                            <div className="w-14 h-8 bg-gray-200 rounded-full relative cursor-not-allowed">
                                <div className="w-6 h-6 bg-white rounded-full absolute top-1 left-1 shadow-sm"></div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 5. HELP PAGE */}
                {currentView === 'help' && (
                    <div className="animate-slide-in text-center pt-10">
                        <PageHeader title="Help" />
                        <div className="w-24 h-24 bg-cyan-50 rounded-full flex items-center justify-center text-cyan-500 text-4xl mx-auto mb-6">
                            <i className="fas fa-life-ring"></i>
                        </div>
                        <h3 className="text-2xl font-black text-dark mb-2">Need Support?</h3>
                        <p className="text-gray-500 mb-8 max-w-xs mx-auto">Our team is here to help you with any issues regarding your account.</p>
                        <button className="bg-dark text-white px-8 py-3 rounded-xl font-bold hover:bg-primary transition-all shadow-lg">Contact Support</button>
                    </div>
                )}

            </div>
        </div>

        {showEditProfile && (
            <div className="absolute inset-0 z-[10000]">
                <EditProfileModal user={user} onClose={() => setShowEditProfile(false)} onSave={() => window.location.reload()} />
            </div>
        )}
    </div>
  );
};

export default SettingsModal;