import React, { useState, useEffect } from 'react';
import { fiscalYearService, reportService, accountService, transactionService, incomeService } from '../../services';
import './reports.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';

const fmt = (val) => {
  if (val === null || val === undefined || val === 0) return '-';
  return Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtSigned = (val) => {
  if (val === null || val === undefined || val === 0) return '-';
  const n = Number(val);
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${abs})` : abs;
};

const pickLatestFiscalYearId = (fyList) => {
  if (!fyList || fyList.length === 0) return null;
  return [...fyList].sort((a, b) => b.year - a.year)[0].id.toString();
};

const REPORT_CARDS = [
  { id: 'tb',     label: 'Trial Balance',                   desc: 'Debit & credit balances for all accounts' },
  { id: 'is',     label: 'Income Statement',                desc: 'Revenue, expenses and net profit / loss' },
  { id: 'fs',     label: 'Statement of Financial Position', desc: 'Assets, liabilities and equity' },
  { id: 'dep',    label: 'Depreciation Schedule',           desc: 'Fixed assets cost, accumulated depreciation and net book value' },
  { id: 'export', label: 'Export All',                      desc: 'Export TB, IS, FS, Depreciation + all account ledgers to one Excel file' },
];


const ReportsPage = () => {
  const [fiscalYears, setFiscalYears]       = useState([]);
  const [selectedYearId, setSelectedYearId] = useState('');
  const [activeCard, setActiveCard]         = useState(null); // null = level-1 menu
  const [tbData, setTbData]                 = useState([]);
  const [isData, setIsData]                 = useState([]);
  const [bsData, setBsData]                 = useState([]);
  const [priorBsData, setPriorBsData]       = useState([]);
  const [ppeData, setPpeData]               = useState([]);  // current year PPE schedule
  const [priorPpeData, setPriorPpeData]     = useState([]);  // prior year PPE schedule
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState('');
  const [exportLoading, setExportLoading]   = useState(false);
  const [pdfUrl, setPdfUrl]                 = useState(null);
  const [pdfStyle, setPdfStyle]             = useState('audit'); // 'modern' | 'audit'
  const [excelPreviewSheets, setExcelPreviewSheets] = useState(null); // null | [{name, headers, rows}]
  const [excelPreviewTab, setExcelPreviewTab]       = useState(0);

  // ── Load fiscal years ──────────────────────────────────────────────
  useEffect(() => {
    fiscalYearService.listFiscalYears().then(res => {
      const rows = Array.isArray(res.data) ? res.data : [];
      setFiscalYears(rows);
      const id = pickLatestFiscalYearId(rows);
      if (id) setSelectedYearId(id);
    }).catch(err => console.error('Failed to load fiscal years', err));
  }, []);

  // ── Load all report data when year changes ─────────────────────────
  useEffect(() => {
    if (!selectedYearId) return;
    const load = async () => {
      setLoading(true); setError('');
      try { const r = await reportService.getTrialBalance(selectedYearId);    setTbData(Array.isArray(r.data) ? r.data : []); } catch (e) { console.error(e); setError('Failed to load Trial Balance.'); }
      try { const r = await reportService.getIncomeStatement(selectedYearId); setIsData(Array.isArray(r.data) ? r.data : []); } catch (e) { console.error(e); }
      try { const r = await reportService.getFinancialPosition(selectedYearId); setBsData(Array.isArray(r.data) ? r.data : []); } catch (e) { console.error(e); }
      try { const r = await reportService.getPPESchedule(selectedYearId);  setPpeData(Array.isArray(r.data) ? r.data : []); } catch (e) { console.error(e); setPpeData([]); }
      // Prior year for depreciation roll-forward
      const allFY = fiscalYears.length ? fiscalYears : [];
      const sorted = [...allFY].sort((a, b) => b.year - a.year);
      const idx = sorted.findIndex(fy => String(fy.id) === String(selectedYearId));
      const priorFY = idx >= 0 ? sorted[idx + 1] : null;
      if (priorFY) {
        try { const r = await reportService.getFinancialPosition(priorFY.id); setPriorBsData(Array.isArray(r.data) ? r.data : []); } catch (e) { setPriorBsData([]); }
        try { const r = await reportService.getPPESchedule(priorFY.id);  setPriorPpeData(Array.isArray(r.data) ? r.data : []); } catch (e) { setPriorPpeData([]); }
      } else { setPriorBsData([]); setPriorPpeData([]); }
      setLoading(false);
    };
    load();
  }, [selectedYearId]);

  // Auto-build combined PDF when entering Export All view (or when FY data reloads)
  useEffect(() => {
    if (activeCard === 'export' && !loading && tbData.length > 0) {
      const { doc } = buildExportAllPdf(); // eslint-disable-line no-use-before-define
      setPdfUrl(doc.output('bloburl'));
    }
  }, [activeCard, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shared helpers ─────────────────────────────────────────────────
  const getFY = () => fiscalYears.find(fy => String(fy.id) === String(selectedYearId));

  const fmtFyEndDate = (fy) => {
    if (!fy) return '';
    const d = fy.endDate || fy.end_date || '';
    return d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : String(fy.year);
  };

  const getPriorFY = () => {
    const sorted = [...fiscalYears].sort((a, b) => b.year - a.year);
    const idx = sorted.findIndex(fy => String(fy.id) === String(selectedYearId));
    return idx >= 0 ? sorted[idx + 1] : null;
  };

  const getEndDateLabel = () => {
    const fy = getFY(); if (!fy) return '';
    const d = fy.endDate || fy.end_date || '';
    return d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : String(fy.year);
  };

  const getPeriodLabel = () => {
    const fy = getFY(); if (!fy) return '';
    const d = fy.endDate || fy.end_date || ''; if (!d) return '';
    const yr = new Date(d).getFullYear();
    return `1 April ${yr - 1} to 31 March ${yr}`;
  };

  // ── Audit PDF helpers ──────────────────────────────────────────────
  const drawAuditHeader = (doc, lines) => {
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFont('times', 'bold'); doc.setFontSize(11); doc.setTextColor(0, 0, 0);
    lines.forEach((text, i) => {
      const y = 22 + i * 8;
      doc.text(text, pageW / 2, y, { align: 'center' });
      const tw = doc.getTextWidth(text);
      doc.setLineWidth(0.25); doc.setDrawColor(0, 0, 0);
      doc.line(pageW / 2 - tw / 2, y + 0.8, pageW / 2 + tw / 2, y + 0.8);
    });
  };

  const auditTableOptions = (rows, startY, totalRowIndex) => ({
    head: [['Account Title', 'Debit (HK$)', 'Credit (HK$)']],
    body: rows,
    startY,
    margin: { left: 20, right: 20, bottom: 15 },
    styles: { font: 'times', fontSize: 9, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 }, textColor: [0,0,0], lineWidth: 0, fillColor: false },
    headStyles: { font: 'times', fontStyle: 'bold', fillColor: false, textColor: [0,0,0], fontSize: 9, halign: 'right', lineWidth: 0, cellPadding: { top: 1.5, bottom: 2.5, left: 2, right: 2 } },
    alternateRowStyles: { fillColor: false },
    columnStyles: { 0: { halign: 'left' }, 1: { halign: 'right', cellWidth: 38 }, 2: { halign: 'right', cellWidth: 38 } },
    didParseCell: (d) => {
      if (d.section === 'head' && d.column.index === 0) d.cell.styles.halign = 'left';
      if (d.section === 'body' && d.row.index === totalRowIndex) d.cell.styles.fontStyle = 'bold';
    },
    didDrawCell: (d) => {
      const doc2 = d.doc;
      if (d.section === 'head') {
        doc2.setDrawColor(0,0,0); doc2.setLineWidth(0.3);
        doc2.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height);
      }
      if (d.section === 'body' && d.row.index === totalRowIndex) {
        const x1 = d.cell.x, x2 = d.cell.x + d.cell.width, yT = d.cell.y, yB = d.cell.y + d.cell.height;
        doc2.setDrawColor(0,0,0); doc2.setLineWidth(0.3);
        doc2.line(x1, yT, x2, yT); doc2.line(x1, yB, x2, yB); doc2.line(x1, yB + 0.8, x2, yB + 0.8);
      }
    },
    didDrawPage: (d) => {
      const ph = d.doc.internal.pageSize.getHeight(), n = d.doc.internal.getNumberOfPages();
      d.doc.setFont('times','normal'); d.doc.setFontSize(7); d.doc.setTextColor(100,100,100);
      d.doc.text(`Page ${d.pageNumber} of ${n}`, d.doc.internal.pageSize.getWidth() - 20, ph - 5, { align: 'right' });
      d.doc.text(`Generated on ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}`, 20, ph - 5);
    },
  });

  const modernTableOptions = (rows, startY, totalRowIndex) => ({
    head: [['Account Title', 'Debit (HK$)', 'Credit (HK$)']],
    body: rows,
    startY,
    margin: { left: 12, right: 12, bottom: 12 },
    styles: { fontSize: 9, cellPadding: { top: 1.8, bottom: 1.8, left: 3, right: 3 }, textColor: [30,30,30], lineColor: [220,220,220], lineWidth: 0.1 },
    headStyles: { fillColor: [26,54,93], textColor: [255,255,255], fontStyle: 'bold', fontSize: 9, halign: 'right', cellPadding: { top: 2.3, bottom: 2.3, left: 3, right: 3 } },
    columnStyles: { 0: { halign: 'left' }, 1: { halign: 'right', cellWidth: 35 }, 2: { halign: 'right', cellWidth: 35 } },
    alternateRowStyles: { fillColor: [245,248,252] },
    didParseCell: (d) => {
      if (d.section === 'head' && d.column.index === 0) d.cell.styles.halign = 'left';
      if (d.section === 'body' && d.row.index === totalRowIndex) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [26,54,93]; d.cell.styles.textColor = [255,255,255]; }
    },
    didDrawPage: (d) => {
      const ph = d.doc.internal.pageSize.getHeight(), pw = d.doc.internal.pageSize.getWidth(), n = d.doc.internal.getNumberOfPages();
      d.doc.setFontSize(7); d.doc.setFont(undefined,'normal'); d.doc.setTextColor(150,150,150);
      d.doc.line(12, ph - 8, pw - 12, ph - 8);
      d.doc.text(`Generated on ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}`, 12, ph - 4);
      d.doc.text(`Page ${d.pageNumber} of ${n}`, pw - 12, ph - 4, { align: 'right' });
    },
  });

  // ── TB PDF ─────────────────────────────────────────────────────────
  const buildTbPdf = () => {
    const rows = tbData.map(r => [r.acc_name, fmt(r.dr), fmt(r.cr)]);
    const totalIdx = rows.length - 1;
    const endDateLabel = getEndDateLabel();
    const fy = getFY();
    const yearLabel = fy ? fy.year : selectedYearId;

    const doc = new jsPDF({ orientation: tbData.length > 45 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    if (pdfStyle === 'audit') {
      drawAuditHeader(doc, ['ARK EDUCATION LIMITED', 'TRIAL BALANCE', `AS AT ${endDateLabel.toUpperCase()}`]);
      autoTable(doc, auditTableOptions(rows, 50, totalIdx));
    } else {
      doc.setFillColor(26,54,93); doc.rect(0,0,pageW,20,'F');
      doc.setFontSize(13); doc.setFont(undefined,'bold'); doc.setTextColor(255,255,255);
      doc.text('Ark Education Limited', pageW/2, 8, { align: 'center' });
      doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.setTextColor(180,210,255);
      doc.text(`Trial Balance  |  As at ${endDateLabel}`, pageW/2, 15, { align: 'center' });
      autoTable(doc, modernTableOptions(rows, 22, totalIdx));
    }
    return { doc, yearLabel };
  };

  // ── IS PDF ─────────────────────────────────────────────────────────
  const buildIsPdf = () => {
    const revenue  = isData.filter(r => r.acc_type === -1);
    const adminExp = isData.filter(r => r.acc_type === 1 && r.acc_code < 8000);
    const otherExp = isData.filter(r => r.acc_type === 1 && r.acc_code >= 8000);
    const totalRevenue  = revenue.reduce((s,r)  => s + (Number(r.amount)||0), 0);
    const totalAdmin    = adminExp.reduce((s,r) => s + (Number(r.amount)||0), 0);
    const totalOther    = otherExp.reduce((s,r) => s + (Number(r.amount)||0), 0);
    const netPL         = totalRevenue - totalAdmin - totalOther;
    const periodLabel   = getPeriodLabel();
    const fy = getFY(); const yearLabel = fy ? fy.year : selectedYearId;

    const rows = [
      ['Revenue', '', ''],
      ...revenue.map(r  => [`  ${r.acc_name}`, '', fmtSigned(r.amount)]),
      ['  Total revenue', '', fmtSigned(totalRevenue)],
      ['Administration expenses', '', ''],
      ...adminExp.map(r => [`  ${r.acc_name}`, fmtSigned(r.amount), '']),
      ['  Total administration expenses', '', fmtSigned(-totalAdmin)],
      ['Other operation expenses', '', ''],
      ...otherExp.map(r => [`  ${r.acc_name}`, fmtSigned(r.amount), '']),
      ['  Total other operation expenses', '', fmtSigned(-totalOther)],
      [`${netPL >= 0 ? 'Profit' : 'Loss'} before tax`, '', fmtSigned(netPL)],
      ['  Income tax expense', '', '-'],
      [`${netPL >= 0 ? 'Profit' : 'Loss'} for the year / period`, '', fmtSigned(netPL)],
    ];
    const totalIdx = rows.length - 1;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    if (pdfStyle === 'audit') {
      drawAuditHeader(doc, ['ARK EDUCATION LIMITED', 'DETAILED INCOME STATEMENT', `FOR THE PERIOD FROM ${periodLabel.toUpperCase()}`]);
      autoTable(doc, { ...auditTableOptions(rows, 50, totalIdx), head: [['', 'HK$', 'HK$']] });
    } else {
      doc.setFillColor(26,54,93); doc.rect(0,0,pageW,20,'F');
      doc.setFontSize(13); doc.setFont(undefined,'bold'); doc.setTextColor(255,255,255);
      doc.text('Ark Education Limited', pageW/2, 8, { align: 'center' });
      doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.setTextColor(180,210,255);
      doc.text(`Income Statement  |  ${periodLabel}`, pageW/2, 15, { align: 'center' });
      autoTable(doc, { ...modernTableOptions(rows, 22, totalIdx), head: [['', 'HK$', 'HK$']] });
    }
    return { doc, yearLabel };
  };

  // ── FS PDF ─────────────────────────────────────────────────────────
  const buildFsPdf = () => {
    const ppe        = bsData.filter(r => r.acc_code >= 1100 && r.acc_code <= 1399);
    const accumDepr  = bsData.find(r  => r.acc_code === 1714);
    const curAssets  = bsData.filter(r => r.acc_code >= 1400 && r.acc_code <= 1699);
    const liabs      = bsData.filter(r => r.acc_code >= 2000 && r.acc_code <= 2999);
    const equity     = bsData.filter(r => (r.acc_code >= 1700 && r.acc_code < 2000) || r.acc_code >= 3000);
    const totalRev   = isData.filter(r => r.acc_type === -1).reduce((s,r) => s+(Number(r.amount)||0), 0);
    const totalExp   = isData.filter(r => r.acc_type === 1 ).reduce((s,r) => s+(Number(r.amount)||0), 0);
    const curYearPL  = totalRev - totalExp;
    const sum = arr  => arr.reduce((s,r) => s+(Number(r.amount)||0), 0);
    const accumDeprAmt = accumDepr ? Number(accumDepr.amount)||0 : 0;
    const netPPE = sum(ppe) - accumDeprAmt;
    const totalCA = sum(curAssets), totalL = sum(liabs);
    const netCA = totalCA - totalL, netAssets = netPPE + netCA;
    const totalEq = sum(equity) + curYearPL;
    const endDateLabel = getEndDateLabel();
    const fy = getFY(); const yearLabel = fy ? fy.year : selectedYearId;

    const rows = [
      ['Non-current assets', '', ''],
      ...ppe.map(r => [`  ${r.acc_name}`, fmtSigned(r.amount), '']),
      ...(accumDepr ? [[`  ${accumDepr.acc_name}`, fmtSigned(-accumDeprAmt), '']] : []),
      ['  Net non-current assets', '', fmtSigned(netPPE)],
      ['Current assets', '', ''],
      ...curAssets.map(r => [`  ${r.acc_name}`, fmtSigned(r.amount), '']),
      ['  Total current assets', '', fmtSigned(totalCA)],
      ['Current liabilities', '', ''],
      ...liabs.map(r => [`  ${r.acc_name}`, fmtSigned(r.amount), '']),
      ['  Total current liabilities', '', fmtSigned(-totalL)],
      ['Net current assets / (liabilities)', '', fmtSigned(netCA)],
      ['Net assets', '', fmtSigned(netAssets)],
      ['Equity', '', ''],
      ...equity.map(r => [`  ${r.acc_name}`, fmtSigned(r.amount), '']),
      [`  ${curYearPL >= 0 ? 'Profit' : 'Loss'} for the year / period`, fmtSigned(curYearPL), ''],
      ['Total equity', '', fmtSigned(totalEq)],
    ];
    const totalIdx = rows.length - 1;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    if (pdfStyle === 'audit') {
      drawAuditHeader(doc, ['ARK EDUCATION LIMITED', 'STATEMENT OF FINANCIAL POSITION', `AT ${endDateLabel.toUpperCase()}`]);
      autoTable(doc, { ...auditTableOptions(rows, 50, totalIdx), head: [['', 'HK$', 'HK$']] });
    } else {
      doc.setFillColor(26,54,93); doc.rect(0,0,pageW,20,'F');
      doc.setFontSize(13); doc.setFont(undefined,'bold'); doc.setTextColor(255,255,255);
      doc.text('Ark Education Limited', pageW/2, 8, { align: 'center' });
      doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.setTextColor(180,210,255);
      doc.text(`Statement of Financial Position  |  As at ${endDateLabel}`, pageW/2, 15, { align: 'center' });
      autoTable(doc, { ...modernTableOptions(rows, 22, totalIdx), head: [['', 'HK$', 'HK$']] });
    }
    return { doc, yearLabel };
  };

  // ── Depreciation PDF ───────────────────────────────────────────────
  const buildDepPdf = () => {
    // ppeData rows: { acc_code, acc_name, cost, accum_depr, nbv }
    const depExp         = isData.find(r  => r.acc_code === 8100);
    const accumDepr      = bsData.find(r  => r.acc_code === 1714);
    const priorAccumDepr = priorBsData.find(r => r.acc_code === 1714);
    const sumF           = (arr, field) => arr.reduce((s, r) => s + (Number(r[field]) || 0), 0);
    const totalCost      = sumF(ppeData, 'cost');
    const priorTotalCost = sumF(priorPpeData, 'cost');
    const totalAccumDepr = accumDepr      ? Math.abs(Number(accumDepr.amount)      || 0) : sumF(ppeData, 'accum_depr');
    const priorAccumAmt  = priorAccumDepr ? Math.abs(Number(priorAccumDepr.amount) || 0) : sumF(priorPpeData, 'accum_depr');
    const totalNbv       = totalCost - totalAccumDepr;
    const priorNbv       = priorTotalCost - priorAccumAmt;
    const depExpAmt      = depExp ? Number(depExp.amount) || 0 : 0;
    const endDateLabel   = getEndDateLabel();
    const priorFY        = getPriorFY();
    const priorEndLabel  = fmtFyEndDate(priorFY);
    const hasPrior       = priorPpeData.length > 0;
    const fy = getFY(); const yearLabel = fy ? fy.year : selectedYearId;
    const isAudit = pdfStyle === 'audit';

    const allCodes   = [...new Set([...ppeData.map(r => r.acc_code), ...priorPpeData.map(r => r.acc_code)])].sort((a,b) => a - b);
    const nameFor    = code => { const r = ppeData.find(x => x.acc_code === code) || priorPpeData.find(x => x.acc_code === code); return r ? r.acc_name : `Account ${code}`; };
    const curCost    = code => { const r = ppeData.find(x => x.acc_code === code);      return r ? Number(r.cost)       || 0 : 0; };
    const priorCost  = code => { const r = priorPpeData.find(x => x.acc_code === code); return r ? Number(r.cost)       || 0 : 0; };
    const curAccum   = code => { const r = ppeData.find(x => x.acc_code === code);      return r ? Number(r.accum_depr) || 0 : 0; };
    const priorAccum = code => { const r = priorPpeData.find(x => x.acc_code === code); return r ? Number(r.accum_depr) || 0 : 0; };
    const curNbv     = code => { const r = ppeData.find(x => x.acc_code === code);      return r ? Number(r.nbv)        || 0 : 0; };
    const priorNbvV  = code => { const r = priorPpeData.find(x => x.acc_code === code); return r ? Number(r.nbv)        || 0 : 0; };
    const fmt        = v => (v === 0 || v === null || v === undefined) ? '-' : fmtSigned(v);
    const EMPTY      = '';

    const colHead = [EMPTY, ...allCodes.map(c => `${nameFor(c)}\nHK$`), 'Total\nHK$'];

    const body        = [];
    const sectionIdxs = new Set();
    const totalIdxs   = new Set();
    const nbvIdxs     = new Set();
    const spacerIdxs  = new Set();

    const pushSection = label => { sectionIdxs.add(body.length); body.push([label, ...allCodes.map(() => EMPTY), EMPTY]); };
    const pushData    = (label, perCode, totalVal) => body.push([`  ${label}`, ...allCodes.map(c => fmt(perCode(c))), fmt(totalVal)]);
    const pushTotal   = (label, perCode, totalVal) => { totalIdxs.add(body.length); body.push([label, ...allCodes.map(c => perCode ? fmt(perCode(c)) : EMPTY), fmt(totalVal)]); };
    const pushNbv     = (label, perCode, totalVal) => { nbvIdxs.add(body.length); body.push([label, ...allCodes.map(c => perCode ? fmt(perCode(c)) : EMPTY), fmt(totalVal)]); };
    const pushSpacer  = () => { spacerIdxs.add(body.length); body.push([EMPTY, ...allCodes.map(() => EMPTY), EMPTY]); };

    // COST
    pushSection('Cost');
    if (hasPrior) pushData('Balance at beginning of year', priorCost, priorTotalCost);
    pushData('Additions during the year', c => curCost(c) - priorCost(c), totalCost - priorTotalCost);
    pushTotal('Balance at end of year', curCost, totalCost);
    pushSpacer();

    // ACCUMULATED DEPRECIATION
    pushSection('Accumulated depreciation');
    if (hasPrior) pushData('Balance at beginning of year', priorAccum, priorAccumAmt);
    pushData('Depreciation charge for the year', c => curAccum(c) - priorAccum(c), depExpAmt || (totalAccumDepr - priorAccumAmt));
    pushTotal('Balance at end of year', curAccum, totalAccumDepr);
    pushSpacer();

    // CARRYING AMOUNT
    pushSection('Carrying amount');
    pushNbv(`  As at ${endDateLabel}`, curNbv, totalNbv);
    if (hasPrior) pushNbv(`  As at ${priorEndLabel}`, priorNbvV, priorNbv);

    const assetColW = Math.min(34, Math.max(22, Math.floor(170 / allCodes.length)));
    const colStyles = { 0: { halign: 'left', cellWidth: 'auto' } };
    allCodes.forEach((_, i) => { colStyles[i + 1] = { halign: 'right', cellWidth: assetColW }; });
    colStyles[allCodes.length + 1] = { halign: 'right', cellWidth: assetColW + 6, fontStyle: 'bold' };

    const doc    = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW  = doc.internal.pageSize.getWidth();
    const startY = isAudit ? 50 : 52;

    if (isAudit) {
      drawAuditHeader(doc, ['ARK EDUCATION LIMITED', 'PROPERTY, PLANT AND EQUIPMENT', `FOR THE YEAR ENDED ${endDateLabel.toUpperCase()}`]);
    } else {
      doc.setFillColor(26,54,93); doc.rect(0,0,pageW,20,'F');
      doc.setFontSize(13); doc.setFont(undefined,'bold'); doc.setTextColor(255,255,255);
      doc.text('Ark Education Limited', pageW/2, 8, { align: 'center' });
      doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.setTextColor(180,210,255);
      doc.text(`Property, Plant and Equipment  |  Year ended ${endDateLabel}`, pageW/2, 15, { align: 'center' });
    }

    autoTable(doc, {
      head: [colHead],
      body,
      startY,
      margin: { left: 14, right: 14, bottom: 15 },
      styles: isAudit
        ? { font: 'times', fontSize: 8.5, cellPadding: { top: 1.4, bottom: 1.4, left: 2, right: 2 }, textColor: [0,0,0], lineWidth: 0, fillColor: false }
        : { fontSize: 8.5, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, textColor: [30,30,30], lineWidth: 0.1, lineColor: [220,220,220] },
      headStyles: isAudit
        ? { font: 'times', fontStyle: 'bold', fillColor: false, textColor: [0,0,0], fontSize: 8.5, halign: 'right', lineWidth: 0, cellPadding: { top: 1.4, bottom: 2.2, left: 2, right: 2 } }
        : { fillColor: [26,54,93], textColor: [255,255,255], fontStyle: 'bold', fontSize: 8.5, halign: 'right', cellPadding: { top: 2, bottom: 2, left: 2, right: 2 } },
      alternateRowStyles: { fillColor: false },
      columnStyles: colStyles,
      didParseCell: (d) => {
        if (d.section === 'head' && d.column.index === 0) d.cell.styles.halign = 'left';
        if (d.section === 'body') {
          const i = d.row.index;
          if (sectionIdxs.has(i)) d.cell.styles.fontStyle = 'bold';
          if (totalIdxs.has(i) || nbvIdxs.has(i)) d.cell.styles.fontStyle = 'bold';
          if (spacerIdxs.has(i)) d.cell.styles.cellPadding = { top: 3, bottom: 0, left: 2, right: 2 };
        }
      },
      didDrawCell: isAudit ? (d) => {
        if (d.section === 'head') {
          d.doc.setDrawColor(0,0,0); d.doc.setLineWidth(0.3);
          d.doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height);
        }
        if (d.section === 'body') {
          const i = d.row.index;
          if (totalIdxs.has(i)) {
            d.doc.setDrawColor(0,0,0); d.doc.setLineWidth(0.3);
            d.doc.line(d.cell.x, d.cell.y, d.cell.x + d.cell.width, d.cell.y);
            d.doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height);
          }
          if (nbvIdxs.has(i)) {
            const yB = d.cell.y + d.cell.height;
            d.doc.setDrawColor(0,0,0); d.doc.setLineWidth(0.3);
            d.doc.line(d.cell.x, yB, d.cell.x + d.cell.width, yB);
            d.doc.line(d.cell.x, yB + 0.8, d.cell.x + d.cell.width, yB + 0.8);
          }
        }
      } : undefined,
      didDrawPage: (d) => {
        const ph = d.doc.internal.pageSize.getHeight(), pw = d.doc.internal.pageSize.getWidth(), n = d.doc.internal.getNumberOfPages();
        if (isAudit) {
          d.doc.setFont('times','normal'); d.doc.setFontSize(7); d.doc.setTextColor(100,100,100);
          d.doc.text(`Page ${d.pageNumber} of ${n}`, pw - 14, ph - 4, { align: 'right' });
          d.doc.text(`Generated on ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}`, 14, ph - 4);
        } else {
          d.doc.setFontSize(7); d.doc.setFont(undefined,'normal'); d.doc.setTextColor(150,150,150);
          d.doc.line(10, ph - 7, pw - 10, ph - 7);
          d.doc.text(`Generated on ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}`, 10, ph - 3);
          d.doc.text(`Page ${d.pageNumber} of ${n}`, pw - 10, ph - 3, { align: 'right' });
        }
      },
    });
    return { doc, yearLabel };
  };

  // ── PDF actions ────────────────────────────────────────────────────
  const getBuilder = () => activeCard === 'tb' ? buildTbPdf : activeCard === 'is' ? buildIsPdf : activeCard === 'dep' ? buildDepPdf : activeCard === 'export' ? buildExportAllPdf : buildFsPdf; // eslint-disable-line no-use-before-define

  const handlePreviewPdf = () => {
    const { doc } = getBuilder()();
    setPdfUrl(doc.output('bloburl'));
  };

  const handleExportPdf = () => {
    const { doc, yearLabel } = getBuilder()();
    const prefix = activeCard === 'export' ? 'AllReports' : activeCard;
    doc.save(`${prefix}_${yearLabel}.pdf`);
  };

  const handlePrint = () => {
    if (!pdfUrl) return;
    const win = window.open(pdfUrl, '_blank');
    if (win) win.addEventListener('load', () => win.print());
  };

  // ── Excel export ───────────────────────────────────────────────────
  const handleExportExcel = async () => {
    const fy = getFY();
    const yearLabel = fy ? fy.year : selectedYearId;
    const endDateLabel = getEndDateLabel();
    const periodLabel = getPeriodLabel();

    const wb = new ExcelJS.Workbook();

    const addHeaderBlock = (ws, lines, cols) => {
      lines.forEach(txt => {
        const row = ws.addRow([txt]);
        const cell = row.getCell(1);
        cell.font = { name: 'Times New Roman', bold: true, size: 12 };
        cell.alignment = { horizontal: 'center' };
        ws.mergeCells(`A${row.number}:${String.fromCharCode(64 + cols)}${row.number}`);
      });
      ws.addRow([]); ws.addRow([]);
    };

    const addColHeader = (ws, labels) => {
      const row = ws.addRow(labels);
      row.eachCell((cell, c) => {
        cell.font = { name: 'Times New Roman', bold: true, size: 11 };
        cell.alignment = { horizontal: c === 1 ? 'left' : 'right' };
        cell.border = { bottom: { style: 'thin' } };
      });
    };

    const addDataRow = (ws, values) => {
      const row = ws.addRow(values);
      row.eachCell({ includeEmpty: true }, (cell, c) => {
        cell.font = { name: 'Times New Roman', size: 11 };
        if (c > 1 && cell.value !== null && cell.value !== undefined) {
          cell.alignment = { horizontal: 'right' };
          cell.numFmt = '#,##0.00';
        }
      });
    };

    const addTotalRow = (ws, values) => {
      const row = ws.addRow(values);
      row.eachCell({ includeEmpty: true }, (cell, c) => {
        cell.font = { name: 'Times New Roman', bold: true, size: 11 };
        if (c > 1) {
          cell.alignment = { horizontal: 'right' };
          cell.numFmt = '#,##0.00';
          cell.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
        }
      });
    };

    if (activeCard === 'tb') {
      const ws = wb.addWorksheet('Trial Balance');
      ws.columns = [{ width: 40 }, { width: 18 }, { width: 18 }];
      addHeaderBlock(ws, ['ARK EDUCATION LIMITED', 'TRIAL BALANCE', `AS AT ${endDateLabel.toUpperCase()}`], 3);
      addColHeader(ws, ['Account Title', 'Debit (HK$)', 'Credit (HK$)']);
      const data = tbData.filter(r => !/^total$/i.test((r.acc_name||'').trim()));
      data.forEach(r => addDataRow(ws, [r.acc_name, r.dr ? Number(r.dr) : null, r.cr ? Number(r.cr) : null]));
      addTotalRow(ws, ['Total', data.reduce((s,r) => s+(Number(r.dr)||0), 0), data.reduce((s,r) => s+(Number(r.cr)||0), 0)]);
    }

    if (activeCard === 'is') {
      const ws = wb.addWorksheet('Income Statement');
      ws.columns = [{ width: 45 }, { width: 18 }, { width: 18 }];
      addHeaderBlock(ws, ['ARK EDUCATION LIMITED', 'DETAILED INCOME STATEMENT', `FOR THE PERIOD FROM ${periodLabel.toUpperCase()}`], 3);
      addColHeader(ws, ['', 'HK$', 'HK$']);
      const revenue  = isData.filter(r => r.acc_type === -1);
      const adminExp = isData.filter(r => r.acc_type === 1 && r.acc_code < 8000);
      const otherExp = isData.filter(r => r.acc_type === 1 && r.acc_code >= 8000);
      const totalRev   = revenue.reduce((s,r) => s+(Number(r.amount)||0), 0);
      const totalAdmin = adminExp.reduce((s,r) => s+(Number(r.amount)||0), 0);
      const totalOther = otherExp.reduce((s,r) => s+(Number(r.amount)||0), 0);
      const netPL = totalRev - totalAdmin - totalOther;
      ws.addRow(['Revenue']).getCell(1).font = { name: 'Times New Roman', bold: true, size: 11 };
      revenue.forEach(r  => addDataRow(ws, [`  ${r.acc_name}`, null, Number(r.amount)||0]));
      addTotalRow(ws, ['  Total revenue', null, totalRev]);
      ws.addRow(['Administration expenses']).getCell(1).font = { name: 'Times New Roman', bold: true, size: 11 };
      adminExp.forEach(r => addDataRow(ws, [`  ${r.acc_name}`, Number(r.amount)||0, null]));
      addTotalRow(ws, ['  Total administration expenses', null, -totalAdmin]);
      ws.addRow(['Other operation expenses']).getCell(1).font = { name: 'Times New Roman', bold: true, size: 11 };
      otherExp.forEach(r => addDataRow(ws, [`  ${r.acc_name}`, Number(r.amount)||0, null]));
      addTotalRow(ws, ['  Total other operation expenses', null, -totalOther]);
      addDataRow(ws, [`${netPL >= 0 ? 'Profit' : 'Loss'} before tax`, null, netPL]);
      addDataRow(ws, ['  Income tax expense', null, null]);
      addTotalRow(ws, [`${netPL >= 0 ? 'Profit' : 'Loss'} for the year / period`, null, netPL]);
    }

    if (activeCard === 'fs') {
      const ws = wb.addWorksheet('Financial Position');
      ws.columns = [{ width: 45 }, { width: 18 }, { width: 18 }];
      addHeaderBlock(ws, ['ARK EDUCATION LIMITED', 'STATEMENT OF FINANCIAL POSITION', `AT ${endDateLabel.toUpperCase()}`], 3);
      addColHeader(ws, ['', 'HK$', 'HK$']);
      const curAssets = bsData.filter(r => r.acc_code >= 1400 && r.acc_code <= 1699);
      const liabs     = bsData.filter(r => r.acc_code >= 2000 && r.acc_code <= 2999);
      // Exclude 1714 (accumulated depreciation – contra-asset, not equity)
      const equity    = bsData.filter(r => ((r.acc_code >= 1700 && r.acc_code < 2000) || r.acc_code >= 3000) && r.acc_code !== 1714);
      const totalRev  = isData.filter(r => r.acc_type === -1).reduce((s,r) => s+(Number(r.amount)||0), 0);
      const totalExp  = isData.filter(r => r.acc_type === 1 ).reduce((s,r) => s+(Number(r.amount)||0), 0);
      const curYearPL = totalRev - totalExp;
      const sum = arr => arr.reduce((s,r) => s+(Number(r.amount)||0), 0);
      // PPE as single net line from ppeData
      const netPPE = ppeData.reduce((s, r) => s + (Number(r.nbv) || 0), 0);
      const totalCA = sum(curAssets), totalL = sum(liabs);
      const netCA = totalCA - totalL, netAssets = netPPE + netCA, totalEq = sum(equity) + curYearPL;
      ws.addRow(['Non-current assets']).getCell(1).font = { name: 'Times New Roman', bold: true, size: 11 };
      addDataRow(ws, ['  Property, plant and equipment', netPPE, null]);
      addTotalRow(ws, ['  Net non-current assets', null, netPPE]);
      ws.addRow(['Current assets']).getCell(1).font = { name: 'Times New Roman', bold: true, size: 11 };
      curAssets.forEach(r => addDataRow(ws, [`  ${r.acc_name}`, Number(r.amount)||0, null]));
      addTotalRow(ws, ['  Total current assets', null, totalCA]);
      ws.addRow(['Current liabilities']).getCell(1).font = { name: 'Times New Roman', bold: true, size: 11 };
      liabs.forEach(r => addDataRow(ws, [`  ${r.acc_name}`, Number(r.amount)||0, null]));
      addTotalRow(ws, ['  Total current liabilities', null, -totalL]);
      addDataRow(ws, ['Net current assets / (liabilities)', null, netCA]);
      addTotalRow(ws, ['Net assets', null, netAssets]);
      ws.addRow(['Accumulated fund']).getCell(1).font = { name: 'Times New Roman', bold: true, size: 11 };
      equity.forEach(r => addDataRow(ws, [`  ${r.acc_name}`, Number(r.amount)||0, null]));
      addDataRow(ws, [`  ${curYearPL >= 0 ? 'Profit' : 'Loss'} for the year`, curYearPL, null]);
      addTotalRow(ws, ['Total accumulated fund', null, totalEq]);
    }

    if (activeCard === 'dep') {
      // ppeData rows: { acc_code, acc_name, cost, accum_depr, nbv }
      const depExp         = isData.find(r  => r.acc_code === 8100);
      const accumDepr      = bsData.find(r  => r.acc_code === 1714);
      const priorAccumDepr = priorBsData.find(r => r.acc_code === 1714);
      const sumF           = (arr, field) => arr.reduce((s, r) => s + (Number(r[field]) || 0), 0);
      const totalCost      = sumF(ppeData, 'cost');
      const priorTotalCost = sumF(priorPpeData, 'cost');
      const totalAccumDepr = accumDepr      ? Math.abs(Number(accumDepr.amount)      || 0) : sumF(ppeData, 'accum_depr');
      const priorAccumAmt  = priorAccumDepr ? Math.abs(Number(priorAccumDepr.amount) || 0) : sumF(priorPpeData, 'accum_depr');
      const totalNbv       = totalCost - totalAccumDepr;
      const priorNbv       = priorTotalCost - priorAccumAmt;
      const depExpAmt      = depExp ? Number(depExp.amount) || 0 : 0;
      const priorFY        = getPriorFY();
      const priorEndLabel  = fmtFyEndDate(priorFY);
      const hasPrior       = priorPpeData.length > 0;
      const allCodes = [...new Set([...ppeData.map(r => r.acc_code), ...priorPpeData.map(r => r.acc_code)])].sort((a,b) => a-b);
      const nameFor    = code => { const r = ppeData.find(x => x.acc_code === code) || priorPpeData.find(x => x.acc_code === code); return r ? r.acc_name : `Account ${code}`; };
      const curCost    = code => { const r = ppeData.find(x => x.acc_code === code);      return r ? Number(r.cost)       || 0 : 0; };
      const priorCost  = code => { const r = priorPpeData.find(x => x.acc_code === code); return r ? Number(r.cost)       || 0 : 0; };
      const curAccum   = code => { const r = ppeData.find(x => x.acc_code === code);      return r ? Number(r.accum_depr) || 0 : 0; };
      const priorAccum = code => { const r = priorPpeData.find(x => x.acc_code === code); return r ? Number(r.accum_depr) || 0 : 0; };
      const curNbv     = code => { const r = ppeData.find(x => x.acc_code === code);      return r ? Number(r.nbv)        || 0 : 0; };
      const priorNbvV  = code => { const r = priorPpeData.find(x => x.acc_code === code); return r ? Number(r.nbv)        || 0 : 0; };
      const numCols  = allCodes.length + 2;

      const ws = wb.addWorksheet('Depreciation Schedule');
      ws.columns = [{ width: 42 }, ...allCodes.map(() => ({ width: 16 })), { width: 18 }];
      addHeaderBlock(ws, ['ARK EDUCATION LIMITED', 'PROPERTY, PLANT AND EQUIPMENT', `FOR THE YEAR ENDED ${endDateLabel.toUpperCase()}`], numCols);
      addColHeader(ws, ['', ...allCodes.map(c => `${nameFor(c)}\nHK$`), 'Total\nHK$']);

      const addXlSection = label => {
        const r = ws.addRow([label, ...allCodes.map(() => null), null]);
        r.getCell(1).font = { name: 'Times New Roman', bold: true, size: 11 };
        r.getCell(1).alignment = { indent: 0 };
      };
      const addXlData = (label, perCode, totalVal) => {
        addDataRow(ws, [`  ${label}`, ...allCodes.map(c => perCode ? perCode(c) : null), totalVal]);
      };
      const addXlTotal = (label, perCode, totalVal) => {
        addTotalRow(ws, [label, ...allCodes.map(c => perCode ? perCode(c) : null), totalVal]);
      };

      // COST
      addXlSection('Cost');
      if (hasPrior) addXlData('Balance at beginning of year', c => priorCost(c) || null, priorTotalCost || null);
      addXlData('Additions during the year', c => (curCost(c) - priorCost(c)) || null, (totalCost - priorTotalCost) || null);
      addXlTotal('Balance at end of year', c => curCost(c) || null, totalCost);

      ws.addRow([]);

      // ACCUMULATED DEPRECIATION
      addXlSection('Accumulated depreciation');
      if (hasPrior) addDataRow(ws, [`  Balance at beginning of year`, ...allCodes.map(c => priorAccum(c) || null), priorAccumAmt || null]);
      addDataRow(ws, [`  Depreciation charge for the year`, ...allCodes.map(c => (curAccum(c) - priorAccum(c)) || null), depExpAmt || (totalAccumDepr - priorAccumAmt) || null]);
      addXlTotal('Balance at end of year', c => curAccum(c) || null, totalAccumDepr);

      ws.addRow([]);

      // CARRYING AMOUNT
      addXlSection('Carrying amount');
      addXlTotal(`  As at ${endDateLabel}`, c => curNbv(c) || null, totalNbv);
      if (hasPrior) addXlTotal(`  As at ${priorEndLabel}`, c => priorNbvV(c) || null, priorNbv);
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${activeCard}_${yearLabel}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Excel Preview ──────────────────────────────────────────────────
  const buildPreviewSheets = async () => {
    const fy = getFY();
    if (!fy) return [];
    const fmtN = v => (v != null && v !== 0 && v !== '') ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
    const row  = (cells, type = 'data') => ({ cells, type });
    const sheets = [];

    // 1. Trial Balance
    {
      const data = tbData.filter(r => !/^total$/i.test((r.acc_name||'').trim()));
      const rows = data.map(r => row([r.acc_name, fmtN(r.dr), fmtN(r.cr)]));
      rows.push(row(['TOTAL', fmtN(data.reduce((s,r)=>s+(Number(r.dr)||0),0)), fmtN(data.reduce((s,r)=>s+(Number(r.cr)||0),0))], 'total'));
      sheets.push({ name: 'Trial Balance', headers: ['Account Title', 'Debit (HK$)', 'Credit (HK$)'], rows });
    }

    // 2. Income Statement
    {
      const revenue  = isData.filter(r => r.acc_type === -1);
      const adminExp = isData.filter(r => r.acc_type === 1 && r.acc_code < 8000);
      const otherExp = isData.filter(r => r.acc_type === 1 && r.acc_code >= 8000);
      const totalRev   = revenue.reduce((s,r)=>s+(Number(r.amount)||0),0);
      const totalAdmin = adminExp.reduce((s,r)=>s+(Number(r.amount)||0),0);
      const totalOther = otherExp.reduce((s,r)=>s+(Number(r.amount)||0),0);
      const netPL = totalRev - totalAdmin - totalOther;
      const rows = [];
      rows.push(row(['Revenue', '', ''], 'section'));
      revenue.forEach(r => rows.push(row([`  ${r.acc_name}`, '', fmtN(r.amount)])));
      rows.push(row(['  Total revenue', '', fmtN(totalRev)], 'total'));
      rows.push(row(['Administration expenses', '', ''], 'section'));
      adminExp.forEach(r => rows.push(row([`  ${r.acc_name}`, fmtN(r.amount), ''])));
      rows.push(row(['  Total administration expenses', '', fmtN(-totalAdmin)], 'total'));
      rows.push(row(['Other operation expenses', '', ''], 'section'));
      otherExp.forEach(r => rows.push(row([`  ${r.acc_name}`, fmtN(r.amount), ''])));
      rows.push(row(['  Total other operation expenses', '', fmtN(-totalOther)], 'total'));
      rows.push(row([`${netPL >= 0 ? 'Profit' : 'Loss'} for the year / period`, '', fmtN(netPL)], 'total'));
      sheets.push({ name: 'Income Statement', headers: ['', 'HK$', 'HK$'], rows });
    }

    // 3. Financial Position
    {
      const curAssets = bsData.filter(r => r.acc_code >= 1400 && r.acc_code <= 1699);
      const liabs     = bsData.filter(r => r.acc_code >= 2000 && r.acc_code <= 2999);
      const equity    = bsData.filter(r => ((r.acc_code >= 1700 && r.acc_code < 2000) || r.acc_code >= 3000) && r.acc_code !== 1714);
      const totalRev  = isData.filter(r => r.acc_type === -1).reduce((s,r)=>s+(Number(r.amount)||0),0);
      const totalExp  = isData.filter(r => r.acc_type === 1 ).reduce((s,r)=>s+(Number(r.amount)||0),0);
      const curYearPL = totalRev - totalExp;
      const sumArr = arr => arr.reduce((s,r)=>s+(Number(r.amount)||0),0);
      const netPPE = ppeData.reduce((s,r)=>s+(Number(r.nbv)||0),0);
      const totalCA = sumArr(curAssets), totalL = sumArr(liabs);
      const netCA = totalCA - totalL, netAssets = netPPE + netCA, totalEq = sumArr(equity) + curYearPL;
      const rows = [];
      rows.push(row(['Non-current assets', '', ''], 'section'));
      rows.push(row(['  Property, plant and equipment', fmtN(netPPE), '']));
      rows.push(row(['  Net non-current assets', '', fmtN(netPPE)], 'total'));
      rows.push(row(['Current assets', '', ''], 'section'));
      curAssets.forEach(r => rows.push(row([`  ${r.acc_name}`, fmtN(r.amount), ''])));
      rows.push(row(['  Total current assets', '', fmtN(totalCA)], 'total'));
      rows.push(row(['Current liabilities', '', ''], 'section'));
      liabs.forEach(r => rows.push(row([`  ${r.acc_name}`, fmtN(r.amount), ''])));
      rows.push(row(['  Total current liabilities', '', fmtN(-totalL)], 'total'));
      rows.push(row(['Net current assets / (liabilities)', '', fmtN(netCA)]));
      rows.push(row(['Net assets', '', fmtN(netAssets)], 'total'));
      rows.push(row(['Accumulated fund', '', ''], 'section'));
      equity.forEach(r => rows.push(row([`  ${r.acc_name}`, fmtN(r.amount), ''])));
      rows.push(row([`  ${curYearPL >= 0 ? 'Profit' : 'Loss'} for the year`, fmtN(curYearPL), '']));
      rows.push(row(['Total accumulated fund', '', fmtN(totalEq)], 'total'));
      sheets.push({ name: 'Financial Position', headers: ['', 'HK$', 'HK$'], rows });
    }

    // 4. Depreciation Schedule (simplified 3-col: Name, Current Cost, NBV)
    {
      const rows = [];
      rows.push(row(['Asset', 'Cost (HK$)', 'Accum Depr (HK$)', 'NBV (HK$)'], 'header'));
      ppeData.forEach(r => rows.push(row([r.acc_name, fmtN(r.cost), fmtN(r.accum_depr), fmtN(r.nbv)])));
      const totalCost = ppeData.reduce((s,r)=>s+(Number(r.cost)||0),0);
      const totalAccum = ppeData.reduce((s,r)=>s+(Number(r.accum_depr)||0),0);
      const totalNbv = ppeData.reduce((s,r)=>s+(Number(r.nbv)||0),0);
      rows.push(row(['Total', fmtN(totalCost), fmtN(totalAccum), fmtN(totalNbv)], 'total'));
      sheets.push({ name: 'Depreciation', headers: ['Asset', 'Cost (HK$)', 'Accum Depr (HK$)', 'NBV (HK$)'], rows });
    }

    // 5. Account Ledgers
    const accsResp = await accountService.listAccounts();
    const allAccounts = Array.isArray(accsResp.data) ? accsResp.data : [];
    const txResults = await Promise.all(
      allAccounts.map(acc => {
        const accCode = acc.accCode ?? acc.acc_code ?? acc.id;
        return transactionService.listTransactions({ accountId: accCode, fiscalYear: fy.year })
          .then(r => ({ accCode, txs: Array.isArray(r.data) ? r.data : [] }))
          .catch(() => ({ accCode, txs: [] }));
      })
    );
    const txByCode = {};
    txResults.forEach(({ accCode, txs }) => { txByCode[accCode] = txs; });
    const fyBegin = new Date(fy.beginDate || fy.begin_date).getTime();
    const fyEnd   = new Date(fy.endDate   || fy.end_date  ).getTime();
    const pn = v => { const n = Number(v); return isFinite(n) ? n : 0; };

    for (const acc of allAccounts) {
      const accCode = acc.id;
      const accName = acc.accName ?? acc.acc_name ?? '';
      const accType = acc.accType ?? acc.acc_type ?? 1;
      const needsBF = (acc.bC ?? acc.b_c) === 1;
      const allTxs  = txByCode[accCode] || [];
      if (allTxs.length === 0) continue;

      const normalized = allTxs.map(tx => {
        const amount = pn(tx.amount), txType = pn(tx.type);
        let dr = 0, cr = 0;
        if (amount !== 0 && txType !== 0 && accType !== 0) {
          if (accCode === 1600) { dr = txType > 0 ? amount : 0; cr = txType < 0 ? amount : 0; }
          else { dr = txType < 0 ? amount : 0; cr = txType > 0 ? amount : 0; }
        } else { dr = pn(tx.drAmount ?? tx.dr_amount); cr = pn(tx.crAmount ?? tx.cr_amount); }
        return { ...tx, _dr: dr, _cr: cr };
      });
      normalized.sort((a, b) => {
        const da = new Date(a.date||0).getTime(), db = new Date(b.date||0).getTime();
        return da !== db ? da - db : pn(a.id) - pn(b.id);
      });
      let runDr = 0, runCr = 0;
      const withBal = normalized.map(tx => {
        runDr += tx._dr; runCr += tx._cr;
        return { ...tx, _runBal: accType === -1 ? runCr - runDr : runDr - runCr };
      });
      const prior  = withBal.filter(tx => new Date(tx.date||0).getTime() < fyBegin);
      const bfBal  = prior.length > 0 ? prior[prior.length-1]._runBal : 0;
      const fyRows = withBal.filter(tx => { const t = new Date(tx.date||0).getTime(); return t >= fyBegin && t <= fyEnd; });
      if (fyRows.length === 0) continue;

      const sheetRows = [];
      if (needsBF) {
        const bfDateStr = String(fy.beginDate || fy.begin_date || '').slice(0,10);
        sheetRows.push(row([bfDateStr, 'Balance b/f', '', '', fmtN(bfBal)], 'bf'));
      }
      let fyRunDr = 0, fyRunCr = 0;
      fyRows.forEach(tx => {
        const dateStr = tx.date ? String(tx.date).slice(0,10) : '';
        const remarks = tx.Remarks ?? tx.remarks ?? tx.typeDes ?? tx.type_des ?? '';
        const refNo   = tx.refNo ?? tx.ref_no ?? '';
        const desc    = [remarks, refNo].filter(Boolean).join(' ').trim() || '-';
        fyRunDr += tx._dr; fyRunCr += tx._cr;
        const bal = needsBF ? tx._runBal : (accType === -1 ? fyRunCr - fyRunDr : fyRunDr - fyRunCr);
        sheetRows.push(row([
          dateStr, desc,
          tx._dr > 0 ? fmtN(tx._dr) : '',
          tx._cr > 0 ? fmtN(tx._cr) : '',
          fmtN(Math.round(bal*100)/100),
        ]));
      });
      const totalDr = fyRows.reduce((s,t)=>s+t._dr,0);
      const totalCr = fyRows.reduce((s,t)=>s+t._cr,0);
      const closingBal = needsBF ? (fyRows.length > 0 ? fyRows[fyRows.length-1]._runBal : bfBal) : (accType === -1 ? fyRunCr - fyRunDr : fyRunDr - fyRunCr);
      sheetRows.push(row(['', 'Total / Closing Balance', fmtN(totalDr)||'', fmtN(totalCr)||'', fmtN(Math.round(closingBal*100)/100)], 'total'));
      const sheetName = accName.replace(/[[\]*?:/\\]/g, '-').slice(0, 31);
      sheets.push({ name: sheetName, headers: ['Date', 'Particulars', 'Dr (HK$)', 'Cr (HK$)', 'Balance (HK$)'], rows: sheetRows });
    }

    return sheets;
  };

  const handlePreviewExcel = async () => {
    setExportLoading(true);
    try {
      const sheets = await buildPreviewSheets();
      setExcelPreviewSheets(sheets);
      setExcelPreviewTab(0);
    } finally {
      setExportLoading(false);
    }
  };

  // ── Export All ─────────────────────────────────────────────────────
  const handleExportAll = async () => {
    const fy = getFY();
    if (!fy) return;
    const yearLabel    = fy.year;
    const endDateLabel = getEndDateLabel();
    const periodLabel  = getPeriodLabel();
    setExportLoading(true);
    try {
      const wb = new ExcelJS.Workbook();

      const addHeaderBlock = (ws, lines, cols) => {
        lines.forEach(txt => {
          const row = ws.addRow([txt]);
          const cell = row.getCell(1);
          cell.font = { name: 'Times New Roman', bold: true, size: 12 };
          cell.alignment = { horizontal: 'center' };
          ws.mergeCells(`A${row.number}:${String.fromCharCode(64 + cols)}${row.number}`);
        });
        ws.addRow([]); ws.addRow([]);
      };
      const addColHeader = (ws, labels) => {
        const row = ws.addRow(labels);
        row.eachCell((cell, c) => {
          cell.font = { name: 'Times New Roman', bold: true, size: 11 };
          cell.alignment = { horizontal: c === 1 ? 'left' : 'right' };
          cell.border = { bottom: { style: 'thin' } };
        });
      };
      const addDataRow = (ws, values) => {
        const row = ws.addRow(values);
        row.eachCell({ includeEmpty: true }, (cell, c) => {
          cell.font = { name: 'Times New Roman', size: 11 };
          if (c > 1 && cell.value !== null && cell.value !== undefined) {
            cell.alignment = { horizontal: 'right' };
            cell.numFmt = '#,##0.00';
          }
        });
      };
      const addTotalRow = (ws, values) => {
        const row = ws.addRow(values);
        row.eachCell({ includeEmpty: true }, (cell, c) => {
          cell.font = { name: 'Times New Roman', bold: true, size: 11 };
          if (c > 1) {
            cell.alignment = { horizontal: 'right' };
            cell.numFmt = '#,##0.00';
            cell.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
          }
        });
      };

      // ── 1. Trial Balance ─────────────────────────────────────────────
      {
        const ws = wb.addWorksheet('Trial Balance');
        ws.columns = [{ width: 40 }, { width: 18 }, { width: 18 }];
        addHeaderBlock(ws, ['ARK EDUCATION LIMITED', 'TRIAL BALANCE', `AS AT ${endDateLabel.toUpperCase()}`], 3);
        addColHeader(ws, ['Account Title', 'Debit (HK$)', 'Credit (HK$)']);
        const data = tbData.filter(r => !/^total$/i.test((r.acc_name||'').trim()));
        data.forEach(r => addDataRow(ws, [r.acc_name, r.dr ? Number(r.dr) : null, r.cr ? Number(r.cr) : null]));
        addTotalRow(ws, ['Total', data.reduce((s,r) => s+(Number(r.dr)||0), 0), data.reduce((s,r) => s+(Number(r.cr)||0), 0)]);
      }

      // ── 2. Income Statement ──────────────────────────────────────────
      {
        const ws = wb.addWorksheet('Income Statement');
        ws.columns = [{ width: 45 }, { width: 18 }, { width: 18 }];
        addHeaderBlock(ws, ['ARK EDUCATION LIMITED', 'DETAILED INCOME STATEMENT', `FOR THE PERIOD FROM ${periodLabel.toUpperCase()}`], 3);
        addColHeader(ws, ['', 'HK$', 'HK$']);
        const revenue  = isData.filter(r => r.acc_type === -1);
        const adminExp = isData.filter(r => r.acc_type === 1 && r.acc_code < 8000);
        const otherExp = isData.filter(r => r.acc_type === 1 && r.acc_code >= 8000);
        const totalRev   = revenue.reduce((s,r) => s+(Number(r.amount)||0), 0);
        const totalAdmin = adminExp.reduce((s,r) => s+(Number(r.amount)||0), 0);
        const totalOther = otherExp.reduce((s,r) => s+(Number(r.amount)||0), 0);
        const netPL = totalRev - totalAdmin - totalOther;
        ws.addRow(['Revenue']).getCell(1).font = { name: 'Times New Roman', bold: true, size: 11 };
        revenue.forEach(r  => addDataRow(ws, [`  ${r.acc_name}`, null, Number(r.amount)||0]));
        addTotalRow(ws, ['  Total revenue', null, totalRev]);
        ws.addRow(['Administration expenses']).getCell(1).font = { name: 'Times New Roman', bold: true, size: 11 };
        adminExp.forEach(r => addDataRow(ws, [`  ${r.acc_name}`, Number(r.amount)||0, null]));
        addTotalRow(ws, ['  Total administration expenses', null, -totalAdmin]);
        ws.addRow(['Other operation expenses']).getCell(1).font = { name: 'Times New Roman', bold: true, size: 11 };
        otherExp.forEach(r => addDataRow(ws, [`  ${r.acc_name}`, Number(r.amount)||0, null]));
        addTotalRow(ws, ['  Total other operation expenses', null, -totalOther]);
        addDataRow(ws, [`${netPL >= 0 ? 'Profit' : 'Loss'} before tax`, null, netPL]);
        addDataRow(ws, ['  Income tax expense', null, null]);
        addTotalRow(ws, [`${netPL >= 0 ? 'Profit' : 'Loss'} for the year / period`, null, netPL]);
      }

      // ── 3. Financial Position ────────────────────────────────────────
      {
        const ws = wb.addWorksheet('Financial Position');
        ws.columns = [{ width: 45 }, { width: 18 }, { width: 18 }];
        addHeaderBlock(ws, ['ARK EDUCATION LIMITED', 'STATEMENT OF FINANCIAL POSITION', `AT ${endDateLabel.toUpperCase()}`], 3);
        addColHeader(ws, ['', 'HK$', 'HK$']);
        const curAssets = bsData.filter(r => r.acc_code >= 1400 && r.acc_code <= 1699);
        const liabs     = bsData.filter(r => r.acc_code >= 2000 && r.acc_code <= 2999);
        const equity    = bsData.filter(r => ((r.acc_code >= 1700 && r.acc_code < 2000) || r.acc_code >= 3000) && r.acc_code !== 1714);
        const totalRev  = isData.filter(r => r.acc_type === -1).reduce((s,r) => s+(Number(r.amount)||0), 0);
        const totalExp  = isData.filter(r => r.acc_type === 1 ).reduce((s,r) => s+(Number(r.amount)||0), 0);
        const curYearPL = totalRev - totalExp;
        const sumArr    = arr => arr.reduce((s,r) => s+(Number(r.amount)||0), 0);
        const netPPE    = ppeData.reduce((s, r) => s + (Number(r.nbv) || 0), 0);
        const totalCA = sumArr(curAssets), totalL = sumArr(liabs);
        const netCA = totalCA - totalL, netAssets = netPPE + netCA, totalEq = sumArr(equity) + curYearPL;
        ws.addRow(['Non-current assets']).getCell(1).font = { name: 'Times New Roman', bold: true, size: 11 };
        addDataRow(ws, ['  Property, plant and equipment', netPPE, null]);
        addTotalRow(ws, ['  Net non-current assets', null, netPPE]);
        ws.addRow(['Current assets']).getCell(1).font = { name: 'Times New Roman', bold: true, size: 11 };
        curAssets.forEach(r => addDataRow(ws, [`  ${r.acc_name}`, Number(r.amount)||0, null]));
        addTotalRow(ws, ['  Total current assets', null, totalCA]);
        ws.addRow(['Current liabilities']).getCell(1).font = { name: 'Times New Roman', bold: true, size: 11 };
        liabs.forEach(r => addDataRow(ws, [`  ${r.acc_name}`, Number(r.amount)||0, null]));
        addTotalRow(ws, ['  Total current liabilities', null, -totalL]);
        addDataRow(ws, ['Net current assets / (liabilities)', null, netCA]);
        addTotalRow(ws, ['Net assets', null, netAssets]);
        ws.addRow(['Accumulated fund']).getCell(1).font = { name: 'Times New Roman', bold: true, size: 11 };
        equity.forEach(r => addDataRow(ws, [`  ${r.acc_name}`, Number(r.amount)||0, null]));
        addDataRow(ws, [`  ${curYearPL >= 0 ? 'Profit' : 'Loss'} for the year`, curYearPL, null]);
        addTotalRow(ws, ['Total accumulated fund', null, totalEq]);
      }

      // ── 4. Depreciation Schedule ─────────────────────────────────────
      {
        const depExp         = isData.find(r  => r.acc_code === 8100);
        const accumDepr      = bsData.find(r  => r.acc_code === 1714);
        const priorAccumDepr = priorBsData.find(r => r.acc_code === 1714);
        const sumF           = (arr, field) => arr.reduce((s, r) => s + (Number(r[field]) || 0), 0);
        const totalCost      = sumF(ppeData, 'cost');
        const priorTotalCost = sumF(priorPpeData, 'cost');
        const totalAccumDepr = accumDepr      ? Math.abs(Number(accumDepr.amount)      || 0) : sumF(ppeData, 'accum_depr');
        const priorAccumAmt  = priorAccumDepr ? Math.abs(Number(priorAccumDepr.amount) || 0) : sumF(priorPpeData, 'accum_depr');
        const totalNbv       = totalCost - totalAccumDepr;
        const priorNbv       = priorTotalCost - priorAccumAmt;
        const depExpAmt      = depExp ? Number(depExp.amount) || 0 : 0;
        const priorFYx       = getPriorFY();
        const priorEndLabel  = fmtFyEndDate(priorFYx);
        const hasPrior       = priorPpeData.length > 0;
        const allCodes = [...new Set([...ppeData.map(r => r.acc_code), ...priorPpeData.map(r => r.acc_code)])].sort((a,b) => a-b);
        const nameFor    = code => { const r = ppeData.find(x => x.acc_code === code) || priorPpeData.find(x => x.acc_code === code); return r ? r.acc_name : `Account ${code}`; };
        const curCost    = code => { const r = ppeData.find(x => x.acc_code === code);      return r ? Number(r.cost)       || 0 : 0; };
        const priorCost  = code => { const r = priorPpeData.find(x => x.acc_code === code); return r ? Number(r.cost)       || 0 : 0; };
        const curAccum   = code => { const r = ppeData.find(x => x.acc_code === code);      return r ? Number(r.accum_depr) || 0 : 0; };
        const priorAccum = code => { const r = priorPpeData.find(x => x.acc_code === code); return r ? Number(r.accum_depr) || 0 : 0; };
        const curNbv     = code => { const r = ppeData.find(x => x.acc_code === code);      return r ? Number(r.nbv)        || 0 : 0; };
        const priorNbvV  = code => { const r = priorPpeData.find(x => x.acc_code === code); return r ? Number(r.nbv)        || 0 : 0; };
        const numCols    = allCodes.length + 2;
        const ws = wb.addWorksheet('Depreciation Schedule');
        ws.columns = [{ width: 42 }, ...allCodes.map(() => ({ width: 16 })), { width: 18 }];
        addHeaderBlock(ws, ['ARK EDUCATION LIMITED', 'PROPERTY, PLANT AND EQUIPMENT', `FOR THE YEAR ENDED ${endDateLabel.toUpperCase()}`], numCols);
        addColHeader(ws, ['', ...allCodes.map(c => `${nameFor(c)}\nHK$`), 'Total\nHK$']);
        const addXlSection = label => {
          const r = ws.addRow([label, ...allCodes.map(() => null), null]);
          r.getCell(1).font = { name: 'Times New Roman', bold: true, size: 11 };
        };
        const addXlData = (label, perCode, totalVal) => {
          addDataRow(ws, [`  ${label}`, ...allCodes.map(c => perCode ? perCode(c) : null), totalVal]);
        };
        const addXlTotal = (label, perCode, totalVal) => {
          addTotalRow(ws, [label, ...allCodes.map(c => perCode ? perCode(c) : null), totalVal]);
        };
        addXlSection('Cost');
        if (hasPrior) addXlData('Balance at beginning of year', c => priorCost(c) || null, priorTotalCost || null);
        addXlData('Additions during the year', c => (curCost(c) - priorCost(c)) || null, (totalCost - priorTotalCost) || null);
        addXlTotal('Balance at end of year', c => curCost(c) || null, totalCost);
        ws.addRow([]);
        addXlSection('Accumulated depreciation');
        if (hasPrior) addDataRow(ws, [`  Balance at beginning of year`, ...allCodes.map(c => priorAccum(c) || null), priorAccumAmt || null]);
        addDataRow(ws, [`  Depreciation charge for the year`, ...allCodes.map(c => (curAccum(c) - priorAccum(c)) || null), depExpAmt || (totalAccumDepr - priorAccumAmt) || null]);
        addXlTotal('Balance at end of year', c => curAccum(c) || null, totalAccumDepr);
        ws.addRow([]);
        addXlSection('Carrying amount');
        addXlTotal(`  As at ${endDateLabel}`, c => curNbv(c) || null, totalNbv);
        if (hasPrior) addXlTotal(`  As at ${priorEndLabel}`, c => priorNbvV(c) || null, priorNbv);
      }

      // ── 5. Account Ledgers ────────────────────────────────────────────
      const accsResp   = await accountService.listAccounts();
      const allAccounts = Array.isArray(accsResp.data) ? accsResp.data : [];

      // Pre-fetch linked transactions for acc 4100
      const linkedTxMap = {}; // { [accDetailId]: [{ transaction_id, student_name, net }] }
      try {
        const fyFrom = String(fy.beginDate || fy.begin_date || '').slice(0, 10);
        const fyTo   = String(fy.endDate   || fy.end_date   || '').slice(0, 10);
        const incomeRes = await incomeService.listIncomeEntries({ from: fyFrom, to: fyTo + ' 23:59:59' });
        (Array.isArray(incomeRes.data) ? incomeRes.data : []).forEach(e => {
          if (e.linked_txs?.length) linkedTxMap[e.id] = e.linked_txs;
        });
      } catch (_) { /* non-fatal */ }

      // Fetch all account transactions in parallel
      const txResults = await Promise.all(
        allAccounts.map(acc => {
          const accCode = acc.accCode ?? acc.acc_code ?? acc.id;
          return transactionService.listTransactions({ accountId: accCode, fiscalYear: fy.year })
            .then(r => ({ accCode, txs: Array.isArray(r.data) ? r.data : [] }))
            .catch(() => ({ accCode, txs: [] }));
        })
      );
      const txByCode = {};
      txResults.forEach(({ accCode, txs }) => { txByCode[accCode] = txs; });

      const fyBegin = new Date(fy.beginDate || fy.begin_date).getTime();
      const fyEnd   = new Date(fy.endDate   || fy.end_date  ).getTime();
      const pn = v => { const n = Number(v); return isFinite(n) ? n : 0; };

      for (const acc of allAccounts) {
        const accCode = acc.id; // account.id === acc_code in this system
        const accName = acc.accName ?? acc.acc_name ?? '';
        const accType = acc.accType ?? acc.acc_type ?? 1;
        const allTxs  = txByCode[accCode] || [];
        if (allTxs.length === 0) continue;

        // Normalise dr/cr amounts from each transaction's perspective
        const normalized = allTxs.map(tx => {
          const amount = pn(tx.amount);
          const txType = pn(tx.type);
          let dr = 0, cr = 0;
          if (amount !== 0 && txType !== 0 && accType !== 0) {
            if (accCode === 1600) {
              dr = txType > 0 ? amount : 0;
              cr = txType < 0 ? amount : 0;
            } else {
              dr = txType < 0 ? amount : 0;
              cr = txType > 0 ? amount : 0;
            }
          } else {
            dr = pn(tx.drAmount ?? tx.dr_amount);
            cr = pn(tx.crAmount ?? tx.cr_amount);
          }
          return { ...tx, _dr: dr, _cr: cr };
        });

        // Sort chronologically
        normalized.sort((a, b) => {
          const da = new Date(a.date || 0).getTime(), db = new Date(b.date || 0).getTime();
          if (da !== db) return da - db;
          return pn(a.id) - pn(b.id);
        });

        // Compute cumulative running balance (full history)
        let runDr = 0, runCr = 0;
        const withBal = normalized.map(tx => {
          runDr += tx._dr; runCr += tx._cr;
          const bal = accType === -1 ? runCr - runDr : runDr - runCr;
          return { ...tx, _runBal: bal };
        });

        // Opening balance = last cumulative balance before FY start
        const prior  = withBal.filter(tx => new Date(tx.date || 0).getTime() < fyBegin);
        const bfBal  = prior.length > 0 ? prior[prior.length - 1]._runBal : 0;

        // Transactions within the fiscal year
        const fyRows = withBal.filter(tx => {
          const t = new Date(tx.date || 0).getTime();
          return t >= fyBegin && t <= fyEnd;
        });

        if (fyRows.length === 0) continue;

        // Excel sheet name: short acc name only (max 31 chars, no special chars)
        const sheetName = accName.replace(/[\[\]*?:/\\]/g, '-').slice(0, 31);
        const is4100 = accCode === 4100;
        // 4100 uses 9 cols (adds Remarks + Ref No); others use 7 cols
        const totalCols = is4100 ? 9 : 7;
        const numFmtFrom = is4100 ? 7 : 5;

        const ws = wb.addWorksheet(sheetName);
        if (is4100) {
          ws.columns = [{ width: 10 }, { width: 13 }, { width: 28 }, { width: 16 }, { width: 10 }, { width: 24 }, { width: 14 }, { width: 14 }, { width: 14 }];
        } else {
          ws.columns = [{ width: 10 }, { width: 13 }, { width: 32 }, { width: 22 }, { width: 16 }, { width: 16 }, { width: 16 }];
        }
        addHeaderBlock(ws, ['ARK EDUCATION LIMITED', `LEDGER: ${accCode} ${accName}`, `FOR THE YEAR ENDED ${endDateLabel.toUpperCase()}`], totalCols);
        if (is4100) {
          addColHeader(ws, ['Acc ID', 'Date', 'Remarks', 'Ref No', 'Tx ID', 'Student Name', 'Dr (HK$)', 'Cr (HK$)', 'Balance (HK$)']);
        } else {
          addColHeader(ws, ['ID', 'Date', 'Remarks', 'Ref No', 'Dr (HK$)', 'Cr (HK$)', 'Balance (HK$)']);
        }

        // helper: text cols 1-(numFmtFrom-1), numeric cols numFmtFrom-end
        const addLedgerRow = (ws2, values, opts = {}) => {
          const row = ws2.addRow(values);
          row.eachCell({ includeEmpty: true }, (cell, c) => {
            cell.font = { name: 'Times New Roman', size: 11, bold: !!opts.bold, italic: !!opts.italic };
            if (c >= numFmtFrom && cell.value !== null && cell.value !== undefined) {
              cell.alignment = { horizontal: 'right' };
              cell.numFmt = '#,##0.00';
              if (opts.bold) cell.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
            }
          });
        };

        // Balance b/f row (only for balance sheet accounts where b_c = 1)
        const needsBF = (acc.bC ?? acc.b_c) === 1;
        const bfDateStr = fy.beginDate || fy.begin_date ? String(fy.beginDate || fy.begin_date).slice(0, 10) : '';
        if (needsBF) {
          const bfValues = is4100
            ? [null, bfDateStr, 'Balance b/f', null, null, null, null, null, bfBal !== 0 ? Math.round(bfBal * 100) / 100 : null]
            : [null, bfDateStr, 'Balance b/f', null, null, null, bfBal !== 0 ? Math.round(bfBal * 100) / 100 : null];
          addLedgerRow(ws, bfValues, { italic: true });
        }

        let totalDr = 0, totalCr = 0;
        let fyRunDr = 0;
        let fyRunCr = 0;
        fyRows.forEach(tx => {
          const dateStr = tx.date ? String(tx.date).slice(0, 10) : '';
          const remarks = tx.Remarks ?? tx.remarks ?? tx.typeDes ?? tx.type_des ?? '';
          const refNo   = tx.refNo ?? tx.ref_no ?? '';

          // ── acc 4100: expand to linked student transaction sub-rows ──
          if (is4100 && linkedTxMap[tx.id]?.length) {
            const linked = linkedTxMap[tx.id];
            linked.forEach((ltx, i) => {
              const net = Math.round((Number(ltx.net) || 0) * 100) / 100;
              fyRunCr += net;
              totalCr += net;
              const rowBal = Math.round((fyRunCr - fyRunDr) * 100) / 100;
              addLedgerRow(ws, [
                i === 0 ? tx.id ?? null : null,
                i === 0 ? dateStr : '',
                i === 0 ? (remarks || '') : '',
                i === 0 ? (refNo || '') : '',
                ltx.transaction_id ?? null,
                ltx.student_name || '',
                null,
                net || null,
                rowBal,
              ]);
            });
            return;
          }

          // ── 4100 entry with no linked txs (show entry-level row only) ──
          if (is4100) {
            const dr = tx._dr;
            const cr = tx._cr;
            totalDr += dr; totalCr += cr;
            fyRunDr += dr; fyRunCr += cr;
            const rowBal = Math.round((fyRunCr - fyRunDr) * 100) / 100;
            addLedgerRow(ws, [
              tx.id ?? null, dateStr, remarks || '', refNo || '',
              null, '',
              dr > 0 ? Math.round(dr * 100) / 100 : null,
              cr > 0 ? Math.round(cr * 100) / 100 : null,
              rowBal,
            ]);
            return;
          }

          // ── normal row ──
          totalDr += tx._dr;
          totalCr += tx._cr;
          fyRunDr += tx._dr;
          fyRunCr += tx._cr;
          const rowBal = needsBF
            ? Math.round(tx._runBal * 100) / 100
            : Math.round((accType === -1 ? fyRunCr - fyRunDr : fyRunDr - fyRunCr) * 100) / 100;
          addLedgerRow(ws, [
            tx.id ?? null,
            dateStr,
            remarks || '',
            refNo || '',
            tx._dr > 0 ? Math.round(tx._dr * 100) / 100 : null,
            tx._cr > 0 ? Math.round(tx._cr * 100) / 100 : null,
            rowBal,
          ]);
        });

        const closingBal = needsBF
          ? (fyRows.length > 0 ? fyRows[fyRows.length - 1]._runBal : bfBal)
          : (accType === -1 ? fyRunCr - fyRunDr : fyRunDr - fyRunCr);
        const totalValues = is4100
          ? [null, '', 'Total / Closing Balance', '', '', '', Math.round(totalDr * 100) / 100 || null, Math.round(totalCr * 100) / 100 || null, Math.round(closingBal * 100) / 100]
          : [null, '', 'Total / Closing Balance', '', Math.round(totalDr * 100) / 100 || null, Math.round(totalCr * 100) / 100 || null, Math.round(closingBal * 100) / 100];
        addLedgerRow(ws, totalValues, { bold: true });
      }

      // ── Save & download ──────────────────────────────────────────────
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `AllReports_${yearLabel}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportLoading(false);
    }
  };

  // ── Combined PDF builder ───────────────────────────────────────────
  const buildExportAllPdf = () => {
    const fy = getFY();
    const yearLabel    = fy ? fy.year : selectedYearId;
    const endDateLabel = getEndDateLabel();
    const periodLabel  = getPeriodLabel();
    // Always audit style for the formal combined export
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // ── 1. Trial Balance ────────────────────────────────────────────
    {
      const rows = tbData.map(r => [r.acc_name, fmt(r.dr), fmt(r.cr)]);
      const totalIdx = rows.length - 1;
      drawAuditHeader(doc, ['ARK EDUCATION LIMITED', 'TRIAL BALANCE', `AS AT ${endDateLabel.toUpperCase()}`]);
      autoTable(doc, { ...auditTableOptions(rows, 50, totalIdx), head: [['Account Title', 'Debit (HK$)', 'Credit (HK$)']] });
    }

    // ── 2. Income Statement ─────────────────────────────────────────
    doc.addPage('a4', 'portrait');
    {
      const revenue  = isData.filter(r => r.acc_type === -1);
      const adminExp = isData.filter(r => r.acc_type === 1 && r.acc_code < 8000);
      const otherExp = isData.filter(r => r.acc_type === 1 && r.acc_code >= 8000);
      const totalRevenue = revenue.reduce((s,r) => s + (Number(r.amount)||0), 0);
      const totalAdmin   = adminExp.reduce((s,r) => s + (Number(r.amount)||0), 0);
      const totalOther   = otherExp.reduce((s,r) => s + (Number(r.amount)||0), 0);
      const netPL = totalRevenue - totalAdmin - totalOther;
      const rows = [
        ['Revenue', '', ''],
        ...revenue.map(r  => [`  ${r.acc_name}`, '', fmtSigned(r.amount)]),
        ['  Total revenue', '', fmtSigned(totalRevenue)],
        ['Administration expenses', '', ''],
        ...adminExp.map(r => [`  ${r.acc_name}`, fmtSigned(r.amount), '']),
        ['  Total administration expenses', '', fmtSigned(-totalAdmin)],
        ['Other operation expenses', '', ''],
        ...otherExp.map(r => [`  ${r.acc_name}`, fmtSigned(r.amount), '']),
        ['  Total other operation expenses', '', fmtSigned(-totalOther)],
        [`${netPL >= 0 ? 'Profit' : 'Loss'} before tax`, '', fmtSigned(netPL)],
        ['  Income tax expense', '', '-'],
        [`${netPL >= 0 ? 'Profit' : 'Loss'} for the year / period`, '', fmtSigned(netPL)],
      ];
      const totalIdx = rows.length - 1;
      drawAuditHeader(doc, ['ARK EDUCATION LIMITED', 'DETAILED INCOME STATEMENT', `FOR THE PERIOD FROM ${periodLabel.toUpperCase()}`]);
      autoTable(doc, { ...auditTableOptions(rows, 50, totalIdx), head: [['', 'HK$', 'HK$']] });
    }

    // ── 3. Financial Position ───────────────────────────────────────
    doc.addPage('a4', 'portrait');
    {
      const curAssets = bsData.filter(r => r.acc_code >= 1400 && r.acc_code <= 1699);
      const liabs     = bsData.filter(r => r.acc_code >= 2000 && r.acc_code <= 2999);
      const equity    = bsData.filter(r => ((r.acc_code >= 1700 && r.acc_code < 2000) || r.acc_code >= 3000) && r.acc_code !== 1714);
      const totalRev  = isData.filter(r => r.acc_type === -1).reduce((s,r) => s+(Number(r.amount)||0), 0);
      const totalExp2 = isData.filter(r => r.acc_type === 1 ).reduce((s,r) => s+(Number(r.amount)||0), 0);
      const curYearPL = totalRev - totalExp2;
      const sumArr    = arr => arr.reduce((s,r) => s+(Number(r.amount)||0), 0);
      const netPPE    = ppeData.reduce((s, r) => s + (Number(r.nbv) || 0), 0);
      const totalCA = sumArr(curAssets), totalL = sumArr(liabs);
      const netCA = totalCA - totalL, netAssets = netPPE + netCA, totalEq = sumArr(equity) + curYearPL;
      const rows = [
        ['Non-current assets', '', ''],
        ['  Property, plant and equipment', fmtSigned(netPPE), ''],
        ['  Net non-current assets', '', fmtSigned(netPPE)],
        ['Current assets', '', ''],
        ...curAssets.map(r => [`  ${r.acc_name}`, fmtSigned(r.amount), '']),
        ['  Total current assets', '', fmtSigned(totalCA)],
        ['Current liabilities', '', ''],
        ...liabs.map(r => [`  ${r.acc_name}`, fmtSigned(r.amount), '']),
        ['  Total current liabilities', '', fmtSigned(-totalL)],
        ['Net current assets / (liabilities)', '', fmtSigned(netCA)],
        ['Net assets', '', fmtSigned(netAssets)],
        ['Accumulated fund', '', ''],
        ...equity.map(r => [`  ${r.acc_name}`, fmtSigned(r.amount), '']),
        [`  ${curYearPL >= 0 ? 'Profit' : 'Loss'} for the year`, fmtSigned(curYearPL), ''],
        ['Total accumulated fund', '', fmtSigned(totalEq)],
      ];
      const totalIdx = rows.length - 1;
      drawAuditHeader(doc, ['ARK EDUCATION LIMITED', 'STATEMENT OF FINANCIAL POSITION', `AT ${endDateLabel.toUpperCase()}`]);
      autoTable(doc, { ...auditTableOptions(rows, 50, totalIdx), head: [['', 'HK$', 'HK$']] });
    }

    // ── 4. Depreciation Schedule ────────────────────────────────────
    doc.addPage('a4', 'landscape');
    {
      const depExp         = isData.find(r  => r.acc_code === 8100);
      const accumDepr      = bsData.find(r  => r.acc_code === 1714);
      const priorAccumDepr = priorBsData.find(r => r.acc_code === 1714);
      const sumF           = (arr, field) => arr.reduce((s, r) => s + (Number(r[field]) || 0), 0);
      const totalCost      = sumF(ppeData, 'cost');
      const priorTotalCost = sumF(priorPpeData, 'cost');
      const totalAccumDepr = accumDepr      ? Math.abs(Number(accumDepr.amount)      || 0) : sumF(ppeData, 'accum_depr');
      const priorAccumAmt  = priorAccumDepr ? Math.abs(Number(priorAccumDepr.amount) || 0) : sumF(priorPpeData, 'accum_depr');
      const totalNbv       = totalCost - totalAccumDepr;
      const priorNbv       = priorTotalCost - priorAccumAmt;
      const depExpAmt      = depExp ? Number(depExp.amount) || 0 : 0;
      const priorFYx       = getPriorFY();
      const priorEndLabel  = fmtFyEndDate(priorFYx);
      const hasPrior       = priorPpeData.length > 0;
      const allCodes = [...new Set([...ppeData.map(r => r.acc_code), ...priorPpeData.map(r => r.acc_code)])].sort((a,b) => a-b);
      const nameFor    = code => { const r = ppeData.find(x => x.acc_code === code) || priorPpeData.find(x => x.acc_code === code); return r ? r.acc_name : `Account ${code}`; };
      const curCost    = code => { const r = ppeData.find(x => x.acc_code === code);      return r ? Number(r.cost)       || 0 : 0; };
      const priorCost  = code => { const r = priorPpeData.find(x => x.acc_code === code); return r ? Number(r.cost)       || 0 : 0; };
      const curAccum   = code => { const r = ppeData.find(x => x.acc_code === code);      return r ? Number(r.accum_depr) || 0 : 0; };
      const priorAccum = code => { const r = priorPpeData.find(x => x.acc_code === code); return r ? Number(r.accum_depr) || 0 : 0; };
      const curNbv     = code => { const r = ppeData.find(x => x.acc_code === code);      return r ? Number(r.nbv)        || 0 : 0; };
      const priorNbvV  = code => { const r = priorPpeData.find(x => x.acc_code === code); return r ? Number(r.nbv)        || 0 : 0; };
      const fmtDep     = v => (v === 0 || v === null || v === undefined) ? '-' : fmtSigned(v);
      const E = '';
      const body = [];
      const secIdxs = new Set(), totIdxs = new Set(), nbvIdxs2 = new Set(), spcIdxs = new Set();
      const sec  = lbl => { secIdxs.add(body.length); body.push([lbl, ...allCodes.map(() => E), E]); };
      const dat  = (lbl, fn, tot) => body.push([`  ${lbl}`, ...allCodes.map(c => fmtDep(fn(c))), fmtDep(tot)]);
      const tot  = (lbl, fn, t)   => { totIdxs.add(body.length); body.push([lbl, ...allCodes.map(c => fmtDep(fn(c))), fmtDep(t)]); };
      const nbv2 = (lbl, fn, t)   => { nbvIdxs2.add(body.length); body.push([lbl, ...allCodes.map(c => fmtDep(fn(c))), fmtDep(t)]); };
      const spc  = ()              => { spcIdxs.add(body.length); body.push([E, ...allCodes.map(() => E), E]); };
      sec('Cost');
      if (hasPrior) dat('Balance at beginning of year', priorCost, priorTotalCost);
      dat('Additions during the year', c => curCost(c) - priorCost(c), totalCost - priorTotalCost);
      tot('Balance at end of year', curCost, totalCost); spc();
      sec('Accumulated depreciation');
      if (hasPrior) dat('Balance at beginning of year', priorAccum, priorAccumAmt);
      dat('Depreciation charge for the year', c => curAccum(c) - priorAccum(c), depExpAmt || (totalAccumDepr - priorAccumAmt));
      tot('Balance at end of year', curAccum, totalAccumDepr); spc();
      sec('Carrying amount');
      nbv2(`  As at ${endDateLabel}`, curNbv, totalNbv);
      if (hasPrior) nbv2(`  As at ${priorEndLabel}`, priorNbvV, priorNbv);
      const cw = Math.min(34, Math.max(22, Math.floor(170 / allCodes.length)));
      const colSt = { 0: { halign: 'left', cellWidth: 'auto' } };
      allCodes.forEach((_, i) => { colSt[i+1] = { halign: 'right', cellWidth: cw }; });
      colSt[allCodes.length + 1] = { halign: 'right', cellWidth: cw + 6, fontStyle: 'bold' };
      drawAuditHeader(doc, ['ARK EDUCATION LIMITED', 'PROPERTY, PLANT AND EQUIPMENT', `FOR THE YEAR ENDED ${endDateLabel.toUpperCase()}`]);
      autoTable(doc, {
        head: [[E, ...allCodes.map(c => `${nameFor(c)}\nHK$`), 'Total\nHK$']],
        body, startY: 50, margin: { left: 14, right: 14, bottom: 15 },
        styles: { font: 'times', fontSize: 8.5, cellPadding: { top: 1.4, bottom: 1.4, left: 2, right: 2 }, textColor: [0,0,0], lineWidth: 0, fillColor: false },
        headStyles: { font: 'times', fontStyle: 'bold', fillColor: false, textColor: [0,0,0], fontSize: 8.5, halign: 'right', lineWidth: 0, cellPadding: { top: 1.4, bottom: 2.2, left: 2, right: 2 } },
        alternateRowStyles: { fillColor: false }, columnStyles: colSt,
        didParseCell: d => {
          if (d.section === 'head' && d.column.index === 0) d.cell.styles.halign = 'left';
          if (d.section === 'body') {
            const i = d.row.index;
            if (secIdxs.has(i)) d.cell.styles.fontStyle = 'bold';
            if (totIdxs.has(i) || nbvIdxs2.has(i)) d.cell.styles.fontStyle = 'bold';
            if (spcIdxs.has(i)) d.cell.styles.cellPadding = { top: 3, bottom: 0, left: 2, right: 2 };
          }
        },
        didDrawCell: d => {
          if (d.section === 'head') { d.doc.setDrawColor(0,0,0); d.doc.setLineWidth(0.3); d.doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height); }
          if (d.section === 'body') {
            const i = d.row.index;
            if (totIdxs.has(i)) { d.doc.setDrawColor(0,0,0); d.doc.setLineWidth(0.3); d.doc.line(d.cell.x, d.cell.y, d.cell.x + d.cell.width, d.cell.y); d.doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height); }
            if (nbvIdxs2.has(i)) { const yB = d.cell.y + d.cell.height; d.doc.setDrawColor(0,0,0); d.doc.setLineWidth(0.3); d.doc.line(d.cell.x, yB, d.cell.x + d.cell.width, yB); d.doc.line(d.cell.x, yB+0.8, d.cell.x + d.cell.width, yB+0.8); }
          }
        },
        didDrawPage: d => {
          const ph = d.doc.internal.pageSize.getHeight(), pw = d.doc.internal.pageSize.getWidth(), n = d.doc.internal.getNumberOfPages();
          d.doc.setFont('times','normal'); d.doc.setFontSize(7); d.doc.setTextColor(100,100,100);
          d.doc.text(`Page ${d.pageNumber} of ${n}`, pw - 14, ph - 4, { align: 'right' });
          d.doc.text(`Generated on ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}`, 14, ph - 4);
        },
      });
    }

    return { doc, yearLabel };
  };

  // ── IS / FS view renderers ─────────────────────────────────────────
  const renderISView = () => {
    const revenue  = isData.filter(r => r.acc_type === -1);
    const adminExp = isData.filter(r => r.acc_type === 1 && r.acc_code < 8000);
    const otherExp = isData.filter(r => r.acc_type === 1 && r.acc_code >= 8000);
    const totalRev   = revenue.reduce((s,r)  => s+(Number(r.amount)||0), 0);
    const totalAdmin = adminExp.reduce((s,r) => s+(Number(r.amount)||0), 0);
    const totalOther = otherExp.reduce((s,r) => s+(Number(r.amount)||0), 0);
    const netPL = totalRev - totalAdmin - totalOther;
    return (
      <div className="report-table-container">
        <table className="report-table fs-table">
          <thead><tr><th style={{width:'55%'}}></th><th className="text-right" style={{width:'20%'}}>HK$</th><th className="text-right" style={{width:'20%'}}>HK$</th></tr></thead>
          <tbody>
            <tr className="fs-section-header"><td colSpan={3}>Revenue</td></tr>
            {revenue.map((r,i) => <tr key={i} className="fs-item"><td className="fs-indent">{r.acc_name}</td><td></td><td className="text-right">{fmtSigned(r.amount)}</td></tr>)}
            <tr className="fs-subtotal"><td className="fs-indent"><b>Total revenue</b></td><td></td><td className="text-right"><b>{fmtSigned(totalRev)}</b></td></tr>
            {adminExp.length > 0 && <>
              <tr className="fs-section-header"><td colSpan={3}>Administration expenses</td></tr>
              {adminExp.map((r,i) => <tr key={i} className="fs-item"><td className="fs-indent">{r.acc_name}</td><td className="text-right">{fmtSigned(r.amount)}</td><td></td></tr>)}
              <tr className="fs-subtotal"><td className="fs-indent"><b>Total administration expenses</b></td><td></td><td className="text-right"><b>{fmtSigned(-totalAdmin)}</b></td></tr>
            </>}
            {otherExp.length > 0 && <>
              <tr className="fs-section-header"><td colSpan={3}>Other operation expenses</td></tr>
              {otherExp.map((r,i) => <tr key={i} className="fs-item"><td className="fs-indent">{r.acc_name}</td><td className="text-right">{fmtSigned(r.amount)}</td><td></td></tr>)}
              <tr className="fs-subtotal"><td className="fs-indent"><b>Total other operation expenses</b></td><td></td><td className="text-right"><b>{fmtSigned(-totalOther)}</b></td></tr>
            </>}
            <tr className="fs-net-row"><td colSpan={2}>{netPL >= 0 ? 'Profit' : 'Loss'} before tax</td><td className="text-right">{fmtSigned(netPL)}</td></tr>
            <tr className="fs-item"><td colSpan={2} className="fs-indent">Income tax expense</td><td className="text-right">-</td></tr>
            <tr className="fs-total-row"><td colSpan={2}><b>{netPL >= 0 ? 'Profit' : 'Loss'} for the year / period</b></td><td className="text-right"><b>{fmtSigned(netPL)}</b></td></tr>
          </tbody>
        </table>
      </div>
    );
  };

  const renderFSView = () => {
    // PPE shown as single net line using ppeData (from ppe-schedule endpoint)
    const netPPE    = ppeData.reduce((s, r) => s + (Number(r.nbv) || 0), 0);
    const curAssets = bsData.filter(r => r.acc_code >= 1400 && r.acc_code <= 1699);
    const liabs     = bsData.filter(r => r.acc_code >= 2000 && r.acc_code <= 2999);
    // Exclude 1714 (accumulated depreciation – contra-asset, not equity)
    const equity    = bsData.filter(r => ((r.acc_code >= 1700 && r.acc_code < 2000) || r.acc_code >= 3000) && r.acc_code !== 1714);
    const totalRev  = isData.filter(r => r.acc_type === -1).reduce((s,r) => s+(Number(r.amount)||0), 0);
    const totalExp  = isData.filter(r => r.acc_type === 1 ).reduce((s,r) => s+(Number(r.amount)||0), 0);
    const curYearPL = totalRev - totalExp;
    const sum = arr => arr.reduce((s,r) => s+(Number(r.amount)||0), 0);
    const totalCA = sum(curAssets), totalL = sum(liabs);
    const netCA = totalCA - totalL, netAssets = netPPE + netCA, totalEq = sum(equity) + curYearPL;
    return (
      <div className="report-table-container">
        <table className="report-table fs-table">
          <thead><tr><th style={{width:'55%'}}></th><th className="text-right" style={{width:'20%'}}>HK$</th><th className="text-right" style={{width:'20%'}}>HK$</th></tr></thead>
          <tbody>
            <tr className="fs-section-header"><td colSpan={3}>Non-current assets</td></tr>
            <tr className="fs-item"><td className="fs-indent">Property, plant and equipment</td><td className="text-right">{fmtSigned(netPPE)}</td><td></td></tr>
            <tr className="fs-subtotal"><td className="fs-indent"><b>Net non-current assets</b></td><td></td><td className="text-right"><b>{fmtSigned(netPPE)}</b></td></tr>
            <tr className="fs-section-header"><td colSpan={3}>Current assets</td></tr>
            {curAssets.map((r,i) => <tr key={i} className="fs-item"><td className="fs-indent">{r.acc_name}</td><td className="text-right">{fmtSigned(r.amount)}</td><td></td></tr>)}
            <tr className="fs-subtotal"><td className="fs-indent"><b>Total current assets</b></td><td></td><td className="text-right"><b>{fmtSigned(totalCA)}</b></td></tr>
            <tr className="fs-section-header"><td colSpan={3}>Current liabilities</td></tr>
            {liabs.map((r,i) => <tr key={i} className="fs-item"><td className="fs-indent">{r.acc_name}</td><td className="text-right">{fmtSigned(r.amount)}</td><td></td></tr>)}
            <tr className="fs-subtotal"><td className="fs-indent"><b>Total current liabilities</b></td><td></td><td className="text-right"><b>{fmtSigned(-totalL)}</b></td></tr>
            <tr className="fs-net-row"><td colSpan={2}>Net current assets / (liabilities)</td><td className="text-right">{fmtSigned(netCA)}</td></tr>
            <tr className="fs-net-row"><td colSpan={2}><b>Net assets</b></td><td className="text-right"><b>{fmtSigned(netAssets)}</b></td></tr>
            <tr className="fs-section-header"><td colSpan={3}>Accumulated fund</td></tr>
            {equity.map((r,i) => <tr key={i} className="fs-item"><td className="fs-indent">{r.acc_name}</td><td className="text-right">{fmtSigned(r.amount)}</td><td></td></tr>)}
            <tr className="fs-item"><td className="fs-indent">{curYearPL >= 0 ? 'Profit' : 'Loss'} for the year</td><td className="text-right">{fmtSigned(curYearPL)}</td><td></td></tr>
            <tr className="fs-total-row"><td colSpan={2}><b>Total accumulated fund</b></td><td className="text-right"><b>{fmtSigned(totalEq)}</b></td></tr>
          </tbody>
        </table>
      </div>
    );
  };

  // ── Depreciation view ─────────────────────────────────────────────
  const renderDepView = () => {
    // ppeData rows: { acc_code, acc_name, cost, accum_depr, nbv }
    const depExp         = isData.find(r  => r.acc_code === 8100);
    const accumDepr      = bsData.find(r  => r.acc_code === 1714);
    const priorAccumDepr = priorBsData.find(r => r.acc_code === 1714);
    const sum            = arr => arr.reduce((s, r) => s + (Number(r.cost)      || 0), 0);
    const sumA           = arr => arr.reduce((s, r) => s + (Number(r.accum_depr)|| 0), 0);
    const totalCost      = sum(ppeData);
    const priorTotalCost = sum(priorPpeData);
    const totalAccumDepr = accumDepr      ? Math.abs(Number(accumDepr.amount)      || 0) : sumA(ppeData);
    const priorAccumAmt  = priorAccumDepr ? Math.abs(Number(priorAccumDepr.amount) || 0) : sumA(priorPpeData);
    const totalNbv       = totalCost - totalAccumDepr;
    const priorNbv       = priorTotalCost - priorAccumAmt;
    const depExpAmt      = depExp ? Number(depExp.amount) || 0 : 0;
    const endDateLabel   = getEndDateLabel();
    const priorFY        = getPriorFY();
    const priorEndLabel  = fmtFyEndDate(priorFY);
    const hasPrior       = priorPpeData.length > 0;

    // Build unified code list (columns)
    const allCodes = [...new Set([...ppeData.map(r => r.acc_code), ...priorPpeData.map(r => r.acc_code)])].sort((a,b) => a - b);
    const nameFor      = code => { const r = ppeData.find(x => x.acc_code === code) || priorPpeData.find(x => x.acc_code === code); return r ? r.acc_name : `Account ${code}`; };
    const curCost      = code => { const r = ppeData.find(x => x.acc_code === code);      return r ? Number(r.cost)       || 0 : 0; };
    const priorCost    = code => { const r = priorPpeData.find(x => x.acc_code === code); return r ? Number(r.cost)       || 0 : 0; };
    const curAccum     = code => { const r = ppeData.find(x => x.acc_code === code);      return r ? Number(r.accum_depr) || 0 : 0; };
    const priorAccum   = code => { const r = priorPpeData.find(x => x.acc_code === code); return r ? Number(r.accum_depr) || 0 : 0; };
    const curNbv       = code => { const r = ppeData.find(x => x.acc_code === code);      return r ? Number(r.nbv)        || 0 : 0; };
    const priorNbvVal  = code => { const r = priorPpeData.find(x => x.acc_code === code); return r ? Number(r.nbv)        || 0 : 0; };
    const numCols      = allCodes.length + 2;
    const fmt          = v => (v === 0 || v === null || v === undefined) ? '-' : fmtSigned(v);

    return (
      <div className="report-table-container" style={{overflowX:'auto'}}>
        <table className="report-table dep-table" style={{minWidth: `${260 + allCodes.length * 130}px`}}>
          <thead>
            <tr>
              <th style={{textAlign:'left', width:'32%'}}></th>
              {allCodes.map(code => (
                <th key={code} className="dep-col-head">{nameFor(code)}<br/><small>HK$</small></th>
              ))}
              <th className="dep-col-head"><b>Total</b><br/><small>HK$</small></th>
            </tr>
          </thead>
          <tbody>
            {/* ══ COST ══ */}
            <tr className="dep-section-header"><td colSpan={numCols}>Cost</td></tr>
            {hasPrior && (
              <tr className="fs-item">
                <td className="fs-indent">Balance at beginning of year</td>
                {allCodes.map(code => <td key={code} className="text-right">{fmt(priorCost(code))}</td>)}
                <td className="text-right">{fmt(priorTotalCost)}</td>
              </tr>
            )}
            <tr className="fs-item">
              <td className="fs-indent">Additions during the year</td>
              {allCodes.map(code => <td key={code} className="text-right">{fmt(curCost(code) - priorCost(code))}</td>)}
              <td className="text-right">{fmt(totalCost - priorTotalCost)}</td>
            </tr>
            <tr className="dep-total-row">
              <td>Balance at end of year</td>
              {allCodes.map(code => <td key={code} className="text-right">{fmt(curCost(code))}</td>)}
              <td className="text-right">{fmt(totalCost)}</td>
            </tr>

            {/* ══ ACCUMULATED DEPRECIATION ══ */}
            <tr className="dep-spacer"><td colSpan={numCols}></td></tr>
            <tr className="dep-section-header"><td colSpan={numCols}>Accumulated depreciation</td></tr>
            {hasPrior && (
              <tr className="fs-item">
                <td className="fs-indent">Balance at beginning of year</td>
                {allCodes.map(code => <td key={code} className="text-right">{fmt(priorAccum(code))}</td>)}
                <td className="text-right">{fmt(priorAccumAmt)}</td>
              </tr>
            )}
            <tr className="fs-item">
              <td className="fs-indent">Depreciation charge for the year</td>
              {allCodes.map(code => <td key={code} className="text-right">{fmt(curAccum(code) - priorAccum(code))}</td>)}
              <td className="text-right">{depExpAmt ? fmt(depExpAmt) : fmt(totalAccumDepr - priorAccumAmt)}</td>
            </tr>
            <tr className="dep-total-row">
              <td>Balance at end of year</td>
              {allCodes.map(code => <td key={code} className="text-right">{fmt(curAccum(code))}</td>)}
              <td className="text-right">{fmt(totalAccumDepr)}</td>
            </tr>

            {/* ══ CARRYING AMOUNT ══ */}
            <tr className="dep-spacer"><td colSpan={numCols}></td></tr>
            <tr className="dep-section-header"><td colSpan={numCols}>Carrying amount</td></tr>
            <tr className="dep-nbv-row">
              <td>As at {endDateLabel}</td>
              {allCodes.map(code => <td key={code} className="text-right">{fmt(curNbv(code))}</td>)}
              <td className="text-right">{fmt(totalNbv)}</td>
            </tr>
            {hasPrior && (
              <tr className="dep-nbv-row">
                <td>As at {priorEndLabel}</td>
                {allCodes.map(code => <td key={code} className="text-right">{fmt(priorNbvVal(code))}</td>)}
                <td className="text-right">{fmt(priorNbv)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // ── Level-1: card menu ─────────────────────────────────────────────
  const renderCardMenu = () => (
    <div className="report-card-grid">
      {REPORT_CARDS.map(card => (
        <button
          key={card.id}
          className={`report-card${card.disabled ? ' disabled' : ''}${card.id === 'export' && exportLoading ? ' disabled' : ''}`}
          onClick={() => !card.disabled && setActiveCard(card.id)}
          disabled={card.disabled}
        >
          <div className="report-card-label">{card.label}</div>
          <div className="report-card-desc">{card.desc}</div>
        </button>
      ))}
    </div>
  );

  // ── Level-2: detail view ───────────────────────────────────────────
  const cardLabels = { tb: 'Trial Balance', is: 'Income Statement', fs: 'Statement of Financial Position', dep: 'Depreciation Schedule', export: 'Export All Reports' };

  const renderDetailView = () => (
    <div className="report-detail">
      {/* Toolbar */}
      <div className="report-detail-toolbar">
        <button className="toolbar-back-btn" onClick={() => { setActiveCard(null); setPdfUrl(null); }}>
          ← Reports
        </button>
        <span className="toolbar-title">{cardLabels[activeCard]}</span>
        <div className="toolbar-actions">
          {activeCard === 'export' ? (
            <>
              <button className="action-btn" onClick={handlePreviewPdf}>Preview PDF</button>
              <button className="action-btn" onClick={handlePreviewExcel} disabled={exportLoading}>
                {exportLoading ? 'Loading...' : 'Preview Excel'}
              </button>
              <button className="action-btn" onClick={handlePrint} disabled={!pdfUrl}>Print</button>
              <button className="action-btn" onClick={handleExportPdf} disabled={!pdfUrl}>Export PDF</button>
              <button className="action-btn" onClick={handleExportAll} disabled={exportLoading}>
                {exportLoading ? 'Generating...' : 'Export Excel'}
              </button>
            </>
          ) : (
            <>
              <button className="action-btn" onClick={handlePreviewPdf}>Preview PDF</button>
              <button className="action-btn" onClick={handleExportPdf}>Export PDF</button>
              <button className="action-btn" onClick={handleExportExcel}>Export Excel</button>
              <button
                className={`action-btn style-btn${pdfStyle === 'audit' ? ' active' : ''}`}
                onClick={() => setPdfStyle(s => s === 'audit' ? 'modern' : 'audit')}
              >
                {pdfStyle === 'audit' ? 'Audit Style' : 'Modern Style'}
              </button>
            </>
          )}
          <label className="fy-label">Fiscal Year</label>
          <select value={selectedYearId} onChange={e => setSelectedYearId(e.target.value)} className="fy-select">
            {fiscalYears.map(fy => <option key={fy.id} value={fy.id}>{fy.year}</option>)}
          </select>
        </div>
      </div>

      {/* PDF preview */}
      {pdfUrl && (
        <div className="pdf-preview-panel">
          <div className="pdf-preview-header">
            <h3>PDF Preview</h3>
            <button onClick={() => setPdfUrl(null)} className="action-btn">Close</button>
          </div>
          <iframe src={pdfUrl} title="PDF Preview" style={{ width: '100%', height: '700px', display: 'block', border: 'none' }} />
        </div>
      )}

      {/* Excel preview */}
      {excelPreviewSheets && (
        <div className="excel-preview-panel">
          <div className="excel-preview-header">
            <h3>Excel Preview</h3>
            <button onClick={() => setExcelPreviewSheets(null)} className="action-btn">Close</button>
          </div>
          <div className="excel-preview-tabs">
            {excelPreviewSheets.map((sheet, i) => (
              <button
                key={i}
                className={`excel-tab-btn${excelPreviewTab === i ? ' active' : ''}`}
                onClick={() => setExcelPreviewTab(i)}
              >
                {sheet.name}
              </button>
            ))}
          </div>
          <div className="excel-preview-body">
            <table className="excel-preview-table">
              <thead>
                <tr>{excelPreviewSheets[excelPreviewTab].headers.map((h, j) => <th key={j}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {excelPreviewSheets[excelPreviewTab].rows.map((r, i) => (
                  <tr key={i} className={`xp-${r.type}`}>
                    {r.cells.map((cell, j) => <td key={j} className={j > 0 ? 'xp-num' : ''}>{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Data table */}
      {activeCard === 'export' && loading && <p style={{padding:'20px'}}>Building PDF preview...</p>}
      {activeCard !== 'export' && (loading ? <p>Loading...</p> : error ? <div className="error-msg">{error}</div> : (
        activeCard === 'tb' ? (
          <div className="report-table-container">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Account Code</th>
                  <th>Account Name</th>
                  <th className="text-right">Debit (HK$)</th>
                  <th className="text-right">Credit (HK$)</th>
                </tr>
              </thead>
              <tbody>
                {tbData.map((row, i) => (
                  <tr key={i} className={!row.acc_code ? 'font-bold' : ''}>
                    <td>{row.acc_code || ''}</td>
                    <td>{row.acc_name}</td>
                    <td className="text-right">{fmt(row.dr)}</td>
                    <td className="text-right">{fmt(row.cr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : activeCard === 'is' ? renderISView() : activeCard === 'dep' ? renderDepView() : renderFSView()
      ))}
    </div>
  );

  // ── Main render ────────────────────────────────────────────────────
  return (
    <div className="reports-page">
      {activeCard === null ? (
        <>
          <div className="reports-header">
            <h2>Reports</h2>
            <div className="controls">
              <label className="fy-label">Fiscal Year</label>
              <select value={selectedYearId} onChange={e => setSelectedYearId(e.target.value)} className="fy-select">
                {fiscalYears.map(fy => <option key={fy.id} value={fy.id}>{fy.year}</option>)}
              </select>
            </div>
          </div>
          {loading && <p>Loading data...</p>}
          {error && <div className="error-msg">{error}</div>}
          {renderCardMenu()}
        </>
      ) : renderDetailView()}
    </div>
  );
};

export default ReportsPage;
