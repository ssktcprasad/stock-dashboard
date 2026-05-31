let stockData = { items: [] };
let businessData = {};
let visibleItems = [];
let companyItems = [];
let visibleCustomers = [];
let lastCompanyQuery = null;
let currentLimit = 80;

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

const els = {
  sourceMeta: document.querySelector('#sourceMeta'),
  totalItems: document.querySelector('#totalItems'),
  totalQty: document.querySelector('#totalQty'),
  totalValue: document.querySelector('#totalValue'),
  lowStock: document.querySelector('#lowStock'),
  search: document.querySelector('#search'),
  companySearch: document.querySelector('#companySearch'),
  itemSuggestions: document.querySelector('#itemSuggestions'),
  companySuggestions: document.querySelector('#companySuggestions'),
  lowLimit: document.querySelector('#lowLimit'),
  stockFilter: document.querySelector('#stockFilter'),
  sortBy: document.querySelector('#sortBy'),
  rows: document.querySelector('#stockRows'),
  resultCount: document.querySelector('#resultCount'),
  activeCompany: document.querySelector('#activeCompany'),
  topValue: document.querySelector('#topValue'),
  attention: document.querySelector('#attention'),
  exportCsv: document.querySelector('#exportCsv'),
  printPage: document.querySelector('#printPage'),
  salesYearFilter: document.querySelector('#salesYearFilter'),
  salesTurnover: document.querySelector('#salesTurnover'),
  cashSales: document.querySelector('#cashSales'),
  creditSales: document.querySelector('#creditSales'),
  salesUpdated: document.querySelector('#salesUpdated'),
  yearSalesRows: document.querySelector('#yearSalesRows'),
  companySalesRows: document.querySelector('#companySalesRows'),
  productSalesRows: document.querySelector('#productSalesRows'),
  duesTotal: document.querySelector('#duesTotal'),
  duesCustomers: document.querySelector('#duesCustomers'),
  highestDue: document.querySelector('#highestDue'),
  duesUpdated: document.querySelector('#duesUpdated'),
  customerSearch: document.querySelector('#customerSearch'),
  customerDueRows: document.querySelector('#customerDueRows'),
  customerDueCount: document.querySelector('#customerDueCount'),
  syncBadge: document.querySelector('#syncBadge')
};

// URL endpoints pointing to your public GitHub repo raw files
const GITHUB_USERNAME = 'ssktcprasad';
const GITHUB_REPO = 'stock-dashboard';
const STOCK_URL = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPO}/main/data/stock.json`;
const BUSINESS_URL = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPO}/main/data/business.json`;

function decryptText(base64Data, password) {
  try {
    const rawData = CryptoJS.enc.Base64.parse(base64Data);
    if (rawData.sigBytes < 32) throw new Error('Invalid data length');
    
    const salt = CryptoJS.lib.WordArray.create(rawData.words.slice(0, 4), 16);
    const iv = CryptoJS.lib.WordArray.create(rawData.words.slice(4, 8), 16);
    const ciphertext = CryptoJS.lib.WordArray.create(rawData.words.slice(8), rawData.sigBytes - 32);
    
    const key = CryptoJS.PBKDF2(password, salt, {
      keySize: 256/32,
      iterations: 10000
    });
    
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: ciphertext },
      key,
      { iv: iv, mode: CryptoJS.mode.CBC }
    );
    
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    if (!result) throw new Error('Empty result');
    return result;
  } catch (e) {
    throw new Error('Incorrect password');
  }
}

async function loadData() {
  try {
    els.sourceMeta.textContent = 'Fetching and decrypting data from Cloud...';
    
    const stockResponse = await fetch(STOCK_URL, { cache: 'no-store' });
    if (!stockResponse.ok) throw new Error('Stock data not found in cloud');
    const encryptedStockText = (await stockResponse.text()).trim();
    const decStock = decryptText(encryptedStockText, 'ssktc');
    stockData = JSON.parse(decStock);

    try {
      const businessResponse = await fetch(BUSINESS_URL, { cache: 'no-store' });
      if (businessResponse.ok) {
        const encryptedBusinessText = (await businessResponse.text()).trim();
        if (encryptedBusinessText) {
          const decBiz = decryptText(encryptedBusinessText, 'ssktc');
          businessData = JSON.parse(decBiz);
        } else {
          businessData = {};
        }
      } else {
        businessData = {};
      }
    } catch (bizErr) {
      console.warn('Failed to load or decrypt business data:', bizErr);
      businessData = {};
    }

    updateSuggestions();
    
    const lowLimit = Number(els.lowLimit.value || 0);
    companyItems = getCompanyItems('');
    updateMetrics(lowLimit, companyItems);
    updateHighlights(lowLimit, companyItems);
    updateActiveCompany('');
    
    renderStock();
    renderBusiness();
    
    if (els.syncBadge && businessData.updatedAt) {
      els.syncBadge.textContent = `☁️ Synced: ${businessData.updatedAt}`;
      els.syncBadge.style.background = '#e2f0d9';
      els.syncBadge.style.color = '#385723';
      els.syncBadge.style.border = '1px solid #a8d08d';
      els.syncBadge.style.padding = '4px 12px';
      els.syncBadge.style.borderRadius = '999px';
      els.syncBadge.style.fontSize = '12px';
      els.syncBadge.style.fontWeight = '700';
    }
  } catch (error) {
    console.error(error);
    els.sourceMeta.textContent = 'Failed to load cloud data. Make sure Sync to Cloud has been run at least once.';
    els.rows.innerHTML = '<tr><td class="emptyState" colspan="8">No cloud data found yet or decryption failed.</td></tr>';
  }
}

function getStatus(item, lowLimit) {
  if (item.quantity <= 0) return { text: 'No stock', className: 'empty' };
  if (item.quantity <= lowLimit) return { text: 'Low', className: 'low' };
  return { text: 'Available', className: 'ok' };
}

function renderStock(event) {
  if (event && (event.type === 'input' || event.type === 'change')) {
    currentLimit = 80;
  }
  
  const query = els.search.value.trim().toLowerCase();
  const companyQuery = els.companySearch.value.trim().toLowerCase();
  const lowLimit = Number(els.lowLimit.value || 0);
  const filter = els.stockFilter.value;
  const sortBy = els.sortBy.value;

  if (companyQuery !== lastCompanyQuery) {
    companyItems = getCompanyItems(companyQuery);
    lastCompanyQuery = companyQuery;
    
    // Updates that only depend on the selected company
    updateMetrics(lowLimit, companyItems);
    updateHighlights(lowLimit, companyItems);
    updateActiveCompany(companyQuery);
  } else if (!companyItems || companyItems.length === 0) {
    companyItems = getCompanyItems(companyQuery);
  }

  // Dynamically update search autocomplete suggestions
  refreshItemSuggestions(companyItems, query);

  visibleItems = companyItems.filter(item => {
    const status = getStatus(item, lowLimit).className;
    const matchesSearch = !query || item.name.toLowerCase().startsWith(query);
    const matchesFilter = filter === 'all'
      || (filter === 'available' && item.quantity > 0)
      || (filter === 'low' && status === 'low')
      || (filter === 'empty' && status === 'empty');
    return matchesSearch && matchesFilter;
  });

  visibleItems.sort((a, b) => {
    if (sortBy === 'qty-asc') return a.quantity - b.quantity;
    if (sortBy === 'qty-desc') return b.quantity - a.quantity;
    if (sortBy === 'rate-desc') return b.rate - a.rate;
    if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
    return b.value - a.value;
  });

  updateMeta();
  updateTable(lowLimit);
}

const historicalSalesData = {};

async function renderBusiness() {
  const years = asArray(businessData.financialYears);
  const customers = asArray(businessData.receivables?.customers);
  
  await populateSalesYearFilter();
  await renderSelectedSalesYear();
  renderFinancialYearRows(years);

  els.duesTotal.textContent = rupees.format(businessData.receivables?.total || 0);
  els.duesCustomers.textContent = number.format(businessData.receivables?.customerCount || customers.length || 0);
  els.highestDue.textContent = rupees.format(customers[0]?.amount || 0);
  els.duesUpdated.textContent = businessData.updatedAt ? businessData.updatedAt.split(' ')[0] : '-';
  renderCustomerDues();
}

async function populateSalesYearFilter() {
  const activeYears = asArray(businessData.financialYears).map(y => y.financialYear);
  const currentFy = businessData.currentFinancialYear || activeYears[0] || '2026-27';
  
  const allYears = [...new Set([currentFy, ...activeYears])].sort((a, b) => b.localeCompare(a));
  
  els.salesYearFilter.innerHTML = allYears.map(year => {
    const isCurrent = year === currentFy;
    const suffix = isCurrent ? ' (Current)' : '';
    return `<option value="${escapeHtml(year)}">${escapeHtml(year)}${suffix}</option>`;
  }).join('');
  
  els.salesYearFilter.value = currentFy || allYears[0] || '';
}

async function renderSelectedSalesYear() {
  const currentFy = businessData.currentFinancialYear || '2026-27';
  const selectedYear = els.salesYearFilter.value || currentFy;

  const years = asArray(businessData.financialYears);
  const current = years.find(year => year.financialYear === selectedYear) || {};
  const yearData = businessData.salesByYear?.[selectedYear] || businessData.salesByYear?.[Object.keys(businessData.salesByYear || {})[0]] || {};

  els.salesTurnover.textContent = rupees.format((current.turnover || current.sales || 0) * 1.18);
  els.cashSales.textContent = rupees.format((current.cashSales || 0) * 1.18);
  els.creditSales.textContent = rupees.format((current.creditSales || 0) * 1.18);
  els.salesUpdated.textContent = businessData.updatedAt ? `Updated ${businessData.updatedAt}` : 'Data synced from Tally.';

  document.querySelector('#companySalesCaption').textContent = `Top companies in ${selectedYear}`;
  document.querySelector('#productSalesCaption').textContent = `High-selling products in ${selectedYear}`;

  els.companySalesRows.innerHTML = asArray(yearData.companySales).length
    ? asArray(yearData.companySales).map(row => `<tr><td>${escapeHtml(row.name)}</td><td class="num">${rupees.format((row.amount || 0) * 1.18)}</td></tr>`).join('')
    : emptyRow(2, 'No company sales found for this year.');

  els.productSalesRows.innerHTML = asArray(yearData.productSales).length
    ? asArray(yearData.productSales).map(row => `
      <tr>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.companyName || '')}</td>
        <td class="num">${rupees.format((row.amount || 0) * 1.18)}</td>
      </tr>`).join('')
    : emptyRow(3, 'No product sales found for this year.');
}

function renderFinancialYearRows(years) {
  els.yearSalesRows.innerHTML = years.length ? years.map(year => `
    <tr>
      <td>${escapeHtml(year.financialYear)}</td>
      <td class="num">${rupees.format((year.turnover || year.sales || 0) * 1.18)}</td>
      <td class="num">${rupees.format((year.cashSales || 0) * 1.18)}</td>
      <td class="num">${rupees.format((year.creditSales || 0) * 1.18)}</td>
      <td class="num">${number.format(year.productLines || 0)}</td>
    </tr>`).join('') : emptyRow(5, 'No sales data found.');
}

function renderCustomerDues() {
  const query = els.customerSearch.value.trim().toLowerCase();
  const customers = asArray(businessData.receivables?.customers);
  visibleCustomers = customers.filter(customer => {
    const text = `${customer.name || ''} ${customer.address || ''} ${customer.phone || ''}`.toLowerCase();
    return !query || text.includes(query);
  });

  els.customerDueCount.textContent = `${number.format(visibleCustomers.length)} customers shown`;
  els.customerDueRows.innerHTML = visibleCustomers.length
    ? visibleCustomers.map(customer => `
      <tr>
        <td>${escapeHtml(customer.name)}</td>
        <td>${escapeHtml(customer.address || '-')}</td>
        <td>${escapeHtml(customer.phone || '-')}</td>
        <td class="num">${rupees.format(customer.amount || 0)}</td>
      </tr>`).join('')
    : emptyRow(4, 'No customers matched your search.');
}

function updateSuggestions() {
  const items = stockData.items || [];
  const companies = uniqueSorted(items.map(item => companyNameOf(item)).filter(Boolean));
  els.companySuggestions.innerHTML = companies.map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
  refreshItemSuggestions(items, '');
}

function uniqueSorted(values) {
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function companyNameOf(item) {
  return item.companyName || item.group || '';
}

function getCompanyItems(companyQuery) {
  const items = stockData.items || [];
  if (!companyQuery) return items;
  return items.filter(item => companyNameOf(item).toLowerCase().includes(companyQuery));
}

function refreshItemSuggestions(items, query = '') {
  const cleanQuery = query.trim().toLowerCase();
  const filtered = items.filter(item => {
    return !cleanQuery || item.name.toLowerCase().startsWith(cleanQuery);
  });
  const itemNames = uniqueSorted(filtered.map(item => item.name).filter(Boolean));
  els.itemSuggestions.innerHTML = itemNames.slice(0, 100).map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
}

function updateActiveCompany(companyQuery) {
  if (!companyQuery) {
    els.activeCompany.textContent = 'All companies';
    return;
  }
  const exact = (stockData.items || []).find(item => companyNameOf(item).toLowerCase() === companyQuery);
  els.activeCompany.textContent = exact ? companyNameOf(exact) : els.companySearch.value.trim();
}

function updateMeta() {
  const parts = [stockData.company, stockData.category, stockData.period].filter(Boolean);
  const updated = stockData.updatedAt ? `Updated ${stockData.updatedAt}` : '';
  els.sourceMeta.textContent = [parts.join(' | '), updated].filter(Boolean).join(' - ');
}

function updateMetrics(lowLimit, items) {
  const totals = items.reduce((acc, item) => {
    acc.qty += item.quantity || 0;
    acc.value += (item.value || 0) * 1.18;
    if (item.quantity > 0 && item.quantity <= lowLimit) acc.low += 1;
    return acc;
  }, { qty: 0, value: 0, low: 0 });

  els.totalItems.textContent = number.format(items.length);
  els.totalQty.textContent = number.format(totals.qty);
  els.totalValue.textContent = rupees.format(totals.value);
  els.lowStock.textContent = number.format(totals.low);
}

function updateTable(lowLimit) {
  const total = visibleItems.length;
  const sliced = visibleItems.slice(0, currentLimit);
  
  els.resultCount.textContent = `${number.format(total)} products shown`;
  if (!total) {
    els.rows.innerHTML = '<tr><td class="emptyState" colspan="10">No products matched your filters.</td></tr>';
    return;
  }

  let html = sliced.map(item => {
    const status = getStatus(item, lowLimit);
    return `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(companyNameOf(item))}</td>
        <td class="num">${escapeHtml(item.quantityText || number.format(item.quantity))}</td>
        <td class="num">${escapeHtml(item.rateText || rupees.format(item.rate))}</td>
        <td class="num hide-mobile">18%</td>
        <td class="num">${rupees.format(item.rate * 1.18)}</td>
        <td class="num">${formatOptionalMoney(item.leastSoldPrice ? item.leastSoldPrice * 1.18 : null)}</td>
        <td class="num">${formatOptionalMoney(item.highestSoldPrice ? item.highestSoldPrice * 1.18 : null)}</td>
        <td class="num">${rupees.format(item.value * 1.18)}</td>
        <td><span class="status ${status.className}">${status.text}</span></td>
      </tr>`;
  }).join('');

  if (total > currentLimit) {
    html += `
      <tr id="loadMoreRow">
        <td colspan="10" style="text-align: center; padding: 18px;">
          <button id="loadMoreBtn" type="button" style="min-height: 40px; background: var(--brand); color: white; border: 1px solid var(--brand-dark); padding: 0 28px; border-radius: 6px; font-weight: 700; cursor: pointer;">
            Load More (+${number.format(total - currentLimit)} remaining)
          </button>
        </td>
      </tr>`;
  }

  els.rows.innerHTML = html;

  const loadMoreBtn = document.getElementById('loadMoreBtn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      currentLimit += 150;
      updateTable(lowLimit);
    });
  }
}

function updateHighlights(lowLimit, items) {
  const byValue = [...items].sort((a, b) => b.value - a.value).slice(0, 5);
  const attention = [...items].filter(item => item.quantity <= lowLimit).sort((a, b) => a.quantity - b.quantity).slice(0, 5);

  els.topValue.innerHTML = byValue.length
    ? cards(byValue, item => `${rupees.format(item.value * 1.18)} | Qty ${number.format(item.quantity)}`)
    : '<p class="meta">No products in this company.</p>';

  els.attention.innerHTML = attention.length
    ? cards(attention, item => `Qty ${number.format(item.quantity)} | Rate ${rupees.format(item.rate)}`)
    : '<p class="meta">No low-stock products at this limit.</p>';
}

function cards(items, subtitle) {
  return items.map(item => `
    <div class="itemCard">
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(subtitle(item))}</span>
    </div>`).join('');
}

function exportCsv() {
  const activeView = document.querySelector('.view.active')?.id;
  const rows = activeView === 'duesView'
    ? [['Customer', 'Address', 'Phone', 'Amount'], ...visibleCustomers.map(c => [c.name, c.address || '', c.phone || '', c.amount])]
    : [['Item', 'Company', 'Quantity', 'Rate', 'GST %', 'Final Rate (with GST)', 'Least Sold Price (with GST)', 'Highest Sold Price (with GST)', 'Value (with GST)'], ...visibleItems.map(item => [
      item.name,
      companyNameOf(item),
      item.quantityText || item.quantity,
      item.rateText || item.rate,
      '18%',
      (item.rate * 1.18).toFixed(2),
      item.leastSoldPrice ? (item.leastSoldPrice * 1.18).toFixed(2) : '',
      item.highestSoldPrice ? (item.highestSoldPrice * 1.18).toFixed(2) : '',
      (item.value * 1.18).toFixed(2)
    ])];

  const csv = rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = activeView === 'duesView' ? 'customer-dues-export.csv' : 'stock-dashboard-export.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function formatOptionalMoney(value) {
  if (value === null || value === undefined || value === '') return '-';
  return rupees.format(value);
}

function switchView(viewId) {
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === viewId));
  document.querySelectorAll('.tabButton').forEach(button => button.classList.toggle('active', button.dataset.view === viewId));
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function emptyRow(colspan, text) {
  return `<tr><td class="emptyState" colspan="${colspan}">${escapeHtml(text)}</td></tr>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

const debouncedRenderStock = debounce((e) => renderStock(e), 150);

els.search.addEventListener('input', debouncedRenderStock);
els.companySearch.addEventListener('input', debouncedRenderStock);

['change'].forEach(eventName => {
  els.stockFilter.addEventListener(eventName, renderStock);
  els.sortBy.addEventListener(eventName, renderStock);
  els.companySearch.addEventListener(eventName, renderStock);
});

els.lowLimit.addEventListener('input', (e) => {
  const lowLimit = Number(els.lowLimit.value || 0);
  updateMetrics(lowLimit, companyItems);
  updateHighlights(lowLimit, companyItems);
  renderStock(e);
});

els.customerSearch.addEventListener('input', debounce(() => renderCustomerDues(), 150));

els.salesYearFilter.addEventListener('change', renderSelectedSalesYear);

document.querySelectorAll('.tabButton').forEach(button => {
  button.addEventListener('click', () => switchView(button.dataset.view));
});

els.exportCsv.addEventListener('click', exportCsv);
els.printPage.addEventListener('click', () => window.print());

loadData();
