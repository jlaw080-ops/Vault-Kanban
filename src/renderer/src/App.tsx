import { useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { useVaultStore } from './stores/vaultStore'
import { useSettingsStore } from './stores/settingsStore'

function App(): React.JSX.Element {
  const { loadVault } = useVaultStore()
  const { load: loadSettings } = useSettingsStore()

  useEffect(() => {
    void (async () => {
      const loaded = await loadSettings()
      if (loaded.vaultPath) {
        useVaultStore.setState({ vaultPath: loaded.vaultPath })
        await loadVault(loaded.vaultPath, loaded.excludedFolders)
      }
    })()
  }, [loadSettings, loadVault])

  return <AppShell />
}

export default App
