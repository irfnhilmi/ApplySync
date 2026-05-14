function detectJobType(role, pageText) {
  const r = role.toLowerCase();
  const p = (pageText || '').toLowerCase();

  // Spring — must come before generic "intern" check
  if (/spring\s*(week|intern|analyst|insight|program|off.?cycle)/i.test(r) || /spring\s*week/i.test(p)) return 'Spring';

  // Summer
  if (/summer\s*(intern|analyst|associate|program|placement|week)/i.test(r) || /summer\s*(intern|program|analyst)/i.test(p)) return 'Summer';

  // Vacation scheme
  if (/vacation\s*(scheme|program)?/i.test(r) || /vacation\s*scheme/i.test(p)) return 'Vacation';

  // Off-cycle
  if (/off.?cycle/i.test(r) || /off.?cycle/i.test(p)) return 'Off-Cycle';

  // Grad scheme — "graduate" without a bare analyst/associate title context
  if (/grad(uate)?\s*(scheme|programme|program|trainee|rotational)/i.test(r)) return 'Grad Scheme';
  if (/graduate\s*(scheme|programme|program)/i.test(p)) return 'Grad Scheme';

  // Internship (no season qualifier found above) — likely off-cycle or unspecified
  if (/\bintern(ship)?\b/i.test(r)) return 'Off-Cycle';

  // Full-time: seniority roles without any intern/program/graduate qualifier
  const isSeniorityRole = /\b(analyst|associate|manager|director|vp|vice president|engineer|developer|specialist|consultant|advisor|strategist|trader|quant)\b/i.test(r);
  const hasInternQualifier = /\b(intern|internship|graduate|grad|placement|scheme|program|week|trainee)\b/i.test(r);
  if (isSeniorityRole && !hasInternQualifier) return 'Full Time';

  // Fallback: check page text for explicit employment type
  if (/\bfull.?time\b/i.test(p) && !/\bintern/i.test(p)) return 'Full Time';

  return '';
}

function scrapeJobDetails() {
  const url = window.location.href;
  const title = document.title;
  let company = '', role = '', notes = '', jobType = '';

  if (url.includes('linkedin.com/jobs')) {
    company = document.querySelector('.job-details-jobs-unified-top-card__company-name a, .jobs-unified-top-card__company-name a')?.innerText?.trim() || '';
    role = document.querySelector('.job-details-jobs-unified-top-card__job-title h1, .jobs-unified-top-card__job-title h1')?.innerText?.trim() || '';

    const noteParts = [];

    const location = document.querySelector('.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet')?.innerText?.trim();
    if (location) noteParts.push(`Location: ${location}`);

    const salary = document.querySelector('.job-details-jobs-unified-top-card__job-insight span, .jobs-unified-top-card__job-insight span')?.innerText?.trim();
    if (salary && /\d/.test(salary)) noteParts.push(`Salary: ${salary}`);

    const workplaceType = document.querySelector('.job-details-jobs-unified-top-card__workplace-type, .jobs-unified-top-card__workplace-type')?.innerText?.trim();
    if (workplaceType) noteParts.push(`Type: ${workplaceType}`);

    const applicants = document.querySelector('.jobs-unified-top-card__applicant-count, .job-details-jobs-unified-top-card__applicant-count')?.innerText?.trim();
    if (applicants) noteParts.push(applicants);

    notes = noteParts.join(' | ');

  } else if (url.includes('glassdoor.')) {
    company = document.querySelector('[data-test="employer-name"]')?.innerText?.trim() || '';
    role = document.querySelector('[data-test="job-title"]')?.innerText?.trim() || '';

    const noteParts = [];
    const location = document.querySelector('[data-test="location"]')?.innerText?.trim();
    if (location) noteParts.push(`Location: ${location}`);
    const salary = document.querySelector('[data-test="detailSalary"]')?.innerText?.trim();
    if (salary) noteParts.push(`Salary: ${salary}`);
    notes = noteParts.join(' | ');

  } else if (url.includes('indeed.com')) {
    company = document.querySelector('[data-testid="inlineHeader-companyName"] a')?.innerText?.trim() || '';
    role = document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"] h1')?.innerText?.trim() || '';

    const noteParts = [];
    const location = document.querySelector('[data-testid="job-location"]')?.innerText?.trim();
    if (location) noteParts.push(`Location: ${location}`);
    const salary = document.querySelector('[data-testid="attribute_snippet_testid"]')?.innerText?.trim();
    if (salary) noteParts.push(`Salary: ${salary}`);
    notes = noteParts.join(' | ');
  }

  if (!company) company = document.querySelector('meta[property="og:site_name"]')?.content || '';
  if (!role && title) role = company ? title.replace(new RegExp(`[|\\-–—]?\\s*${company}\\s*$`, 'i'), '').trim() : title.trim();

  const pageText = document.querySelector('.jobs-description, .job-description, [class*="description"]')?.innerText || document.body.innerText.slice(0, 3000);
  jobType = detectJobType(role, pageText);

  return { company: company || '', role: role || '', notes: notes || '', jobType, url };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapeJob') sendResponse(scrapeJobDetails());
});
