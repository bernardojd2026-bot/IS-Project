// ============================================================
//  config.js — Watauga Outage Network
//  Replace SUPABASE_URL and SUPABASE_ANON_KEY before deploying
// ============================================================

const SUPABASE_URL      = 'https://rbifyyuxkmznmefyobzf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiaWZ5eXV4a216bm1lZnlvYnpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2ODIzOTgsImV4cCI6MjA4OTI1ODM5OH0.3efVmiGInEwso7OAZfZNWbmnBLmOJAhfA6Ka_u2LZ5I';

// ── ISPs served in Watauga County ───────────────────────────
const ISPS = [
  'Provider A',
  'Provider B',
  'Provider C',
  'Provider D',
  'Provider E',
  'Provider F',
  'Provider G',
  'Other'
];
 
// ── Issue type definitions ───────────────────────────────────
const ISSUE_TYPES = [
  { value: 'complete_outage', label: 'Complete Outage'          },
  { value: 'slow_speeds',     label: 'Slow Speeds'              },
  { value: 'intermittent',    label: 'Intermittent Connection'  },
  { value: 'no_wifi',         label: 'No Wi-Fi Signal'          },
  { value: 'dns_issues',      label: 'DNS Issues'               },
  { value: 'high_latency',    label: 'High Latency / Packet Loss'},
];
 
const ISSUE_LABELS = Object.fromEntries(ISSUE_TYPES.map(t => [t.value, t.label]));
 
// ── Watauga County, NC geographic bounds ────────────────────
const WATAUGA_BOUNDS = {
  south: 36.077,
  north: 36.348,
  west:  -81.951,
  east:  -81.517,
};
 
const WATAUGA_CENTER = [36.213, -81.701];
const WATAUGA_ZOOM   = 11;
 
// ── Heatmap gradient: green → dark-red ──────────────────────
const HEAT_GRADIENT = {
  0.00: '#22c55e',
  0.28: '#84cc16',
  0.50: '#eab308',
  0.68: '#f97316',
  0.84: '#dc2626',
  1.00: '#7f1d1d',
};
 
// ── Helpers ─────────────────────────────────────────────────
function getSupabaseClient() {
  return supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
 
function showToast(message, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `show ${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3800);
}
 
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
 
function sinceISO(hours) {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}