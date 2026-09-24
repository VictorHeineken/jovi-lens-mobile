// Play Integrity verification slot. The real server-side check is implemented
// in milestone M6 (prod-implementation-spec.md §5.8); until then the guard only
// calls this when JOVI_REQUIRE_INTEGRITY=true, which stays off.
export async function verifyIntegrity(_req, _bodySha256) {
  return { ok: false, reason: 'not_implemented' };
}
