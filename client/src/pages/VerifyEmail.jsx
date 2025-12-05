import React, { useState } from 'react';
import { auth } from '../api/firebase';
import { sendEmailVerification, signOut } from 'firebase/auth';

const VerifyEmail = ({ user }) => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleCheckVerification = async () => {
    setLoading(true);
    try {
      // Reload user to get the latest emailVerified status from Firebase
      await user.reload();
      if (user.emailVerified) {
        // If verified, forcing a page reload will let App.jsx see the new status
        window.location.reload();
      } else {
        setMessage("Not verified yet. Please check your email (and spam folder).");
      }
    } catch (e) {
      console.error(e);
      setMessage("Error checking status. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    try {
      await sendEmailVerification(user);
      setMessage("Verification email resent! Check your inbox.");
    } catch (e) {
      console.error(e);
      setMessage("Error resending email. Try again later.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    signOut(auth).then(() => window.location.reload());
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f8] p-4">
      <div className="bg-white w-full max-w-md rounded-[30px] shadow-2xl p-8 text-center animate-fade-in">
        
        {/* Icon */}
        <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">
          📧
        </div>

        <h1 className="text-2xl font-black text-dark mb-2">Verify your Email</h1>
        <p className="text-gray-500 mb-6">
          We sent a verification link to <br/>
          <span className="font-bold text-primary">{user.email}</span>
        </p>

        {message && (
          <div className="mb-6 p-3 bg-blue-50 text-blue-600 text-sm font-bold rounded-xl border border-blue-100">
            {message}
          </div>
        )}

        <div className="space-y-3">
          <button 
            onClick={handleCheckVerification} 
            disabled={loading}
            className="w-full bg-primary text-white font-bold py-3.5 rounded-xl hover:bg-primary-dark transition-all shadow-lg shadow-primary/20"
          >
            {loading ? 'Checking...' : 'I have Verified'}
          </button>

          <button 
            onClick={handleResend}
            disabled={loading}
            className="w-full bg-white border-2 border-gray-100 text-gray-600 font-bold py-3.5 rounded-xl hover:bg-gray-50 transition-all"
          >
            Resend Email
          </button>

          <button 
            onClick={handleSignOut}
            className="text-sm text-gray-400 font-bold hover:text-red-500 transition-colors mt-4"
          >
            Sign Out / Use Different Email
          </button>
        </div>

      </div>
    </div>
  );
};

export default VerifyEmail;