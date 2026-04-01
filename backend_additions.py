# ════════════════════════════════════════════════════════════════════════════
# FILE 1: ADD THESE ROUTES TO app.py
# Place these BEFORE the `if __name__ == '__main__':` line
# ════════════════════════════════════════════════════════════════════════════



# ════════════════════════════════════════════════════════════════════════════
# FILE 2: ADD THESE FUNCTIONS TO services.py
# Place them near the bottom, before the last blank line
# ════════════════════════════════════════════════════════════════════════════

import json  # already imported at top of services.py

def _ensure_verify_table():
    """Creates the verification_vouchers table if it doesn't exist."""
    with get_db_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS verification_vouchers (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at      TEXT,
                filter_info     TEXT,
                expected_count  INTEGER,
                scanned_count   INTEGER,
                missing_count   INTEGER,
                extra_count     INTEGER,
                expected_ids    TEXT,
                scanned_ids     TEXT,
                missing_ids     TEXT,
                extra_ids       TEXT,
                notes           TEXT
            )
        """)


def create_verification_voucher(payload):
    """
    Saves a verification session voucher.
    Returns the new voucher ID.
    """
    _ensure_verify_table()

    timestamp     = datetime.datetime.now().isoformat()
    filter_info   = json.dumps(payload.get('filter', {}))
    expected_ids  = payload.get('expected_ids', [])
    scanned_ids   = payload.get('scanned_ids',  [])
    missing_ids   = payload.get('missing_ids',  [])
    extra_ids     = payload.get('extra_ids',    [])
    notes         = payload.get('notes', '')

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO verification_vouchers
            (created_at, filter_info, expected_count, scanned_count,
             missing_count, extra_count, expected_ids, scanned_ids,
             missing_ids, extra_ids, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            timestamp,
            filter_info,
            len(expected_ids),
            len(scanned_ids),
            len(missing_ids),
            len(extra_ids),
            json.dumps(expected_ids),
            json.dumps(scanned_ids),
            json.dumps(missing_ids),
            json.dumps(extra_ids),
            notes
        ))
        conn.commit()
        return cur.lastrowid


def get_verification_vouchers():
    """Returns all verification vouchers, newest first."""
    _ensure_verify_table()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM verification_vouchers ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]


# ════════════════════════════════════════════════════════════════════════════
# FILE 3: ADD THIS SNIPPET TO YOUR ADMIN STOCK TABLE (admin.html)
#
# Find where your stock table rows are rendered (the loop that creates <tr>
# elements for each stock item). Add a "Verify" column header and button:
#
# In the <thead> row, add:
#   <th>Verify</th>
#
# In each <tr> for a stock row, add:
#   <td>
#     <button onclick="openVerify(row)" class="btn-verify">🔍 Verify</button>
#   </td>
#
# Then add this JS function to your admin.html <script> block:
# ════════════════════════════════════════════════════════════════════════════

"""
JAVASCRIPT SNIPPET — Add to admin.html inside <script> tags:

function openVerify(row) {
    // row = the data object for that stock group
    // Adjust property names to match what your table actually uses:
    const params = new URLSearchParams();
    if (row.pipe_name)     params.set('pipe_name', row.pipe_name);
    if (row.size)          params.set('size',      row.size);
    if (row.color)         params.set('color',     row.color);
    if (row.pressure_class) params.set('pressure', row.pressure_class);
    window.open('/verify?' + params.toString(), '_blank');
}

CSS TO ADD (inside <style> tags):
.btn-verify {
    background: rgba(59,130,246,.15);
    border: 1px solid rgba(59,130,246,.4);
    color: #60a5fa;
    padding: 4px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: 700;
    transition: .2s;
}
.btn-verify:hover {
    background: rgba(59,130,246,.3);
}

ALTERNATIVELY — If your admin table is rendered from /api/stats_summary stock_summary:
The stock_summary rows already have pipe_name, size, color, pressure_class fields.
In your table render function, add a verify button like:
    <td><button onclick="openVerify(${JSON.stringify(item)})" class="btn-verify">🔍 Verify</button></td>
"""
