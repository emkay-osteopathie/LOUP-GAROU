// Code admin — change-le avant de lancer la vraie partie (garde-le secret).
const ADMIN_PIN = '9999';

const pinInput = document.getElementById('pin');
const btn = document.getElementById('btn-connexion');
const erreur = document.getElementById('erreur');

pinInput.addEventListener('input', () => {
  pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 4);
});

pinInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btn.click();
});

btn.addEventListener('click', async () => {
  const pin = pinInput.value.trim();
  erreur.style.display = 'none';

  if (pin.length !== 4) {
    afficherErreur('Le code doit avoir 4 chiffres.');
    return;
  }

  if (pin === ADMIN_PIN) {
    sessionStorage.setItem('lgAdmin', 'true');
    window.location.href = 'admin.html';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Vérification...';

  try {
    const doc = await db.collection('joueurs').doc(pin).get();
    if (!doc.exists) {
      afficherErreur('Code inconnu. Vérifie auprès de l\'animateur.');
      btn.disabled = false;
      btn.textContent = 'Entrer dans le village';
      return;
    }
    sessionStorage.setItem('lgPin', pin);
    window.location.href = 'joueur.html';
  } catch (e) {
    afficherErreur('Connexion impossible. Vérifie ta configuration Firebase.');
    btn.disabled = false;
    btn.textContent = 'Entrer dans le village';
  }
});

function afficherErreur(msg) {
  erreur.textContent = msg;
  erreur.style.display = 'block';
}
