import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
// FIX: Import the shared instances from your api/firebase.js file
import { auth, db } from '../api/firebase'; 
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';

const Sidebar = () => {
	const navigate = useNavigate();
	const location = useLocation();
	const isActive = (path) => location.pathname === path || (path !== '/' && location.pathname.startsWith(path + '/'));
	
	const [userData, setUserData] = useState({ 
		displayName: '', 
		handle: '', 
		photoURL: null 
	});

	useEffect(() => {
		// Use the imported 'auth' here
		const unsubAuth = onAuthStateChanged(auth, (user) => {
			if (user) {
				setUserData(prev => ({
                    ...prev,
					displayName: user.displayName || 'Aristocrat',
					handle: user.email ? user.email.split('@')[0] : 'user-handle',
					photoURL: user.photoURL
				}));

				const unsubDb = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
					if (docSnap.exists()) {
						setUserData(docSnap.data());
					}
				});
				return () => unsubDb();
			} else {
                 setUserData({ displayName: '', handle: '', photoURL: null });
            }
		});
		return () => unsubAuth();
	}, []);

	const handleSignOut = async () => {
		try {
			await signOut(auth);
            navigate('/auth'); // Redirect to auth page after logout
		} catch (error) {
			console.error("Error signing out", error);
		}
	};

	const NavItem = ({ to, icon, label, badge }) => (
		<div 
			onClick={() => navigate(to)}
			className={`group flex items-center p-3 my-2 rounded-2xl cursor-pointer transition-all duration-200 font-medium
			${isActive(to) && to !== '/' 
				? 'bg-primary text-white shadow-lg shadow-primary/30 translate-x-2' 
				: isActive(to) && to === '/' && location.pathname === '/'
				? 'bg-primary text-white shadow-lg shadow-primary/30 translate-x-2'
				: 'text-gray-600 hover:bg-white hover:text-primary hover:translate-x-1'}`}
		>
			<div className={`w-10 h-10 rounded-xl flex items-center justify-center mr-3 transition-all
				${isActive(to) ? 'bg-white/20' : 'bg-white shadow-sm group-hover:shadow-md'}`}>
				<i className={`fas ${icon} text-lg`}></i>
			</div>
			<span className="tracking-wide">{label}</span>
			{badge && <span className="ml-auto bg-accent text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-sm">{badge}</span>}
		</div>
	);

	return (
		<div className="hidden md:flex flex-col w-[280px] h-[calc(100vh-40px)] fixed top-5 left-5 z-50">
			
			<div className="glass-panel flex-1 rounded-[30px] p-6 flex flex-col overflow-y-auto no-scrollbar">
				
				{/* Logo / Home Button */}
				<div className="flex items-center gap-3 mb-10 pl-2 cursor-pointer" onClick={() => navigate('/')}>
					<div className="w-10 h-10 bg-gradient-to-tr from-primary to-gold rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 relative">
						<i className="fas fa-cube text-white text-lg transform -rotate-12"></i>
					</div>
					<h1 className="text-2xl font-black tracking-tighter text-dark">TUKUMI</h1>
				</div>

				{/* User Profile Card */}
				<div onClick={() => navigate('/profile')} className="mb-8 p-3 bg-white/60 rounded-2xl border border-white flex items-center gap-3 cursor-pointer hover:shadow-md transition-all group">
					<div className="w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden bg-gray-100 border border-white shadow-sm group-hover:scale-105 transition-transform">
						{userData.photoURL ? (
							<img src={userData.photoURL} onError={(e) => { e.target.onerror = null; e.target.src="https://via.placeholder.com/150" }} className="w-full h-full object-cover" alt="Profile" />
						) : (
							<div className="w-full h-full flex items-center justify-center text-gray-300">
								<i className="fas fa-user text-xl"></i>
							</div>
						)}
					</div>
					<div className="min-w-0">
						<h4 className="font-bold text-sm text-dark truncate">{userData.displayName || 'User'}</h4>
						<p className="text-[10px] text-primary font-bold uppercase tracking-wider">View Profile</p>
					</div>
				</div>

				{/* Navigation Menu */}
				<div className="space-y-1">
					<p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-bold mb-3 pl-4">Menu</p>
					
					<NavItem to="/" icon="fa-home" label="Feed" />
					<NavItem to="/explore" icon="fa-compass" label="Explore" badge="" />
					<NavItem to="/circles" icon="fa-dot-circle" label="Circles" />
					<NavItem to="/dating" icon="fa-heart" label="Dating" />
					<NavItem to="/watch" icon="fa-play" label="Watch" />
					<NavItem to="/marketplace" icon="fa-store" label="Market" />
					<NavItem to="/messages" icon="fa-comment-dots" label="Messages" />
				</div>

				{/* Bottom Actions */}
				<div className="mt-auto pt-6 space-y-3">
					<div className="bg-gradient-to-br from-primary to-primary-dark rounded-2xl p-5 text-white text-center relative overflow-hidden shadow-lg shadow-primary/20">
						<div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -mr-10 -mt-10 blur-xl"></div>
						<h5 className="font-bold relative z-10">Go Premium</h5>
						<p className="text-xs opacity-80 mt-1 mb-3 relative z-10">Unlock Gold Badge</p>
						<button className="bg-white text-primary text-xs font-bold py-2 px-4 rounded-lg w-full hover:bg-gold hover:text-white transition-colors relative z-10">Upgrade</button>
					</div>

					<button 
						onClick={handleSignOut} 
						className="w-full flex items-center justify-center gap-2 p-3 rounded-xl text-gray-500 hover:bg-red-50 hover:text-red-500 transition-all font-bold text-sm"
					>
						<i className="fas fa-sign-out-alt"></i> Sign Out
					</button>
				</div>

			</div>
		</div>
	);
};

export default Sidebar;