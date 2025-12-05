import React, { useState } from 'react';
import { functions, db, auth } from '../api/firebase';
import { httpsCallable } from 'firebase/functions';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

const PaymentModal = ({ amount, itemName, onClose, onSuccess, metadata = {} }) => {
  const [method, setMethod] = useState('card');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createPaymentSession = httpsCallable(functions, 'createPaymentSession');

  const handlePay = async () => {
    setLoading(true);
    setError(null);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("You must be signed in to pay.");

      // 1. FORCE TOKEN REFRESH (Fixes 'User must be logged in' backend error)
      await user.getIdToken(true);

      // 2. Create Pending Order
      const orderRef = await addDoc(collection(db, 'orders'), {
          userId: user.uid,
          itemName: itemName,
          amount: amount,
          currency: 'BDT',
          method: method,
          status: 'pending',
          metadata: metadata,
          createdAt: serverTimestamp()
      });

      // 3. Call Backend
      const response = await createPaymentSession({
          orderId: orderRef.id,
          amount: amount,
          currency: 'BDT',
          paymentMethod: method,
          successUrl: `${window.location.origin}/?payment_success=true&orderId=${orderRef.id}`,
          cancelUrl: `${window.location.origin}/?payment_cancel=true`
      });

      const { paymentUrl } = response.data;

      if (paymentUrl) {
          window.location.href = paymentUrl;
      } else {
          throw new Error("Failed to generate payment link. Please try again.");
      }

    } catch (err) {
      console.error("Payment Error:", err);
      // Display the backend error message cleanly
      setError(err.message.replace("INTERNAL ASSERTION FAILED: ", "") || "Payment failed.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-[35px] shadow-2xl overflow-hidden relative">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#F8FAFD]">
          <div><h3 className="font-black text-xl text-dark">Secure Checkout</h3><p className="text-xs text-gray-500 font-bold">{itemName}</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><i className="fas fa-times"></i></button>
        </div>
        <div className="p-6">
            <div className="text-center mb-8"><p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Total to Pay</p><h1 className="text-4xl font-black text-dark">৳ {amount.toLocaleString()}</h1></div>
            
            {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-500 text-xs font-bold rounded-xl border border-red-100 text-center">
                    {error}
                </div>
            )}

            <div className="space-y-3 mb-8">
                <div onClick={() => setMethod('card')} className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer ${method === 'card' ? 'border-primary bg-primary/5' : 'border-gray-100'}`}><div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center"><i className="fab fa-cc-visa"></i></div><div className="flex-1"><h5 className="font-bold text-dark text-sm">Credit / Debit Card</h5></div>{method === 'card' && <i className="fas fa-check-circle text-primary"></i>}</div>
                <div onClick={() => setMethod('bkash')} className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer ${method === 'bkash' ? 'border-pink-500 bg-pink-50' : 'border-gray-100'}`}><div className="w-10 h-10 rounded-full bg-pink-500 text-white flex items-center justify-center"><i className="fas fa-mobile-alt"></i></div><div className="flex-1"><h5 className="font-bold text-dark text-sm">bKash</h5></div>{method === 'bkash' && <i className="fas fa-check-circle text-pink-500"></i>}</div>
            </div>
            <button onClick={handlePay} disabled={loading} className="w-full bg-dark text-white py-4 rounded-2xl font-bold text-lg shadow-xl hover:bg-primary transition-all disabled:opacity-70">{loading ? 'Processing...' : 'Pay Now'}</button>
        </div>
      </div>
    </div>
  );
};
export default PaymentModal;