import Cocoa
import Carbon
import CoreGraphics
import Darwin
import Foundation

// MARK: - StateFile

struct RayglottState {
    var schemaVersion: Int = 1
    var paused: Bool = false
    var daemonPid: Int? = nil
    var daemonStartedAt: String? = nil
    var lastTransitionAt: String? = nil
    var lastError: String? = nil
    var permissionScreenRecording: Bool = false
    var permissionAccessibility: Bool = false

    func toDictionary() -> [String: Any] {
        var dict: [String: Any] = [
            "schemaVersion": schemaVersion,
            "paused": paused,
            "daemonPid": daemonPid as Any,
            "daemonStartedAt": daemonStartedAt as Any,
            "lastTransitionAt": lastTransitionAt as Any,
            "lastError": lastError as Any,
            "permission": [
                "screenRecording": permissionScreenRecording,
                "accessibility": permissionAccessibility,
            ],
        ]
        // Remove nil-valued top-level keys for cleanliness? Keep nulls as NSNull.
        if daemonPid == nil { dict["daemonPid"] = NSNull() }
        if daemonStartedAt == nil { dict["daemonStartedAt"] = NSNull() }
        if lastTransitionAt == nil { dict["lastTransitionAt"] = NSNull() }
        if lastError == nil { dict["lastError"] = NSNull() }
        return dict
    }

    static func from(dictionary: [String: Any]) -> RayglottState {
        var s = RayglottState()
        if let v = dictionary["schemaVersion"] as? Int { s.schemaVersion = v }
        if let v = dictionary["paused"] as? Bool { s.paused = v }
        if let v = dictionary["daemonPid"] as? Int { s.daemonPid = v }
        if let v = dictionary["daemonStartedAt"] as? String { s.daemonStartedAt = v }
        if let v = dictionary["lastTransitionAt"] as? String { s.lastTransitionAt = v }
        if let v = dictionary["lastError"] as? String { s.lastError = v }
        if let p = dictionary["permission"] as? [String: Any] {
            if let v = p["screenRecording"] as? Bool { s.permissionScreenRecording = v }
            if let v = p["accessibility"] as? Bool { s.permissionAccessibility = v }
        }
        return s
    }
}

enum StateFile {
    static let directory: String = ("~/.rayglott" as NSString).expandingTildeInPath
    static let path: String = (directory as NSString).appendingPathComponent("state.json")
    static let legacyPausePath: String = ("~/.raycast_auto_abc_paused" as NSString).expandingTildeInPath

    static func ensureDirectory() {
        try? FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
        try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory)
    }

    static func read() -> RayglottState {
        ensureDirectory()
        // One-time migration from legacy marker file.
        var legacyPaused = false
        if FileManager.default.fileExists(atPath: legacyPausePath) {
            legacyPaused = true
            try? FileManager.default.removeItem(atPath: legacyPausePath)
        }

        guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            var recovered = RayglottState()
            if legacyPaused { recovered.paused = true }
            if FileManager.default.fileExists(atPath: path) {
                recovered.lastError = "State file recovered after corruption."
            }
            return recovered
        }
        if let v = obj["schemaVersion"] as? Int, v != 1 {
            // Unknown schema: recover, preserving paused if readable.
            var recovered = RayglottState()
            if let p = obj["paused"] as? Bool { recovered.paused = p || legacyPaused }
            else if legacyPaused { recovered.paused = true }
            recovered.lastError = "State file recovered after schema mismatch."
            return recovered
        }
        var state = RayglottState.from(dictionary: obj)
        if legacyPaused { state.paused = true }
        return state
    }

    static func write(_ state: RayglottState) {
        ensureDirectory()
        guard let data = try? JSONSerialization.data(withJSONObject: state.toDictionary(), options: [.prettyPrinted]) else { return }
        let tmp = path + ".tmp"
        do {
            try data.write(to: URL(fileURLWithPath: tmp), options: .atomic)
            if FileManager.default.fileExists(atPath: path) {
                try? FileManager.default.removeItem(atPath: path)
            }
            try FileManager.default.moveItem(atPath: tmp, toPath: path)
            try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path)
        } catch {
            DaemonLog.append("state write failed: \(error)")
        }
    }
}

// MARK: - DaemonLog

enum DaemonLog {
    static let path: String = (("~/.rayglott" as NSString).expandingTildeInPath as NSString).appendingPathComponent("daemon.log")

    static func append(_ message: String) {
        let directory = ("~/.rayglott" as NSString).expandingTildeInPath
        try? FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
        let formatter = ISO8601DateFormatter()
        let line = "\(formatter.string(from: Date())) \(message)\n"
        guard let data = line.data(using: .utf8) else { return }
        if FileManager.default.fileExists(atPath: path),
           let handle = FileHandle(forWritingAtPath: path) {
            handle.seekToEndOfFile()
            handle.write(data)
            handle.closeFile()
        } else {
            try? data.write(to: URL(fileURLWithPath: path))
        }
    }
}

// MARK: - InputSourceController

enum InputSourceController {
    static let targetEnglishIDs = ["com.apple.keylayout.ABC", "com.apple.keylayout.US"]

    static func currentInputSourceID() -> String? {
        guard let currentSource = TISCopyCurrentKeyboardInputSource()?.takeRetainedValue(),
              let ptr = TISGetInputSourceProperty(currentSource, kTISPropertyInputSourceID) else {
            return nil
        }
        return Unmanaged<CFString>.fromOpaque(ptr).takeUnretainedValue() as String
    }

    static func selectInputSource(id: String) -> Bool {
        let filter = [kTISPropertyInputSourceID as String: id] as CFDictionary
        guard let sourceList = TISCreateInputSourceList(filter, false)?.takeRetainedValue() as? [TISInputSource],
              let targetSource = sourceList.first else {
            return false
        }
        return TISSelectInputSource(targetSource) == noErr
    }

    static func switchToABC() {
        for engID in targetEnglishIDs {
            if selectInputSource(id: engID) { break }
        }
    }
}

// MARK: - WindowDetector

enum WindowDetector {
    static func isRaycastWindowVisible() -> Bool {
        let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        guard let windowList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
            return false
        }
        for window in windowList {
            guard let ownerName = window[kCGWindowOwnerName as String] as? String,
                  ownerName == "Raycast" else { continue }
            guard let layer = window[kCGWindowLayer as String] as? Int,
                  layer == 8 else { continue }
            guard let alpha = window[kCGWindowAlpha as String] as? Double,
                  alpha > 0 else { continue }
            guard let bounds = window[kCGWindowBounds as String] as? [String: CGFloat],
                  let width = bounds["Width"], let height = bounds["Height"],
                  width >= 300, height >= 100 else { continue }
            return true
        }
        return false
    }
}

// MARK: - RaycastLanguageWatcher

class RaycastLanguageWatcher {
    private var timer: Timer?
    private var wasRaycastVisible = false
    private var previousInputSourceID: String?
    private var screenRecordingGranted = false

    func start() {
        StateFile.ensureDirectory()
        // Single instance: exit if another daemon owns the pid and is alive.
        let initialState = StateFile.read()
        if let existingPid = initialState.daemonPid,
           existingPid != Int(getpid()),
           kill(Int32(existingPid), 0) == 0 {
            exit(0)
        }

        screenRecordingGranted = CGPreflightScreenCaptureAccess()

        // Write daemon ownership fields.
        var state = StateFile.read()
        state.daemonPid = Int(getpid())
        state.daemonStartedAt = ISO8601DateFormatter().string(from: Date())
        state.lastError = screenRecordingGranted ? nil : "Screen Recording permission missing. Grant in System Settings → Privacy & Security → Screen Recording, then restart."
        state.permissionScreenRecording = screenRecordingGranted
        StateFile.write(state)

        if !screenRecordingGranted {
            // Prompt once (may no-op for unsigned binary).
            DaemonLog.append("screen recording permission missing")
            CGRequestScreenCaptureAccess()
        }

        timer = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: true) { [weak self] _ in
            self?.checkRaycastWindow()
        }
        RunLoop.main.run()
    }

    private func isPaused() -> Bool {
        return StateFile.read().paused
    }

    private func checkRaycastWindow() {
        if isPaused() { return }
        if !screenRecordingGranted { return }

        let isVisible = WindowDetector.isRaycastWindowVisible()

        if isVisible && !wasRaycastVisible {
            wasRaycastVisible = true
            if let currentID = InputSourceController.currentInputSourceID() {
                if !InputSourceController.targetEnglishIDs.contains(currentID) {
                    previousInputSourceID = currentID
                    InputSourceController.switchToABC()
                } else {
                    previousInputSourceID = nil
                }
            }
            var state = StateFile.read()
            state.lastTransitionAt = ISO8601DateFormatter().string(from: Date())
            StateFile.write(state)
        } else if !isVisible && wasRaycastVisible {
            wasRaycastVisible = false
            if let prevID = previousInputSourceID {
                _ = InputSourceController.selectInputSource(id: prevID)
                previousInputSourceID = nil
            }
            var state = StateFile.read()
            state.lastTransitionAt = ISO8601DateFormatter().string(from: Date())
            StateFile.write(state)
        }
    }

    func stop() {
        timer?.invalidate()
        var state = StateFile.read()
        state.daemonPid = nil
        state.daemonStartedAt = nil
        StateFile.write(state)
    }
}

// MARK: - Bootstrap

let watcher = RaycastLanguageWatcher()

// Handle termination signals to clear pid.
let sigSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
sigSource.setEventHandler {
    watcher.stop()
    exit(0)
}
sigSource.resume()
signal(SIGTERM, SIG_IGN)

let sigInt = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
sigInt.setEventHandler {
    watcher.stop()
    exit(0)
}
sigInt.resume()
signal(SIGINT, SIG_IGN)

watcher.start()