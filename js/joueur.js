const monPin = sessionStorage.getItem('lgPin');
if (!monPin) window.location.href = 'index.html';

let moi = null;
let etatJeu = null;
let tousLesJoueurs = [];

const elNom = document.getElementById('nom-joueur');
const elMoonTracker = document.getElementById('moon-tracker');
const elBadgePhase = document.getElementById('badge-phase');
const elStatutTourCard = document.getElementById('statut-tour-card');
const elStatutTourTexte = document.getElementById('statut-tour-texte');
const elMinuteurLoups = document.getElementById('minuteur-loups-joueur');
const elHoraireListe = document.getElementById('horaire-liste');
const elRoleCard = document.getElementById('role-card');
const elRoleSymbole = document.getElementById('role-symbole');
const elRoleLabel = document.getElementById('role-label');
const elRoleStatut = document.getElementById('role-statut');
const elAnnoncesCard = document.getElementById('annonces-card');
const elAnnoncesTexte = document.getElementById('annonces-texte');
const elComplicesCard = document.getElementById('complices-card');
const elComplicesListe = document.getElementById('complices-liste');
const elZoneAction = document.getElementById('zone-action');
const elEtatVillageCard = document.getElementById('etat-village-card');
const elEtatVillageListe = document.getElementById('etat-village-liste');
const elJournalCard = document.getElementById('journal-joueur-card');
const elJournal = document.getElementById('journal-joueur');

elRoleCard.addEventListener('click', () => elRoleCard.classList.toggle('flipped'));

// ---- Alertes (son / vibration / notification) ------------------------------

let audioCtx = null;
let alertesActivees = false;
let dernierTourAlerte = null;

document.getElementById('btn-alertes').addEventListener('click', async () => {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    jouerSon(); // débloque l'audio sur mobile (nécessite un geste utilisateur)
  } catch (e) { /* AudioContext non supporté */ }

  if ('Notification' in window && Notification.permission !== 'granted') {
    try { await Notification.requestPermission(); } catch (e) { /* ignoré */ }
  }

  alertesActivees = true;
  const btn = document.getElementById('btn-alertes');
  btn.textContent = '🔔 Alertes activées';
  btn.disabled = true;
});

function jouerSon() {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.5);
}

function declencherAlerte(message) {
  if (!alertesActivees) return;
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* iOS ne supporte pas */ }
  try { jouerSon(); } catch (e) { /* ignoré */ }
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🌕 Loup-Garou YOPI', { body: message || 'C\'est ton tour !' });
    }
  } catch (e) { /* ignoré */ }
}

// Vérifie si c'est le tour du joueur et déclenche l'alerte une seule fois par
// changement d'étape (clé unique = ronde + phase + étape).
function verifierMonTour() {
  if (!moi || !etatJeu || !moi.vivant) return;

  if (etatJeu.tirChasseurEnAttente === monPin) {
    return signalerTour(`chasseur-${etatJeu.round}`, 'Tu dois tirer !');
  }
  if (etatJeu.phase === 'nuit') {
    const step = etatJeu.nightStep;
    const monRoleAgit =
      (step === 'cupidon' && moi.role === 'cupidon') ||
      (step === 'voyante' && moi.role === 'voyante') ||
      (step === 'loups' && moi.role === 'loup-garou') ||
      (step === 'sorciere' && moi.role === 'sorciere');
    if (monRoleAgit) return signalerTour(`nuit-${etatJeu.round}-${step}`, 'C\'est ton tour cette nuit !');
    return;
  }
  if (etatJeu.phase === 'jour') {
    return signalerTour(`jour-${etatJeu.round}`, 'Le vote du village est ouvert !');
  }
}

function signalerTour(cle, message) {
  if (cle !== dernierTourAlerte) {
    dernierTourAlerte = cle;
    declencherAlerte(message);
  }
}

// ---- Écoute temps réel -------------------------------------------------

refPlayer(monPin).onSnapshot(snap => {
  if (!snap.exists) { window.location.href = 'index.html'; return; }
  moi = { id: monPin, ...snap.data() };
  render();
});

refGame().onSnapshot(snap => {
  etatJeu = snap.data();
  render();
});

refPlayers().onSnapshot(snap => {
  tousLesJoueurs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render();
});

let unsubNight = null;
let etatNuit = null;
refNightActions().onSnapshot(snap => {
  etatNuit = snap.data();
  render();
});

// ---- Rendu principal ----------------------------------------------------

function render() {
  if (!moi || !etatJeu) return;

  elNom.textContent = moi.nom || monPin;

  // Suivi lunaire
  elMoonTracker.innerHTML = '';
  for (let i = 1; i <= MAX_ROUNDS; i++) {
    const span = document.createElement('span');
    span.className = 'moon-phase ' + (i < etatJeu.round ? 'past' : i === etatJeu.round ? 'current' : '');
    elMoonTracker.appendChild(span);
  }

  // Badge de phase
  if (etatJeu.phase === 'nuit') {
    elBadgePhase.className = 'badge nuit';
    elBadgePhase.textContent = `Nuit ${etatJeu.round} / ${MAX_ROUNDS}`;
  } else if (etatJeu.phase === 'jour') {
    elBadgePhase.className = 'badge jour';
    elBadgePhase.textContent = `Jour ${etatJeu.round} / ${MAX_ROUNDS}`;
  } else if (etatJeu.phase === 'termine') {
    elBadgePhase.className = 'badge mort';
    elBadgePhase.textContent = 'Partie terminée';
  } else {
    elBadgePhase.className = 'badge';
    elBadgePhase.textContent = 'En attente du début';
  }

  // Rôle
  if (moi.role && ROLES[moi.role]) {
    elRoleSymbole.textContent = ROLES[moi.role].symbole;
    elRoleLabel.textContent = ROLES[moi.role].label;
    elRoleStatut.textContent = moi.vivant ? 'Vivant' : 'Mort';
  } else {
    elRoleSymbole.textContent = '🌑';
    elRoleLabel.textContent = 'En attente';
    elRoleStatut.textContent = 'La partie n\'a pas encore commencé';
  }

  renderAnnonce();
  renderComplices();
  renderStatutTour();
  renderZoneAction();
  renderEtatVillage();
  verifierMonTour();
}

function renderComplices() {
  if (!moi || moi.role !== 'loup-garou' || !tousLesJoueurs.length) {
    elComplicesCard.style.display = 'none';
    return;
  }
  const autresLoups = tousLesJoueurs.filter(p => p.role === 'loup-garou' && p.id !== monPin);
  elComplicesCard.style.display = 'block';
  elComplicesListe.innerHTML = '';
  if (autresLoups.length === 0) {
    elComplicesListe.innerHTML = '<li class="player-row muted">Tu es le dernier loup...</li>';
    return;
  }
  autresLoups.forEach(p => {
    const li = document.createElement('li');
    li.className = 'player-row' + (p.vivant ? '' : ' dead');
    li.innerHTML = `<span class="player-name">${p.nom}</span>
      <span class="badge ${p.vivant ? 'vivant' : 'mort'}">${p.vivant ? 'Vivant' : 'Mort'}</span>`;
    elComplicesListe.appendChild(li);
  });
}

function renderAnnonce() {
  if (etatJeu.phase === 'termine') {
    elAnnoncesCard.style.display = 'block';
    const messages = {
      'village': '🌾 Le Village a gagné ! Tous les loups-garous ont été éliminés.',
      'loups': '🐺 Les Loups-Garous ont gagné ! Ils dominent le village.',
      'amoureux': '💘 Les Amoureux ont gagné ! Ils sont les derniers survivants.',
      'match-nul': '⏳ La 8e ronde est terminée. Match nul, personne ne gagne.'
    };
    elAnnoncesTexte.textContent = messages[etatJeu.winner] || 'Partie terminée.';
    return;
  }

  if (etatJeu.lastDeaths && etatJeu.lastDeaths.length > 0 && etatJeu.phase === 'jour') {
    const noms = etatJeu.lastDeaths.map(id => {
      const p = tousLesJoueurs.find(j => j.id === id);
      return p ? p.nom : '???';
    }).join(', ');
    elAnnoncesCard.style.display = 'block';
    elAnnoncesTexte.textContent = `Cette nuit, le village a perdu : ${noms}.`;
  } else if (etatJeu.phase === 'jour') {
    elAnnoncesCard.style.display = 'block';
    elAnnoncesTexte.textContent = 'Personne n\'est mort cette nuit.';
  } else {
    elAnnoncesCard.style.display = 'none';
  }
}

function renderZoneAction() {
  elZoneAction.innerHTML = '';

  // Priorité absolue : le chasseur qui doit tirer
  if (etatJeu.tirChasseurEnAttente === monPin) {
    return renderTirChasseur();
  }

  if (etatJeu.phase === 'lobby' || !etatJeu.started) {
    elZoneAction.innerHTML = `<div class="empty-state">🌒 En attente que l'animateur lance la partie...</div>`;
    return;
  }

  if (etatJeu.phase === 'termine') {
    elZoneAction.innerHTML = `<div class="empty-state">La partie est terminée. Merci d'avoir joué !</div>`;
    return;
  }

  if (!moi.vivant) {
    elZoneAction.innerHTML = `<div class="empty-state">👻 Tu es mort. Observe la suite en silence.</div>`;
    return;
  }

  if (etatJeu.phase === 'nuit') return renderActionNuit();
  if (etatJeu.phase === 'jour') return renderActionJour();
}

// ---- Tir du chasseur ------------------------------------------------------

function renderTirChasseur() {
  const cibles = tousLesJoueurs.filter(p => p.vivant && p.id !== monPin);
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<h3 style="font-style:normal;">🏹 Tu tombes... mais tu emportes quelqu'un avec toi.</h3>
    <p class="muted">Choisis qui meurt avec toi.</p>`;
  const ul = document.createElement('ul');
  ul.className = 'player-list';
  cibles.forEach(p => {
    const li = document.createElement('li');
    li.className = 'player-row selectable';
    li.textContent = p.nom;
    li.onclick = async () => {
      li.textContent = 'Confirmation...';
      await resoudreTirChasseur(monPin, p.id);
    };
    ul.appendChild(li);
  });
  card.appendChild(ul);
  elZoneAction.appendChild(card);
}

// ---- Actions de nuit --------------------------------------------------------

function renderActionNuit() {
  if (!estDansPeriodeNuitAutorisee()) {
    elZoneAction.innerHTML = `<div class="empty-state">🌙 Les actions de nuit sont seulement permises de 9h à 12h
      et de 13h à 16h.<br>Reviens pendant ces heures pour jouer ton tour.</div>`;
    return;
  }

  const step = etatJeu.nightStep;

  if (step === 'cupidon' && moi.role === 'cupidon') return renderCupidon();
  if (step === 'voyante' && moi.role === 'voyante') return renderVoyante();
  if (step === 'loups' && moi.role === 'loup-garou') return renderLoups();
  if (step === 'sorciere' && moi.role === 'sorciere') return renderSorciere();

  elZoneAction.innerHTML = `<div class="empty-state">Ce n'est pas ton tour. Attends la suite en silence.</div>`;
}

function renderCupidon() {
  if (etatNuit && etatNuit.cupidonCible1) {
    elZoneAction.innerHTML = `<div class="empty-state">💘 Le couple est formé. Attends la suite.</div>`;
    return;
  }
  const autres = tousLesJoueurs.filter(p => p.vivant);
  let selection = [];

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<h3 style="font-style:normal;">💘 Choisis les deux amoureux</h3><p class="muted">Sélectionne exactement 2 joueurs.</p>`;
  const ul = document.createElement('ul');
  ul.className = 'player-list';
  autres.forEach(p => {
    const li = document.createElement('li');
    li.className = 'player-row selectable';
    li.textContent = p.nom;
    li.onclick = () => {
      if (selection.includes(p.id)) {
        selection = selection.filter(x => x !== p.id);
        li.classList.remove('selected');
      } else if (selection.length < 2) {
        selection.push(p.id);
        li.classList.add('selected');
      }
      btn.disabled = selection.length !== 2;
    };
    ul.appendChild(li);
  });
  card.appendChild(ul);
  const btn = document.createElement('button');
  btn.textContent = 'Former le couple';
  btn.disabled = true;
  btn.style.marginTop = '12px';
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = 'Confirmation...';
    try {
      await cupidonDesignerAmoureux(selection[0], selection[1]);
    } catch (e) {
      alert(e.message);
      btn.disabled = false;
      btn.textContent = 'Former le couple';
    }
  };
  card.appendChild(btn);
  elZoneAction.appendChild(card);
}

function renderVoyante() {
  if (etatNuit && etatNuit.voyanteCible) {
    const cible = tousLesJoueurs.find(p => p.id === etatNuit.voyanteCible);
    const role = ROLES[etatNuit.voyanteResultat];
    elZoneAction.innerHTML = `<div class="card">
      <h3 style="font-style:normal;">🔮 Vision</h3>
      <p><strong>${cible ? cible.nom : '???'}</strong> est : <strong>${role ? role.symbole + ' ' + role.label : '???'}</strong></p>
      <p class="muted">Garde cette information secrète.</p>
    </div>`;
    return;
  }
  const cibles = tousLesJoueurs.filter(p => p.vivant && p.id !== monPin);
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<h3 style="font-style:normal;">🔮 Choisis un joueur à sonder</h3>`;
  const ul = document.createElement('ul');
  ul.className = 'player-list';
  cibles.forEach(p => {
    const li = document.createElement('li');
    li.className = 'player-row selectable';
    li.textContent = p.nom;
    li.onclick = async () => {
      li.textContent = 'Vision en cours...';
      try {
        await voyanteSonder(monPin, p.id);
      } catch (e) {
        alert(e.message);
        li.textContent = p.nom;
      }
    };
    ul.appendChild(li);
  });
  card.appendChild(ul);
  elZoneAction.appendChild(card);
}

function renderLoups() {
  const mesCibleActuelle = etatNuit && etatNuit.loupsCibles ? etatNuit.loupsCibles[monPin] : null;
  const cibles = tousLesJoueurs.filter(p => p.vivant && p.role !== 'loup-garou');
  const autresLoups = tousLesJoueurs.filter(p => p.role === 'loup-garou' && p.vivant && p.id !== monPin);

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<h3 style="font-style:normal;">🐺 Choisissez une victime ensemble</h3>
    <p class="muted">Vous devez tous proposer la même cible.</p>`;

  const ul = document.createElement('ul');
  ul.className = 'player-list';
  cibles.forEach(p => {
    const li = document.createElement('li');
    li.className = 'player-row selectable' + (mesCibleActuelle === p.id ? ' selected' : '');
    li.textContent = p.nom;
    li.onclick = async () => {
      try {
        await loupProposerCible(monPin, p.id);
      } catch (e) {
        alert(e.message);
      }
    };
    ul.appendChild(li);
  });
  card.appendChild(ul);

  if (autresLoups.length > 0) {
    const div = document.createElement('div');
    div.className = 'divider';
    card.appendChild(div);
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Propositions des autres loups :';
    card.appendChild(p);
    autresLoups.forEach(loup => {
      const cibleId = etatNuit && etatNuit.loupsCibles ? etatNuit.loupsCibles[loup.id] : null;
      const cible = tousLesJoueurs.find(j => j.id === cibleId);
      const row = document.createElement('div');
      row.className = 'wolf-proposal' + (cibleId && cibleId === mesCibleActuelle ? ' agree' : '');
      row.innerHTML = `<span class="dot"></span> ${loup.nom} → ${cible ? cible.nom : 'pas encore choisi'}`;
      card.appendChild(row);
    });
  }

  if (etatNuit && etatNuit.loupsConsensus) {
    const consensusP = document.createElement('p');
    consensusP.style.color = 'var(--accent-good)';
    consensusP.style.marginTop = '10px';
    consensusP.textContent = '✓ Consensus atteint. Attends la suite.';
    card.appendChild(consensusP);
  }

  elZoneAction.appendChild(card);
}

function renderSorciere() {
  if (etatNuit && etatNuit.sorciereTermine) {
    elZoneAction.innerHTML = `<div class="empty-state">🧪 Tour terminé. Attends la suite en silence.</div>`;
    return;
  }

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<h3 style="font-style:normal;">🧪 Tes potions</h3>`;

  const victime = etatNuit && etatNuit.loupsConsensus ? tousLesJoueurs.find(p => p.id === etatNuit.loupsConsensus) : null;

  const infoP = document.createElement('p');
  infoP.className = 'muted';
  infoP.textContent = victime
    ? `Cette nuit, les loups ont choisi : ${victime.nom}.`
    : 'Les loups n\'ont pas encore choisi de victime.';
  card.appendChild(infoP);

  if (!moi.sorciereVieUtilisee && victime) {
    const btnVie = document.createElement('button');
    btnVie.textContent = `Sauver ${victime.nom} (potion de vie)`;
    btnVie.className = 'moon';
    btnVie.style.marginBottom = '10px';
    btnVie.onclick = async () => {
      btnVie.disabled = true;
      try {
        await sorciereConfirmerPotionVie(monPin);
      } catch (e) {
        alert(e.message);
        btnVie.disabled = false;
      }
    };
    card.appendChild(btnVie);
  } else if (moi.sorciereVieUtilisee) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Potion de vie déjà utilisée.';
    card.appendChild(p);
  }

  if (!moi.sorciereMortUtilisee) {
    const label = document.createElement('p');
    label.className = 'muted';
    label.style.marginTop = '10px';
    label.textContent = 'Potion de mort — choisis une cible :';
    card.appendChild(label);
    const ul = document.createElement('ul');
    ul.className = 'player-list';
    tousLesJoueurs.filter(p => p.vivant).forEach(p => {
      const li = document.createElement('li');
      li.className = 'player-row selectable';
      li.textContent = p.nom;
      li.onclick = async () => {
        li.textContent = 'Confirmation...';
        try {
          await sorciereConfirmerPotionMort(monPin, p.id);
        } catch (e) {
          alert(e.message);
          li.textContent = p.nom;
        }
      };
      ul.appendChild(li);
    });
    card.appendChild(ul);
  } else {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Potion de mort déjà utilisée.';
    card.appendChild(p);
  }

  const terminer = document.createElement('button');
  terminer.textContent = 'J\'ai terminé pour cette nuit';
  terminer.className = 'secondary';
  terminer.style.marginTop = '10px';
  terminer.onclick = async () => {
    terminer.disabled = true;
    try {
      await sorciereTerminerTour(monPin);
    } catch (e) {
      alert(e.message);
      terminer.disabled = false;
    }
  };
  card.appendChild(terminer);

  elZoneAction.appendChild(card);
}

// ---- Vote de jour ------------------------------------------------------------

let dejaVote = null;
refDayVotes().onSnapshot(snap => {
  const data = snap.data();
  dejaVote = data && data.votes ? data.votes[monPin] : null;
  if (etatJeu && etatJeu.phase === 'jour' && moi && moi.vivant) renderZoneAction();
});

function renderActionJour() {
  if (!estDansPeriodeJourAutorisee()) {
    elZoneAction.innerHTML = `<div class="empty-state">☀️ Le vote du village est seulement permis de 12h à 13h
      et de 15h30 à 16h.<br>Reviens pendant ces heures pour voter.</div>`;
    return;
  }

  const cibles = tousLesJoueurs.filter(p => p.vivant && p.id !== monPin);
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<h3 style="font-style:normal;">🗳️ Vote du village</h3><p class="muted">Qui soupçonnes-tu d'être un loup-garou ?</p>`;
  const ul = document.createElement('ul');
  ul.className = 'player-list';
  cibles.forEach(p => {
    const li = document.createElement('li');
    li.className = 'player-row selectable' + (dejaVote === p.id ? ' selected' : '');
    li.textContent = p.nom;
    li.onclick = async () => {
      try {
        await voterJour(monPin, p.id);
      } catch (e) {
        alert(e.message);
      }
    };
    ul.appendChild(li);
  });
  card.appendChild(ul);
  if (dejaVote) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.style.marginTop = '10px';
    p.textContent = 'Tu peux changer ton vote tant que l\'animateur n\'a pas clos le vote.';
    card.appendChild(p);
  }
  elZoneAction.appendChild(card);
}

// ---- État du village (vivants/morts) --------------------------------------

function renderEtatVillage() {
  if (!etatJeu || !etatJeu.started || !tousLesJoueurs.length) { elEtatVillageCard.style.display = 'none'; return; }
  elEtatVillageCard.style.display = 'block';

  // Les loups voient l'état réel en tout temps. Tout le monde d'autre voit
  // seulement la dernière "photo" connue, mise à jour au lever du jour.
  const estLoup = moi && moi.role === 'loup-garou';
  const connu = etatJeu.vivantsConnus || {};

  elEtatVillageListe.innerHTML = '';
  [...tousLesJoueurs].sort((a, b) => a.nom.localeCompare(b.nom)).forEach(p => {
    const estVivant = estLoup ? p.vivant : (connu[p.id] !== undefined ? connu[p.id] : true);
    const li = document.createElement('li');
    li.className = 'player-row' + (estVivant ? '' : ' dead');
    li.innerHTML = `<span class="player-name">${p.nom}</span>
      <span class="badge ${estVivant ? 'vivant' : 'mort'}">${estVivant ? 'Vivant' : 'Mort'}</span>`;
    elEtatVillageListe.appendChild(li);
  });
}

// ---- Journal de partie (événements publics seulement) ----------------------

refHistory().orderBy('ts', 'desc').limit(100).onSnapshot(snap => {
  if (!etatJeu || !etatJeu.started) { elJournalCard.style.display = 'none'; return; }
  elJournalCard.style.display = 'block';

  const entriesPubliques = snap.docs.map(d => d.data()).filter(e => e.public);
  elJournal.innerHTML = '';

  if (entriesPubliques.length === 0) {
    elJournal.innerHTML = '<p class="muted">Aucun événement pour l\'instant.</p>';
    return;
  }
  entriesPubliques.forEach(e => {
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerHTML = `<span class="log-round">RONDE ${e.round} · ${e.phase.toUpperCase()}</span><br>${e.texte}`;
    elJournal.appendChild(div);
  });
});

// ---- Bandeau de statut : à qui c'est le tour, visible par tous ------------

const LABELS_ETAPE = {
  cupidon: '💘 Cupidon choisit les amoureux...',
  voyante: '🔮 La Voyante sonde un joueur...',
  loups: '🐺 Les Loups-Garous choisissent leur victime...',
  sorciere: '🧪 La Sorcière décide...'
};

function renderStatutTour() {
  if (!etatJeu || !etatJeu.started) { elStatutTourCard.style.display = 'none'; return; }

  let texte = null;
  const bloc = blocHoraireActuel();

  if (etatJeu.tirChasseurEnAttente) {
    const nomChasseur = tousLesJoueurs.find(p => p.id === etatJeu.tirChasseurEnAttente);
    texte = `🏹 ${nomChasseur ? nomChasseur.nom : 'Le Chasseur'} doit tirer avant qu'on continue...`;
  } else if (!bloc) {
    texte = '💤 Hors des heures de jeu. Reviens de 9h à 12h ou de 13h à 15h30 (nuit), ou de 12h à 13h ou de 15h30 à 16h (jour).';
  } else if (etatJeu.phase === 'nuit') {
    texte = LABELS_ETAPE[etatJeu.nightStep] || 'La nuit avance...';
  } else if (etatJeu.phase === 'jour') {
    texte = '🗳️ Le village discute et vote...';
  } else if (etatJeu.phase === 'termine') {
    texte = '🏁 La partie est terminée.';
  }

  if (texte) {
    elStatutTourCard.style.display = 'block';
    elStatutTourTexte.textContent = texte;
  } else {
    elStatutTourCard.style.display = 'none';
  }
}

// ---- Minuteur des loups (45 minutes) --------------------------------------

function formatMinuteur(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function renderHoraire() {
  const blocActuel = blocHoraireActuel();
  elHoraireListe.innerHTML = '';
  HORAIRE.forEach(b => {
    const estActuel = blocActuel && blocActuel.debut === b.debut;
    const li = document.createElement('li');
    li.className = 'player-row' + (estActuel ? ' selected' : '');
    const icone = b.phase === 'nuit' ? '🌙' : '☀️';
    li.innerHTML = `<span class="player-name">${icone} ${b.label}</span>
      <span class="player-meta">${b.phase === 'nuit' ? 'Nuit' : 'Jour (vote)'}${estActuel ? ' · en cours' : ''}</span>`;
    elHoraireListe.appendChild(li);
  });
}

setInterval(renderHoraire, 30000);
renderHoraire();

setInterval(() => {
  if (etatJeu && etatJeu.phase === 'nuit' && etatJeu.nightStep === 'loups' && etatJeu.loupsTimerFin) {
    const restant = etatJeu.loupsTimerFin - Date.now();
    elMinuteurLoups.style.display = 'block';
    elMinuteurLoups.textContent = restant > 0 ? `⏳ ${formatMinuteur(restant)}` : '⏳ Temps écoulé...';
  } else {
    elMinuteurLoups.style.display = 'none';
  }
}, 1000);

// Vérifie régulièrement si le temps des loups est écoulé (peu importe le rôle
// du joueur — n'importe quel appareil ouvert peut déclencher la résolution).
setInterval(() => {
  if (typeof verifierExpirationTimerLoups === 'function') verifierExpirationTimerLoups();
}, 20000);

// Vérifie régulièrement si un bloc horaire (nuit/jour) vient de se terminer,
// pour forcer automatiquement la suite de la partie.
setInterval(() => {
  if (typeof verifierHoraireEtForcerSiNecessaire === 'function') verifierHoraireEtForcerSiNecessaire();
}, 60000);
