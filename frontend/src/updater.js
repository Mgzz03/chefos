// Auto-update for the desktop app.
// Safe no-op outside the Tauri shell (dev browser, phone on the LAN, etc.).
// Checks GitHub Releases (configured in tauri.conf.json) and, if a newer signed
// build exists, offers to install it and relaunch. Silent if offline / no update.

export async function checkForUpdate({ silent = true } = {}) {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return
    try {
        const { check } = await import('@tauri-apps/plugin-updater')
        const update = await check()
        if (!update) {                       // already up to date
            if (!silent) window.alert('ChefOS is up to date. 🎉')
            return
        }
        const notes = update.body ? `\n\nWhat's new:\n${update.body}` : ''
        const ok = window.confirm(
            `A new version of ChefOS (${update.version}) is available.${notes}\n\n` +
            `Install it now? It takes a few seconds and ChefOS will reopen automatically. ` +
            `Your data is not affected.`
        )
        if (!ok) return
        await update.downloadAndInstall()
        const { relaunch } = await import('@tauri-apps/plugin-process')
        await relaunch()
    } catch (e) {
        // No internet, no release published yet, or signature mismatch — ignore.
        if (!silent) window.alert('Could not check for updates right now.')
        // eslint-disable-next-line no-console
        console.debug('update check skipped:', e?.message || e)
    }
}
