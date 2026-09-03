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
