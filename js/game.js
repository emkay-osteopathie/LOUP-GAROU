// ===========================================================================
// LOUP-GAROU YOPI — Moteur de jeu partagé
// Utilisé par admin.js et joueur.js. Repose sur Firestore (voir firebase-config.js)
// ===========================================================================

const ROLES = {
  'loup-garou': { label: 'Loup-Garou', symbole: '🐺', camp: 'loups' },
  'voyante':    { label: 'Voyante',    symbole: '🔮', camp: 'village' },
  'cupidon':    { label: 'Cupidon',    symbole: '💘', camp: 'village' },
  'chasseur':   { label: 'Chasseur',   symbole: '🏹', camp: 'village' },
  'sorciere':   { label: 'Sorcière',   symbole: '🧪', camp: 'village' },
  'villageois': { label: 'Villageois', symbole: '🌾', camp: 'village' }
};

// Répartition fixe pour 16 joueurs
const ROLE_COUNTS = {
  'loup-garou': 4,
  'voyante': 1,
  'cupidon': 1,
  'chasseur': 1,
  'sorciere': 1,
  'villageois': 8
};

const MAX_ROUNDS = 8;

// ---- Références Firestore -------------------------------------------------

const refGame = () => db.collection('games').doc('main');
const refPlayers = () => db.collection('joueurs');
const refPlayer = (pin) => db.collection('joueurs').doc(pin);
const refNightActions = () => db.collection('actionsNuit').doc('main');
const refDayVotes = () => db.collection('votesJour').doc('main');
const refHistory = () => db.collection('historique');

// ---- Utilitaires ------------------------------------------------------------

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// estPublic=false  -> visible seulement dans le journal admin (actions secrètes)
// estPublic=true   -> visible aussi dans le journal des joueurs (événements publics)
async function ajouterHistorique(round, phase, texte, estPublic = false) {
  await refHistory().add({
    round, phase, texte, public: estPublic,
    ts: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function getAllPlayers() {
  const snap = await refPlayers().get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function nightStepsForRound(round) {
  return round === 1
    ? ['cupidon', 'voyante', 'loups', 'sorciere']
    : ['voyante', 'loups', 'sorciere'];
}

// ---- Horaire quotidien de la partie ----------------------------------------
// 09h00–12h00 : nuit   12h00–13h00 : jour (vote)
// 13h00–15h30 : nuit   15h30–16h00 : jour (vote)
// Ce cycle se répète chaque jour de camp jusqu'à la fin de la partie (8 rondes).

const HORAIRE = [
  { debut: 9,    fin: 12,   phase: 'nuit', label: '9h00 – 12h00' },
  { debut: 12,   fin: 13,   phase: 'jour', label: '12h00 – 13h00' },
  { debut: 13,   fin: 15.5, phase: 'nuit', label: '13h00 – 15h30' },
  { debut: 15.5, fin: 16,   phase: 'jour', label: '15h30 – 16h00' }
];

function heureActuelleDecimale() {
  const m = new Date();
  return m.getHours() + m.getMinutes() / 60;
}

// Retourne le bloc horaire actuel ({phase, label}) ou null si on est hors des
// heures de jeu (avant 9h, après 16h, ou l'heure du souper/soirée).
function blocHoraireActuel() {
  const h = heureActuelleDecimale();
  return HORAIRE.find(b => h >= b.debut && h < b.fin) || null;
}

function estDansPeriodeNuitAutorisee() {
  const bloc = blocHoraireActuel();
  return !!bloc && bloc.phase === 'nuit';
}

function estDansPeriodeJourAutorisee() {
  const bloc = blocHoraireActuel();
  return !!bloc && bloc.phase === 'jour';
}

const MESSAGE_HORS_PERIODE = 'Les actions de nuit sont seulement permises de 9h à 12h et de 13h à 15h30.';
const MESSAGE_HORS_PERIODE_JOUR = 'Le vote du village est seulement permis de 12h à 13h et de 15h30 à 16h.';

// Prend une "photo" de qui est vivant/mort à l'instant présent. C'est cette
// photo (et non le statut en temps réel) qui est montrée aux villageois et
// rôles spéciaux — seuls les loups voient l'état réel en tout temps.
async function snapshotVivants() {
  const players = await getAllPlayers();
  const map = {};
  players.forEach(p => { map[p.id] = p.vivant; });
  await refGame().update({ vivantsConnus: map });
}

// ---- Démarrage de partie : attribution aléatoire des rôles ----------------

async function assignerRolesEtDemarrer() {
  const players = await getAllPlayers();
  if (players.length !== 16) {
    throw new Error(`Il faut exactement 16 joueurs inscrits (actuellement ${players.length}).`);
  }

  const pool = [];
  Object.entries(ROLE_COUNTS).forEach(([role, count]) => {
    for (let i = 0; i < count; i++) pool.push(role);
  });
  const shuffledRoles = shuffle(pool);
  const shuffledPlayers = shuffle(players);

  const batch = db.batch();
  const vivantsConnus = {};
  shuffledPlayers.forEach((p, i) => {
    batch.update(refPlayer(p.id), {
      role: shuffledRoles[i],
      vivant: true,
      amoureux: false,
      amoureuxId: null,
      sorciereVieUtilisee: false,
      sorciereMortUtilisee: false,
      voteCible: null
    });
    vivantsConnus[p.id] = true;
  });
  await batch.commit();

  await refGame().set({
    phase: 'nuit',
    round: 1,
    nightStep: 'cupidon',
    dayStep: null,
    started: true,
    termine: false,
    winner: null,
    lastDeaths: [],
    mortsEnCours: [],
    tirChasseurEnAttente: null,
    verrouForcage: false,
    verrouForcageTs: null,
    vivantsConnus
  });

  await refNightActions().set({
    round: 1,
    cupidonCible1: null,
    cupidonCible2: null,
    voyanteCible: null,
    voyanteResultat: null,
    loupsCibles: {},
    loupsConsensus: null,
    sorciereActionVie: null,
    sorciereActionMort: null,
    sorciereTermine: false
  });

  await ajouterHistorique(1, 'nuit', 'La partie commence. Les rôles ont été distribués.', true);
}

// ---- Cupidon : désigne les 2 amoureux (nuit 1 seulement) -------------------

async function cupidonDesignerAmoureux(id1, id2) {
  if (!estDansPeriodeNuitAutorisee()) throw new Error(MESSAGE_HORS_PERIODE);
  const [p1, p2] = await Promise.all([refPlayer(id1).get(), refPlayer(id2).get()]);
  await refPlayer(id1).update({ amoureux: true, amoureuxId: id2 });
  await refPlayer(id2).update({ amoureux: true, amoureuxId: id1 });
  await refNightActions().update({ cupidonCible1: id1, cupidonCible2: id2 });
  await ajouterHistorique(1, 'nuit', `Cupidon a formé un couple : ${p1.data().nom} 💘 ${p2.data().nom}.`);
  await ajouterHistorique(1, 'nuit', 'Cupidon a terminé son tour.', true);
  await avancerEtapeNuit();
}

// ---- Passage à l'étape de nuit suivante ------------------------------------

async function avancerEtapeNuit() {
  const gameSnap = await refGame().get();
  const game = gameSnap.data();
  if (game.phase !== 'nuit') return; // sécurité : rien à avancer si on n'est plus en nuit
  const steps = nightStepsForRound(game.round);
  const idx = steps.indexOf(game.nightStep);
  if (idx < steps.length - 1) {
    const prochaine = steps[idx + 1];
    const update = { nightStep: prochaine };
    if (prochaine === 'loups') {
      update.loupsTimerFin = Date.now() + 45 * 60 * 1000; // 45 minutes
    } else if (game.nightStep === 'loups') {
      update.loupsTimerFin = null;
    }
    await refGame().update(update);
  } else {
    if (game.nightStep === 'loups') {
      await refGame().update({ loupsTimerFin: null });
    }
    // Toutes les étapes de nuit sont faites : on résout la nuit
    await resoudreNuit();
  }
}

// Vérifie si le minuteur des loups est expiré ; si oui, force une décision au
// hasard puis avance. Appelé périodiquement depuis joueur.js et admin.js.
async function verifierExpirationTimerLoups() {
  const gameSnap = await refGame().get();
  const game = gameSnap.data();
  if (!game || game.phase !== 'nuit' || game.nightStep !== 'loups' || !game.loupsTimerFin) return;
  if (Date.now() < game.loupsTimerFin) return;

  const naSnap = await refNightActions().get();
  if (naSnap.data().loupsConsensus) return; // déjà résolu entre-temps

  const verrouObtenu = await tenterAcquerirVerrou();
  if (!verrouObtenu) return;

  try {
    await forcerDecisionNuitAleatoire('loups');
    await avancerEtapeNuit();
  } finally {
    await relacherVerrou();
  }
}

// ---- Résolution de la nuit (cascade des morts) -----------------------------

async function resoudreNuit() {
  const gameSnap = await refGame().get();
  const game = gameSnap.data();
  const naSnap = await refNightActions().get();
  const na = naSnap.data();

  await refGame().update({ mortsEnCours: [] });

  let morts = new Set();

  // Victime des loups, sauf si sorcière a utilisé la potion de vie sur elle
  if (na.loupsConsensus && na.sorciereActionVie !== na.loupsConsensus) {
    morts.add(na.loupsConsensus);
  }
  // Potion de mort de la sorcière
  if (na.sorciereActionMort) {
    morts.add(na.sorciereActionMort);
  }

  await appliquerMortsEtCascade(morts, game.round, 'nuit');
}

// Applique un ensemble de morts, gère la cascade amoureux + déclenche le
// chasseur si besoin, puis fait progresser la partie (nuit -> jour, ou fin).
async function appliquerMortsEtCascade(mortsInitiales, round, phaseOrigine) {
  const players = await getAllPlayers();
  const byId = Object.fromEntries(players.map(p => [p.id, p]));

  let morts = new Set([...mortsInitiales].filter(id => byId[id] && byId[id].vivant));
  let changement = true;
  while (changement) {
    changement = false;
    for (const id of [...morts]) {
      const p = byId[id];
      if (p && p.amoureux && p.amoureuxId && byId[p.amoureuxId].vivant && !morts.has(p.amoureuxId)) {
        morts.add(p.amoureuxId);
        changement = true;
      }
    }
  }

  // Marquer les morts dans Firestore
  const batch = db.batch();
  for (const id of morts) {
    batch.update(refPlayer(id), { vivant: false });
  }
  await batch.commit();

  const nomsMorts = [...morts].map(id => byId[id].nom).join(', ');
  await ajouterHistorique(round, phaseOrigine, morts.size > 0
    ? `Morts (détail admin) : ${nomsMorts}.`
    : 'Personne n\'est mort cette fois-ci (détail admin).');

  await refGame().update({
    lastDeaths: [...morts],
    mortsEnCours: firebase.firestore.FieldValue.arrayUnion(...[...morts])
  });

  // Le chasseur mort doit tirer, s'il ne l'a pas déjà fait
  const chasseurMort = [...morts].find(id => byId[id].role === 'chasseur');
  if (chasseurMort) {
    await refGame().update({ tirChasseurEnAttente: chasseurMort });
    return; // on attend l'action du chasseur avant de continuer (voir resoudreTirChasseur)
  }

  await continuerApresMorts(round, phaseOrigine);
}

// Appelé quand le chasseur choisit sa cible (depuis joueur.js)
async function resoudreTirChasseur(chasseurId, cibleId) {
  const gameSnap = await refGame().get();
  const game = gameSnap.data();
  const [chasseur, cible] = await Promise.all([refPlayer(chasseurId).get(), refPlayer(cibleId).get()]);
  await ajouterHistorique(game.round, game.phase, `Le Chasseur (${chasseur.data().nom}) a tiré sur ${cible.data().nom} en tombant.`);
  await refGame().update({ tirChasseurEnAttente: null });
  await appliquerMortsEtCascade(new Set([cibleId]), game.round, game.phase);
}

// Vérifie la victoire et fait avancer vers jour/nuit suivante ou fin de partie
async function continuerApresMorts(round, phaseOrigine) {
  const players = await getAllPlayers();
  const victoire = verifierVictoire(players);

  // La photo des vivants/morts connue des villageois se met à jour seulement
  // ici : à la transition nuit -> jour (révélation du matin), ou immédiatement
  // si l'événement se produit de jour (vote), ou à la fin de la partie.
  await snapshotVivants();

  const gameSnap = await refGame().get();
  const mortsEnCours = (gameSnap.data().mortsEnCours || []);
  const byId = Object.fromEntries(players.map(p => [p.id, p]));
  const nomsMorts = mortsEnCours.map(id => byId[id] ? byId[id].nom : '???').join(', ');

  if (victoire) {
    await refGame().update({ phase: 'termine', termine: true, winner: victoire.camp });
    await ajouterHistorique(round, 'fin', victoire.message, true);
    return;
  }

  if (phaseOrigine === 'nuit') {
    // On passe au jour : révélation publique des événements de la nuit
    await refDayVotes().set({ round, votes: {} });
    await refGame().update({ phase: 'jour', dayStep: 'discussion', nightStep: null });
    await ajouterHistorique(round, 'jour', mortsEnCours.length > 0
      ? `Cette nuit, le village a perdu : ${nomsMorts}.`
      : 'Personne n\'est mort cette nuit.', true);
  } else {
    // On sort du jour : annonce publique du résultat du vote, puis ronde
    // suivante ou fin forcée
    await ajouterHistorique(round, 'jour', mortsEnCours.length > 0
      ? `Le village a éliminé : ${nomsMorts}.`
      : 'Personne n\'a été éliminé aujourd\'hui.', true);

    if (round >= MAX_ROUNDS) {
      await refGame().update({ phase: 'termine', termine: true, winner: 'match-nul' });
      await ajouterHistorique(round, 'fin', 'La 8e ronde est terminée sans vainqueur. Match nul.', true);
    } else {
      const nextRound = round + 1;
      await refNightActions().set({
        round: nextRound,
        cupidonCible1: null, cupidonCible2: null,
        voyanteCible: null, voyanteResultat: null,
        loupsCibles: {}, loupsConsensus: null,
        sorciereActionVie: null, sorciereActionMort: null,
        sorciereTermine: false
      });
      await refGame().update({
        phase: 'nuit', round: nextRound,
        nightStep: nightStepsForRound(nextRound)[0], dayStep: null
      });
      await ajouterHistorique(nextRound, 'nuit', 'La nuit tombe sur le village.', true);
    }
  }
}

// ---- Vote de jour -----------------------------------------------------------

async function voterJour(votantId, cibleId) {
  if (!estDansPeriodeJourAutorisee()) throw new Error(MESSAGE_HORS_PERIODE_JOUR);
  await refDayVotes().update({ [`votes.${votantId}`]: cibleId });
}

async function resoudreVoteJour() {
  const gameSnap = await refGame().get();
  const game = gameSnap.data();
  const dvSnap = await refDayVotes().get();
  const votes = dvSnap.data().votes || {};

  const tally = {};
  Object.values(votes).forEach(cible => {
    tally[cible] = (tally[cible] || 0) + 1;
  });

  let elimine = null;
  let max = -1;
  let egalite = false;
  Object.entries(tally).forEach(([cible, count]) => {
    if (count > max) { max = count; elimine = cible; egalite = false; }
    else if (count === max) { egalite = true; }
  });

  await refGame().update({ mortsEnCours: [] });

  if (egalite) {
    await ajouterHistorique(game.round, 'jour', 'Égalité des votes : personne n\'est éliminé.', true);
    await continuerApresMorts(game.round, 'jour');
    return;
  }

  if (!elimine) {
    await ajouterHistorique(game.round, 'jour', 'Aucun vote n\'a été exprimé.', true);
    await continuerApresMorts(game.round, 'jour');
    return;
  }

  await appliquerMortsEtCascade(new Set([elimine]), game.round, 'jour');
}

// Permet à l'admin de trancher manuellement en cas d'égalité (ou pour forcer)
async function resoudreVoteJourManuel(cibleId) {
  const gameSnap = await refGame().get();
  const game = gameSnap.data();
  await refGame().update({ mortsEnCours: [] });
  await appliquerMortsEtCascade(new Set([cibleId]), game.round, 'jour');
}

// ---- Voyante ----------------------------------------------------------------

async function voyanteSonder(sondeurId, cibleId) {
  if (!estDansPeriodeNuitAutorisee()) throw new Error(MESSAGE_HORS_PERIODE);
  const [sondeur, cible] = await Promise.all([refPlayer(sondeurId).get(), refPlayer(cibleId).get()]);
  const role = cible.data().role;
  await refNightActions().update({ voyanteCible: cibleId, voyanteResultat: role });
  const gameSnap = await refGame().get();
  await ajouterHistorique(gameSnap.data().round, 'nuit',
    `La Voyante (${sondeur.data().nom}) a sondé ${cible.data().nom} → rôle : ${ROLES[role].label}.`);
  await ajouterHistorique(gameSnap.data().round, 'nuit', 'La Voyante a fait son choix.', true);
  await avancerEtapeNuit();
  return role;
}

// ---- Loups (consensus) --------------------------------------------------------

async function loupProposerCible(loupId, cibleId) {
  if (!estDansPeriodeNuitAutorisee()) throw new Error(MESSAGE_HORS_PERIODE);
  await refNightActions().update({ [`loupsCibles.${loupId}`]: cibleId });

  // Vérifie si tous les loups vivants ont proposé la même cible
  const players = await getAllPlayers();
  const loupsVivants = players.filter(p => p.role === 'loup-garou' && p.vivant);
  const naSnap = await refNightActions().get();
  const cibles = naSnap.data().loupsCibles || {};

  const tousVotent = loupsVivants.every(l => cibles[l.id]);
  if (tousVotent) {
    const valeurs = loupsVivants.map(l => cibles[l.id]);
    const consensus = valeurs.every(v => v === valeurs[0]) ? valeurs[0] : null;
    if (consensus) {
      await refNightActions().update({ loupsConsensus: consensus });
      const byId = Object.fromEntries(players.map(p => [p.id, p]));
      const gameSnap = await refGame().get();
      await ajouterHistorique(gameSnap.data().round, 'nuit',
        `Les Loups-Garous ont choisi comme cible : ${byId[consensus].nom}.`);
      await ajouterHistorique(gameSnap.data().round, 'nuit', 'Les Loups-Garous ont terminé leur tour.', true);
      await avancerEtapeNuit();
    }
  }
}

// ---- Sorcière -----------------------------------------------------------------

async function sorciereConfirmerPotionVie(sorciereId) {
  if (!estDansPeriodeNuitAutorisee()) throw new Error(MESSAGE_HORS_PERIODE);
  const naSnap = await refNightActions().get();
  const cibleLoups = naSnap.data().loupsConsensus;
  const [sorciere, cible] = await Promise.all([refPlayer(sorciereId).get(), refPlayer(cibleLoups).get()]);
  await refNightActions().update({ sorciereActionVie: cibleLoups });
  await refPlayer(sorciereId).update({ sorciereVieUtilisee: true });
  const gameSnap = await refGame().get();
  await ajouterHistorique(gameSnap.data().round, 'nuit',
    `La Sorcière (${sorciere.data().nom}) a utilisé sa potion de vie sur ${cible.data().nom}.`);
}

async function sorciereConfirmerPotionMort(sorciereId, cibleId) {
  if (!estDansPeriodeNuitAutorisee()) throw new Error(MESSAGE_HORS_PERIODE);
  const [sorciere, cible] = await Promise.all([refPlayer(sorciereId).get(), refPlayer(cibleId).get()]);
  await refNightActions().update({ sorciereActionMort: cibleId });
  await refPlayer(sorciereId).update({ sorciereMortUtilisee: true });
  const gameSnap = await refGame().get();
  await ajouterHistorique(gameSnap.data().round, 'nuit',
    `La Sorcière (${sorciere.data().nom}) a utilisé sa potion de mort sur ${cible.data().nom}.`);
}

// La sorcière signale qu'elle a terminé son tour (avec ou sans potion utilisée)
async function sorciereTerminerTour(sorciereId) {
  if (!estDansPeriodeNuitAutorisee()) throw new Error(MESSAGE_HORS_PERIODE);
  await refNightActions().update({ sorciereTermine: true });
  const gameSnap = await refGame().get();
  await ajouterHistorique(gameSnap.data().round, 'nuit', 'La Sorcière a terminé son tour.', true);
  await avancerEtapeNuit();
}

// ---- Conditions de victoire -----------------------------------------------------

function verifierVictoire(players) {
  const vivants = players.filter(p => p.vivant);
  const loupsVivants = vivants.filter(p => p.role === 'loup-garou');
  const nonLoupsVivants = vivants.filter(p => p.role !== 'loup-garou');

  // Victoire des amoureux : ils sont les 2 seuls survivants (camps différents)
  if (vivants.length === 2 && vivants[0].amoureux && vivants[1].amoureux &&
      vivants[0].amoureuxId === vivants[1].id) {
    return { camp: 'amoureux', message: 'Les amoureux sont les derniers survivants. Ils remportent la partie ensemble.' };
  }

  if (loupsVivants.length === 0) {
    return { camp: 'village', message: 'Tous les loups-garous ont été éliminés. Le village gagne.' };
  }
  if (loupsVivants.length >= nonLoupsVivants.length) {
    return { camp: 'loups', message: 'Les loups-garous sont aussi nombreux (ou plus) que le reste du village. Les loups gagnent.' };
  }
  return null;
}

// ---- Décision automatique quand personne n'a agi à temps -------------------

// Indique si l'étape de nuit en cours a bien reçu une décision.
function etapeNuitEstComplete(step, etatNuit) {
  if (step === 'cupidon') return !!(etatNuit && etatNuit.cupidonCible1);
  if (step === 'voyante') return !!(etatNuit && etatNuit.voyanteCible);
  if (step === 'loups') return !!(etatNuit && etatNuit.loupsConsensus);
  if (step === 'sorciere') return !!(etatNuit && etatNuit.sorciereTermine);
  return true;
}

// Force une décision au hasard pour l'étape de nuit en cours, si personne n'a
// agi. Manipule directement Firestore (plutôt que les fonctions de joueur)
// pour pouvoir s'exécuter même hors des heures permises aux joueurs, puisque
// c'est ici le système qui agit à leur place, pas un joueur.
async function forcerDecisionNuitAleatoire(step) {
  const players = await getAllPlayers();
  const vivants = players.filter(p => p.vivant);
  const gameSnap = await refGame().get();
  const round = gameSnap.data().round;
  const byId = Object.fromEntries(players.map(p => [p.id, p]));

  if (step === 'cupidon') {
    const candidats = shuffle(vivants);
    if (candidats.length >= 2) {
      const id1 = candidats[0].id, id2 = candidats[1].id;
      await refPlayer(id1).update({ amoureux: true, amoureuxId: id2 });
      await refPlayer(id2).update({ amoureux: true, amoureuxId: id1 });
      await refNightActions().update({ cupidonCible1: id1, cupidonCible2: id2 });
      await ajouterHistorique(round, 'nuit',
        `Cupidon n'a pas décidé à temps : couple choisi au hasard par le système (${candidats[0].nom} 💘 ${candidats[1].nom}).`);
      await ajouterHistorique(round, 'nuit', 'Cupidon a terminé son tour.', true);
    }
  } else if (step === 'voyante') {
    const voyante = players.find(p => p.role === 'voyante' && p.vivant);
    if (voyante) {
      const cibles = shuffle(vivants.filter(p => p.id !== voyante.id));
      if (cibles.length > 0) {
        const cible = cibles[0];
        await refNightActions().update({ voyanteCible: cible.id, voyanteResultat: cible.role });
        await ajouterHistorique(round, 'nuit',
          `La Voyante n'a pas décidé à temps : cible choisie au hasard par le système (${cible.nom} → ${ROLES[cible.role].label}).`);
        await ajouterHistorique(round, 'nuit', 'La Voyante a fait son choix.', true);
      }
    }
  } else if (step === 'loups') {
    const naSnap = await refNightActions().get();
    if (!naSnap.data().loupsConsensus) {
      const cibles = shuffle(vivants.filter(p => p.role !== 'loup-garou'));
      if (cibles.length > 0) {
        await refNightActions().update({ loupsConsensus: cibles[0].id });
        await ajouterHistorique(round, 'nuit',
          `Les Loups-Garous ne se sont pas entendus à temps : cible choisie au hasard par le système (${cibles[0].nom}).`);
        await ajouterHistorique(round, 'nuit', 'Les Loups-Garous ont terminé leur tour.', true);
      }
    }
  } else if (step === 'sorciere') {
    const sorciere = players.find(p => p.role === 'sorciere' && p.vivant);
    if (sorciere) {
      const naSnap = await refNightActions().get();
      const na = naSnap.data();
      if (!sorciere.sorciereVieUtilisee && na.loupsConsensus && Math.random() < 0.5) {
        await refNightActions().update({ sorciereActionVie: na.loupsConsensus });
        await refPlayer(sorciere.id).update({ sorciereVieUtilisee: true });
        const cible = byId[na.loupsConsensus];
        await ajouterHistorique(round, 'nuit',
          `La Sorcière n'a pas décidé à temps : potion de vie utilisée au hasard par le système sur ${cible ? cible.nom : '???'}.`);
      }
      if (!sorciere.sorciereMortUtilisee && Math.random() < 0.5) {
        const cibles = shuffle(vivants.filter(p => p.id !== sorciere.id));
        if (cibles.length > 0) {
          await refNightActions().update({ sorciereActionMort: cibles[0].id });
          await refPlayer(sorciere.id).update({ sorciereMortUtilisee: true });
          await ajouterHistorique(round, 'nuit',
            `La Sorcière n'a pas décidé à temps : potion de mort utilisée au hasard par le système sur ${cibles[0].nom}.`);
        }
      }
      await refNightActions().update({ sorciereTermine: true });
      await ajouterHistorique(round, 'nuit', 'La Sorcière a terminé son tour.', true);
    } else {
      await refNightActions().update({ sorciereTermine: true });
    }
  }
}

// Force une élimination au hasard si personne n'a voté le jour.
async function forcerVoteJourAleatoire() {
  const gameSnap = await refGame().get();
  const round = gameSnap.data().round;
  const players = await getAllPlayers();
  const vivants = shuffle(players.filter(p => p.vivant));
  if (vivants.length > 0) {
    await ajouterHistorique(round, 'jour', 'Personne n\'a voté à temps : joueur éliminé au hasard par le système.', true);
    await appliquerMortsEtCascade(new Set([vivants[0].id]), round, 'jour');
  }
}

// ---- Résolution automatique quand un bloc horaire se termine ---------------

// Force toutes les étapes de nuit restantes (au hasard si besoin) jusqu'à
// atteindre le jour, parce que la fenêtre de nuit (9h-12h ou 13h-15h30) vient
// de se terminer.
async function forcerResolutionNuitComplete() {
  for (let i = 0; i < 6; i++) {
    const gameSnap = await refGame().get();
    const game = gameSnap.data();
    if (!game || game.phase !== 'nuit') return; // déjà rendu au jour, ou partie terminée
    const naSnap = await refNightActions().get();
    if (!etapeNuitEstComplete(game.nightStep, naSnap.data())) {
      await forcerDecisionNuitAleatoire(game.nightStep);
    }
    await avancerEtapeNuit();
  }
}

// Force le résultat du vote de jour parce que la fenêtre de jour (12h-13h ou
// 15h30-16h) vient de se terminer.
async function forcerResolutionJourComplete() {
  const gameSnap = await refGame().get();
  const game = gameSnap.data();
  if (!game || game.phase !== 'jour') return;
  const dvSnap = await refDayVotes().get();
  const votes = (dvSnap.data() || {}).votes || {};
  if (Object.keys(votes).length === 0) {
    await forcerVoteJourAleatoire();
  } else {
    await resoudreVoteJour();
  }
}

// Point d'entrée appelé toutes les quelques secondes depuis joueur.js et
// admin.js : compare la phase attendue selon l'horloge à la phase réelle du
// jeu, et force la suite si le bloc horaire est dépassé.
async function verifierHoraireEtForcerSiNecessaire() {
  const gameSnap = await refGame().get();
  const game = gameSnap.data();
  if (!game || !game.started || game.termine) return;

  const bloc = blocHoraireActuel();
  if (!bloc) return; // hors des heures de camp (soir, avant 9h, etc.) : on ne force rien

  const decalageNuitVersJour = bloc.phase === 'jour' && game.phase === 'nuit';
  const decalageJourVersNuit = bloc.phase === 'nuit' && game.phase === 'jour';
  if (!decalageNuitVersJour && !decalageJourVersNuit) return;

  // Plusieurs téléphones peuvent détecter ce décalage presque en même temps.
  // Le verrou garantit qu'un seul d'entre eux agit réellement.
  const verrouObtenu = await tenterAcquerirVerrou();
  if (!verrouObtenu) return;

  try {
    if (decalageNuitVersJour) {
      await forcerResolutionNuitComplete();
    } else if (decalageJourVersNuit) {
      await forcerResolutionJourComplete();
    }
  } finally {
    await relacherVerrou();
  }
}

// ---- Verrou anti-conflit (plusieurs téléphones ouverts en même temps) -----
// Utilise une transaction Firestore pour garantir qu'un seul appareil à la
// fois peut forcer une résolution automatique. Le verrou expire tout seul
// après 30 secondes au cas où un appareil plante en plein milieu.

async function tenterAcquerirVerrou() {
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(refGame());
      const data = snap.data();
      const maintenant = Date.now();
      const verrouActif = data.verrouForcage && data.verrouForcageTs &&
        (maintenant - data.verrouForcageTs < 30000);
      if (verrouActif) return false;
      tx.update(refGame(), { verrouForcage: true, verrouForcageTs: maintenant });
      return true;
    });
  } catch (e) {
    return false;
  }
}

async function relacherVerrou() {
  try {
    await refGame().update({ verrouForcage: false, verrouForcageTs: null });
  } catch (e) { /* ignoré */ }
}
