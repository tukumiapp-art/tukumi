import React, { useState } from 'react';

const DatingFilterModal = ({ currentFilters, onClose, onApply, onDeactivate }) => { // <--- Added onDeactivate prop
  const [filters, setFilters] = useState(currentFilters);

  const handleChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    onApply(filters);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center z-[9999] p-4 animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-[30px] md:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#fff0f5]">
          <div>
            <h3 className="font-black text-xl text-dark flex items-center gap-2">
              <i className="fas fa-sliders-h text-pink-500"></i> Dating Filters
            </h3>
            <p className="text-xs text-gray-500 font-bold">Find your perfect match</p>
          </div>
          <button onClick={onClose}><i className="fas fa-times text-gray-400 hover:text-dark text-xl"></i></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* 1. GENDER */}
          <section>
            <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-wider">I'm interested in</h4>
            <div className="flex bg-gray-100 rounded-xl p-1">
              {['Men', 'Women', 'Everyone'].map(g => (
                <button 
                  key={g} 
                  onClick={() => handleChange('gender', g)} 
                  className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${filters.gender === g ? 'bg-white text-pink-500 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </section>

          {/* 2. AGE RANGE */}
          <section>
            <div className="flex justify-between items-center mb-3">
               <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Age Range</h4>
               <span className="text-pink-500 font-bold text-sm">{filters.ageRange[0]} - {filters.ageRange[1]}</span>
            </div>
            <div className="px-2">
                <input 
                  type="range" 
                  min="18" max="65" 
                  value={filters.ageRange[1]} 
                  onChange={(e) => handleChange('ageRange', [filters.ageRange[0], parseInt(e.target.value)])} 
                  className="w-full accent-pink-500 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" 
                />
                <div className="flex justify-between text-xs text-gray-400 mt-2 font-bold">
                    <span>18</span>
                    <span>65+</span>
                </div>
            </div>
          </section>

          {/* 3. LOCATION & PROFESSION */}
          <section className="space-y-4">
             <div>
                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Location</label>
                <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                    <i className="fas fa-map-marker-alt text-pink-400"></i>
                    <input 
                        type="text" 
                        placeholder="e.g. Dhaka, Gulshan" 
                        className="bg-transparent outline-none w-full text-sm font-bold text-dark placeholder-gray-300"
                        value={filters.location}
                        onChange={(e) => handleChange('location', e.target.value)}
                    />
                </div>
             </div>
             <div>
                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Profession</label>
                <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                    <i className="fas fa-briefcase text-pink-400"></i>
                    <input 
                        type="text" 
                        placeholder="e.g. Doctor, Engineer" 
                        className="bg-transparent outline-none w-full text-sm font-bold text-dark placeholder-gray-300"
                        value={filters.profession}
                        onChange={(e) => handleChange('profession', e.target.value)}
                    />
                </div>
             </div>
          </section>

          {/* 4. RELATIONSHIP GOAL */}
          <section>
             <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-wider">Relationship Goals</h4>
             <div className="grid grid-cols-2 gap-3">
                {[
                    { id: 'Long-term', icon: 'fa-ring', label: 'Long-term' },
                    { id: 'Casual', icon: 'fa-glass-cheers', label: 'Fun / Casual' },
                    { id: 'Friendship', icon: 'fa-user-friends', label: 'Friendship' },
                    { id: 'Not Sure', icon: 'fa-question', label: 'Figuring it out' }
                ].map(opt => (
                    <button 
                        key={opt.id} 
                        onClick={() => handleChange('goal', opt.id)} 
                        className={`p-3 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${filters.goal === opt.id ? 'border-pink-500 bg-pink-50 text-pink-600' : 'border-gray-100 text-gray-500 hover:border-pink-200'}`}
                    >
                        <i className={`fas ${opt.icon}`}></i>
                        <span className="text-sm font-bold">{opt.label}</span>
                    </button>
                ))}
             </div>
          </section>

          {/* 5. DEACTIVATE OPTION */}
          {onDeactivate && (
            <div className="pt-4 border-t border-gray-100">
                <button 
                    onClick={onDeactivate}
                    className="w-full py-3 rounded-xl border border-red-100 text-red-500 font-bold text-sm bg-red-50 hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                >
                    <i className="fas fa-eye-slash"></i> Turn Off Dating Mode
                </button>
                <p className="text-[10px] text-gray-400 text-center mt-2">
                    Your dating profile will be hidden. You can turn it back on anytime.
                </p>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-white">
          <button onClick={handleApply} className="w-full bg-gradient-to-r from-pink-500 to-red-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-pink-500/30 hover:scale-[1.02] transition-transform">
             Apply Filters
          </button>
        </div>

      </div>
    </div>
  );
};

export default DatingFilterModal;