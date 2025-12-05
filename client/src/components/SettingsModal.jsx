import React, { useState } from 'react';
import { auth, db } from '../api/firebase';
import { sendPasswordResetEmail, signOut, deleteUser } from 'firebase/auth';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useTheme } from '../context/ThemeContext'; // <--- Re-imported
import EditProfileModal from './EditProfileModal';

// IMPORTANT: Per instructions, we are using custom UI instead of window.confirm/alert
const ConfirmationModal = ({ message, onConfirm, onCancel, title = "Confirm Action" }) => (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[10001] p-4">
        <div className="bg-white reading:bg-[#FFFCF0] p-6 rounded-2xl shadow-2xl w-full max-w-sm text-center">
            <h4 className="text-xl font-bold text-gray-900 mb-4">{title}</h4>
            <p className="text-gray-600 mb-6">{message}</p>
            <div className="flex justify-center gap-3">
                <button 
                    onClick={onCancel} 
                    className="bg-gray-100 text-gray-700 font-semibold px-4 py-2 rounded-xl hover:bg-gray-200 transition-colors flex-1"
                >
                    Cancel
                </button>
                <button 
                    onClick={onConfirm} 
                    className="bg-red-500 text-white font-semibold px-4 py-2 rounded-xl hover:bg-red-600 transition-colors flex-1"
                >
                    Confirm
                </button>
            </div>
        </div>
    </div>
);


const SettingsModal = ({ user, onClose }) => {
  const [currentView, setCurrentView] = useState('main'); 
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmState, setConfirmState] = useState(null); // { action: 'signout' | 'delete', message: string }
  
  // Use the theme context
  const { theme, toggleTheme } = useTheme();

  const [settings, setSettings] = useState({
    privateAccount: user.isPrivate || false,
    activeStatus: user.isOnline || true,
    notifications: true,
  });

  // Replaces window.alert
  const showMessage = (msg) => {
    setConfirmState({
        action: 'message',
        message: msg,
        title: "Notification"
    });
  };

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
    if (!user.email) return showMessage("No email address found for your account.");
    setLoading(true);
    try {
        await sendPasswordResetEmail(auth, user.email);
        showMessage(`Password reset email sent to ${user.email}`);
    } catch (e) {
        showMessage("Error sending reset email: " + e.message);
    } finally {
        setLoading(false);
  };
  };

  const handleSignOut = () => {
    setConfirmState({
        action: 'signout',
        message: "Are you sure you want to sign out?",
        title: "Confirm Sign Out"
    });
  };

  const confirmSignOut = async () => {
    setConfirmState(null);
    try {
        await signOut(auth);
        window.location.reload();
    } catch (e) {
        console.error("Error signing out:", e);
    }
  };

  const handleDeleteAccount = () => {
      setConfirmState({
        action: 'delete',
        message: "⚠️ ARE YOU SURE? This will permanently delete your account and all associated data. This cannot be undone.",
        title: "Permanent Deletion"
      });
  };
  
  const confirmDeleteAccount = async () => {
      setConfirmState(null);
      setLoading(true);
      try {
          await deleteDoc(doc(db, 'users', user.uid));
          await deleteUser(auth.currentUser);
          showMessage("Account deleted successfully. Goodbye!");
          // Wait a moment before reloading to let the message display
          setTimeout(() => window.location.reload(), 1500);
      } catch (error) {
          console.error("Delete Error:", error);
          if (error.code === 'auth/requires-recent-login') {
              showMessage("Security check: Please sign out and sign in again before deleting your account.");
          } else {
              showMessage("Failed to delete account: " + error.message);
          }
      } finally {
          setLoading(false);
      }
  };

  // --- Components ---
  const MenuItem = ({ id, icon, label, color = "text-gray-600", bg = "bg-gray-100" }) => (
    <button 
        onClick={() => setCurrentView(id)} 
        className="w-full bg-white reading:bg-[#FFFCF0] border border-gray-100 reading:border-[#E8E0C5] p-4 rounded-2xl flex items-center justify-between hover:bg-gray-50 reading:hover:bg-[#EBE0C5] transition-all shadow-sm mb-3 group"
    >
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${bg} ${color} group-hover:scale-110 transition-transform`}>
          <i className={`fas ${icon}`}></i>
        </div>
        <span className="font-bold text-gray-900 reading:text-[#4A3B2A] text-lg">{label}</span>
      </div>
      <i className="fas fa-chevron-right text-gray-300"></i>
    </button>
  );

  const PageHeader = ({ title }) => (
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 reading:border-[#E8E0C5]">
          <button onClick={() => setCurrentView('main')} className="w-8 h-8 rounded-full bg-gray-100 reading:bg-[#F0EAD6] flex items-center justify-center hover:bg-gray-200 reading:hover:bg-[#EBE0C5] transition-colors">
              <i className="fas fa-arrow-left text-gray-600 reading:text-[#4A3B2A]"></i>
          </button>
          <h2 className="text-xl font-black text-gray-900 reading:text-[#2E2218]">{title}</h2>
      </div>
  );

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-fade-in">
        <div className="bg-white reading:bg-[#FFFCF0] w-full max-w-lg rounded-[30px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] relative transition-colors duration-300">
            
            <button onClick={onClose} className="absolute top-5 right-5 z-10 text-gray-400 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 reading:bg-[#F0EAD6] hover:bg-gray-100 reading:hover:bg-[#EBE0C5] transition-all">
                <i className="fas fa-times text-lg"></i>
            </button>

            <div className="flex-1 overflow-y-auto p-6 md:p-8">
                
                {/* === MAIN MENU === */}
                {currentView === 'main' && (
                    <div className="animate-slide-in">
                        <h2 className="text-3xl font-black text-gray-900 reading:text-[#2E2218] mb-2">Settings</h2>
                        <p className="text-gray-500 reading:text-[#8C7B65] font-bold mb-8">Manage your account & preferences</p>
                        
                        <div className="space-y-1">
                            <MenuItem id="account" icon="fa-user-circle" label="Account" color="text-blue-500" bg="bg-blue-50 reading:bg-[#F0EAD6]" />
                            <MenuItem id="privacy" icon="fa-lock" label="Privacy" color="text-purple-500" bg="bg-purple-50 reading:bg-[#F0EAD6]" />
                            <MenuItem id="security" icon="fa-shield-alt" label="Security" color="text-green-500" bg="bg-green-50 reading:bg-[#F0EAD6]" />
                            {/* Re-added Display for Reading Mode */}
                            <MenuItem id="display" icon="fa-book-open" label="Display" color="text-orange-500" bg="bg-orange-50 reading:bg-[#F0EAD6]" />
                            <MenuItem id="help" icon="fa-question-circle" label="Help & Support" color="text-cyan-500" bg="bg-cyan-50 reading:bg-[#F0EAD6]" />
                        </div>

                        <div className="mt-8 pt-6 border-t border-gray-100 reading:border-[#E8E0C5]">
                            <button onClick={handleSignOut} className="w-full bg-red-50 reading:bg-[#F8F5E6] text-red-500 p-4 rounded-2xl flex items-center justify-center gap-2 font-bold hover:bg-red-100 reading:hover:bg-[#EBE0C5] transition-all">
                                <i className="fas fa-sign-out-alt"></i> Log Out
                            </button>
                        </div>
                    </div>
                )}

                {/* 1. ACCOUNT PAGE */}
                {currentView === 'account' && (
                     <div className="animate-slide-in">
                        <PageHeader title="Account" />
                        <div className="text-center mb-8">
                            <img src={user.photoURL || "https://placehold.co/150x150/e0e0e0/333?text=PFP"} className="w-24 h-24 rounded-full object-cover border-4 border-gray-50 reading:border-[#E8E0C5] mb-3 mx-auto" alt="User" />
                            <h3 className="text-xl font-bold text-gray-900 reading:text-[#2E2218]">{user.displayName}</h3>
                            <p className="text-gray-500 reading:text-[#8C7B65]">@{user.handle || 'user'}</p>
                            <button onClick={() => setShowEditProfile(true)} className="mt-4 bg-gray-900 reading:bg-[#4A3B2A] text-white px-6 py-2 rounded-xl font-bold text-sm shadow-lg hover:opacity-90 transition-all">Edit Profile</button>
                        </div>
                        <div className="space-y-4">
                            <div className="bg-gray-50 reading:bg-[#F0EAD6] p-4 rounded-2xl">
                                <label className="text-xs font-bold text-gray-400 reading:text-[#8C7B65] uppercase">Email</label>
                                <p className="font-bold text-gray-900 reading:text-[#4A3B2A]">{user.email}</p>
                            </div>
                            <div className="bg-gray-50 reading:bg-[#F0EAD6] p-4 rounded-2xl">
                                <label className="text-xs font-bold text-gray-400 reading:text-[#8C7B65] uppercase">Member Since</label>
                                <p className="font-bold text-gray-900 reading:text-[#4A3B2A]">{user.metadata?.creationTime ? new Date(user.metadata.creationTime).toDateString() : 'N/A'}</p>
                            </div>
                        </div>
                        <div className="mt-8 pt-6 border-t border-gray-100 reading:border-[#E8E0C5]">
                            <h4 className="text-red-500 font-bold mb-2 text-sm uppercase tracking-wider">Danger Zone</h4>
                            <button 
                                onClick={handleDeleteAccount}
                                disabled={loading}
                                className="w-full border-2 border-red-100 reading:border-[#E8E0C5] text-red-500 p-3 rounded-xl font-bold text-sm hover:bg-red-50 reading:hover:bg-[#EBE0C5] transition-all flex items-center justify-center gap-2"
                            >
                                {loading ? 'Deleting...' : <><i className="fas fa-trash-alt"></i> Delete Account</>}
                            </button>
                        </div>
                     </div>
                )}

                {/* 2. PRIVACY PAGE */}
                {currentView === 'privacy' && (
                    <div className="animate-slide-in">
                        <PageHeader title="Privacy" />
                        <div className="space-y-4">
                            <div className="flex justify-between items-center p-4 border border-gray-100 reading:border-[#E8E0C5] rounded-2xl bg-white reading:bg-[#FFFCF0]">
                                <div>
                                    <h5 className="font-bold text-gray-900 reading:text-[#4A3B2A] text-lg">Private Account</h5>
                                    <p className="text-xs text-gray-500 reading:text-[#8C7B65] mt-1">Only followers can see your posts.</p>
                                </div>
                                <div onClick={() => handleToggle('privateAccount')} className={`w-14 h-8 rounded-full cursor-pointer transition-colors relative ${settings.privateAccount ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                                    <div className={`w-6 h-6 bg-white rounded-full absolute top-1 transition-all shadow-sm ${settings.privateAccount ? 'left-7' : 'left-1'}`}></div>
                                </div>
                            </div>
                            <div className="flex justify-between items-center p-4 border border-gray-100 reading:border-[#E8E0C5] rounded-2xl bg-white reading:bg-[#FFFCF0]">
                                <div>
                                    <h5 className="font-bold text-gray-900 reading:text-[#4A3B2A] text-lg">Active Status</h5>
                                    <p className="text-xs text-gray-500 reading:text-[#8C7B65] mt-1">Show when you're online.</p>
                                </div>
                                <div onClick={() => handleToggle('activeStatus')} className={`w-14 h-8 rounded-full cursor-pointer transition-colors relative ${settings.activeStatus ? 'bg-indigo-500' : 'bg-gray-300'}`}>
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
                        <div className="p-6 border border-orange-100 reading:border-[#E8E0C5] bg-orange-50 reading:bg-[#F0EAD6] rounded-3xl text-center">
                            <div className="w-16 h-16 bg-white reading:bg-[#FFFCF0] rounded-full flex items-center justify-center text-orange-500 text-2xl shadow-sm mx-auto mb-4">
                                <i className="fas fa-key"></i>
                            </div>
                            <h4 className="font-bold text-gray-900 reading:text-[#4A3B2A] text-lg mb-2">Change Password</h4>
                            <p className="text-sm text-gray-600 reading:text-[#8C7B65] mb-6">We'll send you an email to reset your password securely.</p>
                            <button onClick={handlePasswordReset} disabled={loading} className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-orange-600 transition-all disabled:opacity-50">
                                {loading ? 'Sending...' : 'Send Reset Link'}
                            </button>
                        </div>
                    </div>
                )}

                {/* 4. DISPLAY PAGE (Reading Mode) */}
                {currentView === 'display' && (
                    <div className="animate-slide-in">
                        <PageHeader title="Display" />
                        
                        <div className="bg-yellow-50 reading:bg-[#F0EAD6] p-6 rounded-3xl border border-yellow-100 reading:border-[#E8E0C5] text-center mb-6">
                            <div className="w-16 h-16 bg-white reading:bg-[#FFFCF0] rounded-full flex items-center justify-center text-yellow-600 text-3xl shadow-sm mx-auto mb-3">
                                <i className="fas fa-book-reader"></i>
                            </div>
                            <h4 className="font-bold text-gray-900 reading:text-[#2E2218] text-lg">Reading Mode</h4>
                            <p className="text-sm text-gray-600 reading:text-[#8C7B65] mb-0">Warm, paper-like colors for relaxed viewing.</p>
                        </div>

                        <div className="flex justify-between items-center p-4 border border-gray-100 reading:border-[#E8E0C5] rounded-2xl bg-white reading:bg-[#FFFCF0]">
                            <div>
                                <h5 className="font-bold text-gray-900 reading:text-[#4A3B2A] text-lg">Enable Reading Mode</h5>
                                <p className="text-xs text-gray-500 reading:text-[#8C7B65] mt-1">{theme === 'reading' ? 'On' : 'Off'}</p>
                            </div>
                            <div 
                                onClick={toggleTheme} 
                                className={`w-14 h-8 rounded-full cursor-pointer transition-colors relative ${theme === 'reading' ? 'bg-orange-400' : 'bg-gray-300'}`}
                            >
                                <div className={`w-6 h-6 bg-white rounded-full absolute top-1 transition-all shadow-sm ${theme === 'reading' ? 'left-7' : 'left-1'}`}></div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 5. HELP PAGE */}
                {currentView === 'help' && (
                    <div className="animate-slide-in text-center pt-10">
                        <PageHeader title="Help" />
                        <div className="w-24 h-24 bg-cyan-50 reading:bg-[#F0EAD6] rounded-full flex items-center justify-center text-cyan-500 text-4xl mx-auto mb-6">
                            <i className="fas fa-life-ring"></i>
                        </div>
                        <h3 className="text-2xl font-black text-gray-900 reading:text-[#2E2218] mb-2">Need Support?</h3>
                        <p className="text-gray-500 reading:text-[#8C7B65] mb-8 max-w-xs mx-auto">Our team is here to help you with any issues regarding your account.</p>
                        <button className="bg-gray-900 reading:bg-[#4A3B2A] text-white px-8 py-3 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg">Contact Support</button>
                    </div>
                )}

            </div>
        </div>

        {showEditProfile && (
            <div className="absolute inset-0 z-[10000]">
                <EditProfileModal user={user} onClose={() => setShowEditProfile(false)} onSave={() => window.location.reload()} />
            </div>
        )}
        
        {/* Confirmation/Message Modal */}
        {confirmState && confirmState.action !== 'message' && (
            <ConfirmationModal 
                title={confirmState.title}
                message={confirmState.message}
                onConfirm={confirmState.action === 'signout' ? confirmSignOut : confirmDeleteAccount}
                onCancel={() => setConfirmState(null)}
            />
        )}
        {confirmState && confirmState.action === 'message' && (
            <ConfirmationModal 
                title={confirmState.title}
                message={confirmState.message}
                onConfirm={() => setConfirmState(null)}
                onCancel={() => setConfirmState(null)}
                // Use a different color for message confirmation (e.g., blue)
                // We overwrite the 'Confirm' button with a simple 'OK' button here.
            >
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[10001] p-4">
                    <div className="bg-white reading:bg-[#FFFCF0] p-6 rounded-2xl shadow-2xl w-full max-w-sm text-center">
                        <h4 className="text-xl font-bold text-gray-900 mb-4">{confirmState.title}</h4>
                        <p className="text-gray-600 mb-6">{confirmState.message}</p>
                        <button 
                            onClick={() => setConfirmState(null)}
                            className="bg-indigo-500 text-white font-semibold px-4 py-2 rounded-xl hover:bg-indigo-600 transition-colors w-full"
                        >
                            OK
                        </button>
                    </div>
                </div>
            </ConfirmationModal>
        )}
    </div>
  );
};

export default SettingsModal;