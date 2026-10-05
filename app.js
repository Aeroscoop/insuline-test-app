/**
 * App.js - Screen management, localStorage persistence, form interaction.
 */

const STORAGE_KEY_SETTINGS = 'app_settings';
const STORAGE_KEY_LOGS = 'app_logs';

const DEFAULT_SETTINGS = {
  streefwaarde: 5.5,
  lageGlucoseGrens: 4.0,
  khr: 10.0,
  isf: 2.0,
  maxDosis: 10.0,
  correctieBlokkadeUren: 2.0,
  afrondStap: 0.5,
  afrondGrens: 0.5,
  modus: 'enkel',
  tijdsblokken: [
    { naam: 'Ontbijt', starttijd: '06:00', khr: 10.0, isf: 2.0 },
    { naam: 'Lunch', starttijd: '11:00', khr: 10.0, isf: 2.0 },
    { naam: 'Avond', starttijd: '17:00', khr: 10.0, isf: 2.0 }
  ]
};

/**
 * Definitions list for UI generation of settings
 */
const SETTING_DEFINITIONS = [
  { key: 'streefwaarde', label: 'Streefwaarde (mmol/L)', type: 'number', step: '0.1', default: 5.5 },
  { key: 'lageGlucoseGrens', label: 'Lage glucosegrens (mmol/L)', type: 'number', step: '0.1', default: 4.0 },
  { key: 'khr', label: 'Koolhydraat-ratio KhR (g/E)', type: 'number', step: '0.1', default: 10.0, condition: s => s.modus === 'enkel' },
  { key: 'isf', label: 'Insulinegevoeligheid ISF (mmol/L per E)', type: 'number', step: '0.1', default: 2.0, condition: s => s.modus === 'enkel' },
  { key: 'maxDosis', label: 'Maximale dosis (E)', type: 'number', step: '0.5', default: 10.0 },
  { key: 'correctieBlokkadeUren', label: 'Correctie-blokkade (uren)', type: 'number', step: '0.5', default: 2.0 },
  { key: 'afrondStap', label: 'Afrondstap', type: 'radio', options: [0.5, 1.0], default: 0.5 },
  { key: 'afrondGrens', label: 'Afrondgrens', type: 'number', step: '0.05', default: 0.5, help: 'Aandeel van de stap waarop naar boven wordt afgerond (bijv. 0,5).' }
];

let currentCalculationResult = null;

// Helper: safe localStorage get
function loadFromStorage(key, fallback) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    console.warn(`localStorage load error for key "${key}":`, e);
    return fallback;
  }
}

// Helper: safe localStorage save
function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`localStorage save error for key "${key}":`, e);
  }
}

function getSettings() {
  const saved = loadFromStorage(STORAGE_KEY_SETTINGS, DEFAULT_SETTINGS);
  return Object.assign({}, DEFAULT_SETTINGS, saved);
}

function getLogs() {
  return loadFromStorage(STORAGE_KEY_LOGS, []);
}

function getLastBolusTimestamp() {
  const logs = getLogs();
  if (logs.length === 0) return null;
  // Pick latest timestamp
  const sorted = [...logs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return sorted[0].timestamp;
}

// Number parsing supporting comma and dot
function parseDecimal(val) {
  if (val === null || val === undefined) return NaN;
  const str = String(val).replace(',', '.').trim();
  return str === '' ? NaN : Number(str);
}

function formatDecimal(val, decimals = 1) {
  if (typeof val !== 'number' || isNaN(val)) return '0,0';
  return val.toFixed(decimals).replace('.', ',');
}

// Navigation Tab Switching
function switchTab(tabName) {
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.screen').forEach(scr => scr.classList.remove('active'));

  const tabBtn = document.getElementById(`tab-${tabName}`);
  const screen = document.getElementById(`${tabName}-screen`);

  if (tabBtn) tabBtn.classList.add('active');
  if (screen) screen.classList.add('active');

  if (tabName === 'logbook') {
    renderLogbook();
  } else if (tabName === 'settings') {
    renderSettingsForm();
  }
}

// Main Calculator Screen Interaction
function calculateAndDisplayAdvice() {
  const glucoseInput = document.getElementById('input-glucose').value;
  const koolhydratenInput = document.getElementById('input-koolhydraten').value;

  const errorGlucose = document.getElementById('error-glucose');
  const errorKh = document.getElementById('error-koolhydraten');
  const adviceContainer = document.getElementById('advice-container');

  errorGlucose.style.display = 'none';
  errorKh.style.display = 'none';

  const glucose = parseDecimal(glucoseInput);
  const koolhydraten = parseDecimal(koolhydratenInput);

  let hasError = false;

  if (glucoseInput.trim() !== '') {
    if (isNaN(glucose) || glucose < 1 || glucose > 35) {
      errorGlucose.textContent = 'Glucose moet tussen 1,0 en 35,0 mmol/L liggen.';
      errorGlucose.style.display = 'block';
      hasError = true;
    }
  } else {
    hasError = true;
  }

  if (koolhydratenInput.trim() !== '') {
    if (isNaN(koolhydraten) || koolhydraten < 0 || koolhydraten > 300) {
      errorKh.textContent = 'Koolhydraten moet tussen 0 en 300 gram liggen.';
      errorKh.style.display = 'block';
      hasError = true;
    }
  } else {
    hasError = true;
  }

  if (hasError) {
    adviceContainer.style.display = 'none';
    currentCalculationResult = null;
    return;
  }

  const settings = getSettings();
  const lastBolusTime = getLastBolusTimestamp();
  const res = calculate({ glucose, koolhydraten }, settings, lastBolusTime, new Date());
  currentCalculationResult = { glucose, koolhydraten, res, settings };

  // Update Advice Card
  document.getElementById('advice-value-display').textContent = `${formatDecimal(res.afgerond_advies, 1)} E`;

  // Warnings
  const warnTeLaag = document.getElementById('warning-te-laag');
  const warn2Uur = document.getElementById('warning-2uursregel');
  const warnBovenMax = document.getElementById('warning-boven-max');

  warnTeLaag.style.display = res.vlaggen.te_laag ? 'block' : 'none';
  warn2Uur.style.display = (!res.vlaggen.te_laag && res.vlaggen.twee_uursregel) ? 'block' : 'none';

  if (res.vlaggen.boven_max) {
    document.getElementById('max-dose-display').textContent = formatDecimal(settings.maxDosis, 1);
    warnBovenMax.style.display = 'block';
  } else {
    warnBovenMax.style.display = 'none';
  }

  adviceContainer.style.display = 'block';
}

function clearCalculatorForm() {
  document.getElementById('input-glucose').value = '';
  document.getElementById('input-koolhydraten').value = '';
  document.getElementById('error-glucose').style.display = 'none';
  document.getElementById('error-koolhydraten').style.display = 'none';
  document.getElementById('advice-container').style.display = 'none';
  currentCalculationResult = null;
}

function saveCurrentBolus() {
  if (!currentCalculationResult) return;

  const { glucose, koolhydraten, res, settings } = currentCalculationResult;
  const logs = getLogs();

  const vlaggenLijst = [];
  if (res.vlaggen.te_laag) vlaggenLijst.push('Glucose te laag');
  if (res.vlaggen.twee_uursregel) vlaggenLijst.push('2-uursregel');
  if (res.vlaggen.boven_max) vlaggenLijst.push('Boven max dosis');

  const logEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    glucose,
    koolhydraten,
    maaltijd: res.maaltijd,
    correctie: res.correctie,
    toegepaste_correctie: res.toegepaste_correctie,
    totaal: res.totaal,
    afgerond_advies: res.afgerond_advies,
    vlaggen: res.vlaggen,
    vlaggenLijst,
    khr: res.khr,
    isf: res.isf,
    afrondStap: settings.afrondStap,
    actieveBlokNaam: res.actieveBlokNaam
  };

  logs.unshift(logEntry);
  saveToStorage(STORAGE_KEY_LOGS, logs);

  alert('Bolus opgeslagen in logboek!');
  clearCalculatorForm();
}

// Explanation Modal
function openExplanationModal() {
  if (!currentCalculationResult) return;
  const { res, settings } = currentCalculationResult;

  document.getElementById('modal-maaltijd').textContent = `${formatDecimal(res.maaltijd, 2)} E`;
  document.getElementById('modal-correctie').textContent = `${formatDecimal(res.correctie, 2)} E`;
  document.getElementById('modal-toegepaste-correctie').textContent = `${formatDecimal(res.toegepaste_correctie, 2)} E`;
  document.getElementById('modal-2uursregel').textContent = res.vlaggen.twee_uursregel ? 'Ja (correctie genegeerd)' : 'Nee';
  document.getElementById('modal-totaal').textContent = `${formatDecimal(res.totaal, 2)} E`;
  document.getElementById('modal-advies').textContent = `${formatDecimal(res.afgerond_advies, 1)} E`;

  let extraInfo = `Gebruikte KhR: ${formatDecimal(res.khr, 1)} g/E | ISF: ${formatDecimal(res.isf, 1)} mmol/L per E.`;
  if (res.actieveBlokNaam) {
    extraInfo += ` (Tijdsblok: ${res.actieveBlokNaam})`;
  }
  extraInfo += ` Afrondstap: ${formatDecimal(settings.afrondStap, 1)} E (grens ${formatDecimal(settings.afrondGrens, 2)}).`;

  document.getElementById('modal-extra-info').textContent = extraInfo;
  document.getElementById('explanation-modal').classList.add('active');
}

function closeExplanationModal() {
  document.getElementById('explanation-modal').classList.remove('active');
}

function closeExplanationModalOnOverlay(e) {
  if (e.target.id === 'explanation-modal') {
    closeExplanationModal();
  }
}

// Settings Form Handling
function renderSettingsForm() {
  const settings = getSettings();
  const container = document.getElementById('dynamic-settings-fields');
  container.innerHTML = '';

  SETTING_DEFINITIONS.forEach(def => {
    if (def.condition && !def.condition(settings)) return;

    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.textContent = def.label;
    group.appendChild(label);

    if (def.type === 'radio') {
      const radioContainer = document.createElement('div');
      radioContainer.className = 'radio-group';
      def.options.forEach(opt => {
        const lbl = document.createElement('label');
        lbl.className = 'radio-label';
        const rad = document.createElement('input');
        rad.type = 'radio';
        rad.name = def.key;
        rad.value = opt;
        if (Number(settings[def.key]) === opt) rad.checked = true;
        lbl.appendChild(rad);
        lbl.appendChild(document.createTextNode(` ${formatDecimal(opt, 1)} E`));
        radioContainer.appendChild(lbl);
      });
      group.appendChild(radioContainer);
    } else {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = `setting-${def.key}`;
      input.value = formatDecimal(settings[def.key], def.step === '0.1' ? 1 : (def.step === '0.05' ? 2 : 1));
      group.appendChild(input);
    }

    if (def.help) {
      const help = document.createElement('div');
      help.className = 'help-text';
      help.textContent = def.help;
      group.appendChild(help);
    }

    container.appendChild(group);
  });

  // Set modus radios
  const modusRadios = document.getElementsByName('modus');
  modusRadios.forEach(r => {
    r.checked = (r.value === settings.modus);
  });

  toggleModusView();
  renderTijdsblokkenTable(settings.tijdsblokken || []);
}

function toggleModusView() {
  const modusVal = document.querySelector('input[name="modus"]:checked')?.value || 'enkel';
  const tijdsblokkenSection = document.getElementById('tijdsblokken-section');

  if (tijdsblokkenSection) {
    tijdsblokkenSection.style.display = (modusVal === 'tijdsblokken') ? 'block' : 'none';
  }

  // Re-render setting inputs to show/hide khr and isf depending on mode
  const settings = getSettings();
  settings.modus = modusVal;
  const khrInput = document.getElementById('setting-khr');
  const isfInput = document.getElementById('setting-isf');

  if (khrInput && khrInput.closest('.form-group')) {
    khrInput.closest('.form-group').style.display = (modusVal === 'enkel') ? 'block' : 'none';
  }
  if (isfInput && isfInput.closest('.form-group')) {
    isfInput.closest('.form-group').style.display = (modusVal === 'enkel') ? 'block' : 'none';
  }
}

function renderTijdsblokkenTable(blocks) {
  const tbody = document.getElementById('tijdsblokken-tbody');
  tbody.innerHTML = '';

  blocks.forEach((b, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" class="block-naam" value="${b.naam || ''}" style="min-height: 40px; padding: 6px;"></td>
      <td><input type="time" class="block-tijd" value="${b.starttijd || '00:00'}" style="min-height: 40px; padding: 6px;"></td>
      <td><input type="text" class="block-khr" value="${formatDecimal(b.khr, 1)}" style="min-height: 40px; padding: 6px; width: 70px;"></td>
      <td><input type="text" class="block-isf" value="${formatDecimal(b.isf, 1)}" style="min-height: 40px; padding: 6px; width: 70px;"></td>
      <td><button type="button" class="btn btn-danger" style="padding: 6px 10px; min-height: 40px; font-size: 0.9rem;" onclick="removeTijdsblokRow(${index})">X</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function addTijdsblokRow() {
  const tbody = document.getElementById('tijdsblokken-tbody');
  const tr = document.createElement('tr');
  const settings = getSettings();
  tr.innerHTML = `
    <td><input type="text" class="block-naam" value="Nieuw blok" style="min-height: 40px; padding: 6px;"></td>
    <td><input type="time" class="block-tijd" value="12:00" style="min-height: 40px; padding: 6px;"></td>
    <td><input type="text" class="block-khr" value="${formatDecimal(settings.khr, 1)}" style="min-height: 40px; padding: 6px; width: 70px;"></td>
    <td><input type="text" class="block-isf" value="${formatDecimal(settings.isf, 1)}" style="min-height: 40px; padding: 6px; width: 70px;"></td>
    <td><button type="button" class="btn btn-danger" style="padding: 6px 10px; min-height: 40px; font-size: 0.9rem;" onclick="this.closest('tr').remove()">X</button></td>
  `;
  tbody.appendChild(tr);
}

function removeTijdsblokRow(index) {
  const rows = document.querySelectorAll('#tijdsblokken-tbody tr');
  if (rows[index]) {
    rows[index].remove();
  }
}

function saveSettingsFromForm() {
  const settings = getSettings();

  SETTING_DEFINITIONS.forEach(def => {
    if (def.type === 'radio') {
      const selected = document.querySelector(`input[name="${def.key}"]:checked`);
      if (selected) {
        settings[def.key] = parseDecimal(selected.value);
      }
    } else {
      const el = document.getElementById(`setting-${def.key}`);
      if (el) {
        const val = parseDecimal(el.value);
        if (!isNaN(val)) settings[def.key] = val;
      }
    }
  });

  const modusVal = document.querySelector('input[name="modus"]:checked')?.value || 'enkel';
  settings.modus = modusVal;

  // Save Tijdsblokken table
  const rows = document.querySelectorAll('#tijdsblokken-tbody tr');
  const newBlocks = [];
  rows.forEach(tr => {
    const naam = tr.querySelector('.block-naam')?.value || '';
    const starttijd = tr.querySelector('.block-tijd')?.value || '00:00';
    const khr = parseDecimal(tr.querySelector('.block-khr')?.value) || settings.khr;
    const isf = parseDecimal(tr.querySelector('.block-isf')?.value) || settings.isf;
    newBlocks.push({ naam, starttijd, khr, isf });
  });

  settings.tijdsblokken = newBlocks;

  saveToStorage(STORAGE_KEY_SETTINGS, settings);
  alert('Instellingen succesvol opgeslagen!');
}

function resetSettingsToDefault() {
  if (confirm('Weet u zeker dat u alle instellingen wilt terugzetten naar de standaardwaarden?')) {
    saveToStorage(STORAGE_KEY_SETTINGS, DEFAULT_SETTINGS);
    renderSettingsForm();
    alert('Instellingen zijn teruggezet.');
  }
}

// Logbook Screen Interaction
function renderLogbook() {
  const logs = getLogs();
  const container = document.getElementById('log-list');
  container.innerHTML = '';

  if (logs.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #666;">Geen metingen in het logboek.</p>';
    return;
  }

  logs.forEach(log => {
    const dateObj = new Date(log.timestamp);
    const timeStr = dateObj.toLocaleDateString('nl-NL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    const item = document.createElement('div');
    item.className = 'log-item';

    let tagsHtml = '';
    if (log.vlaggen) {
      if (log.vlaggen.te_laag) tagsHtml += '<span class="tag tag-danger">Glucose te laag</span> ';
      if (log.vlaggen.twee_uursregel) tagsHtml += '<span class="tag tag-warning">2-uursregel</span> ';
      if (log.vlaggen.boven_max) tagsHtml += '<span class="tag tag-warning">Boven max dosis</span> ';
    }

    item.innerHTML = `
      <div class="log-header">
        <span>${timeStr}</span>
        <button type="button" style="background:none; border:none; color:#d9534f; font-weight:bold; cursor:pointer;" onclick="deleteLogEntry('${log.id}')">Verwijderen</button>
      </div>
      <div class="log-body">
        <div class="log-values">
          Glucose: <strong>${formatDecimal(log.glucose, 1)}</strong> mmol/L<br>
          Koolhydraten: <strong>${log.koolhydraten}</strong> g
        </div>
        <div class="log-advise">
          ${formatDecimal(log.afgerond_advies, 1)} E
        </div>
      </div>
      ${tagsHtml ? `<div class="log-flags">${tagsHtml}</div>` : ''}
    `;

    container.appendChild(item);
  });
}

function deleteLogEntry(id) {
  if (confirm('Wilt u deze meting uit het logboek verwijderen?')) {
    let logs = getLogs();
    logs = logs.filter(l => l.id !== id);
    saveToStorage(STORAGE_KEY_LOGS, logs);
    renderLogbook();
  }
}

// JSON Import / Export & Print
function exportJSON() {
  const data = {
    settings: getSettings(),
    logs: getLogs(),
    exportDate: new Date().toISOString()
  };

  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `bolus_calculator_data_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function triggerImportJSON() {
  document.getElementById('import-file-input').click();
}

function handleImportJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data.settings) {
        saveToStorage(STORAGE_KEY_SETTINGS, data.settings);
      }
      if (Array.isArray(data.logs)) {
        saveToStorage(STORAGE_KEY_LOGS, data.logs);
      }
      alert('Gegevens succesvol geïmporteerd!');
      renderLogbook();
      renderSettingsForm();
    } catch (err) {
      alert('Ongeldig JSON-bestand: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function printLogbook() {
  window.print();
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
  renderSettingsForm();
});
