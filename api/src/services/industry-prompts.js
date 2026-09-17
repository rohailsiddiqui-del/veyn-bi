// Industry-specific prompt context injected into Gemini insights extraction.
// Each entry adds focused guidance on top of the base EXTRACTION_PROMPT.
// Keys match the `industry` field stored on the `tenants` table (lowercase).

const INDUSTRY_PROMPTS = {
  retail: `
INDUSTRY CONTEXT — Retail & E-commerce:
Focus on mandatory CX metrics: First Contact Resolution (FCR), Agent Empathy, ease of Returns/Exchanges, Product Quality & Sizing Accuracy, Shipping & Delivery Speed, and Proactive Order Updates.
Focus on issues: product quality complaints, sizing/fit issues, returns & exchanges, delivery delays, damaged goods, stock availability, discount/pricing disputes, and upsell/cross-sell moments.
For call_category, prefer: Returns, Delivery, Complaint, Billing, Inquiry, Feedback.
For call_subcategory examples: 'Wrong Item Delivered', 'Size Exchange Request', 'Refund Status', 'Damaged Product', 'Discount Not Applied', 'Out of Stock Query'.
Flag upsell opportunities in key_moments when agent successfully recommended additional products.
For regulatory_mention, flag consumer protection authority references (e.g. consumer court, PSQCA, trade standards body).
`,

  telecom: `
INDUSTRY CONTEXT — Telecom:
Focus on: network/signal issues, data speed complaints, billing disputes, SIM activation, number porting, contract renewals, roaming charges, service outages, and churn risk signals.
For call_category, prefer: Technical Support, Billing, Complaint, Inquiry, Escalation.
For call_subcategory examples: 'Network Signal Issue', 'Data Speed Complaint', 'Bill Dispute', 'SIM Activation', 'Number Port Request', 'Contract Renewal', 'Roaming Query', 'Service Outage'.
Flag churn risk in key_moments when customer threatens to switch providers.
For regulatory_mention, flag references to PTA (Pakistan Telecom Authority) or telecom regulator.
`,

  insurance: `
INDUSTRY CONTEXT — Insurance:
Focus on: claim submissions, claim status queries, policy coverage disputes, premium payment issues, policy cancellations, renewal reminders, documentation requirements, and fraud indicators.
For call_category, prefer: Claim, Inquiry, Complaint, Billing, Escalation.
For call_subcategory examples: 'Claim Status Query', 'Claim Rejection Dispute', 'Policy Coverage Question', 'Premium Payment Issue', 'Policy Cancellation Request', 'Renewal Query', 'Documentation Follow-up'.
Flag potential fraud indicators (e.g. inconsistent story, pressure to expedite claim) in signal_intelligence.threat_details.
For regulatory_mention, flag references to SECP, Insurance Tribunal, or Ombudsman.
`,

  healthcare: `
INDUSTRY CONTEXT — Healthcare:
Focus on: appointment scheduling, long wait times, billing/insurance disputes, medication queries, test result follow-ups, referral requests, staff behaviour complaints, and patient satisfaction.
For call_category, prefer: Complaint, Inquiry, Billing, Feedback, Escalation.
For call_subcategory examples: 'Appointment Booking', 'Wait Time Complaint', 'Bill Dispute', 'Medication Query', 'Test Result Follow-up', 'Referral Request', 'Staff Complaint'.
Pay attention to patient distress or urgency signals in key_moments.
For regulatory_mention, flag references to PMDC, health regulatory bodies, or patient rights.
Treat any mention of misdiagnosis, wrong medication, or negligence as threat_detected=true.
`,

  banking: `
INDUSTRY CONTEXT — Banking / Financial Services:
Focus on: transaction disputes, fraud reports, account access issues, loan queries, card blocking/unblocking, KYC compliance, interest rate disputes, and branch/ATM issues.
For call_category, prefer: Complaint, Inquiry, Claim, Billing, Escalation, Technical Support.
For call_subcategory examples: 'Transaction Dispute', 'Fraud Report', 'Account Blocked', 'Loan Status Query', 'Card Activation', 'KYC Issue', 'ATM Problem', 'Interest Rate Query'.
Flag fraud reports and disputed transactions as threat_detected=true with details.
For regulatory_mention, flag references to SBP (State Bank of Pakistan), FIA, Banking Ombudsman, or FATF.
`,

  ecommerce: `
INDUSTRY CONTEXT — E-commerce & Retail:
Focus on mandatory CX metrics: First Contact Resolution (FCR), Agent Empathy, ease of Returns/Refunds, Product Quality & Sizing Accuracy, Shipping & Delivery Speed, and Proactive Order Updates.
Focus on issues: order tracking, delayed/missing deliveries, wrong items, return/refund requests, payment failures, seller disputes, product quality, and customer account issues.
For call_category, prefer: Delivery, Returns, Complaint, Billing, Inquiry, Technical Support.
For call_subcategory examples: 'Order Not Received', 'Wrong Item Sent', 'Return Request', 'Refund Not Received', 'Payment Failure', 'Seller Complaint', 'Account Access Issue', 'Tracking Query', 'Sizing Issue'.
Flag high-value order disputes prominently in top_complaints.
Identify upsell/cross-sell moments in key_moments when relevant.
For regulatory_mention, flag consumer protection body references.
`,

  automotive: `
INDUSTRY CONTEXT — Automotive / Car Services:
Focus on: service booking, repair complaints, spare parts queries, warranty claims, vehicle delivery delays, pricing disputes, roadside assistance, and recall notifications.
For call_category, prefer: Complaint, Inquiry, Claim, Technical Support, Feedback.
For call_subcategory examples: 'Service Booking', 'Repair Quality Complaint', 'Spare Part Query', 'Warranty Claim', 'Delivery Delay', 'Pricing Dispute', 'Roadside Assistance', 'Recall Query'.
Flag safety-related complaints (brakes, engine failure, accidents) as threat_detected=true.
For regulatory_mention, flag references to PSQCA, transport authority, or consumer court.
`,

  education: `
INDUSTRY CONTEXT — Education:
Focus on: admissions queries, fee disputes, course/schedule issues, exam complaints, certificate/transcript requests, teacher complaints, online learning technical issues, and refund requests.
For call_category, prefer: Inquiry, Complaint, Billing, Feedback, Escalation.
For call_subcategory examples: 'Admission Query', 'Fee Dispute', 'Course Schedule Issue', 'Exam Complaint', 'Certificate Request', 'Teacher Complaint', 'Portal Access Issue', 'Refund Request'.
For regulatory_mention, flag references to HEC, accreditation bodies, or education ministry.
`,

  footwear: `
INDUSTRY CONTEXT — Footwear Retail:
This is a footwear brand (shoes, sandals, sneakers, boots, etc.). Focus on the most common footwear-specific CX pain points.
Focus on mandatory CX metrics: First Contact Resolution (FCR), Agent Empathy, Sizing & Fit Accuracy, Ease of Exchange/Return, Product Quality & Durability, Delivery Speed, and Stock Availability.
Focus on issues specific to footwear: wrong shoe size delivered, size not available, shoe quality complaints (sole detachment, stitching issues, colour fading), exchange/return requests, delivery delays, damaged packaging, discount/sale pricing disputes, fake or damaged product claims, and out-of-stock queries.
For call_category, prefer: Returns, Delivery, Complaint, Inquiry, Billing, Feedback.
For call_subcategory examples: 'Wrong Size Delivered', 'Size Exchange Request', 'Shoe Quality Complaint', 'Sole Detachment', 'Refund Request', 'Out of Stock Size', 'Delivery Not Received', 'Damaged Product', 'Discount Not Applied', 'Color Mismatch'.
Flag upsell/cross-sell moments in key_moments when agent successfully recommended an alternative size, style, or related product.
Flag any mention of fake or counterfeit product claims as threat_detected=true.
For regulatory_mention, flag any references to consumer court, PSQCA, or consumer protection authority.
`,

  qsr: `
INDUSTRY CONTEXT — Quick Service Restaurant (QSR / Pizza Delivery):
This is a Domino's Pizza Pakistan contact center. Focus on: order placement issues, delivery delays, wrong items, cold/poor quality food, complaints about specific branches, refund/replacement requests, and agent performance on complaint resolution.
For call_category, prefer: Complaint, Inquiry, Delivery, Returns, Feedback, Escalation.
For call_subcategory examples: 'Order Not Delivered', 'Wrong Item', 'Cold Food', 'Delivery Delay', 'Order Cancellation', 'Refund Request', 'Branch Complaint', 'Pizza Quality Issue', 'Rider Complaint', 'App/Website Issue'.
Flag food safety complaints (foreign objects, undercooked food) as threat_detected=true.
For branch_name extraction — CRITICAL: match the branch name mentioned in the transcript against this OFFICIAL list of Domino's Pakistan stores. Use the exact store name from this list if it matches:
- 5TH AVENUE MALL (Bahawalpur)
- AL KAREEM AVENUE (Sheikhupura)
- ALLAMA IQBAL TOWN (Lahore)
- AUTOBAHN (Hyderabad)
- Avenza Avenue Multan (Multan)
- BAHRIA PHASE-7 (Rawalpindi)
- BAHRIA TOWN (Lahore)
- BAHRIA TOWN PHASE-4 (Rawalpindi)
- BAHRIA TOWN PHASE-4 - 2 (Rawalpindi)
- BUKHARI COMMERCIAL (Karachi)
- BUKHARI COMMERCIAL 2 (Karachi)
- CAVALRY (Lahore)
- CENTRAL MALL (Sialkot)
- CHAKLALA-III (Rawalpindi)
- CIVIL LINES (Faisalabad)
- COLLEGE ROAD (Sahiwal)
- Canal Road (Faisalabad)
- Central Park Lahore (Lahore)
- Clifton (Karachi)
- Clifton 2 (Karachi)
- Commercial Avenue Phase 7 (Karachi)
- Commercial Market Rawalpindi (Rawalpindi)
- Commercial Market Rawalpindi 24Hrs (Rawalpindi)
- DHA BLOCK-Z (Lahore)
- DHA PHASE 1 H BLOCK (Lahore)
- DHA PHASE 2 (Islamabad)
- DHA PHASE 5 (Lahore)
- DHA PHASE V 2 (Lahore)
- DHA PHASE-6 (Lahore)
- DHA PHASE-8 (Karachi)
- DHA PHASE-8 LHR (Lahore)
- Dolmen Mall Lahore (Lahore)
- E11 (Islamabad)
- EME DHA (Lahore)
- F 10 (Islamabad)
- F 10 - 2 (Islamabad)
- F7 (Islamabad)
- G 13 (Islamabad)
- G 15 (Islamabad)
- G11 (Islamabad)
- GARDEN (Karachi)
- GLORIOUS MALL (Gujrat)
- GULGASHT (Multan)
- GULISTAN-E-JOHAR (Karachi)
- GULSHAN (Karachi)
- GULSHAN-E-RAVI (Lahore)
- Gulberg Green (Islamabad)
- Gulshan Disco Bakery (Karachi)
- HAYATABAD PHASE II (Peshawar)
- IJP (Rawalpindi)
- ITTEHAD (Karachi)
- JAFFAR MALL (Jhelum)
- JOHAR TOWN (Lahore)
- KHARIAN (Kharian)
- KOHINOOR (Faisalabad)
- KOTLI ROAD (Mirpur)
- Lake City Lahore (Lahore)
- MACHS (Karachi)
- MALIR CANTT (Karachi)
- MALL GT ROAD (Gujranwala)
- MALL ROAD (Lahore)
- MM ALAM (Lahore)
- MODEL TOWN (Lahore)
- MODEL TOWN 2 (Lahore)
- MULTAN CANTT (Multan)
- Mall Of Gujrat (Gujrat)
- Mandi Bahauddin (Mandi Bahauddin)
- Mardan (Mardan)
- N.NAZIMABAD BLK-H (Karachi)
- OKARA (Okara)
- PAF BASE (Chakwal)
- PWD (Islamabad)
- QASIM CHOWK (Hyderabad)
- RAHIM YAR KHAN (Rahim Yar Khan)
- SABA COMMERCIAL (Karachi)
- SADDAR (Karachi)
- SADDAR CANTT (Lahore)
- SADDAR RAWALPINDI (Rawalpindi)
- SARGODHA (Sargodha)
- SHADMAN (Lahore)
- SHAHAB PURA ROAD (Sialkot)
- SHAHBAZ COMMERCIAL (Karachi)
- SIXTEENTH AVENUE (Gujranwala)
- SMCHS (Karachi)
- UNIVERSITY ROAD (Peshawar)
- VALENCIA TOWN (Lahore)
- Wah Cantt (Wah Cantt)
- ZAMZAMA (Karachi)
If the branch mentioned doesn't exactly match any of the above, extract the name as mentioned in the transcript. Return null if no branch is mentioned.
`,

  generic: `
INDUSTRY CONTEXT — General:
Analyze this call using standard customer service best practices. Identify the core issue, customer sentiment, and agent performance. Flag any escalation risks, threats, or regulatory mentions relevant to the business context evident from the transcript.
`
};

/**
 * Returns the industry-specific prompt addition for a given industry.
 * Falls back to 'generic' if the industry is unknown.
 */
function getIndustryPrompt(industry) {
  const key = (industry || 'generic').toLowerCase().trim();
  return INDUSTRY_PROMPTS[key] || INDUSTRY_PROMPTS.generic;
}

module.exports = { getIndustryPrompt };
