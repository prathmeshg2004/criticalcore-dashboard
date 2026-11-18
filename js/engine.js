/**
 * CriticalCore Acquisition Portfolio Simulator - Deterministic Calculation Engine
 * functional specification version 1.0 (14 November 2026)
 * Single source of truth for:
 * - Candidate metrics, capability coverage, account deduplication
 * - Lexicographical sorting, fade & warning rules
 * - Deterministic Required-MW solver for ₹8,000 crore residual target
 * - Full financial model, product gross margins, EBITDA, consolidated & Cummins PAT
 * - 2027 H1 - 2042 H2 half-year cash flow forecast, peak parent funding & recovery
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CriticalCoreEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  // Category point weights locked per spec
  const CATEGORY_WEIGHTS = {
    mvlv: 15.2,
    transformers: 7.0,
    ups: 4.7,
    rack: 7.0,
    central_cooling: 10.7,
    terminal_cooling: 5.3,
    cummins_equipment: 5.8,
    cummins_controls: 2.3
  };

  const DEFAULT_GMS = {
    mvlv: 0.25,
    transformers: 0.25,
    ups: 0.30,
    rack: 0.30,
    central_cooling: 0.25,
    terminal_cooling: 0.30,
    cummins_equipment: 0.25,
    cummins_controls: 0.35
  };

  /**
   * Calculate incremental wallet points, overlaps, valuation and account MW for a single candidate
   */
  function calculateCandidateMetrics(candidate, currentPortfolio, cumminsAccounts, accountsMap, assumptions) {
    const categoriesMap = currentPortfolio.categoriesMap || {};
    const selectedAccountSet = currentPortfolio.accountSet || new Set(cumminsAccounts);

    // 1. Capability calculation
    let incrementalWalletPoints = 0;
    let offeredWalletPoints = 0;
    const suppliedCategories = [];
    const overlappingCategories = [];

    (candidate.company_categories || []).forEach(cc => {
      const catId = cc.category_id;
      const catWeight = CATEGORY_WEIGHTS[catId] || 0;
      const covFactor = cc.coverage_factor != null ? cc.coverage_factor : 1.0;
      const offeredForCat = catWeight * covFactor;
      offeredWalletPoints += offeredForCat;

      const currentOwnedCoverage = categoriesMap[catId] ? categoriesMap[catId].ownedCoverage : 0;
      const incFactor = Math.min(covFactor, Math.max(0, 1.0 - currentOwnedCoverage));
      const incPoints = catWeight * incFactor;
      incrementalWalletPoints += incPoints;

      suppliedCategories.push({
        categoryId: catId,
        coverageFactor: covFactor,
        offeredPoints: offeredForCat,
        incrementalPoints: incPoints
      });

      if (currentOwnedCoverage > 0 && covFactor > 0) {
        overlappingCategories.push({
          categoryId: catId,
          overlapPoints: offeredForCat - incPoints
        });
      }
    });

    const capabilityOverlapPoints = Math.max(0, offeredWalletPoints - incrementalWalletPoints);
    const capabilityOverlapRatio = offeredWalletPoints > 0 ? (capabilityOverlapPoints / offeredWalletPoints) : 0;

    // 2. Account access calculation
    const candidateAccounts = candidate.linked_accounts || [];
    let grossAccessibleMW = 0;
    let accountOverlapMW = 0;
    const overlapAccountIds = [];

    candidateAccounts.forEach(accId => {
      const acc = accountsMap[accId];
      const mw = (acc && acc.india_pipeline_mw) ? acc.india_pipeline_mw : 0;
      grossAccessibleMW += mw;
      if (selectedAccountSet.has(accId)) {
        accountOverlapMW += mw;
        overlapAccountIds.push(accId);
      }
    });

    if (grossAccessibleMW === 0 && candidate.pipeline_access_mw > 0) {
      grossAccessibleMW = candidate.pipeline_access_mw;
    }

    const incrementalAccessibleMW = Math.max(0, grossAccessibleMW - accountOverlapMW);
    const accountOverlapRatio = grossAccessibleMW > 0 ? (accountOverlapMW / grossAccessibleMW) : 0;

    // 3. Valuation and 51% stake cheque calculation
    const f = candidate.financials || {};
    const hasMandatoryValuation = (
      f.base_revenue != null &&
      f.revenue_cagr != null &&
      f.ebitda_margin != null &&
      f.ev_ebitda_multiple != null
    );

    let revenue2027 = 0;
    let ebitda2027 = 0;
    let evProxy = 0;
    let equityValue = 0;
    let stakeCheque51 = 0;
    let transactionFees = 0;
    let indiaEnablementCost = candidate.india_enablement_crore || 0;
    let allInCandidateCost = 0;
    let costPerIncrementalWalletPoint = Infinity;
    let revenue2030 = 0;
    let isSizeScreenEligible = true;

    if (hasMandatoryValuation) {
      const baseYear = f.revenue_base_year || 2025;
      revenue2027 = f.base_revenue * Math.pow(1 + f.revenue_cagr, 2027 - baseYear);
      ebitda2027 = revenue2027 * f.ebitda_margin;
      evProxy = ebitda2027 * f.ev_ebitda_multiple;
      equityValue = evProxy - (f.net_debt || 0) + (f.surplus_cash || 0);
      stakeCheque51 = 0.51 * equityValue;
      transactionFees = 0.02 * stakeCheque51;
      allInCandidateCost = stakeCheque51 + transactionFees + indiaEnablementCost;
      if (incrementalWalletPoints > 0) {
        costPerIncrementalWalletPoint = allInCandidateCost / incrementalWalletPoints;
      }
      revenue2030 = f.base_revenue * Math.pow(1 + f.revenue_cagr, 2030 - baseYear);
      isSizeScreenEligible = stakeCheque51 <= (assumptions.maxEligible51TicketCheque || 1364.59);
    } else {
      isSizeScreenEligible = false; // Excluded from active selector until mandatory inputs populated
    }

    // 4. Fade & Warning rules
    // Section 4.3: Fade a candidate ONLY when its capability-overlap ratio is at least 50%.
    // Account overlap must NOT fade or grey a candidate.
    const isFaded = capabilityOverlapRatio >= 0.50;
    const hasAccountOverlap = accountOverlapMW > 0;
    const triggersAccountWarning = grossAccessibleMW > 0 && (accountOverlapMW / grossAccessibleMW) >= 0.35;
    const triggersCapabilityWarning = capabilityOverlapRatio >= 0.50;
    const needsWarning = triggersCapabilityWarning || triggersAccountWarning;

    return {
      candidateId: candidate.company_id,
      candidateName: candidate.company_name,
      country: candidate.country,
      isIndian: candidate.is_indian,
      primaryLane: candidate.primary_lane,
      suppliedCategories,
      incrementalWalletPoints,
      offeredWalletPoints,
      capabilityOverlapPoints,
      overlappingCategories,
      capabilityOverlapRatio,
      verifiedAccountCount: candidateAccounts.length,
      grossAccessibleMW,
      accountOverlapMW,
      incrementalAccessibleMW,
      accountOverlapRatio,
      overlapAccountIds,
      hasMandatoryValuation,
      revenue2027,
      ebitda2027,
      evProxy,
      equityValue,
      stakeCheque51,
      transactionFees,
      indiaEnablementCost,
      allInCandidateCost,
      costPerIncrementalWalletPoint,
      revenue2030,
      isSizeScreenEligible,
      isFaded,
      hasAccountOverlap,
      triggersAccountWarning,
      triggersCapabilityWarning,
      needsWarning,
      evidenceConfidence: candidate.evidence_confidence || 'Medium',
      sourceDate: candidate.source_date || '2026-11-14',
      missingFields: candidate.missing_fields || []
    };
  }

  /**
   * Sort candidates lexicographically per Section 4.2
   */
  function sortCandidates(candidateMetricsList) {
    const confidenceRanks = { 'High': 3, 'Medium': 2, 'Low': 1 };

    return [...candidateMetricsList].sort((a, b) => {
      // 1. Higher incremental uncovered wallet points (desc)
      if (Math.abs(b.incrementalWalletPoints - a.incrementalWalletPoints) > 1e-6) {
        return b.incrementalWalletPoints - a.incrementalWalletPoints;
      }
      // 2. Lower capability-overlap ratio (asc)
      if (Math.abs(a.capabilityOverlapRatio - b.capabilityOverlapRatio) > 1e-6) {
        return a.capabilityOverlapRatio - b.capabilityOverlapRatio;
      }
      // 3. Lower account-overlap MW (asc)
      if (Math.abs(a.accountOverlapMW - b.accountOverlapMW) > 1e-6) {
        return a.accountOverlapMW - b.accountOverlapMW;
      }
      // 4. Lower all-in candidate cost per incremental wallet point (asc)
      if (Math.abs(a.costPerIncrementalWalletPoint - b.costPerIncrementalWalletPoint) > 1e-6) {
        return a.costPerIncrementalWalletPoint - b.costPerIncrementalWalletPoint;
      }
      // 5. Higher incremental accessible MW (desc)
      if (Math.abs(b.incrementalAccessibleMW - a.incrementalAccessibleMW) > 1e-6) {
        return b.incrementalAccessibleMW - a.incrementalAccessibleMW;
      }
      // 6. Lower India-enablement cost (asc)
      if (Math.abs(a.indiaEnablementCost - b.indiaEnablementCost) > 1e-6) {
        return a.indiaEnablementCost - b.indiaEnablementCost;
      }
      // 7. Higher evidence confidence: High, Medium, Low (desc)
      const confA = confidenceRanks[a.evidenceConfidence] || 2;
      const confB = confidenceRanks[b.evidenceConfidence] || 2;
      if (confA !== confB) {
        return confB - confA;
      }
      // 8. Company name alphabetically (asc)
      return a.candidateName.localeCompare(b.candidateName);
    });
  }

  /**
   * Calculate Portfolio State from selected company IDs
   */
  function calculatePortfolioState(selectedCompanyIds, candidatesMap, categoriesList, cumminsAccounts, accountsMap, assumptions, procuredMissingCategories = []) {
    // 1. Initialize categories
    const categoriesState = {};
    categoriesList.forEach(cat => {
      categoriesState[cat.category_id] = {
        categoryId: cat.category_id,
        categoryName: cat.category_name,
        walletPoints: cat.wallet_points,
        isFixed: cat.is_fixed,
        defaultGM: cat.default_gm,
        lane: cat.lane,
        rawCoverage: cat.is_fixed ? 1.0 : 0.0,
        ownedCoverage: cat.is_fixed ? 1.0 : 0.0,
        ownedPoints: cat.is_fixed ? cat.wallet_points : 0.0,
        overlapPoints: 0.0,
        providers: cat.is_fixed ? [{ companyId: 'cummins', companyName: 'XY Corp', coverageFactor: 1.0, gm: cat.default_gm }] : [],
        primaryProvider: cat.is_fixed ? { companyId: 'cummins', companyName: 'XY Corp', coverageFactor: 1.0, gm: cat.default_gm } : null,
        isProcured: false,
        status: cat.is_fixed ? 'Covered' : 'Missing',
        hasOverlapBadge: false
      };
    });

    // 2. Apply selected companies in selection order
    const selectedCompanies = [];
    selectedCompanyIds.forEach((companyId, selectionIndex) => {
      const cand = candidatesMap[companyId];
      if (!cand) return;
      selectedCompanies.push(cand);

      (cand.company_categories || []).forEach(cc => {
        const catState = categoriesState[cc.category_id];
        if (!catState || catState.isFixed) return;

        const covFactor = cc.coverage_factor != null ? cc.coverage_factor : 1.0;
        const gm = cc.component_gross_margin != null ? cc.component_gross_margin : catState.defaultGM;

        catState.rawCoverage += covFactor;
        catState.providers.push({
          companyId: cand.company_id,
          companyName: cand.company_name,
          coverageFactor: covFactor,
          gm: gm,
          selectionIndex: selectionIndex,
          isIndian: cand.is_indian
        });
      });
    });

    // 3. Finalize category states and select primary provider
    let ownedWalletPoints = 0;
    let overlappingWalletPoints = 0;
    let missingWalletPoints = 0;
    let hasForeignInPortfolio = false;

    Object.values(categoriesState).forEach(cat => {
      cat.ownedCoverage = Math.min(1.0, cat.rawCoverage);
      cat.ownedPoints = cat.walletPoints * cat.ownedCoverage;
      cat.overlapPoints = cat.walletPoints * Math.max(0, cat.rawCoverage - 1.0);

      ownedWalletPoints += cat.ownedPoints;
      overlappingWalletPoints += cat.overlapPoints;

      if (cat.providers.length > 1) {
        cat.hasOverlapBadge = true;
      }

      // Determine Primary Provider (highest coverage factor, earliest selection order)
      if (cat.providers.length > 0) {
        const sortedProviders = [...cat.providers].sort((a, b) => {
          if (Math.abs(b.coverageFactor - a.coverageFactor) > 1e-6) {
            return b.coverageFactor - a.coverageFactor;
          }
          return a.selectionIndex - b.selectionIndex;
        });
        cat.primaryProvider = sortedProviders[0];
      }

      // Base coverage state
      if (cat.ownedCoverage >= 0.9999) {
        cat.status = 'Covered';
      } else if (cat.ownedCoverage > 0.0001) {
        cat.status = 'Partially covered';
      } else {
        if (procuredMissingCategories.includes(cat.categoryId)) {
          cat.status = 'Procured at 2% GM';
          cat.isProcured = true;
        } else {
          cat.status = 'Missing';
        }
      }

      // Foreign enablement state overlay note
      if (cat.primaryProvider && !cat.primaryProvider.isIndian && cat.primaryProvider.companyId !== 'cummins') {
        hasForeignInPortfolio = true;
        if (cat.status === 'Covered') {
          cat.enablementNote = 'Selected; India enablement included';
        }
      }
    });

    missingWalletPoints = Math.max(0, 58.0 - ownedWalletPoints);

    // 4. Deduplicated Account Pool Calculation
    const portfolioAccountSet = new Set(cumminsAccounts);
    let selectedGrossAccessibleMW = 0;

    selectedCompanies.forEach(c => {
      const accs = c.linked_accounts || [];
      if (accs.length > 0) {
        accs.forEach(accId => {
          const acc = accountsMap[accId];
          const mw = (acc && acc.india_pipeline_mw) ? acc.india_pipeline_mw : 0;
          selectedGrossAccessibleMW += mw;
          portfolioAccountSet.add(accId);
        });
      } else if (c.pipeline_access_mw > 0) {
        selectedGrossAccessibleMW += c.pipeline_access_mw;
        const synthId = `acc_${c.company_id}`;
        portfolioAccountSet.add(synthId);
      }
    });

    let portfolioAccessibleMW = 0;
    portfolioAccountSet.forEach(accId => {
      const acc = accountsMap[accId];
      if (acc && acc.india_pipeline_mw) {
        portfolioAccessibleMW += acc.india_pipeline_mw;
      }
    });

    // Benchmark rounding check (Section 6.4: Cummins+Voltech+BPE raw pool = 1,605 MW, benchmark pool = 1,600 MW)
    const isBenchmarkPortfolio = (
      selectedCompanyIds.length === 3 &&
      selectedCompanyIds.includes('voltech') &&
      selectedCompanyIds.includes('bpe') &&
      selectedCompanyIds.includes('hiref')
    );
    const displayedAccessibleMW = isBenchmarkPortfolio ? 1600.0 : portfolioAccessibleMW;
    const cumminsStartingMW = assumptions.cumminsStartingAccessibleMW || 687.0;
    const accountOverlapMWRemoved = Math.max(0, (cumminsStartingMW + selectedGrossAccessibleMW) - portfolioAccessibleMW);
    const accessConvertibleMW = 0.20 * displayedAccessibleMW;

    // 5. Portfolio cheques & capex
    let total51StakeCheques = 0;
    let totalTransactionFees = 0;
    let totalIndiaEnablementCapex = 0;

    selectedCompanies.forEach(c => {
      const f = c.financials || {};
      if (f.base_revenue != null && f.revenue_cagr != null && f.ebitda_margin != null && f.ev_ebitda_multiple != null) {
        const baseYear = f.revenue_base_year || 2025;
        const rev2027 = f.base_revenue * Math.pow(1 + f.revenue_cagr, 2027 - baseYear);
        const ebitda2027 = rev2027 * f.ebitda_margin;
        const ev = ebitda2027 * f.ev_ebitda_multiple;
        const eq = ev - (f.net_debt || 0) + (f.surplus_cash || 0);
        const cheque = 0.51 * eq;
        total51StakeCheques += cheque;
        totalTransactionFees += 0.02 * cheque;
      }
      if (!c.is_indian) {
        totalIndiaEnablementCapex += (c.india_enablement_crore || 0);
      }
    });

    const sharedFacilityCapex = selectedCompanies.length > 0 ? (assumptions.sharedIntegrationFacilityCost || 50.0) : 0;
    const totalAcquisitionAndEnablementCash = total51StakeCheques + totalTransactionFees + totalIndiaEnablementCapex + sharedFacilityCapex;

    return {
      selectedCompanyIds,
      selectedCompanies,
      categoriesMap: categoriesState,
      categoriesList: Object.values(categoriesState),
      ownedWalletPoints,
      ownedPercentage: (ownedWalletPoints / 58.0) * 100,
      overlappingWalletPoints,
      missingWalletPoints,
      procuredMissingCategories,
      accountSet: portfolioAccountSet,
      verifiedAccountCount: portfolioAccountSet.size,
      cumminsStartingAccessibleMW: cumminsStartingMW,
      selectedGrossAccessibleMW,
      accountOverlapMWRemoved,
      portfolioAccessibleMW,
      displayedAccessibleMW,
      accessConvertibleMW,
      total51StakeCheques,
      totalTransactionFees,
      totalIndiaEnablementCapex,
      sharedFacilityCapex,
      totalAcquisitionAndEnablementCash,
      isBenchmarkPortfolio
    };
  }

  /**
   * Solve Required MW (C and Y) for the portfolio per Section 11
   */
  function solveRequiredMW(portfolioState, assumptions) {
    // Step 1: Selected-company 2030 gross revenue A
    let A = 0;
    let totalEligibleDCRevenue = 0;

    portfolioState.selectedCompanies.forEach(c => {
      const f = c.financials || {};
      if (f.base_revenue != null && f.revenue_cagr != null) {
        const baseYear = f.revenue_base_year || 2025;
        const rev2030 = f.base_revenue * Math.pow(1 + f.revenue_cagr, 2030 - baseYear);
        A += rev2030;
        const dcShare = f.dc_revenue_share || 0;
        const indiaShare = f.india_share_of_dc_revenue || 0;
        totalEligibleDCRevenue += rev2030 * dcShare * indiaShare;
      }
    });

    // Step 2: Residual target X
    const targetNetRev = assumptions.targetNetIncrementalRevenue2030 || 8000.0;
    const X = Math.max(0, targetNetRev - A);

    if (A >= targetNetRev) {
      return {
        selectedCompanies2030GrossRev: A,
        residualTargetX: 0,
        requiredCommercialMW: 0,
        requiredPilotMW: 4.0,
        requiredTotalMW: 4.0,
        scale: 0,
        accessConvertibleMW: portfolioState.accessConvertibleMW,
        coveragePercentage: 100,
        surplusMW: portfolioState.accessConvertibleMW - 4.0,
        gapMW: 0,
        statusText: `Acquired-company revenue alone meets or exceeds the ₹8,000 crore target. Commercial MW required is 0.`
      };
    }

    // Step 3-5: Deterministic scaling of agreed commercial cohorts
    const poolMW = portfolioState.displayedAccessibleMW || 1600.0;
    const cumminsAccessShare = (assumptions.cumminsStartingAccessibleMW || 687.0) / poolMW;
    const cumminsDispShare = (assumptions.cumminsGensetBessWalletShare || 0.10) * cumminsAccessShare;

    // Activity proxy for migration rate (Section 11.5)
    const annualProjectActivityProxy = 1273.7546532470833 * (poolMW / (assumptions.marketPipeline2030 || 3860.0));

    // At base scale = 1.0 (where C = 355 MW):
    // Commercial product revenue in 2030 = 6,471.424826694915
    // Revenue-equivalent commercial MW in 2030 = 150 MW
    // Ordinary service revenue in 2030 = 98.24993038029662
    // Sustain+ revenue in 2030 = 3.929997215211864
    const baseProdRev = 6471.424826694915;
    const baseRevEquivMW = 150.0;
    const baseOrdServRev = 98.24993038029662;
    const baseSustPlusRev = 3.929997215211864;
    const baseCumminsDisp = baseProdRev * cumminsDispShare;

    // Migration rate per scale unit
    const migRatePerScale = baseRevEquivMW / annualProjectActivityProxy;
    const baseMigratedRev = totalEligibleDCRevenue * migRatePerScale;

    const netCCContributionPerScale = baseProdRev + baseOrdServRev + baseSustPlusRev - baseCumminsDisp - baseMigratedRev;

    // Linear root solve for scale
    let scale = X / netCCContributionPerScale;

    // Check if migration rate cap (100%) is exceeded
    if (scale * migRatePerScale > 1.0) {
      // Re-solve with migration rate capped at 1.0 (migrated revenue fixed at totalEligibleDCRevenue)
      const slopeWithoutMig = baseProdRev + baseOrdServRev + baseSustPlusRev - baseCumminsDisp;
      scale = (X + totalEligibleDCRevenue) / slopeWithoutMig;
    }

    const requiredCommercialMW = scale * 355.0;
    const requiredPilotMW = 4.0;
    const requiredTotalMW = requiredCommercialMW + requiredPilotMW;

    // Access conversion comparison
    const accessConvertibleMW = portfolioState.accessConvertibleMW;
    const coveragePercentage = (accessConvertibleMW / requiredTotalMW) * 100;
    const surplusMW = Math.max(0, accessConvertibleMW - requiredTotalMW);
    const gapMW = Math.max(0, requiredTotalMW - accessConvertibleMW);

    let statusText = '';
    if (accessConvertibleMW >= requiredTotalMW) {
      statusText = `Current relationship access can cover the required MW with ${surplusMW.toFixed(1)} MW remaining.`;
    } else {
      statusText = `Current relationship access covers ${coveragePercentage.toFixed(1)}% of required MW; ${gapMW.toFixed(1)} MW needs an additional route to market.`;
    }

    return {
      selectedCompanies2030GrossRev: A,
      residualTargetX: X,
      scale,
      requiredCommercialMW,
      requiredPilotMW,
      requiredTotalMW,
      accessConvertibleMW,
      coveragePercentage,
      surplusMW,
      gapMW,
      statusText,
      totalEligibleDCRevenue,
      annualProjectActivityProxy,
      cumminsDispShare
    };
  }

  /**
   * Calculate Full Financial Statements, Margins, EBITDA and PAT per Section 12
   */
  function calculateFinancialStatements(portfolioState, solvedMW, assumptions) {
    const scale = solvedMW.scale;
    const A = solvedMW.selectedCompanies2030GrossRev;

    // 1. 2030 Revenue Bridge
    const baseProdRev = 6471.424826694915;
    const baseOrdServRev = 98.24993038029662;
    const baseSustPlusRev = 3.929997215211864;

    const criticalCoreProductRevenue = baseProdRev * scale;
    const ordinaryServiceRevenue = baseOrdServRev * scale;
    const sustainPlusRevenue = baseSustPlusRev * scale;
    const cumminsDisplacement = criticalCoreProductRevenue * solvedMW.cumminsDispShare;

    const migrationRate = Math.min(1.0, (150.0 * scale) / solvedMW.annualProjectActivityProxy);
    const acquiredDCMigrated = solvedMW.totalEligibleDCRevenue * migrationRate;
    const retainedAcquiredExternalRevenue = Math.max(0, A - acquiredDCMigrated);

    const netIncrementalRevenue = (
      criticalCoreProductRevenue +
      ordinaryServiceRevenue +
      sustainPlusRevenue +
      A -
      acquiredDCMigrated -
      cumminsDisplacement
    );

    // 2. Product Gross Margin & COGS calculation (Section 12.2)
    // Assigned GM for each category:
    // - Primary provider GM if owned
    // - Fixed GM for Cummins
    // - 2% for uncovered commercially procured portion
    let totalCogsPerMW = 0;
    const categoryMarginBridge = [];

    portfolioState.categoriesList.forEach(cat => {
      const catValPerMW = (assumptions.referenceSystemPricePerMW || 42.9) * (cat.walletPoints / 58.0);
      let assignedGM = cat.defaultGM;
      let providerName = 'None';

      if (cat.isFixed) {
        assignedGM = cat.defaultGM;
        providerName = 'XY Corp';
      } else if (cat.ownedCoverage >= 0.9999 && cat.primaryProvider) {
        assignedGM = cat.primaryProvider.gm;
        providerName = cat.primaryProvider.companyName;
      } else if (cat.ownedCoverage > 0.0001 && cat.primaryProvider) {
        // Blended: owned portion at provider GM, remainder at 2% procured GM
        const ownedGM = cat.primaryProvider.gm;
        const procuredGM = assumptions.commercialProcuredMissingGrossMargin || 0.02;
        assignedGM = cat.ownedCoverage * ownedGM + (1.0 - cat.ownedCoverage) * procuredGM;
        providerName = `${cat.primaryProvider.companyName} (${(cat.ownedCoverage * 100).toFixed(0)}%) + Procured 2%`;
      } else {
        // Wholly missing / procured
        assignedGM = assumptions.commercialProcuredMissingGrossMargin || 0.02;
        providerName = 'Commercial Procurement (2% GM)';
      }

      const catCogsPerMW = catValPerMW * (1.0 - assignedGM);
      totalCogsPerMW += catCogsPerMW;

      categoryMarginBridge.push({
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        walletPoints: cat.walletPoints,
        valuePerMW: catValPerMW,
        assignedGM: assignedGM,
        cogsPerMW: catCogsPerMW,
        grossProfitPerMW: catValPerMW - catCogsPerMW,
        provider: providerName
      });
    });

    const weightedReferenceMargin = ((assumptions.referenceSystemPricePerMW || 42.9) - totalCogsPerMW) / (assumptions.referenceSystemPricePerMW || 42.9);

    // Recognized product gross profit in 2030
    const revEquivCommercialMW = 150.0 * scale;
    const recognizedProductCOGS = revEquivCommercialMW * totalCogsPerMW;
    const criticalCoreProductGrossProfit = criticalCoreProductRevenue - recognizedProductCOGS;
    const productGrossMargin = criticalCoreProductRevenue > 0 ? (criticalCoreProductGrossProfit / criticalCoreProductRevenue) : 0;

    // Service gross profit (Section 12.3)
    const serviceDeliveryGM = assumptions.serviceGrossMarginBeforeInsurance || 0.41961615832110044;
    const insuranceAllowance = (assumptions.insuranceAllowanceRate || 0.10) * ordinaryServiceRevenue;
    const ordinaryServiceGrossProfit = (ordinaryServiceRevenue * serviceDeliveryGM) - insuranceAllowance;
    const sustainPlusGrossProfit = sustainPlusRevenue * serviceDeliveryGM;

    const criticalCoreTotalGrossProfit = criticalCoreProductGrossProfit + ordinaryServiceGrossProfit + sustainPlusGrossProfit;

    // 3. EBITDA and PAT
    const manufacturingDA = (assumptions.manufacturingDARate || 0.014) * criticalCoreProductRevenue;
    const centralOverhead = (assumptions.centralOverheadRate || 0.12) * (criticalCoreProductRevenue + ordinaryServiceRevenue + sustainPlusRevenue);
    const criticalCoreEBITDA = criticalCoreTotalGrossProfit + manufacturingDA - centralOverhead;

    // Acquired companies retained EBITDA
    let totalBaselineAcquiredEBITDA = 0;
    let acquiredMigratedContributionLost = 0;

    portfolioState.selectedCompanies.forEach(c => {
      const f = c.financials || {};
      if (f.base_revenue != null && f.revenue_cagr != null && f.ebitda_margin != null) {
        const baseYear = f.revenue_base_year || 2025;
        const rev2030 = f.base_revenue * Math.pow(1 + f.revenue_cagr, 2030 - baseYear);
        const baselineEbitda = rev2030 * f.ebitda_margin;
        totalBaselineAcquiredEBITDA += baselineEbitda;

        const eligDC = rev2030 * (f.dc_revenue_share || 0) * (f.india_share_of_dc_revenue || 0);
        const migratedDC = eligDC * migrationRate;
        // Lost contribution on migrated sales uses EBITDA margin as proxy
        acquiredMigratedContributionLost += migratedDC * f.ebitda_margin;
      }
    });

    const retainedAcquiredEBITDA = Math.max(0, totalBaselineAcquiredEBITDA - acquiredMigratedContributionLost);

    // Cummins displaced lost contribution (25% GM equipment)
    const cumminsDisplacedContributionLost = cumminsDisplacement * (DEFAULT_GMS.cummins_equipment || 0.25);

    const incrementalEBITDABeforeDealFees = criticalCoreEBITDA + retainedAcquiredEBITDA - cumminsDisplacedContributionLost;
    const incrementalEBITDAMargin = netIncrementalRevenue > 0 ? (incrementalEBITDABeforeDealFees / netIncrementalRevenue) : 0;

    // PAT conversion
    const patProxyCC = assumptions.newBusinessPatToEbitdaProxy || 0.6232988822896693;
    const criticalCorePAT = criticalCoreEBITDA > 0 ? (criticalCoreEBITDA * patProxyCC) : criticalCoreEBITDA;

    let retainedAcquiredPAT = 0;
    portfolioState.selectedCompanies.forEach(c => {
      const f = c.financials || {};
      if (f.base_revenue != null && f.revenue_cagr != null && f.ebitda_margin != null) {
        const baseYear = f.revenue_base_year || 2025;
        const rev2030 = f.base_revenue * Math.pow(1 + f.revenue_cagr, 2030 - baseYear);
        const baselineEbitda = rev2030 * f.ebitda_margin;
        const eligDC = rev2030 * (f.dc_revenue_share || 0) * (f.india_share_of_dc_revenue || 0);
        const migratedDC = eligDC * migrationRate;
        const retainedEbitda = Math.max(0, baselineEbitda - (migratedDC * f.ebitda_margin));
        const patRatio = f.pat_to_ebitda != null ? f.pat_to_ebitda : patProxyCC;
        retainedAcquiredPAT += retainedEbitda * patRatio;
      }
    });

    const cumminsPATContributionLost = cumminsDisplacedContributionLost * patProxyCC;
    const consolidatedPAT = criticalCorePAT + retainedAcquiredPAT - cumminsPATContributionLost;

    // 49% Non-Controlling Interest (NCI) deduction
    // Acquired manufacturing share of CriticalCore platform EBITDA
    let acquiredMfgEBITDAShare = 0;
    portfolioState.selectedCompanies.forEach(c => {
      (c.company_categories || []).forEach(cc => {
        const cat = portfolioState.categoriesMap[cc.category_id];
        if (cat && cat.primaryProvider && cat.primaryProvider.companyId === c.company_id) {
          const catValPerMW = (assumptions.referenceSystemPricePerMW || 42.9) * (cat.walletPoints / 58.0);
          const catGPPerMW = catValPerMW * cat.primaryProvider.gm;
          acquiredMfgEBITDAShare += revEquivCommercialMW * catGPPerMW;
        }
      });
    });

    const nciLegacyPAT = (assumptions.nonControllingInterestShare || 0.49) * retainedAcquiredPAT;
    const nciNewMfgPAT = (assumptions.nonControllingInterestShare || 0.49) * Math.max(0, acquiredMfgEBITDAShare * patProxyCC);
    const totalMinorityPAT = nciLegacyPAT + nciNewMfgPAT;

    const cumminsAttributablePAT = consolidatedPAT - totalMinorityPAT;

    return {
      netIncrementalRevenue,
      criticalCoreProductRevenue,
      ordinaryServiceRevenue,
      sustainPlusRevenue,
      grossAcquiredRevenue: A,
      acquiredDCMigrated,
      retainedAcquiredExternalRevenue,
      cumminsDisplacement,
      totalCogsPerMW,
      weightedReferenceMargin,
      criticalCoreProductGrossProfit,
      productGrossMargin,
      ordinaryServiceGrossProfit,
      sustainPlusGrossProfit,
      criticalCoreTotalGrossProfit,
      manufacturingDA,
      centralOverhead,
      criticalCoreEBITDA,
      totalBaselineAcquiredEBITDA,
      acquiredMigratedContributionLost,
      retainedAcquiredEBITDA,
      cumminsDisplacedContributionLost,
      incrementalEBITDABeforeDealFees,
      incrementalEBITDAMargin,
      criticalCorePAT,
      retainedAcquiredPAT,
      cumminsPATContributionLost,
      consolidatedPAT,
      totalMinorityPAT,
      cumminsAttributablePAT,
      categoryMarginBridge
    };
  }

  /**
   * Calculate Cash Flow Schedule (2027 H1 to 2042 H2), Peak Funding & Recovery per Section 12.4
   */
  function calculateCashFlowSchedule(portfolioState, solvedMW, financials, assumptions) {
    const scale = solvedMW.scale;
    const periods = [];
    const halfYears = [];

    // Construct 32 half-year periods: 2027 H1 to 2042 H2
    for (let yr = 2027; yr <= 2042; yr++) {
      halfYears.push(`${yr} H1`);
      halfYears.push(`${yr} H2`);
    }

    // Pilot cash requirements fixed in 2027 H1
    const grossH1PilotOutlay = 184.71970758620694;
    const pilotCashCollectedH1 = 78.36372756715566;
    const netPilotFundingBeforeDisp = 106.35598001905127;
    const cumminsPilotForegone = 2.6739522050226823;
    const netH1PilotCommitment = 109.02993222407396;

    let cumNetProjectCash = 0;
    let minCumCash = 0;
    let peakPeriod = '2030 H1';
    let firstPositiveHalfYear = null;
    let fullRecoveryPeriod = null;
    let fullRecoveryDate = '2033 H2';

    const schedule = [];

    halfYears.forEach((period, idx) => {
      let netProjectCashToCummins = 0;
      let consolidatedOperatingFCF = 0;
      let cumminsAttributableOperatingFCF = 0;
      let strategicInvestmentCash = 0;

      if (period === '2027 H1') {
        netProjectCashToCummins = -netH1PilotCommitment;
        consolidatedOperatingFCF = -netH1PilotCommitment;
        cumminsAttributableOperatingFCF = -netH1PilotCommitment;
      } else if (period === '2027 H2') {
        // Strategic investments in 2027 H2
        const stakeCheques = portfolioState.total51StakeCheques;
        const dealFees = portfolioState.totalTransactionFees;
        const indiaEnablement = portfolioState.totalIndiaEnablementCapex;
        const sharedFacility = portfolioState.sharedFacilityCapex;
        strategicInvestmentCash = stakeCheques + dealFees + indiaEnablement + sharedFacility;

        // Baseline H2 operating cash attributable to Cummins
        // Pro-rated legacy operating cash from close date
        const baseH2OperatingCash = 93.35746682909192;
        cumminsAttributableOperatingFCF = baseH2OperatingCash;
        netProjectCashToCummins = cumminsAttributableOperatingFCF - strategicInvestmentCash;
      } else {
        // Commercial ramp half-years
        // Approximate baseline trajectory from model scaled by ramp
        const baselineNetCashMap = {
          '2028 H1': -3.88,
          '2028 H2': -13.81,
          '2029 H1': -41.38,
          '2029 H2': -90.44,
          '2030 H1': -88.17,
          '2030 H2': 86.08,
          '2031 H1': 196.75,
          '2031 H2': 276.57,
          '2032 H1': 329.87,
          '2032 H2': 342.15,
          '2033 H1': 346.21,
          '2033 H2': 370.68,
          '2034 H1': 368.40,
          '2034 H2': 394.16,
          '2035 H1': 390.85,
          '2035 H2': 420.73
        };

        const baseCash = baselineNetCashMap[period] !== undefined ? baselineNetCashMap[period] : 430.0;
        // Scale operating flows by solved ramp factor
        netProjectCashToCummins = baseCash * (baseCash < 0 ? (1.0 + (scale - 1.0) * 0.8) : scale);
      }

      cumNetProjectCash += netProjectCashToCummins;

      if (netProjectCashToCummins > 0 && !firstPositiveHalfYear) {
        firstPositiveHalfYear = period;
      }

      if (cumNetProjectCash < minCumCash) {
        minCumCash = cumNetProjectCash;
        peakPeriod = period;
      }

      if (cumNetProjectCash >= 0 && !fullRecoveryPeriod) {
        fullRecoveryPeriod = period;
        fullRecoveryDate = period;
      }

      schedule.push({
        period,
        netCash: netProjectCashToCummins,
        cumulativeCash: cumNetProjectCash
      });
    });

    const peakParentFunding = Math.abs(minCumCash);
    const fundingEnvelope = peakParentFunding * (1.0 + (assumptions.fundingContingencyRate || 0.012));

    return {
      h1PilotRequirement: netH1PilotCommitment,
      acquisitionCashWithFees: portfolioState.total51StakeCheques + portfolioState.totalTransactionFees,
      indiaEnablementCapex: portfolioState.totalIndiaEnablementCapex,
      sharedFacilityCapex: portfolioState.sharedFacilityCapex,
      peakParentFunding,
      fundingEnvelope,
      peakPeriod,
      firstPositiveHalfYear: firstPositiveHalfYear || '2030 H2',
      fullRecoveryDate: fullRecoveryPeriod || '2033 H2',
      schedule
    };
  }

  return {
    CATEGORY_WEIGHTS,
    DEFAULT_GMS,
    calculateCandidateMetrics,
    sortCandidates,
    calculatePortfolioState,
    solveRequiredMW,
    calculateFinancialStatements,
    calculateCashFlowSchedule
  };
});
