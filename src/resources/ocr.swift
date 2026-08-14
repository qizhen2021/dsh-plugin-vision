import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count > 1, let img = NSImage(contentsOfFile: args[1]),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("cannot load image\n".data(using: .utf8)!)
    exit(1)
}
let request = VNRecognizeTextRequest { req, _ in
    guard let obs = req.results as? [VNRecognizedTextObservation] else { return }
    for o in obs {
        guard let t = o.topCandidates(1).first else { continue }
        let b = o.boundingBox
        let x = Int((b.origin.x * 100).rounded())
        let y = Int((b.origin.y * 100).rounded())
        let w = Int((b.size.width * 100).rounded())
        let h = Int((b.size.height * 100).rounded())
        print("\(x) \(y) \(w) \(h)|\(t.string)")
    }
}
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
// Auto-detect per text region: mixed Chinese/English documents then keep
// exact glyphs (e.g. ASCII ':' in "Total: $99.50" instead of the full-width
// '：' produced by a fixed ["zh-Hans", "en-US"] language list).
if #available(macOS 13.0, *) {
    request.automaticallyDetectsLanguage = true
} else {
    request.recognitionLanguages = ["zh-Hans", "en-US"]
}
let handler = VNImageRequestHandler(cgImage: cg, options: [:])
do { try handler.perform([request]) } catch { exit(2) }
