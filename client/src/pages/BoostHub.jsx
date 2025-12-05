import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom'; // Added useLocation
import { db, auth, storage } from '../api/firebase';
import { 
  collection, query, where, getDocs, addDoc, serverTimestamp, orderBy, limit 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import TopBar from '../components/TopBar';
import PaymentModal from '../components/PaymentModal';

// --- HELPER: Map Placeholder ---
const MapPlaceholder = ({ location, radius }) => (
    <div className="relative w-full h-48 bg-blue-50 rounded-xl overflow-hidden border-2 border-blue-100 group">
        <div className="absolute inset-0 opacity-20" style={{ 
            backgroundImage: 'radial-gradient(#3b82f6 1px, transparent 1px)', 
            backgroundSize: '20px 20px' 
        }}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
            <div className="w-32 h-32 rounded-full border-2 border-blue-500/30 bg-blue-500/10 flex items-center justify-center animate-pulse">
                <div className="w-16 h-16 rounded-full border-2 border-blue-500/50 bg-blue-500/20"></div>
            </div>
            <i className="fas fa-map-marker-alt text-4xl text-red-500 -mt-24 drop-shadow-lg"></i>
            <div className="bg-white px-3 py-1 rounded-full shadow-md text-xs font-bold mt-2 whitespace-nowrap">
                {location} (+{radius}km)
            </div>
        </div>
        <div className="absolute bottom-2 right-2 bg-white/80 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-bold text-gray-500">
            Google Maps
        </div>
    </div>
);

const BoostHub = () => {
  const navigate = useNavigate();
  const location = useLocation(); // Hook to get passed state
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // --- DASHBOARD DATA ---
  const [activeAds, setActiveAds] = useState([]); 
  const [myPages, setMyPages] = useState([]); // Store user's businesses

  // --- WIZARD STATE ---
  const [view, setView] = useState('dashboard'); // dashboard, wizard
  const [step, setStep] = useState(1);
  const [boostType, setBoostType] = useState('profile'); // profile, business
  
  // --- DATA SELECTION ---
  const [userPosts, setUserPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [selectedPageId, setSelectedPageId] = useState(null); // Which business to boost?
  const [adSource, setAdSource] = useState('post'); 
  
  // --- FORM DATA ---
  const [adCreative, setAdCreative] = useState({ headline: '', text: '', media: null, preview: null, cta: 'Learn More' });
  const [targeting, setTargeting] = useState({ locations: ['Dhaka'], gender: 'All', age: [18, 65], radius: 10 });
  const [budget, setBudget] = useState({ daily: 500, duration: 7 });
  const [goal, setGoal] = useState('engagement');
  
  // --- PAYMENT ---
  const [showPayment, setShowPayment] = useState(false);
  
  // --- LOCATION SEARCH ---
  const bdLocations = ["Dhaka", "Chittagong", "Sylhet", "Rajshahi", "Khulna", "Barisal", "Rangpur", "Mymensingh", "Comilla", "Gazipur", "Cox's Bazar"];
  const [locationQuery, setLocationQuery] = useState('');
  const [suggestedLocs, setSuggestedLocs] = useState([]);

  // Dynamic Calculations
  const totalCost = budget.daily * budget.duration;
  const estimatedReach = Math.floor((budget.daily * 15) * (targeting.locations.length * 0.8));

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        
        // 1. Fetch Active Ads
        const qAds = query(collection(db, 'boost_requests'), where('requesterId', '==', u.uid), orderBy('timestamp', 'desc'));
        const snapAds = await getDocs(qAds);
        setActiveAds(snapAds.docs.map(d => ({ id: d.id, ...d.data() })));

        // 2. Fetch User Posts
        const qPosts = query(collection(db, 'posts'), where('uid', '==', u.uid), orderBy('timestamp', 'desc'), limit(12));
        const snapPosts = await getDocs(qPosts);
        setUserPosts(snapPosts.docs.map(d => ({ id: d.id, ...d.data() })));

        // 3. Fetch User Businesses (For the list)
        const qPages = query(collection(db, 'business_pages'), where('ownerId', '==', u.uid));
        const snapPages = await getDocs(qPages);
        setMyPages(snapPages.docs.map(d => ({ id: d.id, ...d.data() })));

        // 4. HANDLE NAVIGATION STATE (Auto-Open)
        if (location.state?.openBoost) {
            setView('wizard');
            setStep(1);
            
            if (location.state.type === 'business') {
                setBoostType('business');
                if (location.state.pageId) setSelectedPageId(location.state.pageId);
            } else {
                setBoostType('profile');
            }
        }

        setLoading(false);
      } else navigate('/');
    });
    return () => unsub();
  }, [location.state]);

  useEffect(() => {
      if (locationQuery.length > 1) {
          setSuggestedLocs(bdLocations.filter(l => l.toLowerCase().includes(locationQuery.toLowerCase())));
      } else {
          setSuggestedLocs([]);
      }
  }, [locationQuery]);

  const handleFile = (e) => {
      const file = e.target.files[0];
      if (file) setAdCreative({ ...adCreative, media: file, preview: URL.createObjectURL(file) });
  };

  const handleLaunch = async () => {
      setLoading(true);
      try {
          let mediaUrl = selectedPost?.mediaURL || null;
          if (adSource === 'custom' && adCreative.media) {
              const refS = ref(storage, `ads/${user.uid}/${Date.now()}_${adCreative.media.name}`);
              await uploadBytes(refS, adCreative.media);
              mediaUrl = await getDownloadURL(refS);
          }

          await addDoc(collection(db, 'boost_requests'), {
              requesterId: user.uid,
              type: boostType,
              // If business, save page ID. If profile, save user ID.
              targetId: boostType === 'business' ? selectedPageId : user.uid,
              source: adSource,
              creative: adSource === 'custom' ? { ...adCreative, media: mediaUrl } : { text: selectedPost.text, media: selectedPost.mediaURL },
              goal,
              targeting,
              budget,
              totalCost,
              status: 'review',
              timestamp: serverTimestamp()
          });
          
          alert("Campaign Launched Successfully! 🚀");
          window.location.reload();
      } catch (e) {
          console.error(e);
          alert("Failed to launch campaign.");
      } finally {
          setLoading(false);
          setShowPayment(false);
      }
  };

  if (loading) return <div className="p-20 text-center">Loading Boost Hub...</div>;

  // --- STEPS ---

  const Step1_Type = () => (
      <div className="space-y-6">
          <div className="text-center mb-8">
              <h3 className="text-2xl font-black text-dark">Select Boost Type</h3>
              <p className="text-gray-500">Who are you promoting?</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div 
                onClick={() => { setBoostType('profile'); setStep(2); }} 
                className={`p-6 rounded-[30px] border-2 cursor-pointer transition-all shadow-sm hover:shadow-xl text-center group ${boostType === 'profile' ? 'border-pink-500 bg-pink-50' : 'border-gray-100 bg-white'}`}
              >
                  <div className="w-20 h-20 bg-pink-100 text-pink-600 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                      <i className="fas fa-user-astronaut text-4xl"></i>
                  </div>
                  <h4 className="font-black text-xl text-dark">Personal Profile</h4>
                  <p className="text-sm text-gray-500 mt-2">Gain followers & influence</p>
              </div>

              <div 
                onClick={() => { setBoostType('business'); }} 
                className={`p-6 rounded-[30px] border-2 cursor-pointer transition-all shadow-sm hover:shadow-xl text-center group ${boostType === 'business' ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white'}`}
              >
                  <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                      <i className="fas fa-store text-4xl"></i>
                  </div>
                  <h4 className="font-black text-xl text-dark">Business Page</h4>
                  <p className="text-sm text-gray-500 mt-2">Get sales & shop visits</p>
              </div>
          </div>

          {/* IF BUSINESS SELECTED: SHOW LIST */}
          {boostType === 'business' && (
              <div className="animate-fade-in mt-6 border-t border-gray-200 pt-6">
                  <h4 className="font-bold text-dark mb-4 text-center">Select Your Business</h4>
                  {myPages.length === 0 ? (
                      <p className="text-center text-red-500 text-sm">You have no business pages. Create one first.</p>
                  ) : (
                      <div className="grid grid-cols-1 gap-3">
                          {myPages.map(page => (
                              <div 
                                  key={page.id}
                                  onClick={() => { setSelectedPageId(page.id); setStep(2); }}
                                  className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer hover:bg-white transition-all ${selectedPageId === page.id ? 'border-blue-500 bg-white shadow-md' : 'border-gray-100 bg-gray-50'}`}
                              >
                                  <img src={page.logo} className="w-12 h-12 rounded-lg object-cover" alt={page.name} />
                                  <div className="flex-1">
                                      <h5 className="font-bold text-dark">{page.name}</h5>
                                      <p className="text-xs text-gray-500">{page.category}</p>
                                  </div>
                                  <i className="fas fa-chevron-right text-gray-400"></i>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
          )}
      </div>
  );

  const Step2_Content = () => (
      <div className="space-y-6 animate-fade-in">
          <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
              <button onClick={() => setAdSource('post')} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${adSource === 'post' ? 'bg-white shadow text-dark' : 'text-gray-500'}`}>Select Existing Post</button>
              <button onClick={() => setAdSource('custom')} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${adSource === 'custom' ? 'bg-white shadow text-dark' : 'text-gray-500'}`}>Upload Custom Ad</button>
          </div>

          {adSource === 'post' ? (
              <div>
                  <h4 className="font-bold text-dark mb-4">Select a post to boost</h4>
                  <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto custom-scrollbar p-1">
                      {userPosts.map(post => (
                          <div 
                            key={post.id} 
                            onClick={() => setSelectedPost(post)}
                            className={`relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${selectedPost?.id === post.id ? 'border-primary ring-2 ring-primary/30' : 'border-transparent'}`}
                          >
                              {post.mediaURL ? (
                                  post.mediaType === 'video' ? <video src={post.mediaURL} className="w-full h-32 object-cover bg-black" /> : <img src={post.mediaURL} className="w-full h-32 object-cover" />
                              ) : <div className="w-full h-32 bg-gray-100 flex items-center justify-center text-xs text-gray-400 p-2 text-center break-words">{post.text.substring(0, 50)}...</div>}
                              {selectedPost?.id === post.id && (
                                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                      <div className="bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg"><i className="fas fa-check"></i></div>
                                  </div>
                              )}
                          </div>
                      ))}
                  </div>
              </div>
          ) : (
              <div className="space-y-4">
                  <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center hover:bg-gray-50 transition-colors relative cursor-pointer">
                      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFile} accept="image/*,video/*" />
                      {adCreative.preview ? (
                          <img src={adCreative.preview} className="h-40 mx-auto rounded-lg object-cover shadow-md" />
                      ) : (
                          <div className="text-gray-400">
                              <i className="fas fa-cloud-upload-alt text-4xl mb-2"></i>
                              <p className="font-bold text-sm">Upload Ad Media</p>
                          </div>
                      )}
                  </div>
                  <input value={adCreative.headline} onChange={e => setAdCreative({...adCreative, headline: e.target.value})} placeholder="Ad Headline (e.g. Summer Sale!)" className="w-full bg-gray-50 p-4 rounded-xl font-bold text-dark outline-none" />
                  <textarea value={adCreative.text} onChange={e => setAdCreative({...adCreative, text: e.target.value})} placeholder="Ad Text..." className="w-full bg-gray-50 p-4 rounded-xl text-sm text-dark outline-none" rows="3"></textarea>
                  <select value={adCreative.cta} onChange={e => setAdCreative({...adCreative, cta: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-dark outline-none">
                      {['Learn More', 'Shop Now', 'Sign Up', 'Message Us', 'Call Now'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
              </div>
          )}
      </div>
  );

  const Step3_Targeting = () => (
      <div className="space-y-6 animate-fade-in">
          <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Goal</label>
              <div className="grid grid-cols-2 gap-2">
                  {(boostType === 'business' ? ['Shop Visits','Messages','Sales','Website Clicks'] : ['Followers','Profile Visits','Engagement','Messages']).map(g => (
                      <button key={g} onClick={() => setGoal(g)} className={`py-3 rounded-xl text-xs font-bold border transition-all ${goal === g ? 'bg-dark text-white border-dark' : 'bg-white text-gray-500 border-gray-200'}`}>{g}</button>
                  ))}
              </div>
          </div>

          <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Location</label>
              <div className="relative">
                  <i className="fas fa-search absolute left-4 top-3.5 text-gray-400"></i>
                  <input 
                      value={locationQuery} 
                      onChange={e => setLocationQuery(e.target.value)} 
                      placeholder="Search District / City..." 
                      className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm font-bold outline-none focus:border-primary" 
                  />
                  {suggestedLocs.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-xl z-20 p-1 max-h-40 overflow-y-auto">
                          {suggestedLocs.map(l => (
                              <button key={l} onClick={() => { 
                                  if(!targeting.locations.includes(l)) setTargeting(p => ({...p, locations: [...p.locations, l]})); 
                                  setLocationQuery(''); 
                              }} className="w-full text-left px-4 py-2 text-sm font-bold hover:bg-gray-50 rounded-lg text-gray-600">
                                  {l}
                              </button>
                          ))}
                      </div>
                  )}
              </div>
              
              <div className="mt-4"><MapPlaceholder location={targeting.locations[0] || "Bangladesh"} radius={targeting.radius} /></div>

              <div className="flex flex-wrap gap-2 mt-3">
                  {targeting.locations.map(l => (
                      <span key={l} className="bg-dark text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2">
                          <i className="fas fa-map-marker-alt"></i> {l}
                          <button onClick={() => setTargeting(p => ({...p, locations: p.locations.filter(x => x !== l)}))}><i className="fas fa-times"></i></button>
                      </span>
                  ))}
              </div>
          </div>
          
          <div>
              <div className="flex justify-between text-xs font-bold text-gray-500 mb-2"><span>Radius</span><span>{targeting.radius} km</span></div>
              <input type="range" min="5" max="100" value={targeting.radius} onChange={e => setTargeting({...targeting, radius: parseInt(e.target.value)})} className="w-full accent-primary" />
          </div>
      </div>
  );

  const Step4_Budget = () => (
      <div className="space-y-6 animate-fade-in">
          <div className="bg-gradient-to-r from-green-400 to-teal-500 p-6 rounded-[24px] text-white shadow-lg relative overflow-hidden">
              <div className="relative z-10">
                  <p className="text-sm font-medium opacity-90 mb-1">Estimated Reach</p>
                  <h2 className="text-4xl font-black">{estimatedReach.toLocaleString()}</h2>
                  <p className="text-xs opacity-80 mt-2">People will see your ad</p>
              </div>
              <i className="fas fa-users absolute -bottom-4 -right-4 text-9xl opacity-10"></i>
          </div>

          <div className="space-y-4">
              <div>
                  <div className="flex justify-between text-sm font-bold text-dark mb-2"><span>Daily Budget</span> <span>৳{budget.daily}</span></div>
                  <input type="range" min="100" max="5000" step="100" value={budget.daily} onChange={e => setBudget({...budget, daily: parseInt(e.target.value)})} className="w-full accent-green-500 h-2 bg-gray-200 rounded-lg cursor-pointer" />
              </div>
              <div>
                  <div className="flex justify-between text-sm font-bold text-dark mb-2"><span>Duration</span> <span>{budget.duration} Days</span></div>
                  <input type="range" min="1" max="30" value={budget.duration} onChange={e => setBudget({...budget, duration: parseInt(e.target.value)})} className="w-full accent-blue-500 h-2 bg-gray-200 rounded-lg cursor-pointer" />
              </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 flex justify-between items-center">
              <span className="text-gray-500 font-bold text-sm">Total Cost</span>
              <span className="text-2xl font-black text-primary">৳{totalCost.toLocaleString()}</span>
          </div>
      </div>
  );

  return (
    <div className="p-4 md:p-6 w-full max-w-[1200px] mx-auto pb-24">
        <div className="hidden md:block"><TopBar /></div>
        
        {view === 'dashboard' ? (
            <div className="space-y-8 animate-fade-in">
                <div className="flex justify-between items-end">
                    <div><h1 className="text-4xl font-black text-dark mb-1">Boost Hub</h1><p className="text-gray-500 font-bold">Professional Ad Tools</p></div>
                    <button onClick={() => setView('wizard')} className="bg-gradient-to-r from-primary to-primary-dark text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-primary/30 transition-all flex items-center gap-2"><i className="fas fa-plus"></i> Create Ad</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-[24px] shadow-sm border border-gray-100"><h3 className="text-gray-400 text-xs font-bold uppercase mb-2">Active Ads</h3><p className="text-3xl font-black text-primary">{activeAds.length}</p></div>
                    <div className="bg-white p-6 rounded-[24px] shadow-sm border border-gray-100"><h3 className="text-gray-400 text-xs font-bold uppercase mb-2">Total Spent</h3><p className="text-3xl font-black text-dark">৳0</p></div>
                </div>

                <h3 className="text-xl font-bold text-dark mt-8">Recent Campaigns</h3>
                <div className="space-y-4">
                    {activeAds.length === 0 ? (
                        <div className="text-center py-16 bg-white rounded-[30px] border-2 border-dashed border-gray-200 text-gray-400 font-bold">No campaigns yet. Start one today!</div>
                    ) : (
                        activeAds.map(ad => (
                            <div key={ad.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
                                <div className="flex items-center gap-4"><div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl ${ad.type==='business'?'bg-blue-500':'bg-pink-500'}`}><i className={`fas ${ad.type==='business'?'fa-store':'fa-user'}`}></i></div><div><h4 className="font-bold text-dark capitalize">{ad.goal.replace('_', ' ')}</h4><p className="text-xs text-gray-500">Budget: ৳{(ad.budget.daily * ad.budget.duration).toLocaleString()}</p></div></div>
                                <span className="bg-green-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase">Active</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        ) : (
            <div className="bg-white w-full max-w-2xl mx-auto rounded-[30px] shadow-xl overflow-hidden flex flex-col min-h-[600px] animate-slide-up">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#F8FAFD]">
                    <div><h2 className="text-xl font-black text-dark">Create Campaign</h2><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Step {step} of 4</p></div>
                    <button onClick={() => { setView('dashboard'); setStep(1); }} className="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center text-gray-400 hover:text-red-500 transition-all"><i className="fas fa-times"></i></button>
                </div>

                <div className="flex-1 p-6 md:p-8 overflow-y-auto custom-scrollbar">
                    {step === 1 && Step1_Type()}
                    {step === 2 && Step2_Content()}
                    {step === 3 && Step3_Targeting()}
                    {step === 4 && Step4_Budget()}
                </div>

                <div className="p-6 border-t border-gray-100 bg-white flex gap-3 shadow-lg z-20">
                    {step > 1 && <button onClick={() => setStep(s => s - 1)} className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">Back</button>}
                    {step < 4 ? (
                        <button onClick={() => {
                            if(step===1 && !boostType) return alert("Select type");
                            if(step===2 && adSource==='post' && !selectedPost) return alert("Select a post");
                            setStep(s => s + 1);
                        }} className="flex-1 bg-dark text-white py-3 rounded-xl font-bold hover:bg-primary transition-all shadow-lg">Next Step</button>
                    ) : (
                        <button onClick={() => setShowPayment(true)} className="flex-1 bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-xl font-bold hover:shadow-primary/30 transition-all shadow-lg">Pay ৳{totalCost.toLocaleString()} & Launch</button>
                    )}
                </div>
            </div>
        )}

        {showPayment && (
            <PaymentModal 
                amount={totalCost} 
                itemName={`${boostType} Boost (${budget.duration} Days)`} 
                onClose={() => setShowPayment(false)} 
                onSuccess={handleLaunch}
            />
        )}
    </div>
  );
};

export default BoostHub;