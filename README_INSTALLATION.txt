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
