/* Master sheet for Prospective Studies (Sports).

   Google Apps Script, attached to the master Google Sheet (Extensions > Apps Script).
   Reads the Friday research meeting deck and keeps one row per study in the
   "Studies" tab, using the same rules as the website (public/index.html), so the
   sheet shows what the site shows.

   Columns come in two kinds, found by their header text (order doesn't matter):
     - from the slides (grey headers): rewritten on every sync, don't edit them
     - the team's (purple headers): never touched by the sync, edit freely
   Any column the team adds is left alone too.

   Rows are matched to slides by the slide's permanent ID (last column), so retitling
   or moving a slide keeps its row and the team's entries. A study that leaves the
   deck keeps its row, marked "Not in deck".

   Permissions are limited by appsscript.json: this spreadsheet only, view-only Slides,
   the hourly trigger, and the menu.

   This file is kept in the website repo (sheet/Code.gs). After changing it there,
   paste it into the sheet's Apps Script editor again; see sheet/SETUP.md. */

const DECK_ID = '16LPexUG2uF_mNUndOf742ppnOXDifLltINZjpJCrvoE';
const STUDIES_TAB = 'Studies';
const LISTS_TAB = 'Lists';
// Section header slides whose studies are included (same as CONFIG.includeSections on the site).
const INCLUDE_SECTIONS = [/prospective/i, /grant/i];

/* ---------------------------------------------------------------------------
   COLUMNS
--------------------------------------------------------------------------- */
const H = {
  // as shown on the site (slides + the team's adjustments)
  study: 'Study', status: 'Status', area: 'Area', pi: 'PI', enrolled: 'Enrolled', target: 'Target',
  // the team's
  procedures: 'Procedures', injuries: 'Injuries / Diagnoses', setting: 'Setting (OR / Office)',
  nickname: 'Nickname', statusOverride: 'Status override', areaOverride: 'Area override',
  nIsTarget: 'N on slide is target', extraPIs: 'Extra PIs', hide: 'Hide from site',
  inclusion: 'Inclusion criteria', exclusion: 'Exclusion criteria', notes: 'Team notes',
  // straight from the slide
  slideTitle: 'Slide title', slideStatus: 'Status on slide', slideArea: 'Area on slide', section: 'Section',
  slideNo: 'Slide #', summary: 'Summary', irb: 'IRB #', irbEnd: 'IRB end date',
  slideCriteria: 'Inclusion/Exclusion on slide', nLine: 'Enrollment line on slide', updates: 'Updates',
  details: 'Details box (full text)', other: 'Other slide text',
  sync: 'Sync status', lastSeen: 'Last seen in deck', slideId: 'Slide ID',
};

// auto: filled from the slides. list: dropdown from that column of the Lists tab.
const COLUMNS = [
  { h: H.study, auto: true, width: 320, note: 'Title as shown on the site (nickname first, if set).' },
  { h: H.status, auto: true, width: 110, note: 'Active, Paused or Not ready yet: the slide\'s status, or the Status override.' },
  { h: H.area, auto: true, width: 90, note: 'Area on slide, or guessed from the title, or the Area override.' },
  { h: H.pi, auto: true, width: 180, note: 'PI line from the slide, plus Extra PIs.' },
  { h: H.enrolled, auto: true, width: 80 },
  { h: H.target, auto: true, width: 70 },
  { h: H.procedures, list: 'Procedures', width: 220, note: 'Procedures this study enrolls from. Pick from the dropdown (Lists tab).' },
  { h: H.injuries, list: 'Injuries / Diagnoses', width: 220, note: 'Injuries or diagnoses this study enrolls. Pick from the dropdown (Lists tab).' },
  { h: H.setting, list: 'Setting', width: 120 },
  { h: H.nickname, width: 110, note: 'Short name the team uses. Shown as "Nickname (slide title)".' },
  { h: H.statusOverride, width: 120, note: 'Overrides the status on the slide. Leave blank to use the slide.' },
  { h: H.areaOverride, list: 'Area', width: 110, note: 'Overrides the area on the slide. Leave blank to use the slide.' },
  { h: H.nIsTarget, checkbox: true, width: 90, note: 'Tick when the slide\'s "N = x" is the enrollment target, not patients enrolled.' },
  { h: H.extraPIs, width: 140, note: 'PIs not listed on the slide, separated by commas.' },
  { h: H.hide, checkbox: true, width: 80, note: 'Tick to leave this study off the site.' },
  { h: H.inclusion, width: 280, note: 'One item per line. A line ending in ":" starts a group (e.g. "Meniscal:").' },
  { h: H.exclusion, width: 280, note: 'One item per line.' },
  { h: H.notes, width: 200 },
  { h: H.slideTitle, auto: true, width: 260 },
  { h: H.slideStatus, auto: true, width: 100 },
  { h: H.slideArea, auto: true, width: 90 },
  { h: H.section, auto: true, width: 110 },
  { h: H.slideNo, auto: true, width: 60 },
  { h: H.summary, auto: true, width: 260 },
  { h: H.irb, auto: true, width: 110 },
  { h: H.irbEnd, auto: true, width: 100 },
  { h: H.slideCriteria, auto: true, width: 200 },
  { h: H.nLine, auto: true, width: 140 },
  { h: H.updates, auto: true, width: 260 },
  { h: H.details, auto: true, width: 260 },
  { h: H.other, auto: true, width: 200 },
  { h: H.sync, auto: true, width: 100 },
  { h: H.lastSeen, auto: true, width: 130 },
  { h: H.slideId, auto: true, width: 140, note: 'The slide\'s permanent ID; links this row to its slide. Don\'t edit.' },
];

const LIST_DEFAULTS = {
  'Procedures': ['Knee arthroscopy (any)', 'ACL reconstruction (BTB)', 'ACL reconstruction (other graft)', 'BEAR ACL repair',
    'Meniscal repair', 'Meniscal root repair', 'Meniscectomy', 'MACI / cartilage restoration', 'HTO', 'DFO', 'TTO',
    'Rotator cuff repair', 'Hamstring repair / reconstruction', 'Knee injection', 'Office visit (no procedure)'],
  'Injuries / Diagnoses': ['ACL tear', 'Meniscal tear', 'Meniscal root tear', 'Cartilage defect', 'Knee OA',
    'Patellofemoral degeneration', 'Malalignment (varus / valgus)', 'Rotator cuff tear', 'Hamstring tear'],
  'Setting': ['OR', 'Office'],
  'Area': ['Knee', 'Shoulder', 'Hip', 'Hamstring', 'General', 'Various', 'Other'],
};

/* Starting values for the team's columns, copied from the site's manual lists
   (NICKNAMES, STUDY_OVERRIDES, STUDY_SETTINGS, CRITERIA in public/index.html).
   Used only when a study's row is first created; matched on the slide title. */
const SEED = [
  { match: /adductor canal block with or without ipack/i, nickname: 'IPACK', setting: 'OR' },
  { match: /effect of internal brace on outcomes following acl/i, nickname: 'Internal Brace', setting: 'OR',
    inclusion: ['Primary ACLR w/ BTB autograft', 'Age 18-35', 'Able to do std rehab'],
    exclusion: ['OA KL ≥2', 'Grade 3-4 chondral lesion >2 cm²', 'Active autoimmune/inflammatory dz',
      'Prior ipsilateral knee ligament surg / MLKI', 'Concomitant LET', 'Prior contralateral ACL surg'] },
  { match: /kore registry/i, nickname: 'KORE', setting: 'OR' },
  { match: /patellar lift system/i, nickname: 'PELICAN' },
  { match: /cryoneurolysis with iovera/i, nickname: 'Iovera', statusOverride: 'Not ready yet' },
  { match: /liposomal bupivacaine versus standard bupivacaine/i, statusOverride: 'Not ready yet', nIsTarget: true },
  { match: /meniscal root repair effect on varus alignment/i, statusOverride: 'Not ready yet' },
  { match: /BEAR ACL 1-Year Outcomes/i, statusOverride: 'Paused', setting: 'OR' },
  { match: /^MISHA RCT$/i, hide: true },
  { match: /^AI Responses to PRP vs\. Corticosteroids vs\. Stem Cells in Meniscal Management$/i, hide: true },
  { match: /^synovial fluid biomarkers$/i, extraPIs: 'Strickland, Gomoll', setting: 'OR',
    inclusion: ['Any knee arthroscopy, or open surgery that starts arthroscopically (e.g. ACL recon, TTO)',
      'i.e. any knee surg except hardware removal, MUA, LOA'],
    exclusion: ['Inflammatory disease (diabetes ok unless poorly controlled)', 'Injection on day of sample (even if given after)',
      'Injection within past 90 days', 'HIV / Hep C', 'Immunosuppressants (e.g. rheum pts)'] },
  { match: /^MACI patient registry$/i, extraPIs: 'Strickland, Gomoll', setting: 'OR' },
  { match: /^MERCuRE trial$/i, extraPIs: 'Gomoll', setting: 'OR' },
  { match: /^hamstring strength following tear 1 year vs\. 10 year$/i, areaOverride: 'Hamstring', setting: 'Office' },
  { match: /^extended oral tranexamic acid after ACL reconstruction/i, areaOverride: 'Knee' },
  { match: /HAMMER Technique/i, setting: 'Office' },
  { match: /^CBD Knee OA/i, setting: 'Office',
    inclusion: ['Knee OA, KL grade 2-3', 'Knee pain for at least 3mos, on at least 1/2 of days', 'VAS ≥4', 'Age 40-75',
      'Premenopausal women: 2 forms of birth control'],
    exclusion: ['Injection within past 3mos', 'Prior opioid management for knee OA, or opioid dependence', 'Cannabis abuse/dependence',
      'Inflammatory arthritis (e.g. RA, gout, pseudogout)', 'Large effusion', 'BMI >35', 'Coagulation abnormality or thromboembolic disease',
      'Stroke or acute coronary syndrome within 3mos',
      'Renal failure (creatinine >2.83 mg/dL), cirrhosis, moderate/severe hepatic impairment, or abnormal LFTs',
      'Major psych illness, substance abuse disorder, or current/past suicidal ideation', 'Major neurological disorder',
      'Clinically significant illness (inc cardiovascular) or lab abnormalities', 'Pregnant or breastfeeding'] },
  { match: /^arthrex knee database$/i, setting: 'OR',
    inclusion: ['All:', 'Age ≥18', 'Preop XR (ideally ≥4 views) + preop MRI',
      'Meniscal:', 'Meniscal tear on exam + MRI (≥1.5T)', 'Needs ≥2 all-inside devices', 'Alignment <5° varus, <7° valgus'],
    exclusion: ['Current b/l knee injury', 'Ipsilateral knee surg within 12mo', 'LE fracture within 6mo', 'Poor bone quality/quantity',
      'Poor blood supply / prior infection impairing healing', 'Advanced OA (KL grade 3)', 'Meniscal: irreparable tear', "Workers' comp"] },
  { match: /^medial unloader/i, setting: 'OR',
    inclusion: ['Age 18-60', 'Arthroscopic medial meniscal root repair for symptomatic, MRI-confirmed root tear',
      'Informed consent', 'Able/willing to follow postop protocol + f/u'],
    exclusion: ['Prior ipsilateral knee surg', 'Concomitant ligament recon', 'Advanced OA (KL >2)',
      'Inflammatory arthritis / systemic connective tissue dz', 'MRI contraindication'] },
  { match: /suture ?loc/i, setting: 'OR' },
  { match: /^jupiter 4\.0$/i, setting: 'OR' },
  { match: /^outcomes following meniscal repair with BEAR$/i, setting: 'OR' },
  { match: /^coronal plane alignment and meniscus repair outcomes$/i, setting: 'OR' },
];

/* ---------------------------------------------------------------------------
   MENU AND SETUP
--------------------------------------------------------------------------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Studies')
    .addItem('Sync with slides now', 'syncFromSlides')
    .addItem('Sort by slide order', 'sortBySlide')
    .addSeparator()
    .addItem('Set up sheet', 'setUpSheet')
    .addItem('Turn on hourly sync', 'turnOnHourlySync')
    .addItem('Turn off hourly sync', 'turnOffHourlySync')
    .addToUi();
}

/* Creates the tabs, headers, dropdowns and formatting, then syncs. Safe to run again:
   it adds what's missing and never clears anyone's entries. */
function setUpSheet() {
  const ss = SpreadsheetApp.getActive();
  const lists = ss.getSheetByName(LISTS_TAB) || ss.insertSheet(LISTS_TAB);
  const listNames = Object.keys(LIST_DEFAULTS);
  listNames.forEach((name, i) => {
    if (lists.getRange(1, i + 1).getValue()) return; // already set up; the team may have edited it
    lists.getRange(1, i + 1, LIST_DEFAULTS[name].length + 1, 1).setValues([[name], ...LIST_DEFAULTS[name].map(v => [v])]);
  });
  lists.getRange(1, 1, 1, listNames.length).setFontWeight('bold');
  lists.setFrozenRows(1);

  const sheet = studiesTab(ss);
  const cols = headerMap(sheet);
  const maxRows = Math.max(sheet.getMaxRows(), 500);
  if (sheet.getMaxRows() < maxRows) sheet.insertRowsAfter(sheet.getMaxRows(), maxRows - sheet.getMaxRows());
  const rows = maxRows - 1;

  for (const c of COLUMNS) {
    const col = cols[c.h];
    const head = sheet.getRange(1, col);
    head.setFontWeight('bold').setWrap(true)
      .setBackground(c.auto ? '#e8e6ef' : '#57068c').setFontColor(c.auto ? '#333333' : '#ffffff')
      .setNote(c.auto ? [c.note, 'Filled from the slides on every sync; edits here get overwritten.'].filter(Boolean).join('\n\n') : c.note || '');
    sheet.setColumnWidth(col, c.width);
    const body = sheet.getRange(2, col, rows, 1);
    body.setWrap(false).setVerticalAlignment('top');
    if (c.auto) body.setBackground('#f6f5f9');
    // Only the first time: a dropdown the team has set to "Allow multiple selections"
    // (which scripts can't set) would lose that if it were rebuilt here. Rejecting
    // invalid input is what lets Sheets offer multiple selections at all.
    if (c.list && !sheet.getRange(2, col).getDataValidation()) {
      const i = listNames.indexOf(c.list) + 1;
      const source = lists.getRange(2, i, lists.getMaxRows() - 1, 1);
      body.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(source, true).setAllowInvalid(false).build());
    }
    if (c.checkbox) body.setDataValidation(CHECKBOX()); // not insertCheckboxes(), which would untick every box
  }
  sheet.getRange(2, cols[H.statusOverride], rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Active', 'Paused', 'Not ready yet'], true).build());
  sheet.getRange(2, cols[H.lastSeen], rows, 1).setNumberFormat('yyyy-mm-dd h:mm');
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  // Warn (don't block) anyone editing a column the sync rewrites.
  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).filter(p => p.getDescription() === 'From the slides').forEach(p => p.remove());
  COLUMNS.filter(c => c.auto).forEach(c => {
    sheet.getRange(2, cols[c.h], rows, 1).protect().setDescription('From the slides').setWarningOnly(true);
  });

  syncFromSlides();
}

function turnOnHourlySync() {
  turnOffHourlySync();
  ScriptApp.newTrigger('syncFromSlides').timeBased().everyHours(1).create();
  SpreadsheetApp.getActive().toast('The sheet will sync with the slides every hour.');
}

function turnOffHourlySync() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncFromSlides').forEach(t => ScriptApp.deleteTrigger(t));
}

function sortBySlide() {
  const sheet = studiesTab(SpreadsheetApp.getActive());
  const cols = headerMap(sheet);
  const last = lastDataRow(sheet);
  if (last > 2) sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).sort(cols[H.slideNo]);
}

/* The last row with a study or anything typed in it. Not getLastRow(): Sheets counts
   empty checkbox cells as filled, so that would be the bottom of the sheet. */
function lastDataRow(sheet) {
  const n = sheet.getLastRow();
  if (n < 2) return 1;
  const values = sheet.getRange(2, 1, n - 1, sheet.getLastColumn()).getValues();
  for (let i = values.length - 1; i >= 0; i--) if (values[i].some(v => v !== '' && v !== false)) return i + 2;
  return 1;
}

/* The Studies tab, created if missing; any missing column headers are added at the end. */
function studiesTab(ss) {
  const sheet = ss.getSheetByName(STUDIES_TAB) || ss.insertSheet(STUDIES_TAB, 0);
  const have = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String) : [];
  const missing = COLUMNS.map(c => c.h).filter(h => !have.includes(h));
  if (missing.length) {
    if (sheet.getMaxColumns() < have.length + missing.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), have.length + missing.length - sheet.getMaxColumns());
    sheet.getRange(1, have.length + 1, 1, missing.length).setValues([missing]);
  }
  return sheet;
}

const CHECKBOX = () => SpreadsheetApp.newDataValidation().requireCheckbox().build();

/* {header text: 1-based column number} */
function headerMap(sheet) {
  const cols = {};
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].forEach((h, i) => { if (h && !cols[h]) cols[h] = i + 1; });
  return cols;
}

/* ---------------------------------------------------------------------------
   SYNC
--------------------------------------------------------------------------- */
function syncFromSlides() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error('Another sync is running. Try again in a minute.');
  try {
    const ss = SpreadsheetApp.getActive();
    const sheet = studiesTab(ss);
    const studies = buildStudies(readDeck());
    const n = writeStudies(sheet, studies, new Date());
    ss.toast(`${studies.length} studies synced from the slides${n ? `, ${n} new` : ''}.`);
  } finally {
    lock.releaseLock();
  }
}

/* Updates the slide columns of each study's row, adding rows for new studies.
   Only the slide columns are written, so the team's edits during a sync are kept.
   Returns the number of new rows. */
function writeStudies(sheet, studies, now) {
  const cols = headerMap(sheet);
  const width = sheet.getLastColumn();
  const first = lastDataRow(sheet) - 1;
  const data = first > 0 ? sheet.getRange(2, 1, first, width).getValues() : [];
  const idAt = cols[H.slideId] - 1;
  const rowById = new Map();
  data.forEach((r, i) => { if (r[idAt]) rowById.set(String(r[idAt]), i); });

  const seen = new Set();
  for (const study of studies) {
    let i = rowById.get(study.slideId);
    if (i === undefined) {
      const row = new Array(width).fill('');
      seedRow(row, cols, study.title);
      i = data.push(row) - 1;
      rowById.set(study.slideId, i);
    }
    seen.add(study.slideId);
    const row = data[i];
    const values = shownValues(study, manualValues(row, cols), now);
    for (const h in values) row[cols[h] - 1] = values[h];
  }
  data.forEach(r => { if (r[idAt] && !seen.has(String(r[idAt]))) r[cols[H.sync] - 1] = 'Not in deck'; });

  if (data.length > first) {
    const added = data.length - first;
    if (sheet.getMaxRows() < 1 + data.length) sheet.insertRowsAfter(sheet.getMaxRows(), 1 + data.length - sheet.getMaxRows());
    const range = sheet.getRange(2 + first, 1, added, width);
    if (first > 0) { // new rows get row 2's dropdowns, checkboxes and colors
      const model = sheet.getRange(2, 1, 1, width);
      model.copyTo(range, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
      model.copyTo(range, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    }
    range.setValues(data.slice(first));
  }
  for (const c of COLUMNS.filter(c => c.auto)) {
    const col = cols[c.h] - 1;
    if (data.length) sheet.getRange(2, col + 1, data.length, 1).setValues(data.map(r => [r[col]]));
  }
  return data.length - first;
}

function seedRow(row, cols, title) {
  const set = (h, v) => { if (cols[h] && v !== undefined) row[cols[h] - 1] = Array.isArray(v) ? v.join('\n') : v; };
  for (const s of SEED) {
    if (!s.match.test(title)) continue;
    set(H.nickname, s.nickname); set(H.setting, s.setting); set(H.statusOverride, s.statusOverride);
    set(H.areaOverride, s.areaOverride); set(H.nIsTarget, s.nIsTarget); set(H.extraPIs, s.extraPIs);
    set(H.hide, s.hide); set(H.inclusion, s.inclusion); set(H.exclusion, s.exclusion);
  }
  if (cols[H.nIsTarget] && row[cols[H.nIsTarget] - 1] === '') row[cols[H.nIsTarget] - 1] = false;
  if (cols[H.hide] && row[cols[H.hide] - 1] === '') row[cols[H.hide] - 1] = false;
}

function manualValues(row, cols) {
  const get = h => cols[h] ? row[cols[h] - 1] : '';
  return {
    nickname: String(get(H.nickname)).trim(), statusOverride: String(get(H.statusOverride)).trim(),
    areaOverride: String(get(H.areaOverride)).trim(), nIsTarget: get(H.nIsTarget) === true,
    extraPIs: String(get(H.extraPIs)).split(',').map(s => s.trim()).filter(Boolean),
  };
}

const STATUS_LABELS = { active: 'Active', paused: 'Paused', notready: 'Not ready yet' };
const statusFromLabel = t => ({ active: 'active', paused: 'paused', 'not ready yet': 'notready', notready: 'notready' })[t.toLowerCase()] || '';

/* A study's slide columns, with the team's adjustments applied the same way the site does. */
function shownValues(study, m, now) {
  let title = study.title;
  if (m.nickname) {
    const trailing = new RegExp('\\s*\\(' + m.nickname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\)\\s*$', 'i');
    title = `${m.nickname} (${title.replace(trailing, '')})`;
  }
  const sk = statusKey(study.statusText);
  const status = statusFromLabel(m.statusOverride) || (sk === 'active' || sk === 'paused' ? sk : 'notready');
  let n = study.n;
  if (m.nIsTarget && n && !n.target) n = { enrolled: 0, target: n.enrolled };
  const pis = study.pi ? [study.pi] : [];
  const have = new Set(piList(study.pi));
  m.extraPIs.filter(p => !have.has(p)).forEach(p => pis.push(p));
  return {
    [H.study]: title, [H.status]: STATUS_LABELS[status], [H.area]: m.areaOverride || study.category, [H.pi]: pis.join(', '),
    [H.enrolled]: n && n.enrolled !== null ? n.enrolled : '', [H.target]: n && n.target !== null ? n.target : '',
    [H.slideTitle]: study.title, [H.slideStatus]: study.statusText, [H.slideArea]: study.areaFromSlide,
    [H.section]: study.section, [H.slideNo]: study.slide, [H.summary]: study.summary, [H.irb]: study.irb, [H.irbEnd]: study.irbEnd,
    [H.slideCriteria]: study.criteria, [H.nLine]: study.n ? study.n.raw : '', [H.updates]: study.updates.join('\n'),
    [H.details]: study.details, [H.other]: study.other.join('\n'),
    [H.sync]: 'In deck', [H.lastSeen]: now, [H.slideId]: study.slideId,
  };
}

/* ---------------------------------------------------------------------------
   READING THE DECK
   Produces the same shape as the site's loader: {w, h, slides: [{n, id, hidden,
   shapes: [[x, y, text]]}]}, with x/y the top-left corner of each text box.
--------------------------------------------------------------------------- */
// Uses the Slides API (the "Slides" advanced service, switched on in appsscript.json),
// which can read the deck with view-only permission. Sizes and positions are in EMU.
function readDeck() {
  const pres = Slides.Presentations.get(DECK_ID);
  const slides = (pres.slides || []).map((slide, i) => ({
    n: i + 1, id: slide.objectId, hidden: !!(slide.slideProperties && slide.slideProperties.isSkipped),
    shapes: readShapes(slide.pageElements || [], null, []),
  }));
  return { w: pres.pageSize.width.magnitude, h: pres.pageSize.height.magnitude, slides };
}

// Walks the page elements; a grouped element's position goes through its groups' transforms.
function readShapes(elements, parent, out) {
  for (const el of elements) {
    const t = el.transform || {};
    const k = t.unit === 'PT' ? 12700 : 1; // points -> EMU
    const own = { sx: t.scaleX ?? 1, shx: t.shearX || 0, shy: t.shearY || 0, sy: t.scaleY ?? 1, tx: (t.translateX || 0) * k, ty: (t.translateY || 0) * k };
    const m = parent ? compose(parent, own) : own;
    if (el.elementGroup) { readShapes(el.elementGroup.children || [], m, out); continue; }
    let text;
    if (el.shape) text = textOf(el.shape.text);
    else if (el.table) text = (el.table.tableRows || []).flatMap(r => (r.tableCells || []).map(c => cleanText(textOf(c.text)))).filter(Boolean).join('\n');
    else continue;
    text = cleanText(text);
    if (text) out.push([m.tx, m.ty, text]);
  }
  return out;
}

const textOf = text => ((text && text.textElements) || [])
  .map(e => e.textRun ? e.textRun.content : e.autoText ? e.autoText.content || '' : '').join('');

function compose(p, c) {
  return {
    sx: p.sx * c.sx + p.shx * c.shy, shx: p.sx * c.shx + p.shx * c.sy,
    shy: p.shy * c.sx + p.sy * c.shy, sy: p.shy * c.shx + p.sy * c.sy,
    tx: p.sx * c.tx + p.shx * c.ty + p.tx, ty: p.shy * c.tx + p.sy * c.ty + p.ty,
  };
}

// Same clean-up as the site's walkShapes. Slides marks soft line breaks with \v.
function cleanText(text) {
  return String(text).replace(/\v/g, '\n').replace(/\n$/, '')
    .replace(/[ \t ]{2,}/g, ' ').replace(/ *\n */g, '\n')
    .replace(/(:\s*)\.?(\d+)\.(?=\n|$)/g, '$1$2') // "Enrolled this week: .5." -> "Enrolled this week: 5"
    .trim();
}

/* ---------------------------------------------------------------------------
   SLIDE -> STUDY
   Ported from public/index.html (statusKey, parseN, FIELD_LABELS, parseFields,
   slideToStudy, AREA_KEYWORDS, isHeader, buildStudies). Keep the two in step:
   a change to how the site reads a slide belongs in both.
--------------------------------------------------------------------------- */
function statusKey(text) {
  const t = (text || '').trim().toLowerCase();
  if (!t) return 'none';
  if (t.startsWith('active')) return 'active';
  if (t.startsWith('pause') || t.includes('hold')) return 'paused';
  if (t === 'n/a' || t === 'na') return 'na';
  return 'other';
}

function parseN(text) {
  const m = /\bN[ \t]*=[ \t]*([\d,]+)[ \t]*(?:\/[ \t]*([\d,]+))?([^\n]*)/i.exec(text || '');
  if (!m) return null;
  const num = s => s ? parseInt(s.replace(/,/g, ''), 10) : null;
  return { enrolled: num(m[1]), target: num(m[2]), note: (m[3] || '').trim(), raw: m[0].trim() };
}

const FIELD_LABELS = [
  [/^PIs?$/i, 'pi'], [/^Team$/i, 'team'], [/^Fellows?$/i, 'fellow'], [/^Summary$/i, 'summary'], [/^Goals?$/i, 'goal'],
  [/^(IRB|IRB ?#|IRB (number|no\.?)|Study ID|Study #)$/i, 'irb'],
  [/^Inclusion\/Exclusion( criteria)?$/i, 'criteria'],
  [/^(Approval end date|IRB (approval )?(end|expiration) date|Expiration date|Expires)$/i, 'irbEnd'],
];
function parseFields(text) {
  const out = {};
  let lastKey = null;
  for (const raw of (text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^N\s*=/i.test(line)) { lastKey = null; continue; }
    const m = /^([A-Za-z][A-Za-z #/.]*?)\s*(?::\s*(.*)|$)/.exec(line);
    const key = m && (m[2] !== undefined || /^summary$/i.test(m[1])) && (FIELD_LABELS.find(([re]) => re.test(m[1].trim())) || [])[1];
    if (key) {
      lastKey = key;
      out[key] = (m[2] || '').trim();
    } else if (lastKey) {
      out[lastKey] = (out[lastKey] ? out[lastKey] + ' ' : '') + line;
    }
  }
  if (out.irb) out.irb = out.irb.replace(/,?\s*N\s*=.*$/i, '').trim();
  return out;
}

const AREA_KEYWORDS = [
  ['Hamstring', /\bhamstring/i],
  ['Hip', /\b(hip|FAI|femoroacetabular|gluteal)\b/i],
  ['Shoulder', /\b(shoulder|rotator cuff|RCR|labr(um|al)|bankart|latarjet|remplissage|glenoid|biceps|pec(toralis)?|elbow|SLAP)\b/i],
  ['Knee', /\b(knee|ACL|ACLR|PCL|MCL|menisc\w*|patell\w*|MPFL|trochle\w*|tibial|HTO|DFO|TTO|MACI|OCA|MAT|BEAR|cartilage|osteotomy|quad\w*|root repair)\b/i],
];
const guessArea = title => (AREA_KEYWORDS.find(([, re]) => re.test(title)) || [])[0];

const piList = pi => String(pi || '').split(/[,;/]|\band\b/).map(x => x.replace(/\(.*?\)/g, '').trim()).filter(Boolean);

function slideToStudy(slide, w, h, section) {
  const shapes = slide.shapes.map(([x, y, text]) => ({ x: x / w, y: y / h, text: String(text).trim() })).filter(s => s.text);
  const used = new Set();
  const pick = fn => { const s = shapes.find(z => !used.has(z) && fn(z)); if (s) used.add(s); return s; };

  const status = pick(s => s.x > 0.75 && s.y < 0.12 && s.text.length < 30);
  shapes.filter(s => !used.has(s) && s.x > 0.75 && s.y < 0.12 && s.text.length < 30).forEach(s => used.add(s)); // duplicate pills
  const category = pick(s => s.x < 0.1 && s.y < 0.06 && s.text.length < 30 && !s.text.includes('\n'));
  const details = pick(s => /(^|\n)\s*PI\s*:/i.test(s.text));
  const updates = pick(s => /^updates\b/i.test(s.text));
  const titleShape = shapes.filter(s => !used.has(s)).sort((a, b) => a.y - b.y)[0];

  const fields = parseFields(details ? details.text : '');
  const allText = shapes.map(s => s.text).join('\n');
  const rawTitle = titleShape ? titleShape.text.replace(/\s*\n\s*/g, ' ').trim() : '(untitled)';
  return {
    slide: slide.n, slideId: slide.id, section,
    title: rawTitle,
    category: category ? category.text : guessArea(titleShape ? titleShape.text : '') || 'Other',
    areaFromSlide: category ? category.text : '',
    statusText: status ? status.text : '',
    pi: fields.pi || '',
    summary: fields.summary || fields.goal || '', irb: fields.irb || '', irbEnd: fields.irbEnd || '',
    criteria: fields.criteria || '',
    n: parseN(details ? details.text : '') || parseN(allText),
    updates: updates ? updates.text.split('\n').slice(1).map(s => s.trim()).filter(Boolean) : [],
    details: details ? details.text : '',
    other: shapes.filter(s => !used.has(s) && s !== titleShape).sort((a, b) => a.y - b.y || a.x - b.x).map(s => s.text),
  };
}

function isHeader(slide) {
  const texts = slide.shapes.map(s => String(s[2]).trim()).filter(Boolean);
  return texts.length === 1 && texts[0].length < 40 && !texts[0].includes('\n');
}

/* Every study slide under an included section, in deck order. Hidden studies
   (the "Hide from site" box) are still listed; the site leaves them out. */
function buildStudies(deck) {
  const studies = [];
  let section = null;
  for (const slide of deck.slides) {
    if (slide.hidden) continue; // skipped slides never appear
    if (isHeader(slide)) { section = String(slide.shapes[0][2]).trim(); continue; }
    if (!section || !INCLUDE_SECTIONS.some(re => re.test(section))) continue;
    studies.push(slideToStudy(slide, deck.w, deck.h, section));
  }
  return studies;
}
