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

// Répartition fixe pour 17 joueurs
const ROLE_COUNTS = {
  'loup-garou': 4,
  'voyante': 1,
  'cupidon': 1,
  'chasseur': 1,
  'sorciere': 1,
  'villageois': 9
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

async function ajouterHistorique(round, phase, texte) {
  await refHistory().add({
    round, phase, texte,
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

// ---- Démarrage de partie : attribution aléatoire des rôles ----------------

async function assignerRolesEtDemarrer() {
  const players = await getAllPlayers();
  if (players.length !== 17) {
    throw new Error(`Il faut exactement 17 joueurs inscrits (actuellement ${players.length}).`);
  }

  const pool = [];
  Object.entries(ROLE_COUNTS).forEach(([role, count]) => {
    for (let i = 0; i < count; i++) pool.push(role);
  });
  const shuffledRoles = shuffle(pool);
  const shuffledPlayers = shuffle(players);

  const batch = db.batch();
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
    tirChasseurEnAttente: null
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
    sorciereActionMort: null
  });

  await ajouterHistorique(1, 'nuit', 'La partie commence. Les rôles ont été distribués.');
}

// ---- Cupidon : désigne les 2 amoureux (nuit 1 seulement) -------------------

async function cupidonDesignerAmoureux(id1, id2) {
  await refPlayer(id1).update({ amoureux: true, amoureuxId: id2 });
  await refPlayer(id2).update({ amoureux: true, amoureuxId: id1 });
  await refNightActions().update({ cupidonCible1: id1, cupidonCible2: id2 });
  await ajouterHistorique(1, 'nuit', 'Cupidon a formé un couple d\'amoureux.');
}

// ---- Passage à l'étape de nuit suivante ------------------------------------

async function avancerEtapeNuit() {
  const gameSnap = await refGame().get();
  const game = gameSnap.data();
  const steps = nightStepsForRound(game.round);
  const idx = steps.indexOf(game.nightStep);
  if (idx < steps.length - 1) {
    await refGame().update({ nightStep: steps[idx + 1] });
  } else {
    // Toutes les étapes de nuit sont faites : on résout la nuit
    await resoudreNuit();
  }
}

// ---- Résolution de la nuit (cascade des morts) -----------------------------

async function resoudreNuit() {
  const gameSnap = await refGame().get();
  const game = gameSnap.data();
  const naSnap = await refNightActions().get();
  const na = naSnap.data();
  const players = await getAllPlayers();
  const byId = Object.fromEntries(players.map(p => [p.id, p]));

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
    ? `Morts : ${nomsMorts}.`
    : 'Personne n\'est mort cette fois-ci.');

  await refGame().update({ lastDeaths: [...morts] });

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
  await ajouterHistorique(game.round, game.phase, `Le Chasseur a tiré sur un joueur en tombant.`);
  await refGame().update({ tirChasseurEnAttente: null });
  await appliquerMortsEtCascade(new Set([cibleId]), game.round, game.phase);
}

// Vérifie la victoire et fait avancer vers jour/nuit suivante ou fin de partie
async function continuerApresMorts(round, phaseOrigine) {
  const players = await getAllPlayers();
  const victoire = verifierVictoire(players);

  if (victoire) {
    await refGame().update({ phase: 'termine', termine: true, winner: victoire.camp });
    await ajouterHistorique(round, 'fin', victoire.message);
    return;
  }

  if (phaseOrigine === 'nuit') {
    // On passe au jour
    await refDayVotes().set({ round, votes: {} });
    await refGame().update({ phase: 'jour', dayStep: 'discussion', nightStep: null });
    await ajouterHistorique(round, 'jour', 'Le village se réveille et découvre les événements de la nuit.');
  } else {
    // On sort du jour : ronde suivante ou fin forcée
    if (round >= MAX_ROUNDS) {
      await refGame().update({ phase: 'termine', termine: true, winner: 'match-nul' });
      await ajouterHistorique(round, 'fin', 'La 8e ronde est terminée sans vainqueur. Match nul.');
    } else {
      const nextRound = round + 1;
      await refNightActions().set({
        round: nextRound,
        cupidonCible1: null, cupidonCible2: null,
        voyanteCible: null, voyanteResultat: null,
        loupsCibles: {}, loupsConsensus: null,
        sorciereActionVie: null, sorciereActionMort: null
      });
      await refGame().update({
        phase: 'nuit', round: nextRound,
        nightStep: nightStepsForRound(nextRound)[0], dayStep: null
      });
      await ajouterHistorique(nextRound, 'nuit', 'La nuit tombe sur le village.');
    }
  }
}

// ---- Vote de jour -----------------------------------------------------------

async function voterJour(votantId, cibleId) {
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

  if (egalite) {
    // Égalité : ne tue personne, on log et on avance quand même (l'admin peut
    // aussi choisir manuellement via resoudreVoteJourManuel si besoin).
    await ajouterHistorique(game.round, 'jour', 'Égalité des votes : personne n\'est éliminé.');
    await continuerApresMorts(game.round, 'jour');
    return;
  }

  if (!elimine) {
    await ajouterHistorique(game.round, 'jour', 'Aucun vote n\'a été exprimé.');
    await continuerApresMorts(game.round, 'jour');
    return;
  }

  await appliquerMortsEtCascade(new Set([elimine]), game.round, 'jour');
}

// Permet à l'admin de trancher manuellement en cas d'égalité (ou pour forcer)
async function resoudreVoteJourManuel(cibleId) {
  const gameSnap = await refGame().get();
  const game = gameSnap.data();
  await appliquerMortsEtCascade(new Set([cibleId]), game.round, 'jour');
}

// ---- Voyante ----------------------------------------------------------------

async function voyanteSonder(cibleId) {
  const cible = await refPlayer(cibleId).get();
  const role = cible.data().role;
  await refNightActions().update({ voyanteCible: cibleId, voyanteResultat: role });
  const gameSnap = await refGame().get();
  await ajouterHistorique(gameSnap.data().round, 'nuit', 'La Voyante a sondé un joueur.');
  return role;
}

// ---- Loups (consensus) --------------------------------------------------------

async function loupProposerCible(loupId, cibleId) {
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
    }
  }
}

// ---- Sorcière -----------------------------------------------------------------

async function sorciereConfirmerPotionVie(sorciereId) {
  const naSnap = await refNightActions().get();
  const cibleLoups = naSnap.data().loupsConsensus;
  await refNightActions().update({ sorciereActionVie: cibleLoups });
  await refPlayer(sorciereId).update({ sorciereVieUtilisee: true });
  const gameSnap = await refGame().get();
  await ajouterHistorique(gameSnap.data().round, 'nuit', 'La Sorcière a utilisé sa potion de vie.');
}

async function sorciereConfirmerPotionMort(sorciereId, cibleId) {
  await refNightActions().update({ sorciereActionMort: cibleId });
  await refPlayer(sorciereId).update({ sorciereMortUtilisee: true });
  const gameSnap = await refGame().get();
  await ajouterHistorique(gameSnap.data().round, 'nuit', 'La Sorcière a utilisé sa potion de mort.');
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
