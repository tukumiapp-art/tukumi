import React, { useState, useEffect } from 'react';
import { auth, db } from '../api/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const Auth = () => {
  useEffect(() => {
    console.log("Auth Page Mounted. Auth instance:", auth ? "Present" : "Missing");
  }, []);

  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  
  // New Dating/Profile Fields
  const [birthday, setBirthday] = useState('');
  const [gender, setGender] = useState('');
  const [profession, setProfession] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); // STOP PAGE RELOAD
    console.log("🚀 Form Submitted! Mode:", isSignup ? "Sign Up" : "Sign In");
    
    setError(null);
    setLoading(true);

    try {
      if (isSignup) {
        // Validation
        if (!name || !birthday || !gender || !profession) {
          throw new Error("Please fill in all fields to continue.");
        }

        console.log("Creating user with:", email);
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log("User created:", user.uid);

        console.log("Updating profile...");
        await updateProfile(user, { displayName: name });

        console.log("Creating Firestore document...");
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
        console.log("User document created successfully.");

      } else {
        // Sign In
        console.log("Signing in with:", email);
        await signInWithEmailAndPassword(auth, email, password);
        console.log("Sign in successful.");
      }

    } catch (err) {
      console.error("❌ Auth Error Detail:", err);
      let msg = err.message;
      if (err.code === 'auth/invalid-credential') msg = "Invalid email or password.";
      if (err.code === 'auth/user-not-found') msg = "No account found with this email.";
      if (err.code === 'auth/wrong-password') msg = "Incorrect password.";
      if (err.code === 'auth/email-already-in-use') msg = "This email is already in use. Please sign in.";
      if (err.code === 'auth/weak-password') msg = "Password should be at least 6 characters.";
      
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-[#f0f4f8]">
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-gold/20 rounded-full blur-[120px] translate-x-1/2 translate-y-1/2"></div>

      <div className="glass-panel w-full max-w-5xl min-h-[600px] rounded-[40px] flex overflow-hidden shadow-2xl relative z-10">
        
        {/* LEFT SIDE */}
        <div className="hidden md:flex flex-1 bg-gradient-to-br from-primary to-primary-dark text-white flex-col justify-center p-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
          <div className="relative z-10">
            <div className="w-20 h-20 mb-8 relative perspective-container">
               <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-xl border border-white/40 shadow-2xl flex items-center justify-center transform rotate-12">
                  <div className="w-10 h-10 bg-gold/80 rounded-lg shadow-inner"></div>
               </div>
            </div>
            <h1 className="text-5xl font-black tracking-tight mb-4">TUKUMI</h1>
            <p className="text-lg text-white/80 font-medium leading-relaxed">
              The aristocratic social network. Connect, Trade, and Date in a premium environment.
            </p>
          </div>
        </div>

        {/* RIGHT SIDE: Form */}
        <div className="flex-1 bg-white/80 backdrop-blur-xl p-8 md:p-12 flex flex-col justify-center relative overflow-y-auto">
          <h2 className="text-3xl font-bold text-dark mb-2">{isSignup ? 'Join the Elite' : 'Welcome Back'}</h2>
          <p className="text-gray-500 mb-6">
            {isSignup ? 'Create your identity.' : 'Enter your credentials to access.'}
          </p>

          <form className="space-y-4" onSubmit={handleSubmit}>
            
            {isSignup && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Full Name</label>
                  <input 
                    type="text" placeholder="Your Name" required={isSignup}
                    className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-4 py-3 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                    value={name} onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Profession</label>
                  <input 
                    type="text" placeholder="e.g. Software Engineer" required={isSignup}
                    className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-4 py-3 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                    value={profession} onChange={(e) => setProfession(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Birthday</label>
                    <input 
                      type="date" required={isSignup}
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm"
                      value={birthday} onChange={(e) => setBirthday(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Gender</label>
                    <select 
                      required={isSignup}
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm appearance-none"
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
              </>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Email Address</label>
              <input 
                type="email" placeholder="you@example.com" required
                className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-4 py-3 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Password</label>
              <input 
                type="password" placeholder="••••••••" required
                className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-4 py-3 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <div className="text-red-500 text-sm font-medium bg-red-50 p-3 rounded-lg">{error}</div>}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-dark text-white font-bold py-4 rounded-xl hover:bg-primary transition-all shadow-lg shadow-dark/20 transform active:scale-95 disabled:opacity-50 mt-4"
            >
              {loading ? 'Processing...' : (isSignup ? 'Create Account' : 'Sign In')}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-500 text-sm">
              {isSignup ? "Already a member?" : "Don't have an account?"}
              <button 
                onClick={() => { setIsSignup(!isSignup); setError(null); }} 
                className="ml-2 text-primary font-bold hover:underline"
              >
                {isSignup ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Auth;