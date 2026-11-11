<#
  Builds launcher\veda.ico (256x256, PNG inside) from the Veda logo in src\app\icon.png.
  Only needed again if the logo changes.
#>
Add-Type -AssemblyName System.Drawing
$Root = Split-Path -Parent $PSScriptRoot
$source = [System.Drawing.Image]::FromFile((Join-Path $Root 'src\app\icon.png'))
$size = 256

$bitmap = New-Object System.Drawing.Bitmap $size, $size
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.DrawImage($source, 0, 0, $size, $size)
$graphics.Dispose()
$source.Dispose()

$png = New-Object System.IO.MemoryStream
$bitmap.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
$pngBytes = $png.ToArray()

# ICO = 6-byte header + one 16-byte entry + the PNG data. A width/height byte of 0 means 256.
$ico = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter $ico
$writer.Write([uint16]0)           # reserved
$writer.Write([uint16]1)           # type: icon
$writer.Write([uint16]1)           # image count
$writer.Write([byte]0)             # width (256)
$writer.Write([byte]0)             # height (256)
$writer.Write([byte]0)             # palette
$writer.Write([byte]0)             # reserved
$writer.Write([uint16]1)           # colour planes
$writer.Write([uint16]32)          # bits per pixel
$writer.Write([uint32]$pngBytes.Length)
$writer.Write([uint32]22)          # data offset
$writer.Write($pngBytes)
$writer.Flush()

$target = Join-Path $PSScriptRoot 'veda.ico'
[System.IO.File]::WriteAllBytes($target, $ico.ToArray())
Write-Host "Wrote $target ($($ico.Length) bytes)"
