import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { db, auth } from '../api/firebase';
import {
  doc, getDoc, updateDoc, arrayUnion, arrayRemove, addDoc, collection,
  serverTimestamp, query, where, limit, getDocs
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import TopBar from '../components/TopBar';

const ProductDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // State Management
  const [product, setProduct] = useState(null);
  const [seller, setSeller] = useState(null); // Store full seller data for verification check
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // UI State
  const [activeTab, setActiveTab] = useState(location.state?.activeTab || 'details');
  const [isSaved, setIsSaved] = useState(false);
  const [recommendations, setRecommendations] = useState([]);

  // Review/Q&A Interaction State
  const [reviewText, setReviewText] = useState('');
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [questionText, setQuestionText] = useState('');

  // Reply State (for Seller/Business Owner)
  const [replyText, setReplyText] = useState('');
  const [activeQuestion, setActiveQuestion] = useState(null);

  // --- DATA FETCHERS ---

  const fetchRecommendations = async (category, currentId) => {
    try {
      // UPDATED: Removed 'where id != currentId' to avoid index issues.
      // We fetch slightly more items (10) and filter the current product out on the client side.
      const q = query(
        collection(db, 'marketplace'),
        where('category', '==', category),
        limit(10)
      );
      const snap = await getDocs(q);
      const recs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(p => p.id !== currentId) // Client-side filter
        .slice(0, 5); // Take top 5
      setRecommendations(recs);
    } catch (err) {
      console.error("Error fetching recommendations:", err);
    }
  };

  // --- EFFECTS ---

  useEffect(() => {
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab);
    }
    return () => {
      if (location.state) {
        location.state.activeTab = undefined;
      }
    };
  }, [location.state]);


  useEffect(() => {
    setIsLoading(true);
    setFetchError(null);

    // 1. Auth Listener and Saved Status Check
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const userDoc = await getDoc(doc(db, 'users', u.uid));
          if (userDoc.exists()) {
            const savedList = userDoc.data().savedProducts || [];
            setIsSaved(savedList.includes(id));
          }
        } catch (e) {
          console.error("Error checking saved status:", e);
        }
      } else {
        setIsSaved(false);
      }
    });

    // 2. Product & Seller Data Fetch
    const fetchProduct = async () => {
      const docRef = doc(db, 'marketplace', id);
      try {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setProduct({ id: snap.id, ...data });
          
          // Fetch Recommendations
          fetchRecommendations(data.category, snap.id);

          // NEW: Fetch Seller Details to check for Verification Status
          // Determine if we look in 'business_pages' or 'users'
          try {
            const collectionName = data.isBusiness ? 'business_pages' : 'users';
            const sellerSnap = await getDoc(doc(db, collectionName, data.sellerId));
            if (sellerSnap.exists()) {
                setSeller(sellerSnap.data());
            }
          } catch (err) {
             console.error("Error fetching seller details:", err);
          }

        } else {
          setFetchError("Product not found.");
        }
      } catch (e) {
        console.error("Error fetching product:", e);
        setFetchError("Failed to load product details.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchProduct();
    return () => unsub(); // Cleanup auth listener
  }, [id]);

  // --- NOTIFICATION HELPER ---
  const notifySeller = async (type, message) => {
    if (!product || !user) return;
    let recipientId = product.sellerId;

    if (product.isBusiness) {
      try {
        const bizSnap = await getDoc(doc(db, 'business_pages', product.sellerId));
        if (bizSnap.exists() && bizSnap.data().ownerId) {
          recipientId = bizSnap.data().ownerId;
        }
      } catch (e) {
        console.error("Failed to find business owner for notification:", e);
      }
    }

    if (recipientId === user.uid) return;

    try {
      await addDoc(collection(db, 'notifications'), {
        recipientId,
        senderId: user.uid,
        senderName: user.displayName,
        senderAvatar: user.photoURL,
        type,
        targetId: product.id,
        message,
        businessId: product.isBusiness ? product.sellerId : null,
        timestamp: serverTimestamp(),
        isRead: false
      });
    } catch (e) {
      console.error("Notification creation failed:", e);
    }
  };

  // --- HANDLERS ---

  const handleMessageSeller = () => {
    if (!user) return alert("Sign in required to message the seller.");

    navigate('/messages', {
      state: {
        startChatWith: {
          uid: product.sellerId,
          displayName: product.sellerName,
          photoURL: product.sellerAvatar
        },
        productContext: {
          id: product.id,
          title: product.title,
          image: product.image
        }
      }
    });
  };

  const handleSave = async () => {
    if (!user) return alert("Sign in required to save products.");
    const userRef = doc(db, 'users', user.uid);
    try {
      if (isSaved) {
        await updateDoc(userRef, { savedProducts: arrayRemove(product.id) });
        setIsSaved(false);
      } else {
        await updateDoc(userRef, { savedProducts: arrayUnion(product.id) });
        setIsSaved(true);
      }
    } catch (e) {
      console.error("Failed to update saved status:", e);
      alert("Could not update saved status. Please try again.");
    }
  };

  const handleReport = async () => {
    if (!user) return alert("Sign in is required to report a product.");
    try {
      await addDoc(collection(db, 'reports'), {
        targetId: product.id,
        type: 'product',
        reporter: user.uid,
        timestamp: serverTimestamp()
      });
      alert("Thank you. The product has been successfully reported for review.");
    } catch (e) {
      console.error("Failed to submit report:", e);
      alert("Failed to submit report. Please try again.");
    }
  };

  const submitReview = async () => {
    if (!reviewText || !user) return;

    const newReview = {
      uid: user.uid,
      name: user.displayName || 'Anonymous User',
      avatar: user.photoURL,
      text: reviewText,
      rating,
      date: new Date().toISOString()
    };

    try {
      await updateDoc(doc(db, 'marketplace', id), { reviews: arrayUnion(newReview) });
      setProduct(prev => ({ ...prev, reviews: [...(prev.reviews || []), newReview] }));
      await notifySeller('review', `reviewed your product "${product.title}"`);
      setReviewText('');
      setRating(5);
    } catch (e) {
      console.error("Review submission error:", e);
      alert("Failed to post review. Please try again.");
    }
  };

  const submitQuestion = async () => {
    if (!questionText || !user) return;

    const newQ = {
      id: Date.now(),
      uid: user.uid,
      name: user.displayName || 'Anonymous User',
      text: questionText,
      date: new Date().toISOString(),
      answer: null
    };

    try {
      await updateDoc(doc(db, 'marketplace', id), { questions: arrayUnion(newQ) });
      setProduct(prev => ({ ...prev, questions: [...(prev.questions || []), newQ] }));
      await notifySeller('question', `asked a question on "${product.title}"`);
      setQuestionText('');
    } catch (e) {
      console.error("Question submission error:", e);
      alert("Failed to post question. Please try again.");
    }
  };

  // --- REPLY TO QUESTION (For Seller/Business Owner) ---
  const handleReplySubmit = async (questionData) => {
    if (!replyText.trim() || !user) return;

    try {
      const productRef = doc(db, 'marketplace', id);
      const snap = await getDoc(productRef);
      if (!snap.exists()) return;

      const currentQuestions = snap.data().questions || [];
      const targetQuestion = currentQuestions.find(q => q.id === questionData.id);

      if (!targetQuestion) return;

      // 1. Remove old question
      await updateDoc(productRef, { questions: arrayRemove(targetQuestion) });

      // 2. Add updated question
      const updatedQ = { ...targetQuestion, answer: replyText, answerDate: new Date().toISOString(), answererId: user.uid };
      await updateDoc(productRef, { questions: arrayUnion(updatedQ) });

      // Optimistic UI Update
      setProduct(prev => ({
        ...prev,
        questions: prev.questions.map(q => q.id === targetQuestion.id ? updatedQ : q)
      }));

      await notifySeller('answer', `answered a question on your product "${product.title}"`);

      setReplyText('');
      setActiveQuestion(null);
    } catch (e) {
      console.error("Reply submission error:", e);
      alert("Failed to submit reply. Please try again.");
    }
  };


  // --- RENDER UI ---

  if (isLoading) return <div className="p-20 text-center text-xl font-bold text-primary">Loading Product Details...</div>;
  if (fetchError) return <div className="p-20 text-center text-xl font-bold text-red-600">⚠️ {fetchError}</div>;
  if (!product) return <div className="p-20 text-center text-xl font-bold text-gray-500">Product data unavailable.</div>;

  const isOwner = user && user.uid === product.sellerId;
  
  // Verify check logic: Check fetched seller object or fallback to product field
  const isSellerVerified = seller?.isVerified || product.sellerVerified;

  return (
    <div className="p-4 md:p-6 w-full max-w-[1400px] mx-auto">
      <div className="hidden md:block"><TopBar /></div>
      <button onClick={() => navigate('/marketplace')} className="mb-4 text-gray-500 font-bold flex items-center gap-2 transition hover:text-dark"><i className="fas fa-arrow-left"></i> Back</button>

      {/* Main Container - Added Border/Glow for Verified Sellers */}
      <div className={`bg-white rounded-[30px] shadow-2xl overflow-hidden flex flex-col lg:flex-row ${isSellerVerified ? 'border-2 border-yellow-400/50 shadow-yellow-100' : ''}`}>
        
        {/* Product Image */}
        <div className="lg:w-1/2 bg-gray-50 p-6 flex items-center justify-center relative">
          <img
            src={product.image}
            className="w-full h-96 object-contain rounded-xl shadow-lg"
            alt={product.title}
          />
          {/* Verified Badge on Image */}
          {isSellerVerified && (
              <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 shadow-md border border-yellow-400/30">
                  <i className="fas fa-certificate text-yellow-500"></i>
                  <span className="text-xs font-bold text-dark">Verified Business</span>
              </div>
          )}
        </div>

        {/* Product Details and Interactions */}
        <div className="lg:w-1/2 p-8 flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <h1 className="text-3xl font-black text-dark">{product.title}</h1>
            <h2 className="text-3xl font-black text-primary ml-4">
              {product.currency === 'BDT' ? '৳' : product.currency} {product.price}
            </h2>
          </div>

          {/* Product Meta Tags */}
          <div className="flex flex-wrap gap-3 text-sm text-gray-500 font-bold mb-6">
            <span className="bg-gray-100 px-3 py-1 rounded-lg"><i className="fas fa-map-marker-alt mr-1"></i> {product.location}</span>
            <span className="bg-gray-100 px-3 py-1 rounded-lg"><i className="fas fa-box mr-1"></i> Stock: {product.stock}</span>
            <span className={`px-3 py-1 rounded-lg ${product.returnPolicy === 'No Return' ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}><i className="fas fa-undo mr-1"></i> {product.returnPolicy || 'N/A'}</span>
            {product.condition && <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg"><i className="fas fa-tag mr-1"></i> {product.condition}</span>}
          </div>

          {/* Tabs Navigation */}
          <div className="flex border-b border-gray-100 mb-6">
            {['details', 'reviews', 'qa'].map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-6 py-3 font-bold capitalize transition-colors ${activeTab === t ? 'border-b-2 border-primary text-primary' : 'text-gray-400 hover:text-dark'}`}
              >
                {t === 'qa' ? 'Q&A' : t}
              </button>
            ))}
          </div>

          {/* Tabs Content Area */}
          <div className="flex-1 overflow-y-auto max-h-60 mb-6 pr-2 custom-scrollbar">
            {/* Details Tab */}
            {activeTab === 'details' &&
              <div className="text-gray-600 whitespace-pre-wrap text-sm leading-relaxed">{product.description}</div>
            }

            {/* Reviews Tab */}
            {activeTab === 'reviews' && (
              <div className="space-y-4">
                {product.reviews?.length > 0 ? product.reviews.map((r, i) => (
                  <div key={i} className="bg-gray-50 p-3 rounded-xl text-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-dark">{r.name}</span>
                      <span className="text-gold flex items-center gap-1"><i className="fas fa-star text-yellow-500"></i> {r.rating}</span>
                    </div>
                    <p className="text-gray-600">{r.text}</p>
                  </div>
                )) : <div className="text-gray-400 text-center p-4 border border-dashed rounded-lg">Be the first to leave a review!</div>}

                {/* Review Submission Form */}
                <div className="mt-4 pt-4 border-t">
                  <textarea
                    placeholder={user ? "Write a review..." : "Sign in to write a review."}
                    className="w-full bg-gray-50 p-3 rounded-xl text-sm mb-2 outline-none border border-gray-200 focus:ring-2 focus:ring-primary/50"
                    value={reviewText}
                    onChange={e => setReviewText(e.target.value)}
                    disabled={!user}
                  ></textarea>
                  {user ? (
                    <div className="flex justify-between items-center">
                      <div className="flex gap-1" onMouseLeave={() => setHoverRating(0)}>
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            type="button"
                            className="text-2xl transition-transform hover:scale-125 focus:outline-none"
                            onClick={() => setRating(star)}
                            onMouseEnter={() => setHoverRating(star)}
                          >
                            <i className={`fas fa-star ${star <= (hoverRating || rating) ? 'text-yellow-500' : 'text-gray-300'}`}></i>
                          </button>
                        ))}
                      </div>
                      <button onClick={submitReview} disabled={!reviewText} className="bg-dark text-white px-6 py-2 rounded-xl text-xs font-bold hover:bg-primary transition-colors disabled:opacity-50">Post Review</button>
                    </div>
                  ) : <p className="text-red-500 text-sm font-bold">Sign in to review.</p>}
                </div>
              </div>
            )}

            {/* Q&A Tab */}
            {activeTab === 'qa' && (
              <div className="space-y-4">
                {product.questions?.length > 0 ? product.questions.map((q, i) => (
                  <div key={i} className="bg-gray-50 p-3 rounded-xl text-sm border border-gray-100">
                    <p className="font-bold text-dark">Q: {q.text}</p>
                    {q.answer ? (
                      <p className="text-primary mt-1 pl-2 border-l-2 border-primary">A: {q.answer}</p>
                    ) : (
                      <>
                        <p className="text-xs text-gray-400 italic mt-1">Waiting for seller response...</p>
                        {isOwner && activeQuestion?.id !== q.id && (
                          <button onClick={() => setActiveQuestion(q)} className="text-xs text-blue-500 font-bold mt-1 hover:underline">Reply</button>
                        )}
                      </>
                    )}
                    {isOwner && activeQuestion?.id === q.id && (
                      <div className="mt-2 flex gap-2">
                        <input
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          placeholder="Type your answer..."
                          className="flex-1 bg-white border px-2 py-1 rounded text-xs focus:ring-primary/50 focus:border-primary"
                        />
                        <button
                          onClick={() => handleReplySubmit(q)}
                          disabled={!replyText.trim()}
                          className="bg-primary text-white px-3 py-1 rounded text-xs font-bold hover:bg-primary/90 disabled:opacity-50"
                        >
                          Send
                        </button>
                        <button
                          onClick={() => setActiveQuestion(null)}
                          className="bg-gray-300 text-dark px-3 py-1 rounded text-xs font-bold hover:bg-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )) : <div className="text-gray-400 text-center p-4 border border-dashed rounded-lg">No questions asked yet. Be the first!</div>}

                <div className="mt-4 pt-4 border-t">
                  <input
                    placeholder={user ? "Ask a question..." : "Sign in to ask a question."}
                    className="w-full bg-gray-50 p-3 rounded-xl text-sm mb-2 outline-none border border-gray-200 focus:ring-2 focus:ring-primary/50"
                    value={questionText}
                    onChange={e => setQuestionText(e.target.value)}
                    disabled={!user}
                  />
                  {user ? <button onClick={submitQuestion} disabled={!questionText} className="bg-dark text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-primary transition-colors disabled:opacity-50">Ask</button> : <p className="text-red-500 text-sm font-bold">Sign in to ask.</p>}
                </div>
              </div>
            )}
          </div>

          {/* Seller Info Card - Verified Styling added */}
          <div 
            className={`p-4 rounded-2xl flex items-center justify-between mb-8 border shadow-inner cursor-pointer transition hover:opacity-90 ${isSellerVerified ? 'bg-gradient-to-r from-yellow-50 to-white border-yellow-400/30' : 'bg-[#F8FAFD] border-gray-100'}`}
            onClick={() => {
              if (product.isBusiness) navigate(`/business/${product.sellerId}`);
              else navigate(`/profile/${product.sellerId}`);
            }}
          >
            <div className="flex items-center gap-3">
              {product.sellerAvatar && !product.sellerAvatar.includes('via.placeholder') &&
                <img src={product.sellerAvatar} className={`w-12 h-12 rounded-full object-cover border ${isSellerVerified ? 'border-yellow-400' : 'border-gray-200'}`} alt={`${product.sellerName}'s avatar`} />
              }
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase">Sold by</p>
                <h4 className="font-bold text-dark flex items-center gap-1">
                  {product.sellerName}
                  {isSellerVerified && <i className="fas fa-check-circle text-yellow-500 text-sm ml-1" title="Verified"></i>}
                </h4>
              </div>
            </div>
            <button onClick={handleReport} className="text-gray-400 hover:text-red-500 text-sm transition-colors"><i className="fas fa-flag mr-1"></i> Report</button>
          </div>

          {/* Main Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={handleMessageSeller}
              className="flex-1 bg-dark text-white py-4 rounded-xl font-bold hover:bg-primary transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <i className="fas fa-comment-alt"></i> Message Seller
            </button>
            <button
              onClick={handleSave}
              className={`px-6 py-4 border-2 rounded-xl font-bold transition-all flex items-center gap-2 ${isSaved ? 'bg-primary border-primary text-white shadow-lg shadow-primary/30' : 'border-gray-200 text-gray-500 hover:border-primary hover:text-primary'}`}
            >
              <i className={`${isSaved ? 'fas' : 'far'} fa-heart`}></i> {isSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Recommendations Section */}
      <div className="mt-12 border-t pt-8">
        <h3 className="text-2xl font-bold text-dark mb-6">More from {product.category}</h3>
        {recommendations.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {recommendations.map(rec => (
              <div
                key={rec.id}
                onClick={() => navigate(`/product/${rec.id}`)}
                className="bg-white border border-gray-100 p-3 rounded-xl cursor-pointer transition-shadow hover:shadow-lg"
              >
                <img src={rec.image} className="w-full h-32 object-cover rounded-lg mb-2" alt={rec.title} />
                <h4 className="font-bold text-sm text-dark truncate">{rec.title}</h4>
                <p className="text-primary font-bold text-xs">{rec.currency === 'BDT' ? '৳' : rec.currency} {rec.price}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-400 p-6 border border-dashed border-gray-300 rounded-xl text-center">
            <p>No other products found in this category.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductDetails;