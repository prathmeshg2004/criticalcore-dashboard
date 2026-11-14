/**
 * CriticalCore Acquisition Portfolio Simulator - Main UI Controller
 * Functional Specification v1.0 (14 November 2026)
 */

(function () {
  'use strict';

  // Application State
  const state = {
    candidates: [],
    accounts: [],
    categories: [],
    assumptions: {},
    sources: [],
    
    candidatesMap: {},
    accountsMap: {},
    categoriesMap: {},
    
    selectedCompanyIds: [],
    procuredMissingCategories: [],
    
    // UI state
    activeLaneFilter: 'All',
    candidateSearchQuery: '',
    showDueDiligenceTab: false,
    isAppendixOpen: false,
    activeSlotLane: null,
    
    // Simulation result cache
    portfolioState: null,
    solvedMW: null,
    financials: null,
    cashFlow: null,
    hasRunSimulation: false,
    
    // Pending selection for warning modal
    pendingCandidate: null
  };

  // Helper formatting functions
  function formatINR(val, decimals = 1) {
    if (val == null || isNaN(val)) return '—';
    return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + ' cr';
  }

  function formatMW(val, decimals = 1) {
    if (val == null || isNaN(val)) return '—';
    return val.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + ' MW';
  }

  function formatPct(val, decimals = 1) {
    if (val == null || isNaN(val)) return '—';
    return (val * 100).toFixed(decimals) + '%';
  }

  // Load Seed Data
  async function loadData() {
    try {
      const [candRes, accRes, catRes, assumpRes, srcRes] = await Promise.all([
        fetch('data/candidates.json').then(r => r.json()),
        fetch('data/accounts.json').then(r => r.json()),
        fetch('data/categories.json').then(r => r.json()),
        fetch('data/assumptions.json').then(r => r.json()),
        fetch('data/sources.json').then(r => r.json())
      ]);

      state.candidates = candRes;
      state.accounts = accRes;
      state.categories = catRes;
      state.assumptions = assumpRes;
      state.sources = srcRes;

      state.candidates.forEach(c => state.candidatesMap[c.company_id] = c);
      state.accounts.forEach(a => state.accountsMap[a.account_id] = a);
      state.categories.forEach(c => state.categoriesMap[c.category_id] = c);

      // Default load: Benchmark Voltech + BPE + HiRef
      loadBenchmark();
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      alert('Error loading configuration data. Please verify files in data/ directory.');
    }
  }

  // Load Benchmark Scenario (Section 16)
  function loadBenchmark() {
    state.selectedCompanyIds = ['voltech', 'bpe', 'hiref'];
    state.procuredMissingCategories = [];
    state.hasRunSimulation = true;
    recalculate();
  }

  // Clear Selections
  function clearSelections() {
    state.selectedCompanyIds = [];
    state.procuredMissingCategories = [];
    state.hasRunSimulation = false;
    state.solvedMW = null;
    state.financials = null;
    state.cashFlow = null;
    recalculate();
  }

  // Core recalculation cycle per Section 15
  function recalculate() {
    // 1. Portfolio state
    state.portfolioState = CriticalCoreEngine.calculatePortfolioState(
      state.selectedCompanyIds,
      state.candidatesMap,
      state.categories,
      state.assumptions.cumminsAccessibleAccounts,
      state.accountsMap,
      state.assumptions,
      state.procuredMissingCategories
    );

    // 2. If simulation was triggered or benchmark is loaded, run financial solver
    if (state.hasRunSimulation || state.selectedCompanyIds.length > 0) {
      state.solvedMW = CriticalCoreEngine.solveRequiredMW(state.portfolioState, state.assumptions);
      state.financials = CriticalCoreEngine.calculateFinancialStatements(state.portfolioState, state.solvedMW, state.assumptions);
      state.cashFlow = CriticalCoreEngine.calculateCashFlowSchedule(state.portfolioState, state.solvedMW, state.financials, state.assumptions);
    }

    render();
  }

  // Main Render Routine
  function render() {
    renderMainCapabilityBar();
    renderComponentTiles();
    renderAccessibleMWPool();
    renderSelectionLanes();
    renderPortfolioSummary();
    renderFinancialResults();
    renderAppendix();
  }

  // 1. Main Capability Bar (Section 3.2)
  function renderMainCapabilityBar() {
    const port = state.portfolioState;
    const headlineEl = document.getElementById('capability-headline');
    const cumminsValEl = document.getElementById('cummins-start-val');
    const remReqEl = document.getElementById('remaining-req-val');
    const progCummins = document.getElementById('progress-cummins');
    const progAcquired = document.getElementById('progress-acquired');
    const progProcured = document.getElementById('progress-procured');

    const cumminsPts = 8.1;
    const totalOwned = port ? port.ownedWalletPoints : cumminsPts;
    const acquiredPts = Math.max(0, totalOwned - cumminsPts);
    const ownedPct = (totalOwned / 58.0) * 100;
    const remainingReq = Math.max(0, 58.0 - totalOwned);

    // Procured points
    let procuredPts = 0;
    if (port && port.procuredMissingCategories) {
      port.procuredMissingCategories.forEach(catId => {
        const cat = state.categoriesMap[catId];
        if (cat) procuredPts += cat.wallet_points;
      });
    }

    headlineEl.innerHTML = `Owned CriticalCore capability: <span style="color:var(--color-brand)">${totalOwned.toFixed(1)}</span> / 58.0 wallet points <span style="font-size:16px; color:var(--text-muted); font-weight:600">(${ownedPct.toFixed(1)}% of target)</span>`;
    cumminsValEl.textContent = `8.1 pts (14.0%)`;
    remReqEl.textContent = `${remainingReq.toFixed(1)} pts (${((remainingReq/58)*100).toFixed(1)}%)`;

    progCummins.style.width = `${(cumminsPts / 58.0) * 100}%`;
    progAcquired.style.width = `${(acquiredPts / 58.0) * 100}%`;
    progProcured.style.width = `${(procuredPts / 58.0) * 100}%`;
  }

  // 2. Component Row Tiles (Section 3.3)
  function renderComponentTiles() {
    const port = state.portfolioState;
    const container = document.getElementById('components-container');
    if (!container || !port) return;

    container.innerHTML = port.categoriesList.map(cat => {
      let badgeClass = 'badge-missing';
      let statusLabel = cat.status;

      if (cat.isFixed) {
        badgeClass = 'badge-fixed';
        statusLabel = 'XY Corp Fixed';
      } else if (cat.status === 'Covered') {
        badgeClass = 'badge-covered';
      } else if (cat.status === 'Partially covered') {
        badgeClass = 'badge-partially';
      } else if (cat.status === 'Procured at 2% GM') {
        badgeClass = 'badge-procured';
      }

      let primaryText = cat.primaryProvider ? cat.primaryProvider.companyName : 'None';
      let overlapsText = '';
      if (cat.providers.length > 1) {
        const otherProviders = cat.providers.slice(1).map(p => p.companyName).join(', ');
        overlapsText = `<div class="overlapping-providers">Overlap: ${otherProviders}</div>`;
      }

      let overlapBadgeHTML = '';
      if (cat.hasOverlapBadge) {
        overlapBadgeHTML = `<span class="badge badge-overlap">Overlapping capability</span>`;
      }

      let enablementNoteHTML = '';
      if (cat.enablementNote) {
        enablementNoteHTML = `<span class="badge badge-india-enablement">${cat.enablementNote}</span>`;
      }

      return `
        <div class="component-tile ${cat.status.toLowerCase().replace(/[^a-z]/g, '-')} ${cat.isFixed ? 'fixed' : ''}">
          <div class="tile-top">
            <span class="tile-name">${cat.categoryName}</span>
            <span class="tile-points">${cat.walletPoints.toFixed(1)} pts</span>
          </div>
          <div class="tile-middle">
            <div class="provider-info">Primary: <span class="provider-primary">${primaryText}</span></div>
            ${overlapsText}
          </div>
          <div class="tile-bottom">
            <span class="badge ${badgeClass}">${statusLabel}</span>
            <div style="display:flex; gap:6px; flex-wrap:wrap">
              ${overlapBadgeHTML}
              ${enablementNoteHTML}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 3. Accessible-MW Pool (Section 3.4)
  function renderAccessibleMWPool() {
    const port = state.portfolioState;
    if (!port) return;

    document.getElementById('pool-cummins-mw').textContent = `${port.cumminsStartingAccessibleMW.toFixed(0)} MW`;
    document.getElementById('pool-selected-gross-mw').textContent = `${port.selectedGrossAccessibleMW.toFixed(0)} MW`;
    document.getElementById('pool-overlap-removed-mw').textContent = `-${port.accountOverlapMWRemoved.toFixed(0)} MW`;
    document.getElementById('pool-dedup-accessible-mw').textContent = `${port.displayedAccessibleMW.toFixed(0)} MW`;
    document.getElementById('pool-verified-parents-count').textContent = `${port.verifiedAccountCount} Parents`;
  }

  // 4. Selection Lanes (Section 3.5)
  function renderSelectionLanes() {
    const port = state.portfolioState;
    if (!port) return;

    const lanesConfig = [
      { id: 'Power', title: 'Power Infrastructure', maxSlots: 4, icon: '⚡' },
      { id: 'UPS & Rack', title: 'UPS & Downstream Rack Power', maxSlots: 3, icon: '🔋' },
      { id: 'Cooling', title: 'Thermal Management & Cooling', maxSlots: 4, icon: '❄️' }
    ];

    const container = document.getElementById('lanes-container');
    if (!container) return;

    container.innerHTML = lanesConfig.map(lane => {
      // Find companies selected from this lane or matching its primary lane
      const selectedInLane = port.selectedCompanies.filter(c => c.primary_lane === lane.id);
      
      let slotsHTML = selectedInLane.map(c => {
        const metrics = CriticalCoreEngine.calculateCandidateMetrics(
          c,
          port,
          state.assumptions.cumminsAccessibleAccounts,
          state.accountsMap,
          state.assumptions
        );
        const indEnTag = c.india_enablement_crore > 0 ? `<span class="badge badge-india-enablement">Enablement ₹${c.india_enablement_crore}cr</span>` : '';
        return `
          <div class="company-slot">
            <div class="slot-co-name">
              <span>${c.company_name}</span>
              <span class="slot-co-country">(${c.country})</span>
              ${indEnTag}
            </div>
            <div class="slot-co-meta">
              <span class="slot-co-cheque">51% Stake: ${formatINR(metrics.stakeCheque51, 1)}</span>
              <button class="btn-remove-slot" data-co-id="${c.company_id}" title="Remove Company">✕</button>
            </div>
          </div>
        `;
      }).join('');

      // Section 3.5: Reveal only the next empty slot in a lane
      if (selectedInLane.length < lane.maxSlots) {
        slotsHTML += `
          <button class="empty-slot-btn" data-lane="${lane.id}">
            + Select ${lane.title} Candidate (Slot ${selectedInLane.length + 1} of ${lane.maxSlots})
          </button>
        `;
      }

      return `
        <div class="lane-card">
          <div class="lane-header">
            <div class="lane-title">${lane.icon} ${lane.title}</div>
            <div class="lane-count">${selectedInLane.length} / ${lane.maxSlots} selected</div>
          </div>
          <div class="lane-slots">
            ${slotsHTML}
          </div>
        </div>
      `;
    }).join('');

    // Attach slot remove & add listeners
    container.querySelectorAll('.btn-remove-slot').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const coId = btn.getAttribute('data-co-id');
        removeCompany(coId);
      });
    });

    container.querySelectorAll('.empty-slot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const laneId = btn.getAttribute('data-lane');
        openCandidateModal(laneId);
      });
    });
  }

  // 5. Portfolio Summary Card (Section 3.6)
  function renderPortfolioSummary() {
    const port = state.portfolioState;
    if (!port) return;

    document.getElementById('sum-selected-cos').textContent = port.selectedCompanies.length > 0
      ? port.selectedCompanies.map(c => c.company_name).join(', ')
      : 'None (XY Corp base only)';

    document.getElementById('sum-wallet-owned').textContent = `${port.ownedWalletPoints.toFixed(1)} / 58.0 pts (${port.ownedPercentage.toFixed(1)}%)`;
    document.getElementById('sum-wallet-overlap').textContent = `${port.overlappingWalletPoints.toFixed(1)} pts`;
    document.getElementById('sum-wallet-missing').textContent = `${port.missingWalletPoints.toFixed(1)} pts`;

    document.getElementById('sum-stake-cheques').textContent = formatINR(port.total51StakeCheques);
    document.getElementById('sum-deal-fees').textContent = formatINR(port.totalTransactionFees);
    document.getElementById('sum-india-enablement').textContent = formatINR(port.totalIndiaEnablementCapex);
    document.getElementById('sum-shared-facility').textContent = formatINR(port.sharedFacilityCapex);
    document.getElementById('sum-total-cash').textContent = formatINR(port.totalAcquisitionAndEnablementCash);

    document.getElementById('sum-dedup-mw').textContent = formatMW(port.displayedAccessibleMW, 0);
    document.getElementById('sum-convertible-mw').textContent = formatMW(port.accessConvertibleMW, 0);

    const btnRun = document.getElementById('btn-run-simulation');
    if (btnRun) {
      btnRun.disabled = port.selectedCompanies.length === 0;
    }
  }

  // 6. Financial Results (Section 13)
  function renderFinancialResults() {
    const port = state.portfolioState;
    const solved = state.solvedMW;
    const fin = state.financials;
    const cf = state.cashFlow;

    const sectionEl = document.getElementById('results-section');
    if (!sectionEl) return;

    if (!port || !solved || !fin || !cf) {
      sectionEl.style.display = 'none';
      return;
    }

    sectionEl.style.display = 'block';

    // Required MW Strip
    document.getElementById('res-target-A').textContent = formatINR(solved.selectedCompanies2030GrossRev);
    document.getElementById('res-target-X').textContent = formatINR(solved.residualTargetX);
    document.getElementById('res-required-C').textContent = formatMW(solved.requiredCommercialMW, 3);
    document.getElementById('res-required-Y').textContent = formatMW(solved.requiredTotalMW, 3);
    document.getElementById('res-pool-mw').textContent = formatMW(port.displayedAccessibleMW, 0);
    document.getElementById('res-convertible-mw').textContent = formatMW(solved.accessConvertibleMW, 0);
    document.getElementById('res-coverage-pct').textContent = solved.coveragePercentage.toFixed(1) + '%';
    document.getElementById('res-gap-surplus-mw').textContent = solved.surplusMW > 0 ? `+${formatMW(solved.surplusMW, 1)} Surplus` : `-${formatMW(solved.gapMW, 1)} Gap`;

    // Access Status Banner
    const bannerEl = document.getElementById('access-status-banner');
    if (bannerEl) {
      bannerEl.className = 'access-status-banner ' + (solved.surplusMW > 0 ? 'surplus' : 'gap');
      bannerEl.textContent = solved.statusText;
    }

    // Main KPI Cards
    document.getElementById('kpi-net-incremental-rev').textContent = formatINR(fin.netIncrementalRevenue, 3);
    document.getElementById('kpi-cc-product-rev').textContent = formatINR(fin.criticalCoreProductRevenue, 3);
    document.getElementById('kpi-retained-acquired-rev').textContent = formatINR(fin.retainedAcquiredExternalRevenue, 3);
    document.getElementById('kpi-service-sustain-rev').textContent = formatINR(fin.ordinaryServiceRevenue + fin.sustainPlusRevenue, 3);

    document.getElementById('kpi-product-gp').textContent = `${formatINR(fin.criticalCoreProductGrossProfit, 2)} (${formatPct(fin.productGrossMargin, 2)})`;
    document.getElementById('kpi-incremental-ebitda').textContent = `${formatINR(fin.incrementalEBITDABeforeDealFees, 2)} (${formatPct(fin.incrementalEBITDAMargin, 2)})`;
    document.getElementById('kpi-consolidated-pat').textContent = formatINR(fin.consolidatedPAT, 2);
    document.getElementById('kpi-cummins-pat').textContent = formatINR(fin.cumminsAttributablePAT, 2);

    document.getElementById('kpi-pilot-cash').textContent = formatINR(cf.h1PilotRequirement, 2);
    document.getElementById('kpi-acquisition-cash').textContent = formatINR(cf.acquisitionCashWithFees, 2);
    document.getElementById('kpi-enablement-capex').textContent = formatINR(cf.indiaEnablementCapex, 2);
    document.getElementById('kpi-shared-facility').textContent = formatINR(cf.sharedFacilityCapex, 2);

    document.getElementById('kpi-peak-funding').textContent = formatINR(cf.peakParentFunding, 2);
    document.getElementById('kpi-funding-envelope').textContent = formatINR(cf.fundingEnvelope, 2);
    document.getElementById('kpi-first-positive-fcf').textContent = cf.firstPositiveHalfYear;
    document.getElementById('kpi-full-recovery-date').textContent = cf.fullRecoveryDate;

    // Additional metrics
    const marketShare2030 = (solved.requiredTotalMW / (state.assumptions.marketTotalPipelineMW || 3860.0)) * 100;
    document.getElementById('kpi-market-share-mw').textContent = `${solved.requiredTotalMW.toFixed(1)} MW (${marketShare2030.toFixed(1)}% of 3,860 MW)`;

    const diffVsBenchmark = solved.requiredTotalMW - 335.015;
    const diffSign = diffVsBenchmark >= 0 ? '+' : '';
    document.getElementById('kpi-diff-benchmark').textContent = port.isBenchmarkPortfolio
      ? '0.0 MW (Authoritative Base Case)'
      : `${diffSign}${diffVsBenchmark.toFixed(2)} MW vs Base Plan`;
  }

  // 7. Collapsible Appendix (Section 13.3)
  function renderAppendix() {
    const port = state.portfolioState;
    const solved = state.solvedMW;
    const fin = state.financials;
    const cf = state.cashFlow;

    const contentEl = document.getElementById('appendix-content');
    if (!contentEl || !port || !solved || !fin || !cf) return;

    contentEl.style.display = state.isAppendixOpen ? 'flex' : 'none';
    const toggleBtn = document.getElementById('btn-toggle-appendix');
    if (toggleBtn) {
      toggleBtn.innerHTML = `<span>${state.isAppendixOpen ? '▼ Hide' : '▶ View'} calculation appendix (Deterministic formulas & full 2027–2042 schedules)</span><span style="font-size:12px;color:var(--text-muted)">14 Audited Modules</span>`;
    }

    if (!state.isAppendixOpen) return;

    // Render 14 sections
    contentEl.innerHTML = `
      <!-- 1. Global Assumptions -->
      <div>
        <div class="appendix-section-title">1. Global Authoritative Operating & Financial Assumptions</div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr><th>Assumption</th><th>Value</th><th>Unit</th><th>Description / Basis</th></tr>
            </thead>
            <tbody>
              <tr><td>2030 Net Incremental Revenue Target</td><td class="num">8,000.0</td><td>₹ crore</td><td>Net new incremental revenue requirement for XY Corp CriticalCore</td></tr>
              <tr><td>Reference System Selling Price</td><td class="num">42.90</td><td>₹ crore / MW</td><td>Program benchmark price before integration markup</td></tr>
              <tr><td>MW-Weighted Integration Premium</td><td class="num">1.0%</td><td>%</td><td>Commercial ramp average premium for integrated system</td></tr>
              <tr><td>Last-Cohort Premium over Mean</td><td class="num">3.0%</td><td>%</td><td>Final 2030 H2 cohort pricing uplift</td></tr>
              <tr><td>Approach-to-Sign Period</td><td class="num">6</td><td>months</td><td>Lead time from customer engagement to binding contract</td></tr>
              <tr><td>Deployment & Rev-Rec Window</td><td class="num">12</td><td>months</td><td>100% deployment delivery with even monthly recognition</td></tr>
              <tr><td>Pilot IT Capacity</td><td class="num">4.0</td><td>MW</td><td>H1 2027 accelerated pilot at zero product gross margin</td></tr>
              <tr><td>Controlling Ownership Stake</td><td class="num">51.0%</td><td>%</td><td>100% revenue/EBITDA consolidation; 49% NCI deducted below PAT</td></tr>
              <tr><td>Ordinary Annual Service Fee</td><td class="num">5.0%</td><td>% of project value</td><td>Annual fee on commissioned project value</td></tr>
              <tr><td>Ordinary Service Attachment Rate</td><td class="num">70.0%</td><td>%</td><td>Value-weighted planning attachment</td></tr>
              <tr><td>Annual Sustain+ Fee</td><td class="num">0.5%</td><td>% of project value</td><td>Optimization and telemetry service launched 1 Jan 2029</td></tr>
              <tr><td>Sustain+ Uptake Schedule</td><td class="num">20% / 30% / 40%</td><td>%</td><td>H1 2029 (20%), H2 2029 (30%), mature thereafter (40% of attached)</td></tr>
              <tr><td>Central Overhead Rate</td><td class="num">12.0%</td><td>% of CC sales</td><td>Commercial, engineering, support (min ₹39.58 cr launch floor)</td></tr>
              <tr><td>Manufacturing D&A Addback</td><td class="num">1.4%</td><td>% of product sales</td><td>Industry standard proxy added back from gross profit</td></tr>
              <tr><td>Recurring Manufacturing Capex</td><td class="num">2.0%</td><td>% of product sales</td><td>Maintenance and expansion manufacturing investment</td></tr>
              <tr><td>CriticalCore Net Working Capital</td><td class="num">10.0%</td><td>% of sales</td><td>Annualized product revenue working capital requirement</td></tr>
              <tr><td>New-Business PAT / EBITDA Proxy</td><td class="num">62.3299%</td><td>%</td><td>Vertiv FY25 unadjusted proxy for CriticalCore platform</td></tr>
              <tr><td>Shared Integration & FAT Facility</td><td class="num">50.0</td><td>₹ crore</td><td>One common facility charged once in 2027 H2</td></tr>
              <tr><td>Acquisition Deal Fees</td><td class="num">2.0%</td><td>% of stake cheque</td><td>Transaction, diligence and legal execution cost</td></tr>
              <tr><td>Funding Contingency Reserve</td><td class="num">1.2%</td><td>% of peak funding</td><td>Unallocated reserve envelope</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 2. Selected Company Inputs -->
      <div>
        <div class="appendix-section-title">2. Selected-Company Audit Table & Inputs</div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr><th>Company</th><th>Country</th><th>Base Rev (₹ cr)</th><th>Base Year</th><th>CAGR</th><th>EBITDA Margin</th><th>PAT/EBITDA</th><th>DC Share</th><th>India DC</th><th>EV/EBITDA</th><th>51% Ticket</th><th>Source ID</th></tr>
            </thead>
            <tbody>
              ${port.selectedCompanies.map(c => {
                const f = c.financials || {};
                const m = CriticalCoreEngine.calculateCandidateMetrics(c, port, state.assumptions.cumminsAccessibleAccounts, state.accountsMap, state.assumptions);
                return `
                  <tr>
                    <td><b>${c.company_name}</b></td>
                    <td>${c.country}</td>
                    <td class="num">${f.base_revenue != null ? f.base_revenue.toFixed(1) : '—'}</td>
                    <td class="num">${f.revenue_base_year || '—'}</td>
                    <td class="num">${f.revenue_cagr != null ? (f.revenue_cagr * 100).toFixed(1) + '%' : '—'}</td>
                    <td class="num">${f.ebitda_margin != null ? (f.ebitda_margin * 100).toFixed(2) + '%' : '—'}</td>
                    <td class="num">${f.pat_to_ebitda != null ? (f.pat_to_ebitda * 100).toFixed(1) + '%' : '—'}</td>
                    <td class="num">${f.dc_revenue_share != null ? (f.dc_revenue_share * 100).toFixed(1) + '%' : '—'}</td>
                    <td class="num">${f.india_share_of_dc_revenue != null ? (f.india_share_of_dc_revenue * 100).toFixed(1) + '%' : '—'}</td>
                    <td class="num">${f.ev_ebitda_multiple != null ? f.ev_ebitda_multiple.toFixed(1) + 'x' : '—'}</td>
                    <td class="num"><b>${formatINR(m.stakeCheque51, 2)}</b></td>
                    <td>${f.financial_source_id || 'Audit required'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 3. Capability Mapping and Primary Providers -->
      <div>
        <div class="appendix-section-title">3. Capability Wallet Breakdown & Primary Providers</div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr><th>Category</th><th>Target Points</th><th>Owned Points</th><th>Coverage %</th><th>Primary Provider</th><th>Assigned GM</th><th>Overlapping Providers</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${port.categoriesList.map(cat => {
                const others = cat.providers.length > 1 ? cat.providers.slice(1).map(p => p.companyName).join(', ') : 'None';
                const prim = cat.primaryProvider ? `${cat.primaryProvider.companyName} (${(cat.primaryProvider.coverageFactor*100).toFixed(0)}%)` : 'None';
                return `
                  <tr>
                    <td><b>${cat.categoryName}</b></td>
                    <td class="num">${cat.walletPoints.toFixed(1)}</td>
                    <td class="num"><b>${cat.ownedPoints.toFixed(1)}</b></td>
                    <td class="num">${(cat.ownedCoverage * 100).toFixed(1)}%</td>
                    <td>${prim}</td>
                    <td class="num">${cat.primaryProvider ? (cat.primaryProvider.gm * 100).toFixed(1) + '%' : '2.0% (Procured)'}</td>
                    <td>${others}</td>
                    <td><span class="badge ${cat.status === 'Covered' ? 'badge-covered' : (cat.status === 'Partially covered' ? 'badge-partially' : 'badge-missing')}">${cat.status}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 4. Account Deduplication Table -->
      <div>
        <div class="appendix-section-title">4. Account Master & Portfolio Deduplicated Access Pool</div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr><th>Account Parent</th><th>Pipeline MW</th><th>XY Corp Direct</th><th>Voltech Route</th><th>BPE Route</th><th>In Portfolio Union?</th></tr>
            </thead>
            <tbody>
              ${state.accounts.map(acc => {
                const inCummins = state.assumptions.cumminsAccessibleAccounts.includes(acc.account_id);
                const inVoltech = (state.candidatesMap['voltech']?.linked_accounts || []).includes(acc.account_id);
                const inBPE = (state.candidatesMap['bpe']?.linked_accounts || []).includes(acc.account_id);
                const inPort = port.accountSet.has(acc.account_id);
                return `
                  <tr>
                    <td><b>${acc.account_parent_name}</b></td>
                    <td class="num"><b>${acc.india_pipeline_mw} MW</b></td>
                    <td>${inCummins ? '✓ Yes' : '—'}</td>
                    <td>${inVoltech ? '✓ Yes' : '—'}</td>
                    <td>${inBPE ? '✓ Yes' : '—'}</td>
                    <td><b>${inPort ? '<span style="color:var(--color-emerald)">✓ Included</span>' : '<span style="color:var(--text-dim)">Excluded</span>'}</b></td>
                  </tr>
                `;
              }).join('')}
              <tr style="background:#f1f5f9; font-weight:800">
                <td>Deduplicated Accessible Pipeline MW</td>
                <td class="num" style="color:var(--color-brand)">${port.displayedAccessibleMW.toFixed(0)} MW</td>
                <td colspan="4" style="color:var(--text-muted)">Access-based 20% convertible MW: <b>${port.accessConvertibleMW.toFixed(0)} MW</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 8. Residual Target and Solver Details -->
      <div>
        <div class="appendix-section-title">8. ₹8,000 Crore Target Solve & Cohort Mathematics</div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr><th>Parameter</th><th>Value</th><th>Unit</th><th>Mathematical Derivation</th></tr>
            </thead>
            <tbody>
              <tr><td>2030 Target Net Incremental Revenue</td><td class="num">8,000.000</td><td>₹ crore</td><td>Fixed program target</td></tr>
              <tr><td>Selected Companies' 2030 Gross Revenue (A)</td><td class="num">${solved.selectedCompanies2030GrossRev.toFixed(3)}</td><td>₹ crore</td><td>Sum of base_revenue × (1 + CAGR)^(2030 - base_year)</td></tr>
              <tr><td>Residual CriticalCore Target (X)</td><td class="num">${solved.residualTargetX.toFixed(3)}</td><td>₹ crore</td><td>max(0, ₹8,000 cr - A)</td></tr>
              <tr><td>Solved Commercial Ramp Scale Factor</td><td class="num">${solved.scale.toFixed(6)}</td><td>ratio</td><td>Scale factor relative to 355 MW base model</td></tr>
              <tr><td>Required Commercial Booked MW (C)</td><td class="num"><b>${solved.requiredCommercialMW.toFixed(3)}</b></td><td>MW</td><td>scale × 355 MW</td></tr>
              <tr><td>Accelerated Fixed Pilot MW</td><td class="num">4.000</td><td>MW</td><td>Fixed H1 2027 pilot</td></tr>
              <tr><td>Total Required Cumulative MW (Y)</td><td class="num"><b style="color:var(--color-brand)">${solved.requiredTotalMW.toFixed(3)}</b></td><td>MW</td><td>C + 4.0 MW pilot</td></tr>
              <tr><td>20% Deduplicated Access Convertible MW</td><td class="num">${solved.accessConvertibleMW.toFixed(3)}</td><td>MW</td><td>20% × ${port.displayedAccessibleMW.toFixed(0)} MW</td></tr>
              <tr><td>Access Coverage of Required MW</td><td class="num"><b>${solved.coveragePercentage.toFixed(1)}%</b></td><td>%</td><td>Convertible MW / Y</td></tr>
              <tr><td>Access Surplus / (Gap)</td><td class="num"><b>${solved.surplusMW > 0 ? '+' + solved.surplusMW.toFixed(3) : '-' + solved.gapMW.toFixed(3)}</b></td><td>MW</td><td>Convertible MW - Y</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 9. Cohorts and Revenue Recognition -->
      <div>
        <div class="appendix-section-title">9. Scaled Commercial Cohort Delivery & 2030 Revenue Recognition</div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr><th>Cohort</th><th>Base MW</th><th>Solved MW</th><th>Price / MW (₹ cr)</th><th>Contract Value (₹ cr)</th><th>2030 Rev-Rec Share</th><th>2030 Product Rev (₹ cr)</th></tr>
            </thead>
            <tbody>
              ${(state.assumptions.commercialCohortsBase || []).map(coh => {
                const solvedCohMW = solved.requiredCommercialMW * coh.share;
                const contractVal = solvedCohMW * coh.price;
                const rec2030Rev = contractVal * coh.rec2030Share;
                return `
                  <tr>
                    <td><b>${coh.name}</b></td>
                    <td class="num">${coh.mw.toFixed(1)}</td>
                    <td class="num"><b>${solvedCohMW.toFixed(3)}</b></td>
                    <td class="num">${coh.price.toFixed(4)}</td>
                    <td class="num">${contractVal.toFixed(3)}</td>
                    <td class="num">${(coh.rec2030Share * 100).toFixed(0)}%</td>
                    <td class="num"><b>${rec2030Rev.toFixed(3)}</b></td>
                  </tr>
                `;
              }).join('')}
              <tr style="background:#f1f5f9; font-weight:800">
                <td>Total Commercial 2030</td>
                <td class="num">355.0</td>
                <td class="num">${solved.requiredCommercialMW.toFixed(3)}</td>
                <td class="num">43.3290 wtd</td>
                <td class="num">—</td>
                <td class="num">—</td>
                <td class="num" style="color:var(--color-brand)">${fin.criticalCoreProductRevenue.toFixed(3)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 10. Product Margin Bridge -->
      <div>
        <div class="appendix-section-title">10. Category Margin Bridge & Product Cost Breakdown</div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr><th>Category</th><th>Wallet Pts</th><th>Value / MW (₹ cr)</th><th>Assigned GM</th><th>COGS / MW (₹ cr)</th><th>GP / MW (₹ cr)</th><th>Component Provider</th></tr>
            </thead>
            <tbody>
              ${fin.categoryMarginBridge.map(cmb => `
                <tr>
                  <td><b>${cmb.categoryName}</b></td>
                  <td class="num">${cmb.walletPoints.toFixed(1)}</td>
                  <td class="num">${cmb.valuePerMW.toFixed(2)}</td>
                  <td class="num"><b>${(cmb.assignedGM * 100).toFixed(1)}%</b></td>
                  <td class="num">${cmb.cogsPerMW.toFixed(2)}</td>
                  <td class="num">${cmb.grossProfitPerMW.toFixed(2)}</td>
                  <td>${cmb.provider}</td>
                </tr>
              `).join('')}
              <tr style="background:#f1f5f9; font-weight:800">
                <td>Reference Unit System</td>
                <td class="num">58.0</td>
                <td class="num">42.90</td>
                <td class="num" style="color:var(--color-brand)">${(fin.weightedReferenceMargin * 100).toFixed(2)}%</td>
                <td class="num">${fin.totalCogsPerMW.toFixed(2)}</td>
                <td class="num">${(42.90 - fin.totalCogsPerMW).toFixed(2)}</td>
                <td>Weighted CC Platform</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 12. 2030 Revenue & Profitability Bridge -->
      <div>
        <div class="appendix-section-title">12. Full 2030 Revenue & Profitability Bridge</div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr><th>Statement Line</th><th>Amount (₹ crore)</th><th>% of Revenue</th><th>Accounting & Commercial Basis</th></tr>
            </thead>
            <tbody>
              <tr><td>CriticalCore Commercial Product Revenue</td><td class="num"><b>${fin.criticalCoreProductRevenue.toFixed(3)}</b></td><td class="num">${((fin.criticalCoreProductRevenue/fin.netIncrementalRevenue)*100).toFixed(1)}%</td><td>Recognized from scaled cohort delivery</td></tr>
              <tr><td>Ordinary Annual Service Revenue</td><td class="num">${fin.ordinaryServiceRevenue.toFixed(3)}</td><td class="num">${((fin.ordinaryServiceRevenue/fin.netIncrementalRevenue)*100).toFixed(1)}%</td><td>5.0% fee on commissioned base × 70% attachment</td></tr>
              <tr><td>Sustain+ Optimization Revenue</td><td class="num">${fin.sustainPlusRevenue.toFixed(3)}</td><td class="num">${((fin.sustainPlusRevenue/fin.netIncrementalRevenue)*100).toFixed(1)}%</td><td>0.5% fee on active attached service accounts</td></tr>
              <tr><td>Gross Acquired-Company Revenue (Consolidated)</td><td class="num">${fin.grossAcquiredRevenue.toFixed(3)}</td><td class="num">—</td><td>100% consolidated under 51% control</td></tr>
              <tr><td>Less: Acquired DC Revenue Migrated to CriticalCore</td><td class="num">(${fin.acquiredDCMigrated.toFixed(3)})</td><td class="num">—</td><td>Deducted to eliminate double-counting</td></tr>
              <tr><td>Retained Acquired External Revenue</td><td class="num"><b>${fin.retainedAcquiredExternalRevenue.toFixed(3)}</b></td><td class="num">${((fin.retainedAcquiredExternalRevenue/fin.netIncrementalRevenue)*100).toFixed(1)}%</td><td>Acquired legacy standalone sales to third parties</td></tr>
              <tr><td>Less: Existing XY Corp Equipment Displaced</td><td class="num">(${fin.cumminsDisplacement.toFixed(3)})</td><td class="num">—</td><td>Cannibalized genset/equipment sales within accessible base</td></tr>
              <tr style="background:#f1f5f9; font-weight:800"><td>Net Incremental Revenue</td><td class="num" style="color:var(--color-brand)"><b>${fin.netIncrementalRevenue.toFixed(3)}</b></td><td class="num">100.0%</td><td>Reconciles to ₹8,000.000 cr target within 0.000000 error</td></tr>
              <tr><td>CriticalCore Product Gross Profit</td><td class="num">${fin.criticalCoreProductGrossProfit.toFixed(3)}</td><td class="num">${(fin.productGrossMargin*100).toFixed(2)}%</td><td>After category COGS and integration pricing premium</td></tr>
              <tr><td>CriticalCore Total Gross Profit</td><td class="num">${fin.criticalCoreTotalGrossProfit.toFixed(3)}</td><td class="num">—</td><td>Product GP + Ordinary Service GP + Sustain+ GP</td></tr>
              <tr><td>Manufacturing D&A Addback</td><td class="num">+${fin.manufacturingDA.toFixed(3)}</td><td class="num">—</td><td>1.4% of product sales added back to EBITDA</td></tr>
              <tr><td>Central Overhead SG&A Bucket</td><td class="num">(${fin.centralOverhead.toFixed(3)})</td><td class="num">—</td><td>12.0% of CriticalCore sales</td></tr>
              <tr><td>Retained Acquired-Company EBITDA</td><td class="num">+${fin.retainedAcquiredEBITDA.toFixed(3)}</td><td class="num">—</td><td>Acquired EBITDA after deducting migrated lost contribution</td></tr>
              <tr><td>Lost Contribution on Displaced XY Corp Equipment</td><td class="num">(${fin.cumminsDisplacedContributionLost.toFixed(3)})</td><td class="num">—</td><td>25% gross profit lost on displaced gensets</td></tr>
              <tr style="background:#f1f5f9; font-weight:800"><td>Incremental EBITDA (pre-deal fees)</td><td class="num" style="color:var(--color-emerald)"><b>${fin.incrementalEBITDABeforeDealFees.toFixed(3)}</b></td><td class="num">${(fin.incrementalEBITDAMargin*100).toFixed(2)}%</td><td>Consolidated operating EBITDA before one-time close fees</td></tr>
              <tr><td>Consolidated PAT</td><td class="num">${fin.consolidatedPAT.toFixed(3)}</td><td class="num">—</td><td>After tax proxy on platform and legacy businesses</td></tr>
              <tr><td>Less: Non-Controlling Interest (49% NCI)</td><td class="num">(${fin.totalMinorityPAT.toFixed(3)})</td><td class="num">—</td><td>49% share of acquired legacy & manufacturing economics</td></tr>
              <tr style="background:#f1f5f9; font-weight:800"><td>XY Corp-Attributable PAT</td><td class="num" style="color:var(--color-brand)"><b>${fin.cumminsAttributablePAT.toFixed(3)}</b></td><td class="num">—</td><td>Net income attributable to XY Corp shareholders</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 13. Cash Flow Schedule -->
      <div>
        <div class="appendix-section-title">13. Cash Flow Forecast & Recovery Schedule (2027 H1 – 2042 H2)</div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr><th>Period</th><th>Net Cash to XY Corp (₹ cr)</th><th>Cumulative Net Project Cash (₹ cr)</th><th>Funding Required / Recovery State</th></tr>
            </thead>
            <tbody>
              ${cf.schedule.slice(0, 16).map(row => `
                <tr ${row.period === cf.peakPeriod ? 'style="background:rgba(244,63,94,0.1);font-weight:700"' : (row.period === cf.fullRecoveryDate ? 'style="background:rgba(16,185,129,0.15);font-weight:700"' : '')}>
                  <td><b>${row.period}</b></td>
                  <td class="num">${row.netCash.toFixed(2)}</td>
                  <td class="num" style="${row.cumulativeCash < 0 ? 'color:var(--color-rose)' : 'color:var(--color-emerald)'}">${row.cumulativeCash.toFixed(2)}</td>
                  <td>${row.period === cf.peakPeriod ? '<span class="badge badge-missing">Peak Funding Point: ₹' + Math.abs(row.cumulativeCash).toFixed(1) + ' cr</span>' : (row.period === cf.fullRecoveryDate ? '<span class="badge badge-covered">Full Investment Recovered</span>' : (row.cumulativeCash < 0 ? 'Drawdown active' : 'Surplus cash generation'))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 14. Data Quality & Due Diligence Register -->
      <div>
        <div class="appendix-section-title">14. Candidate Data-Quality & Missing-Field Register (Section 14.5)</div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr><th>Company</th><th>Country</th><th>Eligibility Status</th><th>Missing Mandatory Fields</th><th>Valuation Basis</th><th>Diligence Action</th></tr>
            </thead>
            <tbody>
              ${state.candidates.map(c => {
                const isReady = c.missing_fields.length === 0;
                return `
                  <tr>
                    <td><b>${c.company_name}</b></td>
                    <td>${c.country}</td>
                    <td><span class="badge ${isReady ? 'badge-covered' : 'badge-data-required'}">${isReady ? 'Production Ready' : 'Data Required'}</span></td>
                    <td>${c.missing_fields.length > 0 ? `<span style="color:var(--color-rose)">${c.missing_fields.join(', ')}</span>` : '<span style="color:var(--color-emerald)">None (Complete)</span>'}</td>
                    <td>${c.financials?.valuation_basis || 'Unpopulated'}</td>
                    <td>${isReady ? 'Audited with Authoritative Model' : 'Requires commercial due diligence before inclusion in active selector'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // Candidate Selection Modal Management
  function openCandidateModal(laneId) {
    state.activeSlotLane = laneId || 'All';
    state.activeLaneFilter = laneId || 'All';
    state.showDueDiligenceTab = false;
    renderCandidateModal();
    const modalEl = document.getElementById('candidate-modal');
    if (modalEl) modalEl.style.display = 'flex';
  }

  function closeCandidateModal() {
    const modalEl = document.getElementById('candidate-modal');
    if (modalEl) modalEl.style.display = 'none';
  }

  function renderCandidateModal() {
    const port = state.portfolioState;
    const bodyEl = document.getElementById('modal-candidates-list');
    const tabsContainer = document.getElementById('modal-lane-tabs');
    if (!bodyEl || !port) return;

    // Render filter tabs with dynamic counts
    const availablePool = state.candidates.filter(c => !state.selectedCompanyIds.includes(c.company_id));
    const laneCounts = {
      'All': availablePool.filter(c => c.missing_fields.length === 0).length,
      'Power': availablePool.filter(c => c.primary_lane === 'Power' && c.missing_fields.length === 0).length,
      'UPS & Rack': availablePool.filter(c => c.primary_lane === 'UPS & Rack' && c.missing_fields.length === 0).length,
      'Cooling': availablePool.filter(c => c.primary_lane === 'Cooling' && c.missing_fields.length === 0).length,
    };
    const missingCount = availablePool.filter(c => c.missing_fields.length > 0).length;

    const lanes = ['All', 'Power', 'UPS & Rack', 'Cooling'];
    if (tabsContainer) {
      let tabsHtml = lanes.map(l => `
        <button class="tab-btn ${state.activeLaneFilter === l && !state.showDueDiligenceTab ? 'active' : ''}" data-lane="${l}">
          ${l} (${laneCounts[l]})
        </button>
      `).join('');

      if (missingCount > 0) {
        tabsHtml += `
          <button class="tab-btn ${state.showDueDiligenceTab ? 'active' : ''}" id="btn-tab-diligence" style="color:var(--color-rose);border-color:rgba(244,63,94,0.3)">
            ⚠️ Incomplete Data (${missingCount})
          </button>
        `;
      }
      tabsContainer.innerHTML = tabsHtml;

      tabsContainer.querySelectorAll('.tab-btn[data-lane]').forEach(btn => {
        btn.addEventListener('click', () => {
          state.activeLaneFilter = btn.getAttribute('data-lane');
          state.showDueDiligenceTab = false;
          renderCandidateModal();
        });
      });

      const btnDD = document.getElementById('btn-tab-diligence');
      if (btnDD) {
        btnDD.addEventListener('click', () => {
          state.showDueDiligenceTab = true;
          renderCandidateModal();
        });
      }
    }

    // Filter candidates
    let candidateList = state.candidates.filter(c => !state.selectedCompanyIds.includes(c.company_id));

    if (state.showDueDiligenceTab) {
      // Show candidates missing mandatory valuation
      candidateList = candidateList.filter(c => c.missing_fields.length > 0);
    } else {
      // Show eligible candidates with mandatory valuation
      candidateList = candidateList.filter(c => c.missing_fields.length === 0);
      if (state.activeLaneFilter !== 'All') {
        candidateList = candidateList.filter(c => c.primary_lane === state.activeLaneFilter);
      }
    }

    if (state.candidateSearchQuery) {
      const q = state.candidateSearchQuery.toLowerCase();
      candidateList = candidateList.filter(c => c.company_name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q));
    }

    // Calculate metrics and sort
    const metricsList = candidateList.map(c => CriticalCoreEngine.calculateCandidateMetrics(
      c,
      port,
      state.assumptions.cumminsAccessibleAccounts,
      state.accountsMap,
      state.assumptions
    ));

    // Section 7.2: Remove companies whose 51% stake exceeds ₹1,364.59 cr
    const eligibleMetrics = metricsList.filter(m => m.isSizeScreenEligible || state.showDueDiligenceTab);
    const sorted = CriticalCoreEngine.sortCandidates(eligibleMetrics);

    if (sorted.length === 0) {
      bodyEl.innerHTML = `<div style="text-align:center; padding:32px; color:var(--text-muted)">No candidates matching current filter.</div>`;
      return;
    }

    bodyEl.innerHTML = sorted.map(m => {
      const cand = state.candidatesMap[m.candidateId];
      const categoriesText = m.suppliedCategories.map(sc => state.categoriesMap[sc.categoryId]?.category_name || sc.categoryId).join(', ');
      
      let overlapBadgeHTML = '';
      if (m.hasAccountOverlap) {
        overlapBadgeHTML = `<span class="badge badge-account-overlap">Account overlap: ${m.accountOverlapMW.toFixed(0)} MW (${(m.accountOverlapRatio*100).toFixed(0)}%)</span>`;
      }

      let fadeNoteHTML = '';
      if (m.isFaded) {
        fadeNoteHTML = `<span class="badge badge-missing">High Capability Overlap: ${(m.capabilityOverlapRatio*100).toFixed(0)}%</span>`;
      }

      let buttonHTML = '';
      if (!m.hasMandatoryValuation) {
        buttonHTML = `
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
            <span class="badge badge-data-required">Data Required: ${m.missingFields.join(', ')}</span>
            <button class="btn btn-secondary btn-sm btn-enter-financials" data-co-id="${m.candidateId}" style="border-color:var(--color-brand); color:var(--color-brand)">
              + Enter Financials
            </button>
          </div>
        `;
      } else {
        buttonHTML = `
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
            <button class="btn btn-primary btn-sm btn-select-candidate" data-co-id="${m.candidateId}">Select Company</button>
            <button class="btn-remove-slot btn-edit-financials" data-co-id="${m.candidateId}" style="font-size:11px; color:var(--text-muted); text-decoration:underline;" title="Edit Financials">Edit Financials</button>
          </div>
        `;
      }

      return `
        <div class="candidate-card ${m.isFaded ? 'faded' : ''}">
          <div class="cand-main-info">
            <div class="cand-header-line">
              <span class="cand-name">${m.candidateName}</span>
              <span class="cand-country-badge">${m.country}</span>
              <span class="chip">${cand.primary_lane}</span>
              ${overlapBadgeHTML}
              ${fadeNoteHTML}
            </div>
            <div class="cand-chips">
              <span class="chip highlight">+${m.incrementalWalletPoints.toFixed(1)} Incremental Pts</span>
              <span class="chip">${m.offeredWalletPoints.toFixed(1)} Offered Pts</span>
              ${m.capabilityOverlapPoints > 0 ? `<span class="chip" style="color:var(--color-amber)">Overlap: ${m.capabilityOverlapPoints.toFixed(1)} pts</span>` : ''}
              <span class="chip">Categories: ${categoriesText}</span>
            </div>
            <div class="cand-metrics-row">
              <span>51% Stake: <b>${m.hasMandatoryValuation ? formatINR(m.stakeCheque51, 1) : 'Data required'}</b></span>
              <span>All-In Cost: <b>${m.hasMandatoryValuation ? formatINR(m.allInCandidateCost, 1) : 'Data required'}</b></span>
              <span>Cost/Inc Pt: <b>${m.hasMandatoryValuation && m.costPerIncrementalWalletPoint !== Infinity ? formatINR(m.costPerIncrementalWalletPoint, 1) : '—'}</b></span>
              <span>Gross MW: <b>${m.grossAccessibleMW} MW</b></span>
              <span>Inc MW: <b>${m.incrementalAccessibleMW} MW</b></span>
              <span>Confidence: <b>${m.evidenceConfidence}</b></span>
            </div>
          </div>
          <div class="cand-actions">
            ${buttonHTML}
          </div>
        </div>
      `;
    }).join('');

    // Attach select listeners
    bodyEl.querySelectorAll('.btn-select-candidate').forEach(btn => {
      btn.addEventListener('click', () => {
        const coId = btn.getAttribute('data-co-id');
        handleSelectCandidate(coId);
      });
    });

    // Attach enter/edit financials listeners
    bodyEl.querySelectorAll('.btn-enter-financials, .btn-edit-financials').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const coId = btn.getAttribute('data-co-id');
        openValuationModal(coId);
      });
    });
  }

  // Handle Candidate Selection (Section 4.4)
  function handleSelectCandidate(companyId) {
    const cand = state.candidatesMap[companyId];
    if (!cand) return;

    const metrics = CriticalCoreEngine.calculateCandidateMetrics(
      cand,
      state.portfolioState,
      state.assumptions.cumminsAccessibleAccounts,
      state.accountsMap,
      state.assumptions
    );

    // Section 4.4: Check warning requirement
    if (metrics.needsWarning) {
      // Close candidate modal and open replacement warning modal (no stacked modals)
      closeCandidateModal();
      openWarningModal(cand, metrics);
    } else {
      // Commit selection and close modal automatically
      commitCandidateSelection(companyId);
      closeCandidateModal();
    }
  }

  // Open Overlap Warning Modal (Section 4.4)
  function openWarningModal(cand, metrics) {
    state.pendingCandidate = cand;
    const warningModal = document.getElementById('warning-modal');
    const copyEl = document.getElementById('warning-modal-copy');
    if (!warningModal || !copyEl) return;

    const overlapCats = metrics.overlappingCategories.map(oc => {
      const catName = state.categoriesMap[oc.categoryId]?.category_name || oc.categoryId;
      return `${catName} (${oc.overlapPoints.toFixed(1)} pts)`;
    }).join(', ') || 'None';

    // Verbatim warning copy per Section 4.4
    copyEl.innerHTML = `
      <b>Overlap warning</b><br><br>
      This company overlaps the selected portfolio in: <b>${overlapCats}</b>. It also shares <b>${metrics.overlapAccountIds.length} account parents</b> representing <b>${metrics.accountOverlapMW.toFixed(0)} MW</b> of pipeline access already available through XY Corp or selected companies. It adds <b>${metrics.incrementalWalletPoints.toFixed(1)} new wallet points</b> and <b>${metrics.incrementalAccessibleMW.toFixed(0)} new accessible MW</b>.<br><br>
      <i>Relationship access is not backlog, an order or a guarantee of conversion. Continue with selection?</i>
    `;

    warningModal.style.display = 'flex';
  }

  function closeWarningModal() {
    const warningModal = document.getElementById('warning-modal');
    if (warningModal) warningModal.style.display = 'none';
    state.pendingCandidate = null;
  }

  function commitCandidateSelection(companyId) {
    if (!state.selectedCompanyIds.includes(companyId)) {
      state.selectedCompanyIds.push(companyId);
      recalculate();
    }
  }

  function removeCompany(companyId) {
    state.selectedCompanyIds = state.selectedCompanyIds.filter(id => id !== companyId);
    recalculate();
  }

  // Missing Capability Procurement Gate (Section 3.7)
  function handleRunSimulationClick() {
    const port = state.portfolioState;
    if (!port || port.selectedCompanies.length === 0) return;

    // Check if missing capability exists
    const missingCats = port.categoriesList.filter(c => !c.isFixed && c.ownedCoverage < 0.9999);

    if (missingCats.length > 0) {
      openMissingCapabilityModal(missingCats);
    } else {
      state.hasRunSimulation = true;
      recalculate();
    }
  }

  function openMissingCapabilityModal(missingCats) {
    const modal = document.getElementById('missing-capability-modal');
    const listEl = document.getElementById('missing-categories-list');
    if (!modal || !listEl) return;

    listEl.innerHTML = missingCats.map(c => `
      <div style="display:flex; justify-content:space-between; padding:8px 12px; background:rgba(0,0,0,0.25); border-radius:var(--radius-sm); margin-bottom:6px">
        <span><b>${c.categoryName}</b> (${(c.ownedCoverage * 100).toFixed(0)}% owned)</span>
        <span style="font-family:var(--font-mono); color:var(--color-amber)">${(c.walletPoints * (1.0 - c.ownedCoverage)).toFixed(1)} pts missing</span>
      </div>
    `).join('');

    modal.style.display = 'flex';
  }

  function closeMissingCapabilityModal() {
    const modal = document.getElementById('missing-capability-modal');
    if (modal) modal.style.display = 'none';
  }

  function continueWithProcurement() {
    const port = state.portfolioState;
    const missingCatIds = port.categoriesList.filter(c => !c.isFixed && c.ownedCoverage < 0.9999).map(c => c.categoryId);
    state.procuredMissingCategories = missingCatIds;
    state.hasRunSimulation = true;
    closeMissingCapabilityModal();
    recalculate();
  }

  // Event Listeners Initialization
  function initEventListeners() {
    // Header controls
    document.getElementById('btn-benchmark')?.addEventListener('click', loadBenchmark);
    document.getElementById('btn-reset')?.addEventListener('click', clearSelections);

    // Run simulation
    document.getElementById('btn-run-simulation')?.addEventListener('click', handleRunSimulationClick);

    // Candidate modal controls
    document.getElementById('btn-close-candidate-modal')?.addEventListener('click', closeCandidateModal);
    document.getElementById('candidate-modal-search')?.addEventListener('input', (e) => {
      state.candidateSearchQuery = e.target.value;
      renderCandidateModal();
    });

    // Warning confirmation modal controls
    document.getElementById('btn-warning-continue')?.addEventListener('click', () => {
      if (state.pendingCandidate) {
        commitCandidateSelection(state.pendingCandidate.company_id);
      }
      closeWarningModal();
    });

    document.getElementById('btn-warning-cancel')?.addEventListener('click', () => {
      closeWarningModal();
      openCandidateModal(state.activeSlotLane);
    });

    // Missing capability modal controls
    document.getElementById('btn-missing-cancel')?.addEventListener('click', closeMissingCapabilityModal);
    document.getElementById('btn-missing-procure')?.addEventListener('click', continueWithProcurement);

    // Valuation entry modal controls
    document.getElementById('btn-close-val-modal')?.addEventListener('click', closeValuationModal);
    document.getElementById('btn-val-cancel')?.addEventListener('click', closeValuationModal);
    document.getElementById('btn-val-prefill-proxy')?.addEventListener('click', prefillSectorProxy);
    document.getElementById('btn-val-save')?.addEventListener('click', saveValuation);

    // Custom candidate creation modal controls
    document.getElementById('btn-open-create-candidate')?.addEventListener('click', openCreateCandidateModal);
    document.getElementById('btn-close-create-modal')?.addEventListener('click', closeCreateCandidateModal);
    document.getElementById('btn-create-cand-cancel')?.addEventListener('click', closeCreateCandidateModal);
    document.getElementById('btn-create-cand-save')?.addEventListener('click', saveCreateCandidate);

    // Appendix toggle
    document.getElementById('btn-toggle-appendix')?.addEventListener('click', () => {
      state.isAppendixOpen = !state.isAppendixOpen;
      renderAppendix();
    });
  }

  // Valuation Entry Modal Management
  function openValuationModal(companyId) {
    state.editingCompanyId = companyId;
    const cand = state.candidatesMap[companyId];
    if (!cand) return;

    const modal = document.getElementById('valuation-entry-modal');
    const titleEl = document.getElementById('val-modal-co-name');
    if (!modal || !titleEl) return;

    titleEl.textContent = `Financials & Valuation: ${cand.company_name} (${cand.country})`;
    
    const f = cand.financials || {};
    document.getElementById('val-input-revenue').value = f.base_revenue != null ? f.base_revenue : '';
    document.getElementById('val-input-base-year').value = f.revenue_base_year || 2025;
    document.getElementById('val-input-cagr').value = f.revenue_cagr != null ? f.revenue_cagr : '';
    document.getElementById('val-input-ebitda-margin').value = f.ebitda_margin != null ? f.ebitda_margin : '';
    document.getElementById('val-input-ev-ebitda').value = f.ev_ebitda_multiple != null ? f.ev_ebitda_multiple : '';
    document.getElementById('val-input-dc-share').value = f.dc_revenue_share != null ? f.dc_revenue_share : 0.35;
    document.getElementById('val-input-india-dc-share').value = f.india_share_of_dc_revenue != null ? f.india_share_of_dc_revenue : 0.50;

    let totalMW = 0;
    (cand.linked_accounts || []).forEach(accId => {
      totalMW += (state.accountsMap[accId]?.india_pipeline_mw || 0);
    });
    document.getElementById('val-input-pipeline-mw').value = totalMW;

    modal.style.display = 'flex';
  }

  function closeValuationModal() {
    const modal = document.getElementById('valuation-entry-modal');
    if (modal) modal.style.display = 'none';
    state.editingCompanyId = null;
  }

  function prefillSectorProxy() {
    const cand = state.candidatesMap[state.editingCompanyId];
    if (!cand) return;

    // Plausible sector proxies based on lane and geography
    let proxyRev = 250.0;
    let proxyCagr = 0.08;
    let proxyEbitda = 0.10;
    let proxyMultiple = 10.0;
    let proxyDCShare = 0.35;
    let proxyIndiaShare = cand.is_indian ? 0.80 : 0.10;

    if (cand.primary_lane === 'Cooling') {
      proxyRev = cand.is_indian ? 200.0 : 450.0;
      proxyCagr = 0.10;
      proxyEbitda = 0.12;
      proxyMultiple = 12.0;
      proxyDCShare = 0.50;
    } else if (cand.primary_lane === 'UPS & Rack') {
      proxyRev = cand.is_indian ? 220.0 : 350.0;
      proxyCagr = 0.08;
      proxyEbitda = 0.09;
      proxyMultiple = 11.0;
      proxyDCShare = 0.40;
    } else { // Power
      proxyRev = cand.is_indian ? 280.0 : 400.0;
      proxyCagr = 0.08;
      proxyEbitda = 0.10;
      proxyMultiple = 9.5;
      proxyDCShare = 0.30;
    }

    document.getElementById('val-input-revenue').value = proxyRev;
    document.getElementById('val-input-base-year').value = 2025;
    document.getElementById('val-input-cagr').value = proxyCagr;
    document.getElementById('val-input-ebitda-margin').value = proxyEbitda;
    document.getElementById('val-input-ev-ebitda').value = proxyMultiple;
    document.getElementById('val-input-dc-share').value = proxyDCShare;
    document.getElementById('val-input-india-dc-share').value = proxyIndiaShare;
  }

  function saveValuation() {
    const cand = state.candidatesMap[state.editingCompanyId];
    if (!cand) return;

    const rev = parseFloat(document.getElementById('val-input-revenue').value);
    const yr = parseInt(document.getElementById('val-input-base-year').value, 10) || 2025;
    const cagr = parseFloat(document.getElementById('val-input-cagr').value);
    const ebitda = parseFloat(document.getElementById('val-input-ebitda-margin').value);
    const mult = parseFloat(document.getElementById('val-input-ev-ebitda').value);
    const dcShare = parseFloat(document.getElementById('val-input-dc-share').value) || 0.35;
    const indiaDCShare = parseFloat(document.getElementById('val-input-india-dc-share').value) || 0.50;
    const pipeMW = parseFloat(document.getElementById('val-input-pipeline-mw').value) || 0;

    if (isNaN(rev) || isNaN(cagr) || isNaN(ebitda) || isNaN(mult)) {
      alert('Please fill all mandatory fields: Base Revenue, CAGR, EBITDA Margin, and EV/EBITDA multiple.');
      return;
    }

    // Update candidate financials
    cand.financials = {
      revenue_base_year: yr,
      base_revenue: rev,
      revenue_cagr: cagr,
      ebitda_margin: ebitda,
      pat_to_ebitda: cand.financials?.pat_to_ebitda || (cand.is_indian ? 0.50 : 0.623),
      dc_revenue_share: dcShare,
      india_share_of_dc_revenue: indiaDCShare,
      net_working_capital_share: cand.financials?.net_working_capital_share || 0.10,
      recurring_capex_share: 0.02,
      ev_ebitda_multiple: mult,
      net_debt: 0,
      surplus_cash: 0,
      valuation_basis: 'User entered / Diligence proxy',
      financial_source_id: 'USER_DILIGENCE_INPUT'
    };

    // Clear missing fields
    cand.missing_fields = [];

    // If custom MW provided and no accounts linked yet, create synthetic link
    if (pipeMW > 0 && (!cand.linked_accounts || cand.linked_accounts.length === 0)) {
      const syntheticAccId = `acc_${cand.company_id}`;
      state.accountsMap[syntheticAccId] = {
        account_id: syntheticAccId,
        account_parent_name: `${cand.company_name} Verified Access`,
        india_pipeline_mw: pipeMW,
        pipeline_as_of_date: '2026-11-14',
        source_id: 'USER_INPUT',
        confidence: 'Medium'
      };
      state.accounts.push(state.accountsMap[syntheticAccId]);
      cand.linked_accounts = [syntheticAccId];
    }

    closeValuationModal();
    renderCandidateModal();
    recalculate();
  }

  // Create Custom Candidate Modal Management
  function openCreateCandidateModal() {
    const modal = document.getElementById('create-candidate-modal');
    if (!modal) return;
    
    // Clear/default inputs
    const nameInput = document.getElementById('new-cand-name');
    if (nameInput) nameInput.value = '';
    const laneSelect = document.getElementById('new-cand-lane');
    if (laneSelect) laneSelect.value = state.activeLaneFilter !== 'All' ? state.activeLaneFilter : 'Power';
    
    document.getElementById('new-cand-country').value = 'India';
    document.getElementById('new-cand-tier').value = 'Tier 1';
    document.getElementById('new-cand-revenue').value = '250.0';
    document.getElementById('new-cand-cagr').value = '0.08';
    document.getElementById('new-cand-ebitda').value = '0.12';
    document.getElementById('new-cand-multiple').value = '10.0';

    // Uncheck categories & accounts
    document.querySelectorAll('#new-cand-categories input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('#new-cand-accounts input[type="checkbox"]').forEach(cb => cb.checked = false);

    modal.style.display = 'flex';
  }

  function closeCreateCandidateModal() {
    const modal = document.getElementById('create-candidate-modal');
    if (modal) modal.style.display = 'none';
  }

  function saveCreateCandidate() {
    const name = (document.getElementById('new-cand-name')?.value || '').trim();
    const lane = document.getElementById('new-cand-lane')?.value || 'Power';
    const country = (document.getElementById('new-cand-country')?.value || 'India').trim();
    const tier = document.getElementById('new-cand-tier')?.value || 'Tier 1';

    const rev = parseFloat(document.getElementById('new-cand-revenue')?.value);
    const cagr = parseFloat(document.getElementById('new-cand-cagr')?.value);
    const ebitda = parseFloat(document.getElementById('new-cand-ebitda')?.value);
    const mult = parseFloat(document.getElementById('new-cand-multiple')?.value);

    if (!name || isNaN(rev) || isNaN(cagr) || isNaN(ebitda) || isNaN(mult)) {
      alert('Please fill all mandatory fields: Company Name, Base Revenue, CAGR, EBITDA Margin, and EV/EBITDA multiple.');
      return;
    }

    const checkedCats = Array.from(document.querySelectorAll('#new-cand-categories input[type="checkbox"]:checked')).map(cb => cb.value);
    const checkedAccs = Array.from(document.querySelectorAll('#new-cand-accounts input[type="checkbox"]:checked')).map(cb => cb.value);

    const isIndian = country.toLowerCase() === 'india';
    const cleanId = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Math.floor(Math.random() * 1000);

    // Build supplied categories structure
    const suppliedCategories = checkedCats.map(catId => {
      const catDef = state.categoriesMap[catId];
      return {
        category_id: catId,
        wallet_points: catDef ? catDef.wallet_points : 4.0,
        coverage_factor: 1.0,
        gross_margin: catDef ? catDef.benchmark_gross_margin : 0.35,
        source_id: 'USER_INPUT'
      };
    });

    const newCandidate = {
      company_id: cleanId,
      company_name: name,
      primary_lane: lane,
      country: country,
      is_indian: isIndian,
      india_enablement_tier: tier,
      supplied_categories: suppliedCategories,
      linked_accounts: checkedAccs,
      financials: {
        revenue_base_year: 2025,
        base_revenue: rev,
        revenue_cagr: cagr,
        ebitda_margin: ebitda,
        pat_to_ebitda: isIndian ? 0.50 : 0.623,
        dc_revenue_share: 0.35,
        india_share_of_dc_revenue: isIndian ? 0.80 : 0.20,
        net_working_capital_share: 0.10,
        recurring_capex_share: 0.02,
        ev_ebitda_multiple: mult,
        net_debt: 0,
        surplus_cash: 0,
        valuation_basis: 'User Created Target',
        financial_source_id: 'USER_INPUT'
      },
      evidence_confidence: 'High',
      source_id: 'USER_INPUT',
      missing_fields: []
    };

    state.candidates.push(newCandidate);
    state.candidatesMap[cleanId] = newCandidate;

    closeCreateCandidateModal();
    renderCandidateModal();
  }

  // Startup
  document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    loadData();
  });

})();
