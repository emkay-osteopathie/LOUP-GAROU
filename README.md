# Loup-Garou YOPI 🌕

Site web pour animer une partie de Loup-Garou entre animateurs (16 joueurs),
avec connexion par code PIN, gestion des rôles, et suivi des rondes.

Ce guide t'amène de zéro jusqu'à un site fonctionnel, sans rien connaître au
développement. Il y a deux services à mettre en place : **Firebase** (la base
de données qui garde l'état de la partie en direct) et **GitHub Pages**
(l'hébergement du site).

---

## Étape 1 — Créer le projet Firebase (5-10 min)

1. Va sur https://console.firebase.google.com et connecte-toi avec un compte Google.
2. Clique **"Ajouter un projet"**. Donne-lui un nom, ex. `loup-garou-yopi`.
3. Tu peux désactiver Google Analytics (pas nécessaire) puis clique **"Créer le projet"**.
4. Une fois dans le projet, dans le menu de gauche : **Compilation > Firestore Database**.
5. Clique **"Créer une base de données"**.
   - Choisis une région proche (ex. `northamerica-northeast1` pour Montréal).
   - Sélectionne **"Démarrer en mode test"** (ça permet au site de lire/écrire
     sans configuration compliquée — voir la note de sécurité plus bas).
6. Retourne dans **Paramètres du projet** (roue dentée en haut à gauche) >
   onglet **Général**, descends jusqu'à **"Vos applications"**.
7. Clique l'icône **`</>`** (Web) pour ajouter une application web.
   Donne-lui un nom (ex. `site`), pas besoin de cocher "Hébergement".
8. Firebase t'affiche un bloc de code avec `firebaseConfig = { apiKey: ... }`.
   **Copie ces valeurs** — tu en as besoin à l'étape 3.

> ⚠️ **Note de sécurité :** le mode test laisse la base de données ouverte en
> lecture/écriture pendant 30 jours, ce qui est amplement suffisant pour un
> camp d'été. Comme c'est un jeu entre collègues de confiance, ce n'est pas un
> souci. Si tu veux la verrouiller après coup, dis-le-moi et je peux t'écrire
> des règles Firestore plus strictes.

---

## Étape 2 — Créer le repo GitHub (3 min)

1. Sur https://github.com, clique **"New repository"**.
2. Nom du repo : `loup-garou-yopi` (ou ce que tu veux).
3. Laisse-le **Public** (nécessaire pour GitHub Pages gratuit) et ne coche
   aucune case d'initialisation (pas de README, pas de .gitignore).
4. Clique **"Create repository"**.

Ensuite, mets tous les fichiers de ce projet dans le repo. Le plus simple si
tu n'es pas à l'aise avec `git` :
- Sur la page du repo vide, clique **"uploading an existing file"**.
- Glisse-dépose **tous les fichiers et dossiers** de ce projet
  (`index.html`, `admin.html`, `joueur.html`, `regles.html`, le dossier `css/`,
  le dossier `js/`) tels quels, en gardant la même structure de dossiers.
- Clique **"Commit changes"**.

---

## Étape 3 — Coller ta configuration Firebase

1. Dans le repo GitHub, ouvre le fichier `js/firebase-config.js`.
2. Clique le crayon ✏️ (Edit) en haut à droite du fichier.
3. Remplace les valeurs `"REMPLACE_MOI"` par celles copiées à l'étape 1.
4. Clique **"Commit changes"**.

---

## Étape 4 — Activer GitHub Pages (2 min)

1. Dans le repo, va dans **Settings** (⚙️, en haut) > **Pages** (menu de gauche).
2. Sous **"Build and deployment"**, choisis la branche **`main`** et le
   dossier **`/ (root)`**, puis **Save**.
3. Attends 1-2 minutes. Une URL apparaît en haut de la page Pages, du genre :
   `https://ton-nom-utilisateur.github.io/loup-garou-yopi/`
4. C'est le lien à partager avec tes animateurs !

---

## Étape 5 — Préparer la partie le jour J

1. Ouvre le site sur ton téléphone ou ordinateur.
2. Entre le **code admin : `9999`** (tu peux le changer dans `js/login.js`,
   variable `ADMIN_PIN`, avant de mettre le site en ligne pour de vrai — évite
   que les joueurs devinent ce code).
3. Dans le tableau de bord, ajoute les 16 joueurs un par un (leur nom ou
   surnom de camp). Un code à 4 chiffres est généré automatiquement pour
   chacun — note-les ou prends une capture d'écran pour les distribuer.
4. Une fois les 16 joueurs ajoutés, clique **"Distribuer les rôles et
   commencer"**.
5. Chaque joueur se connecte avec son propre code sur son téléphone
   (`https://.../index.html`), voit son rôle, et agit à son tour selon les
   instructions à l'écran.
6. Toi (admin) tu contrôles le rythme : tu avances les étapes de nuit une par
   une, et tu clos le vote de jour quand tout le monde a voté.

---

## Structure du projet

```
index.html      → page de connexion (code PIN)
joueur.html      → interface joueur (rôle, actions, annonces)
admin.html       → tableau de bord animateur
regles.html      → règlements consultables par tous
css/style.css    → thème visuel
js/firebase-config.js → tes clés Firebase (à remplir)
js/game.js       → moteur de jeu (rôles, phases, résolution des nuits/votes)
js/login.js      → logique de connexion
js/joueur.js     → logique de l'interface joueur
js/admin.js      → logique du tableau de bord
```

---

Des questions ou un pépin en cours de route ? Dis-le-moi, je peux t'aider à
déboguer ou ajuster n'importe quelle partie du site.
