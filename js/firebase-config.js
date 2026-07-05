// ===========================================================================
// CONFIGURATION FIREBASE
// ---------------------------------------------------------------------------
// Remplace les valeurs ci-dessous par celles de TON projet Firebase.
// Tu les trouves dans : Console Firebase > Paramètres du projet > Général
// > "Vos applications" > icône Web (</>) > "Configuration du SDK".
//
// Voir le README.md à la racine du projet pour le guide pas-à-pas complet.
// ===========================================================================

const firebaseConfig = {
  apiKey: "REMPLACE_MOI",
  authDomain: "REMPLACE_MOI.firebaseapp.com",
  projectId: "REMPLACE_MOI",
  storageBucket: "REMPLACE_MOI.appspot.com",
  messagingSenderId: "REMPLACE_MOI",
  appId: "REMPLACE_MOI"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
