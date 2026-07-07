if (sessionStorage.getItem('lgAdmin') !== 'true') {
  window.location.href = 'index.html';
}

const RESERVED_PINS = ['9999'];

// Initialise le document de partie s'il n'existe pas encore (première visite)
(async () => {
  const snap = await refGame().get();
  if (!snap.exists) {
    await refGame().set({
      phase: 'lobby', round: 0, nightStep: null, dayStep: null,
      started: false, termine: false, winner: null, lastDeaths: [], tirChasseurEnAttente: null
    });
  }
})();


let joueurs = [];
let etatJeu = { phase: 'lobby', round: 0, started: false };
let etatNuit = {};
let votesJour = {};

const elMoonTracker = document.getElementById('moon-tracker');
const elBadgePhase = document.getElementById('badge-phase');
const elCompteJoueurs = document.getElementById('compte-joueurs');
const elListeJoueurs = document.getElementById('liste-joueurs');
const elNouveauNom = document.getElementById('nouveau-nom');

const elSectionNuit = document.getElementById('section-nuit');
const elEtapeNuit = document.getElementById('etape-nuit');
const elMinuteurLoupsAdmin = document.getElementById('minuteur-loups-admin');
const elDetailNuit = document.getElementById('detail-nuit');
const elBtnAvancerNuit = document.getElementById('btn-avancer-nuit');

const elSectionJour = document.getElementById('section-jour');
const elListeVotes = document.getElementById('liste-votes');
const elListeVivantsJour = document.getElementById('liste-vivants-jour');

const elSectionFin = document.getElementById('section-fin');
const elTexteFin = document.getElementById('texte-fin');
const elListeRolesFinaux = document.getElementById('liste-roles-finaux');

const elHistorique = document.getElementById('historique');

// ---- Ajout / suppression de joueurs ---------------------------------------

function genererPin() {
  let pin;
  do {
    pin = String(Math.floor(1000 + Math.random() * 9000));
  } while (RESERVED_PINS.includes(pin) || joueurs.some(j => j.id === pin));
  return pin;
}

document.getElementById('btn-ajouter').addEventListener('click', async () => {
  const nom = elNouveauNom.value.trim();
  if (!nom) return;
  const pin = genererPin();
  await refPlayer(pin).set({
    nom, role: null, vivant: false, amoureux: false, amoureuxId: null,
    sorciereVieUtilisee: false, sorciereMortUtilisee: false, voteCible: null
  });
  elNouveauNom.value = '';
});

async function supprimerJoueur(id) {
  if (confirm('Retirer ce joueur ?')) await refPlayer(id).delete();
}

// ---- Lancement / réinitialisation -----------------------------------------

document.getElementById('btn-lancer').addEventListener('click', async () => {
  const btn = document.getElementById('btn-lancer');
  btn.disabled = true;
  btn.textContent = 'Distribution en cours...';
  try {
    await assignerRolesEtDemarrer();
  } catch (e) {
    alert(e.message);
  }
  btn.disabled = false;
  btn.textContent = 'Distribuer les rôles et commencer';
});

document.getElementById('btn-reset').addEventListener('click', async () => {
  if (!confirm('Réinitialiser complètement la partie ? Les joueurs et l\'historique seront effacés.')) return;
  const batch = db.batch();
  joueurs.forEach(j => batch.delete(refPlayer(j.id)));
  await batch.commit();
  await refGame().set({
    phase: 'lobby', round: 0, nightStep: null, dayStep: null,
    started: false, termine: false, winner: null, lastDeaths: [], tirChasseurEnAttente: null
  });
  await refNightActions().set({});
  await refDayVotes().set({ votes: {} });
  const histSnap = await refHistory().get();
  const histBatch = db.batch();
  histSnap.docs.forEach(d => histBatch.delete(d.ref));
  await histBatch.commit();
});

// ---- Écoute temps réel ------------------------------------------------------

refPlayers().onSnapshot(snap => {
  joueurs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderJoueurs();
  renderTout();
});

refGame().onSnapshot(snap => {
  etatJeu = snap.data() || etatJeu;
  renderTout();
});

refNightActions().onSnapshot(snap => {
  etatNuit = snap.data() || {};
  renderTout();
});

refDayVotes().onSnapshot(snap => {
  votesJour = (snap.data() || {}).votes || {};
  renderTout();
});

refHistory().orderBy('ts', 'desc').limit(80).onSnapshot(snap => {
  elHistorique.innerHTML = '';
  if (snap.empty) {
    elHistorique.innerHTML = '<p class="muted">Aucun événement pour l\'instant.</p>';
    return;
  }
  snap.docs.forEach(d => {
    const e = d.data();
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerHTML = `<span class="log-round">RONDE ${e.round} · ${e.phase.toUpperCase()}</span><br>${e.texte}`;
    elHistorique.appendChild(div);
  });
});

// ---- Rendu : liste des joueurs ----------------------------------------------

function renderJoueurs() {
  elCompteJoueurs.textContent = joueurs.length;
  elListeJoueurs.innerHTML = '';
  joueurs.forEach(j => {
    const li = document.createElement('li');
    li.className = 'player-row';
    const role = j.role ? `${ROLES[j.role].symbole} ${ROLES[j.role].label}` : '';
    li.innerHTML = `<span><span class="player-name">${j.nom}</span>
      <span class="player-meta"> · code ${j.id} ${role ? '· ' + role : ''}</span></span>`;
    const btnDel = document.createElement('button');
    btnDel.textContent = '✕';
    btnDel.className = 'secondary';
    btnDel.style.width = 'auto';
    btnDel.style.padding = '6px 12px';
    btnDel.onclick = () => supprimerJoueur(j.id);
    li.appendChild(btnDel);
    elListeJoueurs.appendChild(li);
  });
}

// ---- Rendu global -------------------------------------------------------------

function renderTout() {
  renderMoonTracker();
  renderBadge();
  renderNuit();
  renderJour();
  renderFin();
}

function renderMoonTracker() {
  elMoonTracker.innerHTML = '';
  for (let i = 1; i <= MAX_ROUNDS; i++) {
    const span = document.createElement('span');
    span.className = 'moon-phase ' + (i < etatJeu.round ? 'past' : i === etatJeu.round ? 'current' : '');
    elMoonTracker.appendChild(span);
  }
}

function renderBadge() {
  if (etatJeu.phase === 'nuit') {
    elBadgePhase.className = 'badge nuit';
    elBadgePhase.textContent = `Nuit ${etatJeu.round} / ${MAX_ROUNDS} — ${etatJeu.nightStep || ''}`;
  } else if (etatJeu.phase === 'jour') {
    elBadgePhase.className = 'badge jour';
    elBadgePhase.textContent = `Jour ${etatJeu.round} / ${MAX_ROUNDS}`;
  } else if (etatJeu.phase === 'termine') {
    elBadgePhase.className = 'badge mort';
    elBadgePhase.textContent = 'Partie terminée';
  } else {
    elBadgePhase.className = 'badge';
    elBadgePhase.textContent = 'Lobby';
  }
}

function nomDe(id) {
  const j = joueurs.find(x => x.id === id);
  return j ? j.nom : '???';
}

// ---- Section nuit ---------------------------------------------------------

function renderNuit() {
  if (etatJeu.phase !== 'nuit') { elSectionNuit.style.display = 'none'; return; }
  elSectionNuit.style.display = 'block';
  elEtapeNuit.textContent = etatJeu.nightStep || '—';

  let detail = '';
  const step = etatJeu.nightStep;

  if (etatJeu.tirChasseurEnAttente) {
    detail = `⏳ En attente du tir du Chasseur (${nomDe(etatJeu.tirChasseurEnAttente)}) avant de continuer.`;
    elBtnAvancerNuit.disabled = true;
  } else {
    elBtnAvancerNuit.disabled = false;
    if (step === 'cupidon') {
      detail = etatNuit.cupidonCible1
        ? `Couple formé : ${nomDe(etatNuit.cupidonCible1)} 💘 ${nomDe(etatNuit.cupidonCible2)}`
        : 'Cupidon n\'a pas encore choisi.';
    } else if (step === 'voyante') {
      detail = etatNuit.voyanteCible
        ? `La Voyante a sondé ${nomDe(etatNuit.voyanteCible)} → ${ROLES[etatNuit.voyanteResultat]?.label}`
        : 'La Voyante n\'a pas encore sondé.';
    } else if (step === 'loups') {
      const props = etatNuit.loupsCibles || {};
      const lignes = Object.entries(props).map(([loupId, cibleId]) => `${nomDe(loupId)} → ${nomDe(cibleId)}`);
      detail = (lignes.length ? lignes.join('<br>') : 'Aucune proposition.') +
        (etatNuit.loupsConsensus ? `<br><strong style="color:var(--accent-good);">✓ Consensus : ${nomDe(etatNuit.loupsConsensus)}</strong>` : '<br>Pas encore de consensus.');
    } else if (step === 'sorciere') {
      const vieTxt = etatNuit.sorciereActionVie ? `Potion de vie utilisée sur ${nomDe(etatNuit.sorciereActionVie)}.` : 'Potion de vie non utilisée.';
      const mortTxt = etatNuit.sorciereActionMort ? `Potion de mort utilisée sur ${nomDe(etatNuit.sorciereActionMort)}.` : 'Potion de mort non utilisée.';
      const termineTxt = etatNuit.sorciereTermine ? '<br><strong style="color:var(--accent-good);">✓ La Sorcière a terminé son tour.</strong>' : '<br>En attente de la Sorcière...';
      detail = `${vieTxt}<br>${mortTxt}${termineTxt}`;
    }
  }
  elDetailNuit.innerHTML = detail;
}

elBtnAvancerNuit.addEventListener('click', async () => {
  const step = etatJeu.nightStep;
  if (!etapeNuitEstComplete(step, etatNuit)) {
    const continuer = confirm(
      'Cette étape n\'est pas encore terminée (personne n\'a pris de décision).\n\n' +
      'Si tu continues, le système choisira une décision au hasard à la place du joueur concerné.\n\n' +
      'Continuer quand même ?'
    );
    if (!continuer) return;
    elBtnAvancerNuit.disabled = true;
    await forcerDecisionNuitAleatoire(step);
  }
  elBtnAvancerNuit.disabled = true;
  await avancerEtapeNuit();
});

// ---- Section jour -----------------------------------------------------------

function renderJour() {
  if (etatJeu.phase !== 'jour') { elSectionJour.style.display = 'none'; return; }
  elSectionJour.style.display = 'block';

  const tally = {};
  Object.values(votesJour).forEach(c => { tally[c] = (tally[c] || 0) + 1; });

  elListeVotes.innerHTML = '';
  const vivants = joueurs.filter(j => j.vivant);
  vivants.forEach(j => {
    const li = document.createElement('li');
    li.className = 'player-row';
    li.innerHTML = `<span class="player-name">${j.nom}</span><span class="player-meta">${tally[j.id] || 0} vote(s)</span>`;
    elListeVotes.appendChild(li);
  });

  elListeVivantsJour.innerHTML = '';
  vivants.forEach(j => {
    const li = document.createElement('li');
    li.className = 'player-row selectable';
    li.textContent = `Éliminer ${j.nom}`;
    li.onclick = async () => {
      if (confirm(`Éliminer ${j.nom} manuellement ?`)) await resoudreVoteJourManuel(j.id);
    };
    elListeVivantsJour.appendChild(li);
  });
}

document.getElementById('btn-resoudre-vote').addEventListener('click', async () => {
  const aucunVote = Object.keys(votesJour).length === 0;
  if (aucunVote) {
    const continuer = confirm(
      'Personne n\'a encore voté.\n\n' +
      'Si tu continues, le système éliminera un joueur au hasard.\n\n' +
      'Continuer quand même ?'
    );
    if (!continuer) return;
    await forcerVoteJourAleatoire();
    return;
  }
  await resoudreVoteJour();
});

// ---- Section fin --------------------------------------------------------------

function renderFin() {
  if (etatJeu.phase !== 'termine') { elSectionFin.style.display = 'none'; return; }
  elSectionFin.style.display = 'block';
  const messages = {
    'village': '🌾 Le Village a gagné ! Tous les loups-garous ont été éliminés.',
    'loups': '🐺 Les Loups-Garous ont gagné !',
    'amoureux': '💘 Les Amoureux ont gagné ensemble !',
    'match-nul': '⏳ Match nul après 8 rondes.'
  };
  elTexteFin.textContent = messages[etatJeu.winner] || '';

  elListeRolesFinaux.innerHTML = '';
  joueurs.forEach(j => {
    const li = document.createElement('li');
    li.className = 'player-row' + (j.vivant ? '' : ' dead');
    const role = j.role ? `${ROLES[j.role].symbole} ${ROLES[j.role].label}` : '?';
    li.innerHTML = `<span class="player-name">${j.nom}</span><span class="player-meta">${role}</span>`;
    elListeRolesFinaux.appendChild(li);
  });
}

// ---- Minuteur des loups (45 minutes) --------------------------------------

function formatMinuteur(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

setInterval(() => {
  if (etatJeu.phase === 'nuit' && etatJeu.nightStep === 'loups' && etatJeu.loupsTimerFin) {
    const restant = etatJeu.loupsTimerFin - Date.now();
    elMinuteurLoupsAdmin.style.display = 'block';
    elMinuteurLoupsAdmin.textContent = restant > 0
      ? `⏳ Temps restant pour les loups : ${formatMinuteur(restant)}`
      : '⏳ Temps écoulé — résolution automatique en cours...';
  } else {
    elMinuteurLoupsAdmin.style.display = 'none';
  }
}, 1000);

// Vérifie régulièrement si le temps des loups est écoulé
setInterval(() => {
  verifierExpirationTimerLoups();
}, 5000);

// Vérifie régulièrement si un bloc horaire (nuit/jour) vient de se terminer
setInterval(() => {
  verifierHoraireEtForcerSiNecessaire();
}, 10000);
