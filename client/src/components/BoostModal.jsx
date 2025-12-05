import React, { useState, useEffect } from 'react';
import PaymentModal from './PaymentModal';

const BoostModal = ({ target, onClose, onBoost }) => {
  const [step, setStep] = useState(1);
  const [showPayment, setShowPayment] = useState(false);
  const [loading, setLoading] = useState(false);

  // --- LOCATION DATA (Bangladesh Priority) ---
  const bdLocations = [
      "Dhaka, Bangladesh", "Chittagong, Bangladesh", "Sylhet, Bangladesh", 
      "Rajshahi, Bangladesh", "Khulna, Bangladesh", "Barisal, Bangladesh", 
      "Rangpur, Bangladesh", "Mymensingh, Bangladesh", "Comilla, Bangladesh",
      "Narayanganj, Bangladesh", "Gazipur, Bangladesh", "Bogura, Bangladesh",
      "Cox's Bazar, Bangladesh"
  ];
  const worldLocations = [
      "New York, USA", "London, UK", "Toronto, Canada", "Dubai, UAE", 
      "Sydney, Australia", "Singapore", "Kuala Lumpur, Malaysia"
  ];

  // --- FORM STATE ---
  const [formData, setFormData] = useState({
      goal: '',
      audienceMode: 'auto',
      locations: ['Dhaka, Bangladesh'], // Array of selected locations
      gender: 'All',
      ageRange: [18, 55],
      interests: [],
      dailyBudget: 500,
      duration: 7,
      paymentMethod: 'card'
  });

  const [locationQuery, setLocationQuery] = useState("");
  const [suggestedLocations, setSuggestedLocations] = useState([]);

  // Dynamic Data
  const totalCost = formData.dailyBudget * formData.duration;
  const estimatedReach = Math.floor((formData.dailyBudget * 18) * (formData.locations.length * 0.5 + 0.8)); 

  // --- LOCATION SEARCH LOGIC ---
  useEffect(() => {
      if (!locationQuery.trim()) {
          setSuggestedLocations([]);
          return;
      }
      const query = locationQuery.toLowerCase();
      // Filter BD locations first, then World
      const bdMatches = bdLocations.filter(l => l.toLowerCase().includes(query));
      const worldMatches = worldLocations.filter(l => l.toLowerCase().includes(query));
      setSuggestedLocations([...bdMatches, ...worldMatches]);
  }, [locationQuery]);

  const addLocation = (loc) => {
      if (!formData.locations.includes(loc)) {
          setFormData(prev => ({ ...prev, locations: [...prev.locations, loc] }));
      }
      setLocationQuery("");
      setSuggestedLocations([]);
  };

  const removeLocation = (loc) => {
      setFormData(prev => ({ ...prev, locations: prev.locations.filter(l => l !== loc) }));
  };

  // --- GOAL DEFINITIONS ---
  const getGoals = () => {
      // IF BOOSTING A BUSINESS PAGE
      if (target.type === 'page' || target.type === 'business') {
          return [
              { id: 'shop_visits', icon: 'fa-store-alt', label: 'Get Shop Visitors', desc: 'Show to people near your shop' },
              { id: 'messages', icon: 'fa-comment-dollar', label: 'Get Messages & Leads', desc: 'Chat with potential buyers' },
              { id: 'website', icon: 'fa-globe', label: 'Website Traffic', desc: 'Send people to your site' },
              { id: 'followers', icon: 'fa-users', label: 'Page Followers', desc: 'Grow your brand audience' }
          ];
      } 
      // IF BOOSTING A PERSONAL PROFILE
      else if (target.type === 'profile') {
          return [
              { id: 'followers', icon: 'fa-user-plus', label: 'Get More Followers', desc: 'Grow your personal brand' },
              { id: 'profile_visits', icon: 'fa-id-card', label: 'Profile Visits', desc: 'Get people to view your profile' },
              { id: 'influence', icon: 'fa-star', label: 'Build Influence', desc: 'Reach more people' }
          ];
      } 
      // IF BOOSTING A POST / VIDEO / PRODUCT
      else {
          return [
              { id: 'engagement', icon: 'fa-thumbs-up', label: 'Increase Engagement', desc: 'More likes, comments & shares' },
              { id: 'views', icon: 'fa-eye', label: 'Increase Views', desc: 'Get more people to see this' },
              { id: 'messages', icon: 'fa-paper-plane', label: 'Send Message', desc: 'Let people contact you' }
          ];
      }
  };

  // --- HANDLERS ---
  const handleLaunch = async () => {
      setLoading(true);
      // Simulate API call
      setTimeout(() => {
          onBoost({
              ...formData,
              targetId: target.id,
              targetType: target.type,
              targetName: target.name,
              status: 'active',
              createdAt: new Date().toISOString()
          });
          setLoading(false);
          onClose();
      }, 1500);
  };

  // --- RENDERERS ---

  const Step1Goals = () => (
      <div className="space-y-5 animate-fade-in">
          <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3 text-primary text-2xl">
                  <i className={`fas ${target.type === 'business' ? 'fa-briefcase' : target.type === 'profile' ? 'fa-user-circle' : 'fa-bullhorn'}`}></i>
              </div>
              <h3 className="text-xl font-black text-dark">Goal: Promote {target.type === 'page' ? 'Business' : target.type}</h3>
              <p className="text-sm text-gray-500">What outcome do you want?</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
              {getGoals().map(g => (
                  <div 
                    key={g.id} 
                    onClick={() => setFormData({ ...formData, goal: g.id })} 
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center gap-4 ${formData.goal === g.id ? 'border-primary bg-primary/5 shadow-md' : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50'}`}
                  >
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg shadow-sm ${formData.goal === g.id ? 'bg-primary text-white' : 'bg-white text-gray-400'}`}>
                          <i className={`fas ${g.icon}`}></i>
                      </div>
                      <div className="flex-1">
                          <h5 className="font-bold text-dark text-base">{g.label}</h5>
                          <p className="text-xs text-gray-500 font-medium">{g.desc}</p>
                      </div>
                      {formData.goal === g.id && <i className="fas fa-check-circle text-primary text-xl"></i>}
                  </div>
              ))}
          </div>
      </div>
  );

  const Step2Audience = () => (
      <div className="space-y-6 animate-fade-in">
          <h3 className="text-lg font-black text-dark">2. Who should see this?</h3>
          
          {/* Mode Selection */}
          <div className="flex bg-gray-100 p-1 rounded-xl mb-4">
              <button onClick={() => setFormData({...formData, audienceMode: 'auto'})} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${formData.audienceMode === 'auto' ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}>Automatic (Smart)</button>
              <button onClick={() => setFormData({...formData, audienceMode: 'custom'})} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${formData.audienceMode === 'custom' ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}>Custom Targeting</button>
          </div>

          {formData.audienceMode === 'auto' ? (
              <div className="p-5 bg-blue-50 border border-blue-100 rounded-2xl text-sm text-blue-800 flex items-start gap-3">
                  <i className="fas fa-magic text-xl mt-1"></i>
                  <div>
                      <p className="font-bold mb-1">Tukumi Smart AI</p>
                      <p className="opacity-80 text-xs leading-relaxed">
                          We will automatically show your ad to people similar to your current followers and people interested in {target.category || 'your content'}.
                      </p>
                  </div>
              </div>
          ) : (
              <div className="space-y-5">
                  {/* LOCATION SEARCH */}
                  <div className="relative">
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Locations</label>
                      
                      {/* Selected Tags */}
                      <div className="flex flex-wrap gap-2 mb-2">
                          {formData.locations.map(loc => (
                              <span key={loc} className="bg-dark text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-2 shadow-sm">
                                  <i className="fas fa-map-marker-alt"></i> {loc}
                                  <button onClick={() => removeLocation(loc)} className="hover:text-red-300"><i className="fas fa-times"></i></button>
                              </span>
                          ))}
                      </div>

                      {/* Search Input */}
                      <div className="flex items-center gap-2 bg-white border-2 border-gray-200 rounded-xl px-3 py-2 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition-all">
                          <i className="fas fa-search text-gray-400"></i>
                          <input 
                              value={locationQuery} 
                              onChange={e => setLocationQuery(e.target.value)}
                              className="flex-1 bg-transparent outline-none text-sm font-bold text-dark placeholder-gray-400" 
                              placeholder="Search city, town, or region..." 
                          />
                      </div>

                      {/* Suggestions Dropdown */}
                      {suggestedLocations.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 z-20 max-h-40 overflow-y-auto custom-scrollbar">
                              {suggestedLocations.map(loc => (
                                  <button 
                                    key={loc} 
                                    onClick={() => addLocation(loc)}
                                    className="w-full text-left px-4 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50 hover:text-primary flex items-center gap-2"
                                  >
                                      <i className="fas fa-map-marker-alt text-xs opacity-50"></i> {loc}
                                  </button>
                              ))}
                          </div>
                      )}
                  </div>

                  {/* Age & Gender */}
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                       <div className="mb-4">
                           <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Gender</label>
                           <div className="flex gap-2">
                               {['All', 'Men', 'Women'].map(g => (
                                   <button key={g} onClick={() => setFormData({...formData, gender: g})} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${formData.gender === g ? 'bg-dark text-white border-dark' : 'bg-white text-gray-500 border-gray-200'}`}>{g}</button>
                               ))}
                           </div>
                       </div>
                       <div>
                           <label className="text-xs font-bold text-gray-500 uppercase block mb-2 flex justify-between">
                               <span>Age Range</span> <span>{formData.ageRange[0]} - {formData.ageRange[1]}</span>
                           </label>
                           <input type="range" min="13" max="65" value={formData.ageRange[1]} onChange={e => setFormData({...formData, ageRange: [formData.ageRange[0], parseInt(e.target.value)]})} className="w-full accent-primary" />
                       </div>
                  </div>
              </div>
          )}
      </div>
  );

  const Step3Budget = () => (
      <div className="space-y-6 animate-fade-in">
          <h3 className="text-lg font-black text-dark">3. Budget & Schedule</h3>

          <div className="bg-gradient-to-r from-primary to-primary-dark p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
              <div className="relative z-10">
                  <p className="text-sm font-medium opacity-80 mb-1">Estimated Reach</p>
                  <h2 className="text-4xl font-black tracking-tight">{estimatedReach.toLocaleString()} <span className="text-lg opacity-70 font-bold">people</span></h2>
                  <div className="mt-4 flex gap-2 text-xs font-bold bg-black/20 p-2 rounded-lg w-fit">
                      <span>🔥 {formData.locations.length} Locations</span>
                      <span className="w-px h-4 bg-white/30"></span>
                      <span>📅 {formData.duration} Days</span>
                  </div>
              </div>
          </div>

          <div className="space-y-6">
              <div>
                  <div className="flex justify-between text-sm font-bold text-dark mb-2"><span>Daily Budget</span> <span>৳{formData.dailyBudget}</span></div>
                  <input type="range" min="100" max="5000" step="50" value={formData.dailyBudget} onChange={e => setFormData({...formData, dailyBudget: parseInt(e.target.value)})} className="w-full accent-green-500 h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer" />
                  <div className="flex justify-between text-[10px] text-gray-400 mt-2 font-bold"><span>৳100</span><span>৳5,000</span></div>
              </div>

              <div>
                  <div className="flex justify-between text-sm font-bold text-dark mb-2"><span>Duration</span> <span>{formData.duration} Days</span></div>
                  <div className="flex gap-2">
                      {[1, 3, 7, 15, 30].map(d => (
                          <button key={d} onClick={() => setFormData({...formData, duration: d})} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${formData.duration === d ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>{d}d</button>
                      ))}
                  </div>
              </div>
          </div>
      </div>
  );

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[9999] p-4 animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-[35px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
            <div>
                <h3 className="font-black text-xl text-dark flex items-center gap-2">
                    <i className="fas fa-rocket text-gold"></i> Boost Center
                </h3>
                <div className="flex gap-1 mt-2">
                    {[1, 2, 3].map(s => (
                        <div key={s} className={`h-1.5 w-8 rounded-full transition-colors ${step >= s ? 'bg-primary' : 'bg-gray-200'}`}></div>
                    ))}
                </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 hover:text-dark hover:bg-gray-100 transition-all"><i className="fas fa-times"></i></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {step === 1 && <Step1Goals />}
            {step === 2 && <Step2Audience />}
            {step === 3 && <Step3Budget />}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 bg-white flex gap-3 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] z-10">
            {step > 1 && (
                <button onClick={() => setStep(s => s - 1)} className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">Back</button>
            )}
            
            {step < 3 ? (
                <button 
                    onClick={() => {
                        if (step === 1 && !formData.goal) return alert("Please select a goal.");
                        setStep(s => s + 1);
                    }} 
                    className="flex-1 bg-dark text-white py-3 rounded-xl font-bold hover:bg-primary transition-all shadow-lg"
                >
                    Next Step
                </button>
            ) : (
                <button 
                    onClick={() => setShowPayment(true)} 
                    className="flex-1 bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-xl font-bold hover:shadow-primary/40 transition-all shadow-lg flex items-center justify-center gap-2 animate-pulse-slow"
                >
                    <span>Pay ৳{totalCost.toLocaleString()}</span> <i className="fas fa-arrow-right"></i>
                </button>
            )}
        </div>

      </div>

      {showPayment && (
          <PaymentModal 
              amount={totalCost}
              itemName={`Boost: ${target.name} (${formData.duration} Days)`}
              onClose={() => setShowPayment(false)}
              metadata={{ type: 'boost', ...formData, targetId: target.id, targetType: target.type }}
              onSuccess={handleLaunch} 
          />
      )}
    </div>
  );
};

export default BoostModal;