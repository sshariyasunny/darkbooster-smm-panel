Set WSHShell = WScript.CreateObject("WScript.Shell")
desktopPath = WSHShell.SpecialFolders("Desktop")

Set shortcut = WSHShell.CreateShortcut(desktopPath & "\Start Dark Booster Panel.lnk")
shortcut.TargetPath = "d:\my all website\smm\Start_SMM_Panel.bat"
shortcut.WorkingDirectory = "d:\my all website\smm"
shortcut.Description = "1-Click Launch Dark Booster SMM Panel & Telegram Bot"
shortcut.Save

WScript.Echo "Desktop Shortcut Created Successfully!"
