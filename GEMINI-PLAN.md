# GEMINI-PLAN: Massive Improvements to SEO & Technical Reporting

This document outlines a plan to dramatically enhance our website analysis reports, focusing on technical SEO, AI-driven ranking insights, and a more intuitive, helpful presentation of data.

The core idea is to move beyond a simple checklist and provide a holistic, actionable "Website Health & AI Ranking" score, presented with clear visualizations like "Harmonia Bars".

## 1. Core Concept: The "Harmonia Score"

Instead of just a list of issues, we'll introduce a comprehensive "Harmonia Score". This score will be a visual representation (e.g., progress bars, circular gauges) of a site's overall quality, broken down into key pillars.

**Pillars of the Harmonia Score:**

*   **Technical SEO:** (40% weighting)
*   **On-Page SEO:** (30% weighting)
*   **Content Quality & AI Readability:** (20% weighting)
*   **User Experience (UX):** (10% weighting)

Each pillar will have its own score, represented by a "Harmonia Bar", which is then aggregated into the overall score.

## 2. Technical SEO Deep-Dive

This will be the most significant new section of the report. We need to go beyond surface-level checks.

### 2.1. JSON-LD Schema Analysis

*   **Schema Detection:** Automatically detect all `application/ld+json` scripts on the site.
*   **Schema Validation:** Validate the existing schema against Google's Rich Results Test and the Schema.org validator.
*   **Schema Opportunity Identification:**
    *   Identify the business type (e.g., LocalBusiness, Organization, eCommerce).
    *   Suggest missing, but highly relevant, schema types (e.g., `FAQPage`, `Product`, `Article`, `BreadcrumbList`).
    *   Provide copy-pasteable JSON-LD examples for the client to implement.
*   **Report Integration:** Display the current schema, validation status (pass/fail with errors), and opportunities in a clear, easy-to-understand format.

### 2.2. Advanced Technical Checks

We need to add more depth to our technical audit:

*   **Crawlability:** Check `robots.txt` for unintended blocks, analyze sitemap health.
*   **Core Web Vitals:** Deeper analysis of LCP, FID, and CLS beyond just the numbers. Pinpoint specific elements causing issues.
*   **HTTP/2 or HTTP/3 Usage:** Check for modern protocol usage.
*   **Security Headers:** Check for implementation of headers like `Content-Security-Policy`, `Strict-Transport-Security`, etc.

## 3. AI Ranking & Content Analysis

This is the "secret sauce". We'll use AI to provide insights that standard tools can't.

*   **AI Content Readability Score:** Analyze key pages and determine how easily an AI (like Google's models) can understand the content's purpose, entities, and relationships.
*   **Entity Salience Analysis:** Identify the main entities (people, places, topics) on a page and see if they align with the target keywords.
*   **E-E-A-T Heuristics:** Develop an AI-based check for signals related to Experience, Expertise, Authoritativeness, and Trustworthiness. This is speculative but a huge value-add. For example, checking for author bios, linked sources, etc.

## 4. Report Presentation with "Harmonia Bars"

*   **Dashboard:** The report's first page will be a dashboard dominated by the overall "Harmonia Score" and the individual "Harmonia Bars" for each pillar.
*   **Visual Cues:** Use colors (green, yellow, red) to indicate status.
*   **Action-Oriented:** Each recommendation will be clearly stated, with a "Why it matters" and "How to fix it" section. The technical recommendations (like JSON-LD) will include code snippets.

## 5. Implementation Plan

1.  **Phase 1: Technical Backend (This week)**
    *   Develop modules for advanced schema analysis (validation and opportunity).
    *   Integrate a more robust crawler for deeper technical checks.
    *   Setup the basic "Harmonia Score" calculation logic.

2.  **Phase 2: AI Integration (Next week)**
    *   Prototype the AI readability and entity analysis features using a suitable large language model.
    *   Develop the E-E-A-T heuristic checks.

3.  **Phase 3: Frontend/UI (Following week)**
    *   Design and implement the new report template with the "Harmonia Bars" dashboard.
    *   Ensure the report is mobile-first and easy to navigate.

4.  **Phase 4: Testing & Refinement**
    *   Run the new report against a dozen test sites.
    *   Refine scoring algorithms and recommendations based on real-world data.
