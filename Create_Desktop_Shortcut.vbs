Set WSHShell = WScript.CreateObject("WScript.Shell")
desktopPath = WSHShell.SpecialFolders("Desktop")
Set fso = CreateObject("Scripting.FileSystemObject")

' Remove extra Panel shortcut if present
oldShortcut = desktopPath & "\Start Dark Booster Panel.lnk"
If fso.FileExists(oldShortcut) Then
    fso.DeleteFile(oldShortcut)
End If

' Single Telegram Bot Shortcut
Set shortcut = WSHShell.CreateShortcut(desktopPath & "\Start Telegram Bot.lnk")
shortcut.TargetPath = "d:\my project\smm\Start_Telegram_Bot.bat"
shortcut.WorkingDirectory = "d:\my project\smm"
shortcut.Description = "1-Click Launch Dark Booster Telegram Bot"
shortcut.Save

WScript.Echo "Desktop Shortcut Updated! Only 'Start Telegram Bot' shortcut is now on your Desktop."
