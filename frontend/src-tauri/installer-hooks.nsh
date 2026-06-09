; ChefOS NSIS installer hooks.
; The backend runs as a separate process (chefos-backend.exe). If it is still
; running when an update is installed, Windows locks the file and the installer
; fails with "Error opening file for writing". Kill it (and any stray app
; window) before copying files so updates install cleanly.

!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /IM chefos-backend.exe /T'
  nsExec::Exec 'taskkill /F /IM ChefOS.exe /T'
  Sleep 800
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /IM chefos-backend.exe /T'
  Sleep 500
!macroend
