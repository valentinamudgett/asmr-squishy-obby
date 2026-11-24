Add-Type -AssemblyName System.Drawing
$src = @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class WingPhotoMaker {
  public static void Key(string src, string dest, string mode) {
    using (var raw = new Bitmap(src)) {
      var bmp = new Bitmap(raw.Width, raw.Height, PixelFormat.Format32bppArgb);
      using (var g = Graphics.FromImage(bmp)) g.DrawImage(raw, 0, 0, raw.Width, raw.Height);
      var rect = new Rectangle(0, 0, bmp.Width, bmp.Height);
      var data = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
      int w = bmp.Width, h = bmp.Height, stride = data.Stride;
      var bytes = new byte[stride * h];
      Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
      var seen = new bool[w * h];
      var q = new Queue<int>();
      Action<int, int> push = null;
      push = (x, y) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        int i = y * w + x;
        if (seen[i]) return;
        int p = y * stride + x * 4;
        int b = bytes[p], gg = bytes[p + 1], r = bytes[p + 2];
        bool dark = r < 48 && gg < 48 && b < 48;
        bool light = r > 240 && gg > 240 && b > 240;
        bool hit = mode == "dark" ? dark : mode == "light" ? light : (dark || light);
        if (!hit) return;
        seen[i] = true;
        bytes[p + 3] = 0;
        q.Enqueue(i);
      };
      for (int x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
      for (int y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
      int[] dx = { 1, -1, 0, 0 };
      int[] dy = { 0, 0, 1, -1 };
      while (q.Count > 0) {
        int i = q.Dequeue();
        int x = i % w, y = i / w;
        for (int k = 0; k < 4; k++) push(x + dx[k], y + dy[k]);
      }
      Marshal.Copy(bytes, 0, data.Scan0, bytes.Length);
      bmp.UnlockBits(data);
      int minX = w, minY = h, maxX = 0, maxY = 0;
      for (int y = 0; y < h; y++) {
        for (int x = 0; x < w; x++) {
          if (bytes[y * stride + x * 4 + 3] < 16) continue;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX <= minX || maxY <= minY) { bmp.Save(dest, ImageFormat.Png); bmp.Dispose(); return; }
      int pad = 12;
      minX = Math.Max(0, minX - pad);
      minY = Math.Max(0, minY - pad);
      maxX = Math.Min(w - 1, maxX + pad);
      maxY = Math.Min(h - 1, maxY + pad);
      int cw = maxX - minX + 1, ch = maxY - minY + 1;
      using (var crop = bmp.Clone(new Rectangle(minX, minY, cw, ch), PixelFormat.Format32bppArgb)) {
        int max = 720;
        if (cw > max || ch > max) {
          float scale = Math.Min(max / (float)cw, max / (float)ch);
          int nw = Math.Max(1, (int)(cw * scale)), nh = Math.Max(1, (int)(ch * scale));
          using (var small = new Bitmap(nw, nh, PixelFormat.Format32bppArgb))
          using (var g = Graphics.FromImage(small)) {
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.DrawImage(crop, 0, 0, nw, nh);
            small.Save(dest, ImageFormat.Png);
          }
        } else crop.Save(dest, ImageFormat.Png);
      }
      bmp.Dispose();
    }
  }

  public static void Draw(string dest, string style, string hexA, string hexB) {
    var a = ColorTranslator.FromHtml(hexA);
    var b = ColorTranslator.FromHtml(hexB);
    using (var bmp = new Bitmap(640, 400, PixelFormat.Format32bppArgb))
    using (var g = Graphics.FromImage(bmp)) {
      g.SmoothingMode = SmoothingMode.AntiAlias;
      g.Clear(Color.Transparent);
      g.TranslateTransform(320, 230);
      if (style == "butterfly") Butterfly(g, a, b);
      else if (style == "flame") Flame(g, a, b);
      else if (style == "crystal") Crystal(g, a, b);
      else if (style == "bolt") Bolt(g, a, b);
      else Feather(g, a, b);
      bmp.Save(dest, ImageFormat.Png);
    }
  }

  static void Feather(Graphics g, Color a, Color b) {
    using (var brush = new LinearGradientBrush(new Rectangle(-280, -180, 560, 280), a, b, 20f))
    using (var pen = new Pen(Color.FromArgb(90, 40, 24, 32), 2f)) {
      for (int side = -1; side <= 1; side += 2) {
        var state = g.Save();
        g.ScaleTransform(side, 1);
        for (int i = 0; i < 8; i++) {
          float ang = -78 + i * 18;
          var s = g.Save();
          g.RotateTransform(ang);
          float len = 250 - i * 8;
          g.FillEllipse(brush, 16, -16, len, 34);
          g.DrawEllipse(pen, 16, -16, len, 34);
          g.Restore(s);
        }
        g.Restore(state);
      }
    }
  }

  static void Butterfly(Graphics g, Color a, Color b) {
    using (var brush = new LinearGradientBrush(new Rectangle(-260, -160, 520, 300), a, b, 90f))
    using (var spot = new SolidBrush(Color.FromArgb(180, 255, 236, 160))) {
      foreach (int side in new[] { -1, 1 }) {
        g.FillEllipse(brush, side < 0 ? -250 : 20, -150, 230, 170);
        g.FillEllipse(brush, side < 0 ? -210 : 30, 0, 180, 130);
        g.FillEllipse(spot, side < 0 ? -160 : 90, -90, 28, 22);
        g.FillEllipse(spot, side < 0 ? -120 : 70, 40, 18, 16);
      }
    }
  }

  static void Flame(Graphics g, Color a, Color b) {
    using (var brush = new LinearGradientBrush(new Rectangle(-240, -180, 480, 280), b, a, 90f)) {
      foreach (int side in new[] { -1, 1 }) {
        var state = g.Save();
        g.ScaleTransform(side, 1);
        var path = new GraphicsPath();
        path.AddBezier(10, 20, 40, -160, 180, -40, 230, 10);
        path.AddBezier(230, 10, 120, 40, 40, 80, 10, 20);
        g.FillPath(brush, path);
        path.Dispose();
        g.Restore(state);
      }
    }
  }

  static void Crystal(Graphics g, Color a, Color b) {
    using (var brush = new LinearGradientBrush(new Rectangle(-240, -160, 480, 280), a, b, 40f))
    using (var pen = new Pen(Color.FromArgb(160, 255, 255, 255), 2f)) {
      foreach (int side in new[] { -1, 1 }) {
        PointF[] pts = side < 0
          ? new[] { new PointF(-20, 10), new PointF(-230, -20), new PointF(-120, -140), new PointF(-40, -30) }
          : new[] { new PointF(20, 10), new PointF(230, -20), new PointF(120, -140), new PointF(40, -30) };
        g.FillPolygon(brush, pts);
        g.DrawPolygon(pen, pts);
      }
    }
  }

  static void Bolt(Graphics g, Color a, Color b) {
    using (var brush = new LinearGradientBrush(new Rectangle(-240, -160, 480, 260), a, b, 0f)) {
      foreach (int side in new[] { -1, 1 }) {
        float s = side;
        PointF[] pts = {
          new PointF(s * 20, 30), new PointF(s * 90, -20), new PointF(s * 50, -20),
          new PointF(s * 220, -150), new PointF(s * 120, 0), new PointF(s * 170, 0), new PointF(s * 20, 30)
        };
        g.FillPolygon(brush, pts);
      }
    }
  }
}
"@
Add-Type -TypeDefinition $src -ReferencedAssemblies System.Drawing
$dir = Join-Path (Split-Path $PSScriptRoot -Parent) "public\wings"
# When run from scripts/, parent is the repo. Fall back if $PSScriptRoot is odd.
if (-not (Test-Path (Join-Path (Split-Path $PSScriptRoot -Parent) "public"))) {
  $dir = "c:\Dev\asmr-squishy-obby\public\wings"
}
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$assets = "C:\Users\jmmse\.cursor\projects\c-Dev-asmr-squishy-obby\assets"
[WingPhotoMaker]::Key((Join-Path $assets "Screenshot_2026-11-23_115747-f22a1b9c-dc6c-47e1-88cc-ca7d2a6fbd19.png"), (Join-Path $dir "crimson.png"), "dark")
[WingPhotoMaker]::Key((Join-Path $assets "Screenshot_2026-11-23_115720-939b1190-f956-47f4-aad5-bc865f2d60d3.png"), (Join-Path $dir "azure.png"), "dark")
[WingPhotoMaker]::Key((Join-Path $assets "Screenshot_2026-11-23_115712-4d78bb72-314e-4b6a-af8b-feb3d555ef06.png"), (Join-Path $dir "prism.png"), "both")
[WingPhotoMaker]::Key((Join-Path $assets "Screenshot_2026-11-23_115831-8b0ea8fd-c4a0-42d5-9f9f-ec9de465bea0.png"), (Join-Path $dir "monarch.png"), "light")
$drawn = @(
  @("sprout","feather","#7dcea0","#b6f5c4"),
  @("breeze","feather","#9ad7ff","#e8f7ff"),
  @("cloud","feather","#fff6ea","#d7e4ee"),
  @("sky","feather","#ffb3d4","#ff7eb3"),
  @("rainbow","feather","#ff8ad4","#7ec8ff"),
  @("comet","bolt","#d7e4ff","#5b8cff"),
  @("storm","feather","#6a7388","#c5d0e6"),
  @("aurora","feather","#7dffa8","#b388ff"),
  @("nova","flame","#fff1a8","#ff6a3a"),
  @("phoenix","flame","#ff5a36","#ffd23f"),
  @("gale","feather","#7ee0d6","#d8fff8"),
  @("bolt","bolt","#ffe14a","#fff6c2"),
  @("drift","feather","#f0d0a8","#fff1dc"),
  @("glider","feather","#c7e7ff","#8ebfe8"),
  @("swift","feather","#ffb067","#ff7a3c"),
  @("falcon","feather","#8a5a3b","#e7c39a"),
  @("rocket","bolt","#ff4d6a","#ffd0d8"),
  @("blaze","flame","#ff3b1f","#ffb020"),
  @("frost","crystal","#d7f4ff","#7ec8ee"),
  @("solar","flame","#ffe14a","#ff9a2a"),
  @("lunar","crystal","#e7e9f4","#9aa4c7"),
  @("cosmic","butterfly","#3a2a78","#c7a8ff"),
  @("velvet","butterfly","#7a2d6e","#ff8ad4"),
  @("thunder","bolt","#fff3a0","#8fd0ff"),
  @("eclipse","feather","#2a2438","#f0b429"),
  @("mythic","feather","#fff6ea","#f0b429")
)
foreach ($row in $drawn) {
  [WingPhotoMaker]::Draw((Join-Path $dir "$($row[0]).png"), $row[1], $row[2], $row[3])
}
(Get-ChildItem $dir -Filter *.png).Count
