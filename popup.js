'use strict';

// Roue de secours. L'interface vit dans la page, posée par le script de
// contenu déclaré au manifeste. Chrome n'injecte ce script qu'au chargement
// d'un document : un onglet ouvert avant l'installation, ou avant un
// rechargement de l'extension, n'a donc rien. C'est le seul cas que ce popup
// traite.

const msg = document.getElementById('msg');
const FILES = ['quickview.js', 'event.js', 'boot.js'];

function activate(tabId) {
  const b = document.createElement('button');
  b.textContent = 'Activer dans cette page';
  b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: FILES });
      window.close();
    } catch (e) {
      b.disabled = false;
      msg.textContent = 'Injection impossible. Recharge la page.';
    }
  });
  document.body.appendChild(b);
}

async function run() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id || !/^https:\/\/shotgun\.live\//.test(tab.url || '')) {
    msg.textContent = 'Ouvre une page shotgun.live.';
    return;
  }

  // La version estampillée par les bibliothèques sert de preuve de présence :
  // un objet vide laissé par une version morte ne la porte pas.
  let live = false;
  try {
    const frames = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => Boolean(window.__sg && window.__sg.version)
    });
    live = Boolean(frames && frames[0] && frames[0].result);
  } catch (e) { /* page non scriptable : on propose quand même l'activation */ }

  if (live) {
    msg.textContent = 'Interface active dans la page.';
    return;
  }

  msg.textContent = 'Cet onglet n’a pas reçu les scripts. Recharge la page, ' +
    'ou active-les ici pour cette fois.';
  activate(tab.id);
}

run().catch(() => {
  msg.textContent = 'Erreur inattendue.';
});
