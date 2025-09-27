// CycleTrack — Dashboard revamp: Y = cycle day, phase background bands, multiple charts
// Requires Chart.js + dayjs via CDN in your HTML.

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

  // ===== UI helpers =====
  function toast(msg){
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 1500);
  }

  // ===== Chart helper: phase background plugin (y ranges) =====
  // Draws translucent bands across y-axis windows for Menstrual, Follicular, Ovulation, Luteal
  const phaseBandsPlugin = {
    id: 'phaseBands',
    beforeDraw(chart, args, opts) {
      const {ctx, chartArea, scales} = chart;
      if (!chartArea || !scales?.y) return;
      const s = getSettings();
      const len = s.cycleLength || 28;
      const y = scales.y;
      // Define y-ranges for phases (cycle days)
      const ranges = [
        {name:'Menstrual',  from:1,                to:5,                 color:'rgba(255,77,166,0.10)'},
        {name:'Follicular', from:6,                to:Math.floor(len/2-2), color:'rgba(114,229,255,0.10)'},
        {name:'Ovulation',  from:Math.floor(len/2-2), to:Math.ceil(len/2+2), color:'rgba(155,93,229,0.10)'},
        {name:'Luteal',     from:Math.ceil(len/2+3), to:len,             color:'rgba(255,183,3,0.10)'}
      ];
      ctx.save();
      ranges.forEach(r => {
        const yTop = y.getPixelForValue(r.to);
        const yBottom = y.getPixelForValue(r.from);
        ctx.fillStyle = r.color;
        ctx.fillRect(chartArea.left, yTop, chartArea.right - chartArea.left, yBottom - yTop);
      });
      ctx.restore();
    }
  };

  // ===== Dashboard =====
  function initDashboard(){
    updateBadges();
    renderWeightByDay('chartWeightByDay'); // X = weight, Y = cycle day
    renderMetricByDay('chartEnergyByDay', 'energy', 'Energy (1–10)');
    renderMetricByDay('chartSleepByDay', 'sleep', 'Sleep (hrs)');
    renderRecentTable('recentTable');
  }

  // Weight vs cycle day (Y = day)
  function renderWeightByDay(canvasId){
    const entries = getEntries();
    // group points by cycle number
    const cycles = {};
    entries.forEach(e => {
      const c = e.cycleNumber ?? '1';
      const day = Number(e.cycleDay);
      const weight = Number(e.weight);
      if (!Number.isFinite(day) || !Number.isFinite(weight)) return;
      (cycles[c] ||= []).push({ x: day, y: val });
    });

    const datasets = Object.keys(cycles)
      .sort((a,b)=>Number(a)-Number(b))
      .map((c,i)=>({
        label: `Cycle ${c}`,
        data: cycles[c].sort((p,q)=>p.y-q.y), // sort by day
        showLine: true,
        borderColor: palette[i % palette.length],
        backgroundColor: palette[i % palette.length],
        tension: 0.35,
        borderWidth: 3,
        pointRadius: 3.5,
        parsing: false
      }));

    const el = document.getElementById(canvasId);
    if (!el) return;
    const ctx = el.getContext('2d');
    if (ctx._chart) ctx._chart.destroy();
    ctx._chart = new Chart(ctx, {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { usePointStyle: true } },
          tooltip: { callbacks: { label: (item)=>`Day ${item.parsed.y}: ${item.parsed.x} kg` } }
        },
        scales: {
          y: { min: 1, max: (getSettings().cycleLength || 28), title: { display: true, text: 'Cycle Day (↑)' } },
          x: { title: { display: true, text: 'Weight (kg) →' } }
        }
      },
      plugins: [phaseBandsPlugin]
    });
  }

  // Generic metric vs cycle day (energy, sleep, stress, etc.)
  function renderMetricByDay(canvasId, key, xLabel){
    const entries = getEntries();
    const cycles = {};
    entries.forEach(e => {
      const c = e.cycleNumber ?? '1';
      const day = Number(e.cycleDay);
      const val = Number(e[key]);
      if (!Number.isFinite(day) || !Number.isFinite(val)) return;
      (cycles[c] ||= []).push({ x: val, y: day });
    });

    const datasets = Object.keys(cycles)
      .sort((a,b)=>Number(a)-Number(b))
      .map((c,i)=>({
        label: `Cycle ${c}`,
        data: cycles[c].sort((p,q)=>p.y-q.y),
        showLine: true,
        borderColor: palette[i % palette.length],
        backgroundColor: palette[i % palette.length],
        tension: 0.35,
        borderWidth: 3,
        pointRadius: 3.5,
        parsing: false
      }));

    const el = document.getElementById(canvasId);
    if (!el) return;
    const ctx = el.getContext('2d');
    if (ctx._chart) ctx._chart.destroy();
    ctx._chart = new Chart(ctx, {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { usePointStyle: true } },
          tooltip: { callbacks: { label: (item)=>`Day ${item.parsed.y}: ${item.parsed.x}` } }
        },
        scales: {
          y: { min: 1, max: (getSettings().cycleLength || 28), title: { display: true, text: 'Cycle Day (↑)' } },
          x: { title: { display: true, text: `${xLabel} →` } }
        }
      },
      plugins: [phaseBandsPlugin]
    });
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

  // ===== Log (unchanged behaviour) =====
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

  // ===== Insights (unchanged) =====
  function initInsights(){
    updateBadges();
    initSettingsForm();
    renderHeatmap('heatmap');
    updateAverages();
    updateTipsPreview();
    renderInsightsCycleLines('insightsCycleLine', 'weight');
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

  // ===== Utility used on Log page badges =====
  function setAutoBadges({cycleDay, cycleNumber, dateStr}){
    const d = document.getElementById('autoDate');
    const cd = document.getElementById('autoCycleDay');
    const cn = document.getElementById('autoCycleNum');
    if (d)  d.textContent  = dateStr || '—';
    if (cd) cd.textContent = cycleDay ?? '—';
    if (cn) cn.textContent = cycleNumber ?? '—';
    const hDay = document.getElementById('hiddenCycleDay');
    const hNum = document.getElementById('hiddenCycleNum');
    if (hDay) hDay.value = cycleDay ?? '';
    if (hNum) hNum.value = cycleNumber ?? '';
  }
function renderInsightsCycleLines(canvasId, metricKey){
  const entries = getEntries();

  // Group entries by cycle number
  const cycles = {};
  entries.forEach(e => {
    const c = e.cycleNumber ?? '1';
    const day = Number(e.cycleDay);
    const val = Number(e[metricKey]);
    if (!Number.isFinite(day) || !Number.isFinite(val)) return;

    // 👇 Days go on X axis, metric values go on Y axis
    (cycles[c] ||= []).push({ x: day, y: val });
  });

  // Turn each cycle into a dataset (one line per cycle)
  const datasets = Object.keys(cycles)
    .sort((a,b)=>Number(a)-Number(b))
    .map((c,i)=>({
      label: `Cycle ${c}`,
      data: cycles[c].sort((p,q)=>p.x-q.x), // keep days in order
      borderColor: palette[i % palette.length],
      tension: 0.35,
      borderWidth: 3,
      pointRadius: 3,
      fill: false,
      parsing: false
    }));

  const el = document.getElementById(canvasId);
  if (!el) return;
  const ctx = el.getContext('2d');
  if (ctx._chart) ctx._chart.destroy();

  ctx._chart = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { usePointStyle: true } },
        tooltip: {
          callbacks: {
            title: (items)=> items.length ? `Day ${items[0].parsed.x}` : '',
            label: (it)=> `${metricKey}: ${it.parsed.y}`
          }
        }
      },
      scales: {
        x: { min: 1, max: (getSettings().cycleLength || 28), title: { display: true, text: 'Cycle Day →' } },
        y: { title: { display: true, text: metricKey } }
      }
    }
  });
}

  // ===== Public API =====
  return { initDashboard, initLog, initInsights };
})();
