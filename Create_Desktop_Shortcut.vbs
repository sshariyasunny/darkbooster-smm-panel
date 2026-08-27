Set WSHShell = WScript.CreateObject("WScript.Shell")
desktopPath = WSHShell.SpecialFolders("Desktop")
Set shortcut = WSHShell.CreateShortcut(desktopPath & "\Start Telegram Bot.lnk")
shortcut.TargetPath = "d:\my all website\smm\Start_Telegram_Bot.bat"
shortcut.WorkingDirectory = "d:\my all website\smm"
shortcut.Description = "Launch DarkBooster Telegram Bot"
shortcut.Save
WScript.Echo "Shortcut Created Successfully!"
