require("dotenv").config(); // Load environment variables first

const { onCall, HttpsError, onRequest } = require("firebase-functions/v2/https");
const { onDocumentWritten, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const axios = require("axios");
const { v4: uuidv4 } = require('uuid');

// --- STRIPE CONFIG ---
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

admin.initializeApp();

// ============================================================
// SECTION A: PAYMENT CONFIGURATION & HELPERS
// ============================================================

// --- BKASH CONFIG (SANDBOX) ---
const bkashConfig = {
    base_url: "https://tokenized.sandbox.bka.sh/v1.2.0-beta",
    username: process.env.BKASH_USERNAME,
    password: process.env.BKASH_PASSWORD,
    app_key: process.env.BKASH_APP_KEY,
    app_secret: process.env.BKASH_APP_SECRET
};

// --- HELPER: Get bKash Token ---
async function getBkashToken() {
    try {
        const response = await axios.post(
            `${bkashConfig.base_url}/tokenized/checkout/token/grant`,
            {
                app_key: bkashConfig.app_key,
                app_secret: bkashConfig.app_secret
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "username": bkashConfig.username,
                    "password": bkashConfig.password
                }
            }
        );
        return response.data.id_token;
    } catch (error) {
        console.error("bKash Token Error:", error.response ? error.response.data : error.message);
        throw new Error("Failed to authenticate with bKash");
    }
}

// ============================================================
// SECTION B: PAYMENT FUNCTIONS
// ============================================================

// 1. Create Payment Session
exports.createPaymentSession = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be logged in.');
    }

    const { orderId, amount, currency, paymentMethod, successUrl, cancelUrl } = request.data;
    const userId = request.auth.uid;

    try {
        // --- STRIPE (CARD) ---
        if (paymentMethod === 'card') {
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: currency || 'bdt',
                        product_data: {
                            name: 'Tukumi Order: ' + orderId,
                        },
                        unit_amount: Math.round(amount * 100),
                    },
                    quantity: 1,
                }],
                mode: 'payment',
                success_url: successUrl,
                cancel_url: cancelUrl,
                metadata: { orderId: orderId, userId: userId }
            });

            return { paymentUrl: session.url };
        }

        // --- BKASH ---
        if (paymentMethod === 'bkash') {
            const idToken = await getBkashToken();

            let callbackOrigin;
            try {
                callbackOrigin = new URL(successUrl).origin;
            } catch (e) {
                callbackOrigin = "http://localhost:5173";
            }

            const callbackURL = `${callbackOrigin}/bkash/callback`;

            const paymentData = {
                mode: "0011",
                payerReference: userId,
                callbackURL: callbackURL,
                amount: amount.toString(),
                currency: "BDT",
                intent: "sale",
                merchantInvoiceNumber: "Inv" + uuidv4().substring(0, 8)
            };

            const response = await axios.post(
                `${bkashConfig.base_url}/tokenized/checkout/create`,
                paymentData,
                {
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "authorization": idToken,
                        "x-app-key": bkashConfig.app_key
                    }
                }
            );

            if (!response.data || !response.data.paymentID) {
                console.error("bKash Create Failed:", response.data);
                throw new HttpsError('aborted', `bKash Error: ${response.data.statusMessage || 'Unknown error'}`);
            }

            await admin.firestore().collection('orders').doc(orderId).update({
                bkashPaymentId: response.data.paymentID,
                status: 'initiated'
            });

            return { paymentUrl: response.data.bkashURL };
        }

    } catch (error) {
        console.error("Payment Error:", error);
        throw new HttpsError('internal', error.message);
    }
});

// 2. Execute bKash Payment
exports.executeBkashPayment = onCall(async (request) => {
    const { paymentID } = request.data;
    try {
        const idToken = await getBkashToken();

        const response = await axios.post(
            `${bkashConfig.base_url}/tokenized/checkout/execute`,
            { paymentID },
            {
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "authorization": idToken,
                    "x-app-key": bkashConfig.app_key
                }
            }
        );

        const result = response.data;

        if (result && result.statusCode === "0000" && result.transactionStatus === "Completed") {
            const ordersRef = admin.firestore().collection('orders');
            const snapshot = await ordersRef.where('bkashPaymentId', '==', paymentID).get();

            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                await doc.ref.update({
                    status: 'paid',
                    paidAt: admin.firestore.FieldValue.serverTimestamp(),
                    txnId: result.trxID,
                    bkashData: result
                });
            }
            return { success: true, data: result };
        } else {
            throw new Error(result.statusMessage || "Payment Failed");
        }

    } catch (error) {
        console.error("bKash Execute Error:", error);
        throw new HttpsError('internal', error.message);
    }
});

// ============================================================
// 3. STRIPE WEBHOOK (SAFE)
// ============================================================

exports.stripeWebhook = onRequest(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.rawBody,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const orderId = session.metadata.orderId;

        await admin.firestore().collection('orders').doc(orderId).update({
            status: 'paid',
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            txnId: session.payment_intent
        });
    }

    res.json({ received: true });
});

// ============================================================
// SECTION C: SOCIAL FEATURES (TRIGGERS)
// ============================================================

// 4. SYNC PROFILE UPDATES
exports.onUserUpdate = onDocumentUpdated("users/{userId}", async (event) => {
    const newData = event.data.after.data();
    const oldData = event.data.before.data();

    if (
        newData.displayName === oldData.displayName &&
        newData.photoURL === oldData.photoURL &&
        newData.isVerified === oldData.isVerified
    ) {
        return null;
    }

    const userId = event.params.userId;
    const batch = admin.firestore().batch();
    let batchCount = 0;

    // Update Posts
    const postsQuery = await admin.firestore().collection('posts').where('uid', '==', userId).get();
    postsQuery.forEach(doc => {
        if (batchCount < 499) {
            batch.update(doc.ref, {
                userName: newData.displayName,
                userAvatar: newData.photoURL,
                isVerified: newData.isVerified || false
            });
            batchCount++;
        }
    });

    // Update Chats
    const chatsQuery = await admin.firestore().collection('conversations')
        .where('participants', 'array-contains', userId)
        .get();

    chatsQuery.forEach(doc => {
        if (batchCount < 499) {
            const chatData = doc.data();
            const updatedUsers = chatData.users.map(u => {
                if (u.uid === userId) {
                    return {
                        ...u,
                        displayName: newData.displayName,
                        photoURL: newData.photoURL,
                        isVerified: newData.isVerified || false
                    };
                }
                return u;
            });
            batch.update(doc.ref, { users: updatedUsers });
            batchCount++;
        }
    });

    if (batchCount > 0) {
        await batch.commit();
    }
});

// 5. NOTIFICATIONS FOR LIKES
exports.onPostUpdate = onDocumentUpdated("posts/{postId}", async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    const oldLikes = before.likedBy || [];
    const newLikesList = after.likedBy || [];

    const addedLikes = newLikesList.filter(uid => !oldLikes.includes(uid));

    if (addedLikes.length > 0) {
        const batch = admin.firestore().batch();

        for (const likerId of addedLikes) {
            if (likerId === after.uid) continue;

            const likerSnap = await admin.firestore().collection('users').doc(likerId).get();
            const likerData = likerSnap.data();

            const notifRef = admin.firestore().collection('notifications').doc();
            batch.set(notifRef, {
                recipientId: after.uid,
                senderId: likerId,
                senderName: likerData ? likerData.displayName : "Someone",
                senderAvatar: likerData ? likerData.photoURL : null,
                type: "like",
                targetId: event.params.postId,
                message: "liked your post.",
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                isRead: false
            });
        }
        await batch.commit();
    }
});

// 6. NOTIFICATIONS FOR COMMENTS + REPLIES
exports.onCommentCreate = onDocumentWritten("posts/{postId}/comments/{commentId}", async (event) => {
    if (!event.data.after.exists) return;

    const comment = event.data.after.data();
    const postId = event.params.postId;
    const batch = admin.firestore().batch();

    // Notify Post Author
    const postSnap = await admin.firestore().collection('posts').doc(postId).get();
    if (postSnap.exists) {
        const post = postSnap.data();
        if (comment.uid !== post.uid) {
            const notifRef = admin.firestore().collection('notifications').doc();
            batch.set(notifRef, {
                recipientId: post.uid,
                senderId: comment.uid,
                senderName: comment.userName,
                senderAvatar: comment.userAvatar,
                type: "comment",
                targetId: postId,
                commentId: event.params.commentId,
                message: `commented: ${comment.text ? comment.text.substring(0, 20) : ""}...`,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                isRead: false
            });
        }
    }

    // Notify Parent Commenter
    if (comment.parentId) {
        const parentSnap = await admin.firestore()
            .collection('posts')
            .doc(postId)
            .collection('comments')
            .doc(comment.parentId)
            .get();

        if (parentSnap.exists) {
            const parent = parentSnap.data();

            if (parent.uid !== comment.uid && parent.uid !== postSnap.data().uid) {
                const replyRef = admin.firestore().collection('notifications').doc();
                batch.set(replyRef, {
                    recipientId: parent.uid,
                    senderId: comment.uid,
                    senderName: comment.userName,
                    senderAvatar: comment.userAvatar,
                    type: "comment",
                    targetId: postId,
                    commentId: event.params.commentId,
                    message: `replied: ${comment.text ? comment.text.substring(0, 20) : ""}...`,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    isRead: false
                });
            }
        }
    }

    await batch.commit();
});