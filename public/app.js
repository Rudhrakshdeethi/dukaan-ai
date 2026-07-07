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

  document.getElementById('store-name').textContent = s.storeName || 'Store';

  // Bot / channel status
  const chanConnected = Boolean(s.channel && s.channel.telegram);
  document.getElementById('chan-dot').className = 's-dot ' + (chanConnected ? 'on' : 'off');
  document.getElementById('chan-sub').textContent = chanConnected
    ? s.channel.telegram + ' · online'
    : 'offline';
  if (chanConnected) {
    document.getElementById('bot-link').href =
      'https://t.me/' + s.channel.telegram.replace(/^@/, '');
  }

  // AI status
  document.getElementById('ai-dot').className = 's-dot ' + (s.ai ? 'on' : 'off');
  document.getElementById('ai-sub').textContent = s.ai ? 'Gemini · online' : 'rule-based mode';

  // Pending customer orders — the live, informational part
  const orders = s.orders || [];
  document.getElementById('orders-count').textContent = orders.length;
  document.getElementById('orders-list').innerHTML =
    orders
      .map((o) => {
        const items = o.items.map((i) => `${esc(i.name)} ×${i.qty}`).join(', ') || '—';
        return `<li class="order">
          <div class="order-main">
            <strong>${esc(o.customerName)}</strong>
            <span class="items">${items}</span>
          </div>
          <div class="order-side">
            <span class="amt">${inr(o.total)}</span>
            <span class="when">${timeAgo(o.ts)}</span>
          </div>
        </li>`;
      })
      .join('') || '<li class="empty">No pending orders right now.</li>';

  document.getElementById('updated').textContent =
    'Updated ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

refresh();
setInterval(refresh, 3000);
