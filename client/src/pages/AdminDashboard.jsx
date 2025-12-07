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

  // 1. Auth & Admin Check
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        try {
            const userSnap = await getDoc(doc(db, 'users', u.uid));
            if (userSnap.exists() && userSnap.data().isAdmin) {
                setIsAdmin(true);
            } else {
                alert("Access Denied: Admins Only");
                navigate('/');
            }
        } catch (error) {
            console.error("Admin Check Error:", error);
            navigate('/');
        }
      } else {
        navigate('/');
      }
      setLoading(false);
    });
    return () => unsub();
  }, [navigate]);

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
    }, (error) => console.error("Verify Listener Error", error));

    // B. LISTEN FOR REPORTS (Includes Shinobi Guilds/Messages)
    const qReports = query(collection(db, 'reports'), orderBy('timestamp', 'desc'));
    const unsubReports = onSnapshot(qReports, (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setReports(list);
        setStats(prev => ({ ...prev, reports: list.length }));
    }, (error) => console.error("Report Listener Error", error));

    // C. FETCH STATIC STATS
    const fetchStaticStats = async () => {
        try {
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
        } catch (e) {
            console.error("Stats Fetch Error", e);
        }
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
              batch.update(reqRef, { status: 'approved', processedAt: serverTimestamp() });
              
              if (req.targetType === 'business_page') {
                  const businessRef = doc(db, 'business_pages', req.targetId);
                  batch.update(businessRef, { isVerified: true });
              } else {
                  const targetUserId = req.targetId || req.uid;
                  const userRef = doc(db, 'users', targetUserId);
                  batch.update(userRef, { isVerified: true });
              }

              const notifRef = doc(collection(db, 'notifications'));
              batch.set(notifRef, {
                  recipientId: req.uid,
                  type: 'system',
                  message: `Your ${req.targetType === 'business_page' ? 'Business' : 'Profile'} verification was approved!`,
                  timestamp: serverTimestamp(),
                  isRead: false
              });

          } else {
              batch.update(reqRef, { status: 'rejected', processedAt: serverTimestamp() });
          }

          await batch.commit();
          alert(`Request ${action}d!`);

      } catch (e) {
          console.error("Action Failed:", e);
          alert("Action failed.");
      }
  };

  const handleViewContent = (rep) => {
      // 1. SHINOBI: Guilds (Groups)
      if (rep.type === 'guild') {
          // Navigates to ShinobiMessenger and forces the guild open via location.state
          navigate('/messages', { 
              state: { activeConversationId: rep.targetId } 
          });
          return;
      }

      // 2. SHINOBI: Chat Users / Messages
      if (rep.type === 'message' || (rep.type === 'user' && rep.context === 'shinobi')) {
          // Opens Shinobi with the specific user selected
          navigate('/messages', { 
              state: { userId: rep.targetId } 
          });
          return;
      }

      // 3. CIRCLES
      if (rep.type === 'circle' || (rep.circleId && rep.postId)) {
          navigate(`/circles/${rep.targetId || rep.circleId}`);
          return;
      }

      // 4. USERS / PROFILES (General)
      if (rep.type === 'user' || rep.type === 'profile') {
          navigate(`/profile/${rep.targetId}`);
          return;
      }

      // 5. POSTS
      if (rep.type === 'post') {
          navigate(`/post/${rep.targetId || rep.postId}`);
          return;
      }

      // 6. BUSINESS / MARKETPLACE
      if (rep.type === 'business') {
          navigate(`/business/${rep.targetId}`);
          return;
      }
      if (rep.type === 'product' || rep.type === 'marketplace') {
          navigate(`/product/${rep.targetId}`);
          return;
      }

      // Fallback
      if (rep.targetId) navigate(`/profile/${rep.targetId}`);
      else alert("Target not found.");
  };

  const handleReportAction = async (report, action) => {
      try {
          if (action === 'delete_content') {
              if (!confirm("Permanently delete this content? This cannot be undone.")) return;
              
              let collectionName = 'posts'; 
              let docId = report.targetId || report.postId;

              // Map Report Type to Firestore Collection
              if (report.type === 'product') collectionName = 'marketplace';
              else if (report.type === 'circle') collectionName = 'circles';
              else if (report.type === 'business') collectionName = 'business_pages';
              
              // SHINOBI MAPPING
              else if (report.type === 'guild') {
                  collectionName = 'conversations'; // Deleting a guild removes the conversation doc
              }
              
              // Perform Delete
              if (report.circleId && report.postId) {
                  // Specific sub-collection for circle posts
                  await deleteDoc(doc(db, `circles/${report.circleId}/posts`, report.postId));
              } else {
                  await deleteDoc(doc(db, collectionName, docId));
              }
              
              alert("Content deleted successfully.");
          }
          
          // Remove the Report ticket itself
          await deleteDoc(doc(db, 'reports', report.id));
          
          // Update local state to remove the item immediately
          setReports(prev => prev.filter(r => r.id !== report.id));
          
      } catch (e) {
          console.error(e);
          alert("Action failed. Check console.");
      }
  };

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-500 font-bold">Verifying Admin Access...</div>;
  if (!isAdmin) return null;

  return (
    <div className="p-4 md:p-6 w-full max-w-[1400px] mx-auto pb-24">
      <div className="hidden md:block"><TopBar /></div>
      
      <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-dark rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">
              <i className="fas fa-user-shield"></i>
          </div>
          <div>
              <h1 className="text-3xl font-black text-dark">Admin Dashboard</h1>
              <p className="text-gray-500 font-bold">Platform Overview & Moderation</p>
          </div>
      </div>

      {/* TABS */}
      <div className="flex gap-4 mb-8 border-b border-gray-200 overflow-x-auto no-scrollbar">
          {['overview', 'verify', 'reports'].map(t => (
              <button 
                key={t} 
                onClick={() => setActiveTab(t)}
                className={`px-6 py-3 font-bold capitalize transition-all border-b-4 whitespace-nowrap ${activeTab === t ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-dark'}`}
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
              {verifications.length === 0 ? <div className="text-center py-20 text-gray-400 font-bold">No pending verification requests.</div> : verifications.map(req => (
                  <div key={req.id} className="bg-white p-6 rounded-[24px] shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6">
                      <div className="flex gap-4 overflow-x-auto">
                          <a href={req.frontURL} target="_blank" rel="noreferrer" className="block w-40 h-24 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 relative group shrink-0">
                              <img src={req.frontURL} className="w-full h-full object-cover" alt="ID Front" />
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-bold">View Front</div>
                          </a>
                          <a href={req.backURL} target="_blank" rel="noreferrer" className="block w-40 h-24 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 relative group shrink-0">
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
               {reports.length === 0 ? <div className="text-center py-20 text-gray-400 font-bold">Clean records! No reports found.</div> : reports.map(rep => (
                   <div key={rep.id} className="bg-white p-4 rounded-[24px] shadow-sm border border-red-100 flex flex-col md:flex-row items-center gap-4">
                       <div className="flex items-center gap-4 w-full md:w-auto">
                           <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500 text-xl shrink-0">
                               <i className={`fas ${rep.type === 'guild' ? 'fa-users-slash' : 'fa-exclamation-triangle'}`}></i>
                           </div>
                           <div className="flex-1 md:hidden">
                               <h4 className="font-bold text-dark text-sm capitalize">{rep.type || 'Content'} Report</h4>
                               <p className="text-xs text-red-500 font-bold uppercase tracking-wider mt-1">{rep.reason}</p>
                           </div>
                       </div>
                       
                       <div className="flex-1 hidden md:block">
                           <h4 className="font-bold text-dark text-sm capitalize">{rep.type || 'Content'} Report</h4>
                           <p className="text-xs text-red-500 font-bold uppercase tracking-wider mt-1">{rep.reason}</p>
                           <p className="text-xs text-gray-400 mt-1">ID: {rep.targetId || rep.postId || rep.circleId}</p>
                       </div>

                       <div className="flex gap-2 w-full md:w-auto justify-end">
                           <button onClick={() => handleViewContent(rep)} className="px-4 py-2 bg-gray-100 text-dark rounded-lg text-xs font-bold hover:bg-gray-200 flex items-center gap-2">
                               <i className="fas fa-eye"></i> View
                           </button>
                           <button onClick={() => handleReportAction(rep, 'delete_content')} className="px-4 py-2 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 shadow-sm flex items-center gap-2">
                               <i className="fas fa-trash"></i> Delete Content
                           </button>
                           <button onClick={() => handleReportAction(rep, 'dismiss')} className="px-4 py-2 border border-gray-200 text-gray-500 rounded-lg text-xs font-bold hover:bg-gray-50">
                               Dismiss
                           </button>
                       </div>
                   </div>
               ))}
          </div>
      )}
    </div>
  );
};

export default AdminDashboard;