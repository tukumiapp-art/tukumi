import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './api/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import GlobalListeners from './components/GlobalListeners';
import Auth from './pages/Auth';
import VerifyEmail from './pages/VerifyEmail';

// 🔥 LAZY-LOAD ALL PAGES
const Home = lazy(() => import('./pages/Home'));
const Messages = lazy(() => import('./pages/Messages'));
const Profile = lazy(() => import('./pages/Profile'));
const Circles = lazy(() => import('./pages/Circles'));
const CircleDetails = lazy(() => import('./pages/CircleDetails'));
const Marketplace = lazy(() => import('./pages/Marketplace'));
const ProductDetails = lazy(() => import('./pages/ProductDetails'));
const BusinessHub = lazy(() => import('./pages/BusinessHub'));
const BusinessPage = lazy(() => import('./pages/BusinessPage'));
const SavedItems = lazy(() => import('./pages/SavedItems'));
const Watch = lazy(() => import('./pages/Watch'));
const Dating = lazy(() => import('./pages/Dating'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Connections = lazy(() => import('./pages/Connections'));
const Explore = lazy(() => import('./pages/Explore'));
const PostDetails = lazy(() => import('./pages/PostDetails'));
const BkashCallback = lazy(() => import('./pages/BkashCallback'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const BoostHub = lazy(() => import('./pages/BoostHub'));

// CONTEXT
import { CallProvider } from './context/CallContext';
import CallOverlay from './components/CallOverlay';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeAuth;
    let setOfflineListenerCleanup = () => {};

    unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      setOfflineListenerCleanup();

      if (currentUser) {
        if (currentUser.emailVerified) {
          const userRef = doc(db, 'users', currentUser.uid);
          const setOffline = () => {
            updateDoc(userRef, { isOnline: false, lastSeen: serverTimestamp() })
              .catch(e => console.error(e));
          };

          await updateDoc(userRef, { isOnline: true, lastSeen: serverTimestamp() });
          window.addEventListener('beforeunload', setOffline);
          setOfflineListenerCleanup = () =>
            window.removeEventListener('beforeunload', setOffline);
        }
      }
    });

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
      setOfflineListenerCleanup();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center">
        <div className="flex flex-col items-center animate-pulse">
          <div className="w-16 h-16 bg-gradient-to-tr from-[#008080] to-[#FFD166] rounded-2xl animate-spin shadow-2xl shadow-teal-900/20 mb-6 flex items-center justify-center">
            <div className="w-8 h-8 bg-white/30 rounded-md"></div>
          </div>
          <p className="text-[#008080] font-black text-sm tracking-[0.3em] uppercase">
            INITIALIZING TUKUMI...
          </p>
        </div>
      </div>
    );
  }

  if (!user) return <Auth />;

  if (!user.emailVerified) return <VerifyEmail user={user} />;

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CallProvider>
        <GlobalListeners />
        <CallOverlay />

        <div className="min-h-screen bg-[#f0f4f8] text-[#111827]">
          <Sidebar />
          <MobileNav />

          <div className="w-full md:ml-[300px] md:w-[calc(100%-300px)] p-4 pb-28 transition-all duration-300">

            {/* ⭐ WRAPPED IN SUSPENSE FOR LAZY LOADING */}
            <Suspense fallback={<div className="p-10 text-center">Loading...</div>}>

              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/explore" element={<Explore />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/profile/:id" element={<Profile />} />
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
                <Route path="/post/:id" element={<PostDetails />} />
                <Route path="/bkash/callback" element={<BkashCallback />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/boost" element={<BoostHub />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>

            </Suspense>
          </div>
        </div>
      </CallProvider>
    </BrowserRouter>
  );
}

export default App;
