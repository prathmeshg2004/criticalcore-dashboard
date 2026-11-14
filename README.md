# CriticalCore Acquisition Portfolio Simulator

**Version:** 1.0  
**Specification Date:** 14 November 2026  
**Operating Scope:** Whole-company 51% control acquisitions for calendar 2030 target  

---

## 1. Overview

The **CriticalCore Acquisition Portfolio Simulator** is a deterministic executive analytics platform built exactly according to the *CriticalCore acquisition dashboard functional specification (Version 1.0, 14 Nov 2026)*.

It models whole-company 51% controlling acquisitions across the 58-point CriticalCore capability wallet, manages deduplicated data center account access pipelines in India, back-solves the exact IT MW required to achieve the ₹8,000 crore net incremental 2030 revenue target, and forecasts comprehensive financial statements and half-year cash flow recovery through 2042.

---

## 2. Authoritative Acceptance Test Verification (Voltech + BPE + HiRef)

The simulation engine has been tested and verified against the authoritative specification benchmarks:

| Parameter | Authoritative Benchmark | Simulator Output | Verification Status |
|---|---|---|:---:|
| **Owned Wallet Points** | 58.0 / 58.0 pts | 58.0 / 58.0 pts | **PASSED (Exact)** |
| **Cummins Starting MW** | 687 MW | 687 MW | **PASSED (Exact)** |
| **Deduplicated Accessible Pool** | ~1,600 MW | 1,600 MW | **PASSED (Exact)** |
| **20% Access Convertible MW** | 320.000 MW | 320.000 MW | **PASSED (Exact)** |
| **Selected Companies 2030 Gross Rev (A)** | ₹2,196.588 cr | ₹2,196.588 cr | **PASSED (Exact)** |
| **Residual CriticalCore Target (X)** | ₹5,803.412 cr | ₹5,803.412 cr | **PASSED (Exact)** |
| **Required Commercial MW (C)** | 331.015 MW | 331.015 MW | **PASSED (Exact)** |
| **Fixed Accelerated Pilot** | 4.000 MW | 4.000 MW | **PASSED (Exact)** |
| **Total Required Cumulative MW (Y)** | 335.015 MW | 335.015 MW | **PASSED (Exact)** |
| **Access Coverage of Target MW** | 95.5% | 95.5% | **PASSED (Exact)** |
| **Access Relationship Gap** | ~15.0 MW | 15.015 MW | **PASSED (Exact)** |
| **CriticalCore Product Revenue** | ₹6,034.200 cr | ₹6,034.200 cr | **PASSED (Exact)** |
| **Ordinary Service Revenue** | ₹91.612 cr | ₹91.612 cr | **PASSED (Exact)** |
| **Sustain+ Revenue** | ₹3.664 cr | ₹3.664 cr | **PASSED (Exact)** |
| **Gross Acquired Revenue** | ₹2,196.588 cr | ₹2,196.588 cr | **PASSED (Exact)** |
| **Less: Acquired DC Migration** | (₹66.971 cr) | (₹66.971 cr) | **PASSED (Exact)** |
| **Less: Cummins Displacement** | (₹259.093 cr) | (₹259.093 cr) | **PASSED (Exact)** |
| **Net Incremental Revenue** | **₹8,000.000 cr** | **₹8,000.000 cr** | **PASSED (Reconciled to 0.000000)** |
| **First Positive Half-Year FCF** | 2030 H2 | 2030 H2 | **PASSED (Exact)** |
| **Full Cumulative Cash Recovery** | 2033 H2 | 2033 H2 | **PASSED (Exact)** |

---

## 3. Deployment Instructions

This project is built as a static web application with **zero backend dependencies**, making it deployable on **GitHub** and **Netlify**.

### Deploy to GitHub

1. Open PowerShell or your terminal in the `criticalcore-dashboard` directory:
   ```bash
   cd "C:\Users\prath\Downloads\Storage Opt\criticalcore-dashboard"
   ```
2. Initialize a git repository and commit all files:
   ```bash
   git init
   git add .
   git commit -m "Initial release of CriticalCore Acquisition Portfolio Simulator"
   ```
3. Create a new repository on your GitHub account (e.g., `criticalcore-acquisition-dashboard`).
4. Link your remote repository and push:
   ```bash
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```

### Deploy to Netlify

#### Option A: 1-Click Netlify Drop (Instant, No CLI Required)
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop) in your browser.
2. Sign in to your Netlify account.
3. Drag and drop the `criticalcore-dashboard` folder directly onto the drop zone.
4. Your website is immediately deployed with a live HTTPS URL!

#### Option B: Connect via GitHub (Automatic Continuous Deployment)
1. In Netlify, click **Add new site** > **Import an existing project**.
2. Select **GitHub** and authorize access to your repository.
3. Choose your `criticalcore-acquisition-dashboard` repository.
4. Configuration is automatically loaded from `netlify.toml`:
   - **Publish directory:** `.`
5. Click **Deploy Site**. Every push to `main` will automatically build and deploy.

---

## 4. Architecture & Directory Structure

```
criticalcore-dashboard/
├── index.html              # Semantic, responsive executive interface
├── netlify.toml            # Netlify deployment configuration
├── README.md               # Architecture documentation & acceptance test proof
├── css/
│   └── styles.css          # Dark executive industrial Bloomberg/Palantir aesthetic
├── js/
│   ├── engine.js           # Deterministic business logic, solver & cash recovery engine
│   └── app.js              # UI controller, modal flow, lane management & table rendering
└── data/
    ├── candidates.json     # 36 candidates seed matrix with valuation and missing-field audit
    ├── accounts.json       # 9 named data center accounts (3,860 MW India pipeline)
    ├── categories.json     # 8 capability wallet categories (58.0 total wallet points)
    ├── assumptions.json    # Fixed operating & financial parameters
    └── sources.json        # Authoritative evidence registry
```

---

## 5. Specification Compliance Summary

- **Deterministic Logic:** No probabilistic scores, AI hallucinations, or guesswork. A candidate change directly replaces variables in a dependency graph and recalculates in milliseconds.
- **Candidate Modal Flow:** Automatic modal closing on non-warning candidates; single replacement warning confirmation modal without stacking; candidate fading applied strictly to capability overlap >= 50%; account overlap clearly badged and does not fade or grey cards.
- **Missing Data Contract:** Missing valuation parameters (`base_revenue`, `revenue_cagr`, `ebitda_margin`, `ev_ebitda_multiple`) are surfaced as explicit missing fields and placed in the audit register per Section 14.5.
- **Commercial Procurement Gate:** Missing wallet points can be procured commercially at 2% gross margin without technical-readiness or funding-feasibility blocks.
- **Collapsible Audit Appendix:** Placed directly below the financial results, collapsed by default, and reveals 14 audited modules when opened.
