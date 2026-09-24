import assert from 'node:assert/strict'
import fs from 'node:fs'
const source=fs.readFileSync('app/admin/page.tsx','utf8')
for(const marker of ['Organization access control','Organizations','Memberships','Projects','Organization Access','Super Admin Cleanup','Project Roles','Landing Pages','Enterprise Identity','Infrastructure','AI Command Center','AI Resource Controls','AI Audit Evidence']) assert.ok(source.includes(marker), `admin UX marker missing: ${marker}`)
assert.ok(source.includes("bg-[#050b17]"), 'admin must use the native DataNexus dark canvas')
assert.ok(source.includes(".in('role',['OWNER','ADMIN'])"), 'organization admin scope must remain OWNER/ADMIN constrained')
assert.ok(source.includes('canAdminWorkspace'), 'admin sub-navigation must remain workspace gated')
assert.ok(source.includes('Organization administration remains separate from governance workspace access.'), 'admin truth boundary must remain explicit')
assert.ok(source.includes('currentUserId={user.id}'), 'AdminManager must retain current-user context')
console.log('Administration UX experience contract passed.')
