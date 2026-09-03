Audit Hôtel Pro — V23 (02/09/2026)
==================================

Déploiement : pousser le dépôt sur GitHub, Vercel redéploie automatiquement.
Ouvrir ensuite l'app avec ?v=23 pour forcer le rafraîchissement du cache.

Codes d'accès :
  Manager  : 05147
  Auditeur : 1234


CE QUI ÉTAIT CASSÉ EN V22
-------------------------
Symptômes signalés : textes saisis qui apparaissent puis disparaissent,
message « Stockage plein » sur les photos, application instable.

Cause racine unique. Les photos étaient stockées en base64 dans localStorage,
plafonné à environ 5 Mo par le navigateur. L'audit Mariott / Monaco du 29/08
pesait à lui seul 5,07 Mo. Conséquences en chaîne :

  1. save() levait QuotaExceededError → plus rien n'était sauvegardé en local.
  2. mergeCloudAudits() appelait localStorage.setItem SANS try/catch →
     exception non interceptée, renderAll() n'était jamais atteint.
  3. La synchronisation (toutes les 30 s) écrasait l'audit en cours de saisie
     par la copie serveur, plus ancienne. C'est ce qui faisait « disparaître »
     le texte quelques secondes après l'avoir tapé.
  4. fixes-v21.js était injecté à la volée dans le HTML par le service worker.
     Selon la version du worker installée sur l'appareil, le correctif était
     présent ou absent : l'application ne se comportait pas deux fois de la
     même façon, et les libellés de boutons étaient réécrits après le rendu.
  5. L'action « list » de l'edge function sync-audit renvoyait le contenu
     COMPLET de tous les audits (jusqu'à 200), soit potentiellement des
     centaines de Mo téléchargés toutes les 30 secondes sur téléphone.


CORRECTIONS V23
---------------
Stockage
  - Passage de localStorage à IndexedDB (plusieurs centaines de Mo).
  - Migration automatique et transparente des données existantes.
  - Repli sur localStorage si IndexedDB est indisponible.
  - Écriture de sécurité sur visibilitychange et pagehide.

Photos
  - Compression réellement bornée à 92 Ko par photo (contre 140 à 185 Ko).
    Un audit complet passe d'environ 5 Mo à environ 1,2 Mo.
  - Nouveau bouton « Optimiser les photos » (page Exports) pour recompresser
    les photos des audits déjà enregistrés ou importés.

Synchronisation
  - La fusion cloud n'écrase plus jamais l'audit en cours de saisie.
  - Synchronisation incrémentale : on récupère d'abord l'index (quelques
    centaines d'octets), puis uniquement les audits réellement plus récents.
  - Remontée des erreurs HTTP au lieu d'un échec silencieux.

Stabilité
  - Les correctifs V21 sont intégrés dans index.html, chargés une seule fois.
  - Le service worker ne réécrit plus le HTML. Réseau d'abord sur le HTML,
    cache d'abord sur les images. Cache nommé audit-hotel-pro-v23.
  - fixes-v21.js est conservé vide, pour les anciens workers encore installés
    sur des appareils qui tenteraient de le charger.

Rapports PDF (les 8 exports)
  - Page de garde : logo API Contrôle, bandeau marine, bloc de score coloré,
    tableau d'identification du site, mention de confidentialité.
  - En-têtes courants allégés avec filet doré.
  - Tableaux zébrés, statuts en couleur (conforme / non conforme / à remplacer).
  - Annexes photo en pleine largeur, proportions respectées (l'ancienne
    version forçait les photos dans une boîte fixe et les déformait).
  - Un score calculé sur zéro point renseigné s'affiche « — » et non « 0 % ».


CÔTÉ SUPABASE (projet gytabinhioceawwgfsly)
-------------------------------------------
  - Edge function sync-audit passée en v2 :
      • nouvelle action « index » (métadonnées seules)
      • nouvelle action « get » (un seul audit)
      • « list » conservée, mais limitée à 20 audits, pour les appareils
        encore en V22 qui ne connaissent pas les nouvelles actions
  - Index ah_audits_sync_updated_at_idx ajouté sur (updated_at desc).

L'audit Mariott / Monaco du 29/08 est intact côté serveur : 30/30 points
renseignés, 16 photos, 48 contrôles cahier des charges, restes sur les
5 moments. Il se récupère depuis Exports → « Récupérer les audits du cloud ».


V23.1 — 03/09/2026 — CORRECTIF DE PERFORMANCE
---------------------------------------------
Symptôme : boutons qui ne répondent pas, impossible d'ouvrir l'audit Mariott.

Régression introduite par la V23 elle-même. En V22 le Mariott ne pouvait PAS
être chargé en local (quota localStorage dépassé), donc l'état restait léger.
Dès que IndexedDB a permis de le charger, trois opérations coûteuses se sont
mises à s'exécuter à chaque interaction :

  - renderAll() reconstruisait les 12 pages à chaque appel, en réinjectant
    4,4 Mo de photos base64 dans le DOM. Mesuré : 1843 ms par rendu.
  - storageUsageMB() sérialisait l'état entier, deux fois par rendu.
  - Chaque perte de focus réécrivait 5 Mo dans IndexedDB, même sans
    modification.

Corrections, toutes mesurées sur un état de 4,75 Mo :

  - Rendu à la demande : seule la page affichée est construite, les autres le
    sont au moment où l'on y navigue.
      ouverture d'un audit  : 2365 ms -> 36 ms
      rendu complet         : 1843 ms -> 16 ms
  - Vignettes converties une seule fois en URL blob au lieu d'être réinjectées
    en base64. Les exports PDF continuent d'utiliser le base64 d'origine :
    vérifié, 32 images bien intégrées dans le rapport hôtel.
      page Contrôle PMS     : 2055 ms -> 95 ms  (2,26 Mo -> 53 Ko de HTML)
  - Taille de l'état mise en cache, invalidée à l'écriture.
  - Écriture IndexedDB uniquement s'il y a eu une vraie modification.
  - selectAudit() change de page AVANT de rendre : un rendu en échec ne peut
    plus donner l'impression que le bouton est mort.
  - renderAll() isole chaque secteur : une exception sur un seul n'interrompt
    plus les onze autres.
  - Les erreurs JavaScript s'affichent désormais en toast, au lieu de rester
    invisibles sans console ouverte.
  - Clé « extra » corrigée (le code d'optimisation photo cherchait « extras »).


V23.2 — 03/09/2026 — SURVOL ET CLIC
-----------------------------------
Symptôme : au survol d'un bouton l'élément tremble, et le curseur alterne
rapidement entre la main et la flèche. Clics parfois perdus.

Cause : trois règles CSS déplaçaient l'élément au survol.

  .card:hover, .kpi:hover  translateY(-4px) + rotateX(2deg) rotateY(-2deg)
  .li:hover                translateY(-2px) + rotateX(1deg)
  .btn:hover               translateY(-2px)

Le mécanisme : l'élément se déplace sous l'effet du survol, le curseur se
retrouve donc hors de sa zone, le survol s'annule, l'élément revient à sa
place, le survol se déclenche de nouveau — en boucle, plusieurs fois par
seconde. Le curseur suit ce va-et-vient, d'où l'alternance main / flèche.

Le défaut était amplifié par l'imbrication. Le bouton « Ouvrir » de
l'historique est dans une ligne .li, elle-même dans une carte .card : le
survoler déplaçait les trois à la fois, soit 8 px de mouvement cumulé.

Deuxième problème, plus grave, sur le clic :

  .btn:active                       scale(.97) puis scale(.96)
  .card:active, .kpi:active, .li:active   translateY(-1px) scale(.995)

Le bouton rétrécissait pendant l'appui. Si le relâchement tombait hors du
bouton rétréci, le navigateur n'émettait pas d'événement click sur le bouton
mais sur son parent : l'action n'était jamais déclenchée. C'est une cause
directe de « je clique et il ne se passe rien », indépendante du problème de
performance corrigé en V23.1.

Correction : plus aucune règle de survol ou d'appui ne modifie la géométrie.
Le relief est conservé par l'ombre, le fond et la luminosité, qui ne
déplacent rien et ne changent pas la zone cliquable. Les transitions
n'animent plus la propriété transform.

Vérifié : aucun transform ne subsiste sur :hover, :active ou :focus.


V24 — 03/09/2026 — CONFIGURATION DU DÉPLACEMENT ET DOUBLE NOTATION
------------------------------------------------------------------
Constat chiffré : la référence du cahier des charges contient 271 points
répartis sur 5 moments (46 à 68 chacun), et l'application les imposait tous à
chaque déplacement. Sur l'audit Mariott, seul le dîner a été renseigné
(48 points sur 49) ; les 4 autres moments sont restés vides.

1. CONFIGURATION DES REPAS
   Nouvelle carte sur la fiche Déplacement : l'auditeur coche les repas que
   l'équipe prend réellement (dîner veille, PDJ, déjeuner + collation, dernier
   repas avant match, collation jour de match). Les repas non retenus restent
   consultables, affichés en grisé, et sortent des deux notes.

2. DEUX NOTES INDÉPENDANTES, sur les repas retenus uniquement

   Avant service — présence des produits et respect des quantités
     conformes / (conformes + absents + quantité non conforme)
     Les points « N/C » sont exclus du dénominateur.

   Après service — gestion des restes
     Pour chaque produit livré : taux = quantité restante / quantité livrée,
     plafonné à 100 %. La note est 100 % moins la moyenne de ces taux.
     Un produit livré sans reste saisi compte comme « pas de reste ».

   Point important sur la quantité livrée. Les quantités du cahier des charges
   sont du texte libre et souvent non chiffrables : « - » (66 occurrences),
   « 20 + 6 », « 1 pot de chaque arôme », « 250 à 300 g ». Le calcul s'appuie
   donc en priorité sur la quantité constatée par l'auditeur, qui dispose
   désormais d'un champ numérique et d'un sélecteur d'unité (kg / portion /
   unité) sur la page Cahier des charges. Le texte de la référence sert de
   repli quand il est lisible (« 1,5 kg », « 500 g », « 20 tranches », « 1 L »).
   Un produit dont la quantité livrée est introuvable, ou dont l'unité de reste
   ne correspond pas, est compté comme non calculable et signalé — il ne
   fausse pas la note.

   Les deux notes apparaissent au tableau de bord, sur les pages concernées et
   sur les pages de garde des PDF. Le rapport cahier des charges comporte en
   plus un tableau récapitulant les repas retenus.

3. PHOTOS DU CAHIER DES CHARGES
   Trois défauts corrigés sur ce chemin :
   - capturePhoto() ne vérifiait pas que le flux vidéo était prêt. Si
     videoWidth valait 0, une image vide était dessinée dans un canvas
     1280x720 et enregistrée comme photo — sans aucun message. La capture est
     désormais refusée avec une explication.
   - Le moment actif était relu au moment du callback, donc après la prise de
     vue. Il est maintenant figé à l'ouverture de l'appareil photo.
   - Le tableau photos n'était pas créé défensivement : un contrôle issu d'une
     version antérieure sans cette clé faisait échouer .push() en silence.
   Une confirmation explicite indique désormais le nombre de photos du point.

4. RÉALIGNEMENT DES CONTRÔLES
   Les contrôles sont indexés par position dans la référence
   (moment__bloc__ligne). Si un produit était ajouté ou déplacé côté serveur,
   tous les contrôles et leurs photos devenaient orphelins : encore présents
   dans la donnée, mais invisibles à l'écran et absents des PDF. Au
   rechargement de la référence, ils sont réappariés sur le libellé du produit.
   Ce qui ne trouve pas de correspondance est conservé, jamais supprimé.


V25 — 03/09/2026 — AUDIT SALLE DE RESTAURANT
--------------------------------------------
Nouvelle page « Salle restaurant » dans le menu (barre latérale et barre du
bas). Même structure que l'audit cuisine : statut (conforme / non conforme /
à reprendre / N/C), champ de relevé, remarque, photos par point.

30 POINTS EN 5 SECTEURS
  Agencement & espace (6)         configuration selon le nombre de convives,
                                  espacement et circulation, dressage homogène,
                                  accès buffet sans croisement de flux,
                                  éclairage / température / niveau sonore,
                                  privatisation effective de la salle
  Propreté & matériel (5)         tables et banquettes, sols et abords du
                                  buffet, vaisselle et verrerie, linge,
                                  matériel de buffet
  Service & disposition (7)       buffet complet à l'heure, ordre du buffet,
                                  étiquetage des plats, réactivité au réassort,
                                  réactivité au débarrassage, présence du
                                  personnel, respect du timing
  Maîtrise sanitaire & T° (7)     T° des plats chauds, T° des plats froids,
                                  relevés tracés pendant le service, protection
                                  des aliments, ustensiles dédiés par plat, gel
                                  hydroalcoolique, gestion des plats non
                                  consommés
  Personnel & contact client (5)  tenue professionnelle, accueil et prise en
                                  charge, amabilité et contact, connaissance
                                  des plats et allergènes, discrétion adaptée
                                  au cadre sportif

En-tête de page : couverts servis, service audité, responsable de salle et
observation générale. Bouton « Tout conforme » par secteur.

PHOTOS
  Appareil photo et import multiple sur chaque point, avec confirmation du
  nombre de photos. Le sélecteur multi-fichiers est intégré au cœur de
  l'application, sans passer par la couche de décoration.

NOTATION
  Note de salle distincte, calculée comme les autres : conformes / points
  évalués, les « N/C » exclus du dénominateur.
  Le tableau de bord affiche désormais trois notes côte à côte — Cuisine,
  Salle, Traiteur — et une note globale du site qui cumule les points évalués
  des trois audits. Un audit non commencé ne pèse pas dans le calcul et ne
  tire donc pas la note vers le bas.

EXTRACTION
  L'audit salle prolonge l'audit cuisine dans le MÊME rapport
  (« Rapport audit hôtel complet »), après les secteurs cuisine et avant le
  plan d'actions : page de synthèse salle avec la note, puis un tableau par
  secteur, puis les annexes photo pleine page à la suite de celles du PMS.
  La page de garde affiche la note globale du site, la note cuisine et la note
  salle.
