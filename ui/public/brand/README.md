# 品牌资产

Resumate 的标志与吉祥物。角色设定：一页拟人化的简历纸——戴钴蓝圆框眼镜、系钴蓝领带，手持铅笔，用对话气泡和四角星表达"对话式改简历"。

## 文件

| 文件 | 用途 |
| --- | --- |
| [mark.png](mark.png) | 应用标志。钴蓝圆角底 + 简历纸角色，小尺寸下仍可辨识，适合 favicon、应用图标、顶栏标志位 |
| [lockup.png](lockup.png) | 品牌组合：角色 + `Resumate` 字标，用于落地页、登录页、关于页 |
| [mascot.png](mascot.png) | 吉祥物主形象：招手 + 手持铅笔 | 
| [mascot-wave.png](mascot-wave.png) | 吉祥物备用姿态：点赞 + 指向简历卡片，用于引导、完成态 |

四张均为透明底 RGBA PNG，导出边长约 1254px。

## 网站图标

浏览器标签、iOS 主屏与 Android/PWA 图标都从 `mark.png` 生成，产物在 [ui/public](../../public/)，不要在图标文件上手工改图：改品牌标志后按下表重跑一遍即可，`ui/index.html` 与 [site.webmanifest](../../public/site.webmanifest) 的引用不用动。

| 产物 | 尺寸 | 说明 |
| --- | --- | --- |
| `favicon-16.png` / `favicon-32.png` / `favicon-48.png` | 16 / 32 / 48 | 浏览器标签与书签，保持透明底，画布补成正方形 |
| `apple-touch-icon.png` | 180 | iOS 主屏，垫 `#f7f5f0` 底，避免系统把透明压成黑底 |
| `android-chrome-192x192.png` / `android-chrome-512x512.png` | 192 / 512 | Android 主屏与 PWA manifest，同样垫 `#f7f5f0` 底 |

```bash
cd ui/public
for s in 16 32 48; do sips -Z $s -p $s $s brand/mark.png --out "favicon-$s.png"; done
sips -Z 180 -p 180 180 --padColor F7F5F0 brand/mark.png --out apple-touch-icon.png
sips -Z 192 -p 192 192 --padColor F7F5F0 brand/mark.png --out android-chrome-192x192.png
sips -Z 512 -p 512 512 --padColor F7F5F0 brand/mark.png --out android-chrome-512x512.png
```

已知取舍：16px 下角色细节会糊成一个色块（任何含角色的方形图标都会如此），所以 16 档只作占位；要更锐利需要单独做一版去掉角色的简化标志，目前没有这份素材。

## 配色

与 [定稿原型](../../prototypes/index.html) 和 [设计令牌](../../src/index.css) 一致，不得引入表外颜色：

| 名称 | 值 | 用途 |
| --- | --- | --- |
| 墨蓝 ink | `#1D2130` | 描边、字标、五官 |
| 纸白 paper | `#FFFFFF` | 简历纸身体 |
| 暖米 cream | `#FFF9EC` | 高光面、内底 |
| 珊瑚 coral | `#FF6B4A` | 腮红、对话气泡 |
| 钴蓝 cobalt | `#2B3FD8` | 底版、领带、眼镜 |
| 柔黄 yellow | `#FFE98F` | 铅笔、星形点缀 |

## 风格约束

平涂矢量贴纸风：统一粗墨蓝描边、圆角几何、纯色填充；不用渐变、发光、纹理、3D 或投影。角色始终正面全身、留白充足、轮廓清晰。

## 生成记录

- 模型：`gpt-image-2.5-flare`，与 `gpt-image-2.5-sunburst`、`gpt-image-2`、`gpt-image-1.5` 同提示词对比后选用；该模型在限色、描边一致性和手部结构上最稳定。
- 参数：`size=1024x1024`、`quality=high`、`background=transparent`。
- 提示词要点：拟人化简历纸角色 + 钴蓝眼镜领带 + 铅笔 + 对话气泡与星形点缀；附上表全部色值并显式排除渐变、投影、灰色与 3D。
