/* ═══════════════════════════════════════════════════
   CGPA Planner — script.js
   Connects to FastAPI backend at http://localhost:8000
═══════════════════════════════════════════════════ */

const API = 'http://localhost:8000/api/v1';

// ── State ────────────────────────────────────────────
let gradingSystem = null;
let selectedPattern = 'recommended';
let inputMode = 'summary'; // 'summary' | 'history' | 'fresh'

// ── On load ──────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  checkAPIStatus();
  loadPresets();
});

// ── API Status ───────────────────────────────────────
async function checkAPIStatus() {
  const dot  = document.querySelector('.status-dot');
  const text = document.querySelector('.status-text');
  try {
    const r = await fetch(`${API}/grading-presets`);
    if (r.ok) {
      dot.className  = 'status-dot online';
      text.textContent = 'api connected';
    } else throw new Error();
  } catch {
    dot.className  = 'status-dot offline';
    text.textContent = 'api offline';
  }
}

// ── Presets ──────────────────────────────────────────
async function loadPresets() {
  try {
    const r    = await fetch(`${API}/grading-presets`);
    const data = await r.json();
    const grid = document.getElementById('preset-grid');
    grid.innerHTML = '';

    data.presets.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'preset-card' + (i === 0 ? ' active' : '');
      card.innerHTML = `
        <div class="preset-name">${p.name}</div>
        <div class="preset-scale">0 – ${p.scale_max} · pass ${p.passing_points}</div>`;
      card.addEventListener('click', () => {
        document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        applyPreset(p);
      });
      grid.appendChild(card);
      if (i === 0) applyPreset(p);
    });
  } catch (e) {
    showToast('Could not load presets — is the backend running?');
  }
}

function applyPreset(p) {
  document.getElementById('scale-max').value       = p.scale_max;
  document.getElementById('passing-pts').value     = p.passing_points;
  document.getElementById('decimal-places').value  = p.decimal_places;
  renderGradeRows(p.grade_map);
}

// ── Grade map rows ────────────────────────────────────
function renderGradeRows(gradeMap) {
  const container = document.getElementById('grade-rows');
  container.innerHTML = '';
  gradeMap.forEach(g => addGradeRow(g));
}

function addGradeRow(g = {}) {
  const row = document.createElement('div');
  row.className = 'grade-row';
  row.innerHTML = `
    <input type="text"   class="grade-grade"   placeholder="A+"   value="${g.grade  ?? ''}" />
    <input type="number" class="grade-points"  placeholder="9.0"  value="${g.points ?? ''}" step="0.1" />
    <input type="number" class="grade-minpct"  placeholder="80"   value="${g.min_percent ?? ''}" step="1" />
    <button class="btn-del" onclick="this.closest('.grade-row').remove()" title="Remove">×</button>`;
  document.getElementById('grade-rows').appendChild(row);
}

// ── Build grading system from form ───────────────────
function buildGradingSystem() {
  const scaleMax      = parseFloat(document.getElementById('scale-max').value);
  const passingPts    = parseFloat(document.getElementById('passing-pts').value);
  const decimalPlaces = parseInt(document.getElementById('decimal-places').value) || 2;

  if (isNaN(scaleMax) || isNaN(passingPts)) {
    showToast('Please fill in scale maximum and passing points.');
    return null;
  }

  const rows = document.querySelectorAll('#grade-rows .grade-row');
  if (rows.length === 0) {
    showToast('Add at least one grade to the grade map.');
    return null;
  }

  const gradeMap = [];
  for (const row of rows) {
    const grade  = row.querySelector('.grade-grade').value.trim();
    const points = parseFloat(row.querySelector('.grade-points').value);
    const minPct = parseFloat(row.querySelector('.grade-minpct').value);
    if (!grade || isNaN(points)) {
      showToast('Every grade row needs a label and point value.');
      return null;
    }
    gradeMap.push({ grade, points, min_percent: isNaN(minPct) ? null : minPct });
  }

  // Validate max grade matches scale_max
  const maxPoints = Math.max(...gradeMap.map(g => g.points));
  if (maxPoints !== scaleMax) {
    showToast(`Highest grade point (${maxPoints}) must equal scale maximum (${scaleMax}).`);
    return null;
  }

  return { scale_max: scaleMax, passing_points: passingPts, decimal_places: decimalPlaces,
           credit_range: [15, 30], grade_map: gradeMap };
}

// ── Step navigation ───────────────────────────────────
function showStep(id) {
  document.getElementById(id).classList.remove('hidden');
  document.getElementById(id).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function goToStep2() {
  const gs = buildGradingSystem();
  if (!gs) return;
  gradingSystem = gs;
  showStep('step-2');
}

function goToStep3() {
  showStep('step-3');
}

// ── Mode switching ────────────────────────────────────
function switchMode(mode) {
  inputMode = mode;
  ['summary', 'history', 'fresh'].forEach(m => {
    document.getElementById(`mode-${m}`).classList.toggle('hidden', m !== mode);
    document.getElementById(`toggle-${m}`).classList.toggle('active', m === mode);
  });
}

// ── Semester history rows ─────────────────────────────
function addHistoryRow() {
  const container = document.getElementById('semester-history-rows');
  const idx = container.querySelectorAll('.history-row').length + 1;
  const row = document.createElement('div');
  row.className = 'history-row';
  row.innerHTML = `
    <div class="field">
      <label>Semester</label>
      <input type="number" class="h-sem-num" value="${idx}" min="1" />
    </div>
    <div class="field">
      <label>SGPA</label>
      <input type="number" class="h-sgpa" placeholder="7.5" step="0.01" />
    </div>
    <div class="field">
      <label>Credits</label>
      <input type="number" class="h-credits" placeholder="22" />
    </div>
    <button class="btn-del" style="margin-bottom:2px" onclick="this.closest('.history-row').remove()" title="Remove">×</button>`;
  container.appendChild(row);
}

// ── Effort pattern ────────────────────────────────────
function selectPattern(card) {
  document.querySelectorAll('.pattern-card').forEach(c => c.classList.remove('active'));
  card.classList.add('active');
  selectedPattern = card.dataset.pattern;
}

// ── Build academic state ──────────────────────────────
function buildAcademicState() {
  if (inputMode === 'fresh') return {};

  if (inputMode === 'summary') {
    const cgpa    = parseFloat(document.getElementById('current-cgpa').value);
    const credits = parseInt(document.getElementById('total-credits').value);
    if (isNaN(cgpa) || isNaN(credits)) {
      showToast('Please enter your current CGPA and total credits earned.');
      return null;
    }
    return { current_cgpa: cgpa, total_credits_earned: credits };
  }

  // history mode
  const rows = document.querySelectorAll('#semester-history-rows .history-row');
  if (rows.length === 0) {
    showToast('Add at least one semester record, or switch to a different mode.');
    return null;
  }
  const history = [];
  for (const row of rows) {
    const num     = parseInt(row.querySelector('.h-sem-num').value);
    const sgpa    = parseFloat(row.querySelector('.h-sgpa').value);
    const credits = parseInt(row.querySelector('.h-credits').value);
    if (isNaN(num) || isNaN(sgpa) || isNaN(credits)) {
      showToast('All semester fields are required.');
      return null;
    }
    history.push({ semester_number: num, sgpa, credits });
  }
  return { semester_history: history };
}

// ── Main calculate ────────────────────────────────────
async function calculate() {
  const btn = document.getElementById('calculate-btn');
  const academicState = buildAcademicState();
  if (!academicState) return;

  const targetCGPA = parseFloat(document.getElementById('target-cgpa').value);
  const remSems    = parseInt(document.getElementById('remaining-sems').value);
  const buffer     = parseFloat(document.getElementById('buffer').value) || 0;

  if (isNaN(targetCGPA) || isNaN(remSems)) {
    showToast('Please fill in target CGPA and remaining semesters.');
    return;
  }

  const creditsRaw = document.getElementById('credits-input').value;
  const credits    = creditsRaw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
  if (credits.length !== remSems) {
    showToast(`Enter exactly ${remSems} credit value(s) separated by commas.`);
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="display:inline-block;width:16px;height:16px;border:2px solid rgba(0,0,0,0.2);border-top-color:#0a0a0a;border-radius:50%;animation:spin 0.7s linear infinite"></span> Calculating…';

  const payload = {
    grading_system: gradingSystem,
    academic_state: academicState,
    target_cgpa:    targetCGPA,
    remaining_semesters: remSems,
    credits_per_remaining_semester: credits,
    effort_pattern: selectedPattern,
    semester_constraints: [],
    desired_buffer: buffer,
  };

  try {
    const r    = await fetch(`${API}/calculate-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json();

    if (!r.ok) {
      const msg = data.detail?.[0]?.msg || data.detail || 'Unknown error';
      showToast(`API error: ${msg}`);
      return;
    }

    renderResults(data);
    showStep('step-results');
  } catch (e) {
    showToast('Could not reach backend. Make sure uvicorn is running on port 8000.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Calculate plan <span>→</span>';
  }
}

// ── Render results ────────────────────────────────────
function renderResults(data) {
  const { summary, feasibility, quality_points_breakdown: qp, plan, trajectory, recommendations } = data;
  const dp = gradingSystem.decimal_places;

  const riskClass = {
    none: 'badge-none', low: 'badge-low', moderate: 'badge-moderate',
    high: 'badge-high', extreme: 'badge-extreme', impossible: 'badge-impossible',
  }[feasibility.risk_level] || 'badge-moderate';

  const html = `
    <!-- Header -->
    <div class="results-header">
      <div class="results-eyebrow">your plan</div>
      <div class="results-headline">
        ${feasibility.already_achieved
          ? 'Already there 🎉'
          : !feasibility.feasible
            ? 'Target out of reach'
            : `Target: <span style="color:var(--accent)">${summary.target_cgpa}</span>`
        }
      </div>
      <div class="results-sub">
        ${feasibility.message}
      </div>
    </div>

    <!-- Feasibility badge -->
    <div class="feasibility-badge ${riskClass}">
      <span>◉</span> ${feasibility.risk_level.replace('_', ' ')} risk
    </div>

    <!-- Summary metrics -->
    <div class="metrics-row">
      <div class="metric-card">
        <div class="metric-label">Current CGPA</div>
        <div class="metric-value">${summary.current_cgpa}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Target CGPA</div>
        <div class="metric-value accent">${summary.target_cgpa}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Max achievable</div>
        <div class="metric-value">${summary.max_achievable_cgpa}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Semesters left</div>
        <div class="metric-value">${summary.remaining_semesters}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Future credits</div>
        <div class="metric-value">${summary.future_credits}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Trend</div>
        <div class="metric-value" style="font-size:1rem;padding-top:4px">${trendEmoji(summary.performance_trend)} ${summary.performance_trend}</div>
      </div>
    </div>

    <!-- Quality points breakdown -->
    <div class="qp-box">
      <div class="qp-box-title">Quality points breakdown</div>
      <div class="qp-explanation">${qp.explanation}</div>
    </div>

    <!-- Semester plan -->
    ${feasibility.feasible && !feasibility.already_achieved ? `
    <div class="plan-section">
      <div class="plan-section-title">Semester-by-semester plan</div>
      <div class="plan-table">
        <div class="plan-table-head">
          <span>Semester</span>
          <span>Target SGPA</span>
          <span>Grade</span>
          <span>Credits</span>
          <span>CGPA after</span>
        </div>
        ${plan.map(row => `
          <div class="plan-row">
            <span class="sem-num">S${row.semester}${row.constraint_label ? `<br/><span class="constraint-tag">${row.constraint_label}</span>` : ''}</span>
            <span class="sgpa-val">${row.target_sgpa.toFixed(dp)}</span>
            <span><span class="grade-pill">${row.nearest_grade}</span></span>
            <span style="font-family:var(--font-mono);font-size:13px;color:var(--text-2)">${row.credits}</span>
            <span class="cgpa-val">${row.projected_cgpa_after}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- CGPA Trajectory chart -->
    <div class="chart-section">
      <div class="section-title">CGPA trajectory</div>
      <div class="chart-wrap">
        <div class="chart-canvas-wrap" id="traj-chart"></div>
      </div>
    </div>
    ` : ''}

    <!-- Recommendations -->
    <div class="recs-section">
      <div class="section-title">Recommendations</div>
      ${recommendations.map(r => `
        <div class="rec-item">
          <span class="rec-icon">→</span>
          <span class="rec-text">${r}</span>
        </div>
      `).join('')}
    </div>

    <!-- Recalculate -->
    <div class="actions-row">
      <button class="btn-ghost" onclick="recalculate()">← Adjust parameters</button>
    </div>
  `;

  document.getElementById('results-container').innerHTML = html;

  // Draw inline SVG chart
  if (feasibility.feasible && !feasibility.already_achieved && trajectory.length > 0) {
    drawTrajectoryChart(trajectory, summary.target_cgpa, summary.current_cgpa);
  }
}

// ── SVG Trajectory chart ──────────────────────────────
function drawTrajectoryChart(trajectory, targetCGPA, startCGPA) {
  const wrap  = document.getElementById('traj-chart');
  if (!wrap) return;
  const W = wrap.offsetWidth || 680;
  const H = 200;
  const pad = { top: 16, right: 20, bottom: 40, left: 44 };

  const allVals = trajectory.map(t => t.projected_cgpa).concat([startCGPA, targetCGPA]);
  const minV = Math.max(0, Math.min(...allVals) - 0.3);
  const maxV = Math.min(gradingSystem.scale_max, Math.max(...allVals) + 0.3);

  const xScale = i => pad.left + (i / (trajectory.length - 1 || 1)) * (W - pad.left - pad.right);
  const yScale = v => pad.top + (1 - (v - minV) / (maxV - minV)) * (H - pad.top - pad.bottom);

  // Points
  const pts = trajectory.map((t, i) => `${xScale(i)},${yScale(t.projected_cgpa)}`).join(' ');
  const first = trajectory[0];
  const last  = trajectory[trajectory.length - 1];

  // Target line y
  const ty = yScale(targetCGPA);

  // Y axis ticks
  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const v = minV + (maxV - minV) * (i / tickCount);
    return { v: v.toFixed(2), y: yScale(v) };
  });

  const svg = `
  <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
    <defs>
      <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#c8f060" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="#c8f060" stop-opacity="0"/>
      </linearGradient>
    </defs>

    <!-- Target line -->
    <line x1="${pad.left}" y1="${ty}" x2="${W - pad.right}" y2="${ty}"
          stroke="#c8f060" stroke-width="1" stroke-dasharray="5,4" opacity="0.4"/>
    <text x="${W - pad.right + 4}" y="${ty + 4}" fill="#c8f060" font-size="10"
          font-family="DM Mono,monospace" opacity="0.6">target</text>

    <!-- Y axis ticks -->
    ${ticks.map(t => `
      <line x1="${pad.left - 4}" y1="${t.y}" x2="${pad.left}" y2="${t.y}"
            stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
      <text x="${pad.left - 8}" y="${t.y + 4}" fill="#555550" font-size="9"
            font-family="DM Mono,monospace" text-anchor="end">${t.v}</text>
      <line x1="${pad.left}" y1="${t.y}" x2="${W - pad.right}" y2="${t.y}"
            stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
    `).join('')}

    <!-- Area fill -->
    <polygon points="${pad.left},${H - pad.bottom} ${pts} ${W - pad.right - (trajectory.length > 1 ? 0 : 0)},${H - pad.bottom}"
             fill="url(#lineGrad)"/>

    <!-- Line -->
    <polyline points="${pts}" fill="none" stroke="#c8f060" stroke-width="2" stroke-linejoin="round"/>

    <!-- Dots + x labels -->
    ${trajectory.map((t, i) => `
      <circle cx="${xScale(i)}" cy="${yScale(t.projected_cgpa)}" r="3.5"
              fill="#0a0a0a" stroke="#c8f060" stroke-width="1.5"/>
      <text x="${xScale(i)}" y="${H - pad.bottom + 14}" fill="#555550" font-size="9"
            font-family="DM Mono,monospace" text-anchor="middle">S${t.semester}</text>
    `).join('')}
  </svg>`;

  wrap.innerHTML = svg;
}

// ── Helpers ───────────────────────────────────────────
function trendEmoji(t) {
  return { improving: '↑', declining: '↓', stable: '→', volatile: '⟳' }[t] || '';
}

function recalculate() {
  document.getElementById('step-results').classList.add('hidden');
  document.getElementById('step-3').scrollIntoView({ behavior: 'smooth' });
}

// ── Toast ─────────────────────────────────────────────
function showToast(msg) {
  document.getElementById('toast-msg').textContent = msg;
  document.getElementById('toast').classList.remove('hidden');
  setTimeout(hideToast, 5000);
}

function hideToast() {
  document.getElementById('toast').classList.add('hidden');
}
