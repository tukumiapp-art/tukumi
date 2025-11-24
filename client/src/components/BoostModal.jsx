import React, { useState } from 'react';

const BoostModal = ({ target, onClose, onBoost }) => {
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState('engagement');
  const [audience, setAudience] = useState({
    gender: 'All',
    ageRange: [18, 65],
    location: ''
  });
  const [budget, setBudget] = useState(500);
  const [duration, setDuration] = useState(3);
  const [paymentMethod, setPaymentMethod] = useState('card');

  const totalCost = budget * duration;

  const handleLaunch = () => {
    const campaignData = {
      targetId: target.id,
      targetType: target.type, // 'page' or 'product'
      goal,
      audience,
      budget,
      duration,
      totalCost,
      paymentMethod,
      status: 'active',
      startDate: new Date().toISOString()
    };
    onBoost(campaignData);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[9999] p-4 animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-[30px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#F8FAFD]">
          <div>
            <h3 className="font-black text-xl text-dark flex items-center gap-2">
              <i className="fas fa-rocket text-gold"></i> Promote {target.type === 'page' ? 'Business' : 'Product'}
            </h3>
            <p className="text-xs text-gray-500 font-bold">{target.name}</p>
          </div>
          <button onClick={onClose}><i className="fas fa-times text-gray-400 hover:text-dark text-xl"></i></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* STEP 1: GOAL */}
          <section>
            <h4 className="text-sm font-black text-dark uppercase tracking-wider mb-4">1. What is your Goal?</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { id: 'engagement', icon: 'fa-heart', label: 'More Engagement', desc: 'Get likes & comments' },
                { id: 'messages', icon: 'fa-comment-dots', label: 'More Messages', desc: 'Get leads in inbox' },
                { id: 'traffic', icon: 'fa-globe', label: 'Website Traffic', desc: 'Drive clicks to link' }
              ].map(opt => (
                <div key={opt.id} onClick={() => setGoal(opt.id)} className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${goal === opt.id ? 'border-primary bg-primary/5' : 'border-gray-100 hover:border-primary/30'}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${goal === opt.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <i className={`fas ${opt.icon}`}></i>
                  </div>
                  <h5 className="font-bold text-dark">{opt.label}</h5>
                  <p className="text-xs text-gray-500 mt-1">{opt.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* STEP 2: AUDIENCE */}
          <section>
            <h4 className="text-sm font-black text-dark uppercase tracking-wider mb-4">2. Target Audience</h4>
            <div className="bg-gray-50 p-5 rounded-2xl space-y-4 border border-gray-100">
              {/* Gender */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block">Gender</label>
                <div className="flex bg-white rounded-xl p-1 border border-gray-200 w-fit">
                  {['All', 'Men', 'Women'].map(g => (
                    <button key={g} onClick={() => setAudience({...audience, gender: g})} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${audience.gender === g ? 'bg-dark text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Age */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block flex justify-between">
                  <span>Age Range</span>
                  <span className="text-primary">{audience.ageRange[0]} - {audience.ageRange[1]}+</span>
                </label>
                <input type="range" min="13" max="65" value={audience.ageRange[1]} onChange={(e) => setAudience({...audience, ageRange: [audience.ageRange[0], parseInt(e.target.value)]})} className="w-full accent-primary" />
              </div>

              {/* Location */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block">Location</label>
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
                  <i className="fas fa-map-marker-alt text-primary"></i>
                  <input type="text" placeholder="e.g. Dhaka, Gulshan, Banani" value={audience.location} onChange={e => setAudience({...audience, location: e.target.value})} className="w-full outline-none text-sm font-bold" />
                </div>
              </div>
            </div>
          </section>

          {/* STEP 3: BUDGET & DURATION */}
          <section>
             <h4 className="text-sm font-black text-dark uppercase tracking-wider mb-4">3. Budget & Duration</h4>
             <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                   <div>
                      <span className="text-3xl font-black text-dark">৳{totalCost.toLocaleString()}</span>
                      <p className="text-xs text-gray-400 font-bold">Total Spend</p>
                   </div>
                   <div className="text-right">
                      <span className="text-xl font-black text-primary">{duration} Days</span>
                      <p className="text-xs text-gray-400 font-bold">Duration</p>
                   </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1"><span>Daily Budget</span><span>৳{budget}</span></div>
                    <input type="range" min="100" max="10000" step="100" value={budget} onChange={e => setBudget(parseInt(e.target.value))} className="w-full accent-green-500" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1"><span>Duration</span><span>{duration} Days</span></div>
                    <input type="range" min="1" max="30" value={duration} onChange={e => setDuration(parseInt(e.target.value))} className="w-full accent-blue-500" />
                  </div>
                </div>
             </div>
          </section>

          {/* STEP 4: PAYMENT */}
          <section>
             <h4 className="text-sm font-black text-dark uppercase tracking-wider mb-4">4. Payment Method</h4>
             <div className="flex gap-3">
                <button onClick={() => setPaymentMethod('card')} className={`flex-1 p-3 rounded-xl border flex items-center justify-center gap-2 font-bold ${paymentMethod === 'card' ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200'}`}>
                   <i className="fas fa-credit-card"></i> Card
                </button>
                <button onClick={() => setPaymentMethod('bkash')} className={`flex-1 p-3 rounded-xl border flex items-center justify-center gap-2 font-bold ${paymentMethod === 'bkash' ? 'border-pink-500 bg-pink-50 text-pink-600' : 'border-gray-200'}`}>
                   <i className="fas fa-mobile-alt"></i> bKash
                </button>
             </div>
          </section>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-white">
          <button onClick={handleLaunch} className="w-full bg-gradient-to-r from-primary to-primary-dark text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-primary/30 transition-all flex justify-center items-center gap-2">
             <span>Launch Promotion</span>
             <i className="fas fa-rocket"></i>
          </button>
        </div>

      </div>
    </div>
  );
};

export default BoostModal;