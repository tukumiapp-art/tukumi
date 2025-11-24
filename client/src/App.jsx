import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './api/firebase'; 
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import GlobalListeners from './components/GlobalListeners'; // <--- IMPORT
import Auth from './pages/Auth';
import Home from './pages/Home';
import Messages from './pages/Messages';
import Profile from './pages/Profile';
import Circles from './pages/Circles';
import CircleDetails from './pages/CircleDetails';
import Marketplace from './pages/Marketplace';
import ProductDetails from './pages/ProductDetails';
import BusinessHub from './pages/BusinessHub';
import BusinessPage from './pages/BusinessPage';
import SavedItems from './pages/SavedItems';
import Watch from './pages/Watch';
import Dating from './pages/Dating';
import Notifications from './pages/Notifications'; 
import Connections from './pages/Connections'; 
import Explore from './pages/Explore';         // <--- IMPORT

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeAuth;
    unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, { isOnline: true, lastSeen: serverTimestamp() });
        const setOffline = () => updateDoc(userRef, { isOnline: false, lastSeen: serverTimestamp() });
        window.addEventListener('beforeunload', setOffline);
        return () => window.removeEventListener('beforeunload', setOffline);
      }
    });
    return () => { if (unsubscribeAuth) unsubscribeAuth(); };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center">
        <div className="flex flex-col items-center animate-pulse">
          <div className="w-16 h-16 bg-gradient-to-tr from-[#008080] to-[#FFD166] rounded-2xl animate-spin shadow-2xl shadow-teal-900/20 mb-6 flex items-center justify-center">
            <div className="w-8 h-8 bg-white/30 rounded-md"></div>
          </div>
          <p className="text-[#008080] font-black text-sm tracking-[0.3em] uppercase">INITIALIZING TUKUMI...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Auth />;

  return (
    <BrowserRouter>
      {/* ADDED <GlobalListeners /> HERE */}
      <GlobalListeners /> 

      <div className="min-h-screen bg-[#f0f4f8] text-[#111827]">
        <Sidebar />
        <MobileNav />

        <div className="w-full md:ml-[300px] md:w-[calc(100%-300px)] p-4 pb-28 transition-all duration-300">
          <Routes>
            <Route path="/" element={<Home />} />
            {/* NEW ROUTES */}
            <Route path="/explore" element={<Explore />} /> 
            
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/:id" element={<Profile />} />
            {/* NEW ROUTES */}
            <Route path="/profile/:id/connections" element={<Connections />} /> 
            
            <Route path="/messages" element={<Messages />} />
            <Route path="/watch" element={<Watch />} />
            <Route path="/dating" element={<Dating />} />
            <Route path="/notifications" element={<Notifications />} />
            
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/product/:id" element={<ProductDetails />} />
            <Route path="/business" element={<BusinessHub />} />
            <Route path="/business/:id" element={<BusinessPage />} />
            <Route path="/circles" element={<Circles />} />
            <Route path="/circles/:circleId" element={<CircleDetails />} />
            <Route path="/saved-items" element={<SavedItems />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;