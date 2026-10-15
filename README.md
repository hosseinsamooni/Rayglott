<div dir="rtl">

# Rayglott 🎹

افزونه‌ای برای [Raycast](https://www.raycast.com) که به‌صورت خودکار زبان کیبورد را هنگام باز شدن Raycast روی **ABC** می‌گذارد و پس از بسته شدن آن، زبان قبلی (مثلاً فارسی/Persian) را برمی‌گرداند.

مشکل مرسوم: کیبورد روی فارسی است، Raycast را باز می‌کنی، تایپ نمی‌کند، یادت می‌رود که `⌘ + Space` بزنی. Rayglott این کار را خودکار انجام می‌دهد — بدون اینکه زبان کیبوردت را قفل کند.

## ✨ امکانات

- 🔄 **سوییچ خودکار زبان** — لحظه‌ی باز شدن پنجره Raycast → ABC، لحظه‌ی بسته شدن → زبان قبلی
- ⌨️ **دو کماند Raycast** — `Toggle Rayglott` (HUD سریع) و `Rayglott Menu Bar` (وضعیت و کنترل از منوبار)
- 🪶 **بار تقریباً صفر** — یک دیمن Swift سبک که هر ۱۵۰ms وضعیت پنجره را چک می‌کند (بدون polling ورودی)
- 🔐 **قابل توقف** — یک کلیک برای pause/enable، بدون kill کردن دیمن
- 🍎 **بدون وابستگی بیرونی** — فقط Swift استاندارد macOS (Carbon + CoreGraphics)

## 📋 پیش‌نیازها

- macOS 12 Monterey یا بالاتر
- [Raycast](https://www.raycast.com) نصب‌شده
- **Xcode Command Line Tools**: `xcode-select --install`
- زبان کیبورد فارسی (یا هر زبان غیرانگلیسی) به‌همراه ABC در تنظیمات کیبورد macOS

## 🚀 نصب (حالت توسعه)

```bash
git clone https://github.com/hosseinsamooni/Rayglott.git
cd Rayglott
npm install
ray develop
```

Raycast پس از `ray develop` افزونه را در حالت توسعه ثبت می‌کند و تغییرات کد به‌صورت زنده اعمال می‌شوند.

> برای انتشار در Raycast Store: `ray publish` (نیاز به اکانت Raycast + رعایت دستورالعمل انتشار).

## 🎮 استفاده

| کماند | حالت | توضیح |
|---|---|---|
| `Toggle Rayglott` | no-view | یک HUD نشان می‌دهد: 🟢 Enabled / ⏸️ Paused |
| `Rayglott Menu Bar` | menu-bar | آیکون منوبار: `ABC` = فعال، `FA/EN` = متوقف؛ کلیک → Pause/Enable |

از همان اجرای اول، افزونه فایل `assets/watcher.swift` را کامپایل و دیمن را استارت می‌زند. کامپایل اول چند ثانیه طول می‌کشد.

## ⚙️ نحوه کار

1. **دیمن Swift** (`watcher.swift`) هر ۱۵۰ms لیست پنجره‌های روی صفحه را می‌خواند و پنجره‌ی اصلی Raycast (layer > 0، ارتفاع > 40px) را تشخیص می‌دهد.
2. هنگام **باز شدن** Raycast: اگر زبان فعلی انگلیسی نیست، شناسه‌ی آن ذخیره می‌شود و کیبورد روی `com.apple.keylayout.ABC` (یا `US`) سوییچ می‌شود.
3. هنگام **بسته شدن**: زبان ذخیره‌شده (مثلاً Persian) بازگردانی می‌شود.
4. حالت Pause با یک فایل نشانگر کنترل می‌شود: `~/.raycast_auto_abc_paused` — دیمن تا وقتی این فایل وجود دارد هیچ کاری نمی‌کند.

## 🗑️ حذف

```bash
pkill -f raycast-abc-watcher
rm -f ~/.raycast_auto_abc_paused
rm -f ~/Library/Application\ Support/com.raycast.macos/extensions/rayglott/raycast-abc-watcher
```

سپس افزونه را از تنظیمات Raycast → Extensions حذف کن.

## 🐛 عیب‌یابی

| مشکل | راه‌حل |
|---|---|
| «Failed to toggle Watcher» | `xcode-select --install` را اجرا کن؛ بررسی: `swiftc --version` |
| کامپایل اول کند است | طبیعی است — فقط یک‌بار اتفاق می‌افتد |
| کیبورد سوییچ نمی‌شود | مطمئن شو ABC در System Settings → Keyboard → Input Sources اضافه شده |
| دیمن بالا نیامد | `ray develop` را دوباره اجرا کن یا کماند Toggle را بزن |
| تغییر زبان با تأخیر اعمال می‌شود | برخی اپ‌ها خروجی TIS را کش می‌کنند؛ کمی صبر کن یا لایوت را قبل از باز کردن Raycast روی فارسی بگذار |

## 📁 ساختار پروژه

```
Rayglott/
├── assets/
│   ├── rayglott-icon.png   # آیکون افزونه
│   └── watcher.swift       # دیمن مانیتورینگ و سوییچ زبان
├── src/
│   ├── utils.ts            # کامپایل/استارت دیمن، کنترل فایل pause
│   ├── toggle.ts           # کماند Toggle (no-view)
│   └── menubar.tsx         # کماند Menu Bar
├── package.json            # مانیفست افزونه Raycast
└── tsconfig.json
```

## 🛠️ اسکریپت‌ها

```bash
npm run dev        # ray develop
npm run lint       # ray lint
npm run fix-lint   # ray lint --fix
npm run build      # ray build -e dist
```

## 📄 لایسنس

[MIT](./LICENSE) © Hossein Samani

---

<div dir="ltr">

<details>
<summary><b>English</b></summary>

Raycast extension that auto-switches the macOS keyboard input source to **ABC** when Raycast opens and restores the previous one (e.g. Persian) when it closes.

**Requirements:** macOS 12+, Raycast, Xcode Command Line Tools, and a non-English layout alongside ABC in System Settings → Keyboard.

**Install (dev):** `git clone` → `npm install` → `ray develop`

**Commands:** `Toggle Rayglott` (quick HUD), `Rayglott Menu Bar` (status + pause/enable from the menu bar).

**How it works:** a lightweight Swift daemon polls the on-screen window list every 150 ms. When the Raycast main window appears, it saves the current input source ID and selects `com.apple.keylayout.ABC` (falling back to `US`); when the window closes, it restores the saved layout. Pausing is a marker file (`~/.raycast_auto_abc_paused`) the daemon checks each tick — no process kill needed.

**Uninstall:** `pkill -f raycast-abc-watcher`, remove the marker file and the compiled binary under Raycast's extension support path, then delete the extension in Raycast settings.

**Troubleshooting:** "Failed to toggle Watcher" = run `xcode-select --install`. Slow first toggle = one-time Swift compile. No switching = make sure ABC is an enabled input source.

MIT licensed. © Hossein Samani

</details>
</div>
</div>
