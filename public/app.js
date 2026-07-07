let chart;
let searchTerm = '';
let lastState = null;

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

async function refresh() {
  let s;
  try {
    s = await (await fetch('/api/state')).json();
  } catch {
    return;
  }

  lastState = s;
  document.getElementById('store-name').textContent = s.storeName;
  document.getElementById('date').textContent = new Date().toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

  // Sidebar status
  const chanDot = document.getElementById('chan-dot');
  const chanConnected = Boolean(s.channel?.telegram);
  chanDot.className = 'dot ' + (chanConnected ? 'on' : 'off');
  document.getElementById('chan-sub').textContent = chanConnected ? s.channel.telegram : 'offline';
  const aiDot = document.getElementById('ai-dot');
  aiDot.className = 'dot ' + (s.ai ? 'on' : 'off');
  document.getElementById('ai-sub').textContent = s.ai ? 'Gemini · online' : 'rule-based mode';

  // KPIs
  document.getElementById('k-rev').textContent = inr(s.today.revenue);
  document.getElementById('k-rev-sub').textContent =
    s.today.orders + (s.today.orders === 1 ? ' order' : ' orders');
  const units = s.today.top.reduce((a, t) => a + t.qty, 0);
  document.getElementById('k-ord').textContent = s.today.orders;
  document.getElementById('k-ord-sub').textContent = units + ' units sold';
  document.getElementById('k-val').textContent = inr(s.inventoryValue);
  document.getElementById('k-items-sub').textContent = s.inventory.length + ' items in catalog';
  document.getElementById('k-low').textContent = s.lowStock.length;
  const lowKpi = document.getElementById('k-low-sub');
  lowKpi.textContent = s.lowStock.length ? 'need restocking' : 'all stock healthy';

  // Inventory table (with search filter)
  const rows = s.inventory.filter((i) => i.name.toLowerCase().includes(searchTerm));
  document.querySelector('#inv tbody').innerHTML =
    rows
      .map((i) => {
        const low = i.qty <= (i.lowStock ?? 5);
        return `<tr>
          <td class="item-name">${esc(i.name)}</td>
          <td>${i.qty} <span class="muted">${esc(i.unit)}</span></td>
          <td>${inr(i.price)}</td>
          <td>${inr(i.qty * i.price)}</td>
          <td><span class="badge ${low ? 'low' : 'ok'}">${low ? 'Low' : 'In stock'}</span></td>
        </tr>`;
      })
      .join('') || `<tr><td colspan="5" class="empty">No items match "${esc(searchTerm)}".</td></tr>`;

  // Top sellers chart
  const top = s.today.top;
  document.getElementById('chart-empty').style.display = top.length ? 'none' : 'block';
  document.getElementById('chart').style.display = top.length ? 'block' : 'none';
  if (top.length) drawChart(top);

  // Low stock list
  document.getElementById('low-count').textContent = s.lowStock.length;
  document.getElementById('low-list').innerHTML =
    s.lowStock
      .map((i) => `<li><span>${esc(i.name)}</span><span class="qty">${i.qty} left</span></li>`)
      .join('') || '<li class="muted" style="background:none">Everything is well stocked ✓</li>';

  // Pending customer orders — with Accept / Reject actions
  const orders = s.orders || [];
  document.getElementById('orders-count').textContent = orders.length;
  document.getElementById('orders-list').innerHTML =
    orders
      .map((o) => {
        const items = o.items.map((i) => `${esc(i.name)} ×${i.qty}`).join(', ') || '—';
        const oid = esc(String(o.id));
        return `<li class="order-item">
          <div class="order-info">
            <span>${esc(o.customerName)} · ${items}</span>
            <span class="muted">${timeAgo(o.ts)}</span>
          </div>
          <div class="order-act">
            <span class="qty">${inr(o.total)}</span>
            <button class="mini-btn ok" data-accept="${oid}" title="Accept &amp; deduct stock">Accept</button>
            <button class="mini-btn no" data-reject="${oid}" title="Reject order">Reject</button>
          </div>
        </li>`;
      })
      .join('') || '<li class="muted" style="background:none">No pending orders.</li>';

  // Restock plan (AI forecast)
  const pred = s.insights?.predicted || [];
  document.getElementById('restock-plan').innerHTML =
    pred.length
      ? pred
          .map(
            (p) =>
              `<li><span>${esc(p.name)} <span class="muted">${p.qty} left</span></span>` +
              `<span class="qty">~${p.daysLeft.toFixed(1)}d</span></li>`
          )
          .join('')
      : '<li class="muted" style="background:none">No stock-outs predicted at today\'s pace ✓</li>';

  // Recent activity
  document.getElementById('updated').textContent = 'updated ' + new Date().toLocaleTimeString();
  document.getElementById('activity').innerHTML =
    s.recentSales
      .map((sale) => {
        const items = sale.items.map((i) => `${esc(i.name)} ×${i.qty}`).join(', ');
        return `<li><span><strong>Sale</strong> · ${items}</span>
          <span><span class="when">${timeAgo(sale.ts)}</span> &nbsp; <span class="amt">${inr(sale.total)}</span></span></li>`;
      })
      .join('') || '<li class="muted" style="border:none">No sales yet — send a message to the bot to see it here.</li>';
}

function drawChart(top) {
  const ctx = document.getElementById('chart');
  const data = {
    labels: top.map((t) => t.name),
    datasets: [{ data: top.map((t) => t.qty), backgroundColor: '#4f46e5', borderRadius: 6, maxBarThickness: 46 }],
  };
  if (chart) { chart.data = data; chart.update('none'); return; }
  chart = new Chart(ctx, {
    type: 'bar',
    data,
    options: {
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a' } },
      scales: {
        x: { ticks: { color: '#64748b', font: { family: 'Inter' } }, grid: { display: false }, border: { display: false } },
        y: { ticks: { color: '#94a3b8', precision: 0, font: { family: 'Inter' } }, grid: { color: '#eef1f5' }, border: { display: false } },
      },
    },
  });
}

// Interactions
document.getElementById('search').addEventListener('input', (e) => {
  searchTerm = e.target.value.toLowerCase();
  refresh();
});
document.getElementById('seed').addEventListener('click', async (e) => {
  e.target.disabled = true;
  await fetch('/api/seed', { method: 'POST' });
  await refresh();
  e.target.disabled = false;
});
document.querySelectorAll('.nav-item').forEach((n) =>
  n.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((x) => x.classList.remove('active'));
    n.classList.add('active');
    const el = document.getElementById(n.dataset.scroll);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  })
);

// ---- Add an order from the dashboard ----
const aoForm = document.getElementById('add-order-form');
const aoItems = document.getElementById('ao-items');
const aoTotalEl = document.getElementById('ao-total');
const aoMsg = document.getElementById('ao-msg');

function aoOptions() {
  const inv = (lastState && lastState.inventory) || [];
  if (!inv.length) return '<option value="">No items in catalog</option>';
  return inv
    .map((i) => `<option value="${esc(i.name)}" data-price="${i.price}">${esc(i.name)} · ${inr(i.price)}</option>`)
    .join('');
}
// The last remaining row can't be removed (an order needs >=1 item), so hide
// its × rather than leaving a dead button. Show all ×'s once there are 2+ rows.
function syncRemoveButtons() {
  const rows = aoItems.querySelectorAll('.ao-row');
  const hide = rows.length <= 1;
  rows.forEach((r) => {
    const btn = r.querySelector('.ao-remove');
    if (btn) btn.style.visibility = hide ? 'hidden' : 'visible';
  });
}

function addItemRow() {
  const row = document.createElement('div');
  row.className = 'ao-row';
  row.innerHTML =
    `<select class="ao-item">${aoOptions()}</select>` +
    `<input class="ao-qty" type="number" min="1" step="1" value="1" />` +
    `<button type="button" class="ao-remove" aria-label="Remove item">&times;</button>`;
  aoItems.appendChild(row);
  syncRemoveButtons();
  updateAoTotal();
}
function updateAoTotal() {
  let total = 0;
  aoItems.querySelectorAll('.ao-row').forEach((row) => {
    const opt = row.querySelector('.ao-item').selectedOptions[0];
    const price = opt ? Number(opt.dataset.price || 0) : 0;
    const qty = Number(row.querySelector('.ao-qty').value) || 0;
    total += price * qty;
  });
  aoTotalEl.textContent = inr(total);
}

document.getElementById('add-order-btn').addEventListener('click', () => {
  if (aoForm.hasAttribute('hidden')) {
    aoItems.innerHTML = '';
    addItemRow();
    aoMsg.textContent = '';
    aoForm.removeAttribute('hidden');
  } else {
    aoForm.setAttribute('hidden', '');
  }
});
document.getElementById('ao-add-item').addEventListener('click', addItemRow);
aoItems.addEventListener('input', updateAoTotal);
aoItems.addEventListener('change', updateAoTotal);
aoItems.addEventListener('click', (e) => {
  if (!e.target.classList.contains('ao-remove')) return;
  if (aoItems.querySelectorAll('.ao-row').length > 1) {
    e.target.closest('.ao-row').remove();
    syncRemoveButtons();
  }
  updateAoTotal();
});

aoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const items = [];
  aoItems.querySelectorAll('.ao-row').forEach((row) => {
    const name = row.querySelector('.ao-item').value;
    const qty = Number(row.querySelector('.ao-qty').value);
    if (name && qty > 0) items.push({ name, qty });
  });
  if (!items.length) {
    aoMsg.textContent = 'Add at least one item.';
    return;
  }
  const submit = aoForm.querySelector('button[type=submit]');
  submit.disabled = true;
  aoMsg.textContent = 'Adding…';
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName: document.getElementById('ao-customer').value, items }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'request failed');
    aoForm.setAttribute('hidden', '');
    document.getElementById('ao-customer').value = '';
    aoMsg.textContent = '';
    await refresh();
  } catch (err) {
    aoMsg.textContent = 'Could not add order: ' + err.message;
  } finally {
    submit.disabled = false;
  }
});

// Accept / reject pending orders from the dashboard
document.getElementById('orders-list').addEventListener('click', async (e) => {
  const id = e.target.getAttribute('data-accept') || e.target.getAttribute('data-reject');
  if (!id) return;
  const action = e.target.hasAttribute('data-accept') ? 'accept' : 'reject';
  e.target.disabled = true;
  try {
    await fetch(`/api/orders/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
  } catch {}
  await refresh();
});

refresh();
setInterval(refresh, 3000);
