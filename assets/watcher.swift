import Cocoa
import Carbon
import CoreGraphics

class RaycastLanguageWatcher {
    private var timer: Timer?
    private var wasRaycastVisible = false
    private var previousInputSourceID: String?
    
    private let targetEnglishIDs = ["com.apple.keylayout.ABC", "com.apple.keylayout.US"]
    private let stateFilePath = ("~/.raycast_auto_abc_paused" as NSString).expandingTildeInPath

    func start() {
        // بررسی وضعیت پنجره هر ۱۵۰ میلی‌ثانیه (واکنش آنی بدون بار پردازشی)
        timer = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: true) { [weak self] _ in
            self?.checkRaycastWindow()
        }
        RunLoop.main.run()
    }

    private func isPaused() -> Bool {
        return FileManager.default.fileExists(atPath: stateFilePath)
    }

    private func isRaycastWindowVisible() -> Bool {
        let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        guard let windowList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
            return false
        }

        for window in windowList {
            if let ownerName = window[kCGWindowOwnerName as String] as? String,
               ownerName == "Raycast",
               let layer = window[kCGWindowLayer as String] as? Int,
               layer > 0 { // فیلتر کردن آیکون منوبار و پردازش‌های مخفی؛ فقط پنجره اصلی ری‌کست
                if let bounds = window[kCGWindowBounds as String] as? [String: CGFloat],
                   let height = bounds["Height"], height > 40 {
                    return true
                }
            }
        }
        return false
    }

    private func getCurrentInputSourceID() -> String? {
        guard let currentSource = TISCopyCurrentKeyboardInputSource()?.takeRetainedValue(),
              let ptr = TISGetInputSourceProperty(currentSource, kTISPropertyInputSourceID) else {
            return nil
        }
        return Unmanaged<CFString>.fromOpaque(ptr).takeUnretainedValue() as String
    }

    private func selectInputSource(id: String) -> Bool {
        let filter = [kTISPropertyInputSourceID as String: id] as CFDictionary
        guard let sourceList = TISCreateInputSourceList(filter, false)?.takeRetainedValue() as? [TISInputSource],
              let targetSource = sourceList.first else {
            return false
        }
        return TISSelectInputSource(targetSource) == noErr
    }

    private func switchToABC() {
        for engID in targetEnglishIDs {
            if selectInputSource(id: engID) {
                break
            }
        }
    }

    private func checkRaycastWindow() {
        if isPaused() { return }

        let isVisible = isRaycastWindowVisible()

        if isVisible && !wasRaycastVisible {
            // لحظه باز شدن ری‌کست
            wasRaycastVisible = true
            if let currentID = getCurrentInputSourceID() {
                // اگر زبان فعلی انگلیسی نیست (مثلاً Persian است)، ذخیره‌اش کن و برو روی ABC
                if !targetEnglishIDs.contains(currentID) {
                    previousInputSourceID = currentID
                    switchToABC()
                } else {
                    previousInputSourceID = nil
                }
            }
        } else if !isVisible && wasRaycastVisible {
            // لحظه بسته شدن ری‌کست
            wasRaycastVisible = false
            if let prevID = previousInputSourceID {
                _ = selectInputSource(id: prevID)
                previousInputSourceID = nil
            }
        }
    }
}

let watcher = RaycastLanguageWatcher()
watcher.start()