' Local Canvas 静默启动器 — 无黑框
' 双击此文件启动，不会弹出控制台窗口
' 启动后在系统托盘显示图标，右键可退出

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

' 获取脚本所在目录
strPath = Replace(WScript.ScriptFullName, WScript.ScriptName, "")
strPath = Left(strPath, Len(strPath) - 1)

' 以后台方式运行 start.bat（窗口隐藏）
WshShell.Run "cmd /C """ & strPath & "\start.bat""", 0, False

' 创建托盘图标
Set WshShellApp = CreateObject("Shell.Application")
' 在任务栏显示一个友好的提示
WshShell.PopUp "Local Canvas 已启动！" & vbCrLf & vbCrLf & _
  "浏览器自动打开后即可使用。" & vbCrLf & _
  "如需退出，请关闭浏览器窗口后按 Ctrl+C 结束。", _
  3, "Local Canvas", 64
