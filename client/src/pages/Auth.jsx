import React, { useState, useEffect } from 'react';
import { auth, db } from '../api/firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile, 
  sendEmailVerification,
  sendPasswordResetEmail // <--- IMPORTED
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const Auth = () => {
    useEffect(() => {
        console.log("Auth Page Mounted. Auth instance:", auth ? "Present" : "Missing");
    }, []);

    const [isSignup, setIsSignup] = useState(false);
    const [showReset, setShowReset] = useState(false); // <--- NEW STATE
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null); // <--- FOR SUCCESS MESSAGES

    // Form State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    
    // New Dating/Profile Fields
    const [birthday, setBirthday] = useState('');
    const [gender, setGender] = useState('');
    const [profession, setProfession] = useState('');

    // --- HANDLE PASSWORD RESET (UPDATED) ---
    const handleResetPassword = async (e) => {
        e.preventDefault();
        if (!email) return setError("Please enter your email address.");
        setLoading(true);
        setError(null);
        setMessage(null);
        try {
            await sendPasswordResetEmail(auth, email);
            // UPDATED: Generic success message to prevent user enumeration
            console.log("Reset attempt processed for:", email); 
            setMessage("If this email is registered, we have sent a reset link. Check your Inbox and Spam.");
            setTimeout(() => setShowReset(false), 5000); // Auto close after 5s
        } catch (err) {
            // IMPORTANT: We still catch errors (like network issues, malformed email format),
            // but the Firebase function intentionally doesn't throw for 'user-not-found'
            // to avoid enumeration. Any error here is likely a client-side problem or config error.
            console.error("Reset email failed:", err); 
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault(); 
        setError(null);
        setLoading(true);

        try {
            if (isSignup) {
                if (!name || !birthday || !gender || !profession) {
                    throw new Error("Please fill in all fields to continue.");
                }

                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                await updateProfile(user, { displayName: name });
                await sendEmailVerification(user);
                alert("Account created! Please check your email for verification.");

                await setDoc(doc(db, 'users', user.uid), {
                    uid: user.uid,
                    displayName: name,
                    email: user.email,
                    handle: name.toLowerCase().replace(/\s+/g, '_') + Math.floor(Math.random() * 1000),
                    birthday: birthday,
                    gender: gender,
                    profession: profession,
                    isDatingActive: false,
                    photoURL: null, 
                    coverPhotoURL: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809",
                    bio: `I am a ${profession}. New to Tukumi.`,
                    joinedAt: serverTimestamp(),
                    followers: 0,
                    following: 0
                });

            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }

        } catch (err) {
            console.error("Auth Error:", err);
            let msg = err.message;
            if (err.code === 'auth/invalid-credential') msg = "Invalid email or password.";
            if (err.code === 'auth/user-not-found') msg = "No account found with this email.";
            if (err.code === 'auth/wrong-password') msg = "Incorrect password.";
            setError(msg);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-[#f0f4f8]">
            <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2 animate-pulse"></div>
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-gold/20 rounded-full blur-[120px] translate-x-1/2 -translate-y-1/2 animate-pulse" style={{ animationDelay: '1s' }}></div>

            <div className="glass-panel w-full max-w-5xl min-h-[600px] rounded-[40px] flex overflow-hidden shadow-2xl relative z-10">
                
                {/* LEFT SIDE */}
                <div className="hidden md:flex flex-1 bg-gradient-to-br from-primary to-primary-dark text-white flex-col justify-center p-12 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                    <div className="relative z-10">
                        <div className="w-20 h-20 mb-8 relative perspective-container group">
                            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-xl border border-white/40 shadow-2xl flex items-center justify-center transform rotate-12 transition-transform duration-700 group-hover:rotate-[360deg]">
                                <div className="w-10 h-10 bg-gold/80 rounded-lg shadow-inner"></div>
                            </div>
                        </div>
                        <h1 className="text-5xl font-black tracking-tight mb-4 drop-shadow-sm">TUKUMI</h1>
                        <p className="text-lg text-white/90 font-medium leading-relaxed">
                            The aristocratic social network. <br/>Connect, Trade, and Date in a premium environment.
                        </p>
                    </div>
                </div>

                {/* RIGHT SIDE */}
                <div className="flex-1 bg-white/80 backdrop-blur-xl p-8 md:p-12 flex flex-col justify-center relative overflow-y-auto">
                    <div className="max-w-md mx-auto w-full">
                        
                        {/* --- RESET PASSWORD VIEW --- */}
                        {showReset ? (
                            <div className="animate-fade-in">
                                <button onClick={() => setShowReset(false)} className="text-gray-400 hover:text-dark mb-4 flex items-center gap-2 font-bold text-sm"><i className="fas fa-arrow-left"></i> Back to Login</button>
                                <h2 className="text-3xl font-black text-dark mb-2">Reset Password</h2>
                                <p className="text-gray-500 font-medium mb-8">Enter your email and we'll send you a link to get back into your account.</p>
                                
                                <form onSubmit={handleResetPassword} className="space-y-5">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Email Address</label>
                                        <div className="relative">
                                            <i className="fas fa-envelope absolute left-4 top-3.5 text-gray-400"></i>
                                            <input 
                                                type="email" placeholder="you@example.com" required
                                                className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-3 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-bold text-dark"
                                                value={email} onChange={(e) => setEmail(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    {error && <div className="text-red-500 text-sm font-bold bg-red-50 p-3 rounded-xl">{error}</div>}
                                    {message && <div className="text-green-600 text-sm font-bold bg-green-50 p-3 rounded-xl">{message}</div>}
                                    
                                    <button type="submit" disabled={loading} className="w-full bg-dark text-white font-bold py-4 rounded-xl hover:bg-primary transition-all shadow-lg disabled:opacity-70">
                                        {loading ? 'Sending...' : 'Send Reset Link'}
                                    </button>
                                </form>
                            </div>
                        ) : (
                        /* --- NORMAL LOGIN/SIGNUP VIEW --- */
                        <>
                            <h2 className="text-3xl font-black text-dark mb-2">{isSignup ? 'Join the Elite' : 'Welcome Back'}</h2>
                            <p className="text-gray-500 font-medium mb-8">
                                {isSignup ? 'Create your identity to get started.' : 'Enter your credentials to access your account.'}
                            </p>

                            <form className="space-y-5" onSubmit={handleSubmit}>
                                
                                {isSignup && (
                                    <div className="animate-fade-in space-y-4">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Full Name</label>
                                            <div className="relative">
                                                <i className="fas fa-user absolute left-4 top-3.5 text-gray-400"></i>
                                                <input 
                                                    type="text" placeholder="Your Name" required={isSignup}
                                                    className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-3 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-bold text-dark placeholder-gray-300"
                                                    value={name} onChange={(e) => setName(e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Profession</label>
                                            <div className="relative">
                                                <i className="fas fa-briefcase absolute left-4 top-3.5 text-gray-400"></i>
                                                <input 
                                                    type="text" placeholder="e.g. Software Engineer" required={isSignup}
                                                    className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-3 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-bold text-dark placeholder-gray-300"
                                                    value={profession} onChange={(e) => setProfession(e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Birthday</label>
                                                <input 
                                                    type="date" required={isSignup}
                                                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-dark"
                                                    value={birthday} onChange={(e) => setBirthday(e.target.value)}
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Gender</label>
                                                <select 
                                                    required={isSignup}
                                                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-dark appearance-none cursor-pointer"
                                                    value={gender} onChange={(e) => setGender(e.target.value)}
                                                >
                                                    <option value="" disabled>Select...</option>
                                                    <option value="Male">Male</option>
                                                    <option value="Female">Female</option>
                                                    <option value="Non-binary">Non-binary</option>
                                                    <option value="Other">Other</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Email Address</label>
                                    <div className="relative">
                                        <i className="fas fa-envelope absolute left-4 top-3.5 text-gray-400"></i>
                                        <input 
                                            type="email" placeholder="you@example.com" required
                                            className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-3 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-bold text-dark placeholder-gray-300"
                                            value={email} onChange={(e) => setEmail(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Password</label>
                                    <div className="relative">
                                        <i className="fas fa-lock absolute left-4 top-3.5 text-gray-400"></i>
                                        <input 
                                            type="password" placeholder="••••••••" required
                                            className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-3 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-bold text-dark placeholder-gray-300"
                                            value={password} onChange={(e) => setPassword(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {!isSignup && (
                                    <div className="text-right">
                                        <button type="button" onClick={() => setShowReset(true)} className="text-xs font-bold text-primary hover:underline">
                                            Forgot Password?
                                        </button>
                                    </div>
                                )}

                                {error && (
                                    <div className="flex items-center gap-3 text-red-500 text-sm font-bold bg-red-50 p-4 rounded-xl border border-red-100 animate-shake">
                                        <i className="fas fa-exclamation-circle text-lg"></i>
                                        {error}
                                    </div>
                                )}

                                <button 
                                    type="submit" 
                                    disabled={loading}
                                    className="w-full bg-dark text-white font-bold py-4 rounded-xl hover:bg-primary transition-all shadow-lg shadow-dark/20 transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
                                >
                                    {loading ? <><i className="fas fa-circle-notch fa-spin"></i> Processing...</> : (isSignup ? 'Create Account' : 'Sign In')}
                                </button>
                            </form>

                            <div className="mt-8 text-center">
                                <p className="text-gray-500 text-sm font-medium">
                                    {isSignup ? "Already a member?" : "Don't have an account?"}
                                    <button 
                                        onClick={() => { setIsSignup(!isSignup); setError(null); }} 
                                        className="ml-2 text-primary font-black hover:underline transition-all"
                                    >
                                        {isSignup ? 'Sign In' : 'Sign Up'}
                                    </button>
                                </p>
                            </div>
                        </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Auth;