'use strict';

// Roue de secours. L'interface vit dans la page ; Chrome n'y injecte ses
// scripts qu'au chargement d'un document, donc pas dans un onglet déjà ouvert.

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
    msg.textContent = 'Ouvre la page ';
    
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = 'shotgun.live';
    link.style.color = '#ff765f';
    link.style.textDecoration = 'none';
    link.style.fontWeight = 'bold';
  
    link.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://shotgun.live/' });
    });
    
    msg.appendChild(link);
    msg.appendChild(document.createTextNode('.'));
    return;
  }

  // La version estampillée sert de preuve de présence.
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
