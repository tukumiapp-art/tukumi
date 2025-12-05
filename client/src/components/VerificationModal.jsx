import React, { useState } from 'react';
import { db, storage, auth } from '../api/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import PaymentModal from './PaymentModal';

const VerificationModal = ({ onClose, target }) => {
  // Check if this is for a Business Page or a Personal Profile
  const isBusiness = target?.type === 'business';
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [requestId, setRequestId] = useState(null);
  
  const [formData, setFormData] = useState({
      // Common
      fullName: isBusiness ? target.name : '', // Pre-fill business name
      category: isBusiness ? 'Retail & E-commerce' : 'Content Creator',
      
      // Personal
      documentType: 'National ID',
      
      // Business Specific
      businessType: 'Sole Proprietorship',
      regNumber: '',
      taxId: '',
      website: '',
      
      // Images
      docFront: null,
      docBack: null
  });

  const handleFile = (e, field) => {
      if (e.target.files[0]) {
          setFormData({ ...formData, [field]: e.target.files[0] });
      }
  };

  const handleSaveAndPay = async () => {
      if (!formData.docFront || !formData.docBack) return alert("Please upload required documents.");
      if (!formData.fullName) return alert(isBusiness ? "Enter business name." : "Enter full name.");
      if (isBusiness && !formData.regNumber) return alert("Registration/Trade License No. is required.");

      setLoading(true);
      try {
          const user = auth.currentUser;
          const basePath = isBusiness ? `business_verification/${target.id}` : `verification/${user.uid}`;
          
          // Upload Images
          const frontRef = ref(storage, `${basePath}/doc1_${Date.now()}`);
          const backRef = ref(storage, `${basePath}/doc2_${Date.now()}`);
          
          await uploadBytes(frontRef, formData.docFront);
          await uploadBytes(backRef, formData.docBack);
          
          const frontURL = await getDownloadURL(frontRef);
          const backURL = await getDownloadURL(backRef);

          // Create Request in Firestore
          const docRef = await addDoc(collection(db, 'verification_requests'), {
              uid: user.uid, // Who requested it
              targetId: isBusiness ? target.id : user.uid, // What is being verified
              targetType: isBusiness ? 'business_page' : 'user_profile',
              
              name: formData.fullName,
              category: formData.category,
              
              // Store different fields based on type
              details: isBusiness ? {
                  businessType: formData.businessType,
                  regNumber: formData.regNumber,
                  taxId: formData.taxId,
                  website: formData.website
              } : {
                  docType: formData.documentType
              },

              frontURL, 
              backURL,
              
              status: 'pending',
              paymentStatus: 'unpaid',
              timestamp: serverTimestamp()
          });

          setRequestId(docRef.id);
          setLoading(false);
          setShowPayment(true);

      } catch (e) {
          console.error("Submission Error:", e);
          alert("Failed to save request. Please try again.");
          setLoading(false);
      }
  };

  const DocumentUploadBox = ({ label, file, onUpload }) => (
      <div className="relative group">
          <p className="text-xs font-bold text-gray-500 uppercase mb-2">{label}</p>
          <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer transition-all overflow-hidden ${file ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'}`}>
              {file ? (
                  <>
                      <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" alt="preview" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-white font-bold text-sm"><i className="fas fa-pen mr-1"></i> Change</span>
                      </div>
                  </>
              ) : (
                  <div className="text-center p-4">
                      <div className="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center mx-auto mb-2 text-gray-400">
                          <i className="fas fa-camera"></i>
                      </div>
                      <span className="text-xs text-gray-400 font-medium">Click to Upload</span>
                  </div>
              )}
              <input type="file" className="hidden" accept="image/*" onChange={onUpload} />
          </label>
      </div>
  );

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-fade-in">
        <div className="bg-white w-full max-w-lg rounded-[35px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] relative">
            
            <button onClick={onClose} className="absolute top-4 right-4 z-20 w-8 h-8 bg-white/50 hover:bg-white rounded-full flex items-center justify-center text-gray-600 hover:text-dark transition-all shadow-sm backdrop-blur-md">
                <i className="fas fa-times"></i>
            </button>

            {/* Hero Header */}
            <div className="bg-gradient-to-br from-[#1DA1F2]/10 to-blue-50 p-8 text-center border-b border-blue-100/50 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#1DA1F2] to-blue-400"></div>
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg text-3xl text-[#1DA1F2] animate-bounce-in">
                    <i className={isBusiness ? "fas fa-briefcase" : "fas fa-check-circle"}></i>
                </div>
                <h2 className="text-2xl font-black text-dark mb-1">Verify {isBusiness ? 'Business' : 'Profile'}</h2>
                <p className="text-sm text-gray-600 font-medium">Apply for the blue badge</p>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                
                {/* STEP 1: INFO */}
                {step === 1 && (
                    <div className="space-y-6 animate-slide-in">
                        <h3 className="font-bold text-lg text-dark">Why Verify?</h3>
                        <ul className="space-y-4">
                            {[
                                { icon: 'fa-shield-alt', title: 'Build Trust', desc: 'Show customers you are a legitimate entity.' },
                                { icon: 'fa-search', title: 'Search Priority', desc: 'Rank higher in marketplace and search.' },
                                { icon: 'fa-check-circle', title: 'Blue Badge', desc: 'Get the exclusive checkmark on your profile.' }
                            ].map((item, i) => (
                                <li key={i} className="flex items-start gap-4 p-3 rounded-2xl hover:bg-gray-50 transition-colors">
                                    <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-[#1DA1F2] shrink-0"><i className={`fas ${item.icon}`}></i></div>
                                    <div><h4 className="font-bold text-dark text-sm">{item.title}</h4><p className="text-xs text-gray-500">{item.desc}</p></div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* STEP 2: FORM */}
                {step === 2 && (
                    <div className="space-y-5 animate-slide-in">
                        <div className="flex justify-between items-center">
                             <h3 className="font-bold text-lg text-dark">Business Details</h3>
                             <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">Step 2/3</span>
                        </div>
                        
                        {isBusiness ? (
                            // --- BUSINESS FORM ---
                            <>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5 ml-1">Legal Business Name</label>
                                    <input className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 outline-none focus:border-[#1DA1F2] font-medium text-sm" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5 ml-1">Business Type</label>
                                        <select className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 outline-none font-medium text-sm cursor-pointer" value={formData.businessType} onChange={e => setFormData({...formData, businessType: e.target.value})}>
                                            <option>Sole Proprietorship</option>
                                            <option>Partnership</option>
                                            <option>Limited Company (Ltd)</option>
                                            <option>Government Entity</option> {/* NEW */}
                                            <option>Non-Profit / NGO</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5 ml-1">Trade License No.</label>
                                        <input className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 outline-none focus:border-[#1DA1F2] font-medium text-sm" placeholder="Required" value={formData.regNumber} onChange={e => setFormData({...formData, regNumber: e.target.value})} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5 ml-1">Tax ID (TIN/BIN) <span className="text-gray-400 font-normal lowercase">(optional)</span></label>
                                    <input className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 outline-none font-medium text-sm" placeholder="e.g. 123-456-789" value={formData.taxId} onChange={e => setFormData({...formData, taxId: e.target.value})} />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4 pt-2">
                                    <DocumentUploadBox label="Trade License / Registration" file={formData.docFront} onUpload={e => handleFile(e, 'docFront')} />
                                    <DocumentUploadBox label="Tax Cert / Other Proof" file={formData.docBack} onUpload={e => handleFile(e, 'docBack')} />
                                </div>
                            </>
                        ) : (
                            // --- PERSONAL FORM (Existing) ---
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5 ml-1">Full Legal Name</label>
                                        <input className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 outline-none focus:border-[#1DA1F2] font-medium text-sm" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5 ml-1">Category</label>
                                        <select className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 outline-none font-medium text-sm" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                                            <option>Content Creator</option><option>Public Figure</option><option>Journalist</option><option>Government Official</option><option>Other</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5 ml-1">Document Type</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {['National ID', 'Passport', 'Driving License'].map(type => (
                                            <button key={type} onClick={() => setFormData({...formData, documentType: type})} className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${formData.documentType === type ? 'bg-[#1DA1F2] text-white border-[#1DA1F2] shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>{type}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 pt-2">
                                    <DocumentUploadBox label="Front Side" file={formData.docFront} onUpload={e => handleFile(e, 'docFront')} />
                                    <DocumentUploadBox label="Back Side" file={formData.docBack} onUpload={e => handleFile(e, 'docBack')} />
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* STEP 3: PAYMENT */}
                {step === 3 && (
                    <div className="text-center space-y-8 animate-slide-in">
                         <div><h3 className="font-black text-2xl text-dark mb-2">Review & Payment</h3><p className="text-gray-500 text-sm">Final step to submit your application.</p></div>
                         <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
                             <div className="flex justify-between items-center mb-4"><span className="text-gray-500 font-bold text-sm">Processing Fee</span><span className="text-2xl font-black text-dark">৳ 1</span></div>
                             <div className="h-px bg-gray-200 mb-4"></div>
                             <div className="flex gap-3 text-left"><div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-[#1DA1F2] shrink-0"><i className="fas fa-clock"></i></div><div><h4 className="font-bold text-dark text-sm">Estimated Time</h4><p className="text-xs text-gray-500">3-4 Working Days</p></div></div>
                         </div>
                         <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-100 rounded-2xl text-left"><i className="fas fa-info-circle text-yellow-600 mt-0.5"></i><p className="text-xs text-yellow-800 font-medium leading-relaxed">This fee covers the manual review process. It is <strong>non-refundable</strong> even if the application is rejected.</p></div>
                    </div>
                )}
            </div>

            <div className="p-6 border-t border-gray-100 bg-white flex gap-3">
                {step > 1 && <button onClick={() => setStep(s => s - 1)} className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100">Back</button>}
                {step < 3 ? (
                    <button onClick={() => setStep(s => s + 1)} className="flex-1 bg-dark text-white py-3 rounded-xl font-bold hover:bg-primary shadow-lg">Next Step</button>
                ) : (
                    <button onClick={handleSaveAndPay} disabled={loading} className="flex-1 bg-[#1DA1F2] text-white py-3 rounded-xl font-bold hover:bg-[#0d8ddb] shadow-lg shadow-blue-200 flex items-center justify-center gap-2">{loading ? <><i className="fas fa-circle-notch fa-spin"></i> Processing...</> : 'Pay & Submit'}</button>
                )}
            </div>
        </div>

        {showPayment && <PaymentModal amount={1} itemName="Verification Review Fee" onClose={() => setShowPayment(false)} metadata={{ type: 'verification', requestId: requestId }} onSuccess={() => { alert("Payment Success!"); window.location.reload(); }} />}
    </div>
  );
};

export default VerificationModal;