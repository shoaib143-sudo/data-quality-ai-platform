export async function GET() {
  return Response.json({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [{ type: 'oauthbearertoken', name: 'Bearer Token', description: 'Directory-specific bearer token.', specUri: 'https://www.rfc-editor.org/rfc/rfc6750' }],
    meta: { resourceType: 'ServiceProviderConfig' },
  }, { headers: { 'Content-Type': 'application/scim+json', 'Cache-Control': 'public, max-age=3600' } })
}
