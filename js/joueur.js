const monPin = sessionStorage.getItem('lgPin');
if (!monPin) window.location.href = 'index.html';

let moi = null;
let etatJeu = null;
let tousLesJoueurs = [];

const elNom = document.getElementById('nom-joueur');
const elMoonTracker = document.getElementById('moon-tracker');
const elBadgePhase = document.getElementById('badge-phase');
const elRoleCard = document.getElementById('role-card');
const elRoleSymbole = document.getElementById('role-symbole');
const elRoleLabel = document.getElementById('role-label');
const elRoleStatut = document.getElementById('role-statut');
const elAnnoncesCard = document.getElementById('annonces-card');
const elAnnoncesTexte = document.getElementById('annonces-texte');
const elZoneAction = document.getElementById('zone-action');

elRoleCard.addEventListener('click', () => elRoleCard.classList.toggle('flipped'));

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
  renderZoneAction();
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
  const step = etatJeu.nightStep;

  if (step === 'cupidon' && moi.role === 'cupidon') return renderCupidon();
  if (step === 'voyante' && moi.role === 'voyante') return renderVoyante();
  if (step === 'loups' && moi.role === 'loup-garou') return renderLoups();
  if (step === 'sorciere' && moi.role === 'sorciere') return renderSorciere();

  const labels = { cupidon: 'Cupidon choisit les amoureux', voyante: 'la Voyante sonde un joueur',
    loups: 'les Loups-Garous choisissent leur victime', sorciere: 'la Sorcière décide' };
  elZoneAction.innerHTML = `<div class="empty-state">🌙 C'est le tour de ${labels[step] || '...'}.<br>Attends la suite en silence.</div>`;
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
    await cupidonDesignerAmoureux(selection[0], selection[1]);
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
      await voyanteSonder(p.id);
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
      await loupProposerCible(monPin, p.id);
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
      await sorciereConfirmerPotionVie(monPin);
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
        await sorciereConfirmerPotionMort(monPin, p.id);
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

  const passer = document.createElement('button');
  passer.textContent = 'Ne rien faire cette nuit';
  passer.className = 'secondary';
  passer.style.marginTop = '10px';
  passer.onclick = () => {
    elZoneAction.innerHTML = `<div class="empty-state">🧪 Attends la suite en silence.</div>`;
  };
  card.appendChild(passer);

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
      await voterJour(monPin, p.id);
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
