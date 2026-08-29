Set WSHShell = WScript.CreateObject("WScript.Shell")
desktopPath = WSHShell.SpecialFolders("Desktop")

' 1. SMM Panel Full Launcher Shortcut
Set shortcut1 = WSHShell.CreateShortcut(desktopPath & "\Start Dark Booster Panel.lnk")
shortcut1.TargetPath = "d:\my project\smm\Start_SMM_Panel.bat"
shortcut1.WorkingDirectory = "d:\my project\smm"
shortcut1.Description = "1-Click Launch Dark Booster SMM Panel & Website"
shortcut1.Save

' 2. Telegram Bot 1-Click Launcher Shortcut
Set shortcut2 = WSHShell.CreateShortcut(desktopPath & "\Start Telegram Bot.lnk")
shortcut2.TargetPath = "d:\my project\smm\Start_Telegram_Bot.bat"
shortcut2.WorkingDirectory = "d:\my project\smm"
shortcut2.Description = "1-Click Launch Dark Booster Telegram Bot Only"
shortcut2.Save

WScript.Echo "Desktop Shortcuts Created Successfully! 'Start Telegram Bot' shortcut is now on your Desktop."
