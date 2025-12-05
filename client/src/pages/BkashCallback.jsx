import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { functions } from '../api/firebase';
import { httpsCallable } from 'firebase/functions';

const BkashCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Processing...');
  
  useEffect(() => {
      const paymentID = searchParams.get('paymentID');
      const statusParam = searchParams.get('status');

      if (statusParam === 'cancel' || statusParam === 'failure') {
          setStatus("Payment Canceled or Failed.");
          setTimeout(() => navigate('/'), 2000);
          return;
      }

      if (paymentID && statusParam === 'success') {
          executePayment(paymentID);
      }
  }, []);

  const executePayment = async (paymentID) => {
      try {
          const executeFn = httpsCallable(functions, 'executeBkashPayment');
          const result = await executeFn({ paymentID });
          
          if (result.data.success) {
              setStatus("Payment Successful! ✅");
              // Redirect to success page or profile
              setTimeout(() => navigate('/profile'), 2000);
          } else {
              setStatus("Payment verification failed.");
          }
      } catch (error) {
          console.error(error);
          setStatus("Error executing payment.");
      }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f8]">
        <div className="bg-white p-8 rounded-[30px] shadow-xl text-center">
            <h2 className="text-2xl font-black text-dark mb-4">bKash Payment</h2>
            <div className="text-lg font-bold text-gray-600">{status}</div>
            {status === 'Processing...' && (
                <div className="mt-4 w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            )}
        </div>
    </div>
  );
};

export default BkashCallback;