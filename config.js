// Supabase project connection info for 근로감독 대시보드.
// The publishable key is safe to expose in client-side code: every table and storage
// path is protected by Row Level Security that checks the logged-in user's per-menu
// permission (see supabase/01_schema.sql: has_perm / perm_level).
window.SUPABASE_CONFIG = {
    url: "https://pkvuhwzowniepnfadlky.supabase.co",
    anonKey: "sb_publishable_pnFQ46hbfpaTWZrfpq6ahw_pJiqobW6",
    bucket: "dashboard-files"
};
// Previous standalone ledger project — only used by the one-time
// "기존 관리대장 데이터 가져오기" tool in 관리 › 데이터 가져오기.
window.OLD_SUPABASE_CONFIG = {
    url: "https://wvolctqklbmmlzosexel.supabase.co",
    anonKey: "sb_publishable_xRdm-EvBqyln-ZLp0A6vTA_ghRiKtzT",
    bucket: "labor-compliance-files"
};