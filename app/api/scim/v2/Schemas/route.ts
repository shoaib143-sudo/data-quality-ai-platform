export async function GET() {
  const userSchema = {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:Schema'],
    id: 'urn:ietf:params:scim:schemas:core:2.0:User',
    name: 'User',
    description: 'SCIM user identity.',
    attributes: [
      { name: 'userName', type: 'string', multiValued: false, required: true, mutability: 'readWrite', returned: 'default', uniqueness: 'server', caseExact: false },
      { name: 'displayName', type: 'string', multiValued: false, required: false, mutability: 'readWrite', returned: 'default', uniqueness: 'none', caseExact: false },
      { name: 'active', type: 'boolean', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
      { name: 'emails', type: 'complex', multiValued: true, required: false, mutability: 'readWrite', returned: 'default', subAttributes: [
        { name: 'value', type: 'string', multiValued: false, required: false, mutability: 'readWrite', returned: 'default', caseExact: false },
        { name: 'primary', type: 'boolean', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
        { name: 'type', type: 'string', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
      ] },
    ],
  }
  const enterpriseSchema = {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:Schema'],
    id: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User',
    name: 'EnterpriseUser',
    description: 'Enterprise organization extension.',
    attributes: [{ name: 'organization', type: 'string', multiValued: false, required: false, mutability: 'readOnly', returned: 'default' }],
  }
  return Response.json({ schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'], totalResults: 2, startIndex: 1, itemsPerPage: 2, Resources: [userSchema, enterpriseSchema] }, { headers: { 'Content-Type': 'application/scim+json', 'Cache-Control': 'public, max-age=3600' } })
}
