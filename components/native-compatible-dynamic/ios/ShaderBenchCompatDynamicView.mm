// ShaderBenchCompatDynamicView — Fabric component view (iOS, Metal) of
// @shader-bench/native-compatible-dynamic. Same renderer as the other
// @shader-bench Metal views, except that the shader arrives as Metal Shading
// Language SOURCE in the `source` prop and is compiled at runtime. Own class /
// symbol names (SBCD*) so it links next to @shader-bench/native and
// @shader-bench/native-compatible-static. Uses only Fabric APIs present in
// RN 0.81+.
//
// - Shader: `source` compiled with -[MTLDevice newLibraryWithSource:options:
//   completionHandler:] (async, off the main thread), functions
//   `<shader>_vertex` / `<shader>_fragment`, one fullscreen triangle. The
//   pipeline (or the error) is cached per process by SHA-256 of
//   (shader, source): other instances and remounts reuse it, concurrent
//   requests share one compile, and an edited source (Fast Refresh) compiles
//   once. Nothing is drawn while compiling; a compile error draws a solid
//   #1b1a33 and is sent to JS (onShaderError {message}) + NSLog.
// - Uniforms (fragment buffer 0, 96 bytes): resolution, pad, phase,
//   params[4] — the layout of src/registry.ts (UNIFORM_FLOATS = 24).
// - Driver: CADisplayLink on the main run loop (no JS per frame).
// - Clock: elapsed += dt * speed, in double; phases = fract(t / periods[i])
//   in double, cast to float only for the GPU. speed 0 => frozen, redraw
//   only when props or size change.
// - Pixel ratio capped at 2: drawable = bounds * min(screen scale, 2).

#import "ShaderBenchCompatDynamicView.h"

#import <CommonCrypto/CommonDigest.h>
#import <Metal/Metal.h>
#import <QuartzCore/QuartzCore.h>

#import <react/renderer/components/ShaderBenchCompatDynamicSpec/ComponentDescriptors.h>
#import <react/renderer/components/ShaderBenchCompatDynamicSpec/EventEmitters.h>
#import <react/renderer/components/ShaderBenchCompatDynamicSpec/Props.h>
#import <react/renderer/components/ShaderBenchCompatDynamicSpec/RCTComponentViewHelpers.h>

#include <cmath>

using namespace facebook::react;

static const CGFloat kMaxPixelRatio = 2.0;
static const int kParamFloats = 16; // MAX_PARAMS = PARAM_VEC4S * 4

typedef struct {
  float resolution[2];
  float pad[2];
  float phase[4];
  float params[kParamFloats];
} SBCDUniforms; // 96 bytes

#pragma mark - Shared Metal objects

static id<MTLDevice> SBCDDevice(void)
{
  static id<MTLDevice> device;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ device = MTLCreateSystemDefaultDevice(); });
  return device;
}

static id<MTLCommandQueue> SBCDQueue(void)
{
  static id<MTLCommandQueue> queue;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ queue = [SBCDDevice() newCommandQueue]; });
  return queue;
}

#pragma mark - Runtime-compiled pipelines

typedef void (^SBCDPipelineHandler)(id<MTLRenderPipelineState> _Nullable pipeline, NSString *_Nullable error);

/// One cache entry: a pipeline, or an error, or (while `waiting` is non-nil) a compile in flight.
@interface SBCDPipelineEntry : NSObject
@property (nonatomic, strong, nullable) id<MTLRenderPipelineState> pipeline;
@property (nonatomic, copy, nullable) NSString *error;
@property (nonatomic, strong, nullable) NSMutableArray<SBCDPipelineHandler> *waiting;
@end
@implementation SBCDPipelineEntry
@end

static NSString *SBCDKey(NSString *name, NSString *source)
{
  NSData *data = [[NSString stringWithFormat:@"%@%C%@", name, (unichar)0, source] dataUsingEncoding:NSUTF8StringEncoding];
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
  NSMutableString *hex = [NSMutableString stringWithCapacity:CC_SHA256_DIGEST_LENGTH * 2];
  for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) {
    [hex appendFormat:@"%02x", digest[i]];
  }
  return hex;
}

/// Main thread only. `handler` runs on the main thread: synchronously when
/// the result is cached, after the (async) compile otherwise.
static void SBCDPipelineFor(NSString *name, NSString *source, SBCDPipelineHandler handler)
{
  static NSMutableDictionary<NSString *, SBCDPipelineEntry *> *cache;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ cache = [NSMutableDictionary new]; });

  NSString *key = SBCDKey(name, source);
  SBCDPipelineEntry *entry = cache[key];
  if (entry && !entry.waiting) {
    handler(entry.pipeline, entry.error);
    return;
  }
  if (entry) {
    [entry.waiting addObject:[handler copy]];
    return;
  }
  entry = [SBCDPipelineEntry new];
  entry.waiting = [NSMutableArray arrayWithObject:[handler copy]];
  cache[key] = entry;

  MTLCompileOptions *options = [MTLCompileOptions new]; // defaults = the offline `metal` compiler's (fast math)
  [SBCDDevice()
      newLibraryWithSource:source
                   options:options
         completionHandler:^(id<MTLLibrary> library, NSError *error) {
           // Metal's compiler queue: build the pipeline here too, off the main thread.
           id<MTLRenderPipelineState> pipeline = nil;
           NSString *message = nil;
           if (library) {
             if (error) {
               NSLog(@"[ShaderBenchCompatDynamic] shader \"%@\" compiled with warnings: %@", name, error.localizedDescription);
             }
             MTLRenderPipelineDescriptor *desc = [MTLRenderPipelineDescriptor new];
             desc.vertexFunction = [library newFunctionWithName:[name stringByAppendingString:@"_vertex"]];
             desc.fragmentFunction = [library newFunctionWithName:[name stringByAppendingString:@"_fragment"]];
             desc.colorAttachments[0].pixelFormat = MTLPixelFormatBGRA8Unorm;
             if (!desc.vertexFunction || !desc.fragmentFunction) {
               message = [NSString stringWithFormat:@"functions %@_vertex / %@_fragment not found in the source", name, name];
             } else {
               NSError *pipelineError = nil;
               pipeline = [SBCDDevice() newRenderPipelineStateWithDescriptor:desc error:&pipelineError];
               if (!pipeline) {
                 message = pipelineError.localizedDescription ?: @"pipeline creation failed";
               }
             }
           } else {
             message = error.localizedDescription ?: @"Metal compile error";
           }
           dispatch_async(dispatch_get_main_queue(), ^{
             entry.pipeline = pipeline;
             entry.error = message;
             NSArray<SBCDPipelineHandler> *waiting = entry.waiting;
             entry.waiting = nil;
             if (message) {
               NSLog(@"[ShaderBenchCompatDynamic] shader \"%@\": %@", name, message);
             }
             for (SBCDPipelineHandler h in waiting) {
               h(pipeline, message);
             }
           });
         }];
}

#pragma mark - Metal layer view

@interface SBCDMetalView : UIView
@property (nonatomic, readonly) CAMetalLayer *metalLayer;
@end

@implementation SBCDMetalView
+ (Class)layerClass
{
  return [CAMetalLayer class];
}
- (CAMetalLayer *)metalLayer
{
  return (CAMetalLayer *)self.layer;
}
@end

// CADisplayLink retains its target: break the cycle with a weak proxy.
@interface SBCDWeakTarget : NSObject
@property (nonatomic, weak) id target;
@end
@implementation SBCDWeakTarget
- (void)tick:(CADisplayLink *)link
{
  [self.target performSelector:@selector(tick:) withObject:link];
}
@end

#pragma mark - Component view

@interface ShaderBenchCompatDynamicView () <RCTShaderBenchCompatDynamicViewViewProtocol>
@end

@implementation ShaderBenchCompatDynamicView {
  SBCDMetalView *_metalView;
  CADisplayLink *_link;

  NSString *_shader;
  NSString *_source;
  double _periods[4];
  float _params[kParamFloats];
  double _speed;

  NSUInteger _request; // incremented per (shader, source) change: stale compiles are ignored
  id<MTLRenderPipelineState> _pipeline;
  BOOL _failed; // compile error: draw the fallback colour
  NSString *_pendingError; // sent to JS once the event emitter is set

  double _elapsed; // seconds (speed-scaled), double precision
  CFTimeInterval _lastTick; // 0 = none yet
  BOOL _needsDraw;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<ShaderBenchCompatDynamicViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const ShaderBenchCompatDynamicViewProps>();
    _props = defaultProps;
    _metalView = [[SBCDMetalView alloc] initWithFrame:self.bounds];
    CAMetalLayer *layer = _metalView.metalLayer;
    layer.device = SBCDDevice();
    layer.pixelFormat = MTLPixelFormatBGRA8Unorm;
    layer.framebufferOnly = YES;
    layer.opaque = YES;
    self.contentView = _metalView;
    [self resetState];
  }
  return self;
}

- (void)resetState
{
  _shader = @"";
  _source = @"";
  for (int i = 0; i < 4; i++) {
    _periods[i] = 1;
  }
  for (int i = 0; i < kParamFloats; i++) {
    _params[i] = 0;
  }
  _speed = 1;
  _request++;
  _pipeline = nil;
  _failed = NO;
  _pendingError = nil;
  _elapsed = 0;
  _lastTick = 0;
  _needsDraw = YES;
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
  [self stopLink];
  [self resetState];
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &p = *std::static_pointer_cast<ShaderBenchCompatDynamicViewProps const>(props);
  NSString *shader = [NSString stringWithUTF8String:p.shader.c_str()];
  NSString *source = [NSString stringWithUTF8String:p.source.c_str()];
  for (int i = 0; i < 4; i++) {
    _periods[i] = i < (int)p.periods.size() && p.periods[i] > 0 ? p.periods[i] : 1;
  }
  for (int i = 0; i < kParamFloats; i++) {
    _params[i] = i < (int)p.params.size() ? p.params[i] : 0;
  }
  _speed = p.speed;
  _needsDraw = YES;
  [super updateProps:props oldProps:oldProps];
  if (![shader isEqualToString:_shader] || ![source isEqualToString:_source]) {
    _shader = shader;
    _source = source;
    [self requestPipeline];
  }
}

- (void)requestPipeline
{
  NSUInteger request = ++_request;
  _pipeline = nil;
  _failed = NO;
  _pendingError = nil;
  if (_shader.length == 0) {
    return;
  }
  if (_source.length == 0) {
    [self pipelineReady:nil error:@"empty shader source" request:request];
    return;
  }
  __weak ShaderBenchCompatDynamicView *weakSelf = self;
  SBCDPipelineFor(_shader, _source, ^(id<MTLRenderPipelineState> pipeline, NSString *error) {
    [weakSelf pipelineReady:pipeline error:error request:request];
  });
}

- (void)pipelineReady:(id<MTLRenderPipelineState>)pipeline error:(NSString *)error request:(NSUInteger)request
{
  if (request != _request) {
    return; // props changed meanwhile
  }
  _pipeline = pipeline;
  _failed = pipeline == nil;
  _pendingError = error;
  _needsDraw = YES;
  [self flushError];
}

- (void)flushError
{
  if (!_pendingError || !_eventEmitter) {
    return; // retried on the next tick
  }
  std::string message = std::string([_pendingError UTF8String]);
  _pendingError = nil;
  std::static_pointer_cast<const ShaderBenchCompatDynamicViewEventEmitter>(_eventEmitter)
      ->onShaderError(ShaderBenchCompatDynamicViewEventEmitter::OnShaderError{.message = message});
}

#pragma mark Layout / lifecycle

- (CGFloat)renderScale
{
  CGFloat screenScale = self.window ? self.window.screen.scale : self.traitCollection.displayScale;
  if (screenScale <= 0) {
    screenScale = 1;
  }
  return MIN(screenScale, kMaxPixelRatio);
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  CGFloat scale = [self renderScale];
  _metalView.contentScaleFactor = scale;
  CGSize size = _metalView.bounds.size;
  _metalView.metalLayer.drawableSize = CGSizeMake(std::round(size.width * scale), std::round(size.height * scale));
  _needsDraw = YES;
}

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  if (self.window) {
    [self startLink];
    [self setNeedsLayout];
  } else {
    [self stopLink];
  }
}

- (void)startLink
{
  if (_link) {
    return;
  }
  SBCDWeakTarget *proxy = [SBCDWeakTarget new];
  proxy.target = self;
  _link = [CADisplayLink displayLinkWithTarget:proxy selector:@selector(tick:)];
  [_link addToRunLoop:[NSRunLoop mainRunLoop] forMode:NSRunLoopCommonModes];
  _lastTick = 0;
}

- (void)stopLink
{
  [_link invalidate];
  _link = nil;
}

- (void)dealloc
{
  [_link invalidate];
}

#pragma mark Frame loop

- (void)tick:(CADisplayLink *)link
{
  CFTimeInterval now = CACurrentMediaTime();
  if (_lastTick > 0) {
    _elapsed += (now - _lastTick) * _speed;
  }
  _lastTick = now;
  [self flushError];
  // Animating: draw every frame. Frozen (speed 0): only on changes.
  if (_speed == 0 && !_needsDraw) {
    return;
  }
  if ([self draw]) {
    _needsDraw = NO;
  }
}

- (BOOL)draw
{
  CAMetalLayer *layer = _metalView.metalLayer;
  CGSize ds = layer.drawableSize;
  id<MTLRenderPipelineState> pipeline = _pipeline;
  if (ds.width < 1 || ds.height < 1 || (!pipeline && !_failed)) {
    return NO; // no size yet, or still compiling
  }
  id<CAMetalDrawable> drawable = [layer nextDrawable];
  if (!drawable) {
    return NO;
  }

  MTLRenderPassDescriptor *pass = [MTLRenderPassDescriptor renderPassDescriptor];
  pass.colorAttachments[0].texture = drawable.texture;
  pass.colorAttachments[0].storeAction = MTLStoreActionStore;
  if (pipeline) {
    pass.colorAttachments[0].loadAction = MTLLoadActionDontCare;
  } else {
    pass.colorAttachments[0].loadAction = MTLLoadActionClear; // fallback #1b1a33
    pass.colorAttachments[0].clearColor = MTLClearColorMake(0x1b / 255.0, 0x1a / 255.0, 0x33 / 255.0, 1);
  }

  id<MTLCommandBuffer> cmd = [SBCDQueue() commandBuffer];
  id<MTLRenderCommandEncoder> enc = [cmd renderCommandEncoderWithDescriptor:pass];
  if (pipeline) {
    SBCDUniforms u;
    u.resolution[0] = (float)ds.width;
    u.resolution[1] = (float)ds.height;
    u.pad[0] = u.pad[1] = 0;
    for (int i = 0; i < 4; i++) {
      double p = std::fmod(_elapsed / _periods[i], 1.0);
      if (p < 0) {
        p += 1.0;
      }
      u.phase[i] = (float)p;
    }
    for (int i = 0; i < kParamFloats; i++) {
      u.params[i] = _params[i];
    }
    [enc setRenderPipelineState:pipeline];
    [enc setFragmentBytes:&u length:sizeof(u) atIndex:0];
    [enc drawPrimitives:MTLPrimitiveTypeTriangle vertexStart:0 vertexCount:3];
  }
  [enc endEncoding];
  [cmd presentDrawable:drawable];
  [cmd commit];
  return YES;
}

@end
