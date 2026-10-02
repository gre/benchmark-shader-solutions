// swift render.swift <silk.metal> <out.png> <t> [W H]
// Offscreen Metal render of silk.metal (runtime-compiled from source) to a PNG,
// for comparison with the GLSL reference via ../compare.mjs.
import Metal
import CoreGraphics
import ImageIO
import Foundation
import UniformTypeIdentifiers

let args = CommandLine.arguments
let src = try String(contentsOfFile: args[1], encoding: .utf8)
let out = args[2]
let t = Double(args[3])!
let W = args.count > 5 ? Int(args[4])! : 1200
let H = args.count > 5 ? Int(args[5])! : 775

let device = MTLCreateSystemDefaultDevice()!
let lib = try device.makeLibrary(source: src, options: nil)
let desc = MTLRenderPipelineDescriptor()
desc.vertexFunction = lib.makeFunction(name: "silk_vertex")
desc.fragmentFunction = lib.makeFunction(name: "silk_fragment")
desc.colorAttachments[0].pixelFormat = .rgba8Unorm
let pipeline = try device.makeRenderPipelineState(descriptor: desc)

let td = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: W, height: H, mipmapped: false)
td.usage = [.renderTarget]
td.storageMode = .shared
let tex = device.makeTexture(descriptor: td)!

let periods: [Double] = [41, 59, 23, 53]
let ph = periods.map { p -> Float in let v = (t / p).truncatingRemainder(dividingBy: 1); return Float(v < 0 ? v + 1 : v) }
var uniforms: [Float] = [Float(W), Float(H), 0, 0] + ph

let rp = MTLRenderPassDescriptor()
rp.colorAttachments[0].texture = tex
rp.colorAttachments[0].loadAction = .clear
rp.colorAttachments[0].storeAction = .store
let queue = device.makeCommandQueue()!
let cb = queue.makeCommandBuffer()!
let enc = cb.makeRenderCommandEncoder(descriptor: rp)!
enc.setRenderPipelineState(pipeline)
enc.setFragmentBytes(&uniforms, length: uniforms.count * 4, index: 0)
enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
enc.endEncoding()
cb.commit()
cb.waitUntilCompleted()

var bytes = [UInt8](repeating: 0, count: W * H * 4)
tex.getBytes(&bytes, bytesPerRow: W * 4, from: MTLRegionMake2D(0, 0, W, H), mipmapLevel: 0)
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
let ctx = CGContext(data: &bytes, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W * 4, space: cs,
                    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
let img = ctx.makeImage()!
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: out) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, img, nil)
CGImageDestinationFinalize(dest)
print("wrote \(out)")
