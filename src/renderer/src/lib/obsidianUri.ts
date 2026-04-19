export function buildOpenUri(vaultName: string, relativePath: string): string {
  const path = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath
  const withoutExt = path.endsWith('.md') ? path.slice(0, -3) : path
  const encodedVault = encodeURIComponent(vaultName)
  const encodedFile = withoutExt.split('/').map(encodeURIComponent).join('%2F')
  return `obsidian://open?vault=${encodedVault}&file=${encodedFile}`
}
