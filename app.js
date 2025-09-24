// CycleTrack — full app.js (auto cycle/day, overlay chart, heatmap, suggestions)
// Requires Chart.js and dayjs via CDN in your HTML.
// Data model: entries[], settings{periodStart, cycleLength} in localStorage.

const App = (() => {
  // ===== Config & constants =====
  const STORAGE_KEY = 'ct_entries_v1';
  const SETTINGS_KEY = 'ct_settings_v1';
  const palette = ['#ff4da6','#72e5ff','#2bdc90','#ffb703','#9b5de5','#ef476f','#3a86ff','#fb5607'];
  const phases = ['Menstrual','Follicular','Ovulation','Luteal'];
  const symptomList = [
    'Cramps','Bloating','Tender Breasts','Headache','Acne',
    'Back Pain','Food Cravings','Low Libido','High Libido'
  ];

  // ===== Storage helpers =====
  const getEntries  = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  const setEntries  = (arr) => localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  const getSettings = () => JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{"cycleLength":28}');
  const setSettings = (s) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));

  // ===== Phases & badges =====
  function phaseForDay(day, len=28){
    if (day <= 5) return 'Menstrual';
    const mid = len/2;
    if (day <= (mid - 2)) return 'Follicular';
    if (day <= (mid + 2)) return 'Ovulation';
    return 'Luteal';
  }

  function dayAndCycleForDate(dateStr, settings){
    const len = settings?.cycleLength || 28;
    if (!settings?.periodStart || !dateStr) return { cycleDay: null, cycleNumber: null };
    const diff = dayjs(dateStr).diff(dayjs(settings.periodStart), 'day');
    if (diff < 0) return { cycleDay: null, cycleNumber: null };
    const cycleNumber = Math.floor(diff / len) + 1;
    const cycleDay = (diff % len) + 1;
    return { cycleDay, cycleNumber };
  }

  function updateBadges(){
    const s = getSettings();
    const len = s.cycleLength || 28;
    let badge = '—';
    if (s.periodStart) {
      const diff = dayjs().diff(dayjs(s.periodStart), 'day');
      const dayInCycle = (diff % len) + 1;
      badge = `${phaseForDay(dayInCycle, len)} · Day ${dayInCycle}`;
    }
    const pb = document.getElementById('phaseBadge');
    const cl = document.getElementById('cycleLenBadge');
    if (pb) pb.textContent = `Phase: ${badge}`;
    if (cl) cl.textContent = String(len);
  }

  function setAutoBadges({cycleDay, cycleNumber, dateStr}){
    const d = document.getElementById('autoDate');
    const cd = document.getElementById('autoCycleDay');
    const cn = document.getElementById('autoCycleNum');
    if (d)  d.textContent  = dateStr || '—';
    if (cd) cd.textContent = cycleDay ?? '—';
    if (cn) cn.textContent = cycleNumber ?? '—';

    // Sync hidden inputs for saving
    const hDay = document.getElementById('hiddenCycleDay');
    const hNum = document.getElementById('hiddenCycleNum');
    if (hDay) hDay.value = cycleDay ?? '';
    if (hNum) hNum.value = cycleNumber ?? '';
  }

  // ===== UI helpers =====
  function toast(msg){
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 1500);
  }

  // ===== Dashboard =====
  function initDashboard(){
    updateBadges();
    renderTodayTip();
    renderWeightOverlay('weightChart');
    renderRecentTable('recentTable');
  }

  function renderRecentTable(tableId){
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody) return;
    const rows = getEntries().slice(-10).reverse();
    tbody.innerHTML = rows.map(e => {
      const cd = `${e.cycleNumber ?? '—'}·${e.cycleDay ?? '—'}`;
      return `<tr>
        <td>${e.date || ''}</td>
        <td>${cd}</td>
        <td>${e.weight ?? ''}</td>
        <td>${e.energy ?? ''}</td>
        <td>${e.mood ?? ''}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="5" class="subtitle">No entries yet. Add one on the Log page.</td></tr>`;
  }

  function renderTodayTip(){
    const s = getSettings();
    const entries = getEntries();
    const latest = entries[entries.length-1];

    let title = 'Daily suggestion';
    let body = 'Log an entry to get tailored tips.';

    if (s.periodStart && s.cycleLength) {
      const diff = dayjs().diff(dayjs(s.periodStart),'day');
      const dayInCycle = (diff % s.cycleLength) + 1;
      const ph = phaseForDay(dayInCycle, s.cycleLength);

      const energy = latest?.energy ? Number(latest.energy) : null;
      const stress = latest?.stress ? Number(latest.stress) : null;
      const water  = latest?.water  ? Number(latest.water)  : null;

      const tips = {
        Menstrual: {
          training: energy && energy < 5 ? 'Gentle: walk, yoga, mobility' : 'Light: walking + core activation',
          nutrition: 'Iron-rich meals (spinach, lentils, beef). Warm soups. Magnesium for cramps.',
          life: stress && stress > 6 ? 'Protect time. Reduce meetings. Early night.' : 'Lower intensity day. Heat pack + stretching.'
        },
        Follicular: {
          training: 'Strength focus: progressive overload.',
          nutrition: 'Higher protein; colourful veg; complex carbs around training.',
          life: 'Batch deep work; you’re primed for focus and learning.'
        },
        Ovulation: {
          training: 'Optional intensity: intervals or strong lifts if feeling good.',
          nutrition: 'Hydrate well; add electrolytes if hot training.',
          life: 'Great window for presentations & social plans.'
        },
        Luteal: {
          training: 'Moderate steady work; deload if recovery poor.',
          nutrition: 'Prioritise fibre & magnesium; stable meals to manage cravings.',
          life: 'Buffer your calendar; add recovery habits & daylight walks.'
        }
      };

      const t = tips[ph];
      title = `${ph} · Day ${dayInCycle}`;
      body  = `${t.training} • ${t.nutrition} • ${t.life}`;
      if (water && water < 1.5) body += ' • Top up fluids today';
    }

    const elT = document.getElementById('todayTipTitle');
    const elB = document.getElementById('todayTipBody');
    if (elT) elT.textContent = title;
    if (elB) elB.textContent = body;
  }

  function renderWeightOverlay(canvasId){
    const entries = getEntries();
    const cycles = {};
    entries.forEach(e => {
      const c = e.cycleNumber ?? '1';
      (cycles[c] ||= []).push({ x: Number(e.cycleDay), y: Number(e.weight) });
    });

    const datasets = Object.keys(cycles)
      .sort((a,b)=>Number(a)-Number(b))
      .map((c,i) => {
        const pts = cycles[c]
          .filter(p => !Number.isNaN(p.x) && !Number.isNaN(p.y))
          .sort((a,b)=>a.x-b.x);
        return {
          label: `Cycle ${c}`,
          data: pts,
          borderColor: palette[i % palette.length],
          backgroundColor: palette[i % palette.length],
          tension: .35,
          borderWidth: 3,
          pointRadius: 3.5,
          fill: false,
          parsing: false
        };
      });

    const ctxEl = document.getElementById(canvasId);
    if (!ctxEl) return;
    const ctx = ctxEl.getContext('2d');
    if (ctx._chart) ctx._chart.destroy();
    ctx._chart = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        plugins: { legend: { labels: { usePointStyle: true } } },
        scales: {
          x: { type: 'linear', min: 1, max: 40, title: { display: true, text: 'Cycle Day' } },
          y: { title: { display: true, text: 'Weight (kg)' } }
        }
      }
    });
  }

  // ===== Log =====
  function initLog(){
    updateBadges();

    const form = document.getElementById('logForm');
    const dateInput = document.getElementById('dateInput');
    const settings = getSettings();

    // Default to today
    const today = dayjs().format('YYYY-MM-DD');
    if (dateInput) dateInput.value = today;

    // Compute inferred values for today and set badges/hidden
    const initial = dayAndCycleForDate(today, settings);
    setAutoBadges({ ...initial, dateStr: today });

    // Recompute when date changes
    if (dateInput) {
      dateInput.addEventListener('change', () => {
        const d = dateInput.value;
        const inf = dayAndCycleForDate(d, getSettings());
        setAutoBadges({ ...inf, dateStr: d });
      });
    }

    // Save entry
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);

        // Multi-select symptoms to array
        const symptomsSel = form.querySelector('select[name="symptoms"]');
        const symptoms = symptomsSel
          ? Array.from(symptomsSel.selectedOptions).map(o => o.value)
          : [];

        const entry = Object.fromEntries(fd.entries());
        entry.symptoms = symptoms;

        // Coerce numbers
        ['weight','energy','water','stress','sleep','cycleNumber','cycleDay'].forEach(k => {
          if (entry[k] !== undefined && entry[k] !== '') entry[k] = Number(entry[k]);
        });

        setEntries([ ...getEntries(), entry ]);
        form.reset();

        // Reset date to today & recompute badges
        if (dateInput) dateInput.value = today;
        const postInf = dayAndCycleForDate(today, getSettings());
        setAutoBadges({ ...postInf, dateStr: today });

        toast('Saved!');
      });
    }
  }

  // ===== Insights =====
  function initInsights(){
    updateBadges();
    initSettingsForm();
    renderHeatmap('heatmap');
    updateAverages();
    updateTipsPreview();
  }

  function initSettingsForm(){
    const s = getSettings();
    const form = document.getElementById('settingsForm');
    if (!form) return;
    if (s.periodStart) form.periodStart.value = s.periodStart;
    if (s.cycleLength) form.cycleLength.value = s.cycleLength;

    form.addEventListener('submit',(e)=>{
      e.preventDefault();
      const fd = new FormData(form);
      const cfg = Object.fromEntries(fd.entries());
      cfg.cycleLength = Number(cfg.cycleLength);
      setSettings(cfg);
      updateBadges();
      updatePhasePreview();
      renderHeatmap('heatmap');
      updateAverages();
      updateTipsPreview();
      toast('Settings saved');
    });

    updatePhasePreview();
  }

  function updatePhasePreview(){
    const s = getSettings();
    const len = s.cycleLength || 28;
    const text = `Menstrual: 1–5 · Follicular: 6–${Math.floor(len/2 - 2)} · Ovulation: ~${Math.floor(len/2 - 2)}–${Math.ceil(len/2 + 2)} · Luteal: ${Math.ceil(len/2 + 3)}–${len}`;
    const el = document.getElementById('phasePreview');
    if (el) el.textContent = text;
  }

  function updateAverages(){
    const entries = getEntries().slice(-28);
    const weights = entries.map(e => Number(e.weight)).filter(n => !Number.isNaN(n));
    const energies = entries.map(e => Number(e.energy)).filter(n => !Number.isNaN(n));
    const avg = a => a.length ? (a.reduce((x,y)=>x+y,0) / a.length).toFixed(1) : '—';
    const w = document.getElementById('avgWeight'); if (w) w.textContent = avg(weights);
    const en = document.getElementById('avgEnergy'); if (en) en.textContent = avg(energies);
  }

  function updateTipsPreview(){
    const s = getSettings();
    if (!s.periodStart) return;
    const diff = dayjs().diff(dayjs(s.periodStart),'day');
    const dayInCycle = (diff % (s.cycleLength || 28)) + 1;
    const ph = phaseForDay(dayInCycle, s.cycleLength || 28);
    const map = {
      Menstrual: ['Gentle movement','Iron-rich meals','Early night'],
      Follicular: ['Strength focus','Lean protein + carbs','Deep work blocks'],
      Ovulation: ['Intervals optional','Hydrate + electrolytes','Presentations/social'],
      Luteal: ['Steady effort','Fibre + magnesium','Calendar buffer']
    };
    const t = map[ph]; if (!t) return;
    const [a,b,c] = t;
    const A = document.getElementById('tipTraining'); if (A) A.textContent = a;
    const B = document.getElementById('tipFood'); if (B) B.textContent = b;
    const C = document.getElementById('tipLife'); if (C) C.textContent = c;
  }

  function renderHeatmap(canvasId){
    const s = getSettings();
    const entries = getEntries();

    // Count symptoms by phase
    const counts = Object.fromEntries(
      phases.map(p => [p, Object.fromEntries(symptomList.map(sym => [sym, 0]))])
    );

    entries.forEach(e => {
      const d = Number(e.cycleDay);
      if (Number.isNaN(d)) return;
      const ph = phaseForDay(d, s.cycleLength || 28);
      (e.symptoms || []).forEach(sym => {
        if (counts[ph][sym] !== undefined) counts[ph][sym]++;
      });
    });

    const labels = phases;
    const datasets = symptomList.map((sym, i) => ({
      label: sym,
      data: labels.map(p => counts[p][sym]),
      backgroundColor: palette[(i + 2) % palette.length],
      borderWidth: 0
    }));

    const ctxEl = document.getElementById(canvasId);
    if (!ctxEl) return;
    const ctx = ctxEl.getContext('2d');
    if (ctx._chart) ctx._chart.destroy();
    ctx._chart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        indexAxis: 'y',
        plugins: { legend: { position: 'bottom' } },
        scales: { x: { stacked: true }, y: { stacked: true } }
      }
    });
  }

  // ===== Public API =====
  return { initDashboard, initLog, initInsights };
})();
