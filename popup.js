// ─────────────────────────────────────────────
// ApplySync — popup.js
// ─────────────────────────────────────────────

let token = null;
let sessionCount = 0;

const SHEET_NAME = 'Applications';

const SHEET_HEADERS = [
  'No.',
  'Company',
  'Role',
  'Location',
  'Date Applied',
  'Start Date',
  'Job Type?',
  'Salary',
  'Status',
  'Date of Status Update',
  'CV?',
  'Cover Letter',
  'Notes'
];

const SALARY_RANGES = ['-', 'Under £30K', '£30K – £40K', '£40K – £50K', '£50K – £60K', '£60K – £75K', '£75K – £100K', '£100K+', 'Competitive'];

const APPEND_RANGE = `${SHEET_NAME}!A:M`;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function today() {
  const d = new Date();

  return `${String(d.getDate()).padStart(2, '0')}-${String(
    d.getMonth() + 1
  ).padStart(2, '0')}-${d.getFullYear().toString().slice(2)}`;
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');

  toast.textContent = message;

  toast.className = isError
    ? 'toast error'
    : 'toast';

  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}

function showApp(email) {
  document.getElementById('signInScreen').style.display =
    'none';

  document.getElementById('appScreen').style.display =
    'block';

  if (email) {
    document.getElementById(
      'statusText'
    ).textContent = `Connected · ${email.split('@')[0]}`;
  }
}

function showSignIn() {
  document.getElementById('signInScreen').style.display =
    'flex';

  document.getElementById('appScreen').style.display =
    'none';
}

function setLoading(loading) {
  document.getElementById('spinner').style.display =
    loading ? 'block' : 'none';

  document.getElementById('btnLabel').textContent =
    loading
      ? 'Adding...'
      : '+ Add to Google Sheet';

  document.getElementById('btnSave').disabled =
    loading;
}

// ─────────────────────────────────────────────
// Google Authentication
// ─────────────────────────────────────────────

const CLIENT_ID = '137045037004-g843cuenaut79iovc21nih4e7sctpd9g.apps.googleusercontent.com';
const REDIRECT_URI = `https://${chrome.runtime.id}.chromiumapp.org/`;

const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
];

function launchOAuth(interactive) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'token',
      scope: OAUTH_SCOPES.join(' '),
    });
    if (!interactive) params.set('prompt', 'none');
    const authUrl = `https://accounts.google.com/o/oauth2/auth?${params}`;
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive }, (redirectUrl) => {
      if (chrome.runtime.lastError || !redirectUrl) {
        reject(new Error(chrome.runtime.lastError?.message || 'Auth failed'));
        return;
      }
      const fragment = new URL(redirectUrl).hash.slice(1);
      const accessToken = new URLSearchParams(fragment).get('access_token');
      if (!accessToken) { reject(new Error('No access token')); return; }
      token = accessToken;
      resolve(accessToken);
    });
  });
}

async function signIn() {
  return launchOAuth(true);
}

async function refreshToken() {
  return launchOAuth(false);
}

async function getUserEmail(accessToken) {
  const response = await fetch(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  const data = await response.json();

  return data.email || '';
}

// ─────────────────────────────────────────────
// Create Spreadsheet
// ─────────────────────────────────────────────

async function createSpreadsheet() {
  await refreshToken();
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title: 'AppSync Job Tracker' },
      sheets: [{ properties: { title: SHEET_NAME } }]
    })
  });

  const createData = await createRes.json();
  const spreadsheetId = createData.spreadsheetId;
  const sheetId = createData.sheets[0].properties.sheetId;

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A1:M1?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [SHEET_HEADERS] })
    }
  );

  const WHITE      = { red: 1,    green: 1,    blue: 1    };
  const BLACK      = { red: 0.1,  green: 0.1,  blue: 0.1  };
  const DARK_GREEN = { red: 0.18, green: 0.38, blue: 0.14 };
  const DARK_GREY  = { red: 0.4,  green: 0.4,  blue: 0.4  };

  function col(startCol, endCol, startRow, endRow, fmt, fields) {
    const range = { sheetId, startRowIndex: startRow, startColumnIndex: startCol, endColumnIndex: endCol };
    if (endRow !== null) range.endRowIndex = endRow;
    return { repeatCell: { range, cell: { userEnteredFormat: fmt }, fields: `userEnteredFormat(${fields})` } };
  }

  function cfRule(colStart, colEnd, value, bg, whiteText) {
    return {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: colStart, endColumnIndex: colEnd }],
          booleanRule: {
            condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: value }] },
            format: {
              backgroundColor: bg,
              textFormat: { foregroundColor: whiteText ? WHITE : BLACK, bold: true }
            }
          }
        },
        index: 0
      }
    };
  }

  function dv(colStart, colEnd, options) {
    return {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: colStart, endColumnIndex: colEnd },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: options.map(v => ({ userEnteredValue: v })) },
          showCustomUi: true,
          strict: false
        }
      }
    };
  }

  const requests = [
    // Freeze header
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1, frozenColumnCount: 3 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } },

    // Header row
    col(0, SHEET_HEADERS.length, 0, 1, {
      backgroundColor: DARK_GREEN,
      textFormat: { bold: true, fontSize: 11, foregroundColor: WHITE },
      horizontalAlignment: 'LEFT',
      verticalAlignment: 'MIDDLE'
    }, 'backgroundColor,textFormat,horizontalAlignment,verticalAlignment'),

    // Row heights
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1000 }, properties: { pixelSize: 38 }, fields: 'pixelSize' } },

    // Column widths
    // A: No., B-C: Company/Role, D: Location, E-F: Dates, G: Job Type, H: Salary, I: Status, J: Date Updated, K-L: CV/CL, M: Notes
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0,  endIndex: 1  }, properties: { pixelSize: 50  }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1,  endIndex: 3  }, properties: { pixelSize: 200 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3,  endIndex: 4  }, properties: { pixelSize: 160 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 4,  endIndex: 6  }, properties: { pixelSize: 120 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 6,  endIndex: 7  }, properties: { pixelSize: 120 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 7,  endIndex: 8  }, properties: { pixelSize: 130 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 8,  endIndex: 10 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 10, endIndex: 12 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 12, endIndex: 13 }, properties: { pixelSize: 240 }, fields: 'pixelSize' } },

    // Body: col A (No.)
    col(0,  1,  1, null, { backgroundColor: WHITE, textFormat: { bold: true, fontSize: 10, foregroundColor: BLACK }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' }, 'backgroundColor,textFormat,horizontalAlignment,verticalAlignment'),
    // Body: cols B-C (Company, Role) — dark green bold
    col(1,  3,  1, null, { backgroundColor: WHITE, textFormat: { bold: true, fontSize: 10, foregroundColor: DARK_GREEN }, verticalAlignment: 'MIDDLE' }, 'backgroundColor,textFormat,verticalAlignment'),
    // Body: col D (Location) — black
    col(3,  4,  1, null, { backgroundColor: WHITE, textFormat: { bold: false, fontSize: 10, foregroundColor: BLACK }, verticalAlignment: 'MIDDLE' }, 'backgroundColor,textFormat,verticalAlignment'),
    // Body: cols E-F (Date Applied, Start Date) — black, center
    col(4,  6,  1, null, { backgroundColor: WHITE, textFormat: { bold: false, fontSize: 10, foregroundColor: BLACK }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' }, 'backgroundColor,textFormat,horizontalAlignment,verticalAlignment'),
    // Body: cols G-J (Job Type, Salary, Status, Date Updated) — black, center
    col(6,  10, 1, null, { backgroundColor: WHITE, textFormat: { bold: false, fontSize: 10, foregroundColor: BLACK }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' }, 'backgroundColor,textFormat,horizontalAlignment,verticalAlignment'),
    // Body: cols K-L (CV?, Cover Letter) — black, center
    col(10, 12, 1, null, { backgroundColor: WHITE, textFormat: { bold: false, fontSize: 10, foregroundColor: BLACK }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' }, 'backgroundColor,textFormat,horizontalAlignment,verticalAlignment'),
    // Body: col M (Notes) — dark grey, italic
    col(12, 13, 1, null, { backgroundColor: WHITE, textFormat: { bold: false, italic: true, fontSize: 10, foregroundColor: DARK_GREY }, verticalAlignment: 'MIDDLE' }, 'backgroundColor,textFormat,verticalAlignment'),

    // Data validation
    dv(6,  7,  ['-', 'Summer', 'Full Time', 'Spring', 'Vacation', 'Grad Scheme', 'Off-Cycle']),   // G: Job Type?
    dv(7,  8,  SALARY_RANGES),                                                                      // H: Salary
    dv(8,  9,  ['-', 'Pending - Online', 'Interview Invite', 'AC Invite', 'Offer', 'Rejection']), // I: Status
    dv(10, 11, ['-', 'Yes', 'No']),                                                                 // K: CV?
    dv(11, 12, ['-', 'Yes', 'No']),                                                                 // L: Cover Letter
  ];

  const cfRequests = [
    cfRule(6,  7,  'Summer',           { red:0.706,green:0.655,blue:0.839 }, false),
    cfRule(6,  7,  'Full Time',        { red:0.404,green:0.306,blue:0.655 }, true ),
    cfRule(6,  7,  'Spring',           { red:0.290,green:0.525,blue:0.910 }, true ),
    cfRule(6,  7,  'Vacation',         { red:0.463,green:0.647,blue:0.686 }, true ),
    cfRule(6,  7,  'Grad Scheme',      { red:0.173,green:0.243,blue:0.314 }, true ),
    cfRule(6,  7,  'Off-Cycle',        { red:0.624,green:0.773,blue:0.910 }, false),
    cfRule(8,  9,  'Pending - Online', { red:1.00, green:0.85, blue:0.40  }, false),
    cfRule(8,  9,  'Offer',            { red:0.15, green:0.49, blue:0.17  }, true ),
    cfRule(8,  9,  'Rejection',        { red:0.60, green:0.07, blue:0.07  }, true ),
    cfRule(8,  9,  'Interview Invite', { red:0.62, green:0.77, blue:0.91  }, false),
    cfRule(8,  9,  'AC Invite',        { red:0.72, green:0.84, blue:0.66  }, false),
    cfRule(10, 11, 'Yes',              { red:0.29, green:0.53, blue:0.91  }, true ),
    cfRule(11, 12, 'Yes',              { red:0.29, green:0.53, blue:0.91  }, true ),
  ];

  async function batchUpdate(reqs) {
    const doFetch = () => fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: reqs })
      }
    );

    let res = await doFetch();

    if (res.status === 401) {
      token = null;
      await launchOAuth(true);
      res = await doFetch();
    }

    if (!res.ok) {
      const err = await res.json();
      console.error('batchUpdate error:', JSON.stringify(err));
      throw new Error(err.error?.message || 'batchUpdate failed');
    }
  }

  await batchUpdate(requests);
  await batchUpdate(cfRequests);

  chrome.storage.local.set({ spreadsheetId });
  return spreadsheetId;
}

async function findExistingSpreadsheet() {
  const q = encodeURIComponent(
    `name='AppSync Job Tracker' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
  );
  const doSearch = () => fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  let res = await doSearch();

  if (res.status === 401 || res.status === 403) {
    token = null;
    await launchOAuth(true);
    res = await doSearch();
  }

  if (!res.ok) return null;
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function getSpreadsheetId() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['spreadsheetId'], async (data) => {
      if (data.spreadsheetId) {
        resolve(data.spreadsheetId);
        return;
      }

      const existing = await findExistingSpreadsheet();
      if (existing) {
        chrome.storage.local.set({ spreadsheetId: existing });
        resolve(existing);
        return;
      }

      const newId = await createSpreadsheet();
      resolve(newId);
    });
  });
}

function updateSheetLink(spreadsheetId) {
  const link =
    document.getElementById('openSheet');

  if (link) {
    link.href =
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  }
}

// ─────────────────────────────────────────────
// Restore Session
// ─────────────────────────────────────────────

chrome.storage.local.get(['email'], async (data) => {
  if (!data.email) { showSignIn(); return; }
  try {
    await refreshToken();
    showApp(data.email);
    const spreadsheetId = await getSpreadsheetId();
    updateSheetLink(spreadsheetId);
  } catch {
    showSignIn();
  }
});

// ─────────────────────────────────────────────
// Sign In
// ─────────────────────────────────────────────

document.getElementById('btnGoogle')
  .addEventListener('click', async () => {
    try {
      token = await signIn();

      const email =
        await getUserEmail(token);

      chrome.storage.local.set({ email });

      const spreadsheetId =
        await getSpreadsheetId();

      updateSheetLink(spreadsheetId);

      showApp(email);

      showToast(
        'Connected to Google!'
      );

    } catch (error) {
      console.error(error);

      showToast(
        `Auth failed: ${error}`,
        true
      );
    }
  });

// ─────────────────────────────────────────────
// Sign Out
// ─────────────────────────────────────────────

document.getElementById('btnSignout')
  .addEventListener('click', () => {
    if (token) {
      fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' }).catch(() => {});
      token = null;
    }

    chrome.storage.local.remove(['email']);

    showSignIn();

    showToast('Signed out');
  });

// ─────────────────────────────────────────────
// Autofill Job Data
// ─────────────────────────────────────────────

document.getElementById('btnScrape')
  .addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) return;

      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          func: () => {
            function detectJobType(role, pageText) {
              const r = role.toLowerCase();
              const p = (pageText || '').toLowerCase();
              if (/spring\s*(week|intern|analyst|insight|program)/i.test(r) || /spring\s*week/i.test(p)) return 'Spring';
              if (/summer\s*(intern|analyst|associate|program|placement|week)/i.test(r) || /summer\s*(intern|program|analyst)/i.test(p)) return 'Summer';
              if (/vacation\s*(scheme|program)?/i.test(r) || /vacation\s*scheme/i.test(p)) return 'Vacation';
              if (/off.?cycle/i.test(r) || /off.?cycle/i.test(p)) return 'Off-Cycle';
              if (/grad(uate)?\s*(scheme|programme|program|trainee|rotational)/i.test(r)) return 'Grad Scheme';
              if (/graduate\s*(scheme|programme|program)/i.test(p)) return 'Grad Scheme';
              if (/\bintern(ship)?\b/i.test(r)) return 'Off-Cycle';
              const isSeniority = /\b(analyst|associate|manager|director|vp|vice president|engineer|developer|specialist|consultant|advisor|strategist|trader|quant)\b/i.test(r);
              const hasInternQualifier = /\b(intern|internship|graduate|grad|placement|scheme|program|week|trainee)\b/i.test(r);
              if (isSeniority && !hasInternQualifier) return 'Full Time';
              if (/\bfull.?time\b/i.test(p) && !/\bintern/i.test(p)) return 'Full Time';
              return '';
            }

            function matchSalaryRange(text) {
              if (!text) return '';
              const m = text.match(/£\s*(\d[\d,]*)\s*[Kk]?/);
              if (!m) return '';
              let n = parseInt(m[1].replace(/,/g, ''));
              if (/[Kk]/.test(text.slice(m.index))) n *= 1000;
              if (n < 30000)  return 'Under £30K';
              if (n < 40000)  return '£30K – £40K';
              if (n < 50000)  return '£40K – £50K';
              if (n < 60000)  return '£50K – £60K';
              if (n < 75000)  return '£60K – £75K';
              if (n < 100000) return '£75K – £100K';
              return '£100K+';
            }

            function extractStartDate(text) {
              const m = text.match(/start(?:ing|s)?\s*(?:date)?[:\s]*([A-Za-z]+\s+\d{4}|\d{1,2}[\/\-]\d{4}|immediately|asap|as soon as possible)/i);
              return m ? m[1].trim() : '';
            }

            const url = window.location.href;
            const title = document.title;
            let company = '', role = '', notes = '', jobType = '', salaryRange = '', startDate = '';
            let rawSalary = '', rawLocation = '', rawWorkplace = '';

            if (url.includes('linkedin.com/jobs')) {
              company = document.querySelector('.job-details-jobs-unified-top-card__company-name a, .jobs-unified-top-card__company-name a')?.innerText?.trim() || '';
              role = document.querySelector('.job-details-jobs-unified-top-card__job-title h1, .jobs-unified-top-card__job-title h1')?.innerText?.trim() || '';

              // Try multiple specific selectors first
              const locationSelectors = [
                '.job-details-jobs-unified-top-card__bullet',
                '.jobs-unified-top-card__bullet',
                '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
                '[class*="jobs-unified-top-card"] [class*="bullet"]',
                '[class*="topcard__flavor--bullet"]',
              ];
              for (const sel of locationSelectors) {
                const el = document.querySelector(sel);
                const txt = el?.innerText?.trim();
                if (txt && !/\d+\s*(applicant|follower)/i.test(txt)) { rawLocation = txt; break; }
              }
              // Fallback: parse description line "Company · City · Type · ..." and find location segment
              if (!rawLocation) {
                const descLine = document.querySelector(
                  '.job-details-jobs-unified-top-card__primary-description-without-tagline, .jobs-unified-top-card__primary-description, [class*="primary-description"]'
                )?.innerText?.trim() || '';
                const segments = descLine.split(/\s*·\s*/).map(s => s.trim()).filter(Boolean);
                rawLocation = segments.find(s =>
                  /,/.test(s) || /\b(remote|hybrid|on.?site|london|new york|england|scotland|wales|ireland|uk|united kingdom|united states|us|canada|australia)\b/i.test(s)
                ) || segments[1] || '';
                if (/\d+\s*(applicant|follower)/i.test(rawLocation)) rawLocation = '';
              }

              // Salary: look through all insight spans for a £ sign
              const insightEls = document.querySelectorAll(
                '.job-details-jobs-unified-top-card__job-insight span, .jobs-unified-top-card__job-insight span, [class*="salary"], [class*="compensation"]'
              );
              rawSalary = Array.from(insightEls).map(el => el.innerText?.trim()).find(t => /£|\$|€|\bsalary\b/i.test(t)) || '';

              rawWorkplace = document.querySelector(
                '.job-details-jobs-unified-top-card__workplace-type, .jobs-unified-top-card__workplace-type'
              )?.innerText?.trim() || '';

            } else if (url.includes('glassdoor.')) {
              company = document.querySelector('[data-test="employer-name"]')?.innerText?.trim() || '';
              role = document.querySelector('[data-test="job-title"]')?.innerText?.trim() || '';
              rawLocation = document.querySelector('[data-test="location"]')?.innerText?.trim() || '';
              rawSalary = document.querySelector('[data-test="detailSalary"]')?.innerText?.trim() || '';

            } else if (url.includes('indeed.com')) {
              company = document.querySelector('[data-testid="inlineHeader-companyName"] a')?.innerText?.trim() || '';
              role = document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"] h1')?.innerText?.trim() || '';
              rawLocation = document.querySelector('[data-testid="job-location"]')?.innerText?.trim() || '';
              rawSalary = document.querySelector('[data-testid="attribute_snippet_testid"]')?.innerText?.trim() || '';

            } else if (url.includes('myworkdayjobs.com')) {
              role = document.querySelector('[data-automation-id="jobPostingHeader"]')?.innerText?.trim() || '';

              // Location: try DOM selectors, strip label prefix, fallback to URL path segment
              const wdLocEl = document.querySelector('[data-automation-id="locations"], [data-automation-id="location"]');
              rawLocation = (wdLocEl?.querySelector('dd, li, a, span') || wdLocEl)?.innerText?.trim() || '';
              rawLocation = rawLocation.replace(/^locations?\s*:?\s*/i, '').trim();
              if (!rawLocation) {
                const pathParts = window.location.pathname.split('/');
                const jobIdx = pathParts.indexOf('job');
                if (jobIdx >= 0 && pathParts[jobIdx + 1])
                  rawLocation = decodeURIComponent(pathParts[jobIdx + 1]).replace(/-/g, ' ');
              }

              // Company from subdomain: moelis.wd1.myworkdayjobs.com → "Moelis"
              const wdHost = window.location.hostname.split('.')[0];
              company = wdHost.charAt(0).toUpperCase() + wdHost.slice(1);
              const ogSite = document.querySelector('meta[property="og:site_name"]')?.content || '';
              if (ogSite && !/^workday$/i.test(ogSite)) company = ogSite;

            } else if (url.includes('greenhouse.io') || url.includes('boards.greenhouse')) {
              role = document.querySelector('h1.app-title, h1[class*="title"], .posting-headline h2')?.innerText?.trim() || '';
              company = document.querySelector('.company-name, [class*="company"]')?.innerText?.trim() || '';
              rawLocation = document.querySelector('.location, [class*="location"]')?.innerText?.trim() || '';

            } else if (url.includes('jobs.lever.co') || url.includes('lever.co/')) {
              role = document.querySelector('.posting-headline h2, h2[data-qa="posting-name"]')?.innerText?.trim() || '';
              company = document.querySelector('.main-header-text h1, [class*="company-name"]')?.innerText?.trim() || '';
              rawLocation = document.querySelector('.posting-category.location, [data-qa="posting-location"]')?.innerText?.trim() || '';

            } else if (url.includes('smartrecruiters.com')) {
              role = document.querySelector('h1[itemprop="title"], h1.job-title')?.innerText?.trim() || '';
              company = document.querySelector('[itemprop="name"], .company-name')?.innerText?.trim() || '';
              rawLocation = document.querySelector('[itemprop="jobLocation"], .job-detail--location')?.innerText?.trim() || '';

            } else if (url.includes('careers.') || url.includes('/careers/') || url.includes('/jobs/') || url.includes('/vacancies/')) {
              // Split title on | to get role and company: "Role - Location | Company"
              const titlePipe = document.title.split(' | ');
              role = titlePipe[0].trim();
              if (titlePipe.length > 1 && !company) company = titlePipe[titlePipe.length - 1].trim();
              // Try to pull location from structured data only — don't guess from class names
              rawLocation = document.querySelector('[itemprop="jobLocation"] [itemprop="name"]')?.innerText?.trim() ||
                            document.querySelector('[itemprop="addressLocality"]')?.innerText?.trim() || '';
            }

            if (!company) company = document.querySelector('meta[property="og:site_name"]')?.content ||
                                    document.querySelector('meta[name="author"]')?.content || '';
            if (!role) role = document.querySelector('meta[property="og:title"]')?.content || '';
            if (!role && title) role = company ? title.replace(new RegExp(`[|\\-–—]?\\s*${company}\\s*$`, 'i'), '').trim() : title.trim();


            const descText = document.querySelector('.jobs-description__content, .job-description, [class*="description"]')?.innerText || '';
            const pageText = descText || document.body.innerText.slice(0, 4000);

            jobType = detectJobType(role, pageText);
            salaryRange = matchSalaryRange(rawSalary);
            startDate = extractStartDate(pageText);

            // Build notes — salary and start date flagged if missing
            const noteParts = [];
            if (rawWorkplace) noteParts.push(rawWorkplace);
            if (rawSalary)   noteParts.push(`Salary: ${rawSalary}`);
            else             noteParts.push('Salary: Not listed');
            if (startDate)   noteParts.push(`Start: ${startDate}`);
            else             noteParts.push('Start date: Not listed');
            notes = noteParts.join(', ');

            return { company, role, location: rawLocation, notes, jobType, salaryRange, startDate };
          }
        },
        (results) => {
          if (chrome.runtime.lastError || !results?.[0]?.result) {
            showToast('Could not scrape page', true);
            return;
          }
          const r = results[0].result;
          if (r.company)     document.getElementById('company').value   = r.company;
          if (r.role)        document.getElementById('role').value      = r.role;
          if (r.location)    document.getElementById('location').value  = r.location;
          if (r.notes)       document.getElementById('notes').value     = r.notes;
          if (r.jobType)     document.getElementById('type').value      = r.jobType;
          if (r.salaryRange) document.getElementById('salary').value    = r.salaryRange;
          if (r.startDate)   document.getElementById('startDate').value = r.startDate;
          showToast('Fields filled!');
        }
      );
    });
  });

// ─────────────────────────────────────────────
// Sheets API
// ─────────────────────────────────────────────

async function getNextRowNumber() {
  await refreshToken();
  const spreadsheetId =
    await getSpreadsheetId();

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A:A`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const data = await response.json();

  return (data.values || []).length;
}

async function appendRow(entry) {
  const spreadsheetId =
    await getSpreadsheetId();

  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${APPEND_RANGE}:append?valueInputOption=USER_ENTERED&insertDataOption=OVERWRITE`;

  const response = await fetch(url, {
    method: 'POST',

    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },

    body: JSON.stringify({
      values: [[
        entry.no,
        entry.company,
        entry.role,
        entry.location,
        entry.dateApplied,
        entry.startDate,
        entry.type,
        entry.salary,
        entry.status,
        entry.dateUpdated,
        entry.cv,
        entry.coverLetter,
        entry.notes
      ]]
    })
  });

  if (!response.ok) {
    const error = await response.json();

    console.error(error);

    throw new Error(
      error.error?.message ||
      'Sheets API error'
    );
  }
}

// ─────────────────────────────────────────────
// Save Job Application
// ─────────────────────────────────────────────

document.getElementById(
  'dateApplied'
).value = todayISO();

document.getElementById('btnSave')
  .addEventListener('click', async () => {

    const company =
      document.getElementById(
        'company'
      ).value.trim();

    const role =
      document.getElementById(
        'role'
      ).value.trim();

    if (!company || !role) {
      showToast(
        'Company and role required',
        true
      );

      return;
    }

    setLoading(true);

    try {
      const nextNo =
        await getNextRowNumber();

      const [y, m, d] =
        document.getElementById(
          'dateApplied'
        ).value.split('-');

      const entry = {
        no: nextNo,

        company,

        role,

        dateApplied:
          `${d}-${m}-${y.slice(2)}`,

        location:
          document.getElementById(
            'location'
          ).value.trim(),

        startDate:
          document.getElementById(
            'startDate'
          ).value.trim(),

        type:
          document.getElementById(
            'type'
          ).value,

        salary:
          document.getElementById(
            'salary'
          ).value,

        status: 'Pending - Online',

        dateUpdated: today(),

        cv:
          document.getElementById(
            'cv'
          ).value,

        coverLetter:
          document.getElementById(
            'coverLetter'
          ).value,

        notes:
          document.getElementById(
            'notes'
          ).value.trim()
      };

      await appendRow(entry);

      sessionCount++;

      document.getElementById(
        'count'
      ).textContent = sessionCount;

      // Reset fields
      document.getElementById('company').value = '';
      document.getElementById('role').value = '';
      document.getElementById('location').value = '';
      document.getElementById('startDate').value = '';
      document.getElementById('type').value = '-';
      document.getElementById('salary').value = '-';
      document.getElementById('cv').value = '-';
      document.getElementById('coverLetter').value = '-';
      document.getElementById('notes').value = '';
      document.getElementById('dateApplied').value = todayISO();

      showToast(
        `${company} added! ✓`
      );

    } catch (error) {
      console.error(error);

      showToast(
        error.message,
        true
      );

    } finally {
      setLoading(false);
    }
  });