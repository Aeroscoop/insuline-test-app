/**
 * Pure calculation functions for Bolus Calculator.
 * No DOM or localStorage references here.
 */

function getTimeBlockForTime(blocks, dateObj) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return null;
  }

  const blockMinutes = blocks.map((b, index) => {
    const parts = (b.starttijd || '00:00').split(':');
    const mins = parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
    return { index, mins, block: b };
  });

  blockMinutes.sort((a, b) => a.mins - b.mins);

  const currentMins = dateObj.getHours() * 60 + dateObj.getMinutes();

  let active = blockMinutes[blockMinutes.length - 1].block;
  for (let i = 0; i < blockMinutes.length; i++) {
    if (currentMins >= blockMinutes[i].mins) {
      active = blockMinutes[i].block;
    } else {
      break;
    }
  }

  return active;
}

function roundBolus(totaal, stap, afrondgrens) {
  const step = Number(stap) || 0.5;
  const threshold = Number(afrondgrens) || 0.5;

  const q = totaal / step;
  const floorQ = Math.floor(q);
  const deel = q - floorQ;

  let roundedQ = floorQ;
  if (deel >= threshold - 0.000001) {
    roundedQ = floorQ + 1;
  }

  return roundedQ * step;
}

/**
 * Main calculation logic.
 * @param {Object} input - { glucose: number, koolhydraten: number }
 * @param {Object} settings - app settings
 * @param {Date|string|number|null} lastBolusTime - Timestamp/Date of previous bolus
 * @param {Date} [now=new Date()] - Current time
 */
function calculate(input, settings, lastBolusTime = null, now = new Date()) {
  const glucose = Number(input.glucose);
  const koolhydraten = Number(input.koolhydraten);

  const defaultSettings = {
    streefwaarde: 5.5,
    lageGlucoseGrens: 4.0,
    khr: 10,
    isf: 2.0,
    maxDosis: 10.0,
    correctieBlokkadeUren: 2.0,
    afrondStap: 0.5,
    afrondGrens: 0.5,
    modus: 'enkel'
  };

  const s = Object.assign({}, defaultSettings, settings || {});

  const streefwaarde = Number(s.streefwaarde);
  const lageGlucoseGrens = Number(s.lageGlucoseGrens);
  const maxDosis = Number(s.maxDosis);
  const correctieBlokkadeUren = Number(s.correctieBlokkadeUren);
  const afrondStap = Number(s.afrondStap);
  const afrondGrens = Number(s.afrondGrens);

  let khr = Number(s.khr);
  let isf = Number(s.isf);
  let actieveBlokNaam = null;

  if (s.modus === 'tijdsblokken' && Array.isArray(s.tijdsblokken) && s.tijdsblokken.length > 0) {
    const nowDate = now instanceof Date ? now : new Date(now);
    const activeBlock = getTimeBlockForTime(s.tijdsblokken, nowDate);
    if (activeBlock) {
      khr = Number(activeBlock.khr ?? khr);
      isf = Number(activeBlock.isf ?? isf);
      actieveBlokNaam = activeBlock.naam || null;
    }
  }

  // 1 & 2: maaltijd = koolhydraten / KhR
  const maaltijd = koolhydraten / khr;

  // 3: correctie = (glucose - streefwaarde) / ISF
  const correctie = (glucose - streefwaarde) / isf;

  // 4: Lage glucose check
  const te_laag = glucose < lageGlucoseGrens;

  // 5: 2-uursregel check
  let twee_uursregel = false;
  if (lastBolusTime) {
    const lastTime = new Date(lastBolusTime).getTime();
    const currentTime = (now instanceof Date ? now : new Date(now)).getTime();
    const diffHours = (currentTime - lastTime) / (1000 * 60 * 60);
    if (!isNaN(diffHours) && diffHours >= 0 && diffHours < correctieBlokkadeUren) {
      twee_uursregel = true;
    }
  }

  const toegepaste_correctie = twee_uursregel ? 0 : correctie;

  if (te_laag) {
    return {
      maaltijd,
      correctie,
      toegepaste_correctie: 0,
      totaal: 0,
      afgerond_advies: 0,
      khr,
      isf,
      actieveBlokNaam,
      vlaggen: {
        te_laag: true,
        twee_uursregel,
        boven_max: false,
        totaal_op_nul: true
      }
    };
  }

  // 6: totaal = maaltijd + correctie. Als totaal < 0, dan totaal = 0.
  let totaal = maaltijd + toegepaste_correctie;
  let totaal_op_nul = false;
  if (totaal < 0) {
    totaal = 0;
    totaal_op_nul = true;
  }

  // 7: Afronding
  const afgerond_advies = roundBolus(totaal, afrondStap, afrondGrens);

  // 8: Maximale dosis
  const boven_max = afgerond_advies > maxDosis;

  // 9: Return object
  return {
    maaltijd,
    correctie,
    toegepaste_correctie,
    totaal,
    afgerond_advies,
    khr,
    isf,
    actieveBlokNaam,
    vlaggen: {
      te_laag: false,
      twee_uursregel,
      boven_max,
      totaal_op_nul
    }
  };
}

/**
 * Test cases definitions for unit testing
 */
const DEFAULT_TEST_SETTINGS = {
  streefwaarde: 5.5,
  lageGlucoseGrens: 4.0,
  khr: 10,
  isf: 2,
  maxDosis: 10,
  correctieBlokkadeUren: 2,
  afrondStap: 0.5,
  afrondGrens: 0.5,
  modus: 'enkel'
};

const TEST_CASES = [
  {
    name: '60 g, glucose 11,5 -> maaltijd 6,0, correctie 3,0, totaal 9,0, advies 9,0',
    input: { koolhydraten: 60, glucose: 11.5 },
    settings: DEFAULT_TEST_SETTINGS,
    lastBolusTime: null,
    expected: { maaltijd: 6.0, correctie: 3.0, toegepaste_correctie: 3.0, totaal: 9.0, afgerond_advies: 9.0 }
  },
  {
    name: '50 g, glucose 5,4 -> totaal 4,95, advies 5,0',
    input: { koolhydraten: 50, glucose: 5.4 },
    settings: DEFAULT_TEST_SETTINGS,
    lastBolusTime: null,
    expected: { totaal: 4.95, afgerond_advies: 5.0 }
  },
  {
    name: '30 g, glucose 4,5 -> maaltijd 3,0, correctie -0,5, advies 2,5',
    input: { koolhydraten: 30, glucose: 4.5 },
    settings: DEFAULT_TEST_SETTINGS,
    lastBolusTime: null,
    expected: { maaltijd: 3.0, correctie: -0.5, afgerond_advies: 2.5 }
  },
  {
    name: '10 g, glucose 4,2 -> totaal 0,35, advies 0,5',
    input: { koolhydraten: 10, glucose: 4.2 },
    settings: DEFAULT_TEST_SETTINGS,
    lastBolusTime: null,
    expected: { totaal: 0.35, afgerond_advies: 0.5 }
  },
  {
    name: '0 g, glucose 4,1 -> totaal negatief, wordt 0, advies 0',
    input: { koolhydraten: 0, glucose: 4.1 },
    settings: DEFAULT_TEST_SETTINGS,
    lastBolusTime: null,
    expected: { totaal: 0, afgerond_advies: 0, vlaggen: { totaal_op_nul: true } }
  },
  {
    name: '15 g, glucose 9,0, vorige bolus 90 minuten geleden -> correctie 0, advies 1,5',
    input: { koolhydraten: 15, glucose: 9.0 },
    settings: DEFAULT_TEST_SETTINGS,
    now: new Date('2025-01-01T12:00:00Z'),
    lastBolusTime: new Date('2025-01-01T10:30:00Z'),
    expected: { maaltijd: 1.5, correctie: 1.75, toegepaste_correctie: 0, afgerond_advies: 1.5, vlaggen: { twee_uursregel: true } }
  },
  {
    name: '15 g, glucose 4,5, vorige bolus 90 minuten geleden -> correctie 0, advies 1,5',
    input: { koolhydraten: 15, glucose: 4.5 },
    settings: DEFAULT_TEST_SETTINGS,
    now: new Date('2025-01-01T12:00:00Z'),
    lastBolusTime: new Date('2025-01-01T10:30:00Z'),
    expected: { maaltijd: 1.5, correctie: -0.5, toegepaste_correctie: 0, afgerond_advies: 1.5, vlaggen: { twee_uursregel: true } }
  },
  {
    name: 'glucose 3,9 -> geen advies, vlag te_laag',
    input: { koolhydraten: 0, glucose: 3.9 },
    settings: DEFAULT_TEST_SETTINGS,
    lastBolusTime: null,
    expected: { afgerond_advies: 0, vlaggen: { te_laag: true } }
  },
  {
    name: 'afronding: totaal 7,25 -> 7,5',
    customTest: function () {
      const res = roundBolus(7.25, 0.5, 0.5);
      return res === 7.5;
    }
  },
  {
    name: 'afronding: totaal 7,24 -> 7,0',
    customTest: function () {
      const res = roundBolus(7.24, 0.5, 0.5);
      return res === 7.0;
    }
  },
  {
    name: 'afronding met stap 1,0: totaal 7,5 -> 8',
    customTest: function () {
      const res = roundBolus(7.5, 1.0, 0.5);
      return res === 8.0;
    }
  },
  {
    name: 'afronding met stap 1,0: totaal 7,4 -> 7',
    customTest: function () {
      const res = roundBolus(7.4, 1.0, 0.5);
      return res === 7.0;
    }
  },
  {
    name: 'boven maximum: vlag boven_max, advies blijft zichtbaar',
    input: { koolhydraten: 100, glucose: 15.0 },
    settings: DEFAULT_TEST_SETTINGS,
    lastBolusTime: null,
    expected: { afgerond_advies: 15.0, vlaggen: { boven_max: true } }
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculate, getTimeBlockForTime, roundBolus, TEST_CASES, DEFAULT_TEST_SETTINGS };
}
