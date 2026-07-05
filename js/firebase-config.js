// ===========================================================================
// CONFIGURATION FIREBASE
// ===========================================================================

const firebaseConfig = {
  apiKey: "AIzaSyBtlCWRN4ZiXVQG7FHCDt2r5y5vr7TtNDI",
  authDomain: "loup-garou-b94c2.firebaseapp.com",
  projectId: "loup-garou-b94c2",
  storageBucket: "loup-garou-b94c2.firebasestorage.app",
  messagingSenderId: "288885294637",
  appId: "1:288885294637:web:a1d622d648a41ab1089aa4"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
