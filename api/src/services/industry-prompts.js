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
