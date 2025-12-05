import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../api/firebase';
import { 
  collection, query, where, orderBy, getDocs, doc, updateDoc, 
  deleteDoc, getDoc, serverTimestamp, writeBatch, onSnapshot 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import TopBar from '../components/TopBar';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); 

  // Data State
  const [stats, setStats] = useState({ users: 0, posts: 0, reports: 0, revenue: 0, verifications: 0 });
  const [verifications, setVerifications] = useState([]);
  const [reports, setReports] = useState([]);

  // 1. Auth Check
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        const userSnap = await getDoc(doc(db, 'users', u.uid));
        if (userSnap.exists() && userSnap.data().isAdmin) {
            setIsAdmin(true);
        } else {
            alert("Access Denied: Admins Only");
            navigate('/');
        }
      } else {
        navigate('/');
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. Real-Time Listeners
  useEffect(() => {
    if (!isAdmin) return;

    // A. LISTEN FOR VERIFICATION REQUESTS
    const qVerify = query(
        collection(db, 'verification_requests'), 
        where('status', '==', 'pending'), 
        orderBy('timestamp', 'desc')
    );

    const unsubVerify = onSnapshot(qVerify, (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setVerifications(list);
        setStats(prev => ({ ...prev, verifications: list.length }));
    }, (error) => {
        console.error("Verification Query Error:", error);
        if (error.message.includes("index")) {
            alert("⚠️ MISSING INDEX: Open console (F12) and click the Firebase link to create it.");
        }
    });

    // B. LISTEN FOR REPORTS
    const qReports = query(collection(db, 'reports'), orderBy('timestamp', 'desc'));
    const unsubReports = onSnapshot(qReports, (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setReports(list);
        setStats(prev => ({ ...prev, reports: list.length }));
    });

    // C. FETCH STATIC STATS
    const fetchStaticStats = async () => {
        const usersSnap = await getDocs(collection(db, 'users'));
        const postsSnap = await getDocs(collection(db, 'posts'));
        const ordersSnap = await getDocs(query(collection(db, 'orders'), where('status', '==', 'paid')));
        
        let totalRevenue = 0;
        ordersSnap.forEach(doc => totalRevenue += (doc.data().amount || 0));

        setStats(prev => ({
            ...prev,
            users: usersSnap.size,
            posts: postsSnap.size,
            revenue: totalRevenue
        }));
    };
    fetchStaticStats();

    return () => { unsubVerify(); unsubReports(); };
  }, [isAdmin]);

  // --- ACTIONS ---

  const handleVerifyAction = async (req, action) => {
      if (!confirm(`${action === 'approve' ? 'Approve' : 'Reject'} this request?`)) return;
      
      try {
          const batch = writeBatch(db);
          const reqRef = doc(db, 'verification_requests', req.id);
          
          if (action === 'approve') {
              // 1. Mark Request as Approved
              batch.update(reqRef, { status: 'approved', processedAt: serverTimestamp() });
              
              // 2. CHECK: Is it a Business or a User?
              if (req.targetType === 'business_page') {
                  // --- VERIFY BUSINESS PAGE ---
                  const businessRef = doc(db, 'business_pages', req.targetId);
                  batch.update(businessRef, { isVerified: true });
              } else {
                  // --- VERIFY USER PROFILE ---
                  const targetUserId = req.targetId || req.uid; // Fallback for old requests
                  const userRef = doc(db, 'users', targetUserId);
                  batch.update(userRef, { isVerified: true });
              }

              // 3. Notify the Requester
              const notifRef = doc(collection(db, 'notifications'));
              batch.set(notifRef, {
                  recipientId: req.uid, // Notification always goes to the user who asked
                  type: 'system',
                  message: `Congratulations! Your ${req.targetType === 'business_page' ? 'Business Page' : 'Profile'} verification request was approved.`,
                  timestamp: serverTimestamp(),
                  isRead: false
              });

          } else {
              // Reject
              batch.update(reqRef, { status: 'rejected', processedAt: serverTimestamp() });
          }

          await batch.commit();
          alert(`Request ${action}d successfully!`);

      } catch (e) {
          console.error("Verification Action Failed:", e);
          alert("Action failed. Check console for details.");
      }
  };

  const handleReportAction = async (report, action) => {
      try {
          if (action === 'delete_content') {
              if (!confirm("Delete this content permanently?")) return;
              const collectionName = report.type === 'post' ? 'posts' : report.type === 'product' ? 'marketplace' : 'circles';
              await deleteDoc(doc(db, collectionName, report.targetId || report.postId));
              alert("Content deleted.");
          }
          await deleteDoc(doc(db, 'reports', report.id));
      } catch (e) {
          console.error(e);
          alert("Action failed.");
      }
  };

  if (loading) return <div className="p-20 text-center">Loading Dashboard...</div>;
  if (!isAdmin) return null;

  return (
    <div className="p-4 md:p-6 w-full max-w-[1400px] mx-auto pb-24">
      <div className="hidden md:block"><TopBar /></div>
      
      <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-dark rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">
              <i className="fas fa-shield-alt"></i>
          </div>
          <div>
              <h1 className="text-3xl font-black text-dark">Admin Dashboard</h1>
              <p className="text-gray-500 font-bold">Manage your platform.</p>
          </div>
      </div>

      {/* TABS */}
      <div className="flex gap-4 mb-8 border-b border-gray-200 overflow-x-auto no-scrollbar">
          {['overview', 'verify', 'reports'].map(t => (
              <button 
                key={t} 
                onClick={() => setActiveTab(t)}
                className={`px-6 py-3 font-bold capitalize transition-all border-b-4 ${activeTab === t ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-dark'}`}
              >
                  {t === 'verify' && verifications.length > 0 ? `Verify (${verifications.length})` : t === 'reports' && reports.length > 0 ? `Reports (${reports.length})` : t}
              </button>
          ))}
      </div>

      {/* --- OVERVIEW TAB --- */}
      {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 animate-fade-in">
              <div className="bg-white p-6 rounded-[24px] shadow-sm border border-gray-100">
                  <div className="text-gray-400 text-xs font-bold uppercase mb-2">Total Revenue</div>
                  <div className="text-3xl font-black text-green-600">৳ {stats.revenue.toLocaleString()}</div>
              </div>
              <div className="bg-white p-6 rounded-[24px] shadow-sm border border-gray-100">
                  <div className="text-gray-400 text-xs font-bold uppercase mb-2">Total Users</div>
                  <div className="text-3xl font-black text-dark">{stats.users.toLocaleString()}</div>
              </div>
              <div className="bg-white p-6 rounded-[24px] shadow-sm border border-gray-100">
                  <div className="text-gray-400 text-xs font-bold uppercase mb-2">Active Posts</div>
                  <div className="text-3xl font-black text-dark">{stats.posts.toLocaleString()}</div>
              </div>
              
              <div onClick={() => setActiveTab('verify')} className="bg-white p-6 rounded-[24px] shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-all group">
                  <div className="text-gray-400 text-xs font-bold uppercase mb-2 group-hover:text-primary">Pending Verify</div>
                  <div className="text-3xl font-black text-blue-500">{verifications.length}</div>
              </div>
              <div onClick={() => setActiveTab('reports')} className="bg-white p-6 rounded-[24px] shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-all group">
                  <div className="text-gray-400 text-xs font-bold uppercase mb-2 group-hover:text-red-500">Pending Reports</div>
                  <div className="text-3xl font-black text-red-500">{reports.length}</div>
              </div>
          </div>
      )}

      {/* --- VERIFICATIONS TAB --- */}
      {activeTab === 'verify' && (
          <div className="space-y-4 animate-fade-in">
              {verifications.length === 0 ? <div className="text-center py-20 text-gray-400">No pending requests.</div> : verifications.map(req => (
                  <div key={req.id} className="bg-white p-6 rounded-[24px] shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6">
                      <div className="flex gap-4 overflow-x-auto">
                          <a href={req.frontURL} target="_blank" rel="noreferrer" className="block w-40 h-24 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 relative group">
                              <img src={req.frontURL} className="w-full h-full object-cover" alt="ID Front" />
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-bold">View Front</div>
                          </a>
                          <a href={req.backURL} target="_blank" rel="noreferrer" className="block w-40 h-24 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 relative group">
                              <img src={req.backURL} className="w-full h-full object-cover" alt="ID Back" />
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-bold">View Back</div>
                          </a>
                      </div>
                      <div className="flex-1">
                          <div className="flex justify-between items-start mb-2">
                              <div>
                                  <h3 className="text-xl font-bold text-dark flex items-center gap-2">
                                      {req.name}
                                      {req.targetType === 'business_page' && <span className="bg-blue-100 text-blue-600 text-[10px] px-2 py-0.5 rounded-full uppercase">Business</span>}
                                  </h3>
                                  <p className="text-sm text-gray-500">
                                      {req.targetType === 'business_page' ? (
                                          <>Type: {req.details?.businessType} • Reg: {req.details?.regNumber}</>
                                      ) : (
                                          <>{req.docType} • {req.category}</>
                                      )}
                                  </p>
                              </div>
                              <div className="text-right">
                                  <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full">Paid ৳{req.payment?.amount}</span>
                                  <p className="text-[10px] text-gray-400 mt-1">TXN: {req.payment?.txnId}</p>
                              </div>
                          </div>
                          <div className="flex gap-3 mt-4">
                              <button onClick={() => handleVerifyAction(req, 'approve')} className="bg-blue-500 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-blue-600 shadow-md">Approve & Verify</button>
                              <button onClick={() => handleVerifyAction(req, 'reject')} className="bg-white border border-gray-200 text-gray-600 px-6 py-2 rounded-xl font-bold text-sm hover:bg-gray-50">Reject</button>
                          </div>
                      </div>
                  </div>
              ))}
          </div>
      )}

      {/* --- REPORTS TAB --- */}
      {activeTab === 'reports' && (
          <div className="space-y-4 animate-fade-in">
               {reports.length === 0 ? <div className="text-center py-20 text-gray-400">Clean records! No reports.</div> : reports.map(rep => (
                   <div key={rep.id} className="bg-white p-4 rounded-[24px] shadow-sm border border-red-100 flex items-center gap-4">
                       <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500 text-xl shrink-0">
                           <i className="fas fa-exclamation-triangle"></i>
                       </div>
                       <div className="flex-1">
                           <h4 className="font-bold text-dark text-sm">Reported {rep.type}</h4>
                           <p className="text-xs text-red-500 font-bold uppercase tracking-wider mt-1">{rep.reason}</p>
                           <p className="text-xs text-gray-400 mt-1">Target ID: {rep.targetId || rep.postId}</p>
                       </div>
                       <div className="flex gap-2">
                           <button onClick={() => navigate(rep.type === 'post' ? `/post/${rep.targetId || rep.postId}` : `/product/${rep.targetId}`)} className="px-4 py-2 bg-gray-100 text-dark rounded-lg text-xs font-bold hover:bg-gray-200">View Content</button>
                           <button onClick={() => handleReportAction(rep, 'delete_content')} className="px-4 py-2 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 shadow-sm">Delete Content</button>
                           <button onClick={() => handleReportAction(rep, 'dismiss')} className="px-4 py-2 border border-gray-200 text-gray-500 rounded-lg text-xs font-bold hover:bg-gray-50">Dismiss</button>
                       </div>
                   </div>
               ))}
          </div>
      )}
    </div>
  );
};

export default AdminDashboard;